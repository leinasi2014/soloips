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

const ROOT = "/tmp/soloips-plugin-root";

class FakeHostContext implements SoloipsCoreHostContext {
  readonly injectCalls: string[][] = [];
  readonly provided = new Map<string, unknown>();
  readonly warnings: string[] = [];
  private readonly services = new Map<string, unknown>();
  private readonly disposers: (() => void | Promise<void>)[] = [];

  inject(
    deps: readonly string[],
    callback: (ctx: SoloipsCoreHostContext) => void | Promise<void>,
  ): unknown {
    this.injectCalls.push([...deps]);
    void callback(this);
    return undefined;
  }

  get(name: string): unknown {
    return this.services.get(name);
  }

  provide(name: string, value: unknown): () => void {
    this.provided.set(name, value);
    return () => {
      this.provided.delete(name);
    };
  }

  effect(
    execute: () => (() => void | Promise<void>) | Iterable<() => void | Promise<void>>,
  ): () => void {
    const returned = execute();
    // 宿主的 SyncEffect 是「一个 disposer」或「disposer 的可迭代集合」；测试替身同样支持两者。
    const disposers = typeof returned === "function" ? [returned] : [...returned];
    this.disposers.push(...disposers);
    return () => {
      for (const disposer of disposers) {
        const index = this.disposers.indexOf(disposer);
        if (index >= 0) this.disposers.splice(index, 1);
      }
    };
  }

  logger(): SoloipsCoreLogger {
    return {
      warn: (message: string) => {
        this.warnings.push(message);
      },
      error: (message: string) => {
        this.warnings.push(message);
      },
    };
  }

  /** 测试辅助：模拟服务注册与宿主卸载。 */
  setService(name: string, value: unknown): void {
    this.services.set(name, value);
  }

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
    soloipsCoreEntry(ctx, { enabled: true });
    expect(ctx.provided.size).toBe(0);
    expect(ctx.warnings.join("\n")).toContain("storageRoot");
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
    soloipsCoreEntry(ctx, { enabled: true, storageRoot: ROOT });
    await vi.waitFor(() => expect(ctx.warnings.length).toBe(1));
    expect(ctx.provided.size).toBe(0);
  });

  it("正常路径：发布 soloipsCore；宿主卸载后逆序释放并停写", async () => {
    const ctx = new FakeHostContext();
    ctx.setService("soloipsAdapter", { storage: fakeStoragePort() });
    soloipsCoreEntry(ctx, { enabled: true, storageRoot: ROOT });
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
});
