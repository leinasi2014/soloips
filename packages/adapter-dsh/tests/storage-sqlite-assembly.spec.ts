/**
 * SOLOIPS-ADAPTER-STORAGE-SQLITE-ASSEMBLY-SPEC（切片 STORAGE-02）
 *
 * 范围：`createStack` 的**装配路径**——不传 `backend` 时落到生产缺省后端的行为，
 * 以及该后端与测试缺省后端（json）的语义对照。
 *
 * 为什么单独一个文件，而不是扩 `storage-port.spec.ts`：那个文件的范围是**机制**
 * （租约互斥、派生名注册/注销、facility 桥），它的每个 `createStack` 都显式传
 * `backend: "json"`。本文件的范围是**缺省装配**，两者红/绿的理由不同、会因不同
 * 原因变化，混在一个文件里会让「生产默认路径没有测试」这个事实再次不可见。
 *
 * 盲区事实（本文件消除的对象）：
 *  - 生产缺省后端是 `sqlite`——`src/contracts.ts` 的
 *    `SOLOIPS_ADAPTER_CONFIG_DEFAULTS.defaultBackend`，部署面见
 *    `profiles/soloips/cordis.patch.yml` 的 `defaultBackend`；
 *  - 而修复前**全部**测试都显式传 `json`：`packages/core/tests/adapter-fakes.ts` 的
 *    `options.backend ?? "json"`、`packages/core/tests/store.spec.ts` 的
 *    `backend: "json"`；
 *  - 于是 `src/ports/storage.ts` 的 sqlite 分支（`new SqliteStorageBackend(root)`）
 *    在修复前**从未在任何测试中执行**——「生产默认」与「测试默认」不同，缺省路径无保护。
 *
 * 与本目录既有测试的两点刻意不同（都是为了让「装配」真的被装配）：
 *  1. **真宿主 hub**：用真实 `Context`（`@deepseek-ai/cordis`）与真实 `Storage`
 *     （`@deepseek-ai/dsh-storage`）注册表，不用 `storage-port.spec.ts` 的桩 hub。
 *     差别可观察：真实 `BackendRegistry.register` 对同名注册抛 `duplicate-backend`，
 *     而桩 hub 静默覆盖（〔实测〕「单维护者」用例在桩下不会红，在真 hub 下会）；
 *     `DomainFacility.open` 也经真实 `ctx.storage.backend.get` 解析路由。
 *  2. **真介质**：临时根下真的出现 `<unit>.db`（SQLite 魔数 `SQLite format 3\0`），
 *     且 dispose 后重开能读回；不是内存替身，也不是「文件存在即通过」。
 *
 * 临时根与清理：默认落在 `os.tmpdir()` 下的 `soloips-storage02-*`，父目录可用环境变量
 * `SOLOIPS_STORAGE02_ROOT` 覆盖（本地按切片要求跑在 `D:/tmp/soloips-storage02/`）。
 * 〔约束〕**不得**把 `D:/tmp` 写死：CI 主检查跑在 ubuntu（`.github/workflows/verify.yml`
 * 的 `verify` job），盘符路径在 POSIX 上不是绝对路径，会被 `canonicalRoot` 以
 * `SOLOIPS_ADAPTER_INVALID_CONFIG` 拒绝，即门禁会因一条本机路径而红。
 * 每个用例自建自清（`afterEach` 释放全部 stack 后删根），不向仓库写任何字节。
 *
 * 边界探针的两条结论（切片要求 B，裁定建议见交付报告）：
 *  - `storageId` 的 backend 前缀是**设计意图**，不是缺陷：它是「存储身份」轴（介质格式
 *    决定记录怎么读），与「写权身份」轴（租约，**只按 root** 互斥，见最后一个用例）
 *    刻意分离。同一 root 换 backend 即换存储身份，这是 `binding.backend` 必须存在的原因。
 *  - 同 root 下 json 与 sqlite **各写一套、互不可见**：切换 backend 不会报错、不迁移、
 *    不提示（末两个用例钉住该行为）。这是「配置错误会静默另起一套空库」的真实风险面，
 *    故把它固化成测试事实而不是留成口头约定。
 */

