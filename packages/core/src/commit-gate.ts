/**
 * 唯一提交前门（SOLO-ACC-02 的 T03 验收面：「真实业务状态经过唯一提交前门
 * 持久化，并受到跨进程 fence 保护」）。
 *
 * 不变量：
 *  1. 本门是 store 内**唯一**的持久写路径：业务表与操作台账的每次
 *     put/update/delete 都经 {@link SoloipsCompanyPublisher}，而 publisher 在
 *     **每次写之前**都重新 `lease.assertHeld()`——不是只在启动时检查一次
 *     （SOLO-FENCE-01 §2；contracts.ts SoloipsWriterLease 注释）。
 *  2. 意图先行：先落 pending 操作意图，再执行业务写，最后标记 committed。
 *     崩溃在窗口内留下可核对的未决 operationId（ORG-05 操作流程；
 *     SOLO-FENCE-01 §3）。同 domain 的多条写**不构成跨表事务**
 *     （CE-G / DEV-08），部分成功按未决意图核对，不虚构原子性。
 *  3. 幂等：同 operationId 的已提交操作直接重放原结果，不重复执行；
 *     未决操作返回 unknown，调用方不得换 ID 重做（ORG-05）。
 *  4. 本 store 实例内的 commit 串行（进程内请求序）；跨进程互斥**只**由
 *     writer lease 承担——本串行不构成、也不替代跨进程保护（MECH-05）。
 *
 * 〔BE-3 增补〕不变量 3 的**边界**（`schemaVersion` / 未知 kind）：
 *  - 新写入的 operation 记录**一律带** `schemaVersion`（当前词表版本），使
 *    「用哪个版本的 kind 词表解释这条记录」成为记录自身的属性（BE-002）；
 *  - 「同 operationId 重放原结果」**只对已知 kind 成立**。读到本版本不认识的
 *    kind 时返回 `unknown`（而非 `replayed`）：无法证明那条记录的 `result`
 *    形状与调用方期望的 `T` 相符，把它当可重放结果返回等于把未来版本的载荷
 *    按当前类型交给调用方。`unknown` 的方向与 ORG-05 一致（不得换 ID 重做）；
 *  - 未知 kind **不判损坏、不丢弃**：台账是崩溃恢复的核对锚点，「读不懂」
 *    不等于「可忽略」（data-contract §2.1）。
 */

import type {
  SoloipsDomain,
  SoloipsTableKeyOf,
  SoloipsTableValueOf,
  SoloipsWriterLease,
} from "soloips-adapter-dsh/contracts";

import type {
  SoloipsCommandResult,
  SoloipsCommitOutcome,
  SoloipsCommitPreconditionVerdict,
  SoloipsCommitRefusalShape,
  SoloipsEmployeeId,
  SoloipsOperationId,
  SoloipsOperationIntent,
  SoloipsOperationKind,
  SoloipsOperationKindValue,
  SoloipsOperationRecord,
} from "./contracts.js";
import { SOLOIPS_OPERATION_SCHEMA_VERSION } from "./contracts.js";
import { SoloipsCoreError, wrapLeaseFailure } from "./errors.js";
import { SOLOIPS_COMPANY_DOMAIN_SPEC, type SoloipsCompanyTableName } from "./domain.js";

/** 提交门对外暴露的唯一写面：每次调用即一个持久发布点。 */
export interface SoloipsCompanyPublisher {
  put<N extends SoloipsCompanyTableName>(
    table: N,
    key: SoloipsTableKeyOf<typeof SOLOIPS_COMPANY_DOMAIN_SPEC, N>,
    value: SoloipsTableValueOf<typeof SOLOIPS_COMPANY_DOMAIN_SPEC, N>,
  ): Promise<void>;
  update<N extends SoloipsCompanyTableName>(
    table: N,
    key: SoloipsTableKeyOf<typeof SOLOIPS_COMPANY_DOMAIN_SPEC, N>,
    revise: (
      current: SoloipsTableValueOf<typeof SOLOIPS_COMPANY_DOMAIN_SPEC, N>,
    ) => SoloipsTableValueOf<typeof SOLOIPS_COMPANY_DOMAIN_SPEC, N>,
  ): Promise<SoloipsTableValueOf<typeof SOLOIPS_COMPANY_DOMAIN_SPEC, N>>;
  delete<N extends SoloipsCompanyTableName>(
    table: N,
    key: SoloipsTableKeyOf<typeof SOLOIPS_COMPANY_DOMAIN_SPEC, N>,
  ): Promise<boolean>;
}

