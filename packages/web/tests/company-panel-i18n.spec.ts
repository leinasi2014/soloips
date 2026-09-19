/**
 * 公司面板映射表测试（`SOLO-I18N-01` §3 的完备性要求）。
 *
 * ── 为什么完备性要由**运行期双向断言**承担（不只靠类型）────────────────────
 * `../src/client/i18n/company-panel.js` 的三张表都以
 * `satisfies Record<联合, SoloipsLocaleKey>` 声明，类型层已能拦下「漏一个值」
 * 与「多一个值」。但类型断言可被一次 `as` 绕过，而**契约联合本身**也会漂移：
 * core 若新增一个公司类型（如 `franchise`），`satisfies` 会在**本仓**编译失败
 * ——那是好的；但若有人顺手把 `Record<SoloipsCompanyType, …>` 放宽成
 * `Record<string, …>`，类型层就静默失效了。
 *
 * 因此本文件对每个联合做**双向相等**断言（范式同 `i18n-assets.spec.ts` 对
 * `SoloipsCoreErrorCode` 的做法）：穷举对象与运行期投影必须逐项相等——漏项与
 * 假项都会失败。
 */

import { describe, expect, it } from "vitest";
import type { SoloipsCompanyType, SoloipsPlanCode } from "soloips-core/contracts";

import {
  SOLOIPS_COMPANY_FAILED_KEY,
  SOLOIPS_COMPANY_OUTCOME_KEYS,
  SOLOIPS_COMPANY_STATUS_KEYS,
  SOLOIPS_COMPANY_TYPE_KEYS,
  SOLOIPS_PLAN_CODE_KEYS,
  SOLOIPS_QUOTA_RESOURCE_KEYS,
  soloipsCompanyOutcomeCopy,
  soloipsCompanyOutcomeStatusIds,
  soloipsCompanyStatusIds,
  soloipsCompanyTypeIds,
  soloipsPlanCodeIds,
  soloipsQuotaResourceIds,
  type SoloipsCompanyOutcomeStatusId,
  type SoloipsCompanyStatusId,
} from "../src/client/i18n/company-panel.js";
import { SOLOIPS_LOCALE_NAMESPACE, en, zh } from "../src/client/locales/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// 事实基准（测试专用穷举；不构成生产词表）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `SoloipsCompanyType` 的穷举对象（`Record<T, true>` 范式）。
 * 联合加一项而漏改这里 → 缺键，编译失败；这里多一个不在联合里的键 → 编译失败。
 */
const ALL_COMPANY_TYPES: Record<SoloipsCompanyType, true> = {
  platform: true,
  operation: true,
  enterprise: true,
  subsidiary: true,
};

/** 公司状态的穷举（`SoloipsCompanyRecord['status']` 的两值）。 */
const ALL_COMPANY_STATUSES: Record<SoloipsCompanyStatusId, true> = {
  active: true,
  archived: true,
};

/** 提交结果判别值的穷举（core 四态 ∪ 未就绪臂）。 */
const ALL_OUTCOME_STATUSES: Record<SoloipsCompanyOutcomeStatusId, true> = {
  committed: true,
  replayed: true,
  unknown: true,
  refused: true,
  unavailable: true,
};

/** `SoloipsPlanCode` 的穷举（三值）。 */
const ALL_PLAN_CODES: Record<SoloipsPlanCode, true> = {
  free: true,
  pro: true,
  enterprise: true,
};

/** `SoloipsQuotaResourceType` 的穷举（两值；本包不 import core 的该类型面，故就地写）。 */
const ALL_QUOTA_RESOURCES = { companyLimit: true, subsidiaryLimit: true } as const;

// ─────────────────────────────────────────────────────────────────────────────
// ① 表 ↔ 联合双向相等
// ─────────────────────────────────────────────────────────────────────────────

