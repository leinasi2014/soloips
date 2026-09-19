/**
 * SOLOIPS-ADAPTER-PORTS-SHARED
 *
 * 跨端口共用的桥接件：宿主类型派生、品牌 id 转换、内容块双向校验/转换、
 * 子智能体结果投影与错误码映射。
 *
 * 分层（contracts-design §2.2）：本文件只做「宿主调用面 ↔ 契约类型」的转译，
 * 不做业务判断、不持有任何 domain handle。
 *
 * 转换纪律（DEV-05 / 禁止项 #7）：
 *  - 不使用 `any`、`as unknown as`（双重断言）或 `@ts-ignore`；
 *  - 每个断言都是**单向窄化**（目标类型可赋给来源类型），且伴随运行时校验；
 *  - 来源不可信的数据一律以 `unknown` 进入并结构化校验后才转成宿主类型。
 *
 * 错误分层：
 *  - 调用方数据不合法（内容块、事件、spec 字段）→ `TypeError`（调用方缺陷）；
 *  - 宿主服务缺失/失败 → `SoloipsAdapterError`（code 见契约 §0 的 6 个值）。
 */

import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SessionHandle } from "@deepseek-ai/dsh-session-persistence";
import type { SubagentResult } from "@deepseek-ai/dsh-subagent";
import type { ToolExecutionInput } from "@deepseek-ai/dsh-tools";
import {
  SoloipsAdapterError,
  type SoloipsAdapterErrorCode,
  type SoloipsAgentRef,
  type SoloipsContentBlock,
  type SoloipsSessionEvent,
  type SoloipsSessionId,
  type SoloipsSubagentResult,
} from "../contracts.js";

// ── 宿主类型派生（只经各包公开 exports，不 import 私有路径） ──────────────────

/** DSH `ContentBlock`（经 dsh-subagent 公开面派生；dsh-llm 不是本包依赖）。 */
export type HostContentBlock = SubagentResult["output"][number];
/** DSH `SessionId`（经 dsh-session-persistence 公开面派生；dsh-session 不是本包依赖）。 */
export type HostSessionId = SessionHandle["id"];
/** DSH `SessionEvent`（同上派生）。 */
export type HostSessionEvent = Awaited<ReturnType<SessionHandle["read"]>>["events"][number];
/** DSH `ToolCallId`（经 dsh-tools 公开面派生）。 */
export type HostToolCallId = ToolExecutionInput["callId"];

type HostImageAttachment = Extract<HostContentBlock, { type: "image" }>["attachment"];
type HostFileAttachment = Extract<HostContentBlock, { type: "file" }>["attachment"];

/**
 * 宿主 `image.attachment.mediaType` 的**完整**词表（4 值封闭联合，DEFECT-01 / D-1）。
 *
 * 〔约束〕来源是宿主类型本身，不是手抄的字面量清单——两侧各有一条编译期哨兵：
 *  - `satisfies` 保证**子集**：本表每个值都必须是宿主合法取值，宿主删值即编译失败；
 *  - {@link AssertMediaTypesExhaustive} 保证**全覆盖**：宿主每个取值都必须在本表内，
 *    宿主增值即编译失败。
 *
 * 运行期校验（{@link requireOneOf}）读的就是本表，故宿主联合演进时不可能静默漂移。
 */
const IMAGE_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const satisfies readonly HostImageAttachment["mediaType"][];

/** 静态自检：宿主 mediaType 联合的每个取值都在 `IMAGE_MEDIA_TYPES` 内（全覆盖）。 */
type AssertMediaTypesExhaustive =
  HostImageAttachment["mediaType"] extends (typeof IMAGE_MEDIA_TYPES)[number] ? true : never;
const assertMediaTypesExhaustive: AssertMediaTypesExhaustive = true;
void assertMediaTypesExhaustive;

// ── 品牌 id 转换：经 string 基类型做单向窄化断言（非双重断言） ────────────────
//
// 宿主品牌（`SessionId`、`ToolCallId`…）与契约品牌（`SoloipsSessionId`…）都是
// `string & {…}`；两者互不兼容是**有意的**。转换一律经下面这些小函数完成：
// 入参收窄到 `string`（品牌可赋给其基类型），出参对目标品牌做合法窄化断言。

/** 把契约侧字符串按宿主 `SessionId` 品牌收窄（运行时仍是同一字符串）。 */
export function hostSessionId(id: string): HostSessionId {
  return id as HostSessionId;
}

/** 把宿主会话 id 转成契约品牌（运行时仍是同一字符串）。 */
export function soloipsSessionId(id: string): SoloipsSessionId {
  return id as SoloipsSessionId;
}

/** 把契约侧调用 id 按宿主 `ToolCallId` 品牌收窄。 */
export function hostToolCallId(id: string): HostToolCallId {
  return id as HostToolCallId;
}

// ── Agent 权威凭证（SOLO-TEAM-03 / ORG-05） ───────────────────────────────────

/** 从宿主 `Agent`（结构上就是会话身份）投影出契约凭证。 */
export function toSoloipsAgentRef(agent: Agent): SoloipsAgentRef {
  return { sessionId: soloipsSessionId(agent.id) };
}

