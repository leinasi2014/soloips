/**
 * SOLOIPS-WEB-HOST-ENTRY
 *
 * `soloips-web` 的 Host 半边：把界面层需要的能力经 `@Remote` 暴露给浏览器。
 *
 * ── 本片的暴露面（`data-contract.md` §2.5.1 调用暴露矩阵；**冻结项**）──────
 *
 * | 方法 | 类别 | 注册为模型工具？ | 身份来源 |
 * |---|---|---|---|
 * | `createCompany` | 组织写（用户显式确认后触发） | **否**（裁定二） | 部署注入的 `accountId`（core 内） |
 * | `getCompany` / `getCompanyTree` / `listDepartments` / `listTeams` | 只读投影 | **否**（本包无工具注册面） | Host 会话 |
 * | `getStatus` | 通路探针（BE-0a 交付） | **否** | — |
 *
 * **不暴露**（矩阵明列）：`close()`、`reconcileTeams`、`requestWorkEntry`、
 * `initializeEmployeeMemory`、`verifyCapability`、`recordAssembly`，以及
 * `createDepartment`/`createEmployee`/`createAppointment`/`revokeAppointment`/
 * `saveEmployeeDocument`/team 四命令（后两组属 BE-6b 的暴露面，不在本片最小集内）。
 *
 * ── 裁定二的技术强制：组织写动作不注册为模型工具 ──────────────────────────
 *
 * 本包**没有**任何工具注册面：它不 import `soloips-adapter-dsh`（oxlint 窄口径
 * 禁令 + DEV-04），也不消费 `ctx.tools`。因此「模型经对话调用
 * `soloips_company_create` 建公司」在本包**不可表达**——不是靠菜单隐藏或 prompt
 * 约定，而是入口根本不存在。模型工具面（若有）属后续切片的独立注册路径，
 * 与本包的服务面**不相邻**。
 *
 * ── 裁定四：身份与拒绝的分层 ──────────────────────────────────────────────
 *
 * 1. **`accountId` 不由任何入参传入/覆盖**——本文件所有 Remote 入参类型都不含它
 *    （见 `./contracts.js` 的文件头说明）。类型层与网关运行期各有一道；
 * 2. **用户引导 Remote 不要求 agent 上下文**——本文件的方法**不**读取任何 agent
 *    凭证、**不**校验调用方身份。这是刻意的：M-A 的冷启动路径必须可用，
 *    若此处误加 agent 上下文要求，用户引导流程会死锁（裁定四原文）；
 * 3. **未注册的工具表现为工具不存在**——见上「裁定二的技术强制」。
 *
 * 〔本片**未**证明的部分〕「模型工具调用无 agent 凭证即 fail-closed」在本片
 * **没有可被正面演示的入口**：本包不注册工具，故该强制不在本片范围内。它的实现
 * 落点在 `packages/adapter-dsh/src/ports/tools.ts`（已有实现与测试），
 * 本片不重复实现、也不声称已验证。
 *
 * ── 依赖面（oxlint 窄口径 override 放行的三项，见 `.oxlintrc.json`）─────────
 *
 *  - `@deepseek-ai/cordis`：插件框架本身（公开注册接口与类型）；
 *  - `@deepseek-ai/dsh-typert-protocol`：`@Remote` 装饰器、`TypertRemoteService`
 *    基类与 `RemoteError`；
 *  - `soloips-core/contracts`：业务命令载荷类型与只读投影形状、服务名常量。
 *    **只消费 `contracts` 子路径**（非根入口），故不触达 core 的运行时实现
 *    （domain handle、`close()`、存储句柄都不在本包的可见面内）。
 *
 * 三条 Typert 严格分析约束（写实现时必须遵守，违反即构建失败）：
 *  1. Remote 方法必须是 **public、非 static、有具体实现**的实例方法，且**不得泛型**；
 *  2. 参数必须是**具名必填的简单标识符**——不得解构、不得默认值、不得 rest、
 *     不得可选；取消用末位 `signal: AbortSignal`；
 *  3. 参数与返回值的**具名类型**必须能从本包公开的非根子路径导出
 *     （本包用 `./contracts`），且必须是纯 JSON 类型。
 *
 * 一条**运行期**约束（分析器看不见，违反不会构建失败，只会在网关调用时炸）：
 *  **Remote 方法体内不得经 `this` 访问任何私有（`#`）成员**——网关经 cordis 的
 *  traceable Proxy 改绑 `this` 后调用，V8 的私有成员品牌检查不做 Proxy 透传。
 *  细节与判别证据见 {@link coreOf} 与 `tests/host-wiring.spec.ts` §8。
 */

