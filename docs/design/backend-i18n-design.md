# SoloIPs 国际化（i18n）设计：前端与后端的分层归属

| 阅读契约 | 内容 |
|---|---|
| 身份 | `SOLO-I18N-01`；SoloIPs 跨层国际化设计（后端侧缺口补齐，前端侧承接既有 UI 设计） |
| 目的 | 补齐「后端 i18n」这一真实缺口：确定**哪些文本必须本地化、由哪一层负责、映射表的权威落点在哪、如何验证**，使开发有可依据的规则而非各自解释 |
| 范围 | 文本分类与分层归属、错误码→用户文案映射、服务端生成文本（`gaps[].message` 等）的处置、工具名与工具描述的语言策略、i18n 字典资产与门禁接线。**不含**具体逐条文案（属实现切片）、不含新增语言（属 `addLanguage` 通道） |
| 决策状态 | 〔约束〕核心分层裁定由指挥作出（2026-09-18，用户指示「需要国际化的后端项目，没有就全部补上设计文档」）；事实部分标注〔源码事实〕并附路径/行号 |
| 依据 | [系统助理 UI 设计 §3.4/§7.5](system-assistant-ui-design-v0.1.md)（前端 i18n 现状）、[组织全景 UI 设计 §7](organization-full-ui-design-v0.1.md)、[DSH 设计语言底册 §5](dsh-design-language-v0.1.md)、[data-contract §3.2 A-3/DEV-06](../design/data-contract.md)、DSH fork `packages/client/locale/` 源码 |
| 变更权 | architecture-owner；实现切片不得自行改写本文件的分层规则 |

---

## 0. 问题与结论摘要

**问题**：前端 i18n 已有详尽设计（`ctx.locale.register('soloips', { zh, en })`、键名规范、零硬编码门禁），但**后端侧零设计**——`data-contract.md` 与 `system-assistant-backend-design-v0.1.md` 中 `i18n`/`locale`/`国际化`/`本地化`/`多语言`/`语言` 命中数**均为 0**（2026-09-18 逐词检索复核）。实际存在的中文文本包括：

| 位置 | 规模（2026-09-18 实测） | 性质 |
|---|---|---|
| `packages/core/src/store.ts` | 94 处含中文的字符串 | 诊断 message（`SoloipsCoreError`）与注释 |
| `packages/core/src/contracts.ts` | 8 处 | 类型注释与少量 message |
| `checkOnboarding` 的 `gaps[].message` | 随缺项动态生成 | **服务端生成的用户可见文本** |
| 错误码 `SOLOIPS_CORE_*` | 10 个 | 契约面（非文本） |

**结论（三条核心裁定）**：

1. **规则一：语言分层——core 是语言中立的领域层。** `code` 是契约、`message` 是**面向开发与运维的诊断**，其语言**不参与用户界面**、**不做运行时本地化**。用户可见文案一律由 **web 层**（浏览器半边）按 `code`/`reason` 枚举本地化。
2. **规则二：所有面向用户的文本必须由 web 层从「机器可判定物」映射而来。** 界面**不得**直接显示 core 的 `message`（它是中文诊断，不是用户文案）。映射的最左列是**稳定 id**（错误码、`reason` 枚举、`item` 枚举），**绝不用本地化文本做内部匹配**（底册 C8）。
3. **规则三：字典是唯一拥有译文的地方。** `zh`/`en` 双字典齐备由类型系统强制；文案资产随插件包发布，**不落业务库**。

**一句话**：**core 说「发生了什么（码）」，web 说「怎么告诉用户（文案）」**——本地化是边界层的职责，不是领域层的职责。

---

## 1. 文本分类与分层归属（核心表）

按「谁产生、给谁看」分类，每类指定**唯一负责层**与**本地化要求**：

