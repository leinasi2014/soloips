/**
 * SOLOIPS-CORE-SCOPE-ROLE-SPEC（BE-2）
 *
 * 任职 scope/role 与部长链（Issue #19）的行为测试。依据：
 *  - `docs/design/data-contract.md` §2.1（scope 判别联合三分支各带 companyId、
 *    role 五值）、§2.3（**严格三分支**运行时推断：能定则定、不能定即报错；
 *    禁止任何时序/「首个」推断）、§2.4.2（同公司至多一条有效公司级
 *    `general_assistant`，重复招募返回可判定拒绝）；
 *  - `docs/prds/system-assistant-backend-design-v0.1.md` §4.1 BE-2 四条验收；
 *  - §3.1 SA-02（Host 层 actor 属半可信输入：可作审计线索、不可作授权唯一依据）。
 *
 * 覆盖：
 *  1. 公司级 `general_assistant` 任职可建（验收①），记录里**不带** `departmentId`；
 *  2. 部门级 `department_lead` 任职可建并**回填** `department.leaderAppointmentId`（验收②）；
 *  3. 公司级任职不再被迫挂部门（验收③）——含「旧 `departmentId` 必填约束」的消失；
 *  4. 岗位校验：`role` 与 `scope.kind` 不匹配即拒绝（验收④，`department_lead`
 *     不能产生公司级 `general_assistant`）；
 *  5. 唯一性：同公司重复招募总助理 → `PRECONDITION` + **零业务写**（连意图都不落）；
 *     撤销后可重新招募；不同公司互不影响；
 *  6. 三分支推断：有 scope 用之 / 无 scope 有 departmentId 归部门级（companyId 反解）/
 *     否则 `RECORD_INVALID`；
 *  7. 存量根兼容：BE-1 时代形状（无 scope、有 departmentId）的记录能打开、能读回、
 *     推断出正确的 companyId；
 *  8. actor（SA-02）记入 operation 台账的意图，但**不**构成授权。
 *
 * 测试风格沿用 store.spec.ts：经公开命令面搭建状态；只有「模拟存量/损坏介质」
 * 的用例才用 fakeMediumTable 直达介质。
 */

import { beforeEach, describe, expect, it } from "vitest";

import type {
  SoloipsAppointmentId,
  SoloipsCompanyId,
  SoloipsCoreService,
  SoloipsDepartmentId,
  SoloipsEmployeeId,
} from "../src/contracts";
import { SOLOIPS_COMPANY_DOMAIN_VERSION } from "../src/contracts";
import { SOLOIPS_COMPANY_DOMAIN_SPEC } from "../src/domain";
import { asOperationId } from "../src/ids";
import { openSoloipsCompanyStore } from "../src/store";
import { fakeMediumTable, fakeStoragePort, resetFakeAdapter } from "./adapter-fakes";
import { nextSeedOperationId, seedOnboardedEmployee, TEST_ACCOUNT_ID } from "./seed";

const ROOT = "/tmp/soloips-scope-role-root";

let service: SoloipsCoreService;

beforeEach(async () => {
  resetFakeAdapter();
  service = await openSoloipsCompanyStore({
    storage: fakeStoragePort(),
    root: ROOT,
    accountId: TEST_ACCOUNT_ID,
  });
});

/** 建一个公司 + 部门 + 员工的最小状态（不建任职），供各用例裁剪。 */
async function seedCompanyWithDepartment(): Promise<{
  companyId: SoloipsCompanyId;
  departmentId: SoloipsDepartmentId;
  employeeId: SoloipsEmployeeId;
}> {
  const company = await service.createCompany({
    operationId: nextSeedOperationId("company"),
    name: "作用域测试公司",
  });
  if (company.status !== "committed") throw new Error(`建公司失败：${company.status}`);
  const department = await service.createDepartment({
    operationId: nextSeedOperationId("department"),
    companyId: company.result.companyId,
    name: "创作部",
  });
  if (department.status !== "committed") throw new Error(`建部门失败：${department.status}`);
  const employee = await service.createEmployee({
    operationId: nextSeedOperationId("employee"),
    displayName: "候选员工",
  });
  if (employee.status !== "committed") throw new Error(`建员工失败：${employee.status}`);
  return {
    companyId: company.result.companyId,
    departmentId: department.result.departmentId,
    employeeId: employee.result.employeeId,
  };
}

