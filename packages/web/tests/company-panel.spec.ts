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
 * | 〔补盲〕无树根时 `refresh()` 不得发读请求 | 「无树根时 `refresh()`…」 |
 * | 〔补盲〕读面 `ok:false` 两臂落 `failed`（不是 `unavailable`） | 「读根/读树返回 `ok:false`…」 |
 * | 〔补盲 2〕诊断 `message` 不得上屏（**视图渲染路径**） | 「诊断文本…不得出现在渲染结果里」 |
 * | 〔补盲 2〕无树根时 `refresh()` 不注册定时器、推进定时器后仍无请求 | 「时间无关判据…」 |
 *
 * ── 〔补盲 FE-1a-GUARD2〕第二轮变异测试报出的两个盲区（本片新增）─────────────
 *
 * 第一轮（下节）补的是「**状态/调用面**没人观察」。第二轮补的是「**渲染结果**与
 * **延迟副作用**没人观察」——产品行为同样正确，但改坏它仍能让整仓保持全绿：
 *
 *  1. **诊断文本（`message`）上屏无人守**：`i18n-assets.spec.ts` 只断言
 *     `soloipsErrorCopyOf` 的**返回对象**不含 message（纯函数层）。而 I18N-1
 *     （`data-contract.md` §2.7）管的是**渲染结果**：在 `CompanyPanel.tsx` 的
 *     failed 臂额外渲染 `list.error.message` 曾让全套 666 条保持全绿。守卫见
 *     「诊断文本（`message`）**不得**出现在渲染结果里」两条用例（读面两臂 + 提交两臂）。
 *  2. **延迟伪造请求逃出观察窗口**：第一轮的守卫用 `settle()`（一个宏任务窗口）
 *     观察「无树根时不发请求」。把早退分支改成 `setTimeout(() => 发请求, 25)` 曾让
 *     45 条全绿——25ms 落在窗口之外。守卫见「时间无关判据」用例：用
 *     `vi.useFakeTimers()` + `vi.runAllTimersAsync()` 把「不猜 id」变成**不依赖
 *     时间**的性质（同时钉「不注册任何定时器」），不再靠等待。
 *
 * ── 〔补盲 FE-1a-GUARD〕两条由独立 QA 变异测试发现的守卫 ────────────────────
 *
 * 产品行为正确，缺的是**能发现行为被改坏**的断言。两处盲区的共同形态是
 * 「状态可分性在一条无人观察的臂上失守」：
 *
 *  1. **无树根时的 `refresh()`**：既有用例只断言「**构造后**是 `no-root`、没有读
 *     请求」，从不调用 `refresh()`；而刷新按钮不看 list 状态无条件渲染
 *     （`CompanyPanel.tsx:416`），用户在 `no-root` 相位照样点得到。把 `#refresh`
 *     的早退分支改成「伪造一个 `companyId` 去发读请求」曾让全套保持全绿。
 *  2. **读面 `ok:false` 的两条错误臂**（`surface.ts:198` 与 `:203`）：全套里唯一的
 *     `ok:false` 是给 `createCompany` 的，读面**从不**返回 `ok:false`。把两处
 *     `{ kind: "failed" }` 改成 `{ kind: "unavailable" }` 曾让全套保持全绿——而
 *     两者对用户的可行动指引不同（「读取出错，请排查」vs「服务尚未就绪，稍后刷新」），
 *     把网关层失败伪装成「服务未就绪」是**错误的指引**。
 *
 * 〔判据形态〕两条守卫都断言**可观察行为**（调用记录 + 真渲染的文案/数据属性），
 * 不是「代码里写着哪一行」；「先红后绿」的实测证据见切片 FE-1a-GUARD 的交付报告。
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
import { describe, expect, it, vi } from "vitest";
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
import { SOLOIPS_ERROR_CODE_UNKNOWN } from "../src/client/i18n/error-codes.js";
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

