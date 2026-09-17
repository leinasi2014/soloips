# DSH 设计语言底册 v0.1

| 阅读契约 | 内容 |
|---|---|
| 身份 | `SOLO-UI-DL-01`（DSH 设计语言底册）；`soloips-web` 界面与 DSH 主题一致性的**事实依据**，非设计方案、非验收裁定 |
| 目的 | 把 fork 侧 DSH 的界面事实（token、组件、布局、强调色纪律、i18n、品牌定制位）固化为可引用的**底册**，使 `soloips-web` 的界面实现与 QA 评审有共同的事实基线 |
| 范围 | 仅 **DSH fork 官方侧的界面/设计事实**（token 体系、组件视觉规范、布局密度、强调色纪律、locale 机制、品牌定制面）。**不含** SoloIPs 业务界面设计（见 `organization-full-ui-design-v0.1.md`）、`system-assistant-ui-design-v0.1.md`）、**不含**代码改动、**不含** fork 创建本身 |
| 调查对象 | `D:/Source/workspace/deepseek-harness`，版本 `0.1.6-alpha.1`（`package.json:2`），核对日期 **2026-09-17** |
| 依据 | 本机 DSH fork 静态源码（路径逐条标注）；`docs/web-styling.md`（官方界面样式权威）；`packages/client/ui-primitives/README.md`（组件目录权威）；`packages/client/ui-theme/README.md`、`packages/client/locale/README.md`、`packages/client/ui-brand-official/README.md`；`docs/decisions/web-ui-fork.md`（SOLO-UI-FORK-01，改造路线与薄改动约束） |
| 证据分层 | 〔读源确认：路径〕= 本次已读该文件的具体行；〔未验证〕= 未读到或无法确证；〔推断〕= 含假设的推论（本文仅在「一致性守则」与「验收标准」两节出现，均显式标注） |
| 反面声明 | 本文**不证明**：`soloips-web` 已建立 fork、已完成任何改造、任何界面已运行或已验收；不证明 fork 版本与上游 `main` 一致；不证明本文未曾读到的包不含额外设计约定。**本文全部结论为静态源码事实，不构成运行时证据** |
| 变更权 | UI 负责人 / architecture-owner；改变「一致性守则」的强制等级或「验收标准」的条目须 UI 负责人确认；本文件随 fork 上游版本变化需重核（见 §9） |

---

## 0. 摘要与规模统计

〔读源确认：本节数字由 `rg` 对 `packages/` `apps/` `website/` 全量扫描后去重得出，排除 `node_modules/` `lib/` `dist/` `.worktrees/`〕

| 指标 | 数值 | 来源 |
|---|---|---|
| `--dsw-*` 变量：源码中出现的**不同名**数量 | **388**（含 11 个扫描出的前缀片段，真实变量名 375–381） | 全仓 `-g '*.css' -g '*.ts' -g '*.tsx'` 去重 |
| `--dsw-*` 变量：ui-theme 样式表中**被定义**的数量 | **358** | `ui-theme/src/styles/*.css` |
| 定义但从未被消费的 alias token | **0** | 交叉比对结论 |
| 被消费但**从未定义**的 alias token | **14**（见 §1.7，风险项） | 交叉比对结论 |
| token 家族 | 9 族：static / alias / specific / font / shadow / elevation / linear / mask / corner | §1.2 |
| 全局样式表 | 6 张（ui-theme 客户端入口按顺序注入） | `ui-theme/src/client/styles.ts:11-18` |
| 字体角色（`--dsw-font-*` 去子属性） | **30 个角色**（每角色 6 条：简写 + font-family/weight/line-height/size/style） | §1.4 |
| ui-primitives 组件文件 | **34 个 `.tsx`**（29 顶层 + 5 `markdown/`） | §2.1 |
| ui-primitives 目录登记的导出条目 | **20 行**（含 `icons/*`、`JsonTree/JsonBlock` 等合并行） | `ui-primitives/README.md:39-58` |
| `ic_ds_*` 图标 | **79 个**导出 | `ui-primitives/src/icons/index.tsx` |
| client 包内 `.module.css` | **162 个** | `packages/client/` |
| client 包总数 | **53 个**（其中 `ui-*` 45 个） | `packages/client/` |
| client CSS 中 `var(--dsw-alias-*)` 引用总数 | **1505** | `*.module.css` 全扫描 |
| 其中**强调色**类引用（brand-primary / button-info-fill / state-business-primary） | **91（6.05%）** | §4 |
| `--shiki-*` 语法高亮 token | **11 个**（明暗各一套值） | `ui-theme/src/styles/shiki.css` |
| `--dsh-*` 包内局部 token（被定义） | **35 个** | §1.6 |
| `--dsl-*` 组件局部 token | **21 个** | §1.6 |
| `--ds-*` 外壳级变量 | **5 个** | `ui-theme/src/styles/base.css` |

**最大发现（先说结论）**：**〔读源确认〕DSH 的 `--dsw-alias-brand-primary` 不是蓝色，是中性色**——浅色主题下解析为 `--dsw-static-neutral-bluish-1000`（近黑 `rgb(15,17,21)`），深色主题下解析为 `--dsw-static-neutral-bluish-50`（近白 `rgb(249,250,251)`）（`design-platform.css:179`、`:274`）。界面里真正的**蓝色**来自 `--dsw-alias-button-info-fill`（`--dsw-static-deepseek-500`，`design-platform.css:188`）与 `--dsw-alias-state-business-primary`（同源，`:223`）。因此「品牌色 = brand-primary」的直觉在 DSH 中**不成立**；`soloips-web` 若把品牌蓝绑到 `brand-primary` 会出现「浅色下黑、深色下白」的结果。详见 §4.3 与 §6.2。

---

## 1. 设计 token 全量提取

### 1.1 六张全局样式表与注入顺序

〔读源确认：`ui-theme/src/client/styles.ts:9-18,24-36`〕ui-theme 客户端入口以 `ctx.effect` 注入 6 张全局样式表，随插件 fiber 卸载/HMR 一并移除。顺序有依赖语义（`scrollbar.css` 必须在 `design-platform.css` 之后，因为它消费后者声明的 `--dsw-alias-scrollbar-*`）。

| # | 文件 | 承担 |
|---|---|---|
| 1 | `styles/base.css`（15 行） | 上游缺失的基础变量：`--dsw-font-family`、`--ds-font-family-code`、`--ds-ease-in-out`、`--ds-transition-duration{,-fast,-slow}` |
| 2 | `styles/corner-shape.css`（26 行） | `--dsw-corner-shape: superellipse(1.5)`，在 `@supports` 保护内对 `*`/`::before`/`::after` 应用 |
| 3 | `styles/design-platform.css`（342 行） | **static 色阶 73 + alias 语义 79 + specific 11**，明暗两套 |
| 4 | `styles/scrollbar.css`（95 行） | 四类滚动条 token 的唯一消费者 + `--dsh-scrollbar-*` 重绑契约 |
| 5 | `styles/gradient-shadow-text.css`（269 行） | **font 181 + shadow 4 + elevation 5 + linear 2 + mask 1** + 字号轴推导 |
| 6 | `styles/shiki.css`（31 行） | `--shiki-*` 语法高亮调色板 |

### 1.2 token 家族与定义处

〔读源确认：`design-platform.css` / `gradient-shadow-text.css` / `corner-shape.css`〕

| 家族 | 定义数 | 定义位置 | 语法 | 用途 |
|---|---|---|---|---|
| `--dsw-static-*` | 73 | `design-platform.css:4-78`（body）与 `:80-154`（`body[data-ds-dark-theme]`） | 直接色值 `rgb(...)` | **静态色阶**：调色板原值，两套主题下**值不同但键相同** |
| `--dsw-alias-*` | 79 | `design-platform.css:156-249`（body）与 `:251-342`（暗色） | `var(--dsw-static-*)` 或 `rgba()` | **语义别名**：组件只应消费这一族 |
| `--dsw-specific-*` | 11 | 同上 | `var(--dsw-static-*)` | **场景位**：气泡、菜单面、侧栏填充、导航项状态、提示、选择器、登录输入框 |
| `--dsw-font-*` | 181 | `gradient-shadow-text.css:54-269` | 简写 `font:` 加 5 条子属性 | **排印**：30 个角色 × (1 简写 + 5 子属性) + 1 个 `--dsw-font-family` |
| `--dsw-shadow-*` | 4 | `gradient-shadow-text.css:5-9` | `0 2px 4px …` | 阴影阶梯 lv1 / lv1-blur / lv2 / lv3 |
| `--dsw-elevation-*` | 5 | `gradient-shadow-text.css:17,28-34` | 复合 box-shadow | 描边+柔光三件套（stroke / panel / prominent / soft）+ 可重绑的 `-stroke-color` |
| `--dsw-linear-*` | 2 | `gradient-shadow-text.css:2-3,38-39` | `linear-gradient(...)` | 思考块渐隐、选中态渐隐 |
| `--dsw-mask-*` | 1 | `gradient-shadow-text.css:19` | `blur(2px)` | 遮罩背景模糊 |
| `--dsw-corner-shape` | 1 | `corner-shape.css:18` | `superellipse(1.5)` | 全局面型圆角平滑（超椭圆） |

**关键结构性事实**：
- 〔读源确认〕**没有 spacing / gap / padding / margin / radius / z-index 的 token 家族**。经全仓正则 `--dsw-*(space|gap|pad|margin|size|radius)` 验证：**零命中**。间距与圆角全部是**字面量**（见 §3.2、§3.3），z-index 全部是**字面量**（见 §3.5）。
- 〔读源确认〕**色值 token 分两层且严格单向**：`alias` → `static`；规范要求组件**只消费 alias**（`docs/web-styling.md:17`：「Use `--dsw-alias-*` semantic tokens in feature components. Do not copy static palette values or write literal colors there.」）。

### 1.3 alias 族全量清单（79 项，按语义分组）

〔读源确认：`design-platform.css:156-342`；「消费数」= `packages/client/**/*.module.css` 中的 `var()` 引用次数〕

**背景 / 表面（10）**

| token | 浅色 | 深色 | 消费数 |
|---|---|---|---|
| `--dsw-alias-bg-base` | `neutral-bluish-00`（#fff） | `neutral-bluish-950`（#151517） | 28 |
| `--dsw-alias-bg-layer-1` | `neutral-bluish-00` | `neutral-bluish-875` | 46 |
| `--dsw-alias-bg-layer-2` | `neutral-bluish-00` | `neutral-bluish-850` | 18 |
| `--dsw-alias-bg-layer-3` | `neutral-bluish-00` | `neutral-bluish-800` | 12 |
| `--dsw-alias-bg-module-platform` | `neutral-bluish-60` | `neutral-bluish-800` | 22 |
| `--dsw-alias-bg-multi-select` | `neutral-bluish-60` | `neutral-850` | — |
| `--dsw-alias-bg-overlay` | `neutral-bluish-150` | `neutral-bluish-700` | 1 |
| `--dsw-alias-bg-skeleton` | `rgba(0,0,0,.04)` | `rgba(255,255,255,.08)` | — |
| `--dsw-alias-bg-mask-1/2/3` | `rgba(0,0,0,.24/.12/.48)` | `rgba(0,0,0,.5/.2/.48)` | mask-1 用于 Modal |
| `--dsw-alias-bg-mask-photo` | `rgba(0,0,0,.88)` | 同 | — |
| `--dsw-alias-bg-mask-drop` | `rgba(255,255,255,.7)` | `rgba(39,39,48,.7)` | — |

**边界（7）**：`border-l1`（`rgba(0,0,0,.04)` / `rgba(255,255,255,.06)`，消费 35）、`border-l2`（`.1` / `.12`，51）、`border-l3`（`.12` / `.16`，35）、`border-l4`（`.16` / `.2`，40）、`border-l2-darkmode-thin`、`border-inverted`、`border-inverted2`。