import type { Context } from "@deepseek-ai/cordis";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { SOLOIPS_CORE_SERVICE_NAME } from "soloips-core/contracts";
import type {
  SoloipsCompanyRecord,
  SoloipsCoreErrorCode,
  SoloipsCoreService,
} from "soloips-core/contracts";

import type {
  SoloipsWebCompanyIdInput,
  SoloipsWebCompanyRead,
  SoloipsWebCompanyTreeInput,
  SoloipsWebCompanyTreeRead,
  SoloipsWebCompanyView,
  SoloipsWebCreateCompanyInput,
  SoloipsWebCreateCompanyOutcome,
  SoloipsWebDepartmentListInput,
  SoloipsWebDepartmentListRead,
  SoloipsWebStatus,
  SoloipsWebStatusInput,
  SoloipsWebTeamListInput,
  SoloipsWebTeamListRead,
  SoloipsWebUnavailable,
} from "./contracts.js";

export type {
  SoloipsWebCompanyIdInput,
  SoloipsWebCompanyRead,
  SoloipsWebCompanyTreeInput,
  SoloipsWebCompanyTreeRead,
  SoloipsWebCompanyView,
  SoloipsWebCreateCompanyInput,
  SoloipsWebCreateCompanyOutcome,
  SoloipsWebDepartmentListInput,
  SoloipsWebDepartmentListRead,
  SoloipsWebStatus,
  SoloipsWebStatusInput,
  SoloipsWebTeamListInput,
  SoloipsWebTeamListRead,
  SoloipsWebUnavailable,
  SoloipsWebUnavailableReason,
} from "./contracts.js";

/** Host 半边在 loader 树中的稳定服务键（装配/patch 行 id 与 `ctx.get` 的键）。 */
export const SOLOIPS_WEB_SERVICE_NAME = "soloipsWeb";

/**
 * 浏览器调用面的 **wire namespace**（`ctx.remote.<namespace>.<method>`，
 * HTTP 路径 `/api/<namespace>/<method>`）。
 *
 * 〔为什么显式覆盖默认值〕`TypertRemoteService` 的 namespace 缺省等于服务键
 * （协议侧原文：`Wire namespace; defaults to the Cordis service key`），而
 * `data-contract.md` §2.5 的调用面矩阵把浏览器面**逐行**写成
 * `ctx.remote.soloips.<method>`（§2.5.1 裁定二/裁定三的表格同此）。服务键与
 * wire namespace 是两件事：前者是装配标识（本包 patch 行 id、`ctx.get` 的键），
 * 后者是对外协议路径。二者刻意分开，使装配标识可以改名而不动已冻结的调用面。
 *
 * 〔约束〕**不得**用 `SOLOIPS_WEB_SERVICE_NAME` 顶替本常量：两者一旦合并，
 * 「改名服务键」就会静默改变浏览器调用面（契约冻结项），反之亦然。
 */
export const SOLOIPS_WEB_REMOTE_NAMESPACE = "soloips";

/**
 * 本切片的工具链标识：证明生成物来自 tsdown + Typert 生成管线。
 *
 * 〔BE-0b-ii〕版本必须与 `package.json` 的 generator 钉版一致：本值是
 * `getStatus` 的返回值之一，浏览器侧读到的就是它；写成旧版本会在「工具链
 * 自证」这一项上给出假事实。alpha.1 产出 `codec.schema`、alpha.2 产出
 * `codec.create`，而运行时（fork HEAD 的 dsh-typert-loader）只接受后者。
 */
export const SOLOIPS_WEB_TOOLCHAIN = "tsdown+typert-generator@0.1.6-alpha.2";

