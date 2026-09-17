/**
 * SOLOIPS-ADAPTER-AGENTS-PORT
 *
 * Agent 权威解析端口：把 `ctx.agents`（AgentRegistry）包装成契约的
 * `SoloipsAgentsPort`。
 *
 * 契约语义：凭证只能经本端口从**真实执行上下文**解析（SOLO-TEAM-03/ORG-05）；
 * `get` 对不在活跃表的 id 返回 `undefined`。宿主服务本身缺失时以
 * `SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE` fail-closed，而不是把服务故障伪装成
 * 「不活跃」。
 */

import type { Context } from "@deepseek-ai/cordis";
import type { AgentRegistry } from "@deepseek-ai/dsh-agent";
import {
  SoloipsAdapterError,
  type SoloipsAgentRef,
  type SoloipsAgentsPort,
  type SoloipsSessionId,
} from "../contracts.js";
import { hostSessionId, toSoloipsAgentRef } from "./shared.js";

function requireAgents(ctx: Context): AgentRegistry {
  const agents = ctx.get("agents");
  if (agents === undefined) {
    throw new SoloipsAdapterError(
      "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
      "host service 'agents' is not available",
    );
  }
  return agents;
}

/** 构造 Agent 解析端口。纯对象构造：只捕获 ctx，不触达宿主资源。 */
export function createAgentsPort(ctx: Context): SoloipsAgentsPort {
  return {
    get(id: SoloipsSessionId): SoloipsAgentRef | undefined {
      const agent = requireAgents(ctx).get(hostSessionId(id));
      return agent === undefined ? undefined : toSoloipsAgentRef(agent);
    },
    list(): readonly SoloipsAgentRef[] {
      return requireAgents(ctx).list().map(toSoloipsAgentRef);
    },
  };
}
