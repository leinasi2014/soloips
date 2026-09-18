/**
 * SOLOIPS-CORE-COMMIT-GATE-PRECONDITION-SPEC（BE-4c）
 *
 * 提交门 `precondition` 契约扩展（拒绝载荷形态）的**门级**行为测试。依据：
 *  - `docs/prds/organization-full-backend-design-v0.1.md` §6 **R-5.1…R-5.5**
 *    （判定与提交在同一串行槽位；失败方向不变）；
 *  - `data-contract.md` §2.1.1 **P-9**（三步协议，`precondition` 在重放检测之后）、
 *    §2.4.4 **DL-1/DL-2**（部长唯一性归属——**本片不实现**，仅登记）；
 *  - `src/contracts.ts` 的 `SoloipsCommitPreconditionVerdict` 注释（**为什么不用
 *    哨兵异常**的权威说明处）。
 *
 * 〔为什么单独建本 spec 而不是追加 `team-data.spec.ts`〕本文件测的是**门的契约**
 * （两种拒绝形态、顺序契约、失败方向），不是任何单个业务命令的行为。门级用例可以
 * 直接构造 gate + domain + lease，不经 store，从而把「门做了什么」与「命令怎么用门」
 * 分开——后者在 `work-entry.spec.ts` / `team-data.spec.ts` / `scope-role.spec.ts`。
 *
 * 〔与本片关键断言的对应〕
 *  - 顺序契约（重放检测**先于** precondition）→ 用例 3、4；
 *  - 拒绝载荷早退：零业务写、零新增未决意图 → 用例 2、6；
 *  - 拒绝不污染串行链（后续提交照常） → 用例 7；
 *  - 基础设施失败**不**被抹成拒绝（失权仍抛错） → 用例 8；
 *  - 部分发布仍是 `unknown` 语义（不因门扩展而改变） → 用例 9；
 *  - 类型层约束（拒绝判别值固定为 `refused`；异步钩子被拒） → 用例 10、11。
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { SoloipsDomain, SoloipsWriterLease } from "soloips-adapter-dsh/contracts";

import type {
  SoloipsCommitOutcome,
  SoloipsCommitPreconditionVerdict,
  SoloipsCommitRefusalShape,
} from "../src/contracts";
import { SoloipsCommitGate } from "../src/commit-gate";
import { SOLOIPS_COMPANY_DOMAIN_SPEC } from "../src/domain";
import { asOperationId } from "../src/ids";
import {
  fakeDomainFacility,
  fakeMediumTable,
  fakeStoragePort,
  fakeTakeoverLease,
  resetFakeAdapter,
} from "./adapter-fakes";

const ROOT = "/tmp/soloips-commit-gate-root";

type ProbeResult = { readonly probe: string };

/** 一个业务拒绝载荷（形状与 `requestWorkEntry` 的 refused 分支同构）。 */
type TestRefusal = {
  readonly status: "refused";
  readonly reason: "onboarding-not-ready" | "employee-operation-unknown";
};

interface Harness {
  readonly gate: SoloipsCommitGate;
  readonly lease: SoloipsWriterLease;
}

/**
 * 直接构造门（不经 store）：facility 与 lease 都取自测试替身，
 * 因此门看到的 domain 与真实路径同形（同一 `SOLOIPS_COMPANY_DOMAIN_SPEC`）。
 */
async function openGate(): Promise<Harness> {
  const storage = fakeStoragePort();
  const lease = await storage.acquireWriterLease({ root: ROOT });
  const domain: SoloipsDomain<typeof SOLOIPS_COMPANY_DOMAIN_SPEC> = await fakeDomainFacility(
    ROOT,
  ).open(SOLOIPS_COMPANY_DOMAIN_SPEC);
  return { gate: new SoloipsCommitGate(domain, lease), lease };
}

/** 介质快照：门级用例的「零业务写」判据（含操作台账）。 */
function snapshotMedium(): Record<string, readonly unknown[]> {
  const snapshot: Record<string, readonly unknown[]> = {};
  for (const table of ["company", "employee", "operation"]) {
    snapshot[table] = [...fakeMediumTable(ROOT, table).entries()].map(([key, value]) => ({
      key,
      value,
    }));
  }
  return snapshot;
}

let harness: Harness;

beforeEach(async () => {
  resetFakeAdapter();
  harness = await openGate();
});

