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

export interface SoloipsCommitRequest {
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
   * 抛错即整体拒绝：无意图落盘、无业务写（零业务写）。
   */
  readonly precondition?: () => void;
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
   */
  async commit<T extends SoloipsCommandResult>(
    request: SoloipsCommitRequest,
    mutate: (publish: SoloipsCompanyPublisher) => Promise<T>,
  ): Promise<SoloipsCommitOutcome<T>> {
    const outcome = this.#queue.then(() => this.#commitLocked(request, mutate));
    // 串行链只用于排序，失败不阻塞后续请求（每次 commit 各自携带结果/异常）。
    this.#queue = outcome.catch(() => undefined);
    return outcome;
  }

  async #commitLocked<T extends SoloipsCommandResult>(
    request: SoloipsCommitRequest,
    mutate: (publish: SoloipsCompanyPublisher) => Promise<T>,
  ): Promise<SoloipsCommitOutcome<T>> {
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
    // 抛错即整体拒绝——见 SoloipsCommitRequest.precondition 的说明。
    request.precondition?.();

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
