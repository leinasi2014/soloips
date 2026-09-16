/**
 * storage 端口的机制测试：跨进程写权租约与 storage stack。
 *
 * 全部用真实文件系统（临时目录）与真实 dsh 工件（withFileLock /
 * JsonStorageBackend / DomainFacility），不启动任何服务。验证的是适配层自己的
 * 机制承诺：锁互斥、代际递增、逆序释放、SEAM-X1 的显式 facility。
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import {
  SoloipsAdapterError,
  type SoloipsDomainSpec,
  type SoloipsTableKeyOf,
} from "../src/contracts";
import { createStoragePort } from "../src/ports/storage";

/**
 * 桩宿主面：createStack 经 `ctx.get('storage')` 读取 hub 并在 `backend` 上注册
 * 派生名 backend；DomainFacility.open 则直接读 `ctx.storage` 属性解析同一实例。
 * 两个入口都指向同一个桩 hub。
 */
function stubContextWithHub(): { context: Context; registered: string[]; unregistered: number } {
  const registered: string[] = [];
  const backends = new Map<string, unknown>();
  const state = { unregistered: 0 };
  const storage = {
    backend: {
      register(name: string, backend: unknown) {
        registered.push(name);
        backends.set(name, backend);
        return () => {
          state.unregistered += 1;
          backends.delete(name);
        };
      },
      get(name: string) {
        return backends.get(name);
      },
      names() {
        return [...backends.keys()];
      },
    },
  };
  const stub = {
    // DomainFacility/DomainImpl 的属性读取（ctx.storage / ctx.emit）。
    storage,
    emit() {
      /* DomainImpl 在持久写后发 domain/changed；测试不消费 */
    },
    // 本端口 createStack 的读取路径。
    get(name: string, _strict?: boolean) {
      return name === "storage" ? storage : undefined;
    },
  };
  return {
    // 同上：部分 stub 经 unknown 中转，不用 any。
    context: stub as unknown as Context,
    registered,
    get unregistered() {
      return state.unregistered;
    },
  };
}

/** 无宿主服务的桩（lease 不触达 ctx，故 lease 用例不受影响）。 */
function bareContext(): Context {
  return {
    get() {
      return undefined;
    },
    emit() {
      /* noop */
    },
    // 同上：部分 stub 经 unknown 中转，不用 any。
  } as unknown as Context;
}

const tempRoots: string[] = [];

async function newTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "soloips-adapter-storage-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  }
});

/** 结构化 schema 端口（契约允许的最小实现）：证明 core 可传非 zod schema。 */
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

const testSpec = {
  name: "soloips_probe",
  version: 1,
  tables: { thing: { valueSchema: passthroughSchema } },
} satisfies SoloipsDomainSpec;

type ThingKey = SoloipsTableKeyOf<typeof testSpec, "thing">;

const thingKey = (key: string): ThingKey => key as ThingKey;

function adapterCode(error: unknown): string | undefined {
  return error instanceof SoloipsAdapterError ? error.code : undefined;
}

describe("storage port · writer lease（跨进程 fence，SEAM-X2）", () => {
  it("取得租约：generation 从 1 起，storageId 规范化，assertHeld 通过", async () => {
    const root = await newTempRoot();
    const port = createStoragePort(bareContext(), { defaultBackend: "json", leaseWaitMs: 200 });
    const lease = await port.acquireWriterLease({ root });
    expect(lease.generation).toBe(1);
    expect(lease.storageId).toBe(`json:${root}`);
    await expect(lease.assertHeld()).resolves.toBeUndefined();
    await lease.dispose();
  });

  it("租约互斥：持有期间第二个获取以 LEASE_NOT_HELD 拒绝；释放后可再取且代际递增", async () => {
    const root = await newTempRoot();
    const port = createStoragePort(bareContext(), { defaultBackend: "json", leaseWaitMs: 150 });

    const first = await port.acquireWriterLease({ root });
    await expect(port.acquireWriterLease({ root })).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_LEASE_NOT_HELD",
    });
    await first.dispose();

    const second = await port.acquireWriterLease({ root });
    expect(second.generation).toBe(2);
    const medium = JSON.parse(await readFile(join(root, ".soloips-writer-lease.json"), "utf8")) as {
      generation?: unknown;
    };
    expect(medium.generation).toBe(2);
    await second.dispose();
  });

  it("dispose 幂等；失权后 assertHeld 以 LEASE_NOT_HELD 拒绝", async () => {
    const root = await newTempRoot();
    const port = createStoragePort(bareContext(), { defaultBackend: "json", leaseWaitMs: 200 });
    const lease = await port.acquireWriterLease({ root });
    await lease.dispose();
    await expect(lease.dispose()).resolves.toBeUndefined();
    await expect(lease.assertHeld()).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_LEASE_NOT_HELD",
    });
  });

  it("相对根以 INVALID_CONFIG 拒绝（不做 home 解析）", async () => {
    const port = createStoragePort(bareContext(), { defaultBackend: "json", leaseWaitMs: 200 });
    await expect(port.acquireWriterLease({ root: "relative/root" })).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_INVALID_CONFIG",
    });
  });
});