**文字 / 前景（10）**：`label-primary`（`neutral-bluish-1000` / `bluish-50`，**229**）、`label-secondary`（`bluish-700` / `bluish-300`，167）、`label-tertiary`（`bluish-600` / `bluish-400`，**225**）、`label-caption`（`bluish-400` / `bluish-600`，66）、`label-dimmed`（`bluish-200` / `bluish-750`）、`label-primary-dimmed`、`label-primary-inverted`、`label-primary-foreground`、`label-primary-bluish`、`link`（`deepseek-500` / `deepseek-400`，12）。

**品牌（4）**：`brand-primary`（**中性色**，见 §0 最大发现，44）、`brand-primary-hover` 系（`button-primary-hover`）、`brand-primary-invert`（`bluish-1000` / `bluish-50`）、`brand-text`、`brand-primary-new-colorprimary-new-color`（**浅色 `rgb(65,118,230)` 硬编码 / 深色 `deepseek-450`**——这是唯一**真正着色**的 brand token）。

**按钮（12）**：`button-primary-fill`（= `brand-primary`，故也是中性）、`button-primary-hover`、`button-primary-dimmed`、`button-contrast-fill`（`bluish-700` / `bluish-50`）、`button-elevated-fill`（`bluish-00` / `bluish-750`）、`button-floating-fill`、`button-floating-hover`、`button-ghost-active-{fill,border,hover}`、`button-tool-bar-fill`（`rgba(84,85,87,.5)`）、`button-tool-bar-fill-invisible`、`button-tool-bar-hover`、`button-info-fill`（**`deepseek-500` / `deepseek-400`——真正的蓝**，6）、`button-info-hover`。

**交互（5）**：`interactive-bg-hover`（`rgba(38,49,72,.06)` / `rgba(255,255,255,.08)`，**98——最高频交互色**）、`interactive-bg-active`、`interactive-bg-hover-solid`、`interactive-bg-hover-accent`、`interactive-bg-hover-danger`。

**状态（12）**：`state-success-{primary,secondary,tertiary}`（green-500/400/100↔900）、`state-warn-{primary,secondary,tertiary,label}`（amber-500/400/100/600↔900）、`state-error-{primary,secondary}`（red-600→red-400 / red-400）、`state-business-{primary,tertiary}`（**`deepseek-500` / `deepseek-400`**，74）。

**Markdown（8）**：`markdown-{citation,code-block,code-block-banner,code-segment-selected,code-segment-unselected,inline-code,placeholder,tag}`。

**滚动条（4）**：`scrollbar-bg-l1`、`scrollbar-bg-l2`、`scrollbar-hover-l1`、`scrollbar-hover-l2`（**仅 `scrollbar.css` 消费**，见 §2.5）。

**浮层（2）**：`toast-bg`（`bluish-800` / `bluish-750`）、`tooltip-bg`（`bluish-850` / `bluish-750`）。

### 1.4 排印阶梯（字体角色 30 个）

〔读源确认：`gradient-shadow-text.css:54-269`〕

字号轴：`--dsh-content-font-size`（整数 px，12–17，默认 14）由主题 bootstrap 与 ThemePresenter 写在 `body` 上；派生两条：

- `--dsh-content-font-delta = calc(当前值 - 14px)` — 标题与正文变体按同一像素增量随动
- `--dsh-content-font-size-secondary = min(当前值 - 1px, max(13px, 当前值 - 2px))` — 低一档文本（think、工具行标题/摘要、markdown 表格、流内次级说明）；`≤14 → 设置−1`，`>14 → 设置−2`（14→13、15→13、17→15）

| 组 | 角色 | 值（默认 14px 设置下） |
|---|---|---|
| Markdown 阶梯 | `h1` | 700 21px/30px |
| | `h2` | 700 19px/28px |
| | `h3` | 700 18px/26px |
| | `h4` | 600 14px/24px |
| | `base` / `base-strong` / `base-italic` / `base-strong-italic` | 400/600 [italic] 14px/24px |
| | `table` / `table-head` | 400/500 13px/22px |
| | `small` / `small-strong` / `small-italic` / `small-strong-italic` | 400/600 12px/20px |
| | `code` | 12px/19px（`--ds-font-family-code`） |
| | `code-block` | 11px/19px |
| | `code-block-small`（手工补充，非 Figma 导出） | 11px/16px |
| UI 阶梯 | `xl-24` | 600 24px/32px |
| | `l-20` | 500 20px/28px |
| | `m-18` | 500 **16px**/28px（名字与字号不符，见下） |
| | `base-16` / `base-strong-16` | 400/500 16px/24px |
| | `s-14` / `s-strong-14` | 400/500 14px/22px |
| | `xs-13` / `xs-strong-13` | 400/500 13px/20px |
| | `xxs-12` / `xxs-strong-12` | 400/500 12px/18px |
| | `xxxs-11` / `xxxs-strong-11` | 400/500 11px/14px |

〔读源确认，两处命名陷阱〕：
- **`--dsw-font-m-18` 的名字是 m-18，实际字号是 16px**（`gradient-shadow-text.css:193-198`）。
- **Markdown 阶梯整体按 0.875 缩放**（正文 16 → 14），四舍五入到整数像素；注释明写「重新从 Figma 导出时需要保留这一缩放」（`:44-45`）。
- 字重注意：Figma 的 `font-weight: 510` 在本 UI 中**一律渲染为 500**（`:1-3`），非可变字体平台的中等字重不可预测。

### 1.5 阴影与高度（elevation）

〔读源确认：`gradient-shadow-text.css:5-35`；`ui-theme/tests/elevation-styles.client.spec.ts` 有强制测试〕

```
--dsw-shadow-lv1     0 2px 4px 0 rgba(0,0,0,.05)
--dsw-shadow-lv1-blur 0 4px 12px 0 rgba(0,0,0,.02)
--dsw-shadow-lv2     0 4px 12px 0 rgba(0,0,0,.02), 0 2px 8px 0 rgba(0,0,0,.04)
--dsw-shadow-lv3     0 0 1px 0 rgba(0,0,0,.2), 0 0 4px 0 rgba(0,0,0,.02), 0 12px 32px 0 rgba(0,0,0,.08)
--dsw-elevation-stroke-color  var(--dsw-alias-border-l4)   ← 可重绑
--dsw-elevation-stroke        0 0 0 0.5px var(--dsw-elevation-stroke-color)
--dsw-elevation-panel         stroke + 0 3px 8px rgba(0,0,0,.03) + 0 0 16px rgba(0,0,0,.02)
--dsw-elevation-prominent     stroke + 0 3px 8px rgba(0,0,0,.04) + 0 0 20px rgba(0,0,0,.05)
--dsw-elevation-soft          stroke + 0 4px 16px rgba(0,0,0,.03) + 0 0 24px rgba(0,0,0,.03)
```

**高度契约的三条硬规则**（〔读源确认〕规则来自 `docs/web-styling.md:24`，**执行**来自 `ui-theme/tests/elevation-styles.client.spec.ts` 对 packages/ 下**全部** CSS 的扫描）：

1. 浮层面（菜单、popover、模态、面板、浮动按钮、composer）设 `border: 0`，投影走 `elevation-panel` / `elevation-prominent` / `elevation-soft`。**0.5px 发丝描边是阴影的第一层**。
2. **禁止**把「`--dsw-alias-border-*` 边框」与「lv/elevation 阴影」配对——测试 `neutralBordersBesideElevation()` 会失败。状态色边框（warn 面板）保留真实边框，不受此限。
3. 派生 elevation 值**逐元素声明**（`body, body *`）而非从 body 继承；否则组件重绑 `--dsw-elevation-stroke-color` 将无法生效（`gradient-shadow-text.css:22-35`，测试 `:35-55` 断言）。

### 1.6 包内局部 token（非全局）

〔读源确认〕两族，都不属于 ui-theme，都由**组件自己**声明：

| 族 | 数量 | 性质 |
|---|---|---|
| `--dsh-*` | 35 个被定义 | **包间契约型**局部变量：字号轴（`content-font-size` / `-delta` / `-delta-secondary` / `-size-secondary`）、滚动条重绑（`scrollbar-thumb{,-hover,-border}`、`scrollbar-width`、`scrollbar-track-margin`）、composer 几何（`composer-height` / `-hint` / `-stack-gap` / `-dock-inset` / `-side-clearance` / `-card-max-width` / `-text-max-height`）、会话列（`chat-content-width`、`chat-flow-gap`、`chat-user-width`、`conversation-column-width`、`compaction-header-height`）、轨迹（`trajectory-toolbar-height`、`trajectory-bottom-clearance`）、侧栏（`sidebar-inline-padding`、`session-list-edge-inset`、`session-list-scrollbar-{width,offset}`）、文件类型图标色（`file-type-icon-color`、`file-type-default-color`、`file-type-violet`）、状态（`state-ongoing`）、bootstrap（`boot-{bg,brand,border,arc,label-primary,label-secondary,label-tertiary}`） |
| `--dsl-*` | 21 个 | **组件私有几何**：输出卡片圆角（`-web/-search/-diff/-read/-terminal-radius` 全为 12px）、行高 22px、gutter（read 48px、terminal 30px）、代码块（background / banner / content-font / line-number-width / white-space）、`virtual-list-width` |

〔约束〕官方规范允许这种局部变量，但**限定了范围**：`docs/web-styling.md:11` —「A component may define a local custom property when its value is part of that component's **layout or presentation contract**; shared **colors, typography, elevation, and motion belong to the theme package**.」即：**几何可局部，颜色/排印/高度/动效必须走 `--dsw-*`**。

### 1.7 〔风险项〕被消费但从未定义的 alias token（14 个）

〔读源确认〕以下 token 在 `packages/client/**` 被 `var()` 消费，但**在 ui-theme 六张表中（以及全仓任何位置）都没有定义**。浏览器会把它们解析为无效值 → **`background`/`color` 声明整条被丢弃**（不是回退到某颜色）。

| token | 消费处（非 spec 源码） | 行数 | 是否带回退 |
|---|---|---|---|
| `--dsw-alias-label-error` | `ui-settings-plugins/src/client/{SubagentModelSelectionCard,fields}.module.css` | 5 | 否 |
| `--dsw-alias-bg-l1` | `ui-sidebar-terminal/src/client/{TerminalBody,TerminalCleanup}.module.css` | 2 | 否 |
| `--dsw-alias-bg-l2` | `ui-sidebar-terminal/src/client/TerminalBody.module.css` | 3 | 否 |
| `--dsw-alias-bg-layer-4` | `ui-settings-plugins/src/client/SubagentModelSelectionCard.module.css:111` | 1 | 否 |
| `--dsw-alias-fill-l2` | `ui-jobs/src/client/JobListAction.module.css:92` | 1 | 否 |
| `--dsw-alias-fill-tertiary` | `ui-attachment/src/FileCard.module.css:140` | 1 | **是**（`rgba(0,0,0,.08)`） |
| `--dsw-alias-fill-tsp-secondary` | `ui-agent-preset/src/client/AgentPresetLabel.module.css:11` | 1 | 否 |
| `--dsw-alias-label-quaternary` | `ui-agent-preset/src/client/AgentPresetSeat.module.css:44` | 1 | 否 |
| `--dsw-alias-separator-primary` | `ui-chat/src/client/chat/StatsPills.module.css:66` | 1 | 否 |
| `--dsw-alias-border-subtle` / `text-tertiary` / `text-primary` | `ui-settings-models/src/client/ModelsSection.module.css:437-438`（**仅注释提及**，未实际消费） | — | — |
| `--dsw-font-mono` | `ui-jobs`、`ui-agent-preset`（×3）、`ui-sidebar-documentpreview` | 5 | 多数**是**（`ui-monospace, …`） |
| `--dsw-font-sm-13` | `ui-tool/src/client/tool/components/ToolRow.module.css:315` | 1 | **否** —— `font: var(--dsw-font-sm-13)` 整条失效 |