| # | 类别 | 产生者 | 受众 | 本地化 | 载体与处置 | 依据 |
|---|---|---|---|---|---|---|
| T1 | **错误码**（`SOLOIPS_CORE_*` 10 个） | core | 调用方（web/Host/运维） | **不本地化**（码是契约） | 经 wire 原样传递；web 按码查字典 | §3.2 A-3「`code` 是契约」 |
| T2 | **core 诊断 `message`** | core | 开发者/运维/日志 | **不本地化**（保持单一语言，见 §2） | 仅用于日志、错误归因、运维诊断；**禁止直接上屏** | 本设计 §2 |
| T3 | **结构化判据**（`reason`/`item`/`status` 等枚举） | core | 调用方 | **不本地化**（稳定 id） | 是映射键（最左列）；**禁止用本地化文本替代** | 底册 C8 |
| T4 | **参数化诊断**（`current=N, limit=M` 等） | core | 调用方 | **不本地化**（机器可解析） | 与 T3 同：作为映射的**附件参数**，不整体上屏 | data-contract §4.3 |
| T5 | **用户可见文案**（标题/字段/按钮/提示/错误提示） | **web** | 用户 | **必须本地化（zh+en）** | `soloips` 命名空间字典；经 `t` seat 消费 | UI 设计 §3.4.2 |
| T6 | **工具名**（`soloips_*`，模型面） | core 登记 / Host 注册 | 模型 | **不本地化**（是标识符） | §2.5 已登记形态；语言无关 | data-contract §2.5 |
| T7 | **工具描述**（`description`，模型面） | Host 半边 | 模型 | **单一语言**（见 §5） | 不进用户 i18n 字典；语言选择见 §5 | 本设计 §5 |
| T8 | **模型可见的 system prompt / 工具说明** | Host 半边 | 模型 | **单一语言** | 与 T7 同策；不得依赖界面 locale | 本设计 §5 |
| T9 | **文档内容用户数据**（`document.content` 等） | 用户/员工 | 用户 | **不适用**（用户数据非界面文案） | 原样存储与读回，不翻译 | — |
| T10 | **日志与审计** | Host/adapter | 运维 | **不本地化**（可检索性优先） | 单一语言 + 稳定码；脱敏后外发 | 项目红线 |

**判定法（一句话）**：**问「这句话是给谁看的」**——给用户看 → T5（本地化）；给机器/开发者看 → T1–T4、T6–T8、T10（不本地化，用稳定 id）。

---

## 2. core 诊断 `message` 的语言策略〔约束〕

**现状**：94 + 8 处中文 message，**无任何语言约定**。

**裁定**：

| 项 | 规则 |
|---|---|
| 语言 | **保持单一语言（中文）**，不引入运行时本地化。理由：① core 无 locale 依赖（领域层不依赖界面机制）；② message 的受众是开发者/运维，本地化对它们无收益、徒增每命令一次 locale 查询与字典加载；③ 错误码已承担机器可判定职责，「同一事实只生成一次可靠证据」 |
| **禁止上屏** | **界面不得直接把 `message` 渲染给用户**。它是**诊断**（DEV-06 的「可行动说明」面向开发者），用户文案由 web 按码映射（T5） |
| 例外允许直显 | 仅当**明确设计**为终端用户可读的字段（如某些 `gaps[].message`，见 §4）——须由该字段的**契约条文**显式声明，不得由实现者自行判断 |
| 语言若变化 | 属**契约变更**（影响所有断言 message 文本的测试），须走三阶段门禁 |

**既有测试的影响**：`scope-role.spec.ts` 等有断言中文 message 的用例（如 `toThrow(/先撤销既有任职/)`、`/无法判定作用域/`）。**这些断言留在 core 层是合适的**（core 测 core 的诊断文本，与用户界面无关）——**不因本设计而删除**，但**不得**把这类断言的文本当作「用户文案已就绪」的证据。

---

## 3. 错误码 → 用户文案的映射（权威落点裁定）〔约束〕

