/**
 * 工作准入行为测试（SOLO-ACC-04）：三条路径（经理派单/员工自领/自动调度）
 * 共用同一判定并被同一组缺项拒绝；拒绝不改变任何业务状态；补齐后重试通过
 * 且不重建身份；同 operationId 重放返回原准入；员工存在未决操作时阻塞。
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { SoloipsCoreService } from "../src/contracts";
import { asOperationId } from "../src/ids";
import { openSoloipsCompanyStore } from "../src/store";
import { fakeMediumTable, fakeStoragePort, resetFakeAdapter } from "./adapter-fakes";
import { nextSeedOperationId, seedOnboardedEmployee } from "./seed";

const ROOT = "/tmp/soloips-work-entry-root";
const ORIGINS = ["manager-dispatch", "self-claim", "scheduler-assign"] as const;

let service: SoloipsCoreService;

beforeEach(async () => {
  resetFakeAdapter();
  service = await openSoloipsCompanyStore({ storage: fakeStoragePort(), root: ROOT });
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
});