import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import {
  SOLOIPS_ADAPTER_CONFIG_DEFAULTS,
  SoloipsAdapterError,
  type SoloipsDomainSpec,
  type SoloipsStorageStack,
  type SoloipsTableKeyOf,
} from "../src/contracts.js";
import { createStoragePort } from "../src/ports/storage.js";

// ── 宿主与临时根 ──────────────────────────────────────────────────────────────

/**
 * 真实宿主面：`new Context()` 是 cordis 的根上下文，`new Storage(ctx)` 以真实
 * `Service` 注册 `ctx.storage`（注册表 + 表单挂载点）。`createStack` 经
 * `ctx.get('storage')` 读到它，`DomainFacility` 经 `ctx.storage.backend.get` 解析路由。
 */
function realHost(): { ctx: Context; registryNames: () => string[] } {
  const ctx = new Context();
  new Storage(ctx);
  return { ctx, registryNames: () => ctx.storage.backend.names() };
}

const STORAGE02_ROOT_ENV = "SOLOIPS_STORAGE02_ROOT";

/** 临时根父目录；见文件头〔约束〕。 */
function tempRootParent(): string {
  const configured = process.env[STORAGE02_ROOT_ENV];
  return configured === undefined || configured === "" ? tmpdir() : configured;
}

const tempRoots: string[] = [];
const liveStacks: SoloipsStorageStack[] = [];

/** 建一个独占临时根（父目录按需创建；`mkdtemp` 保证用例之间不共享路径）。 */
async function newTempRoot(): Promise<string> {
  const parent = tempRootParent();
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "soloips-storage02-"));
  tempRoots.push(root);
  return root;
}

/** 记录 stack 供 afterEach 兜底释放（dispose 幂等；用例内已释放的重复释放无害）。 */
function track(stack: SoloipsStorageStack): SoloipsStorageStack {
  liveStacks.push(stack);
  return stack;
}

afterEach(async () => {
  // 先释放全部 stack（未释放的 sqlite 句柄会让 Windows 上的目录删除 EPERM），再删根。
  while (liveStacks.length > 0) {
    const stack = liveStacks.pop();
    if (stack !== undefined) await stack.dispose();
  }
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  }
});

// ── 探针 domain（与 storage-port.spec.ts 同款最小 spec） ──────────────────────

/** 结构化 schema 端口（契约允许的最小实现）：证明 adapter 可传非 zod schema。 */
const passthroughSchema = {
  parse(value: unknown): unknown {
    if (typeof value !== "object" || value === null) throw new TypeError("not an object");
    return value;
  },
  safeParse(value: unknown) {
    if (typeof value === "object" && value !== null) {
      return { success: true as const, data: value };
    }
    return { success: false as const, error: new TypeError("not an object") };
  },
};

const probeSpec = {
  name: "soloips_probe",
  version: 1,
  tables: { thing: { valueSchema: passthroughSchema } },
} satisfies SoloipsDomainSpec;

type ThingKey = SoloipsTableKeyOf<typeof probeSpec, "thing">;

const thingKey = (key: string): ThingKey => key as ThingKey;

/** SQLite 主库文件的魔数（介质是 sqlite 而非 JSON/内存的直接证据）。 */
const SQLITE_MAGIC = "SQLite format 3\u0000";

function adapterCode(error: unknown): string | undefined {
  return error instanceof SoloipsAdapterError ? error.code : undefined;
}

/** 捕获一个 rejected promise 的失败值（用例自证「确实失败」而不是「没跑到」）。 */
async function failureOf(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error: unknown) {
    return error;
  }
  throw new Error("test: 预期该操作失败，但它成功了");
}

// ── A. 缺省装配路径（生产默认 = sqlite） ──────────────────────────────────────

