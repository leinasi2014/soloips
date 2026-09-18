/**
 * SOLOIPS-WEB-I18N-ONBOARDING-GAPS
 *
 * `checkOnboarding` 缺项的 `(item, reason)` → i18n 键映射（`SOLO-I18N-01` §4；
 * 契约侧 `data-contract.md` §2.7 的「关闭 `gaps[].message` 待决」行）。
 *
 * 三条不变量：
 *
 *  1. **界面不显示 `gaps[].message`**（设计 §4 第 1 行）。该字段是 core 的中文
 *     诊断（T2：面向开发者与运维，**不得上屏**）；用户文案由本表按 `item`+`reason`
 *     查得。`SoloipsOnboardingGap` 上确实带着 `message`，但本模块**只读**
 *     `item`/`reason`/参数——没有任何入口把它转交出去。
 *  2. **最左列是稳定 id**：表的键是 `SoloipsOnboardingGapItem`（9 值）×
 *     `SoloipsOnboardingGapReason`（10 值）的枚举成员，**不是**本地化文本
 *     （底册 C8：绝不用本地化文本做内部匹配）。
 *  3. **可达组合必有键，未定义组合回退到通用键**：`soloips.onboarding.gap.generic`
 *     + `{reason}` 作**可复制诊断**——不得显示 core 的 `message`、不得显示空白
 *     （设计 §4「回退」行）。
 *
 * ── 可达性实证（设计 §9 的 Q-2；读 `packages/core/src/onboarding.ts` 得出） ────
 *
 * `evaluateOnboarding` 的 `gap(...)` 调用点**穷举**如下（行号为
 * `packages/core/src/onboarding.ts` @ 本切片基线，函数名 + 行号可复核）：
 *
 * | 行 | 调用点 | item | reason |
 * |---|---|---|---|
 * | 178 | `evaluateOnboarding` 员工不存在早返回 | `employee` | `employee-not-found` |
 * | 187 | 无任职记录分支 | `appointment` | `appointment-missing` |
 * | 188 | 任职全撤销分支 | `appointment` | `appointment-revoked` |
 * | 93 | `documentGaps` 无当前引用 | `profile`/`avatar`/`soul`/`operating` | `document-missing` |
 * | 99 | `documentGaps` 当前引用读不到版本记录 | 同上（四个 item） | `document-missing` |
 * | 106 | `documentGaps` 属主不符 | 同上 | `document-owner-mismatch` |
 * | 116 | `documentGaps` 空白内容 | 同上 | `document-content-invalid` |
 * | 124 | `documentGaps` 摘要不符 | 同上 | `document-content-invalid` |
 * | 144 | `assemblyGaps` 无装配证据 | `assembly` | `assembly-evidence-missing` |
 * | 151 | `assemblyGaps` 证据指向旧版本 | `assembly` | `assembly-evidence-stale` |
 * | 198 | 记忆未初始化 | `memory` | `memory-not-initialized` |
 * | 206 | 岗位能力未验证 | `capability` | `capability-not-verified` |
 *
 * **去重后的可达 `(item, reason)` 组合 = 19 个**（1 + 2 + 4×3 + 2 + 1 + 1）；
 * 全空间 9×10 = 90，**不可达 71 个**。三条关键边界：
 *  - 文档类 item（`profile`/`avatar`/`soul`/`operating`）只在 `documentGaps` 里
 *    产出 `document-missing` / `document-content-invalid` / `document-owner-mismatch`
 *    三个 reason，其余 7 个 reason **不可达**（`documentGaps` 的循环只由
 *    `REQUIRED_DOCUMENT_TYPES` 驱动，四个 item 同构）；
 *  - `assembly` 的 item 与 `documentType` 是**两个维度**：item 恒为 `assembly`，
 *    文档类型只在 `documentType` 参数里（故本表 `assembly` 行只有两个 reason）；
 *  - `employee` 只在早返回分支出现，故只有 `employee-not-found` 一个 reason；
 *    该分支 `return` 时不产出任何其他缺项（早返回语义）。
 *
 * 〔为什么表用 `Partial<Record<Reason, …>>` 而不是全 90 键〕设计 §4「完备性」行
 * 明说 90 组合不必全定义；给不可达组合写键等于给不存在的状态写文案，会随
 * `evaluateOnboarding` 的分支变化而腐坏。可达组合由测试穷举断言（缺失即失败），
 * 不可达组合由上面的表说明。
 *
 * 〔本片未做的：`documentDetail` 维度的细分〕`document-content-invalid` 的
 * `documentDetail`（`blank-content` / `digest-mismatch`）在键位里**不出现**——
 * 设计 §4 规定的键位是 `soloips.onboarding.gap.<item>.<reason>`，附加维度
 * （`documentType`/`capability`/`documentDetail`）是**参数**而非键段。故本表每个
 * reason 只有一条文案（覆盖两种 detail，措辞「内容无效或与保存时不一致」）。
 * 若后续要按 detail 分文案，须先改设计 §4 的键位规范（属架构变更，不在本片）。
 */

