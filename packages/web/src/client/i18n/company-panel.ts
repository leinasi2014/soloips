/**
 * SOLOIPS-WEB-I18N-COMPANY-PANEL
 *
 * 公司面板的**稳定 id → 字典键**映射表（`SOLO-I18N-01` §3「权威落点」；
 * 契约侧 `docs/design/data-contract.md` §2.7 的 I18N-2/I18N-3）。
 *
 * 三条不变量（与 `./error-codes.js` 同款，违反其一即本模块失去意义）：
 *
 *  1. **最左列是稳定 id**：本表的键是**契约里的机器可判定值**——公司类型
 *     （`SoloipsCompanyType` 四值）、公司状态（`SoloipsCompanyRecord['status']` 两值）、
 *     提交结果判别值（`SoloipsCreateCompanyOutcome['status']`）。查表**只用**这些值，
 *     **绝不用**本地化文本做内部匹配（底册 C8）。
 *  2. **完备性由类型 + 运行期双向断言共同钉住**：
 *     - 类型层：三张表都以 `satisfies Record<联合, SoloipsLocaleKey>` 声明——
 *       漏一个值即编译失败，多一个值被多余属性检查拦下，值不是字典键同样编译失败；
 *     - 运行期：`i18n-company-panel.spec.ts` 对每个联合做**双向相等**断言
 *       （范式同 `./error-codes.js` 的 `soloipsCoreErrorCodes()`）。
 *  3. **不得暴露 core 的 `message`**：本模块**只**消费稳定 id。没有任何入口接收
 *     core 的诊断文本；界面侧的错误信息由 `soloipsErrorCopyOf(error)` 按**码**取得
 *     （见 `./error-codes.js`），与 core 的措辞无关。
 *
 * 〔为什么配额拒绝的文案键**唯一**，而不按 `resourceType` 分键〕
 * `resourceType` 的两个取值（`companyLimit` / `subsidiaryLimit`）**已经是参数**
 * （`{resource}`），而「键携带的信息 = 文案可区分的维度」：两条文案的措辞与可行动
 * 指引完全相同，只差一个名词。为它们各写一条键会让「同一句话有两个真源」，
 * 且新增 `resourceType` 时必须记得加键（而参数形态自动覆盖）。
 * `resourceType` 的**文案**（`{resource}` 的取值）仍来自稳定 id 的映射表
 * （{@link SOLOIPS_QUOTA_RESOURCE_KEYS}），不是 core 文本。
 */

import type { SoloipsCompanyType, SoloipsPlanCode } from "soloips-core/contracts";
import type { SoloipsWebCompanyView, SoloipsWebCreateCompanyOutcome } from "soloips-web/contracts";

import type { SoloipsLocaleKey } from "../locales/index.js";

/** 公司类型的可上屏取值面（**四值穷举**，含本入口不可创建的两类官方公司）。 */
export type SoloipsCompanyTypeId = SoloipsCompanyType;

/** 公司状态的可上屏取值面。 */
export type SoloipsCompanyStatusId = SoloipsWebCompanyView["status"];

/** 提交结果的判别值面（core 四态 ∪ 本包的未就绪臂）。 */
export type SoloipsCompanyOutcomeStatusId = SoloipsWebCreateCompanyOutcome["status"];

/**
 * 公司类型 → 文案键（四值穷举）。
 *
 * 〔为什么四值都要有键，即使表单只开放 `enterprise`〕公司树的读回结果里可以出现
 * 全部四类（平台公司/运营子公司由官方初始化，用户子公司属 FE-2 的创建面）。
 * 只给可创建的那一类建键，会让读回界面在遇到其它类型时**无文案可用**——那正是
 * 「读面静默降级」（P-8.5 禁止）的界面侧形态。
 */
export const SOLOIPS_COMPANY_TYPE_KEYS = {
  platform: "soloips.company.type.platform",
  operation: "soloips.company.type.operation",
  enterprise: "soloips.company.type.enterprise",
  subsidiary: "soloips.company.type.subsidiary",
} as const satisfies Record<SoloipsCompanyTypeId, SoloipsLocaleKey>;

