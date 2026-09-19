/**
 * ports/shared.ts（DSH 宿主 ↔ 契约类型的转译层）行为契约测试 —— 切片 STORAGE-04。
 *
 * 被测面：`packages/adapter-dsh/src/ports/shared.ts` 的全部导出（11 个函数 + 4 个类型）。
 * 这一层是**不可信数据的第一道闸门**：`toHostBlocks` 对契约内容块逐字段做结构化校验，
 * 其余函数是纯投影 / 品牌窄化 / 错误映射。本文件按「函数 → 用例」逐条钉住行为：
 *
 *  - 合法输入 → 逐字段转换结果（含可选键的**存在性**，不只是值）；
 *  - 非法输入 → 拒绝形态（TypeError = 调用方数据缺陷；SoloipsAdapterError =
 *    宿主服务缺失/失败——见 shared.ts:15-18 的错误分层），且逐分支覆盖；
 *  - 边界探针：null / undefined / 数组 / 原型链注入 / 类型混淆（NaN、Infinity、-0）
 *    与不可变性（返回新对象？嵌套引用是否泄漏）。
 *
 * 依据：src/ports/shared.ts 文件头（转换纪律 DEV-05 / 禁止项 #7、错误分层）；
 *      src/contracts.ts §0（错误码、品牌）、§4（子智能体结果）、§6（事件）；
 *      docs/reference/rewrite-seam-client.md SEAM-05（官方依赖只经 adapter 收敛）。
 *
 * 纪律：本文件只**观察**实现，不改实现。可疑行为就地以「〔观察〕」/「〔缺陷候选〕」
 * 注释记录，并在切片报告中单列（复现 + 影响判断）。已确认的缺陷曾用 `it.fails` 钉住——
 * 实现修好后该用例转为失败，起绊线作用。
 *
 * 〔DEFECT-01，2026-09-19〕D-1（`mediaType` 词表缺口）修复后**本文件已无绊线**：原
 * `it.fails` 与其「现状记录」配套用例一并删除，改为断言修复后的行为（词表内取值通过、
 * 词表外取值以含实得值的 TypeError 拒绝）；D-2（`isError: false` 往返不恒等）改为断言
 * 三种宿主合法形状往返恒等。D-3 是纯注释修正，本文件只保留「嵌套引用共享」的事实用例。
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import type { Agent, AgentRegistry } from "@deepseek-ai/dsh-agent";
import type { SubagentResult } from "@deepseek-ai/dsh-subagent";
import {
  SoloipsAdapterError,
  type SoloipsAdapterErrorCode,
  type SoloipsAgentRef,
  type SoloipsContentBlock,
  type SoloipsSessionEvent,
  type SoloipsSubagentResult,
} from "../src/contracts";
import {
  hostSessionId,
  hostToolCallId,
  mapHostError,
  resolveHostAgent,
  soloipsSessionId,
  toHostBlocks,
  toSoloipsAgentRef,
  toSoloipsBlocks,
  toSoloipsSessionEvent,
  toSoloipsSubagentResult,
  withHostErrors,
  type HostContentBlock,
  type HostSessionEvent,
  type HostSessionId,
  type HostToolCallId,
} from "../src/ports/shared";

// ── 宿主类型派生（与 shared.ts 内部同一派生法，避免引入非本包依赖） ──────────────

type HostImageAttachment = Extract<HostContentBlock, { type: "image" }>["attachment"];
type HostFileAttachment = Extract<HostContentBlock, { type: "file" }>["attachment"];
type HostToolResultBlock = Extract<HostContentBlock, { type: "tool-result" }>;

// ── 夹具 ──────────────────────────────────────────────────────────────────────

/** 宿主 Agent 桩：`Agent` 由 dsh-agent 的 runtime face 增补出 12+ 个成员
 * （options/session/inbox/status/…），本层只读 `id`。单次断言只表达
 * 「刻意未实现其余成员」这一完整性缺口——被测函数不消费它们。 */
function hostAgent(id: string): Agent {
  return { id: hostSessionId(id) } as Agent;
}

const hostImageAttachment: HostImageAttachment = {
  attachmentId: "att-image-1" as HostImageAttachment["attachmentId"],
  mediaType: "image/png",
  bytes: 1024,
  width: 640,
  height: 480,
  name: "shot.png",
  originalDimensions: { width: 1280, height: 960 },
};

const hostFileAttachment: HostFileAttachment = {
  attachmentId: "att-file-1" as HostFileAttachment["attachmentId"],
  name: "notes.md",
  bytes: 42,
};

/** 6 种宿主块各一（宿主 `ContentBlockMap` 的全部标签）。 */
const hostBlocks: readonly HostContentBlock[] = [
  { type: "text", text: "hello" },
  { type: "reasoning", text: "thinking" },
  { type: "image", attachment: hostImageAttachment },
  { type: "file", attachment: hostFileAttachment },
  { type: "tool-call", id: hostToolCallId("call-1"), name: "probe", arguments: '{"x":1}' },
  {
    type: "tool-result",
    toolCallId: hostToolCallId("call-1"),
    content: [{ type: "text", text: "ok" }],
    isError: true,
  },
];

/** 契约侧 image 块：`SoloipsContentBlock` 是宽松记录，附件字段逐条手写（模拟不可信输入）。 */
function contractImageBlock(attachment: Record<string, unknown>): SoloipsContentBlock {
  return { type: "image", attachment };
}

/** 合法 image 附件的契约侧写法（各用例按需覆盖单个字段）。 */
function contractImageAttachment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    attachmentId: "att-image-1",
    mediaType: "image/png",
    bytes: 1024,
    width: 640,
    height: 480,
    ...overrides,
  };
}

// ── 断言助手 ──────────────────────────────────────────────────────────────────

/** 取唯一元素（`noUncheckedIndexedAccess` 下同时把「恰好一项」变成显式前提）。 */
function only<T>(items: readonly T[]): T {
  const [first] = items;
  if (first === undefined) throw new Error("[test] 期望恰好一项，实际为空");
  return first;
}

/** 断言拒绝形态：TypeError（调用方数据缺陷）且 message 命中契约文案。 */
function expectBlockRejected(block: unknown, message: string): void {
  // 传非法数据正是本用例的目的，故用单次断言 `as SoloipsContentBlock`（比 `as unknown as` 诚实）。
  const run = (): unknown => toHostBlocks([block as SoloipsContentBlock]);
  expect(run).toThrow(TypeError);
  expect(run).toThrowError(message);
}

/** 取出唯一块的 image 附件（类型收窄失败即测试失败，不做静默跳过）。 */
function imageAttachmentOf(blocks: readonly HostContentBlock[]): HostImageAttachment {
  const block = only(blocks);
  if (block.type !== "image") throw new Error(`[test] 期望 image 块，实际 '${block.type}'`);
  return block.attachment;
}

function toolResultBlockOf(blocks: readonly HostContentBlock[]): HostToolResultBlock {
  const block = only(blocks);
  if (block.type !== "tool-result")
    throw new Error(`[test] 期望 tool-result 块，实际 '${block.type}'`);
  return block;
}