/** 介质快照（业务表 + 操作台账）：用于断言「零业务写」。 */
function snapshotMedium(): Record<string, readonly unknown[]> {
  const snapshot: Record<string, readonly unknown[]> = {};
  for (const table of ["company", "department", "employee", "appointment", "operation"]) {
    snapshot[table] = [...fakeMediumTable(ROOT, table).entries()].map(([key, value]) => ({
      key,
      value,
    }));
  }
  return snapshot;
}

describe("公司级任职（BE-2 验收①③：不再被迫挂部门）", () => {
  it("scope={kind:'company'} + role='general_assistant' 可建，记录不带 departmentId", async () => {
    const { companyId, employeeId } = await seedCompanyWithDepartment();
    const created = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      scope: { kind: "company", companyId },
      role: "general_assistant",
    });
    expect(created.status).toBe("committed");
    if (created.status !== "committed") throw new Error("建任职失败");

    // 介质上的记录：有 scope、**没有** departmentId（公司级任职不挂部门）。
    const stored = fakeMediumTable(ROOT, "appointment").get(created.result.appointmentId) as {
      readonly scope?: unknown;
      readonly departmentId?: unknown;
      readonly role?: unknown;
    };
    expect(stored.scope).toEqual({ kind: "company", companyId });
    expect(stored.role).toBe("general_assistant");
    expect("departmentId" in stored).toBe(false);

    // 读面：解析后的 scope 可直接读 companyId。
    const read = service.getAppointment(created.result.appointmentId);
    expect(read?.scope).toEqual({ kind: "company", companyId });
    expect(read?.departmentId).toBeUndefined();
  });

  it("入职判定不因缺 departmentId 而失败：公司级任职同样构成有效任职", async () => {
    // 验收③的实质后果：公司级任职若被旧必填约束逼着挂部门，这里会因「无部门」
    // 而无法建立；现在可建且准入判定照常（判定只要求「有有效任职」）。
    const company = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "公司级任职公司",
    });
    const employee = await service.createEmployee({
      operationId: nextSeedOperationId("employee"),
      displayName: "总助理候选人",
    });
    if (company.status !== "committed" || employee.status !== "committed") {
      throw new Error("种子失败");
    }
    const appointment = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId: employee.result.employeeId,
      scope: { kind: "company", companyId: company.result.companyId },
      role: "general_assistant",
    });
    expect(appointment.status).toBe("committed");
    const status = service.checkOnboarding(employee.result.employeeId);
    // 缺的是文档/记忆/装配证据（未保存），**不是**任职。
    expect(status.ready).toBe(false);
    if (status.ready) throw new Error("预期未就绪");
    expect(status.gaps.map((gap) => gap.item)).not.toContain("appointment");
  });
});

