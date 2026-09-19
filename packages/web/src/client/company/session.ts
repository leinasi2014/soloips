/**
 * SOLOIPS-WEB-CLIENT-COMPANY-SESSION
 *
 * 公司面板的**提交会话状态机**（纯函数，无 React、无 cordis、无 IO）。
 *
 * ── 为什么把它单独成模块（而不是散在组件里）────────────────────────────────
 * 本模块承载两条**契约级不变量**，它们都是「界面行为」而非「渲染细节」，
 * 因此必须能在**不挂载浏览器、不模拟点击**的条件下被逐条钉住：
 *
 *  1. **`operationId` 的铸造点唯一**（ORG-05 / DEV-08）：
 *     `submitting` 是唯一持有**新**编号的相位，且只由 `submit/confirm` 从
 *     `confirming` 进入。其余任何事件都**不产生新编号**——重试（`submit/retry`）
 *     逐字复用 `reconcile`/`retryable`/`failed` 里存着的那个编号。
 *  2. **`unknown` 不得换 ID 重做**（`data-contract.md` §2.5.1 裁定三 / ORG-05）：
 *     结果为 `unknown` 时进入 `reconcile` 相位，该相位**拒绝**
 *     `submission/reset`（用户不能靠「清空重来」换掉编号），且 settle 本身
 *     **不产生任何 effect**——不存在「自动重提」这条代码路径。
 *
 * ── 与 core 语义的对应（不是本模块发明的）─────────────────────────────────
 *
 * | core 的 `status` | 本状态机的相位 | 依据 |
 * |---|---|---|
 * | `committed` | `settled` | 本次实际提交，事实已落盘 |
 * | `replayed` | `settled` | 同 `operationId` 命中已提交结果（幂等，未新建） |
 * | `refused` | `settled` | 配额拒绝：**意图落盘之前**返回，零业务写、零未决意图（`core/src/store.ts` 的 `#commitLocked` 顺序契约），故用户可改草稿后**新起一次**提交 |
 * | `unavailable` | `retryable` | Host 装配态：`createCompany` 在调用 core **之前**返回（`src/index.ts` 的 `coreUnavailable()`），零业务写。重试**复用同一编号**——比换新编号更保守，且同编号重放对未落盘的编号就是一次全新提交 |
 * | `unknown` | `reconcile` | 该 `operationId` 存在未决意图，结果不可知；**不得换 ID 重做** |
 * | 抛错（`RemoteError`） | `failed` | 未归类失败。**同样不换编号**：`SOLOIPS_CORE_LEASE_*` 可能在意图已落盘、乃至业务已部分写入之后才发生（F-02），此时换编号重做正是要禁止的行为 |
 *
 * 〔为什么 `unavailable` 与 `unknown` 分成两个相位〕两者的**可行动指引不同**：
 * `unavailable` 是「服务还没就绪，重试即可」，`unknown` 是「结果未知，先核对」。
 * 合并成一个相位会让界面无法给出正确指引，也会让「不得换 ID」这条纪律在
 * 不该适用的地方生效。
 *
 * 〔为什么 `refused` 归 `settled` 而不是 `retryable`〕配额拒绝在**意图落盘之前**
 * 返回，因此该 `operationId` 名下**没有任何记录**——用户改完草稿后新起一次提交
 * 是安全的。但它仍是**终态**（不是「重试」），因为重试同一草稿只会再被拒一次；
 * 界面据此显示「调整后重新提交」而不是「重试」。
 */

import type { SoloipsCompanyType, SoloipsOperationId } from "soloips-core/contracts";
import type {
  SoloipsWebCreateCompanyInput,
  SoloipsWebCreateCompanyOutcome,
} from "soloips-web/contracts";

/** 表单草稿：界面可编辑的两项（`type` 见 {@link SOLOIPS_CLIENT_CREATABLE_COMPANY_TYPES}）。 */
export interface SoloipsCompanyDraft {
  readonly name: string;
  /** 公司类型；M-A 只有 `enterprise` 可从本入口创建（见 {@link SOLOIPS_CLIENT_CREATABLE_COMPANY_TYPES}）。 */
  readonly type: SoloipsCompanyType;
}

