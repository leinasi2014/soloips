/**
 * SOLOIPS-SQLITE-STORAGE-BACKEND
 *
 * SQLite 存储后端实现，实现 DSH StorageBackend 接口（KvFacet + KvUnit）。
 *
 * DSH 接口契约：
 * - StorageBackend { kv?: KvFacet, close(): Promise<void> }
 * - KvFacet { open(descriptor): Promise<KvUnit> }
 * - KvUnit { loadAll, putRecord, deleteRecord, setGlobal, close }
 *
 * 本文件的两层职责：
 * 1. 查询构造 —— Drizzle（`drizzle-orm/better-sqlite3` driver +
 *    `drizzle-orm/sqlite-core` 的 `sqliteTable`）。读写与建表都经 Drizzle 的 SQL
 *    构造器（`db.select/insert/delete`、`sql.identifier`）生成，表形状只有一处定义
 *    （descriptor → `sqliteTable` → `getTableConfig`），不再有手写 SQL 与表对象两处漂移。
 * 2. 连接生命周期与 PRAGMA —— 仍由 better-sqlite3 直接承担：Drizzle 不管理 PRAGMA，
 *    也不管理连接；`drizzle()` 只是包装一个已存在的 `Database` 实例。
 *
 * 表是**运行期**声明的：表名集合来自 KvUnitDescriptor.tables（core 侧 spec），因此在
 * 每个 unit initialize 时按 descriptor 逐个调用 `sqliteTable()` 构造表对象；全局表
 * `__soloips_global(id, value)` 只在 descriptor 声明 `hasGlobal` 时纳入 schema 并创建。
 *
 * drizzle-kit **未**接入：表由 descriptor 在运行期声明，没有可用于生成静态迁移的编译期
 * schema，drizzle-kit 的静态迁移流程不适用（仓库内也没有 drizzle.config）。建表由上述
 * 表对象经 `getTableConfig` 在 initialize 时幂等执行（`CREATE TABLE IF NOT EXISTS`）。
 *
 * 迁移 PostgreSQL 的真实迁移面（不是「只需修改连接创建逻辑」）：
 * - 换 driver：`drizzle-orm/postgres-js`（同为 Drizzle driver，不同包与连接语义）；
 * - **连接层需重写**：PRAGMA（journal_mode/foreign_keys/busy_timeout/synchronous）与
 *   `wal_checkpoint(PASSIVE)` 是 SQLite 特有语义，PG 无对应物，不随 driver 迁移；
 * - **写权机制需另行设计**：当前跨进程写权是单机文件锁 + 租约代际（见 storage.ts），
 *   PG 多机部署需改为数据库侧协调（事务 / advisory lock 等）；
 * - 存量数据需导出导入并逐项核对；
 * - 不变的是：unit schema 形状与 core 的调用面（KvFacet/KvUnit 方法集）。
 *
 * 已知缺口（**重构前既有**，本次按「行为逐项保持」原样保留，不在本文件修复范围）：
 * 介质上未写 unit version 戳、无 version-mismatch 判定、无 malformed-medium 判定、
 * 抛裸 `Error` 而非 StorageError、未消费 `layout`/`compatibleVersions`、
 * unit close 后无 closed 守卫。
 */

