/**
 * store 行为测试：打开顺序（fence 先行）、失败逆序释放、同 facility 重复 open、
 * 持久读回（SOLO-ACC-05）、operationId 幂等、失权拒绝且状态不变（ORG-06）、
 * 关闭后拒绝、以及「无旁路写路径」的结构断言。
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { SoloipsCompanyId } from "../src/contracts";
import { SOLOIPS_COMPANY_DOMAIN_SPEC } from "../src/domain";
import { SoloipsCoreError } from "../src/errors";
import { asOperationId } from "../src/ids";
import { openSoloipsCompanyStore } from "../src/store";
import {
  FakeAdapterError,
  fakeAdapterEvents,
  fakeDomainFacility,
  fakeFailingOpenStoragePort,
  fakeMediumTable,
  fakeStoragePort,
  fakeTakeoverLease,
  resetFakeAdapter,
} from "./adapter-fakes";
import { nextSeedOperationId, seedOnboardedEmployee } from "./seed";

const ROOT = "/tmp/soloips-store-root";

beforeEach(() => {
  resetFakeAdapter();
});

describe("open path order (SEAM-12/13/14, SOLO-FENCE-01)", () => {
  it("lease → stack → open：租约在装载任何可写 domain 之前取得", async () => {
    const service = await openSoloipsCompanyStore({ storage: fakeStoragePort(), root: ROOT });
    const events = fakeAdapterEvents().slice(0, 3);
    expect(events[0]).toBe(`lease-acquire:${ROOT}`);
    expect(events[1]).toBe(`stack-create:${ROOT}`);
    expect(events[2]).toBe(`open:${SOLOIPS_COMPANY_DOMAIN_SPEC.name}`);
    await service.close();
  });

  it("binding 暴露介质身份、域名与租约代际（启动绑定清单核对面）", async () => {
    const service = await openSoloipsCompanyStore({ storage: fakeStoragePort(), root: ROOT });
    expect(service.binding).toMatchObject({
      root: ROOT,
      backend: "json",
      storageId: `fake:${ROOT}`,
      domainName: SOLOIPS_COMPANY_DOMAIN_SPEC.name,
      leaseGeneration: 1,
    });
    await service.close();
  });

  it("open 失败时逆序释放 stack 与 lease 并抛出（fail-closed）", async () => {
    await expect(
      openSoloipsCompanyStore({ storage: fakeFailingOpenStoragePort(), root: ROOT }),
    ).rejects.toThrow(FakeAdapterError);
    const events = fakeAdapterEvents();
    expect(events.indexOf(`stack-create:${ROOT}`)).toBeLessThan(
      events.indexOf(`stack-dispose:${ROOT}`),
    );
    expect(events.indexOf(`stack-dispose:${ROOT}`)).toBeLessThan(
      events.indexOf(`lease-dispose:${ROOT}`),
    );
  });

  it("相对路径/带首尾空白的 root 被拒绝（CONFIG_INVALID）", async () => {
    for (const bad of ["relative/path", " /tmp/abs", "/tmp/abs "]) {
      await expect(
        openSoloipsCompanyStore({ storage: fakeStoragePort(), root: bad }),
      ).rejects.toMatchObject({ code: "SOLOIPS_CORE_CONFIG_INVALID" });
    }
  });
});

describe("single opener (SOLO-ACC-02 mechanism face)", () => {
  it("同一 facility 实例内第二次 open 同名 domain 被拒绝", async () => {
    const facility = fakeDomainFacility(ROOT);
    const first = await facility.open(SOLOIPS_COMPANY_DOMAIN_SPEC);
    expect(first.name).toBe(SOLOIPS_COMPANY_DOMAIN_SPEC.name);
    await expect(facility.open(SOLOIPS_COMPANY_DOMAIN_SPEC)).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_DOMAIN_ALREADY_OPEN",
    });
    await first.close();
    // close 后域名释放，可再次 open。
    const reopened = await facility.open(SOLOIPS_COMPANY_DOMAIN_SPEC);
    await reopened.close();
  });
});

describe("persistence round-trip (SOLO-ACC-05)", () => {
  it("写入 → 关闭 → 同一 root 重开 → 读回一致，且 operationId 可核对", async () => {
    const first = await openSoloipsCompanyStore({ storage: fakeStoragePort(), root: ROOT });
    const seeded = await seedOnboardedEmployee(first, { requiredCapabilities: ["draw"] });
    const workOperationId = asOperationId("roundtrip-work-1");
    const work = await first.saveEmployeeDocument({
      operationId: workOperationId,
      employeeId: seeded.employeeId,
      documentType: "work",
      content: "第一章分镜草稿",
      appointmentId: seeded.appointmentId,
    });
    if (work.status !== "committed") throw new Error("种子失败");
    await first.close();

    // 「停止」后重开：取得唯一写权（代际递增）、恢复后核对。
    const second = await openSoloipsCompanyStore({ storage: fakeStoragePort(), root: ROOT });
    expect(second.binding.leaseGeneration).toBe(2);
    expect(second.getCompany(seeded.companyId)).toMatchObject({
      id: seeded.companyId,
      name: "测试公司",
    });
    expect(second.listDepartments(seeded.companyId)).toEqual([
      { id: seeded.departmentId, companyId: seeded.companyId, name: "创作部" },
    ]);
    expect(second.getEmployee(seeded.employeeId)).toMatchObject({
      id: seeded.employeeId,
      displayName: "员工甲",
      memoryInitialized: true,
      verifiedCapabilities: ["draw"],
    });
    const appointment = second.getAppointment(seeded.appointmentId);
    expect(appointment).toMatchObject({
      id: seeded.appointmentId,
      employeeId: seeded.employeeId,
      departmentId: seeded.departmentId,
      generation: 1,
      status: "active",
      requiredCapabilities: ["draw"],
    });
    expect(second.getDocumentVersion(work.result.versionId)).toMatchObject({
      versionId: work.result.versionId,
      ownerId: seeded.employeeId,
      documentType: "work",
      content: "第一章分镜草稿",
      digest: work.result.digest,
      appointmentId: seeded.appointmentId,
    });
    const operation = second.getOperation(workOperationId);
    expect(operation).toMatchObject({
      id: workOperationId,
      status: "committed",
      kind: "document.save",
    });
    expect(operation?.result).toMatchObject({ versionId: work.result.versionId, outcome: "saved" });
    expect(second.checkOnboarding(seeded.employeeId)).toMatchObject({
      ready: true,
      appointmentId: seeded.appointmentId,
    });
    await second.close();
  });

  it("同一 operationId 重放返回原结果，不重建身份（跨重开亦然）", async () => {
    const first = await openSoloipsCompanyStore({ storage: fakeStoragePort(), root: ROOT });
    const operationId = nextSeedOperationId("employee");
    const created = await first.createEmployee({ operationId, displayName: "幂等员工" });
    if (created.status !== "committed") throw new Error("种子失败");
    const replayed = await first.createEmployee({ operationId, displayName: "幂等员工" });
    expect(replayed).toMatchObject({ status: "replayed" });
    expect(replayed.status === "replayed" && replayed.result.employeeId).toBe(
      created.result.employeeId,
    );
    await first.close();

    const second = await openSoloipsCompanyStore({ storage: fakeStoragePort(), root: ROOT });
    const acrossRestart = await second.createEmployee({ operationId, displayName: "幂等员工" });
    expect(acrossRestart).toMatchObject({ status: "replayed" });
    let employees = 0;
    for (const key of fakeMediumTable(ROOT, "employee").keys()) {
      void key;
      employees += 1;
    }
    expect(employees).toBe(1);
    await second.close();
  });

  it("operationId 被不同种类操作复用时拒绝（CONFLICT）", async () => {
    const service = await openSoloipsCompanyStore({ storage: fakeStoragePort(), root: ROOT });
    const operationId = nextSeedOperationId("shared");
    const created = await service.createCompany({ operationId, name: "A" });
    expect(created.status).toBe("committed");
    await expect(service.createEmployee({ operationId, displayName: "B" })).rejects.toMatchObject({
      code: "SOLOIPS_CORE_CONFLICT",
    });
    await service.close();
  });

  it("未决操作返回 unknown：意图已落、无结果，且阻塞同员工新准入（ORG-05）", async () => {
    const service = await openSoloipsCompanyStore({ storage: fakeStoragePort(), root: ROOT });
    const seeded = await seedOnboardedEmployee(service);
    // 直达介质注入一条未决操作（模拟崩溃在意图与提交标记之间）。
    const pendingId = asOperationId("seed-pending-block-1");
    fakeMediumTable(ROOT, "operation").set(pendingId, {
      id: pendingId,
      kind: "document.save",
      status: "pending",
      employeeId: seeded.employeeId,
      intent: { employeeId: seeded.employeeId },
    });
    const pending = service.listPendingOperations();
    expect(pending.map((record) => record.id)).toContain(pendingId);

    const entry = await service.requestWorkEntry({
      operationId: nextSeedOperationId("work-entry-blocked"),
      employeeId: seeded.employeeId,
      taskId: "task-1",
      origin: "self-claim",
    });
    expect(entry).toMatchObject({ status: "refused", reason: "employee-operation-unknown" });
    await service.close();
  });
});

describe("lease discipline (ORG-06 / SOLO-FENCE-01 §2)", () => {
  it("每次持久发布前都有新的 assertHeld：任意两次相邻写之间 assert 计数递增", async () => {
    const service = await openSoloipsCompanyStore({ storage: fakeStoragePort(), root: ROOT });
    await seedOnboardedEmployee(service);
    const writes = fakeAdapterEvents().filter((event) => event.startsWith("write"));
    expect(writes.length).toBeGreaterThan(5);
    // 事件串格式由测试替身产出（`write…@assert=N`）；解析失败即用例自身的格式假设破了，
    // 显式抛出而不是让 NaN / undefined 流进断言（noUncheckedIndexedAccess 也要求先取窄）。
    const counts = writes.map((event) => {
      const raw = event.split("@assert=")[1];
      if (raw === undefined) throw new TypeError(`[test] 事件缺少 @assert= 计数：${event}`);
      return Number(raw);
    });
    for (const count of counts) {
      expect(count).toBeGreaterThanOrEqual(1); // 首次写之前已 assert
    }
    for (let index = 1; index < counts.length; index += 1) {
      const previous = counts[index - 1];
      const current = counts[index];
      if (previous === undefined || current === undefined) {
        throw new TypeError("[test] 计数序列出现空洞");
      }
      expect(current).toBeGreaterThan(previous); // 写与写之间必有新 assert
    }
    await service.close();
  });

  it("失权（代际被接管）后发布被拒，业务状态不变", async () => {
    const service = await openSoloipsCompanyStore({ storage: fakeStoragePort(), root: ROOT });
    const before = snapshotMedium();
    fakeTakeoverLease(ROOT); // 第二个 writer 取得新代际
    await expect(
      service.createCompany({ operationId: nextSeedOperationId("company-after-loss"), name: "X" }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_LEASE_NOT_HELD" });
    expect(snapshotMedium()).toEqual(before); // 介质零变化（意图也未落）
    await service.close();
  });
});

describe("closed store and no-bypass surface", () => {
  it("close 逆序释放（domain → stack → lease），关闭后命令拒绝", async () => {
    const service = await openSoloipsCompanyStore({ storage: fakeStoragePort(), root: ROOT });
    await service.close();
    const tail = fakeAdapterEvents().slice(-3);
    expect(tail[0]).toBe(`close:${SOLOIPS_COMPANY_DOMAIN_SPEC.name}`);
    expect(tail[1]).toBe(`stack-dispose:${ROOT}`);
    expect(tail[2]).toBe(`lease-dispose:${ROOT}`);
    await expect(
      service.createCompany({ operationId: nextSeedOperationId("after-close"), name: "X" }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_STORE_CLOSED" });
    expect(() => service.getCompany("cmp_x" as SoloipsCompanyId)).toThrow(SoloipsCoreError);
    await service.close(); // 幂等
  });

  it("服务对象不暴露 domain/表句柄：无旁路写路径", async () => {
    const service = await openSoloipsCompanyStore({ storage: fakeStoragePort(), root: ROOT });
    const ownKeys = Object.keys(service);
    expect(ownKeys).toEqual([]);
    const protoKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
    for (const key of protoKeys) {
      expect(["domain", "table", "tables", "gate", "lease", "stack", "facility"]).not.toContain(
        key,
      );
    }
    await service.close();
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
