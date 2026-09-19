/**
 * SOLOIPS-WEB-CLIENT-COMPANY-SURFACE
 *
 * 浏览器半边的**公司面板业务面**（React 无关）：把「读公司 / 写公司」收敛成一个
 * 可被组件订阅的源，并把两件事**显式分开**：
 *
 *  1. **读状态**（{@link SoloipsCompanyListView}）：`ok` / `not-found` / `unavailable`
 *     三态 + 「尚无树根」+ 「读取中」+ 「读取抛错」。六者**互不可代替**——尤其
 *     `unavailable`（服务未就绪）**不得**显示成空数据（`data-contract.md` §2.5.1
 *     裁定三）。
 *  2. **提交会话**（`./session.js` 的状态机 + 本模块的驱动）：写动作的相位、
 *     `operationId` 与副作用执行。
 *
 * ── 为什么业务面不放在 React 组件里 ─────────────────────────────────────────
 * 两条验收（「`unknown` 保留同一 operationId、禁止自动重提」「`unavailable` 与空数据
 * 可区分」）都是**业务面**的性质，不是渲染的性质。把它们放进组件会迫使测试驱动
 * DOM 才能断言，而本仓不引入浏览器测试框架（见切片「不做」清单）。分成
 * 「业务面（本文件，纯对象 + 订阅）/ 视图（`CompanyPanel.tsx`，薄渲染）」后，
 * 两条性质可在 Node 下直接钉住（`tests/company-panel.spec.ts`）。
 *
 * ── 树根从哪来（M-A 的取值事实）────────────────────────────────────────────
 * core 的读面**没有**「列出我的全部公司」：`getCompanyTree` 需要一个 `companyId`
 * 作根，`getCompany` 需要具体 id。而 M-A 的入口只创建**顶层用户公司**
 * （`enterprise`，无 `parentCompanyId`），它的 id 只在创建成功后才知道。
 *
 * 故本面板的树根 = 「本会话内首次成功创建得到的 `companyId`」：
 *  - **尚未创建过** → 读状态是 `no-root`（**不猜**任何 id）；
 *  - 创建成功（`committed`/`replayed`）→ 记下 id 并立即刷新，列表显示该公司。
 *
 * 〔为什么「未创建」不渲染成 `not-found`〕猜一个不存在的 id 会让 core 返回
 * `not-found`，把「还没建」误导成「编号错了」——两者对用户的含义与下一步动作
 * 完全不同。故 `no-root` 是独立状态。
 *
 * 〔为什么不持久化根 id〕浏览器半边**零可写业务状态**（ARCH-D02）；跨会话记住
 * 根需要 Host 侧持久化或 core 的新读面，属 FE-2 范围。本片不落任何浏览器侧持久化。
 *
 * ── 与 Remote 的关系（唯一的跨线入口）──────────────────────────────────────
 * 本模块经**结构声明**消费本包的 Remote namespace 服务（{@link SoloipsRemoteSurface}，
 * 经 `ctx.get("remote.soloips")` 取得——见该类型的注释），
 * 不 import 官方 gateway 包（DEV-04 的依赖面禁令）。调用的结果形状是
 * `RemoteResult<T>`（`{ok:true,value} | {ok:false,error}`），类型来自
 * `@deepseek-ai/dsh-typert-protocol` 的类型面——它是生成物的运行时依赖，故不引入
 * 新依赖面。
 *
 * ── 身份边界（不变量）──────────────────────────────────────────────────────
 * 本模块的**任何**输入与状态里都不存在账户标识字段：读回的公司是
 * `SoloipsWebCompanyView`（Host 半边从 core 记录上**剥离**该字段后的投影），创建
 * 载荷是 `SoloipsWebCreateCompanyInput`（core 的同名类型也不含它）。界面**无法
 * 表达**「以某个账户执行」——不是「传了被忽略」，而是该字段在类型上不存在
 * （`data-contract.md` §2.5.1 裁定四）。
 *
 * 〔本条注释为何刻意不写该字段的字面名〕见 `./session.js` 的同名说明：构建期的
 * 产物契约门按**字节子串**匹配，而 rolldown 保留源码注释——字面名出现在注释里
 * 同样会让构建失败（实测）。
 */

