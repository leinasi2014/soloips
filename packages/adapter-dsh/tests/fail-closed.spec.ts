/**
 * fail-closed 行为测试（SOLO-F04 / 禁止项 #8、Team 端口现状）。
 *
 * 宿主服务缺失时端口以 `SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE` 拒绝，而不是
 * 让失败静默或伪装成空结果——core 不能依赖宿主把 adapter 失败当作启动失败，
 * 必须经 readiness()/注入保持 pending（这些用例固定「缺服务 = 显式拒绝」的语义）。
 */
import { describe, expect, it } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import { SoloipsAdapterError } from "../src/contracts";
import { createAgentsPort } from "../src/ports/agents";
import { createSessionPort } from "../src/ports/session";
import { createSubagentsPort } from "../src/ports/subagents";
import { createTeamPort } from "../src/ports/team";
import { createToolsPort } from "../src/ports/tools";
import type { SoloipsSessionId } from "../src/contracts";

function bareContext(): Context {
  return {
    get() {
      return undefined;
    },
    emit() {
      /* noop */
    },
    async parallel() {
      /* noop */
    },
    // 同上：部分 stub 经 unknown 中转，不用 any。
  } as unknown as Context;
}

const sessionId = "session-1" as SoloipsSessionId;

function adapterCode(error: unknown): string | undefined {
  return error instanceof SoloipsAdapterError ? error.code : undefined;
}

describe("宿主服务缺失时的 fail-closed（SOLO-F04）", () => {
  it("session 端口：create/stat/list 以 SERVICE_UNAVAILABLE 拒绝", async () => {
    const port = createSessionPort(bareContext());
    await expect(port.create(sessionId)).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
    });
    await expect(port.stat(sessionId)).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
    });
    await expect(port.list()).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
    });
  });

  it("agents 端口：get/list 以 SERVICE_UNAVAILABLE 拒绝（不把服务故障伪装成「不活跃」）", () => {
    const port = createAgentsPort(bareContext());
    let thrown: unknown;
    try {
      port.get(sessionId);
    } catch (error) {
      thrown = error;
    }
    expect(adapterCode(thrown)).toBe("SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE");
    expect(() => port.list()).toThrow(SoloipsAdapterError);
  });

  it("tools 端口：names()/register() 以 SERVICE_UNAVAILABLE 拒绝", () => {
    const port = createToolsPort(bareContext());
    expect(() => port.names()).toThrow(SoloipsAdapterError);
    expect(() =>
      port.register({
        name: "probe_tool",
        description: "probe",
        parameters: { type: "object", properties: {} },
        output: {
          schema: { type: "object" },
          render: () => [],
        },
        execute: () => Promise.resolve({ ok: true }),
      }),
    ).toThrow(SoloipsAdapterError);
  });

  it("team 端口（T08 面，不冻结）：全部成员显式拒绝并说明原因", async () => {
    const port = createTeamPort();
    const lead = { sessionId };
    expect(() => port.listMembers(lead)).toThrow(SoloipsAdapterError);
    await expect(
      port.sendMessage(lead, "member", [{ type: "text", text: "hi" }]),
    ).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
    });
  });

  it("subagents 端口：凭证解析要求真实活跃 Agent（缺 registry 即拒绝）", async () => {
    const port = createSubagentsPort(bareContext());
    await expect(
      port.startContinuable({
        provider: "spawn",
        label: "probe",
        prompt: [{ type: "text", text: "hi" }],
        parent: { sessionId },
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE" });
  });
});
