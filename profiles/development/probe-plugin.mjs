// Test-only plugin. The launcher resolves public exports from its installation.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const requireFromRuntime = createRequire(process.env.SOLOIPS_PROBE_ANCHOR);
const { LlmAdapter, ToolCallId, createUserMessage } = await import(
  pathToFileURL(requireFromRuntime.resolve("@deepseek-ai/dsh-llm")).href
);
const teamTools = [
  "spawn_teammate",
  "list_agents",
  "send_message",
  "wait_agent",
  "interrupt_agent",
  "team_task_create",
  "team_task_list",
  "team_task_get",
  "team_task_update",
];
const observations = [];
const shellTool = process.platform === "win32" ? "pwsh" : "bash";
const shellMarker = "SOLOIPS_DEVELOPMENT_SHELL_OK";
let shellResult;
let callSequence = 0;

function toolCall(name, args) {
  const id = ToolCallId(`soloips-probe-${++callSequence}`);
  const argumentsText = JSON.stringify(args);
  return [
    { type: "block-start", index: 0, blockType: "tool-call" },
    { type: "tool-call-delta", index: 0, id, name, argumentsDelta: argumentsText },
    {
      type: "block-end",
      index: 0,
      block: { type: "tool-call", id, name, arguments: argumentsText },
    },
    { type: "finish", reason: { kind: "tool-calls" } },
  ];
}

function textResponse(text) {
  return [
    { type: "block-start", index: 0, blockType: "text" },
    { type: "text-delta", index: 0, text },
    { type: "block-end", index: 0, block: { type: "text", text } },
    { type: "finish", reason: { kind: "stop" } },
  ];
}

class ProbeAdapter extends LlmAdapter {
  async *stream(options) {
    const tools = options.tools.map((tool) => tool.name).sort();
    for (const tool of [...teamTools, "read", "edit", "write", "skill", "workflow", shellTool]) {
      assert.ok(tools.includes(tool), `missing model tool: ${tool}`);
    }
    assert.equal(tools.length, new Set(tools).size, "duplicate model tool names");
    assert.ok(!tools.some((tool) => tool.startsWith("subagent")), "legacy subagent tool remains");
    const messagesText = JSON.stringify(options.messages);
    assert.ok(
      messagesText.includes("SOLOIPS_PROJECT_INSTRUCTIONS_PROBE"),
      "project AGENTS.md not injected",
    );
    assert.ok(
      messagesText.includes("SOLOIPS_HOME_INSTRUCTIONS_PROBE"),
      "home AGENTS.md not injected",
    );
    const isTeammate = messagesText.includes("You are teammate");
    observations.push({ role: isTeammate ? "teammate" : "lead", tools });
    const priorCalls = options.messages.flatMap((message) =>
      message.role === "assistant"
        ? message.content.filter((block) => block.type === "tool-call").map((block) => block.name)
        : [],
    );
    if (!isTeammate && priorCalls.includes(shellTool)) {
      const call = options.messages
        .flatMap((message) => message.content)
        .find((block) => block.type === "tool-call" && block.name === shellTool);
      const result = options.messages
        .flatMap((message) => message.content)
        .find((block) => block.type === "tool-result" && block.toolCallId === call.id);
      shellResult = {
        tool: shellTool,
        isError: result?.isError === true,
        text: result?.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim(),
      };
      assert.equal(shellResult.isError, false, "shell tool returned an infrastructure error");
      assert.equal(shellResult.text, shellMarker, "shell did not return the clean fixed marker");
    }
    let chunks;
    if (isTeammate) chunks = textResponse("SOLOIPS_TEAMMATE_PRESET_OK");
    else if (!priorCalls.includes(shellTool))
      chunks = toolCall(shellTool, {
        command:
          shellTool === "pwsh"
            ? `Write-Output '${shellMarker}'`
            : `printf '%s\\n' '${shellMarker}'`,
        description: "Print the development shell verification marker",
        timeoutMs: 10000,
      });
    else if (!priorCalls.includes("spawn_teammate"))
      chunks = toolCall("spawn_teammate", {
        name: "preset-checker",
        description: "Check inherited development composition",
        prompt: "Verify your inherited tool catalog and workspace instructions, then finish.",
        context: "fresh",
      });
    else if (!priorCalls.includes("wait_agent"))
      chunks = toolCall("wait_agent", { timeout_ms: 10000 });
    else if (!priorCalls.includes("team_task_list")) chunks = toolCall("team_task_list", {});
    else chunks = textResponse("SOLOIPS_DEVELOPMENT_PRESET_OK");
    for (const chunk of chunks) {
      options.signal?.throwIfAborted();
      yield chunk;
    }
  }
}

export const name = "soloips-development-probe";
export const inject = ["agents", "agentPresets", "agentTeams", "llm", "sessions"];
export function apply(ctx) {
  ctx.llm.registerAdapter(["deepseek-official"], new ProbeAdapter());
  const exit = ctx.get("appExit");
  const ready = ctx.get("appReady");
  assert.ok(exit && ready, "probe requires the official profile launcher");
  const run = async () => {
    const handle = await ctx.agents.create({
      sessionId: `soloips-preset-probe-${Date.now()}`,
      meta: { cwd: process.cwd(), agentPreset: "soloips-development" },
      agentOptions: { provider: "deepseek-official", model: "deepseek-chat" },
      setup: async (agentCtx) => {
        await ctx.agentPresets.mount(agentCtx, "soloips-development");
      },
    });
    const executedTools = [];
    let finalText = "";
    const stopObserving = ctx.on("session/event", (session, event) => {
      if (session !== handle.agent.session) return;
      if (event.type === "tool/call") executedTools.push(event.data.name);
      if (event.type === "assistant/message") {
        finalText = event.data.message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");
      }
    });
    try {
      handle.agent.followup(
        createUserMessage({
          content: [{ type: "text", text: "Use Agent Teams for the isolated preset check." }],
          source: { kind: "user" },
        }),
      );
      await handle.agent.whenIdle();
      assert.deepEqual(
        shellResult,
        { tool: shellTool, isError: false, text: shellMarker },
        "shell execution did not succeed",
      );
      assert.ok(
        observations.some((item) => item.role === "lead"),
        "lead did not run",
      );
      assert.ok(
        observations.some((item) => item.role === "teammate"),
        "teammate did not run",
      );
      for (const tool of [shellTool, "spawn_teammate", "wait_agent", "team_task_list"])
        assert.ok(executedTools.includes(tool), `tool was not invoked: ${tool}`);
      assert.equal(
        finalText,
        "SOLOIPS_DEVELOPMENT_PRESET_OK",
        "lead did not finish its turn successfully",
      );
      const members = ctx.agentTeams.listMembers(handle.agent);
      assert.equal(members.length, 2, "real Team member was not created");
      assert.ok(
        members
          .filter((member) => member.role === "teammate")
          .every((member) => member.status === "inactive"),
        "teammate did not complete",
      );
      await ctx.sessions.flush(handle.agent.session);
      process.stdout.write(
        JSON.stringify(
          {
            result: "SOLOIPS_DEVELOPMENT_PRESET_OK",
            shellResult,
            executedTools,
            observations,
            members,
          },
          null,
          2,
        ) + "\n",
      );
    } finally {
      stopObserving();
      await handle.dispose();
    }
    exit(0);
  };
  ctx.effect(() =>
    ready.onReady(() => {
      void run().catch((error) => {
        process.stderr.write(String(error.stack ?? error) + "\n");
        exit(1);
      });
    }),
  );
}