/**
 * 原型链注入输入：属性只在原型上，自有属性为空。
 * 测试对象是「校验是否区分自有属性与继承属性」（`Object.create` 返回 `any`，故显式窄化）。
 */
function prototypeInjected(proto: Record<string, unknown>): SoloipsContentBlock {
  return Object.create(proto) as unknown as SoloipsContentBlock;
}

/** 桩 Agent 注册表：只实现被测路径用到的 `get`（`satisfies` 让签名受编译器检查）。 */
function contextWithAgents(live: ReadonlyMap<string, Agent>): Context {
  const registry = {
    get(id: string): Agent | undefined {
      return live.get(id);
    },
  } satisfies Pick<AgentRegistry, "get">;
  const ctx = new Context();
  // `AgentRegistry` 是带私有字段的类，结构子集无法经单次断言转成它（TS 名义性），
  // 故此处是刻意的一次双重断言：桩**只**模拟 `get`，其余成员不在被测路径上。
  ctx.provide("agents", registry as unknown as AgentRegistry);
  return ctx;
}

/** 未装载任何宿主服务的真实 cordis Context（`get` 返回 undefined）。 */
function bareContext(): Context {
  return new Context();
}

// ── 导出类型（类型层契约；由 typecheck 的 tsconfig.tests.json 求值） ─────────────

describe("导出类型（type-only 导出，靠类型检查求值）", () => {
  it("HostSessionId / HostToolCallId 是字符串品牌；HostSessionEvent 可投影为契约事件", () => {
    expectTypeOf<HostSessionId>().toExtend<string>();
    expectTypeOf<HostToolCallId>().toExtend<string>();
    expectTypeOf<HostSessionEvent>().toExtend<SoloipsSessionEvent>();
  });

  it("HostContentBlock 词表 = 宿主 6 个标签（与 toHostBlock 的 switch 分支同步的漂移哨兵）", () => {
    expectTypeOf<HostContentBlock["type"]>().toEqualTypeOf<
      "text" | "reasoning" | "image" | "file" | "tool-call" | "tool-result"
    >();
  });

  it("契约 stopReason 词表与宿主 SubagentStopReasonMap 一致（投影不翻译词表）", () => {
    expectTypeOf<SoloipsSubagentResult["stopReason"]>().toEqualTypeOf<
      SubagentResult["stopReason"]
    >();
  });
});

// ── 品牌 id 转换 ──────────────────────────────────────────────────────────────

describe("品牌 id 转换（shared.ts:79-91；纯窄化断言，运行时仍是同一字符串）", () => {
  it("三个转换器原样返回入参字符串（含空串、空白、非 ASCII、超长串）", () => {
    for (const id of ["session-1", "", "  ", "会话/1", "x".repeat(4096)]) {
      expect(hostSessionId(id)).toBe(id);
      expect(soloipsSessionId(id)).toBe(id);
      expect(hostToolCallId(id)).toBe(id);
      expect(typeof hostSessionId(id)).toBe("string");
    }
  });

  it("不做任何规范化：大小写、空白、路径分隔符原样保留", () => {
    const raw = "  Session\\A/B  ";
    expect(soloipsSessionId(raw)).toBe(raw);
    expect(hostToolCallId(raw)).toBe(raw);
  });

  it("不拒绝空串与超长串（〔观察〕品牌窄化无运行时校验，见 shared.ts:72-76 的转换纪律说明）", () => {
    expect(hostSessionId("")).toBe("");
    const long = "y".repeat(100_000);
    expect(soloipsSessionId(long)).toBe(long);
  });

  it("〔边界〕运行时不做 typeof 校验：非字符串原样穿透（类型层由调用方保证）", () => {
    // 这三个函数只是 `id as Brand`；传非字符串不抛错，问题被推迟到宿主调用点。
    // 判断：可接受——契约类型已把入参收窄为 string，函数职责只是品牌转换；
    // 但「收窄 + 无校验」意味着 JS 调用方（无类型检查）得不到边界保护。
    expect(hostSessionId(42 as unknown as string)).toBe(42);
    expect(soloipsSessionId(undefined as unknown as string)).toBe(undefined);
    expect(hostToolCallId(null as unknown as string)).toBe(null);
  });
});

// ── toSoloipsAgentRef ────────────────────────────────────────────────────────

describe("toSoloipsAgentRef（shared.ts:96-98；宿主 Agent → 契约凭证）", () => {
  it("只投影 sessionId，且每次新建对象（不返回宿主 Agent 本身）", () => {
    const agent = hostAgent("session-1");
    const ref = toSoloipsAgentRef(agent);

    expect(ref).toEqual({ sessionId: "session-1" });
    expect(ref).not.toBe(agent);
    expect(Object.keys(ref)).toEqual(["sessionId"]);
  });

  it("〔边界〕宿主 Agent 上的额外字段不进入凭证", () => {
    const agent = { ...hostAgent("session-1"), status: "running" } as Agent & { status: string };
    const ref = toSoloipsAgentRef(agent);

    expect(ref).toEqual({ sessionId: "session-1" });
    expect("status" in ref).toBe(false);
  });

  it("〔不可变性〕凭证与宿主 Agent 解耦：改宿主 id 不影响已发出的凭证", () => {
    const agent = hostAgent("session-1");
    const ref = toSoloipsAgentRef(agent);

    // 宿主 Agent 的 `id` 是 readonly（类型层），这里经可变视图改它——模拟宿主侧
    // 对同一对象的实际改动，验证凭证已捕获值而不是保留引用。
    (agent as { id: HostSessionId }).id = hostSessionId("session-2");
    expect(ref.sessionId).toBe("session-1");
  });
});

// ── resolveHostAgent ─────────────────────────────────────────────────────────