describe("部门级任职与部长链（BE-2 验收②）", () => {
  it("scope={kind:'department'} + role='department_lead' 回填 department.leaderAppointmentId", async () => {
    const { companyId, departmentId, employeeId } = await seedCompanyWithDepartment();
    const created = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      scope: { kind: "department", companyId, departmentId },
      role: "department_lead",
    });
    expect(created.status).toBe("committed");
    if (created.status !== "committed") throw new Error("建任职失败");

    const department = service
      .listDepartments(companyId)
      .find((record) => record.id === departmentId);
    expect(department?.leaderAppointmentId).toBe(created.result.appointmentId);
    // 部门记录指向**任职**（不是员工）——data-contract §1.1 的裁定。
    expect(service.getAppointment(created.result.appointmentId)?.employeeId).toBe(employeeId);
  });

  it("仅给 departmentId（不给 scope）：部门级作用域，companyId 由部门记录反解", async () => {
    const { companyId, departmentId, employeeId } = await seedCompanyWithDepartment();
    const created = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      departmentId,
      role: "department_lead",
    });
    expect(created.status).toBe("committed");
    if (created.status !== "committed") throw new Error("建任职失败");
    const read = service.getAppointment(created.result.appointmentId);
    expect(read?.scope).toEqual({ kind: "department", companyId, departmentId });
    expect(read?.departmentId).toBe(departmentId);
  });

  it("回填只作用于目标部门：公司级任职不改任何部门的 leaderAppointmentId（阴性对照）", async () => {
    const { companyId, departmentId, employeeId } = await seedCompanyWithDepartment();
    const other = await service.createDepartment({
      operationId: nextSeedOperationId("department"),
      companyId,
      name: "另一个部门",
    });
    if (other.status !== "committed") throw new Error("建部门失败");

    const assistant = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      scope: { kind: "company", companyId },
      role: "general_assistant",
    });
    expect(assistant.status).toBe("committed");
    // 公司级任职不回填任何部门（回填的触发条件是「部门级 + department_lead」两者同时成立）。
    for (const department of service.listDepartments(companyId)) {
      expect(department.leaderAppointmentId).toBeUndefined();
    }

    // 只回填被任命的那一个部门，另一个部门的 leaderAppointmentId 保持缺省。
    const lead = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      scope: { kind: "department", companyId, departmentId },
      role: "department_lead",
    });
    if (lead.status !== "committed") throw new Error("建部长任职失败");
    const departments = service.listDepartments(companyId);
    expect(departments.find((record) => record.id === departmentId)?.leaderAppointmentId).toBe(
      lead.result.appointmentId,
    );
    expect(
      departments.find((record) => record.id === other.result.departmentId)?.leaderAppointmentId,
    ).toBeUndefined();
  });
});

describe("岗位校验：role 与 scope.kind 必须匹配（BE-2 验收④）", () => {
  it("department_lead 不能产生公司级任职（不能自我升权为公司级）", async () => {
    const { companyId, employeeId } = await seedCompanyWithDepartment();
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId,
        scope: { kind: "company", companyId },
        role: "department_lead",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
  });

  it("general_assistant 不能落在部门级作用域上", async () => {
    const { companyId, departmentId, employeeId } = await seedCompanyWithDepartment();
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId,
        scope: { kind: "department", companyId, departmentId },
        role: "general_assistant",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
  });

  it("team_lead 不能落在公司级作用域上", async () => {
    const { companyId, employeeId } = await seedCompanyWithDepartment();
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId,
        scope: { kind: "company", companyId },
        role: "team_lead",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
  });

  it("company 作用域不得同时带 departmentId（两处归属表达即矛盾输入）", async () => {
    const { companyId, departmentId, employeeId } = await seedCompanyWithDepartment();
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId,
        scope: { kind: "company", companyId },
        departmentId,
        role: "general_assistant",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
  });

  it("department 作用域与 departmentId 不一致即拒绝", async () => {
    const { companyId, departmentId, employeeId } = await seedCompanyWithDepartment();
    const other = await service.createDepartment({
      operationId: nextSeedOperationId("department"),
      companyId,
      name: "另一个部门",
    });
    if (other.status !== "committed") throw new Error("建部门失败");
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId,
        scope: { kind: "department", companyId, departmentId: other.result.departmentId },
        departmentId,
        role: "department_lead",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
  });

  it("scope 与 departmentId 都不给：RECORD_INVALID（不猜、不做时序推断）", async () => {
    const { employeeId } = await seedCompanyWithDepartment();
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId,
        role: "department_lead",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_RECORD_INVALID" });
  });

  it("scope.kind='team'：team 表属 BE-3，本切片如实拒绝而非假装校验通过", async () => {
    const { companyId, employeeId } = await seedCompanyWithDepartment();
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId,
        scope: { kind: "team", companyId, teamId: "team_probe" as never },
        role: "team_lead",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
  });

  it("作用域内的公司与部门必须归属自洽（跨公司引用即拒绝）", async () => {
    const first = await seedCompanyWithDepartment();
    const second = await seedCompanyWithDepartment();
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId: first.employeeId,
        scope: {
          kind: "department",
          companyId: second.companyId,
          departmentId: first.departmentId,
        },
        role: "department_lead",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
  });
});