import type {
  SoloipsOnboardingGap,
  SoloipsOnboardingGapItem,
  SoloipsOnboardingGapReason,
} from "soloips-core/contracts";

import type { SoloipsLocaleKey } from "../locales/index.js";

/**
 * `(item, reason)` → 字典键（19 个可达组合）。
 *
 * 〔类型钉法〕显式标注为 `Record<Item, Partial<Record<Reason, Key>>>`：
 *  - **item 维度全定义**——漏一个 item 即编译失败（9 个 item 各自都有可达组合，
 *    见文件头的实证表）；
 *  - **reason 维度部分定义**——不可达组合缺省，理由见文件头；
 *  - 值必须是真实字典键（`SoloipsLocaleKey`），拼错即编译失败。
 *
 * 〔与可达集合的双向关系〕「可达 ⊆ 本表」由测试穷举断言（`i18n-assets.spec.ts`）；
 * 「本表 ⊆ 可达」**不**要求——为将来可能可达的组合预留键无害，但本片不留预留键
 * （`Partial` 的形状让新增项只在真正可达时出现）。
 */
export const SOLOIPS_ONBOARDING_GAP_KEYS: Readonly<
  Record<SoloipsOnboardingGapItem, Partial<Record<SoloipsOnboardingGapReason, SoloipsLocaleKey>>>
> = {
  employee: {
    "employee-not-found": "soloips.onboarding.gap.employee.employeeNotFound",
  },
  appointment: {
    "appointment-missing": "soloips.onboarding.gap.appointment.appointmentMissing",
    "appointment-revoked": "soloips.onboarding.gap.appointment.appointmentRevoked",
  },
  profile: {
    "document-missing": "soloips.onboarding.gap.profile.documentMissing",
    "document-content-invalid": "soloips.onboarding.gap.profile.documentContentInvalid",
    "document-owner-mismatch": "soloips.onboarding.gap.profile.documentOwnerMismatch",
  },
  avatar: {
    "document-missing": "soloips.onboarding.gap.avatar.documentMissing",
    "document-content-invalid": "soloips.onboarding.gap.avatar.documentContentInvalid",
    "document-owner-mismatch": "soloips.onboarding.gap.avatar.documentOwnerMismatch",
  },
  soul: {
    "document-missing": "soloips.onboarding.gap.soul.documentMissing",
    "document-content-invalid": "soloips.onboarding.gap.soul.documentContentInvalid",
    "document-owner-mismatch": "soloips.onboarding.gap.soul.documentOwnerMismatch",
  },
  operating: {
    "document-missing": "soloips.onboarding.gap.operating.documentMissing",
    "document-content-invalid": "soloips.onboarding.gap.operating.documentContentInvalid",
    "document-owner-mismatch": "soloips.onboarding.gap.operating.documentOwnerMismatch",
  },
  memory: {
    "memory-not-initialized": "soloips.onboarding.gap.memory.memoryNotInitialized",
  },
  capability: {
    "capability-not-verified": "soloips.onboarding.gap.capability.capabilityNotVerified",
  },
  assembly: {
    "assembly-evidence-missing": "soloips.onboarding.gap.assembly.assemblyEvidenceMissing",
    "assembly-evidence-stale": "soloips.onboarding.gap.assembly.assemblyEvidenceStale",
  },
};

/** 未定义组合的通用文案键（`{reason}` 为可复制诊断）。 */
export const SOLOIPS_ONBOARDING_GAP_GENERIC_KEY =
  "soloips.onboarding.gap.generic" satisfies SoloipsLocaleKey;

/**
 * 一次缺项的**上屏素材**：字典键 + 占位符实参。
 *
 * 〔不变量〕`params` 的键集 = 所选键模板的占位符集合（不多不少）。多一个会污染
 * 诊断面、少一个会让模板里的 `{…}` 原样上屏——两者都由测试对全部可达组合断言
 * （`i18n-assets.spec.ts`「占位符与实参一一对应」）。
 */
export interface SoloipsOnboardingGapCopy {
  readonly key: SoloipsLocaleKey;
  readonly params: Readonly<Record<string, string>>;
}