〔建议〕**这是 fork 侧的既有缺陷，不是 DSH 设计语言的一部分**。`soloips-web` 的改动清单**不应复制**这些名字。若 fork 改造需要 `ui-tool`/`ui-settings-plugins` 等包的对应视觉，应改用已定义的近义 token（`label-error` → `state-error-primary`；`bg-l1/bg-l2` → `bg-layer-1/bg-layer-2`；`font-mono` → `--ds-font-family-code`；`font-sm-13` → `--dsw-font-xs-13`）。是否向官方报缺陷由 UI 负责人决定（**不在本次授权范围**）。

### 1.8 主题体系（暗色如何实现、几套主题、切换机制）

〔读源确认：`ui-theme/src/client/index.ts`、`ui-theme/src/theme-settings.ts`、`ui-theme/src/boot-theme.ts`、`ui-layout/src/client/theme-presenter.ts`〕

**核心答案：CSS 变量 + 一个 body 属性；JS 只持有偏好与覆写层，不持有色值。**

| 问题 | 事实 |
|---|---|
| 有几套主题 | **2 套内置**（`light`、`dark`），在 `ui-theme/src/client/index.ts:126-129` 冻结注册；`system` 是**偏好**而非可注册 id（`:276`）。第三方可注册更多，走 alias 覆写层 |
| 暗色如何实现 | 主题表在 `body` 上声明浅色值、在 `body[data-ds-dark-theme]` 上声明深色值；presenter 切换这个**属性**。**不是** JS 主题对象、不是 class、不是 `prefers-color-scheme` 直接驱动 CSS |
| 属性名 | `data-ds-dark-theme`（`ui-layout/src/client/theme-presenter.ts:14` 导出 `DARK_ATTRIBUTE`） |
| 谁切换 | `ThemeRuntime` 只算快照（纯状态，**不碰 DOM**）；`ui-layout` 的 `ThemePresenter.apply()` 写 DOM（`:41-56`） |
| DOM 写入内容 | ① `documentElement.style.colorScheme`（原生 UA chrome）；② `body[data-ds-dark-theme]` 属性；③ `--dsh-content-font-size`；④ 活动主题的 alias 覆写作为**内联 CSS 变量**写在 body 上（仅回收自己写过的，外来属性/样式保留）；⑤ 自有的 `<meta name="theme-color">`（读 computed body 背景色） |
| 切换入口 | `ctx.theme.setTheme(id)`（`index.ts:231-239`）——**唯一**用户偏好写入入口；`system` 通过 `matchMedia('(prefers-color-scheme: dark)')` 解析，OS 翻转时重新发布（`:181-193`） |
| 持久化 | `ui-theme` 设置命名空间（`theme-settings.ts:9`），字段 `preference` + `fontSize`；**仅 loopback 页面**持久化到 `$DSH_HOME/settings.yaml`；非 loopback 保持进程内 |
| 第三方主题注册 | `ctx.theme.register({ id, colorScheme: 'light'\|'dark', tokens })`（`index.ts:275-290`）；`tokens` 是 **alias 层覆写**，作为内联 CSS 变量叠加在基础调色板上 |
| 覆写层（不改注册表） | `ctx.theme.overrideTokens(source, tokens)`（`:308-317`）——按 seq 顺序叠层，后层按 token 取胜；同 source 再调即替换整层；**每层强制要求 `{ light, dark }` 双值**（`:383-403`，传裸字符串会抛教学错误，理由：单值在另一配色下会不可读） |
| 首屏防闪 | Host 侧 `boot-theme.ts` 注入 head `<style>`（先画文档画布色）+ body `<script>`（在应用脚本前装好 `data-ds-dark-theme` 与 `--dsh-content-font-size`）；`ThemeRuntime.bootstrapFontSize()` 读回该值以免首帧闪默认 |
| 主题设置 UI 归属 | ui-theme 自己把 Appearance 行（`order: 10`）与字号行（`order: 11`）注册进 `settings.general.item`——**功能自持其设置面** |
| 字号轴 | 12–17px 整数，默认 14；`setFontSize(px)` 越界或非整数抛错（`:247-255`） |

〔约束〕官方限制（`ui-theme/README.md` Known Limitations）：**第三方主题只是 extension point，不是产品**——「registering one means overriding same-named alias variables; **no validation exists that an override set is complete**」；且「**The token sheets are the sole color authority**——values absent from the design system are deliberately not appended; the nearest semantic token wins」。

---

## 2. 组件视觉规范

### 2.1 ui-primitives 目录（34 个组件文件 / 20 行导出目录）

〔读源确认：`ui-primitives/src/*.tsx`、`ui-primitives/src/markdown/*.tsx`、`ui-primitives/src/index.ts`、`ui-primitives/README.md:39-58`〕

官方目录（`README.md:37`）的定位：**「A plugin cannot import another plugin's component, so this package is the only place a control can be shared」**——即 `ui-primitives` 是**唯一**可跨功能包复用的控件来源。

| 导出 | 是什么 | 视觉约定（读源确认） |
|---|---|---|
| `Button` | 动作按钮，4 variant | 几何来自 Figma Button（155 实例）：`h36 / pad 0 14 / gap 4 / r18`，字号 14/22；`sm` 为 `h28 r14 pad 0 10` 字号 12/18（**官方注释明写「no dedicated figma node … geometry is ours」**）；`primary` 用 `button-primary-fill`+`label-primary-foreground`；`ghost` 悬停 `interactive-bg-hover`、按下 `interactive-bg-active`；`outline` 是 `0.5px border-l3`；`toolbar` 用 `button-tool-bar-fill`；禁用 `opacity: .4`；图标槽 16×16 |
| `Switch` | 双态开关 | `36×20`；轨道 `border-l3`，选中 `brand-primary`（**中性色**）；focus ring `2px brand-primary` offset 2；禁用 `opacity .5`；`label` **必填无默认**——「a render site cannot ship the control without an accessible name」 |
| `Input` | 单行输入 | `h32 / pad 0 8 / gap 6 / r8`；`0.5px border-l4`；填充 `bg-layer-1`；`:focus-within` 边框转 `brand-primary`；placeholder `label-dimmed`；图标槽 16×16 `label-tertiary`。**明确不是 composer 文本域**（那是 ui-conversation 的） |
| `Menu` | 下拉（项/分隔/组标签/嵌套子菜单） | 卡片 `r20 pad 4`、`--dsw-specific-menu` 填充、`border: 0`、`elevation-prominent`、**stroke-color 重绑为 `border-l1`**（「l1 在菜单面上几乎不可见」是 footer 用 l2 的理由）；默认 `min-width 218 max-width 360`；项 `min-h 40 / r10 / pad 8 10 / gap 8 / 14-22`；`denseList` 变体 `min-h 34`；`compactList` `min-w 164 / pad 2 / r7`，项 `min-h 26 / r5 / 12px`；默认 `z-index 100`，portal 模式 `1100`（「锚点在模态内的菜单仍要在最上层」）；`.scrollable` 上限 `calc(100vh - 24px)` |
| `Pill` | 可选胶囊（视图切换/筛选）或静态 span | `h24 / pad 0 8 / r12 / 12-18`；底 `bg-layer-2`；`active` = `label-primary` + `button-ghost-active-fill` + `inset 0 0 0 1px button-ghost-active-border`。**与 Tag 的分界是尺寸与交互性**（README:62 明列这一对易混） |
| `Tag` | 只读胶囊徽章，8 tone | 固定几何 `r999 + corner-shape: round / pad 1px 8px / 11px / lh17 / w500`；`outline`=`0.5px border-l4`+`label-tertiary`；`solid`=`label-primary` 底+`bg-layer-3` 字；`neutral`=`bg-module-platform`；`quiet`=纯字；**状态四色用 `color-mix(in srgb, <state> 10%, transparent)` 底 + 同色字**，`warning` 例外保持 12%（「which keeps the 12% the plugin inventory's conditional tag shipped with — matching it is what makes this a pure consolidation」） |
| `StateDot` | 状态点 5 态 | 默认 `10px`；实心态 = `::before` 同色 10% 光晕 + `::after` 20% inset 实心核；`done`→success、`warning`→warn、`error`→error、`ongoing`→`--dsh-state-ongoing: var(--dsw-static-deepseek-450)`（**无 alias 覆盖该 450 步，故组件私有变量钉在 static 层**）；`idle`→`label-tertiary`；`ongoing` 是 10px 网格上 2px 方块的 8-cell 顺时针追逐动画（每 cell 相位 `-125ms`，flat keyframe 不插值）；`aria-hidden`，名字由渲染点负责 |
| `DisclosureRow` | 24px 紧凑展开行 | `[16px leading] gap 6 [title 13/24]`；行高 `calc(24px + content-font-delta)`；leading 盒 16px、**内部 svg 14px**（CSS 覆盖 svg 自身 width/height，「every registered icon scales without a per-callsite size prop」），但 `StateDot`（svg 带 `data-state`）**保持固定尺寸**——「it is a status mark, not text furniture」 |
| `Modal` | 居中对话框 | 根 `position: fixed; z-index: 1000; padding: 24px`；遮罩 `bg-mask-1` + `backdrop-filter: var(--dsw-mask-blur)`；卡片 `r24 / bg-layer-2 / border: 0 / elevation-prominent / gap 20 / width min(380px,100%) / pb 24`；header `pad 22px 14px 12px 24px`；标题 16/24 w500；关闭钮 28×28 r8；body 与 footer 两侧 24px |
| `RiskConfirmation` | 敏感操作二次确认 | 容器 `min(440px,100%)`；警告行 `gap 10 / 14-22`，图标 `state-error-primary` |
| `OnboardingSurface` | 首跑阶段（持应用根 inert） | `z-index 1100` |
| `Tooltip` | 悬停文本（克隆锚点） | 右侧/下/上三向 |
| `HoverCard` | 可停留可选择的悬停预览 | `z-index 100`；focus 轮廓 `2px state-business-primary` |
| `Toast` | 顶部居中瞬态条 | `fixed top 40px left 50%`；**`z-index 1100`**（「Above the 1000 the image lightbox backdrop uses」）；`pointer-events: none`；`r14`；底 `button-contrast-fill`、字 `label-primary-inverted`；`shadow-lv3`；`pad 12 16`；`max-width min(640px, 100vw - 48px)`；`holdMs` 一个值同时驱动卸载计时器与 CSS 淡出延迟（「the two cannot disagree」） |
| `JsonTree` / `JsonBlock` | JSON 只读检视 | 折叠字符串默认 3 行 |
| `MarkdownText` / `CodeBlock` | 不可信 GFM + TeX + 高亮代码 | Markdown 标题走 `--dsw-font-markdown-h*`；链接 `color: var(--dsw-alias-link); font-weight: 500`，静止无下划线、悬停/focus 为 `underline dotted` + `text-underline-offset: 3px`；`a:focus` 用 `0 0 0 2px state-business-primary`；引用块 `border-left: 2px solid label-caption`；**透明命中区用零 alpha 字面量**（`rgb(255 255 255 / 0)`）——注释明写「literal zero-alpha only (no painted color)」 |
| `TerminalBlock` / `ReadBlock` / `DiffBlock` / `SearchBlock` / `WebBlock` | 五类 agent 输出卡片 | **共享一套几何模型**（README:112）：`white-space: pre` + 横向滚动「so column-aligned content keeps its alignment」；head+tail 切片，超过 `maxLines`（默认 16）折叠为展开按钮。圆角统一 12px（`--dsl-*-radius`） |
| `icons/*`（79）、`FishLogo`、`BrandWordmark`、`ReferenceIcon`、`LinkIcon` | 字形与品牌标记 | 〔读源确认〕**全部 `fill="currentColor"`**（`icons/index.tsx:2`：「All glyphs ride currentColor」；`LinkIcon.tsx` 同）；`LinkIcon` 用于 14px 可点击链接类别，`FileTypeIcon` 用于 28px 文件/文件夹 |
| `FileTypeIcon` | 分类着色的 28px 文件字形 | 传统字形 = 图标色实心纸 + 白色标记 + 半透明白角，颜色可被 `--dsh-file-type-icon-color` 覆写；**全彩技术图标是刻意的例外，保留内嵌调色板**；默认色按类型映射到 static 层（`deepseek-500`、`green-500`、`amber-400`、`red-600`、`bluish-300`、`--dsh-file-type-violet: rgb(139,118,246)`） |

