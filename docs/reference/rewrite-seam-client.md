# 源码参考：seam 层 · client 层 · 打包结构

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | SOLO-REF-SEAM-CLIENT；源码参考文档（参考重写用），第 1+2 步分工之一 |
| 目的 | 为 SoloIPs 用 TypeScript 重写时，提供 seam 层、客户端层与包结构的可复用设计、必须改写的边界与候选缺陷清单 |
| 范围 | `COMPANY_CORE_CHECKOUT/src/plugin/`（4 文件）、`src/public-api.ts`、`src/client/`（70 文件）、`package.json`、`cordis.patch.yml`；并与 `REPAIR_RELEASE_CHECKOUT` 对账。不含 host 业务域建模、存储后端、任务状态机 |
| 决策状态 | 本文为〔源码事实〕登记与〔建议〕取舍；不构成实现授权，不改变 ARCH-D01–07 已定技术约束 |
| 证据范围 | 两候选均为 `dsh-agent-swarm` 0.1.5、private、MIT；COMPANY_CORE_CHECKOUT HEAD `4c6d05ef30452df2b7adbfb24d625aef4e58f239`；REPAIR_RELEASE_CHECKOUT HEAD `d5d28b685b3a29c355336a7616f577f2f7a312e7`（41 处已跟踪修改，HEAD 不足以标识完整候选）。本轮只读、未运行、未启动服务 |
| 依据 | `docs/governance/doc-format.md`（SOLOIP-DOC-001；原 `agent-readable-documentation.md` 已删除）；`docs/technical-architecture.md` 第 5、8、9 章；`docs/operations/environment-handoff.md` ENV-02 |
| 变更权 | 队长合并入唯一正文；写者不单独改本文结论 |

## 1. 结论摘要

- **seam 层设计可直接照搬**（SEAM-01–09）：模块增强 + `ctx.provide` 服务名 + `apply(ctx, config)` + settings namespace 是可复用骨架；`company-stack.ts` 的"先取 lease 再开写面、逆序释放"是正确设计，应当照搬。
- **包结构契约可直接照搬形状**（PKG-01–05），但 `dsh.client.inject` 的 15 条清单要按实际消费裁剪。
- **client 层基本全部丢弃**（丢弃项 CLIENT-D1–D5）：70 个文件中仅少量概念仍需要（读投影分类、绑定一致性断言、名册计数口径、官方 Remote 与 slot 用法、会话节点范式 = CLIENT-K1–K6），实现一律重写。
- **两候选在 client/plugin 层的差异是单向的**：repair-release 多 6 个纯读模型模块（.ts 45 vs 39），company-core 多 2 个 plugin 文件（company-stack/company-recovery）；两者都**没有**自建 ConversationNodeDefinition——该示例只存在于 `company-core/ref/dsh-agent-teams/source/src/client/` 的参考副本里。

## 2. seam 契约（要照搬的设计）

### 2.1 公开面与模块增强

| ID | 契约 | 参考位置（仅作证据） | 重写取舍 |
| --- | --- | --- | --- |
| SEAM-01 | 独立公开面文件，只做 re-export 与模块增强，不承载组合根 | `COMPANY_CORE_CHECKOUT/src/public-api.ts`（246 行） | 照搬：SoloIPs 的 `soloips-core/public-api.ts` 采用同一形状 |
| SEAM-02 | 通过 `declare module '@deepseek-ai/cordis' { interface Context { … } }` 声明自有服务类型 | 同上 :5–10（`agentSwarmPrivateMemory`） | 照搬形状，服务名改为 `soloips*` |
| SEAM-03 | 模块增强分散在 11 个文件，各自声明自己拥有的服务面 | `public-api.ts:5`、`rpc/read-rpc-service.ts:35`、`plugin/company-stack.ts:216`、`human/host-context-service.ts:286`、`host/host-read-service.ts:19`、`host/producer-floor-service.ts:26`、`human/human-interaction-contract.ts:185`、`human/human-control-gateway.ts:27`、`runtime/permission-surface.ts:23`、`runtime/runtime-contract.ts:102`、`runtime/workflow/team-bridge-engine.ts:38` | 〔建议〕SoloIPs 收敛为"每个服务面一个声明文件"，避免 11 处分散 |

