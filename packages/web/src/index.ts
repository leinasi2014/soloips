/**
 * SOLOIPS-WEB-HOST-ENTRY
 *
 * `soloips-web` 的 Host 半边：把界面层需要的能力经 `@Remote` 暴露给浏览器。
 *
 * 本切片（BE-0a）的出口是**工具链与生成物可复现**，不是业务可用：
 *  - 这里只交付一个 `getStatus` 探针方法，用于在 BE-0b 证明
 *    「自建 Host Remote 方法被浏览器调用成功」这条通路；
 *  - **不**注入 `soloipsCore`、**不**调用任何业务命令——业务面属 BE-6
 *    （`docs/prds/system-assistant-backend-design-v0.1.md` §4.1）。
 *
 * 三条 Typert 严格分析约束（写实现时必须遵守，违反即构建失败）：
 *  1. Remote 方法必须是 **public、非 static、有具体实现**的实例方法，且**不得泛型**；
 *  2. 参数必须是**具名必填的简单标识符**——不得解构、不得默认值、不得 rest、
 *     不得可选；取消用末位 `signal: AbortSignal`；
 *  3. 参数与返回值的**具名类型**必须能从本包公开的非根子路径导出
 *     （本包用 `./contracts`），且必须是纯 JSON 类型。
 *
 * 依赖面（oxlint 窄口径 override 放行的三项，见 `.oxlintrc.json`）：
 *  - `@deepseek-ai/cordis`：插件框架本身（公开注册接口与类型）；
 *  - `@deepseek-ai/dsh-typert-protocol`：`@Remote` 装饰器与 `TypertRemoteService` 基类；
 *  - `soloips-core/contracts`：业务命令载荷类型（本切片尚未消费，别名已在
 *    `tsconfig.host.json` 就位，BE-6 接入业务面时使用）。
 */

import type { Context } from "@deepseek-ai/cordis";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

import type { SoloipsWebStatus, SoloipsWebStatusInput } from "./contracts.js";

export type { SoloipsWebStatus, SoloipsWebStatusInput } from "./contracts.js";

/** Host 半边在 loader 树中的稳定服务键（同时是 Remote wire namespace）。 */
export const SOLOIPS_WEB_SERVICE_NAME = "soloipsWeb";

/**
 * 本切片的工具链标识：证明生成物来自 tsdown + Typert 生成管线。
 * BE-6 接入业务面时连同 `getStatus` 一起替换为真实就绪信息。
 */
export const SOLOIPS_WEB_TOOLCHAIN = "tsdown+typert-generator@0.1.6-alpha.1";

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
 * 它只把 Host 侧的能力投影给浏览器。业务读写一律经 `soloipsCore` 服务，
 * 由 BE-6 接入。
 */
export class SoloipsWebHost extends TypertRemoteService {
  /** 注册服务名与 Remote namespace；`TypertRemoteService` 同时完成两者。 */
  constructor(ctx: Context) {
    super(ctx, "soloipsWeb");
  }

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
