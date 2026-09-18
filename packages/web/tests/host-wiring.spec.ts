/**
 * BE-6a Host 接线性测试：受控暴露面、身份分层、拒绝语义与只读纪律。
 *
 * ── 为什么用**真实 cordis `Context`** 而不是手写替身 ────────────────────────
 * 被测对象是「服务在 Host 上下文里的**可解析性**」：`ctx.get('soloipsCore')` 的
 * 语义（未发布返回 `undefined`、发布后按名取回）正是本片「服务未就绪」这条验收的
 * 判据本身。手写替身会把「`ctx.get` 到底怎么工作」也一并伪造掉，于是用例证明的是
 * 替身的行为而不是宿主的。实测：`new Context()` + `ctx.provide()` 在 vitest 下可
 * 直接使用（无宿主依赖）。
 *
 * ── 本文件覆盖的验收条款（逐条对应 Issue #35 §5 的 BE-6a 条款）───────────────
 *  1. 可信用户入口可触发创建；`accountId`/身份不由任意 UI 或模型参数覆盖；
 *  2. 合法用户引导 Remote **不带** agent 上下文必须成功（防冷启动死锁）；
 *  3. 只读接口有可达路径且**不产生 operation**；未就绪**不伪装**空数据；
 *  4. 合法调用 / 参数无效 / quota 拒绝 / 跨根（不存在）/ 服务未就绪 / unknown / 重放
 *     逐项验证；
 *  5. `close()` 与底层存储句柄**不出浏览器面**（暴露面的负向断言）。
 *
 * ── 证据边界（不得外推）────────────────────────────────────────────────────
 * 本文件用**测试替身**充当 core 服务，因此它证明的是「Host 半边的接线与翻译语义」，
 * **不**证明 core 的业务判定、配额计数或持久化。core 侧行为由 `packages/core/tests`
 * 覆盖；两者的组合由真实实例 E2E 覆盖（`scripts/development/verify-web-remote-e2e.mjs`）。
 */

import { Context } from "@deepseek-ai/cordis";
import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";
import { describe, expect, it } from "vitest";
import type { SoloipsCompanyRecord, SoloipsCoreService } from "soloips-core/contracts";

import { SoloipsWebHost, type SoloipsWebCreateCompanyInput } from "../src/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// 测试夹具：真实 cordis 上下文 + 可编程的 core 替身
// ─────────────────────────────────────────────────────────────────────────────

/** core 替身的可编程行为面（每个成员都可由用例改写）。 */
interface CoreStub {
  /** 记录被调用的方法名（用于「只读不产生写」与「未调用即未就绪」类断言）。 */
  readonly calls: string[];
  createCompany: SoloipsCoreService["createCompany"];
  getCompany: SoloipsCoreService["getCompany"];
  getCompanyTree: SoloipsCoreService["getCompanyTree"];
  listDepartments: SoloipsCoreService["listDepartments"];
  listTeams: SoloipsCoreService["listTeams"];
}

/**
 * 建一个**已发布** core 服务的上下文；`published: false` 模拟未就绪。
 *
 * `ctx` 也一并返回：§8 的接收者身份用例需要走**真实的 cordis 服务解析路径**
 * （`ctx.get('soloipsWeb')` 返回 traceable Proxy），那是网关 invoke 的等价形态。
 */
function hostWithCore(options: { readonly published: boolean }): {
  readonly ctx: Context;
  readonly host: SoloipsWebHost;
  readonly core: CoreStub;
} {
  const ctx = new Context();
  const calls: string[] = [];
  const core: CoreStub = {
    calls,
    createCompany: async () => {
      calls.push("createCompany");
      return { status: "committed", result: { companyId: companyId("cmp_created") } };
    },
    getCompany: () => {
      calls.push("getCompany");
      return undefined;
    },
    getCompanyTree: () => {
      calls.push("getCompanyTree");
      return [];
    },
    listDepartments: () => {
      calls.push("listDepartments");
      return [];
    },
    listTeams: () => {
      calls.push("listTeams");
      return [];
    },
  };
  if (options.published) {
    // `ctx.provide` 的第二个实参形状由 `Context` 的声明合并决定（本包已声明
    // `soloipsWeb`）；core 服务键的声明在 core 包内，测试里按名提供。
    ctx.provide("soloipsCore", core as unknown as SoloipsCoreService);
  }
  return { ctx, host: new SoloipsWebHost(ctx), core };
}