describe("resolveHostAgent（shared.ts:107-123；凭证 → 真实活跃宿主 Agent，fail-closed）", () => {
  it("命中活跃表：返回宿主表里的同一 Agent 实例", () => {
    const agent = hostAgent("session-1");
    const ctx = contextWithAgents(new Map([["session-1", agent]]));

    const resolved = resolveHostAgent(ctx, { sessionId: soloipsSessionId("session-1") });

    expect(resolved).toBe(agent);
  });

  it("宿主服务缺失 → SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE（不伪装成「不活跃」）", () => {
    const ctx = bareContext();

    let thrown: unknown;
    try {
      resolveHostAgent(ctx, { sessionId: soloipsSessionId("session-1") });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SoloipsAdapterError);
    expect((thrown as SoloipsAdapterError).code).toBe("SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE");
    expect((thrown as SoloipsAdapterError).message).toBe("host service 'agents' is not available");
  });

  it("不在活跃表 → 同一错误码，message 带上会话 id（诊断可定位）", () => {
    const ctx = contextWithAgents(new Map());

    let thrown: unknown;
    try {
      resolveHostAgent(ctx, { sessionId: soloipsSessionId("ghost") });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SoloipsAdapterError);
    expect((thrown as SoloipsAdapterError).code).toBe("SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE");
    expect((thrown as SoloipsAdapterError).message).toContain("ghost");
  });

  it("每次解析都重查宿主活跃表：Agent 下线后同一凭证即被拒（凭证不自带 Agent）", () => {
    const live = new Map([["session-1", hostAgent("session-1")]]);
    const ctx = contextWithAgents(live);
    const ref: SoloipsAgentRef = { sessionId: soloipsSessionId("session-1") };

    expect(resolveHostAgent(ctx, ref)).toBeDefined();
    live.clear();
    expect(() => resolveHostAgent(ctx, ref)).toThrow(SoloipsAdapterError);
  });

  it("〔边界〕null 凭证 → 原生 TypeError（不是契约错误码；调用方缺陷的裸形态）", () => {
    const ctx = contextWithAgents(new Map());
    expect(() => resolveHostAgent(ctx, null as unknown as SoloipsAgentRef)).toThrow(TypeError);
  });

  it("〔观察〕凭证形状不被校验：多余的 sessionId 之外字段被忽略", () => {
    const agent = hostAgent("session-1");
    const ctx = contextWithAgents(new Map([["session-1", agent]]));
    const ref = { sessionId: soloipsSessionId("session-1"), extra: "ignored" } as SoloipsAgentRef;

    expect(resolveHostAgent(ctx, ref)).toBe(agent);
  });
});

// ── toSoloipsBlocks（宿主 → 契约） ────────────────────────────────────────────

describe("toSoloipsBlocks（shared.ts:139-141；宿主块 → 契约块，浅拷贝投影）", () => {
  it("空数组 → 空数组（且不是同一数组）", () => {
    const input: readonly HostContentBlock[] = [];
    const output = toSoloipsBlocks(input);

    expect(output).toEqual([]);
    expect(output).not.toBe(input);
  });

  it("逐块浅拷贝：外层对象是新对象，值与顺序逐字段一致（6 种标签全覆盖）", () => {
    const output = toSoloipsBlocks(hostBlocks);

    expect(output).toEqual(hostBlocks);
    expect(output).toHaveLength(hostBlocks.length);
    expect(output.map((block) => block["type"])).toEqual([
      "text",
      "reasoning",
      "image",
      "file",
      "tool-call",
      "tool-result",
    ]);
    for (const [index, block] of output.entries()) {
      expect(block).not.toBe(hostBlocks[index]);
    }
  });

  it("〔不可变性〕改写返回块不影响宿主块（外层隔离）", () => {
    const hostBlock: HostContentBlock = { type: "text", text: "hello" };
    const output = toSoloipsBlocks([hostBlock]);

    // 契约块是只读索引签名；改写经宽松记录视图进行（本用例目的就是「若改写会怎样」）。
    const mutable = only(output) as Record<string, unknown>;
    mutable["text"] = "tampered";
    expect(hostBlock).toEqual({ type: "text", text: "hello" });
  });

  it("〔D-3 已修·浅拷贝边界〕嵌套引用被共享：attachment 与 tool-result.content 仍是宿主对象", () => {
    // 修复前实现注释称「不共享可变引用」，但 `{...block}` 只复制一层，注释措辞与事实不符。
    // 〔D-3 处置〕浅拷贝是**有意设计**（对象字面量获得隐式索引签名），故改注释而非改实现：
    // shared.ts 的 toSoloipsBlocks 文档现明确「外层新建、嵌套引用共享、调用方不得原地修改」。
    // 本用例钉住该事实：若将来改成深拷贝，注释需同步回改。
    const output = toSoloipsBlocks(hostBlocks);
    const convertedImage = only(output.filter((block) => block["type"] === "image"));
    const convertedToolResult = only(output.filter((block) => block["type"] === "tool-result"));

    expect(convertedImage["attachment"]).toBe(hostImageAttachment);
    expect(convertedToolResult["content"]).toBe(
      (hostBlocks[5] as Extract<HostContentBlock, { type: "tool-result" }> | undefined)?.content,
    );
  });

  it("〔边界〕宿主方向不做校验：null / 数字 / 字符串元素被 spread 成普通对象，静默通过", () => {
    // 宿主是可信来源（块类型由 dsh-llm 铸造），故此处无校验是设计选择；但注意
    // 「不可信数据先验证」的纪律（shared.ts:13）在本方向**不适用**——契约块类型
    // 带字符串索引签名，投影不会失败，坏输入会静默变成 `{}`。
    const output = toSoloipsBlocks([null, 42, "ab"] as unknown as readonly HostContentBlock[]);

    expect(output).toEqual([{}, {}, { 0: "a", 1: "b" }]);
  });

  it("〔边界〕原型链注入：只复制自有可枚举属性，继承字段被丢弃", () => {
    const injected = Object.create({
      type: "text",
      text: "inherited",
    }) as unknown as HostContentBlock;
    const output = toSoloipsBlocks([injected]);

    expect(only(output)).toEqual({});
    expect(only(output)["type"]).toBeUndefined();
  });

  it("〔边界〕非数组输入 → 原生 TypeError（fail-closed，但诊断不是契约文案）", () => {
    expect(() => toSoloipsBlocks(null as unknown as readonly HostContentBlock[])).toThrow(
      TypeError,
    );
    expect(() => toSoloipsBlocks(undefined as unknown as readonly HostContentBlock[])).toThrow(
      TypeError,
    );
  });
});

// ── toHostBlocks（契约 → 宿主，结构化校验） ───────────────────────────────────