/**
 * 本入口**可创建**的公司类型（M-A 最小集）。
 *
 * 〔为什么只有一个值而不是四个〕core 对普通入口的判定是**显式拒绝**
 * `platform`/`operation`（`SOLOIPS_CORE_VALIDATION`：该入口根本不提供这个动作，
 * 官方公司初始化不属 S0）；`subsidiary` 必须携带 `parentCompanyId`，而公司树选择
 * 交互属 FE-2。故 M-A 的表单只开放 `enterprise`——**把不可选项列出来再让 core
 * 拒绝**会把「入口不存在」伪装成「参数错误」，用户拿到的指引也不同。
 *
 * 〔约束〕这是**界面**的能力面，不是契约面：`SoloipsCompanyType` 的四个值仍全部
 * 可出现在读回的公司树里，类型标签映射（`i18n/company-panel.ts`）对四值**穷举**。
 */
export const SOLOIPS_CLIENT_CREATABLE_COMPANY_TYPES = ["enterprise"] as const;

/** 空草稿（`enterprise` 为缺省类型，`data-contract.md` §2.6 的默认值）。 */
export const SOLOIPS_EMPTY_COMPANY_DRAFT: SoloipsCompanyDraft = { name: "", type: "enterprise" };

/**
 * 提交会话的相位。
 *
 * 〔不变量〕除 `submitting` 外任何相位**不携带新铸造的编号**；`submitting` 的
 * `operationId` 要么来自 `submit/confirm`（铸造点），要么逐字来自被重试的相位。
 */
export type SoloipsCompanySubmissionPhase =
  | { readonly kind: "editing"; readonly draft: SoloipsCompanyDraft }
  | { readonly kind: "confirming"; readonly draft: SoloipsCompanyDraft }
  | {
      readonly kind: "submitting";
      readonly draft: SoloipsCompanyDraft;
      readonly operationId: SoloipsOperationId;
      /** 本次是重试（true）还是首次提交（false）——仅用于界面措辞，不影响编号。 */
      readonly retry: boolean;
    }
  | {
      readonly kind: "settled";
      readonly draft: SoloipsCompanyDraft;
      readonly operationId: SoloipsOperationId;
      readonly outcome: SoloipsWebCreateCompanyOutcome;
    }
  /** `unknown`：未决意图，结果未知，**同一编号**保留（ORG-05）。 */
  | {
      readonly kind: "reconcile";
      readonly draft: SoloipsCompanyDraft;
      readonly operationId: SoloipsOperationId;
    }
  /** `unavailable`：Host 装配态，零业务写，**同一编号**重试。 */
  | {
      readonly kind: "retryable";
      readonly draft: SoloipsCompanyDraft;
      readonly operationId: SoloipsOperationId;
    }
  /** 抛错（含 core 稳定码）：结果可能已部分生效，**同一编号**重试或等待核对。 */
  | {
      readonly kind: "failed";
      readonly draft: SoloipsCompanyDraft;
      readonly operationId: SoloipsOperationId;
      readonly error: unknown;
    };

/** 状态机对外的副作用声明（由容器执行；纯函数不发起任何 IO）。 */
export type SoloipsCompanyPanelEffect =
  | { readonly kind: "none" }
  | {
      readonly kind: "create";
      readonly operationId: SoloipsOperationId;
      readonly input: SoloipsWebCreateCompanyInput;
    };

/** 状态机事件。 */
export type SoloipsCompanyPanelEvent =
  | { readonly kind: "draft/name"; readonly name: string }
  | { readonly kind: "draft/type"; readonly type: SoloipsCompanyDraft["type"] }
  | { readonly kind: "confirm/begin" }
  | { readonly kind: "confirm/cancel" }
  | { readonly kind: "submit/confirm"; readonly operationId: SoloipsOperationId }
  | { readonly kind: "submit/retry" }
  | { readonly kind: "submit/settled"; readonly outcome: SoloipsWebCreateCompanyOutcome }
  | { readonly kind: "submit/rejected"; readonly error: unknown }
  | { readonly kind: "submission/reset" };