describe("提交门 precondition：两种拒绝形态与顺序契约（BE-4c / R-5）", () => {
  it("1. 既有形态（void 钩子抛错）语义不变：异常冒泡、零业务写、零台账", async () => {
    const before = snapshotMedium();
    await expect(
      harness.gate.commit(
        {
          operationId: asOperationId("gate-throw-1"),
          kind: "company.create",
          intent: {},
          precondition: () => {
            throw new Error("唯一性拒绝（既有抛错形态）");
          },
        },
        async () => ({ probe: "should-not-run" }),
      ),
    ).rejects.toThrow(/唯一性拒绝/);
    // 抛错即整体拒绝：连意图都不落（这是 BE-2 起就有的语义，本片不得放宽）。
    expect(snapshotMedium()).toEqual(before);
  });

  it("2. 拒绝载荷形态：以值返回（不抛错）、零业务写、零新增未决意图", async () => {
    const before = snapshotMedium();
    const outcome = await harness.gate.commit<ProbeResult, TestRefusal>(
      {
        operationId: asOperationId("gate-refuse-1"),
        kind: "company.create",
        intent: {},
        precondition: () => ({
          ok: false,
          refusal: { status: "refused", reason: "onboarding-not-ready" },
        }),
      },
      async () => ({ probe: "should-not-run" }),
    );
    // 拒绝是**正常返回**：调用方按值处理，不需要 catch。
    expect(outcome).toEqual({ status: "refused", reason: "onboarding-not-ready" });
    // 零业务写 + 零台账：介质逐字未变（`mutate` 从未运行）。
    expect(snapshotMedium()).toEqual(before);
  });

  it("3. 顺序契约：重放检测**先于** precondition——已提交操作的重放不重新判定", async () => {
    // 〔本条钉住 R-5.5 与 P-9 共同依赖的性质〕判定依据会被成功的执行本身改变
    // （如「已存在总助理」「团队已是 active」）。若 precondition 先于重放检测，
    // 同 operationId 的重放会因「状态已变」被拒——幂等性破坏。
    let preconditionCalls = 0;
    const operationId = asOperationId("gate-replay-order-1");
    const first = await harness.gate.commit(
      {
        operationId,
        kind: "company.create",
        intent: {},
        precondition: (): SoloipsCommitPreconditionVerdict<TestRefusal> => {
          preconditionCalls += 1;
          // 首次允许；若第二次仍被调用，这里会返回拒绝——正是要排除的形态。
          return preconditionCalls === 1
            ? { ok: true }
            : { ok: false, refusal: { status: "refused", reason: "onboarding-not-ready" } };
        },
      },
      async () => ({ probe: "committed" }),
    );
    expect(first.status).toBe("committed");
    expect(preconditionCalls).toBe(1);

    const replayed = await harness.gate.commit<ProbeResult, TestRefusal>(
      {
        operationId,
        kind: "company.create",
        intent: {},
        precondition: (): SoloipsCommitPreconditionVerdict<TestRefusal> => {
          preconditionCalls += 1;
          return { ok: false, refusal: { status: "refused", reason: "onboarding-not-ready" } };
        },
      },
      async () => ({ probe: "should-not-run" }),
    );
    // 重放命中即返回原结果——precondition **一次都没有再被调用**。
    expect(replayed).toMatchObject({ status: "replayed", result: { probe: "committed" } });
    expect(preconditionCalls).toBe(1);
  });

  it("4. 未决（pending）同 operationId：precondition 不被调用，返回 unknown", async () => {
    const operationId = asOperationId("gate-pending-1");
    fakeMediumTable(ROOT, "operation").set(operationId, {
      id: operationId,
      kind: "company.create",
      status: "pending",
      intent: {},
      schemaVersion: 1,
    });
    let preconditionCalls = 0;
    const outcome = await harness.gate.commit<ProbeResult, TestRefusal>(
      {
        operationId,
        kind: "company.create",
        intent: {},
        precondition: (): SoloipsCommitPreconditionVerdict<TestRefusal> => {
          preconditionCalls += 1;
          return { ok: true };
        },
      },
      async () => ({ probe: "should-not-run" }),
    );
    // 「结果未知」优先于任何业务判定——不得换 ID 重做，也不得把未决当拒绝。
    expect(outcome).toEqual({ status: "unknown" });
    expect(preconditionCalls).toBe(0);
  });

  it("5. 同 ID 不同 kind 复用：仍按 CONFLICT 抛错（与拒绝载荷形态无关）", async () => {
    const operationId = asOperationId("gate-conflict-1");
    const first = await harness.gate.commit(
      { operationId, kind: "company.create", intent: {} },
      async () => ({ probe: "committed" }),
    );
    expect(first.status).toBe("committed");
    await expect(
      harness.gate.commit<ProbeResult, TestRefusal>(
        {
          operationId,
          kind: "employee.create",
          intent: {},
          precondition: () => ({ ok: true }),
        },
        async () => ({ probe: "should-not-run" }),
      ),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_CONFLICT" });
  });

  it("6. 拒绝载荷不得落台账：拒绝后同 ID 可再次尝试（未被占用）", async () => {
    // 〔为什么重要〕若拒绝发生在意图落盘**之后**，这个 operationId 会被一条
    // pending 记录占用，后续调用只会撞上 unknown——把「什么都没发生」变成
    // 「有一条查不清的操作」。本用例从外部可观察面钉住「拒绝不占 ID」。
    const operationId = asOperationId("gate-refuse-reuse-1");
    const refused = await harness.gate.commit<ProbeResult, TestRefusal>(
      {
        operationId,
        kind: "company.create",
        intent: {},
        precondition: () => ({
          ok: false,
          refusal: { status: "refused", reason: "employee-operation-unknown" },
        }),
      },
      async () => ({ probe: "should-not-run" }),
    );
    expect(refused.status).toBe("refused");

    // 同一 operationId 再次提交（这次允许）：必须能正常提交，而不是 unknown。
    const admitted = await harness.gate.commit(
      {
        operationId,
        kind: "company.create",
        intent: {},
        precondition: () => ({ ok: true }),
      },
      async () => ({ probe: "committed-after-refusal" }),
    );
    expect(admitted).toMatchObject({
      status: "committed",
      result: { probe: "committed-after-refusal" },
    });
  });

  it("7. 拒绝不污染串行链：同一门上的后续提交照常执行", async () => {
    // 拒绝是**正常返回**（不是异常），故既不应阻塞 `#queue`，也不应让后续请求
    // 看到残留状态。这里在同一个门上先拒后提交，两者互不影响。
    const refused = await harness.gate.commit<ProbeResult, TestRefusal>(
      {
        operationId: asOperationId("gate-queue-refuse-1"),
        kind: "company.create",
        intent: {},
        precondition: () => ({
          ok: false,
          refusal: { status: "refused", reason: "onboarding-not-ready" },
        }),
      },
      async () => ({ probe: "should-not-run" }),
    );
    expect(refused.status).toBe("refused");

    const after = await harness.gate.commit(
      { operationId: asOperationId("gate-queue-after-1"), kind: "company.create", intent: {} },
      async () => ({ probe: "after-refusal" }),
    );
    expect(after).toMatchObject({ status: "committed", result: { probe: "after-refusal" } });
  });

  it("8. 基础设施失败不被抹成拒绝：失权仍以 LEASE_NOT_HELD 抛错（R-5.5）", async () => {
    // 〔本条钉住「失败方向」的边界〕拒绝载荷只承载**可判定的业务拒绝**。失权是
    // 基础设施失败——它必须继续以异常呈现，不得被翻译成 `refused`：那会让调用方
    // 把「写权已失」读成「状态不允许」，从而做出错误的重试决策（换 ID 重做）。
    const before = snapshotMedium();
    fakeTakeoverLease(ROOT); // 另一进程取得新代际，本 lease 失权。
    const outcome = harness.gate.commit<ProbeResult, TestRefusal>(
      {
        operationId: asOperationId("gate-lease-1"),
        kind: "company.create",
        intent: {},
        precondition: () => ({ ok: true }),
      },
      async () => ({ probe: "should-not-run" }),
    );
    await expect(outcome).rejects.toMatchObject({ code: "SOLOIPS_CORE_LEASE_NOT_HELD" });
    expect(snapshotMedium()).toEqual(before);
  });

  it("9. 部分发布仍按 unknown/恢复语义：mutate 失败后同 ID 重试返回 unknown", async () => {
    // 〔门扩展不得改变既有失败语义〕意图已落盘、业务写失败 → 留下可核对的未决
    // operationId（ORG-05）。重试同 ID 得到 `unknown`（不换 ID 重做），而不是
    // 被 precondition 重新判定（那会掩盖「有一条未结清的操作」这个事实）。
    const operationId = asOperationId("gate-partial-1");
    await expect(
      harness.gate.commit({ operationId, kind: "company.create", intent: {} }, async () => {
        throw new Error("业务写失败（模拟基础设施故障）");
      }),
    ).rejects.toThrow(/业务写失败/);
    // 台账上留下 pending 意图（恢复锚点），未被静默清理。
    expect(fakeMediumTable(ROOT, "operation").get(operationId)).toMatchObject({
      id: operationId,
      status: "pending",
    });

    let preconditionCalls = 0;
    const retry = await harness.gate.commit<ProbeResult, TestRefusal>(
      {
        operationId,
        kind: "company.create",
        intent: {},
        precondition: (): SoloipsCommitPreconditionVerdict<TestRefusal> => {
          preconditionCalls += 1;
          return { ok: true };
        },
      },
      async () => ({ probe: "should-not-run" }),
    );
    expect(retry).toEqual({ status: "unknown" });
    expect(preconditionCalls).toBe(0);
  });

  it("10. 类型层：拒绝载荷的判别值必须是 refused（与结果三态不可混淆）", () => {
    // 〔阴性对照〕若 `R` 允许携带 `status: 'committed' | 'replayed' | 'unknown'`，
    // 门的返回联合就会在类型层说谎——调用方按 `status` 判别时会把拒绝读成已提交。
    // 本用例用 `@ts-expect-error` 把这条约束钉在编译期（测试文件同样经
    // `tsc -p tsconfig.tests.json` 检查，故这是**可执行的**类型断言）。
    //
    // 直接对**约束类型本身**做赋值检查，而不是构造一次真实 commit 调用：后者会在
    // 类型实参处先报 TS2344（约束不满足），错误位置与「判别值错了」这件事隔了一层。
    const resultShapedRefusal = { status: "committed" as const };
    // @ts-expect-error 拒绝载荷的 status 不得是 committed（判别值与结果三态重名）
    const notARefusal: SoloipsCommitRefusalShape = resultShapedRefusal;
    expect(notARefusal).toBeTypeOf("object");

    // 正向对照：合法的拒绝载荷可赋值（证明上面的报错来自判别值，不是类型整体不匹配）。
    const legit: SoloipsCommitRefusalShape = { status: "refused" };
    expect(legit.status).toBe("refused");
  });

  it("11. 类型层：precondition 必须是同步的（异步钩子被拒）", () => {
    // 〔不变量〕若允许异步钩子，`#commitLocked` 会把「未决的 Promise」当成
    // 「无拒绝」而放行——判定静默失效（不变量「拒绝在意图落盘前生效」被绕过）。
    // 契约显式排除 `Promise`（`Verdict<R> | void`），故异步钩子在编译期失败。
    const bad = (): void => {
      void harness.gate.commit(
        {
          operationId: asOperationId("gate-async-hook-1"),
          kind: "company.create",
          intent: {},
          // @ts-expect-error 钩子返回类型不含 Promise（异步判定会静默失效）
          precondition: async () => ({ ok: true }),
        },
        async () => ({ probe: "x" }),
      );
    };
    expect(bad).toBeTypeOf("function");
  });

  it("12. 加法保证：既有 void/无钩子调用点的返回类型**逐字**不含拒绝臂", async () => {
    // 〔本条把「加法」从注释变成可执行断言〕重载 1 的返回类型必须是
    // `Promise<SoloipsCommitOutcome<T>>`——**不含** `| R`。用双向条件类型
    // （`IsExactly`）做逐字相等判定：它比单向可赋值更强，能抓住「多出一个臂」
    // 这类变化（单向可赋值对「更宽的联合」同样通过，抓不住）。
    //
    // 〔为什么必须逐字〕`never` 在联合里会被 TS 化简，所以「单签名 + 默认 never」
    // 在**无上下文返回类型**时看起来也对；只有在有上下文返回类型时才会暴露
    // 推断回退到约束的行为（实测 TS2322 ×13，见 `commit` 的重载注释）。故这条
    // 断言与运行期用例一起构成「既有调用点不受影响」的双重证据。
    type IsExactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

    const noHook = harness.gate.commit(
      { operationId: asOperationId("gate-additive-1"), kind: "company.create", intent: {} },
      async () => ({ probe: "plain" }),
    );
    const noHookExact: IsExactly<typeof noHook, Promise<SoloipsCommitOutcome<ProbeResult>>> = true;
    expect(noHookExact).toBe(true);

    const voidHook = harness.gate.commit(
      {
        operationId: asOperationId("gate-additive-2"),
        kind: "company.create",
        intent: {},
        precondition: () => {
          throw new Error("既有抛错形态");
        },
      },
      async () => ({ probe: "plain" }),
    );
    const voidHookExact: IsExactly<
      typeof voidHook,
      Promise<SoloipsCommitOutcome<ProbeResult>>
    > = true;
    expect(voidHookExact).toBe(true);
    // 消费该 promise 的拒绝：本用例只用它的**静态类型**做逐字判定，但绝不留下
    // 未处理的拒绝（vitest 会把 Unhandled Rejection 报成整轮失败——这是好事，
    // 它逼着每个被构造出来的失败路径都被显式消费）。
    await expect(voidHook).rejects.toThrow(/既有抛错形态/);

    // 对照：带拒绝载荷的调用**不是**逐字 `Outcome<T>`（证明 IsExactly 有鉴别力）。
    const withRefusal = harness.gate.commit<ProbeResult, TestRefusal>(
      {
        operationId: asOperationId("gate-additive-3"),
        kind: "company.create",
        intent: {},
        precondition: () => ({ ok: true }),
      },
      async () => ({ probe: "plain" }),
    );
    const refusalNotExact: IsExactly<
      typeof withRefusal,
      Promise<SoloipsCommitOutcome<ProbeResult>>
    > = false;
    expect(refusalNotExact).toBe(false);
    expect(await withRefusal).toMatchObject({ status: "committed" });

    // 运行期佐证：无钩子提交的结果形状就是三态之一，没有任何多余字段。
    const committed = await noHook;
    expect(Object.keys(committed).sort()).toEqual(["result", "status"]);
    expect(committed).toMatchObject({ status: "committed", result: { probe: "plain" } });
  });

  it("13. R-5.2：probe 是纯读诊断面——它不写任何东西，也不影响后续提交", async () => {
    // 〔为什么需要这条〕BE-4c 后 `probe()` 已无调用方（`requestWorkEntry` 的门外
    // 预检被删除）。它作为**纯读**诊断面保留，但 R-5.2 明禁「把它的结果当提交
    // 依据」。本用例钉住它的**纯读**性质（调用它不改变介质），使「探测本身引入
    // 副作用」这类改动立刻可见；至于「调用方拿它当提交依据」属代码纪律，由
    // `probe()` 的注释与 `requestWorkEntry` 的实现（无任何提交前预检）承担。
    const operationId = asOperationId("gate-probe-pure-1");
    const before = snapshotMedium();

    // 未提交前：absent。
    expect(harness.gate.probe(operationId)).toBe("absent");
    // 纯读：介质逐字不变。
    expect(snapshotMedium()).toEqual(before);

    // 提交后：replayed（已提交且 kind 已知）。
    const committed = await harness.gate.commit(
      { operationId, kind: "company.create", intent: {} },
      async () => ({ probe: "committed" }),
    );
    expect(committed.status).toBe("committed");
    expect(harness.gate.probe(operationId)).toBe("replayed");

    // 未决时：unknown（不换 ID 重做）。
    const pendingId = asOperationId("gate-probe-pending-1");
    fakeMediumTable(ROOT, "operation").set(pendingId, {
      id: pendingId,
      kind: "company.create",
      status: "pending",
      intent: {},
      schemaVersion: 1,
    });
    expect(harness.gate.probe(pendingId)).toBe("unknown");

    // 未知 kind（已提交但本版本读不懂）：同样是 unknown——不得当成可重放结果。
    const futureId = asOperationId("gate-probe-future-1");
    fakeMediumTable(ROOT, "operation").set(futureId, {
      id: futureId,
      kind: "company.some-future-write",
      status: "committed",
      intent: {},
      result: { ok: true },
      schemaVersion: 99,
    });
    expect(harness.gate.probe(futureId)).toBe("unknown");
  });
});