describe("toHostBlocks · 合法输入（shared.ts:215-311）", () => {
  it("空数组 → 空数组", () => {
    expect(toHostBlocks([])).toEqual([]);
  });

  it("text / reasoning：只保留 type 与 text，顺序与长度保持", () => {
    const input: SoloipsContentBlock[] = [
      { type: "text", text: "hello" },
      { type: "reasoning", text: "thinking" },
    ];

    expect(toHostBlocks(input)).toEqual([
      { type: "text", text: "hello" },
      { type: "reasoning", text: "thinking" },
    ]);
  });

  it("text：空字符串被接受（非空性不在契约内）", () => {
    expect(toHostBlocks([{ type: "text", text: "" }])).toEqual([{ type: "text", text: "" }]);
  });

  it("多余字段被丢弃（未知字段不进入宿主块）", () => {
    const text = toHostBlocks([{ type: "text", text: "hi", extra: "dropped", nested: { a: 1 } }]);
    const image = toHostBlocks([contractImageBlock(contractImageAttachment({ offloaded: true }))]);

    expect(only(text)).toEqual({ type: "text", text: "hi" });
    expect(imageAttachmentOf(image)).toEqual({
      attachmentId: "att-image-1",
      mediaType: "image/png",
      bytes: 1024,
      width: 640,
      height: 480,
    });
  });

  it("image：全字段转出（含 name 与 originalDimensions）", () => {
    const output = toHostBlocks([
      contractImageBlock(
        contractImageAttachment({
          name: "shot.png",
          originalDimensions: { width: 1280, height: 960 },
        }),
      ),
    ]);

    expect(only(output)).toEqual({
      type: "image",
      attachment: {
        attachmentId: "att-image-1",
        mediaType: "image/png",
        bytes: 1024,
        width: 640,
        height: 480,
        name: "shot.png",
        originalDimensions: { width: 1280, height: 960 },
      },
    });
  });

  it("image：可选字段省略时键**不存在**（不是 undefined——exactOptionalPropertyTypes 的条件展开）", () => {
    const output = toHostBlocks([contractImageBlock(contractImageAttachment())]);
    const attachment = imageAttachmentOf(output);

    expect("name" in attachment).toBe(false);
    expect("originalDimensions" in attachment).toBe(false);
    expect(Object.keys(attachment)).toEqual([
      "attachmentId",
      "mediaType",
      "bytes",
      "width",
      "height",
    ]);
  });

  it("image：显式 undefined 的可选字段同样不产出键", () => {
    const output = toHostBlocks([
      contractImageBlock(
        contractImageAttachment({ name: undefined, originalDimensions: undefined }),
      ),
    ]);
    const attachment = imageAttachmentOf(output);

    expect("name" in attachment).toBe(false);
    expect("originalDimensions" in attachment).toBe(false);
  });

  it("image：bytes = 0 与 -0 被接受（非负整数含 0；〔观察〕-0 通过 `Number.isSafeInteger`）", () => {
    const zero = toHostBlocks([contractImageBlock(contractImageAttachment({ bytes: 0 }))]);
    const negativeZero = toHostBlocks([contractImageBlock(contractImageAttachment({ bytes: -0 }))]);

    expect(imageAttachmentOf(zero).bytes).toBe(0);
    expect(imageAttachmentOf(negativeZero).bytes).toBe(-0);
  });

  it("〔D-1 已修〕image：mediaType 走宿主词表校验，4 个合法值全通过且值原样保留", () => {
    // 词表来源是宿主 `HostImageAttachment["mediaType"]`（4 值封闭联合），不是手抄清单；
    // 宿主联合演进时 src/ports/shared.ts 的 `satisfies` + 全覆盖哨兵会先编译失败。
    for (const mediaType of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
      const output = toHostBlocks([contractImageBlock(contractImageAttachment({ mediaType }))]);

      expect(imageAttachmentOf(output).mediaType).toBe(mediaType);
    }
  });

  it("file：转出 attachmentId / name / bytes", () => {
    const output = toHostBlocks([
      { type: "file", attachment: { attachmentId: "att-file-1", name: "notes.md", bytes: 42 } },
    ]);

    expect(only(output)).toEqual({
      type: "file",
      attachment: { attachmentId: "att-file-1", name: "notes.md", bytes: 42 },
    });
  });

  it("tool-call：id 走宿主品牌，arguments 保留原始 JSON 字符串", () => {
    const output = toHostBlocks([
      { type: "tool-call", id: "call-1", name: "probe", arguments: '{"x":1}' },
    ]);

    expect(only(output)).toEqual({
      type: "tool-call",
      id: "call-1",
      name: "probe",
      arguments: '{"x":1}',
    });
  });

  it("tool-result：递归转换 content，isError 缺省时键不存在", () => {
    const output = toHostBlocks([
      {
        type: "tool-result",
        toolCallId: "call-1",
        content: [
          { type: "text", text: "ok" },
          { type: "reasoning", text: "why" },
        ],
      },
    ]);
    const block = toolResultBlockOf(output);

    expect(block).toEqual({
      type: "tool-result",
      toolCallId: "call-1",
      content: [
        { type: "text", text: "ok" },
        { type: "reasoning", text: "why" },
      ],
    });
    expect("isError" in block).toBe(false);
  });

  it("tool-result：isError === true 时键存在且为 true", () => {
    const output = toHostBlocks([
      { type: "tool-result", toolCallId: "call-1", content: [], isError: true },
    ]);
    const block = toolResultBlockOf(output);

    expect(block.isError).toBe(true);
    expect("isError" in block).toBe(true);
  });

  it("〔D-2 已修〕tool-result：isError === false 时键存在且为 false（宿主合法形状，不折叠成缺省）", () => {
    // 宿主 `ToolResultBlock.isError?: boolean` 允许显式 false（dsh-tools 自己就产出
    // `isError: false` 的成功结果）。契约方向曾只接受 true，使往返对含 false 的块必失败。
    const output = toHostBlocks([
      { type: "tool-result", toolCallId: "call-1", content: [], isError: false },
    ]);
    const block = toolResultBlockOf(output);

    expect(block.isError).toBe(false);
    expect("isError" in block).toBe(true); // 显式 false 与缺省是两种形状，不能合并
  });

  it("〔不可变性〕返回全新对象与数组：附件、嵌套 content 均不与输入共享", () => {
    const attachment = contractImageAttachment();
    const inner: SoloipsContentBlock[] = [{ type: "text", text: "ok" }];
    const input: SoloipsContentBlock[] = [
      { type: "image", attachment },
      { type: "tool-result", toolCallId: "call-1", content: inner },
    ];
    const snapshot = structuredClone(input);
    const output = toHostBlocks(input);

    const [convertedImage, convertedToolResult] = output;

    expect(output).not.toBe(input);
    expect(convertedImage).not.toBe(input[0]);
    expect(convertedToolResult).not.toBe(input[1]);
    expect(imageAttachmentOf([convertedImage as HostContentBlock])).not.toBe(attachment);
    expect(toolResultBlockOf([convertedToolResult as HostContentBlock]).content).not.toBe(inner);
    expect(toolResultBlockOf([convertedToolResult as HostContentBlock]).content[0]).not.toBe(
      only(inner),
    );
    expect(input).toEqual(snapshot); // 输入未被改写
  });
});

