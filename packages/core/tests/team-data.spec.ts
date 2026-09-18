/**
 * SOLOIPS-CORE-TEAM-DATA-SPEC（BE-3）
 *
 * Team 数据层与三步成团协议（Issue #20）的行为测试。依据：
 *  - `docs/design/data-contract.md` §2.1（`SoloipsTeamRecord` 目标形状 :243-293、
 *    `status` 语义四分与「字段形态留 BE-3 裁定」、禁物理删除）；
 *  - §2.1.1 **P-1…P-9**（三步成团协议、组长唯一性、撤职→不可用、悬挂处置、
 *    四条读面纪律 P-9.1…P-9.4）；
 *  - §2.1 BE-002（`SoloipsOperationRecord.schemaVersion`）；
 *  - §2.3（`scope` 严格三分支——team 分支的 `companyId` 归属核对）；
 *  - §2.5 边界 2（每个写工具必须对应已登记 kind；读面不产生 kind）；
 *  - `docs/prds/system-assistant-backend-design-v0.1.md` §4.1 BE-3 验收①…⑤。
 *
 * 覆盖（按验收清单）：
 *  A. kind 四项的端到端可用（`team.create`/`team.update-function`/`team.activate`/
 *     `team.close`）+ 三处同步的机械证明（kind 联合 ↔ domain 校验器 ↔ 命令实现）
 *     + 运行期清单与联合的**双向相等**（含「假项不得被当已知项」）；
 *  B. Team 记录形状与四值 `status`；
 *  C. P-8 悬挂处置（`reconcileTeams` 只标记不修复）、P-7 禁物理删除、P-9 读面纪律；
 *  D. `schemaVersion` 写入与读取（含 unknown kind 的最小兼容）；
 *  E. `scope.kind='team'` 的真校验（存在性 / 同公司，两种消息可区分）；
 *  F. P-5 第二组长拒绝 + P-6 撤职→团队 inactive 联动；
 *  G. 存量兼容：BE-2 时代形状的根（无 team 表）能被 BE-3 打开。
 *
 * 测试风格沿用 scope-role.spec.ts：经公开命令面搭建状态；只有「模拟存量/损坏
 * 介质」的用例才用 fakeMediumTable 直达介质。
 */

import { beforeEach, describe, expect, it } from "vitest";

import type {
  SoloipsAppointmentId,
  SoloipsCompanyId,
  SoloipsCoreService,
  SoloipsDepartmentId,
  SoloipsEmployeeId,
  SoloipsOperationKind,
  SoloipsOperationKindValue,
  SoloipsTeamId,
  SoloipsTeamRecord,
  SoloipsTeamView,
} from "../src/contracts";
import { SOLOIPS_COMPANY_DOMAIN_SPEC, SOLOIPS_PERSISTED_OPERATION_KINDS } from "../src/domain";
import { SOLOIPS_COMPANY_DOMAIN_VERSION, SOLOIPS_OPERATION_SCHEMA_VERSION } from "../src/contracts";
import { isKnownOperationKind, knownOperationKinds } from "../src/commit-gate";
import { asOperationId } from "../src/ids";
import { openSoloipsCompanyStore } from "../src/store";
import {
  fakeMediumTable,
  fakeStoragePort,
  fakeTakeoverLease,
  resetFakeAdapter,
} from "./adapter-fakes";
import { nextSeedOperationId, TEST_ACCOUNT_ID } from "./seed";

const ROOT = "/tmp/soloips-team-data-root";

let service: SoloipsCoreService;

beforeEach(async () => {
  resetFakeAdapter();
  service = await openSoloipsCompanyStore({
    storage: fakeStoragePort(),
    root: ROOT,
    accountId: TEST_ACCOUNT_ID,
    // 〔BE-5 追加，既有断言逐条不变〕本 spec 的「部门归属必须同公司」「跨公司引用
    // 即拒绝」「listTeams 按公司隔离」等用例需要**两家公司**，而缺省 `free` 计划
    // 只允许一家 `enterprise`。配额不是本 spec 的验证面，故显式取无限制计划；
    // 配额与树规则由 `quota-tree.spec.ts` 验证。
    planCode: "enterprise",
  });
});

interface TeamSeed {
  readonly companyId: SoloipsCompanyId;
  readonly departmentId: SoloipsDepartmentId;
  readonly employeeId: SoloipsEmployeeId;
}