import { existsSync, mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import Database from "better-sqlite3";
import { eq, sql, type SQL } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getTableConfig, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

// ── 类型导入 ─────────────────────────────────────────────────────────

import type { StorageBackend, KvFacet, KvUnit, KvUnitDescriptor } from "@deepseek-ai/dsh-storage";

// ── 同包导入 ─────────────────────────────────────────────────────────

import { mapHostError } from "./shared.js";

// ── 常量 ───────────────────────────────────────────────────────────────

/** 单元名和表名的正则验证（与 DSH 保持一致） */
const UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/;

/** 全局单例表的表名（介质格式的一部分，非 descriptor 声明）。 */
const GLOBAL_TABLE_NAME = "__soloips_global";

/** 全局单例的行 id：单行表，固定写 id = 1。 */
const GLOBAL_SINGLETON_ID = 1;

// ── Drizzle schema 定义（表形状的唯一来源） ───────────────────────────

/**
 * 记录表形状：`key` 文本主键 + `value` JSON 文本。
 *
 * `sqliteTable()` 是普通函数（非编译期宏），故按 descriptor.tables 在运行期逐单元构造；
 * 每个 unit 在自己 initialize 时构造自己的表对象集合，表名不受外部输入影响
 * （open 前已由 UNIT_NAME_RE 校验）。
 */
function createRecordTable(name: string) {
  return sqliteTable(name, {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
  });
}

type RecordTable = ReturnType<typeof createRecordTable>;

/** 全局单例表形状：`id` 整数主键 + `value` JSON 文本（仅在 hasGlobal 时构造）。 */
function createGlobalTable() {
  return sqliteTable(GLOBAL_TABLE_NAME, {
    id: integer("id").primaryKey(),
    value: text("value").notNull(),
  });
}

type GlobalTable = ReturnType<typeof createGlobalTable>;

/** 传给 `drizzle()` 的 schema 映射：unit 表名 → 表对象。 */
type UnitSchema = Record<string, SQLiteTable>;

/**
 * 由 Drizzle 表对象生成 `CREATE TABLE IF NOT EXISTS` 语句。
 *
 * 经 `getTableConfig` 读回列定义、再用 `sql.identifier` 交给方言转义，使 DDL 与查询
 * 共用同一份 schema 定义。`sql.raw` 只用于列类型串（来自本文件的 column builder，
 * 非外部输入）；表名与列名一律走 `sql.identifier`。
 *
 * 注：`primaryKey()` 列在 Drizzle 中 `notNull` 为真，故新建库的 DDL 会显式带上
 * `not null`（旧实现手写 SQL 的 `key TEXT PRIMARY KEY` 未带）。既有介质走
 * `IF NOT EXISTS`，不受影响；对调用面无可观察差异（key 恒为调用方给出的字符串）。
 */
function createTableStatement(table: RecordTable | GlobalTable): SQL {
  const config = getTableConfig(table);
  const columns = config.columns.map((column) => {
    const parts = [sql.identifier(column.name), sql.raw(column.getSQLType())];
    if (column.primary) parts.push(sql.raw("primary key"));
    if (column.notNull) parts.push(sql.raw("not null"));
    return sql.join(parts, sql` `);
  });
  return sql`CREATE TABLE IF NOT EXISTS ${sql.identifier(config.name)} (${sql.join(columns, sql`, `)})`;
}

// ── SQLite 后端实现 ───────────────────────────────────────────────────

/**
 * SQLite 存储后端
 *
 * 实现 DSH StorageBackend 接口，支持 KvFacet（键值操作）
 */
export class SqliteStorageBackend implements StorageBackend {
  /** 已打开的单元映射 */
  private readonly units = new Map<string, SqliteKvUnit>();

  /** 打开中的单元 Promise（防止重复打开） */
  private readonly opening = new Map<string, Promise<SqliteKvUnit>>();

  /** 后端是否已关闭 */
  private closed = false;

  constructor(private readonly root: string) {
    if (!isAbsolute(root)) {
      throw new Error(`SQLite backend root must be absolute, got '${root}'`);
    }

    // 确保目录存在
    //
    // 〔D-5〕构造期 `mkdirSync` 是**介质前置条件**（better-sqlite3 打开 `${name}.db`
    // 要求父目录存在），故不能像 json 后端那样把 mkdir 推迟到 open；但失败形态必须
    // 与 json 侧一致：经 `mapHostError` 收敛为契约码（`SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE`），
    // 而不是抛裸 Node ErrnoException（`ENOTDIR`/`EACCES`…）——调用方只 switch 契约码，
    // 不解析 message，裸 errno 会让「root 不可创建」在两个后端下不可统一处理。
    // 选 `SERVICE_UNAVAILABLE` 而非 `INVALID_CONFIG`：root 的**值形状**已在
    // `canonicalRoot` 校验（INVALID_CONFIG 只用于那一层），此处失败是环境事实。
    // 非绝对路径的裸 `Error` 保持原样：那是编程错误护栏（契约路径已先经
    // `canonicalRoot` 拒绝），文案与既有测试逐字一致。
    if (!existsSync(this.root)) {
      try {
        mkdirSync(this.root, { recursive: true, mode: 0o700 });
      } catch (error: unknown) {
        throw mapHostError(`storage.createStack: creating sqlite root '${this.root}'`, error);
      }
    }
  }

  // ── KvFacet 实现 ────────────────────────────────────────────────

  /** KV 操作面 */
  readonly kv: KvFacet = {
    open: async (descriptor: KvUnitDescriptor): Promise<KvUnit> => {
      if (this.closed) {
        throw new Error("backend is closed");
      }

      // 验证 descriptor
      this.validateDescriptor(descriptor);

      // 检查是否已打开或正在打开
      if (this.units.has(descriptor.name)) {
        throw new Error(
          `unit '${descriptor.name}' is already open; a unit has exactly one live handle`,
        );
      }
      if (this.opening.has(descriptor.name)) {
        throw new Error(`unit '${descriptor.name}' is already opening`);
      }

      // 创建打开 Promise
      const opening = this.openUnit(descriptor);
      this.opening.set(descriptor.name, opening);

      try {
        const unit = await opening;
        this.units.set(descriptor.name, unit);
        return unit;
      } finally {
        this.opening.delete(descriptor.name);
      }
    },
  };

  /** 打开一个单元 */
  private async openUnit(descriptor: KvUnitDescriptor): Promise<SqliteKvUnit> {
    const dbPath = join(this.root, `${descriptor.name}.db`);
    const unit = new SqliteKvUnit(descriptor, dbPath);
    await unit.initialize();
    return unit;
  }

  /** 验证 descriptor（防注入） */
  private validateDescriptor(descriptor: KvUnitDescriptor): void {
    if (!UNIT_NAME_RE.test(descriptor.name)) {
      throw new Error(`invalid unit name: ${descriptor.name}`);
    }
    if (typeof descriptor.version !== "number" || descriptor.version < 0) {
      throw new Error(`invalid unit version: ${descriptor.version}`);
    }
    if (!Array.isArray(descriptor.tables)) {
      throw new Error(`invalid tables: ${descriptor.tables}`);
    }
    // 〔为什么逐元素再判 `typeof`〕`descriptor.tables` 的声明类型是 `readonly string[]`，
    // 但本函数是**防注入边界**：调用方可能未经类型检查（JS 调用方、`as` 断言）传入非字符串
    // 元素。`RegExp.test` 会对其做 ToString 强制转换，于是 `{ toString: () => "evil" }`
    // 能通过 `UNIT_NAME_RE` 并被当作表名使用——正是本函数要挡的注入面。逐元素判类型把
    // 该路径改成 fail-closed。
    //
    // 〔为什么必须显式判 `typeof` 而不是只写 `Array.isArray`〕`Array.isArray(x)` 对
    // `readonly string[]` 的窄化结果是 `any[]`（lib.es5 的签名 `arg is any[]`），
    // 元素类型因此退化成 `any` 并触发 `typescript/no-unsafe-argument`（实测）。
    // 加上 `typeof` 判据后元素类型仍是 `string`，无需断言。
    for (const table of descriptor.tables) {
      if (typeof table !== "string" || !UNIT_NAME_RE.test(table)) {
        throw new Error(`invalid table name: ${table}`);
      }
    }
  }

  // ── 生命周期 ────────────────────────────────────────────────

  /** 关闭后端 */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // 等待所有正在打开的单元
    await Promise.allSettled([...this.opening.values()].map((p) => p.catch(() => {})));

    // 关闭所有已打开的单元
    const closePromises = [...this.units.values()].map((unit) => unit.close());
    await Promise.allSettled(closePromises);
    this.units.clear();
  }

  /** 获取根路径 */
  getRoot(): string {
    return this.root;
  }
}

