# 组织全景（P1）后端设计规划 v0.1

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-ORG-FULL-BE-01`；组织全景 P1「双向覆盖」的**领域/服务侧**后端设计 |
| 目的 | 给出智能编组、入团自动三步、子公司、任务领取四个面的领域模型与服务面设计，并回答 Q-N1/N2/N3/N5 |
| 范围 | `packages/core`（领域与服务面）、`packages/adapter-dsh`（端口边界）、DSH fork 静态读源（skill / MCP / agent-team / preset / scope 五个子系统）；**不含**代码、不含界面设计、不含 PRD |
| 决策状态 | 本文为**设计规划**：实体化方案、算法、取证形态、配额口径均标〔建议〕；不构成实现授权，不改变 `data-contract.md` 的权威地位 |
| 证据范围 | 读源范围见附录 A；DSH 侧为**静态源码与官方子系统文档**读源（fork `abdfeb4831`，包版本 `0.1.6-alpha.1`），**不含**任何运行期、装配期或验收期证据 |
| 依据 | 首任 `system-assistant-backend-design-v0.1.md`（BE-1..BE-7 切片与 §1 盘点）；`data-contract.md` §0/§2/§3/§4/§6.1；`02-company-contract.md` ORG-02/03/05/06/08、§10.5–10.6、§11.1；`01-departments.md` LIB-01..11；DSH 官方 `docs/subsystems/{skills,mcp,agent-team,subagents}.zh.md` |
| 变更权 | 架构负责人；结论被新决定取代时标〔已取代〕并指向新正文 |
| 与 UI 侧的关系 | UI 智能体已完成 `organization-full-ui-design-v0.1.md`。**本任未读取该文档**（纪律：避免双边污染），双边契约面（RPC 形状、字段命名、卡片结构）留 QA 阶段对齐 |

**反面声明**：本文不证明智能编组已实现、不证明入团三步可取证、不证明配额已生效、不证明 Team 能力可用、不证明任务看板可读回。`data-contract.md` §0 明列配额、权限、Team、执行绑定、审计**均未实现**。

**术语**：部长 = `department_lead`（沿用首任 §术语约定，对齐 `data-contract.md` §2）；组长 = `team_lead`；总助理 = `general_assistant`（公司级任职）。

---

## 1. 智能编组（B 方案）领域设计

### 1.1 团队职能的落库（回答 Q-N1）

**Q-N1 的问题**：UI 侧确认现状无「职能」实体——core 六表里没有任何承载「这个团队是干什么的」的记录。

**核对确认**〔读源确认：`packages/core/src/domain.ts:221-244`〕：六表 `company`/`department`/`employee`/`appointment`/`document_version`/`operation` 中**没有任何职能、岗位、职位实体**。`appointment` 只有 `requiredCapabilities`（能力名数组）与 `departmentId`，是**岗位能力要求**而非**团队职能**。首任 §1.2 的差距表也未列此项——即 `data-contract.md` §2 的目标模型里**同样没有职能实体**，这是一个**契约级缺口**，不只是实现缺口。

**两个候选**：

| 候选 | 形态 | 能力边界 |
| --- | --- | --- |
| **A. `Team` 表加 `function` 字段** | `team.function: string`（或受限枚举） | 一个团队一个职能；职能是属性 |
| **B. 独立 `TeamFunction` 记录** | 新表 + `teamFunctionId` 外键 | 职能是实体，可复用、可跨团队引用、可版本化 |

**推荐：A（`Team` 表加字段），但在 A 内保留 B 的升级路径**〔建议〕。**指挥 2026-09-18 裁定采纳 A，形状以下文明细为准**〔需求/裁定：QA 统审后指挥落地清单第 2 条〕。

**理由**（逐条对照 ORG-08 与 LIB-02 的既有尺度）：

1. **规模判据**：`02-company-contract.md` ORG-01 明确「不按每个名词拆 Service、包、数据库或调度器，只有实际生命周期/发布边界需要时才拆分」。M0.1 编组在一次对话内完成，职能没有独立生命周期（不跨团队注册表、无独立审批、无版本指针需求），因此不满足拆分判据。
2. **升级判据（保留 B 的路径）**：若出现「部门级职能库、职能跨团队复用、职能版本化、职能与 `requiredCapabilities` 的正式映射表」中任意一项，说明职能获得了独立生命周期，届时迁移为独立表。迁移面是**加表 + 回填 `teamFunctionId` + 保留字符串字段做历史兼容**，可逆。
3. **字段形态**〔建议〕：`function` 用**受限但不封闭**的字符串（非白名单枚举）。理由：`02-company-contract.md` DEP-R07 要求「不同部门因职责不同，可以约束或开放个性与工作方式，**不能全员采用同一标准**」；写死枚举会把部门差异变成 core 的枚举演进问题。对齐 `department.name` 的既有形态（自由字符串 + 非空白校验，`domain.ts:99-104`）。
4. **不确定处**〔未验证〕：职能是否需要与 `requiredCapabilities` 建立正式映射（即「职能 X 需要能力集合 Y」）。本文**不假设**该映射；§1.2 的匹配直接用`appointment.requiredCapabilities` 与 `employee.verifiedCapabilities`，不引入中间层。

**形状澄清（指挥裁定，2026-09-18）**〔需求/裁定〕：

> **职能与能力是两件事，字段不许混装。**
> - `team.function: string`：**职能名/职责定义**——自由文本，对齐 DEP-R07 的部门差异要求（不同部门可约束或开放不同工作方式，不采用同一标准）。**不承载能力项**。
> - `functionSource`：记录该职能是部长定义还是系统建议后确认。
> - **能力项一律走 `requiredCapabilities`**：团队所需的能力集合表达在**任职**的 `requiredCapabilities`（现有字段，`appointmentRecordSchema` 首任已盘点）上，**不新增 `team.capabilities`、不把能力串进 `function`、不在 `function` 里做结构化编码**。
>
> 这条澄清消除的歧义：原稿把「职能」与「能力」并列讨论，易被读成「职能字段可承载能力列表」。裁定明确**单一事实归属**——职能归 `team.function`（纯文本），能力归 `appointment.requiredCapabilities`（结构化数组），二者不交叉。

**与 §1.2 的一致性**：§1.2 的匹配**只读** `appointment.requiredCapabilities` 与 `employee.verifiedCapabilities`，本就不依赖职能字段——该澄清与算法设计同向，无需改动 §1.2。

**`Team` 表建议字段**（在首任 BE-3 最小 Team 上的增量）：

| 字段 | 形态 | 说明 |
| --- | --- | --- |
| `id` / `companyId` / `departmentId?` / `name` / `status` / `createdAt` | 同首任 BE-3 | 对齐 `data-contract.md` §2 `SoloipsTeamRecord` |
| `function` | `string`（非空白）〔新增〕 | **本团队职能定义（纯文本，不含能力项）** |
| `functionSource` | `'leader-defined' \| 'system-suggested'`〔建议〕 | 记录职能由部长定义还是系统建议后确认——便于审计「谁定义了职能」，代价一个字段 |
| ~~`capabilities`~~ | **不新增** | 能力项走 `appointment.requiredCapabilities`（裁定第 2 条） |

**权威归属：已登记进 `data-contract.md` §2.1（2026-09-18 完成）**——`SoloipsTeamRecord` 的 `function` / `functionSource`（+ 修正新增的 `confirmedBy`）与「能力项不入本记录」已写入；形状以该处为准。原「待登记」标记作废。

**实体登记一览（6 个新实体）**〔裁定第 4 条〕：

> **状态更新（2026-09-18，PR #15 审查意见修正后）**：**6 个实体已全部登记进 [`data-contract.md` §2.2](../design/data-contract.md#22-新增实体登记2026-09-18-裁定全部待实现)**，权威形状**以该节为准**（本文下表保留为登记过程的留痕）。其中若干形状在该次修正中已**变更**，本文的示意代码**不再代表最终形态**：
>
> - `NormAck`：**主键改 `ackId`、append-only 事件流**（原以 `(employeeId, teamId, normVersionId)` 为主键的写法**已被取代**——见 `data-contract.md` §2.1.3「主键与追加语义」）；
> - `Team`：新增 `confirmedBy` 字段，并写死「禁物理删除 + 状态语义（pending/可用/不可用/归档）」（§2.1.1 P-7/P-8；`pending` 与 `leadAppointmentId` 可缺省见 **P-9**，BE-001）；
> - `TeamMcpIntent`：补**状态迁移矩阵**（§2.1.2，`revoked` 无出边）；
> - `AssemblyEvidence`：升格为**不变量 INV-AE-1**（禁作 onboarding/permission/readiness 判定输入）。
>
> 下文各实体的 `interface` 代码块是**当时的提案示意**，引用时一律指 `data-contract.md` §2.1/§2.2。

| # | 实体 | 位置 | `data-contract.md` §2 现状（2026-09-18 更新） |
| --- | --- | --- | --- |
| 1 | `Team`（+ `function`/`functionSource`/`confirmedBy`） | §1.1 | **已登记**（§2.1 `SoloipsTeamRecord`；`status` 含 `pending`、`leadAppointmentId` 可缺省——BE-001） |
| 2 | `TeamSkillAssignment` | §2.1 | **已登记**（§2.1 + 品牌类型；`status` 五态 + 迁移矩阵——BE-004） |
| 3 | `TeamMcpIntent` | §2.2 | **已登记**（§2.1 + 品牌类型 + §2.1.2 迁移矩阵） |
| 4 | `team_norm`（团队规范条目/版本） | §2.3 | **已登记**（§2.1 + 两个品牌类型 + 与 `document_version` 分工） |
| 5 | `NormAck`（阅读/确认状态） | §2.3 | **已登记**（§2.1 + `SoloipsNormAckId`；`ackId` 主键、append-only——见 §2.1.3） |
| 6 | `AssemblyEvidence` | §2.4 | **已登记**（§2.1 + 与 `employee.assemblyEvidence` 分工 + INV-AE-1） |

### 1.2 编组算法：从职能到「编组建议 + 理由」

**输入**：`teamId`（或 `departmentId` + 新职能）、`function` 定义文本、候选人范围（部门内 / 跨部门）。

**流程**〔建议〕：

| 步 | 内容 | 依据/边界 |
| --- | --- | --- |
| 1 | 部长提交 `function` + `scope: 'department' \| 'cross-department'` | ORG-02「管理员只在获准本部门范围招募」——跨部门需更高授权（总助理），见下 |
| 2 | 取候选人集合：部门内 = 该部门所有 `active` `appointment` 的员工；跨部门 = 该公司内 | 需要首任 BE-4 的 `listAppointments(departmentId)` / `listEmployees(companyId)` 读面 |
| 3 | 按能力匹配评分 | 见下 |
| 4 | 产出「编组建议」结构 | 见下 |
| 5 | **部长确认** → 成团（**三步**：`team.create`(pending) → `appointment.create`(team_lead) → `team.activate`，见 §1.4 BE-001） | 确认是唯一写入口；**不是**一次原子提交 |

**匹配来源**〔读源确认：`packages/core/src/domain.ts:144-152`、`:126-134`〕：
- `appointment.requiredCapabilities`：**岗位**必需能力（员工当前任职要求他具备什么）；
- `employee.verifiedCapabilities`：**已通过最小验证**的能力（他实际被验证过什么）。

两者语义在首任 §1.1 已盘点，且已有**现成的求差逻辑**：`onboarding.ts:201-217` 用 `verifiedCapabilities` 对 `requiredCapabilities` 求差、逐项产出 `capability-not-verified` 缺项。**编组复用的正是这个差集**——不要新写第二套能力比对。

**匹配评分（最小可解释版）**〔建议〕：

```
对候选人 c 与建议任职 r：
  required = r.requiredCapabilities
  verified = c.verifiedCapabilities
  missing  = required \ verified              ← 复用 onboarding 的差集语义
  matched  = required ∩ verified
  score    = matched.length / max(1, required.length)
  就绪度    = missing.length === 0 && checkOnboarding(c).ready
