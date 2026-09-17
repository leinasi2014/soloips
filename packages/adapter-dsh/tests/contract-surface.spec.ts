/**
 * 契约面测试：配置 schema 与常量的**真实解析行为**，以及事件端口的词表与翻译。
 *
 * 事件用例跑在真实 cordis Context 上（无任何 DSH 服务装载），验证 DSH 事件名 →
 * `soloips:*` 的翻译与 on/parallel 的实际派发，而不是复述类型定义。
 */
import { describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import {
  Config,
  SOLOIPS_ADAPTER_CONFIG_DEFAULTS,
  SOLOIPS_ADAPTER_SERVICE_NAME,
  SOLOIPS_ADAPTER_SETTINGS_NAMESPACE,
} from "../src/index";
import { createEventsPort, wireEventTranslations } from "../src/ports/events";
import { soloipsSessionId } from "../src/ports/shared";
import type { SubagentRunEndInfo, SubagentRunInfo } from "@deepseek-ai/dsh-subagent";

describe("Config schema（SEAM-09：缺省值与契约常量同源）", () => {
  it("空配置解析为契约缺省值（单一事实来源，不复制数值）", () => {
    expect(Config({})).toEqual(SOLOIPS_ADAPTER_CONFIG_DEFAULTS);
  });

  it("显式值覆盖缺省，未给字段回落缺省", () => {
    expect(Config({ enabled: false, leaseWaitMs: 10 })).toEqual({
      ...SOLOIPS_ADAPTER_CONFIG_DEFAULTS,
      enabled: false,
      leaseWaitMs: 10,
    });
  });

  it("非法值被 schema 拒绝（schemastery 解析失败）", () => {
    // schemastery 的 schema 对象**可调用**（Schemastery 接口带调用签名）；非法值在调用时抛。
    // 传非法值本身就是本用例的目的，故用 `@ts-expect-error` 声明「这里必须类型不合法」——
    // 它比 `as unknown as` 诚实（后者会静默改变值的类型），且该指令被 typecheck:tests 求值。
    // @ts-expect-error enabled 必须是 boolean，故意传字符串以验证 schema 拒绝
    expect(() => Config({ enabled: "yes" })).toThrow();
    expect(() => Config({ leaseWaitMs: -1 })).toThrow();
  });
});

describe("常量与宿主约束", () => {
  it("settings namespace 匹配宿主 NAMESPACE_PATTERN ^[a-z][a-z0-9-]*$（dsh-settings）", () => {
    expect(SOLOIPS_ADAPTER_SETTINGS_NAMESPACE).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(SOLOIPS_ADAPTER_SETTINGS_NAMESPACE).toBe("soloips-adapter");
  });

  it("服务名常量为 soloipsAdapter（soloips* 前缀）", () => {
    expect(SOLOIPS_ADAPTER_SERVICE_NAME).toBe("soloipsAdapter");
  });
});

describe("events port（真实 cordis 事件总线，词表只有 soloips:*）", () => {
  it("domain/changed → soloips:domain/changed：载荷原样翻译", () => {
    const ctx = new Context();
    const disposeWire = wireEventTranslations(ctx);
    const seen: unknown[] = [];
    const disposeListener = createEventsPort(ctx).on("soloips:domain/changed", (change) => {
      seen.push(change);
    });

    ctx.emit("domain/changed", {
      domain: "soloips_probe",
      table: "thing",
      key: "alpha",
      operation: "put",
      value: { hello: "world" },
    });
    expect(seen).toEqual([
      {
        domain: "soloips_probe",
        table: "thing",
        key: "alpha",
        operation: "put",
        value: { hello: "world" },
      },
    ]);

    disposeListener();
    disposeWire();
  });

  it("subagent/start 与 subagent/end → soloips:subagent/*（runId/childId/provider + 结果投影）", () => {
    const ctx = new Context();
    const disposeWire = wireEventTranslations(ctx);
    const starts: unknown[] = [];
    const ends: unknown[] = [];
    const port = createEventsPort(ctx);
    const disposeStart = port.on("soloips:subagent/start", (info) => starts.push(info));
    const disposeEnd = port.on("soloips:subagent/end", (info) => ends.push(info));

    // 宿主 subagent 生命周期事件的 info 形状取自 dsh-subagent 的公开导出
    // （`SubagentRunInfo` / `SubagentRunEndInfo`），因此本用例的输入与宿主真实形状一致；
    // 形状写错会在 typecheck:tests 下失败，而不是静默通过。
    const startInfo: SubagentRunInfo = {
      runId: "run-1" as SubagentRunInfo["runId"],
      provider: "spawn",
      // id 的类型取自公开 info 自身，避免引入 dsh-session（非本包依赖，与 adapter 源码同法）。
      id: "child-1" as SubagentRunInfo["id"],
      local: true,
    };
    const endInfo: SubagentRunEndInfo = {
      ...startInfo,
      stopReason: "completed",
      // lastAssistantMessage 缺省 → 契约的空数组
    };
    // 直接按宿主签名发射，不做类型桥接。
    // （先前这里用 `as unknown as (name, info) => void` 绕过重载；那是多余的：宿主
    //  `emit<K>(name: K, ...args: Parameters<Events[K]>)` 对本事件可正常推导。
    //  桥接还会丢掉事件名与负载的对应关系——类型上允许 start 配 end 的负载。）
    ctx.emit("subagent/start", startInfo);
    ctx.emit("subagent/end", endInfo);

    expect(starts).toEqual([{ runId: "run-1", childId: "child-1", provider: "spawn" }]);
    expect(ends).toEqual([
      {
        runId: "run-1",
        childId: "child-1",
        result: { stopReason: "completed", output: [] },
      },
    ]);

    disposeStart();
    disposeEnd();
    disposeWire();
  });

  it("tools/change → soloips:tools/change；parallel 派发等待全部监听", async () => {
    const ctx = new Context();
    const disposeWire = wireEventTranslations(ctx);
    const port = createEventsPort(ctx);
    const seen: string[] = [];
    const disposeA = port.on("soloips:tools/change", () => {
      seen.push("a");
    });
    const disposeB = port.on("soloips:tools/change", () => {
      seen.push("b");
    });

    ctx.emit("tools/change");
    expect(seen.sort()).toEqual(["a", "b"]);

    seen.length = 0;
    await port.parallel("soloips:tools/change");
    expect(seen.sort()).toEqual(["a", "b"]);

    disposeA();
    disposeB();
    disposeWire();
  });

  it("on 返回的解除函数停止后续派发；serial 首个抛出中断后续", async () => {
    const ctx = new Context();
    const port = createEventsPort(ctx);
    const seen: number[] = [];
    const dispose = port.on("soloips:tools/change", () => {
      seen.push(1);
    });
    dispose();
    await port.parallel("soloips:tools/change");
    expect(seen).toEqual([]);

    const disposeFirst = port.on("soloips:session/flush", () => {
      seen.push(10);
      throw new Error("first listener fails");
    });
    const disposeSecond = port.on("soloips:session/flush", () => {
      seen.push(20);
    });
    // 契约的 session 参数是品牌类型 SoloipsSessionId；经 adapter 自己的构造器产出，
    // 不传裸字符串（品牌类型的存在本身就是「不能拿任意字符串当 id」的约束）。
    await expect(
      port.serial("soloips:session/flush", soloipsSessionId("session-1")),
    ).rejects.toThrow("first listener fails");
    expect(seen).toEqual([10]); // 串行：首个抛出即中断后续
    disposeFirst();
    disposeSecond();
  });
});