describe("toHostBlocks · 非法输入逐分支拒绝（调用方数据缺陷 → TypeError）", () => {
  it("拒绝形态一律 TypeError，且不是 SoloipsAdapterError（错误分层：调用方缺陷 vs 宿主失败）", () => {
    let thrown: unknown;
    try {
      toHostBlocks([{ type: "text", text: 1 } as SoloipsContentBlock]);
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TypeError);
    expect(thrown).not.toBeInstanceOf(SoloipsAdapterError);
    expect((thrown as TypeError).message).toContain("soloips-adapter: content block field");
  });

  it.each<[string, unknown, string]>([
    ["未知类型标签", { type: "bogus" }, "unsupported content block type 'bogus'"],
    ["缺 type（undefined 标签）", {}, "unsupported content block type 'undefined'"],
    ["空 type 标签", { type: "" }, "unsupported content block type ''"],
    ["text.text 为数字", { type: "text", text: 1 }, "'text.text' must be a string"],
    ["text.text 缺失", { type: "text" }, "'text.text' must be a string"],
    ["text.text 为 null", { type: "text", text: null }, "'text.text' must be a string"],
    ["text.text 为数组", { type: "text", text: [] }, "'text.text' must be a string"],
    ["text.text 为对象", { type: "text", text: {} }, "'text.text' must be a string"],
    [
      "text.text 为 String 包装对象",
      { type: "text", text: new String("x") },
      "'text.text' must be a string",
    ],
    [
      "reasoning.text 为布尔",
      { type: "reasoning", text: true },
      "'reasoning.text' must be a string",
    ],
    [
      "image.attachment 为字符串",
      { type: "image", attachment: "x" },
      "'image.attachment' must be an object",
    ],
    [
      "image.attachment 为 null",
      { type: "image", attachment: null },
      "'image.attachment' must be an object",
    ],
    ["image.attachment 缺失", { type: "image" }, "'image.attachment' must be an object"],
    [
      "image.attachment 为数组",
      { type: "image", attachment: [] },
      "'image.attachment' must be an object",
    ],
    [
      "image.attachment.attachmentId 非字符串",
      contractImageBlock(contractImageAttachment({ attachmentId: 1 })),
      "'image.attachment.attachmentId' must be a string",
    ],
    [
      "image.attachment.mediaType 非字符串",
      contractImageBlock(contractImageAttachment({ mediaType: null })),
      "'image.attachment.mediaType' must be a string",
    ],
    [
      "image.attachment.mediaType 空串（词表外）",
      contractImageBlock(contractImageAttachment({ mediaType: "" })),
      "'image.attachment.mediaType' must be one of image/png, image/jpeg, image/webp, image/gif; got ''",
    ],
    [
      "image.attachment.mediaType 非图片类型（text/plain）",
      contractImageBlock(contractImageAttachment({ mediaType: "text/plain" })),
      "'image.attachment.mediaType' must be one of image/png, image/jpeg, image/webp, image/gif; got 'text/plain'",
    ],
    [
      "image.attachment.mediaType 宿主不支持的图片类型（image/svg+xml）",
      contractImageBlock(contractImageAttachment({ mediaType: "image/svg+xml" })),
      "'image.attachment.mediaType' must be one of image/png, image/jpeg, image/webp, image/gif; got 'image/svg+xml'",
    ],
    [
      "image.attachment.mediaType 大小写变体（IMAGE/PNG 不是词表值）",
      contractImageBlock(contractImageAttachment({ mediaType: "IMAGE/PNG" })),
      "'image.attachment.mediaType' must be one of image/png, image/jpeg, image/webp, image/gif; got 'IMAGE/PNG'",
    ],
    [
      "image.attachment.mediaType 近似值（image/jpg 不是 image/jpeg）",
      contractImageBlock(contractImageAttachment({ mediaType: "image/jpg" })),
      "'image.attachment.mediaType' must be one of image/png, image/jpeg, image/webp, image/gif; got 'image/jpg'",
    ],
    [
      "image.attachment.mediaType 带参数后缀（image/png; charset=binary）",
      contractImageBlock(contractImageAttachment({ mediaType: "image/png; charset=binary" })),
      "'image.attachment.mediaType' must be one of image/png, image/jpeg, image/webp, image/gif; got 'image/png; charset=binary'",
    ],
    [
      "image.attachment.bytes 为负",
      contractImageBlock(contractImageAttachment({ bytes: -1 })),
      "'image.attachment.bytes' must be a non-negative integer",
    ],
    [
      "image.attachment.bytes 非整数",
      contractImageBlock(contractImageAttachment({ bytes: 1.5 })),
      "'image.attachment.bytes' must be a non-negative integer",
    ],
    [
      "image.attachment.bytes 为 NaN",
      contractImageBlock(contractImageAttachment({ bytes: Number.NaN })),
      "'image.attachment.bytes' must be a non-negative integer",
    ],
    [
      "image.attachment.bytes 为 Infinity",
      contractImageBlock(contractImageAttachment({ bytes: Number.POSITIVE_INFINITY })),
      "'image.attachment.bytes' must be a non-negative integer",
    ],
    [
      "image.attachment.bytes 超安全整数",
      contractImageBlock(contractImageAttachment({ bytes: Number.MAX_SAFE_INTEGER + 1 })),
      "'image.attachment.bytes' must be a non-negative integer",
    ],
    [
      "image.attachment.bytes 为数字字符串",
      contractImageBlock(contractImageAttachment({ bytes: "1024" })),
      "'image.attachment.bytes' must be a non-negative integer",
    ],
    [
      "image.attachment.width 缺失",
      contractImageBlock(contractImageAttachment({ width: undefined })),
      "'image.attachment.width' must be a non-negative integer",
    ],
    [
      "image.attachment.height 为负",
      contractImageBlock(contractImageAttachment({ height: -5 })),
      "'image.attachment.height' must be a non-negative integer",
    ],
    [
      "image.attachment.name 非字符串",
      contractImageBlock(contractImageAttachment({ name: 7 })),
      "'image.attachment.name' must be a string",
    ],
    [
      "image.attachment.originalDimensions 非对象",
      contractImageBlock(contractImageAttachment({ originalDimensions: 10 })),
      "'image.attachment.originalDimensions' must be an object",
    ],
    [
      "image.attachment.originalDimensions.width 非法",
      contractImageBlock(contractImageAttachment({ originalDimensions: { width: -1, height: 2 } })),
      "'image.attachment.originalDimensions.width' must be a non-negative integer",
    ],
    [
      "image.attachment.originalDimensions.height 缺失",
      contractImageBlock(contractImageAttachment({ originalDimensions: { width: 1 } })),
      "'image.attachment.originalDimensions.height' must be a non-negative integer",
    ],
    [
      "file.attachment 非对象",
      { type: "file", attachment: "x" },
      "'file.attachment' must be an object",
    ],
    [
      "file.attachment.attachmentId 缺失",
      { type: "file", attachment: { name: "a", bytes: 1 } },
      "'file.attachment.attachmentId' must be a string",
    ],
    [
      "file.attachment.name 缺失",
      { type: "file", attachment: { attachmentId: "a", bytes: 1 } },
      "'file.attachment.name' must be a string",
    ],
    [
      "file.attachment.bytes 为负",
      { type: "file", attachment: { attachmentId: "a", name: "b", bytes: -1 } },
      "'file.attachment.bytes' must be a non-negative integer",
    ],
    [
      "tool-call.id 非字符串",
      { type: "tool-call", name: "n", arguments: "{}" },
      "'tool-call.id' must be a string",
    ],
    [
      "tool-call.name 缺失",
      { type: "tool-call", id: "c", arguments: "{}" },
      "'tool-call.name' must be a string",
    ],
    [
      "tool-call.arguments 非字符串（对象）",
      { type: "tool-call", id: "c", name: "n", arguments: { x: 1 } },
      "'tool-call.arguments' must be a string",
    ],
    [
      "tool-result.toolCallId 非字符串",
      { type: "tool-result", content: [] },
      "'tool-result.toolCallId' must be a string",
    ],
    [
      "tool-result.content 非数组",
      { type: "tool-result", toolCallId: "c", content: "x" },
      "'tool-result.content' must be an array",
    ],
    [
      "tool-result.content 元素非法（递归拒绝）",
      { type: "tool-result", toolCallId: "c", content: [{ type: "text", text: 1 }] },
      "'text.text' must be a string",
    ],
    [
      "tool-result.content 嵌套未知类型（递归拒绝）",
      { type: "tool-result", toolCallId: "c", content: [{ type: "bogus" }] },
      "unsupported content block type 'bogus'",
    ],
    [
      "tool-result.isError 为字符串",
      { type: "tool-result", toolCallId: "c", content: [], isError: "true" },
      "'tool-result.isError' must be a boolean",
    ],
    [
      "tool-result.isError 为数字",
      { type: "tool-result", toolCallId: "c", content: [], isError: 1 },
      "'tool-result.isError' must be a boolean",
    ],
    [
      "tool-result.isError 为 null",
      { type: "tool-result", toolCallId: "c", content: [], isError: null },
      "'tool-result.isError' must be a boolean",
    ],
  ])("拒绝：%s", (_label, block, message) => {
    expectBlockRejected(block, message);
  });

  it("〔边界〕非数组入参与非对象元素 → 原生 TypeError（fail-closed，但诊断不是契约文案）", () => {
    expect(() => toHostBlocks(null as unknown as readonly SoloipsContentBlock[])).toThrow(
      TypeError,
    );
    expect(() => toHostBlocks(undefined as unknown as readonly SoloipsContentBlock[])).toThrow(
      TypeError,
    );
    expect(() => toHostBlocks([null as unknown as SoloipsContentBlock])).toThrow(TypeError);
    expect(() => toHostBlocks([42 as unknown as SoloipsContentBlock])).toThrow(TypeError);
  });

  it("〔边界〕type 为非字符串时进入 default 分支：数字/对象被字符串化进诊断，Symbol 直接抛 TypeError", () => {
    expectBlockRejected({ type: 42 }, "unsupported content block type '42'");
    expectBlockRejected({ type: { a: 1 } }, "unsupported content block type '[object Object]'");
    // 〔观察〕Symbol 模板插值抛原生 TypeError（「Cannot convert a Symbol value to a string」），
    // 诊断文本不是契约文案；拒绝方向仍 fail-closed，只是诊断面更差。
    expect(() => toHostBlocks([{ type: Symbol("s") } as unknown as SoloipsContentBlock])).toThrow(
      TypeError,
    );
  });

  it("〔边界〕原型链注入：继承字段被**接受**（校验读的是属性，不区分自有/继承）", () => {
    // 影响判断：被接受的每个字段仍逐一过类型校验，且输出是只含自有属性的新对象，
    // 故不构成类型混淆或原型污染（输出不写回调用方对象）。仅「输入来源面比声称的宽」。
    const inherited = prototypeInjected({ type: "text", text: "inherited" });
    expect(toHostBlocks([inherited])).toEqual([{ type: "text", text: "inherited" }]);

    // 值仍受校验：继承 type 但 text 非法 → 拒绝
    expectBlockRejected(
      prototypeInjected({ type: "text", text: 1 }),
      "'text.text' must be a string",
    );
  });

  it("〔边界〕非枚举自有属性被接受（读取不看 enumerable）", () => {
    const block: SoloipsContentBlock = { type: "text" };
    Object.defineProperty(block, "text", { value: "hidden", enumerable: false });

    expect(toHostBlocks([block])).toEqual([{ type: "text", text: "hidden" }]);
  });

  it("〔边界〕getter 抛错原样穿透（不被包装成 TypeError）", () => {
    const block: SoloipsContentBlock = { type: "text" };
    Object.defineProperty(block, "text", {
      get() {
        throw new RangeError("getter boom");
      },
      enumerable: true,
    });

    expect(() => toHostBlocks([block])).toThrow(RangeError);
  });

  it("〔D-1 已修〕mediaType 词表外取值 → TypeError，诊断含字段路径与**实得值**", () => {
    // 修复前：只做 requireString，`mediaType as HostImageAttachment["mediaType"]` 是
    // 无校验断言，非法值穿透到宿主消息内容（故障推迟到 provider 侧）。现为边界拒绝。
    for (const mediaType of ["text/plain", "image/svg+xml", "", "IMAGE/PNG", "image/jpg"]) {
      let thrown: unknown;
      try {
        toHostBlocks([contractImageBlock(contractImageAttachment({ mediaType }))]);
      } catch (error: unknown) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(TypeError);
      expect(thrown).not.toBeInstanceOf(SoloipsAdapterError); // 调用方数据缺陷，不是宿主失败
      // 整条文案断言（不用 toContain：空串实得值会让子串断言恒真，失去鉴别力）
      expect((thrown as TypeError).message).toBe(
        `soloips-adapter: content block field 'image.attachment.mediaType' must be one of image/png, image/jpeg, image/webp, image/gif; got '${mediaType}'`,
      );
    }
  });
});