### 2.2 组合根 apply

| ID | 契约 | 参考位置 | 重写取舍 |
| --- | --- | --- | --- |
| SEAM-04 | 插件入口签名 `export async function apply(ctx: Context, config: ConfigInput): Promise<void>`；入口只做装配，业务在 runtime/domain | `src/plugin/apply.ts:57`（524 行） | 照搬签名与分层 |
| SEAM-05 | 官方依赖只经 9 条 `@deepseek-ai/*` import（cordis、cordis-plugin-loader、dsh-agent、dsh-settings、dsh-session、dsh-session-persistence、dsh-storage-domain、dsh-subagent、dsh-system-prompt） | `src/plugin/apply.ts:2–11` | 照搬：这是"official-first"的可核对证据面 |
| SEAM-06 | settings 注册：`ctx.settings.register(NAMESPACE, Schema, { base, applies: 'restart', validate })`；Settings 未就绪时先 `ctx.inject(['settings'], …)` 延迟注册；已就绪时先取用其值再构造 runtime | `src/plugin/apply.ts:58–88` | 照搬。`applies: 'restart'` 与 ARCH-D04 的 startup 语义一致 |
| SEAM-07 | 关闭开关：`if (config.enabled === false) return` 在任何副作用之前 | `src/plugin/apply.ts:89` | 照搬 |
| SEAM-08 | 服务发布统一走 `ctx.provide(name, service)` 并在 `ctx.effect` 内返回 unprovide：`agentSwarmOrgAssembly`(:158)、`agentSwarmPrivateMemory`(:281)、`agentSwarmPermission`(:315)、`agentSwarmHumanControl`(:382)、`agentSwarmHumanInteraction`(:383)、`agentSwarmWorkflow`(:448) | `src/plugin/apply.ts` | 照搬：provide/effect 配对是可回收装配的基础 |
| SEAM-09 | 配置 schema 用 schemastery（`import z from '@deepseek-ai/schemastery'`），namespace 常量 `AGENT_SWARM_SETTINGS_NAMESPACE = 'agent-swarm'`；配置项全部在单一 `Config` interface 上声明（含 companyStack / companyStorageRoot） | `src/plugin/config.ts:1,11,17–66,84–86` | 照搬：单一配置面 + 常量 namespace |

### 2.3 company-stack：最值得照搬的装配顺序

| ID | 契约（不变量） | 参考位置 | 失败边界 |
| --- | --- | --- | --- |
| SEAM-10 | **单维护者**：同一 Context 上第二个 company stack 在任何写入前被拒 | `src/plugin/company-stack.ts:123–125`（`COMPANY_BACKEND_NAME='company_json'` :67） | 拒绝即无副作用（ownership-free refusal） |
| SEAM-11 | **一对多值同源**：backend 与 DomainFacility 由同一个 canonical root 构造，先 register 再 new facility，避免"声明 json 实际路由别的后端" | 同上 :126–131 | 构造失败时反向 unregister + close |
| SEAM-12 | **先取 lease，后开写面**：`CompanyWriterLease.acquire({ root })` 必须在任何写面存在之前完成（注释原文 *BEFORE any write face of this generation exists*） | 同上 :132–145 | acquire 失败 → unregister + backend.close() + 抛错 |
| SEAM-13 | **写面在窗口内打开**：ORG 服务在持有 lease 的窗口内 open；失败则 closeAll → unregister → backend.close → lease.dispose（逆序全回退） | 同上 :146–159 | 无半装配残留 |
| SEAM-14 | **逆序释放**：close() = 先关写面（orgAssets），再 closeAll 兜底，再 unregister/backend.close，最后 lease.dispose；幂等 | 同上 :160–183 | 重复 close 无副作用 |
| SEAM-15 | 派生服务面通过同一 facility 打开，且用同一权威解析（`openCompanyDepartments` 用 stack.orgAssets 解析 appointment，不建并行注册表） | 同上 :186–208 | 调用方负责在 stack 关闭前先关该面 |

**〔建议〕照搬理由**：这条顺序把"锁在介质上、写面在锁内、释放逆序"变成结构性质，而不是靠调用约定；与 `docs/technical-architecture.md` SOLO-FENCE-01 / §7.2 的跨进程独占要求同向。

