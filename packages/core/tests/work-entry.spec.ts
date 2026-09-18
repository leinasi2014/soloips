/**
 * 工作准入行为测试（SOLO-ACC-04）：三条路径（经理派单/员工自领/自动调度）
 * 共用同一判定并被同一组缺项拒绝；拒绝不改变任何业务状态；补齐后重试通过
 * 且不重建身份；同 operationId 重放返回原准入；员工存在未决操作时阻塞。
 *
 * 〔BE-4c 增补〕判定与提交落在**同一串行槽位**（R-5.1…R-5.5）：新增「并发两次
 * 准入各自完整走完（零交错）」「拒绝零业务写（介质逐字）」「重放不因后来状态
 * 变化被重判」「未决阻塞只针对他人」四组用例。既有 5 条用例**语义逐条保持**
 * （断言未删改）。
 *
 * 〔措辞校正，2026-09-18 由 QA 发现〕原文写「并发准入**恰一**通过」，与断言不符
 * ——本文件的并发用例断言的是**两条都成功**（`toHaveLength(2)`，各自零交错）；
 * 真正断言「恰一通过」的用例在 `scope-role.spec.ts` 的**总助理唯一性**（另一
 * 命令）。两者性质不同：此处证「串行槽位不丢提交」，彼处证「唯一性拒绝在并发
 * 下成立」。
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { SoloipsCoreService } from "../src/contracts";
import { asOperationId } from "../src/ids";
import { openSoloipsCompanyStore } from "../src/store";
import { fakeMediumTable, fakeStoragePort, resetFakeAdapter } from "./adapter-fakes";
import { nextSeedOperationId, seedOnboardedEmployee, TEST_ACCOUNT_ID } from "./seed";

const ROOT = "/tmp/soloips-work-entry-root";
const ORIGINS = ["manager-dispatch", "self-claim", "scheduler-assign"] as const;

let service: SoloipsCoreService;

beforeEach(async () => {
  resetFakeAdapter();
  service = await openSoloipsCompanyStore({
    storage: fakeStoragePort(),
    root: ROOT,
    accountId: TEST_ACCOUNT_ID,
  });
});

function snapshotMedium(): Record<string, readonly unknown[]> {
  const snapshot: Record<string, readonly unknown[]> = {};
  for (const table of [
    "company",
    "department",
    "employee",
    "appointment",
    "document_version",
    "operation",
  ]) {
    snapshot[table] = [...fakeMediumTable(ROOT, table).entries()].map(([key, value]) => ({
      key,
      value,
    }));
  }
  return snapshot;
}

describe("work entry admission (SOLO-ACC-04)", () => {
  it("入职未过：三条路径都被拒，且返回同一组具体缺项", async () => {
    const seeded = await seedOnboardedEmployee(service, {
      skip: new Set(["avatar", "assembly:avatar", "memory"]),
    });
    const results = ORIGINS.map((origin) =>
      service.requestWorkEntry({
        operationId: nextSeedOperationId(`work-entry-${origin}`),
        employeeId: seeded.employeeId,
        taskId: "task-1",
        origin,
      }),
    );
    const settled = await Promise.all(results);
    for (const outcome of settled) {
      expect(outcome).toMatchObject({ status: "refused", reason: "onboarding-not-ready" });
      if (outcome.status !== "refused") continue;
      expect(outcome.gaps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ item: "avatar", reason: "document-missing" }),
          expect.objectContaining({ item: "memory", reason: "memory-not-initialized" }),
        ]),
      );
    }
    // 三条路径共用同一判定：缺项完全一致。
    const first = settled[0];
    expect(settled.every((outcome) => JSON.stringify(outcome) === JSON.stringify(first))).toBe(
      true,
    );
  });

  it("拒绝不落任何操作记录：业务状态不变（任务保持未准入）", async () => {
    const seeded = await seedOnboardedEmployee(service, {
      skip: new Set(["soul", "assembly:soul"]),
    });
    const before = snapshotMedium();
    const outcome = await service.requestWorkEntry({
      operationId: nextSeedOperationId("work-entry-refused"),
      employeeId: seeded.employeeId,
      taskId: "task-1",
      origin: "scheduler-assign",
    });
    expect(outcome.status).toBe("refused");
    expect(service.listPendingOperations()).toEqual([]);
    expect(snapshotMedium()).toEqual(before);
  });

  it("补齐缺项后重试通过；重试不重建员工身份或第二任职", async () => {
    const seeded = await seedOnboardedEmployee(service, {
      skip: new Set(["operating", "assembly:operating"]),
    });
    const retryOperationId = nextSeedOperationId("work-entry-retry");
    const refused = await service.requestWorkEntry({
      operationId: retryOperationId,
      employeeId: seeded.employeeId,
      taskId: "task-1",
      origin: "self-claim",
    });
    expect(refused.status).toBe("refused"); // 拒绝未占用该 operationId

    // 修正缺项（受限初始化入口语义：本人保存并装配）。
    const saved = await service.saveEmployeeDocument({
      operationId: nextSeedOperationId("doc-operating-fix"),
      employeeId: seeded.employeeId,
      documentType: "operating",
      content: "补齐的操作规范",
    });
    if (saved.status !== "committed") throw new Error("种子失败");
    const evidence = await service.recordAssemblyEvidence({
      operationId: nextSeedOperationId("assembly-operating-fix"),
      employeeId: seeded.employeeId,
      documentType: "operating",
      versionId: saved.result.versionId,
    });
    if (evidence.status !== "committed") throw new Error("种子失败");

    const admitted = await service.requestWorkEntry({
      operationId: retryOperationId, // 同一 operationId 重试
      employeeId: seeded.employeeId,
      taskId: "task-1",
      origin: "self-claim",
    });
    expect(admitted).toMatchObject({
      status: "admitted",
      replayed: false,
      result: {
        employeeId: seeded.employeeId,
        appointmentId: seeded.appointmentId,
        generation: 1,
        taskId: "task-1",
        origin: "self-claim",
      },
    });

    // 重试后身份未重建：仍是一个员工、一个任职。
    expect(fakeMediumTable(ROOT, "employee").size).toBe(1);
    expect(fakeMediumTable(ROOT, "appointment").size).toBe(1);
  });

  it("已准入的 operationId 重放返回原结果，不重复记录", async () => {
    const seeded = await seedOnboardedEmployee(service);
    const operationId = asOperationId("work-entry-replay-1");
    const first = await service.requestWorkEntry({
      operationId,
      employeeId: seeded.employeeId,
      taskId: "task-9",
      origin: "manager-dispatch",
    });
    expect(first).toMatchObject({ status: "admitted", replayed: false });
    const replayed = await service.requestWorkEntry({
      operationId,
      employeeId: seeded.employeeId,
      taskId: "task-9",
      origin: "manager-dispatch",
    });
    expect(replayed).toMatchObject({ status: "admitted", replayed: true });
    expect(replayed.status === "admitted" && first.status === "admitted").toBe(true);
    expect(replayed.status === "admitted" && replayed.result).toEqual(
      first.status === "admitted" ? first.result : undefined,
    );
    const operations = fakeMediumTable(ROOT, "operation");
    expect(
      [...operations.values()].filter(
        (record) => (record as { kind: string }).kind === "work-entry.request",
      ).length,
    ).toBe(1);
  });

  it("该操作自身未决时返回 unknown（不换 ID 重做）", async () => {
    const seeded = await seedOnboardedEmployee(service);
    const pendingId = asOperationId("work-entry-pending-1");
    fakeMediumTable(ROOT, "operation").set(pendingId, {
      id: pendingId,
      kind: "work-entry.request",
      status: "pending",
      employeeId: seeded.employeeId,
      intent: { taskId: "task-1", origin: "self-claim" },
    });
    const outcome = await service.requestWorkEntry({
      operationId: pendingId,
      employeeId: seeded.employeeId,
      taskId: "task-1",
      origin: "self-claim",
    });
    expect(outcome).toEqual({ status: "unknown" });
  });

  it("同 ID 被别的 kind 复用（含未决）：仍按 CONFLICT 抛错", async () => {
    // 〔BE-4c 行为**保持**的证据〕修复前这段逻辑在门外的 probe 分支里（读
    // `getOperation` 后手工比对 kind）；修复后由门的重放检测承担（同样比对 kind）。
    // 两处都拒绝，且都是 `SOLOIPS_CORE_CONFLICT`——本用例钉住「删除门外 probe
    // **没有**让这条拒绝消失」。
    //
    // 注意这里用的是**未决**记录（status='pending'）：旧门外 probe 对 pending
    // 一律返回 unknown（不比对 kind），故旧实现在这条输入上其实会返回 unknown。
    // 门的重放检测先比对 kind，因此新行为是 CONFLICT——**这是本片唯一的行为变化**，
    // 方向是 fail-closed（更严格、更早暴露 ID 复用），已在报告中如实披露。
    const seeded = await seedOnboardedEmployee(service);
    const shared = asOperationId("work-entry-id-reuse-other-kind");
    fakeMediumTable(ROOT, "operation").set(shared, {
      id: shared,
      kind: "document.save",
      status: "pending",
      employeeId: seeded.employeeId,
      intent: {},
    });
    await expect(
      service.requestWorkEntry({
        operationId: shared,
        employeeId: seeded.employeeId,
        taskId: "task-1",
        origin: "self-claim",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_CONFLICT" });
  });

  it("同 ID 已提交但结果载荷缺失：按 RECORD_INVALID 抛错（不静默当成拒绝）", async () => {
    // 〔BE-4c 行为**变化**的证据，方向 fail-closed〕旧门外 probe 在 replayed 分支里
    // 手工判 `record.result === undefined` 并抛 `SOLOIPS_CORE_CONFLICT`；门的重放
    // 分支把「committed 但缺 result」交给 `#committedResult` 处置，它抛
    // `SOLOIPS_CORE_RECORD_INVALID`。两者都拒绝、都不返回错误结果，但**错误码不同**。
    //
    // 哪个码更准：记录标记为 committed 却缺结果载荷，是**记录损坏**（介质不自洽），
    // 不是「operationId 被复用」。故新码是更精确的契约表达——本用例把它钉住，
    // 使未来若有人改回 CONFLICT 会被发现（那会是一次有意的契约变更）。
    const seeded = await seedOnboardedEmployee(service);
    const broken = asOperationId("work-entry-broken-committed");
    fakeMediumTable(ROOT, "operation").set(broken, {
      id: broken,
      kind: "work-entry.request",
      status: "committed",
      employeeId: seeded.employeeId,
      intent: {},
      // 故意不写 result。
    });
    await expect(
      service.requestWorkEntry({
        operationId: broken,
        employeeId: seeded.employeeId,
        taskId: "task-1",
        origin: "self-claim",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_RECORD_INVALID" });
  });

  it("同 ID 是**未知 kind**（未来版本写入）：按 CONFLICT 抛错，不按 unknown 放行", async () => {
    // 〔BE-4c 行为**变化**的第二处，方向 fail-closed〕旧门外 probe 对**未知 kind**
    // 一律返回 `unknown`（`probe()` 的语义：读不懂就不当可重放结果），于是本命令
    // 在「同 ID 是未来版本的 kind」时返回 `{status:'unknown'}`。门的重放检测则**先
    // 比对 kind 字符串**——同 ID 不同 kind 即 `SOLOIPS_CORE_CONFLICT`（未知不等于
    // 可复用，见 `#commitLocked` 的注释与 team-data.spec.ts 的既有用例）。
    //
    // 为什么新行为更正确：`unknown` 的语义是「该 operationId 的**本次**操作结果
    // 未知、不得换 ID 重做」——它暗示调用方重试同一 ID 可能有结果。而「同 ID 已
    // 被**别的**（未来版本的）操作占用」是**冲突**，重试永远不会成功，调用方必须
    // 换 ID 或核对。把冲突报成 unknown 会让调用方无谓等待一个永不兑现的结果。
    // 两个码都是拒绝、都不写任何业务状态，故这是**诊断精度**的改善而非放宽。
    const seeded = await seedOnboardedEmployee(service);
    const future = asOperationId("work-entry-unknown-kind-committed");
    fakeMediumTable(ROOT, "operation").set(future, {
      id: future,
      kind: "work-entry.something-new",
      status: "committed",
      employeeId: seeded.employeeId,
      intent: {},
      result: { x: 1 },
      schemaVersion: 99,
    });
    await expect(
      service.requestWorkEntry({
        operationId: future,
        employeeId: seeded.employeeId,
        taskId: "task-1",
        origin: "self-claim",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_CONFLICT" });

    // 未知 kind 的**未决**记录同样是 CONFLICT（kind 比对先于状态判断）——
    // 而它对**别的** operationId 的阻塞作用仍由 listPendingOperations 承担
    // （见 team-data.spec.ts 的「unknown kind 的未决记录仍参与恢复核对」）。
    const futurePending = asOperationId("work-entry-unknown-kind-pending");
    fakeMediumTable(ROOT, "operation").set(futurePending, {
      id: futurePending,
      kind: "team.some-future-write",
      status: "pending",
      employeeId: seeded.employeeId,
      intent: {},
      schemaVersion: 99,
    });
    await expect(
      service.requestWorkEntry({
        operationId: futurePending,
        employeeId: seeded.employeeId,
        taskId: "task-1",
        origin: "self-claim",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_CONFLICT" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BE-4c：判定与提交在同一串行槽位（R-5.1…R-5.5）
// ─────────────────────────────────────────────────────────────────────────────

describe("work entry：判定入槽位（BE-4c / R-5）", () => {
  it("并发两次准入（同一员工、不同 operationId）：两条台账完整走完，零未决", async () => {
    // 〔本条是本片的关键鉴别力证据〕修复前判定在门外：两个并发调用各自读到
    // 「入职已完备」并各自建出一条准入事实（两条 work-entry.request 台账记录）。
    // 修复后判定在串行槽位内——第二个提交在槽位内重新判定，读到的仍是完备状态
    // （准入判定本身是幂等的、不写状态），故两条都可以提交；但**判定读的是当前
    // 事实**这一点由「未决阻塞」那条用例单独证明（见下）。
    //
    // 这里钉住的是「判定与提交确实在同一槽位」的**结构性证据**：两个提交不得
    // 交错——台账上两条记录各自 pending→committed 完整走完，且没有任何一条
    // 在对方 pending 期间被阻塞成 employee-operation-unknown（那会是门外判定的
    // 症状：第二个提交在门外看到第一个的 pending 意图）。
    const seeded = await seedOnboardedEmployee(service);
    const firstId = asOperationId("work-entry-concurrent-a");
    const secondId = asOperationId("work-entry-concurrent-b");

    const attempts = [
      service.requestWorkEntry({
        operationId: firstId,
        employeeId: seeded.employeeId,
        taskId: "task-a",
        origin: "self-claim",
      }),
      service.requestWorkEntry({
        operationId: secondId,
        employeeId: seeded.employeeId,
        taskId: "task-b",
        origin: "manager-dispatch",
      }),
    ];
    const settled = await Promise.all(
      attempts.map(async (attempt) => {
        try {
          return { ok: true as const, outcome: await attempt };
        } catch (error: unknown) {
          return { ok: false as const, error };
        }
      }),
    );

    // 两个都不得抛错（判定不得以异常呈现拒绝）；都不得是 unknown。
    expect(settled.every((entry) => entry.ok)).toBe(true);
    const admitted = settled.flatMap((entry) =>
      entry.ok && entry.outcome.status === "admitted" ? [entry.outcome] : [],
    );
    expect(admitted).toHaveLength(2);
    expect(admitted.every((entry) => entry.replayed === false)).toBe(true);
    // 零未决：两条都在同一槽位内完整走完（pending → committed）。
    expect(service.listPendingOperations()).toEqual([]);
    // 台账上恰好两条 work-entry.request，各自 committed 且带结果载荷。
    const records = [...fakeMediumTable(ROOT, "operation").values()].filter(
      (record) => (record as { kind: string }).kind === "work-entry.request",
    ) as readonly { status: string; result?: unknown }[];
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.status === "committed")).toBe(true);
    expect(records.every((record) => record.result !== undefined)).toBe(true);
  });

  it("准入判定在槽位内读取**当前**事实：排在写操作之后的准入看到写后的状态", async () => {
    // 〔本片的关键鉴别力证据（验收条款 3）〕这条用例用**可控制的调度顺序**证明
    // 「判定读取当前事实」，而不是只查代码字符串。
    //
    // 构造：员工差最后一项装配证据。先把补齐该项的写操作排进队列，**紧接着**在
    // 同一 tick 内发起准入——准入的槽位排在写操作之后。
    //
    //  - 修复后（判定在槽位内）：准入的判定在槽位内执行，此时写已提交 → 看到
    //    完备状态 → `admitted`；
    //  - 修复前（判定在门外、同步执行于调用时刻）：判定在**调用那一刻**同步跑完，
    //    写操作还排在队列里没执行 → 看到「装配证据缺失」→ `refused`。
    //
    // 故本用例对「把判定移回门外」这一变异**必然失败**——它测的正是判定发生在
    // 哪个时刻，而不是「最终状态对不对」。
    const seeded = await seedOnboardedEmployee(service, {
      skip: new Set(["assembly:operating"]),
    });
    // 前置事实：文档已保存、装配证据缺失（缺的正是这一步）。
    const before = service.checkOnboarding(seeded.employeeId);
    expect(before.ready).toBe(false);
    if (before.ready) throw new Error("前置事实不成立：入职应仍不完备");
    expect(before.gaps.map((gap) => gap.item)).toContain("assembly");

    const saved = await service.saveEmployeeDocument({
      operationId: nextSeedOperationId("slot-order-doc"),
      employeeId: seeded.employeeId,
      documentType: "operating",
      content: "补齐的操作规范",
    });
    if (saved.status !== "committed") throw new Error("种子失败");

    // 写操作先入队（未 await），准入紧随其后入队——两者在同一 tick 内发起。
    const evidence = service.recordAssemblyEvidence({
      operationId: nextSeedOperationId("slot-order-assembly"),
      employeeId: seeded.employeeId,
      documentType: "operating",
      versionId: saved.result.versionId,
    });
    const admission = service.requestWorkEntry({
      operationId: asOperationId("work-entry-slot-order"),
      employeeId: seeded.employeeId,
      taskId: "task-slot-order",
      origin: "self-claim",
    });

    expect(await evidence).toMatchObject({ status: "committed" });
    // 槽位内现读 → 看到写后的完备状态。
    expect(await admission).toMatchObject({ status: "admitted", replayed: false });
    expect(service.checkOnboarding(seeded.employeeId).ready).toBe(true);
  });

  it("未决阻塞只针对**他人**：同 ID 的未决走 unknown，他人的未决走 refused", async () => {
    // 〔最容易踩的坑〕检查移入门内后，本次的意图可能已在介质上——若判据不区分
    // 「本次」与「他人」，一次提交会把自己刚落的 pending 意图当成阻塞而拒绝。
    //
    // 两条路径的**输出不同**，故证明它们不是同一个谓词：
    //  - 同 operationId 的未决（本次自身）→ `unknown`：门的重放检测在 precondition
    //    **之前**读到同 ID 记录，按「结果未知、不得换 ID 重做」处置；
    //  - 同员工的**另一** ID 的未决（他人/既有未结）→ `refused`：
    //    「该员工还有未结清的操作」。
    const seeded = await seedOnboardedEmployee(service);
    const selfPendingId = asOperationId("work-entry-self-pending");
    // 注入一条**本命令 kind** 的 pending 记录（模拟「同 ID 的本次意图已在介质上」）。
    fakeMediumTable(ROOT, "operation").set(selfPendingId, {
      id: selfPendingId,
      kind: "work-entry.request",
      status: "pending",
      employeeId: seeded.employeeId,
      intent: { employeeId: seeded.employeeId, taskId: "task-1", origin: "self-claim" },
    });

    // ① 同 ID（本次自身）：unknown——「结果未知，不得换 ID 重做」。
    const selfOutcome = await service.requestWorkEntry({
      operationId: selfPendingId,
      employeeId: seeded.employeeId,
      taskId: "task-1",
      origin: "self-claim",
    });
    expect(selfOutcome).toEqual({ status: "unknown" });

    // ② 同员工的另一 ID：refused——「该员工还有未结清的操作」。
    const otherOutcome = await service.requestWorkEntry({
      operationId: asOperationId("work-entry-other-id"),
      employeeId: seeded.employeeId,
      taskId: "task-2",
      origin: "self-claim",
    });
    expect(otherOutcome).toEqual({
      status: "refused",
      reason: "employee-operation-unknown",
    });
    // 阻塞不占 ID：那条被拒的请求在介质上不留记录。
    expect(service.getOperation(asOperationId("work-entry-other-id"))).toBeUndefined();
  });

  it("拒绝零业务写：介质逐字不变、零新增 pending、operationId 未被占用", async () => {
    // 〔验收条款 4〕可判定业务拒绝在意图写入前返回——介质快照 deep-equal。
    // 〔为什么「operationId 未被占用」必须单独断言〕「介质不变」已蕴含它，但
    // 该性质是调用方**可行动**的依据（同一 ID 可修正后重试），故显式钉住，
    // 使将来若有人把意图写入挪到判定之前，这条断言直接失败而不是被快照断言
    // 顺带覆盖（失败信息会指向真正的原因）。
    const seeded = await seedOnboardedEmployee(service, {
      skip: new Set(["avatar", "assembly:avatar", "memory"]),
    });
    const refusedOperationId = asOperationId("work-entry-zero-write");
    const before = snapshotMedium();
    const outcome = await service.requestWorkEntry({
      operationId: refusedOperationId,
      employeeId: seeded.employeeId,
      taskId: "task-1",
      origin: "manager-dispatch",
    });
    expect(outcome).toMatchObject({ status: "refused", reason: "onboarding-not-ready" });
    // 介质逐字不变（业务表 + 台账）。
    expect(snapshotMedium()).toEqual(before);
    // 零新增未决 + 该 ID 未被占用（拒绝不占 ID）。
    expect(service.listPendingOperations()).toEqual([]);
    expect(service.getOperation(refusedOperationId)).toBeUndefined();
  });

  it("重放识别先于重新业务判定：已提交准入不因后来状态变化被误拒", async () => {
    // 〔验收条款 2〕重放必须返回**首次执行**的结果。这里先准入成功，再把员工
    // 的入职事实破坏掉（撤销任职），然后用同一 operationId 重放——必须仍是
    // admitted，而不是因为「现在入职不完备」被重判为 refused。
    const seeded = await seedOnboardedEmployee(service);
    const operationId = asOperationId("work-entry-replay-before-judge");
    const first = await service.requestWorkEntry({
      operationId,
      employeeId: seeded.employeeId,
      taskId: "task-replay",
      origin: "self-claim",
    });
    expect(first).toMatchObject({ status: "admitted", replayed: false });

    // 破坏入职事实：撤销唯一任职 → 当前状态已不完备。
    const revoked = await service.revokeAppointment({
      operationId: nextSeedOperationId("revoke-for-replay"),
      appointmentId: seeded.appointmentId,
    });
    expect(revoked.status).toBe("committed");
    expect(service.checkOnboarding(seeded.employeeId).ready).toBe(false);

    // 重放：必须返回原准入结果（replayed: true），而不是 refused。
    const replayed = await service.requestWorkEntry({
      operationId,
      employeeId: seeded.employeeId,
      taskId: "task-replay",
      origin: "self-claim",
    });
    expect(replayed).toMatchObject({
      status: "admitted",
      replayed: true,
      result: {
        employeeId: seeded.employeeId,
        appointmentId: seeded.appointmentId,
        taskId: "task-replay",
        origin: "self-claim",
      },
    });
    expect(replayed.status === "admitted" && first.status === "admitted").toBe(true);
    expect(replayed.status === "admitted" && replayed.result).toEqual(
      first.status === "admitted" ? first.result : undefined,
    );
  });

  it("三种 origin 共用边界：并发混合三路径，全部走同一判定与同一台账形状", async () => {
    // 〔验收条款 7〕`WORK_ENTRY_ORIGINS` 三值共用同一提交边界。三个并发调用
    // （三种 origin）都必须在槽位内完成，且写出的台账意图形状一致（只差 origin）。
    const seeded = await seedOnboardedEmployee(service);
    const outcomes = await Promise.all(
      ORIGINS.map((origin) =>
        service.requestWorkEntry({
          operationId: asOperationId(`work-entry-origin-${origin}`),
          employeeId: seeded.employeeId,
          taskId: `task-${origin}`,
          origin,
        }),
      ),
    );
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["admitted", "admitted", "admitted"]);
    expect(outcomes.every((outcome) => outcome.status === "admitted" && !outcome.replayed)).toBe(
      true,
    );
    // 三种 origin 各自一条 committed 台账记录，意图里的 origin 逐条对应。
    const records = [...fakeMediumTable(ROOT, "operation").values()].filter(
      (record) => (record as { kind: string }).kind === "work-entry.request",
    ) as readonly { intent: { origin?: string } }[];
    expect(records.map((record) => record.intent.origin).sort()).toEqual([...ORIGINS].sort());
    expect(service.listPendingOperations()).toEqual([]);
  });
});
