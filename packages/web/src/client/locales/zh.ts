/**
 * SOLOIPS-WEB-I18N-ZH
 *
 * `soloips` 命名空间的**中文字典**，同时是**键集真源**（Chinese-first 惯例，
 * 依据 `docs/design/backend-i18n-design.md` §6「字典位置」与 DSH fork
 * `packages/client/locale/src/locales/zh.ts` 的既有范式）。
 *
 * 依据与契约：
 *  - `SOLO-I18N-01` §1 T5：用户可见文案**必须本地化**，且**只**由本目录
 *    （`locales/`）持有译文——本目录是唯一允许含译文的源文件（底册 §5.5）。
 *  - `SOLO-I18N-01` §2/§4 + `data-contract.md` §2.7 I18N-1/I18N-2：core 的
 *    `message` 是诊断（中文、不本地化、**不得上屏**）；界面文案一律从**稳定 id**
 *    （错误码、`item`/`reason` 枚举）经映射表查得。本字典**不含**任何 core 的
 *    `message` 原文，也**不得**被当作匹配依据（底册 C8）。
 *  - 键名格式：`soloips.<域>.<…>`，点分层级（PRD
 *    `system-assistant-ui-design-v0.1.md` §3.4.2 的键名规范）。错误码键逐字采用
 *    设计 §3 骨架表；`gaps` 键逐字采用设计 §4 的示例形态
 *    （`soloips.onboarding.gap.<item>.<reason>`，reason 段用驼峰，
 *    如 `soloips.onboarding.gap.profile.documentMissing`）。
 *
 * 两条本文件承载的**约定**（不变量，改动即契约变更）：
 *
 *  1. **键带 `soloips.` 前缀，命名空间也叫 `soloips`**——这是刻意的冗余：
 *     设计文档与 PRD 给出的键名**本身就是**全限定形（`soloips.error.configInvalid`、
 *     键位 `soloips.onboarding.gap.<item>.<reason>`），映射表的值因此与字典键
 *     逐字相等，测试可以对「映射表引用的每个键都在字典里」做机械断言；
 *     若在此处剥掉前缀，映射表就得做一次拼接，那层断言随之退化为拼写约定。
 *
 *  2. **通用词复用 DSH `common` 命名空间，本命名空间只放业务专有词**（设计 §6
 *    「`common` 复用」、底册 §5.3）。`ok`/`cancel`/`close`/`save`/`search`/
 *    `loading`/`submit`/`retry`… **一律不在此定义**：fork 的 locale 查找链是
 *    「请求的命名空间 → `common` → 显示 key 本身」，复制一份 `common` 的副本
 *    会在升级上游词表时制造第二份真源。测试以「全键必须带 `soloips.` 前缀」的
 *    纪律断言这一点（`common` 的键是无前缀的裸词，复制过来即失败）。
 *
 * 不变量：`en`（同目录 `en.ts`）的键集与本文件**逐键相等**——由
 * `satisfies Record<SoloipsLocaleKey, string>` 在编译期强制，并由测试做运行期
 * 双向断言（设计 §7 V1）。缺一个英文键即编译失败。
 */