/**
 * 缺项文案的**参数来源**（只含机器可判定物；不含任何 core 文本）。
 *
 * 〔为什么是 `capability` 一个字段〕本片唯一参数化的缺项键是
 * `capability.capability-not-verified`（模板含 `{capability}`）。`documentType`
 * 与 `documentDetail` 不参与任何模板（文档名由 item 段承载、detail 由 reason 段
 * 的合并文案覆盖），故不进 params——留空比塞进去更诚实：`params` 的语义是
 * 「模板要的实参」。
 */
export interface SoloipsOnboardingGapCopyDetails {
  /** 未通过验证的能力名（用户可读；缺省时该组合回退到通用键）。 */
  readonly capability?: string;
}

/**
 * 按 `(item, reason)` 取上屏素材（映射表的主入口）。
 *
 * 判定顺序（顺序即语义，不可交换）：
 *  1. 组合在表内且参数齐备 → 该组合的专有键；
 *  2. 组合在表内但参数缺失（`capability` 组合缺能力名）→ 通用键 + `{reason}`：
 *     **不得**渲染出未替换的 `{capability}` 占位符（那比通用文案更差）；
 *  3. 组合不在表内（含未来版本新增的 reason）→ 通用键 + `{reason}`。
 *
 * @param item - 缺项定位（`SoloipsOnboardingGap.item`，稳定枚举）。
 * @param reason - 缺因（`SoloipsOnboardingGap.reason`，稳定枚举）。
 * @param details - 模板所需的参数；缺省即无参。
 * @returns 键与占位符实参；**永不**返回 core 的 `message`。
 */
export function soloipsOnboardingGapCopyFor(
  item: SoloipsOnboardingGapItem,
  reason: SoloipsOnboardingGapReason,
  details: SoloipsOnboardingGapCopyDetails = {},
): SoloipsOnboardingGapCopy {
  const key = SOLOIPS_ONBOARDING_GAP_KEYS[item][reason];
  if (key === undefined) {
    return { key: SOLOIPS_ONBOARDING_GAP_GENERIC_KEY, params: { reason } };
  }
  if (item === "capability") {
    // 唯一参数化组合：缺能力名即回退，避免 `{capability}` 原样上屏。
    const capability = details.capability;
    if (capability === undefined) {
      return { key: SOLOIPS_ONBOARDING_GAP_GENERIC_KEY, params: { reason } };
    }
    return { key, params: { capability } };
  }
  return { key, params: {} };
}

/**
 * 按**缺项对象**取上屏素材（消费侧便利入口）。
 *
 * 〔约束〕本函数**只读** `item`/`reason`/`capability` 三个机器可判定字段：
 * `message` 即使存在也不会被读出、更不会被返回（设计 §2/§4 的「禁止上屏」）。
 * `documentType`/`documentDetail` 同理不读——它们不是任何模板的占位符
 * （见 `SoloipsOnboardingGapCopyDetails` 的说明）。
 */
export function soloipsOnboardingGapCopyOf(gap: SoloipsOnboardingGap): SoloipsOnboardingGapCopy {
  return soloipsOnboardingGapCopyFor(gap.item, gap.reason, {
    // 条件展开保持 exactOptionalPropertyTypes：缺省即省略，不写 undefined。
    ...(gap.capability === undefined ? {} : { capability: gap.capability }),
  });
}

/**
 * 本表的运行期投影（`"<item>.<reason>"` 形式，供测试与诊断面消费）。
 *
 * 〔与表的同步义务〕由表派生（遍历 `Object.entries`），**不是**第二份词表；
 * 「可达组合是否都有键」由测试拿这份投影与实证清单做比较。
 */
export function soloipsOnboardingGapEntries(): readonly {
  readonly item: SoloipsOnboardingGapItem;
  readonly reason: SoloipsOnboardingGapReason;
  readonly key: SoloipsLocaleKey;
}[] {
  const entries: {
    item: SoloipsOnboardingGapItem;
    reason: SoloipsOnboardingGapReason;
    key: SoloipsLocaleKey;
  }[] = [];
  for (const item of Object.keys(SOLOIPS_ONBOARDING_GAP_KEYS) as SoloipsOnboardingGapItem[]) {
    const byReason = SOLOIPS_ONBOARDING_GAP_KEYS[item];
    for (const reason of Object.keys(byReason) as SoloipsOnboardingGapReason[]) {
      const key = byReason[reason];
      // `Object.keys` 只给出已定义的键，故 `key` 必为字符串；守卫写法保持
      // 类型收窄而不做断言（noUncheckedIndexedAccess 下 `key` 是可选类型）。
      if (key !== undefined) entries.push({ item, reason, key });
    }
  }
  return entries;
}
