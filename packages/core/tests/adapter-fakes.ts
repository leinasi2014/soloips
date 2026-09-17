/**
 * adapter 端口的测试替身（fake）：只实现 soloips-adapter-dsh/contracts 的
 * 冻结契约面，不 import adapter 的运行时代码（adapter 由另一写者并行实现）。
 *
 * 介质模型：同一 root 的表数据放在模块级 Map 中，close 后仍保留——
 * 「写入 → 停止 → 同一 root 重开 → 读回」由此模拟（SOLO-ACC-05 的进程外介质）。
 * 读取/写入均经 spec 的 valueSchema 校验，镜像 durable 边界行为。
 *
 * 事件日志（events）按序记录 lease/stack/open/assert/write/close 等关键点，
 * 用于断言打开顺序与「每次发布前 assertHeld」的纪律。
 */

import type {
  SoloipsDomain,
  SoloipsDomainFacility,
  SoloipsDomainSpec,
  SoloipsKvTable,
  SoloipsStoragePort,
  SoloipsStorageStack,
  SoloipsTableKeyOf,
  SoloipsTableValueOf,
  SoloipsValueSchema,
  SoloipsWriterLease,
} from "soloips-adapter-dsh/contracts";

/** 与 SoloipsAdapterError 同形的 fake 错误（结构判别 code，不 import 运行时）。 */
export class FakeAdapterError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// root → table → key → value：模拟跨进程存活的介质。
const media = new Map<string, Map<string, Map<string, unknown>>>();
// root → 当前持权代际：后来的 acquire 递增，旧 lease 的 assertHeld 失败。
const leaseGenerations = new Map<string, number>();
const events: string[] = [];
let assertCalls = 0;

export function fakeAdapterEvents(): readonly string[] {
  return events;
}

/** 每次断言的累计计数；写事件携带该计数以证明「写前必有新断言」。 */
export function fakeLeaseAssertCount(): number {
  return assertCalls;
}

export function resetFakeAdapter(): void {
  // 清理所有 root 的媒体数据（确保 schema 变更后测试隔离）
  media.clear();
  leaseGenerations.clear();
  events.length = 0;
  assertCalls = 0;
}

/** 测试直达介质（模拟损坏/注入未决操作）；仅测试可调用。 */
export function fakeMediumTable(root: string, table: string): Map<string, unknown> {
  const tables = tablesOf(root);
  let map = tables.get(table);
  if (map === undefined) {
    map = new Map();
    tables.set(table, map);
  }
  return map;
}

/** 模拟另一进程取得写权：代际递增，旧 writer 失权。 */
export function fakeTakeoverLease(root: string): number {
  const generation = (leaseGenerations.get(root) ?? 0) + 1;
  leaseGenerations.set(root, generation);
  return generation;
}

function tablesOf(root: string): Map<string, Map<string, unknown>> {
  let tables = media.get(root);
  if (tables === undefined) {
    tables = new Map();
    media.set(root, tables);
  }
  return tables;
}

function fakeLease(root: string, generation: number): SoloipsWriterLease {
  return {
    generation,
    storageId: `fake:${root}`,
    async assertHeld() {
      assertCalls += 1;
      events.push("assert");
      if ((leaseGenerations.get(root) ?? generation) !== generation) {
        throw new FakeAdapterError("SOLOIPS_ADAPTER_LEASE_NOT_HELD", `代际 ${generation} 已失权`);
      }
    },
    async dispose() {
      events.push(`lease-dispose:${root}`);
    },
  };
}

function fakeFacility(root: string): SoloipsDomainFacility {
  const openNames = new Set<string>();
  return {
    async open<S extends SoloipsDomainSpec>(spec: S): Promise<SoloipsDomain<S>> {
      events.push(`open:${spec.name}`);
      // 同一 facility 实例内唯一 opener（SOLO-ACC-02 的机制面）。
      if (openNames.has(spec.name)) {
        throw new FakeAdapterError("SOLOIPS_ADAPTER_DOMAIN_ALREADY_OPEN", `${spec.name} 已打开`);
      }
      openNames.add(spec.name);
      // 存量记录校验：默认策略为整次 open 拒绝（权威数据）。
      for (const [name, tableSpec] of Object.entries(spec.tables)) {
        const map = fakeMediumTable(root, name);
        for (const [key, value] of map) {
          if (!tableSpec.valueSchema.safeParse(value).success) {
            throw new FakeAdapterError("invalid-record", `存量记录 ${name}/${key} 不符合 schema`);
          }
        }
      }
      return fakeDomain(root, spec, openNames);
    },
    async closeAll() {
      openNames.clear();
    },
  };
}

