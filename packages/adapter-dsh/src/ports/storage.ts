/**
 * SOLOIPS-ADAPTER-STORAGE-PORT
 *
 * storage-domain seam（能力 1/5 + 守卫面）：跨进程写权租约（ORG-06 / SEAM-X2）、
 * 同一 canonical root 的 backend+facility 栈（SEAM-11–14）、以及 SEAM-X1 的
 * 「facility 必须显式传入」类型层强制。
 *
 * 分层（contracts-design §2.2 / §3.3）：本端口只提供**机制**（何时取锁、何时
 * 复核、如何回退是 core 的策略）。适配层**不持有任何业务 domain handle**，
 * 也不 open 任何业务 domain（禁止项 #1）——`SoloipsStorageStack` 只暴露 facility。
 *
 * 跨进程写权（禁止项 #3/#6/#10）：
 *  - 写权**只**经 `acquireWriterLease`。**互斥**由 `dsh-atomic-write` 的
 *    `withFileLock` 承担：`wx` 独占创建 `<file>.lock` 兄弟文件，且持锁窗口
 *    **横跨整个租约生命周期**（acquire 时建立，`dispose()` 时才删除）；
 *  - 租约文件上的代际计数（`writeFileAtomic` 原子提交）**只作诊断**，不参与
 *    失权判定——理由与边界见 `contracts.ts` 的 `SoloipsWriterLease` 注释；
 *  - 全程**不使用**进程内 `Map` 承担正确性（锁是文件系统事实，不是进程内表）；
 *  - `already-open`（facility 同实例保证）与进程内 session 写所有权都不当作
 *    跨进程保护。
 */

import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { writeFileAtomic, withFileLock } from "@deepseek-ai/dsh-atomic-write";
import type { Context } from "@deepseek-ai/cordis";
import { DomainError, DomainFacility } from "@deepseek-ai/dsh-storage-domain";
import type {
  Domain,
  DomainGlobal,
  DomainGlobalSpec,
  DomainSpec,
  DomainTableSpec,
  KvTable,
} from "@deepseek-ai/dsh-storage-domain";
import { JsonStorageBackend } from "@deepseek-ai/dsh-storage-json";
import {
  SoloipsAdapterError,
  type SoloipsDomain,
  type SoloipsDomainFacility,
  type SoloipsDomainSpec,
  type SoloipsStoragePort,
  type SoloipsStorageStack,
  type SoloipsStorageStackOptions,
  type SoloipsValueSchema,
  type SoloipsWriterLease,
} from "../contracts.js";
import { mapHostError } from "./shared.js";
import { SqliteStorageBackend } from "./storage-sqlite.js";
import type { StorageBackend } from "@deepseek-ai/dsh-storage";

/** 租约文件名（置于数据根下；锁文件是其 `.lock` 兄弟）。 */
const LEASE_FILE_NAME = ".soloips-writer-lease.json";
/** 本适配层能自行构造的 backend 名。 */
const CONSTRUCTIBLE_BACKENDS = ["json", "sqlite"] as const;

/** 本端口运行期所需的解析后配置。 */
export interface StoragePortConfig {
  readonly defaultBackend: string;
  readonly leaseWaitMs: number;
}

// ── canonical root 与存储身份 ─────────────────────────────────────────────────

/** 校验并规范化存储根：必须是绝对路径；adapter 不做 home 解析（契约 §8）。 */
function canonicalRoot(root: string): string {
  if (!isAbsolute(root)) {
    throw new SoloipsAdapterError(
      "SOLOIPS_ADAPTER_INVALID_CONFIG",
      `storage root must be an absolute path, got '${root}'`,
    );
  }
  return resolve(root);
}

/** 规范化存储身份（backend + 解析后根），租约与绑定共用同一算法。 */
function storageIdOf(backend: string, root: string): string {
  return `${backend}:${root}`;
}

// ── 契约 spec → 宿主 DomainSpec（schema 结构端口 → ZodType 单向窄化） ────────
//
// 契约的 `SoloipsValueSchema` 只承诺 `parse`/`safeParse`，而这正是
// dsh-storage-domain 对 spec schema 的**全部**运行期调用面（表记录
// `valueSchema.parse`、global 的 null 哨兵 `schema.safeParse(null)` 与
// `schema.parse`；见 contracts-design §3.2(a) 的核对）。因此这里做的是同一对象
// 的**单向窄化断言**（`ZodType` 可赋给 `SoloipsValueSchema`，故合法），不是
// 双重断言；spec 的可校验字段（name/version/表名/global null 哨兵）在边界补齐
// 与宿主 `defineDomain` 相同的检查。

