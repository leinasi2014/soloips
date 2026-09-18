/**
 * SOLOIPS-WEB-CONTRACTS
 *
 * `soloips-web` Host 半边的跨边界载荷契约（纯 JSON 类型，无运行时值）。
 *
 * 为什么单独成文件而不是放 `src/index.ts`：Typert 的严格分析要求 Remote 边界
 * 的具名类型必须能从**公开的非根子路径**导出（`analyzer.publicRemoteType`：
 * 根子路径 `"."` 只对白名单包开放）。生成的 `lib/typert.remote-client.d.ts` 因此
 * 会 `import type { … } from 'soloips-web/contracts'`，对应 `package.json` 的
 * `exports["./contracts"]`。
 *
 * 不变量：
 *  - 所有类型均为纯 JSON 值：不携带 domain handle、路径或凭据。
 *  - Remote 方法的参数必须是**具名必填单对象**且**显式标注类型**
 *    （Typert 严格分析：不得解构、不得默认值、不得可选、不得泛型方法）。
 *  - 边界类型要么在本文件声明，要么**引用 core 的公开契约**
 *    （`soloips-core/contracts`，非根子路径，满足 `publicRemoteType` 的归属要求）。
 *    后者是刻意的：命令载荷/结果与只读投影的形状**只有一个来源**，本包不复制
 *    第二份字段清单（复制会与 core 的 schema 静默漂移，且 core 改字段时本包
 *    不会编译失败）。本包只新增 **core 没有**的东西——浏览器面的「未就绪」态
 *    与只读包装（见下）。
 *
 * 〔BE-6a 的边界变更〕BE-0a 的文件头曾声明本文件「不 import `soloips-core`」；
 * 自本片起该声明被**取代**：BE-6 的业务面按 `docs/prds/system-assistant-backend-design-v0.1.md`
 * §3.2 第 4 条（「payload/result 是 core 契约里的纯 JSON 类型」）引用 core 契约。
 * 引用一律是 `import type`，编译后擦除，不产生浏览器侧模块边。
 *
 * ── 身份分层（`data-contract.md` §2.5.1 裁定四）────────────────────────────
 *
 * `accountId` **不在本文件的任何入参类型里**，这是本片身份分层的**类型层落点**：
 *  - 它来自部署注入（`SoloipsCoreConfig.accountId` → `openSoloipsCompanyStore`），
 *    由 core 在写入时使用（`store.ts` 的 `createCompany` 写 `this.#accountId`）；
 *  - 调用方**无法表达**「以某个 accountId 执行」——不是「传了被忽略」，而是该字段
 *    在边界类型上不存在；
 *  - 网关另有**运行期**加固：`assertExactArguments` 拒绝描述符未声明的多余字段
 *    （`gateway/arguments-invalid`），因此即便有人手工构造 `{ accountId: … }`，
 *    请求在**到达业务代码之前**即被拒。两条机制互相独立、缺一不可
 *    （类型层管本包自己的调用方，运行期管任意 HTTP 调用方）。
 */

import type { RemoteErrorDetailsMap } from "@deepseek-ai/dsh-typert-protocol";
import type {
  SoloipsCompanyId,
  SoloipsCompanyRecord,
  SoloipsCreateCompanyInput,
  SoloipsCreateCompanyOutcome,
  SoloipsCoreErrorCode,
  SoloipsDepartmentId,
  SoloipsDepartmentRecord,
  SoloipsTeamView,
} from "soloips-core/contracts";

