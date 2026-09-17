/**
 * 入职/准入判定行为测试（ORG-03 / SOLO-ACC-04 的判定面）。
 *
 * 覆盖：全项通过；逐项缺项返回**具体**原因；「文件在但内容无效」必须失败
 * （空白内容、摘要不符）；属主不符；任职缺失/撤销；能力缺项点名；装配证据
 * 缺失/过期。判定是纯读函数——状态全部经公开命令面搭建，只有损坏注入
 * 用例直达 fake 介质。
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { SoloipsCoreService, SoloipsEmployeeId, SoloipsOnboardingGap } from "../src/contracts";
import { openSoloipsCompanyStore } from "../src/store";
import { fakeMediumTable, fakeStoragePort, resetFakeAdapter } from "./adapter-fakes";
import { nextSeedOperationId, seedOnboardedEmployee, TEST_ACCOUNT_ID } from "./seed";

const ROOT = "/tmp/soloips-onboarding-root";

let service: SoloipsCoreService;

beforeEach(async () => {
  resetFakeAdapter();
  service = await openSoloipsCompanyStore({
    storage: fakeStoragePort(),
    root: ROOT,
    accountId: TEST_ACCOUNT_ID,
  });
});

function gapsOf(employeeId: SoloipsEmployeeId): SoloipsOnboardingGap[] {
  const status = service.checkOnboarding(employeeId);
  if (status.ready) throw new Error("预期未通过，但判定为 ready");
  return [...status.gaps];
}

describe("onboarding predicate (ORG-03 / SOLO-ACC-04)", () => {
  it("全项满足时 ready，并给出所依据的任职与代际", async () => {
    const seeded = await seedOnboardedEmployee(service, { requiredCapabilities: ["draw"] });
    const status = service.checkOnboarding(seeded.employeeId);
    expect(status).toMatchObject({
      ready: true,
      appointmentId: seeded.appointmentId,
      generation: 1,
    });
  });

  it("员工不存在时返回具体缺项 employee/employee-not-found", () => {
    const status = service.checkOnboarding("emp_missing" as SoloipsEmployeeId);
    expect(status).toEqual({
      ready: false,
      gaps: [expect.objectContaining({ item: "employee", reason: "employee-not-found" })],
    });
  });

  it("无任职时返回 appointment/appointment-missing", async () => {
    // 手工搭一个「有员工、有文档、无任职」的状态。
    const company = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "c",
    });
    const employee = await service.createEmployee({
      operationId: nextSeedOperationId("employee"),
      displayName: "无任职员工",
    });
    if (company.status !== "committed" || employee.status !== "committed") {
      throw new Error("种子失败");
    }
    for (const documentType of ["profile", "avatar", "soul", "operating"] as const) {
      const saved = await service.saveEmployeeDocument({
        operationId: nextSeedOperationId(`doc-${documentType}`),
        employeeId: employee.result.employeeId,
        documentType,
        content: `内容 ${documentType}`,
      });
      if (saved.status !== "committed") throw new Error("种子失败");
      const evidence = await service.recordAssemblyEvidence({
        operationId: nextSeedOperationId(`assembly-${documentType}`),
        employeeId: employee.result.employeeId,
        documentType,
        versionId: saved.result.versionId,
      });
      if (evidence.status !== "committed") throw new Error("种子失败");
    }
    const memory = await service.initializeEmployeeMemory({
      operationId: nextSeedOperationId("memory"),
      employeeId: employee.result.employeeId,
    });
    if (memory.status !== "committed") throw new Error("种子失败");

    expect(gapsOf(employee.result.employeeId)).toContainEqual(
      expect.objectContaining({ item: "appointment", reason: "appointment-missing" }),
    );
  });

  it("任职被撤销后返回 appointment/appointment-revoked", async () => {
    const seeded = await seedOnboardedEmployee(service);
    const revoked = await service.revokeAppointment({
      operationId: nextSeedOperationId("revoke"),
      appointmentId: seeded.appointmentId,
    });
    expect(revoked.status).toBe("committed");
    expect(gapsOf(seeded.employeeId)).toContainEqual(
      expect.objectContaining({ item: "appointment", reason: "appointment-revoked" }),
    );
  });

  for (const documentType of ["profile", "avatar", "soul", "operating"] as const) {
    it(`缺${documentType}时返回 document-missing 及对应文档项`, async () => {
      const seeded = await seedOnboardedEmployee(service, {
        skip: new Set([documentType, `assembly:${documentType}`]),
      });
      expect(gapsOf(seeded.employeeId)).toContainEqual(
        expect.objectContaining({ item: documentType, reason: "document-missing", documentType }),
      );
    });
  }

  it("文件在但内容空白：必须失败并给出 blank-content 细节（ACC-04）", async () => {
    const seeded = await seedOnboardedEmployee(service, { documentContent: { avatar: "   " } });
    const gaps = gapsOf(seeded.employeeId);
    expect(gaps).toContainEqual(
      expect.objectContaining({
        item: "avatar",
        reason: "document-content-invalid",
        documentDetail: "blank-content",
      }),
    );
  });

  it("内容与摘要不符（介质损坏）：返回 digest-mismatch 细节", async () => {
    const seeded = await seedOnboardedEmployee(service);
    const employee = service.getEmployee(seeded.employeeId);
    const versionId = employee?.currentDocuments["soul"];
    if (versionId === undefined) throw new Error("种子失败：soul 当前引用缺失");
    const record = service.getDocumentVersion(versionId);
    if (record === undefined) throw new Error("种子失败：soul 版本记录缺失");
    // 直达 fake 介质篡改内容（模拟持久层损坏；保存时摘要不再匹配）。
    const stored = fakeMediumTable(ROOT, "document_version").get(versionId) as { content: string };
    stored.content = `${record.content} 被篡改`;
    expect(gapsOf(seeded.employeeId)).toContainEqual(
      expect.objectContaining({
        item: "soul",
        reason: "document-content-invalid",
        documentDetail: "digest-mismatch",
      }),
    );
  });

  it("当前引用指向他人版本时返回 document-owner-mismatch", async () => {
    const seeded = await seedOnboardedEmployee(service);
    const other = await service.createEmployee({
      operationId: nextSeedOperationId("employee-other"),
      displayName: "员工乙",
    });
    if (other.status !== "committed") throw new Error("种子失败");
    const saved = await service.saveEmployeeDocument({
      operationId: nextSeedOperationId("doc-other-profile"),
      employeeId: other.result.employeeId,
      documentType: "profile",
      content: "员工乙的资料",
    });
    if (saved.status !== "committed") throw new Error("种子失败");
    // 直达 fake 介质模拟错位引用：员工甲的当前 profile 引用改指员工乙的版本。
    const stored = fakeMediumTable(ROOT, "employee").get(seeded.employeeId) as {
      currentDocuments: Record<string, string>;
    };
    stored.currentDocuments["profile"] = saved.result.versionId;
    expect(gapsOf(seeded.employeeId)).toContainEqual(
      expect.objectContaining({ item: "profile", reason: "document-owner-mismatch" }),
    );
  });

  it("记忆未初始化时返回 memory-not-initialized", async () => {
    const seeded = await seedOnboardedEmployee(service, { skip: new Set(["memory"]) });
    expect(gapsOf(seeded.employeeId)).toContainEqual(
      expect.objectContaining({ item: "memory", reason: "memory-not-initialized" }),
    );
  });

  it("岗位必需能力未验证时逐项点名（capability-not-verified + capability）", async () => {
    const seeded = await seedOnboardedEmployee(service, {
      requiredCapabilities: ["draw", "ink"],
      skip: new Set(["capability:ink"]),
    });
    const gaps = gapsOf(seeded.employeeId);
    expect(gaps).toContainEqual(
      expect.objectContaining({
        item: "capability",
        reason: "capability-not-verified",
        capability: "ink",
      }),
    );
    expect(gaps).not.toContainEqual(
      expect.objectContaining({ item: "capability", capability: "draw" }),
    );
  });

  it("装配证据缺失返回 assembly-evidence-missing；当前版本更新后证据过期", async () => {
    const seeded = await seedOnboardedEmployee(service, {
      skip: new Set(["assembly:operating"]),
    });
    expect(gapsOf(seeded.employeeId)).toContainEqual(
      expect.objectContaining({
        item: "assembly",
        reason: "assembly-evidence-missing",
        documentType: "operating",
      }),
    );

    // 补记证据后该缺项消除。
    const employee = service.getEmployee(seeded.employeeId);
    const currentOperating = employee?.currentDocuments["operating"];
    if (currentOperating === undefined) throw new Error("种子失败：operating 当前引用缺失");
    const evidence = await service.recordAssemblyEvidence({
      operationId: nextSeedOperationId("assembly-operating-fix"),
      employeeId: seeded.employeeId,
      documentType: "operating",
      versionId: currentOperating,
    });
    if (evidence.status !== "committed") throw new Error("种子失败");
    // 该缺项消除后员工整体 ready（种子其余项完整）。
    expect(service.checkOnboarding(seeded.employeeId)).toMatchObject({ ready: true });

    // 保存新版本后，旧证据不再指向当前版本 → 过期（增量复核）。
    const renewed = await service.saveEmployeeDocument({
      operationId: nextSeedOperationId("doc-operating-v2"),
      employeeId: seeded.employeeId,
      documentType: "operating",
      content: "更新后的操作规范",
    });
    if (renewed.status !== "committed") throw new Error("种子失败");
    expect(gapsOf(seeded.employeeId)).toContainEqual(
      expect.objectContaining({
        item: "assembly",
        reason: "assembly-evidence-stale",
        documentType: "operating",
      }),
    );
  });
});
