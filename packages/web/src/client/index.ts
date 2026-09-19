/**
 * SOLOIPS-WEB-CLIENT-ENTRY
 *
 * `soloips-web` 的**浏览器半边**：把 Host 半边生成的 Remote 贡献挂到页面内的
 * `ctx.remote` 上，使 `ctx.remote.soloipsWeb.getStatus(...)` 在浏览器里可调用。
 *
 * ── 为什么必须由本包自己挂载（BE-0b-i 装配事实）────────────────────────────
 * 官方 Client 装配包 `@deepseek-ai/dsh-api-remotes` 的 `apply()` 是一份
 * **硬编码导入清单**（`packages/api/remotes/src/client/index.ts` 的 for-of，
 * 17 项 `ctx.remote.$mount(...)`），它既不认识也无法容纳本包。因此
 * 「增加一个 Host Remote 包是 Client 组合所有者的显式选择」在本仓的落点
 * 就是**自挂载**：浏览器半边以运行时值导入本包生成的 `/remote` 贡献。
 *
 * ── 依赖面（`.oxlintrc.json` 的 web override 窄口径）──────────────────────
 * 本文件只用到三项，且都在放行面内：
 *  - `@deepseek-ai/cordis`：`Context` 类型（`import type`，编译后擦除）；
 *  - `@deepseek-ai/dsh-typert-protocol`：`TypertRemoteContribution` 类型（同上）；
 *  - `soloips-web/remote`：**包自我引用**（Node 的 self-reference 语义），
 *    取生成物 `lib/typert.remote-client.js` 的 `TYPERT_REMOTE`。
 *
 * ── 不变量 ────────────────────────────────────────────────────────────────
 *  - 不得值导入其他 `@deepseek-ai/*` 能力包或其他 `soloips-*` 包：浏览器半边
 *    的跨插件协作一律经 cordis 服务（DEV-04，与 DSH 的 client bundle purity
 *    gate 同向）。`import type` 被擦除，不产生模块边。
 *  - 不得触达 Host 实现（`src/index.ts` 的服务类）、存储或凭据：那些只活在
 *    Node 半边（验收条款 5：不打入浏览器产物）。
 *  - **不得声明 `declare module "@deepseek-ai/cordis"` 的 Context 增强**：
 *    Typert 生成器把「本包内声明的、出现在 `Context` 增强里的具名类型」读作
 *    **本包贡献的服务**（`collectServices` 要求类型与增强成员同属一个包）。
 *    `remote` 的提供者是官方 `api-gateway/client`，我们只是消费者；写成增强
 *    会让生成器在 client face 上生出一条并不存在的服务面，并进而要求
 *    `exports["./client/typert"]` 与 `lib/typert.client.*` 产物（实测：
 *    `typert(client): soloips-web must export ./client/typert as …`）。
 *    消费方在无提供者声明可导入时（DEV-04 禁止依赖官方能力包）用下面的
 *    局部结构类型 + 显式读取，而不是重新声明服务。
 *  - `apply` 必须是 **`async function` 声明**，并把组合 disposer 交回 cordis。
 *    两条都是硬约束，且第一条不是风格偏好——它是 cordis 的**形态判据**：
 *
 *    ```js
 *    // @deepseek-ai/cordis@4.0.2 的 lib/index.js:1066-1070（Fiber 的 runner.execute）
 *    if (isConstructor(runtime.callback)) {
 *      const instance = new runtime.callback(this.ctx, this.config);
 *      for (const hook of instance?.[symbols.initHooks] ?? []) hook();
 *      return instance?.[symbols.init]?.();
 *    } else return runtime.callback(this.ctx, this.config);
 *    ```
 *
 *    而 `isConstructor` 的判据就是「`func.prototype` 存在」（同文件 `:57-62`）。
 *    **函数声明有 `prototype`**，故 `export function apply(...)` 会走 `new` 分支：
 *    `apply` 返回的 Promise 不是 `new` 的求值结果，被**整条丢弃**，cordis 收不到
 *    任何卸载钩子（副作用照常发生，所以启动看起来完全正常、卸载静默失效）。
 *    `async function` 声明**没有** `prototype`，走 else 分支，返回的 Promise 被
 *    `Fiber._execute` 以 `then` 收下（同文件 `:1144`），resolve 值即被登记为
 *    卸载钩子。官方同形先例：`packages/api/remotes/src/client/index.ts:156` 的
 *    `export async function apply(...): Promise<() => Promise<void>>`。
 *
 *    〔同一形态还决定启动失败的**可见性**（实测）〕`$mount` 拒绝时，`async` 形态
 *    让 `await fiber` 拒绝、fiber 落到 FAILED；被丢弃的 Promise 形态则让 fiber 停在
 *    ACTIVE，失败只以 unhandled rejection 呈现——**fail-open**。
 *
 *    两条后果都有回归用例（`tests/artifacts/artifact-behavior.artifact.ts` 的
 *    「hands apply's disposer to cordis」与「surfaces a $mount failure to the
 *    framework」），判据由**真 cordis** 驱动、全程不触碰 `apply` 的返回值。
 */