// ── SQLite KV 单元实现 ─────────────────────────────────────────────

/**
 * SQLite KV 单元实现
 * 对应一个 domain 的所有表（每个单元一个独立 `${name}.db` 文件）
 *
 * 〔为什么这些方法都是 `async` 而体内无 `await`〕本类把 better-sqlite3 的**同步**
 * API（`Database#prepare/run/close`、Drizzle 的同步 driver）包装成 `KvUnit` 的
 * **异步契约**（`loadAll`/`putRecord`/`deleteRecord`/`setGlobal`/`close` 在
 * `@deepseek-ai/dsh-storage` 的 `backend.d.ts` 里逐条声明为 `Promise<…>`）。
 * `async` 在这里**不是**装饰：
 *  1. 返回值必须是 Promise——契约声明如此，调用方（core 经 domain 层）按 thenable 等待；
 *  2. 同步抛错必须呈现为 **rejection** 而不是同步抛出（实测：非 async 版本同步抛出，
 *     async 版本返回已 rejected 的 Promise）。本类里 `JSON.parse`（loadAll）、
 *     `JSON.stringify`（putRecord/setGlobal）、`new Database`/DDL（initialize）、
 *     `client.close()`（close）都可能抛——契约的失败通道是 rejection。
 * 故保留 `async` 并用 `oxlint-disable-next-line typescript/require-await` 标注：
 * 该规则按「有无 await」判据，无法表达「契约要求 Promise + 同步实现」这一正当形态。
 * **不得**为消警告塞 `await Promise.resolve()`——那是为工具制造的噪声语句。
 */
