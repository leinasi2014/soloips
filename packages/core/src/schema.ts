/**
 * 极小 valueSchema 组合子：产出满足 adapter 冻结契约 `SoloipsValueSchema<T>`
 * （parse / safeParse）的校验器。不依赖 zod 或任何 schema 库——契约本身是
 * 结构化的（contracts.ts §1 注释），core 因此不必引入某个 zod 大版本。
 *
 * DEV-05：不受信任数据一律 unknown 进、校验后出；未知字段按 zod 语义剥离
 * （durable 边界只回写声明字段）。对象装配处的单次受控断言有注释说明。
 */

import type {
  SoloipsJsonValue,
  SoloipsOperationIntent,
  SoloipsUnknownOperationKind,
} from "./contracts.js";
import { SoloipsCoreError } from "./errors.js";

export interface SoloipsSchemaIssue {
  readonly path: string;
  readonly message: string;
}

type ParseSuccess<T> = { readonly success: true; readonly data: T };
type ParseFailure = { readonly success: false; readonly error: SoloipsSchemaIssue[] };

export type SoloipsSchemaResult<T> = ParseSuccess<T> | ParseFailure;

export interface SoloipsSchema<T> {
  safeParse(value: unknown): SoloipsSchemaResult<T>;
  /** 持久边界用：失败抛 SoloipsCoreError（code SOLOIPS_CORE_RECORD_INVALID）。 */
  parse(value: unknown): T;
}

/** 可选字段标记：objectSchema 据此区分「缺省」与「必须显式给出」。 */
export interface SoloipsOptionalSchema<T> extends SoloipsSchema<T | undefined> {
  readonly soloipsOptional: true;
}

function ok<T>(data: T): ParseSuccess<T> {
  return { success: true, data };
}

function fail(issues: readonly SoloipsSchemaIssue[]): ParseFailure {
  return { success: false, error: issues.map((issue) => ({ ...issue })) };
}

