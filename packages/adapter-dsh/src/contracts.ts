/**
 * SOLOIPS-ADAPTER-CONTRACTS
 *
 * soloips-adapter-dsh 的内部契约面：core 与 adapter 之间**唯一**的依赖面。
 *
 * 状态：**〔已冻结〕** Lead 2026-09-16 裁定，冻结范围 = 设计文档 §7.1 的 11 组类型。
 *       §7.2 条目（`SoloipsTeamPort` 全体、subagent 高级方法、
 *       `SoloipsToolDefinition.output.render`、`SoloipsAdapterReadiness` 字段、
 *       `SoloipsAdapterConfig.teamEnabled`）仍可演进，**不得被批 2 依赖**。
 *
 * 不变量：
 *  - 本文件不得 import 任何 `@deepseek-ai/*` 能力包。唯一的宿主 ABI 依赖是
 *    `@deepseek-ai/cordis` 的 `Context`（type-only），见设计文档 §3.2(a) 的 DEV-04 解释。
 *  - 本文件不持有任何业务 domain handle，也不 open 任何 domain。
 *  - 所有 id 类型为 adapter 自有的不透明品牌类型，core 不需要 DSH 的品牌包。
 *
 * 编译验证：本文件在 DEV-02 严格基线下通过类型检查（设计探针 P1/P8）。
 *
 * 依据：docs/reference/rewrite-seam-client.md SEAM-01/02/04/05/06/07/08/09、
 *       docs/governance/code-development-standard.md DEV-04/DEV-05、
 *       docs/technical-architecture.md §5.1/§7.2/§7.10。
 */

// ─────────────────────────────────────────────────────────────────────────────
// §0 基础设施：品牌类型、结果类型、错误
// ─────────────────────────────────────────────────────────────────────────────

declare const soloipsBrand: unique symbol;

/** adapter 自有的不透明品牌类型；core 只当作不可构造的字符串别名使用。 */
export type SoloipsBranded<Name extends string> = string & { readonly [soloipsBrand]: Name };

/** 一次持久化会话的身份。 */
export type SoloipsSessionId = SoloipsBranded<"SoloipsSessionId">;

/**
 * 一次持久化观察的**不透明修订令牌**。
 *
 * 〔破坏性变更，2026-09-17〕原为 `number`。宿主 `SessionPersistenceRevision` 实际是
 * backend 铸造的**不透明字符串品牌**（`dsh-session-persistence/lib/types/revision.d.ts`），
 * 不存在保真的 string→number 映射；原实现用 sha256 折叠到 53 位整数，把**精确的身份比较
 * 降为概率性比较**（碰撞即「已变化」被误判为「未变化」），没有必要承担该损失。
 *
 * 现改为 SoloIPs 自有的不透明品牌：adapter 在边界保留宿主 token 的**完整字符串**，
 * 消费者（core 等）只依赖本契约，不需要 DSH 品牌包。
 *
 * 〔语义〕仍只可与**同一服务实例、同一 id** 的 revision 比较——单一品牌本身不保证这点。
 * 变更性质：返回类型变更属 §7.1 的破坏性变更，须队长确认并通知全部消费方
 * （当时 core 已实现但**零使用**该字段，迁移成本为零）。
 */
export type SoloipsRevision = SoloipsBranded<"SoloipsRevision">;

/** 把一个 backend 铸造的不透明令牌装箱为契约品牌；adapter 边界专用。 */
export function SoloipsRevision(token: string): SoloipsRevision {
  return token as SoloipsRevision;
}
/** 一个 domain 记录变更事件的顺序号（不透明）。 */
export type SoloipsSessionLogOffset = number & {
  readonly [soloipsBrand]: "SoloipsSessionLogOffset";
};

/** adapter 契约的稳定错误码；core 只 switch 这些值，不解析 message。 */
export type SoloipsAdapterErrorCode =
  /** adapter 行被 `enabled: false` 关闭，服务未发布。 */
  | "SOLOIPS_ADAPTER_DISABLED"
  /** 操作所需的宿主服务当前不可用（缺失或未激活）。 */
  | "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE"
  /** 调用方未显式提供 facility；**不存在** `ctx.storageDomain` 回退。 */
  | "SOLOIPS_ADAPTER_FACILITY_REQUIRED"
  /** 写权窗口未持有或已失权，拒绝持久发布。 */
  | "SOLOIPS_ADAPTER_LEASE_NOT_HELD"
  /** 同一 facility 实例内该 domain 名已被打开。 */
  | "SOLOIPS_ADAPTER_DOMAIN_ALREADY_OPEN"
  /** 配置未通过校验。 */
  | "SOLOIPS_ADAPTER_INVALID_CONFIG";