/** 造一个形状合法的公司 id（core 的品牌是编译期 phantom，运行时就是字符串）。 */
function companyId(value: string): SoloipsCompanyRecord["id"] {
  return value as SoloipsCompanyRecord["id"];
}

/** 造一个形状合法的 operationId（同上：品牌是编译期 phantom）。 */
function operationId(value: string): SoloipsWebCreateCompanyInput["operationId"] {
  return value as SoloipsWebCreateCompanyInput["operationId"];
}

/** 合法建公司入参。 */
function createInput(operationIdValue: string): SoloipsWebCreateCompanyInput {
  return { operationId: operationId(operationIdValue), name: "甲工作室", type: "enterprise" };
}

// ─────────────────────────────────────────────────────────────────────────────
// §1 合法调用（正例）
// ─────────────────────────────────────────────────────────────────────────────

describe("BE-6a 正例：合法用户 Remote 调用", () => {
  it("createCompany 提交成功并返回 core 的结果（用户面不要求 agent 上下文）", async () => {
    // 〔反例的反例〕本用例**不**提供任何 agent 凭证/调用上下文——只有入参。
    // 若有人给本方法加上「必须 agent 上下文」的前置，这里立即失败。这正是
    // §2.5.1 裁定四要防的冷启动死锁（M-A 的用户确认路径必须可用）。
    const { host, core } = hostWithCore({ published: true });
    const outcome = await host.createCompany(createInput("op-be6a-1"));

    expect(outcome).toEqual({
      status: "committed",
      result: { companyId: "cmp_created" },
    });
    expect(core.calls, "core 的 createCompany 必须被真正调用").toContain("createCompany");
  });

  it("只读四方法返回 ok 并透传 core 的投影", () => {
    const { host, core } = hostWithCore({ published: true });
    core.getCompany = () => {
      core.calls.push("getCompany");
      return {
        id: companyId("cmp_1"),
        accountId: "acct-deployed",
        type: "enterprise",
        name: "甲工作室",
        status: "active",
        createdAt: "2026-09-18T00:00:00.000Z",
      };
    };
    core.getCompanyTree = () => {
      core.calls.push("getCompanyTree");
      return [];
    };
    core.listDepartments = () => {
      core.calls.push("listDepartments");
      return [{ id: "dep_1" as never, companyId: companyId("cmp_1"), name: "创作部" }];
    };

    const company = host.getCompany({ companyId: companyId("cmp_1") });
    expect(company.status).toBe("ok");
    expect(
      company.status === "ok" ? Object.keys(company.company).sort() : [],
      "公司投影必须不含 accountId",
    ).toEqual(["createdAt", "id", "name", "status", "type"]);

    expect(host.getCompanyTree({ companyId: companyId("cmp_1") })).toEqual({
      status: "ok",
      companies: [],
    });
    expect(host.listDepartments({ companyId: companyId("cmp_1") })).toEqual({
      status: "ok",
      departments: [{ id: "dep_1", companyId: "cmp_1", name: "创作部" }],
    });
    expect(host.listTeams({ companyId: companyId("cmp_1") })).toEqual({ status: "ok", teams: [] });
  });

  it("公司投影**键不存在** accountId（不是「值为 undefined」），且其余字段逐字保留", () => {
    // 〔本用例与上一条的分工〕上一条断言键集合恰好相等（防多）；本用例把两件事
    // 分别钉死，且都取**最强判据**：
    //
    //  (a) **键不存在**——判据是 `Object.hasOwn`，不是 `!== undefined`。
    //      两者在线上语义不同：JSON 无 `undefined`，所以「值为 undefined」的键
    //      会被 `JSON.stringify` **丢弃**，但在本进程内它仍是一个可被读到的键
    //      （`'accountId' in view === true`）。用 `!== undefined` 会让「有人
    //      写 `{...record, accountId: undefined}`」这种形态**通过**——那不是
    //      剥离，只是把值抹成 undefined。裁定四要的是「不暴露」，故判据取键存在性。
    //
    //  (b) **其余字段逐字保留**——防「剥多了」：`companyViewOf` 用显式字段列表
    //      重建对象，漏一个字段即编译失败（返回类型标注），但漏掉**可选字段的
    //      条件展开**不会编译失败（`parentCompanyId?` 在 core 记录里可缺省）。
    //      故这里用带 `parentCompanyId` 的记录断言它**确实被带过去**。
    const { host, core } = hostWithCore({ published: true });
    const parentId = companyId("cmp_parent");
    core.getCompany = () => ({
      id: companyId("cmp_child"),
      accountId: "acct-deployed",
      parentCompanyId: parentId,
      type: "subsidiary",
      name: "乙子公司",
      status: "active",
      createdAt: "2026-09-18T12:34:56.789Z",
    });

    const read = host.getCompany({ companyId: companyId("cmp_child") });
    if (read.status !== "ok") throw new Error(`前置失败：期望 ok，实得 ${read.status}`);
    const view = read.company as unknown as Record<string, unknown>;

    expect(Object.hasOwn(view, "accountId"), "accountId 必须**不存在**（而非值为 undefined）").toBe(
      false,
    );
    expect(view["accountId"], "读 accountId 必须得到 undefined").toBeUndefined();
    // 逐字保留：与 core 记录**除 accountId 外**完全一致。用整体相等而不是逐字段
    // 断言，使「悄悄改写某个字段值」也被拦下。
    expect(view).toEqual({
      id: "cmp_child",
      parentCompanyId: "cmp_parent",
      type: "subsidiary",
      name: "乙子公司",
      status: "active",
      createdAt: "2026-09-18T12:34:56.789Z",
    });
  });

  it("公司树投影同样剥离 accountId（两条读路径共用同一出口）", () => {
    // 〔为什么单独测树〕`getCompany` 与 `getCompanyTree` 是**两条**读路径；只测
    // 前者无法排除「后者漏了剥离」。两者共用 `companyViewOf`，本用例把该事实钉住。
    const { host, core } = hostWithCore({ published: true });
    core.getCompanyTree = () => [
      {
        id: companyId("cmp_root"),
        accountId: "acct-deployed",
        type: "enterprise",
        name: "甲工作室",
        status: "active",
        createdAt: "2026-09-18T00:00:00.000Z",
      },
      {
        id: companyId("cmp_leaf"),
        accountId: "acct-deployed",
        parentCompanyId: companyId("cmp_root"),
        type: "subsidiary",
        name: "乙子公司",
        status: "active",
        createdAt: "2026-09-18T00:00:01.000Z",
      },
    ];

    const tree = host.getCompanyTree({ companyId: companyId("cmp_root") });
    if (tree.status !== "ok") throw new Error(`前置失败：期望 ok，实得 ${tree.status}`);
    expect(tree.companies).toHaveLength(2);
    for (const entry of tree.companies) {
      expect(
        Object.hasOwn(entry as unknown as Record<string, unknown>, "accountId"),
        `公司树条目 ${entry.id} 不得含 accountId`,
      ).toBe(false);
    }
    // 顺带钉住「树里两条记录都真的被投影过」——若实现返回空数组，上面的循环会
    // 空转通过（假覆盖）。这里用长度断言兜住。
    expect(tree.companies.map((entry) => entry.id)).toEqual(["cmp_root", "cmp_leaf"]);
  });

  it("getStatus 探针仍可用且返回服务键（与 wire namespace 不同形）", async () => {
    const { host } = hostWithCore({ published: true });
    const status = await host.getStatus({ note: "be6a" });
    expect(status.service).toBe("soloipsWeb");
    expect(status.echo).toBe("be6a");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §2 服务未就绪：必须显式表达，**不得伪装空数据**
// ─────────────────────────────────────────────────────────────────────────────

describe("BE-6a 服务未就绪（core 未发布）", () => {
  it("createCompany 返回 unavailable，且**不**调用任何 core 方法", async () => {
    const { host, core } = hostWithCore({ published: false });
    expect(await host.createCompany(createInput("op-be6a-2"))).toEqual({
      status: "unavailable",
      reason: "core-unavailable",
    });
    expect(core.calls, "未就绪时不得触达 core").toEqual([]);
  });

  it("只读方法返回 unavailable，而**不是**空数组（空数组只能表示「确无数据」）", () => {
    const { host } = hostWithCore({ published: false });
    // 〔本用例的核心断言〕四条读路径都必须是 `unavailable`。若其中任何一条返回
    // `{status:'ok', …: []}`，界面会把「服务没起来」渲染成「这家公司没有部门」——
    // 那正是 §2.5.1 裁定三明禁的「伪装空数据」。
    expect(host.getCompany({ companyId: companyId("cmp_1") })).toEqual({
      status: "unavailable",
      reason: "core-unavailable",
    });
    expect(host.getCompanyTree({ companyId: companyId("cmp_1") })).toEqual({
      status: "unavailable",
      reason: "core-unavailable",
    });
    expect(host.listDepartments({ companyId: companyId("cmp_1") })).toEqual({
      status: "unavailable",
      reason: "core-unavailable",
    });
    expect(host.listTeams({ companyId: companyId("cmp_1") })).toEqual({
      status: "unavailable",
      reason: "core-unavailable",
    });
  });

  it("已发布但形状不符的服务同样按未就绪处理（不把装配错误变成崩溃）", async () => {
    // 模拟「同名键被别的包占用」/「core 版本不匹配」：服务存在但不是本包消费的形状。
    // 不做结构校验的话，这里会以 `core.createCompany is not a function` 崩溃，
    // 把装配错误伪装成运行时故障。
    const ctx = new Context();
    ctx.provide("soloipsCore", { somethingElse: true } as unknown as SoloipsCoreService);
    const host = new SoloipsWebHost(ctx);
    expect(await host.createCompany(createInput("op-be6a-3"))).toEqual({
      status: "unavailable",
      reason: "core-unavailable",
    });
    expect(host.getCompany({ companyId: companyId("cmp_1") })).toEqual({
      status: "unavailable",
      reason: "core-unavailable",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 提交结果三态与配额拒绝：逐字透传，不重编码
// ─────────────────────────────────────────────────────────────────────────────

describe("BE-6a 提交结果语义（replayed / unknown / refused）", () => {
  it("同 operationId 重放返回 replayed 与原结果（Host 不重算、不换 ID）", async () => {
    const { host, core } = hostWithCore({ published: true });
    core.createCompany = async () => ({
      status: "replayed",
      result: { companyId: companyId("cmp_original") },
    });
    expect(await host.createCompany(createInput("op-replay"))).toEqual({
      status: "replayed",
      result: { companyId: "cmp_original" },
    });
  });

  it("未决（pending）返回 unknown——**不**引导换 ID 重做，也不折叠成失败", async () => {
    const { host, core } = hostWithCore({ published: true });
    core.createCompany = async () => ({ status: "unknown" });
    // 〔为什么断言严格等于 `{status:'unknown'}`〕这是 ORG-05 的语义载体：调用方
    // 必须能把它与「失败」区分开（失败可重试，unknown 不可换 ID 重做）。
    // 若本包把它折叠成抛错或 `refused`，界面就会把「结果不可知」渲染成「没成功，
    // 可以再点一次」——那会产生重复公司。
    expect(await host.createCompany(createInput("op-pending"))).toEqual({ status: "unknown" });
  });

  it("配额拒绝逐字透传（含 current/limit 等界面所需业务事实）", async () => {
    const { host, core } = hostWithCore({ published: true });
    core.createCompany = async () => ({
      status: "refused",
      reason: "quota-exceeded",
      resourceType: "companyLimit",
      planCode: "free",
      current: 1,
      limit: 1,
    });
    const outcome = await host.createCompany(createInput("op-quota"));
    expect(outcome).toEqual({
      status: "refused",
      reason: "quota-exceeded",
      resourceType: "companyLimit",
      planCode: "free",
      current: 1,
      limit: 1,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §4 core 失败：稳定码必须过线（否则界面失去 i18n 映射的输入键）
// ─────────────────────────────────────────────────────────────────────────────

describe("BE-6a core 失败翻译（稳定码过线）", () => {
  it("参数无效：core 的 VALIDATION 码以 RemoteError 过线，而不是 gateway/internal", async () => {
    const { host, core } = hostWithCore({ published: true });
    // core 的错误对象形状：`code` 是稳定码、`message` 是中文诊断。
    const coreError = Object.assign(new Error("companyId 形状不合法"), {
      code: "SOLOIPS_CORE_VALIDATION",
    });
    core.createCompany = () => Promise.reject(coreError);

    let caught: unknown;
    try {
      await host.createCompany(createInput("op-invalid"));
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught, "必须抛错而不是静默返回").toBeInstanceOf(RemoteError);
    // 〔为什么码必须逐字保留〕网关对未归类异常折叠为 `gateway/internal`，而界面
    // 的 i18n 表以 `SoloipsCoreErrorCode` 为键（`soloips.error.validation` 等）。
    // 丢掉码会让「参数无效」与「服务器内部错误」在界面上变成同一条文案。
    expect((caught as RemoteError).code).toBe("SOLOIPS_CORE_VALIDATION");
  });

  it("跨根/账户不符：ACCOUNT_MISMATCH 同样过线（不被折叠）", async () => {
    const { host, core } = hostWithCore({ published: true });
    core.createCompany = () =>
      Promise.reject(
        Object.assign(new Error('父公司属于账户 "other"'), {
          code: "SOLOIPS_CORE_ACCOUNT_MISMATCH",
        }),
      );
    await expect(host.createCompany(createInput("op-cross-root"))).rejects.toMatchObject({
      code: "SOLOIPS_CORE_ACCOUNT_MISMATCH",
    });
  });

  it("无稳定码的失败**原样重抛**（本包不吞错、不伪造码）", async () => {
    const { host, core } = hostWithCore({ published: true });
    const raw = new Error("底层介质故障");
    core.getCompany = () => {
      throw raw;
    };
    // 〔为什么不翻译成通用码〕无稳定码说明这不是 core 的契约化失败（可能是编程
    // 错误或介质故障）。给它编一个码会让调用方误以为「可判定的业务结果」。
    let caught: unknown;
    try {
      host.getCompany({ companyId: companyId("cmp_1") });
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBe(raw);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §5 身份分层：accountId 不由入参表达/覆盖
// ─────────────────────────────────────────────────────────────────────────────

describe("BE-6a 身份分层（accountId 不来自入参）", () => {
  it("入参里**没有** accountId 字段：多传的 accountId 到不了 core", async () => {
    // 〔本用例证明的是「不可表达 + 不可达」〕两层机制：
    //  1. 类型层：`SoloipsWebCreateCompanyInput` 不含该字段（本用例用对象字面量
    //     的多余属性检查之外的形态，故下面显式断言传入值未被转发）；
    //  2. 运行期：网关的 `assertExactArguments` 拒绝描述符未声明的字段——那层
    //     在真实 HTTP 路径上生效，由 E2E 覆盖（本文件不经网关，故这里证明的是
    //     第 1 层与「Host 不转发它」）。
    const { host, core } = hostWithCore({ published: true });
    let received: unknown;
    core.createCompany = (input) => {
      received = input;
      return Promise.resolve({ status: "committed", result: { companyId: companyId("cmp_x") } });
    };

    const tampered = {
      ...createInput("op-account"),
      accountId: "acct-attacker",
    } as SoloipsWebCreateCompanyInput;
    await host.createCompany(tampered);

    expect(received, "core 收到的入参必须不含 accountId").not.toHaveProperty("accountId");
    // 同时确认它**确实**把合法字段传下去了（否则上一条断言会因「什么都没传」而
    // 空洞通过——那是假覆盖）。
    expect(received).toMatchObject({ operationId: "op-account", name: "甲工作室" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §6 暴露面边界：不外泄 core 服务对象、close 与存储句柄
// ─────────────────────────────────────────────────────────────────────────────

describe("BE-6a 暴露面边界（§2.5 边界 1）", () => {
  it("Host 服务上**没有** close / reconcileTeams / 写命令以外的 core 方法", () => {
    // 〔负向断言的必要性〕「暴露矩阵只列了六项」若只写在文档里，任何人加一个
    // `@Remote("close")` 都不会有门禁响应——而 §2.5 边界 1 明禁把 domain 生命
    // 周期交给浏览器。本断言把「未暴露」变成可判定的事实。
    const { host } = hostWithCore({ published: true });
    for (const forbidden of [
      "close",
      "reconcileTeams",
      "requestWorkEntry",
      "initializeEmployeeMemory",
      "verifyEmployeeCapability",
      "recordAssemblyEvidence",
      "saveEmployeeDocument",
      "createDepartment",
      "createEmployee",
      "createAppointment",
      "revokeAppointment",
      // team 四命令属 BE-6b，本片不暴露。
      "createTeam",
      "updateTeamFunction",
      "activateTeam",
      "closeTeam",
      // 只读面中本片未纳入最小集的项。
      "listSubsidiaries",
      "getDepartment",
      "getEmployee",
      "getAppointment",
      "listEmployees",
      "listAppointments",
      "getOperation",
      "listPendingOperations",
      "checkOnboarding",
      "listAdministrators",
      "listDocumentVersions",
      "getDocumentVersion",
      "getTeam",
    ]) {
      expect(
        (host as unknown as Record<string, unknown>)[forbidden],
        `不得暴露 ${forbidden}（不在本片最小集内）`,
      ).toBeUndefined();
    }
  });

  it("Host 服务上**没有**工具注册面（裁定二的技术强制）", () => {
    // 〔裁定二的落点〕组织写动作不注册为模型工具，本包连工具注册的入口都不持有。
    // 若有人日后把 `ctx.tools` 接进来并注册 `soloips_company_create`，本断言失败。
    const { host } = hostWithCore({ published: true });
    for (const toolSurface of ["registerTool", "tools", "register", "toolDefinitions"]) {
      expect(
        (host as unknown as Record<string, unknown>)[toolSurface],
        `Host 服务不得携带工具注册面（${toolSurface}）`,
      ).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §7 只读纪律：读路径不产生 operation（结构层证据）
// ─────────────────────────────────────────────────────────────────────────────

describe("BE-6a 只读纪律", () => {
  it("只读四方法只调用 core 的读方法（不触达任何写方法）", () => {
    const { host, core } = hostWithCore({ published: true });
    host.getCompany({ companyId: companyId("cmp_1") });
    host.getCompanyTree({ companyId: companyId("cmp_1") });
    host.listDepartments({ companyId: companyId("cmp_1") });
    host.listTeams({ companyId: companyId("cmp_1") });
    // 替身把每次调用记进 `calls`；只读路径只允许出现这四个名字。写方法（含
    // createCompany）一旦被触达即失败——那会意味着读操作产生了业务写/operation。
    expect([...core.calls].sort()).toEqual([
      "getCompany",
      "getCompanyTree",
      "listDepartments",
      "listTeams",
    ]);
  });

  it("listTeams 的条件展开：缺省键不下传 undefined（exactOptionalPropertyTypes）", () => {
    const { host, core } = hostWithCore({ published: true });
    let options: unknown;
    core.listTeams = (_companyId, received) => {
      options = received;
      return [];
    };
    host.listTeams({ companyId: companyId("cmp_1") });
    // 〔为什么断言「键不存在」而不是「值为 undefined」〕两者在
    // `exactOptionalPropertyTypes` 下是不同形状；下传 `{departmentId: undefined}`
    // 会让 core 侧「给了该键」与「没给该键」的判定出现第三种输入形态。
    expect(options).toEqual({});
  });

  it("listTeams 显式选项逐字透传（不新增判据、不做二次过滤）", () => {
    const { host, core } = hostWithCore({ published: true });
    let options: unknown;
    core.listTeams = (_companyId, received) => {
      options = received;
      return [];
    };
    host.listTeams({
      companyId: companyId("cmp_1"),
      departmentId: "dep_1" as never,
      includeUnusable: true,
    });
    expect(options).toEqual({ departmentId: "dep_1", includeUnusable: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §8 接收者身份：经 Proxy 调用不得崩（BE-6a E2E 红的真实根因）
// ─────────────────────────────────────────────────────────────────────────────

describe("BE-6a 接收者身份（网关经 Proxy 调用）", () => {
  it("五个 @Remote 方法经 cordis 解析出的接收者调用不抛，且真的解析到 core", async () => {
    // ── 本用例防的缺陷（BE-6a E2E 红）────────────────────────────────────────
    //
    // `ctx.get('soloipsWeb')` 返回的**不是**构造时的实例对象，而是 cordis 的
    // traceable Proxy（`@deepseek-ai/cordis` 的 `createTraceable`）。网关的
    // `prepareInvocation` 正是取它作 receiver（`gateway/src/index.ts:602`），
    // 再 `Reflect.get(receiver, method)`（`:615`）与
    // `Reflect.apply(method, receiver, args)`（`:309`）调用；Proxy 的 get trap
    // 把函数包成 `createShadowMethod`，调用时把 `this` 改绑到 `shadow`
    // （`createShadow`）。本用例直接复用这条路径，不另造替身。
    //
    // 于是**方法体内经 `this` 访问私有成员**必然抛：V8 的私有成员访问不做 Proxy
    // 透传，shadow 不是「声明该私有成员的那个对象」。实测（旧实现，Node 24）：
    // 经此路径调用 `createCompany` 抛 `TypeError: Cannot access private method`
    // （E2E 的运行时报 `Receiver must be an instance of class SoloipsWebHost`），
    // 网关的 `rpcFailure` 再把它折叠成 `gateway/internal` 且**不暴露 cause**——
    // 故这条根因只能在本层钉住。五个业务方法全部经旧 `#core()`，故全部炸；
    // `getStatus` 不用私有成员，故它在 E2E 里是通的（这正是判别证据）。
    const { ctx, core } = hostWithCore({ published: true });
    const service = ctx.get("soloipsWeb");
    if (service === undefined) throw new Error("前置失败：ctx.get('soloipsWeb') 必须已发布");

    // 五条路径各调一次：它们都经 core 解析，是旧实现下全炸的五处。
    await expect(service.createCompany(createInput("op-proxy"))).resolves.toEqual({
      status: "committed",
      result: { companyId: "cmp_created" },
    });
    expect(service.getCompany({ companyId: companyId("cmp_1") })).toEqual({ status: "not-found" });
    expect(service.getCompanyTree({ companyId: companyId("cmp_1") })).toEqual({
      status: "ok",
      companies: [],
    });
    expect(service.listDepartments({ companyId: companyId("cmp_1") })).toEqual({
      status: "ok",
      departments: [],
    });
    expect(service.listTeams({ companyId: companyId("cmp_1") })).toEqual({
      status: "ok",
      teams: [],
    });

    // 〔为什么断言业务结果而不是只断言「不抛」〕「不抛」太弱：一个把 core 解析成
    // `undefined` 的实现（构造期缓存、或在错误的上下文里解析）同样不抛，却会静默
    // 返回 `unavailable`——那是 §2.5.1 裁定三明禁的「伪装」形态。上面每条都断言了
    // 真实结果，故 core 必须真的被解析到。
    expect(core.calls, "core 必须真的被调用（Proxy 接收者不得让解析退化）").toContain(
      "createCompany",
    );
  });

  it("裸 Proxy 包装的实例上调用不抛（同一 V8 规则的退化形态）", async () => {
    // 〔为什么与上一条并存〕上一条覆盖 cordis 的**改绑**这一步（生产路径）；
    // 本条覆盖同一 V8 规则的**退化**形态：任何 `new Proxy(instance, …)` 都会让
    // 私有成员访问失败，与 handler 是否改写 `this` 无关。两条一起把「私有成员 +
    // Proxy 接收者」这条组合钉死——只留一条时，另一条的失效模式无人拦。
    const { host } = hostWithCore({ published: true });
    const wrapped = new Proxy(host, {});
    await expect(wrapped.createCompany(createInput("op-bare-proxy"))).resolves.toEqual({
      status: "committed",
      result: { companyId: "cmp_created" },
    });
    expect(wrapped.getCompany({ companyId: companyId("cmp_1") })).toEqual({ status: "not-found" });
  });

  it("core 在**构造之后**才发布时仍能解析到（不得构造期缓存）", async () => {
    // 〔本用例钉住的约束〕core 服务的发布是**异步**的（`packages/core/src/index.ts`
    // 在 `ctx.inject(['soloipsAdapter'], …)` 回调内打开存储后才 `provide`）。
    // 若有人把解析结果在构造期取一次缓存下来，本用例会得到 `unavailable` 而失败。
    // 这条与上面两条互补：它们防「用私有成员」，本条防「提前取一次」——两者是修
    // 这个缺陷时最容易走上的两条错路。
    const { ctx, host, core } = hostWithCore({ published: false });
    ctx.provide("soloipsCore", core as unknown as SoloipsCoreService);

    const service = ctx.get("soloipsWeb");
    if (service === undefined) throw new Error("前置失败：ctx.get('soloipsWeb') 必须已发布");
    await expect(service.createCompany(createInput("op-late-core"))).resolves.toEqual({
      status: "committed",
      result: { companyId: "cmp_created" },
    });
    // 直接调用路径同样必须拿到它（两条路径共用一个解析函数）。
    await expect(host.createCompany(createInput("op-late-core-direct"))).resolves.toEqual({
      status: "committed",
      result: { companyId: "cmp_created" },
    });
  });
});