/** 独立 facility（SOLO-ACC-02 的同实例重复 open 用例直接使用）。 */
export function fakeDomainFacility(root: string): SoloipsDomainFacility {
  return fakeFacility(root);
}

function fakeDomain<S extends SoloipsDomainSpec>(
  root: string,
  spec: S,
  openNames: Set<string>,
): SoloipsDomain<S> {
  return {
    name: spec.name,
    // 无 global 槽的 spec 下契约把该成员类型定为 never——真实现不提供可调用
    // 句柄；测试替身以 never 占位满足类型，core 的 spec 无 global，永不被访问。
    global: undefined!,
    table<N extends keyof S["tables"] & string>(name: N) {
      // 契约的 tables 是 Readonly<Record<...>>，在 noUncheckedIndexedAccess 下取值可能为
      // undefined。测试替身按「调用方保证该表已声明」的前提取值，缺失即抛出，
      // 不把 undefined 静默传给下游。
      const tableSpec: SoloipsDomainTableLike | undefined = spec.tables[name];
      if (tableSpec === undefined) {
        throw new TypeError(`[test-fake] domain spec 缺该表声明：${String(name)}`);
      }
      return fakeTable(
        fakeMediumTable(root, String(name)),
        tableSpec.valueSchema,
        `${root}/${String(name)}`,
      ) as SoloipsKvTable<SoloipsTableKeyOf<S, N>, SoloipsTableValueOf<S, N>>;
    },
    async close() {
      events.push(`close:${spec.name}`);
      openNames.delete(spec.name);
    },
  };
}

/** spec.tables 的最小结构（避免为 Record 索引写宽类型）。 */
interface SoloipsDomainTableLike {
  readonly valueSchema: SoloipsValueSchema<unknown>;
}

function validated<V>(schema: SoloipsValueSchema<V>, value: unknown, what: string): V {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new FakeAdapterError("invalid-record", `${what} 不符合 schema`);
  }
  return result.data;
}

function fakeTable<K extends string, V>(
  map: Map<string, unknown>,
  schema: SoloipsValueSchema<V>,
  label: string,
): SoloipsKvTable<K, V> {
  return {
    get(key) {
      const raw = map.get(key);
      return raw === undefined ? undefined : validated(schema, raw, `${label}/${key}`);
    },
    *entries() {
      for (const [key, value] of Array.from(map.entries())) {
        yield [key, validated(schema, value, `${label}/${key}`)] as [K, V];
      }
    },
    *keys() {
      for (const key of Array.from(map.keys())) {
        yield key as K;
      }
    },
    get size() {
      return map.size;
    },
    async put(key, value) {
      events.push(`write:${label}:${key}@assert=${assertCalls}`);
      validated(schema, value, `${label}/${key}`);
      map.set(key, value);
    },
    async delete(key) {
      events.push(`write-delete:${label}:${key}@assert=${assertCalls}`);
      return map.delete(key);
    },
    async update(key, revise) {
      events.push(`write-update:${label}:${key}@assert=${assertCalls}`);
      const raw = map.get(key);
      if (raw === undefined) {
        throw new FakeAdapterError("missing-key", `${label}/${key} 不存在`);
      }
      const current = validated(schema, raw, `${label}/${key}`);
      const next = validated(schema, revise(current), `${label}/${key}`);
      map.set(key, next);
      return next;
    },
  };
}

export function fakeStoragePort(): SoloipsStoragePort {
  return {
    async acquireWriterLease(options) {
      events.push(`lease-acquire:${options.root}`);
      const generation = (leaseGenerations.get(options.root) ?? 0) + 1;
      leaseGenerations.set(options.root, generation);
      return fakeLease(options.root, generation);
    },
    async createStack(options): Promise<SoloipsStorageStack> {
      events.push(`stack-create:${options.root}`);
      const root = options.root;
      return {
        facility: fakeFacility(root),
        binding: {
          backend: options.backend ?? "json",
          root,
          storageId: `fake:${root}`,
        },
        async dispose() {
          events.push(`stack-dispose:${root}`);
        },
      };
    },
    requireFacility(facility) {
      if (facility === undefined) {
        throw new FakeAdapterError("SOLOIPS_ADAPTER_FACILITY_REQUIRED", "必须显式提供 facility");
      }
      return facility;
    },
  };
}

/** open 抛错的 facility（用于失败路径的释放顺序断言）。 */
export function fakeFailingOpenStoragePort(): SoloipsStoragePort {
  const port = fakeStoragePort();
  return {
    ...port,
    async createStack(options) {
      const stack = await port.createStack(options);
      return {
        ...stack,
        facility: {
          async open() {
            throw new FakeAdapterError("SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE", "open 注定失败");
          },
          async closeAll() {
            /* 无打开的 domain */
          },
        },
      };
    },
  };
}