// ─────────────────────────────────────────────────────────────────────────────
// §0 跨线失败词表（把 core 的稳定码声明进 Remote 失败面）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 把 core 的**全部**稳定错误码登记为合法的 Remote 失败码。
 *
 * 〔为什么必须登记〕`RemoteError` 的 `code` 受 `RemoteErrorDetailsMap` 约束；
 * 不登记就只能在跨线时折叠为 `gateway/internal`，core 的稳定码随之丢失——而它是
 * 界面 i18n 映射的**输入键**（`packages/web/src/client/i18n/error-codes.ts` 以
 * `SoloipsCoreErrorCode` 为键，`satisfies Record<SoloipsCoreErrorCode, …>`）。
 * 丢掉码等于让「参数无效」「账户不符」「只读态」在界面上退化成同一条通用错误。
 *
 * 〔为什么必须逐条抄，而不能用映射类型〕**实测**：`interface` 声明不接受映射类型
 * （`TS7061: A mapped type may not declare properties or methods`），故
 * `[Code in SoloipsCoreErrorCode]: …` 这种写法无法出现在模块增强里。
 * 逐条抄的漂移风险由下面的**编译期覆盖断言**兜住（core 加码而本处未声明 → 编译失败）。
 *
 * 〔为什么 details 是空对象〕core 的诊断信息是 `message`（中文、面向开发者/运维、
 * **不上屏**）；用户文案由 web 的 i18n 表按 `code` 映射，不消费任何 details 字段。
 * 声明一个用不上的结构化字段会诱导消费方依赖它。`Record<never, never>` 与协议
 * 自身 `'gateway/cancelled': {}` 的语义相同（「无结构化明细」），写法上避开裸 `{}`。
 *
 * 〔本声明的类型层位置〕它是**模块增强**（本文件有顶层 import，故已是模块）。
 * 增强只影响类型检查，不产生运行时。
 */
declare module "@deepseek-ai/dsh-typert-protocol" {
  interface RemoteErrorDetailsMap {
    SOLOIPS_CORE_CONFIG_INVALID: Record<never, never>;
    SOLOIPS_CORE_ADAPTER_INVALID: Record<never, never>;
    SOLOIPS_CORE_STORE_CLOSED: Record<never, never>;
    SOLOIPS_CORE_LEASE_NOT_HELD: Record<never, never>;
    SOLOIPS_CORE_LEASE_CHECK_FAILED: Record<never, never>;
    SOLOIPS_CORE_VALIDATION: Record<never, never>;
    SOLOIPS_CORE_PRECONDITION: Record<never, never>;
    SOLOIPS_CORE_CONFLICT: Record<never, never>;
    SOLOIPS_CORE_ACCOUNT_MISMATCH: Record<never, never>;
    SOLOIPS_CORE_RECORD_INVALID: Record<never, never>;
  }
}

/**
 * 编译期覆盖断言：`SoloipsCoreErrorCode` 的每个成员都必须已在上面的增强里声明。
 *
 * 〔为什么需要它〕上面是**逐条抄写**的（映射类型不可用，见其注释）。没有本断言时，
 * core 新增一个错误码会让本包**继续编译**，而新码在跨线时静默折叠为
 * `gateway/internal`——那正是本声明要消除的失效模式。有了它，core 加码即在此处
 * 编译失败，且错误信息直指本文件。
 *
 * 〔为什么断言方向是这一个〕需要的是「core 的码集 ⊆ 已声明的码集」。反向
 * （已声明的都在 core 里）由 `SoloipsCoreErrorCode` 本身是联合类型天然成立：
 * 声明一个不属于它的键不会编译失败，但那属于「多声明」，其代价是界面 i18n 表
 * 多一条不可达键（`i18n-assets.spec.ts` 的穷举断言会红）——由既有门禁覆盖。
 */
type Assert<T extends true> = T;
export type SoloipsWebDeclaresEveryCoreErrorCode = Assert<
  SoloipsCoreErrorCode extends keyof RemoteErrorDetailsMap ? true : false
>;

// ─────────────────────────────────────────────────────────────────────────────
// §1 就绪态（core 服务未发布时**必须显式表达**，不得伪装成空数据）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 业务面的**不可用原因**（机器可判定；界面按它映射文案，不解析任何文本）。
 *
 * 〔为什么是返回值而不是抛错〕`data-contract.md` §2.5.1 裁定三要求
 * 「服务未就绪 → 「未就绪」态，**不伪装空数据**」。让方法抛错会把「未就绪」变成
 * 一次**失败**，而它是**可预期的装配状态**（`soloipsCore` 行未激活、adapter
 * 未就绪、账户配置缺失都会导致服务不发布，且都是 fail-closed 的**正常**结果）。
 * 建模成返回值使调用方必须逐项处理它，且空列表**只能**表示「查询成功且确无数据」。
 *
 * 〔唯一取值〕当前只有一种：`soloipsCore` 服务在当前 Host 上下文中不可解析。
 * 将来若出现别的装配态（如「存储只读」），**新增取值**而不是复用本项——不同原因
 * 的可行动指引不同（改配置 / 重启 / 等装配完成）。
 */