import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import type {
  SoloipsCompanyId,
  SoloipsCompanyType,
  SoloipsOperationId,
} from "soloips-core/contracts";
import type {
  SoloipsWebCompanyRead,
  SoloipsWebCompanyTreeRead,
  SoloipsWebCompanyView,
  SoloipsWebCreateCompanyInput,
  SoloipsWebCreateCompanyOutcome,
} from "soloips-web/contracts";

import {
  newSoloipsClientOperationId,
  soloipsCompanyPanelStep,
  soloipsInitialSubmissionPhase,
  type SoloipsCompanyPanelEvent,
  type SoloipsCompanySubmissionPhase,
} from "./session.js";

/**
 * 浏览器侧 Remote 调用面 = 本包 Host 半边生成的 **namespace 服务**（`soloips`）。
 *
 * 〔为什么**没有**外层 `soloips` 键（实测纠正）〕本包经 `ctx.get("remote.soloips")`
 * 取得该服务——cordis 的**点分服务键**直查 store，返回的就是 namespace 服务本身
 * （`api-gateway/client` 的 `remoteServiceKey(namespace)` = `` `remote.${namespace}` ``，
 * 服务实例即 `RemoteNamespaceService`）。因此方法直接挂在这一层。
 *
 * 〔首版的错位〕首版按 `ctx.remote.soloips.createCompany` 的**属性路径**建模，写成
 * `{ soloips: { … } }`。那条路径在 `ctx.remote` 上成立（属性访问逐级解析），但
 * `ctx.get` 是**整串键**查询——两者不是同一种取值方式。**实测**：混用导致
 * `Cannot read properties of undefined (reading 'createCompany')`（服务本身被当成
 * 了容器）。现在统一为「`ctx.get` 取 namespace 服务」，类型与取值方式一致。
 *
 * 〔约束〕**结构声明**，不 import 官方 gateway 包：`ctx.remote` 的提供者是
 * `@deepseek-ai/dsh-api-gateway/client`，它不在本包依赖面内（DEV-04：非 adapter
 * 包不得依赖官方能力包）。方法签名逐字取自生成的
 * `lib/typert.remote-client.d.ts`（`TypertRemoteNamespaceMap['soloips']`），
 * 差异会在类型层立即失配——而不是靠手抄一份会漂移的副本。
 *
 * 〔为什么这里是安全的（与 `src/client/index.ts` 的纪律不冲突）〕那条纪律禁止的是
 * 声明 `@deepseek-ai/cordis` 的 `Context` 增强（会被 Typert 生成器读作本包贡献的
 * 服务面）。本类型不是模块增强，只是本地结构类型。
 */
export interface SoloipsRemoteSurface {
  createCompany(
    input: SoloipsWebCreateCompanyInput,
  ): Promise<RemoteResult<SoloipsWebCreateCompanyOutcome>>;
  getCompany(input: {
    readonly companyId: SoloipsCompanyId;
  }): Promise<RemoteResult<SoloipsWebCompanyRead>>;
  getCompanyTree(input: {
    readonly companyId: SoloipsCompanyId;
  }): Promise<RemoteResult<SoloipsWebCompanyTreeRead>>;
}

/**
 * 读公司列表的**结果状态**（六态；每态有独立的界面呈现与文案键）。
 *
 * 〔`no-root` 与 `not-found` 与 `empty` 三者的区别〕
 *  - `no-root`：本会话还没有树根（尚未创建过公司）——**没有发出任何读请求**；
 *  - `not-found`：发出了读请求，查询成功，但**根公司不存在**；
 *  - `ok` + 空数组：发出了读请求，查询成功，根存在但**没有下级公司**。
 * 三者对用户的含义与下一步动作都不同，故不合并。
 *
 * 〔为什么 `not-found` 存在而不是被 `ok` 空数组吸收〕`getCompanyTree` 对不存在的
 * 根也返回 `[]`（`core/src/store.ts:2822` 的 `if (!idMap.has(companyId)) return []`），
 * 故必须**先**读根（`getCompany`）才能区分——见 {@link loadSoloipsCompanyList}。
 */
export type SoloipsCompanyListView =
  | { readonly kind: "no-root" }
  | { readonly kind: "loading" }
  | { readonly kind: "ok"; readonly companies: readonly SoloipsWebCompanyView[] }
  /** 查询成功但**根公司不存在**（与「空树」不同）。 */
  | { readonly kind: "not-found" }
  /** 业务服务未就绪——**不得**渲染成空列表。 */
  | { readonly kind: "unavailable" }
  /** 读取抛错（`RemoteError` 或未归类失败）。 */
  | { readonly kind: "failed"; readonly error: unknown };

