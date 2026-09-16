/**
 * SOLOIPS-ADAPTER-DSH · 插件入口
 *
 * DSH 官方 seam 适配层：收敛全部 `@deepseek-ai/*` 依赖，向 core 暴露
 * `SoloipsAdapter` 单一服务（ARCH-D02 / DEV-04）。
 *
 * 分层（contracts-design §2.2）：入口只做装配——早退判断、settings 注册（或
 * 延迟注册）、端口装配、发布 `soloipsAdapter`、注册 `ctx.effect` 回收。
 * 业务规则、持久化决策、domain open、写路径一律不在本文件。
 *
 * 装配顺序（副作用之前完成全部判断）：
 *  1. `enabled === false` 早退（SEAM-07）；
 *  2. settings：就绪则注册并取解析值，未就绪则 `ctx.inject` 延迟注册（互斥）；
 *  3. 构造七个端口（纯对象构造，不触达宿主资源）；
 *  4. 组装 `SoloipsAdapter` 外观；
 *  5. 挂载事件翻译（effect）并以 effect+provide 原子发布（SEAM-08）。
 *
 * 禁止项 #8：0.1.6 的启动审计只对全局必需 id reject，本插件 `apply` 的失败
 * 只产生 warning——core 必须自己经 `readiness()` / `ctx.get('soloipsAdapter')`
 * 显式探测，不能依赖宿主把失败暴露为启动失败。
 */

import type { Context } from "@deepseek-ai/cordis";
import type { SettingsProvider, SettingsScope } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
import {
  SOLOIPS_ADAPTER_CONFIG_DEFAULTS,
  SOLOIPS_ADAPTER_SERVICE_NAME,
  SOLOIPS_ADAPTER_SETTINGS_NAMESPACE,
  type SoloipsAdapter,
  type SoloipsAdapterConfig,
  type SoloipsAdapterConfigSummary,
  type SoloipsAdapterReadiness,
} from "./contracts";
import { createAgentsPort } from "./ports/agents";
import { createEventsPort, wireEventTranslations } from "./ports/events";
import { createSessionPort } from "./ports/session";
import { createStoragePort } from "./ports/storage";
import { createSubagentsPort } from "./ports/subagents";
import { createTeamPort } from "./ports/team";
import { createToolsPort } from "./ports/tools";

// SEAM-01：入口只做装配 + re-export；类型与常量的权威在 src/contracts.ts
// （冻结面）。包边界以公开 exports 消费（DEV-04）。
export * from "./contracts";

// ── 服务名模块增强（SEAM-02；形状与探针 service-augmentation.ts 一致） ────────

declare module "@deepseek-ai/cordis" {
  interface Context {
    /**
     * adapter 发布的外观服务。
     *
     * 未装配（`enabled: false`）或 adapter 未就绪时本成员不可解析：
     * `ctx.get('soloipsAdapter')` 返回 `undefined`，而 `ctx.soloipsAdapter`
     * 在依赖未满足时抛出——这正是 SOLO-F04 的 fail-closed pending 语义。
     */
    soloipsAdapter: SoloipsAdapter;
  }
}

/** 插件显示名（fiber 诊断与 logger 名）。 */
export const name = "soloips-adapter-dsh";

/** 宿主服务依赖；任一缺失即保持 pending（SOLO-F04 fail-closed）。 */
export const inject = ["storage", "sessionPersistence", "subagents", "agents", "tools"];

/**
 * 配置 schema（SEAM-09）：同一 schema 承载 loader 行 config 与 settings
 * namespace；缺省值只引用 `SOLOIPS_ADAPTER_CONFIG_DEFAULTS`，不复制数值。
 */
export const Config: z<SoloipsAdapterConfig> = z.object({
  enabled: z.boolean().default(SOLOIPS_ADAPTER_CONFIG_DEFAULTS.enabled),
  defaultBackend: z.string().default(SOLOIPS_ADAPTER_CONFIG_DEFAULTS.defaultBackend),
  leaseWaitMs: z.natural().default(SOLOIPS_ADAPTER_CONFIG_DEFAULTS.leaseWaitMs),
  teamEnabled: z.boolean().default(SOLOIPS_ADAPTER_CONFIG_DEFAULTS.teamEnabled),
});

// ── settings 注册（SEAM-06 / SEAM-09） ────────────────────────────────────────

/**
 * 注册本插件的 settings namespace。
 *
 * 〔约束〕`applies: 'restart'` 必须显式：宿主默认是 `'live'`，与 ARCH-D04
 * （配置变更只在重启后生效）不符。重复注册同一 namespace 会失败，因此
 * 直接注册与延迟注册两条路径**互斥**（见 apply）。
 */
export function registerAdapterSettings(
  settings: SettingsProvider,
): SettingsScope<SoloipsAdapterConfig> {
  return settings.register(SOLOIPS_ADAPTER_SETTINGS_NAMESPACE, Config, {
    base: { ...SOLOIPS_ADAPTER_CONFIG_DEFAULTS },
    applies: "restart",
    validate: (value) => {
      if (
        value.leaseWaitMs !== undefined &&
        (!Number.isSafeInteger(value.leaseWaitMs) || value.leaseWaitMs < 0)
      ) {
        throw new TypeError("leaseWaitMs must be a non-negative integer");
      }
    },
  });
}