// ─────────────────────────────────────────────────────────────────────────────
// core 服务面：**派生**而非手抄
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 本包消费的 core 服务面——**从 `SoloipsCoreService` 派生**（`Pick`），不手抄签名。
 *
 * 〔为什么派生〕手抄一份「同形接口」会在 core 改签名时**静默继续编译**，只在运行时
 * 以错误的参数调用 core。派生把「core 契约变更」变成这里的编译错误。这与 core 对
 * 宿主 `Context` 的既有做法同向（`SoloipsCoreHostContext` 的注释记录了手抄导致
 * 签名漂移的两次实际事故）。
 *
 * 〔为什么只 Pick 这五个〕本片只接 M-A 最小集；`Pick` 使「本包能用哪些 core 能力」
 * 在类型层是一份**封闭清单**——想多用就得改这里，评审时可见。
 */
export type SoloipsWebCoreSurface = Pick<
  SoloipsCoreService,
  "createCompany" | "getCompany" | "getCompanyTree" | "listDepartments" | "listTeams"
>;

/**
 * 运行期校验的成员清单（与 {@link SoloipsWebCoreSurface} 的键集**必须一致**）。
 *
 * 〔为什么要运行期校验〕`ctx.get()` 返回 `unknown`/`any`：core 服务**存在**不等于
 * 它**符合本包消费的形状**（版本错配、别的包占了同名键）。不校验就调用会把
 * 「装配错误」表现为「`undefined is not a function`」这类无信息故障。
 * 本校验与 core 校验 adapter 端口的做法同形（`isSoloipsAdapter`）。
 *
 * 〔与 Pick 的一致性〕`satisfies readonly (keyof SoloipsCoreService)[]` 使拼错的
 * 名字编译失败；「清单 ⊇ Pick 的键集」由下面的类型断言钉住。
 */
const SOLOIPS_WEB_CORE_METHODS = [
  "createCompany",
  "getCompany",
  "getCompanyTree",
  "listDepartments",
  "listTeams",
] as const satisfies readonly (keyof SoloipsCoreService)[];

/** 编译期断言：运行期清单与 `Pick` 的键集**双向相等**（漏一个或改一个都失败）。 */
type Assert<T extends true> = T;
export type SoloipsWebCoreMethodListMatchesSurface = Assert<
  (typeof SOLOIPS_WEB_CORE_METHODS)[number] extends keyof SoloipsWebCoreSurface
    ? keyof SoloipsWebCoreSurface extends (typeof SOLOIPS_WEB_CORE_METHODS)[number]
      ? true
      : false
    : false
>;

/** 结构校验：清单里的每个成员都必须存在且是函数。 */
function isSoloipsWebCoreSurface(value: unknown): value is SoloipsWebCoreSurface {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return SOLOIPS_WEB_CORE_METHODS.every((method) => typeof candidate[method] === "function");
}

/**
 * 解析给定上下文中的 `soloipsCore` 服务（**模块级纯函数，不经 `this`**）。
 *
 * 〔为什么必须是模块级函数，而不是私有方法/私有字段〕网关经 cordis 的 traceable
 * Proxy 取接收者并调用：`prepareInvocation` 用
 * `receiverContext.get(descriptor.service)` 取回服务（`gateway/src/index.ts:602`），
 * `Reflect.get(receiver, method)`（`:615`）取方法，再
 * `Reflect.apply(method, receiver, args)`（`:309`）执行。该 Proxy 的 get trap 会把
 * 方法包成 `createShadowMethod`，调用时把 `this` 改绑到 `shadow`
 * （`@deepseek-ai/cordis` 的 `createShadow`/`createShadowMethod`，`lib/index.js:117-142`）。
 * **V8 的私有成员品牌检查不做 Proxy 透传**：`this.#x` 在 shadow 上必然抛
 * `TypeError: Receiver must be an instance of class SoloipsWebHost`（Node 24 实测），
 * 网关的 `rpcFailure`（`:1001`）再把它折叠成 `gateway/internal` 且**不暴露 cause**。
 * 故方法体内**不得**经 `this` 访问任何私有成员；解析逻辑放在模块级函数里，
 * 上下文由调用方显式传入。
 *
 * 〔为什么方法体内传 `this.ctx` 是安全的〕`ctx` 是 cordis 服务基类的**非私有**
 * 字段（`Service.ctx`，TS 侧 `protected`——运行期只是普通实例字段，无品牌检查）。
 * shadow 的 get trap 对普通实例字段**透传**（`createShadow` 把 `ctx` 覆写为调用者
 * 上下文，`lib/index.js:112-116`），且即便不覆写，`Reflect.get(target, "ctx", receiver)`
 * 对数据属性也忽略 receiver、返回原值。两条路都通（均已实测）。`getStatus` 不碰
 * 私有成员，所以它在旧实现下就是通的——那正是本缺陷的判别证据。
 *
 * 〔为什么每次调用都解析，而不是构造期取一次〕core 服务的发布是**异步**的
 * （`packages/core/src/index.ts` 在 `ctx.inject(['soloipsAdapter'], …)` 回调内
 * 打开存储后 `provide`）。构造期取一次会在「本行先于 core 完成」时永久拿到
 * `undefined`。每次解析的代价是一次属性查找。
 *
 * @param ctx - 调用方上下文；方法体内传 `this.ctx`（Proxy 下是 shadow 上下文，
 *   其 isolate 标签继承自同一根，故解析结果与直调一致）。
 * @returns 已就绪的 core 服务面；未发布或形状不符时 `undefined`。
 */