describe("sqlite 装配路径 · createStack 缺省后端（SEAM-11/14，生产默认）", () => {
  it("不传 backend 时落到 sqlite：binding 形状、派生名前缀、facility 可用", async () => {
    // 前提固定：本文件保护的是「生产默认 = sqlite」这条事实（contracts.ts:777）。
    // 若该缺省被改动，本断言先红，读者才会去看装配路径而不是猜。
    expect(SOLOIPS_ADAPTER_CONFIG_DEFAULTS.defaultBackend).toBe("sqlite");

    const root = await newTempRoot();
    const host = realHost();
    const port = createStoragePort(host.ctx, {
      defaultBackend: SOLOIPS_ADAPTER_CONFIG_DEFAULTS.defaultBackend,
      leaseWaitMs: 200,
    });

    // 关键：**不传** backend——走缺省分支，即生产装配路径。
    const stack = track(await port.createStack({ root }));

    expect(stack.binding).toEqual({
      backend: "sqlite",
      root: resolve(root),
      storageId: `sqlite:${resolve(root)}`,
    });
    expect(host.registryNames()).toEqual([expect.stringMatching(/^soloips-sqlite-[0-9a-f]{16}$/)]);

    // facility 可用：open → put → get → close 全链路（真 backend + 真 DomainFacility）。
    const facility = port.requireFacility(stack.facility);
    const domain = await facility.open(probeSpec);
    expect(domain.name).toBe("soloips_probe");
    await domain.table("thing").put(thingKey("alpha"), { hello: "sqlite" });
    expect(domain.table("thing").get(thingKey("alpha"))).toEqual({ hello: "sqlite" });
    expect(domain.table("thing").size).toBe(1);
    await domain.close();

    await stack.dispose();
    expect(host.registryNames()).toEqual([]);
  });

  it("真实介质：<unit>.db 落盘（SQLite 魔数）、无 json 影子文件、dispose 后重开读回", async () => {
    const root = await newTempRoot();
    const host = realHost();
    const port = createStoragePort(host.ctx, { defaultBackend: "sqlite", leaseWaitMs: 200 });

    const stack = track(await port.createStack({ root }));
    const domain = await port.requireFacility(stack.facility).open(probeSpec);
    await domain.table("thing").put(thingKey("alpha"), { hello: "world", n: 7 });
    await domain.close();
    await stack.dispose();

    // 介质证据 1：目录里是 sqlite 主库，且**没有** json 后端的影子文件（证明确实走了 sqlite 分支）。
    const entries = readdirSync(root);
    expect(entries).toContain("soloips_probe.db");
    expect(entries).not.toContain("soloips_probe.json");
    expect(entries.filter((name) => name.endsWith(".json"))).toEqual([]);

    // 介质证据 2：文件头是 SQLite 格式魔数（不是 JSON、不是内存替身）。
    const medium = await readFile(join(root, "soloips_probe.db"));
    expect(medium.subarray(0, SQLITE_MAGIC.length).toString("latin1")).toBe(SQLITE_MAGIC);

    // 介质证据 3：持久性——同一 root 新建 stack 与 facility，读回上次写入的记录。
    const reopened = track(await port.createStack({ root }));
    const reopenedDomain = await port.requireFacility(reopened.facility).open(probeSpec);
    expect(reopenedDomain.table("thing").size).toBe(1);
    expect(reopenedDomain.table("thing").get(thingKey("alpha"))).toEqual({
      hello: "world",
      n: 7,
    });
    await reopenedDomain.close();
    await reopened.dispose();
  });

  it("同 Context 第二个同 root 同 backend 的 stack 以 SERVICE_UNAVAILABLE 拒绝（SEAM-10 单维护者）", async () => {
    const root = await newTempRoot();
    const host = realHost();
    const port = createStoragePort(host.ctx, { defaultBackend: "sqlite", leaseWaitMs: 200 });

    const first = track(await port.createStack({ root }));
    const failure = await failureOf(port.createStack({ root }));

    // 真注册表对同名注册抛 duplicate-backend；适配层把它收敛成契约码（fail-closed）。
    expect(adapterCode(failure)).toBe("SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE");
    expect(host.registryNames()).toEqual([expect.stringMatching(/^soloips-sqlite-[0-9a-f]{16}$/)]);

    // 拒绝不得有副作用：首个 stack 仍可用，且释放后注册表干净。
    const domain = await port.requireFacility(first.facility).open(probeSpec);
    await domain.table("thing").put(thingKey("alpha"), { still: "usable" });
    expect(domain.table("thing").get(thingKey("alpha"))).toEqual({ still: "usable" });
    await domain.close();
    await first.dispose();
    expect(host.registryNames()).toEqual([]);
  });
});