// ── 双向转换的往返性质（两个方向各自的校验强度差异） ───────────────────────────

describe("toSoloipsBlocks / toHostBlocks 往返（两个方向的校验强度不同）", () => {
  it("宿主 → 契约 → 宿主：全部 6 种标签往返后逐字段相等", () => {
    // 往返前提是宿主块已满足契约的严格形状；本夹具按契约要求构造（例如 isError 只写 true）。
    const strict: readonly HostContentBlock[] = [
      { type: "text", text: "hello" },
      { type: "reasoning", text: "thinking" },
      { type: "image", attachment: hostImageAttachment },
      { type: "file", attachment: hostFileAttachment },
      { type: "tool-call", id: hostToolCallId("call-1"), name: "probe", arguments: "{}" },
      {
        type: "tool-result",
        toolCallId: hostToolCallId("call-1"),
        content: [{ type: "text", text: "ok" }],
        isError: true,
      },
    ];

    expect(toHostBlocks(toSoloipsBlocks(strict))).toEqual(strict);
  });

  it("〔D-2 已修〕往返恒等：isError 的三种宿主合法形状（true / false / 缺省）各自往返后形状不变", () => {
    // 宿主 `ToolResultBlock.isError?: boolean` 的完整域是 {true, false, undefined}；
    // 修复前 `false` 被拒，「宿主 → 契约 → 宿主」对该形状不成立（往返性质破坏）。
    // 三种形状**互不折叠**：显式 false 必须回到显式 false，缺省必须回到缺省。
    const withTrue: HostContentBlock = {
      type: "tool-result",
      toolCallId: hostToolCallId("call-1"),
      content: [],
      isError: true,
    };
    const withFalse: HostContentBlock = {
      type: "tool-result",
      toolCallId: hostToolCallId("call-1"),
      content: [],
      isError: false,
    };
    const withoutIsError: HostContentBlock = {
      type: "tool-result",
      toolCallId: hostToolCallId("call-1"),
      content: [],
    };

    for (const hostBlock of [withTrue, withFalse, withoutIsError]) {
      const roundTripped = toHostBlocks(toSoloipsBlocks([hostBlock]));

      expect(only(roundTripped)).toEqual(hostBlock);
      expect("isError" in only(roundTripped)).toBe("isError" in hostBlock);
    }
  });

  it("〔观察〕往返对嵌套引用不保身份但保值（每层浅拷贝）", () => {
    const strict: readonly HostContentBlock[] = [
      { type: "image", attachment: hostImageAttachment },
    ];
    const once = toSoloipsBlocks(strict);
    const twice = toHostBlocks(once);

    expect(twice).toEqual(strict);
    expect(only(twice)).not.toBe(only(strict));
    // 附件在往返中重建（不是同一对象），但值相等
    expect(imageAttachmentOf(twice)).not.toBe(hostImageAttachment);
    expect(imageAttachmentOf(twice)).toEqual(hostImageAttachment);
  });
});