describe("storage port · createStack / facility（SEAM-11/14、SEAM-X1）", () => {
  it("同一 canonical root 注册派生名 backend；释放时注销并关闭", async () => {
    const root = await newTempRoot();
    const hub = stubContextWithHub();
    const port = createStoragePort(hub.context, { defaultBackend: "json", leaseWaitMs: 200 });
    const stack = await port.createStack({ root });
    expect(hub.registered).toHaveLength(1);
    expect(hub.registered[0]).toMatch(/^soloips-json-[0-9a-f]{16}$/);
    expect(stack.binding).toEqual({ backend: "json", root, storageId: `json:${root}` });
    expect(stack.facility).toBeDefined();
    await stack.dispose();
    expect(hub.unregistered).toBe(1);
  });

  it("非 json backend 以 SERVICE_UNAVAILABLE fail-closed（本工件集只构造 json）", async () => {
    const root = await newTempRoot();
    const hub = stubContextWithHub();
    const port = createStoragePort(hub.context, { defaultBackend: "json", leaseWaitMs: 200 });
    await expect(port.createStack({ root, backend: "sqlite" })).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
    });
  });

  it("requireFacility：显式传入即返回同一 facility；缺省在类型层与运行期都被拒绝", async () => {
    const root = await newTempRoot();
    const hub = stubContextWithHub();
    const port = createStoragePort(hub.context, { defaultBackend: "json", leaseWaitMs: 200 });
    const stack = await port.createStack({ root });
    expect(port.requireFacility(stack.facility)).toBe(stack.facility);

    let thrown: unknown;
    try {
      // @ts-expect-error SEAM-X1: requireFacility 实参必填，省略即 TS2554（contracts-design §6 #2 的类型层强制）
      port.requireFacility();
    } catch (error) {
      thrown = error;
    }
    expect(adapterCode(thrown)).toBe("SOLOIPS_ADAPTER_FACILITY_REQUIRED");
    await stack.dispose();
  });
});

describe("storage port · 域打开经 spec 桥（结构化 schema → 宿主 DomainSpec）", () => {
  it("open → put → get → close 全链路走真实 JsonStorageBackend 与 DomainFacility", async () => {
    const root = await newTempRoot();
    const hub = stubContextWithHub();
    const port = createStoragePort(hub.context, { defaultBackend: "json", leaseWaitMs: 200 });
    const stack = await port.createStack({ root });
    const facility = port.requireFacility(stack.facility);

    const domain = await facility.open(testSpec);
    expect(domain.name).toBe("soloips_probe");
    const table = domain.table("thing");
    await table.put(thingKey("alpha"), { hello: "world" });
    expect(table.get(thingKey("alpha"))).toEqual({ hello: "world" });
    expect(table.size).toBe(1);
    await domain.close();
    await stack.dispose();
  });

  it("同一 facility 实例内重复 open 同名 domain 以 DOMAIN_ALREADY_OPEN 拒绝（仅同实例保证）", async () => {
    const root = await newTempRoot();
    const hub = stubContextWithHub();
    const port = createStoragePort(hub.context, { defaultBackend: "json", leaseWaitMs: 200 });
    const stack = await port.createStack({ root });
    const facility = port.requireFacility(stack.facility);
    const domain = await facility.open(testSpec);
    await expect(facility.open(testSpec)).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_DOMAIN_ALREADY_OPEN",
    });
    await domain.close();
    await stack.dispose();
  });
});
