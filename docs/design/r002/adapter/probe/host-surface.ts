/**
 * 编译探针 D：`apply(ctx, config)` 与 settings 注册的**真实**宿主类型核对。
 *
 * 与 A/B/C 不同，本文件**故意** import 真实 `@deepseek-ai/*` 包——它验证的是
 * 「契约草案描述的宿主面在目标安装工件上确实存在且形状一致」，而不是 core 的依赖面。
 * 这层 import 只属于 adapter 实现，core 永远看不到（DEV-04）。
 *
 * 目标工件：r001 runtime 内已安装的 0.1.6-alpha.1（非 fork 源码）。
 * 运行方式见 tsconfig.host.json（paths 指向 r001 runtime node_modules）。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { DomainFacility, Domain, DomainSpec } from '@deepseek-ai/dsh-storage-domain'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import type { SubagentRuntime } from '@deepseek-ai/dsh-subagent'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { SettingsProvider, SettingsScope } from '@deepseek-ai/dsh-settings'
import type { TeamService } from '@deepseek-ai/dsh-experimental-agent-team'
import type { Storage } from '@deepseek-ai/dsh-storage'
import type { AgentRegistry } from '@deepseek-ai/dsh-agent'

import z from '@deepseek-ai/schemastery'

import {
  SOLOIPS_ADAPTER_CONFIG_DEFAULTS,
  SOLOIPS_ADAPTER_SERVICE_NAME,
  SOLOIPS_ADAPTER_SETTINGS_NAMESPACE,
  type SoloipsAdapter,
  type SoloipsAdapterConfig,
} from './contracts.ts'

// ── H1：五类 seam 的服务名与类型确实挂在 Context 上 ──────────────────────────

/**
 * 契约 §8 声称「adapter 把 ctx.storage.domain / sessionPersistence / subagents /
 * tools / events 包装成内部接口」。本函数在**编译期**证明这五个宿主成员存在，
 * 且类型与契约里的端口一一对应。
 */
export function hostSeams(ctx: Context): {
  facility: DomainFacility
  persistence: SessionPersistence
  subagents: SubagentRuntime
  tools: ToolRuntime
  settings: SettingsProvider
  team: TeamService
  storage: Storage
  agents: AgentRegistry
} {
  return {
    facility: ctx.storage.domain,
    persistence: ctx.sessionPersistence,
    subagents: ctx.subagents,
    tools: ctx.tools,
    settings: ctx.settings,
    team: ctx.agentTeams,
    storage: ctx.storage,
    agents: ctx.agents,
  }
}

// ── H2：storage-domain 的 open 形状与契约 §1 一致 ────────────────────────────

/** 契约声称 facility.open(spec) 返回 Domain<S>；此处核对真实签名。 */
export function hostOpen<S extends DomainSpec>(facility: DomainFacility, spec: S): Promise<Domain<S>> {
  return facility.open(spec)
}

// ── H3：settings 注册 —— namespace 常量合法性 + applies: 'restart' ───────────

/**
 * SEAM-06 的机械核对。三点：
 *  1. `SOLOIPS_ADAPTER_SETTINGS_NAMESPACE` 必须满足宿主正则 `^[a-z][a-z0-9-]*$`
 *     （`SettingsNamespaceInput` 的条件类型会在不合法时把参数类型推成 `never`）；
 *  2. `applies: 'restart'` 必须是合法取值；
 *  3. schema 必须产出契约里的 `SoloipsAdapterConfig`。
 */
export function hostRegisterSettings(settings: SettingsProvider): SettingsScope<SoloipsAdapterConfig> {
  const schema = z.object({
    enabled: z.boolean().default(SOLOIPS_ADAPTER_CONFIG_DEFAULTS.enabled),
    defaultBackend: z.string().default(SOLOIPS_ADAPTER_CONFIG_DEFAULTS.defaultBackend),
    leaseWaitMs: z.natural().default(SOLOIPS_ADAPTER_CONFIG_DEFAULTS.leaseWaitMs),
    teamEnabled: z.boolean().default(SOLOIPS_ADAPTER_CONFIG_DEFAULTS.teamEnabled),
  })

  return settings.register(SOLOIPS_ADAPTER_SETTINGS_NAMESPACE, schema, {
    base: {
      enabled: SOLOIPS_ADAPTER_CONFIG_DEFAULTS.enabled,
      defaultBackend: SOLOIPS_ADAPTER_CONFIG_DEFAULTS.defaultBackend,
      leaseWaitMs: SOLOIPS_ADAPTER_CONFIG_DEFAULTS.leaseWaitMs,
      teamEnabled: SOLOIPS_ADAPTER_CONFIG_DEFAULTS.teamEnabled,
    },
    // ARCH-D04 的 startup 语义：变更只在重启后生效。
    applies: 'restart',
    validate: (value) => {
      if (value.leaseWaitMs < 0) throw new TypeError('leaseWaitMs must not be negative')
    },
  })
}

