/**
 * SOLOIPS-WEB-I18N-ERROR-CODES
 *
 * 错误码 → i18n 键的**唯一权威映射表**（`SOLO-I18N-01` §3「权威落点」裁定；
 * 契约侧落点 `docs/design/data-contract.md` §2.7 I18N-2）。
 *
 * 三条不变量（违反其一即本模块失去意义）：
 *
 *  1. **最左列是稳定 id**：本表的键是 `SoloipsCoreErrorCode` 的成员（10 个），
 *     值才是文案键。查表**只用**码，**绝不用**本地化文本做内部匹配（底册 C8）；
 *     码是契约、随领域演进，文案键随界面迭代，两者节奏不同（设计 §3「为什么不在
 *     契约正文」）。
 *  2. **完备性由类型 + 运行期双向断言共同钉住**：
 *     - 类型层：`satisfies Record<SoloipsCoreErrorCode, SoloipsLocaleKey>`——
 *       漏一个码即编译失败，多一个码被对象字面量的多余属性检查拦下，值不是字典
 *       键同样编译失败；
 *     - 运行期：`soloipsCoreErrorCodes()` 是表的运行期投影，测试对「投影 ↔
 *       `Record<SoloipsCoreErrorCode, true>` 穷举」做**双向相等**断言（范式同
 *       `packages/core/src/commit-gate.ts` 的 `KNOWN_OPERATION_KIND_LIST`）。
 *       为什么类型层之外还要运行期：类型断言可被一次 `as` 绕过，而「多出联合之外
 *       的假项」在运行期是可观察的（`team-data.spec.ts` 的 M12 变异即此教训）。
 *  3. **不得暴露 core 的 `message`**：本模块**只**消费码；查询函数的入参是
 *     `string`（码）或 `unknown`（错误对象），**没有任何入口**接收 `message`。
 *     core 的 `message` 是中文诊断、面向开发者与运维、**不得上屏**（设计 §2、
 *     契约 I18N-1）。用户看到的文案一律是本表的值指向的字典条目。
 *
 * 〔为什么未知码走 `soloips.error.unknown` 而不是显示空白〕设计 §3「未知码」行：
 * 回退到通用文案 + 码本身作为**可复制诊断**（`{code}` 占位符），两者缺一不可——
 * 只有通用文案会让报障失去线索，只有码则等于把机器可判定物直接上屏。
 *
 * 〔adapter 侧码的处置〕`SOLOIPS_ADAPTER_*`（6 个，`soloips-adapter-dsh/contracts`
 * 的 `SoloipsAdapterErrorCode`）**不逐码建键**：web 包的依赖面禁令（DEV-04、
 * `.oxlintrc.json` 的 web override）不允许 import adapter 的契约面，逐码表只能手抄
 * 常量，那会制造第二份真源且无类型强制。改为**前缀归一**到
 * `soloips.error.adapter.generic`（见 `soloipsErrorCopyForCode` 的判定顺序）。
 * 〔待决〕逐码文案（设计 §3 表的 `soloips.error.adapter.<域>`）须待 adapter 面
 * 提供可被 web 消费的码投影后落地——不在本片白名单内。
 */

import type { SoloipsCoreErrorCode } from "soloips-core/contracts";

import type { SoloipsLocaleKey } from "../locales/index.js";

/**
 * core 错误码 → 字典键（10 个码全覆盖；键名逐字采用设计 §3 的骨架表）。
 *
 * 〔值为何不重复用同一个键〕一个码对应一条用户文案：两个码共用一条文案会让用户
 * 无法区分「写权失守（不自动重试）」与「写权状态未知」这类**处置方式不同**的失败，
 * 也会让测试的「值唯一」断言失去意义。
 */
export const SOLOIPS_CORE_ERROR_CODE_KEYS = {
  /** 部署配置错误——面向管理员。 */
  SOLOIPS_CORE_CONFIG_INVALID: "soloips.error.configInvalid",
  /** adapter 端口结构不符（fail-closed，服务不发布）。 */
  SOLOIPS_CORE_ADAPTER_INVALID: "soloips.error.adapterInvalid",
  /** 只读态提示。 */
  SOLOIPS_CORE_STORE_CLOSED: "soloips.error.storeClosed",
  /** 写权失守——文案须含「**不自动重试**」（项目红线第 1 条）。 */
  SOLOIPS_CORE_LEASE_NOT_HELD: "soloips.error.leaseLost",
  /** 写权状态未知。 */
  SOLOIPS_CORE_LEASE_CHECK_FAILED: "soloips.error.leaseUnknown",
  /** 输入校验失败。 */
  SOLOIPS_CORE_VALIDATION: "soloips.error.validation",
  /** 状态不允许（目标不存在或已撤销）。 */
  SOLOIPS_CORE_PRECONDITION: "soloips.error.precondition",
  /** operationId 复用冲突。 */
  SOLOIPS_CORE_CONFLICT: "soloips.error.conflict",
  /** 账户绑定不符（三种触发面共用本码，`message` 区分具体哪一个——界面只按码给通用处置）。 */
  SOLOIPS_CORE_ACCOUNT_MISMATCH: "soloips.error.accountMismatch",
  /** 介质数据损坏。 */
  SOLOIPS_CORE_RECORD_INVALID: "soloips.error.recordInvalid",
} as const satisfies Record<SoloipsCoreErrorCode, SoloipsLocaleKey>;