```

排序：`就绪度` 优先，其次 `score` 降序，再次 `employeeId` 升序（**稳定排序**，避免同分时结果漂移——这对可复现建议是必要的）。

**「编组建议 + 理由」的可解释结构**〔建议〕：

```ts
// 纯 JSON，可持久化、可跨 RPC（对齐 core 现有 *Result 纪律）
interface SoloipsGroupingSuggestion {
  /** 建议唯一 ID〔新增，P2-001〕——使建议可被引用（回执/审计/跨 RPC 关联） */
  readonly suggestionId: string;
  /** 生成时刻〔新增，P2-001〕——与 evidence.evaluatedAt 同源，提为一等字段便于排序/去重 */
  readonly createdAt: string;
  readonly teamFunction: string;
  readonly scope: 'department' | 'cross-department';
  readonly suggestedLeader?: { readonly employeeId: string; readonly reason: string };
  readonly suggestedMembers: readonly {
    readonly employeeId: string;
    readonly matchedCapabilities: readonly string[];   // 直接可见的匹配项
    readonly missingCapabilities: readonly string[];   // 缺项（复用 onboarding 语义）
    readonly readyForWork: boolean;                    // checkOnboarding 结论
    readonly reason: string;                           // 人类可读的入选理由
  }[];
  readonly excluded: readonly {                         // 落选也要给理由
    readonly employeeId: string;
    readonly reason: string;
  }[];
  /** 生成建议时的**事实概况**（候选人数 + 生成时刻）。**不构成快照**——不保证可复算，见下。 */
  readonly evidence: {
    readonly candidateCount: number;
    readonly evaluatedAt: string;
  };
}
```

**建议的可复算性与快照版本机制**〔待决 M0.2+，P2-001 折中〕：本结构是**瞬时读模型**（§4.3：投影不落库、不回写），`evidence.evaluatedAt` 只记**生成时刻**，**不保证**按该快照能重放出同一结果——因为 `checkOnboarding` 的输入（任职/文档/装配证据/记忆/能力）会随时间变化。若要「建议可复算」，需要一套**快照版本机制**：

| 待决项 | 说明 |
|---|---|
| `employeeSnapshotVersion`（或等效） | 记录生成建议时各输入事实的版本/摘要，使「同一快照 → 同一建议」可被验证 |
| 版本载体 | 是给 `employee`/`appointment` 加版本字段，还是建议内嵌输入摘要（`inputDigest`），**未裁定** |
| 与 §2.3 P1 的关系 | 若走「加版本字段」，依赖 unit version 戳机制（同 R-3 的介质能力缺口），**当前不满足** |
| 是否必要 | M0.1 **不要求**可复算——建议的用途是「辅助部长决策」，不是「审计凭证」；**不得**声称建议可复算 |

**〔待决 M0.2+〕**：上表各项在 M0.2 前**不做**；`suggestionId`/`createdAt` 两字段**本次即落地**（它们只解决「可引用/可排序」，不引入快照语义）。

**关键设计约束**〔建议，依据 ORG-03 + ORG-08〕：
- **建议不是授权**：结构里**不放**任何可执行动作，只列事实与理由；成团必须经部长确认的独立写命令（**三步**：`team.create` + `appointment.create` + `team.activate`，见 §1.4 BE-001）。**注意**：这些是 **BE-3 待新增**的 kind，不是现有能力——见 §1.4。
- **不冒充质量判断**：`reason` 只陈述**可核对事实**（能力匹配/缺项/入职就绪），不陈述「这个人适合做创作」。对齐 ORG-03「装配证据……不冒充模型理解质量」。
- **`excluded` 必须存在**：只给入选名单会让「为什么没选他」不可解释，与 ORG-08「保留来源……矛盾经验保留条件」同向。
- **能力差集是必要条件不是充分条件**：`readyForWork` 沿用 ORG-03 的完整判定（任职 + 四文档 + 装配证据 + 记忆 + 能力），不是只看能力名。

**跨部门边界**〔建议〕：`scope='cross-department'` 时，编组建议**仍可由部长生成**（只读），但**成团写入需总助理级授权**——因为 ORG-02 明确「管理员只在获准本部门范围招募」，跨部门招募超出部长范围。这条边界必须在服务面显式实现（提交门内校验 actor 任职 scope，见首任 §2.1）。

### 1.3 组长产生机制（回答 Q-N3 子项）

**Q-N3 子项**：组长由部长指定还是系统推荐？

**推荐：系统推荐 + 部长确认，且推荐可被部长覆盖**〔建议〕。理由：

1. **与 §1.2 同构**：整套编组已是「建议 + 确认」，组长单独走「纯人工指定」会让交互模型分叉（一个流程里两种心智）。统一为「系统建议、人工确认有无否决权」。
2. **推荐规则可解释**〔建议〕：优先 `matchedCapabilities` 全命中且 `readyForWork` 为真者；同分时**扩大差集比较**——即用该团队全部建议成员 `requiredCapabilities` 的并集再比一次（组长需要覆盖团队能力面）。若无人全命中，**推荐空缺**并明确告知「当前无就绪候选人」，而不是强行推一个。
3. **部长的最终权威不可让渡**：ORG-02「管理员在获准本部门范围招募、分配岗位」，任命组长属分配岗位，最终决定权在部长。系统建议**不产生**任职。
4. **兜底**：部长可直接指定任意本部门 `active` 员工为组长（跳过推荐），此时 `role='team_lead'` 的任职照常创建；推荐只是加速器。

**明确不做**〔建议〕：不做组长自动轮换、不做基于历史的组长评分、不做多组长。理由：`data-contract.md` §2 的 `TeamBindingRecord.leadAppointmentId` 是**单数**，Roster 模型也是单 Lead（`TeamMemberView.role: 'lead' | 'teammate'`，〔读源确认：fork `packages/experimental/agent-team/src/types.ts:61`〕）；引入多组长会与两处契约同时冲突。

### 1.4 团队命令 kind：`contracts.ts` 契约扩展点（修正首任 BE-3/BE-6 口径）

**修正事由**〔裁定：QA 统审后指挥落地清单第 1 条〕：首任 §4.1 的 **BE-6 写「团队 CRUD」**，但**M0.1 没有 `team.create` 这一类命令 kind**——把它们当成"已存在的命令"来编排 RPC/工具是错误的。

**实证**〔读源确认：`packages/core/src/contracts.ts:81-91`〕：`SoloipsOperationKind` 是**封闭联合**，当前恰好十项：

```
company.create | department.create | employee.create | appointment.create | appointment.revoke
employee.initialize-memory | employee.verify-capability | employee.record-assembly
document.save | work-entry.request
```

**全仓检索**：`team.create` / `team.update` / `team.close` / `team.list` 在 `packages/core/src` 中**零命中**〔实测：`grep -rn "team\.create\|team\.update\|team\.close\|team\.list" packages/core/src` → 空〕。因此团队命令**不是「待接线」而是「待定义」**。

**修正后的口径**〔建议〕：

> **BE-3 切片新增最小 team 命令 kind**，而不是假设它们已存在。`SoloipsOperationKind` 是 **core 的契约扩展点**（`contracts.ts` §2 的持久写操作种类联合），新增 kind 属于**契约变更**，须与 `domain.ts` 的表声明、`store.ts` 的命令实现**同一切片内三处同步**（对齐 `contracts.ts` 头注「持久记录形状在此声明为唯一维护来源（DEV-05 schema 纪律）」）。

**BE-3 的最小 kind 清单**〔建议〕：

| kind | 语义 | 对应服务方法 | 写入事实 |
| --- | --- | --- | --- |
| `team.create` | **建团队（成团第 ① 步）**——只建 `status='pending'` 团队（含 `function` / `functionSource`），**不建任何任职** | `createTeam` | `team` 一条（**无组长**：`leadAppointmentId` 缺省） |
| `team.activate` | **成团第 ③ 步**——校验 `leadAppointmentId` 满足 P-4 四项后 `pending` → 可用 | `activateTeam` | `team.status` 更新（pending → active） |
| `team.update-function` | 改职能定义 | `updateTeamFunction` | `team.function` + `functionSource` 更新 |
| `team.close` | 归档团队（`status: 'archived'`） | `closeTeam` | `team.status` 更新 |
| （无 kind）读面 | `listTeams` / `getTeam` | — | **纯读不产生 kind**（对齐 `checkOnboarding`/`getCompany` 等既有读面的处理：读路径不经提交门，`store.ts:753-860`） |

> **★ BE-001：成团三步协议（2026-09-18 冻结）**〔约束〕——上表 `team.create` 的「（可选）任职」表述**已被取代**。成团**冻结为三步、三个 kind、三个 `operationId`**：
>
> | 步 | kind | 动作 | 结果 |
> |---|---|---|---|
> | ① | `team.create` | 只建团队 | `status='pending'`，**无组长** |
> | ② | `appointment.create` | 建组长任职（`role='team_lead'`，`scope.kind='team'`） | 任职已存在；团队**仍 pending** |
> | ③ | `team.activate` | 校验 P-4 四项后转可用 | 团队**可用** |
>
> **权威正文见 `data-contract.md` §2.1.1 P-9**（含恢复入口「扫描 pending 续做或收敛」与四条读面纪律 P-9.1…P-9.4）。本节只登记 kind 清单，**不重复协议正文**。
>
> **对首任 BE-3 验收的修正**：验收③「一个团队恰好一名 `team_lead` + N 名 `member` 可读回」**仅对 `status='active'` 的团队成立**；`pending` 团队**没有**组长是**合法中间态**，读面须排除或显式标注（P-9.1/P-9.2）。验收①「kind 未登记前不存在任何 team 写命令」**新增 `team.activate` 后仍成立**（三项 kind 一并登记）。

**设计纪律（四条）**〔建议〕：

1. **`team.list` 不是 kind**。kind 只登记**持久写**操作（`contracts.ts:80` 的注释原文：「本切片实际存在的持久写操作种类」）。给读操作造 kind 会污染 `operation` 台账并让恢复核对出现无意义的未决记录。
2. **`kind` 是幂等与冲突检测的身份**。提交门在 `operationId` 命中既有记录时**比对 kind**，不同则抛 `SOLOIPS_CORE_CONFLICT`〔读源确认：`commit-gate.ts:126-132`〕。因此 kind 命名必须**稳定且互不混淆**——用 `team.update-function` 而不是泛化的 `team.update`，可为后续 `team.update-name` 等留出无歧义空间（避免「同一 kind 语义悄悄扩大」）。
3. **一次成团 = 多个提交，不是一次原子提交**（**BE-001 已冻结为三步**，见上表后注）。`createTeam` **不**同时落团队与任职——团队与组长任职分属**不同 kind 的独立提交**（各自 `operationId`，失败可从已提交事实续做），**不得**合并成一次提交、**不得**声称成团是原子的。协议正文见 `data-contract.md` §2.1.1 P-9。
4. **★ BE-002：`kind` 联合扩展的兼容性纪律**〔约束〕（2026-09-18）——`SoloipsOperationKind` 是**封闭联合**，而团队命令、编组命令等会不断加项。**每次扩展都必须保证历史 operation 记录仍可读**：
   - **`operation` 记录带 `schemaVersion`**〔待实现〕——新写入用当前版本；读取遇 **unknown kind**（不在当前联合内）时按该版本兼容处理，**不得**因词表扩展判记录损坏。字段定义见 `data-contract.md` §2.1 `SoloipsOperationRecord`。
   - **恢复路径不得跳过读不懂的记录**：未决（`pending`）记录即使 `kind` 是当前代码不认识的项，也**必须**可读并可参与核对——「读不懂」不等于「可忽略」。
   - **落地顺序**：`schemaVersion` 与 `team.*` kind **同一批**落地；**不得**先加 kind 后补版本字段（否则本批新增的 operation 记录在下一批扩展时即成为不可读的历史）。
   - **取值机制**〔待决〕：初始值、递增规则、与 `data-contract.md` §2.3 P1（unit version 戳 + `compatibleVersions`）的关系留实现裁定；**字段存在性是硬要求，取值机制不是**。

**与 §1.2 的衔接**：§1.2「部长确认成团」的写路径，就是本节的 `team.create`（+ `appointment.create` 若干）。修正前该处引用的 `team.create` 属**尚不存在的 kind**，本节把它显式登记为 BE-3 的交付项。

**契约登记预告**：`SoloipsOperationKind` 的新增项属 `data-contract.md` §2 范围的**契约扩展**。**登记状态（2026-09-18 更新）**：`team.create`/`team.activate`/`team.update-function`/`team.close` 四项 kind 与 `operation.schemaVersion`（BE-002）**已登记进 `data-contract.md`**——kind 清单见 §2.5 边界 2、三步协议见 §2.1.1 P-9、`schemaVersion` 见 §2.1 `SoloipsOperationRecord`；**形状以该处为准**。

**与 BE-6 工具名的衔接**：本节新增的 kind 对应**模型工具名**（下划线形态）与 **`@Remote` 方法**（点号形态）——**两套命名面刻意不同形，禁止混用**，完整清单见 [`data-contract.md`](../design/data-contract.md) **§2.5「工具名（模型工具面，2026-09-18 登记）」的 20 项表**。

〔**D-T1 边界维持**〕该 20 项表的登记范围**不含任何 `team.*` 工具名**：`SoloipsOperationKind` 当前无 `team.*`（实证见上文），故 `soloips_team_create` / `soloips_team_update_function` / `soloips_team_close` 属**待 BE-3 新增 kind 后才成立**的**〔待决〕**项——**不得在本切片定稿**（与 `data-contract.md` §2.5 边界 2 逐字一致）。

### 1.5 任职 `scope` 的迁移路径（裁定 5 落地：先可选 + 默认值补齐）

**裁定内容**〔需求/裁定：QA 统审后指挥落地清单第 3 条〕：首任 §1.4 的冲突点 **C-4「Appointment 的 scope 与 `departmentId` 重复表达归属」采纳**（指挥清单以「裁定 5」引用，本文按首任的稳定 ID **C-4** 定位；**注意**首任 C-1 是配额里程碑口径，两者不可混引），但**强制走「先可选 + 默认值补齐」路径**——`scope` 上线时是**可选字段**，不一步收紧为必填。

**为什么必须如此（与 §2.4 同一根因）**〔读源确认〕：`appointmentRecordSchema` 当前 `departmentId` 是**必填**且**没有 `scope`**〔`packages/core/src/domain.ts:144-152`〕。若把 `scope` 直接设为必填，**存量 `appointment` 记录会缺该字段 → 整次 open 失败**——因为 domain 的 `invalidRecords` 默认是**拒绝**（「Absent (the default), the whole open rejects with `invalid-record` — right for authoritative data」〔读源确认：fork `packages/storage/storage-domain/src/spec.ts:56-66`〕），而 core 的 spec **未声明** `invalidRecords`〔读源确认：`packages/core/src/domain.ts:240-244` 无该键〕。

**阶段一：`scope?` 可选期的运行时推断规则**〔约束〕（**BE-003 修正，2026-09-18**）：读取时凡遇到缺 `scope` 的记录，按下表**严格三分支**处理，**不写回**、**不猜测**：

| 序 | 条件 | 结果 | 依据 |
| --- | --- | --- | --- |
| 1 | 记录**有** `scope` | **直接采用 `scope`**（不做任何推断） | 显式字段优先，推断只服务缺失场景 |
| 2 | 记录**无** `scope`，且 `departmentId` 存在 | `{ kind: 'department', companyId: <由 departmentId 解析 department.companyId>, departmentId }` | 现有形状即部门级任职（`departmentId` 必填语义，`domain.ts:147`） |
| 3 | 记录**无** `scope`，且**无法解析出公司**（含无 `departmentId` 的情形） | **判定为数据不一致**，按 `SOLOIPS_CORE_RECORD_INVALID` 处理 | **不猜**（对齐首任「交付确定性、不虚构」纪律）；不得静默当作任一 scope |

> **★ 原规则 2「首个 `general_assistant` → company 级」已删除（BE-003）**〔约束〕——**该推断不得存在于运行时**。理由：它依赖「首个」这一**基于读取顺序/时间**的猜测，而存量记录里**没有**任何信息能区分公司级与部门级任职（这正是 `scope` 缺失造成的不可判定历史数据）；读取顺序在并发、分页、重放、数据根迁移下**都不稳定**，会产出**非确定性**结果。以时序猜测填补契约缺口，违反「交付确定性、不虚构」纪律。
>
> **该推断的合法去向**〔约束〕：**仅允许存在于 migration 工具**，且**必须人工确认**——① 载体是**迁移工具/脚本**（独立切片），**不是** core 读取路径、**不是** `checkOnboarding` 等服务方法；② 工具**必须**把候选判定呈现给人工确认后才写入；③ 写入经**新 `operationId`** 的显式操作（重新任命）或显式声明的迁移脚本，**不得**在读取时写回；④ 每条改判可追溯（哪条记录、依据什么、谁确认的）。
>
> 权威正文见 `data-contract.md` §2.3。

**与 BE-2 的关系**：首任 BE-2「`appointment` 增 `scope`（判别联合）与 `role`」的验收标准④「公司级任职在旧 `departmentId` 必填约束下不再被迫挂部门」**仍然成立**，但实现方式须按本节：**新写入**的任职带 `scope`（新记录不受存量约束）。`departmentId` 是否同步改为可选，属 BE-2 内决定，**建议同为可选 + 严格三分支**（保持两条字段的迁移节奏一致；**不采用**任何时序推断补齐）。

**阶段二：收紧为必填的前置条件**〔建议〕（**必须全部满足**才可执行）：

| # | 前置条件 | 当前状态 |
| --- | --- | --- |
| P1 | **unit version 戳机制存在**（介质能表达 domain 版本、能判定 version-mismatch） | ★ **不满足**：SQLite 后端未写 unit version 戳、无 version-mismatch 判定〔读源确认：`packages/adapter-dsh/src/ports/storage-sqlite.ts:36-39` 自述既有缺口〕；core 也未声明 `compatibleVersions` |
| P2 | 存量记录已全部带 `scope`（迁移完成、无缺项） | 待阶段一执行后核对 |
| P3 | 收紧动作有**可回退**路径（`compatibleVersions` 或显式迁移步骤） | 不满足（同 P1） |
| P4 | 收紧在**独立切片**内发布，不与业务功能同片 | 待规划 |

**★ 结论**〔推断，依据 P1/P3 现状〕：**在 P1 满足前，`scope` 必须保持可选**。这不是保守选择，而是**介质层能力决定的硬约束**——`compatibleVersions` 与 `invalidRecords` 两个逃生通道目前都不可用（见 R-3 强化后的 §6）。**收紧锚点为「目标 M1 前完成 `scope` required 迁移」**〔约束〕（权威表述见 `data-contract.md` §2.3；该锚点是目标时点，不是当前授权）。

---

## 2. 入团自动三步的技术设计（回答 Q-N2）

> 首任 §3.1 把「员工（AI）自主生成资料完成入职」标为**取证面缺口**：身份链要求 `Session → Host Binding → Employee`，而 `ExecutionBinding` 未实现。本节给出正解设计。

### 2.0 先说清一个决定性的架构事实（本次新发现）

**所有 teammate 继承其父 Lead 的 preset 组合，而不是各自挂载自己的 preset。**〔读源确认：fork `packages/subagent/subagent/src/child-agent.ts:196-218`、`packages/preset/agent-presets/src/index.ts:458-493`〕

```ts
// child-agent.ts:200-205
export function applyChildComposition(childCtx, parent, composition) {
  childCtx.get('agentPresets')?.composeFrom(childCtx, parent.ctx)   // ← 加入父的 STANDING 组合
  ...
}
// index.ts:484-493（composeFrom）
const standing = standingMountFor(parentCtx)
if (standing === undefined) return undefined
this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))
```

`composeFrom` 的文档注释把这条讲得很明确〔`:470-478`〕：

> *Join one agent to the SAME standing composition another already runs on. This is how a child agent inherits its parent's capabilities. It is a bind, not a mount: the parent's generation is already composed, so the child gets **that exact instance — the same plugin objects, the same tool registrations, the same prompt sections**.*

而 `ensureStanding` 以一个 preset id 为键**全局仅一份**〔读源确认：`index.ts:776-796`，`standing.get(preset.id)`〕。

**这条事实对本节的直接后果（三条）**：

| 后果 | 说明 |
| --- | --- |
| **1. 团队级 skill 目录不能靠 preset 内 per-team 配置** | preset 的 standing 组合**每 preset 一份**，不是每 team 一份。若把某个团队专属的 skill 目录写进 preset 行，**该 preset 下所有团队和所有会话都会看到它**——直接违反 ORG-08「调岗默认停用旧岗位受限记忆/Skills」与 LIB-08「跨部门默认不自动共享」 |
| **2. 但 per-agent 的 `cwd` 敏感发现是可行的** | `skill-filesystem` 的项目根是 `<projectRoot>/.dsh/skills` 与 `<projectRoot>/.agents/skills`（rank 100/200），而 `projectRoot` 由**含 `.git` 的最近祖先目录**决定，工作区不变量是 `exec.agent?.session.header.cwd`〔读源确认：`docs/subsystems/skills.zh.md:68-77`、`packages/skill/tool-skill/src/index.ts:133`〕。`SkillLookupOptions` 同时带 `cwd` 与 `scope`，且**发现缓存以解析后的 scope 链为键**〔`skills.zh.md:13`、`packages/skill/skill/src/index.ts:116-119`〕——**按 Agent 隔离的目录发现是官方支持的** |
| **3. `customSkillDirs` 是行级静态配置，不是 per-agent 动态值** | 〔读源确认：`packages/skill/skill-filesystem/src/index.ts:59,169`〕`Config.customSkillDirs: string[]` 在 `apply()` 时一次性 `resolve()`；`list()` 里按 roots 拼装。**没有 per-call 传目录的入口** |

**结论**：团队级 skill 分配的**实际加载**必须落在「per-agent 可变的目录发现」或「自建 skill provider」上，**不能**落在 preset 行配置上。这决定了下文 §2.1 的选型。

### 2.1 skills 领取：分配的持久形态 + 与 DSH skill 体系的关系

**两层必须分开**（对齐 ORG-08「保存、批准、分配、**实际加载**和有效使用是不同事实」；DEP-R05/DEP-R06 的「纳入 Skills 系统」与「实际加载归因」）：

**层 1 — 分配（core 领域事实，可写权威在 core）**〔建议〕：

```ts
// 新表：team_skill_assignment（或并入 team 的 JSON 字段——见选型）
interface SoloipsTeamSkillAssignmentRecord {
  readonly id: SoloipsTeamSkillAssignmentId;
  readonly teamId: SoloipsTeamId;
  readonly skillName: string;              // DSH skill 名（kebab-case，^[a-z0-9]+(?:-[a-z0-9]+)*$）
  readonly skillSourceRef: string;         // 分配时的来源标识（provider 名或目录），用于对账
  readonly assignedByAppointmentId: SoloipsAppointmentId;  // 谁分配的（部长/总助理）
  // ★ BE-004（2026-09-18）：五态，与 MCP 生命周期对齐；M0.1 实际只走到 'requested'
  readonly status: 'requested' | 'available' | 'active' | 'failed' | 'revoked';
  readonly createdAt: string;
}
```

> **★ BE-004：状态枚举扩展（2026-09-18）**〔约束〕——上方 `status` 由原两值 `'assigned' | 'revoked'` **扩为五态**，与 §2.2 的 MCP 生命周期**对齐**：`requested`（分配已登记，**不表示**可加载）→ `available`（provider 实际供出候选，**仅可信接入流程写入**）→ `active`（观测到实际加载/使用）；`failed`（接入失败，**可判定**，不得用 `requested` 冒充）；`revoked`（**终态，无出边**，恢复须新建记录）。
>
> **M0.1 实际只走到 `requested`**——M0.1 不接 skill provider 与逐 agent 加载路径，故 `available`/`active`/`failed` **不可达**，实现**不得**自行写入。**枚举先定义全**的理由：状态是**持久字段**，后补取值会让既有记录语义悬空（且 `status` 的旧值 `'assigned'` **不再使用**）。
>
> **权威正文见 `data-contract.md` §2.1**（含完整迁移矩阵）；本节只登记形状。

**权威归属：已登记进 `data-contract.md` §2.1（2026-09-18 完成）**——`SoloipsTeamSkillAssignmentId` 品牌类型与记录声明（含 BE-004 五态）已写入；形状以该处为准。

**层 2 — 实际加载（观测事实，不能由分配推导）**：见 §2.4 的两案选型。

**与 DSH skill 体系的关系**〔建议〕：

| 方面 | 设计 |
| --- | --- |
| 名称空间 | `skillName` 必须匹配 DSH 的 kebab-case 规则（〔读源确认：`skills.zh.md:85`〕`^[a-z0-9]+(?:-[a-z0-9]+)*$`），**不引入第二套命名** |
| 发现的权威 | **DSH `ctx.skills` 是发现的唯一权威**；core **不建**自己的 skill 目录索引（避免第二事实来源，对齐 `docs/technical/state.md`「一个状态只有一个写权威」） |
| 分配的作用 | 分配是**意图 + 授权记录**；它**不**直接改 DSH 注册表 |
| 落地机制 | 〔建议〕自建一个 **skill provider**（`ctx.skills.registerProvider`），把「该 agent 所属团队的分配集合」作为候选贡献出去；provider 按 `SkillViewOptions.scope` 读到当前 agent，再查 core 的分配记录 |
| 可用性核验 | 部长分配时，Host 半边**先读 `ctx.skills.list({ scope: <代表 agent> })` 核实该名字确实存在于可发现集合**，否则分配应报「未知/当前不可加载」而不是写一条永不生效的分配〔建议〕 |
| 撤回语义 | `status='revoked'` 只停用分配；**已加载进上下文的正文不会因撤回而消失**（ORG-08「停用受影响贡献并处理已加载上下文；只删源文件不等于影响消失」）——必须如实报告，不得声称撤回即清除 |

**代价与边界**〔建议〕：
- 自建 provider 使**分配成为发现的一部分**，从而「分配」与「可发现」不再分裂；代价是 core 的分配记录出现在 skill 读取路径上（读路径依赖 core 服务可用性——core 未发布时 provider 应返回空候选而非抛错，否则会拖垮整个 skill 目录）。
- 这不满足「实际加载」取证（provider 只让候选**可见**，模型仍可能不调用 `skill` 工具）。因此 §2.4 的取证层不可省。

### 2.2 MCP 加载：配置意图的持久化与「分配≠加载」边界

**首任已核实的边界**（本文复核并细化）〔读源确认：`docs/subsystems/mcp.zh.md:24`、`packages/mcp/mcp-client/README.zh.md:128`〕：

- MCP 服务器的**唯一配置入口**是「在目标 Cordis 作用域中为每台服务器配置一条 `@deepseek-ai/dsh-mcp-client` 条目」；
- `serverName` 在**一个注册作用域内唯一**；**独立 agent 作用域可以复用相同 namespace**（工具与传输彼此隔离）；
- 「调用方没有可见的已配置服务器时，在 native 或 PTC 模式下都**不会**获得 MCP 提示词文本或工具」；
- 工具名形态 `mcp__<serverName>__<rawName>`。

**因此「团队级 MCP 配置」的正确定位**〔建议〕：

```ts
interface SoloipsTeamMcpIntentRecord {
  readonly id: SoloipsTeamMcpIntentId;
  readonly teamId: SoloipsTeamId;
  readonly serverName: string;             // 对齐 DSH 的 [A-Za-z0-9_-]{1,32}
  /** 配置意图的内容引用：不含凭据本体，只引用受保护的配置位置。 */
  readonly configRef: string;              // 指向部署层配置项，不复制 url/headers/token
  readonly status: 'requested' | 'active' | 'revoked' | 'unavailable';
  readonly assignedByAppointmentId: SoloipsAppointmentId;
  readonly createdAt: string;
}
```

**权威归属：已登记进 `data-contract.md` §2.1 + §2.1.2（2026-09-18 完成）**——`SoloipsTeamMcpIntentId` 品牌类型与记录声明、`configRef` 的配置域（部署层，不含凭据本体）已写入；**状态迁移矩阵**另见 §2.1.2（`revoked` 无出边）。形状以该处为准。

**三条硬边界**〔约束，依据读源 + 项目红线〕：

1. **`configRef` 不携带凭据**。MCP 配置含 `env`/`headers`（如 `GITHUB_TOKEN`、`Authorization`，〔`mcp-client/README.zh.md:40-55` 的示例〕）。`AGENTS.md` 项目红线 2「凭据保护」+ ORG-13「通知不得携带密钥」同向。core 只存**意图与引用**，凭据留在受保护的部署配置里。
2. **「请求」与「生效」是不同状态**。写一条 `mcp_intent` **不会**让工具出现——需要在该作用域真正挂载 `mcp-client` 行。因此状态必须有 `unavailable`，且**不得**把 `requested` 呈现为「已配置」。
3. **作用域粒度是 agent，不是 team**。Dsh 的 `serverName` 唯一性以**注册作用域**为单位，而 teammate 继承父 preset 的 standing 组合（§2.0）——**同一 preset 下的所有 agent 共享同一组合**。因此在「每 team 独立 MCP」与「继承父组合」之间存在**结构性张力**：
   - 若要真正按团队隔离 MCP，必须**按团队/按 agent 挂载** `mcp-client` 行（`ctx.plugin` 到该 agent 的 scope），而不是写进 preset；
   - 这条能力**属工程实现，未验证**〔未验证〕：本次只读源确认了 `serverName` 的作用域唯一性与「独立 agent 作用域可复用相同 namespace」，**未做挂载实验**。
4. **不做**：不在 M0.1 声称「团队级 MCP 已隔离」。§2.4 的取证层只登记**意图与观测到的可见性**，不声称生效。

### 2.3 规范阅读：团队规范资料 + 阅读状态的取证形态

**团队规范资料**〔建议〕：复用**已有文档模型**，不建新正文表。规范是「团队级参考资料」，与个人文档集（`document_version`）分属不同所有权。

- **推荐形态**：走 `01-departments.md` **LIB-01/LIB-02** 的资料室模型——「资料条目 + 版本」，条目有稳定 ID、标题、业务归属、当前版本引用；版本记录来源、创建者/任职引用、内容位置、不可变版本标识与摘要。
- **关键**：LIB-02 明确「具体 URI 语法、序号或内容摘要选型由技术负责人决定，**不为此引入通用引用图服务**」。因此 M0.1 可以用**最小实现**：新表 `team_norm`（`teamId` + `versionId` + `content` + `digest` + `createdAt`），字段形态对齐 `document_version` 的既有纪律（内容 + `soloipsDigestOf` 摘要，`digest.ts`）。**不**建完整资料室。

> **实体 4/6：`team_norm`**——**权威归属：已登记进 `data-contract.md` §2.1（2026-09-18 完成）**。`SoloipsTeamNormId` / `SoloipsTeamNormVersionId` 品牌类型与记录声明、与 `document_version` 的分工（团队资料 vs 个人资产，`ownerId` 语义不同）均已写入；形状以该处为准。
- **归属**：规范属**团队**（业务归属 `teamId`），不属员工个人。因此**不能**塞进 `document_version`（其 `ownerId` 是 `employeeId`，`domain.ts:173-182`）——这是必须新表的理由，而不是重复建设。

**阅读状态的取证形态**〔建议〕：

> **⚠️〔已取代，2026-09-18〕** 下方示意**缺 `ackId` 主键**，已被 `data-contract.md` §2.1 的 `SoloipsNormAckRecord` **取代**——最终形态是 **append-only 事件流**（主键 `ackId`；重复装配**新增事件行**而非更新旧行）。理由见 §2.1.3「主键与追加语义」：三元组在**不同任职代际**会重复（撤职再任命），以其为主键会覆盖旧行。本块仅作过程留痕。

```ts
interface SoloipsNormAckRecord {
  readonly employeeId: SoloipsEmployeeId;
  readonly teamId: SoloipsTeamId;
  readonly normVersionId: SoloipsNormVersionId;   // 哪一个版本被确认
  readonly digest: string;                         // 该版本摘要快照
  readonly acknowledgedAt: string;
  readonly method: 'host-delivered' | 'model-reported';  // ★ 取证强度必须显式
}
```

**权威归属：已登记进 `data-contract.md` §2.1（2026-09-18 完成；形状以该处为准）**——`SoloipsNormAckRecord` + `SoloipsNormAckId` 已声明，`method` 的判定语义（弱证据不足以形成资格）写在 §2.1.3。

**★ 这一节最关键的设计判断**〔建议，依据 ORG-03〕：

> **`method: 'model-reported'` 不能单独构成「已阅读」。**

理由：ORG-03 的原文纪律是「**模型自报、文件存在、assigned Skill 标志均不能独自形成 ready**」。把「员工说它读了」直接记为合规，就在规范阅读这一项上**重犯 ORG-03 明确禁止的错误**。

**因此建议的两级取证**〔建议〕：
- **强证据（`host-delivered`）**：规范正文作为**实际请求装配**的一部分被装入该员工的会话（即 Host 层把正文放进注入上下文并留存证据），这才是 ORG-03 「Host 对当前版本的实际请求装配」在规范阅读上的对应物；
- **弱证据（`model-reported`）**：模型自报已阅读。**可记录、可展示、但不足以形成资格判定**，必须与强证据在数据上可区分（`method` 字段的作用）。

**与 §2.4 的关系**：强证据需要「实际装配」的可取证落点——这正是 §2.4 要选型的东西。因此 §2.3 的强证据方案**依赖 §2.4 的结论**。

### 2.4 两案选型：扩展 `assemblyEvidence` 粒度 vs 新增只读装配读模型（本篇核心）

**问题重述**：现有 `assemblyEvidence` 是**四类必需文档的版本映射**〔读源确认：`packages/core/src/contracts.ts:149-152`、`domain.ts:118-134`〕：

```ts
readonly assemblyEvidence: Readonly<Partial<Record<SoloipsRequiredDocumentType, SoloipsDocumentVersionId>>>
// SoloipsRequiredDocumentType = 'profile' | 'avatar' | 'soul' | 'operating'
```

它**结构上只能表达四类个人文档**。规范阅读、skill 加载、MCP 可见性**都不是四类之一**，塞进去需要改这个 `Record` 的键类型，而那会**同时**影响：`onboarding.ts:136-162` 的 `assemblyGaps`、`store.ts:571-610` 的 `recordAssemblyEvidence`（含「装配证据只覆盖四类必需文档」的运行期校验，`store.ts:579-581`）、以及 `domain.ts` 的 schema。

#### 两案

**案 A：扩展 `assemblyEvidence` 粒度**

把 `assembledEvidence` 从「四类文档的版本映射」泛化为「装配事实的集合」，新增成员承载规范/skill/MCP：

```ts
// 示意
readonly assemblyEvidence: {
  readonly documents: Partial<Record<SoloipsRequiredDocumentType, SoloipsDocumentVersionId>>;
  readonly norms?: readonly { normVersionId; digest }[];
  readonly skills?: readonly { skillName; sourceRef }[];
  readonly mcp?: readonly { serverName }[];
};
```

**案 B：新增只读装配读模型（不放 Employee 记录内）**

新建一个**独立表** `assembly_evidence`（一次装配 = 一条记录），`employee` 记录**不变**；onboarding 判定继续读旧字段（或改为读新表，见下）。

```ts
interface SoloipsAssemblyEvidenceRecord {
  readonly id: SoloipsAssemblyEvidenceId;
  readonly employeeId: SoloipsEmployeeId;
  readonly appointmentId?: SoloipsAppointmentId;
  readonly appointmentGeneration?: number;        // ORG-03「任职代际」
  readonly sessionRef?: string;                    // ORG-03「Session/request」
  readonly kind: 'document' | 'norm' | 'skill' | 'mcp';
  readonly targetRef: SoloipsDocumentVersionId | SoloipsNormVersionId | string;
  readonly digest?: string;                        // ORG-03「源版本/摘要」
  readonly observedAt: string;
}
```

**权威归属：已登记进 `data-contract.md` §2.1（2026-09-18 完成）**——`SoloipsAssemblyEvidenceRecord` 声明、与 `employee.assemblyEvidence` 的分工、以及升格后的**不变量 INV-AE-1**（禁作 onboarding/permission/readiness 判定输入）已写入；形状以该处为准。

#### 对比

| 维度 | 案 A（扩展字段） | 案 B（独立读模型） |
| --- | --- | --- |
| 改动面 | `contracts.ts` + `domain.ts` schema + `onboarding.ts` + `store.ts` 校验，**四处同改**；`assemblyEvidence` 形状变更是**破坏性**的介质变更 | **只加新表**；`employee` 记录与 `onboarding` 判定**不动** |
| 介质兼容 | ★ **危险**：SQLite 后端**未写 unit version 戳、无 version-mismatch 判定**〔首任 R3，`storage-sqlite.ts:36-39` 自述既有缺口〕；把 `assemblyEvidence` 由 `Record<…, VersionId>` 改成嵌套对象会让**存量记录整次 open 失败**。**且逃生通道不存在**——见下条 | **安全**：纯加表，存量记录不受影响 |
| 容错逃生通道可用性 | ★ **不可用（QA B5 强化，2026-09-18）**：① `invalidRecords` 默认拒绝，core spec **未声明**该键〔`domain.ts:240-244`〕；② **即使声明为 `'backup-and-skip'` 在当前默认后端下也是空操作**——它要求 `KvUnit.backupRecord` 存在，而 `backupRecord` **只在 JSON 后端的 per-record unit 实现**（`storage-json/src/per-record-unit.ts:238`；`single-unit.ts` 与 `storage-sqlite.ts` 的 SqliteKvUnit 均无此方法），`defaultBackend` 恰为 `sqlite`（`contracts.ts:777`）⇒ 宿主按文档**回退到拒绝默认**〔`storage-domain/src/spec.ts:64-66`〕 | 不依赖任何容错通道，**因此不受该缺口影响** |
| 表达力 | 扩充 `Partial<Record<...>>` 键类型即可承载，但「四类个人文档」与「规范/skill/MCP」语义不同（前者是个人资产版本，后者是配置/资料），混进同一 map 会让 `assemblyGaps` 的循环语义变模糊 | 用 `kind` 判别式天然分组；每 `kind` 可带**各自不同**的附加字段（`digest`/`sessionRef`/`appointmentGeneration`） |
| ORG-03 对齐 | 装配证据需「关联 Session/request、任职代际、源版本/摘要与装配组件版本」〔`02-company-contract.md:203`〕——这些**都不是**「文档类型 → 版本」能表达的，案 A 要硬塞进 map value | 这些正是独立记录的字段，逐项对应 ORG-03 |
| 失效语义 | 「普通变化只失效相关部分」（ORG-03）在 map 上可读，但「规范版本变了」「skill 被撤回」的失效**不在四类循环内**，需另写分支 | 每 `kind` 独立比对 digest/version，「只失效相关部分」是自然结果 |
| 历史/审计 | 覆盖式（每类只有一个值），**改一次就丢失上一次** | 追加式（一条一记录），自然留痕 |
| 阅读复杂度 | 一处字段，读者眼熟 | 多一张表 + 一次查询 |
| 未来扩展 | 每加一类信息都要动 `employee` 记录 | 加 `kind` 值即可 |

#### 推荐：**案 B（新增只读装配读模型），并明确它与现有 `assemblyEvidence` 的并存关系**〔建议〕

**推荐理由（按权重排序）**：

1. **介质安全是压倒性理由**。案 A 的破坏性介质变更撞上「SQLite 后端无版本容错」这个**已核实的既有缺口**〔首任 R3〕，代价是「开发数据根重置或存量记录整次 open 失败」。案 B 完全规避。
2. **ORG-03 的证据字段清单与案 B 的记录形状一一对应**，而与案 A 的 `Record<DocumentType, VersionId>` 不对应。选 A 等于在数据模型上弱化 ORG-03 的要求。
3. **追加式 vs 覆盖式**：ORG-03 要求「撤回或新增必需项在后续执行前复核」，且 ORG-08 要求「保留来源、适用条件、有效性」。覆盖式 map 无法表达「上一次装配用的是什么」，追加式可以。
4. **对齐既有架构纪律**：`docs/technical/state.md`「一个状态只有一个写权威」「投影不回写，不是第二事实来源」。案 B 的新表**不是** Employee 的投影副本（它记的是 Host 侧装配动作的观测事实，Employee 记录的是「个人资产当前引用」），两者**不是同一事实的两份表示**——这一点必须在文档里写清，否则会被误读成冗余。**我的判断：这是唯一需要小心的地方**，见下段。

**并存关系**〔建议〕：
- `employee.assemblyEvidence`（四类文档）：**个人资产**装配事实，服务 ORG-03 的入职判定。**保留不变**。
- `assembly_evidence` 新表：**装配动作的观测台账**，覆盖四类文档 + 规范 + skill + MCP。服务「取证」与「可解释性」。
- 〔建议〕**不**让 onboarding 判定改读新表（避免一次改动同时动判定语义与介质）；新表先在**取证面**上线，等它被验证后再考虑让判定引用它。这是「一次只动一件事」的切片纪律。

**代价（必须如实登记）**〔建议〕：
1. 短期内**同一事实有两处表示**（四类文档的装配既在 `employee.assemblyEvidence`，也可在新表有一条 `kind='document'` 记录）。**必须写死一条规则**：新表的 `kind='document'` 记录**只读、仅供取证与展示，不参与任何判定**。否则就真的变成双事实来源。
2. 新表需要一个**写入触发点**：谁在什么时候写？——Host 半边在**实际装配动作发生处**写（§2.1 provider 加载、§2.2 MCP 挂载观测、§2.3 规范注入）。这意味着取证覆盖度**等于** Host 半边的装配实现覆盖度；未实现的装配路径**没有证据**——而这正是**诚实的**（无证据 = 未知，不是「已装载」）。
3. 写放大：每次装配一条记录。需在切片内定**幂等键**（建议 `employeeId + appointmentGeneration + kind + targetRef`），避免同一装配重复写。

**与首任 BE-7 的衔接**：首任 BE-7 是「员工配置页服务面（读投影 + CAS 保存组合）」。案 B 的新表**不属** BE-7（BE-7 是文档读面），应作为**独立切片**，因为它引入新的持久实体与新的写入触发点。

---

## 3. 子公司后端

### 3.1 层级校验现状（读源实测）

〔读源确认：`packages/core/src/store.ts:94-95, 328-386, 310-326`〕

| 机制 | 实测 |
| --- | --- |
| 深度上限 | `MAX_TREE_DEPTH = 10` |
| 父公司存在性 | `#readCompany(parentCompanyId)`，不存在抛 `SOLOIPS_CORE_PRECONDITION` |
| 父公司类型限制 | `parent.type === 'operation'` 时拒绝（「运营子公司不能创建子级公司」）。**即 `platform`/`enterprise`/`subsidiary` 都可作父** |
| 深度检查 | `#computeDepth(parent)` ≥ `MAX_TREE_DEPTH - 1` 时拒绝 |
| 祖先链断裂 | `#computeDepth` 内检父记录缺失，抛 `SOLOIPS_CORE_VALIDATION`（`store.ts:318-322`） |
| 环检测 | **无显式环检测**——见风险 R-4 |
| 同账户校验 | **无**（`accountId` 硬编码 `"seed"`，首任 §1.2） |
| 配额校验 | **无**（`createCompany` 路径无任何配额逻辑） |