// ── A3. 失败形态（fail-closed） ───────────────────────────────────────────────

describe("sqlite 装配路径 · fail-closed", () => {
  it("显式非法 backend 名以 SERVICE_UNAVAILABLE 拒绝，且不注册任何 backend", async () => {
    const root = await newTempRoot();
    const host = realHost();
    const port = createStoragePort(host.ctx, { defaultBackend: "sqlite", leaseWaitMs: 200 });

    const failure = await failureOf(port.createStack({ root, backend: "postgres" }));
    expect(adapterCode(failure)).toBe("SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE");
    expect(host.registryNames()).toEqual([]);
    expect(existsSync(root)).toBe(true); // 根已由用例创建，但未落任何介质文件
    expect(readdirSync(root)).toEqual([]);
  });

  it("defaultBackend 配置成非法名时同样拒绝（配置面也 fail-closed）", async () => {
    const root = await newTempRoot();
    const host = realHost();
    const port = createStoragePort(host.ctx, { defaultBackend: "postgres", leaseWaitMs: 200 });

    // 缺省分支取到非法名：拒绝，而不是静默退回 json。
    const failure = await failureOf(port.createStack({ root }));
    expect(adapterCode(failure)).toBe("SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE");
    expect(host.registryNames()).toEqual([]);
  });

  it("相对 root 以 INVALID_CONFIG 拒绝（canonicalRoot 在 backend 构造之前）", async () => {
    const host = realHost();
    const port = createStoragePort(host.ctx, { defaultBackend: "sqlite", leaseWaitMs: 200 });

    const failure = await failureOf(port.createStack({ root: "relative/root" }));
    expect(adapterCode(failure)).toBe("SOLOIPS_ADAPTER_INVALID_CONFIG");
    expect(host.registryNames()).toEqual([]);
  });

  it("root 不可创建：两个后端同一契约码、拒绝、零残留、不创建目录", async () => {
    const base = await newTempRoot();
    const occupied = join(base, "occupied");
    await writeFile(occupied, "occupied by a regular file\n");
    const root = join(occupied, "nested");

    const host = realHost();
    const port = createStoragePort(host.ctx, { defaultBackend: "sqlite", leaseWaitMs: 200 });

    // sqlite 侧：构造期 `mkdirSync` 失败，经 `mapHostError` 收敛（D-5 修复前抛裸
    // Node ErrnoException，code=ENOTDIR，故本断言当时为析取）。
    const failure = await failureOf(port.createStack({ root }));
    expect(failure).toBeInstanceOf(SoloipsAdapterError);
    expect(adapterCode(failure)).toBe("SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE");
    expect(host.registryNames()).toEqual([]);
    expect(existsSync(root)).toBe(false);

    // json 侧对同一 root 给出**同一契约码**：其构造器只存 root（createStack 不触
    // 介质），失败发生在 open（host 的 `JsonStorageBackend.openUnit` 里 mkdir）——
    // 阶段不同、码相同，这就是 D-5 要求的「失败形态一致」的落点。
    const jsonPort = createStoragePort(host.ctx, { defaultBackend: "json", leaseWaitMs: 200 });
    const jsonStack = track(await jsonPort.createStack({ root }));
    const jsonFailure = await failureOf(
      jsonPort.requireFacility(jsonStack.facility).open(probeSpec),
    );
    expect(adapterCode(jsonFailure)).toBe("SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE");
    await jsonStack.dispose();
    expect(host.registryNames()).toEqual([]);
    expect(existsSync(root)).toBe(false);
  });

  it("root 指向已存在的普通文件：open 以 SERVICE_UNAVAILABLE 拒绝，文件不被破坏，dispose 后注册表干净", async () => {
    const base = await newTempRoot();
    const asFile = join(base, "occupied");
    const original = "precious bytes\n";
    await writeFile(asFile, original);

    const host = realHost();
    const port = createStoragePort(host.ctx, { defaultBackend: "sqlite", leaseWaitMs: 200 });

    // 构造期只做 existsSync 判定，故 createStack 成功；失败发生在 open（首次触介质）。
    const stack = track(await port.createStack({ root: asFile }));
    expect(stack.binding.root).toBe(resolve(asFile));

    const failure = await failureOf(port.requireFacility(stack.facility).open(probeSpec));
    expect(adapterCode(failure)).toBe("SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE");

    await stack.dispose();
    expect(host.registryNames()).toEqual([]);
    // 失败路径不得破坏既有文件：内容原样，且没有被改写成 sqlite 库。
    expect(await readFile(asFile, "utf8")).toBe(original);
  });

  it("core 启动序（lease → createStack）：不可创建 root 的首个失败点是取权，且已是契约码", async () => {
    // 为什么这条在装配文件里：core 的真实调用序是
    // `acquireWriterLease` → `createStack` → `facility.open`
    // （`packages/core/src/store.ts` 的 openSoloipsCompanyStore，lease 先行）。
    // 因此对「root 不可创建」，**首个**失败点不是 backend 构造，而是租约取权里的
    // mkdir。只修 backend 侧等于让真实路径的首错继续是裸 ErrnoException——本用例
    // 钉住的是**调用方实际会收到什么**，不是某个内部构造函数的形态。
    const base = await newTempRoot();
    const occupied = join(base, "occupied");
    await writeFile(occupied, "occupied by a regular file\n");
    const root = join(occupied, "nested");

    const host = realHost();
    const port = createStoragePort(host.ctx, { defaultBackend: "sqlite", leaseWaitMs: 200 });

    // 第一步：取权失败（D-5 修复前为裸 ErrnoException code=ENOTDIR）。
    const leaseFailure = await failureOf(port.acquireWriterLease({ root }));
    expect(leaseFailure).toBeInstanceOf(SoloipsAdapterError);
    expect(adapterCode(leaseFailure)).toBe("SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE");

    // 第二步：即便调用方忽略首错继续建栈，形态仍是同一契约码（同 root、同根因）。
    const stackFailure = await failureOf(port.createStack({ root }));
    expect(adapterCode(stackFailure)).toBe("SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE");

    // 零残留：不注册 backend、不建目录、不留租约/锁文件。
    expect(host.registryNames()).toEqual([]);
    expect(existsSync(root)).toBe(false);
    expect(readdirSync(base)).toEqual(["occupied"]);
  });
});