function toError(issues: readonly SoloipsSchemaIssue[]): SoloipsCoreError {
  const summary = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return new SoloipsCoreError("SOLOIPS_CORE_RECORD_INVALID", `记录不符合声明 schema（${summary}）`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalSchema<T>(schema: SoloipsSchema<T>): boolean {
  return "soloipsOptional" in schema;
}

// ─────────────────────────────────────────────────────────────────────────────
// 原子
// ─────────────────────────────────────────────────────────────────────────────

export function stringSchema(): SoloipsSchema<string> {
  return {
    safeParse(value) {
      return typeof value === "string" ? ok(value) : fail([{ path: "", message: "应为字符串" }]);
    },
    parse(value) {
      return parsed(this.safeParse(value));
    },
  };
}

/** 非空白字符串（姓名、能力名、任务引用等业务必填字段的形状）。 */
export function nonEmptyStringSchema(): SoloipsSchema<string> {
  const inner = stringSchema();
  return {
    safeParse(value) {
      const result = inner.safeParse(value);
      if (!result.success) return result;
      return result.data.trim().length > 0
        ? ok(result.data)
        : fail([{ path: "", message: "应为非空白字符串" }]);
    },
    parse(value) {
      return parsed(this.safeParse(value));
    },
  };
}

/**
 * 带谓词的字符串收窄：校验字符串形状后收窄为品牌 id 类型。
 * 断言受谓词保护（单次受控断言），用于持久记录里的 id 字段。
 */
export function constrainedStringSchema<Id extends string>(
  isValid: (value: string) => boolean,
  label: string,
): SoloipsSchema<Id> {
  const inner = stringSchema();
  return {
    safeParse(value) {
      const result = inner.safeParse(value);
      if (!result.success) return result;
      return isValid(result.data)
        ? ok(result.data as Id) // 受控断言：isValid 已证明形状
        : fail([{ path: "", message: `应为合法的${label}` }]);
    },
    parse(value) {
      return parsed(this.safeParse(value));
    },
  };
}

export function booleanSchema(): SoloipsSchema<boolean> {
  return {
    safeParse(value) {
      return typeof value === "boolean" ? ok(value) : fail([{ path: "", message: "应为布尔值" }]);
    },
    parse(value) {
      return parsed(this.safeParse(value));
    },
  };
}

/** 正整数（任职代际等计数事实）。 */
export function positiveIntegerSchema(): SoloipsSchema<number> {
  return {
    safeParse(value) {
      return typeof value === "number" && Number.isInteger(value) && value > 0
        ? ok(value)
        : fail([{ path: "", message: "应为正整数" }]);
    },
    parse(value) {
      return parsed(this.safeParse(value));
    },
  };
}

export function literalUnionSchema<const V extends readonly string[]>(
  values: V,
): SoloipsSchema<V[number]> {
  const allowed = new Set<string>(values);
  return {
    safeParse(value) {
      return typeof value === "string" && allowed.has(value)
        ? ok(value as V[number]) // 受控断言：allowed 由 values 生成，has 已证明成员资格
        : fail([{ path: "", message: `应为以下值之一：${[...allowed].join(" | ")}` }]);
    },
    parse(value) {
      return parsed(this.safeParse(value));
    },
  };
}

/**
 * **开放**词表：已知值原样通过，**其余非空白字符串同样通过**（收窄为
 * `SoloipsUnknownOperationKind`）。
 *
 * 〔用途〕`operation.kind` 的持久校验：台账里可能存有**未来版本**写入的、本版本
 * 不认识的 kind（数据根被新版本写过、又用旧版本打开）。用封闭的
 * `literalUnionSchema` 校验会让这类记录判 `RECORD_INVALID` → 整次 open 拒绝
 * → **恢复锚点丢失**（而台账正是崩溃恢复的核对锚点）。「读不懂」不等于
 * 「可忽略」，故读面必须放行（详见 `contracts.ts` 的
 * `SoloipsUnknownOperationKind` 与 `SoloipsOperationRecord.schemaVersion`）。
 *
 * 〔与 `literalUnionSchema` 的分工〕**写路径仍用封闭词表**：`SoloipsCommitRequest`
 * 的 `kind` 是 `SoloipsOperationKind`，拼错即编译失败。本组合子**只用于持久
 * 读取**——它放宽的是「别人写的东西能不能读进来」，不是「我能写什么」。
 *
 * 〔为什么收在 schema.ts〕DEV-05：品牌断言只出现在受控收窄点。本函数是该品牌的
 * **唯一**产出点（`ids.ts` 的工厂负责 id 品牌，这里负责 kind 品牌）。
 */
export function openLiteralUnionSchema<const V extends readonly string[]>(
  values: V,
): SoloipsSchema<V[number] | SoloipsUnknownOperationKind> {
  const allowed = new Set<string>(values);
  return {
    safeParse(value) {
      if (typeof value !== "string" || value.trim().length === 0) {
        return fail([{ path: "", message: "应为非空白字符串（操作种类）" }]);
      }
      if (allowed.has(value)) {
        return ok(value as V[number]); // 受控断言：allowed 由 values 生成，has 已证明成员资格
      }
      // 受控单次断言：上面的分支已证明它是非空白字符串，且不在已知词表内——
      // 这正是「未知 kind」的定义。品牌只表示「非本版本词表项」，不表示任何
      // 额外的形状保证（故不做进一步校验，也不判损坏）。
      return ok(value as SoloipsUnknownOperationKind);
    },
    parse(value) {
      return parsed(this.safeParse(value));
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 组合
// ─────────────────────────────────────────────────────────────────────────────

export function optionalSchema<T>(inner: SoloipsSchema<T>): SoloipsOptionalSchema<T> {
  return {
    soloipsOptional: true,
    safeParse(value) {
      if (value === undefined) return ok(undefined);
      return inner.safeParse(value);
    },
    parse(value) {
      return parsed(this.safeParse(value));
    },
  };
}

export function arraySchema<T>(inner: SoloipsSchema<T>): SoloipsSchema<readonly T[]> {
  return {
    safeParse(value) {
      if (!Array.isArray(value)) return fail([{ path: "", message: "应为数组" }]);
      const items: T[] = [];
      const issues: SoloipsSchemaIssue[] = [];
      value.forEach((item, index) => {
        const result = inner.safeParse(item);
        if (result.success) items.push(result.data);
        else
          issues.push(
            ...result.error.map((issue) => ({
              path: `[${index}]${issue.path}`,
              message: issue.message,
            })),
          );
      });
      return issues.length > 0 ? fail(issues) : ok(items);
    },
    parse(value) {
      return parsed(this.safeParse(value));
    },
  };
}

/** 从一个 schema 类型取出它校验出的数据形状（T 只在返回位置，故协变）。 */
type SoloipsSchemaValue<S> = S extends SoloipsSchema<infer T> ? T : never;

/**
 * 判别联合的通用形式：按顺序试各变体，首个成功者胜（与 zod 的 union 语义一致）。
 *
 * 用途：根级绑定元数据的「未绑定 / 已绑定」判别——两者是**不同事实**，
 * 不是同一字段的可空值（见 contracts.ts `SoloipsRootBindingRecord`）。
 * 全部变体失败时合并各变体的 issue，使「介质上的值两边都不像」这类损坏
 * 能被诊断文本指出来。
 *
 * 泛型收在**变体元组**上（`const V`）：结果形状是各变体数据类型的并集，
 * 而不是首个变体的类型——写成 `readonly SoloipsSchema<T>[]` 会让 TS 从
 * 第一个元素推断 T，使后续变体因形状不同而报错。
 */
export function unionSchema<const V extends readonly SoloipsSchema<unknown>[]>(
  variants: V,
): SoloipsSchema<SoloipsSchemaValue<V[number]>> {
  type Value = SoloipsSchemaValue<V[number]>;
  const safeParse = (value: unknown): SoloipsSchemaResult<Value> => {
    const issues: SoloipsSchemaIssue[] = [];
    for (const variant of variants) {
      const result = variant.safeParse(value);
      if (result.success) {
        // 受控单次断言：命中的变体已证明该值属于 V 中某一支校验出的形状，
        // 而 Value 正是这些形状的并集，故收窄不绕过任何校验。
        return { success: true, data: result.data as Value };
      }
      issues.push(...result.error);
    }
    return fail(issues.length > 0 ? issues : [{ path: "", message: "不匹配任何声明的变体" }]);
  };
  return {
    safeParse,
    parse(value) {
      return parsed(safeParse(value));
    },
  };
}

/**
 * 对象：字段逐个校验；可选字段缺省即省略（exactOptionalPropertyTypes 语义），
 * 未知字段剥离（与 zod 默认一致，durable 边界只保留声明字段）。
 */
export function objectSchema<T extends { readonly [key: string]: unknown }>(fields: {
  readonly [K in keyof T]: SoloipsSchema<T[K]>;
}): SoloipsSchema<T> {
  const keys = Object.keys(fields) as readonly (keyof T & string)[];
  return {
    safeParse(value) {
      if (!isPlainObject(value)) return fail([{ path: "", message: "应为对象" }]);
      const out: Record<string, unknown> = {};
      const issues: SoloipsSchemaIssue[] = [];
      for (const key of keys) {
        const field = fields[key];
        if (field === undefined) throw new Error(`objectSchema：字段 ${key} 缺少校验器`);
        const raw = value[key];
        if (raw === undefined && isOptionalSchema(field)) continue; // 缺省即省略
        const result = field.safeParse(raw);
        if (result.success) out[key] = result.data;
        else
          issues.push(
            ...result.error.map((issue) => ({
              path: issue.path === "" ? key : `${key}.${issue.path}`,
              message: issue.message,
            })),
          );
      }
      if (issues.length > 0) return fail(issues);
      // 受控单次断言：所有声明字段已逐一通过 fields[key] 校验，此处仅为
      // 把 Record 收窄回具名形状，不绕过任何业务校验。
      return ok(out as T);
    },
    parse(value) {
      return parsed(this.safeParse(value));
    },
  };
}

function parsed<T>(result: SoloipsSchemaResult<T>): T {
  if (result.success) return result.data;
  throw toError(result.error);
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON 载荷（操作意图/结果）
// ─────────────────────────────────────────────────────────────────────────────

function jsonValueSchema(): SoloipsSchema<SoloipsJsonValue> {
  const schema: SoloipsSchema<SoloipsJsonValue> = {
    safeParse(value) {
      if (value === null) return ok(null);
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return ok(value);
      }
      if (Array.isArray(value)) {
        const items: SoloipsJsonValue[] = [];
        for (const item of value) {
          const result = schema.safeParse(item);
          if (!result.success) return fail([{ path: "", message: "数组含非 JSON 值" }]);
          items.push(result.data);
        }
        return ok(items);
      }
      if (isPlainObject(value)) {
        const out: Record<string, SoloipsJsonValue> = {};
        for (const [key, item] of Object.entries(value)) {
          const result = schema.safeParse(item);
          if (!result.success) return fail([{ path: key, message: "对象含非 JSON 值" }]);
          out[key] = result.data;
        }
        return ok(out);
      }
      return fail([{ path: "", message: "应为纯 JSON 值" }]);
    },
    parse(value) {
      return parsed(this.safeParse(value));
    },
  };
  return schema;
}

const JSON_VALUE = jsonValueSchema();

/** 字符串键的 JSON 记录（操作意图与结果的持久形状）。 */
export function jsonRecordSchema(): SoloipsSchema<SoloipsOperationIntent> {
  return {
    safeParse(value) {
      if (!isPlainObject(value)) return fail([{ path: "", message: "应为 JSON 对象" }]);
      const result = JSON_VALUE.safeParse(value);
      if (!result.success) return result;
      // 受控单次断言：JSON_VALUE 已证明为纯 JSON 对象，此处仅收窄为记录形状。
      return ok(result.data as SoloipsOperationIntent);
    },
    parse(value) {
      return parsed(this.safeParse(value));
    },
  };
}