**问题**：UI 设计稿要求「`SOLOIPS_CORE_*` 须映射为本地化文案」，但**映射表的权威落点未指定**——散落在 UI 稿的键名建议里，不是契约。

**裁定**：

| 项 | 规则 |
|---|---|
| **权威落点** | **web 包**（`soloips-web`）内的**显式映射表**：`code → i18n key`。落点文件建议 `packages/web/src/client/i18n/error-codes.ts`（实现切片可调，但**必须唯一且被测试钉住**） |
| 为什么不在 core | core 不得依赖界面机制的键名（否则领域层耦合 UI 词汇）；键名的增删属界面演进 |
| 为什么不在契约正文 | 契约登记**码**（已有），不登记**文案键**——文案随界面迭代，码随领域演进，两者节奏不同 |
| **完备性要求** | 映射必须**覆盖全部 10 个 core 码** + adapter 侧码 + 新增码；**缺失即失败**（测试断言：`SoloipsCoreErrorCode` 的每个成员都在映射表中有条目——用 `Record<SoloipsCoreErrorCode, string>` 类型强制 + 运行期双向断言，范式同 `KNOWN_OPERATION_KIND_LIST`） |
| 未知码 | **回退到通用文案**（如 `soloips.error.unknown` + 码本身作为**可复制诊断**），**不得**显示 core 的中文 message，**不得**显示空白 |
| 参数 | 结构化参数（`current`/`limit` 等，T4）作为**占位符实参**传入字典条目（`{current}`/`{limit}`），不拼接字符串 |

**映射表骨架**（实现切片填文案，此处只定键位）：

| code | i18n key（建议） | 说明 |
|---|---|---|
| `SOLOIPS_CORE_CONFIG_INVALID` | `soloips.error.configInvalid` | 部署配置错误——面向管理员 |
| `SOLOIPS_CORE_ADAPTER_INVALID` | `soloips.error.adapterInvalid` | 同上 |
| `SOLOIPS_CORE_STORE_CLOSED` | `soloips.error.storeClosed` | 只读态提示 |
| `SOLOIPS_CORE_LEASE_NOT_HELD` | `soloips.error.leaseLost` | 写权失守——**不自动重试**（红线） |
| `SOLOIPS_CORE_LEASE_CHECK_FAILED` | `soloips.error.leaseUnknown` | 写权状态未知 |
| `SOLOIPS_CORE_VALIDATION` | `soloips.error.validation` | 输入校验失败（可字段定位） |
| `SOLOIPS_CORE_PRECONDITION` | `soloips.error.precondition` | 状态不允许（如「已有总助理」） |
| `SOLOIPS_CORE_CONFLICT` | `soloips.error.conflict` | operationId 复用冲突 |
| `SOLOIPS_CORE_ACCOUNT_MISMATCH` | `soloips.error.accountMismatch` | 账户绑定不符 |
| `SOLOIPS_CORE_RECORD_INVALID` | `soloips.error.recordInvalid` | 介质数据损坏 |
| `SOLOIPS_ADAPTER_*`（各端口码） | `soloips.error.adapter.<域>` | adapter 失败分类 |

---

## 4. 服务端生成的用户可见文本（`gaps[].message`）〔约束〕

**问题**（UI 稿 §7.5 登记的〔待决〕，PRD Q12）：`checkOnboarding` 的 `gaps[].message` 是**服务端生成的字符串**，是否本地化未知；界面若直接显示，则中文界面在英文环境下会出现中文。

**形状事实**〔源码事实〕：`SoloipsOnboardingGap` 是**结构化**的——

```ts
{ item: SoloipsOnboardingGapItem;      // 9 值
  reason: SoloipsOnboardingGapReason;  // 10 值
  message: string;                     // 诊断
  documentType?; documentDetail?; capability? }
```

`item` × `reason` 是**机器可判定的稳定枚举**，足以定位文案。

**裁定**：

