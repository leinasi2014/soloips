/**
 * SOLOIPS-WEB-CLIENT-COMPANY-REGISTER
 *
 * 公司面板**挂进官方 UI 槽位**的接线（浏览器半边）。
 *
 * ── 注册形态：**成对**注册（实测纠正）──────────────────────────────────────
 *
 * 侧栏的面板导航由**两个**槽位协作（`ui-sidebar/src/client/SidebarRoot.tsx:52-77`）：
 *
 * | 槽位 | kind | 放什么 | 谁点击 |
 * |---|---|---|---|
 * | `sidebar.panellist` | `list` | **图标字形**（16/18px，`owner: {size, active}`） | 行的 `onClick` 调 `ctx.layout.selectPanel(id)` |
 * | `main` | `keyed` | 面板**本体**（按侧栏条目的 `id` 作 key 选中） | 由 `AppFrame` 的 `MainPanel` 按 `activePanelId` 渲染 |
 *
 * 因此「面板可见」必须**两处都注册且 id 同名**。首版只注册了
 * `sidebar.panellist` 并把整块面板放进去，浏览器实测暴露两处错位：
 *  1. 面板被压进 16px 的图标格（页面截图里只剩被裁掉的一行）；
 *  2. 点击该行触发 `LayoutController.selectPanel('soloips-company')`，而 `main`
 *     里没有同 key 的面板 → **抛错**
 *     （`layout.selectPanel: main panel "…" is not registered`，实测于页面
 *     异常记录）。这是本片「面板可见、可点着创建公司」验收的直接反例。
 *
 * ── 注册范式（逐条对照官方 `ui-brand-official` 的实证写法）──────────────────
 *
 * ```ts
 * ctx.slots.inject('<slot>', () => ctx.slots.register({ name: '<slot>', … }, Component))
 * ```
 *
 * `slots.inject(key, callback)` 的语义（`ui-renderer/src/client/registry.ts:172-232`）：
 * 回调在**该槽位被声明时**运行一次，并在声明塌缩时被撤销。两个槽位分别由
 * `ui-sidebar` 的 `sidebar` 条目与 `ui-layout` 的 `root` 条目声明，因此本包不需要
 * （也**不得**）自己声明它们——重复声明会抛 `slot "…" is already declared`
 * （`ui-slots/src/index.ts` 的 `SlotCore.register`）。用 `inject` 而非直接
 * `register` 还保证：本包先于这两个包加载时不会抛错，而是等声明到来。
 *
 * ── 为什么是这两个槽位（不是别的）──────────────────────────────────────────
 * `sidebar.brand.mark`/`sidebar.brand.name`/`sidebar.workspaces`/`sidebar.settings`
 * 都是 `kind: 'single'`——注册即**替换**官方占位（`ui-sidebar` 的 `children` 表），
 * 会遮蔽导航列的既有部分。`sidebar.panellist` 是 `list`：追加式，官方行为不受影响。
 * **`root` 是明确禁区**：它是 single 槽位且被 `ui-layout` 的 AppFrame 占据，
 * 注册会遮蔽整个框架（`ui-renderer` 的 SlotMap 声明里逐字警告）。
 * `main` 是 `keyed`：新 key 与官方的 `conversation` 并列，互不遮蔽。
 *
 * ── 面板实例与条目生命周期的对应（为什么在回调内 new）──────────────────────
 * `slots.register` 的条目在其**声明存活期内**存在；声明塌缩（如 `ui-sidebar`
 * 被卸载后重新加载）会撤销条目，随后的新声明会**再次调用** `inject` 的回调。
 * 因此面板实例在回调内创建、由组件闭包持有——与条目的生命周期一一对应。
 * 在回调外持一个模块级单例会跨声明存活期泄漏订阅者（旧实例的订阅者永不解绑）。
 *
 * 〔面板实例只建一次、两个条目共用〕图标条目**不需要**面板实例；面板条目需要。
 * 若两个回调各建一个实例，会产生两份独立的提交会话状态（用户在建图标格里填的
 * 草稿与面板里的不是同一份）。故实例建在 `main` 的 inject 回调里，图标回调
 * 只用静态字形。
 *
 * ── 依赖面（与 `./index.js` 的既有纪律一致）────────────────────────────────
 * 本模块只消费 cordis 服务（`slots`、`locale`、`remote`）与**结构类型**，不
 * import 官方能力包（DEV-04）。`ctx.remote.soloips.*` 经结构声明消费
 * （`./surface.js` 的 `SoloipsRemoteSurface`），与 `./index.js` 用结构声明消费
 * `ctx.remote.$mount` 的做法同形。
 */