class SqliteKvUnit implements KvUnit {
  private readonly descriptor: KvUnitDescriptor;

  /** better-sqlite3 连接：PRAGMA 与连接生命周期走这一层（Drizzle 不管理） */
  private client!: Database.Database;

  /** Drizzle 查询构造器，包装上面同一个 `Database` 实例 */
  private db!: BetterSQLite3Database<UnitSchema>;

  /** descriptor.tables → 运行期构造的表对象（插入顺序即 descriptor 顺序） */
  private readonly recordTables = new Map<string, RecordTable>();

  /** 全局单例表对象，仅当 descriptor 声明 hasGlobal 时存在 */
  private globalTable: GlobalTable | undefined;

  constructor(
    descriptor: KvUnitDescriptor,
    private readonly dbPath: string,
  ) {
    this.descriptor = descriptor;
  }

  /** 初始化数据库、表对象与表结构 */
  // oxlint-disable-next-line typescript/require-await -- KvUnit 契约；better-sqlite3 同步 API（见类头注）
  async initialize(): Promise<void> {
    // 创建/连接数据库
    this.client = new Database(this.dbPath);

    // WAL 模式 + 安全 pragma（SQLite 特有语义，不经 Drizzle）
    this.client.pragma("journal_mode = WAL");
    this.client.pragma("foreign_keys = ON");
    this.client.pragma("busy_timeout = 5000");
    this.client.pragma("synchronous = NORMAL");

    // 按 descriptor 运行期构造表对象（表形状的唯一来源）
    for (const table of this.descriptor.tables) {
      this.recordTables.set(table, createRecordTable(table));
    }
    this.globalTable = this.descriptor.hasGlobal ? createGlobalTable() : undefined;

    // Drizzle 包装同一连接；schema 与查询共用同一批表对象
    const schema: UnitSchema = {};
    for (const [name, table] of this.recordTables) {
      schema[name] = table;
    }
    if (this.globalTable !== undefined) {
      schema[GLOBAL_TABLE_NAME] = this.globalTable;
    }
    this.db = drizzle(this.client, { schema });

    // 创建表
    this.createTables();
  }

  /** 创建所有表（幂等：CREATE TABLE IF NOT EXISTS；全局表在前，与既有 DDL 顺序一致） */
  private createTables(): void {
    if (this.descriptor.hasGlobal) {
      this.db.run(createTableStatement(this.requireGlobalTable()));
    }
    for (const table of this.recordTables.values()) {
      this.db.run(createTableStatement(table));
    }
  }

  // ── KvUnit 接口实现 ─────────────────────────────────────────