| 项 | 规则 |
|---|---|
| **界面不显示 `message`** | 按 `item` + `reason`（+ `documentType`/`capability` 参数）**自行映射**到 i18n 键（T5）。这与 §2「core message 不上屏」一致 |
| **键位命名** | `soloips.onboarding.gap.<item>.<reason>`，例：`soloips.onboarding.gap.profile.documentMissing`、`soloips.onboarding.gap.capability.capabilityNotVerified` |
| **完备性** | 9 × 10 = 90 组合**不必全定义**（部分组合不可达）；**但**：凡实现可达的组合**必须有键**——由测试穷举可达组合（对照 `evaluateOnboarding` 的分支），缺失即失败 |
| 回退 | 未定义组合 → `soloips.onboarding.gap.generic` + `reason` 作为可复制诊断；**不得**显示 core `message` |
| `message` 的用途 | 保留给**日志与开发者**（T2）；界面**可以**提供「复制诊断信息」入口（供用户报障） |

**同类项**：任何其他「core 生成、可能上屏」的文本一律按本条处理（先查是否有结构化判据；有则映射，无则**先补结构化判据**再映射——**不得**直接上屏中文）。

---

## 5. 模型面文本（工具名 / 工具描述 / prompt）〔约束〕

| 项 | 裁定 |
|---|---|
| **工具名**（T6） | 语言无关标识符（§2.5 已登记 `soloips_<域>_<动作>`）；**不因 locale 变化** |
| **工具描述**（T7） | **单一语言（英文）**。理由：① 工具面是**模型输入**，不是用户界面；② 模型对英文工具描述的支持最稳定；③ 若随界面 locale 变化，同一会话内换语言会导致工具语义漂移、破坏可复现性；④ §2.5.1 已把工具面与用户 Remote 面分离，语言策略独立 |
| **模型可见说明**（T8） | 与 T7 同策（英文）；**不得**依赖 `ctx.locale` |
| **不在工具描述里塞用户文案** | 卡片标题等属 T5，由 web 按工具名映射（`tool.call.toolview` 按 key 分派，UI 稿 §6）；工具描述只写**给模型的调用说明** |
| 待复核 | 若后续实测发现模型在中文语境下对英文描述的理解劣化，可复议（届时须附实测证据） |

---

## 6. 字典资产与工程接线〔约束〕

| 项 | 规则 | 依据 |
|---|---|---|
| 命名空间 | `soloips`（单命名空间，不拆多个） | UI 设计 §3.4.2 |
| 注册 | `ctx.locale.register('soloips', { zh, en })`，在**浏览器半边** `apply` 内 `ctx.effect(...)` 包裹（范式同 DSH `ui-chat`/`ui-approval`） | 〔源码事实〕fork `packages/client/ui-chat/src/client/apply.ts:78` |
| 消费 | `ctx.locale.bind('soloips')` 得 `t`；或经 slot 的 `locale: NS` 声明由框架注入 | 同上 |
| 字典位置 | `packages/web/src/client/locales/{zh,en}.ts`（**唯一允许含译文的源文件**） | 底册 §5.5 |
| 类型强制 | 命名空间经 `declare module` 合并进 `LocaleNamespaceMap`，**键联合类型校验**；缺 `zh` 或 `en` 即编译错误 | 〔源码事实〕fork `packages/client/locale/src/client/index.ts:39-46`、`:370` |
| `common` 复用 | `ok`/`cancel`/`close`/`save`/`loading`… **优先复用** `common` 命名空间，只在本命名空间定义业务专有词 | 底册 §5.3 |
| **零硬编码门禁** | **本仓目前没有该门禁**——`pnpm run verify-client-ui-i18n` 存在于 **DSH fork**（`deepseek-harness/scripts/verify-client-ui-i18n.ts`），本仓 `package.json` 无此脚本（2026-09-18 实测）。**处置**：本仓新增一个薄封装脚本（复用 fork 脚本的检测逻辑或独立实现），在**本项目切片**内接线到五门之一；**不得**声称「已有门禁」 | 见下 |
| 门禁的触发面 | 扫描根 = `packages/web/src/client/**`（**不含** `locales/` 目录）；覆盖 JSX 文本 + 携带文案的属性（`alt`/`aria-label`/`placeholder`/`title`/`label`/`description`…） | fork 脚本 `COPY_ATTRIBUTES` |
| 不得做 | 不引入第三方 i18n 库、不自建语言切换器、不写第二份字典格式 | PRD C-11 |

