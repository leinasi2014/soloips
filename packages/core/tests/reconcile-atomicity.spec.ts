/**
 * SOLOIPS-CORE-RECONCILE-ATOMICITY-SPEC（F-01，2026-09-18 外审返工）
 *
 * `reconcileTeams` 的**扫描结论**与**实际写入**之间必须原子。依据：
 *  - `docs/design/data-contract.md` §2.1.1 **P-7**（`archived` 是终态、无出边）
 *    与 **P-8**（悬挂处置只标记不修复）；
 *  - 同节 **P-10.5 / P-10.6**（本切片修订：槽位内重判）。
 *
 * ── 缺陷（本文件是它的反例）────────────────────────────────────────────────
 * 修复前的 `#reconcileOne` 是「无条件 `update(→inactive)`」：它不重核
 * `current.status`，也不重核当前组长引用是否仍失效。于是在
 * 「扫描完成 → 写入生效」之间的 await 窗口里插入一次**正常的、经提交门、持写权**
 * 的 `closeTeam`（提交为 `archived`）之后，reconcile 会把 `archived` 覆盖成
 * `inactive`——**P-7 的归档终态被绕门写入破坏**。这不是「假不可用」类可恢复代价：
 * `archived` 没有出边、`activateTeam` 对 archived 抛 PRECONDITION，被改回
 * `inactive` 后该团队**可被再次激活**，即终态约束实际失效。
 *
 * ── 修法（P-10.6）──────────────────────────────────────────────────────────
 * 把判定移进**介质写链的槽位内**（`table.update` 的 `revise` 回调）：
 *  - 槽位内重判 `current.status === "active"`；
 *  - 槽位内重判 `#evaluateLeadReference(current).valid === false`（仍失效才标）；
 *  - 判定不成立即**中止本次写**（回调抛出私有信号 → 端口不调用后端写，零介质写），
 *    `markedInactive` 不报告该 id。
 *
 * 原子性依据（已核到宿主实现，不是推断）：`@deepseek-ai/dsh-storage-domain` 的
 * `DomainImpl` 对**整个 domain**（全部表共用）维护唯一写链 `chain`（`lib/index.js`
 * L120），每次 `put`/`update`/`delete` 经 `enqueue(job)` 排入该链（L221-226）；
 * `KvTableImpl.update` 在槽位内**同步**执行 `fn(records.get(key))`（L281），
 * 成功后才 `await unit.putRecord(...)`（L282）。故「重判 + 写入」与提交门的每次
 * 发布占**同一串行边界**，本地无第二个提交可插入；跨进程由 writer lease 排除
 * （`#reconcileOne` 写前的 `assertHeld` 仍是必要条件）。
 *
 * ── 观察面：后端写次数，不是 fake 的事件字符串 ─────────────────────────────
 * `adapter-fakes.ts` 的 `fakeTable.update` 在调用 `revise` **之前**就 push
 * `write-update:` 事件（`adapter-fakes.ts:263-273`），与宿主语义**相反**（宿主是
 * 「`fn` 同步成功后才 `putRecord`」）。因此事件流不能作为「是否真的落盘」的观察面：
 * 按它断言会把「判定中止」与「真实写」看成同一件事；且事件文本的分隔符是 `:`
 * （`/team:` + key），用 `/team/` + key 过滤恒不命中（恒真断言）。
 * 本文件改用**宿主语义的介质替身**（`mediumProbe`）直接计后端写次数：
 * `fn` 抛错 ⇒ 不落盘、不计数。
 *
 * ── 各用例钉住的形态（对照 P-10.6.5 的回归保护要求）─────────────────────────
 *  - 「窗口内归档已提交」：钉住「槽位外判定 + 无条件 update」与「只重判 status」
 *    （后者经「槽位内重判不成立时零后端写」的写点计数转红）；
 *  - 「窗口内组长引用被修复」：钉住「只重判 status、不重判引用」；
 *  - 「竞争归档**在飞**」：钉住「槽位外 `get` 重读 + 无条件 update」——该形态的
 *    重读发生在归档落盘**之前**（读到旧内存态），故仍会覆盖；既有「竞争提交完全
 *    完成后才放行」的构造对该形态**不具鉴别力**（两种实现在那里行为相同）；
 *  - 「中止路径后端写 0 次」：钉住「返回 `current` 不变」的替代修法（它仍会走一次
 *    内容相同的真实写：后端 IO + `domain/changed`）；同用例内的 `updateCalls`
 *    自证断言同时钉住「槽位内丢 `status` 重判」（那时写点计数会多一次）；
 *  - 「健康 active 团队不进写路径」：钉住扫描侧的候选筛选被去掉的形态（端到端结果
 *    相同，差别只在多出的写尝试上）；
 *  - 「介质写失败必须冒泡」：钉住 `#reconcileOne` 的 catch 不得无条件吞掉后端故障。
 */