**关键实测**〔读源确认：`store.ts:342`〕：现有代码**只禁 `operation` 作父**，`subsidiary` 作父**未被禁止**。因此「子公司能否再建子公司」**在代码里当前是允许的**（受深度 10 约束），而不是「被禁止但没做」。

### 3.2 嵌套政策（回答 Q-N5）

**Q-N5**：子公司能否再建子公司？

**推荐：允许（保持现状），但用户侧默认收窄，且配额口径按「所有 `subsidiary` 计数」**〔建议〕。

**理由**：

1. **与 `data-contract.md` §2 一致**：`SoloipsCompanyRecord` 是通用树（`parentCompanyId?` + `type`），§2 的三层配额表按 **`type`** 计数而不是按**深度**计数：
   > `subsidiary`（用户子公司）计入 `subsidiaryLimit`
   （`data-contract.md:101`）。契约**没有**限制嵌套层数，只有 `MAX_TREE_DEPTH` 的工程上限。
2. **与「三层公司层级」不冲突**：`AGENTS.md` 的「三层公司层级」描述的是**公司生态的角色分层**（平台/运营/用户），不是**树的深度约束**。把生态分层误读成深度限制会引入契约里没有的规则。
3. **配额口径（明确建议）**：`subsidiaryLimit` 计**该公司账户下全部 `type='subsidiary'` 的 `active` 公司数**，**不论深度**。理由：
   - 与 §2 的表述「子公司总数上限」逐字一致（是**总数**，不是「顶层子公司的数量」）；
   - 按深度分层计数（如「只算第一层」）会让「建一个子公司再在其下建一个」绕过限制，形成一个**没有契约依据的漏洞**；
   - 按 `parentCompanyId` 归属统计也能得出同一集合（所有子公司最终都挂在某个 `enterprise` 下），但对**孤儿记录**（父缺失）的处理更脆弱。
