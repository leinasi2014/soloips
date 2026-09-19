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
 * Host ABI：core 的宿主依赖面**恰好**是 `{@deepseek-ai/cordis}`（已冻结设计
 * `adapter/contracts-design.md` §0 第 2 条；DEV-04 允许插件入口使用其公开注册接口
 * 与类型）。除 cordis 外**不 import** 任何 `@deepseek-ai/*` 能力包——那些能力由
 * `soloips-adapter-dsh` 收敛后经其 `./contracts` 提供（oxlint 对本目录强制该边界）。
 *
 * 消费的上下文面由官方 `Context` **派生**（`Pick<…>`），不手抄宿主签名：
 * 手抄已导致过一次签名漂移（见 `SoloipsCoreHostContext` 的说明）。
 * `ctx.storageDomain` 刻意不在派生集合内——回退路径在类型层不可表达（SEAM-X1）。
 */

import type { Context } from "@deepseek-ai/cordis";
import type { SoloipsAdapter, SoloipsStoragePort } from "soloips-adapter-dsh/contracts";

import { SOLOIPS_ADAPTER_SERVICE_NAME } from "soloips-adapter-dsh/contracts";
import type { SoloipsCoreService, SoloipsPlanCode } from "./contracts.js";
import { SOLOIPS_CORE_SERVICE_NAME } from "./contracts.js";
import { SoloipsCoreError } from "./errors.js";
import { openSoloipsCompanyStore } from "./store.js";

export type { SoloipsCoreService } from "./contracts.js";
export { SoloipsCoreError } from "./errors.js";
export { openSoloipsCompanyStore } from "./store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Host 上下文：由**官方 cordis 类型**派生，不手抄宿主签名
// ─────────────────────────────────────────────────────────────────────────────

/**
 * core 用到的日志面：按名取 logger 后记录一条消息。
 *
 * 〔约束〕**从 `Context.logger` 的返回类型派生**，不手抄：宿主换 Logger 形状时这里会
 * 编译失败，而不是继续按旧形状调用。只保留本包实际用到的 `warn` / `error`，
 * 不复制 `LoggerService` 的 buffering、ctx 等内部字段——那些是宿主实现细节，core 不消费，
 * 复制它们会让测试替身被迫伪造一堆无关成员。
 */
export type SoloipsCoreLogger = Pick<ReturnType<Context["logger"]>, "warn" | "error">;

/**
 * core 消费的宿主注册面。
 *
 * 〔约束〕**从官方 `Context` 派生，不手写一套同形接口。** 手抄会引入签名漂移：
 * 本项目已实际发生过两次——自写的 `effect` 把返回类型放宽为 `() => void`
 * （真实是 `AsyncDisposable<Promise<void>>`，既 thenable 又要求 disposer 返回 Promise），
 * `logger` 则漏掉级别方法。派生后由编译器保证一致，
 * `tests/host-context-compat.spec.ts` 再断言真实 `Context` 可赋值。
 *
 * `logger` 收窄为**调用形态**（`(name) => {warn,error}`）：宿主的是完整 `LoggerService`，
 * 而 core 只按名取 logger 再记录，不收窄就得让替身伪造 9 个无关字段。
 * 其余成员（`inject`/`get`/`provide`/`effect`）原样取自宿主。
 * 刻意**不含** `storageDomain`：写权与 facility 只经 adapter 的公开端口显式取得，
 * 回退路径在类型层不可表达（SEAM-X1）。
 */
export type SoloipsCoreHostContext = Omit<
  Pick<Context, "inject" | "get" | "provide" | "effect" | "logger">,
  "logger"
> & {
  readonly logger: (name?: string) => SoloipsCoreLogger;
};

export interface SoloipsCoreConfig {
  readonly enabled?: boolean;
  /** 已解析的绝对存储根；缺失或非绝对路径时服务不发布（fail-closed）。 */
  readonly storageRoot?: string;
  /**
   * 部署层注入的账户（S0 过渡例外，data-contract §3.1）。
   *
   * 〔约束〕缺失或为占位账户 `"seed"` 时服务不发布（fail-closed）：账户是根级
   * 绑定事实的比对基准，缺省一个「安全默认账户」会让绑定校验退化成无校验。
   * 业务命令面**不**承载该值（`SoloipsCreateCompanyInput` 无此字段）。
   */
  readonly accountId?: string;
  /**
   * 部署层注入的订阅计划码（M0.1 形态：配置注入，不建 `entitlement` 表——C-1 口径）。
   *
   * 〔约束〕缺失时按 `free`（**最严格**计划：1 公司 / 0 子公司）发布；取值不在
   * `free | pro | enterprise` 词表内时**不发布服务**（fail-closed）——拼错的计划码
   * 若被静默当成 `free` 会误拒 `pro` 部署，若被当成无限制则会**放宽**限制，两个
   * 方向都不可接受。与 `accountId` 的差别：账户缺失是「无法校验」（无安全缺省），
   * 计划码缺失有**安全缺省**。
   */
  readonly planCode?: SoloipsPlanCode;
  /**
   * 存储后端名（`json` / `sqlite`；非可构造的名字由 adapter 在 `createStack` 以
   * `SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE` 拒绝，core 侧不做词表校验）。
   *
   * 〔这是**对 adapter 缺省的显式覆写**，不是「缺省声明」〕有值时按原样透传给
   * `storage.createStack`；无值时**不透传该键**，由 adapter 的 `defaultBackend`
   * 决定（`SOLOIPS_ADAPTER_CONFIG_DEFAULTS`，当前 `sqlite`；消费点见
   * `packages/adapter-dsh/src/ports/storage.ts` 的
   * `options.backend ?? config.defaultBackend`）。两个键是**同一件事的两层**：
   * core 的 `backend` 胜出，adapter 的 `defaultBackend` 是它缺席时的兜底。
   *
   * 〔与 `planCode` 的差别〕本键**无**词表校验也无缺省：`""` 与「不写本键」语义
   * 不同——前者会被透传并在 adapter 侧拒绝（不可构造），后者走 adapter 缺省。
   */
  readonly backend?: string;
}