### 2.4 全局缺陷（不要继承）

| ID | 缺陷 | 后果 | 重写要求 |
| --- | --- | --- | --- |
| SEAM-X1 | `organization-assets.ts:78` 的 `input.facility ?? input.ctx?.storageDomain` 回退 | 可绕过 lease 直接走 host facility | **禁止任何 facility 回退**：facility 必须显式传入且来自 stack |
| SEAM-X2 | `organization-assets.ts:58` 锁为 `new Map<string, Promise<void>>()` | 纯进程内，跨进程无效 | 用文件系统级 writer lease，不用内存 Map |
| SEAM-X3 | 该 service 内 ≥7 处 `withLock` 写路径未走 `CompanyWriterStore.commit` | 写路径旁路唯一提交点 | 所有写入必须经单一 commit 入口 |
| SEAM-X4 | `getEmployeeOnboardingGaps` 只查资料引用与头像存在性；保留 `ORG_ALLOW_LEGACY_UNBOUND` | 未构成 ORG-03 完整准入，且有旁路 | 按 ORG-03 实现完整准入，不保留 legacy 旁路 |
| SEAM-X5 | `captureWorktreeDiff` 只捕获 Git 工作树差异 | 不能宣称视频等素材已长期保存 | 素材保存须有真实字节与版本读回证据 |

## 3. 包结构契约

| ID | 契约 | 参考位置 | 重写取舍 |
| --- | --- | --- | --- |
| PKG-01 | `exports` 必须为宿主、client、bundle patch 分别提供子路径：`"."`、`"./client"`、`"./skills"`、`"./cordis.patch.yml"`、`"./package.json"` | `COMPANY_CORE_CHECKOUT/package.json:9–24` | 照搬形状（`./skills` 按需） |
| PKG-02 | `dsh.bundle.patch` 指向本包 `cordis.patch.yml`；`dsh.client` 声明 `platform: 'web'` 与 `inject` 清单 | 同上 :41–65 | 照搬；inject 清单必须按实际消费裁剪（见 §4.4 三条线） |
| PKG-03 | patch 用 `- insert:` 一个默认启用的结构组（`cordis:group` + 子行 `dsh-agent-swarm` + `inject: [settings]` + 配置），并显式说明"启用组不等于自动建队/派成员" | `cordis.patch.yml:10–24`（两候选逐字相同） | 照搬结构与注释习惯 |
| PKG-04 | 需要改官方行时必须**整行重述**：参考对官方 connection 行重述 `inject: [webRuntime, webServer]` | `cordis.patch.yml:29–31` | 照搬；这印证技术架构 SOLO-C03/CLIENT-F03 |
| PKG-05 | 版本/依赖：两候选都是 0.1.5 / private / MIT；company-core 依赖 `@deepseek-ai/dsh-atomic-write@0.1.5-rc.2` + `zod ^4.4.3`，repair-release 只依赖 `zod` | `package.json:2–3,32,37–40`（CC）vs `37–39`（RR） | 〔推断〕company-core 把原子写收敛为官方包依赖，方向更正确；重写应显式依赖官方原子写能力而非自造 |

## 4. client 层取舍

### 4.1 规模事实

| 项 | company-core | repair-release |
| --- | --- | --- |
| `src/client` 顶层文件 | 70（.ts 39 + .tsx 31） | 76（.ts 45 + .tsx 31） |
| 仅在 RR 存在 | — | `team-dashboard-paging.ts`、`team-dashboard-presentation.ts`、`team-dashboard-read-guards.ts`、`directory-read-resilience.ts`、`team-read-outcome.ts`、`team-roster-projection.ts` |
| 仅在 CC 存在 | 顶层无 | — |
| 参考副本（非本候选实现） | `company-core/ref/dsh-agent-teams/source/src/client/`（13 文件） | — |

### 4.2 直接丢弃