export interface SoloipsCommitRequest<R extends SoloipsCommitRefusalShape = never> {
  readonly operationId: SoloipsOperationId;
  readonly kind: SoloipsOperationKind;
  readonly employeeId?: SoloipsEmployeeId;
  readonly intent: SoloipsOperationIntent;
  /**
   * 提交槽位内的**前置判定**（可选）：在意图落盘**之前**、于本门的串行槽位上执行。
   *
   * 为什么需要这个钩子（而不是在 `mutate` 里判）：`mutate` 在**意图已落盘之后**
   * 才运行——在那里拒绝会留下一条 `pending` 意图，把「零业务写」变成「零业务写 +
   * 一条未决操作」。而「重复招募总助理」这类拒绝的语义是**什么都没发生**
   * （data-contract §2.4.2「返回可判定的拒绝，而不是再建一条」），不该污染台账、
   * 也不该让后续请求撞上 `unknown`。
   *
   * 放在**槽位内**的理由：判定必须与写入处于同一串行槽位，否则两个并发提交可同时
   * 通过「无有效总助理」的检查（读-判-写之间被另一个提交插入）。经本钩子执行的
   * 判定与 `mutate` 之间**没有其他本地提交可插入**；跨进程由 writer lease 排除。
   *
   * ── 两种拒绝形态（BE-4c 起，**加法**关系）──────────────────────────────────
   *
   * 1. **抛错**（`() => void`）：抛错即整体拒绝，异常**原样冒泡**给调用方——
   *    无意图落盘、无业务写（零业务写）。这是 BE-2/BE-3 的既有形态（唯一性判定
   *    抛 `SOLOIPS_CORE_PRECONDITION`），**语义逐字不变**；
   * 2. **返回拒绝载荷**（`() => SoloipsCommitPreconditionVerdict<R>`）：
   *    `{ ok: false, refusal }` 使 `#commitLocked` **早退**并把 `refusal` 作为
   *    本次 `commit` 的返回值（联合进 `SoloipsCommitOutcome<T> | R`）——同样是
   *    意图落盘前返回，同样零业务写、零新增未决意图。
   *
   * 〔为什么需要第 2 种〕有些命令的「业务拒绝」是**公开返回面的一部分**
   * （`requestWorkEntry` 的 `{status:'refused', reason, gaps}` 有专属判别值与
   * 载荷，调用方按值处理、UI 逐项展示缺项），不能退化成异常。**哨兵异常方案已被
   * 裁定否决**——理由（失败语义 vs 正常结果、类型层不可穷举、与 BE-5 配额拒绝
   * 同构）逐条写在 `contracts.ts` 的 `SoloipsCommitPreconditionVerdict` 注释里，
   * 那是本契约的权威说明处。
   *
   * 〔为什么返回值可以是 `void`〕既有调用方（`createAppointment` 的两条唯一性
   * 分支）传的是 `() => this.#assertX(...)`——返回类型 `void`。契约显式保留
   * `| void` 使那些钩子**逐字**仍可赋值，且它们的推断结果 `R` 保持 `never`
   * （返回类型里不出现 `| never`，见 `SoloipsCommitGate.commit`）。
   *
   * 〔第三分支的预留位（**不实现**）〕部门部长唯一性（data-contract §2.4.4
   * **DL-1**：同一部门至多一条有效 `department_lead`；**DL-2**：换任必须显式）已
   * 裁定归属「BE-4c 或其后首个 core 切片」，落点正是本钩子的**第三个分支**
   * （现为 `general_assistant` / `team_lead` 两分支，见 `store.ts` 的
   * `createAppointment`）。本片**不实现** DL-1/DL-2：它属独立裁定，且实现后
   * 「后写者胜」的既有可见行为会变为拒绝——那是需要单独验收的行为变更。
   *
   * 〔不变量〕本钩子**必须**是同步的：`Verdict | void` 不含 `Promise`（类型层
   * 已拦，实测异步钩子赋值报 TS2322）。若允许异步，`#commitLocked` 会把
   * 「未决的 Promise」当成「无拒绝」而放行，判定静默失效。
   */
  readonly precondition?: () => SoloipsCommitPreconditionVerdict<R> | void;
}