/** 状态机的返回：新状态 + 待执行副作用 + 事件是否被接受。 */
export interface SoloipsCompanyPanelStep {
  readonly phase: SoloipsCompanySubmissionPhase;
  readonly effect: SoloipsCompanyPanelEffect;
  /**
   * 事件是否被本相位接受。
   *
   * 〔为什么显式返回它〕非法转换**不抛错**（抛错会让界面白屏），但也不能静默
   * ——静默会让「有人给按钮接错事件」这类缺陷表现为「点了没反应」。显式返回
   * 使调用方与测试都能区分「按设计忽略」与「状态机没走到」。
   */
  readonly accepted: boolean;
}

/** 会话初始状态。 */
export function soloipsInitialSubmissionPhase(): SoloipsCompanySubmissionPhase {
  return { kind: "editing", draft: SOLOIPS_EMPTY_COMPANY_DRAFT };
}

/** 名称是否可提交（与 core 的 `requireNonEmpty` 同判据：`trim()` 后非空）。 */
export function soloipsCompanyNameIsValid(name: string): boolean {
  return name.trim().length > 0;
}

/**
 * 草稿 → 命令载荷（**唯一**的载荷构造点）。
 *
 * 〔约束〕载荷**不含账户标识字段**：它来自部署注入（`data-contract.md` §2.5.1
 * 裁定四），调用方在类型层就**无法表达**「以某个账户执行」。本函数逐字段白名单
 * 重建载荷（不展开草稿对象），与 Host 半边 `createCompany` 的做法同向。
 *
 * 〔本条注释为何刻意不写该字段的字面名〕构建期的产物契约门把该名字列为浏览器
 * 产物**禁止标识**（字节子串匹配，`tsdown.config.ts` 的 `FORBIDDEN_CLIENT_MARKERS`），
 * 而 rolldown **保留源码注释**——把字面名写进注释会让构建失败（**实测**：
 * 首次构建即被该门拦下）。判据是字节，不是语义，故注释也必须避开。
 */
export function soloipsCompanyCreateInput(
  draft: SoloipsCompanyDraft,
  operationId: SoloipsOperationId,
): SoloipsWebCreateCompanyInput {
  return { operationId, name: draft.name.trim(), type: draft.type };
}

/** 忽略事件：状态不变、无副作用。 */
function ignored(phase: SoloipsCompanySubmissionPhase): SoloipsCompanyPanelStep {
  return { phase, effect: { kind: "none" }, accepted: false };
}

/**
 * 状态机的一步。
 *
 * @param phase - 当前相位。
 * @param event - 事件。
 * @returns 新相位、副作用与「是否接受」。
 */