/** 公司状态 → 文案键（两值穷举）。 */
export const SOLOIPS_COMPANY_STATUS_KEYS = {
  active: "soloips.company.status.active",
  archived: "soloips.company.status.archived",
} as const satisfies Record<SoloipsCompanyStatusId, SoloipsLocaleKey>;

/**
 * 提交结果判别值 → 文案键（五值穷举）。
 *
 * 〔为什么这里不出现 `failed`〕`failed` **不是** `SoloipsWebCreateCompanyOutcome`
 * 的成员——它是「调用抛错」这一**客户端**情形（`session.ts` 的 `failed` 相位），
 * 故由 {@link SOLOIPS_COMPANY_FAILED_KEY} 单列。把它混进本表会让「core 说了什么」
 * 与「调用没成功」两个来源共用一张表，判据随之含糊。
 */
export const SOLOIPS_COMPANY_OUTCOME_KEYS = {
  committed: "soloips.company.outcome.committed",
  replayed: "soloips.company.outcome.replayed",
  unknown: "soloips.company.outcome.unknown",
  refused: "soloips.company.outcome.refused",
  unavailable: "soloips.company.outcome.unavailable",
} as const satisfies Record<SoloipsCompanyOutcomeStatusId, SoloipsLocaleKey>;

/** 调用抛错（`failed` 相位）的文案键；错误码本身另经 `soloipsErrorCopyOf` 映射。 */
export const SOLOIPS_COMPANY_FAILED_KEY =
  "soloips.company.outcome.failed" satisfies SoloipsLocaleKey;

/**
 * 配额拒绝的额度名 → 文案键（`resourceType` 两值穷举）。
 *
 * 〔`{resource}` 参数的来源〕它取自本表，**不取** core 的 `message`；键位与
 * `data-contract.md` §2.1 的三层配额表同构（`companyLimit` 对应用户公司数、
 * `subsidiaryLimit` 对应子公司数）。
 */
export const SOLOIPS_QUOTA_RESOURCE_KEYS = {
  companyLimit: "soloips.company.limit.company",
  subsidiaryLimit: "soloips.company.limit.subsidiary",
} as const satisfies Record<
  SoloipsWebCreateCompanyOutcome extends { readonly resourceType: infer R } ? R : never,
  SoloipsLocaleKey
>;

/**
 * 计划码 → 文案键（`planCode` 三值穷举）。
 *
 * 〔为什么计划码要有文案〕配额拒绝的载荷里 `planCode` 是**用户可行动**的事实
 * （「当前 free 计划」→「要不要升级」），而 `free`/`pro`/`enterprise` 是**机器标识**
 * （小写英文），直接上屏等于把契约值当文案用。
 */
export const SOLOIPS_PLAN_CODE_KEYS = {
  free: "soloips.company.plan.free",
  pro: "soloips.company.plan.pro",
  enterprise: "soloips.company.plan.enterprise",
} as const satisfies Record<SoloipsPlanCode, SoloipsLocaleKey>;

/**
 * 按公司类型取文案键（**纯查表**；类型是封闭联合，故无需回退）。
 *
 * @param type - 契约里的公司类型。
 * @returns 该类型对应的字典键。
 */
export function soloipsCompanyTypeKey(type: SoloipsCompanyTypeId): SoloipsLocaleKey {
  return SOLOIPS_COMPANY_TYPE_KEYS[type];
}

/**
 * 按公司状态取文案键。
 *
 * @param status - 契约里的公司状态。
 * @returns 该状态对应的字典键。
 */
export function soloipsCompanyStatusKey(status: SoloipsCompanyStatusId): SoloipsLocaleKey {
  return SOLOIPS_COMPANY_STATUS_KEYS[status];
}