// ── A4/B. 与 json 的对照 ─────────────────────────────────────────────────────

describe("sqlite 与 json 的对照（生产默认 vs 测试默认）", () => {
  it("同一操作两端行为一致：binding 形状、put/get 往返、dispose 后注册表清空", async () => {
    const host = realHost();
    const port = createStoragePort(host.ctx, { defaultBackend: "sqlite", leaseWaitMs: 200 });
    const results: Array<{
      backend: string;
      bindingKeys: string[];
      storageId: string;
      readBack: unknown;
      registryName: string;
    }> = [];

    for (const backend of ["json", "sqlite"] as const) {
      const root = await newTempRoot();
      const stack = track(await port.createStack({ root, backend }));
      const domain = await port.requireFacility(stack.facility).open(probeSpec);
      await domain.table("thing").put(thingKey("alpha"), { parity: backend });
      const readBack = domain.table("thing").get(thingKey("alpha"));
      await domain.close();

      results.push({
        backend: stack.binding.backend,
        bindingKeys: Object.keys(stack.binding).sort(),
        storageId: stack.binding.storageId,
        readBack,
        registryName: host.registryNames()[0] ?? "",
      });
      await stack.dispose();
      expect(host.registryNames()).toEqual([]);
    }

    const [json, sqlite] = results;
    if (json === undefined || sqlite === undefined) throw new Error("test: 两端都必须跑过");

    // 语义等价面：绑定形状同构、读写往返同形。
    expect(json.bindingKeys).toEqual(sqlite.bindingKeys);
    expect(json.backend).toBe("json");
    expect(sqlite.backend).toBe("sqlite");
    expect(json.readBack).toEqual({ parity: "json" });
    expect(sqlite.readBack).toEqual({ parity: "sqlite" });

    // 不同面：存储身份与派生名都带 backend，故两端不共享身份（裁定见报告）。
    expect(json.storageId).not.toBe(sqlite.storageId);
    expect(json.registryName).toMatch(/^soloips-json-[0-9a-f]{16}$/);
    expect(sqlite.registryName).toMatch(/^soloips-sqlite-[0-9a-f]{16}$/);
  });

  it("同 root 下两套介质并存且互不可见（切换 backend = 静默另起一套，不报错）", async () => {
    const root = await newTempRoot();
    const host = realHost();
    const port = createStoragePort(host.ctx, { defaultBackend: "sqlite", leaseWaitMs: 200 });

    // 先 json 写一条。
    const jsonStack = track(await port.createStack({ root, backend: "json" }));
    const jsonDomain = await port.requireFacility(jsonStack.facility).open(probeSpec);
    await jsonDomain.table("thing").put(thingKey("alpha"), { from: "json" });
    await jsonDomain.close();
    await jsonStack.dispose();

    // 同 root 换 sqlite：看到的是空库（不报错、不迁移、不提示）。
    const sqliteStack = track(await port.createStack({ root, backend: "sqlite" }));
    const sqliteDomain = await port.requireFacility(sqliteStack.facility).open(probeSpec);
    expect(sqliteDomain.table("thing").size).toBe(0);
    await sqliteDomain.table("thing").put(thingKey("beta"), { from: "sqlite" });
    await sqliteDomain.close();
    await sqliteStack.dispose();

    // 两套介质并存；再回 json 仍读到自己的记录（谁也没覆盖谁）。
    expect(readdirSync(root).sort()).toEqual(["soloips_probe.db", "soloips_probe.json"]);
    const jsonAgain = track(await port.createStack({ root, backend: "json" }));
    const jsonAgainDomain = await port.requireFacility(jsonAgain.facility).open(probeSpec);
    expect([...jsonAgainDomain.table("thing").entries()]).toEqual([["alpha", { from: "json" }]]);
    await jsonAgainDomain.close();
    await jsonAgain.dispose();
  });

  it("租约按 root 互斥、storageId 按 backend 区分：两者是不同的身份轴", async () => {
    const root = await newTempRoot();
    const host = realHost();
    // 两个端口只有 defaultBackend 不同——用来观察「租约身份」与「存储身份」的分工。
    const jsonPort = createStoragePort(host.ctx, { defaultBackend: "json", leaseWaitMs: 150 });
    const sqlitePort = createStoragePort(host.ctx, { defaultBackend: "sqlite", leaseWaitMs: 150 });

    const jsonLease = await jsonPort.acquireWriterLease({ root });
    expect(jsonLease.storageId).toBe(`json:${resolve(root)}`);

    // 〔实测〕互斥**只**按 root 判定：换一个 defaultBackend 不构成另一把锁，
    // 第二个取权者仍被拒（租约是「写权」身份，与介质格式无关）。
    const contended = await failureOf(sqlitePort.acquireWriterLease({ root }));
    expect(adapterCode(contended)).toBe("SOLOIPS_ADAPTER_LEASE_NOT_HELD");

    await jsonLease.dispose();
    // 同一把锁释放后，sqlite 端口取到的租约在同一 root 上代际递增（2），
    // 但 storageId 换成 sqlite 前缀——存储身份跟着 backend 走。
    const sqliteLease = await sqlitePort.acquireWriterLease({ root });
    expect(sqliteLease.generation).toBe(2);
    expect(sqliteLease.storageId).toBe(`sqlite:${resolve(root)}`);
    await sqliteLease.dispose();
  });
});
