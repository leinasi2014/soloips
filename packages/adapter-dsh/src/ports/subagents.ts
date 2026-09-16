/**
 * SOLOIPS-ADAPTER-SUBAGENTS-PORT
 *
 * subagent seam（能力 3/5）：把 `ctx.subagents`（SubagentRuntime）包装成契约的
 * `SoloipsSubagentPort`。
 *
 * 权威凭证（SOLO-TEAM-03 / ORG-05）：契约的 `parent`/`sender`/`authority.agent`
 * 都是 `SoloipsAgentRef`；适配层在**调用时**经 `ctx.agents` 把它解析回真实活跃
 * 的宿主 `Agent`（见 shared.resolveHostAgent），不信任裸字符串身份。
 *
 * 形状差异（0.1.6-alpha.1）：宿主 `ContinuableStartSpec` 把 prompt/parent 嵌在
 * `request` 字段下，契约摊平在顶层——这里做双向整理。`listChildren` 的宿主条目
 * 不携带 provider（仅运行事件携带）；契约的 `provider` 留空。宿主的 diagnostic
 * 条目（无法分类的候选）保留为无 label 的条目，不静默丢弃。
 */

import type { Context } from "@deepseek-ai/cordis";
import type {
  SubagentInterruptAuthority,
  SubagentListEntry,
  SubagentRuntime,
  SubagentStartRequest,
} from "@deepseek-ai/dsh-subagent";
import {
  SoloipsAdapterError,
  type SoloipsAgentRef,
  type SoloipsContentBlock,
  type SoloipsSessionId,
  type SoloipsSubagentInterruptAuthority,
  type SoloipsSubagentListEntry,
  type SoloipsSubagentPort,
  type SoloipsSubagentRun,
  type SoloipsContinuableStartSpec,
} from "../contracts";
import {
  hostSessionId,
  mapHostError,
  resolveHostAgent,
  soloipsSessionId,
  toHostBlocks,
  toSoloipsSubagentResult,
} from "./shared";

function requireSubagents(ctx: Context): SubagentRuntime {
  const subagents = ctx.get("subagents");
  if (subagents === undefined) {
    throw new SoloipsAdapterError(
      "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
      "host service 'subagents' is not available",
    );
  }
  return subagents;
}

/** 契约 start spec 的公共部分 → 宿主 SubagentStartRequest（prompt/parent 摊平逆操作）。 */
function toHostStartRequest(spec: SoloipsContinuableStartSpec, ctx: Context): SubagentStartRequest {
  return {
    label: spec.label,
    prompt: toHostBlocks(spec.prompt),
    parent: resolveHostAgent(ctx, spec.parent),
    signal: spec.signal,
  };
}

function fromHostListEntry(
  entry: SubagentListEntry,
  parentId: SoloipsSessionId,
): SoloipsSubagentListEntry {
  if (entry.kind !== "child") {
    // diagnostic 候选：保留 id/parentId 可见性，无 label/provider 可报。
    return { id: soloipsSessionId(entry.id), parentId };
  }
  const label = entry.label;
  return {
    id: soloipsSessionId(entry.id),
    parentId,
    ...(label !== undefined ? { label } : {}),
  };
}

/** 构造子智能体端口。纯对象构造：只捕获 ctx，不触达宿主资源。 */
export function createSubagentsPort(ctx: Context): SoloipsSubagentPort {
  return {
    async startContinuable(spec: SoloipsContinuableStartSpec) {
      try {
        const started = await requireSubagents(ctx).startContinuable({
          provider: spec.provider,
          label: spec.label,
          ...(spec.childId !== undefined ? { childId: hostSessionId(spec.childId) } : {}),
          request: {
            prompt: toHostBlocks(spec.prompt),
            parent: resolveHostAgent(ctx, spec.parent),
          },
          signal: spec.signal,
        });
        return {
          childId: soloipsSessionId(started.childId),
          messageId: started.messageId,
        };
      } catch (error: unknown) {
        throw mapHostError(`subagents.startContinuable(provider '${spec.provider}')`, error);
      }
    },

    async start(provider: string, spec: SoloipsContinuableStartSpec): Promise<SoloipsSubagentRun> {
      try {
        const run = await requireSubagents(ctx).start(provider, toHostStartRequest(spec, ctx));
        const wrapped: SoloipsSubagentRun = {
          id: soloipsSessionId(run.id),
          result: run.result.then(toSoloipsSubagentResult, (error: unknown) => {
            throw mapHostError(`subagents.start('${provider}') result`, error);
          }),
          dispose: async () => {
            try {
              await run.dispose();
            } catch (error: unknown) {
              throw mapHostError(`subagents.run('${provider}').dispose()`, error);
            }
          },
        };
        return wrapped;
      } catch (error: unknown) {
        throw mapHostError(`subagents.start('${provider}')`, error);
      }
    },

    async sendMessage(
      sender: SoloipsAgentRef,
      targetId: SoloipsSessionId,
      content: readonly SoloipsContentBlock[],
      options: { readonly signal: AbortSignal },
    ): Promise<string> {
      try {
        return await requireSubagents(ctx).sendMessage(
          resolveHostAgent(ctx, sender),
          hostSessionId(targetId),
          toHostBlocks(content),
          { signal: options.signal },
        );
      } catch (error: unknown) {
        throw mapHostError(`subagents.sendMessage(target '${targetId}')`, error);
      }
    },

    interrupt(
      targetSessionId: SoloipsSessionId,
      authority: SoloipsSubagentInterruptAuthority,
    ): void {
      const hostAuthority: SubagentInterruptAuthority =
        authority.kind === "user"
          ? { kind: "user", parentSessionId: hostSessionId(authority.parentSessionId) }
          : { kind: "ancestor", agent: resolveHostAgent(ctx, authority.agent) };
      try {
        requireSubagents(ctx).interrupt(hostSessionId(targetSessionId), hostAuthority);
      } catch (error: unknown) {
        throw mapHostError(`subagents.interrupt('${targetSessionId}')`, error);
      }
    },

    async listChildren(
      parentSessionId: SoloipsSessionId,
      signal?: AbortSignal,
    ): Promise<readonly SoloipsSubagentListEntry[]> {
      try {
        const entries = await requireSubagents(ctx).listChildren(
          hostSessionId(parentSessionId),
          signal,
        );
        return entries.map((entry) => fromHostListEntry(entry, parentSessionId));
      } catch (error: unknown) {
        throw mapHostError(`subagents.listChildren('${parentSessionId}')`, error);
      }
    },

    async listDescendants(
      rootSessionId: SoloipsSessionId,
      signal?: AbortSignal,
    ): Promise<readonly SoloipsSubagentListEntry[]> {
      try {
        const entries = await requireSubagents(ctx).listDescendants(
          hostSessionId(rootSessionId),
          signal,
        );
        return entries.map((entry) => fromHostListEntry(entry, soloipsSessionId(entry.parentId)));
      } catch (error: unknown) {
        throw mapHostError(`subagents.listDescendants('${rootSessionId}')`, error);
      }
    },

    listProviders(): readonly string[] {
      try {
        return requireSubagents(ctx).list();
      } catch (error: unknown) {
        throw mapHostError("subagents.listProviders()", error);
      }
    },
  };
}
