/**
 * SOLOIPS-WEB-CLIENT-COMPANY-PANEL
 *
 * 公司面板的**视图**（React）：薄渲染 + 事件转发。所有业务判定在
 * `./surface.js` 与 `./session.js`，本文件不做任何决策。
 *
 * ── 为什么视图必须是「薄」的（不是风格偏好）────────────────────────────────
 * 两条验收条款（`unknown` 不自动重提、`unavailable` 与空数据可区分）都是**业务面**
 * 的性质。把它们写进组件会让判据只能经 DOM 观察，而本仓不引入浏览器测试框架
 * （见切片「不做」清单）。视图只做三件事：把状态映射成元素、把点击映射成动作、
 * 把稳定 id 经字典映射成文案——**零判定分支**（唯一的条件渲染是「按 `kind` 选
 * 元素」这一映射本身）。
 *
 * ── 文案纪律（`SOLO-I18N-01` §6；`scripts/development/verify-client-ui-i18n.mjs`）────
 * 本文件**不得**出现任何用户可见字面量：全部经 `t(<字典键>)` 取得，键取自
 * `../i18n/company-panel.js` 的映射表（稳定 id → 键）与
 * `../i18n/error-codes.js`（错误码 → 键）。零硬编码门禁会扫描本文件，包括
 * `aria-label`/`placeholder` 这类携带文案的属性（无障碍标签同样是用户可见文本）。
 *
 * ── 渲染面与相位的关系（每一相位的按钮 disable/enable 规则）────────────────
 *
 * | 相位 | 可编辑 | 「创建…」 | 「确认创建」 | 「重试」 | 「新建另一家」 |
 * |---|---|---|---|---|---|
 * | `editing` | 是 | 名称非空时可点 | — | — | — |
 * | `confirming` | 否（草稿冻结） | — | 可点 | — | — |
 * | `submitting` | 否 | — | 禁用（防重复提交） | — | — |
 * | `settled` | 否 | — | — | — | 可点 |
 * | `reconcile` | 否 | — | — | 可点（**同一编号**） | 禁用（换编号的后门） |
 * | `retryable` | 否 | — | — | 可点（**同一编号**） | 可点 |
 * | `failed` | 否 | — | — | 可点（**同一编号**） | 禁用（结果可能已部分写入） |
 *
 * 〔为什么 `reconcile`/`failed` 禁用「新建另一家」〕那是「换 ID 重做」的界面形态：
 * 未决意图或可能已部分写入的结果下，新起一次创建会产生**第二家公司**。该规则由
 * 状态机承担（`submission/reset` 在这两个相位被拒绝），界面只是把不可用的按钮
 * 标成禁用——判定不在视图里。
 */

import type { SoloipsCompanySubmissionPhase } from "./session.js";
import type {
  SoloipsCompanyPanel,
  SoloipsCompanyPanelActions,
  SoloipsCompanyPanelState,
} from "./surface.js";

import { useSyncExternalStore } from "react";

import { soloipsErrorCopyOf } from "../i18n/error-codes.js";
import {
  SOLOIPS_COMPANY_FAILED_KEY,
  soloipsCompanyOutcomeCopy,
  soloipsCompanyStatusKey,
  soloipsCompanyTypeKey,
} from "../i18n/company-panel.js";
import type { SoloipsLocaleKey } from "../locales/index.js";
import { SOLOIPS_CLIENT_CREATABLE_COMPANY_TYPES, soloipsCompanyNameIsValid } from "./session.js";

/**
 * 翻译函数（`ctx.locale.bind(SOLOIPS_LOCALE_NAMESPACE)` 的类型）。
 *
 * 〔为什么不 import `TranslateNS`〕那需要 `@deepseek-ai/dsh-client-ui-slots` 的
 * `LocaleNamespaceMap` 增强面；本组件的可测性优先——测试直接传入一个按键查字典的
 * 纯函数即可，无需搭建 locale 服务。签名与框架注入的 `t` seat **逐字兼容**
 * （`(key, params?) => string`），故注册时可直接传入。
 */
