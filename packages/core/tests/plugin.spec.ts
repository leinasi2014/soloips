/**
 * 插件入口行为测试：fail-closed 发布语义（SOLO-F04 / contracts-design §8.1）。
 *
 * 不启动真实 Host：用结构化 FakeHostContext 驱动插件入口，验证——
 * enabled=false 无副作用；adapter 服务缺失/端口不合规/配置缺失时不发布
 * soloipsCore；发布后宿主卸载触发逆序释放。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SoloipsCoreHostContext, SoloipsCoreLogger } from "../src/index";
import soloipsCoreEntry from "../src/index";
import { SOLOIPS_CORE_SERVICE_NAME } from "../src/contracts";
import { fakeAdapterEvents, fakeStoragePort, resetFakeAdapter } from "./adapter-fakes";
import { TEST_ACCOUNT_ID, TEST_OTHER_ACCOUNT_ID } from "./seed";

const ROOT = "/tmp/soloips-plugin-root";

/**
 * 宿主测试替身。
 *
 * 〔约束〕**不用 `implements SoloipsCoreHostContext`**：真实 `Context` 有 30+ 个成员，
 * 让替身实现完整接口等于要求伪造全部成员；而只列用到的成员又会让「替身是否与宿主同形」
 * 变得不可检查。因此替身按**被测路径实际用到的签名**实现，并靠
 * `host-context-compat.spec.ts` 断言真实 `Context` 可赋值给 core 的派生类型——
 * 兼容性的证据在那条断言，不在替身自己身上。
 *
 * 早先该替身手写了 `effect`（少 label 参数、返回类型放宽）与 `logger`（缺 info/debug），
 * 与真实宿主不符且未被发现——那正是「tests/ 从不做类型检查」缺口的后果。
 */
class FakeHostContext {
  /**
   * 类型自检：替身必须可赋给 core 的宿主上下文面。
   * 用 `satisfies` 而非 `implements`——`implements` 会把「未实现其余 Context 成员」
   * 也变成错误，而替身刻意只实现被测路径用到的成员。
   */
  static readonly asHostContext = (instance: FakeHostContext): SoloipsCoreHostContext =>
    instance satisfies SoloipsCoreHostContext;

  readonly injectCalls: string[][] = [];
  readonly provided = new Map<string, unknown>();
  readonly warnings: string[] = [];
  private readonly services = new Map<string, unknown>();
  private readonly disposers: (() => void | Promise<void>)[] = [];

  /**
   * 与 `Context.inject` 同形：`deps` 是服务名数组或其映射，返回值是 `Fiber & PromiseLike<Fiber>`
   * ——返回类型从宿主派生，不手写（早先写 `unknown` 即与宿主不符）。
   * 替身按测试需要只驱动回调，返回一个不完整的 fiber 占位：被测路径不消费返回值。
   */
  inject(
    ...args: Parameters<SoloipsCoreHostContext["inject"]>
  ): ReturnType<SoloipsCoreHostContext["inject"]> {
    const [deps, callback] = args;
    this.injectCalls.push(Array.isArray(deps) ? [...(deps as string[])] : [String(deps)]);
    void callback(this as never);
    return undefined as unknown as ReturnType<SoloipsCoreHostContext["inject"]>;
  }

  get(name: string): unknown {
    return this.services.get(name);
  }

  provide(
    ...args: Parameters<SoloipsCoreHostContext["provide"]>
  ): ReturnType<SoloipsCoreHostContext["provide"]> {
    const [name, value] = args;
    this.provided.set(name, value);
    return (() => {
      this.provided.delete(name);
    }) as ReturnType<SoloipsCoreHostContext["provide"]>;
  }

  /**
   * 与 `Context.effect` 同形。真实返回类型是 `AsyncDisposable<Promise<void>>`——
   * **既可调用、又是 thenable**（cordis `fiber.d.ts`：`interface AsyncDisposable<T> extends
   * PromiseLike<() => T> { (): T }`）。返回类型直接从宿主派生，替身不自己描述它。
   *
   * 早先替身返回 `() => void`（既非 thenable、disposer 也不返回 Promise），
   * 与宿主不符——由派生类型抓出。
   */
  effect(execute: () => unknown): ReturnType<SoloipsCoreHostContext["effect"]> {
    const returned = execute();
    const disposers: unknown[] =
      typeof returned === "function" ? [returned] : [...(returned as Iterable<unknown>)];
    this.disposers.push(...(disposers as (() => void | Promise<void>)[]));
    const dispose = async (): Promise<void> => {
      for (const disposer of disposers) {
        const index = this.disposers.indexOf(disposer as () => void | Promise<void>);
        if (index >= 0) this.disposers.splice(index, 1);
      }
    };
    // AsyncDisposable：调用返回 Promise<void>，且 thenable 解析为那个 disposer。
    return Object.assign(dispose, {
      then: <R>(onfulfilled: (value: () => Promise<void>) => R): Promise<R> =>
        Promise.resolve(dispose).then(onfulfilled),
    }) as ReturnType<SoloipsCoreHostContext["effect"]>;
  }

  /** 真实 `Context.logger` 按名返回 logger；替身返回同一个含级别方法的对象。 */
  readonly logger = Object.assign((): SoloipsCoreLogger => this.logger, {
    warn: (message: string): void => {
      this.warnings.push(message);
    },
    error: (message: string): void => {
      this.warnings.push(message);
    },
    info: (message: string): void => {
      this.warnings.push(message);
    },
    debug: (message: string): void => {
      this.warnings.push(message);
    },
  });

