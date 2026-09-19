/**
 * SOLOIPS-CORE-QUOTA-TREE-SPEC（BE-5）
 *
 * Free 计划配额校验与公司树规则缺口的**行为**测试。依据：
 *  - `docs/design/data-contract.md` **C-1 配额口径**（M0.1 形态：`planCode` 由部署
 *    配置注入、缺省 `free`、不建表；三层配额表内联为常量；失败返回稳定码且**不产生
 *    任何业务写**）；
 *  - 同文档 **§4.3**（K-1…K-6 计数方案成立的 6 个条件、四类验收、扫表适用边界）；
 *  - 同文档 **§2.6** 公司树规则（T-1…T-6）与 `enterprise` 带父的处置；
 *  - `docs/prds/system-assistant-backend-design-v0.1.md` §2.4（配额执行最小方案）、
 *    §4.1「BE-5 配额最小版」四条验收；
 *  - `docs/prds/organization-full-backend-design-v0.1.md` §6 的 **R-3b**（`subsidiary`
 *    可无父）与 **R-4**（无显式环检测）；
 *  - `docs/design/backend-i18n-design.md` §3（拒绝参数只来自**结构化字段**，不得解析
 *    `message`）。
 *
 * 〔与本片验收条款的对应〕
 *  - ①Free 1/0 判定与诊断参数 → A 组；
 *  - ②同根并发不超限（**可控制调度顺序**）→ B 组；
 *  - ③重放不重复计数 → C 组；
 *  - ④拒绝零污染（介质 deep-equal + 零 pending）→ D 组；
 *  - ⑤树规则 T-1…T-5 + `enterprise` 带父 → E 组；
 *  - ⑥孤儿不靠漏计绕过 → F 组；
 *  - ⑦归档不占配额 / 跨深度口径 / 官方类型 → G 组；
 *  - ⑧失租停写与重启读回（fake 介质；真实 JSON/SQLite 见探针脚本）→ H 组；
 *  - ⑨配置接线（planCode 注入、缺省、非法值）→ I 组。
 *
 * 〔测试风格〕经**公开命令面**搭建状态；只有「模拟存量/损坏介质」的用例才用
 * `fakeMediumTable` 直达介质（沿用 `store.spec.ts` / `team-data.spec.ts` 的范式）。
 *
 * 〔为什么配额用例不复用 `seedOnboardedEmployee`〕该种子只建一家公司；配额用例需要
 * 精确控制公司数量与类型，故本文件自建最小 fixture。
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { SoloipsStoragePort, SoloipsWriterLease } from "soloips-adapter-dsh/contracts";

import type {
  SoloipsCompanyId,
  SoloipsCoreService,
  SoloipsCreateCompanyOutcome,
  SoloipsPlanCode,
} from "../src/contracts";
import { SOLOIPS_PLAN_CODES, SOLOIPS_PLAN_QUOTAS } from "../src/contracts";
import { asOperationId } from "../src/ids";
import { openSoloipsCompanyStore } from "../src/store";
import {
  fakeAdapterEvents,
  fakeMediumTable,
  fakeStoragePort,
  fakeTakeoverLease,
  resetFakeAdapter,
} from "./adapter-fakes";
import { nextSeedOperationId, TEST_ACCOUNT_ID, TEST_OTHER_ACCOUNT_ID } from "./seed";

const ROOT = "/tmp/soloips-quota-tree-root";

/** 介质快照（全部业务表 + 操作台账）：判定「零业务写、零新增 pending」的判据。 */
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

/** 打开 store（缺省 `free`；用例需要更多额度时显式给 planCode）。 */
async function openService(planCode?: SoloipsPlanCode): Promise<SoloipsCoreService> {
  return openSoloipsCompanyStore({
    storage: fakeStoragePort(),
    root: ROOT,
    accountId: TEST_ACCOUNT_ID,
    ...(planCode === undefined ? {} : { planCode }),
  });
}

/** 建一家公司并断言提交成功（用例前置，失败即抛——不静默继续）。 */
async function createCompanyOrThrow(
  service: SoloipsCoreService,
  input: {
    readonly name: string;
    readonly type?: "enterprise" | "subsidiary";
    readonly parentCompanyId?: SoloipsCompanyId;
  },
): Promise<SoloipsCompanyId> {
  const created = await service.createCompany({
    operationId: nextSeedOperationId("company"),
    name: input.name,
    ...(input.type === undefined ? {} : { type: input.type }),
    ...(input.parentCompanyId === undefined ? {} : { parentCompanyId: input.parentCompanyId }),
  });
  if (created.status !== "committed") {
    throw new Error(`前置建公司失败：${JSON.stringify(created)}`);
  }
  return created.result.companyId;
}

/** 介质上现有公司记录数（按 type 过滤；不含归档口径判断，纯计数）。 */
function companyRecordsOfType(type: string): readonly unknown[] {
  return [...fakeMediumTable(ROOT, "company").values()].filter(
    (record) => (record as { type?: string }).type === type,
  );
}

/** 注入一条公司记录（模拟存量/异常介质；绕过命令面）。 */
function injectCompanyRecord(record: {
  readonly id: string;
  readonly type: "platform" | "operation" | "enterprise" | "subsidiary";
  readonly status: "active" | "archived";
  readonly parentCompanyId?: string;
  readonly accountId?: string;
}): void {
  fakeMediumTable(ROOT, "company").set(record.id, {
    id: record.id,
    accountId: record.accountId ?? TEST_ACCOUNT_ID,
    ...(record.parentCompanyId === undefined ? {} : { parentCompanyId: record.parentCompanyId }),
    type: record.type,
    name: `注入记录 ${record.id}`,
    status: record.status,
    createdAt: new Date().toISOString(),
  });
}

beforeEach(() => {
  resetFakeAdapter();
});

/**
 * 注入一条**基线时代（466df63）合法提交**的 `company.create` 操作及其公司记录。
 *
 * 〔为什么必须直达介质，不能经命令面〕本组用例测的是「升级后重放遗留操作」：
 * 基线**允许**的输入（无父 `subsidiary` / 带父 `enterprise` / 官方类型）在 BE-5
 * 之后会被拒——故经**当前**命令面**造不出**这些记录。介质注入是唯一能构造
 * 「旧版本已提交的事实」的手段（与 `team-data.spec.ts` 注入 legacy operation 同法）。
 *
 * 〔为什么 operation 记录要写全字段〕门的重放检测读 `kind`/`status`/`result`：
 * `kind` 必须等于本次调用的 `kind`（否则 `CONFLICT`），`status` 必须为 `committed`
 * 且 `kind` 在本版本词表内（否则 `unknown`），`result` 必须存在（否则
 * `RECORD_INVALID`）。三者齐备才走到「返回 `replayed`」那一步——正是本组用例要
 * 验证的路径。
 */
