/**
 * storage 端口的机制测试：storage stack 与域打开经 spec 桥。
 *
 * 全部用真实文件系统（临时目录）与真实 dsh 工件（JsonStorageBackend /
 * DomainFacility），不启动任何服务。验证的是适配层自己的机制承诺：逆序释放、
 * SEAM-X1 的显式 facility、结构化 schema 的窄化。
 *
 * 〔租约用例去哪了〕写权租约（互斥载体 / 代际语义 / 释放语义 / 介质损坏）已
 * 迁至 `writer-lease.spec.ts`——那是独立的一类机制（跨进程 fence），且本文件
 * 的用例需要宿主桩而租约不需要。原 describe「storage port · writer lease」的
 * 断言在那边逐条保留并补齐。
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { Storage, StorageBackend } from "@deepseek-ai/dsh-storage";
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
  const backends = new Map<string, StorageBackend>();
  const state = { unregistered: 0 };
  // 显式声明本替身**实际模拟**的官方成员面，并从中派生约束类型：
  // 参数会得到上下文类型（而不只是事后推断），未使用的成员（Storage 的
  // forms/mount/form/domain 等）无需伪造。
  type StorageUsedSurface = {
    backend: Pick<Storage["backend"], "register" | "get" | "names">;
  };
  const storage = {
    backend: {
      register(name: string, backend: StorageBackend) {
        registered.push(name);
        backends.set(name, backend);
        return () => {
          state.unregistered += 1;
          backends.delete(name);
        };
      },
      get(name: string): StorageBackend {
        // 真实 BackendRegistry.get 返回非可选 StorageBackend（缺失时由宿主抛错）。
        // 桩按同一签名；缺失即抛，不静默返回 undefined。
        const found = backends.get(name);
        if (found === undefined) throw new Error(`[test-stub] 未注册的 backend：${name}`);
        return found;
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
  // 让每个**实际模拟的**官方成员都受派生类型约束：`storage` 用上面声明窄面，
  // `get`/`emit` 直接取自 Context。签名写错即在这里编译失败。
  const stubSatisfiesUsedSurface = stub satisfies Pick<Context, "get" | "emit"> & {
    storage: StorageUsedSurface;
  };
  return {
    context: stubSatisfiesUsedSurface as unknown as Context,
    registered,
    get unregistered() {
      return state.unregistered;
    },
  };
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

  it("非支持 backend 以 SERVICE_UNAVAILABLE fail-closed（本工件集支持 json/sqlite）", async () => {
    const root = await newTempRoot();
    const hub = stubContextWithHub();
    const port = createStoragePort(hub.context, { defaultBackend: "json", leaseWaitMs: 200 });
    await expect(port.createStack({ root, backend: "postgres" })).rejects.toMatchObject({
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