**三对易混项**（〔读源确认：`ui-primitives/README.md:60-64`〕）：
1. **`Tag` vs `Pill`** — 只读 11px 徽章用 `Tag`；可选（`active`+`onClick`）或需坐在 24px 文字行上用 `Pill`。「Size decides as much as interactivity here」。
2. **`DisclosureRow` vs 卡片** — 该行在固定 24px 高内**并排**布局；**堆叠「名字在上、描述在下」是另一种布局，属于功能包**（`ui-settings-plugins` 的 `PluginCard` 是先例并记录了理由）。
3. **`FoldToggle` vs 导出的 `DisclosureRow`** — `FoldToggle` 是包内私有、不导出。

**已明示的无设计源项**（README:151）：**`Pill` 与 `Input` 都没有设计源**，是自定义组件；侧栏搜索框与视图标签条**只是形似**它们的消费方组合，不是这两个原子。

### 2.2 卡片视觉语言（“图标 + 主标题 + 副标题 + 整块可点击”）

〔读源确认〕**ui-primitives 中没有 `Card` 原子，这是刻意的**——README:63 把「堆叠名称/描述」明确划归功能包，`PluginCard` 是先例。因此该视觉语言以**先例族**的形式存在于四个功能包中。以下是源码定义。

**共同配方（四例交叉提取）**

| 维度 | 值域 | 出处 |
|---|---|---|
| 外框圆角 | **14 / 16 / 18 / 20px** | 14：`PluginInventorySettingsTab.module.css:116`、`AgentPresetSection.module.css:26`；16：`PluginCard.module.css:7`；18：`Deliverables.module.css:10`、`AgentPresetSection.module.css:78`；20：`AgentPresetSection.module.css:78` |
| 描边 | `0.5px solid var(--dsw-alias-border-l4)`，或 `border: 0` + `box-shadow: var(--dsw-elevation-stroke)` | 前者：`PluginCard.module.css:5`、`PluginInventorySettingsTab.module.css:114`（stroke）、`AgentPresetSection.module.css:77` |
| 表面 | `bg-layer-3`（`PluginCard`、`PluginInventory`）或 **`transparent`**（`AgentPresetSection`，靠描边与悬停填充） | `PluginCard.module.css:7`；`AgentPresetSection.module.css:80` |
| 内边距 | `14px 16px`（头部/主体）或 `12px 14px` | `PluginCard.module.css:33`、`AgentPresetSection.module.css:218`、`PluginInventorySettingsTab.module.css:131` |
| 图标 ↔ 文本间距 | `gap: 10px`（交付卡）或 `gap: 12px` | `Deliverables.module.css:10`；`PluginCard.module.css:32` |
| 图标盒 | `40×40`、`border-radius: 10px`、图标着 `--dsw-alias-link` | `Deliverables.module.css:14`（`.fileIcon`） |
| 主标题 | `14–15px / w500–600 / line-height 1.4–1.5 / label-primary` | 15px w600：`PluginCard.module.css:52-57`、`AgentPresetSection.module.css:239`；14px w600：`PluginInventorySettingsTab.module.css:169`；13px w500：`Deliverables.module.css:18` |
| 副标题 | `12–13px / label-tertiary 或 label-secondary / line-height 1.5–1.55` | 13px tertiary：`PluginCard.module.css:59-63`；13px secondary：`AgentPresetSection.module.css:260-262`；10px tertiary：`Deliverables.module.css:17`（**唯一 10px 用例外**） |
| 文字堆叠间距 | `gap: 4px`（`PluginCard`）、`gap: 2px`（交付卡）、`gap: 8px`（预设卡） | 各文件 `.headText` / `.details` / `.cardMain` |
| 整块可点击 | **两种实现**：① 卡片内一个**覆盖式绝对定位按钮**（`position:absolute; inset:0; border-radius:inherit`）；② 卡片内一个**宽度 100% 的按钮**承载头部/主体 | ① `Deliverables.module.css:12`（`.cardPreview`，`z-index: 1`，内容层 `z-index: 2` + `pointer-events: none`）；② `PluginCard.module.css:21-35`（`.header`）、`PluginInventorySettingsTab.module.css:122-135`（`.cardContent`）、`AgentPresetSection.module.css:212-224`（`.cardMain`） |
| 悬停 | `background: var(--dsw-alias-interactive-bg-hover)`；或在 `transparent` 卡上填充该色；或描边转 `label-dimmed` | `PluginInventorySettingsTab.module.css:137-139`；`AgentPresetSection.module.css:85-87`；`PluginCard.module.css:11-13` |
| 选中 / 打开 | 打开卡换 `bg-layer-2` + 描边 `label-dimmed`；选中卡用 `bg-module-platform` + **`--dsw-static-neutral-bluish-400`** 描边 | `PluginCard.module.css:15-19`；`AgentPresetSection.module.css:91-97`、`ui-theme/src/client/AppearanceRow.module.css:50-56` |
| 展开/折叠 chevron | `label-tertiary`，`transition: transform .16s`，展开 `rotate(180deg)` | `PluginCard.module.css:65-73` |
| 卡内分节 | `border-top: 0.5px solid var(--dsw-alias-border-l2)` + 两侧 16px 内缩 | `PluginCard.module.css:75-79`、`AgentPresetSection.module.css:281-283` |
| 焦点可见 | `outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px`（内缩，避免裁切）；覆盖式按钮用 `box-shadow: inset 0 0 0 2px brand-primary` | `PluginCard.module.css:37-40`、`AgentPresetSection.module.css:225-228`、`Deliverables.module.css:13` |
| 危险态 | 描边 `state-error-primary`；危险动作悬停 `interactive-bg-hover-danger` + `state-error-primary` | `AgentPresetSection.module.css:110-117`、`:331-338` |
| 副标题钳制 | `-webkit-line-clamp: 4` + `min-height: 42px`（防止长描述撑高整行）；`overflow-wrap: anywhere` | `AgentPresetSection.module.css:260-268` |
| 网格 | `repeat(2, minmax(0,1fr))` gap 10，或 `repeat(auto-fill, minmax(268px,1fr))` gap 12 + `grid-auto-rows: 1fr`（同行等高） | `PluginInventorySettingsTab.module.css:98-106`；`AgentPresetSection.module.css:63-72` |

**取用结论**：`soloips-web` 的卡片**没有可复用的原子**，必须自建（官方明示），但**必须复用上述配方**，并以 `PluginCard` 与 `AgentPresetSection` 作为最贴近的两个先例。

〔读源确认，一处非卡片先例值得注意〕`PluginInventorySettingsTab` 的卡片在**打开时**把 stroke-color 重绑为最浅的 `border-l1` 并把阴影从 `elevation-stroke` 升为 `elevation-panel`（`:117-119`）——「An open card reads as the one being worked on, not merely taller」。这是 elevation 重绑契约（§1.5 规则 3）的实际用例。

### 2.3 交互态与可访问性约定

〔读源确认〕

| 项 | 约定 | 出处 |
|---|---|---|
| 焦点轮廓 token | **`state-business-primary`（蓝）** 出现最多（1px×15 + 2px×9，共 24 处），**`brand-primary`（中性色）** 次之（2px×6），另有 `warn-label`×2、`label-tertiary`×2 | 全包 `outline:` 统计 |
| 焦点偏移 | 卡片/行内控制用 `outline-offset: -2px`（内缩以免被父级 `overflow: hidden` 裁切） | `PluginCard.module.css:39`、`PluginInventorySettingsTab.module.css:143-145` |
| 禁用 | `opacity: .4`（Button / PluginCard 动作）或 `.5`（Switch / AgentPreset 次级钮）；`cursor: not-allowed` 或 `default` | 各组件 |
| `aria-disabled` vs `disabled` | **需要保留 tab 顺序时用 `aria-disabled`**（AgentPreset 的 broken 卡）——「`disabled` would take the card out of the tab order」 | `AgentPresetSection.tsx:307-312` |
| 减少动效 | `@media (prefers-reduced-motion: reduce)` 在 **28 个样式文件**中出现 | 全包统计 |
| 触屏 | `@media (pointer: coarse)` 抬升命中区到 44px（如 `Deliverables.module.css` 的 `.split`/`.open`） | `Deliverables.module.css` 末行 |
| 滑条 | 全局超椭圆平滑；**全圆形状必须配 `corner-shape: round`**（否则圆被压成方圆形、胶囊端被削平）；由 `corner-shape-styles.client.spec.ts` 对 packages/ 全量扫描强制执行 | `corner-shape.css:11-15`；测试 `:30-33,39-42` |

---

## 3. 布局与密度

### 3.1 三栏骨架（AppFrame）

〔读源确认：`ui-layout/src/client/AppFrame.tsx`、`AppFrame.module.css`、`columns.ts`、`stores.ts`〕

`root` 槽渲染的网格：`${sidebar}px minmax(0, 1fr) ${rightbar}px`，`position: relative`（锚定拖拽柄），`grid-template-rows: 100%`，`height: 100%`，`overflow: hidden`，背景 `--dsw-alias-bg-base`。

**尺寸常量（`columns.ts`）**

| 常量 | 值 | 说明 |
|---|---|---|
| `CENTER_MIN` | **400** | 中栏在右栏正常打开时受保护的最小宽度 |
| `SIDEBAR_MIN` | **264** | 侧栏拖拽下限 |
| `SIDEBAR_MAX` | **420** | 侧栏拖拽上限 |
| `SIDEBAR_DEFAULT` | **280** | 首次拖拽前的宽度 |
| `SIDEBAR_COLLAPSED` | **56** | 折叠轨道：24px 图标列 + 两侧各 16px 内边距 |
| `SIDEBAR_AUTO_COLLAPSE` | **1024** | 视口低于此值自动折叠为轨道（deepsuite LG 断点）；此宽下手动展开会「压在挤窄的中栏上」（`narrowExpanded`） |
| `RIGHTBAR_MIN` | **300** | 右栏拖拽下限 |
| `RIGHTBAR_MAX_RATIO` | **0.7** | 右栏最大占框架宽度比 |
| `RIGHTBAR_DEFAULT_RATIO` | **0.45** | 首次打开右栏的占宽比 |

**求解顺序（`computeColumns`，`:50-57`）**：先算侧栏（`0` → 56，否则夹在 264–420）；再算可给右栏的余量 `viewport - sidebar - 400`；右栏 `0` 或余量 < 300 时**直接失去轨道**，否则夹在 300–`viewport*0.7`；中栏吃剩余（可为 0）。即**右栏先让步，然后才轮到中栏跌破最小值；侧栏在这一步从不让步**。

**拖拽行为**：拖拽柄是框架子元素（列会裁切溢出），`8px` 命中带、`margin-left: -4px` 居中在列边界上，`z-index: 11`，`cursor: col-resize`，`touch-action: none`；**不画可见药丸**（「the details column was the only one that did, and the right column never had one」）。pointer capture + rAF 节流按起拖原点报 dx；**起拖时冻结基准宽度**（「grabbing a concession-clamped panel must not jump back to the stored preference」）；整个手势期间轨道 transition 暂停（`[data-dragging]` / `[data-dragging] .handle` → `transition: none`），否则「eased tracks would detach the column edge from the pointer」。侧栏收起时不渲染拖拽柄（固定宽轨道）。

**右栏语义**：是**轨道**不是盒子——占位者把面板锚在框架**右缘**（永不动），轨道只决定中栏是否让路；无轨道时面板从零宽列**悬在中栏之上**（`.rightbarCol { overflow: visible }`），左边界由占位者自己画。全屏态保持上报的轨道宽但隐藏外侧拖拽柄（`data-rightbar-fullscreen`）。

**其它层**：`.overlayLayer { position: absolute; inset: 0; z-index: 20; pointer-events: none }`，其直接子元素恢复 `pointer-events: auto`。