describe("总助理唯一性（data-contract §2.4.2）", () => {
  it("同公司重复招募：PRECONDITION 拒绝，且零业务写（连意图都不落）", async () => {
    const { companyId, employeeId } = await seedCompanyWithDepartment();
    const first = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      scope: { kind: "company", companyId },
      role: "general_assistant",
    });
    expect(first.status).toBe("committed");

    const before = snapshotMedium();
    const rejectedOperationId = asOperationId("seed-reject-second-assistant");
    await expect(
      service.createAppointment({
        operationId: rejectedOperationId,
        employeeId,
        scope: { kind: "company", companyId },
        role: "general_assistant",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });

    // 零业务写：介质逐字未变（含操作台账——拒绝不留 pending 意图，否则会把
    // 「什么都没发生」变成「一条未决操作」，后续请求还会撞上 unknown）。
    expect(snapshotMedium()).toEqual(before);
    expect(service.getOperation(rejectedOperationId)).toBeUndefined();
    expect(service.listPendingOperations()).toEqual([]);
    // 拒绝可判定且可行动：消息点名既有任职与「先撤销」的出路。
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId,
        scope: { kind: "company", companyId },
        role: "general_assistant",
      }),
    ).rejects.toThrow(/先撤销既有任职/);
  });

  it("并发两个总助理招募：恰好 1 committed + 1 PRECONDITION，零 pending（提交门串行性）", async () => {
    // 为什么必须有这条用例：唯一性的正确性**完全**依赖「读-判-写在同一串行槽位内」。
    // 若判定跑在槽位之外（或放在 mutate 里），两个并发提交会各自读到「尚无总助理」
    // 而双双通过——产出两条总助理，唯一性静默失效。单条顺序用例**盯不住**这一点
    // （顺序调用天然让第二次看到第一次的结果），故这里把两次招募在**同一 tick**
    // 内发起，让两个提交真正重叠。
    const { companyId, employeeId } = await seedCompanyWithDepartment();
    const before = snapshotMedium();

    const attempts = [
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId,
        scope: { kind: "company", companyId },
        role: "general_assistant",
      }),
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId,
        scope: { kind: "company", companyId },
        role: "general_assistant",
      }),
    ];
    // 用 all + 显式捕获（而不是 allSettled）：`PromiseRejectedResult.reason` 是
    // `any`，会让本用例在 `typescript/no-unsafe-*` 规则下退化；catch 的 error 是
    // `unknown`，判定与断言都保持类型安全。
    const settled = await Promise.all(
      attempts.map(async (attempt) => {
        try {
          return { ok: true as const, outcome: await attempt };
        } catch (error: unknown) {
          return { ok: false as const, error };
        }
      }),
    );

    const committed = settled.flatMap((entry) =>
      entry.ok && entry.outcome.status === "committed" ? [entry.outcome.result] : [],
    );
    const refusals = settled.flatMap((entry) => (entry.ok ? [] : [entry.error]));

    expect(committed).toHaveLength(1);
    expect(refusals).toHaveLength(1);
    // 拒绝方必须是**可判定的** PRECONDITION——不是 CONFLICT、不是 unknown、
    // 也不是「两条都成功」。语义上它是「状态不允许该操作」。
    expect(refusals[0]).toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });

    // 介质上的净效果（与 before 求差，避免把种子期的写算进来）：
    // 恰好 +1 条任职、+1 条已提交台账、**+0 条未决操作**。
    const after = snapshotMedium();
    expect(after["appointment"]?.length ?? 0).toBe((before["appointment"]?.length ?? 0) + 1);
    expect(after["operation"]?.length ?? 0).toBe((before["operation"]?.length ?? 0) + 1);
    expect(service.listPendingOperations()).toEqual([]);

    // 唯一存活的那条就是成功方返回的 id（不是另建了一条谁也不知道的）。
    const surviving = [...fakeMediumTable(ROOT, "appointment").keys()];
    expect(surviving).toEqual([committed[0]?.appointmentId]);
    // 读面复核：该员工名下恰好一条有效总助理任职。
    expect(
      service.getAppointment(committed[0]?.appointmentId as SoloipsAppointmentId),
    ).toMatchObject({ role: "general_assistant", scope: { kind: "company", companyId } });
  });

  it("撤销后可重新招募（唯一性只约束有效任职）", async () => {
    const { companyId, employeeId } = await seedCompanyWithDepartment();
    const first = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      scope: { kind: "company", companyId },
      role: "general_assistant",
    });
    if (first.status !== "committed") throw new Error("建任职失败");
    const revoked = await service.revokeAppointment({
      operationId: nextSeedOperationId("revoke"),
      appointmentId: first.result.appointmentId,
    });
    expect(revoked.status).toBe("committed");

    const second = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      scope: { kind: "company", companyId },
      role: "general_assistant",
    });
    expect(second.status).toBe("committed");
    if (second.status !== "committed") throw new Error("重新招募失败");
    // 代际递增：同一员工的新任职不复活旧代际（ORG-06）。
    expect(second.result.generation).toBe(first.result.generation + 1);
  });

  it("唯一性是**按公司**的：另一家公司可各自有一条总助理", async () => {
    const first = await seedCompanyWithDepartment();
    const second = await seedCompanyWithDepartment();
    const firstAppointment = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId: first.employeeId,
      scope: { kind: "company", companyId: first.companyId },
      role: "general_assistant",
    });
    const secondAppointment = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId: second.employeeId,
      scope: { kind: "company", companyId: second.companyId },
      role: "general_assistant",
    });
    expect(firstAppointment.status).toBe("committed");
    expect(secondAppointment.status).toBe("committed");
  });

  it("部门级任职不占公司总助理名额（作用域不同即不冲突）", async () => {
    const { companyId, departmentId, employeeId } = await seedCompanyWithDepartment();
    const lead = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      scope: { kind: "department", companyId, departmentId },
      role: "department_lead",
    });
    expect(lead.status).toBe("committed");
    const assistant = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      scope: { kind: "company", companyId },
      role: "general_assistant",
    });
    expect(assistant.status).toBe("committed");
  });

  it("无 role 的存量形状任职不触发唯一性判定（不被误当成总助理）", async () => {
    const { companyId, departmentId, employeeId } = await seedCompanyWithDepartment();
    // 存量形状：只有 departmentId、无 scope/role。
    const legacy = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      departmentId,
    });
    expect(legacy.status).toBe("committed");
    const assistant = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      scope: { kind: "company", companyId },
      role: "general_assistant",
    });
    expect(assistant.status).toBe("committed");
  });
});