export type SoloipsWebUnavailableReason = "core-unavailable";

/** 不可用态的形状（各方法复用；具名以免每个方法各写一遍同形对象）。 */
export interface SoloipsWebUnavailable {
  readonly status: "unavailable";
  readonly reason: SoloipsWebUnavailableReason;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 组织写动作（用户确认的可信 Remote；**不注册为模型工具**，裁定二）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `createCompany` 的入参：**逐字复用 core 的命令载荷**。
 *
 * 〔约束〕本类型**没有** `accountId`（见文件头「身份分层」）。core 的同名类型
 * 也刻意不含它（`SoloipsCreateCompanyInput` 的注释：「业务命令不得传入或覆盖」）。
 *
 * 〔为什么是类型别名而不是重新声明字段〕重声明会制造第二份字段清单：core 增删
 * 字段时本包不会编译失败，只会静默地少传/多传。别名使「core 契约变更」直接表现为
 * 本包的编译错误。
 */
export type SoloipsWebCreateCompanyInput = SoloipsCreateCompanyInput;

/**
 * `createCompany` 的结果：core 的提交三态 **或** 配额拒绝，**或** 未就绪。
 *
 * 〔前几臂逐字来自 core〕`SoloipsCreateCompanyOutcome` = 提交三态
 * （`committed`/`replayed`/`unknown`）∪ 配额拒绝（`refused`）。它们都是 core 已
 * 建模的**可判定正常结果**，本包**不翻译、不重编码**——翻译会让两处对「什么算
 * 拒绝」各持一份口径，而配额拒绝的 `current`/`limit` 是界面要显示的业务事实。
 *
 * 〔`unavailable` 臂是本包新增的〕它是 **Host 装配态**，core 不感知
 * （core 服务根本没被发布时，core 内部没有任何代码在运行）。故由本包在调用 core
 * **之前**判定并返回。
 *
 * 〔`unknown` 的处置纪律〕`unknown` 表示该 `operationId` 存在未决意图、结果不可知
 * ——调用方**不得换 ID 重做**（ORG-05），应停在核对状态并引导用同一 `operationId`
 * 重试。本包不替调用方做这个决定，只如实返回。
 */
export type SoloipsWebCreateCompanyOutcome = SoloipsCreateCompanyOutcome | SoloipsWebUnavailable;

// ─────────────────────────────────────────────────────────────────────────────
// §3 只读投影（M-A 最小必要集：公司状态与树、部门列表、团队列表；裁定三）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 单公司读取的入参。
 *
 * 〔为什么 `companyId` 用 core 的品牌 id 而不是普通 `string`〕品牌类型在边界上
 * 的**运行时表示就是字符串**（品牌是编译期 phantom），而它保留了「这是公司 id
 * 而不是任意字符串」的类型信息，使调用方不能把部门 id 传进来。形状校验仍归 core
 * （`store.ts` 的 `getCompany` 以 `isCompanyId` 校验，非法即抛
 * `SOLOIPS_CORE_VALIDATION`）——本包**不**复制前缀规则（那会成为 `ids.ts` 之外
 * 的第二处真源）。
 */
export interface SoloipsWebCompanyIdInput {
  readonly companyId: SoloipsCompanyId;
}

/**
 * 浏览器面的**公司投影**：core 的公司记录**去掉 `accountId`**。
 *
 * 〔权威依据：`data-contract.md` §2.5.1 **裁定四.1**「只读投影不得携带 `accountId`」〕
 * 该裁定由指挥在本片落地时新增（2026-09-18），三条依据逐条对应本实现的取舍：
 *
 * 1. **它是裁定四第一行的直接推论**：裁定四写死 `accountId`「**不由任何 UI 或
 *    模型参数传入/覆盖**——来自部署注入 + 根级绑定元数据（§3.1）」。若同时把该值
 *    **发给**浏览器，界面就有机会写出「按 `accountId` 判断」的界面侧授权；而
 *    **不暴露强于「暴露但约定不要用」**（后者正是外审反复点名的
 *    「菜单隐藏、prompt 约定不能替代入口拒绝」）；
 * 2. **账户绑定是部署层事实**（§3.1：一个数据根只绑一个账户），界面无法对它采取
 *    任何有意义的行动——账户不符是**打开期 fail-closed 的既成结果**（服务根本不
 *    发布），不是界面可处理的状态。把绑定标识发给浏览器只增加披露面、不增加能力；
 * 3. **本仓已有技术强制**：`tsdown.config.ts` 的 `client-artifact-contract` 把
 *    `"accountId"` 列入浏览器产物**禁止标识**（判据为产物字节子串匹配），而 Typert
 *    为边界类型生成的 zod codec 会把**字段名**写成字符串字面量
 *    （`'accountId': z.string()…`），故原样透传会使本包构建失败
 *    （已实测：`含服务端实现/凭据标识 "accountId"`）。裁定明写**不得**为通过而放宽
 *    该清单，正确处置是**在边界投影上剥离**——本实现据此处置；该门与
 *    `tsdown.config.ts` 都不在本片写面内，本片未修改它们。
 *
 * 〔实现约束（裁定四.1 明列）〕剥离须在**唯一出口**完成且两条读路径共用：
 * 本包用 `companyViewOf()`（`src/index.ts`），`getCompany` 与 `getCompanyTree`
 * 都经它，避免多处各自剥离产生漂移。
 *
 * 〔为什么用 `Omit` 派生而不是重写一份字段清单〕重写会制造第二份真源：core 增删
 * 字段时本包不会编译失败，只会静默地少传/多传（与本文件头「不复制第二份字段
 * 清单」的纪律同向）。`Omit` 让 core 的字段变更**自动流过**本投影，而本片刻意
 * 排除的 `accountId` 是**唯一**被显式移除的字段——移除项写在这里，评审可见。
 *
 * 〔与 core 记录的关系〕这是**投影**，不是新实体：其余字段（`id`/`parentCompanyId`/
 * `type`/`name`/`status`/`createdAt`）逐字来自 `SoloipsCompanyRecord`，本包不改写
 * 任何一个的语义。
 *
 * 〔断言落点（裁定四.1 要求）〕`tests/host-wiring.spec.ts` 断言投影的 `accountId`
 * **键不存在**（`Object.hasOwn`，而非「值为 `undefined`」——后者会让
 * `{...record, accountId: undefined}` 这种形态通过）且其余字段逐字保留（防剥多）。
 *
 * 〔影响面（裁定四.1 明列）〕后续所有面向浏览器的只读投影（FE-2/FE-3 与 BE-6b 的
 * 查询面）同受本条约束——本片只落了公司投影，其余面由各自切片遵守。
 */
export type SoloipsWebCompanyView = Omit<SoloipsCompanyRecord, "accountId">;

/**
 * 单公司读取的结果。
 *
 * 〔为什么不是 `Company | undefined`〕线上没有 `undefined`（JSON 无该值）；更重要的
 * 是「公司不存在」与「服务未就绪」是**两件事**：前者是查询成功但无此记录，后者是
 * 压根没能查询。合并它们正是 §2.5.1 裁定三禁止的「伪装」形态。
 */
export type SoloipsWebCompanyRead =
  | { readonly status: "ok"; readonly company: SoloipsWebCompanyView }
  | { readonly status: "not-found" }
  | SoloipsWebUnavailable;

/** 公司树读取的入参（树根）。 */
export interface SoloipsWebCompanyTreeInput {
  readonly companyId: SoloipsCompanyId;
}

/**
 * 公司树读取的结果（各项为 {@link SoloipsWebCompanyView}，同样不含 `accountId`）。
 *
 * 〔空数组的含义〕`status: 'ok'` 且 `companies` 为空**只**表示「查询成功但无结果」
 * 这一 core 语义（`getCompanyTree` 对不存在的根也返回 `[]`，见 `store.ts` 该方法的
 * `if (!idMap.has(companyId)) return []`）。因此调用方若要区分「根不存在」，须先用
 * {@link SoloipsWebCompanyRead} 读根。本包**不**替 core 改写这个语义（改写会成为
 * 第二份「什么算存在」的口径）。
 */
export type SoloipsWebCompanyTreeRead =
  | { readonly status: "ok"; readonly companies: readonly SoloipsWebCompanyView[] }
  | SoloipsWebUnavailable;

/** 部门列表读取的入参。 */
export interface SoloipsWebDepartmentListInput {
  readonly companyId: SoloipsCompanyId;
}

/** 部门列表读取的结果（空数组 = 该公司确无部门）。 */
export type SoloipsWebDepartmentListRead =
  | { readonly status: "ok"; readonly departments: readonly SoloipsDepartmentRecord[] }
  | SoloipsWebUnavailable;

/**
 * 团队列表读取的入参。
 *
 * 〔`includeUnusable` 的语义逐字来自 core〕缺省只返回**可用**团队
 * （`status='active'` 且组长引用满足 P-4）；`true` 时返回全部并逐项带
 * `usable`/`leadReference`。管理/诊断视图需要后者（P-8.5「读面不得静默降级」），
 * 故本片把该键一并暴露——**不新增判据**，只是把 core 已有的选项面透传。
 */
export interface SoloipsWebTeamListInput {
  readonly companyId: SoloipsCompanyId;
  /** 部门过滤；缺省即不过滤（core 的 `listTeams` 同语义）。 */
  readonly departmentId?: SoloipsDepartmentId;
  readonly includeUnusable?: boolean;
}

/**
 * 团队列表读取的结果。
 *
 * 〔`SoloipsTeamView.leadReference.message` 的处置〕该字段是 core 的中文诊断
 * （面向开发者/运维）。它随本类型**原样过线**，但界面**不得上屏**：用户文案由
 * `packages/web/src/client/i18n/` 按 `leadReference.reason` 映射
 * （`data-contract.md` §2.7 的 I18N-1/I18N-2）。本包**不**在此处剥离它——剥离会
 * 产生一份与 core 形状不同的投影，使「读面形状」出现第二个真源。
 */
export type SoloipsWebTeamListRead =
  { readonly status: "ok"; readonly teams: readonly SoloipsTeamView[] } | SoloipsWebUnavailable;

// ─────────────────────────────────────────────────────────────────────────────
// §4 探针（BE-0a 交付；保留用于通路自证）
// ─────────────────────────────────────────────────────────────────────────────

/** `getStatus` 的入参：一个具名必填对象（Typert 严格分析要求）。 */
export interface SoloipsWebStatusInput {
  /** 调用方备注，原样回显；用于在 BE-0b 的浏览器侧确认往返载荷未被改写。 */
  readonly note: string;
}

/**
 * `getStatus` 的结果。
 *
 * 〔边界声明〕它是**通路探针**，返回 Host 半边自身的构建信息；三个字段都**不**
 * 代表任何公司/部门/员工数据可读。「业务面是否就绪」由各业务方法的返回值表达
 * （按 `status` 判别），本探针**不**承载该判断——在这里加一个「就绪布尔」会让
 * 「未就绪」出现第二个真源，且它无法表达「哪一个方法可用」。
 */
export interface SoloipsWebStatus {
  /** Host 半边的**服务键**（`soloipsWeb`；wire namespace 是 `soloips`，两者不同形）。 */
  readonly service: string;
  /** 入参回显，证明载荷往返未被改写。 */
  readonly echo: string;
  /** 本切片固定的工具链标识。 */
  readonly toolchain: string;
}