/** 插件配置边界校验：unknown 进、声明字段出，未知键剥离（DEV-05）。 */
function parseCoreConfig(raw: unknown): SoloipsCoreConfig | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const value = raw as Record<string, unknown>;
  const enabled = typeof value["enabled"] === "boolean" ? value["enabled"] : undefined;
  const storageRoot = typeof value["storageRoot"] === "string" ? value["storageRoot"] : undefined;
  const accountId = typeof value["accountId"] === "string" ? value["accountId"] : undefined;
  const backend = typeof value["backend"] === "string" ? value["backend"] : undefined;
  // 计划码：只做**字符串形状**收窄，词表校验留给 `openSoloipsCompanyStore` 的
  // `validatePlanCode`（唯一落点）。在这里丢弃非词表值会让「配置写错」静默表现为
  // 「按 free 运行」——那是最难排查的一类配置故障。
  const planCode = typeof value["planCode"] === "string" ? value["planCode"] : undefined;
  return {
    ...(enabled === undefined ? {} : { enabled }),
    ...(storageRoot === undefined ? {} : { storageRoot }),
    ...(accountId === undefined ? {} : { accountId }),
    ...(planCode === undefined ? {} : { planCode: planCode as SoloipsPlanCode }),
    ...(backend === undefined ? {} : { backend }),
  };
}

/**
 * adapter 服务的收窄：**只校验 core 实际消费的成员**（当前是 `storage`）。
 *
 * 〔约束〕不要要求七个端口全部齐备：adapter 是**原子发布**的单个服务，但它发布后
 * core 只用到 `storage`；把未使用的端口也写成前置条件，会让 core 因为与自己无关的
 * 成员缺失而拒绝工作，并把「待就绪面」无谓扩大。缺少的端口若日后被 core 使用，
 * 在这里补校验即可（那是本切片内的实现细节）。
 */
function isSoloipsAdapter(value: unknown): value is SoloipsAdapter {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return "storage" in candidate;
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
    // `ctx.get` 返回 unknown（宿主约定）；先按契约的 SoloipsAdapter 收窄，
    // 再校验 storage 端口——不用 `as Record<string, unknown>` 把契约类型折成字典
    // （那会丢掉索引签名之外的类型信息，也让「端口形状」的校验失去类型依据）。
    const candidate: SoloipsAdapter | undefined = isSoloipsAdapter(adapter) ? adapter : undefined;
    const storage = candidate?.storage;
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
    const accountId = config.accountId;
    if (accountId === undefined) {
      logger?.warn(
        "soloipsCore 未发布：缺少 accountId 配置（需部署层注入的账户标识；" +
          "S0 过渡例外见 data-contract §3.1，须在实例 profile 的 soloips-core.config 覆写）",
      );
      return;
    }

    let unloaded = false;
    let opened: SoloipsCoreService | undefined;
    ctx2.effect(() => () => {
      unloaded = true;
      // 〔STORAGE-01〕卸载必须**等待**关闭完成，且关闭失败必须**可见**：
      //  - cordis 4.0.2 `src/fiber.ts:675-682` 的 `_unload()` 对每个 disposer 执行
      //    `await runDisposable(dispose)`，而 `runDisposable`（同文件 L114-117）直接
      //    返回回调的返回值——故**返回该 Promise** 才让宿主等到 domain/stack/lease
      //    释放完毕；先前 `void opened?.close()` 让关闭成为 fire-and-forget，
      //    宿主可在 sqlite 连接与 lease 锁释放前退出。
      //  - 失败在此记录后**不再抛出**：卸载失败升级为崩溃会让宿主丢失其余清理步骤，
      //    与「失败必须可见、但不自动重试」的纪律一致（SEAM-14 的释放链自身已保证
      //    「一步失败也走完逆序释放」）。
      const closing = opened?.close();
      if (closing === undefined) return; // 未打开：无事可做，静默返回。
      return closing.catch((error: unknown) => {
        logger?.warn(`soloipsCore 关闭失败：${summarizeError(error)}`);
      });
    });

    void (async () => {
      try {
        const service = await openSoloipsCompanyStore({
          storage,
          root,
          accountId,
          // planCode 缺省由 store 取 `free`（最严格计划）；此处只在显式配置时透传，
          // 词表校验在 store 的 validatePlanCode（唯一落点）。
          ...(config.planCode === undefined ? {} : { planCode: config.planCode }),
          // backend 同理：只在显式配置时透传。**不给**就由 adapter 的
          // `defaultBackend` 决定——`backend: ""` 与「不写本键」语义不同（前者会被
          // 透传并在 adapter 侧以「不可构造的 backend」fail-closed）。
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