4. **用户侧默认收窄**〔建议〕：UI 默认**不**暴露「在子公司下再建子公司」入口（把常见路径做成一层）；深层嵌套作为**能力保留但不诱导**。理由：`AGENTS.md` 的用户公司模型是「用户公司 + N 子公司」，深层嵌套没有产品依据；但**禁止**它需要改代码且与 §2 冲突，收益不明。
5. **`operation` 作父的现存限制保留**：`operation` 是 SoloIPS 官方运营子公司，其子级不属用户公司生态——这条现有校验与「平台/运营公司不占用户配额」（§2）自洽，**不建议改动**。

**必须与首任 BE-5 的衔接**〔建议〕：
- 首任 §2.4 的配额最小版是「部署注入 `planCode` + 提交门 `mutate` 内按 `accountId+type` 计数」。**本节确认该口径对嵌套子公司同样正确**（按 `type` 计数天然覆盖任意深度）。
- **要新增的前置校验**（对齐 `data-contract.md` §4.2 的 `createCompany` 第 0 步，该步现有代码**未实现**）：
  - `type === 'subsidiary'` 时**必须**有 `parentCompanyId`（现有代码**允许**无父的 `subsidiary`——这是一个**实缺口**，见 R-3b）；
  - 父公司**必须同账户**（§4.2「parent_account_mismatch」）——依赖首任 BE-1 的 `accountId` 落地。

