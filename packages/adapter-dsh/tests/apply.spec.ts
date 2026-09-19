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
      // 真实 `Context.inject` 返回 `Fiber & PromiseLike<Fiber>`；被测路径不消费返回值，
      // 但签名必须一致——`satisfies` 检查把差异抓了出来。
      return undefined as unknown as ReturnType<Context["inject"]>;
    },
    effect(execute: () => () => void, label?: string) {
      calls.push({ method: "effect", args: [label] });
      // 真实 `Context.effect` 的返回是 `AsyncDisposable<Promise<void>>`：
      // disposer 本身要返回 Promise。`satisfies` 检查把这一点抓了出来。
      const dispose = execute();
      // 〔为什么带花括号〕`dispose()` 的返回类型是 void；简写 `() => void dispose()`
      // 把 void 表达式塞进另一表达式（`no-confusing-void-expression` 报的正是这一形态）。
      // 花括号形态表达「调用是副作用、不产出值」，与 `effectDisposers` 的元素类型
      // （`() => void`）逐字一致。
      effectDisposers.push(() => {
        dispose();
      });
      return (async () => undefined) as unknown as ReturnType<Context["effect"]>;
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

  // 桩只实现被测路径用到的成员，不是完整 Context（宿主有 30+ 成员）。
  // 用 `satisfies` 把「已实现成员的签名是否与宿主一致」交给编译器：
  // 签名写错即此处编译失败，而不是被一个宽泛的 `as` 吞掉。
  // 之后剩下一处**受控**的完整性桥接——只表达「刻意未实现其余成员」，不再掩盖成员签名问题。
  const stubSatisfiesUsedSurface = stub satisfies Pick<Context, keyof typeof stub>;

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
    // 完整性桥接（唯一的 `as unknown as`）：把「已实现且已受 satisfies 检查」的部分视图
    // 当作完整 Context 使用。刻意未实现的成员若被被测路径访问，会在运行期暴露为 undefined
    // 调用错误——测试会失败，不会静默。
    context: stubSatisfiesUsedSurface as unknown as Context,
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