import type { Context } from "@deepseek-ai/cordis";
import type {
  LocaleNamespaceMap,
  SlotLabel,
  SlotMap,
  Translate,
} from "@deepseek-ai/dsh-client-ui-slots";

import { SOLOIPS_LOCALE_NAMESPACE, en, zh } from "../locales/index.js";
import type { SoloipsLocaleKey } from "../locales/index.js";
import { SoloipsCompanyIcon } from "./CompanyIcon.js";
import { SoloipsCompanyPanelContainer, type SoloipsPanelTranslate } from "./CompanyPanel.js";
import { SoloipsCompanyPanel, type SoloipsRemoteSurface } from "./surface.js";

/**
 * 侧栏「全局面板行」槽位的**契约声明**（声明合并）。
 *
 * 〔为什么本包就地声明，而不是 import 官方 `dsh-client-ui-sidebar/client`〕
 * `SlotMap` 是**声明合并**的落点：`ui-sidebar` 在自己的 client 半边里为
 * `sidebar.panellist` 声明了 `{ kind: 'list'; scope: 'root'; owner: … }`，而本包
 * 要用 `ctx.slots.register({ name: 'sidebar.panellist', … })` 就必须让该键在
 * `SlotMap` 里存在（否则 `keyof SlotMap` 不含它，注册名无从校验）。
 *
 * 两条路：① 放行 `@deepseek-ai/dsh-client-ui-sidebar`（一个**官方 UI 能力包**）
 * 并 `import type {} from '…/client'`；② 就地声明同形条目。
 * 本仓取 **②**：DEV-04 的口径是「放行面越窄越好」，而声明合并对**同形**条目是
 * 幂等的（两边一致时合并为一条；不一致时 TS 报「后续属性声明必须具有相同类型」
 * ——fail-closed，比静默依赖官方包更安全）。
 *
 * 〔形状来源〕逐字取自 fork `packages/client/ui-sidebar/src/client/contract/slots.ts`
 * 的声明（`owner: SidebarPanelIconOwnerProps`，两个字段 `size` 与 `active`）。
 * 本包**只声明自己消费的形状**（`owner` 的两个字段），不复制官方类型的其余面。
 */
declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    /**
     * 全局面板图标（侧栏导航列的一行）。
     *
     * 由 `ui-sidebar` 的 `sidebar` 条目声明；本包注册**一个 list 条目**（追加式，
     * 不替换任何官方占位）。`owner` 是侧栏在渲染每一行时提供的展示面。
     */
    "sidebar.panellist": {
      kind: "list";
      scope: "root";
      owner: { readonly size: number; readonly active: boolean };
    };
    /**
     * 中央列的面板（按侧栏条目的 `id` 作 key 选中）。
     *
     * 由 `ui-layout` 的 `root` 条目声明（`children` 表）；官方 `conversation` 已占
     * 该 key。本包注册新 key（`soloips-company`），与官方面板并列。
     */
    main: { kind: "keyed"; scope: "root" };
  }

  interface LocaleNamespaceMap {
    /** 本包的字典命名空间（键集真源见 `../locales/zh.js`）。 */
    soloips: keyof typeof zh & string;
  }
}

/**
 * 面板在**两个**槽位里的共同身份：`sidebar.panellist` 的 list `id` 与 `main` 的
 * keyed `key` **必须是同一个值**（`MainPanelId` 与侧栏条目 id 共享同一身份，
 * 见 `ui-layout/src/client/service.ts` 的 `MainPanelId` 注释）。
 *
 * 〔不变量〕两者不同名时，点击侧栏行会调 `selectPanel(侧栏 id)`，而 `main` 里
 * 没有该 key → `LayoutController.selectPanel` **抛错**（**实测**：页面异常记录
 * `layout.selectPanel: main panel "…" is not registered`）。因此本常量是
 * **单一来源**，两处注册都引用它；测试对「两处逐字相等」有断言。
 *
 * 〔为什么是稳定字面量而不是从包名派生〕包名可以改，条目 id 是装配契约。
 */
export const SOLOIPS_COMPANY_PANEL_SLOT_ID = "soloips-company";

/**
 * 浏览器侧槽位服务的**最小**结构声明（同 `./index.js` 的 `$mount` 声明法）。
 *
 * 〔为什么是结构声明而不是 import 官方 `SlotRegistry` 类型〕`ctx.slots` 的
 * `Context` 增强声明在 `@deepseek-ai/dsh-client-ui-renderer/client` 里，而那是
 * 一个**官方 UI 能力包**（不在本包放行面内，DEV-04）。本声明只覆盖本包**实际
 * 使用**的成员，并把槽位键收窄到 `SlotMap` 的键域——因此「槽位名拼错」是**编译
 * 错误**，而不是运行时的 `slot "…" is not declared`。这是引入
 * `@deepseek-ai/dsh-client-ui-slots` 类型面的**唯一**目的。
 *
 * 官方签名若变化，本声明会在类型层失配（少声明不会静默错），而不是靠手抄一份
 * 会漂移的副本。
 */
