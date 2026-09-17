/**
 * storage-sqlite 后端的介质行为测试：真实文件库 roundtrip。
 *
 * 全部用真实临时目录与真实 better-sqlite3 文件库（不 mock、不落内存替身），验证该
 * 后端对 DSH KvUnit 契约的**介质承诺**：建表幂等、覆盖写、删除幂等、快照形状
 * （声明的表即使 0 行也在快照里）、global 单例、以及 close/re-open 后的持久性。
 *
 * 这些用例锁的是「重写为 Drizzle 实现后行为不变」：写入路径改由 Drizzle 查询构造器
 * 生成（upsert 走 `onConflictDoUpdate`），但错误文案与可观察语义必须与重构前逐字一致。
 */
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { KvFacet, KvUnitDescriptor } from "@deepseek-ai/dsh-storage";
import { SqliteStorageBackend } from "../src/ports/storage-sqlite";

const tempRoots: string[] = [];

async function newTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "soloips-adapter-sqlite-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  }
});

/** 构造 unit descriptor（默认名 solodemo、单表、无 global）。 */
function unitDescriptor(options: {
  name?: string;
  tables?: readonly string[];
  hasGlobal?: boolean;
}): KvUnitDescriptor {
  return {
    name: options.name ?? "solodemo",
    version: 1,
    tables: options.tables ?? ["thing"],
    hasGlobal: options.hasGlobal ?? false,
  };
}

/** 取 kv 面：本后端必然暴露它，缺失即测试前提被破坏。 */
function kvOf(backend: SqliteStorageBackend): KvFacet {
  const kv = backend.kv;
  if (kv === undefined) throw new Error("test: sqlite backend must expose the kv facet");
  return kv;
}

/** 取快照中某表：declared 表必须存在（表集合完整性是 domain 层的依赖）。 */
function tableOf(
  snapshot: { tables: Record<string, Record<string, unknown>> },
  name: string,
): Record<string, unknown> {
  const records = snapshot.tables[name];
  if (records === undefined) throw new Error(`test: snapshot is missing table '${name}'`);
  return records;
}

/** 复杂 JSON 值：嵌套对象、数组、null、布尔与中文字符串（验 JSON 往返非字符串化差异）。 */
const complexValue = {
  title: "中文标题 · 测试",
  tags: ["alpha", "β 版本", "日本語", ""],
  nested: { deep: { level: [1, 2.5, null, true] }, empty: {} },
  matrix: [
    [1, 2],
    [3, 4],
  ],
  scalar: null,
  count: 0,
};

describe("sqlite storage backend · 构造与介质", () => {
  it("非绝对路径在构造期即拒绝（文案保持），绝对路径建目录并可 open", async () => {
    expect(() => new SqliteStorageBackend("relative/root")).toThrow(
      "SQLite backend root must be absolute, got 'relative/root'",
    );

    const root = join(await newTempRoot(), "nested", "data");
    const backend = new SqliteStorageBackend(root);
    expect(backend.getRoot()).toBe(root);
    expect(existsSync(root)).toBe(true);

    const unit = await kvOf(backend).open(unitDescriptor({}));
    expect(existsSync(join(root, "solodemo.db"))).toBe(true);
    await unit.close();
    await backend.close();
  });

  it("每个单元一个独立 `${name}.db` 文件", async () => {
    const root = await newTempRoot();
    const backend = new SqliteStorageBackend(root);
    const first = await kvOf(backend).open(unitDescriptor({ name: "unit_one" }));
    const second = await kvOf(backend).open(unitDescriptor({ name: "unit_two" }));

    expect(existsSync(join(root, "unit_one.db"))).toBe(true);
    expect(existsSync(join(root, "unit_two.db"))).toBe(true);

    await first.close();
    await second.close();
    await backend.close();
  });
});