### 3.3 子公司内组织能力复用 core 同一服务面的路径

**结论**：**无需任何新机制**——子公司内的部门/员工/任职/团队走**完全相同的 core 命令**〔建议，依据读源〕。

**理由**〔读源确认〕：
- `createDepartment` 只校验 `companyId` 形状 + `#readCompany` 存在（`store.ts:388-414`），**不关心该公司是顶层还是子公司**；
- `createAppointment` 只校验 `employeeId`/`departmentId` 形状与存在（`store.ts:443-485`），**不关心公司层级**；
- core 服务面是**单实例**（`openSoloipsCompanyStore` 唯一 opener，`index.ts:161-181`），domain 内所有公司共享同一提交门与写权租约。

**因此「子公司内组织能力」是数据范围问题，不是能力问题**：

| 需求 | 实现路径 |
| --- | --- |
| 在子公司内建部门 | `createDepartment({ companyId: <subsidiaryId> })` — 现有 |
| 在子公司内招募/任职 | `createEmployee` + `createAppointment` — 现有 |
| 子公司内的团队 | 首任 BE-3 的 `team` 表（`companyId` 指向子公司） — 待实现 |
| 子公司的组织树读回 | 首任 BE-4 的读投影；`getCompanyTree(companyId)` **已存在**且能读整棵子树〔`store.ts:782-826`〕 |
| **范围隔离**（子公司内看不到兄弟子公司的数据） | **需要新增授权范围校验**（不是新能力）：actor 的任职 `scope.companyId` 必须等于目标 `companyId`。落点=提交门内（首任 §2.1） |

**[约束] 不得声称的**：`getCompanyTree` 与 `listSubsidiaries` **没有 `accountId` 过滤**〔读源确认：`store.ts:769-826`〕。在「单账户数据根」下这不构成越权（首任 §1.2），但在实现多账户或授权范围校验之前，**不得**把它当作隔离已实现的证据。

---

## 4. 任务领取服务面

### 4.1 现状（首任已盘点，此处复核并聚焦看板需求）

〔读源确认：`packages/core/src/store.ts:683-751`、`packages/core/src/contracts.ts:371-409`〕

- `checkOnboarding(employeeId)`：**同步**纯读判定，返回 `ready: true`（含 `employeeId`/`appointmentId`/`generation`）或 `ready: false` + `gaps[]`。
- `requestWorkEntry(input)`：`{operationId, employeeId, taskId, origin}` → `admitted`（含 `replayed`）| `refused`（`onboarding-not-ready` / `employee-operation-unknown`）| `unknown`。
- **`taskId` 是纯字符串引用**：core **不持有**任何任务状态〔`contracts.ts:316-318`：「任务/attempt 状态归官方 Team（CUR-03），core 不建第二份」〕。
- **`requestWorkEntry` 不写任何业务状态**（除 `operation` 台账）：`mutate` 只返回 `admitted`（`store.ts:738-746`）——即 core 认**准入**，不认**领取**。