function injectLegacyCommittedCompany(
  operationId: string,
  record: {
    readonly id: string;
    readonly type: "platform" | "operation" | "enterprise" | "subsidiary";
    readonly parentCompanyId?: string;
  },
): void {
  injectCompanyRecord({
    id: record.id,
    type: record.type,
    status: "active",
    ...(record.parentCompanyId === undefined ? {} : { parentCompanyId: record.parentCompanyId }),
  });
  fakeMediumTable(ROOT, "operation").set(operationId, {
    id: operationId,
    kind: "company.create",
    status: "committed",
    intent: {
      name: `遗留公司 ${record.id}`,
      type: record.type,
      ...(record.parentCompanyId === undefined ? {} : { parentCompanyId: record.parentCompanyId }),
    },
    result: { companyId: record.id },
    schemaVersion: 1,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Free 计划的 1 公司 / 0 子公司判定与诊断参数（验收①）
// ─────────────────────────────────────────────────────────────────────────────

describe("A. Free 计划配额判定（验收①）", () => {
  it("第一个 enterprise 可创建；第二个被拒且带结构化诊断（current/limit/planCode）", async () => {
    const service = await openService();
    const first = await createCompanyOrThrow(service, { name: "第一家公司" });
    expect(service.getCompany(first)).toMatchObject({
      type: "enterprise",
      accountId: TEST_ACCOUNT_ID,
    });

    const before = snapshotMedium();
    const second = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "第二家公司",
    });
    // 〔诊断参数来自结构化字段〕不是解析 message——web 侧据此映射文案
    // （backend-i18n-design §3 / Q-3 实证）。
    expect(second).toEqual({
      status: "refused",
      reason: "quota-exceeded",
      resourceType: "companyLimit",
      planCode: "free",
      current: 1,
      limit: 1,
    });
    // 拒绝零业务写、零新增 pending（验收④在 A 组的第一处落点）。
    expect(snapshotMedium()).toEqual(before);
    expect(fakeMediumTable(ROOT, "operation").size).toBe(1); // 只有第一家公司的操作
    await service.close();
  });

  it("Free 下 subsidiary 恒被拒（limit=0）；有合法父也照拒", async () => {
    const service = await openService();
    const parent = await createCompanyOrThrow(service, { name: "顶层公司" });
    const before = snapshotMedium();
    const refused = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "子公司",
      type: "subsidiary",
      parentCompanyId: parent,
    });
    expect(refused).toEqual({
      status: "refused",
      reason: "quota-exceeded",
      resourceType: "subsidiaryLimit",
      planCode: "free",
      current: 0,
      limit: 0,
    });
    // 零业务写：子公司记录不存在（「被拒」不等于「建了再删」）。
    expect(companyRecordsOfType("subsidiary")).toEqual([]);
    expect(snapshotMedium()).toEqual(before);
    await service.close();
  });

  it("三层配额表与契约 §2.1 逐行一致（内联常量不得漂移）", () => {
    // 〔为什么把数值钉在测试里〕§4.3 的「策略值来源 = 内联常量」使该表成为**唯一**
    // 的策略落点；改一个数字就改变了产品语义（Free 从 1 变 2 是产品变更，不是重构）。
    expect(SOLOIPS_PLAN_QUOTAS).toEqual({
      free: { companyLimit: 1, subsidiaryLimit: 0 },
      pro: { companyLimit: 1, subsidiaryLimit: 3 },
      enterprise: { companyLimit: -1, subsidiaryLimit: -1 },
    });
    expect([...SOLOIPS_PLAN_CODES].sort()).toEqual(["enterprise", "free", "pro"]);
  });

  it("无限制用 -1 表示（不是 Infinity：Infinity 无法 JSON 持久化）", () => {
    for (const plan of SOLOIPS_PLAN_CODES) {
      const quota = SOLOIPS_PLAN_QUOTAS[plan];
      expect(Number.isFinite(quota.companyLimit)).toBe(true);
      expect(Number.isFinite(quota.subsidiaryLimit)).toBe(true);
      expect(quota.companyLimit).not.toBe(Infinity);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. 同根并发（验收②：用可控制调度顺序的测试证明，不是只查代码）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 可控制调度的 storage 端口：在**指定 operationId 的意图落盘之后、公司记录写入之前**
 * 挂起第一次 `assertHeld`。
 *
 * 〔为什么挂在这里〕那正是 §4.3 K-2 要求「锁覆盖计数 → 持久发布全程」的临界窗口：
 * 意图已落、业务记录未落。若判定不在串行槽位内（例如在 `commit` 调用之前先算好
 * 计数），第二个请求会在这一刻读到「0 家」并通过——本挂点把那个窗口**变成可观测的
 * 确定性时刻**，而不是靠 `setTimeout` 撞时机。
 *
 * 实现取「发布点前的那次写权复核」（`#createPublisher` 每次写前调用）：它是门内
 * 每个持久发布点的必经点，且 `fakeAdapterEvents()` 是测试可读的公开观察面。
 */
function gatedStorage(gatedOperationId: string): {
  readonly port: SoloipsStoragePort;
  readonly companyPutReached: Promise<void>;
  releaseCompanyPut(): void;
} {
  const base = fakeStoragePort();
  let armed = true;
  let signalReached!: () => void;
  const companyPutReached = new Promise<void>((resolve) => {
    signalReached = resolve;
  });
  let signalRelease!: () => void;
  const released = new Promise<void>((resolve) => {
    signalRelease = resolve;
  });
  const port: SoloipsStoragePort = {
    ...base,
    async acquireWriterLease(options): Promise<SoloipsWriterLease> {
      const lease = await base.acquireWriterLease(options);
      return {
        ...lease,
        async assertHeld(): Promise<void> {
          await lease.assertHeld();
          if (!armed) return;
          // 该 operationId 的意图已落盘 → 本次 assert 之后的写就是公司记录。
          const intentPersisted = fakeAdapterEvents().some(
            (event) =>
              event.startsWith("write:") && event.includes(`operation:${gatedOperationId}`),
          );
          if (!intentPersisted) return;
          armed = false;
          signalReached();
          await released;
        },
      };
    },
  };
  return { port, companyPutReached, releaseCompanyPut: signalRelease };
}

describe("B. 同根并发创建不超限（验收②）", () => {
  it("并发两个创建：恰好 1 committed + 1 refused；第二个的计数看到第一个的持久事实", async () => {
    // 〔本用例的鉴别力〕若计数在串行槽位之外（先算后提交），两个请求都会读到
    // 「0 家」而各自通过——本用例会看到 2 条 committed。故它是 K-1/K-2 的行为判据，
    // 不是「代码里看起来在门内」的注释断言。
    const gated = gatedStorage("quota-race-a");
    const service = await openSoloipsCompanyStore({
      storage: gated.port,
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    const first = service.createCompany({
      operationId: asOperationId("quota-race-a"),
      name: "并发甲",
    });
    await gated.companyPutReached; // 甲已持有串行槽位，且已过配额判定、意图已落盘。

    const second = service.createCompany({
      operationId: asOperationId("quota-race-b"),
      name: "并发乙",
    });
    // 乙必须等甲的**持久发布**完成才能进入判定（K-2：锁覆盖到 put 完成）——
    // 这是硬依赖（乙的提交排在甲的提交之后），故「等待后仍未结算」是确定性断言。
    const settled = await Promise.race([
      second.then(() => "settled" as const),
      // 〔为什么 setTimeout 回调带花括号〕`resolve(...)` 返回 void；简写形态把它当
      // 返回值传给 `setTimeout`，读起来像「定时器产出这个值」。花括号让「调用是副作用」
      // 显式可见，行为不变（定时器忽略回调返回值）。
      new Promise<"pending">((resolve) =>
        setTimeout(() => {
          resolve("pending");
        }, 10),
      ),
    ]);
    expect(settled).toBe("pending");

    gated.releaseCompanyPut();
    const [a, b] = await Promise.all([first, second]);
    expect(a.status).toBe("committed");
    expect(b).toEqual({
      status: "refused",
      reason: "quota-exceeded",
      resourceType: "companyLimit",
      planCode: "free",
      // current=1 证明乙的计数读到了**甲已落盘**的记录（K-3：当前持久事实）。
      current: 1,
      limit: 1,
    });
    expect(companyRecordsOfType("enterprise")).toHaveLength(1);
    await service.close();
  });

  it("三个并发：1 committed + 2 refused，介质上恰 1 条公司记录", async () => {
    const service = await openService();
    const outcomes: SoloipsCreateCompanyOutcome[] = await Promise.all([
      service.createCompany({ operationId: asOperationId("quota-3-a"), name: "甲" }),
      service.createCompany({ operationId: asOperationId("quota-3-b"), name: "乙" }),
      service.createCompany({ operationId: asOperationId("quota-3-c"), name: "丙" }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "committed")).toHaveLength(1);
    const refused = outcomes.filter((outcome) => outcome.status === "refused");
    expect(refused).toHaveLength(2);
    for (const refusal of refused) {
      // 第二、三个请求看到的 current 都是 1（串行化后逐次重读，不是同一份陈旧快照）。
      expect(refusal).toMatchObject({ resourceType: "companyLimit", current: 1, limit: 1 });
    }
    expect(companyRecordsOfType("enterprise")).toHaveLength(1);
    await service.close();
  });

  it("B4（无计时器构造）：首个提交被扣在槽位内时启动 4 个并发，放行后恰 1 committed + 4 refused", async () => {
    // 〔为什么再给一条：本条不含任何 sleep/计时器〕上面两条并发用例的「乙仍在等待」
    // 断言依赖一个 10ms 的竞速窗口（观测「尚未结算」）。本条把并发构造改成**纯事件
    // 驱动**：用 gatedStorage 把**第一个**提交扣在公司记录的 put 之前（此时它已持有
    // 串行槽位、已过配额判定、意图已落盘），再启动 4 个请求，然后放行。
    // 全程只 await Promise，不依赖任何时序假设——「4 个请求同时看到 0 家」的实现会
    // 产出 5 条 committed，故本用例对「计数在串行槽位之外」有鉴别力。
    const gated = gatedStorage("quota-hold-first");
    const service = await openSoloipsCompanyStore({
      storage: gated.port,
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    const held = service.createCompany({
      operationId: asOperationId("quota-hold-first"),
      name: "被扣住的甲",
    });
    await gated.companyPutReached;

    // 其余 4 个请求：同根、不同 operationId。它们全部排在甲之后。
    const others = ["b", "c", "d", "e"].map((suffix) =>
      service.createCompany({
        operationId: asOperationId(`quota-hold-${suffix}`),
        name: `并发 ${suffix}`,
      }),
    );
    gated.releaseCompanyPut();
    const [first, ...rest] = await Promise.all([held, ...others]);

    expect(first.status).toBe("committed");
    // 4 个后来者**全部**被拒，且每一个都读到 current=1（不是同一份陈旧快照）。
    expect(rest).toHaveLength(4);
    for (const outcome of rest) {
      expect(outcome).toMatchObject({
        status: "refused",
        reason: "quota-exceeded",
        resourceType: "companyLimit",
        planCode: "free",
        current: 1,
        limit: 1,
      });
    }
    // 介质是最终判据：恰 1 条公司记录（超发会在这里现形，与返回值无关）。
    expect(companyRecordsOfType("enterprise")).toHaveLength(1);
    // 且被拒的 4 次**零新增未决意图**：operation 表恰 1 条（甲自己的）。
    expect(fakeMediumTable(ROOT, "operation").size).toBe(1);
    await service.close();
  });

  it("并发混入重放：同 operationId 的重放不参与竞争、不重复计数", async () => {
    const service = await openService();
    const [first, replay, third] = await Promise.all([
      service.createCompany({ operationId: asOperationId("quota-mix-a"), name: "甲" }),
      service.createCompany({ operationId: asOperationId("quota-mix-a"), name: "甲" }),
      service.createCompany({ operationId: asOperationId("quota-mix-b"), name: "乙" }),
    ]);
    const committed = [first, replay].filter((outcome) => outcome.status === "committed");
    expect(committed).toHaveLength(1);
    const replayed = [first, replay].find((outcome) => outcome.status === "replayed");
    expect(replayed?.status).toBe("replayed");
    expect(third).toMatchObject({ status: "refused", current: 1, limit: 1 });
    expect(companyRecordsOfType("enterprise")).toHaveLength(1);
    await service.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. 重放不重复计数（验收③ / K-4）
// ─────────────────────────────────────────────────────────────────────────────

describe("C. 重放识别先于配额判定（验收③ / K-4）", () => {
  it("同 operationId 重放返回原结果：不重新计数、不建第二家公司", async () => {
    const service = await openService();
    const operationId = asOperationId("quota-replay-1");
    const first = await service.createCompany({ operationId, name: "幂等公司" });
    if (first.status !== "committed") throw new Error("前置建公司失败");

    const replay = await service.createCompany({ operationId, name: "幂等公司" });
    expect(replay).toMatchObject({ status: "replayed" });
    expect(replay.status === "replayed" && replay.result.companyId).toBe(first.result.companyId);
    expect(companyRecordsOfType("enterprise")).toHaveLength(1);
    await service.close();
  });

  it("配额**已耗尽**后重放同 operationId 仍返回原结果（不得被误判为超限）", async () => {
    // 〔本用例钉住 K-4 的实质〕判定依据会被成功的执行本身改变：第一次成功后
    // 「Free 已用满」成立。若配额判定先于重放检测，重放会被拒——幂等性破坏。
    const service = await openService();
    const operationId = asOperationId("quota-replay-exhausted");
    const first = await service.createCompany({ operationId, name: "用满额度" });
    if (first.status !== "committed") throw new Error("前置建公司失败");

    const replay = await service.createCompany({ operationId, name: "用满额度" });
    expect(replay.status).toBe("replayed");
    expect(replay.status === "replayed" && replay.result.companyId).toBe(first.result.companyId);

    // 反向对照：换新 ID 就**必须**被拒（证明上面的 replayed 来自重放识别，
    // 不是配额判定被整体跳过）。
    const fresh = await service.createCompany({
      operationId: asOperationId("quota-replay-fresh"),
      name: "新 ID",
    });
    expect(fresh).toMatchObject({ status: "refused", reason: "quota-exceeded", current: 1 });
    await service.close();
  });

  it("未决（pending）同 operationId 返回 unknown：不计数、不落新写", async () => {
    const service = await openService();
    const operationId = asOperationId("quota-pending-1");
    fakeMediumTable(ROOT, "operation").set(operationId, {
      id: operationId,
      kind: "company.create",
      status: "pending",
      intent: { name: "未决公司", type: "enterprise" },
      schemaVersion: 1,
    });
    const before = snapshotMedium();
    const outcome = await service.createCompany({ operationId, name: "未决公司" });
    // 「结果未知」优先于任何业务判定（ORG-05：不得换 ID 重做）。
    expect(outcome).toEqual({ status: "unknown" });
    expect(snapshotMedium()).toEqual(before);
    await service.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. 可判定拒绝零污染（验收④ / K-6）
// ─────────────────────────────────────────────────────────────────────────────

describe("D. 拒绝零业务写、零新增 pending（验收④）", () => {
  it("拒绝后介质逐字不变、operation 表 size 不变、同一 operationId 可再次使用", async () => {
    const service = await openService();
    await createCompanyOrThrow(service, { name: "用满额度" });
    const before = snapshotMedium();
    const operationCount = fakeMediumTable(ROOT, "operation").size;

    const refusedId = asOperationId("quota-refuse-reuse");
    const refused = await service.createCompany({ operationId: refusedId, name: "被拒公司" });
    expect(refused.status).toBe("refused");
    expect(snapshotMedium()).toEqual(before);
    expect(fakeMediumTable(ROOT, "operation").size).toBe(operationCount);
    // 拒绝**不占用** operationId：同 ID 再次尝试仍得到配额拒绝（而不是 unknown）。
    // 若拒绝发生在意图落盘之后，这里会变成 unknown——把「什么都没发生」变成
    // 「有一条查不清的操作」。
    const again = await service.createCompany({ operationId: refusedId, name: "被拒公司" });
    expect(again.status).toBe("refused");
    expect(fakeMediumTable(ROOT, "operation").size).toBe(operationCount);
    await service.close();
  });

  it("拒绝是**返回值**不是异常：调用方不需要 catch，且不阻塞后续提交", async () => {
    const service = await openService();
    await createCompanyOrThrow(service, { name: "用满额度" });
    // 不 rejects：拒绝以值返回（与 requestWorkEntry 的 refused 同构）。
    const refused = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "被拒",
    });
    expect(refused.status).toBe("refused");
    // 后续提交照常：门的串行链不被拒绝污染。
    const other = await service.createEmployee({
      operationId: nextSeedOperationId("employee"),
      displayName: "拒绝之后的员工",
    });
    expect(other.status).toBe("committed");
    await service.close();
  });

  it("拒绝不写任何公司记录、也不产生部门/任职等连带写（只有被拒的那一条路径）", async () => {
    const service = await openService();
    const parent = await createCompanyOrThrow(service, { name: "顶层" });
    await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "被拒子公司",
      type: "subsidiary",
      parentCompanyId: parent,
    });
    expect(service.listSubsidiaries(parent)).toEqual([]);
    expect(service.getCompanyTree(parent)).toHaveLength(1); // 只有自己
    await service.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. 公司树规则（验收⑤ / §2.6 T-1…T-5 + enterprise 带父）
// ─────────────────────────────────────────────────────────────────────────────

describe("E. 公司树规则（验收⑤ / §2.6）", () => {
  it("E1：subsidiary 无父 → VALIDATION（R-3b：不得产生孤儿子公司）", async () => {
    const service = await openService("enterprise");
    const before = snapshotMedium();
    await expect(
      service.createCompany({
        operationId: nextSeedOperationId("company"),
        name: "无父子公司",
        type: "subsidiary",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
    expect(snapshotMedium()).toEqual(before);
    await service.close();
  });

  it("E2：enterprise 带父 → VALIDATION（§2.6 写死；本片新增）", async () => {
    const service = await openService("enterprise");
    const parent = await createCompanyOrThrow(service, { name: "父公司" });
    const before = snapshotMedium();
    let caught: unknown;
    try {
      await service.createCompany({
        operationId: nextSeedOperationId("company"),
        name: "带父企业",
        parentCompanyId: parent,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
    // 消息给出可行动替代（改用 subsidiary）——诊断不是「非法输入」四个字。
    expect((caught as Error).message).toContain("subsidiary");
    // 〔为什么与 E1 分开钉〕E1（无父 subsidiary）与 E2（带父 enterprise）是两条
    // 独立判定；只断言其中一条会让「只实现了一半」的实现全绿。
    expect(snapshotMedium()).toEqual(before);
    await service.close();
  });

  it("E3：subsidiary + 有效父 → committed（阴性对照：规则不得把合法路径也拒掉）", async () => {
    const service = await openService("enterprise");
    const parent = await createCompanyOrThrow(service, { name: "父公司" });
    const child = await createCompanyOrThrow(service, {
      name: "子公司",
      type: "subsidiary",
      parentCompanyId: parent,
    });
    expect(service.getCompany(child)).toMatchObject({
      type: "subsidiary",
      parentCompanyId: parent,
      accountId: TEST_ACCOUNT_ID,
    });
    expect(service.listSubsidiaries(parent).map((record) => record.id)).toEqual([child]);
    await service.close();
  });

  it("E4：父不存在 → PRECONDITION（T-1）", async () => {
    const service = await openService("enterprise");
    const before = snapshotMedium();
    await expect(
      service.createCompany({
        operationId: nextSeedOperationId("company"),
        name: "孤儿",
        type: "subsidiary",
        parentCompanyId: "cmp_missing_parent" as SoloipsCompanyId,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
    // 〔拒绝零副作用（含 operation 表）〕T-1 是**读介质**判定：若它被放到意图落盘
    // 之后，这里会多出一条 pending——把「什么都没发生」变成「有一条查不清的操作」。
    expect(snapshotMedium()).toEqual(before);
    await service.close();
  });

  it("E5：父类型为 operation → VALIDATION（T-2；platform/enterprise/subsidiary 可作父）", async () => {
    const service = await openService("enterprise");
    injectCompanyRecord({ id: "cmp_operation_parent", type: "operation", status: "active" });
    const before = snapshotMedium();
    await expect(
      service.createCompany({
        operationId: nextSeedOperationId("company"),
        name: "运营子公司之下",
        type: "subsidiary",
        parentCompanyId: "cmp_operation_parent" as SoloipsCompanyId,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
    expect(snapshotMedium()).toEqual(before);

    // 阴性对照：platform 与 subsidiary 可作父（T-2 只禁 operation）。
    injectCompanyRecord({ id: "cmp_platform_parent", type: "platform", status: "active" });
    const underPlatform = await createCompanyOrThrow(service, {
      name: "平台之下",
      type: "subsidiary",
      parentCompanyId: "cmp_platform_parent" as SoloipsCompanyId,
    });
    expect(service.getCompany(underPlatform)).toMatchObject({
      parentCompanyId: "cmp_platform_parent",
    });
    const underSubsidiary = await createCompanyOrThrow(service, {
      name: "子公司之下（嵌套）",
      type: "subsidiary",
      parentCompanyId: underPlatform,
    });
    expect(service.getCompany(underSubsidiary)).toMatchObject({ parentCompanyId: underPlatform });
    await service.close();
  });

  it("E6：父状态为 archived → PRECONDITION（T-4，本片新增）", async () => {
    const service = await openService("enterprise");
    injectCompanyRecord({ id: "cmp_archived_parent", type: "enterprise", status: "archived" });
    const before = snapshotMedium();
    let caught: unknown;
    try {
      await service.createCompany({
        operationId: nextSeedOperationId("company"),
        name: "归档公司之下",
        type: "subsidiary",
        parentCompanyId: "cmp_archived_parent" as SoloipsCompanyId,
      });
    } catch (error) {
      caught = error;
    }
    // `PRECONDITION`（不是 VALIDATION）：输入合法，是**被引用记录的状态**不允许。
    expect(caught).toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
    expect((caught as Error).message).toContain("archived");
    expect(snapshotMedium()).toEqual(before);
    await service.close();
  });

  it("E7：深度上限 10 层（第 10 层节点可建、其下不可再建）", async () => {
    const service = await openService("enterprise");
    let parent = await createCompanyOrThrow(service, { name: "根" });
    // 根深度 0 → 依次建到深度 9（共 10 个节点）。
    for (let depth = 1; depth <= 9; depth += 1) {
      parent = await createCompanyOrThrow(service, {
        name: `第 ${depth} 层`,
        type: "subsidiary",
        parentCompanyId: parent,
      });
    }
    const before = snapshotMedium();
    await expect(
      service.createCompany({
        operationId: nextSeedOperationId("company"),
        name: "第 10 层",
        type: "subsidiary",
        parentCompanyId: parent,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
    // 〔拒绝零副作用〕深度超限是**读介质**判定（遍历祖先链）：同样不得留下 pending。
    expect(snapshotMedium()).toEqual(before);
    await service.close();
  });

  it("E8：祖先链成环 → VALIDATION 且消息点明环（R-4：不再静默返回错误深度）", async () => {
    const service = await openService("enterprise");
    // 注入互为父子的两条记录（模拟异常介质；命令面造不出环——新 id 不能成为
    // 既有记录的祖先）。
    injectCompanyRecord({
      id: "cmp_cycle_a",
      type: "subsidiary",
      status: "active",
      parentCompanyId: "cmp_cycle_b",
    });
    injectCompanyRecord({
      id: "cmp_cycle_b",
      type: "subsidiary",
      status: "active",
      parentCompanyId: "cmp_cycle_a",
    });
    let caught: unknown;
    try {
      await service.createCompany({
        operationId: nextSeedOperationId("company"),
        name: "环上建公司",
        type: "subsidiary",
        parentCompanyId: "cmp_cycle_a" as SoloipsCompanyId,
      });
    } catch (error) {
      caught = error;
    }
    // 〔为什么必须报错而不是返回一个深度〕成环时「深度」不可判定；旧实现以
    // `depth < MAX_TREE_DEPTH` 作循环守卫，会提前退出并返回**错误深度**，
    // 使深度规则在异常数据上静默失效（R-4）。
    expect(caught).toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
    expect((caught as Error).message).toContain("环");
    // 〔零副作用 + 对照〕环检测失败同样不留 pending；对照：注入的两条环记录仍在
    // 介质上（本片不自动修复异常数据，只拒绝在其上继续生长）。
    expect(fakeMediumTable(ROOT, "operation").size).toBe(0);
    expect(fakeMediumTable(ROOT, "company").has("cmp_cycle_a")).toBe(true);
    expect(fakeMediumTable(ROOT, "company").has("cmp_cycle_b")).toBe(true);
    await service.close();
  });

  it("E8b：祖先链断裂（父 id 存在但记录缺失）→ VALIDATION（既有行为，改写后逐字保持）", async () => {
    // 〔为什么在 BE-5 补钉这一条〕本片把 `#computeDepth` 的循环守卫从
    // 「深度上限」改为「显式环检测」——该函数被整体重写。既有契约行为（T-1 之外
    // 的「链上某环缺失」路径）**必须逐字保持**：它报 `VALIDATION` 且消息指出
    // 缺失的父 id。本用例是该重写的回归锚点（改前无任何用例覆盖此路径——
    // 全仓检索「祖先链断裂」零命中，属本片发现的测试盲区）。
    const service = await openService("enterprise");
    // 注入一条父 id 指向不存在记录的子公司。
    injectCompanyRecord({
      id: "cmp_broken_chain",
      type: "subsidiary",
      status: "active",
      parentCompanyId: "cmp_gone_missing",
    });
    let caught: unknown;
    try {
      await service.createCompany({
        operationId: nextSeedOperationId("company"),
        name: "断链之下",
        type: "subsidiary",
        parentCompanyId: "cmp_broken_chain" as SoloipsCompanyId,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
    expect((caught as Error).message).toContain("祖先链断裂");
    expect((caught as Error).message).toContain("cmp_gone_missing");
    await service.close();
  });

  it("E9：父属于别的账户 → PRECONDITION（T-5；引用点上的独立判定）", async () => {
    // 〔为什么注入而不是经命令面〕命令面写出的记录恒为部署账户（accountId 由
    // 构造期绑定注入），无法造出异账户父——只能模拟存量/外部写入的介质。
    const service = await openService("enterprise");
    injectCompanyRecord({
      id: "cmp_foreign_parent",
      type: "enterprise",
      status: "active",
      accountId: TEST_OTHER_ACCOUNT_ID,
    });
    const before = snapshotMedium();
    await expect(
      service.createCompany({
        operationId: nextSeedOperationId("company"),
        name: "跨账户子公司",
        type: "subsidiary",
        parentCompanyId: "cmp_foreign_parent" as SoloipsCompanyId,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
    expect(snapshotMedium()).toEqual(before);
    await service.close();
  });

  it("E10：父形状非法 → VALIDATION（JS 调用方不受类型保护）", async () => {
    const service = await openService("enterprise");
    const before = snapshotMedium();
    await expect(
      service.createCompany({
        operationId: nextSeedOperationId("company"),
        name: "形状非法父",
        type: "subsidiary",
        parentCompanyId: "not-a-company-id" as SoloipsCompanyId,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
    // 形状检查在门外，但同样零副作用（门外抛错发生在任何写之前）。
    expect(snapshotMedium()).toEqual(before);
    await service.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E-l. 跨版本重放回归（B-1：新增判定不得让遗留操作的重放退化）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 〔本组用例的来由〕BE-5 初版把树规则判定留在提交门**之外**，并注释辩解「M0.1
 * 没有命令可改变 company 的 status/type，故与重放检测的先后不构成可观察差异」。
 * 该辩解**被 QA 的跨版本升级探针推翻**：新增判定本身就会破坏重放——基线允许的
 * 输入（无父 subsidiary / 带父 enterprise / 官方类型）在升级后会被拒，而门外的
 * 判定先于重放检测执行，使这些**已提交**操作的重放从 `replayed` 退化为抛错。
 *
 * 判据（`commit-gate.ts` 的顺序契约）：**凡新增判定、凡读介质判定**都必须在
 * `precondition` 内（重放检测之后）。本组用例是该判据的行为锚点。
 *
 * 〔为什么这组用例有鉴别力〕把任一判定移回门外（见变异自检 M17/M18）→ 本组
 * 用例立刻变红。
 */
describe("E-l. 跨版本重放：基线合法提交的遗留操作不得因新增判定而退化（B-1）", () => {
  it("E-l1：遗留「无父 subsidiary」重放 → replayed（不得抛错）", async () => {
    // 基线（466df63）**不检查** `subsidiary` 是否有父（R-3b 登记为缺口），
    // 故介质上可能存在这类合法提交的记录。升级后重放必须仍返回原结果。
    const service = await openService("enterprise");
    const operationId = "legacy-op-subsidiary-no-parent";
    injectLegacyCommittedCompany(operationId, { id: "cmp_legacy_orphan", type: "subsidiary" });

    const replay = await service.createCompany({
      operationId: asOperationId(operationId),
      name: "遗留公司 cmp_legacy_orphan",
      type: "subsidiary",
    });
    expect(replay.status).toBe("replayed");
    expect(replay.status === "replayed" && replay.result.companyId).toBe("cmp_legacy_orphan");
    await service.close();
  });

  it("E-l2：遗留「enterprise 带父」重放 → replayed（不得抛错）", async () => {
    const service = await openService("enterprise");
    const parent = await createCompanyOrThrow(service, { name: "父公司" });
    const operationId = "legacy-op-enterprise-with-parent";
    injectLegacyCommittedCompany(operationId, {
      id: "cmp_legacy_nested_enterprise",
      type: "enterprise",
      parentCompanyId: parent,
    });

    const replay = await service.createCompany({
      operationId: asOperationId(operationId),
      name: "遗留公司 cmp_legacy_nested_enterprise",
      parentCompanyId: parent,
    });
    expect(replay.status).toBe("replayed");
    expect(replay.status === "replayed" && replay.result.companyId).toBe(
      "cmp_legacy_nested_enterprise",
    );
    await service.close();
  });

  it("E-l3：遗留「官方类型（platform）」重放 → replayed（基线无该闸门）", async () => {
    // 基线的 `createCompany` **没有**官方类型闸门（A-3 属 BE-5 新增），故
    // `platform` 记录也可能是遗留合法提交。重放必须返回原结果。
    const service = await openService("enterprise");
    const operationId = "legacy-op-platform";
    injectLegacyCommittedCompany(operationId, { id: "cmp_legacy_platform", type: "platform" });

    const replay = await service.createCompany({
      operationId: asOperationId(operationId),
      name: "遗留公司 cmp_legacy_platform",
      type: "platform",
    });
    expect(replay.status).toBe("replayed");
    expect(replay.status === "replayed" && replay.result.companyId).toBe("cmp_legacy_platform");
    await service.close();
  });

  it("E-l4：遗留操作的父**后来被归档** → 重放仍 replayed（判定依据变化不影响幂等）", async () => {
    // 〔与 E-l2 的区别〕这里父是**合法 active 公司**，遗留操作也是合法的
    // `subsidiary`（基线允许）——但父在重放之前被归档。若 T-4 在门外，重放会
    // 撞上「父状态非 active」而抛错；在 `precondition` 内则先命中重放分支。
    // 这条钉住的是「判定依据会被成功的执行之外的因素改变」这一性质。
    const service = await openService("enterprise");
    const parent = await createCompanyOrThrow(service, { name: "父公司" });
    const operationId = "legacy-op-subsidiary-archived-parent";
    injectLegacyCommittedCompany(operationId, {
      id: "cmp_legacy_under_archived",
      type: "subsidiary",
      parentCompanyId: parent,
    });
    // 直达介质把父改为 archived（模拟归档；本片无归档命令，与 T-4 用例同法）。
    const parentRecord = fakeMediumTable(ROOT, "company").get(parent) as Record<string, unknown>;
    fakeMediumTable(ROOT, "company").set(parent, { ...parentRecord, status: "archived" });

    const replay = await service.createCompany({
      operationId: asOperationId(operationId),
      name: "遗留公司 cmp_legacy_under_archived",
      type: "subsidiary",
      parentCompanyId: parent,
    });
    expect(replay.status).toBe("replayed");
    await service.close();
  });

  it("E-l5：反向——新增场景（父已归档后**新建**子公司）仍必须拒（规则未被削弱）", async () => {
    // 〔为什么必须有这条〕把判定移进 `precondition` 的**风险**是「规则被绕过」：
    // 若重放分支错误地吞掉了判定，新建路径也会被放过。本用例证明 T-4 对**新**
    // operationId 仍然生效（重放检测只命中同 ID 的已提交记录，不命中新 ID）。
    const service = await openService("enterprise");
    const parent = await createCompanyOrThrow(service, { name: "将被归档的父" });
    const parentRecord = fakeMediumTable(ROOT, "company").get(parent) as Record<string, unknown>;
    fakeMediumTable(ROOT, "company").set(parent, { ...parentRecord, status: "archived" });

    await expect(
      service.createCompany({
        operationId: nextSeedOperationId("company"),
        name: "归档父之下的新子公司",
        type: "subsidiary",
        parentCompanyId: parent,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_PRECONDITION" });
    await service.close();
  });

  it("E-l6：反向——新 ID 建「无父 subsidiary」/「带父 enterprise」/官方类型仍被拒", async () => {
    // 〔形状规则未被削弱〕三条新增判定对**新** operationId 全部生效。
    const service = await openService("enterprise");
    const parent = await createCompanyOrThrow(service, { name: "父公司" });

    await expect(
      service.createCompany({
        operationId: nextSeedOperationId("company"),
        name: "新无父子公司",
        type: "subsidiary",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });

    await expect(
      service.createCompany({
        operationId: nextSeedOperationId("company"),
        name: "新带父企业",
        parentCompanyId: parent,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });

    for (const type of ["platform", "operation"] as const) {
      await expect(
        service.createCompany({
          operationId: nextSeedOperationId("company"),
          name: `新官方 ${type}`,
          type,
        }),
      ).rejects.toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
    }
    await service.close();
  });

  it("E-l7：遗留重放**零副作用**：不新增公司记录、operation 表 size 不变", async () => {
    // 重放是**读**：不得写任何东西（也不得因判定时机变化而留下痕迹）。
    const service = await openService("enterprise");
    const operationId = "legacy-op-replay-no-side-effect";
    injectLegacyCommittedCompany(operationId, { id: "cmp_legacy_pure", type: "subsidiary" });
    const before = snapshotMedium();

    const replay = await service.createCompany({
      operationId: asOperationId(operationId),
      name: "遗留公司 cmp_legacy_pure",
      type: "subsidiary",
    });
    expect(replay.status).toBe("replayed");
    expect(snapshotMedium()).toEqual(before);
    await service.close();
  });

  it("E-l8：遗留**未决**（pending）同 ID → unknown（不得被新判定抢先拒成抛错）", async () => {
    // 〔与重放同类的时机问题〕未决记录走门的 `unknown` 分支——它同样在
    // `precondition` **之前**。若新增判定留在门外，未决记录会先撞上判定抛错，
    // 把「结果未知、不得换 ID 重做」（ORG-05）变成「输入非法」。
    const service = await openService("enterprise");
    const operationId = asOperationId("legacy-op-pending-no-parent");
    fakeMediumTable(ROOT, "operation").set(operationId, {
      id: operationId,
      kind: "company.create",
      status: "pending",
      intent: { name: "未决遗留公司", type: "subsidiary" },
      schemaVersion: 1,
    });
    const before = snapshotMedium();

    const outcome = await service.createCompany({
      operationId,
      name: "未决遗留公司",
      type: "subsidiary",
    });
    expect(outcome).toEqual({ status: "unknown" });
    expect(snapshotMedium()).toEqual(before);
    await service.close();
  });
});

describe("F. 孤儿记录照常计入配额（验收⑥ / §2.6 T-6）", () => {
  it("父缺失的 subsidiary 照常占额度：漏计即绕过", async () => {
    const service = await openService("pro"); // 1 公司 / 3 子公司
    const enterprise = await createCompanyOrThrow(service, { name: "顶层公司" });
    // 注入 3 条孤儿子公司（父 id 在介质上不存在）。
    for (let index = 1; index <= 3; index += 1) {
      injectCompanyRecord({
        id: `cmp_orphan_${index}`,
        type: "subsidiary",
        status: "active",
        parentCompanyId: "cmp_missing_parent",
      });
    }
    const refused = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "第四条子公司",
      type: "subsidiary",
      parentCompanyId: enterprise,
    });
    // 若计数按「可达子树」而非「按 type 全表」，这里会放行 → 形成绕过。
    expect(refused).toEqual({
      status: "refused",
      reason: "quota-exceeded",
      resourceType: "subsidiaryLimit",
      planCode: "pro",
      current: 3,
      limit: 3,
    });
    await service.close();
  });

  it("孤儿不被读面静默当成顶层公司（读回问题由读面显式登记，不靠计数宽容掩盖）", async () => {
    const service = await openService("pro");
    const enterprise = await createCompanyOrThrow(service, { name: "顶层公司" });
    injectCompanyRecord({
      id: "cmp_orphan_read",
      type: "subsidiary",
      status: "active",
      parentCompanyId: "cmp_missing_parent",
    });
    // 树读面从给定根 DFS：孤儿不在结果集里（**不**被当作顶层返回）。
    const tree = service.getCompanyTree(enterprise);
    expect(tree.map((record) => record.id)).toEqual([enterprise]);
    expect(service.listSubsidiaries(enterprise)).toEqual([]);
    // 但它在配额口径里照常存在（上一条用例证明）——两个判据不互相掩盖。
    expect(companyRecordsOfType("subsidiary")).toHaveLength(1);
    await service.close();
  });

  it("孤儿占额度后，归档它即释放额度（显式操作，非读取路径自动修复）", async () => {
    const service = await openService("pro");
    const enterprise = await createCompanyOrThrow(service, { name: "顶层公司" });
    injectCompanyRecord({
      id: "cmp_orphan_archived",
      type: "subsidiary",
      status: "archived",
      parentCompanyId: "cmp_missing_parent",
    });
    // 归档的孤儿不占额度（K-5 的 `status='active'` 口径），故第一条子公司可建。
    const first = await createCompanyOrThrow(service, {
      name: "第一条子公司",
      type: "subsidiary",
      parentCompanyId: enterprise,
    });
    expect(service.getCompany(first)).toMatchObject({ type: "subsidiary" });
    await service.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. 归档、跨深度口径与官方类型（验收⑦）
// ─────────────────────────────────────────────────────────────────────────────

describe("G. 归档不占配额 / 跨深度口径 / 官方类型（验收⑦）", () => {
  it("G1：archived 公司不占配额（Free 下归档一条后仍可建一家）", async () => {
    const service = await openService(); // free
    injectCompanyRecord({ id: "cmp_archived_1", type: "enterprise", status: "archived" });
    const created = await createCompanyOrThrow(service, { name: "活跃公司" });
    expect(service.getCompany(created)).toMatchObject({ status: "active" });
    // 再建一家即被拒：current=1（归档那条没被算进去）。
    const refused = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "第二家活跃公司",
    });
    expect(refused).toMatchObject({ status: "refused", current: 1, limit: 1 });
    await service.close();
  });

  it("G2：subsidiary 按**总数**计（不论深度）：三层嵌套用满 3 个即拒", async () => {
    const service = await openService("pro");
    const root = await createCompanyOrThrow(service, { name: "根" });
    const first = await createCompanyOrThrow(service, {
      name: "一层",
      type: "subsidiary",
      parentCompanyId: root,
    });
    const second = await createCompanyOrThrow(service, {
      name: "二层",
      type: "subsidiary",
      parentCompanyId: first,
    });
    const third = await createCompanyOrThrow(service, {
      name: "三层",
      type: "subsidiary",
      parentCompanyId: second,
    });
    expect(third).toBeDefined();
    // 第四家：挂在**根**下（第一层）也必须被拒——口径是总数，不是「第一层数量」。
    const refused = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "第四家",
      type: "subsidiary",
      parentCompanyId: root,
    });
    expect(refused).toEqual({
      status: "refused",
      reason: "quota-exceeded",
      resourceType: "subsidiaryLimit",
      planCode: "pro",
      current: 3,
      limit: 3,
    });
    await service.close();
  });

  it("G3：普通入口**显式拒绝** platform/operation（§3.2 A-3；不是配额拒绝）", async () => {
    const service = await openService("enterprise");
    for (const type of ["platform", "operation"] as const) {
      const before = snapshotMedium();
      let caught: unknown;
      try {
        await service.createCompany({
          operationId: nextSeedOperationId("company"),
          name: `官方 ${type}`,
          type,
        });
      } catch (error) {
        caught = error;
      }
      // 〔为什么是抛错而不是拒绝载荷〕「本入口不提供该动作」是输入不允许（VALIDATION），
      // 与「额度用满」是两类不同情形，不得共用通道（§4.3 K-6）。
      expect(caught).toMatchObject({ code: "SOLOIPS_CORE_VALIDATION" });
      expect((caught as Error).message).toContain("官方");
      expect(snapshotMedium()).toEqual(before);
    }
    await service.close();
  });

  it("G4：platform/operation 记录**不占**用户配额（与 G3 的禁止分别验证）", async () => {
    const service = await openService("pro");
    // 注入官方公司记录（模拟存量：官方账户初始化不属 S0，但介质上可能有）。
    injectCompanyRecord({ id: "cmp_platform_seed", type: "platform", status: "active" });
    injectCompanyRecord({ id: "cmp_operation_seed", type: "operation", status: "active" });
    // ① 不占 companyLimit：Free 额度是 1，官方记录不消耗它。
    const enterprise = await createCompanyOrThrow(service, { name: "用户顶层公司" });
    // ② 不占 subsidiaryLimit：pro 的 3 个额度仍完整可用。
    const first = await createCompanyOrThrow(service, {
      name: "子公司一",
      type: "subsidiary",
      parentCompanyId: enterprise,
    });
    const second = await createCompanyOrThrow(service, {
      name: "子公司二",
      type: "subsidiary",
      parentCompanyId: enterprise,
    });
    const third = await createCompanyOrThrow(service, {
      name: "子公司三",
      type: "subsidiary",
      parentCompanyId: enterprise,
    });
    expect([first, second, third]).toHaveLength(3);
    const refused = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "子公司四",
      type: "subsidiary",
      parentCompanyId: enterprise,
    });
    // current=3（不含 platform/operation 两条官方记录）——这是「不占配额」的
    // 可观察判据，而不是只看代码分支。
    expect(refused).toMatchObject({ status: "refused", current: 3, limit: 3 });
    await service.close();
  });

  it("G5：计数按**本账户**过滤——异账户记录不占本账户额度（K-5 的 accountId 口径）", async () => {
    // 〔本条来自变异自检的实证缺口〕M5（删掉 `record.accountId !== this.#accountId`
    // 过滤）在初版套件下**存活**——即当时没有任何用例区分「按账户计数」与
    // 「全表计数」。原因是注入的异账户记录都是 `platform`/`operation`/`archived`，
    // 被 type/status 过滤先挡掉了。本条注入一条**异账户 + enterprise + active** 的
    // 记录（三个过滤条件中只剩 accountId 能挡住它），使该过滤成为载荷性的。
    //
    // 语义依据：§3.1「一个业务存储根只绑定一个账户」使「按 accountId 过滤」在
    // 单账户根下看似恒等，但 K-5 把该过滤**写死**为计数口径的一部分——数据根绑定
    // 是打开时的整根校验，而计数口径是**判定点**的独立事实（与 T-5 同款：
    // 引用点/判定点上的独立判定，不依赖全局前提）。
    const service = await openService("free");
    injectCompanyRecord({
      id: "cmp_foreign_active",
      type: "enterprise",
      status: "active",
      accountId: TEST_OTHER_ACCOUNT_ID,
    });
    // ① 异账户的 active enterprise 不占本账户的 companyLimit：第一家仍可建。
    const created = await createCompanyOrThrow(service, { name: "本账户公司" });
    expect(service.getCompany(created)).toMatchObject({ accountId: TEST_ACCOUNT_ID });
    // ② 第二家被拒，且 current=1（**不**含那条异账户记录——否则 current 会是 2）。
    const refused = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "本账户第二家",
    });
    expect(refused).toEqual({
      status: "refused",
      reason: "quota-exceeded",
      resourceType: "companyLimit",
      planCode: "free",
      current: 1,
      limit: 1,
    });
    await service.close();
  });

  it("G6：计数按**类型**过滤——enterprise 不占 subsidiaryLimit（反之亦然）", async () => {
    // 〔本条钉住 K-5 的 type 口径〕与 G5 同款：注入一条 active 的 enterprise 后，
    // subsidiaryLimit 的计数不得把它算进去。pro 的 subsidiaryLimit=3，若计数忽略
    // type，则第一条 enterprise 会让 current 从 0 变 1（本条会看到 current=1）。
    const service = await openService("pro");
    const root = await createCompanyOrThrow(service, { name: "顶层" });
    const child = await createCompanyOrThrow(service, {
      name: "子公司一",
      type: "subsidiary",
      parentCompanyId: root,
    });
    const second = await createCompanyOrThrow(service, {
      name: "子公司二",
      type: "subsidiary",
      parentCompanyId: root,
    });
    const third = await createCompanyOrThrow(service, {
      name: "子公司三",
      type: "subsidiary",
      parentCompanyId: root,
    });
    expect([child, second, third]).toHaveLength(3);
    const refused = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "子公司四",
      type: "subsidiary",
      parentCompanyId: root,
    });
    // current=3 而非 4：顶层 enterprise 没有混进子公司计数。
    expect(refused).toEqual({
      status: "refused",
      reason: "quota-exceeded",
      resourceType: "subsidiaryLimit",
      planCode: "pro",
      current: 3,
      limit: 3,
    });
    await service.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. 失租停写与重启读回（验收⑧：fake 介质半边；真实 JSON/SQLite 见探针）
// ─────────────────────────────────────────────────────────────────────────────

describe("H. 失租停写与重启读回（验收⑧）", () => {
  it("H1：失租后建公司被拒（LEASE_NOT_HELD），介质零变化", async () => {
    // 用无限制计划：配额拒绝发生在任何写之前、且**不触达写权**，故要让失权成为
    // 可观察的失败，必须让本次创建通过配额（否则测到的是配额路径）。
    const service = await openService("enterprise");
    await createCompanyOrThrow(service, { name: "失权前的公司" });
    const before = snapshotMedium();
    fakeTakeoverLease(ROOT); // 另一进程取得新代际
    await expect(
      service.createCompany({
        operationId: nextSeedOperationId("company"),
        name: "失权后的公司",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_LEASE_NOT_HELD" });
    expect(snapshotMedium()).toEqual(before);
    await service.close();
  });

  it("H2：配额拒绝不依赖写权（失租后仍按配额拒绝，不把拒绝升级成写失败）", async () => {
    // 〔为什么单列一条〕拒绝是**读判定**：它在意图落盘之前返回，不触达 publisher，
    // 故失权时它仍是「可判定的业务拒绝」而不是 `LEASE_*` 失败。两类失败语义不得
    // 互相冒充（§4.3 K-6）。
    const service = await openService(); // free
    await createCompanyOrThrow(service, { name: "用满额度" });
    fakeTakeoverLease(ROOT);
    const refused = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "失权时的新公司",
    });
    expect(refused).toMatchObject({ status: "refused", reason: "quota-exceeded" });
    await service.close();
  });

  it("H3：关闭 → 同根重开 → 计数读回一致（额度仍按持久事实判定）", async () => {
    const first = await openService();
    const operationId = asOperationId("quota-restart-1");
    const created = await first.createCompany({ operationId, name: "重启前的公司" });
    if (created.status !== "committed") throw new Error("前置建公司失败");
    await first.close();

    const second = await openService();
    // ① 新 ID 仍被拒，且 current 来自**介质上的**记录（不是内存计数器）。
    const refused = await second.createCompany({
      operationId: asOperationId("quota-restart-2"),
      name: "重启后的公司",
    });
    expect(refused).toEqual({
      status: "refused",
      reason: "quota-exceeded",
      resourceType: "companyLimit",
      planCode: "free",
      current: 1,
      limit: 1,
    });
    // ② 同 operationId 重放仍返回原结果（重启不改变幂等语义，K-4）。
    const replay = await second.createCompany({ operationId, name: "重启前的公司" });
    expect(replay.status).toBe("replayed");
    expect(replay.status === "replayed" && replay.result.companyId).toBe(created.result.companyId);
    await second.close();
  });

  it("H4：计划码不随重启漂移（同根重开缺省仍按 free 判定）", async () => {
    const first = await openService("free");
    await createCompanyOrThrow(first, { name: "Free 公司" });
    await first.close();
    const second = await openService(); // 不给 planCode → 缺省 free
    const refused = await second.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "重启后第二家",
    });
    expect(refused).toMatchObject({ status: "refused", planCode: "free", current: 1, limit: 1 });
    await second.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I. 配置接线（planCode 注入、缺省与非法值）
// ─────────────────────────────────────────────────────────────────────────────

describe("I. planCode 配置接线", () => {
  it("I1：缺省即 free（最严格计划）——不传 planCode 时 Free 规则生效", async () => {
    const service = await openService();
    await createCompanyOrThrow(service, { name: "缺省计划下的第一家" });
    const refused = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "缺省计划下的第二家",
    });
    expect(refused).toMatchObject({ planCode: "free", current: 1, limit: 1 });
    await service.close();
  });

  it("I2：非法 planCode → CONFIG_INVALID（不发布服务；不得静默按 free 运行）", async () => {
    // 受控断言：模拟 JS/部署层传入的非法字符串（TS 调用方不受类型保护）。
    const bogus = "gold" as unknown as SoloipsPlanCode;
    await expect(
      openSoloipsCompanyStore({
        storage: fakeStoragePort(),
        root: ROOT,
        accountId: TEST_ACCOUNT_ID,
        planCode: bogus,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_CONFIG_INVALID" });
  });

  it("I3：pro 计划 = 1 公司 / 3 子公司（第 4 个子公司被拒）", async () => {
    const service = await openService("pro");
    const enterprise = await createCompanyOrThrow(service, { name: "顶层" });
    for (let index = 1; index <= 3; index += 1) {
      await createCompanyOrThrow(service, {
        name: `子公司 ${index}`,
        type: "subsidiary",
        parentCompanyId: enterprise,
      });
    }
    const refused = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "子公司 4",
      type: "subsidiary",
      parentCompanyId: enterprise,
    });
    expect(refused).toMatchObject({ status: "refused", current: 3, limit: 3, planCode: "pro" });
    await service.close();
  });

  it("I4：enterprise 计划 = 无限制（-1）：建多家公司与子公司均通过", async () => {
    const service = await openService("enterprise");
    const first = await createCompanyOrThrow(service, { name: "公司一" });
    const second = await createCompanyOrThrow(service, { name: "公司二" });
    const third = await createCompanyOrThrow(service, {
      name: "子公司",
      type: "subsidiary",
      parentCompanyId: first,
    });
    expect([first, second, third]).toHaveLength(3);
    await service.close();
  });

  it("I5：业务命令面不承载 planCode（类型层断言：调用方不得自选配额）", () => {
    // 与 account-binding.spec.ts 的同类断言同款：`SoloipsCreateCompanyInput` 若长出
    // planCode，下面的条件类型解析为 false（编译期由 tsc -p tsconfig.tests.json 求值）。
    type CreateCompanyInput = Parameters<SoloipsCoreService["createCompany"]>[0];
    type Assert<T extends true> = T;
    type HasNoPlanCode = Assert<"planCode" extends keyof CreateCompanyInput ? false : true>;
    const noPlanCode: HasNoPlanCode = true;
    expect(noPlanCode).toBe(true);
  });
});
