/**
 * SOLOIPS-ADAPTER-TOOLS-PORT
 *
 * 模型工具 seam（能力 4/5）：把 `ctx.tools`（ToolRuntime）包装成契约的
 * `SoloipsToolsPort`。
 *
 * 边界事实（0.1.6-alpha.1）：
 *  - 契约的 `parameters` / `output.schema` 是**宽松** JSON Schema 表示；宿主的
 *    `ToolDefinition.output.schema` 是强制子集 `JsonSchemaNode`。注册时经宿主
 *    自己导出的 `assertObjectJsonSchema` / `assertSupportedJsonSchema` 在边界做
 *    实际校验（契约 §5 的要求），拷贝后交给宿主。
 *  - 契约的 `SoloipsToolRunContext.agent` 是**必填**凭证；宿主执行上下文的
 *    `agent` 可缺失。无 agent 的调用以 `SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE`
 *    fail-closed（工具体抛错由宿主物化为错误结果；守卫返回拒绝理由）。
 *  - `get()` 返回包装定义，其 `execute` 走 `ctx.tools.execute` 的完整管线
 *    （pre/guard/around/post policy 一致适用），而不是裸工具体。
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ToolDefinition, ToolExecution, ToolRuntime } from "@deepseek-ai/dsh-tools";
import {
  assertObjectJsonSchema,
  assertSupportedJsonSchema,
  JsonSchemaError,
} from "@deepseek-ai/dsh-tools";
import {
  SoloipsAdapterError,
  type SoloipsAgentRef,
  type SoloipsContentBlock,
  type SoloipsToolDefinition,
  type SoloipsToolGuard,
  type SoloipsToolPresentationMode,
  type SoloipsToolRestriction,
  type SoloipsToolsPort,
} from "../contracts.js";
import {
  hostToolCallId,
  mapHostError,
  resolveHostAgent,
  toHostBlocks,
  toSoloipsAgentRef,
  toSoloipsBlocks,
} from "./shared.js";

function requireTools(ctx: Context): ToolRuntime {
  const tools = ctx.get("tools");
  if (tools === undefined) {
    throw new SoloipsAdapterError(
      "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
      "host service 'tools' is not available",
    );
  }
  return tools;
}

/** 宽松 JSON Schema 边界校验失败 → 调用方数据缺陷（TypeError，保 cause）。 */
function schemaTypeError(where: string, error: unknown): TypeError {
  const detail =
    error instanceof JsonSchemaError
      ? error.violations.join("; ")
      : error instanceof Error
        ? error.message
        : "unknown failure";
  return new TypeError(
    `soloips-adapter: tool ${where} outside the enforced JSON Schema subset: ${detail}`,
    {
      cause: error,
    },
  );
}

function toSoloipsRunContext(exec: ToolExecution): {
  agent: SoloipsAgentRef;
  signal: AbortSignal;
  callId: string;
} {
  if (exec.agent === undefined) {
    throw new SoloipsAdapterError(
      "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
      "tool execution carries no agent context; a SoloipsAgentRef cannot be constructed",
    );
  }
  return {
    agent: toSoloipsAgentRef(exec.agent),
    signal: exec.signal,
    callId: exec.callId,
  };
}

/** 构造工具端口。纯对象构造：只捕获 ctx，不触达宿主资源。 */
export function createToolsPort(ctx: Context): SoloipsToolsPort {
  return {
    register(definition: SoloipsToolDefinition): () => void {
      // 拷贝后校验、以同一拷贝注册（校验与上交的值一致）。
      const parameters = { ...definition.parameters };
      const outputSchema = { ...definition.output.schema };
      try {
        assertObjectJsonSchema(parameters);
        assertSupportedJsonSchema(outputSchema);
      } catch (error: unknown) {
        throw schemaTypeError(`'${definition.name}'`, error);
      }
      const host: ToolDefinition = {
        name: definition.name,
        description: definition.description,
        parameters,
        output: {
          schema: outputSchema,
          render: (args: unknown, value) => toHostBlocks(definition.output.render(args, value)),
        },
        execute: async (args: unknown, exec) => {
          if (exec.agent === undefined) {
            throw new SoloipsAdapterError(
              "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
              `tool '${definition.name}' was dispatched without an agent context; refusing fail-closed`,
            );
          }
          return definition.execute(args, {
            agent: toSoloipsAgentRef(exec.agent),
            signal: exec.signal,
            callId: exec.callId,
          });
        },
      };
      try {
        return requireTools(ctx).register(host);
      } catch (error: unknown) {
        throw mapHostError(`tools.register('${definition.name}')`, error);
      }
    },

    restrict(filter: SoloipsToolRestriction): () => void {
      try {
        return requireTools(ctx).restrict(filter);
      } catch (error: unknown) {
        throw mapHostError("tools.restrict()", error);
      }
    },

    guard(guard: SoloipsToolGuard): () => void {
      const hostGuard = (execution: Readonly<ToolExecution>): string | undefined => {
        if (execution.agent === undefined) {
          // 单调守卫没有 allow 结果；无法构造契约凭证时按 fail-closed 拒绝。
          return "soloips-adapter: tool call carries no agent context; denied fail-closed";
        }
        return guard({
          ...toSoloipsRunContext(execution),
          name: execution.name,
        });
      };
      try {
        return requireTools(ctx).guard(hostGuard);
      } catch (error: unknown) {
        throw mapHostError("tools.guard()", error);
      }
    },

    presentAs(mode: SoloipsToolPresentationMode): () => void {
      try {
        return requireTools(ctx).presentAs(mode);
      } catch (error: unknown) {
        throw mapHostError("tools.presentAs()", error);
      }
    },

    get(name: string): SoloipsToolDefinition | undefined {
      let host: ToolDefinition | undefined;
      try {
        host = requireTools(ctx).get(name);
      } catch (error: unknown) {
        throw mapHostError(`tools.get('${name}')`, error);
      }
      if (host === undefined) return undefined;
      return wrapHostToolDefinition(ctx, host);
    },

    names(): readonly string[] {
      try {
        return requireTools(ctx)
          .schemas()
          .map((schema) => schema.name);
      } catch (error: unknown) {
        throw mapHostError("tools.names()", error);
      }
    },
  };
}

/** 宿主 render 的取值参数类型（JsonValue，经公开面派生）。 */
type HostRenderValue = Parameters<ToolDefinition["output"]["render"]>[1];

/** 宿主定义 → 契约定义视图：execute 走完整宿主管线（见文件头注释）。 */
function wrapHostToolDefinition(ctx: Context, host: ToolDefinition): SoloipsToolDefinition {
  return {
    name: host.name,
    description: host.description,
    parameters: { ...host.parameters },
    output: {
      schema: { ...host.output.schema },
      render: (args: unknown, value: unknown): readonly SoloipsContentBlock[] =>
        // 契约的 value 是 unknown；宿主 render 在管线内只收到 JsonValue。
        // 窄化断言合法（JsonValue 可赋给 unknown），运行期由宿主侧保证。
        toSoloipsBlocks(host.output.render(args, value as HostRenderValue)),
    },
    execute: async (args: unknown, exec) => {
      const result = await requireTools(ctx).execute({
        callId: hostToolCallId(exec.callId),
        name: host.name,
        arguments: args,
        agent: resolveHostAgent(ctx, exec.agent),
        signal: exec.signal,
      });
      if (result.isError) {
        throw new Error(result.error.message);
      }
      return result.value;
    },
  };
}