/** 结构化的适配层失败。`message` 是诊断文本，`code` 才是契约。 */
export class SoloipsAdapterError extends Error {
  override readonly name = "SoloipsAdapterError";

  constructor(
    readonly code: SoloipsAdapterErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §1 storage-domain 端口（能力 1/5）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 记录 schema 的结构化端口。
 *
 * 只需 `parse` / `safeParse`：这是 DSH domain 层实际消费 schema 的**全部**调用面
 * （storage-domain 0.1.6-alpha.1 的 `src/index.ts:126` 表记录、`:140` global 的
 * null 哨兵检查、`:151` global 记录）。zod 的 `ZodType<T>` 结构上满足本接口，
 * 因此 core 可以传 zod schema 而不必让本文件依赖某个 zod 大版本。
 */
export interface SoloipsValueSchema<T> {
  parse(value: unknown): T;
  safeParse(value: unknown): SoloipsSafeParseResult<T>;
}

/** `safeParse` 的结果；成功/失败判别式与 zod 保持一致。 */
export type SoloipsSafeParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: unknown };

/** global 单例声明：schema 加首次写入前的初值。 */
export interface SoloipsDomainGlobalSpec<G = unknown> {
  readonly schema: SoloipsValueSchema<G>;
  readonly initial: G;
}

/**
 * 一张表声明。`K` 是编译期键类型（通常是品牌字符串），介质上键仍是普通字符串。
 */
export interface SoloipsDomainTableSpec<K extends string = string, V = unknown> {
  readonly valueSchema: SoloipsValueSchema<V>;
  /** 键类型的幽灵载体；运行时永不出现。 */
  readonly __key?: K;
}

/**
 * 一个 domain 的静态声明。
 *
 * 字段与 DSH `DomainSpec` 一一对应（0.1.6-alpha.1 `src/spec.ts:35-72`），
 * 但由 adapter 拥有：DSH 升级时由 adapter 吸收差异，core 不随之改动。
 */
export interface SoloipsDomainSpec {
  /** domain 名；必须匹配 `^[a-z][a-z0-9_]*$`。 */
  readonly name: string;
  /** 当前格式版本；非负整数。 */
  readonly version: number;
  /** 介质布局；缺省 `single`。 */
  readonly layout?: "single" | "per-record";
  /** 当前记录 schema 仍可接受的旧版本号。 */
  readonly compatibleVersions?: readonly number[];
  /** 存量记录校验失败时的策略；缺省为整次 open 拒绝（权威数据的正确默认）。 */
  readonly invalidRecords?: "backup-and-skip";
  /** 可选的 global 单例槽位。 */
  readonly global?: SoloipsDomainGlobalSpec;
  /** 表声明，按表名索引。 */
  readonly tables: Readonly<Record<string, SoloipsDomainTableSpec>>;
}

/** 从表声明中取出键类型。 */
export type SoloipsTableKeyOf<S extends SoloipsDomainSpec, N extends keyof S["tables"]> =
  S["tables"][N] extends SoloipsDomainTableSpec<infer K> ? K : never;

/** 从表声明中取出记录类型。 */
export type SoloipsTableValueOf<S extends SoloipsDomainSpec, N extends keyof S["tables"]> =
  S["tables"][N] extends SoloipsDomainTableSpec<string, infer V> ? V : never;

/**
 * 一张已打开表的句柄。
 *
 * 返回的记录是介质中的原对象（无防御性拷贝），调用方**不得原地修改**；
 * 变更一律经 `put` / `update`。
 */
export interface SoloipsKvTable<K extends string, V> {
  /** 同步读一条记录。 */
  get(key: K): V | undefined;
  /** 快照迭代 `[key, record]`；迭代期间排队的写入不会改变本次迭代。 */
  entries(): IterableIterator<[K, V]>;
  /** 快照迭代键。 */
  keys(): IterableIterator<K>;
  /** 当前记录数。 */
  readonly size: number;
  /** 插入或覆盖一条记录，返回持久化完成后。 */
  put(key: K, value: V): Promise<void>;
  /** 删除一条记录；返回该记录此前是否存在。 */
  delete(key: K): Promise<boolean>;
  /**
   * 单条记录的原子读改写，排队在该 domain 的唯一写链上：
   * `fn` 看到的是它排队槽位上的当前值，并发更新不会交错。
   * 键缺失时以 `missing-key` 拒绝。
   */
  update(key: K, fn: (current: V) => V): Promise<V>;
}

/** global 单例句柄。 */
export interface SoloipsDomainGlobal<G> {
  get(): G;
  set(value: G): Promise<void>;
}

/** spec 有 global 时的句柄类型；没有时不可访问。 */
export type SoloipsDomainGlobalHandleOf<S extends SoloipsDomainSpec> = S extends {
  readonly global: SoloipsDomainGlobalSpec<infer G>;
}
  ? SoloipsDomainGlobal<G>
  : never;

/** 一个已打开的 domain，由 spec 定型。 */
export interface SoloipsDomain<S extends SoloipsDomainSpec> {
  readonly name: string;
  readonly global: SoloipsDomainGlobalHandleOf<S>;
  table<N extends keyof S["tables"] & string>(
    name: N,
  ): SoloipsKvTable<SoloipsTableKeyOf<S, N>, SoloipsTableValueOf<S, N>>;
  /**
   * 关闭该 domain：立即拒绝新写入，排空已排队写入，释放后端单元，
   * 然后释放域名供后续 open。幂等。
   */
  close(): Promise<void>;
}

/**
 * domain facility 端口。
 *
 * **唯一 opener 语义**：同一 facility 实例内，每个 domain 名只允许一个 opener；
 * 第二次 open 以 `SOLOIPS_ADAPTER_DOMAIN_ALREADY_OPEN` 拒绝。
 * 这只是**同实例**保证，不构成跨进程独占（MECH-05、ORG-06）；
 * 跨进程写权由 {@link SoloipsWriterLease} 承担。
 */
export interface SoloipsDomainFacility {
  /**
   * 打开一个已声明的 domain。
   * @throws {SoloipsAdapterError} 该名已被打开，或后端/记录校验失败。
   */
  open<S extends SoloipsDomainSpec>(spec: S): Promise<SoloipsDomain<S>>;
  /** 关闭本 facility 上仍打开的全部 domain。幂等。 */
  closeAll(): Promise<void>;
}

/** 一次持久化 domain 变更；只在后端确认持久化之后发出。 */
export type SoloipsDomainChanged =
  | {
      readonly domain: string;
      readonly table: string;
      readonly key: string;
      readonly operation: "put";
      readonly value: unknown;
    }
  | {
      readonly domain: string;
      readonly table: string;
      readonly key: string;
      readonly operation: "deleted";
    };

// ─────────────────────────────────────────────────────────────────────────────
// §2 写权（跨进程 fence）端口（能力 1/5 的守卫面）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 跨进程写权租约。
 *
 * 这是 ORG-06 / SOLO-FENCE-01 在 adapter 侧的机制面。core 负责**策略**：
 * 在装载任何可写 domain/缓存之前取得租约，并在每个持久发布点前复核。
 *
 * 〔互斥由谁保证〕`acquireWriterLease` 底层是 `dsh-atomic-write` 的
 * `withFileLock`：`wx` 独占创建 `<lease>.lock` 兄弟文件，且持锁窗口**横跨整个
 * 租约生命周期**——acquire 时建立、`dispose()` 时才删除。同一 root 上的第二个
 * 取权者在等待上限内重试，超时即以 `SOLOIPS_ADAPTER_LEASE_NOT_HELD` 失败；
 * 持有者不受干扰（失败方不接管、不回收他人的锁）。
 *
 * 〔`generation` 不是 fencing token〕它只是**诊断**信息：本 root 的第几次取权，
 * 用于日志/排查与 `SoloipsCoreBinding.leaseGeneration` 的取值。实现**没有**
 * 「按代际判定失权」的路径。这不是省略，而是刻意的边界：
 *  - 无需判定：锁窗口本身覆盖了写权全生命周期。锁还在手即写权还在手；锁一旦
 *    被别人取走，本 lease 的 `dispose()` 之外的写路径已不成立。
 *  - 判不了：要「按代际判定」就得在每次复核时重读租约文件，而重读只会读到
 *    自己写下的值（锁在手，别人改不了）——它不能比锁本身更早知道失权。
 *  - 代价真实：写路径上每个发布点一次文件读 + 新的失败模式（介质瞬时不可读即
 *    误判失权），换不到互斥强度。
 * 因此 `assertHeld()` 只回答「本 lease 是否已被释放」（同进程内重复使用已释放
 * 的 lease 是真实场景，`disposed` 布尔覆盖它）。
 *
 * 〔禁止〕不得用进程内 `Map`、`already-open` 或单次原子 rename 代替本租约
 * （SEAM-X2、MECH-05）。
 */
export interface SoloipsWriterLease {
  /**
   * 本次取得的代际计数；**诊断用**（本 root 第几次取权，写入租约文件）。
   * 不参与失权判定——失权检测见接口说明；不得据本字段推断写权归属。
   */
  readonly generation: number;
  /** 规范化后的存储身份（backend + 解析后根），用于日志与绑定核对。 */
  readonly storageId: string;
  /**
   * 复核写权仍在手；已释放（或本 lease 未取得）时以
   * `SOLOIPS_ADAPTER_LEASE_NOT_HELD` 抛出。
   * 调用方必须在**每次持久发布之前**调用，而不是只在启动时调用一次。
   *
   * 〔语义边界〕它证明的是「本 lease 未被释放」；跨进程互斥由锁窗口保证
   * （见接口说明），不由本方法的返回值承载。
   */
  assertHeld(): Promise<void>;
  /** 释放租约（含锁文件）。幂等；重复调用无副作用。 */
  dispose(): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 会话端口（能力 2/5）
// ─────────────────────────────────────────────────────────────────────────────

/** 一次已存储会话的轻量观察，不读事件日志。 */
export interface SoloipsSessionSnapshot {
  readonly id: SoloipsSessionId;
  /** 不透明变更令牌；只可与同一服务实例、同一 id 的 revision 比较。 */
  readonly revision: SoloipsRevision;
  readonly eventCount?: number;
  readonly sizeBytes?: number;
}

/** 会话访问模式。 */
export type SoloipsSessionAccess = "read" | "write";

/** 一次会话日志读取的结果。 */
export interface SoloipsSessionReadResult {
  /** 自 seq 0 起连续的、已校验的事件。 */
  readonly events: readonly SoloipsSessionEvent[];
}

/** 一条会话事件。core 只按 `type` 与 `data` 消费，不解析 DSH 私有字段。 */
export interface SoloipsSessionEvent {
  readonly type: string;
  readonly seq: number;
  readonly time: number;
  readonly data: unknown;
}

/**
 * 一个已打开会话的句柄。
 *
 * 生命周期：**调用方**拥有本句柄并负责 `close()`（通常作为自己的 `ctx.effect`
 * disposer）；adapter 不把会话绑到任何消费者 fiber。
 */
export interface SoloipsSessionHandle {
  readonly id: SoloipsSessionId;
  readonly access: SoloipsSessionAccess;
  /** 自 `offset` 起读取事件；`length` 限定条数。 */
  read(offset?: number, length?: number): Promise<SoloipsSessionReadResult>;
  /** 追加事件；`flush` 才是持久性屏障。 */
  append(events: readonly SoloipsSessionEvent[]): Promise<void>;
  /** 持久性屏障。 */
  flush(): Promise<void>;
  /** 释放句柄；`write` 句柄释放写所有权。 */
  close(): Promise<void>;
}

/** 会话持久化端口。 */
export interface SoloipsSessionPersistence {
  /** 新建会话并取得其写所有权。 */
  create(id: SoloipsSessionId): Promise<SoloipsSessionHandle>;
  /**
   * 打开已有会话。
   *
   * `read` 从不取得所有权；`write` 原子地声明单写者所有权，已有活跃所有者时拒绝。
   * 〔边界〕这是**进程内**语义，不构成跨进程 fence。
   */
  open(id: SoloipsSessionId, access: SoloipsSessionAccess): Promise<SoloipsSessionHandle>;
  /** 观察一个已存储会话；不存在时返回 `undefined`。 */
  stat(id: SoloipsSessionId): Promise<SoloipsSessionSnapshot | undefined>;
  /** 列出本进程可见的全部已存储会话。 */
  list(): Promise<readonly SoloipsSessionSnapshot[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 子智能体端口（能力 3/5）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 一个**精确的活跃** Agent 引用。
 *
 * 这是权威凭证：`sendMessage` / `interrupt` 要求调用方出示真实执行上下文中的
 * Agent，而不是界面传来的 id（SOLO-TEAM-03、ORG-05）。
 * core 不能构造本类型，只能经 {@link SoloipsAgentsPort} 解析。
 */
export interface SoloipsAgentRef {
  readonly sessionId: SoloipsSessionId;
}

/** Agent 注册表端口：把会话身份解析为权威 Agent 引用。 */
export interface SoloipsAgentsPort {
  /** 解析一个活跃 Agent；不在活跃表时返回 `undefined`。 */
  get(id: SoloipsSessionId): SoloipsAgentRef | undefined;
  /** 当前活跃 Agent 的快照。 */
  list(): readonly SoloipsAgentRef[];
}

/** 一次子智能体运行的终态原因。 */
export type SoloipsSubagentStopReason =
  "completed" | "aborted" | "error" | "max-tokens" | "refusal";

/** 一次子智能体运行的终态结果。 */
export interface SoloipsSubagentResult {
  readonly stopReason: SoloipsSubagentStopReason;
  /** 子智能体最后一条非空 assistant 消息的内容；无则空数组。 */
  readonly output: readonly SoloipsContentBlock[];
  /** 已校验的结构化结果；请求了 outputSchema 也不保证存在。 */
  readonly structured?: unknown;
  /** provider 撰写的、非 assistant 的失败细节；已去敏。 */
  readonly diagnostic?: string;
}

/** 一条模型可见内容块。core 只构造文本块，其余类型由 adapter 透传。 */
export interface SoloipsContentBlock {
  readonly type: string;
  readonly [key: string]: unknown;
}

/** 建立可接续子智能体的请求。 */
export interface SoloipsContinuableStartSpec {
  /** provider 名（如 `spawn` / `fork`）；**不是**模型 API 路由。 */
  readonly provider: string;
  /** 初始委派的短标签，作为子智能体的创建标签持久化。 */
  readonly label: string;
  /** 调用方预留的子身份；省略则由 adapter 分配。 */
  readonly childId?: SoloipsSessionId;
  /** 交付给子智能体的初始内容。 */
  readonly prompt: readonly SoloipsContentBlock[];
  /** 委派父 Agent（权威凭证）。 */
  readonly parent: SoloipsAgentRef;
  /** 调用方取消；只在 inbox 接受之前拥有该操作。 */
  readonly signal: AbortSignal;
}

/** 可接续子智能体接受初始 prompt 后返回的身份。 */
export interface SoloipsContinuableStart {
  /** 持久的子会话 id，跨激活稳定。 */
  readonly childId: SoloipsSessionId;
  /** 被接受的初始 prompt 的 inbox 消息 id。 */
  readonly messageId: string;
}

/** 一个已发布的子智能体运行句柄（一次性委派）。 */
export interface SoloipsSubagentRun {
  readonly id: SoloipsSessionId;
  readonly result: Promise<SoloipsSubagentResult>;
  /** 取消剩余工作并释放资源。幂等。 */
  dispose(): Promise<void>;
}

/** 中断请求的授权来源。 */
export type SoloipsSubagentInterruptAuthority =
  | { readonly kind: "user"; readonly parentSessionId: SoloipsSessionId }
  | { readonly kind: "ancestor"; readonly agent: SoloipsAgentRef };

/** 子智能体直接子项的一条列表项。 */
export interface SoloipsSubagentListEntry {
  readonly id: SoloipsSessionId;
  readonly parentId: SoloipsSessionId;
  readonly label?: string;
  readonly provider?: string;
}

/**
 * 子智能体端口。
 *
 * 全部方法在 adapter 内部转发到 DSH `ctx.subagents`（0.1.6-alpha.1 的
 * `SubagentRuntime`）。core 不 import `@deepseek-ai/dsh-subagent`。
 */
export interface SoloipsSubagentPort {
  /** 建立可接续子智能体并交付初始 prompt。 */
  startContinuable(spec: SoloipsContinuableStartSpec): Promise<SoloipsContinuableStart>;
  /** 启动一次性子智能体委派。 */
  start(provider: string, spec: SoloipsContinuableStartSpec): Promise<SoloipsSubagentRun>;
  /** 向直接父/直接子投递一条模型撰写的消息。 */
  sendMessage(
    sender: SoloipsAgentRef,
    targetId: SoloipsSessionId,
    content: readonly SoloipsContentBlock[],
    options: { readonly signal: AbortSignal },
  ): Promise<string>;
  /** 中断一个活跃可接续子智能体的当前回合。 */
  interrupt(targetSessionId: SoloipsSessionId, authority: SoloipsSubagentInterruptAuthority): void;
  /** 枚举某父会话的直接子项，不加载或恢复 Agent。 */
  listChildren(
    parentSessionId: SoloipsSessionId,
    signal?: AbortSignal,
  ): Promise<readonly SoloipsSubagentListEntry[]>;
  /** 枚举根会话的完整子智能体树（稳定前序）。 */
  listDescendants(
    rootSessionId: SoloipsSessionId,
    signal?: AbortSignal,
  ): Promise<readonly SoloipsSubagentListEntry[]>;
  /** 当前已注册的 provider 名，按注册顺序。 */
  listProviders(): readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 模型工具端口（能力 4/5）
// ─────────────────────────────────────────────────────────────────────────────

/** JSON Schema 的宽松表示；adapter 在边界做实际校验。 */
export type SoloipsJsonSchema = Readonly<Record<string, unknown>>;

/** 一个工具的参数面。 */
export interface SoloipsToolSchema {
  readonly name: string;
  readonly description: string;
  readonly parameters: SoloipsJsonSchema;
}

/** 工具成功返回值的规范化输出契约。 */
export interface SoloipsToolOutput {
  readonly schema: SoloipsJsonSchema;
  /** 纯投影：由已校验参数与值渲染出模型可见内容。 */
  render(args: unknown, value: unknown): readonly SoloipsContentBlock[];
}

/** 一次工具派发的调用上下文。 */
export interface SoloipsToolRunContext {
  /** 调用方 Agent（权威凭证）。 */
  readonly agent: SoloipsAgentRef;
  /** 调用取消信号；异步闸门必须观察它。 */
  readonly signal: AbortSignal;
  /** 本次调用的稳定 id。 */
  readonly callId: string;
}

/** 一个已注册工具。 */
export interface SoloipsToolDefinition extends SoloipsToolSchema {
  readonly output: SoloipsToolOutput;
  execute(args: unknown, exec: SoloipsToolRunContext): Promise<unknown>;
}

/** 某个作用域对全局工具的过滤；多个限制取交集。 */
export interface SoloipsToolRestriction {
  readonly allow?: readonly string[];
  readonly deny?: readonly string[];
}

/**
 * 单调执行守卫：在全部 pre-execute 监听之后、工具体之前求值。
 * 返回拒绝原因即拒绝该调用；返回 `undefined` 表示不改变结果。
 * 因为守卫没有 allow 结果，监听顺序不能把拒绝翻回允许。
 */
export type SoloipsToolGuard = (
  exec: SoloipsToolRunContext & { readonly name: string },
) => string | undefined;

/** 工具对模型的呈现模式。 */
export type SoloipsToolPresentationMode = "native" | "ptc" | "both";

/**
 * 模型工具端口。
 *
 * 每个注册方法都返回 disposer，并且注册本身是 effect 作用域的：
 * 拥有 fiber 卸载时自动回收。
 */
export interface SoloipsToolsPort {
  /** 注册一个工具；重名在同作用域内失败。 */
  register(definition: SoloipsToolDefinition): () => void;
  /** 施加一个作用域限制。 */
  restrict(filter: SoloipsToolRestriction): () => void;
  /** 注册一个单调守卫。 */
  guard(guard: SoloipsToolGuard): () => void;
  /** 覆盖本作用域的呈现模式。 */
  presentAs(mode: SoloipsToolPresentationMode): () => void;
  /** 按名解析可见工具。 */
  get(name: string): SoloipsToolDefinition | undefined;
  /** 当前可见工具名，按呈现顺序。 */
  names(): readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 事件端口（能力 5/5）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * adapter 拥有的事件词表。
 *
 * 设计意图：core 订阅 `soloips:*`，**不**订阅 DSH 原生事件名。
 * adapter 负责把 DSH 事件转译成本词表，因此 DSH 事件改名只影响 adapter。
 */
export interface SoloipsEventMap {
  /** 某个 domain 记录或 global 单例已持久变更。 */
  "soloips:domain/changed": (change: SoloipsDomainChanged) => void;
  /** 一个子智能体运行被发布。 */
  "soloips:subagent/start": (info: {
    readonly runId: string;
    readonly childId: SoloipsSessionId;
    readonly provider: string;
  }) => void;
  /** 一个已发布的子智能体运行已结算。 */
  "soloips:subagent/end": (info: {
    readonly runId: string;
    readonly childId: SoloipsSessionId;
    readonly result: SoloipsSubagentResult;
  }) => void;
  /** 一个会话日志增长（已提交的 append 之后）。 */
  "soloips:session/event": (sessionId: SoloipsSessionId, event: SoloipsSessionEvent) => void;
  /** 会话持久性检查点；调用方 await 全部监听。 */
  "soloips:session/flush": (sessionId: SoloipsSessionId) => Promise<void> | void;
  /** 工具集变化（注册/注销/限制变化）。 */
  "soloips:tools/change": () => void;
}

/** adapter 事件端口：core 经此订阅，不直接使用 DSH 事件名。 */
export interface SoloipsEventsPort {
  on<K extends keyof SoloipsEventMap>(name: K, listener: SoloipsEventMap[K]): () => void;
  once<K extends keyof SoloipsEventMap>(name: K, listener: SoloipsEventMap[K]): () => void;
  /** 并行派发并等待全部监听。 */
  parallel<K extends keyof SoloipsEventMap>(
    name: K,
    ...args: Parameters<SoloipsEventMap[K]>
  ): Promise<void>;
  /** 串行派发；首个抛出即中断后续。 */
  serial<K extends keyof SoloipsEventMap>(
    name: K,
    ...args: Parameters<SoloipsEventMap[K]>
  ): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 官方 Team 端口（T08 面；**T02 不冻结**）
// ─────────────────────────────────────────────────────────────────────────────

/** 一个 Team 成员视图。 */
export interface SoloipsTeamMemberView {
  readonly name: string;
  readonly status: "running" | "idle" | "inactive";
  /** 成员当前使用的模型；由 roster 读回，是只读展示字段。 */
  readonly model?: string;
}

/** 一个原生任务视图。 */
export interface SoloipsTeamTaskView {
  readonly id: string;
  readonly subject: string;
  readonly status: "pending" | "in_progress" | "completed" | "deleted";
  readonly owner?: string;
  readonly revision: number;
}

/**
 * 官方 Agent Team 端口。
 *
 * 〔T02 不冻结〕官方 Team 在 0.1.6-alpha.1 仍标注实验能力，且 roster 读回面在
 * fork HEAD `abdfeb48` 刚变更（`TeamMemberView.model` 改为从会话请求头解析）。
 * 本端口在 T08 落地时定稿；在此之前 core 不得依赖它的成员名。
 */
export interface SoloipsTeamPort {
  listMembers(lead: SoloipsAgentRef): readonly SoloipsTeamMemberView[];
  listTasks(lead: SoloipsAgentRef): readonly SoloipsTeamTaskView[];
  sendMessage(
    lead: SoloipsAgentRef,
    target: string,
    content: readonly SoloipsContentBlock[],
  ): Promise<string>;
  createTask(
    lead: SoloipsAgentRef,
    subject: string,
    description: string,
  ): Promise<SoloipsTeamTaskView>;
  updateTask(
    lead: SoloipsAgentRef,
    taskId: string,
    action: "claim" | "complete",
  ): Promise<SoloipsTeamTaskView>;
}

// ─────────────────────────────────────────────────────────────────────────────
// §8 适配层外观（core 注入的唯一服务）
// ─────────────────────────────────────────────────────────────────────────────

/** 解析后的存储根绑定；用于启动绑定清单与诊断。 */
export interface SoloipsStorageBinding {
  /** backend 名（如 `json`）。 */
  readonly backend: string;
  /** 解析后的绝对根路径。 */
  readonly root: string;
  /** 规范化后的存储身份。 */
  readonly storageId: string;
}

/** 建立一个 storage stack 的请求。 */
export interface SoloipsStorageStackOptions {
  /** 存储根。必须是已解析的绝对路径；adapter 不做 home 解析。 */
  readonly root: string;
  /**
   * backend 名；**省略时取 adapter 配置的 `defaultBackend`**
   * （{@link SOLOIPS_ADAPTER_CONFIG_DEFAULTS.defaultBackend}，当前为 `sqlite`），
   * 见 `packages/adapter-dsh/src/ports/storage.ts` 的
   * `options.backend ?? config.defaultBackend`。非本适配层可构造的名字（当前仅
   * `json` / `sqlite`）以 `SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE` 拒绝。
   */
  readonly backend?: string;
}

/**
 * 一个 storage stack：backend + facility 由**同一个** canonical root 构造。
 *
 * 顺序契约（SEAM-11/12/13/14）：core 必须先取得 {@link SoloipsWriterLease}，
 * 再建立本 stack，最后在租约窗口内 open 业务 domain；释放时逆序。
 * 本对象**不 open 任何业务 domain**——那是 core 的唯一 opener 职责。
 */
export interface SoloipsStorageStack {
  /** 显式 facility 句柄；core 必须把它显式传给自己的 domain 打开路径。 */
  readonly facility: SoloipsDomainFacility;
  /** 本次绑定，用于启动绑定清单核对。 */
  readonly binding: SoloipsStorageBinding;
  /** 逆序释放：facility → backend。幂等。 */
  dispose(): Promise<void>;
}

/** adapter 的就绪状态，用于诊断（不承担门禁）。 */
export interface SoloipsAdapterReadiness {
  /** 全部端口当前可用时为 true。 */
  readonly ready: boolean;
  /** 当前缺失的宿主服务名；`ready` 为 true 时为空数组。 */
  readonly missingServices: readonly string[];
  /** 本次 apply 的配置摘要（已去敏，不含路径以外的主机细节）。 */
  readonly config: SoloipsAdapterConfigSummary;
}

/** 配置摘要；用于日志与启动绑定清单，不含凭据。 */
export interface SoloipsAdapterConfigSummary {
  readonly enabled: boolean;
  readonly defaultBackend: string;
  readonly leaseWaitMs: number;
}

/**
 * 适配层外观：core 与 adapter 之间的唯一注入面。
 *
 * 单个服务而非多个：发布是原子的，core 不会看到「一半就绪」的 adapter；
 * 缺任一能力时 core 保持 pending 并在诊断中可见（SOLO-F04 fail-closed）。
 */
export interface SoloipsAdapter {
  /** 端口 1/5：DSH storage-domain。 */
  readonly storage: SoloipsStoragePort;
  /** 端口 2/5：DSH session / session-persistence。 */
  readonly session: SoloipsSessionPersistence;
  /** 端口 3/5：DSH subagent。 */
  readonly subagents: SoloipsSubagentPort;
  /** 端口 4/5：DSH tools。 */
  readonly tools: SoloipsToolsPort;
  /** 端口 5/5：事件转译。 */
  readonly events: SoloipsEventsPort;
  /** Agent 权威解析（subagent 端口的凭证来源）。 */
  readonly agents: SoloipsAgentsPort;
  /** 官方 Team（T08 面，T02 不冻结）。 */
  readonly team: SoloipsTeamPort;
  /** 就绪状态；诊断用。 */
  readiness(): SoloipsAdapterReadiness;
}

/** storage 端口：把 facility 与租约的构造收在 adapter 内。 */
export interface SoloipsStoragePort {
  /**
   * 取得跨进程写权租约。
   *
   * 〔硬约束〕core 必须在装载任何可写 domain/缓存**之前**调用本方法，
   * 并在每个持久发布点之前调用 `assertHeld()`。
   */
  acquireWriterLease(options: { readonly root: string }): Promise<SoloipsWriterLease>;
  /**
   * 用同一个 canonical root 构造 backend 与 facility。
   *
   * 〔硬约束〕facility 只经本方法产生并**显式**传给调用方的 domain 打开路径；
   * 本契约**不提供**任何 `ctx.storageDomain` 回退（SEAM-X1）。
   */
  createStack(options: SoloipsStorageStackOptions): Promise<SoloipsStorageStack>;
  /**
   * 把一个已显式给出的 facility 收窄为本端口类型。
   *
   * 存在的唯一理由：让「facility 必须显式传入」成为**类型层**要求。
   * 传入 `undefined` / 缺省即编译期错误，不是运行期回退。
   */
  requireFacility(facility: SoloipsDomainFacility | undefined): SoloipsDomainFacility;
}

// ─────────────────────────────────────────────────────────────────────────────
// §9 插件配置（SEAM-07 / SEAM-09）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * adapter 的单一配置面（SEAM-09）。
 *
 * 同一 interface 同时承载：loader 行 config（`cordis.patch.yml`）与
 * settings namespace 的 `base` 层。
 */
export interface SoloipsAdapterConfig {
  /**
   * 总开关。`false` 时 `apply` 在任何副作用之前返回（SEAM-07），
   * `soloipsAdapter` 服务不被发布。
   */
  enabled?: boolean;
  /** domain 缺省 backend 名；缺省值见 {@link SOLOIPS_ADAPTER_CONFIG_DEFAULTS}（当前 `sqlite`）。 */
  defaultBackend?: string;
  /** 写权租约等待上限（毫秒）。 */
  leaseWaitMs?: number;
  /**
   * 官方 Team 适配开关（T08 面）。T02 阶段保留字段但无实现。
   */
  teamEnabled?: boolean;
}

/** settings namespace 常量。必须匹配 `^[a-z][a-z0-9-]*$`。 */
export const SOLOIPS_ADAPTER_SETTINGS_NAMESPACE = "soloips-adapter";

/** adapter 在 loader 树中的稳定服务名。 */
export const SOLOIPS_ADAPTER_SERVICE_NAME = "soloipsAdapter";

/** 缺省配置值；schema 与运行时共用，避免两处漂移。 */
export const SOLOIPS_ADAPTER_CONFIG_DEFAULTS: Required<Omit<SoloipsAdapterConfig, "enabled">> & {
  readonly enabled: boolean;
} = {
  enabled: true,
  defaultBackend: "sqlite",
  leaseWaitMs: 5_000,
  teamEnabled: false,
};