export const zh = {
  // ── 错误码文案（映射表见 ../i18n/error-codes.ts；10 个 core 码全覆盖） ──────

  /** 未知/未来版本的错误码回退：`{code}` 是原码，作为**可复制诊断**（设计 §3）。 */
  "soloips.error.unknown": "发生未识别的错误（{code}），请复制诊断信息后重试。",
  /** 部署配置错误——面向管理员（`SOLOIPS_CORE_CONFIG_INVALID`）。 */
  "soloips.error.configInvalid": "部署配置无效，服务未启动。请联系管理员检查配置。",
  /** adapter 端口结构不符（`SOLOIPS_CORE_ADAPTER_INVALID`）。 */
  "soloips.error.adapterInvalid": "运行环境接口不符合约定，服务未启动。请联系管理员。",
  /** 只读态（`SOLOIPS_CORE_STORE_CLOSED`）。 */
  "soloips.error.storeClosed": "数据存储已关闭，当前为只读状态，无法执行该操作。",
  /** 写权失守（`SOLOIPS_CORE_LEASE_NOT_HELD`）——**不自动重试**（项目红线）。 */
  "soloips.error.leaseLost":
    "写入权已失效，本次操作未执行。请勿自动重试，先确认是否有其他进程正在写入。",
  /** 写权状态未知（`SOLOIPS_CORE_LEASE_CHECK_FAILED`）。 */
  "soloips.error.leaseUnknown": "无法确认写入权状态，本次操作未执行。请确认后再试。",
  /** 输入校验失败（`SOLOIPS_CORE_VALIDATION`）。 */
  "soloips.error.validation": "输入内容不符合要求，请检查后重试。",
  /** 状态不允许（`SOLOIPS_CORE_PRECONDITION`）。 */
  "soloips.error.precondition": "当前状态不允许该操作（目标可能不存在或已撤销），请刷新后确认。",
  /** operationId 复用冲突（`SOLOIPS_CORE_CONFLICT`）。 */
  "soloips.error.conflict": "同一操作编号已被其他操作使用，本次操作未执行。",
  /** 账户绑定不符（`SOLOIPS_CORE_ACCOUNT_MISMATCH`）。 */
  "soloips.error.accountMismatch": "账户绑定不符，已拒绝访问该数据根。请联系管理员核对部署账户。",
  /** 介质数据损坏（`SOLOIPS_CORE_RECORD_INVALID`）。 */
  "soloips.error.recordInvalid":
    "存储的数据不符合约定结构（疑似数据损坏），请复制诊断信息以便排查。",
  /**
   * adapter 侧码（`SOLOIPS_ADAPTER_*`）的通用回退：`{code}` 是原码。
   *
   * 〔为什么只有一个通用键而不是逐码键〕adapter 的码联合（`SoloipsAdapterErrorCode`）
   * 只从 `soloips-adapter-dsh/contracts` 导出，而 web 包**不得** import adapter
   * （DEV-04 的依赖面禁令），故逐码表无法在类型层强制、只能手抄——那会制造第二份
   * 真源。本键按**前缀**归一，保证 adapter 失败不落到空白或 core 中文诊断上。
   * 〔待决〕若 adapter 面需要逐码文案（设计 §3 表的 `soloips.error.adapter.<域>`），
   * 须由 adapter 面切片先提供可被 web 消费的码投影。
   */
  "soloips.error.adapter.generic": "运行环境接口调用失败（{code}），请复制诊断信息以便排查。",
  /** 「复制诊断信息」入口（设计 §4：`message` 的用途是日志与报障）。 */
  "soloips.error.diagnosticCopy": "复制诊断信息",

  // ── 入职缺项文案（映射表见 ../i18n/onboarding-gaps.ts；键位 = 设计 §4） ─────

  /**
   * 未定义组合的通用回退：`{reason}` 是机器可判定的原因 id，作为**可复制诊断**
   * （设计 §4「回退」行）——**不得**显示 core 的 `message`。
   */
  "soloips.onboarding.gap.generic": "入职项未满足（{reason}），请复制诊断信息以便排查。",

  /** `employee` × `employee-not-found`（`evaluateOnboarding` 的早返回分支）。 */
  "soloips.onboarding.gap.employee.employeeNotFound":
    "找不到该员工的记录，请确认员工是否存在或编号是否有误。",
  /** `appointment` × `appointment-missing`（尚无任何任职）。 */
  "soloips.onboarding.gap.appointment.appointmentMissing": "该员工尚无任职记录，请先为其创建任职。",
  /** `appointment` × `appointment-revoked`（任职全部已撤销）。 */
  "soloips.onboarding.gap.appointment.appointmentRevoked":
    "该员工的任职已全部撤销，请重新为其创建任职。",

  // 四类必需文档（item 段即文档类型，文案自带文档名——键携带的信息 = 文案可区分的维度）。

  /** `profile` × `document-missing`（无当前版本，或当前引用读不到版本记录）。 */
  "soloips.onboarding.gap.profile.documentMissing":
    "缺少「公开资料」的已保存当前版本，请先保存公开资料。",
  /** `profile` × `document-content-invalid`（空白内容或摘要不符）。 */
  "soloips.onboarding.gap.profile.documentContentInvalid":
    "「公开资料」的内容无效或与保存时不一致，请重新保存。",
  /** `profile` × `document-owner-mismatch`（当前版本属主不是本人）。 */
  "soloips.onboarding.gap.profile.documentOwnerMismatch":
    "「公开资料」当前版本的属主不是该员工，请重新保存。",

  /** `avatar` × `document-missing`。 */
  "soloips.onboarding.gap.avatar.documentMissing": "缺少「头像」的已保存当前版本，请先保存头像。",
  /** `avatar` × `document-content-invalid`。 */
  "soloips.onboarding.gap.avatar.documentContentInvalid":
    "「头像」的内容无效或与保存时不一致，请重新保存。",
  /** `avatar` × `document-owner-mismatch`。 */
  "soloips.onboarding.gap.avatar.documentOwnerMismatch":
    "「头像」当前版本的属主不是该员工，请重新保存。",

  /** `soul` × `document-missing`。 */
  "soloips.onboarding.gap.soul.documentMissing":
    "缺少「SOUL 性格文档」的已保存当前版本，请先保存该文档。",
  /** `soul` × `document-content-invalid`。 */
  "soloips.onboarding.gap.soul.documentContentInvalid":
    "「SOUL 性格文档」的内容无效或与保存时不一致，请重新保存。",
  /** `soul` × `document-owner-mismatch`。 */
  "soloips.onboarding.gap.soul.documentOwnerMismatch":
    "「SOUL 性格文档」当前版本的属主不是该员工，请重新保存。",

  /** `operating` × `document-missing`。 */
  "soloips.onboarding.gap.operating.documentMissing":
    "缺少「OPERATING 操作规范」的已保存当前版本，请先保存该文档。",
  /** `operating` × `document-content-invalid`。 */
  "soloips.onboarding.gap.operating.documentContentInvalid":
    "「OPERATING 操作规范」的内容无效或与保存时不一致，请重新保存。",
  /** `operating` × `document-owner-mismatch`。 */
  "soloips.onboarding.gap.operating.documentOwnerMismatch":
    "「OPERATING 操作规范」当前版本的属主不是该员工，请重新保存。",

  /** `memory` × `memory-not-initialized`。 */
  "soloips.onboarding.gap.memory.memoryNotInitialized": "该员工的记忆尚未初始化，请先初始化记忆。",
  /** `capability` × `capability-not-verified`：`{capability}` 是能力名（用户可读）。 */
  "soloips.onboarding.gap.capability.capabilityNotVerified":
    "岗位必需能力「{capability}」尚未通过验证，请先完成验证。",

  /**
   * `assembly` × 两个缺因。
   *
   * 〔为什么文案不带文档名〕键的 `<item>` 段是 `assembly`（不带文档维度），而
   * 「键携带的信息 = 文案可区分的维度」：文档名只在 `documentType` 参数里，
   * 若要在文案里显示就得按参数动态拼键（丢类型检查）。故此处用「必需文档」的
   * 泛指措辞，精确的 `documentType` 走 `params` 供报障入口使用。
   */
  "soloips.onboarding.gap.assembly.assemblyEvidenceMissing":
    "缺少必需文档的实际装配证据，请先完成装配。",
  /** `assembly` × `assembly-evidence-stale`（证据指向旧版本）。 */
  "soloips.onboarding.gap.assembly.assemblyEvidenceStale":
    "必需文档的装配证据指向旧版本，当前版本尚未被实际装配，请重新装配。",

  // ── 工作准入拒绝文案（设计 §4 末段「同类项」：core 生成、可能上屏的枚举） ────

  /** `onboarding-not-ready`：拒绝原因是入职缺项（缺项本身由上面的 gaps 映射渲染）。 */
  "soloips.work.entry.refused.onboardingNotReady":
    "入职项尚未满足，暂不能领取工作。请先补齐入职项。",
  /** `employee-operation-unknown`：该员工存在结果未知的操作（ORG-05：不换 ID 重做）。 */
  "soloips.work.entry.refused.employeeOperationUnknown":
    "该员工存在结果未知的操作，暂不能开始新工作。请先核对未决操作，不要更换编号重做。",
} satisfies Record<string, string>;

/**
 * `soloips` 命名空间的键联合（键集真源 = 上面的 `zh`）。
 *
 * `en` 按本类型检查完备性：**多一个键或少一个键都是编译错误**。
 */
export type SoloipsLocaleKey = keyof typeof zh;