export type SoloipsPanelTranslate = (
  key: SoloipsLocaleKey,
  params?: Record<string, unknown>,
) => string;

/** 面板组件的 props。 */
export interface SoloipsCompanyPanelProps {
  readonly state: SoloipsCompanyPanelState;
  readonly actions: SoloipsCompanyPanelActions;
  readonly t: SoloipsPanelTranslate;
}

/** 读列表区域（五态各自独立可辨；`unavailable` **不**渲染成空列表）。 */
function CompanyList({
  list,
  t,
}: {
  readonly list: SoloipsCompanyPanelState["list"];
  readonly t: SoloipsPanelTranslate;
}): React.ReactElement {
  const heading = (
    <h3 className="soloips-company-list-heading">{t("soloips.company.list.heading")}</h3>
  );
  switch (list.kind) {
    case "no-root":
      return (
        <section className="soloips-company-list" data-soloips-list-state="no-root">
          {heading}
          <p className="soloips-company-list-empty">{t("soloips.company.list.empty")}</p>
        </section>
      );
    case "loading":
      return (
        <section className="soloips-company-list" data-soloips-list-state="loading">
          {heading}
          <p className="soloips-company-list-status">{t("soloips.company.list.loading")}</p>
        </section>
      );
    case "unavailable":
      return (
        <section className="soloips-company-list" data-soloips-list-state="unavailable">
          {heading}
          <p className="soloips-company-list-unavailable">
            {t("soloips.company.list.unavailable")}
          </p>
        </section>
      );
    case "not-found":
      return (
        <section className="soloips-company-list" data-soloips-list-state="not-found">
          {heading}
          <p className="soloips-company-list-notfound">{t("soloips.company.list.rootNotFound")}</p>
        </section>
      );
    case "failed": {
      const copy = soloipsErrorCopyOf(list.error);
      return (
        <section className="soloips-company-list" data-soloips-list-state="failed">
          {heading}
          <p className="soloips-company-list-failed">{t("soloips.company.list.failed")}</p>
          <p className="soloips-company-list-failed-code">{t(copy.key, copy.params)}</p>
        </section>
      );
    }
    case "ok":
      if (list.companies.length === 0) {
        return (
          <section className="soloips-company-list" data-soloips-list-state="empty">
            {heading}
            <p className="soloips-company-list-empty">{t("soloips.company.list.empty")}</p>
          </section>
        );
      }
      return (
        <section className="soloips-company-list" data-soloips-list-state="ok">
          {heading}
          <ul className="soloips-company-list-items">
            {list.companies.map((company) => (
              <li
                key={company.id}
                className="soloips-company-list-item"
                data-soloips-company-type={company.type}
                data-soloips-company-status={company.status}
                aria-label={t("soloips.company.list.item.aria", { name: company.name })}
              >
                <span className="soloips-company-list-item-name">{company.name}</span>
                <span className="soloips-company-list-item-type">
                  {t(soloipsCompanyTypeKey(company.type))}
                </span>
                <span className="soloips-company-list-item-status">
                  {t(soloipsCompanyStatusKey(company.status))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      );
  }
}

/** 草稿的只读回显（确认步骤与提交中相位共用）。 */
function DraftSummary({
  phase,
  t,
}: {
  readonly phase: SoloipsCompanySubmissionPhase;
  readonly t: SoloipsPanelTranslate;
}): React.ReactElement {
  return (
    <dl className="soloips-company-draft">
      <dt>{t("soloips.company.form.name.label")}</dt>
      <dd className="soloips-company-draft-name">{phase.draft.name}</dd>
      <dt>{t("soloips.company.form.type.label")}</dt>
      <dd className="soloips-company-draft-type">{t(soloipsCompanyTypeKey(phase.draft.type))}</dd>
    </dl>
  );
}

/** 提交结果区域（穷举五态 + 失败；每态渲染**自己的**文案与可行动指引）。 */
function SubmissionStatus({
  phase,
  actions,
  t,
}: {
  readonly phase: SoloipsCompanySubmissionPhase;
  readonly actions: SoloipsCompanyPanelActions;
  readonly t: SoloipsPanelTranslate;
}): React.ReactElement | null {
  switch (phase.kind) {
    case "editing":
      return null;

    case "confirming":
      return (
        <div className="soloips-company-confirm">
          <p className="soloips-company-confirm-summary">{t("soloips.company.confirm.summary")}</p>
          <DraftSummary phase={phase} t={t} />
          <div className="soloips-company-confirm-actions">
            <button
              type="button"
              className="soloips-company-confirm-submit"
              onClick={() => {
                actions.confirm(actions.newOperationId());
              }}
            >
              {t("soloips.company.confirm.submit")}
            </button>
            <button
              type="button"
              className="soloips-company-confirm-cancel"
              onClick={() => {
                actions.cancelConfirm();
              }}
            >
              {t("soloips.company.confirm.cancel")}
            </button>
          </div>
        </div>
      );

    case "submitting":
      return (
        <div className="soloips-company-submitting" data-soloips-submission="submitting">
          <DraftSummary phase={phase} t={t} />
          <p className="soloips-company-submitting-status">
            {phase.retry
              ? t("soloips.company.submitting.retry")
              : t("soloips.company.submitting.first")}
          </p>
          <button type="button" className="soloips-company-submit" disabled>
            {t("soloips.company.confirm.submit")}
          </button>
        </div>
      );

    case "settled": {
      const copy = soloipsCompanyOutcomeCopy(phase.outcome, phase.operationId, (key) => t(key));
      return (
        <div
          className="soloips-company-outcome"
          data-soloips-submission="settled"
          data-soloips-outcome={phase.outcome.status}
        >
          <p className="soloips-company-outcome-copy">{t(copy.key, copy.params)}</p>
          {phase.outcome.status === "committed" || phase.outcome.status === "replayed" ? (
            <p className="soloips-company-outcome-company">{phase.outcome.result.companyId}</p>
          ) : null}
          <button
            type="button"
            className="soloips-company-new"
            onClick={() => {
              actions.reset();
            }}
          >
            {t("soloips.company.action.new")}
          </button>
        </div>
      );
    }

    case "reconcile":
      return (
        <div className="soloips-company-outcome" data-soloips-submission="reconcile">
          <p className="soloips-company-outcome-copy">
            {t("soloips.company.outcome.unknown", { operationId: phase.operationId })}
          </p>
          <button
            type="button"
            className="soloips-company-retry"
            onClick={() => {
              actions.retry();
            }}
          >
            {t("soloips.company.action.retry")}
          </button>
          {/* 「新建另一家」在未决态**不渲染**：换编号重做是 ORG-05 禁止的形态。 */}
        </div>
      );

    case "retryable":
      return (
        <div className="soloips-company-outcome" data-soloips-submission="retryable">
          <p className="soloips-company-outcome-copy">
            {t("soloips.company.outcome.unavailable", { operationId: phase.operationId })}
          </p>
          <button
            type="button"
            className="soloips-company-retry"
            onClick={() => {
              actions.retry();
            }}
          >
            {t("soloips.company.action.retry")}
          </button>
          <button
            type="button"
            className="soloips-company-new"
            onClick={() => {
              actions.reset();
            }}
          >
            {t("soloips.company.action.new")}
          </button>
        </div>
      );

    case "failed": {
      const copy = soloipsErrorCopyOf(phase.error);
      return (
        <div className="soloips-company-outcome" data-soloips-submission="failed">
          <p className="soloips-company-outcome-copy">
            {t(SOLOIPS_COMPANY_FAILED_KEY, { operationId: phase.operationId })}
          </p>
          <p className="soloips-company-outcome-code">{t(copy.key, copy.params)}</p>
          <button
            type="button"
            className="soloips-company-retry"
            onClick={() => {
              actions.retry();
            }}
          >
            {t("soloips.company.action.retry")}
          </button>
          {/* 结果可能已部分写入：不提供「新建另一家」（换编号重做会造出第二家）。 */}
        </div>
      );
    }
  }
}

/** 编辑态表单（名称 + 类型 + 「创建…」按钮；编辑仅在 `editing` 相位可用）。 */
function CompanyForm({
  state,
  actions,
  t,
}: {
  readonly state: SoloipsCompanyPanelState;
  readonly actions: SoloipsCompanyPanelActions;
  readonly t: SoloipsPanelTranslate;
}): React.ReactElement | null {
  if (state.phase.kind !== "editing") return null;
  const valid = soloipsCompanyNameIsValid(state.phase.draft.name);
  return (
    <div className="soloips-company-form">
      <label className="soloips-company-form-field">
        {t("soloips.company.form.name.label")}
        <input
          type="text"
          className="soloips-company-form-name"
          value={state.phase.draft.name}
          placeholder={t("soloips.company.form.name.placeholder")}
          onChange={(event) => {
            actions.setName(event.target.value);
          }}
        />
      </label>
      <label className="soloips-company-form-field">
        {t("soloips.company.form.type.label")}
        <select
          className="soloips-company-form-type"
          value={state.phase.draft.type}
          onChange={(event) => {
            actions.setType(
              event.target.value as (typeof SOLOIPS_CLIENT_CREATABLE_COMPANY_TYPES)[number],
            );
          }}
        >
          {SOLOIPS_CLIENT_CREATABLE_COMPANY_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(soloipsCompanyTypeKey(type))}
            </option>
          ))}
        </select>
      </label>
      {!valid ? (
        <p className="soloips-company-form-error">{t("soloips.company.form.name.required")}</p>
      ) : null}
      <button
        type="button"
        className="soloips-company-form-review"
        disabled={!valid}
        onClick={() => {
          actions.beginConfirm();
        }}
      >
        {t("soloips.company.form.review")}
      </button>
    </div>
  );
}

/**
 * 公司面板根组件。
 *
 * @param props - 状态 + 动作 + 翻译函数（由注册点的 `inject` 与 `t` seat 提供）。
 * @returns 面板元素树。
 */
export function SoloipsCompanyPanelView({
  state,
  actions,
  t,
}: SoloipsCompanyPanelProps): React.ReactElement {
  return (
    <div className="soloips-company-panel" data-soloips-phase={state.phase.kind}>
      <h2 className="soloips-company-panel-title">{t("soloips.company.panel.title")}</h2>
      <CompanyList list={state.list} t={t} />
      <CompanyForm state={state} actions={actions} t={t} />
      <SubmissionStatus phase={state.phase} actions={actions} t={t} />
      <button
        type="button"
        className="soloips-company-refresh"
        onClick={() => {
          actions.refresh();
        }}
      >
        {t("soloips.company.action.refresh")}
      </button>
    </div>
  );
}

/**
 * 容器组件：把业务面的订阅接到 React 的渲染周期上。
 *
 * 〔为什么订阅用 `useSyncExternalStore`〕它是 React 18 对「外部可观察源」的
 * **唯一**正确原语：`getSnapshot` 必须返回**引用稳定**的值（本面板的状态对象在
 * 每次 `#set` 时才更换引用），否则会无限重渲染。手写 `useEffect` + `useState`
 * 会在并发渲染下撕裂（读到与渲染不一致的快照）。
 *
 * 〔为什么容器与视图分开〕视图是**纯函数**（同 props 同输出，可直接断言），
 * 容器是唯一接触 hook 的地方。测试可以只渲染视图（`tests/company-panel.spec.ts`
 * 的 `renderToStaticMarkup` 用法），无需模拟浏览器环境。
 *
 * @param props - 业务面实例 + 翻译函数。
 * @returns 面板元素树。
 */
export function SoloipsCompanyPanelContainer({
  panel,
  t,
}: {
  readonly panel: SoloipsCompanyPanel;
  readonly t: SoloipsPanelTranslate;
}): React.ReactElement {
  const state = useSyncExternalStore(
    (listener) => panel.subscribe(listener),
    () => panel.getSnapshot(),
  );
  return <SoloipsCompanyPanelView state={state} actions={panel.actions} t={t} />;
}