/** 面板的完整可观察状态。 */
export interface SoloipsCompanyPanelState {
  readonly list: SoloipsCompanyListView;
  readonly phase: SoloipsCompanySubmissionPhase;
}

/** 订阅者回调。 */
export type SoloipsCompanyPanelListener = () => void;

/** 面板的可执行动作（视图只依赖这个面，不接触 Remote）。 */
export interface SoloipsCompanyPanelActions {
  /** 刷新公司列表（读操作，不产生 operation）。 */
  refresh(): void;
  /** 编辑草稿：公司名。 */
  setName(name: string): void;
  /** 编辑草稿：公司类型。 */
  setType(type: SoloipsCompanyType): void;
  /** 进入确认步骤（**不写任何数据**）。 */
  beginConfirm(): void;
  /** 取消确认，回到编辑。 */
  cancelConfirm(): void;
  /**
   * 确认创建（唯一的写入口）。
   *
   * 〔`operationId` 由调用方传入，不由本方法铸造〕这样「谁铸造编号」在代码里
   * 是一处可见的调用点（`CompanyPanel.tsx` 的确认按钮），而不是散在业务面内部。
   * 编号经 {@link SoloipsCompanyPanelActions.newOperationId} 取得，且**只在确认
   * 按钮的点击处理器里被调用一次**：随后它存在 `submitting` 相位里，重试逐字复用。
   */
  confirm(operationId: SoloipsOperationId): void;
  /**
   * 铸造一个新的 `operationId`（**唯一**的编号铸造入口）。
   *
   * 〔为什么放在动作面上而不是让视图 import 工厂〕视图不该知道编号从哪来；把铸造
   * 收进业务面使「编号的唯一来源」在模块图上是一处，且测试可注入确定性编号。
   */
  newOperationId(): SoloipsOperationId;
  /** 重试（**同一** `operationId`，绝不铸造新编号）。 */
  retry(): void;
  /** 清空表单开始新一次创建（仅在终态可用）。 */
  reset(): void;
}

/**
 * 驱动「读公司列表」的一次调用。
 *
 * 〔为什么先读根、再读树〕见 {@link SoloipsCompanyListView} 的注释：`getCompanyTree`
 * 的空数组**不区分**根不存在与无下级（core 的既有语义，本包不改写）。要区分就
 * 必须先读根。
 *
 * @param remote - 浏览器侧 Remote 面。
 * @param rootId - 树根公司 id。
 * @returns 读状态（永不抛错：失败折叠为 `failed`/`unavailable` 两个可渲染的臂）。
 */
export async function loadSoloipsCompanyList(
  remote: SoloipsRemoteSurface,
  rootId: SoloipsCompanyId,
): Promise<SoloipsCompanyListView> {
  const rootRead = await remote.getCompany({ companyId: rootId });
  if (!rootRead.ok) return { kind: "failed", error: rootRead.error };
  if (rootRead.value.status === "unavailable") return { kind: "unavailable" };
  if (rootRead.value.status === "not-found") return { kind: "not-found" };

  const treeRead = await remote.getCompanyTree({ companyId: rootId });
  if (!treeRead.ok) return { kind: "failed", error: treeRead.error };
  if (treeRead.value.status === "unavailable") return { kind: "unavailable" };
  return { kind: "ok", companies: treeRead.value.companies };
}

/**
 * 公司面板的业务面：状态 + 订阅 + 动作。
 *
 * 〔不变量：`unknown` 后不自动重提〕`submit/settled` 的结果为 `unknown` 时，状态机
 * 进入 `reconcile` 相位且**不产生任何副作用**（`session.js` 的 `submit/settled`
 * 分支没有 `create` effect）。本类只执行状态机返回的 effect——因此「自动重提」在
 * 本实现里**没有代码路径**，不是靠约定禁止。
 */
export class SoloipsCompanyPanel {
  readonly #remote: SoloipsRemoteSurface;
  readonly #listeners = new Set<SoloipsCompanyPanelListener>();
  /** 每次读操作的世代号：晚到的响应不得覆盖新一轮的结果（防乱序）。 */
  #readGeneration = 0;
  /** 本会话已知的树根；`undefined` = 尚未创建过公司（见文件头「树根从哪来」）。 */
  #rootId: SoloipsCompanyId | undefined;
  #state: SoloipsCompanyPanelState;