function coreOf(ctx: Context): SoloipsWebCoreSurface | undefined {
  const candidate = ctx.get(SOLOIPS_CORE_SERVICE_NAME);
  return isSoloipsWebCoreSurface(candidate) ? candidate : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// 失败翻译：core 的稳定码 → Remote 失败码
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 读取 core 错误的稳定码（**结构判别**，与 core 的 `soloipsAdapterErrorCodeOf` 同法）。
 *
 * 〔为什么不 `instanceof SoloipsCoreError`〕本包**不 import core 的运行时**
 * （只消费 `contracts` 子路径），故拿不到那个类；且跨包 `instanceof` 在重复安装时
 * 本就不成立。判据取「对象上有字符串 `code`」——与 core 自己的做法一致。
 */
function coreErrorCodeOf(error: unknown): SoloipsCoreErrorCode | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { readonly code: unknown }).code;
  return typeof code === "string" ? (code as SoloipsCoreErrorCode) : undefined;
}

/**
 * 把 core 的失败翻译成跨线的 `RemoteError`，**码逐字保留**。
 *
 * 〔为什么必须翻译，而不是让它冒泡〕网关对**未归类**的异常折叠为
 * `gateway/internal`（`rpcFailure`），core 的稳定码会就此丢失。而 core 的码正是
 * 界面 i18n 映射的输入（`packages/web/src/client/i18n/error-codes.ts` 以
 * `SoloipsCoreErrorCode` 为键），丢掉它等于让「参数无效」「账户不符」「只读态」
 * 在界面上退化成同一条通用错误。
 *
 * 〔码的完整性由编译器强制〕`RemoteError` 的 `code` 必须属于
 * `RemoteErrorDetailsMap`；本文件的声明（见 `./contracts.js`）覆盖了
 * `SoloipsCoreErrorCode` 的**全部**成员。因此 core 新增一个错误码而本包未声明时，
 * 这一行**编译失败**——不需要额外的漂移守卫。
 *
 * 〔`message` 的去向〕它随 `RemoteError.message` 过线（诊断用）。**不得上屏**：
 * 界面只按 `code` 取文案（`data-contract.md` §2.7 I18N-1）。
 *
 * @param error - core 调用抛出的任意值。
 * @throws {RemoteError} 当错误携带可识别的 core 稳定码。
 * @throws {unknown} 否则**原样重抛**——本函数不吞错，未归类失败仍由网关折叠为
 *   `gateway/internal`，其诊断文本得以保留。
 */
function rethrowCoreFailure(error: unknown): never {
  const code = coreErrorCodeOf(error);
  if (code === undefined) throw error;
  const message = error instanceof Error ? error.message : code;
  throw new RemoteError(code, message, {});
}

/** 未就绪态的唯一构造点（值相等，便于调用方按 `status` 判别）。 */
function coreUnavailable(): SoloipsWebUnavailable {
  return { status: "unavailable", reason: "core-unavailable" };
}

