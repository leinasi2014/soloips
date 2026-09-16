/**
 * soloips-core 的 Host 入口：插件注册 + 服务发布。
 *
 * 就绪策略（SOLO-F04 / contracts-design §8.1）：
 *  - 0.1.6 的挂载期失败只产生 warning，宿主不会替 core 报错；因此 core 用
 *    `ctx.inject(['soloipsAdapter'], cb)` 声明依赖并保持 pending，
 *    且在回调内自行判空 `ctx.get('soloipsAdapter')`——adapter 行
 *    `enabled: false` 时服务不发布，本插件不发布 soloipsCore（fail-closed）。
 *  - 配置 enabled === false 时在任何副作用之前返回（SEAM-07 的 core 等价物）。
 *
 * Host ABI：本文件**不 import** 任何 `@deepseek-ai/*` 包（DEV-04；oxlint 对
 * core 的 import 限制覆盖 cordis）。插件经结构化最小 Host 上下文类型消费
 * cordis 的公开注册面（inject/get/provide/effect，与设计探针 consumer.ts
 * 的做法一致）；`ctx.storageDomain` 不在本类型上——回退路径在类型层不可表达。
 */

import type { SoloipsStoragePort } from "soloips-adapter-dsh/contracts";

import { SOLOIPS_ADAPTER_SERVICE_NAME } from "soloips-adapter-dsh/contracts";
import type { SoloipsCoreService } from "./contracts";
import { SOLOIPS_CORE_SERVICE_NAME } from "./contracts";
import { SoloipsCoreError } from "./errors";
import { openSoloipsCompanyStore } from "./store";

export type { SoloipsCoreService } from "./contracts";
export { SoloipsCoreError } from "./errors";
export { openSoloipsCompanyStore } from "./store";

// ─────────────────────────────────────────────────────────────────────────────
// 最小 Host 上下文（cordis 公开注册面的结构投影；无 storageDomain 成员）
// ─────────────────────────────────────────────────────────────────────────────

export interface SoloipsCoreLogger {
  warn(message: string): void;
  error(message: string): void;
}

export interface SoloipsCoreHostContext {
  /** 声明服务依赖；回调在依赖就绪时运行，依赖变化时先卸载再重跑。 */
  inject(
    deps: readonly string[],
    callback: (ctx: SoloipsCoreHostContext) => void | Promise<void>,
  ): unknown;
  /** 读取服务；未发布时返回 undefined（不替代 inject 声明）。 */
  get(name: string): unknown;
  /** 以当前 fiber 为生命周期发布服务；返回注销函数。 */
  provide(name: string, value: unknown): () => void;
  /**
   * 登记当前 fiber 的清理动作；返回注销登记的**同步**函数。
   *
   * 〔约束〕body 必须返回一个 disposer（或 disposer 的可迭代集合），**不能返回 void**。
   * 这是宿主 `Context.effect` 的真实形状（cordis `fiber.d.ts`：
   * `effect(execute: () => SyncEffect, …)`，`SyncEffect = Disposable | Iterable<Disposable>`）。
   * 早先本类型把返回放宽为 `void`，使真实 `Context` **无法**赋值给它——入口签名因此比
   * 宿主更宽松，可写出宿主会拒绝的调用且无检查能发现。由
   * `tests/host-context-compat.spec.ts` 用真实 cordis 类型固定该兼容性。
   */
  effect(
    execute: () => (() => void | Promise<void>) | Iterable<() => void | Promise<void>>,
    label?: string,
  ): () => void;
  /** 可选的日志面；宿主未提供时静默 pending（fail-closed 本身就是就绪信号）。 */
  logger?(name: string): SoloipsCoreLogger;
}

export interface SoloipsCoreConfig {
  readonly enabled?: boolean;
  /** 已解析的绝对存储根；缺失或非绝对路径时服务不发布（fail-closed）。 */
  readonly storageRoot?: string;
  readonly backend?: string;
}

/** 插件配置边界校验：unknown 进、声明字段出，未知键剥离（DEV-05）。 */
function parseCoreConfig(raw: unknown): SoloipsCoreConfig | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const value = raw as Record<string, unknown>;
  const enabled = typeof value["enabled"] === "boolean" ? value["enabled"] : undefined;
  const storageRoot = typeof value["storageRoot"] === "string" ? value["storageRoot"] : undefined;
  const backend = typeof value["backend"] === "string" ? value["backend"] : undefined;
  return {
    ...(enabled === undefined ? {} : { enabled }),
    ...(storageRoot === undefined ? {} : { storageRoot }),
    ...(backend === undefined ? {} : { backend }),
  };
}

/** adapter storage 端口的结构校验：core 消费的三个成员必须齐备且为函数。 */
function isSoloipsStoragePort(value: unknown): value is SoloipsStoragePort {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["acquireWriterLease"] === "function" &&
    typeof candidate["createStack"] === "function" &&
    typeof candidate["requireFacility"] === "function"
  );
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function entry(ctx: SoloipsCoreHostContext, rawConfig: unknown): void {
  const config = parseCoreConfig(rawConfig);
  if (config === undefined || config.enabled === false) {
    return; // SEAM-07 等价物：任何副作用之前早退。
  }
  const logger = ctx.logger?.("soloips-core");

  ctx.inject([SOLOIPS_ADAPTER_SERVICE_NAME], (ctx2) => {
    // adapter 可能 disabled：服务值缺失时本 fiber 保持无发布状态。
    const adapter = ctx2.get(SOLOIPS_ADAPTER_SERVICE_NAME);
    if (adapter === undefined) {
      logger?.warn(
        `soloipsCore 未发布：${SOLOIPS_ADAPTER_SERVICE_NAME} 服务不可用（adapter disabled 或未激活）`,
      );
      return;
    }
    const storage =
      typeof adapter === "object" && adapter !== null
        ? (adapter as Record<string, unknown>)["storage"]
        : undefined;
    if (!isSoloipsStoragePort(storage)) {
      logger?.warn(
        `soloipsCore 未发布：${SOLOIPS_ADAPTER_SERVICE_NAME} 的 storage 端口不符合冻结契约`,
      );
      return;
    }
    const root = config.storageRoot;
    if (root === undefined) {
      logger?.warn("soloipsCore 未发布：缺少 storageRoot 配置（需已解析的绝对路径）");
      return;
    }

    let unloaded = false;
    let opened: SoloipsCoreService | undefined;
    ctx2.effect(() => () => {
      unloaded = true;
      void opened?.close();
    });

    void (async () => {
      try {
        const service = await openSoloipsCompanyStore({
          storage,
          root,
          ...(config.backend === undefined ? {} : { backend: config.backend }),
        });
        if (unloaded) {
          await service.close(); // 打开期间宿主已卸载：立即逆序释放，不发布。
          return;
        }
        opened = service;
        ctx2.provide(SOLOIPS_CORE_SERVICE_NAME, service);
      } catch (error) {
        // fail-closed：打开失败（含 lease/stack/open 任一步）不发布服务；
        // SoloipsCoreError 携带稳定码，其余按诊断文本保留。
        const detail = error instanceof SoloipsCoreError ? `（code ${error.code}）` : "";
        logger?.warn(`soloipsCore 未发布：打开公司存储失败${detail} ${summarizeError(error)}`);
      }
    })();
  });
}

export default entry;