**侧栏内部几何**：`.root` 垂直栈，`padding: 6px var(--dsh-sidebar-inline-padding)`（`--dsh-sidebar-inline-padding: 12px`），背景 `--dsw-specific-sidebar-fill`；折叠轨道 `padding: 18px 10px 6px`（36×36 控件盒居中于 56px 轨道，12px 垂直节奏）。侧栏列在 `AppFrame.module.css:25-30` 另画 `border-right: 0.5px solid var(--dsw-alias-border-l3)`。

**动效**：轨道 `transition: grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out)`（0.3s，deepsuite sider 曲线）；折叠是**滑动 + 交叉淡入**而非形变——内容冻结展开布局、原地淡出 150ms，滑动列裁切它，**淡出结束后**才应用轨道布局；展开时宽内容 `wide-in 200ms`，上排控件 `rail-in 150ms`（`translateX(49px)` 入场），底排设置位共用不透明度时间线但水平固定。

### 3.2 间距刻度（无 token，字面量）

〔读源确认〕**DSH 没有间距 token 家族**。实际使用分布（`packages/client/**/*.module.css` 计数）：

| `gap` 值 | 出现 | | `padding` 值 | 出现 |
|---|---|---|---|---|
| **8px** | 92 | | `4px` | 17 |
| **4px** | 65 | | `6px` | 14 |
| **12px** | 49 | | `12px` | 13 |
| **6px** | 42 | | `8px 10px` | 10 |
| **10px** | 35 | | `8px` | 10 |
| `2px` | 23 | | `2px` | 10 |
| `14px` | 10 | | `16px` | 9 |
| `16px` | 9 | | `6px 8px` | 8 |

**可辨识的隐式刻度**：`2 / 4 / 6 / 8 / 10 / 12 / 14 / 16`（2px 步进，长用 4 的倍数）。**主用 8 与 4**。行内元素间距 4–6；控件组 8；卡内文本堆叠 2–4；卡间/块间 10–12；节间 12–16。

常见卡/行内边距组合：`12px 16px`（节）、`14px 16px`（卡头）、`12px 14px`（紧凑卡）、`10px 12px`、`8px 10px`、`0 14px`（胶囊钮）。

**行高（`height`/`min-height`）刻度**：`20 / 24 / 26 / 28 / 32 / 34 / 36 / 38 / 40 / 42 / 48 / 52 / 60 px`。代表值：菜单项 40（紧凑 34/26）、按钮 36（紧凑 28）、输入 32–36、切换 20、Tag 17、Pill 24、DisclosureRow 24、设置行 `pad 16 0`、会话头 76、设置面板 800。

### 3.3 圆角（无 token，字面量）

〔读源确认〕**也没有圆角 token**。全包 `border-radius` 字面量分布：`6px`(39) > `8px`(36) > `12px`(28) > `50%`(25) > `4px`(18) > `999px`(16) > `10px`(16) > `20px`(15) > `16px`(15) > `18px`(12) > `14px`(11) > `24px`(8) > `28px`(9)。

可辨识阶梯：**4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 24 / 28 / 32 px + 999px 胶囊 + 50% 圆**。语义映射（从用例反推）：`4` 极小芯片与输入内角；`6–8` 小控件与输入框；`10` 图标盒、紧凑输入；`12` 卡片分节、菜单项、输出卡；`14–18` 卡片与胶囊按钮；`20–24` 大卡、菜单面、模态；`28–32` 设置面板；`999` 徽章/Pill/滚动条拇；`50%` 状态点/图标圆钮。

〔约束〕**全圆形状必须同规则内配 `corner-shape: round`**，否则超椭圆会破坏圆与胶囊（§2.3）。

### 3.4 背景层级体系（表面色分层）

〔读源确认〕消费计数（`--dsw-alias-*`）：`bg-layer-1`(46) > `bg-base`(28) > `bg-module-platform`(22) > `bg-layer-2`(18) > `bg-layer-3`(12) > `specific-sidebar-fill`(4) > `bg-overlay`(1)。**明暗两套映射（`design-platform.css:157-160` vs `:252-255`）**：

| 层 | 语义 | 浅色 | 深色 | 深色下的实际层级 |
|---|---|---|---|---|
| `bg-base` | 应用底 / 中栏 / 根 | `bluish-00` #fff | `bluish-950` #151517 | **最深** |
| `bg-layer-1` | 一级抬升面（输入框、图标按钮悬停底） | `bluish-00` | `bluish-875` | ↑ |
| `bg-layer-2` | 二级嵌套面（模态、设置面板、菜单打开态） | `bluish-00` | `bluish-850` | ↑ |
| `bg-layer-3` | 三级面（插件卡、标识符底） | `bluish-00` | `bluish-800` | ↑ |
| `bg-module-platform` | **模块/选择器填充**（Appearance 立方、选择器胶囊、预设选中卡） | `bluish-60` #f5f6f7 | `bluish-800` | — |
| `bg-overlay` | 遮罩与 popover 底 | `bluish-150` | `bluish-700` | — |
| `specific-sidebar-fill` | **侧栏列 + 标题行** | `bluish-50` #fafafa | `bluish-900` | 刻意**深于** `bg-base` |
| `bg-multi-select` | 多选底 | `bluish-60` | `neutral-850` | — |

**关键结构性事实**：〔读源确认〕**浅色主题下 `bg-base`、`layer-1`、`layer-2`、`layer-3` 解析为同一个值（`bluish-00` = #fff）**。即**浅色主题没有表面层级差**，分离完全靠 `border-l*` 发丝线与 elevation 描边；深色主题才有真正的层级色差（950 → 875 → 850 → 800）。这对 `soloips-web` 的意义：**任何「靠背景色差区分层级」的设计在浅色主题下会失效**，必须改用描边或高度。
- 侧栏在**两套主题**下都与中栏有色差（浅色 50 vs 00，深色 900 vs 950），这是唯一跨主题稳定的表面对比。
- 深色主题另有一组**暗色专属改值**：`static-neutral-bluish-60` 在深色下从 `rgb(245,246,247)` 变为 `rgb(249,250,251)`（`design-platform.css:139`）——即该 static 步在两套主题下并不完全一致（浅色定义在 `:63`）。
- 首屏（应用脚本执行前）画布色由 bootstrap 硬编码：浅色 `#fff`、深色 `#151517`（`boot-theme.ts:12-13`），与上表 `bg-base` 一致。

### 3.5 z-index 阶梯（无 token，字面量，含已知缺口）

〔读源确认〕官方注释**两处承认没有 z-index token 层**：「there is no z-index token layer to draw from yet」（`ui-sidebar-right/src/client/shell/SidebarRight.module.css:113`）、「No z-index token layer exists to draw from」（`ui-dockkit/src/components/dockkit.module.css:441`）。

从源码注释与用例反推的实际阶梯：

| 层 | z-index | 占用者 |
|---|---|---|
| 内容流内 | `0 / 1 / 2` | 局部堆叠（按钮覆盖层、图标层、JSON 行） |
| 粘性横幅 | `6` | `CodeBlock` sticky 横幅 |
| 中栏浮起控件 | `7` | 粘性 composer |
| 回到最新 | `8` | `ChatView` back-to-bottom「Above the sticky composer (z-index 7)」 |
| 侧栏右列 | `10 / 40 / 60` | dockkit 面板 10、右栏壳 40、右栏浮层 60 |
| 中栏 hero | `10` | `HeroShell` |
| 列拖拽柄 | `11` | AppFrame handle「sits above the right panel (which states z-index 10)」 |
| shell overlay | `20` | AppFrame `.overlayLayer` |
| 就地下拉 | `100` | Menu、HoverCard、ContextMeter、commands、jobs、input-trigger、Schedule |
| 子菜单 | `101` | Menu |
| 模态 | `1000` | Modal、设置面板、图片灯箱、拖放遮罩 |
| portal 菜单 / 提示 / 引导 | `1100` | Menu portal「Portal mode … must layer above modal overlays (z 1000)」、Toast「Above the 1000 the image lightbox backdrop uses」、OnboardingSurface、stat dialog、ModelSelect |

〔约束〕这三段（`1000`、`1100`、`11`）是**注释明文说明的契约**，不是随意取值；`soloips-web` 新增浮层应沿用同一阶梯。

---

## 4. 强调色纪律

### 4.0 读图结论与源码事实的对照

任务给出的读图发现：「强调色极克制（仅发送按钮 / 卡片图标 / 头部色块着色）」。**源码支持这个方向，但需要一处重要修正**（§4.3）。

### 4.1 量化：强调色占比 6.05%

〔读源确认：`packages/client/**/*.module.css` 全扫描〕

- `var(--dsw-alias-*)` 引用总数 **1505**
- 其中强调类（`brand-primary` / `button-info-fill` / `state-business-primary`）**91 处 = 6.05%**

**最高频 token 前 14 名**（全部为中性色或交互底色）：

| token | 次数 | | token | 次数 |
|---|---|---|---|---|
| `label-primary` | 229 | | `label-caption` | 66 |
| `label-tertiary` | 225 | | `border-l2` | 51 |
| `label-secondary` | 167 | | `bg-layer-1` | 46 |
| `interactive-bg-hover` | 98 | | `border-l4` | 40 |
| `state-business-primary` | 74 | ← 蓝（焦点环） | `border-l3` | 35 |
| `state-error-primary` | 73 | | `border-l1` | 35 |
| | | | `bg-base` | 28 |

**结论：界面用三种灰（primary/secondary/tertiary，合计 621 次）与一种悬停底色（98 次）承担 90% 以上的着色。** `state-error-primary`(73) 高于任何强调色的原因是错误/失败态需要在灰底上跳出——这是**状态语义**，不是装饰。

### 4.2 三类强调 token 的**授权用途**（从消费点反推）

〔读源确认〕

**A. `--dsw-alias-brand-primary`（44 处 / 18 文件）——中性色，用作「选中/焦点/结构」标记**

| 用途 | 出处 |
|---|---|
| Switch 选中填充 + 焦点环 | `ui-primitives/src/Switch.module.css:25,34` |
| Input `:focus-within` 边框 | `ui-primitives/src/Input.module.css:13` |
| 卡片焦点 outline（`2px` 内缩） | `ui-settings-plugins/src/client/PluginCard.module.css:38,148`；`AgentPresetSection.module.css:225,290` |
| 覆盖式点击区的 inset 焦点环 | `ui-deliverables/src/client/Deliverables.module.css:13` |
| 表单字段 focus 边框 | `ui-settings-plugins/src/client/fields.module.css`；`ui-settings-models/src/client/ModelsSection.module.css:569` |
| 引导页 spinner 弧 | `web/src/boot-page.module.css`（`conic-gradient` 的弧）+ `ui-theme/src/boot-theme.ts`（`--dsh-boot-brand`） |

**B. `--dsw-alias-button-info-fill`（6 处 / 5 文件）——真正的蓝，用作「主行动」**

| 用途 | 出处 |
|---|---|
| **发送按钮**：34px 圆、`r999`、`background: button-info-fill`、**箭头硬编码 `#fff`**（注释：「Static white, not the foreground token: the arrow stays white on the blue fill in both themes (design 34:10465)」） | `ui-conversation/src/client/skeleton/InputBar.module.css:360-368` |
| 问题编辑器主按钮 | `ui-user-questions/src/client/QuestionComposer.module.css` |
| 目录选择器主按钮 | `ui-directory-picker-browse/src/client/DirectoryBrowser.module.css` |
| 重试条焦点环 | `ui-chat/src/client/chat/MessageItem.module.css:234` |
| 用户气泡内的强调（经 `brand-primary-new-colorprimary-new-color` 家族） | `ui-chat/src/client/chat/MessageItem.module.css` |

**C. `--dsw-alias-state-business-primary`（78 处 / 27 文件）——同源蓝，用作「焦点环 + 产品级功能标记」**

- **焦点环主力**：`outline: 1px|2px solid state-business-primary`（24 处中的多数）
- 输入框 focus 边框（GoalBar、QueueDock、PluginInventory search）
- `HoverCard` / Markdown 锚点 focus `box-shadow`
- **cordis 生命周期工具行**：`[data-tool^='cordis_']` 的 leading 图标与标题着此色 + 标题 `font-weight: 500`（`ui-tool/src/client/tool/components/ToolRow.module.css:51-58`）——这是「同一产品族的工具用共享强调色」的唯一显式先例
- 轨迹视图（TrajectoryTable 18 处、Timeline 8、Toolbar 5）作为**数据可视化**的分类色