export function soloipsCompanyPanelStep(
  phase: SoloipsCompanySubmissionPhase,
  event: SoloipsCompanyPanelEvent,
): SoloipsCompanyPanelStep {
  switch (event.kind) {
    case "draft/name":
      if (phase.kind !== "editing") return ignored(phase);
      return {
        phase: { kind: "editing", draft: { ...phase.draft, name: event.name } },
        effect: { kind: "none" },
        accepted: true,
      };

    case "draft/type":
      if (phase.kind !== "editing") return ignored(phase);
      return {
        phase: { kind: "editing", draft: { ...phase.draft, type: event.type } },
        effect: { kind: "none" },
        accepted: true,
      };

    // ── 显式确认步骤：进入确认**不写任何东西**（无 create effect）──────────────
    case "confirm/begin":
      if (phase.kind !== "editing") return ignored(phase);
      if (!soloipsCompanyNameIsValid(phase.draft.name)) return ignored(phase);
      return {
        phase: { kind: "confirming", draft: phase.draft },
        effect: { kind: "none" },
        accepted: true,
      };

    case "confirm/cancel":
      if (phase.kind !== "confirming") return ignored(phase);
      return {
        phase: { kind: "editing", draft: phase.draft },
        effect: { kind: "none" },
        accepted: true,
      };

    // ── 唯一的编号铸造点与唯一的写入口 ────────────────────────────────────────
    case "submit/confirm":
      if (phase.kind !== "confirming") return ignored(phase);
      return {
        phase: {
          kind: "submitting",
          draft: phase.draft,
          operationId: event.operationId,
          retry: false,
        },
        effect: {
          kind: "create",
          operationId: event.operationId,
          input: soloipsCompanyCreateInput(phase.draft, event.operationId),
        },
        accepted: true,
      };

    // ── 重试：**逐字复用**已存编号，绝不铸造新编号 ────────────────────────────
    case "submit/retry": {
      if (phase.kind !== "reconcile" && phase.kind !== "retryable" && phase.kind !== "failed") {
        return ignored(phase);
      }
      const operationId = phase.operationId;
      return {
        phase: { kind: "submitting", draft: phase.draft, operationId, retry: true },
        effect: {
          kind: "create",
          operationId,
          input: soloipsCompanyCreateInput(phase.draft, operationId),
        },
        accepted: true,
      };
    }

    case "submit/settled": {
      if (phase.kind !== "submitting") return ignored(phase);
      const { draft, operationId } = phase;
      // 〔settle 不产生任何 effect〕这正是「`unknown` 不自动重提」的机械落点：
      // 没有任何一条 settle 分支能发起第二次调用。
      if (event.outcome.status === "unknown") {
        return {
          phase: { kind: "reconcile", draft, operationId },
          effect: { kind: "none" },
          accepted: true,
        };
      }
      if (event.outcome.status === "unavailable") {
        return {
          phase: { kind: "retryable", draft, operationId },
          effect: { kind: "none" },
          accepted: true,
        };
      }
      return {
        phase: { kind: "settled", draft, operationId, outcome: event.outcome },
        effect: { kind: "none" },
        accepted: true,
      };
    }

    case "submit/rejected": {
      if (phase.kind !== "submitting") return ignored(phase);
      return {
        phase: {
          kind: "failed",
          draft: phase.draft,
          operationId: phase.operationId,
          error: event.error,
        },
        effect: { kind: "none" },
        accepted: true,
      };
    }

    // ── 「清空重来」在未决相位被**拒绝**（否则它会成为换 ID 的后门）──────────
    case "submission/reset": {
      if (phase.kind !== "settled" && phase.kind !== "retryable") return ignored(phase);
      return {
        phase: { kind: "editing", draft: SOLOIPS_EMPTY_COMPANY_DRAFT },
        effect: { kind: "none" },
        accepted: true,
      };
    }
  }
}

/**
 * 铸造一个浏览器侧 `operationId`。
 *
 * 〔为什么这里有一处品牌断言（DEV-05 的唯一断言点纪律在 web 半边的对应物）〕
 * core 的受控工厂 `newOperationId` 位于 `packages/core/src/ids.ts`，**不在**
 * `soloips-core/contracts` 的导出面内，且它依赖 `node:crypto`（浏览器半边
 * 不得触达 Node 内置模块——`clientBundlePurityGate` 会直接构建失败）。因此浏览器
 * 只能自造一个普通字符串再收窄。形状判据**逐字取自 core**
 * （`ids.ts:isOperationIdShape`：`trim()` 后非空且长度 ≤ 256），此处不做第二份
 * 口径——超出该形状的值由 core 以 `SOLOIPS_CORE_VALIDATION` 拒绝。
 *
 * 〔为什么用 `crypto.randomUUID()`〕Web Crypto 的随机 UUID 在页面上下文里可用，
 * 且不需要任何依赖；`crypto` 是 DOM lib 的全局，不引入 Node 面。
 *
 * @returns 形状合法的 `operationId`（品牌收窄发生在本函数内，且仅此一处）。
 */
export function newSoloipsClientOperationId(): SoloipsOperationId {
  const raw = `web-${crypto.randomUUID()}`;
  if (raw.trim().length === 0 || raw.length > 256) {
    // 不可达（UUID 的定长前缀恒满足），但保留显式失败：形状判据是**契约**，
    // 不能靠「实现恰好满足」来成立。
    throw new Error("soloips-web/client: 生成的 operationId 形状不合法（内部缺陷）");
  }
  return raw as SoloipsOperationId;
}