import { beforeEach, describe, expect, it } from "vitest";

import type {
  SoloipsDomain,
  SoloipsDomainFacility,
  SoloipsDomainSpec,
  SoloipsKvTable,
  SoloipsStoragePort,
  SoloipsStorageStack,
  SoloipsStorageStackOptions,
} from "soloips-adapter-dsh/contracts";

import type { SoloipsCoreService, SoloipsTeamId, SoloipsTeamRecord } from "../src/contracts";
import { SOLOIPS_COMPANY_DOMAIN_SPEC } from "../src/domain";
import { openSoloipsCompanyStore } from "../src/store";
import {
  FakeAdapterError,
  fakeMediumTable,
  fakeStoragePort,
  resetFakeAdapter,
} from "./adapter-fakes";
import { nextSeedOperationId, TEST_ACCOUNT_ID } from "./seed";

const ROOT = "/tmp/soloips-reconcile-atomicity-root";

// ─────────────────────────────────────────────────────────────────────────────
// 介质探针：宿主语义的 domain 替身 + 后端写计数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 写权 barrier：`arm()` 之后拦截**第一次**写权复核并挂起，直到 `release()`。
 * 之后的写权复核一律直通（`hitFlag`），保证只暂停一次、不影响窗口内的正常提交。
 *
 * 为什么拦在写权复核上：`reconcileTeams` 的流程是「**同步**扫完 →
 * `for (…) await #reconcileOne(id)`」，而 `#reconcileOne` 的第一个 await 是
 * `lease.assertHeld()`。因此「拦在本次 reconcile 的第一次写权复核上」精确等于
 * 「停在扫描结论已定、写入未发生」的那一瞬——窗口的开合由测试显式控制，
 * 与调度顺序、团队数量 N、微任务预算都无关。
 */
interface LeaseBarrier {
  /** 已到达被拦的写权复核（用于自证「确实停在目标路径上」）。 */
  readonly atBarrier: Promise<void>;
  arm(): void;
  release(): void;
  hit(): boolean;
}

/** 探针与替身表之间的窄回报面（替身只回报三件事：入链、写前检查点、落盘）。 */
interface ProbeTap {
  /** `update` 的**入链点**（同步发起；与槽位内执行时机无关）。 */
  onUpdateCall(table: string): void;
  /** 后端写之前的检查点：可挂起（hold）或以注入错误失败（fail）。 */
  beforeWrite(table: string): Promise<void>;
  /** 后端写成功落盘。 */
  onWritten(table: string): void;
}

interface MediumProbe {
  readonly port: SoloipsStoragePort;
  /** `table` 上**成功落盘**的后端写次数（宿主 `unit.putRecord` 成功次数）。 */
  backendWrites(table: string): number;
  /** `table` 上 `update` 的入链点调用次数。 */
  updateCalls(table: string): number;
  /** 等待 `table` 的第 `count` 次 `update` 入链（用于把竞争写与 reconcile 的写点对齐）。 */
  waitForUpdateCalls(table: string, count: number): Promise<void>;
  /** 挂起 `table` 的下一次后端写；`started` 在该写点到达时 resolve（此时尚未落盘）。 */
  holdNextWrite(table: string): { readonly started: Promise<void>; readonly release: () => void };
  /** 让 `table` 的下一次后端写以 `error` 失败（不落盘、不计数）。 */
  failNextWrite(table: string, error: unknown): void;
  readonly barrier: LeaseBarrier;
}