describe("部长回填的未裁定行为（如实钉住，不作为验收宣称）", () => {
  it("第二个 department_lead 覆盖 leaderAppointmentId（本切片无部长唯一性规则）", async () => {
    // 为什么这条用例是「钉住未裁定行为」而不是「验收功能」：data-contract §2.1.1 的
    // 唯一性协议（P-4/P-5/P-8）只覆盖**团队组长**，部门部长**没有**对应条文，
    // BE-2 的四条验收也不含部长唯一性。故实现不做拒绝，第二条任职照常写入并覆盖
    // 部门引用。把它写成显式断言，是为了让「当前行为是什么」可见——
    // 而不是让一个未被要求的拒绝悄悄存在、或让覆盖行为无人知晓。
    const { companyId, departmentId, employeeId } = await seedCompanyWithDepartment();
    const first = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      scope: { kind: "department", companyId, departmentId },
      role: "department_lead",
    });
    if (first.status !== "committed") throw new Error("建首个部长任职失败");
    const second = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      scope: { kind: "department", companyId, departmentId },
      role: "department_lead",
    });
    expect(second.status).toBe("committed");
    if (second.status !== "committed") throw new Error("建第二个部长任职失败");

    const department = service
      .listDepartments(companyId)
      .find((record) => record.id === departmentId);
    expect(department?.leaderAppointmentId).toBe(second.result.appointmentId);
    // 旧任职仍在且 active——「后写者胜」只改引用，不改任职状态（撤销是独立命令）。
    expect(service.getAppointment(first.result.appointmentId)?.status).toBe("active");
    expect(second.result.generation).toBe(first.result.generation + 1);
  });
});