/**
 * 按提交结果取**文案键与占位符实参**。
 *
 * 判定顺序（顺序即语义）：先按 `status` 取键，再按结果臂构造参数。参数**只**
 * 来自结构化字段（`resourceType`/`planCode`/`current`/`limit`），永不来自任何
 * 文本解析（`backend-i18n-design.md` §3 的 Q-3 结论）。
 *
 * 〔为什么需要 `lookup` 参数〕`refused` 文案的两个占位符（`{resource}`、
 * `{planCode}`）取值**本身**是字典条目（见 {@link SOLOIPS_QUOTA_RESOURCE_KEYS}
 * 与 {@link SOLOIPS_PLAN_CODE_KEYS}）——它们是「额度名」「计划名」的**稳定 id →
 * 文案**映射，不是可以直接上屏的机器值。若把**键**当作实参传下去，用户会看到
 * `soloips.company.limit.company` 这样的内部标识（**实测**：这正是本片首版的行为，
 * 被「配额拒绝必须显示额度名」用例检出）。
 *
 * 因此本函数接收一个 `lookup`（与 `ctx.locale.bind` 的 `t` 同签名）用于**解析
 * 嵌套键**。它**不**接收也不返回任何 core 文本——`lookup` 的入参只能是本模块
 * 声明的字典键。
 *
 * 〔为什么 `unknown` 要带 `{operationId}`〕它是用户在未决态唯一可执行动作
 * （「保留编号、勿换编号重做」）的载体——编号必须可见，否则「保留它」无从执行。
 *
 * @param outcome - `createCompany` 的业务结果（core 四态 ∪ 未就绪臂）。
 * @param operationId - 本次提交的操作编号（`unknown`/`unavailable` 的文案要用）。
 * @param lookup - 字典键 → 文本（解析嵌套键用；不得用于 core 文本）。
 * @returns 文案键与占位符实参；**永不**返回 core 的 `message`。
 */
export function soloipsCompanyOutcomeCopy(
  outcome: SoloipsWebCreateCompanyOutcome,
  operationId: string,
  lookup: (key: SoloipsLocaleKey) => string,
): { readonly key: SoloipsLocaleKey; readonly params: Readonly<Record<string, string>> } {
  const key = SOLOIPS_COMPANY_OUTCOME_KEYS[outcome.status];
  switch (outcome.status) {
    case "committed":
    case "replayed":
      return { key, params: {} };
    case "unknown":
      return { key, params: { operationId } };
    case "refused":
      return {
        key,
        params: {
          planCode: lookup(SOLOIPS_PLAN_CODE_KEYS[outcome.planCode]),
          resource: lookup(SOLOIPS_QUOTA_RESOURCE_KEYS[outcome.resourceType]),
          current: String(outcome.current),
          limit: String(outcome.limit),
        },
      };
    case "unavailable":
      return { key, params: { operationId } };
  }
}

/**
 * 本表的运行期投影（供测试双向断言与诊断面消费）。
 *
 * 〔与表的同步义务〕由各表派生（`Object.keys`），**不是**第二份词表；类型断言只
 * 把 `string` 收窄为对应联合，真正的「不漏不多」由测试对 `Record<联合, true>` 的
 * 双向比较承担。
 */
export function soloipsCompanyTypeIds(): readonly SoloipsCompanyTypeId[] {
  return Object.keys(SOLOIPS_COMPANY_TYPE_KEYS) as SoloipsCompanyTypeId[];
}

export function soloipsCompanyStatusIds(): readonly SoloipsCompanyStatusId[] {
  return Object.keys(SOLOIPS_COMPANY_STATUS_KEYS) as SoloipsCompanyStatusId[];
}

export function soloipsCompanyOutcomeStatusIds(): readonly SoloipsCompanyOutcomeStatusId[] {
  return Object.keys(SOLOIPS_COMPANY_OUTCOME_KEYS) as SoloipsCompanyOutcomeStatusId[];
}

export function soloipsQuotaResourceIds(): readonly string[] {
  return Object.keys(SOLOIPS_QUOTA_RESOURCE_KEYS);
}

export function soloipsPlanCodeIds(): readonly SoloipsPlanCode[] {
  return Object.keys(SOLOIPS_PLAN_CODE_KEYS) as SoloipsPlanCode[];
}
