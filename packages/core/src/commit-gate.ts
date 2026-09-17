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
  SoloipsOperationRecord,
} from "./contracts.js";
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
}

export type SoloipsCommitProbe = "absent" | "replayed" | "unknown";

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

  /** 只读探测：同 operationId 的既有结果状态（读操作，不经 fence）。 */
  probe(operationId: SoloipsOperationId): SoloipsCommitProbe {
    const existing = this.#operationTable().get(operationId);
    if (existing === undefined) return "absent";
    if (existing.status === "committed") return "replayed";
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
      if (existing.kind !== request.kind) {
        throw new SoloipsCoreError(
          "SOLOIPS_CORE_CONFLICT",
          `operationId 已被种类 ${existing.kind} 的操作使用，不能用于 ${request.kind}`,
        );
      }
      if (existing.status === "committed") {
        return { status: "replayed", result: this.#committedResult(existing) as T };
      }
      return { status: "unknown" };
    }

    const publish = this.#createPublisher();

    // 意图先行（ORG-05：保存必要恢复意图在提交之前）。
    await publish.put("operation", request.operationId, {
      id: request.operationId,
      kind: request.kind,
      status: "pending",
      ...(request.employeeId === undefined ? {} : { employeeId: request.employeeId }),
      intent: request.intent,
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