**门禁归属裁定**：UI 设计稿写「仓库有自动化门禁」是**对 fork 脚本的引用**（底册 §5.5 的 `V6 ⚙` 明说动作是「把 `soloips-web/src/**` 加入该脚本的扫描根」），本仓当前**没有**等价物。本设计**登记为待实现**：i18n 实现切片须同时交付本仓的门禁接线（**不得**只写文案不接门禁，否则「零硬编码」不可验证）。

---

## 7. 验证要求（切片级）〔约束〕

每个 i18n 相关切片至少验证：

| # | 项 | 方法 |
|---|---|---|
| V1 | 双字典齐备 | 类型层（键联合缺失即编译失败）+ 运行期键集对比（`zh`/`en` 键集合相等） |
| V2 | 错误码映射完备 | `Record<SoloipsCoreErrorCode, string>` 类型强制 + 运行期双向断言（不漏不多） |
| V3 | `gaps` 映射可达组合完备 | 按 `evaluateOnboarding` 分支穷举可达 `item×reason`，逐一断言有键 |
| V4 | **无中文硬编码** | 门禁脚本（§6 待接线）+ 反例：塞一条中文文案应使其失败 |
| V5 | **无中文上屏** | 反例探针：模拟失败路径，断言界面渲染的文本**不包含** core `message` 的中文子串 |
| V6 | 键缺失回退可见 | 故意删一个键 → 界面显示 key 本身（开发期可见）——**不得**作为交付状态 |
| V7 | locale 切换即时生效 | 切换后无 reload 即更新（机制行为，集成环境验证） |

---

## 8. 与既有文档的关系

| 文档 | 关系 |
|---|---|
| `system-assistant-ui-design-v0.1.md` §3.4/§7.5 | **前端机制与键名规范的真源**；本设计不重复，只补齐后端侧并裁定其两处〔待决〕（`gaps.message`、映射表落点） |
| `organization-full-ui-design-v0.1.md` §7 | 新增键清单（建议）；本设计确认其键名格式约定 |
| `dsh-design-language-v0.1.md` §5 | fork 侧机制事实真源（`SOLO-UI-DL-01`）；本设计 §6 引用其事实，并**更正**「本仓已有门禁」的表述 |
| `data-contract.md` | 本设计的**契约侧落点**：§2.7（新增）登记分层规则与映射表归属；`code`/`reason`/`item` 枚举的既有条文不变 |
| `system-assistant-backend-design-v0.1.md` | 其 BE-6 等切片描述**未含** i18n 责任；本设计补齐（Host 半边负责 T7/T8，web 浏览器半边负责 T5） |

---

## 9. 待决事项（本设计未关闭的）

| # | 事项 | 归属 |
|---|---|---|
| Q-1 | 门禁脚本的实现方式：复用 fork 脚本逻辑（复制并适配）还是自研轻量版 | **已裁定**（见下） |
| Q-2 | `gaps` 的 90 组合中哪些**不可达**（需对照 `evaluateOnboarding` 实证） | **已实证**（见下） |
| Q-3 | 错误文案的参数化细节（诊断串如何解析为参数） | **已实证并推翻假设**（见下） |
| Q-4 | 是否需要在 Host 半边也暴露「已本地化」的读面（当前裁定：**不需要**，本地化全在浏览器侧） | 复议触发：若出现服务端渲染需求 |

### Q-1 裁定：自研轻量版（i18n-1 交付）