function mediumProbe(): MediumProbe {
  const base = fakeStoragePort();
  const writes = new Map<string, number>();
  const updateCallCounts = new Map<string, number>();
  const updateCallWaiters: { table: string; count: number; resolve: () => void }[] = [];
  let hold: { table: string; started: () => void; gate: Promise<void> } | undefined;
  let failure: { table: string; error: unknown } | undefined;

  const tap: ProbeTap = {
    onUpdateCall(table) {
      const next = (updateCallCounts.get(table) ?? 0) + 1;
      updateCallCounts.set(table, next);
      for (let index = updateCallWaiters.length - 1; index >= 0; index -= 1) {
        const waiter = updateCallWaiters[index];
        if (waiter === undefined || waiter.table !== table || waiter.count > next) continue;
        updateCallWaiters.splice(index, 1);
        waiter.resolve();
      }
    },
    async beforeWrite(table) {
      // 故障注入优先于挂起：一次注入只消费一次，且**不**落盘、**不**计数。
      const pending = failure;
      if (pending !== undefined && pending.table === table) {
        failure = undefined;
        throw pending.error;
      }
      const blocked = hold;
      if (blocked !== undefined && blocked.table === table) {
        hold = undefined; // 只挂起一次：后续写不再被拦
        blocked.started();
        await blocked.gate;
      }
    },
    onWritten(table) {
      writes.set(table, (writes.get(table) ?? 0) + 1);
    },
  };

  let armed = false;
  let hitFlag = false;
  let releaseBarrier!: () => void;
  const barrierGate = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  let reachedBarrier!: () => void;
  const atBarrier = new Promise<void>((resolve) => {
    reachedBarrier = resolve;
  });

  const port: SoloipsStoragePort = {
    async acquireWriterLease(options: { readonly root: string }) {
      const lease = await base.acquireWriterLease(options);
      return {
        generation: lease.generation,
        storageId: lease.storageId,
        async assertHeld(): Promise<void> {
          if (armed && !hitFlag) {
            hitFlag = true;
            reachedBarrier();
            await barrierGate;
          }
          return lease.assertHeld();
        },
        dispose: () => lease.dispose(),
      };
    },
    async createStack(options: SoloipsStorageStackOptions): Promise<SoloipsStorageStack> {
      const stack = await base.createStack(options);
      return {
        ...stack,
        facility: {
          async open<S extends SoloipsDomainSpec>(spec: S): Promise<SoloipsDomain<S>> {
            return chainedDomain(await stack.facility.open(spec), tap);
          },
          closeAll: () => stack.facility.closeAll(),
        },
      };
    },
    requireFacility: (facility: SoloipsDomainFacility | undefined) =>
      base.requireFacility(facility),
  };

  return {
    port,
    backendWrites: (table) => writes.get(table) ?? 0,
    updateCalls: (table) => updateCallCounts.get(table) ?? 0,
    waitForUpdateCalls: (table, count) =>
      new Promise<void>((resolve) => {
        if ((updateCallCounts.get(table) ?? 0) >= count) {
          resolve();
          return;
        }
        updateCallWaiters.push({ table, count, resolve });
      }),
    holdNextWrite(table) {
      let started!: () => void;
      const startedPromise = new Promise<void>((resolve) => {
        started = resolve;
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      hold = { table, started, gate };
      return { started: startedPromise, release };
    },
    failNextWrite(table, error) {
      failure = { table, error };
    },
    barrier: {
      atBarrier,
      arm: () => {
        armed = true;
      },
      release: () => releaseBarrier(),
      hit: () => hitFlag,
    },
  };
}

/**
 * 给 domain 的每张表套上**宿主的写链语义**（`dsh-storage-domain/lib/index.js`
 * L120 / L221-226 / L278-287）：
 *  - 整个 domain（全部表共用）一条 `chain`，每次 put/update/delete 经 `enqueue`
 *    排队——这是「reconcile 的槽位内重判与竞争提交不可交错」的机制面；
 *  - `update`：槽位内同步执行 `revise`（L281）→ 后端写（此处插入探针检查点，
 *    可挂起或注入失败）→ 落盘（L282）→ 计数；
 *  - `revise` 抛错 ⇒ **不**调用后端写（零介质写）。
 */
function chainedDomain<S extends SoloipsDomainSpec>(
  domain: SoloipsDomain<S>,
  tap: ProbeTap,
): SoloipsDomain<S> {
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const result = tail.then(job);
    // 链尾只用于排序：失败不阻塞后续排队（与宿主 `chain = result.then(noop, noop)` 同款）。
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  return {
    ...domain,
    table: <N extends keyof S["tables"] & string>(name: N) =>
      chainedTable(String(name), domain.table(name), enqueue, tap),
  };
}

function chainedTable<K extends string, V>(
  tableName: string,
  table: SoloipsKvTable<K, V>,
  enqueue: <T>(job: () => Promise<T>) => Promise<T>,
  tap: ProbeTap,
): SoloipsKvTable<K, V> {
  return {
    get: (key) => table.get(key),
    entries: () => table.entries(),
    keys: () => table.keys(),
    get size() {
      return table.size;
    },
    put: (key, value) =>
      enqueue(async () => {
        await tap.beforeWrite(tableName);
        await table.put(key, value);
        tap.onWritten(tableName);
      }),
    delete: (key) =>
      enqueue(async () => {
        await tap.beforeWrite(tableName);
        const existed = await table.delete(key);
        tap.onWritten(tableName);
        return existed;
      }),
    update: (key, revise) => {
      // 入链点在**调用时**同步记录：它晚于「槽位外重读」，早于「槽位内重判」。
      tap.onUpdateCall(tableName);
      return enqueue(async () => {
        const current = table.get(key);
        if (current === undefined) {
          throw new FakeAdapterError("missing-key", `${tableName}/${key} 不存在`);
        }
        const next = revise(current); // 宿主 L281：槽位内同步执行
        await tap.beforeWrite(tableName);
        await table.put(key, next);
        tap.onWritten(tableName);
        return next;
      });
    },
  };
}

let service: SoloipsCoreService;

beforeEach(async () => {
  resetFakeAdapter();
  service = await openSoloipsCompanyStore({
    storage: fakeStoragePort(),
    root: ROOT,
    accountId: TEST_ACCOUNT_ID,
  });
});

interface Base {
  readonly companyId: string;
  readonly departmentId: string;
  readonly employeeId: string;
}

async function seedBase(): Promise<Base> {
  const company = await service.createCompany({
    operationId: nextSeedOperationId("company"),
    name: "原子性测试公司",
  });
  if (company.status !== "committed") throw new Error("建公司失败");
  const department = await service.createDepartment({
    operationId: nextSeedOperationId("department"),
    companyId: company.result.companyId,
    name: "创作部",
  });
  if (department.status !== "committed") throw new Error("建部门失败");
  const employee = await service.createEmployee({
    operationId: nextSeedOperationId("employee"),
    displayName: "员工",
  });
  if (employee.status !== "committed") throw new Error("建员工失败");
  return {
    companyId: company.result.companyId,
    departmentId: department.result.departmentId,
    employeeId: employee.result.employeeId,
  };
}

/**
 * 造出「`active` 且组长引用悬挂」的团队——`reconcileTeams` 的待处理条件。
 *
 * 〔为什么直达介质删任职，而不是 `revokeAppointment`〕后者会**联动**把团队置为
 * `inactive`（P-6），那是正常路径，不是 reconcile 存在的理由。reconcile 覆盖的是
 * 联动覆盖不到的两类（`src/store.ts` 的 P-8 段）：① 撤职发生在路径之外；
 * ② 引用悬挂（崩溃残留）。这里造 ②——P-8 的字面场景。
 *
 * @returns 团队 id 与其组长任职 id（任职记录**已被删除**）。
 */
async function seedActiveWithDanglingLead(
  base: Base,
): Promise<{ teamId: SoloipsTeamId; leadAppointmentId: string }> {
  const created = await service.createTeam({
    operationId: nextSeedOperationId("team-create"),
    companyId: base.companyId as never,
    departmentId: base.departmentId as never,
    name: "分镜小组",
    function: "负责分镜绘制",
  });
  if (created.status !== "committed") throw new Error("建团队失败");
  const teamId = created.result.teamId;

  const appointment = await service.createAppointment({
    operationId: nextSeedOperationId("appointment"),
    employeeId: base.employeeId as never,
    scope: { kind: "team", companyId: base.companyId as never, teamId },
    role: "team_lead",
  });
  if (appointment.status !== "committed") throw new Error("建任职失败");

  const activated = await service.activateTeam({
    operationId: nextSeedOperationId("team-activate"),
    teamId,
    leadAppointmentId: appointment.result.appointmentId,
  });
  if (activated.status !== "committed") throw new Error("激活失败");

  fakeMediumTable(ROOT, "appointment").delete(appointment.result.appointmentId);
  return { teamId, leadAppointmentId: String(appointment.result.appointmentId) };
}

function storedTeam(teamId: SoloipsTeamId): SoloipsTeamRecord {
  const raw = fakeMediumTable(ROOT, "team").get(teamId);
  if (raw === undefined) throw new Error(`介质上没有团队 ${teamId}`);
  return raw as SoloipsTeamRecord;
}

/** 用探针端口另开一个 store（同 ROOT，介质共享）作为本次 reconcile 的执行者。 */
async function openWriter(probe: MediumProbe): Promise<SoloipsCoreService> {
  return openSoloipsCompanyStore({
    storage: probe.port,
    root: ROOT,
    accountId: TEST_ACCOUNT_ID,
  });
}

/** 直接经探针端口打开 core 的 domain（**探针自证**用；不经 store，故无租约参与）。 */
async function openProbeDomain(
  probe: MediumProbe,
): Promise<SoloipsDomain<typeof SOLOIPS_COMPANY_DOMAIN_SPEC>> {
  const stack = await probe.port.createStack({ root: ROOT });
  const facility = probe.port.requireFacility(stack.facility);
  return facility.open(SOLOIPS_COMPANY_DOMAIN_SPEC);
}

describe("F-01 reconcileTeams 与正常提交的排他性", () => {
  it("窗口内归档已提交 → reconcile 不得把 archived 改回 inactive（P-7 终态）", async () => {
    const base = await seedBase();
    const { teamId } = await seedActiveWithDanglingLead(base);
    expect(storedTeam(teamId).status).toBe("active");

    const probe = mediumProbe();
    const writer = await openWriter(probe);
    probe.barrier.arm();
    const reconcilePromise = writer.reconcileTeams();
    await probe.barrier.atBarrier;
    // 自证：确实停在「扫描结论已定、写入未发生」处（否则本用例是假绿）。
    expect(probe.barrier.hit()).toBe(true);

    // 窗口内插入一次完全正常、经提交门、持写权的归档提交。
    const closed = await writer.closeTeam({
      operationId: nextSeedOperationId("team-close"),
      teamId,
    });
    expect(closed.status).toBe("committed");
    expect(storedTeam(teamId).status).toBe("archived");

    const writesBefore = probe.backendWrites("team");
    const callsBefore = probe.updateCalls("team");
    probe.barrier.release();
    const result = await reconcilePromise;

    // 归档终态必须保持；且不得把它报告为「本次标记」。
    expect(storedTeam(teamId).status).toBe("archived");
    expect(result.markedInactive).toEqual([]);
    // 放行后**零后端写**；但 reconcile 确实到达了写点（自证不是「没跑到」）。
    expect(probe.backendWrites("team")).toBe(writesBefore);
    expect(probe.updateCalls("team")).toBe(callsBefore + 1);
    await writer.close();
  });

  it("窗口内组长引用被修复 → 不得按扫描时的旧结论标记（判定须覆盖引用，不只是状态）", async () => {
    const base = await seedBase();
    const { teamId, leadAppointmentId } = await seedActiveWithDanglingLead(base);

    const probe = mediumProbe();
    const writer = await openWriter(probe);
    probe.barrier.arm();
    const reconcilePromise = writer.reconcileTeams();
    await probe.barrier.atBarrier;
    expect(probe.barrier.hit()).toBe(true);

    // 窗口内：组长引用被修复（外部/恢复流程补回任职记录——P-8 覆盖的正是
    // 「引用悬挂」这类崩溃残留，修复它不经 team 表的正常命令面，故直达介质）。
    const original = { ...(fakeMediumTable(ROOT, "appointment").get(leadAppointmentId) as object) };
    fakeMediumTable(ROOT, "appointment").set(leadAppointmentId, {
      ...original,
      id: leadAppointmentId,
      employeeId: base.employeeId,
      scope: { kind: "team", companyId: base.companyId, teamId },
      role: "team_lead",
      requiredCapabilities: [],
      generation: 1,
      status: "active",
    });
    // 修复后读面已认为它可用。
    expect(writer.getTeam(teamId)?.usable).toBe(true);

    const writesBefore = probe.backendWrites("team");
    probe.barrier.release();
    const result = await reconcilePromise;

    // 差分意义：只重判状态的实现会在这里把它标成 inactive（本用例转红）。
    expect(storedTeam(teamId).status).toBe("active");
    expect(result.markedInactive).toEqual([]);
    expect(probe.backendWrites("team")).toBe(writesBefore);
    await writer.close();
  });

  it("反向对照：无并发插入时同一路径仍正常标记（后端写恰好 1 次）", async () => {
    const base = await seedBase();
    const { teamId } = await seedActiveWithDanglingLead(base);

    const probe = mediumProbe();
    const writer = await openWriter(probe);
    const result = await writer.reconcileTeams();

    expect(result.scanned).toBe(1);
    expect(result.markedInactive).toEqual([teamId]);
    expect(storedTeam(teamId).status).toBe("inactive");
    // 正常标记路径：团队表后端写恰好 1 次（探针不是「永不计数」）。
    expect(probe.backendWrites("team")).toBe(1);
    // 只标记、不修复（P-8.3）：任职表零写。
    expect(probe.backendWrites("appointment")).toBe(0);
    expect(storedTeam(teamId).leadAppointmentId).toBeDefined();
    await writer.close();
  });

  it("健康 active 团队不进写路径（扫描只是候选筛选，不产生写点）", async () => {
    // 〔本条钉住什么〕扫描侧的 `#isConvergeTarget` 过滤是**候选筛选**：组长引用有效的
    // 团队不进入写循环，因此**不产生写点**（无 `update` 入链、无后端写）。若去掉该
    // 过滤、让全部 `active` 团队都进写循环，端到端结果与"不报该 id"仍相同（槽位内
    // 重判会逐个中止）——差别只在**多出的写尝试**上，故必须用探针观察写点计数。
    const base = await seedBase();
    const { teamId } = await seedActiveWithDanglingLead(base);
    // 另建一个**健康**的 active 团队（组长引用有效），与悬挂团队同处一次扫描。
    const created = await service.createTeam({
      operationId: nextSeedOperationId("team-create"),
      companyId: base.companyId as never,
      departmentId: base.departmentId as never,
      name: "健康小组",
      function: "负责健康职能",
    });
    if (created.status !== "committed") throw new Error("建团队失败");
    const healthyTeamId = created.result.teamId;
    const appointment = await service.createAppointment({
      operationId: nextSeedOperationId("appointment"),
      employeeId: base.employeeId as never,
      scope: { kind: "team", companyId: base.companyId as never, teamId: healthyTeamId },
      role: "team_lead",
    });
    if (appointment.status !== "committed") throw new Error("建任职失败");
    const activated = await service.activateTeam({
      operationId: nextSeedOperationId("team-activate"),
      teamId: healthyTeamId,
      leadAppointmentId: appointment.result.appointmentId,
    });
    if (activated.status !== "committed") throw new Error("激活失败");

    const probe = mediumProbe();
    const writer = await openWriter(probe);
    expect(writer.getTeam(healthyTeamId)?.usable).toBe(true);

    const result = await writer.reconcileTeams();

    // 两个 active 团队都在扫描范围内（`scanned` 计的是扫描过的 active 团队）。
    expect(result.scanned).toBe(2);
    // 只有悬挂的那个被标记；健康的那个不报、也不进写路径。
    expect(result.markedInactive).toEqual([teamId]);
    // 团队表只发生**一次**写点（悬挂团队的标记），健康团队零写点。
    expect(probe.updateCalls("team")).toBe(1);
    expect(probe.backendWrites("team")).toBe(1);
    expect(storedTeam(healthyTeamId).status).toBe("active");
    await writer.close();
  });

  it("槽位内重判不成立时零后端写（不是「写回原值」）", async () => {
    // 〔为什么单独钉这一条〕修法的中止手段是**抛出**（端口不调用后端写），而不是
    // 「返回 `current` 不变」。后者仍会产生一次内容相同的真实写（后端 IO +
    // `domain/changed` 事件），与「拒绝时介质零变化」的既有纪律不符。若只断言最终
    // `status`，两种实现在介质上**不可区分**（都读回 `archived`）——故必须看
    // **后端写次数**（探针自证见下一条用例）。
    const base = await seedBase();
    const { teamId } = await seedActiveWithDanglingLead(base);

    const probe = mediumProbe();
    const writer = await openWriter(probe);
    probe.barrier.arm();
    const reconcilePromise = writer.reconcileTeams();
    await probe.barrier.atBarrier;
    expect(probe.barrier.hit()).toBe(true);

    // 窗口内归档（正常提交），使槽位内重判不成立。
    await writer.closeTeam({ operationId: nextSeedOperationId("team-close"), teamId });

    // 记下放行前的计数：此后 reconcile 的写若真的落盘，会各加一。
    const writesBefore = probe.backendWrites("team");
    const callsBefore = probe.updateCalls("team");
    probe.barrier.release();
    await reconcilePromise;

    // 断言：放行后**没有**任何针对该团队的后端写。
    expect(probe.backendWrites("team")).toBe(writesBefore);
    // 自证探针有效性：放行后 reconcile 确实到达了写点（`update` 已入链），
    // 否则「无后端写」可能只是没跑到那条路径。
    expect(probe.updateCalls("team")).toBe(callsBefore + 1);
    expect(storedTeam(teamId).status).toBe("archived");
    await writer.close();
  });

  it("探针自证：`revise` 返回 `current` 不变时仍记 1 次后端写（故「0 次」断言有鉴别力）", async () => {
    // 「返回 `current` 不变」的替代修法在宿主语义下会走一次真实写。本用例直接
    // 经探针端口打开 domain，用**同一个** `update` 路径做一次值不变的修订，
    // 断言它计入后端写——即上一条用例的「0 次」断言对该形态会转红。
    const base = await seedBase();
    const { teamId } = await seedActiveWithDanglingLead(base);

    const probe = mediumProbe();
    const domain = await openProbeDomain(probe);
    const before = probe.backendWrites("team");
    expect(domain.table("team").get(teamId)?.status).toBe("active");

    await domain.table("team").update(teamId, (record) => record);

    expect(probe.backendWrites("team")).toBe(before + 1);
    expect(storedTeam(teamId).status).toBe("active");
    await domain.close();
  });

  it("竞争归档**在飞**（已入链、后端写未完成）→ 不得覆盖归档终态", async () => {
    // 〔本用例与上面「窗口内归档已提交」的构造差别〕这里的竞争提交**尚未完成**：
    // 后端写被挂起，故介质与内存态仍是旧的 `active`。于是「槽位外 `get` 重读 +
    // 无条件 `update`」的形态会在**归档落盘之前**读到旧值并据此放行，随后覆盖
    // 归档终态——而「竞争提交完全完成后再放行」的构造下，两种实现读到的都是
    // `archived`，因此对它**不具鉴别力**（这正是本用例存在的理由）。
    const base = await seedBase();
    const { teamId } = await seedActiveWithDanglingLead(base);

    const probe = mediumProbe();
    const writer = await openWriter(probe);

    // ① 挂起竞争归档的后端写：提交已入链、后端写未完成 ⇒ 介质与内存态仍是 active。
    const held = probe.holdNextWrite("team");
    const closing = writer.closeTeam({ operationId: nextSeedOperationId("team-close"), teamId });
    await held.started;
    // 自证构造：此刻归档**尚未落盘**（否则退化为「完全提交后才放行」）。
    expect(storedTeam(teamId).status).toBe("active");

    // ② 竞争写在飞时跑 reconcile：扫描与写点都以「旧」内存态为起点。
    const reconcilePromise = writer.reconcileTeams();
    // 等到 reconcile 的写点入链——此后任何实现都已固定了它自己的判定输入
    // （槽位内重判的实现要到放行后、在槽位里才读；槽位外重读的实现此刻已读完）。
    await Promise.race([
      probe.waitForUpdateCalls("team", 2),
      reconcilePromise.then(() => {
        throw new Error("reconcile 在竞争写仍挂起时返回：未到达写点，本用例的构造前提不成立");
      }),
    ]);

    // ③ 放行竞争写 → 归档落盘 → 链上后续槽位（reconcile 的写）才执行。
    held.release();
    const closed = await closing;
    const result = await reconcilePromise;

    expect(closed.status).toBe("committed");
    expect(storedTeam(teamId).status).toBe("archived");
    expect(result.markedInactive).toEqual([]);
    // 团队表后端写只有归档这一次：reconcile 的写点入了链，槽位内中止（零写）。
    expect(probe.backendWrites("team")).toBe(1);
    await writer.close();
  });

  it("介质写失败必须冒泡：reconcileTeams 不得静默返回「无事可做」", async () => {
    // 〔本条封住的盲区〕`#reconcileOne` 的 catch 只应识别**私有中止信号**，
    // 其余一律重抛。若写成无条件 `return false`，后端故障会被吞掉：reconcile
    // 谎报「扫描完成、无事可做」（`{scanned:1, markedInactive:[]}`），调用方
    // 无法区分「并发提交已给出结论」与「介质写失败」。
    const base = await seedBase();
    const { teamId } = await seedActiveWithDanglingLead(base);

    const probe = mediumProbe();
    const writer = await openWriter(probe);
    const backendDown = new FakeAdapterError("BACKEND_DOWN", "后端写失败（测试注入）");
    probe.failNextWrite("team", backendDown);

    await expect(writer.reconcileTeams()).rejects.toBe(backendDown);
    // 失败时没有半途写入：标记未落盘，介质仍是 active。
    expect(storedTeam(teamId).status).toBe("active");
    expect(probe.backendWrites("team")).toBe(0);
    await writer.close();
  });

  it("反向对照：窗口内无事发生 → 扫描结论照常落地并被报告", async () => {
    const base = await seedBase();
    const { teamId } = await seedActiveWithDanglingLead(base);

    const probe = mediumProbe();
    const writer = await openWriter(probe);
    probe.barrier.arm();
    const reconcilePromise = writer.reconcileTeams();
    await probe.barrier.atBarrier;
    expect(probe.barrier.hit()).toBe(true);
    probe.barrier.release();
    const result = await reconcilePromise;

    expect(result.markedInactive).toEqual([teamId]);
    expect(storedTeam(teamId).status).toBe("inactive");
    expect(probe.backendWrites("team")).toBe(1);
    await writer.close();
  });
});