  /**
   * 读取完整的当前快照
   *
   * 对 descriptor 声明但 0 行的表仍写入空对象 `{}`（表集合保持完整）；未声明 global 时
   * `global` 为 `null`（domain 层以 null 作为「从未写入」哨兵）。
   */
  // oxlint-disable-next-line typescript/require-await -- KvUnit 契约；better-sqlite3 同步 API（见类头注）
  async loadAll(): Promise<{ tables: Record<string, Record<string, unknown>>; global: unknown }> {
    const tables: Record<string, Record<string, unknown>> = {};

    // 读取每个表（迭代运行期表对象集合，与 descriptor.tables 同源同序）
    for (const [name, table] of this.recordTables) {
      const rows: Array<{ key: string; value: string }> = this.db
        .select({ key: table.key, value: table.value })
        .from(table)
        .all();

      const records: Record<string, unknown> = {};
      for (const row of rows) {
        records[row.key] = JSON.parse(row.value);
      }
      tables[name] = records;
    }

    // 读取全局状态
    let global: unknown = null;
    if (this.descriptor.hasGlobal) {
      const globalTable = this.requireGlobalTable();
      const row: { value: string } | undefined = this.db
        .select({ value: globalTable.value })
        .from(globalTable)
        .where(eq(globalTable.id, GLOBAL_SINGLETON_ID))
        .get();
      global = row === undefined ? null : JSON.parse(row.value);
    }

    return { tables, global };
  }

  /**
   * 插入或更新一条记录（覆盖写）
   *
   * 用 `.onConflictDoUpdate({ target: key, set: value })` 表达覆盖语义：与
   * `INSERT OR REPLACE` 等价，但走标准 upsert 语法（跨方言可移植；PG 侧同一构造器）。
   */
  // oxlint-disable-next-line typescript/require-await -- KvUnit 契约；better-sqlite3 同步 API（见类头注）
  async putRecord(table: string, key: string, value: unknown): Promise<void> {
    const recordTable = this.ensureTableExists(table);
    const serialized = JSON.stringify(value);

    this.db
      .insert(recordTable)
      .values({ key, value: serialized })
      .onConflictDoUpdate({ target: recordTable.key, set: { value: serialized } })
      .run();
  }

  /**
   * 删除一条记录（幂等：key 不存在即空操作）
   */
  // oxlint-disable-next-line typescript/require-await -- KvUnit 契约；better-sqlite3 同步 API（见类头注）
  async deleteRecord(table: string, key: string): Promise<void> {
    const recordTable = this.ensureTableExists(table);

    this.db.delete(recordTable).where(eq(recordTable.key, key)).run();
  }

  /**
   * 写入全局单例（单行表 id = 1，覆盖写）
   */
  // oxlint-disable-next-line typescript/require-await -- KvUnit 契约；better-sqlite3 同步 API（见类头注）
  async setGlobal(value: unknown): Promise<void> {
    const globalTable = this.requireGlobalTable();
    const serialized = JSON.stringify(value);

    this.db
      .insert(globalTable)
      .values({ id: GLOBAL_SINGLETON_ID, value: serialized })
      .onConflictDoUpdate({ target: globalTable.id, set: { value: serialized } })
      .run();
  }

  /**
   * 关闭单元
   */
  // oxlint-disable-next-line typescript/require-await -- KvUnit 契约；better-sqlite3 同步 API（见类头注）
  async close(): Promise<void> {
    if (this.client) {
      // WAL PASSIVE checkpoint（不删除 WAL 文件，防止数据丢失）
      this.client.pragma("wal_checkpoint(PASSIVE)");
      this.client.close();
    }
  }

  // ── 辅助方法 ─────────────────────────────────────────────

  /**
   * 确保表在 descriptor 中声明，并返回其 Drizzle 表对象
   *
   * 声明集合与表对象同源（都由 descriptor.tables 构造），故一次查表即同时完成
   * 「未声明即拒绝」与「取表对象」；拒绝时的错误文案不变。
   */
  private ensureTableExists(table: string): RecordTable {
    const found = this.recordTables.get(table);
    if (found === undefined) {
      throw new Error(`table '${table}' is not declared in descriptor`);
    }
    return found;
  }

  /** 取全局表对象；descriptor 未声明 hasGlobal 时以原文案拒绝 */
  private requireGlobalTable(): GlobalTable {
    const table = this.globalTable;
    if (table === undefined) {
      throw new Error(`unit '${this.descriptor.name}' does not have global state`);
    }
    return table;
  }
}

// ── 类型导出 ───────────────────────────────────────────────────────────

export type { SqliteStorageBackend as SqliteBackend };
