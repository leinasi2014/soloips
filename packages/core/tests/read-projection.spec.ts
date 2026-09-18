/**
 * SOLOIPS-CORE-READ-PROJECTION-SPEC（BE-4a）
 *
 * 读投影扩容（Issue #21/#31，切片 BE-4a）的行为测试。依据：
 *  - `docs/design/data-contract.md` §2.4.1 **SA-01.1**（「无总助理」与
 *    「查询未覆盖/查询失败」必须可区分，不得用空数组或字段缺省表达）；
 *  - §2.3（`appointment.scope` **严格三分支**：有 `scope` 用之；无 `scope` 有
 *    `departmentId` 即部门级、`companyId` 由部门记录反解；两者皆无即
 *    `SOLOIPS_CORE_RECORD_INVALID`，**禁止任何时序/「首个」推断**）；
 *  - §2.4.2（同一公司同一时刻至多一条有效公司级 `general_assistant`）；
 *  - `docs/prds/system-assistant-backend-design-v0.1.md` §4.1 BE-4 验收①…③
 *    （组织树一次读回 / 员工配置页字段齐备 / 形状校验与既有读面一致）；
 *  - `docs/prds/organization-full-backend-design-v0.1.md` §1.2 第 2 步
 *    （编组候选人集合依赖 `listAppointments(departmentId)` / `listEmployees(companyId)`）。
 *
 * 覆盖（按验收清单）：
 *  A. 形状校验统一（`get*` 五处 + `listDepartments` + `listTeams` 扩键的校验）；
 *  B. `listEmployees` 两跳关联与**去重口径**（同一员工多任职只出现一次）；
 *  C. §2.3 三分支在读面上的行为（含分支 3 的 fail-closed：不跳过、不静默漏掉）；
 *  D. `listAdministrators` 显式状态（`vacant`/`uncovered`/`present`/`inconsistent`
 *     四分，含「成功空结果不得吞错误」）；
 *  E. `listTeams` 的 `departmentId` 过滤（含跨公司部门、缺省语义不变）；
 *  F. 读面纪律：零业务写、零 operation、零恢复副作用（介质快照对照）。
 *
 * 测试风格沿用 team-data.spec.ts：经公开命令面搭建状态；只有「模拟存量/损坏
 * 介质」的用例才用 `fakeMediumTable` 直达介质。
 */

import { beforeEach, describe, expect, it } from "vitest";

import type {
  SoloipsAdministratorProjection,
  SoloipsAdministratorView,
  SoloipsAppointmentId,
  SoloipsAppointmentScope,
  SoloipsCompanyId,
  SoloipsCoreService,
  SoloipsDepartmentId,
  SoloipsDocumentVersionId,
  SoloipsEmployeeId,
  SoloipsTeamId,
} from "../src/contracts";
import { openSoloipsCompanyStore } from "../src/store";
import { fakeMediumTable, fakeStoragePort, resetFakeAdapter } from "./adapter-fakes";
import { nextSeedOperationId, TEST_ACCOUNT_ID } from "./seed";

const ROOT = "/tmp/soloips-read-projection-root";

let service: SoloipsCoreService;

beforeEach(async () => {
  resetFakeAdapter();
  service = await openSoloipsCompanyStore({
    storage: fakeStoragePort(),
    root: ROOT,
    accountId: TEST_ACCOUNT_ID,
    // 〔BE-5 追加，既有断言逐条不变〕本 spec 用「两家公司」构造跨公司隔离/归属
    // 场景（listEmployees 按公司过滤、D1 顺序无关性、listAdministrators 的公司
    // 隔离、listTeams 的部门不跨公司）。配额**不是**本 spec 的验证面，而缺省的
    // `free` 计划（1 公司）会让第二个 `enterprise` 被拒——那会把「隔离语义」的
    // 用例变成「配额拒绝」的用例（假覆盖：标题说隔离、实际撞配额）。
    // 故本 fixture 显式取**无限制**计划；配额行为由 `quota-tree.spec.ts` 验证。
    planCode: "enterprise",
  });
});

interface ReadSeed {
  readonly companyId: SoloipsCompanyId;
  readonly departmentId: SoloipsDepartmentId;
  readonly employeeId: SoloipsEmployeeId;
}

/** 建公司 + 部门 + 员工（无任职），供各用例裁剪。 */
async function seedBase(): Promise<ReadSeed> {
  const company = await service.createCompany({
    operationId: nextSeedOperationId("company"),
    name: "读投影测试公司",
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
    displayName: "读投影员工",
  });
  if (employee.status !== "committed") throw new Error(`建员工失败：${employee.status}`);
  return {
    companyId: company.result.companyId,
    departmentId: department.result.departmentId,
    employeeId: employee.result.employeeId,
  };
}

async function seedEmployee(displayName: string): Promise<SoloipsEmployeeId> {
  const created = await service.createEmployee({
    operationId: nextSeedOperationId("employee"),
    displayName,
  });
  if (created.status !== "committed") throw new Error(`建员工失败：${created.status}`);
  return created.result.employeeId;
}

/** 在给定公司下建一个部门（F-06 的两条用例需要「干净的另一个部门」作对照）。 */
async function seedDepartment(
  companyId: SoloipsCompanyId,
  name: string,
): Promise<SoloipsDepartmentId> {
  const created = await service.createDepartment({
    operationId: nextSeedOperationId("department"),
    companyId,
    name,
  });
  if (created.status !== "committed") throw new Error(`建部门失败：${created.status}`);
  return created.result.departmentId;
}

/** 建一条任职（显式 scope；调用方保证 scope 自洽）。 */
async function seedAppointment(
  employeeId: SoloipsEmployeeId,
  scope: SoloipsAppointmentScope,
  role?: "general_assistant" | "department_lead" | "team_lead" | "member" | "owner",
): Promise<SoloipsAppointmentId> {
  const created = await service.createAppointment({
    operationId: nextSeedOperationId("appointment"),
    employeeId,
    scope,
    ...(role === undefined ? {} : { role }),
  });
  if (created.status !== "committed") throw new Error(`建任职失败：${created.status}`);
  return created.result.appointmentId;
}

/**
 * 建一个可用团队（P-9 三步），返回团队与其组长任职/员工。
 *
 * 〔为什么返回组长 id〕组长任职是**团队级**任职，因此该员工也算「在该公司」
 * （公司过滤对任意 kind 生效）——按公司列员工的用例必须把它算进预期集合，
 * 否则断言会掩盖「团队级任职被漏掉」这一缺陷。
 */
async function seedUsableTeam(
  companyId: SoloipsCompanyId,
  departmentId: SoloipsDepartmentId | undefined,
  name: string,
): Promise<{
  readonly teamId: SoloipsTeamId;
  readonly leadAppointmentId: SoloipsAppointmentId;
  readonly leadEmployeeId: SoloipsEmployeeId;
}> {
  const created = await service.createTeam({
    operationId: nextSeedOperationId("team-create"),
    companyId,
    ...(departmentId === undefined ? {} : { departmentId }),
    name,
    function: "读投影测试职能",
  });
  if (created.status !== "committed") throw new Error(`建团队失败：${created.status}`);
  const teamId = created.result.teamId;
  const leadEmployeeId = await seedEmployee(`${name}组长`);
  const leadAppointmentId = await seedAppointment(
    leadEmployeeId,
    { kind: "team", companyId, teamId },
    "team_lead",
  );
  const activated = await service.activateTeam({
    operationId: nextSeedOperationId("team-activate"),
    teamId,
    leadAppointmentId,
  });
  if (activated.status !== "committed") throw new Error(`激活团队失败：${activated.status}`);
  return { teamId, leadAppointmentId, leadEmployeeId };
}

/** 介质快照（业务表 + 台账）：用于断言「零业务写、零 operation」。 */
function snapshotMedium(): Record<string, readonly unknown[]> {
  const snapshot: Record<string, readonly unknown[]> = {};
  for (const table of [
    "company",
    "department",
    "employee",
    "appointment",
    "document_version",
    "operation",
    "team",
  ]) {
    snapshot[table] = [...fakeMediumTable(ROOT, table).entries()].map(([key, value]) => ({
      key,
      value,
    }));
  }
  return snapshot;
}