| ID | 丢弃对象 | 参考位置 | 理由 |
| --- | --- | --- | --- |
| CLIENT-D1 | 全部 React 组件（31 个 .tsx） | `src/client/*.tsx` | SOLO-02：UI 只做投影；首版复用 DSH Web |
| CLIENT-D2 | 自建 RPC channel 客户端 | `goal-rpc-client.ts:3,15`、`public-rpc-client.ts:8,33`、`retirement-client.ts:3,36,62`、`work-rpc-client.ts:2,14`（两候选都有） | **反例**：不走官方生成 Remote，换界面需重写传输层（见技术架构 CLIENT-11） |
| CLIENT-D3 | 业务草稿落 IndexedDB | `goal-draft-store.ts:37`(`swarm.goal.drafts`)、`public-draft-store.ts:28`(`swarm.public.drafts`)、`work-request-draft-store.ts:14`(`swarm.work.drafts`)、`draft-indexed-db.ts:12` | **反例**：客户端可写业务状态，违反 CLIENT-09/12 |
| CLIENT-D4 | 业务态落 sessionStorage | `team-dashboard-plugin.ts:98,103–105` | 同上 |
| CLIENT-D5 | 参考副本 `ref/dsh-agent-teams/` | `company-core/ref/dsh-agent-teams/source/src/client/` | 参考仓库不是运行依赖；不得进入产品 |

### 4.3 概念保留、实现重写

| ID | 保留的概念 | 参考位置 | 重写方式 |
| --- | --- | --- | --- |
| CLIENT-K1 | **诚实读结果分类**：区分 forbidden（仅真授权拒绝）/ transport / stale / moved-revision，"重试只用于可能变化的条件" | `REPAIR_RELEASE_CHECKOUT/src/client/team-read-outcome.ts`（纯函数，注释点名 ORG-A07 与 2026-09-15 事故） | 保留分类语义，重写为 host 投影契约的一部分 |
| CLIENT-K2 | **绑定一致性断言**：两次不同时刻读到的权威必须描述同一个 Team，否则报 `SWARM_UI_BINDING_CHANGED` | `REPAIR_RELEASE_CHECKOUT/src/client/team-dashboard-read-guards.ts:15–19` | 保留为读投影不变量 |
| CLIENT-K3 | **名册计数口径**：历史（`removed`）行永不计入当前成员，头部徽标 = 当前席位 + Captain | `REPAIR_RELEASE_CHECKOUT/src/client/team-roster-projection.ts:12–45` | 保留口径，作为投影规则而非组件逻辑 |
| CLIENT-K4 | **官方 Remote 的正确用法** | `team-dashboard-plugin.ts:86,116,117`（`ctx.remote.session.modelCatalog` / `.session.prompt` / `.subagents.prompt`） | 照搬：SoloIPs 业务数据面一律走官方生成 Remote |
| CLIENT-K5 | **官方 slot 扩展点** | `team-dashboard-plugin.ts:146`(sidebar.right.pane.tab)、`:150/155`(main.conversation)、`:176`(conversation.session.header.actions)、`:180`(settings.plugin.item) | 保留插槽用法；按技术架构 CLIENT-D02 由用户裁决长期占用范围 |
| CLIENT-K6 | **ConversationNodeDefinition 官方范式**（若将来做会话内业务卡） | `company-core/ref/dsh-agent-teams/source/src/client/agent-teams-card-definition.ts:69–118`：`match` 只做身份提取（`tool/call` → start、`tool/result` → update）、`buildViewNode` 只在 accepted 后物化、`anchorSeq` 取持久 seq | 照搬范式，**不照搬**其折叠第一方 tool 事件的做法（SoloIPs 应发自有业务事件） |

### 4.4 客户端侧必须守住的三条线

1. 业务事实只在 Host；client 零可写业务状态（CLIENT-09/12）。
2. 数据面走官方生成 Remote，不自建 channel（CLIENT-11）。
3. 渲染只用 `uiConversation.events.register` + `slots.register` 两条官方入口（CLIENT-05）。

## 5. 对账表：company-core vs repair-release