describe("公司面板映射表：与契约联合双向相等", () => {
  it("公司类型：四值全覆盖，且投影与穷举对象双向相等", () => {
    const ids = soloipsCompanyTypeIds();
    expect(new Set(ids).size, "投影不得有重复项").toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(ALL_COMPANY_TYPES).sort());
  });

  it("公司状态：两值全覆盖", () => {
    expect([...soloipsCompanyStatusIds()].sort()).toEqual(Object.keys(ALL_COMPANY_STATUSES).sort());
  });

  it("提交结果判别值：五值全覆盖", () => {
    expect([...soloipsCompanyOutcomeStatusIds()].sort()).toEqual(
      Object.keys(ALL_OUTCOME_STATUSES).sort(),
    );
  });

  it("配额额度名：两值全覆盖", () => {
    expect([...soloipsQuotaResourceIds()].sort()).toEqual(Object.keys(ALL_QUOTA_RESOURCES).sort());
  });

  it("计划码：三值全覆盖", () => {
    expect([...soloipsPlanCodeIds()].sort()).toEqual(Object.keys(ALL_PLAN_CODES).sort());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ② 每个值都指向**存在**的字典键（且值互不重复）
// ─────────────────────────────────────────────────────────────────────────────

describe("公司面板映射表：键都在字典里且互不重复", () => {
  /** 键是否真实存在于两个字典（运行期兜底类型层的 `satisfies`）。 */
  const ownsKey = (key: string): boolean => Object.hasOwn(zh, key) && Object.hasOwn(en, key);

  it("公司类型 / 状态 / 结果 / 额度 / 计划码的每个值都存在于 zh 与 en", () => {
    const tables: readonly (readonly [string, string])[] = [
      ...Object.entries(SOLOIPS_COMPANY_TYPE_KEYS),
      ...Object.entries(SOLOIPS_COMPANY_STATUS_KEYS),
      ...Object.entries(SOLOIPS_COMPANY_OUTCOME_KEYS),
      ...Object.entries(SOLOIPS_QUOTA_RESOURCE_KEYS),
      ...Object.entries(SOLOIPS_PLAN_CODE_KEYS),
    ];
    expect(tables.length).toBeGreaterThan(0);
    for (const [id, key] of tables) {
      expect(ownsKey(key), `${id} 的键 ${key} 必须存在于两个字典`).toBe(true);
    }
  });

  it("结果五态的文案键**互不重复**（一个判别值一条可区分的文案）", () => {
    const keys = Object.values(SOLOIPS_COMPANY_OUTCOME_KEYS);
    expect(new Set(keys).size, "结果判别值之间不得共用同一文案键").toBe(keys.length);
  });

  it("所有面板键都带 `soloips.` 前缀（与命名空间一致）", () => {
    const offenders = [
      ...Object.values(SOLOIPS_COMPANY_TYPE_KEYS),
      ...Object.values(SOLOIPS_COMPANY_STATUS_KEYS),
      ...Object.values(SOLOIPS_COMPANY_OUTCOME_KEYS),
      ...Object.values(SOLOIPS_QUOTA_RESOURCE_KEYS),
      ...Object.values(SOLOIPS_PLAN_CODE_KEYS),
      SOLOIPS_COMPANY_FAILED_KEY,
    ].filter((key) => !key.startsWith(`${SOLOIPS_LOCALE_NAMESPACE}.`));
    expect(offenders, "键必须以 soloips. 开头").toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ③ 结果 → 文案素材（含嵌套键解析）
// ─────────────────────────────────────────────────────────────────────────────

describe("提交结果 → 上屏素材", () => {
  /** 真字典解析（与 `ctx.locale.bind` 的 `translate` 同语义）。 */
  const lookup = (key: keyof typeof zh): string => zh[key];

  const OPERATION_ID = "web-op-1";

  it("`committed` / `replayed`：专有键、无参数", () => {
    for (const status of ["committed", "replayed"] as const) {
      const copy = soloipsCompanyOutcomeCopy(
        { status, result: { companyId: "cmp_x" as never } },
        OPERATION_ID,
        lookup,
      );
      expect(copy.key).toBe(SOLOIPS_COMPANY_OUTCOME_KEYS[status]);
      expect(copy.params).toEqual({});
    }
  });

  it("`unknown` / `unavailable`：带 `{operationId}`（用户据此保留编号）", () => {
    const unknownCopy = soloipsCompanyOutcomeCopy({ status: "unknown" }, OPERATION_ID, lookup);
    expect(unknownCopy.key).toBe("soloips.company.outcome.unknown");
    expect(unknownCopy.params).toEqual({ operationId: OPERATION_ID });

    const unavailableCopy = soloipsCompanyOutcomeCopy(
      { status: "unavailable", reason: "core-unavailable" },
      OPERATION_ID,
      lookup,
    );
    expect(unavailableCopy.key).toBe("soloips.company.outcome.unavailable");
    expect(unavailableCopy.params).toEqual({ operationId: OPERATION_ID });
  });

  it("`refused`：四个参数都来自结构化字段，且嵌套键**解析成文案**（不是键名）", () => {
    const copy = soloipsCompanyOutcomeCopy(
      {
        status: "refused",
        reason: "quota-exceeded",
        resourceType: "companyLimit",
        planCode: "free",
        current: 1,
        limit: 1,
      },
      OPERATION_ID,
      lookup,
    );
    expect(copy.key).toBe("soloips.company.outcome.refused");
    // 〔关键判据〕嵌套键必须被解析为**文案**；把键名直接当参数传下去会让用户看到
    // `soloips.company.limit.company` 这类内部标识（本片首版正是如此，被
    // `company-panel.spec.ts` 的「必须显示额度名」用例检出）。
    expect(copy.params["resource"]).toBe(zh["soloips.company.limit.company"]);
    expect(copy.params["planCode"]).toBe(zh["soloips.company.plan.free"]);
    expect(copy.params["current"]).toBe("1");
    expect(copy.params["limit"]).toBe("1");
    for (const [name, value] of Object.entries(copy.params)) {
      expect(value, `${name} 不得是未解析的字典键`).not.toMatch(/^soloips\./);
    }
  });

  it("`refused` 的模板占位符与实参键集一一对应（两种语言）", () => {
    const copy = soloipsCompanyOutcomeCopy(
      {
        status: "refused",
        reason: "quota-exceeded",
        resourceType: "subsidiaryLimit",
        planCode: "pro",
        current: 0,
        limit: 0,
      },
      OPERATION_ID,
      lookup,
    );
    const placeholders = (template: string): string[] =>
      [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();
    expect(placeholders(zh[copy.key]), "zh 模板占位符必须与实参一致").toEqual(
      Object.keys(copy.params).sort(),
    );
    expect(placeholders(en[copy.key]), "en 模板占位符必须与实参一致").toEqual(
      Object.keys(copy.params).sort(),
    );
  });

  it("`unknown` 文案里**不含** core 的诊断文本（I18N-1/I18N-2）", () => {
    const copy = soloipsCompanyOutcomeCopy({ status: "unknown" }, OPERATION_ID, lookup);
    // 模拟 core 的 `message` 形状：映射表的入口**只有**判别值与编号，没有任何
    // 接收 message 的位置——故产物里不可能出现它。
    const coreMessage = "operationId 存在未决意图，结果未知";
    expect(JSON.stringify(copy)).not.toContain(coreMessage);
    expect(zh[copy.key]).not.toContain(coreMessage);
  });
});
