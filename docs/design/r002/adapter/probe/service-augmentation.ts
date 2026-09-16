/**
 * 编译探针 E：服务名模块增强与 DEV-04 依赖边界的**可编译验证**。
 *
 * 问题：core 要 `ctx.inject(['soloipsAdapter'], …)`，就必须在编译期看到
 * `declare module '@deepseek-ai/cordis' { interface Context { soloipsAdapter: … } }`。
 * 这个增强声明写在哪里，决定了 core 的依赖面到底有多宽。
 *
 * 本文件验证：**增强只依赖 `@deepseek-ai/cordis`（type-only 框架 ABI），
 * 不依赖任何 DSH 能力包**（storage-domain / session / subagent / tools /
 * agent-team / atomic-write 一个都不出现）。
 *
 * 依据 DEV-04：「各插件入口可以使用公开的插件注册接口及类型」——
 * cordis 是插件框架本身，不是能力包；被禁止的是 core 直接 import 能力包。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SoloipsAdapter } from './contracts.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * adapter 发布的外观服务。
     *
     * 未装配（`enabled: false`）或 adapter 未就绪时本成员不可解析：
     * `ctx.get('soloipsAdapter')` 返回 `undefined`，而 `ctx.soloipsAdapter`
     * 在依赖未满足时抛出——这正是 SOLO-F04 的 fail-closed pending 语义。
     */
    soloipsAdapter: SoloipsAdapter
  }
}

/**
 * core 侧真实的消费形状：经 inject 声明依赖，就绪后拿到已发布的 adapter。
 *
 * 注意 `ctx.get(...)` 返回 `undefined` 分支是**必需**的：adapter 被
 * `enabled: false` 关闭时不发布服务，core 必须能表达「依赖缺失」而不是崩溃。
 */
export function coreConsumesAdapter(ctx: Context): SoloipsAdapter | undefined {
  return ctx.get('soloipsAdapter')
}

/** 依赖就绪后的强类型消费路径（inject 回调内）。 */
export function coreInjectsAdapter(ctx: Context): void {
  ctx.inject(['soloipsAdapter'], adapterCtx => {
    const adapter: SoloipsAdapter = adapterCtx.soloipsAdapter
    void adapter.readiness()
  })
}