/**
 * 替身失败对象的形状：**只**要求「有字符串 `code`」，与消费侧的结构判别同口径。
 *
 * 〔为什么不是 `RemoteFailure`〕`RemoteFailure` 是 `RemoteError` **类实例**的联合
 * （协议用类承载码与明细），替身不可能逐字段复制一个类实例；而本仓取文案的判据
 * 本来就是结构判别（`soloipsErrorCopyOf` → `soloipsErrorCodeOf`：对象上有字符串
 * `code` 即可），与协议自身的口径一致（`remote-error.d.ts`：「Discrimination is
 * always by `code`, never by `instanceof`」）。因此「携带真实可读码的普通对象」
 * 与真实失败在**被消费的维度上**等价——判据不是 `as` 伪造出来的形状。
 */
interface StubRemoteFailure {
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, never>>;
  readonly name: string;
}

/**
 * 替身失败对象携带的**诊断文本**（`message`）。
 *
 * 〔契约〕core/adapter 的 `message` 是面向开发者与运维的中文诊断，**不得上屏**
 * （`data-contract.md` §2.7 I18N-1）：界面只按稳定 `code` 取字典文案。本常量是
 * 「这句话不得出现在渲染结果里」的**唯一真源**——替身与断言引用同一常量，避免
 * 两处字面量各自漂移后守卫静默失效（一处改了、另一处没改，断言仍在但已空转）。
 */
const STUB_DIAGNOSTIC_TEXT = "替身：网关层失败（诊断文本不上屏）";

/**
 * 造一个**网关层失败**（`ok:false`）的替身。
 *
 * 〔为什么 `message` 刻意写成中文诊断〕它**不得上屏**（`data-contract.md`
 * §2.7 I18N-1）：界面只按 `code` 取文案。写成一句可识别的诊断文本，使「有人把
 * `message` 渲染出来」在断言里显形——该显形由 {@link STUB_DIAGNOSTIC_TEXT} 的
 * `not.toContain` 断言承担，见「诊断文本（`message`）**不得**出现在渲染结果里」
 * 两条用例（读根/读树两臂、提交 failed 臂）。
 *
 * 〔补盲 FE-1a-GUARD2 订正〕本注释首版声称「使『有人把 `message` 渲染出来』在
 * 断言里显形」，但当时**没有任何用例断言这句话不出现**（既有的
 * `i18n-assets.spec.ts` 只断言 `soloipsErrorCopyOf` 的返回对象不含 message，是
 * **纯函数层**；渲染路径无人观察）。该声称当时**不成立**，现已由上述两条渲染
 * 断言落地——把 `list.error.message` / `phase.error.message` 渲染进视图会立即
 * 让它们变红（实测）。
 *
 * @param code - 失败码；`gateway/internal` 是「载体/派发/未归类 Host 失败」。
 * @returns 可放进 `RemoteResult` 错误臂的对象（用点处按本文件既有写法转 `never`，
 *   与给 `createCompany` 的那条 `ok:false` 用例同形）。
 */