### 4.2 看板所需读面清单

| 看板需求 | 权威 | 所需读面 | 现状 |
| --- | --- | --- | --- |
| **可领取列表**（哪些任务我可领） | **DSH Team**（任务存在性/状态/依赖/owner）+ **core**（我是否 qualifying） | Team: `listTasks` + `taskReady`；core: `checkOnboarding(me)` | Team 面**未接**（adapter `team` 端口 fail-closed）；core 面 ✓ |
| **我的任务**（我占用的） | **DSH Team**（`ownerId === me`） | Team: `listTasks` 过滤 owner | 同上 |
| **团队任务**（本团队全部） | **DSH Team** | Team: `listTasks`（成员可见视图） | 同上 |
| **我的入职状态** | core | `checkOnboarding` ✓ | ✓ |
| **未决操作**（结果未知的领取） | core | `listPendingOperations` ✓ | ✓ |

**结论：看板的读面**主体**不在 core**〔推断，依据上表〕。core 能提供的是「我能否被准入」与「我有没有未决操作」两个**布尔/清单**面；任务的**列表、状态、依赖、owner**全在 DSH Team。

### 4.3 投影读模型的边界（CUR-03：不复制第二份状态机）

**投影设计原则**〔建议〕：

1. **core 不存任务快照**。包括**不存缓存副本**。理由：CUR-03〔`02-company-contract.md:38`〕「部门不复制第二份任务状态机」；`docs/technical/state.md`「投影不回写，不是第二事实来源」。存一份「上次读到的任务」立刻产生两个问题：陈旧（Team 已变而副本未变）与冲突（以谁为准）。
2. **投影是「core 事实 + Team 事实」的运行时拼装**，不是持久实体：
   ```
   看板行 = Team.listTasks()[i]                                   ← Team 权威
          ⊕ core.checkOnboarding(me)                                ← core 权威
          ⊕ core.listPendingOperations()                            ← core 权威
          ⊕ core.listTeams/listAppointments（团队/部门归属）           ← core 权威
   ```
   拼装发生在 **Host 半边**（首任 BE-6 的 Host 半边），**不落库**。
3. **join key 是唯一的跨面契约**：core 的 `taskId: string` 与 Team 的 `TeamTaskId`（形如 `task-<n>`，〔读源确认：`packages/experimental/agent-team/src/task-board.ts:56`〕）。**这是唯一需要双边对齐的字段**——建议在 QA 阶段与 UI 侧确认命名与承载方式（core 侧 `taskId` 是否直接承载 `task-<n>` 字符串）。
4. **不把 Team 的 roster 映射成 core 的 employee**：Team 成员是 `SessionId` + 不可变 `name`〔`types.ts:58-68`〕，core 员工是 `employeeId` + `displayName`。两者**身份体系不同**，不存在可靠的双向映射（一个员工可有多个 Session）。因此**看板行用 Team 的成员名展示，用 core 的 employeeId 判定准入**，两列事实**并列展示、不合并**——对齐 ORG-10「状态按维度分开」。
5. **字段对齐**〔读源确认：`packages/experimental/agent-team/src/types.ts:71-97`〕：Team 的 `TeamTaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted'`；view 附带 `ready: boolean`（依赖就绪）与 `writeScopeWarnings`，`ownerName?` 由 view 补充。core 侧**不要**镜像这些字段，只引用。

### 4.3b 看板读面契约：`TeamBoardState`（P2-002，2026-09-18 采纳）〔约束〕

**看板读面返回的必须是一个显式三态结构**，而不是裸任务数组：

```ts
interface TeamBoardState {
  /** 三态判别式；**null 与空数组语义不同**，见下 */
  readonly status: 'not_connected' | 'loading' | 'data';
  /** 仅 status==='data' 时为数组；'not_connected' 与 'loading' 时**必须**为 null */
  readonly tasks: Task[] | null;
}
```

**★ 核心纪律：`tasks: null`（未接入）≠ `tasks: []`（确无任务）**〔约束〕

| 状态 | `tasks` | 语义 | UI 必须呈现 |
|---|---|---|---|
| `'not_connected'` | **`null`** | Team 端口未接入（adapter `team` 端口 fail-closed，R-6）——**任务面整体不可用** | 「Team 未接入」的**显式状态**；**不得**显示空列表 |
| `'loading'` | **`null`** | 读面尚未返回（加载中） | 加载态；**不得**显示空列表 |
| `'data'` | `Task[]`（**可为 `[]`**） | 已从 Team 读到数据——`[]` 表示**确实没有任务** | 空列表文案（「暂无任务」） |

**为什么写死**〔约束〕：`null` 与 `[]` 混用会让「读不到」被读成「没有」——这正是 §1.2 C-6（`data-contract.md`）与 R-6 明禁的「**显示空任务列表冒充『暂无任务』**」。二者在 UI 上**必须**可区分：

- **`null`**：是「**不知道**」——不得据此说「你没有任务」，也不得据此说「任务都完成了」；
- **`[]`**：是「**知道，且没有**」——可显示「暂无任务」。

**UI 侧纪律**〔约束〕：

1. **不得用 `tasks ?? []` 或 `tasks?.length === 0` 之类写法**把 `null` 归一成空数组——该写法**恰好**抹掉本契约要保留的区分；
2. **`not_connected` 不得提供「刷新重试」以外的操作入口**（依赖未接入，重试无意义）；应指向「Team 端口接入（T08）」的说明；
3. **`loading` 与 `not_connected` 不得互相冒充**：加载中显示加载态，未接入显示未接入——两者都不是「空」；
4. **本契约不引入新持久状态**：三态是**读面的运行时结果**，**不落库**（对齐 §4.3 投影边界）。

**〔待实现〕**：本契约属**目标形状**——`TeamBoardState` 未实现，Team 端口未接入（R-6），M0.1 看板**只能**返回 `'not_connected'`。**不得**声称看板已可显示任务。

### 4.4 `unknown` 三态的看板查询语义

**core 侧的 `unknown`**〔读源确认：`contracts.ts:382-392`、`commit-gate.ts:87-92`〕：`SoloipsCommitOutcome` 的 `unknown` 表示「该 `operationId` 存在**未决（pending）**意图，结果未知」。对应的可观察查询：

| 看板问题 | core 查询 | 语义 |
| --- | --- | --- |
| 「这个领取动作结果如何？」 | `getOperation(operationId)` | `undefined`=从未发起；`pending`=**结果未知**；`committed`=已提交（`result` 为原结果） |
| 「我（员工）有没有悬而未决的事？」 | `listPendingOperations()` 按 `employeeId` 过滤 | 有 = **该员工的新准入应被阻塞**（`store.ts:716-721`） |
| 「我能否发起新领取？」 | `requestWorkEntry` 返回 `refused/employee-operation-unknown` | 拒绝原因是「未知」而非「资料不全」——**这是三态里最容易混淆的一对** |

**看板必须区分三种「不可领取」**〔建议，这是本节的核心输出〕：

| 状态 | 触发 | 看板文案方向 | 可否自解 |
| --- | --- | --- | --- |
| **资料未就绪** | `refused/onboarding-not-ready` + `gaps[]` | 列具体缺项与修复入口 | 员工可补资料 |
| **结果未知** | `refused/employee-operation-unknown` 或 `unknown` | 「上一动作结果待核对」，**明确禁止换 ID 重领** | **不可自解**，需核对（ORG-05） |
| **任务不可领** | Team 侧 `ready:false`（依赖未满足）或已被他人占用 | 「依赖未完成」/「已被 X 占用」 | 等依赖/等他释放 |

**三条纪律**〔建议，均来自既有需求〕：
1. **不得把 `unknown` 显示为「失败」或「空闲」**。ORG-10 原文：「空闲不是完成，提交不是验收，**未知不是空闲**，暂停不是已完成冷处理」。
2. **`unknown` 时不得提供「重试」按钮语义**，只能提供「核对」入口——因为 ORG-05 明确「查不清就阻塞相关新增动作，**不能换 ID 重领**」。UI 侧若给「重试」，就诱导了被禁止的动作。
3. **手动释放不存在**：Team 的任务 owner **不会自动释放**（〔读源确认：`packages/experimental/agent-team/README.zh.md:201`〕「idle、interrupt、进程退出与工作失败都不会释放任务 owner」）。因此看板上**不要**设计「超时自动回到可领取」的暗示。Lead 可 `reassign`（`task-board.ts:176-190`，仅 Lead 可），这是**显式人工动作**而非超时。

---

## 5. Q-N 推荐结论汇总

| Q | 推荐 | 关键理由 |
| --- | --- | --- |
| **Q-N1** 团队职能 | **`Team` 表加 `function` 字段**（+ `functionSource`），保留迁移到独立 `TeamFunction` 表的路径；**能力项不走 function 字段、统一走 `appointment.requiredCapabilities`**（指挥裁定第 2 条） | 职能无独立生命周期（ORG-01 拆分判据）；自由字符串对齐 DEP-R07 的部门差异要求；升级判据明确；职能与能力单一事实归属 |
| **Q-N2** 入团自动三步 | **分配与加载两层分离**；skills 分配落 core 新记录 + 自建 skill provider 让候选可见；MCP 只落**配置意图 + `configRef`（无凭据）**且必须有 `unavailable` 态；规范阅读用「强证据 `host-delivered`」与「弱证据 `model-reported`」两级，**弱证据不足以形成资格**；取证层推荐**案 B（独立 `assembly_evidence` 表）** | ① teammate 继承父 preset 的 standing 组合（新发现）⇒ 团队级隔离不能靠 preset 配置；② ORG-03 明禁「模型自报」单独成立；③ 案 B 规避破坏性介质变更（首任 R3） |
| **Q-N3** 组长产生 | **系统推荐 + 部长确认，推荐可被覆盖**；无人全命中时**推荐空缺**而非强行推荐；不做多组长 | 与编组「建议+确认」同构；最终任命权归部长（ORG-02）；单 Lead 与 `leadAppointmentId` 单数契约 |
| **Q-N5** 子公司嵌套 | **允许**（保持现状），配额按**全部 `subsidiary` 计数**（不论深度），用户侧默认不诱导深层；`operation` 作父的现有禁令保留 | §2 按 `type` 计数、无深度限制；按深度计数会形成无契约依据的绕过；三层公司层级是角色分层不是深度约束 |

---

## 6. 新发现的风险