describe("sqlite storage backend · 记录 roundtrip", () => {
  it("首次建表 → putRecord → loadAll 读回：多表齐全且复杂 JSON 值往返", async () => {
    const root = await newTempRoot();
    const backend = new SqliteStorageBackend(root);
    const unit = await kvOf(backend).open(
      unitDescriptor({ tables: ["thing", "another_table"], hasGlobal: false }),
    );

    await unit.putRecord("thing", "alpha", complexValue);
    await unit.putRecord("another_table", "beta", { hello: "世界", n: 1 });

    const snapshot = await unit.loadAll();
    expect(Object.keys(snapshot.tables).sort()).toEqual(["another_table", "thing"]);
    expect(tableOf(snapshot, "thing")["alpha"]).toEqual(complexValue);
    expect(tableOf(snapshot, "another_table")["beta"]).toEqual({ hello: "世界", n: 1 });
    expect(Object.keys(tableOf(snapshot, "thing"))).toEqual(["alpha"]);

    await unit.close();
    await backend.close();
  });

  it("同 key 覆盖写：末次写入胜出且不新增记录", async () => {
    const root = await newTempRoot();
    const backend = new SqliteStorageBackend(root);
    const unit = await kvOf(backend).open(unitDescriptor({}));

    await unit.putRecord("thing", "alpha", { version: 1 });
    await unit.putRecord("thing", "alpha", { version: 2 });
    await unit.putRecord("thing", "alpha", complexValue);

    const snapshot = await unit.loadAll();
    const records = tableOf(snapshot, "thing");
    expect(Object.keys(records)).toEqual(["alpha"]);
    expect(records["alpha"]).toEqual(complexValue);

    await unit.close();
    await backend.close();
  });

  it("声明但零行的表仍以空对象出现在快照里（表集合完整性）", async () => {
    const root = await newTempRoot();
    const backend = new SqliteStorageBackend(root);
    const unit = await kvOf(backend).open(unitDescriptor({ tables: ["thing", "empty_one"] }));

    await unit.putRecord("thing", "alpha", 1);

    const snapshot = await unit.loadAll();
    expect(snapshot.tables["empty_one"]).toEqual({});
    expect(tableOf(snapshot, "thing")).toEqual({ alpha: 1 });

    await unit.close();
    await backend.close();
  });

  it("deleteRecord 后 loadAll 不再含该 key；重复删除幂等", async () => {
    const root = await newTempRoot();
    const backend = new SqliteStorageBackend(root);
    const unit = await kvOf(backend).open(unitDescriptor({}));

    await unit.putRecord("thing", "alpha", complexValue);
    await unit.putRecord("thing", "kept", { keep: true });
    await unit.deleteRecord("thing", "alpha");

    const afterDelete = await unit.loadAll();
    expect(Object.keys(tableOf(afterDelete, "thing"))).toEqual(["kept"]);

    await expect(unit.deleteRecord("thing", "alpha")).resolves.toBeUndefined();
    const afterSecondDelete = await unit.loadAll();
    expect(Object.keys(tableOf(afterSecondDelete, "thing"))).toEqual(["kept"]);

    await unit.close();
    await backend.close();
  });

  it("未声明表名被拒（putRecord 与 deleteRecord 同文案），且不落任何行", async () => {
    const root = await newTempRoot();
    const backend = new SqliteStorageBackend(root);
    const unit = await kvOf(backend).open(unitDescriptor({ tables: ["thing"] }));

    await expect(unit.putRecord("undeclared", "alpha", 1)).rejects.toThrow(
      "table 'undeclared' is not declared in descriptor",
    );
    await expect(unit.deleteRecord("undeclared", "alpha")).rejects.toThrow(
      "table 'undeclared' is not declared in descriptor",
    );

    const snapshot = await unit.loadAll();
    expect(Object.keys(snapshot.tables)).toEqual(["thing"]);

    await unit.close();
    await backend.close();
  });

  it("未声明 unit 名与表名的 descriptor 在 open 期被拒", async () => {
    const root = await newTempRoot();
    const backend = new SqliteStorageBackend(root);

    await expect(kvOf(backend).open(unitDescriptor({ name: "BadName" }))).rejects.toThrow(
      "invalid unit name: BadName",
    );
    await expect(
      kvOf(backend).open(unitDescriptor({ name: "solodemo", tables: ["Bad-Table"] })),
    ).rejects.toThrow("invalid table name: Bad-Table");

    await backend.close();
  });
});