export type SoloipsCommitProbe = "absent" | "replayed" | "unknown";

/**
 * 本版本词表已知的 kind 清单（**封闭**，与 `SoloipsOperationKind` 一一对应）。
 *
 * 〔为什么需要运行期清单〕持久校验器（`src/domain.ts` 的 `openLiteralUnionSchema`）
 * 刻意**放行未知 kind**（否则未来版本的记录会让整次 open 失败、恢复锚点丢失）。
 * 放行的代价是：读面拿到的是 `SoloipsOperationKindValue`（开放联合），而
 * 「能不能把这条记录当成可重放结果返回」需要区分「已知」与「未知」——未知项的
 * `result` 形状无法证明与调用方的 `T` 相符，故只能按 `unknown` 处置。
 *
 * 〔与 kind 联合的同步义务〕本清单是 `SoloipsOperationKind` 的**运行期投影**，
 * 属「三处同步点」之外的第四处（编译器**不**强制本清单覆盖全部成员——`Record`
 * 会强制，`Set` 不会）。
 *
 * 〔清单 ⊆ 联合：类型层钉法〕声明为**数组字面量 + `as const satisfies
 * readonly SoloipsOperationKind[]`**，再由它构造 `Set`。为什么不直接写
 * `new Set<SoloipsOperationKind>([...])`：两者的元素检查等价（拼错一个 kind，
 * 如 `"team.creat"`，两种写法都编译失败——已实测 `error TS2820`），但
 * `satisfies` 把「清单的每一项都必须是联合成员」写成一个**具名声明**，
 * 使这层约束在源码里可读、可被逐项审查，而不是藏在构造器的泛型实参里。
 *
 * 〔清单 ⊇ 联合：由测试承担〕漏加一项会让新增 kind 的记录被当成未知项，表现为
 * 「自己刚写的操作重放时返回 unknown」——那是可观察的失败，不是静默降级；
 * 测试用 `Record<SoloipsOperationKind, true>` 穷举联合，对
 * `knownOperationKinds()` 的投影做**双向相等**断言。
 *
 * 〔为什么必须双向〕`satisfies` 只拦「清单 ⊆ 联合」；「多出联合之外的假项」
 * 在类型层合法（加一次 `as` 即可绕过赋值检查），只能由运行期双向断言拦下
 * （QA 变异 M12 正是这条：`Set` 里塞入 `team.fake-op` 而三门全绿）。
 */
const KNOWN_OPERATION_KIND_LIST = [
  "company.create",
  "department.create",
  "employee.create",
  "appointment.create",
  "appointment.revoke",
  "employee.initialize-memory",
  "employee.verify-capability",
  "employee.record-assembly",
  "document.save",
  "work-entry.request",
  "team.create",
  "team.update-function",
  "team.activate",
  "team.close",
] as const satisfies readonly SoloipsOperationKind[];

const KNOWN_OPERATION_KINDS = new Set<SoloipsOperationKind>(KNOWN_OPERATION_KIND_LIST);