// ── 运行期配置解析 ────────────────────────────────────────────────────────────

/** 端口运行期实际消费的配置子集（teamEnabled 为 T08 保留字段，暂不消费）。 */
interface RuntimeConfig {
  readonly defaultBackend: string;
  readonly leaseWaitMs: number;
}

/** 取各层（loader 行 config、settings 解析值）中**最后**定义的非 undefined 值。 */
function latest<T>(values: readonly (T | undefined)[]): T | undefined {
  let result: T | undefined = undefined;
  for (const value of values) {
    if (value !== undefined) result = value;
  }
  return result;
}

/**
 * 解析运行期配置：契约缺省 < loader 行 config < settings 解析值。
 *
 * 边界：`enabled` 的早退判断只看 loader 行 config（SEAM-07 的判定输入）；
 * settings 层的关闭属于下一次重启后的装配决策，不在本函数职责内。
 */
function resolveRuntimeConfig(
  line: SoloipsAdapterConfig,
  settings: SoloipsAdapterConfig | undefined,
): RuntimeConfig {
  return {
    defaultBackend:
      latest([line.defaultBackend, settings?.defaultBackend]) ??
      SOLOIPS_ADAPTER_CONFIG_DEFAULTS.defaultBackend,
    leaseWaitMs:
      latest([line.leaseWaitMs, settings?.leaseWaitMs]) ??
      SOLOIPS_ADAPTER_CONFIG_DEFAULTS.leaseWaitMs,
  };
}

// ── 就绪状态（诊断面；不承担门禁，禁止项 #8） ───────────────────────────────

const HOST_SERVICE_REQUIREMENTS: readonly (
  "storage" | "sessionPersistence" | "subagents" | "agents" | "tools"
)[] = ["storage", "sessionPersistence", "subagents", "agents", "tools"];

function readinessOf(
  runtime: RuntimeConfig,
  lookup: (name: (typeof HOST_SERVICE_REQUIREMENTS)[number]) => unknown,
): SoloipsAdapterReadiness {
  const missingServices = HOST_SERVICE_REQUIREMENTS.filter(
    (service) => lookup(service) === undefined,
  );
  const summary: SoloipsAdapterConfigSummary = {
    enabled: true,
    defaultBackend: runtime.defaultBackend,
    leaseWaitMs: runtime.leaseWaitMs,
  };
  return { ready: missingServices.length === 0, missingServices, config: summary };
}

// ── 入口（SEAM-04） ───────────────────────────────────────────────────────────

/**
 * 唯一插件入口。
 *
 * SEAM-07：`enabled === false` 在**任何**副作用之前返回。副作用的判定边界：
 * settings 注册、端口构造、`ctx.provide`、`ctx.effect`、`ctx.on`、任何宿主
 * 服务读取（含 `ctx.get`）都算；此 return 之前只允许纯值计算与读 config 键。
 */
export async function apply(ctx: Context, config: SoloipsAdapterConfig): Promise<void> {
  // 1. 早退（副作用零）：不注册 settings、不构造端口、不发布、不订阅。
  if (config.enabled === false) return;

  // 2. settings：两条路径互斥（同一 namespace 重复注册会失败）。
  const settings = ctx.get("settings");
  let settingsResolved: SoloipsAdapterConfig | undefined;
  if (settings === undefined) {
    // 未就绪：先 inject，就绪后在回调内注册。回调可因依赖变化重跑，
    // 注册本身是 effect（fiber 卸载时移除），重跑安全。
    ctx.inject(["settings"], (settingsCtx) => {
      registerAdapterSettings(settingsCtx.settings);
    });
  } else {
    settingsResolved = registerAdapterSettings(settings).get();
  }
  const runtime = resolveRuntimeConfig(config, settingsResolved);

  // 3. 构造七个端口（纯对象构造；宿主服务只在方法调用时读取）。
  const adapter: SoloipsAdapter = {
    storage: createStoragePort(ctx, runtime),
    session: createSessionPort(ctx),
    subagents: createSubagentsPort(ctx),
    tools: createToolsPort(ctx),
    events: createEventsPort(ctx),
    agents: createAgentsPort(ctx),
    team: createTeamPort(),
    readiness: () => readinessOf(runtime, (service) => ctx.get(service)),
  };

  // 4. 挂载 DSH → soloips 事件翻译（effect 作用域；先于发布，core 就绪即可见）。
  ctx.effect(() => {
    const unwire = wireEventTranslations(ctx);
    return () => {
      unwire();
    };
  }, "soloipsAdapter.events.translate()");

  // 5. 原子发布（SEAM-08）：单个服务，core 不会观察到「一半就绪」的 adapter。
  ctx.effect(() => {
    const unprovide = ctx.provide(SOLOIPS_ADAPTER_SERVICE_NAME, adapter);
    return () => {
      unprovide();
    };
  }, "soloipsAdapter.publish()");
}