// ── toSoloipsSubagentResult ──────────────────────────────────────────────────

describe("toSoloipsSubagentResult（shared.ts:316-323；宿主结果 → 契约结果）", () => {
  it.each<[SubagentResult["stopReason"]]>([
    ["completed"],
    ["aborted"],
    ["error"],
    ["max-tokens"],
    ["refusal"],
  ])("stopReason '%s' 原样透传（词表与宿主一致，不做翻译）", (stopReason) => {
    expect(toSoloipsSubagentResult({ stopReason, output: [] }).stopReason).toBe(stopReason);
  });

  it("output 逐块浅拷贝（内容一致、块是新对象、空数组保持空数组）", () => {
    const hostResult: SubagentResult = {
      stopReason: "completed",
      output: [
        { type: "text", text: "done" },
        { type: "image", attachment: hostImageAttachment },
      ],
    };

    const result = toSoloipsSubagentResult(hostResult);

    expect(result.output).toEqual(hostResult.output);
    expect(result.output).not.toBe(hostResult.output);
    expect(result.output[0]).not.toBe(hostResult.output[0]);
    expect(toSoloipsSubagentResult({ stopReason: "completed", output: [] }).output).toEqual([]);
  });

  it("structured / diagnostic 存在时转出，缺省时键不存在（可选性逐键核对）", () => {
    const withExtras = toSoloipsSubagentResult({
      stopReason: "completed",
      output: [],
      structured: { ok: true },
      diagnostic: "provider note",
    });
    const withoutExtras = toSoloipsSubagentResult({ stopReason: "aborted", output: [] });

    expect(withExtras).toEqual({
      stopReason: "completed",
      output: [],
      structured: { ok: true },
      diagnostic: "provider note",
    });
    expect("structured" in withoutExtras).toBe(false);
    expect("diagnostic" in withoutExtras).toBe(false);
    expect(Object.keys(withoutExtras).sort()).toEqual(["output", "stopReason"]);
  });

  it("显式 undefined 的 structured / diagnostic 不产出键（条件展开而非赋 undefined）", () => {
    // 显式 undefined 是 JS 调用方（无类型检查）能造出的真实形状，也正是条件展开
    // `...(x === undefined ? {} : { x })` 存在的理由。exactOptionalPropertyTypes 下
    // `diagnostic: undefined` 不满足 `diagnostic?: string`，故此处**刻意**断言一次——
    // 断言的是「运行时形状」，不是「类型合法」。
    const runtimeInput = {
      stopReason: "completed",
      output: [],
      structured: undefined,
      diagnostic: undefined,
    } satisfies Record<string, unknown>;

    const result = toSoloipsSubagentResult(runtimeInput as unknown as SubagentResult);

    expect("structured" in result).toBe(false);
    expect("diagnostic" in result).toBe(false);
  });

  it("〔边界〕structured: null 视为存在（`!== undefined` 判定）", () => {
    const result = toSoloipsSubagentResult({
      stopReason: "completed",
      output: [],
      structured: null,
    });
    expect("structured" in result).toBe(true);
    expect(result.structured).toBeNull();
  });

  it("〔边界〕structured 与 diagnostic 是引用共享（不做深拷贝）", () => {
    const structured = { deep: { value: 1 } };
    const result = toSoloipsSubagentResult({
      stopReason: "completed",
      output: [],
      structured,
    });

    expect(result.structured).toBe(structured);
  });

  it("〔边界〕stopReason 不做运行时词表校验：表外值原样透传（宿主类型是封闭联合，运行期无兜底）", () => {
    const result = toSoloipsSubagentResult({
      stopReason: "bogus" as SubagentResult["stopReason"],
      output: [],
    });

    expect(result.stopReason).toBe("bogus");
  });

  it("〔边界〕output 非数组 → 原生 TypeError（宿主契约被破坏时的裸失败）", () => {
    expect(() =>
      toSoloipsSubagentResult({ stopReason: "completed" } as unknown as SubagentResult),
    ).toThrow(TypeError);
  });
});

// ── toSoloipsSessionEvent ────────────────────────────────────────────────────

describe("toSoloipsSessionEvent（shared.ts:328-330；宿主事件 → 契约事件）", () => {
  const hostEvent: HostSessionEvent = {
    type: "turn/start",
    seq: 0 as HostSessionEvent["seq"],
    time: 1_700_000_000_000,
    data: { turn: 1 },
  };

  it("字段同名直接投影（type/seq/time/data 值一致）", () => {
    expect(toSoloipsSessionEvent(hostEvent)).toEqual({
      type: "turn/start",
      seq: 0,
      time: 1_700_000_000_000,
      data: { turn: 1 },
    });
  });

  it("宿主专有字段被丢弃（ignorable 不进入契约事件）", () => {
    const withIgnorable: HostSessionEvent = { ...hostEvent, ignorable: true };
    const projected = toSoloipsSessionEvent(withIgnorable);

    expect(Object.keys(projected).sort()).toEqual(["data", "seq", "time", "type"]);
    expect("ignorable" in projected).toBe(false);
  });

  it("返回新对象（不返回宿主事件本身）", () => {
    expect(toSoloipsSessionEvent(hostEvent)).not.toBe(hostEvent);
  });

  it("〔边界〕data 引用共享（浅投影，不做深拷贝）", () => {
    const projected = toSoloipsSessionEvent(hostEvent);
    expect(projected.data).toBe(hostEvent.data);
  });

  it("〔边界〕不做运行时校验：空 type / 负数 seq / NaN time 原样穿透", () => {
    const malformed = {
      type: "",
      seq: -1 as HostSessionEvent["seq"],
      time: Number.NaN,
      data: undefined,
    } as unknown as HostSessionEvent;
    const projected = toSoloipsSessionEvent(malformed);

    expect(projected.type).toBe("");
    expect(projected.seq).toBe(-1);
    expect(Number.isNaN(projected.time)).toBe(true);
    expect(projected.data).toBeUndefined();
  });
});

// ── mapHostError ─────────────────────────────────────────────────────────────