/**
 * 把契约凭证解析回**真实活跃**的宿主 Agent。
 *
 * 凭证只能出自 {@link toSoloipsAgentRef}；这里仍经 `ctx.agents` 重新解析，
 * 保证凭证指向的是当前活跃表里的 Agent，而不是任由调用方自带的字符串。
 * 服务缺失或不活跃都以 `SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE` fail-closed。
 */
export function resolveHostAgent(ctx: Context, ref: SoloipsAgentRef): Agent {
  const agents = ctx.get("agents");
  if (agents === undefined) {
    throw new SoloipsAdapterError(
      "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
      "host service 'agents' is not available",
    );
  }
  const agent = agents.get(hostSessionId(ref.sessionId));
  if (agent === undefined) {
    throw new SoloipsAdapterError(
      "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
      `no live agent for session '${ref.sessionId}'`,
    );
  }
  return agent;
}

// ── 内容块：宿主 → 契约 ───────────────────────────────────────────────────────

/**
 * 宿主内容块 → 契约内容块。
 *
 * 宿主 `ContentBlock` 是封闭接口联合，不隐式满足契约的字符串索引签名，因此
 * 用**浅拷贝**（对象字面量获得隐式索引签名）逐块转出。
 *
 * 〔约束〕浅拷贝的边界（DEFECT-01 / D-3）：外层块对象是新对象，嵌套引用
 * （`image.attachment`、`file.attachment`、`tool-result.content` 及其元素）**仍与
 * 宿主共享**，本函数不深拷贝——写嵌套字段会穿透到宿主块。调用方**不得原地修改**
 * 返回值；变更一律经 {@link toHostBlocks} 重建。这是契约 §1 对同类「返回介质/宿主
 * 原对象」句柄（`SoloipsKvTable`）的同一原则，不是深拷贝保证。
 */
export function toSoloipsBlocks(blocks: readonly HostContentBlock[]): SoloipsContentBlock[] {
  return blocks.map((block) => ({ ...block }));
}

// ── 内容块：契约 → 宿主（结构化校验，未知类型拒绝） ─────────────────────────

function requireString(value: unknown, where: string): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError(`soloips-adapter: content block field '${where}' must be a string`);
  }
}

function requireRecord(value: unknown, where: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`soloips-adapter: content block field '${where}' must be an object`);
  }
}

function requireArray(value: unknown, where: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`soloips-adapter: content block field '${where}' must be an array`);
  }
}

function requireSafeInt(value: unknown, where: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(
      `soloips-adapter: content block field '${where}' must be a non-negative integer`,
    );
  }
}

/**
 * 词表校验：值必须是 `allowed` 之一（DEFECT-01 / D-1）。
 *
 * 与 `requireString` 等同类：失败是**调用方数据缺陷**，故抛 `TypeError`；诊断含
 * 字段路径与**实得值**（不可信输入，必须能从日志定位到具体是哪个坏值）。
 * 调用方若需区分「类型错」与「取值错」，先跑 `requireString` 再跑本函数。
 */
function requireOneOf<T extends string>(
  value: string,
  allowed: readonly T[],
  where: string,
): asserts value is T {
  if (!allowed.some((candidate) => candidate === value)) {
    throw new TypeError(
      `soloips-adapter: content block field '${where}' must be one of ${allowed.join(", ")}; got '${value}'`,
    );
  }
}

function requireBoolean(value: unknown, where: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`soloips-adapter: content block field '${where}' must be a boolean`);
  }
}

function optionalString(value: unknown, where: string): string | undefined {
  if (value === undefined) return undefined;
  requireString(value, where);
  return value;
}

/**
 * 可选布尔：缺省通过，出现即必须是布尔（DEFECT-01 / D-2）。
 *
 * 宿主 `ToolResultBlock.isError` 是 `boolean | undefined`，故 `false` 与 `true`
 * 同属合法域；显式 `false` **原样保留**（不是折叠成缺省），否则
 * `toHostBlocks(toSoloipsBlocks(block))` 对带 `isError: false` 的宿主块不恒等。
 */
function optionalBoolean(value: unknown, where: string): boolean | undefined {
  if (value === undefined) return undefined;
  requireBoolean(value, where);
  return value;
}