type HostValueSchema<V> = DomainTableSpec<string, V>["valueSchema"];
type HostGlobalSchema<G> = DomainGlobalSpec<G>["schema"];

function hostValueSchema<V>(schema: SoloipsValueSchema<V>): HostValueSchema<V> {
  return schema as HostValueSchema<V>;
}

function hostGlobalSchema<G>(schema: SoloipsValueSchema<G>): HostGlobalSchema<G> {
  return schema as HostGlobalSchema<G>;
}

const UNIT_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

function validateSpecFields(spec: SoloipsDomainSpec): void {
  if (!UNIT_NAME_PATTERN.test(spec.name)) {
    throw new TypeError(
      `soloips-adapter: domain name '${spec.name}' must match ${UNIT_NAME_PATTERN}`,
    );
  }
  if (!Number.isSafeInteger(spec.version) || spec.version < 0) {
    throw new TypeError(
      `soloips-adapter: domain '${spec.name}' version must be a non-negative integer`,
    );
  }
  for (const tableName of Object.keys(spec.tables)) {
    if (!UNIT_NAME_PATTERN.test(tableName)) {
      throw new TypeError(
        `soloips-adapter: domain '${spec.name}' table name '${tableName}' must match ${UNIT_NAME_PATTERN}`,
      );
    }
  }
  if (spec.global !== undefined && spec.global.schema.safeParse(null).success) {
    throw new TypeError(
      `soloips-adapter: domain '${spec.name}' global schema must not accept null (null is the medium's "never written" sentinel)`,
    );
  }
}

/** 把契约 spec 复制成宿主 spec（浅拷贝 + schema 窄化；见块注释）。 */
function toHostSpec(spec: SoloipsDomainSpec): DomainSpec {
  validateSpecFields(spec);
  const tables: Record<string, DomainTableSpec> = {};
  for (const [tableName, table] of Object.entries(spec.tables)) {
    tables[tableName] = { valueSchema: hostValueSchema(table.valueSchema) };
  }
  return {
    name: spec.name,
    version: spec.version,
    tables,
    ...(spec.layout !== undefined ? { layout: spec.layout } : {}),
    ...(spec.compatibleVersions !== undefined
      ? { compatibleVersions: spec.compatibleVersions }
      : {}),
    ...(spec.invalidRecords !== undefined ? { invalidRecords: spec.invalidRecords } : {}),
    ...(spec.global !== undefined
      ? {
          global: {
            schema: hostGlobalSchema<unknown>(spec.global.schema),
            initial: spec.global.initial,
          } satisfies DomainGlobalSpec<unknown>,
        }
      : {}),
  };
}

// ── 宿主 Domain 的擦除视图与契约包装 ─────────────────────────────────────────
//
// `DomainFacility.open` 的泛型按 spec 定型，但其返回值在本适配层只经下面这个
// 结构视图消费（name/global/table/close）。`SoloipsDomain<S>` 的 global 句柄是
// 延迟条件类型、table 键是幻影品牌，无法在不绕过类型的前提下由擦除视图直接
// 「构造」；包装对象对每个成员逐一委托，最后做一次**单向窄化**（契约类型可赋
// 给擦除视图：方法双变 + 条件类型两分支均可赋），不使用 `as unknown as`。

interface ErasedHostDomain {
  readonly name: string;
  readonly global: DomainGlobal<unknown> | undefined;
  table(name: string): KvTable<string, unknown>;
  close(): Promise<void>;
}

/** 把宿主 open 泛型擦除为结构视图（无断言的普通函数视图赋值）。 */
const erasedHostOpen: (facility: DomainFacility, spec: DomainSpec) => Promise<ErasedHostDomain> = (
  facility,
  spec,
) => facility.open(spec);

function wrapHostDomain<S extends SoloipsDomainSpec>(
  host: ErasedHostDomain,
  spec: SoloipsDomainSpec,
): SoloipsDomain<S> {
  const erased: ErasedHostDomain = {
    name: host.name,
    // 宿主的 global 句柄只在 spec 声明了 global 时才可访问（未声明时读取会抛）。
    global: spec.global === undefined ? undefined : host.global,
    table: (name: string) => host.table(name),
    close: () => host.close(),
  };
  return erased as SoloipsDomain<S>;
}