| ID | 风险 | 证据 | 影响与缓解 |
| --- | --- | --- | --- |
| **R-1** | **团队级 skill/MCP 隔离与 preset 继承机制结构性冲突** | teammate 通过 `composeFrom` 加入父的 **standing** 组合（`child-agent.ts:205`、`agent-presets/src/index.ts:484-493`）；standing 按 **preset id 全局一份**（`index.ts:776-796`）；`customSkillDirs` 是行级静态配置（`skill-filesystem/src/index.ts:59,169`） | 团队级隔离**必须**走 per-agent 挂载或自建 provider，**不能**写进 preset 行。缓解：§2.1 的 provider 方案（per-agent scope 可读）+ §2.2 的 per-agent `mcp-client` 挂载；**未验证**，须先做挂载探针再定切片 |
| **R-2** | **`assembly_evidence` 新表可能演变成「双事实来源」** | 四类文档的装配既有 `employee.assemblyEvidence` 又会有新表 `kind='document'` 记录 | 必须写死「新表只读、不参与判定」；否则违反 `state.md` 的单写权威原则 |
| **R-3** | **schema 演进的容错逃生通道不存在（QA B5 强化）** | 三层同时成立：① `invalidRecords` 默认即「整次 open 拒绝」，且 **core 的 `SOLOIPS_COMPANY_DOMAIN_SPEC` 未声明该键**（`domain.ts:240-244`）；② 即便声明为 `'backup-and-skip'`，**在当前默认后端下仍是空操作**——该策略要求 `KvUnit.backupRecord` 存在，而 `backupRecord` **只在 JSON 后端的 per-record unit 实现**（`storage-json/src/per-record-unit.ts:238`；`storage-json/src/single-unit.ts` 与 `SqliteKvUnit` 均**无**此方法），宿主遂按文档**回退到拒绝默认**（`storage-domain/src/spec.ts:64-66`）；③ `defaultBackend` 恰为 **`sqlite`**（`contracts.ts:777`），即默认路径上**两条逃生通道都不可用** | ★ 任何**破坏性 schema 变更**（把字段改类型/改必填/嵌套化）都会让**存量记录整次 open 失败**，且**无法通过配置绕过**。这是本文 §1.5 / §2.4 坚持「先加新表 / 先可选字段」的**共同根因**。<br>**缓解（三条，缺一不可）**：(a) 新字段一律**先可选**、新信息一律**先加表**（§1.5、§2.4 案 B）；(b) 若必须改形状，先落 **P1：unit version 戳 + `compatibleVersions` 机制**（含 sqlite 后端的版本戳实现），再在**独立切片**内收紧；(c) 开发期若确需重置数据根，必须在切片内**显式声明**，不得默认依赖。**原 R-3（`subsidiary` 可无父）已并入下条 R-3b** | 
| **R-3b** | **`subsidiary` 可无父公司** | `createCompany` 只在 `parentCompanyId !== undefined` 时校验父存在性（`store.ts:336-353`）；`type='subsidiary'` 无父**不会被拒** | 会产生「孤儿子公司」——既有配额按 `type` 计数仍能算它，但组织树读不回（`getCompanyTree` 从给定根 DFS）。缓解：在 BE-5 加「`subsidiary` 必有父 + 父同账户」校验（对齐 `data-contract.md` §4.2 第 0 步，该步现有代码未实现） |
| **R-4** | **公司树无显式环检测** | `#computeDepth` 只检父记录缺失与深度上限（`store.ts:310-326`）；父可以是 `subsidiary`（`store.ts:342` 只禁 `operation`） | 物理上难以通过 `createCompany` 造环（新公司 id 是新生成的，不能成为既有记录的祖先），但**深度计算在环上会提前退出**（`depth < MAX_TREE_DEPTH` 守卫），返回**不正确的深度**而非报错。缓解：在 BE-5 的校验里对 `parentCompanyId` 链做显式环检测（比照现有「祖先链断裂」的主动检测风格）。**这不是可被外部触发的漏洞**〔推断〕，但会让深度限制在异常数据上静默失效 |
| **R-5** | **`requestWorkEntry` 的幂等探测不在提交门队内**（**P2-003 处置升级：写死为必须修复项**） | `probe` 在 `commit` 之前调用（`store.ts:695-714`），与并发提交之间存在窗口 | ★ **P2-003 采纳（2026-09-18）**：**写死要求**——`requestWorkEntry` 的 probe（含 `checkOnboarding` 判定）**必须移入 commit gate 队内执行**，与 write operation 落在**同一互斥区间**；**外部 probe 禁止**。详见下方「R-5 处置要求」 |
| **R-6** | **看板的任务读面完全依赖未接入的 Team 端口** | adapter `team` 端口 fail-closed（`ports/team.ts:37-75`）；`@deepseek-ai/dsh-experimental-agent-team` **不在** `packages/adapter-dsh/package.json` 依赖集（实测 node_modules 无此包） | 首任 §2.3 的「M0.1 只做纯数据层 Team」判断在**本节得到加强**：看板若要显示真实任务，必须等 Team 端口接入（T08）。M0.1 看板只能显示 core 侧事实（入职状态/未决操作）**加上**「Team 未接入」的显式状态，**不得**显示空任务列表冒充「暂无任务」 |
| **R-7** | **智能编组的能力匹配依赖 `verifiedCapabilities`，而该字段目前只能由 `verifyEmployeeCapability` 手工逐项写入** | `store.ts:540-569`；未见任何自动验证能力的路径 | 若一个部门的员工普遍没有 verified 能力，编组建议会**普遍落空**（`missing` 很大、`readyForWork` 全 false）。缓解：编组建议的 `reason` 必须把「能力未验证」与「能力不匹配」区分开（前者可补验证，后者是真实不匹配），否则部长会误判为「没人合适」 |

#### R-5 处置要求（P2-003，2026-09-18 采纳为硬要求）〔约束〕

**写死要求：`requestWorkEntry` 的 probe（onboarding 检查）必须移入 commit gate 队内执行，与 write operation 在同一互斥区间；外部 probe 禁止。**

| # | 要求 |
|---|---|
| R-5.1 | **probe 在队内**：`probe(operationId)` 的调用与 `checkOnboarding` 的判定**必须**发生在**同一次 `commit` 的队内临界区**（即持有提交门串行槽位时），**不得**在 `commit` 调用**之前**先判定再提交 |
| R-5.2 | **外部 probe 禁止**：**不得**存在绕过提交门的准入判定路径——包括「Host 半边先查 `checkOnboarding` 再调 `requestWorkEntry`」这类看似无害的预检（它把判定与提交拆到两个区间，正是本风险的形态）。**展示用**的 `checkOnboarding` 查询**不在此禁令内**（纯读、不参与提交决策），但**不得**把其结果作为提交依据传入 |
| R-5.3 | **判定输入在队内重取**：准入判定所读的事实（任职/文档/装配证据/记忆/能力）**必须**在队内重新读取（对齐 `data-contract.md` §4.3 K-3「读当前权威数据」），**不得**使用调用前算好的结论 |
| R-5.4 | **未决检查同在队内**：`listPendingOperations` 的阻塞判定（`employee-operation-unknown`）与 `probe` 的 `unknown/replayed` 分支**同样**须在队内完成——否则「未决阻塞」本身存在窗口 |
| R-5.5 | **失败方向**：任一判定不通过即返回可判定拒绝，**零业务写**；不得因移入队内而放宽任何既有拒绝条件 |

**为什么升级为硬要求**〔约束〕：M0.1 虽是「单 operator 交互式使用」，但**契约不得依赖使用方式**——「单 operator 无风险」是**运行假设**，不是**结构保证**；一旦出现第二写者或自动化调用（M0.2 多 Host），窗口立即成为**真实竞态**，且此时契约已经以「准入判定与提交是同一原子步」的口径被引用（首任 §2.1 的权限链叙述）。**在契约层先写死，避免后续返工。**

**与 `data-contract.md` §4.3 K-1/K-2 的同构关系**：K-1「互斥边界全覆盖」要求「计数 + 写入」落在同一串行槽位；本要求是**同一纪律在准入判定上的应用**——「判定 + 提交」必须落在同一串行槽位。**两处口径一致，不得只做一处。**

**〔待实现〕**：当前代码是**外部 probe**（`store.ts:695-714` 在 `commit` 之前），**不满足** R-5.1；须在 BE-6（Host 半边）或独立切片内修复。**在修复前，不得声称准入判定与提交是同一原子步。**

---

## 7. 裁定落地记录（2026-09-18，第三任）

> QA 统审完成后，指挥下达落地清单。以下为逐条处置，供复核。

| # | 裁定内容 | 落点 | 处置 |
| --- | --- | --- | --- |
| 1 | **BE-6「团队 CRUD」口径修正** | 首任 §4.1 BE-3/BE-6 + 本文 §1.4 | **采纳**。实测确认 `SoloipsOperationKind` 无 `team.*`（`contracts.ts:81-91`，全仓检索零命中）。BE-3 改为「**新增最小 team 命令 kind**（create/update-function/close）」，并注明这是 **`contracts.ts` 契约扩展点**（须与 `domain.ts`/`store.ts` 三处同步）；BE-6 增验收⑤「每个工具都对应一个已存在的命令 kind」 |
| 2 | **Q-N1 形状定稿** | 本文 §1.1 | **采纳**。写入裁定原文：`Team.function: string`（职能名、自由文本对齐 DEP-R07）+ `functionSource`；**能力项不走 function 字段，统一走 `appointment.requiredCapabilities`**；字段表加「`capabilities` 不新增」行消除歧义 |
| 3 | **scope 迁移细化（裁定 5）** | 本文 §1.5（新增） | **采纳**。给出 `scope?` 可选期的默认推断规则 3 条（含「无 scope 且有 departmentId → department 级」「首个 `general_assistant` → company 级」），并**如实标注规则 2 的不可判定性**（存量记录无信息可区分，给出两个方案并要求切片内二选一）；列收紧为必填的 4 项前置条件，**P1（unit version 戳）当前不满足** ⇒ 结论：P1 满足前 `scope` 必须保持可选 |
| 4 | **6 新实体登记预告** | 本文 §1.1（总表）+ §2.1/§2.2/§2.3(×2)/§2.4 | **采纳**。6 实体逐一加「**权威归属：待登记进 `data-contract.md` §2（P2 落实）**」，并在 §1.1 加汇总表（含 §2 现状与 P2 待办） |
| 5a | **QA B5 强化补进 R3** | 本文 §6 R-3（改写）+ R-3b（分出） | **采纳并强化**。核实三层事实：`invalidRecords` 默认拒绝且 core spec 未声明（`domain.ts:240-244`）；**即便声明也是空操作**——`backupRecord` 只在 JSON 后端 per-record unit 实现（`storage-json/src/per-record-unit.ts:238`，`single-unit.ts` 与 `SqliteKvUnit` 均无），`defaultBackend=sqlite`（`contracts.ts:777`）⇒ 宿主回退到拒绝默认；原 R-3（subsidiary 无父）拆为 **R-3b**，引用同步更新 |
| 5b | **工具名清单** | 首任 §4.1 BE-6（新增小节）→ 现**收敛至 `data-contract.md` §2.5** | **采纳，形态修正；清单已收敛**〔读源〕。**点号不能用于工具名**：DeepSeek 函数名称约定只允许 `[A-Za-z0-9_-]`（`mcp-client/src/tools.ts:50-51`），且全仓原生工具名**零个**含点号、官方 Team 工具全用下划线 ⇒ 形态为 **`soloips_<域>_<动作>`**，**刻意与 Remote 端点的点号形态不同形**。第三任曾据 M0.1 必需面给出 **16 行**建议清单（落盘于首任 BE-6 小节）；该清单**已被 `data-contract.md` §2.5 的 20 项表取代**（后者从权威命令面导出、覆盖面更全），本文档**不再维护第二份清单**，一律引用 §2.5。**命名差异已消解**：16 行版的 `soloips_company_tree`→§2.5 作 `soloips_company_get_tree`、`soloips_onboarding_check`→`soloips_employee_check_onboarding`、`soloips_grouping_suggest`→§2.5 无此项（编组建议暂无 kind，属〔待决〕） |
| 6 | **PR #15 审查意见修正后的同步**（2026-09-18 补录，文档智能体） | 本文 §1.1（实体登记一览 + NormAck 示意） | **采纳同步**。`data-contract.md` 已完成 N-1…N-9 修正：6 实体**全部登记完成**（原「待登记」标记已失效，§1.1 表已改为「已登记」并加状态更新注）；`NormAck` 示意块标〔已取代〕（主键改 `ackId`、append-only）；`Team` 补 `confirmedBy`；`TeamMcpIntent` 补迁移矩阵；`AssemblyEvidence` 升格为 INV-AE-1。**本文各实体的 `interface` 代码块一律降级为过程留痕，引用时指 `data-contract.md` §2.1/§2.2** |

**新增/变更的既有引用**：R-3 → R-3b（§3.2 内引用同步）；`team.create` 引用统一改为「BE-3 待新增 kind」（§1.2 已加注）。

**本次未改动**：§2.0 的 preset standing 组合发现、§2.4 的案 B 推荐、§3 的 Q-N5 结论、§4 的看板投影与 `unknown` 三态——裁定清单未涉及，保持原样。

**权威归属（本文自身）**：本记录为**过程留痕**，不改写第 1–6 节的结论文本；被裁定修正处已在原处就地更新（非仅在本文追加）。

---

## 7b. ChatGPT 第二阶段审查落地（2026-09-18，第九任）

> 第二阶段审查（BE 切片闭合）意见经指挥逐条核实并裁定：**四条 P1 全采纳**；P2 三条中**两条采纳、一条折中**。以下为逐条处置。