function gatewayFailure(code: string): StubRemoteFailure {
  return {
    code,
    message: STUB_DIAGNOSTIC_TEXT,
    details: {},
    name: "RemoteError",
  };
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

  // ── 〔补盲 FE-1a-GUARD2 ①〕提交 failed 臂的诊断文本不得上屏 ──────────────────
  //
  // 〔为什么读面那两条之外还要这一条〕`SubmissionStatus` 的 `failed` 臂是**另一个**
  // 渲染点（`CompanyPanel.tsx:314-334`，经 `soloipsErrorCopyOf(phase.error)` 取
  // 文案），其 `error` 来自 `#executeCreate` 而非读面——两条路径的 error 对象互不
  // 相同，读面守卫覆盖不到这里。把 `phase.error.message` 渲染进该臂曾同样全绿。
  //
  // 〔两条失败来源都覆盖〕`#executeCreate` 的失败有两路（`surface.ts:325-341`）：
  //  `RemoteResult` 的 `ok:false` 错误臂，以及调用本身**抛错**。前者携带 `message`
  // （替身形状），后者是真实 `Error`（其 `message` 同样不得上屏）。两路都进同一个
  // `failed` 臂，故两路都断言。
  it("提交 failed 臂：诊断文本（`message`）**不得**出现在渲染结果里（I18N-1）", async () => {
    // 〔两路的「码上屏」形态不同，故逐路给出期望码文本〕`ok:false` 臂带
    // `gateway/internal`（替身形状），抛错臂是真实 `Error`、**没有 `code`**，故
    // `soloipsErrorCopyOf` 回退到 `SOLOIPS_ERROR_CODE_UNKNOWN` 占位符
    // （`error-codes.ts:147`）——界面显示的码文本因此不同。这不是缺陷：抛错臂
    // 本就没有稳定码可给，占位符正是「不得留空、不得把 message 当码」的落地。
    for (const [source, codeText] of [
      ["gateway-ok-false", "gateway/internal"],
      ["thrown", SOLOIPS_ERROR_CODE_UNKNOWN],
    ] as const) {
      const stub = remoteStub();
      if (source === "gateway-ok-false") {
        stub.nextCreate = () =>
          Promise.resolve({
            ok: false,
            error: gatewayFailure("gateway/internal") as never,
          });
      } else {
        stub.nextCreate = () => Promise.reject(new Error(STUB_DIAGNOSTIC_TEXT));
      }
      const panel = new SoloipsCompanyPanel(stub.remote);
      toConfirming(panel);
      panel.actions.confirm(FIXED_OPERATION_ID);
      await settle();

      // 前置：确实落到了提交 failed 相位（否则断言的是「没渲染那条臂」）。
      const phase = panel.getSnapshot().phase;
      expect(phase.kind, `${source}：必须落 failed 相位（前置）`).toBe("failed");
      if (phase.kind !== "failed") return;
      expect(
        stub.createCalls.length,
        `${source}：前置——create 确实被调用过（否则失败无从发生）`,
      ).toBe(1);

      const html = render(panel);
      expect(html, `${source}：必须带提交 failed 的数据属性（前置）`).toContain(
        'data-soloips-submission="failed"',
      );
      expect(
        html,
        `${source}：诊断 \`message\` **不得上屏**（I18N-1）——提交失败臂只按稳定 \`code\` 取字典文案`,
      ).not.toContain(STUB_DIAGNOSTIC_TEXT);
      // 否定断言不得靠「什么都不渲染」通过：操作编号与码必须仍上屏。
      expect(html, `${source}：仍必须显示操作编号（可行动指引）`).toContain(FIXED_OPERATION_ID);
      expect(html, `${source}：仍必须把稳定码作为可复制诊断上屏`).toContain(
        translate("soloips.error.unknown", { code: codeText }),
      );
    }
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

  // ── 〔补盲 FE-1a-GUARD ①〕无树根时 `refresh()` 的守卫 ───────────────────────
  //
  // 〔为什么上一条用例不足以守住它〕上一条只断言「**构造后**是 `no-root`、没有读
  // 请求」——`#refresh()` 的早退分支（`surface.ts:287-294`）从未被**调用**过。而
  // 刷新按钮无条件渲染（`CompanyPanel.tsx:416`：不看 list 状态），用户在 `no-root`
  // 相位照样点得到它，所以「点了会怎样」是真实的用户路径，不是理论分支。
  //
  // 〔变异体的形态〕把早退分支改成「伪造一个 `companyId` 去发读请求」曾让全套保持
  // 全绿：构造路径不经过 `#refresh()`，而唯一调用 `refresh()` 的用例都先经
  // `rootedPanel()` 确定了树根。下面的用例把「调用之后**仍然**没有任何读请求」钉住
  // ——它同时覆盖状态面（`no-root` 保持）与调用面（`readCalls`/`treeCalls` 仍为空）。
  //
  // 〔观察窗口口径（补盲 FE-1a-GUARD2 ①）〕本用例的判据是 `settle()`（一个宏任务
  // 窗口）：**覆盖同步发出与 ≤1 个宏任务内发出的请求；更长的延迟（如
  // `setTimeout(发请求, 25)`）不在本用例口径内**。该形态由下方「时间无关判据」用例
  // 承担——那里用假定时器把「不猜 id」变成不依赖时间的性质。此处保留 `settle()` 是
  // 因为它同时验证「真实定时器下同样成立」（假定时器会接管 `setTimeout`，两者互补）。
  it("无树根时调用 `refresh()`：**不得发出任何读请求**，状态仍是 `no-root`", async () => {
    const stub = remoteStub();
    const panel = new SoloipsCompanyPanel(stub.remote);
    // 前置：构造后确实没有请求（把「构造」与「刷新」两条路径分开观察）。
    expect(stub.readCalls.length, "前置：构造后不得有读请求").toBe(0);
    expect(stub.treeCalls.length, "前置：构造后不得有树请求").toBe(0);

    panel.actions.refresh();
    // 读面调用是异步发起的：给替身足够的机会结算（若变异体发了请求，它必在此显形）。
    await settle();
    await settle();

    expect(
      stub.readCalls.length,
      "无树根时 `refresh()` 不得发出 `getCompany`——「不猜 id」不只在构造时成立，用户点刷新时同样成立",
    ).toBe(0);
    expect(
      stub.treeCalls.length,
      "无树根时 `refresh()` 不得发出 `getCompanyTree`——伪造 id 去查会把「还没建」误导成「编号错了」",
    ).toBe(0);
    expect(
      panel.getSnapshot().list.kind,
      "无树根时 `refresh()` 之后仍是 `no-root`（不是 `loading`——那会让界面停在「读取中」）",
    ).toBe("no-root");

    const html = render(panel);
    expect(html, "刷新后界面仍是 no-root 呈现").toContain('data-soloips-list-state="no-root"');
    expect(html, "刷新后仍显示「本会话还没建」文案").toContain(
      translate("soloips.company.list.noRoot"),
    );
    expect(html, "**不得**落到 loading——那正是「伪造 id 发请求」变异体的可观察形态").not.toContain(
      'data-soloips-list-state="loading"',
    );
  });

  it("无树根时连续多次 `refresh()` 仍不发请求（幂等，不因重复点击而猜 id）", async () => {
    // 〔为什么还要一条〕刷新按钮**不禁用**（`CompanyPanel.tsx:416` 没有 `disabled`），
    // 用户可连点。若早退分支被改成「先发请求、失败后再置 `no-root`」，连点会让
    // 请求数随点击次数增长——单次断言可能被「第一次恰好没发」这类实现蒙混过关。
    const stub = remoteStub();
    const panel = new SoloipsCompanyPanel(stub.remote);
    panel.actions.refresh();
    panel.actions.refresh();
    panel.actions.refresh();
    await settle();
    await settle();
    expect(stub.readCalls.length, "三次 `refresh()` 后仍不得有 `getCompany`").toBe(0);
    expect(stub.treeCalls.length, "三次 `refresh()` 后仍不得有 `getCompanyTree`").toBe(0);
    expect(panel.getSnapshot().list.kind).toBe("no-root");
  });

  // ── 〔补盲 FE-1a-GUARD2 ②〕「无树根不发请求」的时间无关判据 ──────────────────
  //
  // 〔盲区在哪〕上面两条守卫的观察窗口是 `settle()`——**一个宏任务**。把早退分支
  // 改成 `setTimeout(() => { 发请求 }, 25)` 曾让 45 条全绿（QA 实测：0ms / 1ms 延迟
  // 会被杀，25ms 不会被杀）。这**不是**「窗口太短」的问题：把窗口拉长到 25ms 只是
  // 把赌注押在「变异体延迟多少」上，是脆弱的 sleep 式等待（本仓明确反对）。
  //
  // 〔判据为什么能时间无关〕把观察窗口从「等了多久」换成「**有没有待处理的定时器**」
  // + 「推进**所有**定时器之后的状态」：
  //  1. `vi.getTimerCount()`：`#refresh()` 的早退分支是**同步完成**的——它既不注册
  //     定时器、也不产生微任务副作用（只 `#set` 一次状态）。任何「延迟发请求」的
  //     变异体都**必须**先注册一个定时器，故计数 > 0 即被抓住，**与延迟多少无关**；
  //  2. `vi.runAllTimersAsync()`：即便变异体把请求藏在定时器里，推进**全部**定时器
  //     后它必然已执行——随后断言仍无请求。这条**不依赖**「延迟 ≤ N ms」这个前提。
  // 两条并用：计数判据抓「注册了定时器」，推进判据抓「定时器里的副作用」。
  //
  // 〔为什么不是 sleep 式等待〕`vi.useFakeTimers()` 下时间不流逝，`runAllTimersAsync`
  // 是**穷尽**定时器队列而非「等一段真实时间」——用例时长与「变异体延迟多久」无关。
  //
  // 〔为什么微任务形态也被覆盖〕`runAllTimersAsync` 会先结算微任务队列（实测），
  // 故「`Promise.resolve().then(发请求)`」这类无定时器的延迟形态同样在推进后显形；
  // 而本用例的前置计数断言（0 个定时器）与随后的请求数断言共同把它钉住。
  it("无树根时 `refresh()`：**不注册任何定时器**，且推进所有定时器后仍不发请求（时间无关）", async () => {
    const stub = remoteStub();
    const panel = new SoloipsCompanyPanel(stub.remote);

    // 假定时器只在**本用例**内启用；`settle()` 依赖真实 `setTimeout`，故下方
    // 不用它（本用例的判据是「推进定时器」，不是「等一个宏任务」）。
    vi.useFakeTimers();
    try {
      // 前置：构造路径自身不得留下待处理定时器（把「构造」与「刷新」分开观察）。
      expect(
        vi.getTimerCount(),
        "前置：构造 `no-root` 面板不得注册任何定时器（构造是纯同步的）",
      ).toBe(0);

      panel.actions.refresh();

      // 判据 1（时间无关）：早退分支是同步完成的，不得注册任何定时器。
      // 任何「延迟 N ms 后伪造 id 发请求」的变异体都必然先注册一个定时器。
      expect(
        vi.getTimerCount(),
        "无树根时 `refresh()` 不得注册任何定时器——早退分支是同步完成的；「延迟若干毫秒再发请求」的形态会在这里显形（与延迟多少无关）",
      ).toBe(0);

      // 判据 2（穷尽，不是等待）：推进**全部**定时器 + 结算微任务队列。
      await vi.runAllTimersAsync();

      expect(
        stub.readCalls.length,
        "推进所有定时器后仍不得有 `getCompany`——判据不依赖「延迟 ≤ N ms」这个前提",
      ).toBe(0);
      expect(
        stub.treeCalls.length,
        "推进所有定时器后仍不得有 `getCompanyTree`——不猜 id 是**时间无关**的性质",
      ).toBe(0);
      expect(panel.getSnapshot().list.kind, "推进定时器后仍是 `no-root`（不是 `loading`）").toBe(
        "no-root",
      );

      const html = render(panel);
      expect(html, "界面仍是 no-root 呈现").toContain('data-soloips-list-state="no-root"');
      expect(html, "**不得**落到 loading——延迟变异体的可观察形态").not.toContain(
        'data-soloips-list-state="loading"',
      );
    } finally {
      // 〔约束〕假定时器必须还原：`settle()` 与后续用例依赖真实定时器，
      // 泄漏会让同文件其它用例挂起（vitest 不自动还原）。
      vi.useRealTimers();
    }
  });

  // ── 〔补盲 FE-1a-GUARD ②〕读面 `ok:false` 两条错误臂的守卫 ──────────────────
  //
  // 〔为什么是两条而不是一条〕`loadSoloipsCompanyList` 有两个独立的 `ok:false`
  // 判定点（`surface.ts:198` 的读根、`:203` 的读树），各自早退。QA 实测**两处都可
  // 单独被改成 `unavailable` 而全套全绿**——只覆盖其中一条会留下另一条无守卫。
  //
  // 〔为什么必须与 `unavailable` 分开〕两者对用户的可行动指引不同：
  // `failed` 是「读取出错，请排查」；`unavailable`（Host 装配态 `core-unavailable`）
  // 是「业务服务尚未就绪，稍后刷新」。把网关层失败伪装成「服务未就绪」会让用户
  // **等一个不会自己好的状态**。这与验收条款 5（`unavailable` 与「查询成功但无数据」
  // 必须可分）是**同一条可分性纪律在错误臂上的延伸**：不仅「未就绪 vs 空数据」要分，
  // 「未就绪 vs 读取出错」也要分。
  it("读根返回 `ok:false`：状态落 `failed`（**不是** `unavailable`），文案是 list.failed", async () => {
    const stub = remoteStub();
    const panel = await rootedPanel(stub);
    stub.nextRead = () =>
      Promise.resolve({ ok: false, error: gatewayFailure("gateway/internal") as never });
    panel.actions.refresh();
    await settle();

    expect(
      panel.getSnapshot().list.kind,
      "网关层失败是 `failed`——`unavailable` 专指 Host 装配态（core-unavailable），两者不可互换",
    ).toBe("failed");

    const html = render(panel);
    expect(html, "必须带 failed 的数据属性").toContain('data-soloips-list-state="failed"');
    expect(html, "必须显示「读取公司列表时发生错误」").toContain(
      translate("soloips.company.list.failed"),
    );
    expect(
      html,
      "**不得**显示「业务服务尚未就绪」——那会把网关层失败误导成「等一会儿就好」",
    ).not.toContain(translate("soloips.company.list.unavailable"));
    expect(
      html,
      "**不得**带 unavailable 的数据属性（界面按它选文案，属性对了文案才可能对）",
    ).not.toContain('data-soloips-list-state="unavailable"');
  });

  it("读树返回 `ok:false`：状态落 `failed`（**不是** `unavailable`），文案是 list.failed", async () => {
    const stub = remoteStub();
    const panel = await rootedPanel(stub);
    // 读根成功、读树失败：这是 `loadSoloipsCompanyList` 的**第二个**早退点。
    stub.nextTree = () =>
      Promise.resolve({ ok: false, error: gatewayFailure("gateway/internal") as never });
    panel.actions.refresh();
    await settle();

    expect(
      stub.treeCalls.length,
      "前置：读树确实被调用过（否则本用例断言的是「没走到那里」而不是「走到了且判定正确」）",
    ).toBeGreaterThan(0);
    expect(
      panel.getSnapshot().list.kind,
      "读树的网关层失败同样是 `failed`，不得落 `unavailable`",
    ).toBe("failed");

    const html = render(panel);
    expect(html, "必须带 failed 的数据属性").toContain('data-soloips-list-state="failed"');
    expect(html, "必须显示「读取公司列表时发生错误」").toContain(
      translate("soloips.company.list.failed"),
    );
    expect(html, "**不得**显示「业务服务尚未就绪」——读树失败与装配态是两回事").not.toContain(
      translate("soloips.company.list.unavailable"),
    );
    expect(html).not.toContain('data-soloips-list-state="unavailable"');
  });

  it("两条错误臂都带失败原因（`error` 被保留，不是空对象）", async () => {
    // 〔为什么这条必要〕`failed` 的渲染除了 `list.failed` 还会按**码**取一条诊断文案
    // （`CompanyPanel.tsx:128` 的 `soloipsErrorCopyOf(list.error)`）。若错误臂把
    // `error` 丢掉（例如 `{ kind: "failed", error: undefined }`），状态与文案仍会绿，
    // 但界面失去可复制诊断——那是「失败但不可排查」的形态。
    for (const arm of ["getCompany", "getCompanyTree"] as const) {
      const stub = remoteStub();
      const panel = await rootedPanel(stub);
      const failure = gatewayFailure("gateway/internal");
      if (arm === "getCompany") {
        stub.nextRead = () => Promise.resolve({ ok: false, error: failure as never });
      } else {
        stub.nextTree = () => Promise.resolve({ ok: false, error: failure as never });
      }
      panel.actions.refresh();
      await settle();
      const list = panel.getSnapshot().list;
      expect(list.kind, `${arm} 臂必须落 failed`).toBe("failed");
      if (list.kind !== "failed") return;
      expect(list.error, `${arm} 臂必须保留原失败对象（不得吞掉原因）`).toBe(failure);
      expect(render(panel), `${arm} 臂必须把失败码上屏（可复制诊断）`).toContain(
        translate("soloips.error.unknown", { code: "gateway/internal" }),
      );
    }
  });

  // ── 〔补盲 FE-1a-GUARD2 ①〕诊断文本（`message`）不得上屏的守卫 ───────────────
  //
  // 〔盲区在哪〕`i18n-assets.spec.ts:284-298` 只断言 `soloipsErrorCopyOf` 的**返回
  // 对象**不含 message——那是**纯函数层**。I18N-1（`data-contract.md` §2.7）管的是
  // **渲染结果**：视图在 failed 臂额外渲染 `list.error.message` 曾让整仓 666 条
  // 保持全绿（QA 实测变异体）。
  //
  // 〔为什么必须两条（读根 + 读树）〕`loadSoloipsCompanyList` 有两个独立的
  // `failed` 落点（`surface.ts:198` 的读根、`:203` 的读树），两者的 `error` 是
  // **不同对象**。只覆盖一条会留下另一条无守卫——与上方「读面 `ok:false` 两条错误
  // 臂」同一条纪律：每个独立落点各自可被改坏，各自需要断言。
  //
  // 〔判据为什么是「不含这句话」而不是「含某句话」〕上屏素材是**字典文案**，其
  // 内容随文案迭代而变；而「诊断文本不得出现」是**不变量**，与文案怎么写无关。
  // 故断言取否定形态，且引用替身里的同一常量（`STUB_DIAGNOSTIC_TEXT`）——两处
  // 字面量各自漂移会让守卫静默空转（断言仍在、却再也匹配不到任何东西）。
  it("读根 / 读树失败时，诊断文本（`message`）**不得**出现在渲染结果里（I18N-1）", async () => {
    for (const arm of ["getCompany", "getCompanyTree"] as const) {
      const stub = remoteStub();
      const panel = await rootedPanel(stub);
      const failure = gatewayFailure("gateway/internal");
      if (arm === "getCompany") {
        stub.nextRead = () => Promise.resolve({ ok: false, error: failure as never });
      } else {
        stub.nextTree = () => Promise.resolve({ ok: false, error: failure as never });
      }
      panel.actions.refresh();
      await settle();

      // 前置：确实落到了 failed 臂（否则本用例断言的是「没渲染那条臂」而非「渲染了且没泄漏」）。
      const list = panel.getSnapshot().list;
      expect(list.kind, `${arm} 臂必须落 failed（前置）`).toBe("failed");
      if (list.kind !== "failed") return;
      // 前置：渲染素材里**确实**带着那句诊断——若替身没把它带进来，本断言会因
      // 「无从泄漏」而空转成假绿（这正是原盲区的成因）。
      expect(list.error, `${arm} 臂的失败对象必须真的携带诊断文本（否则本用例无鉴别力）`).toBe(
        failure,
      );
      expect(
        (list.error as StubRemoteFailure).message,
        `${arm} 臂的替身诊断文本必须是断言引用的那一句`,
      ).toBe(STUB_DIAGNOSTIC_TEXT);

      const html = render(panel);
      expect(
        html,
        `${arm} 臂：core/网关的 \`message\` 是面向开发者的中文诊断，**不得上屏**（I18N-1）——界面只按稳定 \`code\` 取字典文案`,
      ).not.toContain(STUB_DIAGNOSTIC_TEXT);
      // 〔为什么还要断言「码确实上屏了」〕防止用「整条 failed 臂什么都不渲染」这种
      // 退化实现骗过上面的否定断言——那会同时失去可复制诊断。
      expect(
        html,
        `${arm} 臂：仍必须把稳定码作为可复制诊断上屏（否定断言不得靠「什么都不渲染」通过）`,
      ).toContain(translate("soloips.error.unknown", { code: "gateway/internal" }));
    }
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
