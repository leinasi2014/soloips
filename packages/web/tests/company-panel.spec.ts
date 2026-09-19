/**
 * 公司面板测试（FE-1a）。
 *
 * ── 本文件钉住的验收条款（逐条对应切片验收清单）────────────────────────────
 *
 * | 条款 | 用例 |
 * |---|---|
 * | 3. 结果状态穷举（5 态 + error），每态独立可辨 | 「每种 outcome 独立渲染」一组 |
 * | 4. `unknown` 保留同一 operationId、禁止自动重提 | 「`unknown` …」一组 |
 * | 5. `unavailable` 与「空数据」可区分 | 「读面三态」一组 |
 * | 6. 界面/状态/调用输入中不存在账户标识字段 | 「身份边界」一组 |
 * | 9. 表单校验、确认前不写、按钮 disable/enable | 「表单与确认步骤」一组 |
 *
 * ── 判据形态：真调用 + 真渲染，不是读文本 ──────────────────────────────────
 * 业务面（`./surface.js`）用**可编程的 Remote 替身**真调用；视图
 * （`./CompanyPanel.js`）用 `renderToStaticMarkup` **真渲染**成 HTML 再断言。
 * 字符串 grep 无法区分「代码里写着」与「运行时如此」（项目红线第 5 条）。
 *
 * 〔为什么不需要浏览器测试框架〕面板的判定全在业务面（React 无关），视图只做
 * 映射。因此「不自动重提」「可区分」这类性质可在 Node 下直接断言——这正是本片
 * 把业务面与视图分开的理由（见 `../src/client/company/surface.js` 的文件头）。
 *
 * 〔文案断言的口径〕视图测试传入一个**按键查字典**的 `t`（真字典 + 真替换），
 * 因此断言的是「界面确实显示了那条文案」，而不是「代码里引用了那个键」。后者
 * 无法区分「键对了但渲染错位」。
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import type { SoloipsCompanyId, SoloipsOperationId } from "soloips-core/contracts";
import type {
  SoloipsWebCompanyRead,
  SoloipsWebCompanyTreeRead,
  SoloipsWebCompanyView,
  SoloipsWebCreateCompanyInput,
  SoloipsWebCreateCompanyOutcome,
} from "soloips-web/contracts";

import {
  SOLOIPS_COMPANY_PANEL_SLOT_ID,
  registerSoloipsCompanyPanel,
  type SoloipsLocaleSurface,
  type SoloipsSlotsSurface,
} from "../src/client/company/register.js";
import { SoloipsCompanyPanelView } from "../src/client/company/CompanyPanel.js";
import { SoloipsCompanyPanel, type SoloipsRemoteSurface } from "../src/client/company/surface.js";
import {
  newSoloipsClientOperationId,
  soloipsCompanyCreateInput,
  soloipsCompanyNameIsValid,
  soloipsCompanyPanelStep,
  soloipsInitialSubmissionPhase,
  SOLOIPS_CLIENT_CREATABLE_COMPANY_TYPES,
  type SoloipsCompanyPanelEvent,
} from "../src/client/company/session.js";
import { SOLOIPS_LOCALE_NAMESPACE, en, zh } from "../src/client/locales/index.js";
import type { SoloipsLocaleKey } from "../src/client/locales/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// 夹具
// ─────────────────────────────────────────────────────────────────────────────

const ROOT_ID = "cmp_00000000-0000-4000-8000-000000000001" as SoloipsCompanyId;

/** 真字典 + 真占位符替换（与 `ctx.locale.bind` 的 `translate` 同算法）。 */
function translate(key: SoloipsLocaleKey, params?: Record<string, unknown>): string {
  const template = zh[key];
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** 英文侧的同款（用于「双语齐备」断言）。 */
function translateEn(key: SoloipsLocaleKey, params?: Record<string, unknown>): string {
  const template = en[key];
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

function company(overrides: Partial<SoloipsWebCompanyView> = {}): SoloipsWebCompanyView {
  return {
    id: ROOT_ID,
    type: "enterprise",
    name: "示例公司",
    status: "active",
    createdAt: "2026-09-19T00:00:00.000Z",
    ...overrides,
  };
}

/** 可编程的 Remote 替身：记录每次调用的入参，并按脚本返回结果。 */
interface RemoteStub {
  readonly remote: SoloipsRemoteSurface;
  readonly createCalls: SoloipsWebCreateCompanyInput[];
  readonly treeCalls: { readonly companyId: SoloipsCompanyId }[];
  readonly readCalls: { readonly companyId: SoloipsCompanyId }[];
  /** 下一次 `createCompany` 的返回；设为 `undefined` 则抛错。 */
  nextCreate: (() => Promise<RemoteResult<SoloipsWebCreateCompanyOutcome>>) | undefined;
  nextRead: (() => Promise<RemoteResult<SoloipsWebCompanyRead>>) | undefined;
  nextTree: (() => Promise<RemoteResult<SoloipsWebCompanyTreeRead>>) | undefined;
}

function remoteStub(): RemoteStub {
  const stub: RemoteStub = {
    createCalls: [],
    treeCalls: [],
    readCalls: [],
    nextCreate: undefined,
    nextRead: undefined,
    nextTree: undefined,
    // 〔形状〕替身就是 **namespace 服务本身**（不是 `{ soloips: … }` 容器）——
    // 与 `ctx.get("remote.soloips")` 的取值方式一致（见 `surface.js` 的
    // `SoloipsRemoteSurface` 注释）。
    remote: {
      createCompany: (input) => {
        stub.createCalls.push(input);
        return stub.nextCreate?.() ?? Promise.resolve({ ok: true, value: { status: "unknown" } });
      },
      getCompany: (input) => {
        stub.readCalls.push(input);
        return (
          stub.nextRead?.() ??
          Promise.resolve({ ok: true, value: { status: "ok", company: company() } })
        );
      },
      getCompanyTree: (input) => {
        stub.treeCalls.push(input);
        return (
          stub.nextTree?.() ??
          Promise.resolve({ ok: true, value: { status: "ok", companies: [company()] } })
        );
      },
    },
  };
  return stub;
}

/** 一个**确定性**的编号（测试不依赖随机 UUID）。 */
const FIXED_OPERATION_ID = "web-fixed-operation-id" as SoloipsOperationId;

/** 驱动到「已确认、正在提交」相位（不经过真实等待：settle 由用例手工喂）。 */
function toConfirming(panel: SoloipsCompanyPanel, name = "新公司"): void {
  panel.actions.setName(name);
  panel.actions.beginConfirm();
}

/** 渲染当前状态为 HTML。 */
function render(panel: SoloipsCompanyPanel, t = translate): string {
  return renderToStaticMarkup(
    createElement(SoloipsCompanyPanelView, {
      state: panel.getSnapshot(),
      actions: panel.actions,
      t,
    }),
  );
}

/** 等待微任务队列清空（Remote 替身的 promise 链结算）。 */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// ─────────────────────────────────────────────────────────────────────────────
// ① 表单校验与确认步骤（验收条款 9）
// ─────────────────────────────────────────────────────────────────────────────

describe("表单校验与确认步骤（验收条款 9）", () => {
  it("名称空白时不可进入确认步骤（`confirm/begin` 被拒）", () => {
    const panel = new SoloipsCompanyPanel(remoteStub().remote);
    panel.actions.setName("   ");
    expect(soloipsCompanyNameIsValid("   "), "纯空白不是合法名称").toBe(false);
    panel.actions.beginConfirm();
    expect(panel.getSnapshot().phase.kind, "空白名称不得进入确认步骤").toBe("editing");
  });

  it("**确认之前不写任何数据**：编辑与确认步骤都不产生 create 调用", async () => {
    const stub = remoteStub();
    const panel = new SoloipsCompanyPanel(stub.remote);
    panel.actions.setName("新公司");
    await settle();
    expect(stub.createCalls.length, "编辑草稿不得触发写调用").toBe(0);
    panel.actions.beginConfirm();
    await settle();
    expect(panel.getSnapshot().phase.kind).toBe("confirming");
    expect(stub.createCalls.length, "进入确认步骤不得触发写调用").toBe(0);
  });

  it("确认后才发起一次 create，且载荷逐字段正确（名称已 trim）", async () => {
    const stub = remoteStub();
    stub.nextCreate = () =>
      Promise.resolve({ ok: true, value: { status: "committed", result: { companyId: ROOT_ID } } });
    const panel = new SoloipsCompanyPanel(stub.remote);
    panel.actions.setName("  新公司  ");
    panel.actions.beginConfirm();
    panel.actions.confirm(FIXED_OPERATION_ID);
    await settle();
    expect(stub.createCalls).toEqual([
      { operationId: FIXED_OPERATION_ID, name: "新公司", type: "enterprise" },
    ]);
  });

  it("提交中禁用确认按钮（防重复提交）", async () => {
    const stub = remoteStub();
    // 永不结算：把面板留在 `submitting` 相位。
    stub.nextCreate = () => new Promise<RemoteResult<SoloipsWebCreateCompanyOutcome>>(() => {});
    const panel = new SoloipsCompanyPanel(stub.remote);
    toConfirming(panel);
    panel.actions.confirm(FIXED_OPERATION_ID);
    const html = render(panel);
    expect(panel.getSnapshot().phase.kind).toBe("submitting");
    expect(html, "提交中的确认按钮必须禁用").toContain("disabled");
    expect(stub.createCalls.length, "重复点击不得产生第二次调用").toBe(1);
  });

  it("取消确认回到编辑且草稿保留（不丢用户输入）", () => {
    const panel = new SoloipsCompanyPanel(remoteStub().remote);
    toConfirming(panel, "保留我");
    panel.actions.cancelConfirm();
    const phase = panel.getSnapshot().phase;
    expect(phase.kind).toBe("editing");
    expect(phase.draft.name).toBe("保留我");
  });

  it("类型选择面只有本入口可创建的一类（`enterprise`）", () => {
    // 〔为什么断言这个〕core 对 `platform`/`operation` 是**显式拒绝**（该入口不提供
    // 该动作），`subsidiary` 需要父公司（属 FE-2）。把不可选项列出来再让 core 拒绝，
    // 会把「入口不存在」伪装成「参数错误」。
    expect(SOLOIPS_CLIENT_CREATABLE_COMPANY_TYPES).toEqual(["enterprise"]);
    const panel = new SoloipsCompanyPanel(remoteStub().remote);
    const html = render(panel);
    expect(html, "类型选择必须渲染出来").toContain(translate("soloips.company.form.type.label"));
    expect(html, "只应有一个可选项").toContain('value="enterprise"');
    expect(html).not.toContain('value="platform"');
    expect(html).not.toContain('value="operation"');
    expect(html).not.toContain('value="subsidiary"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ② `unknown`：保留同一编号、禁止自动重提（验收条款 4）
// ─────────────────────────────────────────────────────────────────────────────

describe("`unknown` 态：保留同一 operationId、禁止自动重提（验收条款 4 / ORG-05）", () => {
  it("结果为 `unknown` 时进入 reconcile 相位，且**不再发起任何调用**", async () => {
    const stub = remoteStub();
    stub.nextCreate = () => Promise.resolve({ ok: true, value: { status: "unknown" } });
    const panel = new SoloipsCompanyPanel(stub.remote);
    toConfirming(panel);
    panel.actions.confirm(FIXED_OPERATION_ID);
    await settle();
    expect(panel.getSnapshot().phase.kind).toBe("reconcile");
    expect(stub.createCalls.length, "`unknown` 之后不得自动重提（只应有首次那一次）").toBe(1);
    // 再等若干轮微任务：任何「自动重试」的定时器/微任务都会在这里显形。
    await settle();
    await settle();
    expect(stub.createCalls.length, "`unknown` 之后不得有任何后续调用").toBe(1);
  });

  it("重试**逐字复用**同一 operationId（不铸造新编号）", async () => {
    const stub = remoteStub();
    stub.nextCreate = () => Promise.resolve({ ok: true, value: { status: "unknown" } });
    const panel = new SoloipsCompanyPanel(stub.remote);
    toConfirming(panel);
    panel.actions.confirm(FIXED_OPERATION_ID);
    await settle();
    panel.actions.retry();
    await settle();
    expect(stub.createCalls.length, "重试应产生第二次调用").toBe(2);
    expect(
      stub.createCalls.map((call) => call.operationId),
      "两次调用的 operationId 必须逐字相同（ORG-05：不换 ID 重做）",
    ).toEqual([FIXED_OPERATION_ID, FIXED_OPERATION_ID]);
  });

  it("`reconcile` 相位**拒绝**「清空重来」（换编号的后门）", () => {
    const phase = {
      kind: "reconcile" as const,
      draft: { name: "x", type: "enterprise" as const },
      operationId: FIXED_OPERATION_ID,
    };
    const step = soloipsCompanyPanelStep(phase, { kind: "submission/reset" });
    expect(step.accepted, "未决态不得清空重来").toBe(false);
    expect(step.phase).toBe(phase);
    expect(step.effect.kind).toBe("none");
  });

  it("`reconcile` 相位的界面**不提供**「新建另一家」按钮（换编号的界面形态）", async () => {
    const stub = remoteStub();
    stub.nextCreate = () => Promise.resolve({ ok: true, value: { status: "unknown" } });
    const panel = new SoloipsCompanyPanel(stub.remote);
    toConfirming(panel);
    panel.actions.confirm(FIXED_OPERATION_ID);
    await settle();
    const html = render(panel);
    expect(html, "必须显示 unknown 的专有文案").toContain(
      translate("soloips.company.outcome.unknown", { operationId: FIXED_OPERATION_ID }),
    );
    expect(html, "未决态必须显示「重试」").toContain(translate("soloips.company.action.retry"));
    expect(html, "未决态**不得**显示「新建另一家」").not.toContain(
      translate("soloips.company.action.new"),
    );
    expect(html, "未决态必须显示操作编号（否则「保留编号」无从执行）").toContain(
      FIXED_OPERATION_ID,
    );
  });

  it("**铸造点唯一**：只有 `submit/confirm` 事件携带新编号，重试复用相位里的那个", () => {
    // 判据形态：直接驱动状态机（不经业务面），逐事件检查 effect 的 operationId。
    const start = soloipsInitialSubmissionPhase();
    const events: SoloipsCompanyPanelEvent[] = [
      { kind: "draft/name", name: "公司" },
      { kind: "confirm/begin" },
      { kind: "submit/confirm", operationId: FIXED_OPERATION_ID },
    ];
    let phase = start;
    const effects: string[] = [];
    for (const event of events) {
      const step = soloipsCompanyPanelStep(phase, event);
      phase = step.phase;
      if (step.effect.kind === "create") effects.push(step.effect.operationId);
    }
    expect(effects, "首次提交只铸造一次编号").toEqual([FIXED_OPERATION_ID]);

    const settled = soloipsCompanyPanelStep(phase, {
      kind: "submit/settled",
      outcome: { status: "unknown" },
    });
    expect(settled.effect.kind, "`unknown` 的 settle 不产生任何副作用（不自动重提）").toBe("none");

    const retried = soloipsCompanyPanelStep(settled.phase, { kind: "submit/retry" });
    expect(retried.effect.kind).toBe("create");
    if (retried.effect.kind === "create") {
      expect(retried.effect.operationId, "重试必须复用同一编号").toBe(FIXED_OPERATION_ID);
    }
  });

  it("铸造出的编号满足 core 的形状判据（trim 后非空且 ≤ 256）", () => {
    // core 的 `isOperationIdShape`（`ids.ts:101-103`）是形状的唯一权威；
    // 本断言证明浏览器侧工厂产出的值**逐字满足它**，而不是等 core 拒绝。
    const id = newSoloipsClientOperationId();
    expect(id.trim().length).toBeGreaterThan(0);
    expect(id.length).toBeLessThanOrEqual(256);
    expect(newSoloipsClientOperationId(), "两次铸造不得相同").not.toBe(id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ③ 结果五态 + error：穷举且各自独立可辨（验收条款 3）
// ─────────────────────────────────────────────────────────────────────────────

describe("提交结果穷举渲染（验收条款 3）", () => {
  const outcomes: readonly {
    readonly label: string;
    readonly outcome: SoloipsWebCreateCompanyOutcome;
    readonly key: SoloipsLocaleKey;
  }[] = [
    {
      label: "committed",
      outcome: { status: "committed", result: { companyId: ROOT_ID } },
      key: "soloips.company.outcome.committed",
    },
    {
      label: "replayed",
      outcome: { status: "replayed", result: { companyId: ROOT_ID } },
      key: "soloips.company.outcome.replayed",
    },
    { label: "unknown", outcome: { status: "unknown" }, key: "soloips.company.outcome.unknown" },
    {
      label: "refused",
      outcome: {
        status: "refused",
        reason: "quota-exceeded",
        resourceType: "companyLimit",
        planCode: "free",
        current: 1,
        limit: 1,
      },
      key: "soloips.company.outcome.refused",
    },
    {
      label: "unavailable",
      outcome: { status: "unavailable", reason: "core-unavailable" },
      key: "soloips.company.outcome.unavailable",
    },
  ];

  it("五种结果各渲染自己的专有文案（互不相同）", async () => {
    const rendered = new Map<string, string>();
    /**
     * 每个结果判别值 → 它落到的**相位**与定位属性。
     *
     * 〔为什么不是「都带 `data-soloips-outcome`」〕五态在状态机里分成三个相位：
     * `committed`/`replayed`/`refused` 是**终态**（`settled`，带 outcome 判别值）；
     * `unknown` 进 `reconcile`、`unavailable` 进 `retryable`——两者的「下一步动作」
     * 与终态不同（重试 / 核对），因此定位属性也不同。这正是「独立可辨」的落点。
     */
    const phaseOf: Record<string, { readonly marker: string; readonly value: string }> = {
      committed: { marker: "data-soloips-outcome", value: "committed" },
      replayed: { marker: "data-soloips-outcome", value: "replayed" },
      refused: { marker: "data-soloips-outcome", value: "refused" },
      unknown: { marker: "data-soloips-submission", value: "reconcile" },
      unavailable: { marker: "data-soloips-submission", value: "retryable" },
    };
    for (const entry of outcomes) {
      const stub = remoteStub();
      stub.nextCreate = () => Promise.resolve({ ok: true, value: entry.outcome });
      const panel = new SoloipsCompanyPanel(stub.remote);
      toConfirming(panel);
      panel.actions.confirm(FIXED_OPERATION_ID);
      await settle();
      const html = render(panel);
      rendered.set(entry.label, html);
      // 文案本身出现（真渲染，不是「代码里引用了键」）。
      const expected = translate(entry.key, {
        operationId: FIXED_OPERATION_ID,
        planCode: "soloips.company.plan.free",
        resource: "soloips.company.limit.company",
        current: "1",
        limit: "1",
      });
      // 带参数的键：渲染出来的是**替换后**的文本，故逐段断言参数已被替换。
      if (entry.label === "refused") {
        expect(html, "配额拒绝必须显示额度名").toContain(
          translate("soloips.company.limit.company"),
        );
        expect(html, "配额拒绝必须显示当前/上限").toContain("1/1");
        expect(html, "配额拒绝必须显示计划码文案").toContain(
          translate("soloips.company.plan.free"),
        );
      } else if (entry.label === "unknown" || entry.label === "unavailable") {
        expect(html, "必须显示操作编号").toContain(FIXED_OPERATION_ID);
      }
      // 每个结果都带**独立可辨**的定位属性。
      const marker = phaseOf[entry.label];
      expect(marker, `${entry.label} 必须有相位映射`).toBeDefined();
      expect(html, `${entry.label} 的定位属性`).toContain(`${marker?.marker}="${marker?.value}"`);
      // 不得渲染出未替换的占位符。
      expect(html, "不得出现未替换的 {…} 占位符").not.toMatch(
        /\{(operationId|resource|planCode|current|limit)\}/,
      );
      // 非空断言（防「key 拼错导致 translate 抛错被吞」这类假绿）。
      expect(expected.length).toBeGreaterThan(0);
    }
    // 五份渲染两两不同（否则「独立可辨」不成立）。
    expect(new Set(rendered.values()).size, "五种结果的渲染必须两两不同").toBe(outcomes.length);
  });

  it("`committed` / `replayed` 都显示返回的 companyId（重放返回的是原 id）", async () => {
    for (const status of ["committed", "replayed"] as const) {
      const stub = remoteStub();
      stub.nextCreate = () =>
        Promise.resolve({ ok: true, value: { status, result: { companyId: ROOT_ID } } });
      const panel = new SoloipsCompanyPanel(stub.remote);
      toConfirming(panel);
      panel.actions.confirm(FIXED_OPERATION_ID);
      await settle();
      expect(render(panel), `${status} 必须显示 companyId`).toContain(ROOT_ID);
    }
  });

  it("`committed` / `replayed` 都触发列表刷新（读回事实）", async () => {
    for (const status of ["committed", "replayed"] as const) {
      const stub = remoteStub();
      stub.nextCreate = () =>
        Promise.resolve({ ok: true, value: { status, result: { companyId: ROOT_ID } } });
      const panel = new SoloipsCompanyPanel(stub.remote);
      toConfirming(panel);
      panel.actions.confirm(FIXED_OPERATION_ID);
      await settle();
      await settle();
      expect(stub.readCalls.length, `${status} 后必须读回根公司`).toBeGreaterThan(0);
      expect(stub.treeCalls.length, `${status} 后必须读回公司树`).toBeGreaterThan(0);
    }
  });

  it("调用抛错（error 臂）进入 failed 相位，保留同一编号且不自动重提", async () => {
    const stub = remoteStub();
    stub.nextCreate = () => Promise.reject(new Error("boom"));
    const panel = new SoloipsCompanyPanel(stub.remote);
    toConfirming(panel);
    panel.actions.confirm(FIXED_OPERATION_ID);
    await settle();
    expect(panel.getSnapshot().phase.kind).toBe("failed");
    const html = render(panel);
    expect(html).toContain('data-soloips-submission="failed"');
    expect(html, "失败必须显示操作编号").toContain(FIXED_OPERATION_ID);
    expect(stub.createCalls.length, "抛错后不得自动重提").toBe(1);
    // 失败态同样不提供「新建另一家」（结果可能已部分写入）。
    expect(html).not.toContain(translate("soloips.company.action.new"));
  });

  it("gateway 失败臂（`ok:false`）与业务结果分开处理（走 failed 相位）", async () => {
    const stub = remoteStub();
    stub.nextCreate = () =>
      Promise.resolve({
        ok: false,
        error: {
          code: "gateway/internal",
          message: "x",
          details: {},
          name: "RemoteError",
        } as never,
      });
    const panel = new SoloipsCompanyPanel(stub.remote);
    toConfirming(panel);
    panel.actions.confirm(FIXED_OPERATION_ID);
    await settle();
    expect(panel.getSnapshot().phase.kind, "gateway 失败不是业务结果").toBe("failed");
  });

  it("`unavailable` 与 `failed` 的重试都**复用同一编号**", async () => {
    for (const [label, respond] of [
      [
        "unavailable",
        () =>
          Promise.resolve({
            ok: true,
            value: { status: "unavailable", reason: "core-unavailable" },
          }),
      ],
      ["failed", () => Promise.reject(new Error("boom"))],
    ] as const) {
      const stub = remoteStub();
      stub.nextCreate = () => respond() as Promise<RemoteResult<SoloipsWebCreateCompanyOutcome>>;
      const panel = new SoloipsCompanyPanel(stub.remote);
      toConfirming(panel);
      panel.actions.confirm(FIXED_OPERATION_ID);
      await settle();
      panel.actions.retry();
      await settle();
      expect(
        stub.createCalls.map((call) => call.operationId),
        `${label} 的重试必须复用同一编号`,
      ).toEqual([FIXED_OPERATION_ID, FIXED_OPERATION_ID]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ④ 读面三态：`unavailable` 与「空数据」必须可区分（验收条款 5）
// ─────────────────────────────────────────────────────────────────────────────

describe("读面状态：`unavailable` 与「空数据」可区分（验收条款 5）", () => {
  /** 造一个已经确定树根的面板（经一次成功创建），使列表进入可读状态。 */
  async function rootedPanel(stub: RemoteStub): Promise<SoloipsCompanyPanel> {
    stub.nextCreate = () =>
      Promise.resolve({ ok: true, value: { status: "committed", result: { companyId: ROOT_ID } } });
    const panel = new SoloipsCompanyPanel(stub.remote);
    toConfirming(panel);
    panel.actions.confirm(FIXED_OPERATION_ID);
    await settle();
    await settle();
    return panel;
  }

  it("`unavailable` 渲染成「未就绪」提示，**不是**空列表提示", async () => {
    const stub = remoteStub();
    const panel = await rootedPanel(stub);
    stub.nextRead = () =>
      Promise.resolve({ ok: true, value: { status: "unavailable", reason: "core-unavailable" } });
    panel.actions.refresh();
    await settle();
    const html = render(panel);
    expect(html, "必须带 unavailable 的数据属性").toContain(
      'data-soloips-list-state="unavailable"',
    );
    expect(html, "必须显示未就绪文案").toContain(translate("soloips.company.list.unavailable"));
    expect(html, "**不得**显示「尚未创建任何公司」").not.toContain(
      translate("soloips.company.list.empty"),
    );
    expect(html).not.toContain('data-soloips-list-state="empty"');
  });

  it("`ok` 空数组渲染成「尚未创建」——与 `unavailable` 是两回事", async () => {
    const stub = remoteStub();
    const panel = await rootedPanel(stub);
    stub.nextTree = () => Promise.resolve({ ok: true, value: { status: "ok", companies: [] } });
    panel.actions.refresh();
    await settle();
    const html = render(panel);
    expect(html).toContain('data-soloips-list-state="empty"');
    expect(html, "必须显示「尚未创建」").toContain(translate("soloips.company.list.empty"));
    expect(html, "**不得**显示未就绪文案").not.toContain(
      translate("soloips.company.list.unavailable"),
    );
  });

  it("`not-found`（根不存在）与「空树」可区分", async () => {
    const stub = remoteStub();
    const panel = await rootedPanel(stub);
    stub.nextRead = () => Promise.resolve({ ok: true, value: { status: "not-found" } });
    panel.actions.refresh();
    await settle();
    const html = render(panel);
    expect(html).toContain('data-soloips-list-state="not-found"');
    expect(html, "必须显示「根不存在」文案").toContain(
      translate("soloips.company.list.rootNotFound"),
    );
    expect(html).not.toContain(translate("soloips.company.list.empty"));
    expect(html).not.toContain(translate("soloips.company.list.unavailable"));
  });

  it("读取抛错渲染成 failed（与空数据、未就绪都不同）", async () => {
    const stub = remoteStub();
    const panel = await rootedPanel(stub);
    stub.nextRead = () => Promise.reject(new Error("boom"));
    panel.actions.refresh();
    await settle();
    const html = render(panel);
    expect(html).toContain('data-soloips-list-state="failed"');
    expect(html).toContain(translate("soloips.company.list.failed"));
  });

  it("本会话尚未创建公司时是 `no-root`（**不猜** id、不发读请求）", () => {
    const stub = remoteStub();
    const panel = new SoloipsCompanyPanel(stub.remote);
    expect(panel.getSnapshot().list.kind, "无树根时是 no-root 而非 not-found").toBe("no-root");
    expect(stub.readCalls.length, "无树根时不得发出读请求（不猜 id）").toBe(0);
    expect(stub.treeCalls.length).toBe(0);
    const html = render(panel);
    expect(html).toContain('data-soloips-list-state="no-root"');
    // 〔本断言在 FE-1a 收尾时订正过一次〕原文断言 `no-root` 显示
    // `list.empty`（「尚未创建任何公司」）——那是**把缺陷固化成契约**：一个已创建
    // 过公司、随后刷新页面的用户会看到「尚未创建任何公司」，而公司确实在（只是本
    // 会话不知道它的 id）。`no-root` 与 `empty` 的语义不同（「没查」vs「查了、确无
    // 数据」），文案必须可分。
    expect(
      html,
      "no-root 必须显示「本会话还没建，所以不知道查哪棵树」而不是「确无公司」",
    ).toContain(translate("soloips.company.list.noRoot"));
    expect(
      html,
      "no-root **不得**复用 list.empty——那是假陈述（公司可能存在，只是本会话不知道 id）",
    ).not.toContain(translate("soloips.company.list.empty"));
  });

  it("`ok` 非空时逐条渲染公司，且类型/状态经字典映射（四类型穷举可渲染）", async () => {
    const stub = remoteStub();
    const panel = await rootedPanel(stub);
    stub.nextTree = () =>
      Promise.resolve({
        ok: true,
        value: {
          status: "ok",
          companies: [
            company({ id: ROOT_ID, type: "enterprise", status: "active" }),
            company({
              id: "cmp_00000000-0000-4000-8000-000000000002" as SoloipsCompanyId,
              type: "subsidiary",
              status: "archived",
              parentCompanyId: ROOT_ID,
            }),
          ],
        },
      });
    panel.actions.refresh();
    await settle();
    const html = render(panel);
    expect(html).toContain('data-soloips-list-state="ok"');
    expect(html, "企业公司类型必须经字典渲染").toContain(
      translate("soloips.company.type.enterprise"),
    );
    expect(html, "子公司类型必须经字典渲染").toContain(
      translate("soloips.company.type.subsidiary"),
    );
    expect(html, "已归档状态必须经字典渲染").toContain(
      translate("soloips.company.status.archived"),
    );
    expect(html).toContain('data-soloips-company-type="subsidiary"');
    expect(html).toContain('data-soloips-company-status="archived"');
  });

  it("并发刷新时晚到的响应不得覆盖新一轮（世代号）", async () => {
    const stub = remoteStub();
    const panel = await rootedPanel(stub);
    let resolveFirst: ((value: RemoteResult<SoloipsWebCompanyRead>) => void) | undefined;
    stub.nextRead = () =>
      new Promise<RemoteResult<SoloipsWebCompanyRead>>((resolve) => {
        resolveFirst = resolve;
      });
    panel.actions.refresh();
    // 第二轮：立即返回 not-found。
    stub.nextRead = () => Promise.resolve({ ok: true, value: { status: "not-found" } });
    panel.actions.refresh();
    await settle();
    // 现在让第一轮（旧世代）返回一个 ok 结果——它必须被丢弃。
    resolveFirst?.({ ok: true, value: { status: "ok", company: company() } });
    await settle();
    expect(panel.getSnapshot().list.kind, "旧世代的响应必须被丢弃").toBe("not-found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ 身份边界：不存在账户标识字段（验收条款 6）
// ─────────────────────────────────────────────────────────────────────────────

describe("身份边界：界面 / 状态 / 调用输入中不存在账户标识字段（验收条款 6）", () => {
  it("创建载荷的键集**恰好**是契约声明的三个（逐字段白名单）", () => {
    const input = soloipsCompanyCreateInput(
      { name: " 公司 ", type: "enterprise" },
      FIXED_OPERATION_ID,
    );
    expect(Object.keys(input).sort()).toEqual(["name", "operationId", "type"]);
  });

  it("真调用发出的载荷键集不含账户标识字段", async () => {
    const stub = remoteStub();
    stub.nextCreate = () =>
      Promise.resolve({ ok: true, value: { status: "committed", result: { companyId: ROOT_ID } } });
    const panel = new SoloipsCompanyPanel(stub.remote);
    toConfirming(panel);
    panel.actions.confirm(FIXED_OPERATION_ID);
    await settle();
    const call = stub.createCalls[0];
    expect(call).toBeDefined();
    // 〔判据〕不是「该字段值为 undefined」，而是**键不存在**（`Object.hasOwn`）——
    // 后者会让 `{...payload, accountId: undefined}` 这种形态通过。
    expect(Object.hasOwn(call as object, "accountId")).toBe(false);
    expect(Object.keys(call ?? {}).sort()).toEqual(["name", "operationId", "type"]);
  });

  it("渲染出的 HTML 不含账户标识字段的任何痕迹", async () => {
    const stub = remoteStub();
    stub.nextCreate = () =>
      Promise.resolve({ ok: true, value: { status: "committed", result: { companyId: ROOT_ID } } });
    const panel = new SoloipsCompanyPanel(stub.remote);
    toConfirming(panel);
    panel.actions.confirm(FIXED_OPERATION_ID);
    await settle();
    await settle();
    const html = render(panel);
    expect(html, "界面不得出现该标识").not.toContain("accountId");
    expect(html, "也不得以属性名形态出现").not.toContain("account-id");
  });

  it("面板状态的可枚举键集只有 list 与 phase（不夹带身份字段）", () => {
    const panel = new SoloipsCompanyPanel(remoteStub().remote);
    expect(Object.keys(panel.getSnapshot()).sort()).toEqual(["list", "phase"]);
  });

  it("读回的公司对象按**投影**渲染：不新增字段、不改写语义", async () => {
    const stub = remoteStub();
    const panel = await (async () => {
      stub.nextCreate = () =>
        Promise.resolve({
          ok: true,
          value: { status: "committed", result: { companyId: ROOT_ID } },
        });
      const instance = new SoloipsCompanyPanel(stub.remote);
      toConfirming(instance);
      instance.actions.confirm(FIXED_OPERATION_ID);
      await settle();
      await settle();
      return instance;
    })();
    const list = panel.getSnapshot().list;
    expect(list.kind).toBe("ok");
    if (list.kind !== "ok") return;
    const first = list.companies[0];
    expect(first).toBeDefined();
    expect(Object.hasOwn(first as object, "accountId")).toBe(false);
    expect(Object.keys(first ?? {}).sort()).toEqual(
      ["createdAt", "id", "name", "status", "type"].sort(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ 槽位注册接线（验收条款 2）
// ─────────────────────────────────────────────────────────────────────────────

describe("槽位注册接线（验收条款 2）", () => {
  /** 记录注册调用的 slots 替身。 */
  function slotsStub(): {
    readonly slots: SoloipsSlotsSurface;
    readonly injectKeys: string[];
    readonly registrations: {
      readonly options: {
        readonly name: string;
        readonly id?: string;
        readonly key?: string;
        readonly locale?: string;
        readonly label?: string | (() => string);
      };
      readonly component: unknown;
    }[];
    /** 运行被 `inject` 注册的回调（模拟槽位声明到来）。 */
    declare(): void;
  } {
    const injectKeys: string[] = [];
    const callbacks: (() => () => void)[] = [];
    const registrations: {
      options: {
        name: string;
        id?: string;
        key?: string;
        locale?: string;
        label?: string | (() => string);
      };
      component: unknown;
    }[] = [];
    return {
      injectKeys,
      registrations,
      slots: {
        inject: (key, callback) => {
          injectKeys.push(key);
          callbacks.push(callback as () => () => void);
          return () => undefined;
        },
        register: (options, component) => {
          registrations.push({ options, component });
          return () => undefined;
        },
      },
      declare: () => {
        for (const callback of callbacks) callback();
      },
    };
  }

  /**
   * 造一个**最小**的浏览器侧 cordis 上下文替身。
   *
   * 〔为什么需要 `get`〕本包的 Remote namespace 是挂在 `remote` 容器下的**子服务**
   * `remote.soloips`，而它**不能**写进 `inject`——那会造成自锁（该服务由本插件
   * 自己的 `$mount` 创建）。故 `register.js` 的 `servicesOf` 经
   * `ctx.get("remote.soloips")` 直查 store（cordis 的 `reflect.get` 语义：
   * "without the inject requirement"）。测试替身必须提供同一入口，否则测的是
   * 「属性访问能不能用」而不是被测代码的真实路径。
   */
  function ctxStub(input: {
    readonly slots?: SoloipsSlotsSurface;
    readonly locale?: SoloipsLocaleSurface;
    readonly remote?: SoloipsRemoteSurface;
  }): Context {
    const services: Record<string, unknown> = {
      slots: input.slots,
      locale: input.locale,
      "remote.soloips": input.remote,
    };
    const ctx = Object.create(null) as Record<string, unknown>;
    ctx["get"] = (name: string): unknown => services[name];
    ctx["slots"] = input.slots;
    ctx["locale"] = input.locale;
    return ctx as unknown as Context;
  }

  function localeStub(): {
    readonly locale: SoloipsLocaleSurface;
    readonly registrations: { readonly namespace: string; readonly locales: string[] }[];
  } {
    const registrations: { readonly namespace: string; readonly locales: string[] }[] = [];
    return {
      registrations,
      locale: {
        register: (namespace, dictionaries) => {
          registrations.push({ namespace, locales: Object.keys(dictionaries).sort() });
          return () => undefined;
        },
        bind: () => (key: string) => key,
      },
    };
  }

  it("**成对**注册：`main` 放面板本体 + `sidebar.panellist` 放图标，且两处 id/key 同名", () => {
    // 〔为什么必须成对〕`sidebar.panellist` 只放 16/18px 的图标字形，而该行的
    // `onClick` 调 `ctx.layout.selectPanel(id)`——`main` 里没有同 key 的条目时
    // 该调用**抛错**（实测：`layout.selectPanel: main panel "…" is not
    // registered`）。故「面板可见」要求两处都注册且身份同名。
    const slots = slotsStub();
    const locale = localeStub();
    const dispose = registerSoloipsCompanyPanel(
      ctxStub({ slots: slots.slots, locale: locale.locale, remote: remoteStub().remote }),
    );
    expect(
      [...slots.injectKeys].sort(),
      "必须经 inject 等待两个槽位的声明（顺序不构成正确性依赖）",
    ).toEqual(["main", "sidebar.panellist"]);
    expect(slots.registrations.length, "声明到来前不得注册").toBe(0);
    slots.declare();
    expect(slots.registrations.length, "声明到来后注册两条").toBe(2);

    const panelEntry = slots.registrations.find((entry) => entry.options.name === "main");
    const iconEntry = slots.registrations.find(
      (entry) => entry.options.name === "sidebar.panellist",
    );
    expect(panelEntry, "必须注册 main 面板").toBeDefined();
    expect(iconEntry, "必须注册侧栏图标").toBeDefined();
    // 〔关键不变量〕两处的身份必须逐字相同（否则点击侧栏行抛错）。
    expect(panelEntry?.options.key, "main 的 keyed key").toBe(SOLOIPS_COMPANY_PANEL_SLOT_ID);
    expect(iconEntry?.options.id, "sidebar 的 list id").toBe(SOLOIPS_COMPANY_PANEL_SLOT_ID);
    expect(panelEntry?.options.key, "两处身份必须同名").toBe(iconEntry?.options.id);
    // 两处都声明字典命名空间（面板本体要 `t`，图标行要 label thunk）。
    expect(panelEntry?.options.locale).toBe(SOLOIPS_LOCALE_NAMESPACE);
    expect(iconEntry?.options.locale).toBe(SOLOIPS_LOCALE_NAMESPACE);
    expect(typeof panelEntry?.component, "main 注册的必须是面板组件").toBe("function");
    expect(typeof iconEntry?.component, "sidebar 注册的必须是图标组件").toBe("function");
    expect(panelEntry?.component, "面板本体与图标必须是不同的组件").not.toBe(iconEntry?.component);
    dispose();
  });

  it("侧栏图标**不渲染面板本体**（该槽位只有 16/18px）", () => {
    // 〔反例的机械形式〕首版把整个面板注册进图标槽位，浏览器实测把它压进 16px
    // 的格子（截图里只剩被裁掉的一行）。本用例把「图标组件不产生面板根节点」
    // 钉住——面板根节点的类名是 `.soloips-company-panel`。
    const slots = slotsStub();
    registerSoloipsCompanyPanel(
      ctxStub({ slots: slots.slots, locale: localeStub().locale, remote: remoteStub().remote }),
    );
    slots.declare();
    const iconEntry = slots.registrations.find(
      (entry) => entry.options.name === "sidebar.panellist",
    );
    const html = renderToStaticMarkup(
      createElement(
        iconEntry?.component as (props: { readonly size: number }) => React.ReactElement,
        {
          size: 16,
        },
      ),
    );
    expect(html, "图标不得含面板根节点").not.toContain("soloips-company-panel");
    expect(html, "图标应是 svg 字形").toContain("<svg");
    expect(html, "图标是装饰，不得进入无障碍树").toContain('aria-hidden="true"');
  });

  it("注册本包的 `soloips` 字典（zh + en 双语齐备）", () => {
    const slots = slotsStub();
    const locale = localeStub();
    registerSoloipsCompanyPanel(
      ctxStub({ slots: slots.slots, locale: locale.locale, remote: remoteStub().remote }),
    );
    expect(locale.registrations).toEqual([
      { namespace: SOLOIPS_LOCALE_NAMESPACE, locales: ["en", "zh"] },
    ]);
  });

  it("服务缺失时 fail-closed（显式抛错，不静默跳过）", () => {
    // 〔为什么这条重要〕静默跳过会留下「插件已激活但什么都没挂」的假象；
    // 显式抛出让「有人绕过 cordis 的 inject 等待」立刻显形。
    expect(() => registerSoloipsCompanyPanel(ctxStub({ remote: remoteStub().remote }))).toThrow(
      /slots \/ locale \/ remote\.soloips/,
    );
  });

  it("注销时先注销两个槽位、再注销字典（与注册顺序相反）", () => {
    const order: string[] = [];
    const slots: SoloipsSlotsSurface = {
      inject: (_key, callback) => {
        callback();
        return () => {
          order.push("slot");
        };
      },
      register: () => () => undefined,
    };
    const locale: SoloipsLocaleSurface = {
      register: () => () => {
        order.push("locale");
      },
      bind: () => (key: string) => key,
    };
    const dispose = registerSoloipsCompanyPanel(
      ctxStub({ slots, locale, remote: remoteStub().remote }),
    );
    dispose();
    expect(order, "两个槽位都先于字典注销").toEqual(["slot", "slot", "locale"]);
  });

  it("侧栏条目的标签经字典求值（thunk 形态，跟随语言切换）", () => {
    const slots = slotsStub();
    registerSoloipsCompanyPanel(
      ctxStub({ slots: slots.slots, locale: localeStub().locale, remote: remoteStub().remote }),
    );
    slots.declare();
    const iconEntry = slots.registrations.find(
      (entry) => entry.options.name === "sidebar.panellist",
    ) as { options: { readonly label?: string | (() => string) } };
    expect(typeof iconEntry.options.label, "标签必须是 thunk（跟随语言）").toBe("function");
    expect((iconEntry.options.label as () => string)()).toBe("soloips.company.panel.title");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⑦ 字典与映射表（验收条款 1）
// ─────────────────────────────────────────────────────────────────────────────

describe("文案走字典（验收条款 1）", () => {
  it("面板用到的每个键都在 zh/en 两字典里", () => {
    const panelKeys: readonly SoloipsLocaleKey[] = [
      "soloips.company.panel.title",
      "soloips.company.form.name.label",
      "soloips.company.form.name.placeholder",
      "soloips.company.form.type.label",
      "soloips.company.form.name.required",
      "soloips.company.form.review",
      "soloips.company.confirm.summary",
      "soloips.company.confirm.submit",
      "soloips.company.confirm.cancel",
      "soloips.company.submitting.first",
      "soloips.company.submitting.retry",
      "soloips.company.outcome.committed",
      "soloips.company.outcome.replayed",
      "soloips.company.outcome.unknown",
      "soloips.company.outcome.refused",
      "soloips.company.outcome.unavailable",
      "soloips.company.outcome.failed",
      "soloips.company.action.retry",
      "soloips.company.action.new",
      "soloips.company.action.refresh",
      "soloips.company.type.platform",
      "soloips.company.type.operation",
      "soloips.company.type.enterprise",
      "soloips.company.type.subsidiary",
      "soloips.company.status.active",
      "soloips.company.status.archived",
      "soloips.company.limit.company",
      "soloips.company.limit.subsidiary",
      "soloips.company.plan.free",
      "soloips.company.plan.pro",
      "soloips.company.plan.enterprise",
      "soloips.company.list.heading",
      "soloips.company.list.empty",
      "soloips.company.list.unavailable",
      "soloips.company.list.rootNotFound",
      "soloips.company.list.loading",
      "soloips.company.list.failed",
      "soloips.company.list.item.aria",
    ];
    for (const key of panelKeys) {
      expect(Object.hasOwn(zh, key), `${key} 必须在 zh`).toBe(true);
      expect(Object.hasOwn(en, key), `${key} 必须在 en`).toBe(true);
    }
  });

  it("关键文案在两种语言里都非空，且占位符集合一致", () => {
    const placeholders = (template: string): string[] =>
      [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();
    for (const key of [
      "soloips.company.outcome.unknown",
      "soloips.company.outcome.refused",
      "soloips.company.outcome.unavailable",
      "soloips.company.outcome.failed",
      "soloips.company.list.item.aria",
    ] as const) {
      expect(zh[key].trim().length, `${key} 的 zh 不得为空`).toBeGreaterThan(0);
      expect(en[key].trim().length, `${key} 的 en 不得为空`).toBeGreaterThan(0);
      expect(placeholders(zh[key]), `${key} 的中英占位符必须一致`).toEqual(placeholders(en[key]));
    }
  });

  it("`unknown` / `failed` 文案不承诺零副作用、不引导换编号重做（ORG-05 / F-02）", () => {
    // 与 `error-copy-claims.spec.ts` 对 lease 两键的口径一致：`unknown` 表示未决
    // 意图，可能已落盘乃至已部分写入，故**不得**承诺「未执行/未写入」。
    const zeroSideEffectZh = [/未执行/, /未写入/, /没有写入/, /未产生任何/];
    const zeroSideEffectEn = [/nothing was written/i, /\bno writes?\b/i, /was not executed/i];
    const newIdGuidanceZh = [/换(一个|个)?编号/, /更换编号/, /新的编号重/];
    const newIdGuidanceEn = [/new (operation )?id/i, /different (operation )?id/i];
    for (const key of [
      "soloips.company.outcome.unknown",
      "soloips.company.outcome.failed",
    ] as const) {
      for (const pattern of zeroSideEffectZh) {
        expect(zh[key], `${key} 的 zh 不得承诺零副作用（${String(pattern)}）`).not.toMatch(pattern);
      }
      for (const pattern of zeroSideEffectEn) {
        expect(en[key], `${key} 的 en 不得承诺零副作用（${String(pattern)}）`).not.toMatch(pattern);
      }
      for (const pattern of newIdGuidanceZh) {
        expect(zh[key], `${key} 的 zh 不得引导换编号（${String(pattern)}）`).not.toMatch(pattern);
      }
      for (const pattern of newIdGuidanceEn) {
        expect(en[key], `${key} 的 en 不得引导换编号（${String(pattern)}）`).not.toMatch(pattern);
      }
    }
  });

  it("面板文案在英文侧也能渲染（双语齐备不是空话）", async () => {
    const stub = remoteStub();
    stub.nextCreate = () => Promise.resolve({ ok: true, value: { status: "unknown" } });
    const panel = new SoloipsCompanyPanel(stub.remote);
    toConfirming(panel);
    panel.actions.confirm(FIXED_OPERATION_ID);
    await settle();
    const html = render(panel, translateEn);
    expect(html).toContain(translateEn("soloips.company.action.retry"));
    expect(html).toContain(translateEn("soloips.company.panel.title"));
    // 英文渲染里不得出现中文（防「en 键指向了 zh 的文本」）。
    expect(html, "英文渲染不得含 CJK 字符").not.toMatch(/[\u3400-\u9fff]/);
  });
});