/** 禁止项 #2（SEAM-X1）的类型层强制已在契约签名；这里给运行期兜底。 */
function mapDomainOpenError(domainName: string, error: unknown): SoloipsAdapterError | TypeError {
  if (error instanceof DomainError && error.code === "already-open") {
    return new SoloipsAdapterError(
      "SOLOIPS_ADAPTER_DOMAIN_ALREADY_OPEN",
      `domain '${domainName}' is already open on this facility instance (same-instance guarantee only; cross-process write right is the writer lease)`,
      { cause: error },
    );
  }
  return mapHostError(`storage.open('${domainName}')`, error);
}

/** facility 包装：open 走 spec 桥，closeAll 透传。不 open 任何业务 domain。 */
class SoloipsDomainFacilityWrapper implements SoloipsDomainFacility {
  constructor(private readonly host: DomainFacility) {}

  async open<S extends SoloipsDomainSpec>(spec: S): Promise<SoloipsDomain<S>> {
    const hostSpec = toHostSpec(spec);
    try {
      const domain = await erasedHostOpen(this.host, hostSpec);
      return wrapHostDomain(domain, spec);
    } catch (error: unknown) {
      throw mapDomainOpenError(spec.name, error);
    }
  }

  async closeAll(): Promise<void> {
    try {
      await this.host.closeAll();
    } catch (error: unknown) {
      throw mapHostError("storage.facility.closeAll()", error);
    }
  }
}

// ── 写权租约（跨进程 fence） ──────────────────────────────────────────────────
//
// 〔互斥的唯一承担者〕`withFileLock`（见文件头）。它持锁到 `dispose()`，且上游
// 实现**从不**移除已存在的锁文件（`dsh-atomic-write` 的 withFileLock：`finally`
// 里 `rm(lockPath)` 只删自己刚创建的那把；争用者超时即失败，不做孤儿回收）。
// 因此「同一 root 同时只有一个持权者」是文件系统层的事实，不依赖本文件的任何
// 布尔量。
//
// 〔代际计数的真实用途〕诊断。它让「本次 acquire 是该 root 的第几次取权」可读
// （日志/排查，并作为 core `binding.leaseGeneration` 的取值来源）。它**不是**
// fencing token：没有「按代际判定失权」的路径（判据与代价见 contracts.ts）。

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function corruptLease(leasePath: string, detail: string): SoloipsAdapterError {
  return new SoloipsAdapterError(
    "SOLOIPS_ADAPTER_LEASE_NOT_HELD",
    `writer-lease medium '${leasePath}' is corrupt (${detail}); refusing to guess the last generation`,
  );
}

/** 读取租约文件中的上一代计数；缺失视为 0；结构不合法即拒绝（fail-closed）。
 *
 * 〔为什么坏值必须拒绝而不是重置为 0〕该计数是诊断事实（「本根第几次取权」）；
 * 静默归零会让日志/排查读到错误的代际。拒绝的代价有界：介质可修，修好后
 * acquire 照常（锁已在失败路径上被 `withFileLock` 的 `finally` 释放）。
 */
function readPreviousGeneration(raw: string, leasePath: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw corruptLease(leasePath, "not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw corruptLease(leasePath, "not an object");
  }
  const record = parsed as Record<string, unknown>;
  const generation = record["generation"];
  if (typeof generation !== "number" || !Number.isSafeInteger(generation) || generation < 0) {
    throw corruptLease(leasePath, "generation is not a non-negative integer");
  }
  return generation;
}

/**
 * 在**已持锁**窗口内自增并原子提交代际计数，返回新代际。
 *
 * 〔约束〕只在 `withFileLock` 的回调内调用：读-改-写必须落在那把跨进程锁的
 * 窗口里，否则两次并发 acquire 可能读到同一 previous。这里不做二次校验——
 * 调用点是唯一的（acquire 的锁回调），加了也只是重复锁的保证。
 */
async function bumpGeneration(leasePath: string): Promise<number> {
  let previous = 0;
  try {
    const raw = await readFile(leasePath, "utf8");
    previous = readPreviousGeneration(raw, leasePath);
  } catch (error: unknown) {
    if (!isErrnoException(error) || error.code !== "ENOENT") {
      throw error;
    }
  }
  const generation = previous + 1;
  await writeFileAtomic(leasePath, `${JSON.stringify({ generation })}\n`, { mode: 0o600 });
  return generation;
}