| 能力 | company-core | repair-release | 差异 | 我方取舍 |
| --- | --- | --- | --- | --- |
| 插件入口 `apply.ts` | 有（524 行） | 有 | CC 含 company 装配内联 | 以 CC 为 seam 参考 |
| `config.ts` | 有（213 行，含 companyStack/companyStorageRoot/privateMemoryRecall） | 有 | CC 多 company 配置面 | 以 CC 为参考 |
| `company-stack.ts` | **有**（221 行） | 无 | 仅 CC | **照搬设计** |
| `company-recovery.ts` | **有** | 无 | 仅 CC | 参考其恢复出口，按 ORG-13 重写 |
| `public-api.ts` | 有（246 行） | 〔未验证〕本次未逐行比对 | — | 以 CC 为参考 |
| `cordis.patch.yml` | 有 | 有 | **逐字相同** | 直接采用形状 |
| `package.json` `dsh` 段 | 有 | 有 | inject 清单相同 | 直接采用形状 |
| 依赖 | `dsh-atomic-write@0.1.5-rc.2` + zod | 仅 zod | CC 多官方原子写依赖 | 采用 CC 方向 |
| client 顶层文件 | 70 | 76 | RR 多 6 个纯读模型 .ts | 概念取 RR，实现重写 |
| client 自建 RPC channel | 有（4 个客户端文件） | 有（同上） | 相同 | 均不继承 |
| client IndexedDB/sessionStorage 草稿 | 有（4 处） | 有（同上） | 相同 | 均不继承 |
| client ConversationNodeDefinition | 无（仅 ref 副本） | 无 | 相同 | 参考副本范式 |
| client 官方 slot 注册 | 4 处（同 RR） | 4 处 | 相同 | 保留概念 |
| 官方 client 包 inject 清单 | 15 条 | 15 条 | 逐字相同 | 按实际消费裁剪 |

**〔推断〕** 两候选在 client/plugin 层的分叉是"CC 侧重装配与公司生命周期、RR 侧重读模型健壮性"，因此**不能选单一基线**：seam 取 CC，读模型口径取 RR。

## 6. 重写清单（供实现直接引用）

**可直接照搬设计**：SEAM-01/02/04/05/06/07/08/09/10/11/12/13/14/15、PKG-01/02/03/04。

**必须改写**：SEAM-03（收敛声明位置）、SEAM-X1–X5（五条全局缺陷）、CLIENT-D2/D3/D4（数据面与本地状态）、PKG-02 的 inject 裁剪。

**必须丢弃**：CLIENT-D1（31 个 .tsx）、CLIENT-D5（ref 参考副本）。

**必须保留的概念**：CLIENT-K1–K6。

## 7. 复核范围

- **实际打开并核对**：`COMPANY_CORE_CHECKOUT` 的 `src/public-api.ts`（全文 246 行）、`src/plugin/apply.ts`（1–120、250–309）、`src/plugin/company-stack.ts`（全文 221 行）、`src/plugin/config.ts`（1–90）、`package.json`（1–90）、`cordis.patch.yml`（全文）；`REPAIR_RELEASE_CHECKOUT` 的 `package.json`、`cordis.patch.yml`、`src/client/team-roster-projection.ts`（1–45）、`src/client/team-read-outcome.ts`（1–30）、`src/client/team-dashboard-read-guards.ts`（1–25）；`company-core/ref/dsh-agent-teams/source/src/client/agent-teams-card-definition.ts`（全文 118 行）。grep 核对：`ctx.provide`、`declare module '@deepseek-ai/cordis'`、`PUBLIC_RPC_CHANNEL`、`indexedDB|sessionStorage|localStorage`、`slots.register|slots.inject`、`ctx.remote.`、`uiConversation|ConversationNodeDefinition`。
- **未复核**：`apply.ts` 120–250 与 309–524 的完整正文；`config.ts` 90–213；两候选 `public-api.ts` 的逐行比对；`src/client` 各文件正文（仅按文件名、grep 命中与 6 个 RR 专有文件的开头判定）；`src/rpc/*` 服务端 channel 实现；`ref/dsh-agent-teams` 其余 12 个文件；测试目录。
- **无法核对**：两候选的运行时行为与激活结果（未启服务、未运行）；`REPAIR_RELEASE_CHECKOUT` 的完整候选内容（41 处已跟踪修改，HEAD 不足以标识）；`company-core` 未跟踪文件；55120 上实际生效的 client 组合图。
- **本文不蕴含**：登记某条设计等于已实现；照搬 seam 形状等于产品可用；两候选的既有缺陷已在本轮修复。

*（本文为参考重写材料，最终合并由队长执行。）*