  /**
   * @param remote - 浏览器侧 Remote 面。
   * @param rootId - 已知的树根（缺省 `undefined`：本会话尚未创建过公司）。
   */
  constructor(remote: SoloipsRemoteSurface, rootId?: SoloipsCompanyId) {
    this.#remote = remote;
    this.#rootId = rootId;
    this.#state = {
      list: rootId === undefined ? { kind: "no-root" } : { kind: "loading" },
      phase: soloipsInitialSubmissionPhase(),
    };
    if (rootId !== undefined) this.#refresh();
  }

  /** 当前快照（供 `useSyncExternalStore` 的 getSnapshot）。 */
  getSnapshot(): SoloipsCompanyPanelState {
    return this.#state;
  }

  /**
   * 订阅状态变化。
   *
   * @param listener - 变化回调。
   * @returns 取消订阅。
   */
  subscribe(listener: SoloipsCompanyPanelListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** 可执行动作面（稳定引用：视图可安全地把它传给子组件）。 */
  readonly actions: SoloipsCompanyPanelActions = {
    refresh: () => {
      this.#refresh();
    },
    setName: (name) => {
      this.#dispatch({ kind: "draft/name", name });
    },
    setType: (type) => {
      this.#dispatch({ kind: "draft/type", type });
    },
    beginConfirm: () => {
      this.#dispatch({ kind: "confirm/begin" });
    },
    cancelConfirm: () => {
      this.#dispatch({ kind: "confirm/cancel" });
    },
    confirm: (operationId) => {
      this.#dispatch({ kind: "submit/confirm", operationId });
    },
    newOperationId: () => newSoloipsClientOperationId(),
    retry: () => {
      this.#dispatch({ kind: "submit/retry" });
    },
    reset: () => {
      this.#dispatch({ kind: "submission/reset" });
    },
  };

  /** 发起一次列表读取（幂等：重复调用只保留最后一次的世代号）。 */
  #refresh(): void {
    const rootId = this.#rootId;
    if (rootId === undefined) {
      // 〔不猜 id〕尚无树根时不发请求，直接呈现 `no-root`。
      this.#set({ ...this.#state, list: { kind: "no-root" } });
      return;
    }
    const generation = (this.#readGeneration += 1);
    this.#set({ ...this.#state, list: { kind: "loading" } });
    void loadSoloipsCompanyList(this.#remote, rootId).then(
      (list) => {
        if (generation !== this.#readGeneration) return;
        this.#set({ ...this.#state, list });
      },
      (error: unknown) => {
        if (generation !== this.#readGeneration) return;
        this.#set({ ...this.#state, list: { kind: "failed", error } });
      },
    );
  }

  /** 派发一个事件；按状态机的返回执行副作用。 */
  #dispatch(event: SoloipsCompanyPanelEvent): void {
    const step = soloipsCompanyPanelStep(this.#state.phase, event);
    if (!step.accepted) return;
    this.#set({ ...this.#state, phase: step.phase });
    if (step.effect.kind !== "create") return;
    void this.#executeCreate(step.effect.input);
  }

  /**
   * 执行一次创建调用，并把结果送回状态机。
   *
   * 〔失败语义〕调用本身抛错（未归类失败）与 `RemoteResult` 的错误臂都由
   * `submit/rejected` 承接——状态机据此进入 `failed` 相位，**保留同一编号**。
   * `RemoteResult` 的错误臂（`ok:false`）是 gateway 层的失败
   * （`gateway/internal` 等），不是业务结果，故与抛错同路。
   */
  async #executeCreate(input: SoloipsWebCreateCompanyInput): Promise<void> {
    try {
      const result = await this.#remote.createCompany(input);
      if (!result.ok) {
        this.#dispatch({ kind: "submit/rejected", error: result.error });
        return;
      }
      this.#dispatch({ kind: "submit/settled", outcome: result.value });
      // 〔成功即确定树根〕`committed`/`replayed` 都带回 `companyId`（重放返回的是
      // **原**公司 id，`core/src/commit-gate.ts:305`），两者都可用于读回。
      if (result.value.status === "committed" || result.value.status === "replayed") {
        this.#rootId = result.value.result.companyId;
        this.#refresh();
      }
    } catch (error: unknown) {
      this.#dispatch({ kind: "submit/rejected", error });
    }
  }

  #set(next: SoloipsCompanyPanelState): void {
    this.#state = next;
    for (const listener of this.#listeners) listener();
  }
}
