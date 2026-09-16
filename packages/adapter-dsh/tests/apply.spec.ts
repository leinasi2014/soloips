/**
 * apply 入口的生命周期契约测试（SEAM-06/07/08）。
 *
 * 用桩 Context 验证可真实执行的部分：早退边界、settings 两条互斥路径、
 * 事件翻译与服务的 effect+provide 发布/回收。不启动任何宿主服务——端口只在
 * 方法调用时读取宿主服务，装配期不触达。
 */
import { describe, expect, it } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import { apply, SOLOIPS_ADAPTER_SERVICE_NAME } from "../src/index";
import { SOLOIPS_ADAPTER_SETTINGS_NAMESPACE, type SoloipsAdapter } from "../src/contracts";

interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

interface ContextStub {
  readonly calls: readonly RecordedCall[];
  readonly provided: ReadonlyArray<{ name: string; value: unknown }>;
  readonly unwired: number;
  readonly hostEvents: readonly string[];
  readonly effectDisposers: readonly (() => void)[];
  readonly injected: readonly (readonly string[])[];
  readonly settingsRegistrations: ReadonlyArray<{ ns: string; options: Record<string, unknown> }>;
  readonly context: Context;
}

/** 桩只实现 apply 实际消费的面；`settingsReady` 决定 `ctx.get('settings')` 是否返回桩 provider。 */
function createStubContext(settingsReady: boolean): ContextStub {
  const calls: RecordedCall[] = [];
  const provided: Array<{ name: string; value: unknown }> = [];
  const hostEvents: string[] = [];
  const effectDisposers: Array<() => void> = [];
  const injected: Array<readonly string[]> = [];
  const settingsRegistrations: Array<{ ns: string; options: Record<string, unknown> }> = [];
  let unwired = 0;

  const settingsStub = {
    register(ns: string, _schema: unknown, options: Record<string, unknown>) {
      settingsRegistrations.push({ ns, options });
      return { get: () => ({}) };
    },
  };

  const stub = {
    get(name: string, _strict?: boolean) {
      calls.push({ method: "get", args: [name] });
      return name === "settings" && settingsReady ? settingsStub : undefined;
    },
    inject(deps: readonly string[], _callback: (ctx: Context) => void) {
      calls.push({ method: "inject", args: [deps] });
      injected.push(deps);
    },
    effect(execute: () => () => void, label?: string) {
      calls.push({ method: "effect", args: [label] });
      effectDisposers.push(execute());
      return () => undefined;
    },
    provide(name: string, value: unknown) {
      calls.push({ method: "provide", args: [name] });
      provided.push({ name, value });
      return () => undefined;
    },
    on(event: string, _listener: (...args: never[]) => unknown) {
      calls.push({ method: "on", args: [event] });
      hostEvents.push(event);
      return () => {
        unwired += 1;
        return true;
      };
    },
    emit(name: string, ...args: unknown[]) {
      calls.push({ method: "emit", args: [name, ...args] });
    },
    async parallel(name: string, ...args: unknown[]) {
      calls.push({ method: "parallel", args: [name, ...args] });
    },
  };

  return {
    calls,
    provided,
    get unwired() {
      return unwired;
    },
    hostEvents,
    effectDisposers,
    injected,
    settingsRegistrations,
    // 单向窄化断言：桩的每个成员都是 Context 对应成员的宽松超集（any 参数/返回）。
    // 测试替身只实现被测路径用到的成员，不是完整 Context；经 unknown 中转是诚实的表达
    // （直接 `as Context` 会被 TS 判为不充分重叠）。不使用 any（DEV-05）。
    context: stub as unknown as Context,
  };
}

describe("soloips-adapter-dsh apply()", () => {
  it("enabled: false 在任何副作用之前返回（SEAM-07）", async () => {
    const stub = createStubContext(true);
    await apply(stub.context, { enabled: false });
    expect(stub.calls).toEqual([]); // 无 get / inject / effect / provide / on / emit
    expect(stub.provided).toHaveLength(0);
  });

  it("settings 就绪：直接注册（applies: restart），不 inject，并发布服务", async () => {
    const stub = createStubContext(true);
    await apply(stub.context, { enabled: true });

    expect(stub.settingsRegistrations).toHaveLength(1);
    expect(stub.settingsRegistrations[0]?.ns).toBe(SOLOIPS_ADAPTER_SETTINGS_NAMESPACE);
    expect(stub.settingsRegistrations[0]?.options["applies"]).toBe("restart");
    expect(stub.injected).toHaveLength(0);

    // effect#1 事件翻译（4 个宿主事件），effect#2 发布。
    expect(stub.hostEvents).toEqual([
      "domain/changed",
      "subagent/start",
      "subagent/end",
      "tools/change",
    ]);
    expect(stub.provided).toHaveLength(1);
    expect(stub.provided[0]?.name).toBe(SOLOIPS_ADAPTER_SERVICE_NAME);
    const adapter = stub.provided[0]?.value as SoloipsAdapter;
    expect(adapter.storage).toBeDefined();
    expect(adapter.readiness().ready).toBe(false); // 桩上五个宿主服务全部缺失
    expect(adapter.readiness().missingServices).toEqual([
      "storage",
      "sessionPersistence",
      "subagents",
      "agents",
      "tools",
    ]);
  });

  it("settings 未就绪：走 inject 延迟注册，不与本路径重复注册（SEAM-06 互斥）", async () => {
    const stub = createStubContext(false);
    await apply(stub.context, { enabled: true });

    expect(stub.injected).toEqual([["settings"]]);
    expect(stub.settingsRegistrations).toHaveLength(0);
    expect(stub.provided[0]?.name).toBe(SOLOIPS_ADAPTER_SERVICE_NAME);
  });

  it("effect disposer 解除事件翻译并 unprovide", async () => {
    const stub = createStubContext(true);
    await apply(stub.context, {});
    expect(stub.effectDisposers).toHaveLength(2);
    stub.effectDisposers[1]?.(); // 发布 disposer（unprovide）
    stub.effectDisposers[0]?.(); // 翻译 disposer（4 个宿主监听解除）
    expect(stub.unwired).toBe(4);
  });
});