describe("SA-02：actor 只作审计线索（不做授权强制）", () => {
  it("actorAppointmentId 记入 operation 台账的意图", async () => {
    const seeded = await seedOnboardedEmployee(service);
    const operationId = asOperationId("seed-actor-audit-1");
    const created = await service.createAppointment({
      operationId,
      employeeId: seeded.employeeId,
      scope: { kind: "department", companyId: seeded.companyId, departmentId: seeded.departmentId },
      role: "department_lead",
      actorAppointmentId: seeded.appointmentId,
    });
    expect(created.status).toBe("committed");
    const operation = service.getOperation(operationId);
    expect(operation?.intent).toMatchObject({
      actorAppointmentId: seeded.appointmentId,
      role: "department_lead",
    });
  });

  it("不给 actor 也能建任职：actor 不是必填，也不是授权门（M0.1 无权限服务）", async () => {
    const { companyId, departmentId, employeeId } = await seedCompanyWithDepartment();
    const created = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      scope: { kind: "department", companyId, departmentId },
      role: "department_lead",
    });
    expect(created.status).toBe("committed");
  });

  it("actor 形状不合法即 VALIDATION（不接受任意文本冒充任职）", async () => {
    const { companyId, employeeId } = await seedCompanyWithDepartment();
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId,
        scope: { kind: "company", companyId },
        role: "general_assistant",
        actorAppointmentId: "not-an-appointment-id" as never,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
  });
});