function mapLeaseAcquireError(root: string, error: unknown): SoloipsAdapterError | TypeError {
  if (error instanceof SoloipsAdapterError || error instanceof TypeError) return error;
  return new SoloipsAdapterError(
    "SOLOIPS_ADAPTER_LEASE_NOT_HELD",
    `could not acquire the cross-process writer lease for '${root}' (held elsewhere or timed out): ${
      error instanceof Error ? error.message : "non-error failure"
    }`,
    { cause: error },
  );
}

// ── 端口 ──────────────────────────────────────────────────────────────────────

/** 构造 storage 端口。纯对象构造：只捕获 ctx 与解析后的配置，不触达宿主资源。 */
export function createStoragePort(ctx: Context, config: StoragePortConfig): SoloipsStoragePort {
  return {
    /**
     * 取得跨进程写权租约（机制面；core 负责策略：装载可写 domain/缓存之前取，
     * 每个持久发布点之前 `assertHeld()`）。
     *
     * 互斥语义：锁窗口横跨整个租约生命周期（acquire 建立 → `dispose()` 删除）。
     * 争用者在 `leaseWaitMs` 内重试；超时即 `SOLOIPS_ADAPTER_LEASE_NOT_HELD`
     * （fail-closed，不接管、不回收他人的锁）。
     */
    acquireWriterLease(options: { readonly root: string }): Promise<SoloipsWriterLease> {
      // 全路径（含入参校验）都在 async 体内：失败以 rejected promise 呈现，
      // 不向调用方抛同步异常（契约方法返回 Promise）。
      const acquisition = (async (): Promise<SoloipsWriterLease> => {
        const root = canonicalRoot(options.root);
        const leasePath = join(root, LEASE_FILE_NAME);
        const storageId = storageIdOf(config.defaultBackend, root);
        // withFileLock 要求父目录存在；数据根本身由 backend/租约共同使用。
        //
        // 〔D-5〕失败必须收敛为契约码：core 的启动序是 lease → createStack
        // （`packages/core/src/store.ts` 的 openSoloipsCompanyStore），故对
        // 「root 不可创建」**首个失败点就是这里**。裸 `mkdir` 的 ErrnoException
        // （ENOTDIR/EACCES…）会让调用方拿到与 backend 侧不同的错误形态；本端口
        // 已在 `acquireWriterLease` 的其余失败路径上统一用契约码（见
        // `mapLeaseAcquireError`），此处与之一致。码取 SERVICE_UNAVAILABLE：
        // root 的值形状已由 `canonicalRoot` 校验（INVALID_CONFIG 只用于那一层），
        // 环境层失败沿用本端口对「不可用」的既有口径。
        try {
          await mkdir(root, { recursive: true });
        } catch (error: unknown) {
          throw mapHostError(`storage.lease.acquire('${root}')`, error);
        }
        let signalAcquired!: (generation: number) => void;
        const acquired = new Promise<number>((resolveAcquired) => {
          signalAcquired = resolveAcquired;
        });
        let releaseLock!: () => void;
        const lockHeld = withFileLock(
          leasePath,
          async () => {
            const generation = await bumpGeneration(leasePath);
            signalAcquired(generation);
            // 持锁直到 dispose：锁窗口横跨整个租约生命周期。
            await new Promise<void>((resolveHold) => {
              releaseLock = resolveHold;
            });
          },
          { waitMs: config.leaseWaitMs },
        );
        let generation: number;
        try {
          generation = await new Promise<number>((resolve, reject) => {
            void acquired.then(resolve, reject);
            void lockHeld.then(() => {
              reject(
                new SoloipsAdapterError(
                  "SOLOIPS_ADAPTER_LEASE_NOT_HELD",
                  `writer lease for '${root}' ended before it was acquired`,
                ),
              );
            }, reject);
          });
        } catch (error: unknown) {
          throw mapLeaseAcquireError(root, error);
        }
        let disposed = false;
        return {
          generation,
          storageId,
          /**
           * 〔不变量〕只要锁在手，写权就还在手——互斥由 `withFileLock` 的
           * 锁窗口保证（它横跨到 dispose），本方法因此只需回答「本 lease 是否
           * 已被释放」。
           *
           * 〔为什么**不**重读租约文件比对 generation〕那是把代际当 fencing
           * token 的路线，本实现不采用（理由见 contracts.ts 的
           * `SoloipsWriterLease` 注释）：在本锁窗口内重读只会读到自己的值，
           * 而一旦锁被别人取走，本 lease 早已不可写。代价（写路径上每个发布点
           * 一次文件读 + 新的失败模式）换不到任何互斥强度。
           */
          assertHeld(): Promise<void> {
            if (disposed) {
              return Promise.reject(
                new SoloipsAdapterError(
                  "SOLOIPS_ADAPTER_LEASE_NOT_HELD",
                  `writer lease for '${root}' (generation ${generation}) was already disposed`,
                ),
              );
            }
            return Promise.resolve();
          },
          dispose: async () => {
            // 幂等早返：重复调用无副作用（唯一的「不抛错」例外，见代码规范）。
            if (disposed) return;
            disposed = true;
            // 释放锁 → withFileLock 的 finally 删除 `.lock` 兄弟文件；
            // 此后本 root 可被任何进程重新 acquire（代际 +1）。
            releaseLock();
            try {
              await lockHeld;
            } catch (error: unknown) {
              throw mapHostError(`storage.lease.dispose('${root}')`, error);
            }
          },
        };
      })();
      return acquisition;
    },

    /** 用同一个 canonical root 构造 backend 与 facility（SEAM-11）。 */
    // oxlint-disable-next-line typescript/require-await -- 契约返回 Promise（SoloipsStoragePort.createStack）；构造全同步，但校验失败必须是 rejection 而非同步抛出
    async createStack(options: SoloipsStorageStackOptions): Promise<SoloipsStorageStack> {
      const backend = options.backend ?? config.defaultBackend;
      if (!CONSTRUCTIBLE_BACKENDS.includes(backend as "json" | "sqlite")) {
        throw new SoloipsAdapterError(
          "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
          `backend '${backend}' is not constructible by this adapter (only ${CONSTRUCTIBLE_BACKENDS.join(", ")}); the stack requires a backend built from the same canonical root`,
        );
      }
      const root = canonicalRoot(options.root);
      const storage = ctx.get("storage");
      if (storage === undefined) {
        throw new SoloipsAdapterError(
          "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
          "host service 'storage' is not available",
        );
      }
      const registryName = `soloips-${backend}-${createHash("sha256").update(root).digest("hex").slice(0, 16)}`;

      // 根据 backend 类型创建对应的存储后端
      let backendInstance: StorageBackend;
      if (backend === "sqlite") {
        backendInstance = new SqliteStorageBackend(root);
      } else {
        backendInstance = new JsonStorageBackend(root);
      }

      let unregister: () => void;
      try {
        unregister = storage.backend.register(registryName, backendInstance);
      } catch (error: unknown) {
        throw mapHostError(
          `storage.createStack: registering backend '${registryName}' for root '${root}'`,
          error,
        );
      }
      const facility = new DomainFacility(ctx, { backend: registryName });
      let disposed = false;
      return {
        facility: new SoloipsDomainFacilityWrapper(facility),
        binding: { backend, root, storageId: storageIdOf(backend, root) },
        dispose: async () => {
          if (disposed) return;
          disposed = true;
          try {
            // 逆序释放：facility → backend（SEAM-14）。
            try {
              await facility.closeAll();
            } finally {
              unregister();
              await backendInstance.close();
            }
          } catch (error: unknown) {
            throw mapHostError(`storage.stack.dispose('${root}')`, error);
          }
        },
      };
    },

    /**
     * SEAM-X1：facility 实参必填（类型层 TS2554 已由契约签名强制）；
     * `undefined` 在运行期同样以 `SOLOIPS_ADAPTER_FACILITY_REQUIRED` 拒绝。
     * 本端口**没有** `storageDomain` 成员，也不做任何 `ctx.storageDomain` 回退。
     */
    requireFacility(facility: SoloipsDomainFacility | undefined): SoloipsDomainFacility {
      if (facility === undefined) {
        throw new SoloipsAdapterError(
          "SOLOIPS_ADAPTER_FACILITY_REQUIRED",
          "a facility must be passed explicitly (from SoloipsStorageStack.facility); there is no ctx.storageDomain fallback (SEAM-X1)",
        );
      }
      return facility;
    },
  };
}

// 静态自检：宿主 open 的返回类型确由擦除视图覆盖（防止上游签名漂移静默通过）。
type AssertErasedDomainCoversHost = Domain<DomainSpec> extends ErasedHostDomain ? true : never;
const assertErasedDomainCoversHost: AssertErasedDomainCoversHost = true;
void assertErasedDomainCoversHost;