  /** 测试辅助：模拟服务注册。 */
  setService(name: string, value: unknown): void {
    this.services.set(name, value);
  }

  /** 测试辅助：模拟宿主卸载。 */
  async unload(): Promise<void> {
    for (const disposer of this.disposers.splice(0)) {
      await disposer();
    }
  }
}

beforeEach(() => {
  resetFakeAdapter();
});

describe("soloips-core plugin entry (fail-closed publishing)", () => {
  it("enabled=false：不声明依赖、不发布服务（SEAM-07 等价物）", () => {
    const ctx = new FakeHostContext();
    soloipsCoreEntry(ctx, { enabled: false, storageRoot: ROOT });
    expect(ctx.injectCalls).toEqual([]);
    expect(ctx.provided.size).toBe(0);
    expect(fakeAdapterEvents()).toEqual([]);
  });

  it("adapter 服务缺失（enabled:false 的 adapter）：保持 pending，不发布", () => {
    const ctx = new FakeHostContext();
    soloipsCoreEntry(ctx, { enabled: true, storageRoot: ROOT });
    expect(ctx.injectCalls).toEqual([["soloipsAdapter"]]);
    expect(ctx.provided.size).toBe(0);
    expect(ctx.warnings.length).toBe(1);
  });

  it("adapter storage 端口不符合冻结契约：不发布", () => {
    const ctx = new FakeHostContext();
    ctx.setService("soloipsAdapter", { storage: { acquireWriterLease: () => undefined } });
    soloipsCoreEntry(ctx, { enabled: true, storageRoot: ROOT });
    expect(ctx.provided.size).toBe(0);
    expect(ctx.warnings.join("\n")).toContain("storage");
  });

  it("缺少 storageRoot 配置：不发布", () => {
    const ctx = new FakeHostContext();
    ctx.setService("soloipsAdapter", { storage: fakeStoragePort() });
    soloipsCoreEntry(ctx, { enabled: true, accountId: TEST_ACCOUNT_ID });
    expect(ctx.provided.size).toBe(0);
    expect(ctx.warnings.join("\n")).toContain("storageRoot");
  });

  it("缺少 accountId 配置：不发布（绑定校验的比对基准缺失即 fail-closed）", () => {
    const ctx = new FakeHostContext();
    ctx.setService("soloipsAdapter", { storage: fakeStoragePort() });
    soloipsCoreEntry(ctx, { enabled: true, storageRoot: ROOT });
    expect(ctx.provided.size).toBe(0);
    expect(ctx.warnings.join("\n")).toContain("accountId");
    // 早退发生在打开之前：没有任何 lease/stack/open 副作用。
    expect(fakeAdapterEvents()).toEqual([]);
  });

  it("打开失败（lease 获取即失败）：不发布且保留诊断", async () => {
    const ctx = new FakeHostContext();
    const broken = {
      storage: {
        ...fakeStoragePort(),
        acquireWriterLease: () => Promise.reject(new Error("lease boom")),
      },
    };
    ctx.setService("soloipsAdapter", broken);
    soloipsCoreEntry(ctx, { enabled: true, storageRoot: ROOT, accountId: TEST_ACCOUNT_ID });
    await vi.waitFor(() => expect(ctx.warnings.length).toBe(1));
    expect(ctx.provided.size).toBe(0);
  });

  it("正常路径：发布 soloipsCore；宿主卸载后逆序释放并停写", async () => {
    const ctx = new FakeHostContext();
    ctx.setService("soloipsAdapter", { storage: fakeStoragePort() });
    soloipsCoreEntry(ctx, { enabled: true, storageRoot: ROOT, accountId: TEST_ACCOUNT_ID });
    await vi.waitFor(() => expect(ctx.provided.has(SOLOIPS_CORE_SERVICE_NAME)).toBe(true));
    const service = ctx.provided.get(SOLOIPS_CORE_SERVICE_NAME);
    expect(service).toBeDefined();

    await ctx.unload();
    const tail = fakeAdapterEvents().slice(-3);
    expect(tail[0]).toBe("close:soloips_company");
    expect(tail[1]).toBe(`stack-dispose:${ROOT}`);
    expect(tail[2]).toBe(`lease-dispose:${ROOT}`);
    // 卸载后服务停止接受写。
    await expect(
      (service as { createCompany(input: unknown): Promise<unknown> }).createCompany({
        operationId: "op-after-unload",
        name: "X",
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_STORE_CLOSED" });
  });

  it("绑定不符：打开被拒且不发布服务（fail-closed 传播到插件层）", async () => {
    const ctx = new FakeHostContext();
    ctx.setService("soloipsAdapter", { storage: fakeStoragePort() });
    // 先以账户 A 打开并建公司，再以账户 B 打开同一根。
    const first = new FakeHostContext();
    first.setService("soloipsAdapter", { storage: fakeStoragePort() });
    soloipsCoreEntry(first, { enabled: true, storageRoot: ROOT, accountId: TEST_ACCOUNT_ID });
    await vi.waitFor(() => expect(first.provided.has(SOLOIPS_CORE_SERVICE_NAME)).toBe(true));
    await first.unload();

    soloipsCoreEntry(ctx, {
      enabled: true,
      storageRoot: ROOT,
      accountId: TEST_OTHER_ACCOUNT_ID,
    });
    await vi.waitFor(() => expect(ctx.warnings.length).toBe(1));
    expect(ctx.provided.size).toBe(0);
    expect(ctx.warnings.join("\n")).toContain("SOLOIPS_CORE_ACCOUNT_MISMATCH");
  });
});