export interface SoloipsSlotsSurface {
  /**
   * 等待某个槽位被声明，并在其声明存活期内安装回调。
   *
   * @param key - 已声明的 `SlotMap` 键（拼错即编译失败）。
   * @param callback - 声明到来时运行；返回 disposer（或 disposer 的可迭代集合）。
   * @returns 幂等的注销函数。
   */
  inject(
    key: keyof SlotMap & string,
    callback: () => (() => void) | Iterable<() => void, void, void>,
  ): () => void;
  /**
   * 注册一个条目。
   *
   * @param options - 条目选项：`name` 是槽位键；**list** 槽位需要 `id`、
   *   **keyed** 槽位需要 `key`（两者互斥，由槽位自身的 kind 决定用哪一个——
   *   本声明不把该关系写进类型，因为那需要按 `SlotMap[K]['kind']` 做条件类型，
   *   而运行时由 `SlotCore.register` 强制：缺 `id`/`key` 即抛错）。
   * @param component - 条目组件。
   * @returns 注销该条目及其声明的 disposer。
   */
  register(
    options: {
      readonly name: keyof SlotMap & string;
      readonly id?: string;
      readonly key?: string;
      readonly order?: number;
      readonly label?: SlotLabel;
      readonly locale?: string;
    },
    component: unknown,
  ): () => void;
}

/** 浏览器侧字典服务的**最小**结构声明。 */
export interface SoloipsLocaleSurface {
  /**
   * 注册一个命名空间的双语字典。
   *
   * @param namespace - 已合并进 `LocaleNamespaceMap` 的命名空间。
   * @param dictionaries - 按语言 id 索引的字典。
   * @returns 幂等的注销函数。
   */
  register(
    namespace: keyof LocaleNamespaceMap & string,
    dictionaries: Record<string, Record<string, string>>,
  ): () => void;
  /**
   * 绑定一个命名空间的翻译函数（读时解析当前语言）。
   *
   * @param namespace - 已注册的命名空间。
   * @returns 翻译函数。
   */
  bind(namespace: keyof LocaleNamespaceMap & string): Translate<string>;
}

/** 注册所需的服务集合（`inject` 声明的键与这里一一对应）。 */
interface SoloipsCompanyPanelServices {
  readonly slots: SoloipsSlotsSurface;
  readonly locale: SoloipsLocaleSurface;
  readonly remote: SoloipsRemoteSurface;
}

/**
 * 从上下文中取三个服务（**fail-closed**）。
 *
 * 〔为什么 `remote` 用 `ctx.get` 而不是属性访问——**实测的关键接线事实**〕
 * 本包的 Remote namespace 是挂在 `remote` 容器下的**子服务** `remote.soloips`
 * （`api-gateway/client` 的 `remoteServiceKey(namespace)`），而 `createCompany`
 * 的调用路径是 `ctx.remote.soloips.createCompany`。cordis 的 `Context` get trap
 * 对**未在 `inject` 里声明的服务键**直接抛错
 * （`cannot get property "remote.soloips" without inject`，
 * `@deepseek-ai/cordis/lib/index.js:675-705`）。**实测**：不处理这一点时面板的
 * 提交走不到网络，被折叠成 `failed` 相位。
 *
 * 两条路：① 把 `remote.soloips` 写进 `inject`；② 经 `ctx.get('remote.soloips')`
 * 直查 store。本包取 **②**，因为 ① 会造成**自锁**：`remote.soloips` 由本插件
 * 自己的 `$mount` 创建，写进 `inject` 等于「等一个只有自己会创建的服务」——
 * `apply` 永不运行、`$mount` 永不发生。故 `apply` 先挂载、再调用本函数；
 * 此时该子服务已在 store 里，`ctx.get` 读得到它（`reflect.get` 的 docstring
 * 明写 "without the inject requirement"，`_getImpl` 走 isolate map + store 直查）。
 *
 * 〔`slots`/`locale` 为何仍用属性访问〕它们是**独立服务**（不是本包创建的），
 * 已写进 `inject`，故属性访问是安全的、且由 cordis 保证就绪。
 *
 * 〔为什么显式抛出而不是静默跳过〕走到这里而服务缺失说明有人绕过了 cordis 的
 * 服务等待（手动 `ctx.plugin`）。静默跳过会留下「插件已激活但什么都没挂」的
 * 假象——与 `./index.js` 的 `remoteOf` 同款判据。
 */