| # | 裁定内容 | 落点 | 处置 |
| --- | --- | --- | --- |
| **BE-001** | **`team.create` 三步协议冻结** | 本文 §1.4（kind 表后注 + 纪律 3 改写）；权威正文 `data-contract.md` §2.1.1 **P-9** | **全采纳**。成团冻结为三步三 kind 三 `operationId`：①`team.create`（只建 `status='pending'`、**无组长**）→ ②`appointment.create`（`team_lead`）→ ③`team.activate`（P-4 校验后转可用）。恢复入口 = 扫描 `pending` **续做或收敛**（收敛经 `team.close`，**不物理删除**）。kind 表新增 `team.activate` 行、删除 `team.create` 的「（可选）任职」表述；纪律 3 由「二选一」改为「已冻结为三步」；**首任 BE-3 验收③修正**（「恰好一名 `team_lead`」仅对 `active` 团队成立，`pending` 无组长是合法中间态） |
| **BE-002** | **`operation` 加 `schemaVersion`** | 本文 §1.4（新增纪律 4）；权威正文 `data-contract.md` §2.1 `SoloipsOperationRecord` | **全采纳**。新增字段〔待实现〕：新写入带当前版本；读取遇 **unknown kind** 按版本兼容处理（历史 operation 不因 kind 封闭联合扩展而不可读）。落地纪律：**与 `team.*` kind 同一批落地**，不得先加 kind 后补版本字段。取值机制（初始值/递增/与 §2.3 P1 的关系）标〔待决〕——**字段存在性是硬要求，取值机制不是** |
| **BE-003** | **删除 runtime 推断规则 2** | 本文 §1.5（推断表重写 + 删除说明）；权威正文 `data-contract.md` §2.3 | **全采纳**。「无 `scope` 且首个 `general_assistant` → company 级」**从 runtime 推断中删除**；改为**严格三分支**（① 有 `scope` 用之 / ② 无 `scope` 有 `departmentId` 归 department / ③ 否则 `SOLOIPS_CORE_RECORD_INVALID`，**不猜**）。该推断**仅允许存在于 migration 工具且须人工确认**（四条约束：载体是迁移工具、人工确认后才写、经新 `operationId`、逐条可追溯）。理由：时序猜测在并发/分页/重放/迁移下**不稳定**，产出非确定性结果。原「两个方案二选一」表述**作废**（已选定严格分支） |
| **BE-004** | **SkillAssignment 状态机** | 本文 §2.1（记录块 + 说明注）；权威正文 `data-contract.md` §2.1 | **全采纳**。`status` 由两值 `'assigned' \| 'revoked'` 扩为**五态** `'requested' \| 'available' \| 'active' \| 'failed' \| 'revoked'`（与 §2.2 MCP 生命周期对齐），含迁移矩阵（`revoked` **无出边**）。**M0.1 实际只走到 `requested`**，其余四态不可达、实现不得自行写入。旧值 `'assigned'` **不再使用** |
| **P2-001** | 编组建议加 `suggestionId`/`createdAt`；snapshot 版本机制 | 本文 §1.2（`SoloipsGroupingSuggestion` 结构 + 新增待决小节） | **折中采纳**。**本次即落地**两字段：`suggestionId`（建议可引用/可关联）+ `createdAt`（一等字段，便于排序去重）；**`evidence` 注释同步更正**——原写「事实快照，使建议可复算」是**过度承诺**，改为「事实概况，**不构成快照**」。**快照版本机制（`employeeSnapshotVersion` 等）标〔待决 M0.2+〕**，并写明：若走「加版本字段」路线则依赖 unit version 戳（同 R-3 介质缺口，**当前不满足**）；M0.1 **不要求**可复算，**不得**声称建议可复算 |
| **P2-002** | 看板读面补 `TeamBoardState` 契约 | 本文 §4.3b（新增） | **全采纳**。新增 `TeamBoardState = { status: 'not_connected' \| 'loading' \| 'data'; tasks: Task[] \| null }`。**核心纪律写死：`tasks: null`（未接入）≠ `tasks: []`（确无任务）**——三态对照表 + 四条 UI 纪律（禁止 `tasks ?? []` 归一、`not_connected` 不得提供无意义重试、`loading` 与 `not_connected` 不得互相冒充、不引入新持久状态）。与 §4.3（投影不落库）、R-6（Team 端口未接入）一致 |
| **P2-003** | `requestWorkEntry` probe 移入 commit gate 队内 | 本文 §6（R-5 行升级 + 新增「R-5 处置要求」小节） | **全采纳（升级为硬要求）**。写死：probe（含 `checkOnboarding` 判定）**必须移入 commit gate 队内执行**，与 write operation **同一互斥区间**；**外部 probe 禁止**。五条要求 R-5.1…R-5.5（probe 在队内 / 外部 probe 禁止 / 判定输入队内重取 / 未决检查同在队内 / 失败方向不变）。**理由**：M0.1「单 operator 无风险」是**运行假设**不是**结构保证**；契约层先写死避免 M0.2 多 Host 时返工。与 `data-contract.md` §4.3 K-1/K-2 **同构**（同一纪律在准入判定上的应用） |

**本次同步的既有表述**：§1.1 实体登记表行 1/2（Team 加 pending/可缺省、SkillAssignment 五态）；§1.4「契约登记预告」改为「已登记」并指向权威落点；§1.4 设计纪律由三条改四条；§1.5「与 BE-2 的关系」段由「默认推断」改「严格三分支」。

**本次未改动**：§2.0 preset standing 组合、§2.4 案 B 推荐、§3 子公司嵌套（Q-N5）、§4.4 `unknown` 三态纪律——本批裁定未涉及。

**反面声明**：以上七条**均为文档层裁定**，不证明任何一条已实现。`data-contract.md` §0 明列 Team/权限/配额/审计**均未实现**；R-5 的修复、`schemaVersion` 的落地、五态的写入路径**都还没有代码**。

## 附录 A：证据范围

**soloips 侧读源**（本次逐条复核，首任结论未变）：
- `packages/core/src/`：`store.ts`（`createCompany`/`createDepartment`/`createAppointment`/`recordAssemblyEvidence`/`createTeam` 相关/`requestWorkEntry`/读投影，含 `MAX_TREE_DEPTH`、`#computeDepth`）、`contracts.ts`（`assemblyEvidence` 形状、`TeamTaskView` 无关项、`SoloipsCommitOutcome`、`SoloipsCoreService`）、`domain.ts`（六表、`appointmentRecordSchema`、`employeeRecordSchema`、`documentVersionRecordSchema`）、`onboarding.ts`（`assemblyGaps`、能力差集）、`schema.ts`（值校验组合子）、`commit-gate.ts`（`probe`/`listPendingOperations`）
- `packages/adapter-dsh/src/`：`contracts.ts`（七端口、`SoloipsDomainSpec` 的 `invalidRecords`/`compatibleVersions`、`SoloipsTeamPort`）、`ports/team.ts`（fail-closed 占位全文）、`ports/events.ts`（事件词表与翻译）、`ports/session.ts`（1–80）、`ports/storage-sqlite.ts`（1–40 自述缺口）
- `packages/{core,adapter-dsh}/package.json`（依赖集，确认无 `mcp`/`skill`/`agent-team`/`typert-protocol`）
- `docs/`：`prds/system-assistant-backend-design-v0.1.md`（首任，全文）、`design/data-contract.md`（§0/§1.1/§2/§3/§4）、`refactoring/02-company-contract.md`（ORG-01..13、§10.x、§11.x）、`refactoring/01-departments.md`（LIB-01..11）

**DSH fork 静态读源**（`D:/Source/workspace/deepseek-harness`，HEAD `abdfeb4831`，分支 `codex/team-roster-model`，版本 `0.1.6-alpha.1`）：
- skills：`docs/subsystems/skills.zh.md`、`packages/skill/skill/src/index.ts`（`SkillLookupOptions`/`SkillViewOptions`/`registerProvider`/`ScopedLayers`）、`packages/skill/skill-filesystem/src/index.ts`（`Config`/`customSkillDirs`/rank 表/`apply`）、`packages/skill/tool-skill/src/index.ts`（`skill` 工具的 scope 用法）、`packages/bundle/base/cordis.patch.yml`（skill 行）、`packages/bundle/web-app/cordis.patch.yml`（§skill plane 注释）、`packages/preset/agent-presets/presets/{standard,ptc,cordis}/agent.cordis.yml`（`skill-filesystem`/`tool-skill` 行）
- MCP：`docs/subsystems/mcp.zh.md`、`packages/mcp/mcp-client/README.zh.md`（配置字段表、作用域、生命周期）
- agent-team：`docs/subsystems/agent-team.zh.md`、`packages/experimental/agent-team/README.zh.md`（含「已知限制」）、`src/types.ts`（`TeamTaskStatus`/`TeamTaskSnapshot`/`TeamTaskView`/`TeamMemberView`/`SpawnTeammateRequest`）、`src/task-board.ts`（`update` 的授权分支、`task-<n>` 分配）、`src/roster.ts`（`spawnAdmitted` → `ctx.subagents.startContinuable`）、`src/index.ts`（`TeamService` 方法）、`packages/experimental/tool-agent-team/src/index.ts`（Team 工具集与 `POLICY`）、`packages/experimental/agent-team-profile/cordis.patch.yml`
- preset / scope / subagent：`packages/preset/agent-presets/src/{index.ts,mount.ts}`（`mount`/`composeFrom`/`ensureStanding`/`mountPreset`）、`packages/subagent/subagent/src/child-agent.ts`（`applyChildComposition`/`ChildComposition`）、`src/types.ts`（`ContinuableStartSpec`/`ContinuableCreateSpec`/`ContinuableCreateRequest`）、`src/continuation.ts`（child materialize 与 `composition`）、`packages/subagent/subagent-spawn-in-process/src/index.ts`、`packages/core/scope/src/index.ts`（`scopeOf`/`bindScopeParent`）、`packages/core/agent/src/{index.ts,runtime-types.ts}`（`CreateAgentOptions.setup`、`agent/created`）、`packages/core/tools/src/index.ts`（`restrict`/`tools/change`）
- storage：`packages/storage/storage-domain/src/{index.ts,domain.ts,spec.ts}`（**写入路径不校验 schema**，只在 open 读回边界校验 —— 决定了案 A 的介质风险形态）、`packages/storage/storage/src/backend.ts`（`KvUnit.backupRecord?` 为**可选**方法）

**第三任新增读源（裁定落地，2026-09-18）**：
- `packages/core/src/contracts.ts:81-91`（`SoloipsOperationKind` 封闭联合十项，确认**无 `team.*`**）；全仓 `grep -rn "team\.create\|team\.update\|team\.close\|team\.list" packages/core/src` → 零命中〔实测〕
- `packages/core/src/domain.ts:240-244`（`SOLOIPS_COMPANY_DOMAIN_SPEC` 未声明 `invalidRecords`/`compatibleVersions`）
- `packages/storage/storage-domain/src/spec.ts:56-66`（`invalidRecords` 语义与「无 `backupRecord` 的后端回退到拒绝默认」）
- `packages/storage/storage-json/src/{per-record-unit.ts:238,single-unit.ts}`（**只有** per-record unit 实现 `backupRecord`）；`packages/adapter-dsh/src/ports/storage-sqlite.ts:236-388`（`SqliteKvUnit` 无 `backupRecord`）；`packages/adapter-dsh/src/ports/storage.ts:387-391`（`sqlite` 走 `SqliteStorageBackend`）
- `packages/adapter-dsh/src/contracts.ts:777`（`defaultBackend: "sqlite"`）
- `packages/mcp/mcp-client/src/tools.ts:45-86`（DeepSeek 函数名称约定：≤64 字符、仅 `[A-Za-z0-9_-]`；用于工具名形态裁定）
- `packages/experimental/tool-agent-team/src/index.ts:171-350`（十个官方 Team 工具名，全部下划线形态）
- `packages/adapter-dsh/src/ports/storage.ts:136-150`（`toHostSpec` 的 `invalidRecords`/`compatibleVersions` 透传）

**未验证 / 无法核对**：
- 任何能力的**运行期**行为（未启服务、未跑装配、未做验收）
- 「按 team / 按 agent 挂载 `mcp-client` 行」与「自建 skill provider 按 agent scope 供候选」的实际可行性——本文只读源确认了 scope 机制与 API 形状，**未做挂载或 provider 实验**
- Typert 生成在 soloips 工作区可用性（首任 R1 未变）
- Team 端口接入所需的 `@deepseek-ai/dsh-experimental-agent-team` 安装与组合改动
- UI 侧的双边契约面（RPC 形状、字段命名、卡片结构、工具名清单）——**本任未读 UI 文档**，留 QA 对齐

**本文不蕴含**：登记设计等于已实现；读源结论等于运行验收；首任 §4.2「不做」清单因本文而被解除。