**D. 状态四色（`state-success` / `warn` / `error` / `business`）——语义专用，可出现在徽章填充**

- `Tag` 的状态 tone 用 `color-mix(<state> 10%, transparent)` 做底（`warning` 12%）
- `StateDot` 五态
- 危险动作悬停底 `interactive-bg-hover-danger`
- `RiskConfirmation` 警告图标 `state-error-primary`

### 4.3 **修正**：`brand-primary` ≠ 品牌蓝

〔读源确认〕这是本节最重要的事实，直接影响 `soloips-web` 的品牌化方案：

| token | 浅色解析 | 深色解析 | 性质 |
|---|---|---|---|
| `--dsw-alias-brand-primary` | `--dsw-static-neutral-bluish-1000` = `rgb(15,17,21)` **近黑** | `--dsw-static-neutral-bluish-50` = `rgb(249,250,251)` **近白** | **中性**（功能上「反色」：浅色下作深色强调，深色下作浅色强调） |
| `--dsw-alias-brand-text` | 同上 | 同上 | 中性 |
| `--dsw-alias-brand-primary-invert` | `bluish-1000` | `bluish-50` | 中性 |
| `--dsw-alias-brand-primary-new-colorprimary-new-color` | **`rgb(65,118,230)` 硬编码** | `--dsw-static-deepseek-450` = `rgb(86,134,254)` | **真蓝**（唯一被着色的 brand token；命名带 Figma 导出事故痕迹 `new-colorprimary-new-color`） |
| `--dsw-alias-button-info-fill` | `deepseek-500` `rgb(65,118,230)` | `deepseek-400` `rgb(103,158,254)` | **真蓝** |
| `--dsw-alias-state-business-primary` | `deepseek-500` | `deepseek-400` | **真蓝** |
| `--dsw-alias-link` | `deepseek-500` | `deepseek-400` | **真蓝** |

〔读源确认〕`dockkit.module.css:251` 用 `brand-primary-new-colorprimary-new-color` 画活动标签页的 2px 竖条 caret（`:250-252`）——即**标签条的活动标记用的是真蓝，而不是 `brand-primary`**。轨迹视图也用它。

〔建议〕`soloips-web` 若要品牌化蓝色，**正确的挂钩点是 `button-info-fill` / `state-business-primary` / `brand-primary-new-colorprimary-new-color` 一族（alias 层覆写，双明暗值）**，而不是 `brand-primary`。若坚持绑 `brand-primary`，浅色主题会得到近黑替换色、深色得到近白，语义与官方全部 44 处消费点冲突（焦点环、Switch 选中态都会变成黑/白块）。详见 §6.2。

### 4.4 强调色纪律的四条可检验规则

〔读源确认 + 反推，标注为〔推断〕处为反推〕：

1. **〔读源确认〕强调色不得用于大面积填充**。全包 `background:` 使用强调色的仅：发送按钮（34px 圆）、状态 `Tag`（`color-mix` 10–12%）、`StateDot`、引导 spinner 弧、`MessageItem` 气泡族。**没有任何「强调色头部色块」或「强调色整卡底」**。
2. **〔读源确认〕品牌/结构强调色（`brand-primary`）只出现在 `outline` / `box-shadow` / 1px 级边框 / 20×36 级小控件填充**。
3. **〔读源确认〕强调色总是伴随 `font-weight: 500` 或描边厚度**——不靠色相单独承担层级（如 cordis 工具行「accent + w500」、链接「`link` 色 + w500 + 悬停虚线下划线」）。
4. **〔推断〕「卡片图标着色」不是通用约定**。四张卡片先例中，只有交付卡把图标着 `--dsw-alias-link`（`Deliverables.module.css:14`）；`PluginCard` 用 `IconChevronDownOutline14` 着 `label-tertiary`；`AgentPresetSection` 的 `cardHead` 无图标（只有名称 + Tag）；`PluginInventorySettingsTab` 的 leading 是 `StateDot`（语义色非强调色）。文件类型图标走的是**分类专属调色板**（static 层），也不是强调色。**若 `soloips-web` 要做「卡片图标着色」，那是新引入的约定，需在改动清单登记。**

---

## 5. 国际化与文案

〔读源确认：`locale/src/client/index.ts`、`locale/src/locales/{zh,en,index}.ts`、`locale/src/locale-settings.ts`、`ui-primitives/README.md:80-82`、`scripts/verify-client-ui-i18n.ts`、`packages/client/AGENTS.md:113`〕

### 5.1 机制全貌

| 项 | 事实 |
|---|---|
| 开箱语言 | **2 种**：`zh`、`en`（`LOCALE_IDS`） |
| 注册 API | `ctx.locale.register(ns, { zh, en })`（对象形式，双内置强制）或 `ctx.locale.register(ns, locale, dict)`（逐语言形式，供语言包） |
| 类型强制 | 命名空间合并进 `LocaleNamespaceMap`（`ui-slots/src/index.ts:36`）；**每个键按该命名空间的键联合类型编译期校验，且两种内置语言必须齐备**——「a missing or extra key at a typed registration site is a compile error」（`ui-slots/src/index.ts:79-82`） |
| 键集权威 | **`zh` 是键集的事实来源**（中文优先仓库约定）；`en` 按它检查完整性（`locale/src/locales/index.ts:1-5`、`zh.ts:42-43`） |
| 键名规范 | 扁平、点分层级：`copy.failed`、`presented.previewCard`、`settings.plugins.*`；模板占位 `${name}` 形式 `{name}`（如 `'markdown.truncatedCharacters': '… 已截断，共 {total} 字符'`） |
| 组件取文案 | 框架注入的 `t` 座位（`PropsLocale<N>`，`ui-slots/src/index.ts:90-96`）——**在该条目注册时声明 `locale:` 才存在**；或 `ctx.locale.bind(ns)` 取绑定翻译函数（**身份稳定**，可跨注入面传递而不破坏 memo） |
| 缺失键回退链 | ① 活动语言在**请求的命名空间**中沿其 `fallback` 链查找；② 在 **`common` 命名空间**重复该链；③ **显示键名本身**（`locale/README.md`） |
| 切换 API | `ctx.locale.setLocale(id)` ——**唯一**写入入口；即使 id 与当前一致也会持久化（活动值可能是暂定值，须跨浏览器存活） |
| 切换生效 | 立即生效：UI 文案切换、`<html lang>` 指向外部 id 或内置文档标签、选择写入持久设置节（slot 渲染的文案**无需重载**） |
| 浏览器推导 | 无显式偏好时按 `navigator.languages` 先全标签后主标签匹配，回退英语（`en` 也是非浏览器运行的默认） |
| 持久化边界 | 仅 **loopback 页面**持久化到 `$DSH_HOME/settings.yaml`；非 loopback 页面**有意不创建**该设置作用域，语言选择保持进程内（`locale/README.md` 明确记录这一决定） |
| 后注册字典 | UI 已挂载后注册的字典**无需重挂载**即被采用（框架自带） |

### 5.2 语言包（外部语言）

〔读源确认：`locale/README.md` 示例代码〕

```js
export const inject = ['locale']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' }),
    'my-locale: language')
  ctx.effect(() => ctx.locale.register('common', 'ja', { cancel: 'キャンセル', close: '閉じる' }),
    'my-locale: common dictionary')
}
```

〔约束〕外部 id 是非空 ASCII BCP 47 风格标签（`LOCALE_ID_PATTERN`）；`fallback` 必须已注册且**链必须终止于 `en`**；未知目标、重复 id、环在注册时失败。定义与字典**可以任意顺序**注册。卸载定义会把它从选择器移除，并把活动选择退回可用/浏览器默认。

### 5.3 `common` 命名空间（跨功能标准词）

〔读源确认：`locale/src/locales/zh.ts` 全文，共 34 键〕`ok` `cancel` `close` `copy` `copied` `copy.failed` `copy.value` `copy.json` `copy.path` `copy.prettyJson` `copy.compactJson` `copy.optionsHint` `retry` `loading` `load.failed` `submit` `submitting` `next` `previous` `skip` `delete` `edit` `save` `search` `more` `collapse` `expand` `back` `brand.localBuild`（`'DSH 本地构建'`）`unknown` `none` `truncated` `json.label` `markdown.footnotes` `markdown.truncatedCharacters` `number.thousand` `number.million`。

〔建议〕`soloips-web` 应**优先复用 `common`**（`ok`/`cancel`/`save`/`search`/`loading`…），只在自己的命名空间里定义业务专有词。

### 5.4 零 Cordis 原语的文案纪律（对 `soloips-web` 直接相关）

〔读源确认：`ui-primitives/README.md:80-82,152`〕

- 原子**不能读应用 locale**；**每一处面向用户的文案都通过必填 label prop 进入**。
- **该包不拥有任何语言回退**——「omission fails typechecking, and each feature maps its typed `t` seat into the primitive's label interface」。
- 涉及的组件：`HoverCard`、`TerminalBlock`、`JsonTree`、`CodeBlock`、`MarkdownText`、`JsonBlock`、`ConnectionIndicator`、`Modal`、`DiffBlock`、`ReadBlock`、`SearchBlock`、`WebBlock`。
- 对 `soloips-web` 的含义：**复用这些原子时必须自己把 `t` 映射成完整 label 对象**，没有任何默认文案可依赖。

### 5.5 文案纪律的自动化门禁

〔读源确认：`scripts/verify-client-ui-i18n.ts:1-58`、`packages/client/AGENTS.md:113`〕存在仓库级校验脚本 `pnpm run verify-client-ui-i18n`（有配套 `.spec.ts`），**拒绝直接嵌在 Client 源码里的产品 UI 文案**：

- 覆盖 JSX 文本与「携带文案的属性」（`alt`、`aria-label`、`aria-description`、`aria-valuetext`、`placeholder`、`title`、`label`、`description`、`cancelLabel`、`closeLabel`、`confirmLabel`、`copyLabel`、`emptyLabel`、`truncatedLabel`），以及以这些名结尾的 props
- 覆盖「喂给它们的常见数据/helper 形式」（`COPY_NAME` / `COPY_SUFFIX` 正则族）
- 白名单 `IMMUTABLE_LANGUAGE_TOKENS`：`B` `Function` `GB` `K` `KB` `M` `MB` `Symbol` `false` `function()` `n` `null` `true` `undefined`
- 设置 `MINIMUM_CLIENT_UI_SOURCES = 450`（低于此数说明扫描没找到源码，直接失败）
- **locale 字典文件是唯一允许拥有翻译文本的源文件**

同时 `packages/client/AGENTS.md:113` 要求：**用户/模型/线缆数据与代码 token 保持原样**；内部匹配用判别式或稳定 id，**绝不用本地化文本**。

### 5.6 SoloIPs 接入的确切方式

〔约束〕沿用既有决定（`organization-full-ui-design-v0.1.md:32,473`；`system-assistant-ui-design-v0.1.md:353`）：

```ts
// soloips-web 的某个 client 插件内
export const inject = ['locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('soloips', { zh, en }), 'soloips-web: dictionaries')
}

// 并合并类型
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { soloips: SoloipsKey }
}
```

〔读源确认〕这一形态与官方 12 个包的现有做法一致（例：`ui-theme/src/client/index.ts:39,434` 用 `SETTINGS_NS = 'settings.theme'`；`locale/src/client/index.ts:542-543` 注册 `common` 与 `settings.locale`）。**不新造 i18n 机制**。

---

## 6. SoloIPs 一致性守则

〔本节为**建议**，是 §1–§5 事实的直接推论。强制等级标注：**必守** = 违反会破坏 DSH 一致性或有自动化门禁；**应守** = 违反会偏离既有做法；**可裁量** = 有多个合法先例。〕

### 6.1 `soloips-web` 界面必须遵守的一致性清单

