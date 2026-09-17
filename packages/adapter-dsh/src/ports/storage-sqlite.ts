/**
 * SOLOIPS-SQLITE-STORAGE-BACKEND
 *
 * SQLite 存储后端实现，使用 Drizzle ORM + better-sqlite3。
 *
 * 设计目标：
 * 1. 与 DSH storage backend 接口兼容
 * 2. 支持事务（WAL 模式）
 * 3. 后期可迁移 PostgreSQL（只需改 driver）
 *
 * 迁移路径：
 * - 当前：SQLite (better-sqlite3)
 * - 未来：PostgreSQL (postgres.js / node-postgres)
 * 只需修改 driver，schema 不变。
 */

import { isAbsolute, join } from "node:path";
import Database from "better-sqlite3";

// ── SQLite Backend ────────────────────────────────────────────────────────────

/**
 * SQLite 存储后端
 *
 * 实现 DSH storage backend 接口（参考 @deepseek-ai/dsh-storage-json）
 * 使用 WAL 模式支持读写并发
 */
export class SqliteStorageBackend {
  private db!: Database.Database;
  private readonly root: string;
  private closed = false;

  constructor(root: string) {
    if (!isAbsolute(root)) {
      throw new TypeError(`SQLite backend root must be absolute, got '${root}'`);
    }
    this.root = root;
  }

  /** 初始化后端（惰性初始化） */
  private ensureInitialized(): void {
    if (this.closed) {
      throw new Error("SQLiteStorageBackend is already closed");
    }
    if (this.db) return;

    // 同步创建目录
    const { existsSync, mkdirSync } = require("node:fs");
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
    }

    const dbPath = join(this.root, "soloips.db");
    this.db = new Database(dbPath);

    // WAL 模式 + 安全 pragma
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");

    // 初始化表（如果不存在）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS soloips_company_company (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS soloips_company_department (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS soloips_company_employee (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS soloips_company_appointment (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS soloips_company_document_version (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS soloips_company_operation (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  /** 获取表名 */
  private tableName(domain: string, table: string): string {
    return `${domain}_${table}`;
  }

  // ── DSH Backend 接口实现 ────────────────────────────────────────────────

  /**
   * 读取单条记录
   */
  get(domain: string, table: string, key: string): unknown | undefined {
    this.ensureInitialized();

    const stmt = this.db.prepare(
      `SELECT value FROM ${this.tableName(domain, table)} WHERE key = ?`,
    );
    const row = stmt.get(key) as { value: string } | undefined;

    if (!row) return undefined;
    return JSON.parse(row.value);
  }

  /**
   * 写入单条记录
   */
  async put(domain: string, table: string, key: string, value: unknown): Promise<void> {
    this.ensureInitialized();

    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO ${this.tableName(domain, table)} (key, value) VALUES (?, ?)`,
    );
    stmt.run(key, JSON.stringify(value));
  }

  /**
   * 删除记录
   */
  async delete(domain: string, table: string, key: string): Promise<void> {
    this.ensureInitialized();

    const stmt = this.db.prepare(`DELETE FROM ${this.tableName(domain, table)} WHERE key = ?`);
    stmt.run(key);
  }

  /**
   * 列出所有记录
   */
  list(domain: string, table: string): IterableIterator<[string, unknown]> {
    this.ensureInitialized();

    const stmt = this.db.prepare(`SELECT key, value FROM ${this.tableName(domain, table)}`);
    const rows = stmt.all() as Array<{ key: string; value: string }>;

    // 转换为 IterableIterator
    const result: [string, unknown][] = rows.map((row) => [row.key, JSON.parse(row.value)]);
    return result[Symbol.iterator]();
  }

  /**
   * 获取表大小
   */
  size(domain: string, table: string): number {
    this.ensureInitialized();

    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName(domain, table)}`);
    const row = stmt.get() as { count: number };
    return row.count;
  }

  /**
   * 关闭后端
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    if (this.db) {
      // 关闭 WAL checkpoint
      this.db.pragma("wal_checkpoint(TRUNCATE)");
      this.db.close();
    }
  }

  /**
   * 获取根路径
   */
  getRoot(): string {
    return this.root;
  }
}
