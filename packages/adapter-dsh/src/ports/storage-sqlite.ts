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
 * 设计目标：
 * 1. 实现完整的 DSH StorageBackend 接口
 * 2. 支持事务（WAL 模式）
 * 3. 后期可迁移 PostgreSQL（只需改 driver）
 *
 * 迁移路径：
 * - 当前：SQLite (better-sqlite3)
 * - 未来：PostgreSQL (postgres.js)
 * 只需修改连接创建逻辑，KvUnit 接口不变。
 */

import { isAbsolute, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import Database from "better-sqlite3";

// ── 类型导入 ─────────────────────────────────────────────────────────

import type {
  StorageBackend,
  KvFacet,
  KvUnit,
  KvUnitDescriptor,
} from "@deepseek-ai/dsh-storage";

// ── 常量 ───────────────────────────────────────────────────────────────

/** 单元名和表名的正则验证（与 DSH 保持一致） */
const UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/;

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
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true, mode: 0o700 });
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
    for (const table of descriptor.tables) {
      if (!UNIT_NAME_RE.test(table)) {
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
 * 对应一个 domain 的所有表
 */
class SqliteKvUnit implements KvUnit {
  private readonly descriptor: KvUnitDescriptor;
  private db!: Database.Database;

  constructor(descriptor: KvUnitDescriptor, private readonly dbPath: string) {
    this.descriptor = descriptor;
  }

  /** 初始化数据库和表结构 */
  async initialize(): Promise<void> {
    // 创建/连接数据库
    this.db = new Database(this.dbPath);

    // WAL 模式 + 安全 pragma
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("synchronous = NORMAL");

    // 创建表
    this.createTables();
  }

  /** 创建所有表 */
  private createTables(): void {
    const createTableStmts = this.descriptor.tables.map(
      (table) => `
      CREATE TABLE IF NOT EXISTS "${table}" (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
    );

    const stmts = createTableStmts.join("\n");

    // 设置全局状态表（如果需要）
    const globalTable = this.descriptor.hasGlobal
      ? `CREATE TABLE IF NOT EXISTS __soloips_global (id INTEGER PRIMARY KEY, value TEXT NOT NULL);`
      : "";

    this.db.exec(`${globalTable}\n${stmts}`);
  }

  // ── KvUnit 接口实现 ─────────────────────────────────────────

  /**
   * 读取完整的当前快照
   */
  async loadAll(): Promise<{ tables: Record<string, Record<string, unknown>>; global: unknown }> {
    const tables: Record<string, Record<string, unknown>> = {};

    // 读取每个表
    for (const table of this.descriptor.tables) {
      const rows = this.db
        .prepare(`SELECT key, value FROM "${table}"`)
        .all() as Array<{ key: string; value: string }>;

      const records: Record<string, unknown> = {};
      for (const row of rows) {
        records[row.key] = JSON.parse(row.value);
      }
      tables[table] = records;
    }

    // 读取全局状态
    let global: unknown = null;
    if (this.descriptor.hasGlobal) {
      const row = this.db
        .prepare(`SELECT value FROM __soloips_global WHERE id = 1`)
        .get() as { value: string } | undefined;
      global = row ? JSON.parse(row.value) : null;
    }

    return { tables, global };
  }

  /**
   * 插入或更新一条记录
   */
  async putRecord(table: string, key: string, value: unknown): Promise<void> {
    this.ensureTableExists(table);

    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO "${table}" (key, value) VALUES (?, ?)`,
    );
    stmt.run(key, JSON.stringify(value));
  }

  /**
   * 删除一条记录
   */
  async deleteRecord(table: string, key: string): Promise<void> {
    this.ensureTableExists(table);

    const stmt = this.db.prepare(`DELETE FROM "${table}" WHERE key = ?`);
    stmt.run(key);
  }

  /**
   * 写入全局单例
   */
  async setGlobal(value: unknown): Promise<void> {
    if (!this.descriptor.hasGlobal) {
      throw new Error(
        `unit '${this.descriptor.name}' does not have global state`,
      );
    }

    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO __soloips_global (id, value) VALUES (1, ?)`,
    );
    stmt.run(JSON.stringify(value));
  }

  /**
   * 关闭单元
   */
  async close(): Promise<void> {
    if (this.db) {
      // WAL PASSIVE checkpoint（不删除 WAL 文件，防止数据丢失）
      this.db.pragma("wal_checkpoint(PASSIVE)");
      this.db.close();
    }
  }

  // ── 辅助方法 ─────────────────────────────────────────────

  /** 确保表存在 */
  private ensureTableExists(table: string): void {
    if (!this.descriptor.tables.includes(table)) {
      throw new Error(`table '${table}' is not declared in descriptor`);
    }
  }
}

// ── 类型导出 ───────────────────────────────────────────────────────────

export type { SqliteStorageBackend as SqliteBackend };
