/**
 * 插件入口行为测试：fail-closed 发布语义（SOLO-F04 / contracts-design §8.1）。
 *
 * 不启动真实 Host：用结构化 FakeHostContext 驱动插件入口，验证——
 * enabled=false 无副作用；adapter 服务缺失/端口不合规/配置缺失时不发布
 * soloipsCore；发布后宿主卸载触发逆序释放；以及 **STORAGE-01**：卸载回调
 * 返回 close 的 Promise（宿主等待关闭完成）且关闭失败必须留下记录。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  SoloipsStoragePort,
  SoloipsStorageStack,
  SoloipsStorageStackOptions,
  SoloipsWriterLease,
} from "soloips-adapter-dsh/contracts";

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
    // 〔为什么逐元素 `String(...)`，而不是 `as string[]` + `String(deps)`〕
    //  1. `Inject` 的元素类型是 `keyof Dict` = `string | number`，故数组分支需要一次
    //     **真转换**；旧写法的 `as string[]` 是对联合类型下断言，把 number 元素谎报成
    //     string（`injectCalls` 的声明是 `string[][]`）。
    //  2. 对象分支（`{ 服务名: 拦截配置 }`）的**服务名就是键**，故取 `Object.keys`；
    //     旧写法的 `String(deps)` 会产出 `"[object Object]"`——一个既不是服务名、
    //     也不可用于比对的常量串（`no-base-to-string` 报的正是这一点）。本替身当前
    //     只被数组形态调用（`injectCalls` 的两处断言均为此形态），对象分支是防御性的，
    //     故这次修正无既有断言受影响。
    this.injectCalls.push(
      Array.isArray(deps) ? deps.map((name) => String(name)) : Object.keys(deps),
    );
    void callback(this as never);
    return undefined as unknown as ReturnType<SoloipsCoreHostContext["inject"]>;
  }

  get(name: string): unknown {
    return this.services.get(name);
  }

  provide(
    ...args: Parameters<SoloipsCoreHostContext["provide"]>
  ): ReturnType<SoloipsCoreHostContext["provide"]> {
    // 〔为什么用下标取值 + 显式标注，而不是 `const [name, value] = args`〕宿主签名是
    // `provide(name: string, value?: any)`，元组第二项因此是 `any`；解构赋值会把 `any`
    // 直接灌进局部变量（`no-unsafe-assignment` 的报点）。`this.provided` 的声明是
    // `Map<string, unknown>`，所以标注 `unknown` 与消费面一致，且把「这个值未经校验」
    // 显式写在类型上。
    const name = args[0];
    const value: unknown = args[1];
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

  /**
   * 测试辅助：取出**尚未执行**的 effect dispose 回调（由调用方驱动）。
   *
   * 与 `unload()` 的分工：`unload()` 是「宿主式」驱动（逐个 `await`，镜像 cordis
   * `_unload` 的 `await runDisposable(dispose)`）；本方法让用例直接观察**回调的
   * 返回值**——「返回 Promise 才会被宿主等待」这一机制面只能在那里断言。
   */
  takeDisposers(): (() => void | Promise<void>)[] {
    return this.disposers.splice(0);
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
    // 〔为什么是带花括号的回调，而不是简写 `() => expect(…).toBe(1)`〕
    // `vi.waitFor` 的**重试驱动靠回调抛错**，返回值只被用来判 thenable
    // （`vitest/dist/chunks/vi.bdSIJ99Y.js` 的 `checkCallback`：非 thenable 一律
    // `onResolve(result)`）。`expect(...).toBe(...)` 返回 `void`，简写形态把 void
    // 表达式当作返回值传给 waitFor——语义上无用，读起来却像「等待这个断言的值」。
    // 花括号形态让「断言是副作用、重试由抛错驱动」在源码里显式可见；行为逐字不变。
    await vi.waitFor(() => {
      expect(ctx.warnings.length).toBe(1);
    });
    expect(ctx.provided.size).toBe(0);
  });

  it("正常路径：发布 soloipsCore；宿主卸载后逆序释放并停写", async () => {
    const ctx = new FakeHostContext();
    ctx.setService("soloipsAdapter", { storage: fakeStoragePort() });
    soloipsCoreEntry(ctx, { enabled: true, storageRoot: ROOT, accountId: TEST_ACCOUNT_ID });
    await vi.waitFor(() => {
      expect(ctx.provided.has(SOLOIPS_CORE_SERVICE_NAME)).toBe(true);
    });
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
    await vi.waitFor(() => {
      expect(first.provided.has(SOLOIPS_CORE_SERVICE_NAME)).toBe(true);
    });
    await first.unload();

    soloipsCoreEntry(ctx, {
      enabled: true,
      storageRoot: ROOT,
      accountId: TEST_OTHER_ACCOUNT_ID,
    });
    await vi.waitFor(() => {
      expect(ctx.warnings.length).toBe(1);
    });
    expect(ctx.provided.size).toBe(0);
    expect(ctx.warnings.join("\n")).toContain("SOLOIPS_CORE_ACCOUNT_MISMATCH");
  });

  /**
   * 〔BE-5 追加〕`planCode` 的**插件层**接线：配置键 → 服务行为。
   *
   * 〔为什么必须从插件层测一次〕`quota-tree.spec.ts` 直接调 `openSoloipsCompanyStore`，
   * 因此它证明的是「store 接受 planCode」，**不**证明「config 的 planCode 真的传到了
   * store」。这两件事之间的接缝（`parseCoreConfig` 的键名、`entry` 的透传）若断开，
   * 表现是「部署配置里写了 pro，运行期仍按 free 判定」——一个静默的配置失效。
   * 本用例把该接缝钉住。
   */
  it("config.planCode 透传到服务：pro 计划下可建 1 公司 + 1 子公司（缺省 free 会拒绝）", async () => {
    const ctx = new FakeHostContext();
    ctx.setService("soloipsAdapter", { storage: fakeStoragePort() });
    soloipsCoreEntry(ctx, {
      enabled: true,
      storageRoot: ROOT,
      accountId: TEST_ACCOUNT_ID,
      planCode: "pro",
    });
    await vi.waitFor(() => {
      expect(ctx.provided.has(SOLOIPS_CORE_SERVICE_NAME)).toBe(true);
    });
    const service = ctx.provided.get(SOLOIPS_CORE_SERVICE_NAME) as {
      createCompany(input: {
        operationId: string;
        name: string;
        type?: string;
        parentCompanyId?: string;
      }): Promise<{
        status: string;
        result?: { companyId?: string };
        resourceType?: string;
        limit?: number;
      }>;
    };
    const company = await service.createCompany({ operationId: "plugin-pro-1", name: "顶层" });
    expect(company.status).toBe("committed");
    const parentCompanyId = company.result?.companyId;
    if (parentCompanyId === undefined) throw new Error("前置建公司未返回 companyId");
    const subsidiary = await service.createCompany({
      operationId: "plugin-pro-2",
      name: "子公司",
      type: "subsidiary",
      parentCompanyId,
    });
    // 若 planCode 未透传（按缺省 free），这里会是 refused（Free 的 subsidiaryLimit=0）。
    expect(subsidiary.status).toBe("committed");
    await ctx.unload();
  });

  it("config.planCode 非法值：不发布服务（fail-closed，不静默按 free 运行）", async () => {
    const ctx = new FakeHostContext();
    ctx.setService("soloipsAdapter", { storage: fakeStoragePort() });
    soloipsCoreEntry(ctx, {
      enabled: true,
      storageRoot: ROOT,
      accountId: TEST_ACCOUNT_ID,
      planCode: "gold",
    });
    await vi.waitFor(() => {
      expect(ctx.warnings.length).toBe(1);
    });
    expect(ctx.provided.size).toBe(0);
    expect(ctx.warnings.join("\n")).toContain("SOLOIPS_CORE_CONFIG_INVALID");
  });

  it("缺省无 planCode：按 free 发布（最严格计划），第二个 enterprise 被拒", async () => {
    const ctx = new FakeHostContext();
    ctx.setService("soloipsAdapter", { storage: fakeStoragePort() });
    soloipsCoreEntry(ctx, { enabled: true, storageRoot: ROOT, accountId: TEST_ACCOUNT_ID });
    await vi.waitFor(() => {
      expect(ctx.provided.has(SOLOIPS_CORE_SERVICE_NAME)).toBe(true);
    });
    const service = ctx.provided.get(SOLOIPS_CORE_SERVICE_NAME) as {
      createCompany(input: {
        operationId: string;
        name: string;
      }): Promise<{ status: string; planCode?: string; current?: number; limit?: number }>;
    };
    expect((await service.createCompany({ operationId: "plugin-free-1", name: "甲" })).status).toBe(
      "committed",
    );
    const second = await service.createCompany({ operationId: "plugin-free-2", name: "乙" });
    expect(second).toMatchObject({
      status: "refused",
      planCode: "free",
      current: 1,
      limit: 1,
    });
    await ctx.unload();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE-01：卸载回调必须等待 close 完成，且 close 失败必须可见
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 卸载路径的可观测性（STORAGE-01）。
 *
 * 依据：`ctx.effect` 的 dispose 语义——cordis 4.0.2 `src/fiber.ts:675-682`
 * 的 `_unload()` 对每个 disposer 执行 `await runDisposable(dispose)`；
 * `runDisposable`（同文件 L114-117）直接返回回调的返回值。故**回调返回
 * Promise 才会被宿主等待**；`void promise` 让关闭在宿主视角成为 fire-and-forget。
 *
 * 缺陷形态（修复前）：`ctx2.effect(() => () => { unloaded = true; void opened?.close(); })`
 * ——回调返回 `undefined`：宿主不等待关闭完成，close 的失败既无记录也无上报。
 *
 * 〔注入点为什么在 storage 端口而不是「换掉已发布的服务」〕入口在闭包里持有
 * 自己打开的服务（`opened`），卸载时关闭的是**它**——往宿主替身的服务表里塞
 * 一个假服务不会改变被关闭的对象。要让真实 `close()` 失败，只能让它下游的
 * 释放步骤失败：`SoloipsCompanyStore.close()` 的释放链是
 * domain.close() → stack.dispose() → lease.dispose()（SEAM-14，逆序），
 * 任一步 reject 都会从 `close()` 抛出。
 */

/** 释放链注入装置：包装 fake 端口，令 stack.dispose()/lease.dispose() 可控。 */
interface ReleaseProbe {
  readonly port: SoloipsStoragePort;
  /** 释放步骤被调用的顺序（`stack` / `lease`）。 */
  readonly steps: string[];
  /** 等待第一个释放步骤进入（不 sleep）。 */
  waitForRelease(): Promise<void>;
  /** 放行被挂起的释放步骤。 */
  release(): void;
}

/**
 * `mode: "hold"` 时首个释放步骤挂起，直到 `release()`；
 * `mode: "fail"` 时首个释放步骤立即以 `error` 拒绝。
 */
function releaseProbe(mode: "hold" | "fail", error?: Error): ReleaseProbe {
  const base = fakeStoragePort();
  const steps: string[] = [];
  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  let reachedGate!: () => void;
  const reached = new Promise<void>((resolve) => {
    reachedGate = resolve;
  });
  let armed = true;

  const step = async (name: string): Promise<void> => {
    steps.push(name);
    if (!armed) return;
    armed = false;
    reachedGate();
    if (mode === "hold") {
      await gate;
      return;
    }
    throw error ?? new Error("释放失败（未指定原因）");
  };

  return {
    port: {
      ...base,
      async acquireWriterLease(options: { readonly root: string }): Promise<SoloipsWriterLease> {
        const lease = await base.acquireWriterLease(options);
        return {
          generation: lease.generation,
          storageId: lease.storageId,
          assertHeld: () => lease.assertHeld(),
          async dispose(): Promise<void> {
            await step("lease");
            return lease.dispose();
          },
        };
      },
      async createStack(options: SoloipsStorageStackOptions): Promise<SoloipsStorageStack> {
        const stack = await base.createStack(options);
        return {
          ...stack,
          async dispose(): Promise<void> {
            await step("stack");
            return stack.dispose();
          },
        };
      },
    },
    steps,
    waitForRelease: () => reached,
    release: () => {
      releaseGate();
    },
  };
}

/** 启动入口并等到服务发布；返回宿主替身与**已登记但未执行**的卸载回调。 */
async function bootPublished(
  port: SoloipsStoragePort,
): Promise<{ readonly ctx: FakeHostContext; readonly dispose: () => void | Promise<void> }> {
  const ctx = new FakeHostContext();
  ctx.setService("soloipsAdapter", { storage: port });
  soloipsCoreEntry(ctx, { enabled: true, storageRoot: ROOT, accountId: TEST_ACCOUNT_ID });
  await vi.waitFor(() => {
    expect(ctx.provided.has(SOLOIPS_CORE_SERVICE_NAME)).toBe(true);
  });
  const [dispose] = ctx.takeDisposers();
  if (dispose === undefined) throw new Error("前置失败：未登记卸载回调");
  return { ctx, dispose };
}

describe("soloips-core plugin unload (STORAGE-01)", () => {
  it("close 失败：记录 warn 且不向宿主抛出（卸载失败不升级为崩溃）", async () => {
    const probe = releaseProbe("fail", new Error("lease 释放失败：锁文件被占用"));
    const { ctx, dispose } = await bootPublished(probe.port);

    // 宿主式驱动（与 cordis `_unload` 的 `await runDisposable(dispose)` 同款）。
    await expect(Promise.resolve(dispose())).resolves.toBeUndefined();

    expect(ctx.warnings).toHaveLength(1);
    const [warning] = ctx.warnings;
    expect(warning).toContain("soloipsCore 关闭失败");
    expect(warning).toContain("lease 释放失败：锁文件被占用");
    // 失败点确为释放链（证明注入真的命中了 close 内部，而不是别的路径）：
    // stack 失败后 finally 仍继续释放 lease（SEAM-14 的「失败也走完逆序释放」）。
    expect(probe.steps).toEqual(["stack", "lease"]);
  });

  it("close 成功：卸载回调返回 Promise（宿主 await 到关闭完成才继续）", async () => {
    const probe = releaseProbe("hold");
    const { dispose } = await bootPublished(probe.port);

    const pending = dispose();
    // 机制面判据：只有返回 thenable，cordis 的 `runDisposable` 才把关闭纳入等待。
    expect(pending).toBeInstanceOf(Promise);
    await probe.waitForRelease();
    expect(probe.steps).toEqual(["stack"]);
    probe.release();
    await pending;
    // 关闭完成后释放链走到底（stack → lease）。
    expect(probe.steps).toEqual(["stack", "lease"]);
  });

  it("未打开（opened === undefined）时卸载：静默返回，不记录、不抛（回归保护）", async () => {
    // 用永不 settle 的 createStack 把打开挂在半路：effect 已登记、`opened` 仍是 undefined。
    let releaseStack!: () => void;
    const stackGate = new Promise<void>((resolve) => {
      releaseStack = resolve;
    });
    const base = fakeStoragePort();
    const port: SoloipsStoragePort = {
      ...base,
      async createStack(options: SoloipsStorageStackOptions): Promise<SoloipsStorageStack> {
        await stackGate;
        return base.createStack(options);
      },
    };
    const ctx = new FakeHostContext();
    ctx.setService("soloipsAdapter", { storage: port });
    soloipsCoreEntry(ctx, { enabled: true, storageRoot: ROOT, accountId: TEST_ACCOUNT_ID });
    const [dispose] = ctx.takeDisposers();
    if (dispose === undefined) throw new Error("前置失败：未登记卸载回调");
    expect(ctx.provided.size).toBe(0); // 此刻打开仍挂起：未发布

    await expect(Promise.resolve(dispose())).resolves.toBeUndefined();
    expect(ctx.warnings).toHaveLength(0);

    // 打开随后完成，但宿主已卸载：立即逆序释放，不发布。
    releaseStack();
    await vi.waitFor(() => {
      expect(fakeAdapterEvents()).toContain(`lease-dispose:${ROOT}`);
    });
    expect(ctx.provided.size).toBe(0);
    expect(ctx.warnings).toHaveLength(0);
  });
});