function toHostBlock(block: SoloipsContentBlock): HostContentBlock {
  switch (block.type) {
    case "text":
    case "reasoning": {
      const text = block["text"];
      requireString(text, `${block.type}.text`);
      return block.type === "text" ? { type: "text", text } : { type: "reasoning", text };
    }
    case "image": {
      const attachment = block["attachment"];
      requireRecord(attachment, "image.attachment");
      const attachmentId = attachment["attachmentId"];
      requireString(attachmentId, "image.attachment.attachmentId");
      const mediaType = attachment["mediaType"];
      requireString(mediaType, "image.attachment.mediaType");
      // 〔约束〕两段式：先定类型（诊断说「不是字符串」），再定域（诊断带实得值）。
      // 谓词把 `mediaType` 窄化到宿主联合，故下方构造 `ref` 时**无需**再写
      // `as HostImageAttachment["mediaType"]`——那个断言曾是 D-1 的穿透点。
      requireOneOf(mediaType, IMAGE_MEDIA_TYPES, "image.attachment.mediaType");
      const bytes = attachment["bytes"];
      requireSafeInt(bytes, "image.attachment.bytes");
      const width = attachment["width"];
      requireSafeInt(width, "image.attachment.width");
      const height = attachment["height"];
      requireSafeInt(height, "image.attachment.height");
      const name = optionalString(attachment["name"], "image.attachment.name");
      const originalDimensions = attachment["originalDimensions"];
      let dimensions: { width: number; height: number } | undefined;
      if (originalDimensions !== undefined) {
        requireRecord(originalDimensions, "image.attachment.originalDimensions");
        const originalWidth = originalDimensions["width"];
        requireSafeInt(originalWidth, "image.attachment.originalDimensions.width");
        const originalHeight = originalDimensions["height"];
        requireSafeInt(originalHeight, "image.attachment.originalDimensions.height");
        dimensions = { width: originalWidth, height: originalHeight };
      }
      const ref: HostImageAttachment = {
        attachmentId: attachmentId as HostImageAttachment["attachmentId"],
        mediaType,
        bytes,
        width,
        height,
        ...(name !== undefined ? { name } : {}),
        ...(dimensions !== undefined ? { originalDimensions: dimensions } : {}),
      };
      return { type: "image", attachment: ref };
    }
    case "file": {
      const attachment = block["attachment"];
      requireRecord(attachment, "file.attachment");
      const attachmentId = attachment["attachmentId"];
      requireString(attachmentId, "file.attachment.attachmentId");
      const name = attachment["name"];
      requireString(name, "file.attachment.name");
      const bytes = attachment["bytes"];
      requireSafeInt(bytes, "file.attachment.bytes");
      const ref: HostFileAttachment = {
        attachmentId: attachmentId as HostFileAttachment["attachmentId"],
        name,
        bytes,
      };
      return { type: "file", attachment: ref };
    }
    case "tool-call": {
      const id = block["id"];
      requireString(id, "tool-call.id");
      const name = block["name"];
      requireString(name, "tool-call.name");
      const args = block["arguments"];
      requireString(args, "tool-call.arguments");
      return { type: "tool-call", id: hostToolCallId(id), name, arguments: args };
    }
    case "tool-result": {
      const toolCallId = block["toolCallId"];
      requireString(toolCallId, "tool-result.toolCallId");
      const content = block["content"];
      requireArray(content, "tool-result.content");
      const isError = optionalBoolean(block["isError"], "tool-result.isError");
      return {
        type: "tool-result",
        toolCallId: hostToolCallId(toolCallId),
        content: toHostBlocks(content as readonly SoloipsContentBlock[]),
        ...(isError === undefined ? {} : { isError }),
      };
    }
    default:
      throw new TypeError(`soloips-adapter: unsupported content block type '${block.type}'`);
  }
}

/**
 * 契约内容块 → 宿主内容块，逐块结构化校验（DEV-05：不可信数据先验证）。
 * 契约规定 core 只构造文本块；其余块必须满足宿主块的 JSON 结构，否则拒绝。
 */
export function toHostBlocks(blocks: readonly SoloipsContentBlock[]): HostContentBlock[] {
  return blocks.map(toHostBlock);
}

// ── 子智能体结果投影 ──────────────────────────────────────────────────────────

/** DSH `SubagentResult` → 契约 `SoloipsSubagentResult`（stopReason 词表一致）。 */
export function toSoloipsSubagentResult(result: SubagentResult): SoloipsSubagentResult {
  return {
    stopReason: result.stopReason,
    output: toSoloipsBlocks(result.output),
    ...(result.structured !== undefined ? { structured: result.structured } : {}),
    ...(result.diagnostic !== undefined ? { diagnostic: result.diagnostic } : {}),
  };
}

// ── 会话事件 ──────────────────────────────────────────────────────────────────

/** DSH `SessionEvent` → 契约事件（字段同名，直接投影）。 */
export function toSoloipsSessionEvent(event: HostSessionEvent): SoloipsSessionEvent {
  return { type: event.type, seq: event.seq, time: event.time, data: event.data };
}

// ── 错误映射 ──────────────────────────────────────────────────────────────────

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "non-error host failure";
}

/**
 * 以契约错误码包一层宿主失败。`SoloipsAdapterError` 原样透传；
 * `TypeError`（调用方数据缺陷）也原样透传；其余映射为
 * `SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE` 并保留 `cause`。
 */
export function mapHostError(
  scope: string,
  error: unknown,
  code: SoloipsAdapterErrorCode = "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
): SoloipsAdapterError | TypeError {
  if (error instanceof SoloipsAdapterError || error instanceof TypeError) {
    return error;
  }
  return new SoloipsAdapterError(code, `${scope}: ${describe(error)}`, { cause: error });
}

/** `await` 包装：把宿主调用失败统一映射进契约错误码（见 {@link mapHostError}）。 */
export async function withHostErrors<T>(scope: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    throw mapHostError(scope, error);
  }
}