/**
 * core 公司记录 → 浏览器投影（去掉 `accountId`）。
 *
 * 〔为什么在这里剥离，而不是让界面忽略它〕见 `SoloipsWebCompanyView` 的注释：
 * 构建期产物门禁把 `"accountId"` 列为浏览器禁止标识（Typert 生成的 codec 会把
 * 字段名写进产物字节），且账户绑定对界面**不可行动**。剥离发生在**本包唯一的
 * 出口**上，因此不存在「某条读路径漏了剥离」的形态——`getCompany` 与
 * `getCompanyTree` 共用本函数。
 *
 * 〔为什么用显式字段列表而不是 `delete` 或解构剩余项〕解构剩余项（
 * `const { accountId: _drop, ...rest } = record`）在 `exactOptionalPropertyTypes`
 * 下会把可选字段（`parentCompanyId?`）的类型放宽为 `… | undefined`，与
 * `SoloipsWebCompanyView` 的 `Omit` 形状不再逐字一致。显式列表由**返回类型标注**
 * 兜住：漏一个字段即编译失败（多一个则被多余属性检查拦下）。
 */
function companyViewOf(record: SoloipsCompanyRecord): SoloipsWebCompanyView {
  return {
    id: record.id,
    ...(record.parentCompanyId === undefined ? {} : { parentCompanyId: record.parentCompanyId }),
    type: record.type,
    name: record.name,
    status: record.status,
    createdAt: record.createdAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 服务名模块增强（形状与 adapter/core 的既有做法一致）
// ─────────────────────────────────────────────────────────────────────────────

declare module "@deepseek-ai/cordis" {
  interface Context {
    /**
     * web 层 Host 半边发布的服务。
     *
     * 未装配（`enabled: false`）或本行未激活时该成员不可解析：
     * `ctx.get('soloipsWeb')` 返回 `undefined`，而 `ctx.soloipsWeb` 在依赖
     * 未满足时抛出——与 adapter/core 的 fail-closed 语义同形。
     */
    soloipsWeb: SoloipsWebHost;
  }
}

/**
 * Host 半边服务。
 *
 * 〔边界声明〕本类**不持有业务状态**（ARCH-D02：web 层零可写业务状态）；
 * 它只把 Host 侧的能力投影给浏览器。全部业务读写经 `soloipsCore` 服务，
 * 本类**不**缓存、**不**重算、**不**改写 core 的判定结果。
 *
 * 〔边界声明：不外泄的东西〕core 的服务对象**不整包暴露**：本类只 `Pick` 五个
 * 方法（见 {@link SoloipsWebCoreSurface}），`close()`、domain handle 与底层存储
 * 句柄都不在本类的可见面内（§2.5 边界 1）。
 *
 * 〔就绪策略：不 `inject`，按调用解析〕本类**不**声明 `ctx.inject(['soloipsCore'])`：
 * 那会让本行在 core 未就绪时保持 pending，连 `getStatus` 探针都不可用，且失败是
 * **静默**的（0.1.6 下未满足的 inject 只让行 pending，不报错——见
 * `cordis.patch.yml` 的既有说明）。改为每次调用时 `ctx.get()` 解析，未就绪时返回
 * `unavailable` 态（§2.5.1 裁定三：「不伪装空数据」）。
 *
 * 〔约束：方法体内**不得**经 `this` 访问任何私有（`#`）成员〕网关经 cordis 的
 * traceable Proxy 取接收者并 `Reflect.apply` 调用，Proxy 会把 `this` 改绑到 shadow，
 * 而 V8 的私有成员品牌检查不做 Proxy 透传 → 必然抛
 * `TypeError: Receiver must be an instance of class SoloipsWebHost`，再被网关折叠成
 * `gateway/internal`。解析逻辑因此放在模块级 {@link coreOf} 里，上下文由
 * `this.ctx`（**非私有**字段，Proxy 下透传）显式传入。回归判据见
 * `tests/host-wiring.spec.ts` §8（经 `ctx.get('soloipsWeb')` 与裸 `new Proxy(...)`
 * 两条路径真调用）。
 */
export class SoloipsWebHost extends TypertRemoteService {
  /**
   * 注册服务键并绑定 wire namespace。
   *
   * 〔约束〕两个字符串实参都必须是**字面量**，不能传常量标识符——Typert 分析器
   * 只从字面量读取它们，传常量即构建失败。两条报错均**已实测**：
   *  - 第二实参传 {@link SOLOIPS_WEB_SERVICE_NAME} →
   *    `Gateway service key must be a string literal`；
   *  - 第三个实参的 `namespace` 值传常量 → `Gateway namespace must be a string literal`
   *    （`bindTypertRemote() options must be an object literal` 同族约束）。
   * 因此这里逐字写 `"soloipsWeb"` / `"soloips"`，与两个导出常量的一致性由
   * `tests/package-contract.spec.ts` 的断言钉住（分析器读不到常量，故只能由测试承担）。
   */
  constructor(ctx: Context) {
    super(ctx, "soloipsWeb", { namespace: "soloips" });
  }

  // ── 组织写动作（裁定二：用户确认的可信 Remote；**不注册为模型工具**） ──────

  /**
   * 建公司（顶层用户公司 / 用户子公司）。
   *
   * 〔行为主体〕**用户**经界面显式确认后触发。本方法**不**校验调用方身份、
   * **不**要求 agent 上下文——这是 §2.5.1 裁定四的明确要求（否则 M-A 的用户
   * 确认路径冷启动即死锁）。身份的可信来源是部署注入：core 在写入时使用
   * `openSoloipsCompanyStore({ accountId })` 注入的账户，与本次调用参数无关。
   *
   * 〔入参**逐字段白名单**下传，不整包展开〕core 收到的是本方法**显式重建**的
   * 载荷，而不是调用方给的对象。理由：调用方在类型层之外仍可能构造出带额外键的
   * 对象（JS 调用方、`as` 断言、原型链注入）。整包下传会把「core 只接受声明过的
   * 字段」寄托在上游各层的过滤上；显式重建使这条性质在**本方法内**成立。
   *
   * 〔这条性质在真实 HTTP 路径上另有两层（互相独立）〕
   *  1. 网关的 `assertExactArguments` 拒绝描述符未声明的 `args` 字段
   *     （`gateway/arguments-invalid`）；
   *  2. 严格 codec 的 `parse` 按生成 schema 剥掉未声明字段（zod 对象默认剥离
   *     unknown keys，**已实测**）——因此即便 `args.input` 里塞了 `accountId`，
   *     到本方法的形参时它已不存在。
   * 本层的白名单是第三层，也是**唯一**在进程内直调时仍然成立的一层。
   *
   * 〔幂等纪律〕同 `operationId` 重放返回 `replayed`；存在未决意图时返回
   * `unknown`——调用方**不得换 ID 重做**（ORG-05），应停在核对状态。
   *
   * @param input - 与 core 的 `SoloipsCreateCompanyInput` **同一类型**（别名）。
   * @returns 提交三态 / 配额拒绝 / 未就绪，按 `status` 判别。
   * @throws {RemoteError} core 的稳定码（如 `SOLOIPS_CORE_VALIDATION` 参数非法、
   *   `SOLOIPS_CORE_PRECONDITION` 父公司规则不满足、`SOLOIPS_CORE_ACCOUNT_MISMATCH`）。
   */
  @Remote("createCompany")
  async createCompany(
    input: SoloipsWebCreateCompanyInput,
  ): Promise<SoloipsWebCreateCompanyOutcome> {
    const core = coreOf(this.ctx);
    if (core === undefined) return coreUnavailable();
    try {
      return await core.createCompany({
        operationId: input.operationId,
        name: input.name,
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.parentCompanyId === undefined ? {} : { parentCompanyId: input.parentCompanyId }),
      });
    } catch (error: unknown) {
      rethrowCoreFailure(error);
    }
  }

  // ── 只读投影（裁定三：M-A 最小必要集；**不产生 operation**） ───────────────

  /**
   * 读单个公司。
   *
   * 〔只读纪律〕不产生 `operation`、不写状态、无恢复副作用（core 的 `getCompany`
   * 即纯读；本方法只是投影）。
   *
   * 〔投影边界〕返回的 `company` **不含 `accountId`**——见 `SoloipsWebCompanyView`
   * 的注释（构建期门禁 + 最小必要披露）。
   *
   * @param input - `{ companyId }`。
   * @returns `ok` / `not-found` / `unavailable` 三态。
   * @throws {RemoteError} `SOLOIPS_CORE_VALIDATION`（id 形状非法）、
   *   `SOLOIPS_CORE_STORE_CLOSED`（core 已关闭）。
   */
  @Remote("getCompany")
  getCompany(input: SoloipsWebCompanyIdInput): SoloipsWebCompanyRead {
    const core = coreOf(this.ctx);
    if (core === undefined) return coreUnavailable();
    try {
      const company = core.getCompany(input.companyId);
      return company === undefined
        ? { status: "not-found" }
        : { status: "ok", company: companyViewOf(company) };
    } catch (error: unknown) {
      rethrowCoreFailure(error);
    }
  }

  /**
   * 读公司树（给定根及其全部下级）。
   *
   * 〔空数组的含义〕见 `SoloipsWebCompanyTreeRead` 的注释：它**不**区分「根不存在」
   * 与「根无下级」——那是 core 的既有语义，本包不改写。
   *
   * @param input - `{ companyId }`（树根）。
   * @returns `ok`（含 `companies`，可能为空）/ `unavailable`。
   * @throws {RemoteError} 同 {@link getCompany}。
   */
  @Remote("getCompanyTree")
  getCompanyTree(input: SoloipsWebCompanyTreeInput): SoloipsWebCompanyTreeRead {
    const core = coreOf(this.ctx);
    if (core === undefined) return coreUnavailable();
    try {
      return {
        status: "ok",
        companies: core.getCompanyTree(input.companyId).map((record) => companyViewOf(record)),
      };
    } catch (error: unknown) {
      rethrowCoreFailure(error);
    }
  }

  /**
   * 列部门（按公司）。
   *
   * @param input - `{ companyId }`。
   * @returns `ok`（含 `departments`，可能为空）/ `unavailable`。
   * @throws {RemoteError} 同 {@link getCompany}。
   */
  @Remote("listDepartments")
  listDepartments(input: SoloipsWebDepartmentListInput): SoloipsWebDepartmentListRead {
    const core = coreOf(this.ctx);
    if (core === undefined) return coreUnavailable();
    try {
      return { status: "ok", departments: core.listDepartments(input.companyId) };
    } catch (error: unknown) {
      rethrowCoreFailure(error);
    }
  }

  /**
   * 列团队（按公司，可选按部门过滤）。
   *
   * 〔选项面逐字透传 core〕`includeUnusable` 与 `departmentId` 的语义由 core 的
   * `listTeams` 定义（P-3/P-8.2/P-9.1 的可用性判据、与公司条件的**与**关系）；
   * 本方法不新增判据、不做二次过滤。
   *
   * 〔条件展开的理由〕`exactOptionalPropertyTypes` 下不能把 `undefined` 赋给
   * 可选键（那与「键缺失」是两回事），故按项目既有范式条件展开。
   *
   * @param input - `{ companyId, departmentId?, includeUnusable? }`。
   * @returns `ok`（含 `teams`，可能为空）/ `unavailable`。
   * @throws {RemoteError} 同 {@link getCompany}，另含
   *   `SOLOIPS_CORE_RECORD_INVALID`（任职作用域不可判定时 core **冒泡**，不跳过）。
   */
  @Remote("listTeams")
  listTeams(input: SoloipsWebTeamListInput): SoloipsWebTeamListRead {
    const core = coreOf(this.ctx);
    if (core === undefined) return coreUnavailable();
    try {
      return {
        status: "ok",
        teams: core.listTeams(input.companyId, {
          ...(input.includeUnusable === undefined
            ? {}
            : { includeUnusable: input.includeUnusable }),
          ...(input.departmentId === undefined ? {} : { departmentId: input.departmentId }),
        }),
      };
    } catch (error: unknown) {
      rethrowCoreFailure(error);
    }
  }

  // ── 通路探针（BE-0a 交付；保留用于通路自证） ───────────────────────────────

  /**
   * 通路探针：回显入参并返回本半边的工具链标识。
   *
   * @param input - 具名必填单对象（Typert 严格分析要求；不得改为解构或多参数）。
   * @returns 服务键、入参回显与工具链标识。
   */
  @Remote("getStatus")
  async getStatus(input: SoloipsWebStatusInput): Promise<SoloipsWebStatus> {
    return {
      service: this.name,
      echo: input.note,
      toolchain: SOLOIPS_WEB_TOOLCHAIN,
    };
  }
}

export default SoloipsWebHost;