/** 未知码（含未来版本新增码）的通用文案键。 */
export const SOLOIPS_UNKNOWN_ERROR_KEY = "soloips.error.unknown" satisfies SoloipsLocaleKey;

/** adapter 侧码的归一文案键（按前缀匹配，见文件头「adapter 侧码的处置」）。 */
export const SOLOIPS_ADAPTER_ERROR_KEY = "soloips.error.adapter.generic" satisfies SoloipsLocaleKey;

/** adapter 码的稳定前缀（契约事实：`SoloipsAdapterErrorCode` 全部成员以此开头）。 */
const ADAPTER_ERROR_CODE_PREFIX = "SOLOIPS_ADAPTER_";

/** 错误对象**没有**可读码时的诊断占位符（`{code}` 实参；不得留空，设计 §3）。 */
export const SOLOIPS_ERROR_CODE_UNKNOWN = "UNKNOWN";

/**
 * 一次错误的**上屏素材**：字典键 + 占位符实参。
 *
 * 〔约束〕本结构**不含**任何 core 文本——`params` 只承载机器可判定物
 * （码、`reason`、`capability`）。界面侧把它交给 `t(key, params)` 得到文案。
 */
export interface SoloipsErrorCopy {
  readonly key: SoloipsLocaleKey;
  readonly params: Readonly<Record<string, string>>;
}

/** 码是否属于本表（类型守卫；`hasOwnProperty` 而非 `in`，不接受原型链上的键）。 */
function isSoloipsCoreErrorCode(code: string): code is SoloipsCoreErrorCode {
  return Object.hasOwn(SOLOIPS_CORE_ERROR_CODE_KEYS, code);
}

/**
 * 按**码**取上屏素材（映射表的主入口）。
 *
 * 判定顺序（顺序即语义，不可交换）：
 *  1. core 码在表内 → 该码的专有键，无参数；
 *  2. `SOLOIPS_ADAPTER_` 前缀 → 归一键，`{code}` 为诊断；
 *  3. 其余（含未来版本新增的 core 码、未知前缀、空串）→ 通用键，`{code}` 为诊断。
 *
 * @param code - 机器可判定的稳定码（`SoloipsCoreError`/`SoloipsAdapterError` 的 `code`）。
 * @returns 键与占位符实参；**永不**返回 core 的 `message`。
 */
export function soloipsErrorCopyForCode(code: string): SoloipsErrorCopy {
  if (isSoloipsCoreErrorCode(code)) return { key: SOLOIPS_CORE_ERROR_CODE_KEYS[code], params: {} };
  if (code.startsWith(ADAPTER_ERROR_CODE_PREFIX)) {
    return { key: SOLOIPS_ADAPTER_ERROR_KEY, params: { code } };
  }
  return { key: SOLOIPS_UNKNOWN_ERROR_KEY, params: { code } };
}

/**
 * 从错误对象上读稳定码（**结构判别**，不 import core/adapter 的运行时）。
 *
 * 〔为什么不直接用 `error.code`〕入参是 `unknown`（catch 到的任何东西）；本函数
 * 只接受「`code` 是字符串」这一形状，与 core 的 `soloipsAdapterErrorCodeOf` 同法。
 */
export function soloipsErrorCodeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { readonly code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * 按**错误对象**取上屏素材（消费侧便利入口）。
 *
 * 〔约束〕本函数**只读 `code`**：`message` 即使存在也不会被读出、更不会被返回
 * （设计 §2「禁止上屏」）。对象上没有可读码时用 `SOLOIPS_ERROR_CODE_UNKNOWN`
 * 作诊断占位符——不得留空白。
 */
export function soloipsErrorCopyOf(error: unknown): SoloipsErrorCopy {
  const code = soloipsErrorCodeOf(error);
  return soloipsErrorCopyForCode(code ?? SOLOIPS_ERROR_CODE_UNKNOWN);
}

/**
 * 本表的运行期投影（供测试双向断言与诊断面消费）。
 *
 * 〔与表的同步义务〕本函数由表派生（`Object.keys`），**不是**第二份词表；
 * 类型断言只把 `string` 收窄为码联合，真正的「不漏不多」由测试对
 * `Record<SoloipsCoreErrorCode, true>` 的双向比较承担。
 */
export function soloipsCoreErrorCodes(): readonly SoloipsCoreErrorCode[] {
  return Object.keys(SOLOIPS_CORE_ERROR_CODE_KEYS) as SoloipsCoreErrorCode[];
}