**A. token 引用方式**

| # | 规则 | 等级 | 依据 |
|---|---|---|---|
| A1 | **颜色/排印/高度/动效只用 `--dsw-*` 变量**，不写字面色值、不写 `border: 1px solid #xxx` | **必守** | **官方三处独立声明**：① `docs/web-styling.md:17`「Do not copy static palette values or write literal colors there」；② `packages/client/AGENTS.md:111`「feature components consume semantic aliases through CSS Modules and `clsx`, **with no literal colors**, component library, or Tailwind」；③ 面向**动态包作者**（无法 import 组件库）的目录指导串：「You cannot `import` anything, so the design-system components are out of reach… **Use the theme CSS variables (`var(--dsw-alias-bg-layer-1)`, `var(--dsw-alias-label-primary)`, …) instead of literal colors, or your contribution breaks in the other color scheme**」（`scripts/gen-client-catalog.ts:92`）。⚠ **但官方无自动化门禁执行此规则**（已核查 `scripts/` 与 `ui-theme/tests/`，无 literal-color 检查）——见 §7.1 V1，**需 SoloIPs 自建** |
| A2 | **只用 `--dsw-alias-*`（及 `--dsw-specific-*`），不直接消费 `--dsw-static-*`** | **必守** | `docs/web-styling.md:17`「Do not copy static palette values」 |
| A3 | 需要静态层时（如 `bluish-400` 选中描边）**沿用官方先例**（`bg-module-platform` + `static-neutral-bluish-400`），并加注释说明「该步无 alias 名」 | 应守 | `AgentPresetSection.module.css:89-97`、`AppearanceRow.module.css:50-56` |
| A4 | **几何（间距/圆角）用字面量**（无 token 可用），并落在 §3.2/§3.3 辨识出的刻度上 | 应守 | §3.2、§3.3 |
| A5 | **字号跟 `--dsw-font-*` 角色或 `--dsh-content-font-size` 轴**；不写裸 `font-size: 14px` | 应守 | `docs/web-styling.md:19`；§1.4 |
| A6 | **不要消费 §1.7 的 14 个未定义 token**（`label-error`、`bg-l1/bg-l2`、`bg-layer-4`、`fill-l2/fill-tertiary/fill-tsp-secondary`、`label-quaternary`、`separator-primary`、`font-mono`、`font-sm-13`） | **必守** | §1.7——消费它们等于声明无效 |
| A7 | 浮层面 `border: 0` + `box-shadow: var(--dsw-elevation-*)`；**禁止**「中性边框 + elevation 阴影」配对 | **必守** | `docs/web-styling.md:24`；`elevation-styles.client.spec.ts`（自动化） |
| A8 | 中性 `--dsw-alias-border-*` 实线边框一律 `0.5px`；虚线 affordance 与状态色边框保留 `1px` | **必守** | `docs/web-styling.md:25`；同测试 |
| A9 | 全圆形状（`50%`/`999px`/`≥99px`）**同规则内配 `corner-shape: round`** | **必守** | `docs/web-styling.md:23`；`corner-shape-styles.client.spec.ts`（自动化） |
| A10 | 滚动容器**用共享滚动条样式**，不写组件专属滚动条选择器；浮层面重绑 `--dsh-scrollbar-thumb{,-hover}` 到 l2 对 | 应守 | `docs/web-styling.md:20`；`ui-theme/src/styles/scrollbar.css` |
| A11 | 升高的浮层面**重绑 `--dsw-elevation-stroke-color`**（菜单面用 `border-l1`，输入框用 `l2`），不新增阴影 token | 应守 | §2.1 Menu；`gradient-shadow-text.css:22-35` |
| A12 | 主题分支选择器（`body[data-ds-dark-theme]`）**只允许出现在 ui-theme 的样式表**；功能组件 CSS 不得含主题选择器 | **必守** | `docs/web-styling.md:18`「Keep theme selectors out of feature component CSS」 |
| A13 | CSS Modules + `clsx`；**不引入组件库，不用 Tailwind** | **必守** | `docs/web-styling.md:16` |
| A14 | 表现放 CSS；内联 React 样式**可以**传组件局部自定义属性值，**不可**编码主题分支 | **必守** | `docs/web-styling.md:21` |

**B. 组件复用优先级**

| # | 规则 | 等级 | 依据 |
|---|---|---|---|
| B1 | **写任何控件前先查 ui-primitives 目录**——它是唯一可跨功能包复用的控件来源 | **必守** | `ui-primitives/README.md:37`；`packages/client/AGENTS.md:147` |
| B2 | 需要「故意的视觉差异」时，**把它抬成原语的 prop**，而不是复制第二份 | **必守** | `ui-primitives/README.md:35` |
| B3 | **卡片必须自建**（原语刻意不含 `Card`），但必须复用 §2.2 的配方，并以 `PluginCard` / `AgentPresetSection` 为先例 | **必守** | `ui-primitives/README.md:63` |
| B4 | 「名字在上、描述在下」**不得**用 `DisclosureRow`（它是并排 24px 行） | **必守** | README:63 |
| B5 | 只读徽章用 `Tag`；可选胶囊或需坐 24px 文字行用 `Pill`；不互换 | 应守 | README:62 |
| B6 | **同一个控件在第二个包被需要时，它属于 ui-primitives** | 应守 | README:66 |
| B7 | 复用 `ui-primitives` 的输出卡片时，**必须提供完整 label 对象**（该包无回退文案） | **必守** | README:82、§5.4 |
| B8 | 组合只走 **register**（`ctx.slots.inject` + `ctx.slots.register`），不 monkey patch、不改官方包内容 | **必守** | SOLO-UI-FORK-01 §2.3；`packages/client/AGENTS.md:141` |
| B9 | 列布局不重造：侧栏/中栏/右栏的轨道求解与拖拽由 `ui-layout` 拥有 | 应守 | §3.1 |

**C. 禁止事项**

| # | 禁止 | 依据 |
|---|---|---|
| C1 | **硬编码色值**（`#fff`、`rgb(...)`、`rgba(...)`）——**唯一例外是零 alpha 的命中区**（官方先例 `rgb(255 255 255 / 0)`）与 `color-mix` 里的 `transparent` | `docs/web-styling.md:17`；`MarkdownText.module.css:68` 注释「literal zero-alpha only」 |
| C2 | 在功能组件里定义**第二个全局主题** | `docs/web-styling.md:9` |
| C3 | 在功能组件里以字面量写**共享颜色/排印/高度/动效** | `docs/web-styling.md:11` |
| C4 | 新增 `--dsw-*` 全局 token 而不改 ui-theme 拥有者 | `docs/web-styling.md:30` |
| C5 | 把 `brand-primary` 当作「品牌蓝」使用（它在浅色下近黑、深色下近白） | §4.3 |
| C6 | 用强调色做大面积填充（>34px 级的色块、卡片整底、头部色块） | §4.4 规则 1 |
| C7 | 直接嵌产品文案（含 `alt`/`aria-label`/`placeholder`/`title`） | §5.5；`verify-client-ui-i18n` 门禁 |
| C8 | 用本地化文本做内部匹配/判别 | `packages/client/AGENTS.md:113` |
| C9 | 新增浮层时自创 z-index 值而不沿用 §3.5 阶梯 | §3.5；两处官方注释承认「无 token 层」是缺口 |
| C10 | 依赖「浅色主题下的表面色差」表达层级——**浅色下 base/layer-1/2/3 是同一个白** | §3.4 |
| C11 | 引入组件库或 Tailwind；用 `any` / `@ts-ignore` | `docs/web-styling.md:16`；`AGENTS.md`（SoloIPs 代码规范） |
| C12 | 移除或绕过 `prefers-reduced-motion` / `:focus-visible` | `docs/web-styling.md:22` |

### 6.2 品牌层可定制点（fork 决策允许改的）

〔读源确认〕官方预留的定制位**只有下面这些**，其余都不是配置面：

| # | 定制位 | 机制 | 作用域 | 读源确认 | 等级 |
|---|---|---|---|---|---|
| **BR1** | **浏览器标题** | 构建期环境变量 `DSH_CLIENT_TITLE`：Vite 注入 `index.html` 的 `<title>`（`apps/web/vite.config.ts:23,29-34`）+ AppFrame 读取 `process.env.DSH_CLIENT_TITLE ?? t('brand.localBuild')`（`AppFrame.tsx:192`） | 标题栏 + 文档标题构建 | `scripts/client-build-environment.ts` | **官方预留** |
| **BR2** | **侧栏品牌标记/名称** | 替换 `ui-brand-official` 的 slot 占用包：`sidebar.brand.mark`（`kind: 'single'`, `scope: 'root'`, owner `SidebarBrandMarkOwnerProps`）与 `sidebar.brand.name`（同）（`ui-sidebar/src/client/contract/slots.ts:22,27`）；声明方 fallback 是 `FishLogo size=24` 与本地构建标签 | 侧栏展开与折叠两处 | `ui-brand-official/src/client/index.ts:18-23` | **官方预留** |
| **BR3** | **对话 hero 品牌标记** | `conversation.hero.brand.mark`（`ui-brand-official/README.md` 明写「the hero slot, which this package leaves on its fallback」） | 新会话 hero | 同上 | **官方预留** |
| **BR4** | **主题 alias 覆写** | `ctx.theme.register({ id, colorScheme, tokens })` 或 `ctx.theme.overrideTokens(source, { token: { light, dark } })` | 全界面色板 | `ui-theme/src/client/index.ts:275-317` | **官方预留（extension point）** |
| **BR5** | **构建 profile** | `DSH_CLIENT_BUILD_PROFILE=official` 决定 `ui-brand-official` 是否注册；既存 profile 仅 `official` 一个（未知值抛错） | 品牌占位是否生效 | `scripts/client-build-environment.ts:11-14,178-190`；`ui-brand-official/src/client/index.ts:17` | **官方预留** |
| **BR6** | **自有 locale 命名空间** | `ctx.locale.register('soloips', { zh, en })` | 文案 | `locale/src/client/index.ts:380-401` | **官方预留** |
| **BR7** | **自有 Client 插件包 + slot 占用** | `dsh.client` 清单 + `cordis.patch.yml` 装配替换；`packages/bundle/web-app/cordis.patch.yml:170+` 是浏览器 roster 的注册面 | 任意新界面 | SOLO-UI-FORK-01 §2.3；`packages/client/AGENTS.md:138-141` | **官方预留** |

**官方明确未预留的定制面**：

- 〔读源确认〕**没有品牌「主题色」配置项**。`ui-theme` 的地位是「the sole color authority」，其 Known Limitations 写明「**values absent from the design system are deliberately not appended**」（§1.8）。品牌色的唯一合法路径是 **BR4 的 alias 覆写层**。
- 〔读源确认〕**没有 logo 占位文件名或资源替换约定**。`ui-brand-official/README.md` 明写「Occupying a slot is the only composition route; **there is no brand configuration surface here**」。
- 〔读源确认〕`ui-brand-official` 的 Known Limitations：「**One occupant set** — alternative presentation belongs in another Cordis package occupying the same slots」（§§）。
- 〔读源确认〕`ui-brand-official` 的 Known Limitations：「The browser title is independent — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot」。

〔约束〕**BR1 的成本警告**：`DSH_CLIENT_*` 前缀的值**全部会被内联进浏览器产物**；官方构建记录会校验 profile 的**精确键集**——`assertClientBuildEnvironment()` 在键集不一致时抛错，理由是「an unexpected variable can change published bytes just as surely as a missing or incorrect required value」（`scripts/client-build-environment.ts:203-204`）；且 `clientArtifactDigest()` 对 `apps/web/dist/**/*`、`packages/*/*/lib/client.js(.map)` 做 SHA-256 绑定，产物与环境不匹配会被拒绝读取（`:250-270,152-160`）。**即：一旦给 soloips 加了新的 `DSH_CLIENT_*` 变量，官方 profile 的构建记录校验策略需要同步处理。**

〔建议〕**品牌化路线（三层，按改动成本从低到高）**：