describe("存量根兼容：BE-1 时代形状（无 scope/role）", () => {
  it("无 scope、有 departmentId 的存量任职：打开放行，读面推断出正确 companyId", async () => {
    const { companyId, departmentId, employeeId } = await seedCompanyWithDepartment();
    // 模拟存量介质：直接写入一条「BE-1 时代」形状的任职记录（无 scope/role）。
    const legacyId = "apt_legacy_1" as SoloipsAppointmentId;
    fakeMediumTable(ROOT, "appointment").set(legacyId, {
      id: legacyId,
      employeeId,
      departmentId,
      requiredCapabilities: [],
      generation: 1,
      status: "active",
    });
    // 关闭并以**同一根**重开：存量记录必须通过 schema 校验（不触发整次 open 拒绝）。
    await service.close();
    const reopened = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    const read = reopened.getAppointment(legacyId);
    // 分支 2：companyId 由 departmentId 反解（而不是靠读取顺序猜）。
    expect(read?.scope).toEqual({ kind: "department", companyId, departmentId });
    // 〔约束〕读面**不写回**：介质上的记录逐字未变（§2.3「不写回、不猜测」）。
    const stored = fakeMediumTable(ROOT, "appointment").get(legacyId) as Record<string, unknown>;
    expect("scope" in stored).toBe(false);
    expect("role" in stored).toBe(false);
    await reopened.close();
  });

  it("无 scope 且无 departmentId 的存量任职：读面 RECORD_INVALID（不猜）", async () => {
    const { employeeId } = await seedCompanyWithDepartment();
    const ambiguousId = "apt_legacy_ambiguous" as SoloipsAppointmentId;
    fakeMediumTable(ROOT, "appointment").set(ambiguousId, {
      id: ambiguousId,
      employeeId,
      requiredCapabilities: [],
      generation: 1,
      status: "active",
    });
    // 记录本身通过 schema（两字段皆可选），打开成功——不可判定发生在**读作用域**时。
    expect(() => service.getAppointment(ambiguousId)).toThrow(/无法判定作用域/);
    expect(() => service.getAppointment(ambiguousId)).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_RECORD_INVALID" }) as Error,
    );
  });

  it("departmentId 指向不存在的部门：读面 RECORD_INVALID（解析不出公司即报错）", async () => {
    const { employeeId } = await seedCompanyWithDepartment();
    const danglingId = "apt_legacy_dangling" as SoloipsAppointmentId;
    fakeMediumTable(ROOT, "appointment").set(danglingId, {
      id: danglingId,
      employeeId,
      departmentId: "dep_missing" as SoloipsDepartmentId,
      requiredCapabilities: [],
      generation: 1,
      status: "active",
    });
    expect(() => service.getAppointment(danglingId)).toThrow(/读不到对应部门记录/);
  });

  it("部门记录无 leaderAppointmentId 仍合法（首任无部长态，ORG-02）", async () => {
    const { companyId } = await seedCompanyWithDepartment();
    expect(service.listDepartments(companyId)[0]?.leaderAppointmentId).toBeUndefined();
  });

  it("存量任职与新建任职共存：唯一性判定按推断后的作用域比较", async () => {
    const { companyId, departmentId, employeeId } = await seedCompanyWithDepartment();
    // 关键形状：**有 role='general_assistant' 但无 scope**、只有 departmentId。
    // 按 §2.3 分支 2 它解析为**部门级**任职，故不占公司级总助理名额——
    // 这正是「作用域必须先经三分支解析再比较」的可观察后果：若直接读
    // `record.scope`（undefined）或按 role 粗判，都会误判为公司级而错误拒绝。
    const legacyId = "apt_legacy_ga_no_scope" as SoloipsAppointmentId;
    fakeMediumTable(ROOT, "appointment").set(legacyId, {
      id: legacyId,
      employeeId,
      departmentId,
      role: "general_assistant",
      requiredCapabilities: [],
      generation: 1,
      status: "active",
    });
    const assistant = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId,
      scope: { kind: "company", companyId },
      role: "general_assistant",
    });
    expect(assistant.status).toBe("committed");
    // 反向可读性断言：那条存量记录读出来确实是部门级（而不是被读成公司级）。
    expect(service.getAppointment(legacyId)?.scope).toEqual({
      kind: "department",
      companyId,
      departmentId,
    });
  });

  it("存量 general_assistant 缺 scope 且解析不出公司：唯一性扫描 fail-closed 拒绝", async () => {
    // 不可判定的记录可能是公司级总助理，也可能不是——此时**不能**假定它不是
    // 而放行第二条（那会让「同公司至多一条」在数据不一致时静默失效）。
    // 故唯一性扫描对分支 3 的记录以 RECORD_INVALID 拒绝新建，而不是跳过它。
    const { companyId, employeeId } = await seedCompanyWithDepartment();
    const ambiguousId = "apt_legacy_ga_ambiguous" as SoloipsAppointmentId;
    fakeMediumTable(ROOT, "appointment").set(ambiguousId, {
      id: ambiguousId,
      employeeId,
      role: "general_assistant",
      requiredCapabilities: [],
      generation: 1,
      status: "active",
    });
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId,
        scope: { kind: "company", companyId },
        role: "general_assistant",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_RECORD_INVALID" });
  });
});