/** 读面 kind 是否属于本版本词表（类型守卫：收窄到封闭联合）。 */
export function isKnownOperationKind(
  kind: SoloipsOperationKindValue,
): kind is SoloipsOperationKind {
  return KNOWN_OPERATION_KINDS.has(kind as SoloipsOperationKind);
}

/** 本版本词表的只读投影（供测试断言与读面消费）。 */
export function knownOperationKinds(): readonly SoloipsOperationKind[] {
  return [...KNOWN_OPERATION_KINDS];
}

export class SoloipsCommitGate {
  readonly #domain: SoloipsDomain<typeof SOLOIPS_COMPANY_DOMAIN_SPEC>;
  readonly #lease: SoloipsWriterLease;
  /** 单写者请求链：同一 store 实例内 commit 串行（进程内序，见文件头注 4）。 */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(
    domain: SoloipsDomain<typeof SOLOIPS_COMPANY_DOMAIN_SPEC>,
    lease: SoloipsWriterLease,
  ) {
    this.#domain = domain;
    this.#lease = lease;
  }

  #operationTable() {
    return this.#domain.table("operation");
  }

  /**
   * 只读探测：同 operationId 的既有结果状态（读操作，不经 fence）。
   *
   * 〔未知 kind 的处置〕返回 `unknown`（而不是 `replayed`）：本版本**无法证明**
   * 那条记录的 `result` 形状与调用方期望的 `T` 相符，故不得当成可重放结果返回
   * （那会把未来版本的载荷当成当前类型的值交给调用方）。`unknown` 的语义正是
   * 「该 operationId 有未决事实、不得换 ID 重做」——方向与 ORG-05 一致。
   *
   * ── 〔BE-4c：**不得**用作提交依据（R-5.2）〕────────────────────────────────
   *
   * 本方法**当前没有任何调用方**（`requestWorkEntry` 曾用它做门外预检，BE-4c 已
   * 删除该调用点——重放识别现在由 `#commitLocked` 在串行槽位内完成）。
   *
   * **外部 probe 禁止**（`organization-full-backend-design-v0.1.md` §6 R-5.2）：
   * 任何命令**不得**先调用本方法、再把结果当作提交依据——那会把「读-判-写」拆成
   * 两个区间，正是 R-5 要消除的窗口（两个并发提交可同时通过同一预检）。
   *
   * 〔为什么保留它〕它是**纯读**诊断面（不经 fence、不写任何东西），可用于
   * 「这条 operationId 现在是什么状态」的排查；删除它会让那种排查只能靠
   * `getOperation` + 手工判读 kind 词表（`isKnownOperationKind` 是判定
   * 「能否重放」的关键，不在读面暴露）。保留的代价是它可能被误用——故本注释
   * 即禁令：**准入判定与任何提交决策都不得引用本方法的返回值**。
   */
  probe(operationId: SoloipsOperationId): SoloipsCommitProbe {
    const existing = this.#operationTable().get(operationId);
    if (existing === undefined) return "absent";
    if (existing.status === "committed" && isKnownOperationKind(existing.kind)) return "replayed";
    return "unknown";
  }

  getOperation(operationId: SoloipsOperationId): SoloipsOperationRecord | undefined {
    return this.#operationTable().get(operationId);
  }

  listPendingOperations(): readonly SoloipsOperationRecord[] {
    const pending: SoloipsOperationRecord[] = [];
    for (const [, record] of this.#operationTable().entries()) {
      if (record.status === "pending") pending.push(record);
    }
    return pending;
  }

  /**
   * 提交一个操作：意图先行 → 业务写 → 提交标记。
   * mutate 收到的 publisher 是唯一的写通道；任何直接表写在类型上不可达
   * （domain 不出本类，store 亦不透出）。
   *
   * 〔为什么是两个重载而不是一个带默认值的签名〕**这是本契约的关键实现细节**，
   * 有实测依据：写成单签名 `commit<T, R extends … = never>(…)` 时，若调用点有
   * **上下文返回类型**（store 里几乎每个命令都是 `return this.#gate.commit(…)`，
   * 返回类型声明为 `Promise<SoloipsCommitOutcome<…>>`），TS 的推断会**优先从
   * 上下文取 `R`**，拿不到候选时**回退到约束** `SoloipsCommitRefusalShape`
   * 而**不是**默认值 `never`——于是返回类型变成 `… | SoloipsCommitRefusalShape`，
   * 与声明不符，**全部 13 个既有调用点编译失败**（实测 `error TS2322` ×13）。
   * 重载把「不携带拒绝载荷」的调用固定到逐字返回 `SoloipsCommitOutcome<T>` 的
   * 签名上，从根上避开该推断行为。
   *
   * 〔重载如何分流〕重载 1 的请求类型是 `SoloipsCommitRequest<never>`——其
   * `precondition` 只接受 `() => { ok: true } | never | void`，故返回拒绝载荷的
   * 钩子**不能**赋值给它（`Verdict<MyRefusal>` 不 assignable 到 `Verdict<never>`），
   * 必然落到重载 2。无钩子与 `void` 钩子（含 BE-2/BE-3 的抛错形态）则命中重载 1。
   *
   * 〔加法保证〕重载 1 使既有调用点的返回类型**逐字不变**（`IsExactly` 断言已
   * 实测通过），因此本扩展对既有命令是**纯加法**：一行不改、返回类型不变。
   */
  async commit<T extends SoloipsCommandResult>(
    request: SoloipsCommitRequest<never>,
    mutate: (publish: SoloipsCompanyPublisher) => Promise<T>,
  ): Promise<SoloipsCommitOutcome<T>>;
  async commit<T extends SoloipsCommandResult, R extends SoloipsCommitRefusalShape>(
    request: SoloipsCommitRequest<R>,
    mutate: (publish: SoloipsCompanyPublisher) => Promise<T>,
  ): Promise<SoloipsCommitOutcome<T> | R>;
  async commit<T extends SoloipsCommandResult, R extends SoloipsCommitRefusalShape>(
    request: SoloipsCommitRequest<R>,
    mutate: (publish: SoloipsCompanyPublisher) => Promise<T>,
  ): Promise<SoloipsCommitOutcome<T> | R> {
    const outcome = this.#queue.then(() => this.#commitLocked(request, mutate));
    // 串行链只用于排序，失败不阻塞后续请求（每次 commit 各自携带结果/异常）。
    this.#queue = outcome.catch(() => undefined);
    return outcome;
  }

  async #commitLocked<T extends SoloipsCommandResult, R extends SoloipsCommitRefusalShape>(
    request: SoloipsCommitRequest<R>,
    mutate: (publish: SoloipsCompanyPublisher) => Promise<T>,
  ): Promise<SoloipsCommitOutcome<T> | R> {
    const existing = this.#operationTable().get(request.operationId);
    if (existing !== undefined) {
      // 〔未知 kind〕比较是**字符串比较**（`kind` 是开放联合），故「同 ID 被不同
      // 种类复用」对未知项同样能检出——未知不等于可复用。
      if (existing.kind !== request.kind) {
        throw new SoloipsCoreError(
          "SOLOIPS_CORE_CONFLICT",
          `operationId 已被种类 ${existing.kind} 的操作使用，不能用于 ${request.kind}`,
        );
      }
      if (existing.status === "committed" && isKnownOperationKind(existing.kind)) {
        return { status: "replayed", result: this.#committedResult(existing) as T };
      }
      // 未决，或已提交但 kind 是本版本不认识的（无法证明载荷形状与 T 相符）：
      // 一律 `unknown`——不换 ID 重做、也不把不认识的载荷当 T 返回。
      return { status: "unknown" };
    }

    const publish = this.#createPublisher();

    // 前置判定：在意图落盘**之前**、本门串行槽位之内（零业务写、零未决意图）。
    //
    // 〔顺序契约〕本行在**重放检测之后**——这是既有判定（`updateTeamFunction` /
    // `activateTeam` / `closeTeam` 的「状态相关判定」）所依赖的性质：判定依据会被
    // 成功的执行本身改变（如 `pending → active`），若判定先于重放检测，同
    // operationId 的重放会因「状态已变」而被拒绝，幂等性破坏。
    //
    // 两种拒绝形态都**零业务写、零新增未决意图**（都在意图落盘前）：
    //  - 抛错：异常原样冒泡（既有形态，`createAppointment` 的唯一性判定）；
    //  - 返回 `{ ok: false, refusal }`：早退并把 refusal 作为本次结果返回
    //    （BE-4c；`requestWorkEntry` 的准入拒绝）。`#queue` 的后续请求不受影响
    //    ——早退是**正常返回**，不是异常，故连 `catch` 都不需要。
    const verdict = request.precondition?.();
    if (verdict !== undefined && !verdict.ok) {
      return verdict.refusal;
    }

    // 意图先行（ORG-05：保存必要恢复意图在提交之前）。
    //
    // `schemaVersion` **新写入必须带当前版本**（data-contract §2.1 BE-002：
    // 「新记录不豁免」）：它使「用哪个版本的 kind 词表解释这条记录」成为记录
    // 自身的属性，从而把「kind 联合扩展」从破坏性变更降为兼容性变更。
    await publish.put("operation", request.operationId, {
      id: request.operationId,
      kind: request.kind,
      status: "pending",
      ...(request.employeeId === undefined ? {} : { employeeId: request.employeeId }),
      intent: request.intent,
      schemaVersion: SOLOIPS_OPERATION_SCHEMA_VERSION,
    });

    const result = await mutate(publish);

    await publish.update("operation", request.operationId, (current) => ({
      ...current,
      status: "committed" as const,
      result,
    }));

    return { status: "committed", result };
  }

  #committedResult(record: SoloipsOperationRecord): SoloipsCommandResult {
    if (record.result === undefined) {
      throw new SoloipsCoreError(
        "SOLOIPS_CORE_RECORD_INVALID",
        `操作 ${record.id} 标记为 committed 但缺少结果载荷`,
      );
    }
    return record.result;
  }

  /**
   * publisher：每个持久发布点（put/update/delete）执行前立即复核写权。
   * 失权或状态未知时抛 SoloipsCoreError（LEASE_NOT_HELD / LEASE_CHECK_FAILED），
   * 该次发布不发生。
   */
  #createPublisher(): SoloipsCompanyPublisher {
    const assertLease = async (): Promise<void> => {
      try {
        await this.#lease.assertHeld();
      } catch (error) {
        throw wrapLeaseFailure("commit-gate", error);
      }
    };
    type Key<N extends SoloipsCompanyTableName> = SoloipsTableKeyOf<
      typeof SOLOIPS_COMPANY_DOMAIN_SPEC,
      N
    >;
    type Value<N extends SoloipsCompanyTableName> = SoloipsTableValueOf<
      typeof SOLOIPS_COMPANY_DOMAIN_SPEC,
      N
    >;
    return {
      put: async <N extends SoloipsCompanyTableName>(table: N, key: Key<N>, value: Value<N>) => {
        await assertLease();
        await this.#domain.table(table).put(key, value);
      },
      update: async <N extends SoloipsCompanyTableName>(
        table: N,
        key: Key<N>,
        revise: (current: Value<N>) => Value<N>,
      ) => {
        await assertLease();
        return this.#domain.table(table).update(key, revise);
      },
      delete: async <N extends SoloipsCompanyTableName>(table: N, key: Key<N>) => {
        await assertLease();
        return this.#domain.table(table).delete(key);
      },
    };
  }
}
