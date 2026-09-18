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
 *  - `apply` 必须把 `$mount` 返回的 disposer 交回 cordis：`$mount` 的返回值是
 *    卸载函数，cordis 以 `apply()` 的返回值作为卸载钩子；丢弃它会让重载泄漏
 *    namespace（`$mount` 契约：最后一个方法撤回即卸载该 namespace）。
 */

import type { Context } from "@deepseek-ai/cordis";
import type { TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";

import { TYPERT_REMOTE } from "soloips-web/remote";

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
 * 〔约束〕`inject` 声明为 `string[]` 而非 `keyof Context` 收窄：`remote` 由官方
 * 包提供，其声明合并不在本包依赖面内（DEV-04），写成键字面量会在缺少合并时
 * 报错。代价是失去「服务键存在性」的编译期校验，故由运行时读取兜底（见
 * {@link apply}）。`@deepseek-ai/dsh-client-connection` 的 client 半边同样用
 * `string[]` 形态声明 inject。
 *
 * `remote` 未就绪时 cordis 让本插件保持 pending，因此 `apply` 不会在服务缺失时
 * 被调用——fail-closed，不静默跳过。
 */
export const inject: string[] = ["remote"];

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
 * 挂载本包的 Remote 贡献。
 *
 * @param ctx - 浏览器侧 cordis 根上下文。
 * @returns `$mount` 的 disposer，交回 cordis 作为卸载钩子。
 */
export function apply(ctx: Context): Promise<() => Promise<void>> {
  return remoteOf(ctx).$mount(TYPERT_REMOTE);
}