describe("mapHostError（shared.ts:343-352；错误分层与映射）", () => {
  it("SoloipsAdapterError 原样透传（同一实例，不重复包装）", () => {
    const original = new SoloipsAdapterError("SOLOIPS_ADAPTER_LEASE_NOT_HELD", "lease lost");
    expect(mapHostError("scope", original)).toBe(original);
  });

  it("TypeError 原样透传（调用方数据缺陷不伪装成宿主失败）", () => {
    const original = new TypeError("bad caller data");
    expect(mapHostError("scope", original)).toBe(original);
  });

  it("其他 Error → SoloipsAdapterError：默认码 + 'scope: message' + cause 保留", () => {
    const original = new Error("host exploded");
    const mapped = mapHostError("storage.open('x')", original);

    expect(mapped).toBeInstanceOf(SoloipsAdapterError);
    expect((mapped as SoloipsAdapterError).code).toBe("SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE");
    expect((mapped as SoloipsAdapterError).message).toBe("storage.open('x'): host exploded");
    expect((mapped as SoloipsAdapterError).cause).toBe(original);
    expect((mapped as SoloipsAdapterError).name).toBe("SoloipsAdapterError");
  });

  it("自定义 code 覆盖默认值（契约 §0 的 6 个值可被显式选择）", () => {
    const mapped = mapHostError("scope", new Error("x"), "SOLOIPS_ADAPTER_LEASE_NOT_HELD");

    expect((mapped as SoloipsAdapterError).code).toBe("SOLOIPS_ADAPTER_LEASE_NOT_HELD");
  });

  it("非 Error 抛出物 → 'non-error host failure' 占位，cause 保留原值", () => {
    for (const thrown of ["boom", 42, null, undefined, { message: "not an Error" }]) {
      const mapped = mapHostError("scope", thrown);

      expect(mapped).toBeInstanceOf(SoloipsAdapterError);
      expect((mapped as SoloipsAdapterError).message).toBe("scope: non-error host failure");
      expect((mapped as SoloipsAdapterError).cause).toBe(thrown);
    }
  });

  it("〔观察〕TypeError 子类同样被当作调用方缺陷透传（宿主内部抛 TypeError 会被误归因）", () => {
    // 分层判据是 `instanceof TypeError`，无法区分「adapter 自己造的调用方缺陷」与
    // 「宿主内部抛的 TypeError」。影响：宿主侧 TypeError（如 Node API 参数错）会被
    // 上报为调用方数据缺陷，诊断方向相反。当前端口全部把调用方校验放在自己这一侧，
    // 故未观察到实际误归因；记为待决项（〔推断〕，未核到宿主实际抛错路径）。
    class HostSideTypeError extends TypeError {}
    const hostError = new HostSideTypeError("host arg invalid");

    expect(mapHostError("scope", hostError)).toBe(hostError);
  });

  it("〔边界〕`instanceof` 只看原型链：原型链挂上 Error.prototype 的对象被当作 Error 读 message", () => {
    // 反例方向确认：`Object.create(Error.prototype)` **通过** `instanceof Error`（原型链判定），
    // 于是 describe() 走 `error.message` 分支——与「非 Error 走占位文本」互补。
    // 影响：仅影响诊断文本；cause 始终保留原值，契约码不受影响。
    const pseudo = Object.create(Error.prototype) as Error;
    pseudo.message = "looks like an error";

    const mapped = mapHostError("scope", pseudo);
    expect((mapped as SoloipsAdapterError).message).toBe("scope: looks like an error");
    expect((mapped as SoloipsAdapterError).cause).toBe(pseudo);

    // 而真正的非 Error（原型链上无 Error.prototype）走占位文本
    const plain = Object.create(null) as Record<string, unknown>;
    plain["message"] = "not an Error";
    expect((mapHostError("scope", plain) as SoloipsAdapterError).message).toBe(
      "scope: non-error host failure",
    );
  });

  it("〔边界〕message 不是字符串时被透传（describe 不校验类型）", () => {
    const weird = new Error("x");
    Object.defineProperty(weird, "message", { value: 42, enumerable: true });
    const mapped = mapHostError("scope", weird);

    expect((mapped as SoloipsAdapterError).message).toBe("scope: 42");
  });

  it("〔边界〕Error 的 message 为空 → 'scope: '（前缀保留，无兜底文本）", () => {
    const mapped = mapHostError("scope", new Error(""));
    expect((mapped as SoloipsAdapterError).message).toBe("scope: ");
  });

  it("〔观察〕code 参数不做运行时词表校验（类型层限制，运行期照抄）", () => {
    const mapped = mapHostError(
      "scope",
      new Error("x"),
      "NOT_A_CONTRACT_CODE" as SoloipsAdapterErrorCode,
    );
    expect((mapped as SoloipsAdapterError).code).toBe("NOT_A_CONTRACT_CODE");
  });
});

// ── withHostErrors ───────────────────────────────────────────────────────────

describe("withHostErrors（shared.ts:354-361；await 包装）", () => {
  it("成功：原样返回 operation 的值（身份不变），且总是 Promise", async () => {
    const value = { ok: true };
    const pending = withHostErrors("scope", () => Promise.resolve(value));

    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).resolves.toBe(value);
  });

  it("异步拒绝 → SoloipsAdapterError（默认码）+ cause 保留 + scope 前缀", async () => {
    const failure = new Error("host call failed");
    const promise = withHostErrors("subagents.start('spawn')", () => Promise.reject(failure));

    await expect(promise).rejects.toBeInstanceOf(SoloipsAdapterError);
    await expect(promise).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
      message: "subagents.start('spawn'): host call failed",
      cause: failure,
    });
  });

  it("同步抛出同样被捕获（operation 在 try 内调用，不是先建 promise）", async () => {
    const failure = new Error("sync boom");
    const promise = withHostErrors("scope", () => {
      throw failure;
    });

    await expect(promise).rejects.toBeInstanceOf(SoloipsAdapterError);
    await expect(promise).rejects.toMatchObject({ cause: failure });
  });

  it("SoloipsAdapterError / TypeError 拒绝时原样透传（不二次包装，scope 不覆盖）", async () => {
    const adapterError = new SoloipsAdapterError("SOLOIPS_ADAPTER_DISABLED", "adapter disabled");
    const typeError = new TypeError("caller data");

    await expect(withHostErrors("scope", () => Promise.reject(adapterError))).rejects.toBe(
      adapterError,
    );
    await expect(withHostErrors("scope", () => Promise.reject(typeError))).rejects.toBe(typeError);
  });

  it("非 Error 拒绝 → 占位文本 + cause 保留原值", async () => {
    await expect(withHostErrors("scope", () => Promise.reject("boom"))).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
      message: "scope: non-error host failure",
      cause: "boom",
    });
  });

  it("〔边界〕operation 不是函数 → 拒绝形态是 TypeError（由 mapHostError 透传，message 随引擎）", async () => {
    const promise = withHostErrors("scope", undefined as unknown as () => Promise<void>);

    await expect(promise).rejects.toBeInstanceOf(TypeError);
  });

  it("〔边界〕operation 返回非 Promise 值 → 仍按成功解析（await 接受裸值）", async () => {
    await expect(withHostErrors("scope", () => 1 as unknown as Promise<number>)).resolves.toBe(1);
  });
});