**裁定：采用 i18n-1 的自研轻量门禁**（`scripts/development/verify-client-ui-i18n.mjs`），不复制 fork 脚本。理由：① fork 脚本的扫描根覆盖 `apps/desktop`、`packages/client/*` 等本仓不存在的目录，移植会带入无意义分支；② i18n-1 版的**排除规则窄于 fork**（fork 还按 basename 排除任意目录下的 `locale.ts`/`locales.ts`，本仓版只排除 `locales/` 目录）——豁免口更少意味着更强的检查，方向正确；③ 保留最小扫描数守卫（防「扫描面被误缩成空集」的假绿），与 fork 同构。

**待复核**：i18n-2 落地后复核 `MINIMUM_SCANNED_CLIENT_SOURCES` 的取值（当前 2，为交付时实测下限）。

### Q-2 实证结论：90 组合中 **19 个可达**、71 个不可达

**实证方式**（非注释声明）：i18n-1 的测试从 `packages/core/src/onboarding.ts` 提取 `gap(...)` 调用点、把 `documentType` 展开为 `REQUIRED_DOCUMENT_TYPES` 四值，与映射表做**双向相等**断言。

可达集：`employee × employee-not-found`；`appointment × {appointment-missing, appointment-revoked}`；`{profile, avatar, soul, operating} × {document-missing, document-content-invalid, document-owner-mismatch}`（12）；`memory × memory-not-initialized`；`capability × capability-not-verified`；`assembly × {assembly-evidence-missing, assembly-evidence-stale}`。

**维护契约**：`evaluateOnboarding` 新增分支而映射表未跟上时，该双向断言**即失败**——这是 §4「可达组合必须有键」的执行机制。

### Q-3 实证结论：**当前代码不存在参数化诊断串**（推翻原假设）

原假设（本设计 §3 表格与 §9 Q-3）：诊断串含 `current=N, limit=M`、`subsidiary_requires_parent` 等形态，需要解析为字典参数。

**实测结论：该形态在当前代码中不存在**（`grep "current=\|limit="`、`subsidiary_requires_parent`、`limit_exceeded` 在 `packages/core/src` + `packages/adapter-dsh/src` **零命中**）。故 i18n-1 **不写 message 解析器**：字典参数只来自**结构化字段**（`code`/`reason`/`capability`），永不来自 `message`。

**这同时是 I18N-1 的最强形态**：参数不依赖诊断文本，诊断文本的语言变化不可能影响用户文案——比「解析 message」在结构上更安全。

**边界（属 BE-5 的交付责任）**：配额拒绝若引入带数值的**结构化**字段（而非只写进 message），须在 BE-5 中按本设计的映射机制（参数来自结构化字段）暴露，**不得**改回「解析 message」。

---

## 变更历史

| 日期 | 变更 | 变更者 |
|---|---|---|
| 2026-09-18 | 创建 v0.1：用户指示「需要国际化的后端项目，没有就全部补上设计文档」；取证（core 零 i18n 设计、102 处中文串、门禁在 fork 不在本仓）→ 三条核心裁定（语言分层 / 映射表落点 / 字典唯一）+ 7 类文本分层表 + `gaps` 与模型面语言策略 + 验证要求 7 项 | 指挥（C），依据用户 2026-09-18 指示 |
| 2026-09-18 | **i18n-1 交付回写**：①**Q-1 裁定**为自研轻量门禁（不移植 fork 脚本；排除规则窄于 fork、保留最小扫描数守卫）；②**Q-2 实证**90 组合中 19 可达/71 不可达（双向相等断言，`evaluateOnboarding` 改而映射未跟上即失败）；③**Q-3 推翻原假设**——当前代码**不存在**参数化诊断串（逐词零命中），故不写 message 解析器，参数只来自结构化字段（这是 I18N-1 的最强形态），配额若引入数值须走结构化字段而非解析 message | i18n-1 交付（Issue #42）；指挥核实并裁定 |