/** 建公司 + 部门 + 员工的最小状态（无团队、无任职），供各用例裁剪。 */
async function seedBase(): Promise<TeamSeed> {
  const company = await service.createCompany({
    operationId: nextSeedOperationId("company"),
    name: "团队测试公司",
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

/** P-9 第①步：建一个 `pending` 团队（无组长）。 */
async function seedPendingTeam(base: TeamSeed, name = "分镜小组"): Promise<SoloipsTeamId> {
  const created = await service.createTeam({
    operationId: nextSeedOperationId("team-create"),
    companyId: base.companyId,
    departmentId: base.departmentId,
    name,
    function: "负责分镜绘制",
  });
  if (created.status !== "committed") throw new Error(`建团队失败：${created.status}`);
  return created.result.teamId;
}

/** P-9 第②步：建 `team_lead` 任职（团队级）。 */
async function seedTeamLeadAppointment(
  base: TeamSeed,
  teamId: SoloipsTeamId,
  employeeId?: SoloipsEmployeeId,
): Promise<SoloipsAppointmentId> {
  const created = await service.createAppointment({
    operationId: nextSeedOperationId("appointment"),
    employeeId: employeeId ?? base.employeeId,
    scope: { kind: "team", companyId: base.companyId, teamId },
    role: "team_lead",
  });
  if (created.status !== "committed") throw new Error(`建组长任职失败：${created.status}`);
  return created.result.appointmentId;
}

/** P-9 第③步：激活团队。 */
async function activateTeam(
  teamId: SoloipsTeamId,
  leadAppointmentId?: SoloipsAppointmentId,
): Promise<void> {
  const activated = await service.activateTeam({
    operationId: nextSeedOperationId("team-activate"),
    teamId,
    ...(leadAppointmentId === undefined ? {} : { leadAppointmentId }),
  });
  if (activated.status !== "committed") throw new Error(`激活团队失败：${activated.status}`);
}

/** 三步成团一次到位：返回可用团队与其组长任职。 */
async function seedUsableTeam(
  base: TeamSeed,
  name = "分镜小组",
): Promise<{ teamId: SoloipsTeamId; leadAppointmentId: SoloipsAppointmentId }> {
  const teamId = await seedPendingTeam(base, name);
  const leadAppointmentId = await seedTeamLeadAppointment(base, teamId);
  await activateTeam(teamId, leadAppointmentId);
  return { teamId, leadAppointmentId };
}

/** 介质上的 team 记录（直达介质；用于断言「记录里到底写了什么」）。 */
function storedTeam(teamId: SoloipsTeamId): SoloipsTeamRecord {
  const raw = fakeMediumTable(ROOT, "team").get(teamId);
  if (raw === undefined) throw new Error(`介质上没有团队 ${teamId}`);
  return raw as SoloipsTeamRecord;
}

/** 介质快照（业务表 + 台账）：用于断言「零业务写」。 */
function snapshotMedium(): Record<string, readonly unknown[]> {
  const snapshot: Record<string, readonly unknown[]> = {};
  for (const table of ["company", "department", "employee", "appointment", "operation", "team"]) {
    snapshot[table] = [...fakeMediumTable(ROOT, table).entries()].map(([key, value]) => ({
      key,
      value,
    }));
  }
  return snapshot;
}

/** 按 id 取团队视图，缺失即抛（避免 `?.` 让断言静默通过）。 */
function viewOf(teamId: SoloipsTeamId): SoloipsTeamView {
  const view = service.getTeam(teamId);
  if (view === undefined) throw new Error(`读不到团队 ${teamId}`);
  return view;
}

// ─────────────────────────────────────────────────────────────────────────────
// A. kind 四项 + 三处同步（+ 提交门运行期清单这第四处投影）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 联合的**穷举镜像**（测试侧，唯一用途是给出可运行期枚举的事实基准）。
 *
 * 〔为什么需要它〕`SoloipsOperationKind` 是纯类型，运行期不存在；而两处「运行期
 * 投影」（`SOLOIPS_PERSISTED_OPERATION_KINDS` 持久词表、`knownOperationKinds()`
 * 提交门清单）**没有**被编译器强制与联合同步。`Record<SoloipsOperationKind, true>`
 * 把「联合本身」变成可枚举对象，并同时钉住两件事：
 *  - 联合**加**一项而漏改这里 → 缺键，编译失败；
 *  - 这里**多**一个不在联合里的键 → 多键，编译失败。
 * 于是下面的双向相等断言有了事实基准：漏项与假项都会让测试失败。
 *
 * 〔约束〕本对象**不是**第三份生产词表：它只存在于测试，且只承载「联合有哪些
 * 成员」这一个事实（值恒为 `true`，不承载任何行为）。
 */
const ALL_OPERATION_KINDS: Record<SoloipsOperationKind, true> = {
  "company.create": true,
  "department.create": true,
  "employee.create": true,
  "appointment.create": true,
  "appointment.revoke": true,
  "employee.initialize-memory": true,
  "employee.verify-capability": true,
  "employee.record-assembly": true,
  "document.save": true,
  "work-entry.request": true,
  "team.create": true,
  "team.update-function": true,
  "team.activate": true,
  "team.close": true,
};

/** 联合成员的运行期清单（排序后，供双向比较）。 */
function unionKindList(): string[] {
  return Object.keys(ALL_OPERATION_KINDS).sort();
}

describe("A. kind 四项与三处同步（contracts 联合 ↔ domain 校验器 ↔ store 命令）", () => {
  it("提交门运行期清单与 kind 联合**双向相等**（漏项与假项都失败）", () => {
    const kinds = knownOperationKinds();
    // 无重复：重复项会让「双向相等」在长度比较上失真。
    expect(new Set(kinds).size).toBe(kinds.length);
    // 双向相等（清单 ⊆ 联合由源码的 `satisfies` 承担；这里同时承担 ⊇ 与「无假项」）。
    expect([...kinds].sort()).toEqual(unionKindList());
    // 逐项类型守卫为真（清单里的每一项都必须是本版本词表成员）。
    for (const kind of kinds) {
      expect(isKnownOperationKind(kind), `${kind} 应在运行期清单内`).toBe(true);
    }
  });

  it("运行期清单不得多出联合之外的项（假 kind 不得被当已知项）", () => {
    // 反向断言：不在联合内的串**必须**判为未知。这一条与上面的双向相等互为
    // 冗余，但错误信息更直接——「假项混入清单」是本清单最危险的失效形态：
    // 它会让本版本不认识的记录被当作可重放结果返回（把未来版本的载荷按当前
    // 类型交给调用方）。
    expect(isKnownOperationKind("team.fake-op" as SoloipsOperationKindValue)).toBe(false);
    expect(isKnownOperationKind("team.creat" as SoloipsOperationKindValue)).toBe(false);
    expect(isKnownOperationKind("" as SoloipsOperationKindValue)).toBe(false);
    // 对照：已知项为真（证明上面的 false 不是「守卫恒假」）。
    expect(isKnownOperationKind("team.activate")).toBe(true);
  });

  it("第二处同步点：domain 持久词表与 kind 联合双向相等（漏项 / 假项都失败）", () => {
    // 〔为什么能断言〕持久校验器用开放词表（未知 kind 放行），因此**行为上**
    // 无法区分「词表内」与「未知」——漏项不会让任何写入失败，只会让它被读作
    // 未知。故这一处的同步义务只能由词表自身的相等断言承担（见 domain.ts 的
    // `SOLOIPS_PERSISTED_OPERATION_KINDS` 注释）。
    expect([...SOLOIPS_PERSISTED_OPERATION_KINDS].sort()).toEqual(unionKindList());
  });

  it("持久校验器：已知 kind 全部通过，非法形状（空串 / 纯空白 / 非字符串）被拒", () => {
    const schema = SOLOIPS_COMPANY_DOMAIN_SPEC.tables.operation.valueSchema;
    const base = { id: "op_probe", status: "pending", intent: {} };
    // ① 联合内成员**全部**通过（穷举，不是抽样；`ALL_OPERATION_KINDS` 保证不漏）。
    for (const kind of unionKindList()) {
      expect(schema.safeParse({ ...base, kind }).success, `kind=${kind} 应通过`).toBe(true);
    }
    // ② 非法形状被拒——这是本校验器**真实**的鉴别力所在（非空白字符串是 kind
    //    的形状下界）。「空串放行」会让恢复核对路由到一个无意义的 kind。
    for (const invalid of ["", " ", "   ", "\t", "\n", " \t \n "]) {
      expect(
        schema.safeParse({ ...base, kind: invalid }).success,
        `kind=${JSON.stringify(invalid)} 应被拒`,
      ).toBe(false);
    }
    // ③ 非字符串同样被拒（介质里的数字/对象/数组/null 都不是 kind）。
    for (const invalid of [42, null, undefined, {}, [], true]) {
      expect(schema.safeParse({ ...base, kind: invalid }).success).toBe(false);
    }
    // ④ 开放词表的**刻意**行为：非空白未知串放行（未来版本的记录必须可读，
    //    否则整次 open 失败、恢复锚点丢失）。这不是漏检，故显式钉住。
    const unknown = schema.safeParse({ ...base, kind: "team.rotate-lead" });
    expect(unknown.success).toBe(true);
  });

  it("运行期 kind 清单覆盖全部四项 team.* 且 domain 校验器认得它们", () => {
    const kinds = knownOperationKinds();
    for (const kind of [
      "team.create",
      "team.update-function",
      "team.activate",
      "team.close",
    ] as const) {
      expect(kinds).toContain(kind);
      expect(isKnownOperationKind(kind)).toBe(true);
      // 第二处同步点：domain 词表必须列有它（词表相等断言之外的逐项可读诊断）。
      expect(SOLOIPS_PERSISTED_OPERATION_KINDS).toContain(kind);
      const parsed = SOLOIPS_COMPANY_DOMAIN_SPEC.tables.operation.valueSchema.safeParse({
        id: "op_probe",
        kind,
        status: "committed",
        intent: {},
        result: {},
      });
      expect(parsed.success, `domain 校验器拒了 kind ${kind}`).toBe(true);
    }
  });

  it("第三处同步点：每个 kind 都有服务方法与命令实现（无 kind 的动作不得存在）", async () => {
    // 机械证明：四个命令都能真正提交，且台账里的 kind 与命令一一对应。
    const base = await seedBase();
    const createOp = asOperationId("team-sync-create");
    const created = await service.createTeam({
      operationId: createOp,
      companyId: base.companyId,
      name: "同步证明组",
      function: "验证三处同步",
    });
    expect(created.status).toBe("committed");
    expect(service.getOperation(createOp)?.kind).toBe("team.create");

    const teamId = created.status === "committed" ? created.result.teamId : undefined;
    if (teamId === undefined) throw new Error("建团队失败");

    const updateOp = asOperationId("team-sync-update");
    expect(
      (
        await service.updateTeamFunction({
          operationId: updateOp,
          teamId,
          function: "验证改职能",
        })
      ).status,
    ).toBe("committed");
    expect(service.getOperation(updateOp)?.kind).toBe("team.update-function");

    const lead = await seedTeamLeadAppointment(base, teamId);
    const activateOp = asOperationId("team-sync-activate");
    expect(
      (await service.activateTeam({ operationId: activateOp, teamId, leadAppointmentId: lead }))
        .status,
    ).toBe("committed");
    expect(service.getOperation(activateOp)?.kind).toBe("team.activate");

    const closeOp = asOperationId("team-sync-close");
    expect((await service.closeTeam({ operationId: closeOp, teamId })).status).toBe("committed");
    expect(service.getOperation(closeOp)?.kind).toBe("team.close");
  });

  it("每个新写入的台账记录都带 schemaVersion（新记录不豁免）", async () => {
    const base = await seedBase();
    const operationId = asOperationId("team-schema-version-1");
    await service.createTeam({
      operationId,
      companyId: base.companyId,
      name: "版本戳组",
      function: "验证 schemaVersion",
    });
    const record = service.getOperation(operationId);
    expect(record?.schemaVersion).toBe(SOLOIPS_OPERATION_SCHEMA_VERSION);
    expect(SOLOIPS_OPERATION_SCHEMA_VERSION).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Team 记录形状与四值 status
// ─────────────────────────────────────────────────────────────────────────────

describe("B. Team 记录形状（四值 status + pending 期无组长）", () => {
  it("team.create 写入 pending 团队，记录里**没有** leadAppointmentId 字段", async () => {
    const base = await seedBase();
    const teamId = await seedPendingTeam(base);
    const stored = storedTeam(teamId);
    expect(stored.status).toBe("pending");
    expect(stored.companyId).toBe(base.companyId);
    expect(stored.departmentId).toBe(base.departmentId);
    expect(stored.function).toBe("负责分镜绘制");
    expect(stored.functionSource).toBe("leader-defined");
    // pending 的定义特征：无组长。字段**缺省**（不是 undefined 显式写入）。
    expect("leadAppointmentId" in stored).toBe(false);
    expect("confirmedBy" in stored).toBe(false);
  });

  it("激活后记录写入 leadAppointmentId 且 status='active'", async () => {
    const base = await seedBase();
    const { teamId, leadAppointmentId } = await seedUsableTeam(base);
    const stored = storedTeam(teamId);
    expect(stored.status).toBe("active");
    expect(stored.leadAppointmentId).toBe(leadAppointmentId);
  });

  it("归档保留最后的组长引用（历史事实，不因归档清空）", async () => {
    const base = await seedBase();
    const { teamId, leadAppointmentId } = await seedUsableTeam(base);
    const closed = await service.closeTeam({
      operationId: nextSeedOperationId("team-close"),
      teamId,
    });
    expect(closed.status).toBe("committed");
    const stored = storedTeam(teamId);
    expect(stored.status).toBe("archived");
    expect(stored.leadAppointmentId).toBe(leadAppointmentId);
  });

  it("schema 层：四值 status 全部通过；第五值与非法值被拒", () => {
    const schema = SOLOIPS_COMPANY_DOMAIN_SPEC.tables.team.valueSchema;
    const base = {
      id: "team_x",
      companyId: "cmp_x",
      name: "组",
      function: "职能",
      functionSource: "leader-defined",
      createdAt: "2026-09-18T00:00:00.000Z",
    };
    for (const status of ["pending", "active", "inactive", "archived"] as const) {
      expect(schema.safeParse({ ...base, status }).success, `status=${status} 应通过`).toBe(true);
    }
    // 未知状态（如把「不可用」写成 'paused'）必须被拒——四值是裁定后的完整词表。
    expect(schema.safeParse({ ...base, status: "paused" }).success).toBe(false);
    // 三值形态（本切片前的目标候选）不再是合法词表：'inactive' 是新增第四值。
    expect(schema.safeParse({ ...base, status: "usable" }).success).toBe(false);
    // functionSource 只认两值（枚举扩展〔待决 M0.2+〕，实现不得自行新增）。
    expect(schema.safeParse({ ...base, status: "pending", functionSource: "user" }).success).toBe(
      false,
    );
    // 空 leadAppointmentId 缺省合法；给了但形状不对即拒。
    expect(schema.safeParse({ ...base, status: "pending" }).success).toBe(true);
    expect(
      schema.safeParse({ ...base, status: "active", leadAppointmentId: "emp_x" }).success,
    ).toBe(false);
  });

  it("system-suggested 缺 confirmedBy 即拒绝（未确认草稿不得成为团队职能）", async () => {
    const base = await seedBase();
    await expect(
      service.createTeam({
        operationId: nextSeedOperationId("team-create"),
        companyId: base.companyId,
        name: "草稿组",
        function: "系统建议的职能",
        functionSource: "system-suggested",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
  });

  it("system-suggested + confirmedBy 可建，且确认者任职必须存在", async () => {
    const base = await seedBase();
    const confirmedBy = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId: base.employeeId,
      scope: { kind: "department", companyId: base.companyId, departmentId: base.departmentId },
      role: "department_lead",
    });
    if (confirmedBy.status !== "committed") throw new Error("建部长失败");
    const created = await service.createTeam({
      operationId: nextSeedOperationId("team-create"),
      companyId: base.companyId,
      name: "建议组",
      function: "系统建议后确认的职能",
      functionSource: "system-suggested",
      confirmedBy: confirmedBy.result.appointmentId,
    });
    expect(created.status).toBe("committed");
    if (created.status !== "committed") throw new Error("建团队失败");
    expect(storedTeam(created.result.teamId).confirmedBy).toBe(confirmedBy.result.appointmentId);
    // 不存在的确认者任职即拒绝（引用必须可解析）。
    await expect(
      service.createTeam({
        operationId: nextSeedOperationId("team-create"),
        companyId: base.companyId,
        name: "悬空确认组",
        function: "确认者不存在",
        functionSource: "system-suggested",
        confirmedBy: "apt_missing" as SoloipsAppointmentId,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
  });

  it("部门归属必须同公司（跨公司引用即拒绝）", async () => {
    const first = await seedBase();
    const second = await seedBase();
    await expect(
      service.createTeam({
        operationId: nextSeedOperationId("team-create"),
        companyId: first.companyId,
        departmentId: second.departmentId,
        name: "跨公司组",
        function: "归属矛盾",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
  });

  it("部门可缺省（团队不必挂部门）", async () => {
    const base = await seedBase();
    const created = await service.createTeam({
      operationId: nextSeedOperationId("team-create"),
      companyId: base.companyId,
      name: "无部门组",
      function: "不挂部门的团队",
    });
    expect(created.status).toBe("committed");
    if (created.status !== "committed") throw new Error("建团队失败");
    expect("departmentId" in storedTeam(created.result.teamId)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. P-8 悬挂处置 / P-7 禁物理删除 / P-9 读面纪律
// ─────────────────────────────────────────────────────────────────────────────

describe("C. P-8 悬挂处置（只标记不修复）与 P-7 禁物理删除", () => {
  it("reconcileTeams：active 但组长引用失效 → 标记 inactive；不自动修复", async () => {
    const base = await seedBase();
    const { teamId, leadAppointmentId } = await seedUsableTeam(base);
    // 模拟悬挂：直接改介质把组长任职删掉（模拟崩溃残留/外部改动）。
    fakeMediumTable(ROOT, "appointment").delete(leadAppointmentId);
    // 标记前：读面已把它判为不可用（P-8.2 由读面自身满足）。
    expect(viewOf(teamId).usable).toBe(false);
    expect(viewOf(teamId).leadReference).toMatchObject({
      valid: false,
      reason: "appointment-missing",
    });
    // 介质上的 status 仍是 active（尚未扫描）。
    expect(storedTeam(teamId).status).toBe("active");

    const result = await service.reconcileTeams();
    expect(result.scanned).toBe(1);
    expect(result.markedInactive).toEqual([teamId]);
    expect(storedTeam(teamId).status).toBe("inactive");
    // 〔P-8.3 不自动修复〕引用**未**被改动/补建。
    expect(storedTeam(teamId).leadAppointmentId).toBe(leadAppointmentId);
  });

  it("reconcileTeams 幂等：第二次扫描无 active 团队可标（不重复写）", async () => {
    const base = await seedBase();
    const { teamId, leadAppointmentId } = await seedUsableTeam(base);
    fakeMediumTable(ROOT, "appointment").delete(leadAppointmentId);
    const first = await service.reconcileTeams();
    expect(first.scanned).toBe(1);
    expect(first.markedInactive).toEqual([teamId]);
    const second = await service.reconcileTeams();
    expect(second.scanned).toBe(0);
    expect(second.markedInactive).toEqual([]);
    // 幂等：状态仍是 inactive，未被反复改写。
    expect(storedTeam(teamId).status).toBe("inactive");
  });

  it("reconcileTeams 写前复核写权：失权后拒绝，且介质零变化（不经门的写同样受 fence 保护）", async () => {
    // 〔本条封住的盲区〕`reconcileTeams` 是 core 内**不经提交门**的第二处写
    // （第一处是账户绑定），它的 fence 保护**只**来自 `#reconcileOne` 里的
    // `lease.assertHeld()`——门的「每次写前复核写权」不覆盖它。而交付套件
    // 原有用例只断言了「close 后 reconcileTeams 抛 STORE_CLOSED」（关闭语义），
    // 没有任何用例证明**失权**（另一个进程取得新代际）时它也会拒绝。
    // 若无此复核，本命令就成了绕过 fence 的写口（P-8 收敛路径写穿跨进程互斥）。
    const base = await seedBase();
    const { teamId, leadAppointmentId } = await seedUsableTeam(base);
    // 造出「待标记」状态：删掉组长任职 → 扫描时该 active 团队将被标为 inactive。
    fakeMediumTable(ROOT, "appointment").delete(leadAppointmentId);
    expect(storedTeam(teamId).status).toBe("active");

    const before = snapshotMedium();
    fakeTakeoverLease(ROOT); // 另一个 writer 取得新代际 → 本实例失权

    await expect(service.reconcileTeams()).rejects.toMatchObject({
      code: "SOLOIPS_CORE_LEASE_NOT_HELD",
    });
    // 介质零变化：状态**未**被标记（写前复核在 update 之前）。
    expect(snapshotMedium()).toEqual(before);
    expect(storedTeam(teamId).status).toBe("active");

    // 反向对照：重新取得写权后同一命令正常收敛（证明上面的拒绝来自失权，
    // 不是「命令本身不可用」）。
    const reopened = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    const result = await reopened.reconcileTeams();
    expect(result.markedInactive).toEqual([teamId]);
    expect(fakeMediumTable(ROOT, "team").get(teamId)).toMatchObject({ status: "inactive" });
    await reopened.close();
  });

  it("reconcileTeams 报告 pending 团队但不处置（续做/收敛须显式操作）", async () => {
    const base = await seedBase();
    const teamId = await seedPendingTeam(base);
    const result = await service.reconcileTeams();
    expect(result.pending).toEqual([teamId]);
    expect(result.markedInactive).toEqual([]);
    // 未处置：仍是 pending（不自动激活、不自动归档）。
    expect(storedTeam(teamId).status).toBe("pending");
  });

  it("reconcileTeams 不扫描 archived 团队（P-8.6）", async () => {
    const base = await seedBase();
    const { teamId } = await seedUsableTeam(base);
    await service.closeTeam({ operationId: nextSeedOperationId("team-close"), teamId });
    const result = await service.reconcileTeams();
    expect(result.scanned).toBe(0);
    expect(storedTeam(teamId).status).toBe("archived");
  });

  it("P-7 禁物理删除：close 后记录仍在介质上（只转 archived）", async () => {
    const base = await seedBase();
    const teamId = await seedPendingTeam(base);
    const before = fakeMediumTable(ROOT, "team").size;
    await service.closeTeam({ operationId: nextSeedOperationId("team-close"), teamId });
    expect(fakeMediumTable(ROOT, "team").size).toBe(before);
    expect(fakeMediumTable(ROOT, "team").has(teamId)).toBe(true);
    expect(storedTeam(teamId).status).toBe("archived");
  });

  it("P-9 收敛路径：pending 团队可显式归档（不得长期悬挂）", async () => {
    const base = await seedBase();
    const teamId = await seedPendingTeam(base);
    const closed = await service.closeTeam({
      operationId: nextSeedOperationId("team-close"),
      teamId,
    });
    expect(closed.status).toBe("committed");
    expect(storedTeam(teamId).status).toBe("archived");
  });

  it("archived 是终态：重复 close / 再 activate / 改职能均拒绝", async () => {
    const base = await seedBase();
    const { teamId, leadAppointmentId } = await seedUsableTeam(base);
    await service.closeTeam({ operationId: nextSeedOperationId("team-close"), teamId });
    await expect(
      service.closeTeam({ operationId: nextSeedOperationId("team-close"), teamId }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
    await expect(
      service.activateTeam({
        operationId: nextSeedOperationId("team-activate"),
        teamId,
        leadAppointmentId,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
    await expect(
      service.updateTeamFunction({
        operationId: nextSeedOperationId("team-update"),
        teamId,
        function: "归档后改职能",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
  });

  it("update-function 不改变 status（P-9.3：不得越过 activate 完成成团）", async () => {
    const base = await seedBase();
    const teamId = await seedPendingTeam(base);
    const updated = await service.updateTeamFunction({
      operationId: nextSeedOperationId("team-update"),
      teamId,
      function: "改过的职能",
    });
    expect(updated.status).toBe("committed");
    expect(storedTeam(teamId).status).toBe("pending");
    // 改职能后仍不可用（未 activate）。
    expect(viewOf(teamId).usable).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. schemaVersion 写读策略
// ─────────────────────────────────────────────────────────────────────────────

describe("D. operation.schemaVersion（写入 / 读取 / unknown kind 兼容）", () => {
  it("存量记录（无 schemaVersion）可读回，且不因缺字段被拒", async () => {
    const base = await seedBase();
    const legacyId = asOperationId("legacy-op-without-schema-version");
    // 模拟 BE-2 时代写入的记录：无 schemaVersion 字段。
    fakeMediumTable(ROOT, "operation").set(legacyId, {
      id: legacyId,
      kind: "company.create",
      status: "committed",
      intent: { name: "存量公司" },
      result: { companyId: base.companyId },
    });
    const record = service.getOperation(legacyId);
    expect(record?.kind).toBe("company.create");
    expect(record?.schemaVersion).toBeUndefined();
    // 重放仍可用（同 operationId 同 kind 的已提交操作）。
    const replayed = await service.createCompany({
      operationId: legacyId,
      name: "存量公司",
    });
    expect(replayed.status).toBe("replayed");
  });

  it("unknown kind：保留原样读出，不判损坏、不被丢弃", async () => {
    const base = await seedBase();
    const futureId = asOperationId("future-op-kind");
    // 模拟**未来版本**写入的记录（kind 不在当前词表内，schemaVersion 更高）。
    fakeMediumTable(ROOT, "operation").set(futureId, {
      id: futureId,
      kind: "team.rotate-lead",
      status: "committed",
      intent: { teamId: "team_future" },
      result: { ok: true },
      schemaVersion: 99,
    });
    const record = service.getOperation(futureId);
    expect(record?.kind).toBe("team.rotate-lead");
    expect(record?.status).toBe("committed");
    expect(record?.schemaVersion).toBe(99);
    // 该记录不是本版本可重放的：同 ID 换 kind 复用被拒（未知不等于可复用）。
    await expect(
      service.createCompany({ operationId: futureId, name: "复用未来 ID" }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_CONFLICT" });
    expect(base.companyId).toBeDefined();
  });

  it("unknown kind 的**未决**记录仍参与恢复核对（读不懂不等于可忽略）", async () => {
    const base = await seedBase();
    const pendingFutureId = asOperationId("future-op-pending");
    fakeMediumTable(ROOT, "operation").set(pendingFutureId, {
      id: pendingFutureId,
      kind: "team.some-future-write",
      status: "pending",
      employeeId: base.employeeId,
      intent: {},
      schemaVersion: 99,
    });
    // 未决清单必须包含它——否则接管方看不到这条未决事实。
    expect(service.listPendingOperations().map((record) => record.id)).toContain(pendingFutureId);
    // 且它按 ORG-05 阻塞该员工的新操作（即使本版本读不懂它是什么操作）。
    const entry = await service.requestWorkEntry({
      operationId: nextSeedOperationId("work-entry-blocked-by-unknown"),
      employeeId: base.employeeId,
      taskId: "task-1",
      origin: "self-claim",
    });
    expect(entry).toMatchObject({ status: "refused", reason: "employee-operation-unknown" });
  });

  it("未知 kind 的记录不使 open 失败（否则恢复锚点丢失）", async () => {
    const base = await seedBase();
    fakeMediumTable(ROOT, "operation").set("future-op-open", {
      id: "future-op-open",
      kind: "work-entry.something-new",
      status: "pending",
      intent: {},
      schemaVersion: 42,
    });
    expect(base.companyId).toBeDefined();
    await service.close();
    // 同一根重开：未知 kind 不得触发整次 open 拒绝。
    const reopened = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    expect(reopened.getOperation(asOperationId("future-op-open"))?.kind).toBe(
      "work-entry.something-new",
    );
    await reopened.close();
  });

  it("schemaVersion 只接受正整数（0/负数/非整数即记录损坏）", () => {
    const schema = SOLOIPS_COMPANY_DOMAIN_SPEC.tables.operation.valueSchema;
    const base = { id: "op_x", kind: "team.create", status: "pending", intent: {} };
    expect(schema.safeParse({ ...base, schemaVersion: 1 }).success).toBe(true);
    expect(schema.safeParse({ ...base, schemaVersion: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...base, schemaVersion: -1 }).success).toBe(false);
    expect(schema.safeParse({ ...base, schemaVersion: 1.5 }).success).toBe(false);
    // 缺省合法（存量记录形状）。
    expect(schema.safeParse(base).success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. team scope 真校验
// ─────────────────────────────────────────────────────────────────────────────

describe("E. scope.kind='team' 的真校验（BE-2 的占位拒绝已替换）", () => {
  it("团队不存在 → PRECONDITION，消息指出「不存在」", async () => {
    const base = await seedBase();
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId: base.employeeId,
        scope: { kind: "team", companyId: base.companyId, teamId: "team_missing" as SoloipsTeamId },
        role: "team_lead",
      }),
    ).rejects.toMatchObject({
      code: "SOLOIPS_CORE_PRECONDITION",
      message: expect.stringContaining("不存在") as unknown as string,
    });
  });

  it("跨公司引用 → PRECONDITION，消息指出「跨公司」，与「不存在」可区分", async () => {
    const first = await seedBase();
    const second = await seedBase();
    const foreignTeam = await seedPendingTeam(second);
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId: first.employeeId,
        scope: { kind: "team", companyId: first.companyId, teamId: foreignTeam },
        role: "team_lead",
      }),
    ).rejects.toMatchObject({
      code: "SOLOIPS_CORE_PRECONDITION",
      message: expect.stringContaining("跨公司") as unknown as string,
    });
    // 反向：不存在的团队消息里**不含**「跨公司」——两条消息确实不同。
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId: first.employeeId,
        scope: {
          kind: "team",
          companyId: first.companyId,
          teamId: "team_missing" as SoloipsTeamId,
        },
        role: "team_lead",
      }),
    ).rejects.toMatchObject({
      code: "SOLOIPS_CORE_PRECONDITION",
      message: expect.not.stringContaining("跨公司") as unknown as string,
    });
  });

  it("团队级任职可建（BE-2 的「如实拒绝」已解除），且记录不带 departmentId", async () => {
    const base = await seedBase();
    const teamId = await seedPendingTeam(base);
    const created = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId: base.employeeId,
      scope: { kind: "team", companyId: base.companyId, teamId },
      role: "team_lead",
    });
    expect(created.status).toBe("committed");
    if (created.status !== "committed") throw new Error("建任职失败");
    const stored = fakeMediumTable(ROOT, "appointment").get(created.result.appointmentId) as {
      readonly scope?: unknown;
      readonly departmentId?: unknown;
    };
    expect(stored.scope).toEqual({ kind: "team", companyId: base.companyId, teamId });
    expect("departmentId" in stored).toBe(false);
  });

  it("member 可落在团队级作用域（一团队 N 名 member 可读回）", async () => {
    const base = await seedBase();
    const { teamId } = await seedUsableTeam(base);
    const members: SoloipsEmployeeId[] = [];
    for (let index = 0; index < 2; index += 1) {
      const employee = await service.createEmployee({
        operationId: nextSeedOperationId("employee"),
        displayName: `成员${index}`,
      });
      if (employee.status !== "committed") throw new Error("建员工失败");
      members.push(employee.result.employeeId);
      const created = await service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId: employee.result.employeeId,
        scope: { kind: "team", companyId: base.companyId, teamId },
        role: "member",
      });
      expect(created.status).toBe("committed");
    }
    expect(members).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. P-5 组长唯一性 + P-6 撤职联动
// ─────────────────────────────────────────────────────────────────────────────

describe("F. P-5 第二组长拒绝 + P-6 撤职→团队不可用", () => {
  it("P-5：已有有效组长时第二条 team_lead 被拒，且**零业务写**", async () => {
    const base = await seedBase();
    const { teamId } = await seedUsableTeam(base);
    const second = await service.createEmployee({
      operationId: nextSeedOperationId("employee"),
      displayName: "第二候选人",
    });
    if (second.status !== "committed") throw new Error("建员工失败");
    const before = snapshotMedium();
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId: second.result.employeeId,
        scope: { kind: "team", companyId: base.companyId, teamId },
        role: "team_lead",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
    // 零业务写：连意图都不落（precondition 在意图落盘之前）。
    expect(snapshotMedium()).toEqual(before);
  });

  it("P-5 覆盖 pending 窗口：团队仍 pending（第③步未做）时第二条 team_lead 同样被拒", async () => {
    // 这条用例钉住一个**被真实介质探针抓到的实现缺口**：`team.leadAppointmentId`
    // 只在 `team.activate` 写入，故第②步之后、第③步之前 team 记录上**没有**
    // 组长引用。若 P-5 按 team 记录判定，这个窗口里的第二条 team_lead 会被放行
    // ——直接违背 P-5「不得产生第二条」与 P-9 第②步的「对齐 P-5」。
    // 正确判据是**扫任职表**（存在 active 且作用域为本团队的 team_lead）。
    const base = await seedBase();
    const teamId = await seedPendingTeam(base);
    const firstLead = await seedTeamLeadAppointment(base, teamId);
    // 前置事实：团队仍是 pending，记录上没有组长引用。
    expect(storedTeam(teamId).status).toBe("pending");
    expect("leadAppointmentId" in storedTeam(teamId)).toBe(false);

    const second = await service.createEmployee({
      operationId: nextSeedOperationId("employee"),
      displayName: "窗口期第二候选人",
    });
    if (second.status !== "committed") throw new Error("建员工失败");
    await expect(
      service.createAppointment({
        operationId: nextSeedOperationId("appointment"),
        employeeId: second.result.employeeId,
        scope: { kind: "team", companyId: base.companyId, teamId },
        role: "team_lead",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
    // 唯一组长仍是第一条。
    expect(service.getAppointment(firstLead)?.status).toBe("active");
  });

  it("P-5 不跨团队：另一团队的 team_lead 不阻塞本团队建组长", async () => {
    const base = await seedBase();
    const first = await seedPendingTeam(base, "一组");
    const second = await seedPendingTeam(base, "二组");
    await seedTeamLeadAppointment(base, first);
    // 二组建组长：一组已有 team_lead，但作用域不同，不得被误拒。
    const secondLead = await seedTeamLeadAppointment(base, second);
    expect(service.getAppointment(secondLead)?.status).toBe("active");
  });

  it("P-6：组长撤职 → 团队立即转为 inactive（只标记、不自动继任）", async () => {
    const base = await seedBase();
    const { teamId, leadAppointmentId } = await seedUsableTeam(base);
    expect(viewOf(teamId).usable).toBe(true);

    const revoked = await service.revokeAppointment({
      operationId: nextSeedOperationId("appointment-revoke"),
      appointmentId: leadAppointmentId,
    });
    expect(revoked.status).toBe("committed");
    // 联动在同一提交内完成：团队已是 inactive，不需要跑 reconcile。
    expect(storedTeam(teamId).status).toBe("inactive");
    expect(viewOf(teamId).usable).toBe(false);
    expect(viewOf(teamId).leadReference).toMatchObject({ valid: false, reason: "revoked" });
    // 〔不自动继任〕没有任何新任职被建立。
    expect(service.getAppointment(leadAppointmentId)?.status).toBe("revoked");
  });

  it("P-6 联动只影响以该任职为组长的团队（其他团队不受影响）", async () => {
    const base = await seedBase();
    const first = await seedUsableTeam(base, "一组");
    const second = await seedUsableTeam(base, "二组");
    await service.revokeAppointment({
      operationId: nextSeedOperationId("appointment-revoke"),
      appointmentId: first.leadAppointmentId,
    });
    expect(storedTeam(first.teamId).status).toBe("inactive");
    expect(storedTeam(second.teamId).status).toBe("active");
    expect(viewOf(second.teamId).usable).toBe(true);
  });

  it("P-6 联动只影响 active 团队（pending 不受影响，归档不参与）", async () => {
    const base = await seedBase();
    const teamId = await seedPendingTeam(base);
    const lead = await seedTeamLeadAppointment(base, teamId);
    // pending 团队上先记一条引用（模拟 P-8.4 的修复路径：先建任职，再激活）。
    // 撤职时团队仍是 pending —— 不得被改成 inactive（它本就不是可用态）。
    const revoked = await service.revokeAppointment({
      operationId: nextSeedOperationId("appointment-revoke"),
      appointmentId: lead,
    });
    expect(revoked.status).toBe("committed");
    expect(storedTeam(teamId).status).toBe("pending");
  });

  it("换任路径：撤职后建新 team_lead 可成功（P-5 不阻塞恢复）", async () => {
    const base = await seedBase();
    const { teamId, leadAppointmentId } = await seedUsableTeam(base);
    await service.revokeAppointment({
      operationId: nextSeedOperationId("appointment-revoke"),
      appointmentId: leadAppointmentId,
    });
    const replacement = await seedTeamLeadAppointment(base, teamId);
    expect(replacement).not.toBe(leadAppointmentId);
    // P-8.4 换任：显式改指 + 重新激活。
    const activated = await service.activateTeam({
      operationId: nextSeedOperationId("team-activate"),
      teamId,
      leadAppointmentId: replacement,
    });
    expect(activated.status).toBe("committed");
    expect(storedTeam(teamId).status).toBe("active");
    expect(storedTeam(teamId).leadAppointmentId).toBe(replacement);
    expect(viewOf(teamId).usable).toBe(true);
  });

  it("P-9.3 端到端：撤职 → 建新组长 → 改职能，团队仍 inactive（activate 是唯一通道）", async () => {
    // 〔本条封住的盲区〕现有用例分别覆盖了「撤职 → inactive」与「update-function
    // 不改 pending 团队的 status」，但**没有**覆盖两者相交的越权路径：撤职后
    // 团队处于 inactive，若实现把「组长引用已就绪」当作可用条件（例如
    // update-function 顺带把有引用的团队置 active），就会凭空完成一次成团——
    // 而 P-9.3 要求 `activate` 是**唯一**的成团通道。
    //
    // 本用例走完整可达路径（不靠直改介质），把该路径后的 status 钉死为 inactive。
    const base = await seedBase();
    const { teamId, leadAppointmentId } = await seedUsableTeam(base);
    expect(viewOf(teamId).usable).toBe(true);

    // ① 撤职 → P-6 联动置 inactive。
    await service.revokeAppointment({
      operationId: nextSeedOperationId("appointment-revoke"),
      appointmentId: leadAppointmentId,
    });
    expect(storedTeam(teamId).status).toBe("inactive");

    // ② 建新 team_lead（P-5 不阻塞：旧组长已撤销）。
    const replacement = await seedTeamLeadAppointment(base, teamId);
    expect(service.getAppointment(replacement)?.status).toBe("active");
    // 前置事实：记录上的引用**仍指旧任职**（改指属 `activate` 的参数，见 store
    // 的 `activateTeam`：`leadAppointmentId` 只在 activate 里写入）——所以此刻
    // 引用判定为 `revoked`，且团队仍未恢复。新任职已就绪但**未被引用**：
    // 「引用就绪」与「成团」是两件事，后者只能经 activate 完成（P-9.3）。
    expect(storedTeam(teamId).leadAppointmentId).toBe(leadAppointmentId);
    expect(viewOf(teamId).leadReference).toMatchObject({ valid: false, reason: "revoked" });
    expect(storedTeam(teamId).status).toBe("inactive");
    expect(viewOf(teamId).usable).toBe(false);

    // ③ 改职能：不得越过 activate 完成成团（也不得擅自改指引用）。
    const updated = await service.updateTeamFunction({
      operationId: nextSeedOperationId("team-update"),
      teamId,
      function: "换任后的新职能",
    });
    expect(updated.status).toBe("committed");
    expect(storedTeam(teamId).status).toBe("inactive");
    expect(storedTeam(teamId).function).toBe("换任后的新职能");
    // 记录上的组长引用**仍指旧任职**（改职能不改指——改指属 activate 的参数）。
    expect(storedTeam(teamId).leadAppointmentId).toBe(leadAppointmentId);
    expect(viewOf(teamId).usable).toBe(false);
    expect(service.listTeams(base.companyId).map((view) => view.id)).not.toContain(teamId);

    // ④ 对照：同一状态经显式 activate 才恢复可用（证明上面的 false 不是「不可恢复」）。
    const activated = await service.activateTeam({
      operationId: nextSeedOperationId("team-activate"),
      teamId,
      leadAppointmentId: replacement,
    });
    expect(activated.status).toBe("committed");
    expect(viewOf(teamId).usable).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P-4 四项校验（activate 的拒绝路径）
// ─────────────────────────────────────────────────────────────────────────────

describe("P-4 四项校验：activate 不满足即拒绝（团队留在原状态、零业务写）", () => {
  it("无组长引用 → 拒绝，团队留在 pending", async () => {
    const base = await seedBase();
    const teamId = await seedPendingTeam(base);
    const before = snapshotMedium();
    await expect(
      service.activateTeam({ operationId: nextSeedOperationId("team-activate"), teamId }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
    expect(snapshotMedium()).toEqual(before);
    expect(storedTeam(teamId).status).toBe("pending");
  });

  it("P-4 第④项：引用一条 role='member' 的任职 → 拒绝", async () => {
    const base = await seedBase();
    const teamId = await seedPendingTeam(base);
    const member = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId: base.employeeId,
      scope: { kind: "team", companyId: base.companyId, teamId },
      role: "member",
    });
    if (member.status !== "committed") throw new Error("建成员任职失败");
    await expect(
      service.activateTeam({
        operationId: nextSeedOperationId("team-activate"),
        teamId,
        leadAppointmentId: member.result.appointmentId,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
    expect(storedTeam(teamId).status).toBe("pending");
    expect("leadAppointmentId" in storedTeam(teamId)).toBe(false);
  });

  it("P-4 第③项：引用指向**别的团队**的 team_lead 任职 → 拒绝", async () => {
    const base = await seedBase();
    const target = await seedPendingTeam(base, "目标组");
    const other = await seedPendingTeam(base, "别组");
    const foreignLead = await seedTeamLeadAppointment(base, other);
    await expect(
      service.activateTeam({
        operationId: nextSeedOperationId("team-activate"),
        teamId: target,
        leadAppointmentId: foreignLead,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
    expect(storedTeam(target).status).toBe("pending");
  });

  it("P-4 第②项：组长任职属于**别的公司** → 拒绝（跨公司）", async () => {
    const first = await seedBase();
    const second = await seedBase();
    const teamId = await seedPendingTeam(first);
    const foreignLead = await seedTeamLeadAppointment(second, await seedPendingTeam(second));
    await expect(
      service.activateTeam({
        operationId: nextSeedOperationId("team-activate"),
        teamId,
        leadAppointmentId: foreignLead,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
    expect(storedTeam(teamId).status).toBe("pending");
  });

  it("P-4 第①项：引用的任职已撤销 → 拒绝", async () => {
    const base = await seedBase();
    const teamId = await seedPendingTeam(base);
    const lead = await seedTeamLeadAppointment(base, teamId);
    await service.revokeAppointment({
      operationId: nextSeedOperationId("appointment-revoke"),
      appointmentId: lead,
    });
    await expect(
      service.activateTeam({
        operationId: nextSeedOperationId("team-activate"),
        teamId,
        leadAppointmentId: lead,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
    expect(storedTeam(teamId).status).toBe("pending");
  });

  it("已是 active 的团队重复 activate（换 ID）→ 拒绝", async () => {
    const base = await seedBase();
    const { teamId, leadAppointmentId } = await seedUsableTeam(base);
    await expect(
      service.activateTeam({
        operationId: nextSeedOperationId("team-activate"),
        teamId,
        leadAppointmentId,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
  });

  it("重复 activate 复用同一 operationId → replayed（幂等由 operationId 承担）", async () => {
    const base = await seedBase();
    const teamId = await seedPendingTeam(base);
    const lead = await seedTeamLeadAppointment(base, teamId);
    const operationId = asOperationId("team-activate-idempotent");
    const first = await service.activateTeam({ operationId, teamId, leadAppointmentId: lead });
    expect(first.status).toBe("committed");
    const replayed = await service.activateTeam({ operationId, teamId, leadAppointmentId: lead });
    expect(replayed.status).toBe("replayed");
    expect(replayed.status === "replayed" && replayed.result.teamId).toBe(teamId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P-3 / P-8.2 / P-9.1 读面纪律
// ─────────────────────────────────────────────────────────────────────────────

describe("读面纪律（P-3 / P-8.2 / P-9.1）：可用结果集排除 pending 与失效团队", () => {
  it("listTeams 默认只给可用团队：pending / inactive / archived 均被排除", async () => {
    const base = await seedBase();
    const usable = await seedUsableTeam(base, "可用组");
    const pending = await seedPendingTeam(base, "成团中组");
    const closed = await seedUsableTeam(base, "已归档组");
    await service.closeTeam({
      operationId: nextSeedOperationId("team-close"),
      teamId: closed.teamId,
    });

    const usableIds = service.listTeams(base.companyId).map((view) => view.id);
    expect(usableIds).toEqual([usable.teamId]);
    expect(usableIds).not.toContain(pending);
    expect(usableIds).not.toContain(closed.teamId);

    // includeUnusable：全部返回，且逐项带显式状态（P-8.5/P-9.2 不静默降级）。
    const all = service.listTeams(base.companyId, { includeUnusable: true });
    expect(all.map((view) => view.id).sort()).toEqual(
      [usable.teamId, pending, closed.teamId].sort(),
    );
    const pendingView = all.find((view) => view.id === pending);
    expect(pendingView?.status).toBe("pending");
    expect(pendingView?.usable).toBe(false);
    expect(pendingView?.leadReference).toMatchObject({ valid: false, reason: "absent" });
  });

  it("getTeam 返回任何状态但 usable 显式为 false（不冒充可用）", async () => {
    const base = await seedBase();
    const pending = await seedPendingTeam(base);
    const view = viewOf(pending);
    expect(view.status).toBe("pending");
    expect(view.usable).toBe(false);
  });

  it("P-9.1：pending + 组长引用**有效**仍不可用（status 与引用是两个条件，缺一不可）", async () => {
    // 〔本条封住的盲区〕现有用例只覆盖「pending 且**无**引用」（`absent`），
    // 那种情形在「只按引用判定可用性」的实现下也会被判不可用，故鉴别力为零。
    // 真正的判据分叉在**引用有效但 status 不是 active** 的形状上：P-9.1 要求
    // 「pending 不得出现在可用结果中」。
    //
    // 〔构造为什么必须直达介质〕`leadAppointmentId` 的写入点只有 `team.activate`
    // 一处（`createTeam` 刻意不写——见 store.ts 文件头「组长归属」段），且它与
    // `status='active'` 在同一次 `update` 里写入。因此「pending 且引用有效」
    // **不可能**由本版本的命令序列产生：它是外部/未来版本写入、或人工修复
    // 留下的形状。P-9.1 的措辞正是针对读面——「pending 不得出现在可用结果中」
    // 是**不变量**，不能只对「本版本自己写出的形状」成立。
    //
    // 构造：三步成团到 active（得到有效引用），再把介质上的 status 改回
    // `pending`。引用本身仍指向一条有效 team_lead 任职。
    const base = await seedBase();
    const { teamId, leadAppointmentId } = await seedUsableTeam(base);
    const record = storedTeam(teamId);
    fakeMediumTable(ROOT, "team").set(teamId, { ...record, status: "pending" });

    // 前置事实：引用确实**有效**（否则本用例退化为「无引用」情形，失去鉴别力）。
    const view = viewOf(teamId);
    expect(view.status).toBe("pending");
    expect(view.leadReference).toMatchObject({
      valid: true,
      appointmentId: leadAppointmentId,
    });
    expect(view.leadAppointmentId).toBe(leadAppointmentId);

    // 断言：可用性必须为 false（P-9.1）。若实现只排除 archived/inactive，
    // 这里会读作可用——「pending 团队带着有效组长引用」就此冒充成团完成。
    expect(view.usable).toBe(false);
    expect(service.listTeams(base.companyId).map((v) => v.id)).not.toContain(teamId);

    // 对照：同一引用 + `active` 状态 → 可用。证明上面的 false 来自 status，
    // 不是来自引用被判无效（排除「引用恰好失效」这一混淆解释）。
    fakeMediumTable(ROOT, "team").set(teamId, { ...record, status: "active" });
    expect(viewOf(teamId).usable).toBe(true);

    // 且 reconcile 不把 pending 改回 active（P-8.6/P-9：只报告不处置）。
    fakeMediumTable(ROOT, "team").set(teamId, { ...record, status: "pending" });
    const reconcile = await service.reconcileTeams();
    expect(reconcile.pending).toContain(teamId);
    expect(reconcile.markedInactive).toEqual([]);
    expect(storedTeam(teamId).status).toBe("pending");
  });

  it("撤职后未跑 reconcile：读面仍不得把团队读作可用（P-8.2 由读面满足）", async () => {
    const base = await seedBase();
    const { teamId, leadAppointmentId } = await seedUsableTeam(base);
    // 绕过 P-6 联动：直接改介质把任职标为 revoked（模拟外部/历史改动）。
    const appointment = fakeMediumTable(ROOT, "appointment").get(leadAppointmentId) as Record<
      string,
      unknown
    >;
    fakeMediumTable(ROOT, "appointment").set(leadAppointmentId, {
      ...appointment,
      status: "revoked",
    });
    // 介质上 team.status 仍是 active，但读面必须判不可用。
    expect(storedTeam(teamId).status).toBe("active");
    expect(viewOf(teamId).usable).toBe(false);
    expect(service.listTeams(base.companyId).map((view) => view.id)).not.toContain(teamId);
    // reconcile 只把结论落盘（读面纪律不依赖它）。
    const result = await service.reconcileTeams();
    expect(result.markedInactive).toEqual([teamId]);
  });

  it("读面不产生 kind（BE-3 验收⑤：查询不写台账）", async () => {
    const base = await seedBase();
    const { teamId } = await seedUsableTeam(base);
    const before = fakeMediumTable(ROOT, "operation").size;
    // 读面：getTeam（存在与不存在各一次）、listTeams 两种模式、reconcileTeams。
    expect(viewOf(teamId).id).toBe(teamId);
    expect(service.getTeam("team_missing" as SoloipsTeamId)).toBeUndefined();
    service.listTeams(base.companyId);
    service.listTeams(base.companyId, { includeUnusable: true });
    await service.reconcileTeams();
    expect(fakeMediumTable(ROOT, "operation").size).toBe(before);
  });

  it("listTeams 按公司隔离（不返回其他公司的团队）", async () => {
    const first = await seedBase();
    const second = await seedBase();
    const firstTeam = await seedUsableTeam(first);
    await seedUsableTeam(second);
    const ids = service.listTeams(first.companyId).map((view) => view.id);
    expect(ids).toEqual([firstTeam.teamId]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. 存量兼容：BE-2 时代形状的根（无 team 表）
// ─────────────────────────────────────────────────────────────────────────────

describe("G. 存量根兼容：BE-2 时代形状（无 team 表、任职无 scope/role）", () => {
  it("存量任职（无 scope/role）与新建团队共存，互不影响", async () => {
    const base = await seedBase();
    // 模拟 BE-2 时代写入的存量任职：只有 departmentId、无 scope/role。
    const legacyId = "apt_legacy_team_spec" as SoloipsAppointmentId;
    fakeMediumTable(ROOT, "appointment").set(legacyId, {
      id: legacyId,
      employeeId: base.employeeId,
      departmentId: base.departmentId,
      requiredCapabilities: [],
      generation: 1,
      status: "active",
    });
    await service.close();
    const reopened = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    // 存量任职仍按 §2.3 分支 2 解析为部门级（不受 team 表存在与否影响）。
    expect(reopened.getAppointment(legacyId)?.scope).toEqual({
      kind: "department",
      companyId: base.companyId,
      departmentId: base.departmentId,
    });
    // 存量根上可正常建团队（team 表是新表，无存量负担）。
    const created = await reopened.createTeam({
      operationId: nextSeedOperationId("team-create"),
      companyId: base.companyId,
      name: "存量根上的新团队",
      function: "验证新表在存量根上可用",
    });
    expect(created.status).toBe("committed");
    await reopened.close();
  });

  it("domain 版本仍为 1（team 表是新表，无存量记录需要版本位保护）", () => {
    expect(SOLOIPS_COMPANY_DOMAIN_SPEC.version).toBe(1);
    expect(SOLOIPS_COMPANY_DOMAIN_VERSION).toBe(1);
  });

  it("team 表已登记进 domain spec（第七张表）", () => {
    expect(Object.keys(SOLOIPS_COMPANY_DOMAIN_SPEC.tables).sort()).toEqual([
      "appointment",
      "company",
      "department",
      "document_version",
      "employee",
      "operation",
      "team",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 关闭语义（team 命令与既有命令同待遇）
// ─────────────────────────────────────────────────────────────────────────────

describe("store 关闭后 team 命令全部拒绝", () => {
  it("close 后 createTeam / activateTeam / closeTeam / reconcileTeams 均抛 STORE_CLOSED", async () => {
    const base = await seedBase();
    const teamId = await seedPendingTeam(base);
    await service.close();
    await expect(
      service.createTeam({
        operationId: nextSeedOperationId("team-create"),
        companyId: base.companyId,
        name: "关闭后",
        function: "应被拒",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_STORE_CLOSED" });
    await expect(
      service.activateTeam({ operationId: nextSeedOperationId("team-activate"), teamId }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_STORE_CLOSED" });
    await expect(
      service.closeTeam({ operationId: nextSeedOperationId("team-close"), teamId }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_STORE_CLOSED" });
    await expect(service.reconcileTeams()).rejects.toMatchObject({
      code: "SOLOIPS_CORE_STORE_CLOSED",
    });
    expect(() => service.listTeams(base.companyId)).toThrow(
      expect.objectContaining({ code: "SOLOIPS_CORE_STORE_CLOSED" }) as Error,
    );
  });
});