1. **零源码改动层**：`DSH_CLIENT_TITLE`（BR1）+ 替换 `ui-brand-official` 为 soloips 品牌包（BR2/BR3）+ `ctx.theme.overrideTokens` 覆写品牌色（BR4）。**这一层不触碰官方任何包**。
2. **薄改动层**：SoloIPs 自有的 client 插件包，走 slot 注册新增界面（BR6/BR7）。
3. **需登记层**：若确需改官方源码区域，按 SOLO-UI-FORK-01 §2.2 登记进「soloips 改动清单」。

〔约束〕**品牌命名合规**：`BRAND_GUIDELINES.md`（官方）要求项目名**避免直接使用完整的「DeepSeek Harness」商标**，建议使用缩写 **DSH**；不得以引起「官方背书/合作/授权」误解的方式使用官方品牌素材。**soloips-web 不得出现 DeepSeek Harness 官方 whale + wordmark 组合**（这属于 BR2 必须替换的对象，不是可选项）。

---

## 7. 设计验收标准草案

〔本节为**建议**，供 QA 评审与实现后截图对比使用。每条给出：**可检查项** → **检查方法** → **证据等级**。带 ⚙ 的条目已有官方自动化测试可对齐或可直接复用扫描逻辑。〕

### 7.1 自动化可查项（建议纳入 CI）

| # | 可检查项 | 检查方法 | 来源对齐 |
|---|---|---|---|
| V1 ⚙ | **新界面零硬编码色值**：`soloips-web` 的 `*.module.css` 中不含 `#xxx` / `rgb()` / `rgba()` / `hsl()` 字面量（零 alpha 的透明命中区与 `color-mix(..., transparent)` 除外） | 复用 `ui-theme/tests/stylesheet-scan.ts` 的 `packageStylesheets()` + `parseRules()` 对 soloips 包目录扫描；官方**无**此门禁，**需新写** | §4.1、§6.1 C1 |
| V2 ⚙ | **未定义 token 零引用**：不出现 §1.7 的 14 个名字 | 收集 `var(--dsw-*)` 引用集与 ui-theme 定义集，断言差集为空 | §1.7（官方侧现存 14 个违约，可作反向样本） |
| V3 ⚙ | **无「中性边框 + elevation 阴影」配对** | 复用 `elevation-styles.client.spec.ts` 的 `neutralBordersBesideElevation()` | 官方已有，全 packages 扫描 |
| V4 ⚙ | **中性实线边框全为 0.5px**；填充式分隔线（1px 高/宽 + border-token 背景）全为 0.5px | 复用 `wideNeutralBorders()` + `wideFilledDividers()`（含 `RING_TRACKS` 白名单） | 官方已有 |
| V5 ⚙ | **全圆形状配 `corner-shape: round`** | 复用 `corner-shape-styles.client.spec.ts` 的 `isFullRound()` + 配对断言 | 官方已有 |
| V6 ⚙ | **零硬编码产品文案** | 把 `soloips-web/src/**` 加入 `scripts/verify-client-ui-i18n.ts` 的扫描根 | 官方已有脚本 |
| V7 | **双语齐备**：`soloips` 命名空间的 `zh`/`en` 键集完全相同 | 类型系统已强制（§5.1）；补充运行期断言即可 | §5.1 |
| V8 | **主题选择器只在 ui-theme**：`soloips-web` 组件 CSS 不含 `data-ds-dark-theme` | 正则扫描 | §6.1 A12 |

### 7.2 目视/截图对比项（实现后与 DSH 原界面并排）

| # | 可检查项 | 对比方法 | 期望 |
|---|---|---|---|
| V9 | **间距刻度一致**：新组件用的 `gap`/`padding` 值属于 §3.2 的 `2/4/6/8/10/12/14/16` 集合 | 扫 CSS 值域 + 截图目视节奏 | 不出现 `5px`/`7px`/`9px` 这类刻度外值（官方现存少数例外如 `gap: 5px`×6，属历史遗留，不作为正向目标） |
| V10 | **圆角落在 §3.3 阶梯**且与同层级官方组件同值 | 卡片 14/16/18/20；控件 8/10；胶囊 `999px`；模态 24 | 与 §2.2 配方表一致 |
| V11 | **三栏几何**：侧栏 280（默认）/ 264–420（拖拽）/ 56（折叠）；右栏 ≥300、≤70%、默认 45%；中栏 ≥400 | 与 `columns.ts` 常量逐值比对 + 拖动实测 | §3.1 |
| V12 | **1024px 断点行为**：视口 < 1024 时侧栏自动折叠为 56px 轨道；此宽下手动展开应压住中栏而非撑开窗口 | 浏览器宽度扫描 | §3.1 `SIDEBAR_AUTO_COLLAPSE` |
| V13 | **浅色主题层级仍可辨**：新卡片在浅色下与背景同色（都 #fff），层级靠 0.5px 描边或 elevation 表达 | 浅色截图 | §3.4 关键事实——**这是最易漏的一条** |
| V14 | **深色主题层级**：base `#151517` → layer-1 `bluish-875` → layer-2 `bluish-850` → layer-3 `bluish-800` | 深色截图取色 | §3.4 表 |
| V15 | **强调色占比**：新界面强调色引用数 / alias 引用总数 **≤ 10%**（官方基线 6.05%） | 计数 + 目视 | §4.1 |
| V16 | **强调色无大面积填充**：不存在 >34px 级的强调色实心块（发送按钮圆、Tag、StateDot、spinner 弧除外） | 截图目视 | §4.4 |
| V17 | **焦点可见**：每个可交互元素 tab 后轮廓可见；卡片类用内缩 `outline-offset: -2px`；对比度可辨（浅色下 `brand-primary` 近黑，深色下近白） | 键盘遍历 | §2.3 |
| V18 | **减少动效**：系统开启 `prefers-reduced-motion: reduce` 后，新界面的过渡/动画全部停用 | 系统设置切换 | §2.3；`docs/web-styling.md:22` |
| V19 | **卡片配方一致**：图标+标题+副标题卡的圆角/内边距/文字尺寸/间距/悬停底色与 §2.2 配方表逐项一致 | 与 `PluginCard` / `AgentPresetSection` 并排 | §2.2 |
| V20 | **浮层阶梯**：新浮层的 z-index 落在 §3.5 阶梯（就地 100 / 子菜单 101 / 模态 1000 / portal 与提示 1100） | 与官方浮层叠加实测 | §3.5 |
| V21 | **浮层描边唯一**：浮层面目视只有一层 0.5px 发丝边（无「边框 + 阴影描边」双线） | 放大截图 | §1.5 规则 2 |
| V22 | **滚动条皮肤**：滚动区在明暗主题下都显示主题拇指；浮层内用 l2、基础面用 l1；无 UA 默认滚动条外露 | 明暗截图 | §2.5 / `docs/web-styling.md:20` |
| V23 | **字号轴随动**：设置字号 12→17 时，新界面的正文与标题按 §1.4 规则随动（正文 = 设置值；次级文本 = 设置−1/−2；small/code 固定） | 设置逐档切换截图 | §1.4 |
| V24 | **品牌替换完成**：不出现官方 whale + `DeepSeek Harness` wordmark 组合；标题为 soloips 品牌名 | 全界面目视 + 查看 `index.html` `<title>` | §6.2 品牌合规 |

### 7.3 反面样本（应主动拒绝的形态）

| # | 形态 | 为什么坏 |
|---|---|---|
| N1 | 卡片用强调色整底 | 官方 44 个强调色消费点中无此形态（§4.4） |
| N2 | 品牌蓝绑 `brand-primary` | 浅色下变黑（§4.3） |
| N3 | 浅色下靠背景色差区分卡片与背景 | 两者都是 #fff（§3.4） |
| N4 | 卡片加 `1px` 中性边框 + `elevation-panel` 阴影 | 双线 + 布局位移（`docs/web-styling.md:25`） |
| N5 | 复制 `PluginCard.module.css` 到自己包并改名 | 应抬成 prop 或复用配方（`ui-primitives/README.md:66`） |
| N6 | 用 `DisclosureRow` 承载「名在上、描述在下」 | 布局语义不符（README:63） |
| N7 | 沿用 §1.7 的未定义 token 名 | 声明整条失效（§1.7） |
| N8 | 新 `--dsw-*` token 定义在 soloips 包内 | 违反颜色权威归属（`docs/web-styling.md:9,30`） |

---

## 8. 待决事项

| # | 待决 | 需要什么信息 | 归属 |
|---|---|---|---|
| Q1 | `soloips-web` 的**品牌色**取何值，绑到哪些 alias token（建议绑 `button-info-fill` / `state-business-primary` / `brand-primary-new-colorprimary-new-color` 一族，见 §4.3） | 品牌视觉决定 | 用户 / 产品 |
| Q2 | 是否向官方报 §1.7 的 14 个未定义 token 缺陷 | 上游协作意愿 | UI 负责人 |
| Q3 | 新增 `DSH_CLIENT_*` 变量后，是否维护独立的构建记录 profile（§6.2 BR1 成本警告） | 构建策略 | architecture-owner |
| Q4 | `soloips-web` 是否保留 `ui-brand-official` 包在 roster 中（当前它只在 `official` profile 下注册，非 official 构建是空操作） | 装配决定 | architecture-owner |
| Q5 | 卡片视觉是否引入「卡片图标着色」这一新约定（官方四例中只交付卡着色，§4.4 规则 4） | UI 决定 | UI 负责人 |
| Q6 | fork 版本与上游 `main` 的对齐状态（本文只核对本机 `0.1.6-alpha.1`，未比对上游） | 上游版本 | architecture-owner |
| Q7 | 本文 §1 的 token 数字随上游变动需重核的**触发条件与责任人**（见 §9） | 流程 | UI 负责人 |

---

## 9. 维护与重核

〔约束〕本文是**静态快照**，对象为 `D:/Source/workspace/deepseek-harness` 的 `0.1.6-alpha.1`（核对日期 2026-09-17）。以下情况**必须重核**：

| 触发 | 需重核的节 |
|---|---|
| fork 合入上游 `ui-theme` / `ui-primitives` / `ui-layout` / `locale` / `ui-brand-official` 的改动 | §0 统计、§1（token 数）、§2（组件目录）、§4（强调色点）、§6.2（定制面） |
| fork 版本号变化 | §0、§9 |
| ui-theme 样式表增删 | §1.1、§1.2、§7.1 V2/V3/V4/V5 |
| `docs/web-styling.md` 增删规则 | §6.1（必守项） |
| SoloIPs 自身界面规范或验收标准变更 | §6、§7 |

**重核的最小命令集**（在 fork 根目录执行）：

```bash
# token 计数与家族分类
rg -oN --no-filename -e '--dsw-[a-z0-9-]+' \
  --glob '!**/node_modules/**' --glob '!**/lib/**' --glob '!**/dist/**' --glob '!**/.worktrees/**' \
  -g '*.css' -g '*.tsx' -g '*.ts' packages apps website | sort -u
# 已定义集合
rg -oN --no-filename -e '(--dsw-[a-z0-9-]+)\s*:' \
  --glob '!**/node_modules/**' --glob '!**/lib/**' --glob '!**/dist/**' --glob '!**/.worktrees/**' \
  -g '*.css' -g '*.ts' -g '*.tsx' packages apps | sort -u
# 强调色占比（在 packages/client 下）
rg -oN --no-filename -e 'var\(--dsw-alias-[a-z0-9-]+\)' -g '*.module.css' . | wc -l
rg -oN --no-filename -e 'var\(--dsw-alias-(brand-primary|button-info-fill|state-business-primary)\)' -g '*.module.css' . | wc -l
# 官方门禁
pnpm run verify-client-ui-i18n
```

---

## 10. 变更历史

| 日期 | 变更 | 变更者 |
|---|---|---|
| 2026-09-17 | 首版：对 DSH fork `0.1.6-alpha.1` 完成 7 项调查（token/组件/布局/强调色/i18n/品牌定制/验收），产出 388 token 与 34 组件的底册事实 | 检索智能体 B（受派任务） |