/** 直写一条「BE-1 时代」形状的存量任职（无 scope/role）。 */
function injectLegacyAppointment(
  id: string,
  employeeId: SoloipsEmployeeId,
  extra: Record<string, unknown>,
): SoloipsAppointmentId {
  const appointmentId = id as SoloipsAppointmentId;
  fakeMediumTable(ROOT, "appointment").set(appointmentId, {
    id: appointmentId,
    employeeId,
    requiredCapabilities: [],
    generation: 1,
    status: "active",
    ...extra,
  });
  return appointmentId;
}

/**
 * 取「已知公司存在」投影的 administrators 清单。
 *
 * 〔为什么需要它〕`uncovered` 分支刻意**不**携带 `administrators`（公司都不存在，
 * 「有几条总助理」这个问题无意义）。测试里要读该字段就得先按 status 收窄——
 * 这正是 SA-01.1 要求调用方做的判定（判别联合强制它，而不是让 `[]` 冒充一切）。
 * 断言失败即抛，避免 `?.` 让后续断言静默通过。
 */
function administratorsOf(
  projection: SoloipsAdministratorProjection,
): readonly SoloipsAdministratorView[] {
  if (projection.status === "uncovered") {
    throw new Error("投影为 uncovered：公司记录不存在，administrators 字段按契约不携带");
  }
  return projection.administrators;
}

/**
 * 把部门记录的 `companyId` 改成非法形状（非字符串），使该部门在读取时于 schema
 * 校验处抛出**介质层**异常（fake adapter 的 `invalid-record`，非 `SoloipsCoreError`）。
 *
 * 〔用途〕这是 core 测试内可构造的「介质故障」形状：core 的读路径同步、不暴露故障
 * 注入点，故用「记录损坏」代表基础设施故障类异常。用于钉住
 * `#tryResolveAppointmentScope` 的 catch **宽度**（只吞分支 3 的
 * `SOLOIPS_CORE_RECORD_INVALID`，介质故障必须原样冒泡）。
 */
function corruptDepartmentCompanyId(departmentId: SoloipsDepartmentId): void {
  const stored = fakeMediumTable(ROOT, "department").get(departmentId) as Record<string, unknown>;
  fakeMediumTable(ROOT, "department").set(departmentId, {
    ...stored,
    companyId: 42, // 非字符串：schema 校验失败（介质损坏信号）
  });
}

/** 观测一次读调用的结果：正常返回「不抛」+ 值，异常返回其 code。 */
function observeRead(fn: () => unknown): { readonly threw: boolean; readonly code?: string } {
  try {
    fn();
    return { threw: false };
  } catch (error) {
    const code = error instanceof Error ? (error as { readonly code?: string }).code : undefined;
    return { threw: true, ...(code === undefined ? {} : { code }) };
  }
}

/**
 * 交换两条介质记录的插入顺序（删除后按相反顺序重放），用于断言「结果与顺序无关」。
 *
 * 〔为什么需要它〕§2.3 禁止时序/「首个」推断——若某条路径的结果在交换顺序后改变，
 * 说明实现按遍历顺序取值。这是该禁令的**可观察判据**（QA 的 order-flip 探针手法）。
 */
function flipMediumOrder(firstKey: string, secondKey: string): void {
  const table = fakeMediumTable(ROOT, "appointment");
  const first = table.get(firstKey);
  const second = table.get(secondKey);
  table.delete(firstKey);
  table.delete(secondKey);
  if (second !== undefined) table.set(secondKey, second);
  if (first !== undefined) table.set(firstKey, first);
}

// ─────────────────────────────────────────────────────────────────────────────
// A. 形状校验统一（get* 五处 + listDepartments + listTeams 扩键）
// ─────────────────────────────────────────────────────────────────────────────