describe("appointment schema（scope 判别联合 + 可选字段的持久校验）", () => {
  const schema = SOLOIPS_COMPANY_DOMAIN_SPEC.tables.appointment.valueSchema;

  it("三分支 scope 均通过；role 五值均通过", () => {
    const base = {
      id: "apt_x",
      employeeId: "emp_x",
      requiredCapabilities: [],
      generation: 1,
      status: "active",
    };
    const scopes = [
      { kind: "company", companyId: "cmp_x" },
      { kind: "department", companyId: "cmp_x", departmentId: "dep_x" },
      { kind: "team", companyId: "cmp_x", teamId: "team_x" },
    ] as const;
    for (const scope of scopes) {
      expect(schema.safeParse({ ...base, scope }).success).toBe(true);
    }
    for (const role of [
      "owner",
      "general_assistant",
      "department_lead",
      "team_lead",
      "member",
    ] as const) {
      expect(schema.safeParse({ ...base, role }).success).toBe(true);
    }
  });

  it("scope 缺分支必填字段、kind 非法、role 非法一律拒绝", () => {
    const base = {
      id: "apt_x",
      employeeId: "emp_x",
      requiredCapabilities: [],
      generation: 1,
      status: "active",
    };
    // department 分支缺 departmentId
    expect(
      schema.safeParse({ ...base, scope: { kind: "department", companyId: "cmp_x" } }).success,
    ).toBe(false);
    // team 分支缺 teamId
    expect(schema.safeParse({ ...base, scope: { kind: "team", companyId: "cmp_x" } }).success).toBe(
      false,
    );
    // 未知 kind
    expect(schema.safeParse({ ...base, scope: { kind: "unit", companyId: "cmp_x" } }).success).toBe(
      false,
    );
    // 非法 role（DSH roster 的 'lead' 不得写入 core 记录）
    expect(schema.safeParse({ ...base, role: "lead" }).success).toBe(false);
    // id 形状不合法
    expect(schema.safeParse({ ...base, scope: { kind: "company", companyId: "x" } }).success).toBe(
      false,
    );
  });

  it("department 记录：leaderAppointmentId 可选且形状受约束", () => {
    const departmentSchema = SOLOIPS_COMPANY_DOMAIN_SPEC.tables.department.valueSchema;
    expect(
      departmentSchema.safeParse({ id: "dep_x", companyId: "cmp_x", name: "创作部" }).success,
    ).toBe(true);
    expect(
      departmentSchema.safeParse({
        id: "dep_x",
        companyId: "cmp_x",
        name: "创作部",
        leaderAppointmentId: "apt_x",
      }).success,
    ).toBe(true);
    expect(
      departmentSchema.safeParse({
        id: "dep_x",
        companyId: "cmp_x",
        name: "创作部",
        leaderAppointmentId: "emp_x", // 不是任职 id 形状
      }).success,
    ).toBe(false);
  });

  it("存量形状（无 scope/role，有 departmentId）通过校验——这正是存量根不被拒的原因", () => {
    expect(
      schema.safeParse({
        id: "apt_legacy",
        employeeId: "emp_x",
        departmentId: "dep_x",
        requiredCapabilities: [],
        generation: 1,
        status: "active",
      }).success,
    ).toBe(true);
  });

  it("domain 版本保持 1（新增字段全为可选，不递增版本位）", () => {
    // 递增会让 json `single` 布局的严格相等版本判定直接拒绝存量根，而 sqlite
    // 后端根本不写版本戳——递增只破坏前者、对后者无保护。见 src/domain.ts 的
    // 「兼容边界登记」块注释。
    expect(SOLOIPS_COMPANY_DOMAIN_SPEC.version).toBe(1);
    expect(SOLOIPS_COMPANY_DOMAIN_VERSION).toBe(1);
  });
});