import type { Context } from "@deepseek-ai/cordis";
import type { TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";

import { TYPERT_REMOTE } from "soloips-web/remote";

import { registerSoloipsCompanyPanel } from "./company/register.js";

/**
 * 浏览器侧 Remote 挂载面的**最小**结构声明。
 *
 * 〔约束〕官方 provider 是 `@deepseek-ai/dsh-api-gateway/client`，它不在本包
 * 依赖面内（DEV-04：非 adapter 包不得依赖官方能力包），因此这里只声明本包
 * **实际使用**的成员，不复制官方签名。`$mount` 的返回类型取自 DSH
 * `packages/api/gateway/src/client/index.ts` 的 `$mount`（返回 `TypertDisposer`）。
 * 官方签名若变化，本声明会在类型层立即失配（少声明不会静默错），而不是靠
 * 手抄一份会漂移的副本。
 */
export interface SoloipsWebClientRemote {
  /**
   * 挂载一份生成的 Remote 贡献，返回卸载函数。
   *
   * @param contribution - Host 半边经 Typert 生成管线产出的贡献（含严格 codec）。
   * @returns 卸载该贡献并移除其 namespace 的 disposer。
   */
  $mount(contribution: TypertRemoteContribution): Promise<() => Promise<void>>;
}

/**
 * 本插件在浏览器内需要的 cordis 服务键。
 *
 * 〔约束〕`inject` 声明为 `string[]` 而非 `keyof Context` 收窄：`remote`、`slots`
 * 与 `locale` 都由官方包提供，其声明合并不在本包依赖面内（DEV-04），写成键字面量
 * 会在缺少合并时报错。代价是失去「服务键存在性」的编译期校验，故由运行时读取兜底
 * （见 {@link remoteOf} 与 `./company/register.js` 的 `servicesOf`）。
 * `@deepseek-ai/dsh-client-connection` 的 client 半边同样用 `string[]` 形态声明
 * inject。
 *
 * 〔FE-1a 新增 `slots` 与 `locale`〕公司面板要注册进官方槽位（槽位服务）并按字典
 * 渲染文案（字典服务）。两者都是**官方提供的服务**，本包只消费——`slots` 的提供者
 * 是 `dsh-client-ui-renderer`（其 `Context` 增强声明 `slots: SlotRegistry`），
 * `locale` 的提供者是 `dsh-client-locale`。声明它们使「本插件在两者就绪前不激活」
 * 成为 cordis 的机械保证，而不是靠加载顺序。
 *
 * 〔FE-1a 新增 `remote.soloips`（**点分服务键**）〕这是本片最重要的一条接线事实，
 * 由实测纠正：`$mount(TYPERT_REMOTE)` 把本包的 namespace 装成 **`remote.soloips`**
 * 服务（`api-gateway/client` 的 `remoteServiceKey(namespace)` 返回
 * `` `remote.${namespace}` ``），而 cordis 的 `Context` get trap 对**未声明的
 * 服务键**直接抛 `cannot get property "remote.soloips" without inject`
 * （`@deepseek-ai/cordis/lib/index.js:675-705`）。**实测**：不声明它时面板的提交
 * 走不到网络——`#executeCreate` 在 `ctx.remote.soloips.createCompany` 取值处抛错，
 * 被折叠成 `failed` 相位（页面控制台原文：`cannot get property "remote.soloips"
 * without inject`）。
 *
 * 官方先例同形：`ui-goal` 的 `inject` 逐字含 `'remote.goals'`
 * （`packages/client/ui-goal/src/client/index.ts:52`），`ui-agent-preset` 含
 * `'remote.agentPresets'` 等。故本包也声明它——这是**服务就绪的机械等待**，
 * 不是「约定式依赖」。
 *
 * 〔为什么 `$mount` 本身仍能工作（`remote` 单独一项不够）〕`remote` 只是**容器**
 * 服务（`$mount`/`$on`/`$host`）；namespace 是 `$mount` 之后才注册的**子服务**。
 * 因此 `inject: ['remote']` 只保证「容器在」，不保证「本包的 namespace 已挂载」。
 * 声明 `remote.soloips` 后，cordis 会让本插件等到 `$mount` 完成才激活——但那与
 * 「本插件自己负责 `$mount`」构成先后矛盾（`apply` 不跑就没人挂载）。
 *
 * 〔故本插件的做法：**先挂载、再注册面板**，并让面板侧按调用解析〕
 * `apply` 内先 `await $mount`，再调用 `registerSoloipsCompanyPanel`——此时
 * `remote.soloips` 已在 store 里，面板的注入面读得到它。因此 `inject` **不**声明
 * `remote.soloips`（声明它会造成自锁：等一个只有自己会创建的服务）。该键由
 * `./company/register.js` 的 `servicesOf` 在 `apply` 之后按调用读取，未就绪即
 * fail-closed 抛错——与 `./index.js` 的 `remoteOf` 同款判据。
 */
export const inject: string[] = ["remote", "slots", "locale"];

/**
 * 读取浏览器侧 Remote 服务。
 *
 * 〔约束〕不用 `ctx.remote` 直接访问：见文件头「不得声明 Context 增强」。
 *
 * @param ctx - 浏览器侧 cordis 根上下文。
 * @returns 已就绪的 Remote 挂载面。
 * @throws {Error} 当 `remote` 未发布时——理论上被 `inject` 挡住；显式抛出而非
 *   静默跳过，是为了在有人绕过 cordis 的 inject 等待（手动 `ctx.plugin`）时
 *   立刻失败，而不是留下一个「插件已激活但什么都没挂」的假象。
 */
function remoteOf(ctx: Context): SoloipsWebClientRemote {
  const remote = (ctx as Context & { readonly remote?: SoloipsWebClientRemote }).remote;
  if (remote === undefined) {
    throw new Error(
      "soloips-web/client: ctx.remote 未发布——本插件声明了 inject: ['remote']，" +
        "该错误只应在绕过 cordis 服务等待（手动 ctx.plugin）时出现。",
    );
  }
  return remote;
}

/**
 * 挂载本包的 Remote 贡献，并把公司面板注册进侧栏槽位。
 *
 * 〔为什么两件事在同一个 `apply` 里、且有顺序〕面板的确认按钮会调
 * `ctx.remote.soloips.createCompany`——那是**本包 Host 半边生成的** namespace，
 * 由 `$mount` 安装。先 `$mount` 再注册面板，保证面板第一次渲染时该 namespace
 * 已就绪（`$mount` 的契约是「解析完成即方法可用」，见
 * `packages/api/gateway/src/client/index.ts` 的 `mountContribution`）。
 * 反过来（先注册面板）会让用户在一个短暂窗口内点到尚未挂载的 namespace，
 * 得到 `gateway/internal` 而不是业务结果。
 *
 * 〔为什么是 `async function` 声明（FE-1a-FIX 订正）〕**这是形态契约，不是风格**。
 * 本函数此前写作 `export function apply(...)` 并用 `.then` 串接，理由曾是「避免多
 * 一个微任务跳变、保持字面形态与源码面断言一致」——该理由的**前提不成立**：
 * 函数声明有 `prototype`，会被 cordis 的 `isConstructor` 判成构造器并以 `new`
 * 调用，于是本函数的返回值（卸载钩子）被**丢弃**，而 `$mount` 的副作用照常发生
 * （启动看起来正常、卸载静默失效）。这正是本文件头 `apply` 不变量所记的缺陷，
 * 实测证据与判据见 `tests/artifacts/artifact-behavior.artifact.ts` 的两条回归用例。
 *
 * 改成 `async function` 后：① `prototype` 不存在 → 走普通调用分支，返回的 Promise
 * 被 `Fiber._execute` 收下，resolve 值即卸载钩子；② `$mount` 失败以 **rejected
 * promise** 呈现给框架（fiber → FAILED），而不是被折叠成 unhandled rejection 的
 * fail-open。微任务跳变的存在与否不改变任何可观察语义——它是这条修复的**代价**，
 * 不是反方理由。
 *
 * 〔卸载顺序与安装顺序相反〕面板先注销、贡献后卸载：面板的进行中调用需要
 * namespace 存活到它结算为止。
 *
 * @param ctx - 浏览器侧 cordis 根上下文。
 * @returns 注销函数，交回 cordis 作为卸载钩子。
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const unmount = await remoteOf(ctx).$mount(TYPERT_REMOTE);
  const disposePanel = registerSoloipsCompanyPanel(ctx);
  return async () => {
    disposePanel();
    await unmount();
  };
}