describe("A. 形状校验：非法 id 一律 SOLOIPS_CORE_VALIDATION（get* 与列表同口径）", () => {
  it("getCompany / getEmployee / getAppointment / getDocumentVersion / getOperation 非法形状即拒绝", () => {
    // 依据 src/ids.ts 的「边界校验」段：调用方传来的 id 不受类型系统保护。
    const bad = "not-a-branded-id";
    expect(() => service.getCompany(bad as SoloipsCompanyId)).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
    expect(() => service.getEmployee(bad as SoloipsEmployeeId)).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
    expect(() => service.getAppointment(bad as SoloipsAppointmentId)).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
    expect(() =>
      service.getDocumentVersion(bad as Parameters<typeof service.getDocumentVersion>[0]),
    ).toThrow(expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error);
    // 〔operationId 的形状口径与品牌 id 不同〕它由调用方提供、接受任意非空白
    // 字符串（DEV-08 的稳定操作键，前缀由调用方约定，见 `asOperationId` 注释），
    // 故「非法形状」= 空白或超长，而不是「不符合某前缀」。
    expect(() => service.getOperation("" as Parameters<typeof service.getOperation>[0])).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
    expect(() => service.getOperation("   " as Parameters<typeof service.getOperation>[0])).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
    expect(() =>
      service.getOperation("x".repeat(257) as Parameters<typeof service.getOperation>[0]),
    ).toThrow(expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error);
    // 对照：合法形状但不存在 → undefined（get* 惯例）。
    expect(
      service.getOperation("roundtrip-missing-op" as Parameters<typeof service.getOperation>[0]),
    ).toBeUndefined();
  });

  it("getDepartment：形状合法但不存在 → undefined（get* 惯例，不抛 PRECONDITION）", () => {
    expect(service.getDepartment("dep_missing" as SoloipsDepartmentId)).toBeUndefined();
    expect(() => service.getDepartment("bad" as SoloipsDepartmentId)).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
  });

  it("getDepartment 形状正确时返回记录（读面与写路径辅助不混用）", async () => {
    const base = await seedBase();
    expect(service.getDepartment(base.departmentId)).toMatchObject({
      id: base.departmentId,
      companyId: base.companyId,
      name: "创作部",
    });
  });

  it("listDepartments 非法 companyId 即拒绝（对比样板：listSubsidiaries / getCompanyTree）", () => {
    expect(() => service.listDepartments("bad" as SoloipsCompanyId)).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
  });

  it("listEmployees / listAppointments / listDocumentVersions / listAdministrators 非法形状即拒绝", () => {
    expect(() => service.listEmployees({ companyId: "bad" as SoloipsCompanyId })).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
    expect(() => service.listEmployees({ departmentId: "bad" as SoloipsDepartmentId })).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
    expect(() => service.listAppointments({ companyId: "bad" as SoloipsCompanyId })).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
    expect(() => service.listAppointments({ departmentId: "bad" as SoloipsDepartmentId })).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
    expect(() => service.listAppointments({ employeeId: "bad" as SoloipsEmployeeId })).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
    expect(() => service.listDocumentVersions("bad" as SoloipsEmployeeId)).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
    expect(() => service.listAdministrators("bad" as SoloipsCompanyId)).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
  });

  it("listEmployees 过滤键必须恰好一个（两者都给 / 都不给都被拒）", async () => {
    const base = await seedBase();
    // JS 调用方可以绕过类型层，故运行期也必须拒绝——否则「按公司」与「按部门」
    // 的语义会静默混在一处（结果集取决于实现顺序，而不是契约）。
    // 受控单次断言：故意构造类型层不允许的形状来测运行期防线。
    const both = {
      companyId: base.companyId,
      departmentId: base.departmentId,
    } as unknown as Parameters<typeof service.listEmployees>[0];
    expect(() => service.listEmployees(both)).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
    const neither = {} as Parameters<typeof service.listEmployees>[0];
    expect(() => service.listEmployees(neither)).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. listEmployees 两跳关联 + 去重口径
// ─────────────────────────────────────────────────────────────────────────────

describe("B. listEmployees：员工↔公司/部门只经 appointment（不虚构 employee.companyId）", () => {
  it("按公司列员工：任意 kind 的任职都算「在该公司」（公司级/部门级/团队级）", async () => {
    const base = await seedBase();
    const departmentEmployee = await seedEmployee("部门员工");
    await seedAppointment(departmentEmployee, {
      kind: "department",
      companyId: base.companyId,
      departmentId: base.departmentId,
    });
    const companyEmployee = await seedEmployee("公司员工");
    await seedAppointment(
      companyEmployee,
      { kind: "company", companyId: base.companyId },
      "general_assistant",
    );
    const { teamId, leadEmployeeId } = await seedUsableTeam(
      base.companyId,
      base.departmentId,
      "小组",
    );
    const teamEmployee = await seedEmployee("团队员工");
    await seedAppointment(
      teamEmployee,
      { kind: "team", companyId: base.companyId, teamId },
      "member",
    );

    const affiliations = service.listEmployees({ companyId: base.companyId });
    expect(affiliations.map((item) => item.employeeId).sort()).toEqual(
      [departmentEmployee, companyEmployee, teamEmployee, leadEmployeeId].sort(),
    );
    // 归属是**解析后**的公司，不是从员工记录上读的（员工记录没有该字段）。
    for (const affiliation of affiliations) {
      expect(affiliation.companyId).toBe(base.companyId);
      expect("companyId" in affiliation.employee).toBe(false);
    }
    // 未任职的员工**不**入选（关联只经 appointment）。
    expect(affiliations.map((item) => item.employeeId)).not.toContain(base.employeeId);
  });

  it("按部门列员工：只认部门级任职（公司级/团队级不挂部门，不得入选）", async () => {
    const base = await seedBase();
    const departmentEmployee = await seedEmployee("部门员工");
    await seedAppointment(departmentEmployee, {
      kind: "department",
      companyId: base.companyId,
      departmentId: base.departmentId,
    });
    const { teamId, leadEmployeeId } = await seedUsableTeam(
      base.companyId,
      base.departmentId,
      "同部门小组",
    );
    const teamEmployee = await seedEmployee("团队员工");
    await seedAppointment(
      teamEmployee,
      { kind: "team", companyId: base.companyId, teamId },
      "member",
    );

    const inDepartment = service.listEmployees({ departmentId: base.departmentId });
    expect(inDepartment.map((item) => item.employeeId)).toEqual([departmentEmployee]);
    expect(inDepartment.map((item) => item.employeeId)).not.toContain(teamEmployee);
    // 阴性对照：组长也是团队级任职 → 同样不属于该部门。
    expect(inDepartment.map((item) => item.employeeId)).not.toContain(leadEmployeeId);
  });

  it("去重口径：同一员工两条同公司任职只出现一次，命中的任职 id 全部收在 appointmentIds", async () => {
    const base = await seedBase();
    const { teamId } = await seedUsableTeam(base.companyId, base.departmentId, "小组");
    const employee = await seedEmployee("双任职员工");
    const departmentAppointment = await seedAppointment(employee, {
      kind: "department",
      companyId: base.companyId,
      departmentId: base.departmentId,
    });
    const teamAppointment = await seedAppointment(
      employee,
      { kind: "team", companyId: base.companyId, teamId },
      "member",
    );

    const byCompany = service.listEmployees({ companyId: base.companyId });
    const target = byCompany.filter((item) => item.employeeId === employee);
    expect(target).toHaveLength(1);
    expect(target[0]?.appointmentIds).toEqual([departmentAppointment, teamAppointment]);

    // 对照：按部门查询只命中部门级任职——**不是**去重键变了，而是命中集合不同。
    const byDepartment = service.listEmployees({ departmentId: base.departmentId });
    expect(byDepartment.find((item) => item.employeeId === employee)?.appointmentIds).toEqual([
      departmentAppointment,
    ]);
  });

  it("同公司两个部门的过滤隔离：各自只返回本部门任职的员工（不串部门）", async () => {
    // QA 探针 `be4a-gap-probe.spec.ts` 的形状：原 36 用例只测了「跨公司不串」，
    // 没测「同公司内跨部门不串」——后者才是部门视图的日常用法（组织树逐部门展开）。
    const base = await seedBase();
    const other = await service.createDepartment({
      operationId: nextSeedOperationId("department"),
      companyId: base.companyId,
      name: "另一个部门",
    });
    if (other.status !== "committed") throw new Error("建部门失败");
    const otherDepartmentId = other.result.departmentId;
    const firstEmployee = await seedEmployee("一部员工");
    await seedAppointment(firstEmployee, {
      kind: "department",
      companyId: base.companyId,
      departmentId: base.departmentId,
    });
    const secondEmployee = await seedEmployee("二部员工");
    await seedAppointment(secondEmployee, {
      kind: "department",
      companyId: base.companyId,
      departmentId: otherDepartmentId,
    });

    expect(
      service.listEmployees({ departmentId: base.departmentId }).map((i) => i.employeeId),
    ).toEqual([firstEmployee]);
    expect(
      service.listEmployees({ departmentId: otherDepartmentId }).map((i) => i.employeeId),
    ).toEqual([secondEmployee]);
    // 同一份任职表在部门视角下是两个互不重叠的集合（并集 = 按公司视角）。
    expect(service.listEmployees({ companyId: base.companyId })).toHaveLength(2);
  });

  it("撤销的任职不构成当前归属（撤职后员工从公司/部门名单消失）", async () => {
    const base = await seedBase();
    const employee = await seedEmployee("将撤职员工");
    const appointmentId = await seedAppointment(employee, {
      kind: "department",
      companyId: base.companyId,
      departmentId: base.departmentId,
    });
    expect(service.listEmployees({ departmentId: base.departmentId })).toHaveLength(1);

    const revoked = await service.revokeAppointment({
      operationId: nextSeedOperationId("revoke"),
      appointmentId,
    });
    expect(revoked.status).toBe("committed");
    expect(service.listEmployees({ departmentId: base.departmentId })).toEqual([]);
    // 任职本身仍在介质上（撤职不是删除）——历史视图可见。
    expect(service.listAppointments({ includeRevoked: true }).map((view) => view.id)).toContain(
      appointmentId,
    );
  });

  it("按公司隔离：其他公司的任职不入选（同一员工跨公司任职时公司过滤仍准确）", async () => {
    const first = await seedBase();
    const second = await seedBase();
    const employee = await seedEmployee("跨公司员工");
    await seedAppointment(employee, {
      kind: "department",
      companyId: first.companyId,
      departmentId: first.departmentId,
    });
    await seedAppointment(employee, {
      kind: "department",
      companyId: second.companyId,
      departmentId: second.departmentId,
    });

    const firstList = service.listEmployees({ companyId: first.companyId });
    expect(firstList.map((item) => item.employeeId)).toEqual([employee]);
    expect(firstList[0]?.companyId).toBe(first.companyId);
    const secondList = service.listEmployees({ companyId: second.companyId });
    expect(secondList.map((item) => item.employeeId)).toEqual([employee]);
    expect(secondList[0]?.companyId).toBe(second.companyId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. §2.3 三分支在读面上的行为（含分支 3 的 fail-closed）
// ─────────────────────────────────────────────────────────────────────────────

describe("C. §2.3 三分支：读面按解析后的作用域过滤（不猜、不跳过）", () => {
  it("分支 2：存量任职（无 scope、只有 departmentId）按部门级解析后入选，且不写回介质", async () => {
    const base = await seedBase();
    const employee = await seedEmployee("存量员工");
    const legacyId = injectLegacyAppointment("apt_read_legacy_dept", employee, {
      departmentId: base.departmentId,
    });

    const byDepartment = service.listEmployees({ departmentId: base.departmentId });
    expect(byDepartment.map((item) => item.employeeId)).toEqual([employee]);
    expect(byDepartment[0]?.appointmentIds).toEqual([legacyId]);
    expect(service.listAppointments({ departmentId: base.departmentId })[0]?.scope).toEqual({
      kind: "department",
      companyId: base.companyId,
      departmentId: base.departmentId,
    });
    // 读面不写回：介质上的记录逐字未变（§2.3「不写回、不猜测」）。
    const stored = fakeMediumTable(ROOT, "appointment").get(legacyId) as Record<string, unknown>;
    expect("scope" in stored).toBe(false);
    expect(stored["departmentId"]).toBe(base.departmentId);
  });

  it("分支 3（无 scope 无 departmentId）：按公司/部门/员工查询一律 RECORD_INVALID，不静默漏掉", async () => {
    const base = await seedBase();
    const employee = await seedEmployee("不可判定员工");
    const ambiguousId = injectLegacyAppointment("apt_read_ambiguous", employee, {});

    // 〔关键〕该记录**可能**属于本次查询的公司/部门——跳过会让结果静默漏掉该
    // 员工（fail-closed，与总助理唯一性判定同向）。故三个入口都抛错，且错误
    // 消息带上本次查询与**具体记录 id**，便于定位是哪次调用因哪条记录失败。
    expect(() => service.listEmployees({ companyId: base.companyId })).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_RECORD_INVALID" }) as Error,
    );
    expect(() => service.listEmployees({ departmentId: base.departmentId })).toThrow(/按部门/);
    expect(() => service.listAppointments({})).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_RECORD_INVALID" }) as Error,
    );
    expect(() => service.listAppointments({ companyId: base.companyId })).toThrow(ambiguousId);
    // 〔边界〕**按该员工**查询同样抛错：本方法不做「解析不出来就当它不匹配」的
    // 静默处理——那会让调用方以为该员工没有任职。
    expect(() => service.listAppointments({ employeeId: employee })).toThrow(ambiguousId);
    // 〔阴性对照〕与不可判定记录**无关**的查询不受影响：按另一名员工的过滤先经
    // 直接字段命中，不含该记录，故正常返回。
    const other = await seedEmployee("正常员工");
    const otherAppointment = await seedAppointment(other, {
      kind: "company",
      companyId: base.companyId,
    });
    expect(service.listAppointments({ employeeId: other }).map((view) => view.id)).toEqual([
      otherAppointment,
    ]);
  });

  it("分支 3（departmentId 指向不存在的部门）：同样 RECORD_INVALID（解析不出公司即报错）", async () => {
    const base = await seedBase();
    const employee = await seedEmployee("悬挂部门员工");
    injectLegacyAppointment("apt_read_dangling_dept", employee, {
      departmentId: "dep_read_missing" as SoloipsDepartmentId,
    });
    expect(() => service.listEmployees({ companyId: base.companyId })).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_RECORD_INVALID" }) as Error,
    );
  });

  it("D1 回归：部门过滤下 scope.companyId 与部门所属公司不一致 → RECORD_INVALID（不按顺序取值）", async () => {
    // 〔本条钉住的缺陷〕原实现只比较 `scope.departmentId`，于是「声明公司 ≠ 部门实际
    // 所属公司」的记录会进入结果集，而 `#affiliationsOf` 取首条 `scope.companyId`
    // ——该值正是记录自报的，**同一员工两条命中声明不同公司时结果取决于介质遍历
    // 顺序**（违反 §2.3「禁止任何时序/『首个』推断」，也让
    // `SoloipsEmployeeAffiliation.companyId` 的「恒为解析后的公司」声明不成立）。
    // 修法：部门过滤反解部门记录并核对 `scope.companyId`，不一致即 fail-closed。
    const base = await seedBase();
    const employee = await seedEmployee("跨声明员工");
    const mismatchId = injectLegacyAppointment("apt_read_d1_mismatch", employee, {
      // 声明公司用**另一家公司**（写面 createAppointment 会拒该形状：
      // scope.departmentId 属于公司 A 而 scope.companyId 给 B）。
      scope: {
        kind: "department",
        companyId: (await seedBase()).companyId,
        departmentId: base.departmentId,
      },
    });

    // 按公司查（该公司视角）：该记录的 scope.companyId 指向别家公司 → 不命中，不报错。
    expect(service.listEmployees({ companyId: base.companyId })).toEqual([]);
    // 按部门查：声明公司与该部门实际所属公司不符 → 报错（不静默取舍任一侧）。
    expect(() => service.listEmployees({ departmentId: base.departmentId })).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_RECORD_INVALID" }) as Error,
    );
    expect(() => service.listEmployees({ departmentId: base.departmentId })).toThrow(mismatchId);
    // 报错路径零业务写（读面纪律对失败路径同样成立）：介质上的记录逐字未变。
    const stored = fakeMediumTable(ROOT, "appointment").get(mismatchId) as Record<string, unknown>;
    expect(stored["scope"]).toMatchObject({ kind: "department" });
  });

  it("D1 回归：同一员工两条命中声明不同公司时，部门查询**报错**而不是按遍历顺序取一家", async () => {
    // 〔顺序无关性〕把 D1 的形状放大到「同一员工两条命中」：若实现按首条取值，
    // 交换介质插入顺序就会返回不同公司。修复后两条都因公司核对失败而报错，
    // 结果与顺序无关——这正是「不引入时序推断」的可观察判据。
    const base = await seedBase();
    const foreign = await seedBase();
    const employee = await seedEmployee("双声明员工");
    injectLegacyAppointment("apt_read_d1_first", employee, {
      scope: {
        kind: "department",
        companyId: foreign.companyId,
        departmentId: base.departmentId,
      },
    });
    injectLegacyAppointment("apt_read_d1_second", employee, {
      scope: {
        kind: "department",
        companyId: base.companyId,
        departmentId: base.departmentId,
      },
    });
    const probe = (): string => {
      try {
        service.listEmployees({ departmentId: base.departmentId });
        return "no-error";
      } catch (error) {
        return error instanceof Error ? ((error as { code?: string }).code ?? "error") : "error";
      }
    };
    const before = probe();
    // 交换插入顺序（重建两条记录，第二次写入的排在后面）。
    const first = fakeMediumTable(ROOT, "appointment").get("apt_read_d1_first");
    const second = fakeMediumTable(ROOT, "appointment").get("apt_read_d1_second");
    fakeMediumTable(ROOT, "appointment").delete("apt_read_d1_first");
    fakeMediumTable(ROOT, "appointment").delete("apt_read_d1_second");
    if (second !== undefined)
      fakeMediumTable(ROOT, "appointment").set("apt_read_d1_second", second);
    if (first !== undefined) fakeMediumTable(ROOT, "appointment").set("apt_read_d1_first", first);
    const after = probe();
    expect(before).toBe("SOLOIPS_CORE_RECORD_INVALID");
    expect(after).toBe(before);
  });

  it("D1 回归（另半个半边）：部门记录**缺失** + 显式 scope → 报错且与遍历顺序无关", async () => {
    // 〔本条补的是 D1 修复的另半边〕spec:560/591 只覆盖了「部门存在但声明公司不符」；
    // 未覆盖「部门记录**缺失**」。后者在原实现下**重新变得顺序相关**：只比
    // `scope.departmentId` 时，两条声明不同公司的记录都会命中，取首条即按顺序
    // 返回不同公司——正是 D1 要消灭的形状。修复后：部门记录缺失 → fail-closed 报错。
    const first = await seedBase();
    const second = await seedBase();
    const employee = await seedEmployee("缺失部门员工");
    const missingDepartmentId = "dep_read_m10_missing" as SoloipsDepartmentId;
    injectLegacyAppointment("apt_read_m10_a", employee, {
      scope: {
        kind: "department",
        companyId: first.companyId,
        departmentId: missingDepartmentId,
      },
    });
    injectLegacyAppointment("apt_read_m10_b", employee, {
      scope: {
        kind: "department",
        companyId: second.companyId,
        departmentId: missingDepartmentId,
      },
    });

    const before = observeRead(() => service.listEmployees({ departmentId: missingDepartmentId }));
    expect(before.threw).toBe(true);
    expect(before.code).toBe("SOLOIPS_CORE_RECORD_INVALID");
    // 〔顺序无关性〕交换插入顺序后观测结果必须相同——若实现按首条取值，
    // 这里会返回某一家公司而不是报错（QA M10b 探针实测的失败形状）。
    flipMediumOrder("apt_read_m10_a", "apt_read_m10_b");
    const after = observeRead(() => service.listEmployees({ departmentId: missingDepartmentId }));
    expect(after).toEqual(before);
    // 阴性对照：按公司查各自只看到自己的那条（不报错——公司过滤不需要部门记录）。
    expect(service.listEmployees({ companyId: first.companyId }).map((i) => i.employeeId)).toEqual([
      employee,
    ]);
    expect(service.listEmployees({ companyId: second.companyId }).map((i) => i.employeeId)).toEqual(
      [employee],
    );
  });

  it("F-06(i)：查询**损坏的部门本身**且无任职命中 → 介质故障如实冒泡（不折成空数组）〔fake 介质专属，见注释〕", async () => {
    // 〔外审 F-06：标题与场景错位（本用例的前身）〕前身标题是「部门记录损坏 +
    // 无命中该部门的任职 → 不抛错」，但它损坏的是部门 A、查询的是**另一个不存在的
    // 部门** B——标题字面描述的情形（查询损坏的 A 本身）并未被覆盖。本用例专钉该
    // 情形；「无关损坏不污染 B 的查询」由紧随其后的 F-06(ii) 钉住。
    //
    // ── 〔介质形态边界：本用例**只在 fake 介质**成立（独立 QA D-2 复现）〕────────
    //
    // 本用例观测到的 `invalid-record` 来自 `tests/adapter-fakes.ts` 的**读时 schema
    // 校验**（`validated()`，:226）：fake 表每次 `get`/`entries` 都对介质值重跑
    // `valueSchema.safeParse`，故「运行期把记录改坏」会立刻在**下一次读**上失败。
    //
    // **真实后端（json / sqlite）不可构造该场景**，两条独立原因（独立 QA 最小复现，
    // 本写手已用 `probe-d2-real-medium.mjs` 在两后端上逐条复核，见下方第 2 条后的
    // 覆盖说明）：
    //  1. **内存缓存**：`@deepseek-ai/dsh-storage-domain` 的 domain 实现在 open 时
    //     把 `unit.loadAll()` 的快照校验后放进内存 `tables`（`DomainImpl.records`
    //     → `KvTableImpl`），此后读走内存、不回查磁盘。因此「运行期直接改盘把 A
    //     改坏 → 同句柄查 A」在真实后端上**返回 0 条、不抛错**（缓存里 A 仍合法，
    //     且无任职命中 A）——与本用例断言不同。
    //  2. **open 期校验**：同一 `open()` 对每条存量记录跑 `valueSchema.parse`，失败
    //     即整次 open 拒绝（core 的 spec 未声明 `invalidRecords`，故按默认的
    //     「拒绝」处置）。因此「打开前 A 已坏」表现为 **open 抛
    //     `SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE`**（`mapDomainOpenError` 包装宿主
    //     错误），**不是**读时的 `invalid-record`。
    //
    // 故本用例钉的是**读面契约**——「介质故障不得被折成空数组或数据结论」（下引
    // 契约依据），在 fake 介质上以最直接的方式构造并钉住它；它**不是**真实后端的
    // 复现路径，也**不得**被读成「真实后端查损坏记录会抛 invalid-record」。
    //
    // 〔真实后端的对应保证由谁覆盖：**本仓当前没有**单元测试覆盖〕上面第 2 条
    // （open 期整根拒绝）在真实后端上确实成立——已由独立探针在本机 json 与 sqlite
    // 两个后端上实测（`probe-d2-real-medium.mjs`，两后端均观测到
    // `SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE`）。但**本仓测试套件中没有任何用例断言
    // 该行为**（全仓检索 `SERVICE_UNAVAILABLE` 的用例都针对「宿主服务缺失」，与
    // 「存量记录损坏」无关）。故此处**不**声称「已有独立覆盖」——那是一条未覆盖的
    // 缺口，登记在案，不在本切片补（补它需要真实后端 fixture，超出本片写面）。
    //
    // 〔实际行为：抛介质层错误 `invalid-record`，与有无命中无关〕
    // `#scanAppointments`（src/store.ts:1036-1041）在**进入扫描之前**反解请求的
    // 部门记录（D1 公司核对的基准）。该读经 schema 校验，损坏记录在此即失败，
    // 故「无任职命中该部门」不能豁免这次读——失败发生在扫描之前，与命中无关。
    //
    // 〔契约依据〕data-contract §2.4.1（docs/design/data-contract.md:995）：
    // 「查询失败不在此形状内：失败以**抛出的错误**呈现（…介质错误），**不编码为
    // 分支**——把失败编码成返回值会让调用方把『读不到』误读成『没有』」。空数组的
    // 语义是「查询成功且无命中」，故损坏记录**不得**被折成空数组。
    // 〔与「部门记录缺失」的区别（见下一条用例）〕缺失是**数据条件**（该部门不存在
    // → 空结果）；损坏是**介质故障**（记录读不出来）。两者以不同 code 可判别。
    //
    // 〔若需要改这一口径〕把「损坏且无命中」改成返回空数组属**产品行为变更**，
    // 不是测试对齐——本用例只记录当前行为与其契约依据，不为此改实现。
    const base = await seedBase();
    const other = await seedDepartment(base.companyId, "另一部门");
    const employee = await seedEmployee("无关任职员工");
    // 唯一一条任职挂在**另一个**部门上：对 A 的查询没有任何命中。
    await seedAppointment(employee, {
      kind: "department",
      companyId: base.companyId,
      departmentId: other,
    });
    // 〔目标路径见证 ①〕损坏之前查 A → 空数组：既证明「无任职命中 A」是介质事实
    // （不是 fixture 碰巧），也证明该查询路径可达且会正常返回空结果。
    expect(service.listEmployees({ departmentId: base.departmentId })).toEqual([]);
    // 〔目标路径见证 ②〕同形状查询对**缺失**部门（无记录可读）→ 同样空数组；
    // 于是本用例前后唯一的变量就是「A 的记录损坏」。
    expect(
      service.listEmployees({ departmentId: "dep_read_f06_absent" as SoloipsDepartmentId }),
    ).toEqual([]);
    corruptDepartmentCompanyId(base.departmentId);
    // 〔目标路径见证 ③〕介质上该记录确实已损坏（而非损坏操作未生效）。
    const stored = fakeMediumTable(ROOT, "department").get(base.departmentId) as Record<
      string,
      unknown
    >;
    expect(stored["companyId"]).toBe(42);
    // 〔目标路径见证 ④〕无关部门的那条任职仍可正常读出 → 唯一被破坏的是 A 的记录，
    // 观测到的失败不可能是别的 fixture 问题。
    expect(service.listEmployees({ departmentId: other }).map((i) => i.employeeId)).toEqual([
      employee,
    ]);
    // 观测：查损坏的 A 本身（无命中）→ 介质故障冒泡。
    const observed = observeRead(() => service.listEmployees({ departmentId: base.departmentId }));
    expect(observed.threw).toBe(true);
    // `invalid-record` 是介质层的失败码（读路径由 fake adapter 的 `validated()` 抛出，
    // tests/adapter-fakes.ts:226）；承重性质是「介质故障如实冒泡、不被折成数据结论
    // 或空结果」，不是这个字符串本身。
    expect(observed.code).toBe("invalid-record");
    expect(observed.code).not.toBe("SOLOIPS_CORE_RECORD_INVALID");
  });

  it("F-06(ii)：介质上有损坏的部门 A，查询**无关**部门 B → 不因无关损坏失败（B 的过滤照常执行）", async () => {
    // 〔承接前身用例的真正覆盖〕前身（标题写「无命中该部门」）实际测的就是本情形：
    // 介质上有损坏的 A，查询的是另一个部门。此处把标题写准，并把「目标分支确实
    // 执行」变成可观察的——先证明 B 的查询能返回命中，再只改「A 损坏」这一个变量，
    // 要求同一查询返回同一结果。
    //
    // 〔失败形态〕若实现把「介质上有坏记录」无条件升级为整次查询失败（例如对扫描
    // 到的每条记录都反解其 `scope` 部门并校验），本用例会观测到 `invalid-record`
    // 而非 B 的命中——那正是本条要拦下的形状（读面不得让无关介质损坏污染本次查询）。
    const base = await seedBase(); // A：将被损坏
    const healthy = await seedDepartment(base.companyId, "部门 B");
    const inB = await seedEmployee("B 部门员工");
    await seedAppointment(inB, {
      kind: "department",
      companyId: base.companyId,
      departmentId: healthy,
    });
    // A 上有一条自洽任职：介质上确实存在「损坏的 A + 指向 A 的记录」，但它与
    // 「按 B 过滤」无关（`#scanAppointments` 先按 `scope.departmentId` 收窄，命中
    // 过滤键之后才做 D1 公司核对）。
    const inA = await seedEmployee("A 部门员工");
    await seedAppointment(inA, {
      kind: "department",
      companyId: base.companyId,
      departmentId: base.departmentId,
    });

    // 〔阳性对照（损坏之前）〕查 B 命中 B 的员工：证明部门过滤分支确实执行、且会
    // 返回命中——「恒返回空数组」的实现无法通过这条对照。
    expect(service.listEmployees({ departmentId: healthy }).map((i) => i.employeeId)).toEqual([
      inB,
    ]);

    corruptDepartmentCompanyId(base.departmentId);

    // 〔同一查询、只改「A 损坏」一个变量〕结果必须与损坏前逐字相同。
    expect(service.listEmployees({ departmentId: healthy }).map((i) => i.employeeId)).toEqual([
      inB,
    ]);
    // 显式钉住「不抛」（值相等已蕴含，但这一条在失败时给出 code 诊断）。
    expect(observeRead(() => service.listEmployees({ departmentId: healthy }))).toEqual({
      threw: false,
    });

    // 〔A 的损坏确实生效〕同一时刻查 A 本身 → 介质故障冒泡；否则上面的「不抛」
    // 可能只是因为损坏操作没生效。
    const damaged = observeRead(() => service.listEmployees({ departmentId: base.departmentId }));
    expect(damaged).toEqual({ threw: true, code: "invalid-record" });

    // 〔前身用例覆盖的退化情形：查询**不存在**的部门〕介质上有损坏的 A 时，对完全
    // 不存在（无记录可读）的部门查询仍返回空数组——「无关」包括「请求的部门根本
    // 没有记录」这一情形。
    expect(
      observeRead(() =>
        service.listEmployees({ departmentId: "dep_read_f06_unrelated" as SoloipsDepartmentId }),
      ),
    ).toEqual({ threw: false });
  });

  it("部门记录缺失 + 无命中该部门的任职 → 空数组（「部门不存在」的空结果语义不变）", async () => {
    // 〔为什么要钉〕D1 核对在「部门记录缺失」时会报错——但那必须**只在真有命中
    // 该部门的记录时**发生。若实现改成「进入扫描前无条件反解并报错」，则
    // `listEmployees({departmentId: 不存在的部门})` 会从「空数组」变成抛错，
    // 破坏既有列表语义（对比 spec 中「listTeams 按不存在部门过滤 → []」的同款口径）。
    const base = await seedBase();
    const missingDepartmentId = "dep_read_absent_empty" as SoloipsDepartmentId;
    expect(service.listEmployees({ departmentId: missingDepartmentId })).toEqual([]);
    // 对照：确实有任职命中该（缺失的）部门时 → 报错。
    const employee = await seedEmployee("命中缺失部门员工");
    injectLegacyAppointment("apt_read_missing_dept_hit", employee, {
      scope: {
        kind: "department",
        companyId: base.companyId,
        departmentId: missingDepartmentId,
      },
    });
    expect(() => service.listEmployees({ departmentId: missingDepartmentId })).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_RECORD_INVALID" }) as Error,
    );
  });

  it("撤销的不可判定任职不阻塞查询（status 过滤先于解析：撤职不占名额）", async () => {
    const base = await seedBase();
    const employee = await seedEmployee("已撤职存量员工");
    injectLegacyAppointment("apt_read_ambiguous_revoked", employee, { status: "revoked" });
    // 与 #assertNoActiveGeneralAssistant 同向：撤销的记录确定不占名额，
    // 故不参与归属判定，也不使查询失败。
    expect(service.listEmployees({ companyId: base.companyId })).toEqual([]);
    expect(service.listAppointments({})).toEqual([]);
  });

  it("悬挂任职（指向已不存在的员工）：RECORD_INVALID 而非静默消失", async () => {
    const base = await seedBase();
    const missingEmployee = "emp_read_missing" as SoloipsEmployeeId;
    fakeMediumTable(ROOT, "appointment").set("apt_read_dangling_employee", {
      id: "apt_read_dangling_employee",
      employeeId: missingEmployee,
      scope: { kind: "company", companyId: base.companyId },
      requiredCapabilities: [],
      generation: 1,
      status: "active",
    });
    expect(() => service.listEmployees({ companyId: base.companyId })).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_RECORD_INVALID" }) as Error,
    );
  });

  it("吞异常边界（真经包装的路径）：公司过滤 + 存量任职 + 部门损坏 → 介质错如实冒泡", async () => {
    // 〔本条替换掉一条**假覆盖**用例〕旧用例走的是**部门过滤**，而部门过滤在
    // `#scanAppointments` 进入扫描**之前**就反解了部门记录（D1 引入的前置反解），
    // 于是异常在包装之外抛出——旧断言观测到的 code 来自前置反解，**根本没进入**
    // `#tryResolveAppointmentScope`，标题声称的「包装吞异常边界」并未被测到。
    //
    // 〔本条构造真正经过包装的路径〕**公司过滤**下不需要前置反解部门；存量任职
    // （无 `scope`、有 `departmentId`）在**扫描内**按 §2.3 分支 2 反解部门
    // `companyId`，故部门记录损坏时，介质异常从包装**内部**抛出：
    //  - 正确实现：包装只吞 `SOLOIPS_CORE_RECORD_INVALID` → 介质错（`invalid-record`）冒泡；
    //  - catch 过宽的实现：介质错被折成 `{ok:false}` → 观测到 `RECORD_INVALID`
    //    （把「读不到」伪装成「数据不可判定」，调用方会去修数据而不是修介质）。
    const base = await seedBase();
    const employee = await seedEmployee("包装边界员工");
    injectLegacyAppointment("apt_read_wrapper_boundary", employee, {
      departmentId: base.departmentId,
    });
    // 前提守卫：正常时应能按公司读回该员工（证明这条路径确实可达）。
    expect(service.listEmployees({ companyId: base.companyId })).toHaveLength(1);
    corruptDepartmentCompanyId(base.departmentId);

    const observed = observeRead(() => service.listEmployees({ companyId: base.companyId }));
    expect(observed.threw).toBe(true);
    // 〔关键断言〕介质故障不得被折成数据结论。
    expect(observed.code).not.toBe("SOLOIPS_CORE_RECORD_INVALID");
    expect(observed.code).toBe("invalid-record");
  });

  it("介质故障 vs 分支 3 的优先级：前置反解先于扫描（部门损坏先于不可判定记录暴露）", async () => {
    // 〔为什么要钉〕两类失败的正确处置**方向不同**（介质故障 → 修介质；分支 3 →
    // 修数据），调用方按 code 分流。若实现把反解改成惰性（扫描到才读），则
    // 「部门损坏 + 分支 3 记录先入」会抛 `RECORD_INVALID`（先撞上分支 3），
    // 错误身份随记录顺序变化。原实现在进入扫描前反解，故介质故障**稳定优先**。
    const base = await seedBase();
    const branchThreeEmployee = await seedEmployee("分支 3 员工");
    const departmentEmployee = await seedEmployee("命中部门员工");
    // 分支 3 记录（无 scope 无 departmentId）**先入**介质。
    injectLegacyAppointment("apt_read_m7_branch3", branchThreeEmployee, {});
    // 命中该部门的自洽记录后入。
    injectLegacyAppointment("apt_read_m7_department", departmentEmployee, {
      scope: {
        kind: "department",
        companyId: base.companyId,
        departmentId: base.departmentId,
      },
    });
    corruptDepartmentCompanyId(base.departmentId);

    const observed = observeRead(() => service.listEmployees({ departmentId: base.departmentId }));
    expect(observed.threw).toBe(true);
    // 介质故障优先于分支 3 暴露（两者 code 可区分，故本断言有鉴别力）。
    expect(observed.code).toBe("invalid-record");
    expect(observed.code).not.toBe("SOLOIPS_CORE_RECORD_INVALID");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. listAdministrators 显式状态（SA-01.1）
// ─────────────────────────────────────────────────────────────────────────────

describe("D. listAdministrators：四态显式（vacant / uncovered / present / inconsistent）", () => {
  it("vacant：公司存在但无有效总助理——显式状态 + 空数组，不是「字段缺省」", async () => {
    const base = await seedBase();
    const projection = service.listAdministrators(base.companyId);
    expect(projection.status).toBe("vacant");
    expect(administratorsOf(projection)).toEqual([]);
    // SA-01.1：不得用「空数组」让调用方无法区分「无总助理」与「查询未覆盖」——
    // 故 status 是判别键，且 vacant 分支**显式**携带空的 administrators 字段。
    expect("administrators" in projection).toBe(true);
    expect(projection.companyId).toBe(base.companyId);
  });

  it("uncovered：公司记录不存在——与 vacant 可区分（空数组不表达「未覆盖」）", async () => {
    const base = await seedBase();
    const projection = service.listAdministrators("cmp_read_absent" as SoloipsCompanyId);
    expect(projection.status).toBe("uncovered");
    expect(projection.status).not.toBe(service.listAdministrators(base.companyId).status);
    expect("administrators" in projection).toBe(false);
  });

  it("present：有效公司级 general_assistant 被读出（含任职与员工 id、解析后 scope）", async () => {
    const base = await seedBase();
    const employee = await seedEmployee("总助理");
    const appointmentId = await seedAppointment(
      employee,
      { kind: "company", companyId: base.companyId },
      "general_assistant",
    );
    const projection = service.listAdministrators(base.companyId);
    expect(projection.status).toBe("present");
    expect(administratorsOf(projection)).toEqual([
      {
        appointmentId,
        employeeId: employee,
        status: "active",
        scope: { kind: "company", companyId: base.companyId },
      },
    ]);
  });

  it("判据与唯一性判定同口径：部门级/团队级 general_assistant 任职**不算**总助理", async () => {
    const base = await seedBase();
    const { teamId } = await seedUsableTeam(base.companyId, base.departmentId, "小组");
    const departmentEmployee = await seedEmployee("部门助理");
    await seedAppointment(departmentEmployee, {
      kind: "department",
      companyId: base.companyId,
      departmentId: base.departmentId,
    });
    const teamEmployee = await seedEmployee("团队助理");
    await seedAppointment(teamEmployee, { kind: "team", companyId: base.companyId, teamId });
    // 两条都不是公司级 → 公司仍处于「待招募」。
    expect(service.listAdministrators(base.companyId).status).toBe("vacant");
  });

  it("撤销的总助理不占名额：撤职后回到 vacant（与写面「撤职后可重新招募」一致）", async () => {
    const base = await seedBase();
    const employee = await seedEmployee("前任总助理");
    const appointmentId = await seedAppointment(
      employee,
      { kind: "company", companyId: base.companyId },
      "general_assistant",
    );
    expect(service.listAdministrators(base.companyId).status).toBe("present");
    await service.revokeAppointment({
      operationId: nextSeedOperationId("revoke"),
      appointmentId,
    });
    expect(service.listAdministrators(base.companyId).status).toBe("vacant");
  });

  it("inconsistent：同一公司两条有效总助理（绕过写面直写介质）→ 如实暴露，不取首条掩盖", async () => {
    const base = await seedBase();
    const employee = await seedEmployee("总助理甲");
    await seedAppointment(
      employee,
      { kind: "company", companyId: base.companyId },
      "general_assistant",
    );
    // 绕过写面唯一性（模拟迁移/外部写入破坏 §2.4.2 的不变量）。
    injectLegacyAppointment("apt_read_second_ga", await seedEmployee("总助理乙"), {
      scope: { kind: "company", companyId: base.companyId },
      role: "general_assistant",
      generation: 1,
    });
    const projection = service.listAdministrators(base.companyId);
    expect(projection.status).toBe("inconsistent");
    expect(administratorsOf(projection)).toHaveLength(2);
  });

  it("公司隔离：别家公司的总助理不出现在本公司的投影里", async () => {
    const first = await seedBase();
    const second = await seedBase();
    await seedAppointment(
      await seedEmployee("第二家公司总助理"),
      { kind: "company", companyId: second.companyId },
      "general_assistant",
    );
    expect(service.listAdministrators(first.companyId).status).toBe("vacant");
    expect(service.listAdministrators(second.companyId).status).toBe("present");
  });

  it("成功空结果不得吞错误：不可判定的 general_assistant 记录使查询**抛错**而不是返回 vacant", async () => {
    const base = await seedBase();
    // 形状：role='general_assistant' 但无 scope、无 departmentId（§2.3 分支 3）。
    // 它**可能**是本公司的总助理，猜「不是」同样是猜——fail-closed 报错，
    // 与 #assertNoActiveGeneralAssistant 同向。
    injectLegacyAppointment("apt_read_ga_unresolvable", await seedEmployee("不可判定助理"), {
      role: "general_assistant",
    });
    expect(() => service.listAdministrators(base.companyId)).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_RECORD_INVALID" }) as Error,
    );
  });

  it("存量形状（无 scope、有 departmentId、role=general_assistant）：解析为部门级 → 公司仍 vacant", async () => {
    const base = await seedBase();
    // 这正是 #assertNoActiveGeneralAssistant 注释里登记的关键形状：若直接读
    // `record.scope`（undefined）或按 role 粗判，会把它误算作公司总助理。
    injectLegacyAppointment("apt_read_ga_legacy_dept", await seedEmployee("存量部门助理"), {
      departmentId: base.departmentId,
      role: "general_assistant",
    });
    expect(service.listAdministrators(base.companyId).status).toBe("vacant");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. listTeams 的 departmentId 过滤（BE-4a 扩键）
// ─────────────────────────────────────────────────────────────────────────────

describe("E. listTeams：departmentId 过滤（扩键，既有语义不变）", () => {
  it("按部门收窄：只返回该部门的可用团队；缺省（不给键）语义不变", async () => {
    const base = await seedBase();
    const other = await service.createDepartment({
      operationId: nextSeedOperationId("department"),
      companyId: base.companyId,
      name: "另一个部门",
    });
    if (other.status !== "committed") throw new Error("建部门失败");
    const firstTeam = (await seedUsableTeam(base.companyId, base.departmentId, "一部小组")).teamId;
    const secondTeam = (await seedUsableTeam(base.companyId, other.result.departmentId, "二部小组"))
      .teamId;
    const noDepartmentTeam = (await seedUsableTeam(base.companyId, undefined, "无部门小组")).teamId;

    expect(
      service
        .listTeams(base.companyId)
        .map((view) => view.id)
        .sort(),
    ).toEqual([firstTeam, secondTeam, noDepartmentTeam].sort());
    expect(
      service.listTeams(base.companyId, { departmentId: base.departmentId }).map((v) => v.id),
    ).toEqual([firstTeam]);
    // 两个过滤键为**与**关系，可用性判据不变（includeUnusable 仍生效）。
    const all = service.listTeams(base.companyId, {
      departmentId: base.departmentId,
      includeUnusable: true,
    });
    expect(all.map((view) => view.id)).toEqual([firstTeam]);
  });

  it("departmentId 过滤不跨公司：别家公司的同 id 部门不产生结果（空结果是合法结论）", async () => {
    const first = await seedBase();
    const second = await seedBase();
    await seedUsableTeam(second.companyId, second.departmentId, "二公司小组");
    expect(service.listTeams(first.companyId, { departmentId: second.departmentId })).toEqual([]);
    expect(
      service.listTeams(first.companyId, {
        departmentId: "dep_read_absent" as SoloipsDepartmentId,
      }),
    ).toEqual([]);
  });

  it("departmentId 形状非法即拒绝（扩键同样受形状校验）", () => {
    expect(() =>
      service.listTeams("cmp_read_absent" as SoloipsCompanyId, {
        departmentId: "bad" as SoloipsDepartmentId,
      }),
    ).toThrow(expect.objectContaining({ code: "SOLOIPS_CORE_VALIDATION" }) as Error);
  });

  it("可用性判据不变：pending 团队带部门过滤仍默认被排除（P-3/P-9.1）", async () => {
    const base = await seedBase();
    const pending = await service.createTeam({
      operationId: nextSeedOperationId("team-create"),
      companyId: base.companyId,
      departmentId: base.departmentId,
      name: "成团中小组",
      function: "读投影测试职能",
    });
    if (pending.status !== "committed") throw new Error("建团队失败");
    expect(service.listTeams(base.companyId, { departmentId: base.departmentId })).toEqual([]);
    const all = service.listTeams(base.companyId, {
      departmentId: base.departmentId,
      includeUnusable: true,
    });
    expect(all.map((view) => view.id)).toEqual([pending.result.teamId]);
    expect(all[0]?.usable).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. listAppointments / listDocumentVersions 的语义
// ─────────────────────────────────────────────────────────────────────────────

describe("F. listAppointments 与 listDocumentVersions 的过滤与历史语义", () => {
  it("listAppointments：按员工过滤、includeRevoked 控制历史可见性", async () => {
    const base = await seedBase();
    const employee = await seedEmployee("多任职员工");
    const active = await seedAppointment(employee, {
      kind: "department",
      companyId: base.companyId,
      departmentId: base.departmentId,
    });
    const revoked = await seedAppointment(employee, {
      kind: "company",
      companyId: base.companyId,
    });
    await service.revokeAppointment({
      operationId: nextSeedOperationId("revoke"),
      appointmentId: revoked,
    });

    expect(service.listAppointments({ employeeId: employee }).map((view) => view.id)).toEqual([
      active,
    ]);
    expect(
      service.listAppointments({ employeeId: employee, includeRevoked: true }).map((v) => v.id),
    ).toEqual([active, revoked]);
  });

  it("listAppointments：按部门过滤只给部门级任职（团队级不算部门任职）", async () => {
    const base = await seedBase();
    const { teamId } = await seedUsableTeam(base.companyId, base.departmentId, "小组");
    const employee = await seedEmployee("团队员工");
    await seedAppointment(employee, { kind: "team", companyId: base.companyId, teamId }, "member");
    const departmentAppointment = await seedAppointment(employee, {
      kind: "department",
      companyId: base.companyId,
      departmentId: base.departmentId,
    });
    expect(service.listAppointments({ departmentId: base.departmentId }).map((v) => v.id)).toEqual([
      departmentAppointment,
    ]);
  });

  it("listAppointments 返回项带**解析后**的 scope（与 getAppointment 同口径）", async () => {
    const base = await seedBase();
    const employee = await seedEmployee("存量员工");
    const legacyId = injectLegacyAppointment("apt_read_scope_view", employee, {
      departmentId: base.departmentId,
    });
    const view = service.listAppointments({ employeeId: employee }).find((v) => v.id === legacyId);
    expect(view?.scope).toEqual({
      kind: "department",
      companyId: base.companyId,
      departmentId: base.departmentId,
    });
  });

  it("listDocumentVersions：某员工全部历史版本（含未被提升的版本），不跨员工", async () => {
    const base = await seedBase();
    const firstSave = await service.saveEmployeeDocument({
      operationId: nextSeedOperationId("doc-profile"),
      employeeId: base.employeeId,
      documentType: "profile",
      content: "第一版简介",
    });
    if (firstSave.status !== "committed") throw new Error("保存失败");
    // CAS 不符：版本仍持久保留为可恢复候选（02-company-contract §11.1）。
    const conflict = await service.saveEmployeeDocument({
      operationId: nextSeedOperationId("doc-profile-conflict"),
      employeeId: base.employeeId,
      documentType: "profile",
      content: "基于过期引用的第二版",
      expectedPreviousVersion: "docver_read_stale" as SoloipsDocumentVersionId,
    });
    if (conflict.status !== "committed") throw new Error("保存失败");
    expect(conflict.result.outcome).toBe("conflict");
    const work = await service.saveEmployeeDocument({
      operationId: nextSeedOperationId("doc-work"),
      employeeId: base.employeeId,
      documentType: "work",
      content: "作品草稿",
    });
    if (work.status !== "committed") throw new Error("保存失败");

    const versions = service.listDocumentVersions(base.employeeId);
    expect(versions.map((record) => record.versionId).sort()).toEqual(
      [firstSave.result.versionId, conflict.result.versionId, work.result.versionId].sort(),
    );
    // 当前引用只指向被提升的那一版（版本历史不等于当前引用）。
    expect(service.getEmployee(base.employeeId)?.currentDocuments.profile).toBe(
      firstSave.result.versionId,
    );
    // 其他员工没有版本。
    const other = await seedEmployee("无文档员工");
    expect(service.listDocumentVersions(other)).toEqual([]);
    // 不存在的员工：空数组（列表语义），不抛错。
    expect(service.listDocumentVersions("emp_read_absent" as SoloipsEmployeeId)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. 读面纪律：零业务写、零 operation、零恢复副作用（BE-4a 验收⑤）
// ─────────────────────────────────────────────────────────────────────────────

describe("G. 读面纪律：全部新读方法不产生业务写、operation 或恢复副作用", () => {
  it("介质快照对照：读方法跑一轮后介质逐字不变（含团队状态不被 reconcile）", async () => {
    const base = await seedBase();
    const { teamId, leadAppointmentId } = await seedUsableTeam(
      base.companyId,
      base.departmentId,
      "小组",
    );
    // 造一个「组长已撤职但团队仍 active」的悬挂态：**绕过 P-6 联动**直改介质
    // （经 revokeAppointment 会同时把团队置为 inactive，那是写路径的正常行为）。
    // 该形状正是读面纪律要覆盖的：读面不得顺手把它改成 inactive——
    // 落盘由显式 reconcileTeams 承担（P-8.1/P-8.3）。
    const storedLead = fakeMediumTable(ROOT, "appointment").get(leadAppointmentId) as Record<
      string,
      unknown
    >;
    fakeMediumTable(ROOT, "appointment").set(leadAppointmentId, {
      ...storedLead,
      status: "revoked",
    });
    expect(fakeMediumTable(ROOT, "team").get(teamId)).toMatchObject({ status: "active" });

    const before = snapshotMedium();
    const operationCount = fakeMediumTable(ROOT, "operation").size;

    service.getDepartment(base.departmentId);
    service.listDepartments(base.companyId);
    service.listEmployees({ companyId: base.companyId });
    service.listEmployees({ departmentId: base.departmentId });
    service.listAppointments({ companyId: base.companyId });
    service.listAppointments({ employeeId: base.employeeId, includeRevoked: true });
    service.listDocumentVersions(base.employeeId);
    service.listAdministrators(base.companyId);
    service.listTeams(base.companyId);
    service.listTeams(base.companyId, { includeUnusable: true, departmentId: base.departmentId });

    expect(snapshotMedium()).toEqual(before);
    expect(fakeMediumTable(ROOT, "operation").size).toBe(operationCount);
    // 团队状态未被读面改写（仍是 active；可用性判定是读时结论）。
    expect(service.getTeam(teamId)?.status).toBe("active");
    expect(service.getTeam(teamId)?.usable).toBe(false);
  });

  it("读面不因「不可判定记录」而留下任何写入（抛错路径同样零业务写）", async () => {
    const base = await seedBase();
    injectLegacyAppointment("apt_read_no_write_on_error", await seedEmployee("不可判定员工"), {});
    const before = snapshotMedium();
    expect(() => service.listEmployees({ companyId: base.companyId })).toThrow();
    expect(snapshotMedium()).toEqual(before);
  });

  it("关闭后全部新读方法拒绝（与既有读面同待遇）", async () => {
    const base = await seedBase();
    await service.close();
    const closed = expect.objectContaining({ code: "SOLOIPS_CORE_STORE_CLOSED" }) as Error;
    expect(() => service.getDepartment(base.departmentId)).toThrow(closed);
    expect(() => service.listEmployees({ companyId: base.companyId })).toThrow(closed);
    expect(() => service.listAppointments({})).toThrow(closed);
    expect(() => service.listDocumentVersions(base.employeeId)).toThrow(closed);
    expect(() => service.listAdministrators(base.companyId)).toThrow(closed);
  });
});