// ── H4：settings 未就绪时的延迟注册（SEAM-06 后半句） ────────────────────────

/** 契约声称 settings 未就绪时先 `ctx.inject(['settings'], …)`。核对 inject 可用。 */
export function hostDeferredRegister(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    hostRegisterSettings(settingsCtx.settings)
  })
}

// ── H5：provide/effect 配对（SEAM-08） ──────────────────────────────────────

/**
 * 契约声称服务发布统一走 `ctx.provide(name, service)` 并在 `ctx.effect` 内返回
 * unprovide。核对：`provide` 返回 disposer，且 `effect` 接受一个返回 disposer 的函数。
 */
export function hostProvidePaired(ctx: Context, adapter: SoloipsAdapter): void {
  ctx.effect(() => {
    const unprovide = ctx.provide(SOLOIPS_ADAPTER_SERVICE_NAME, adapter)
    return () => {
      unprovide()
    }
  })
}

// ── H6：契约的服务名常量确实声明在 Context 上（模块增强的接线点） ────────────

/**
 * 实现阶段 adapter 会做：
 *   declare module '@deepseek-ai/cordis' { interface Context { soloipsAdapter: SoloipsAdapter } }
 * 本函数用真实 Context 类型模拟该增强后的读取，证明增强点可用。
 */
export function hostEnhancedRead(ctx: Context & { soloipsAdapter: SoloipsAdapter }): SoloipsAdapter {
  return ctx.soloipsAdapter
}

// ── H7：配置面同时承载 loader 行 config 与 settings base（SEAM-09） ─────────

/** 契约声称同一 interface 承载两种来源；核对 `SoloipsAdapterConfig` 可作 schema 输出。 */
export const hostConfigSchema: z<SoloipsAdapterConfig> = z.object({
  enabled: z.boolean().default(true),
  defaultBackend: z.string().default('json'),
  leaseWaitMs: z.natural().default(5_000),
  teamEnabled: z.boolean().default(false),
})

/** 契约的 apply 入口签名（SEAM-04）。 */
export async function hostApply(ctx: Context, config: SoloipsAdapterConfig): Promise<void> {
  // SEAM-07：任何副作用之前早退。
  if (config.enabled === false) return
  hostDeferredRegister(ctx)
}

// ── H8（SEAM-X1 的决定性证据）：宿主**确实**提供 ctx.storageDomain 回退路径 ──

/**
 * 本函数证明 SEAM-X1 不是历史遗留描述，而是**目标安装工件上真实可用的**
 * 绕过路径：
 *
 *  - `ctx.storageDomain` 由 `@deepseek-ai/dsh-storage-domain` 自己经
 *    `declare module '@deepseek-ai/cordis'` 增强到 Context 上
 *    （0.1.6-alpha.1 的 `src/index.ts:35-39`）；
 *  - 因此任何「`input.facility ?? ctx.storageDomain`」写法都能编译通过并绕过 lease；
 *  - 契约的 `SoloipsStoragePort` **没有**该成员（见 consumer-negative.ts NEG-1），
 *    所以 core 侧写不出这条回退。
 *
 * 结论：取消回退必须在**我们自己的类型层**做，不能指望上游收紧。
 */
export function hostStorageDomainFallbackExists(ctx: Context): DomainFacility {
  return ctx.storageDomain
}

/**
 * 对照：契约暴露给 core 的 facility 只经 `requireFacility(显式实参)` 取得，
 * 没有任何「从 ctx 兜底」的入口。两处签名并排即可看出差别。
 */
export function contractHasNoFallback(facility: DomainFacility): DomainFacility {
  return facility
}