function servicesOf(ctx: Context): SoloipsCompanyPanelServices {
  const candidate = ctx as Context & Partial<SoloipsCompanyPanelServices>;
  const { slots, locale } = candidate;
  // 〔服务键字面量〕`remote.soloips` 是 cordis 的**点分服务键**（与官方
  // `ui-goal` 的 `'remote.goals'` 同形），不是「在 `remote` 对象上取 `soloips`
  // 属性」。`ctx.get` 按整串键查 store，故这里必须写完整的点分名。
  const remote = ctx.get("remote.soloips") as SoloipsRemoteSurface | undefined;
  if (slots === undefined || locale === undefined || remote === undefined) {
    throw new Error(
      "soloips-web/client: 公司面板需要 slots / locale / remote.soloips 三个服务；" +
        "前两者已在本插件 inject 中声明，`remote.soloips` 由本插件自己的 $mount 创建" +
        "（故不写进 inject——那会造成自锁）。该错误只应在 $mount 尚未完成或" +
        "绕过 cordis 服务等待时出现。",
    );
  }
  return { slots, locale, remote };
}

/**
 * 把公司面板注册进官方槽位（`main` 放本体 + `sidebar.panellist` 放图标），
 * 并注册本包的字典。
 *
 * @param ctx - 浏览器侧 cordis 根上下文（提供 `slots`、`locale`、`remote`）。
 * @returns 注销函数（cordis 以 `apply` 的返回值为卸载钩子）。
 */
export function registerSoloipsCompanyPanel(ctx: Context): () => void {
  const { slots, locale, remote } = servicesOf(ctx);

  // 〔字典注册先于槽位注册〕槽位条目的 `label` 是**求值时**读字典的 thunk
  // （`SlotLabel = string | (() => string)`，`resolveSlotLabel` 每次读取都调用它），
  // 因此注册顺序不影响标签；但先注册字典使「面板首次渲染即可拿到文案」成立，
  // 不必等一次 revision 往返。
  const disposeLocale = locale.register(SOLOIPS_LOCALE_NAMESPACE, { zh, en });
  const t = locale.bind(SOLOIPS_LOCALE_NAMESPACE);
  const translate: SoloipsPanelTranslate = (key: SoloipsLocaleKey, params) => t(key, params);

  // 〔顺序：先 main 后 sidebar〕点击侧栏行会调 `selectPanel(id)`，而
  // `LayoutController` 的 `hasMainPanel` 查的是**当时**的 `main` 注册表。两个
  // `inject` 回调的相对执行顺序由声明到来顺序决定（不可控），但**只要两者都
  // 注册了**，用户点击时它们就都在——`selectPanel` 只在「从未注册」时抛错。
  // 这里先注册 main 使「面板本体存在」这条更早成立，是防御性的排序，不是正确性
  // 依赖。
  const disposePanel = slots.inject("main", () => {
    const panel = new SoloipsCompanyPanel(remote);
    // 〔必须用容器组件，不能直接把状态快照传给视图〕`SoloipsCompanyPanel` 是
    // 一个**外部可观察源**（订阅式，非 React state）。若在注册时把
    // `panel.getSnapshot()` 读成 props，组件永远只看到**那一刻**的状态：用户输入
    // 后业务面更新了，React 却不会重渲染——受控 `<input value={…}>` 会立刻把
    // 输入回滚成空串。**实测**：这正是本片第二版的行为（CDP 真实键盘输入后
    // `input.value` 仍为空、`reviewDisabled` 恒 true）。容器用
    // `useSyncExternalStore` 订阅，使状态更新驱动渲染。
    const component = (): React.ReactElement =>
      SoloipsCompanyPanelContainer({ panel, t: translate });
    return slots.register(
      { name: "main", key: SOLOIPS_COMPANY_PANEL_SLOT_ID, locale: SOLOIPS_LOCALE_NAMESPACE },
      component,
    );
  });

  const disposeIcon = slots.inject("sidebar.panellist", () =>
    slots.register(
      {
        name: "sidebar.panellist",
        id: SOLOIPS_COMPANY_PANEL_SLOT_ID,
        // 官方面板行的排序惯例：较大的 order 排在后面，避免插到官方条目中间。
        order: 100,
        // 〔为什么是 thunk 而不是字符串〕`SlotLabel` 支持 `() => string`，侧栏每次
        // 读取都重新求值（`resolveSlotLabel`）——因此标签跟随语言切换，不需要
        // 重新注册。侧栏用它做行的 `aria-label` 与 tooltip。
        label: () => t("soloips.company.panel.title"),
        locale: SOLOIPS_LOCALE_NAMESPACE,
      },
      SoloipsCompanyIcon,
    ),
  );

  return () => {
    disposeIcon();
    disposePanel();
    disposeLocale();
  };
}