describe("sqlite storage backend · global 单例", () => {
  it("声明 hasGlobal 时 setGlobal/读回往返；覆盖写末次胜出", async () => {
    const root = await newTempRoot();
    const backend = new SqliteStorageBackend(root);
    const unit = await kvOf(backend).open(unitDescriptor({ hasGlobal: true }));

    const fresh = await unit.loadAll();
    expect(fresh.global).toBeNull();

    await unit.setGlobal(complexValue);
    expect((await unit.loadAll()).global).toEqual(complexValue);

    await unit.setGlobal({ replaced: ["中文", null] });
    expect((await unit.loadAll()).global).toEqual({ replaced: ["中文", null] });

    await unit.close();
    await backend.close();
  });

  it("未声明 hasGlobal 时 global 为 null（不是 undefined），setGlobal 以原文案拒绝", async () => {
    const root = await newTempRoot();
    const backend = new SqliteStorageBackend(root);
    const unit = await kvOf(backend).open(unitDescriptor({ hasGlobal: false }));

    const snapshot = await unit.loadAll();
    expect(snapshot.global).toBeNull();
    expect("global" in snapshot).toBe(true);

    await expect(unit.setGlobal({ any: 1 })).rejects.toThrow(
      "unit 'solodemo' does not have global state",
    );

    await unit.close();
    await backend.close();
  });
});

describe("sqlite storage backend · 句柄与持久性", () => {
  it("重复 open 同名 unit 抛错，文案保持", async () => {
    const root = await newTempRoot();
    const backend = new SqliteStorageBackend(root);
    const unit = await kvOf(backend).open(unitDescriptor({}));

    await expect(kvOf(backend).open(unitDescriptor({}))).rejects.toThrow(
      "unit 'solodemo' is already open; a unit has exactly one live handle",
    );

    await unit.close();
    await backend.close();
  });

  it("close 后新后端 + open 同一 unit 读回记录与 global（持久性）", async () => {
    const root = await newTempRoot();
    const descriptor = unitDescriptor({ tables: ["thing", "another_table"], hasGlobal: true });

    const firstBackend = new SqliteStorageBackend(root);
    const firstUnit = await kvOf(firstBackend).open(descriptor);
    await firstUnit.putRecord("thing", "alpha", complexValue);
    await firstUnit.putRecord("another_table", "beta", { round: 2 });
    await firstUnit.setGlobal({ generation: 7, note: "重新打开后仍应读到" });
    await firstUnit.close();
    await firstBackend.close();

    const secondBackend = new SqliteStorageBackend(root);
    const secondUnit = await kvOf(secondBackend).open(descriptor);

    const reopened = await secondUnit.loadAll();
    expect(Object.keys(reopened.tables).sort()).toEqual(["another_table", "thing"]);
    expect(tableOf(reopened, "thing")["alpha"]).toEqual(complexValue);
    expect(tableOf(reopened, "another_table")["beta"]).toEqual({ round: 2 });
    expect(reopened.global).toEqual({ generation: 7, note: "重新打开后仍应读到" });

    await secondUnit.close();
    await secondBackend.close();
  });

  it("backend.close 会关闭已打开单元，且重复 close 幂等", async () => {
    const root = await newTempRoot();
    const backend = new SqliteStorageBackend(root);
    const unit = await kvOf(backend).open(unitDescriptor({}));
    await unit.putRecord("thing", "alpha", { durable: true });

    await backend.close();
    await expect(backend.close()).resolves.toBeUndefined();

    await expect(kvOf(backend).open(unitDescriptor({ name: "other_unit" }))).rejects.toThrow(
      "backend is closed",
    );
  });
});
