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

**权威归属：待登记进 `data-contract.md` §2（P2 落实）**——`data-contract.md` §2 **已有** `SoloipsTeamRecord` 目标类型，但 `function` / `functionSource` 是本文新增字段；P2 需把这两字段补进 §2 的 `SoloipsTeamRecord`，并注明「能力项不入本记录」。

**实体登记一览（6 个新实体，均为 P2 待登记项）**〔裁定第 4 条〕：

| # | 实体 | 位置 | `data-contract.md` §2 现状 | P2 待办 |
| --- | --- | --- | --- | --- |
| 1 | `Team`（+ `function`/`functionSource`） | §1.1 | 有类型、缺新字段 | 补两字段声明 |
| 2 | `TeamSkillAssignment` | §2.1 | 无 | 补 id 品牌 + 记录 |
| 3 | `TeamMcpIntent` | §2.2 | 无 | 补 id 品牌 + 记录 + `configRef` 域 |
| 4 | `team_norm`（团队规范条目/版本） | §2.3 | 无 | 补 id 品牌 + 记录 + 与 `document_version` 分工 |
| 5 | `NormAck`（阅读/确认状态） | §2.3 | 无 | 补记录 + `method` 判定语义 |
| 6 | `AssemblyEvidence` | §2.4 | 无（§2 只有语义不同的 `ExecutionBinding`） | 补记录 + 与 `employee.assemblyEvidence` 分工 |

### 1.2 编组算法：从职能到「编组建议 + 理由」

**输入**：`teamId`（或 `departmentId` + 新职能）、`function` 定义文本、候选人范围（部门内 / 跨部门）。

**流程**〔建议〕：

| 步 | 内容 | 依据/边界 |
| --- | --- | --- |
| 1 | 部长提交 `function` + `scope: 'department' \| 'cross-department'` | ORG-02「管理员只在获准本部门范围招募」——跨部门需更高授权（总助理），见下 |
| 2 | 取候选人集合：部门内 = 该部门所有 `active` `appointment` 的员工；跨部门 = 该公司内 | 需要首任 BE-4 的 `listAppointments(departmentId)` / `listEmployees(companyId)` 读面 |
| 3 | 按能力匹配评分 | 见下 |
| 4 | 产出「编组建议」结构 | 见下 |
| 5 | **部长确认** → 成团（创建 `team` + `team_lead`/`member` 任职） | 确认是唯一写入口 |

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
  /** 生成建议所依据的事实快照，使建议可复算。 */
  readonly evidence: {
    readonly candidateCount: number;
    readonly evaluatedAt: string;
  };
}
```

**关键设计约束**〔建议，依据 ORG-03 + ORG-08〕：
- **建议不是授权**：结构里**不放**任何可执行动作，只列事实与理由；成团必须经部长确认的独立写命令（`team.create` + 任职创建）。**注意**：`team.create` 是 **BE-3 待新增**的 kind，不是现有能力——见 §1.4。
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
| `team.create` | 建团队（含 `function` / `functionSource`） | `createTeam` | `team` 一条 + （可选）`team_lead`/`member` 任职（各自独立提交或同 kind 内顺序写） |
| `team.update-function` | 改职能定义 | `updateTeamFunction` | `team.function` + `functionSource` 更新 |
| `team.close` | 归档团队（`status: 'archived'`） | `closeTeam` | `team.status` 更新 |
| （无 kind）读面 | `listTeams` / `getTeam` | — | **纯读不产生 kind**（对齐 `checkOnboarding`/`getCompany` 等既有读面的处理：读路径不经提交门，`store.ts:753-860`） |

**设计纪律（三条）**〔建议〕：

1. **`team.list` 不是 kind**。kind 只登记**持久写**操作（`contracts.ts:80` 的注释原文：「本切片实际存在的持久写操作种类」）。给读操作造 kind 会污染 `operation` 台账并让恢复核对出现无意义的未决记录。
2. **`kind` 是幂等与冲突检测的身份**。提交门在 `operationId` 命中既有记录时**比对 kind**，不同则抛 `SOLOIPS_CORE_CONFLICT`〔读源确认：`commit-gate.ts:126-132`〕。因此 kind 命名必须**稳定且互不混淆**——用 `team.update-function` 而不是泛化的 `team.update`，可为后续 `team.update-name` 等留出无歧义空间（避免「同一 kind 语义悄悄扩大」）。
3. **一次成团 = 多个提交，不是一次原子提交**。`createTeam` 若同时落团队与 N 条任职，须按首任 §1.3 的既有纪律处理：**承诺门不提供跨表事务**〔`commit-gate.ts:11-14`〕，因此要么**拆成多个 kind 的独立提交**（每步带自己的 `operationId`，失败可从已提交事实续做），要么在同一 kind 的 `mutate` 内顺序写并在文档中**如实声明「非原子」**。**不得**声称成团是原子的。

**与 §1.2 的衔接**：§1.2「部长确认成团」的写路径，就是本节的 `team.create`（+ `appointment.create` 若干）。修正前该处引用的 `team.create` 属**尚不存在的 kind**，本节把它显式登记为 BE-3 的交付项。

**契约登记预告**：`SoloipsOperationKind` 的新增项属 `data-contract.md` §2 范围的**契约扩展**——**权威归属：待登记进 `data-contract.md` §2（P2 落实）**。

**与 BE-6 工具名的衔接**：本节新增的 kind 对应首任 §4.1 **BE-6** 的工具名清单（`soloips_team_create` / `soloips_team_update_function` / `soloips_team_close`）——**工具名用下划线、kind 用点号**，两者刻意不同形（理由与完整清单见首任 BE-6 的「系统助理工具名建议清单」）。

### 1.5 任职 `scope` 的迁移路径（裁定 5 落地：先可选 + 默认值补齐）

**裁定内容**〔需求/裁定：QA 统审后指挥落地清单第 3 条〕：首任 §1.4 的冲突点 **C-4「Appointment 的 scope 与 `departmentId` 重复表达归属」采纳**（指挥清单以「裁定 5」引用，本文按首任的稳定 ID **C-4** 定位；**注意**首任 C-1 是配额里程碑口径，两者不可混引），但**强制走「先可选 + 默认值补齐」路径**——`scope` 上线时是**可选字段**，不一步收紧为必填。

**为什么必须如此（与 §2.4 同一根因）**〔读源确认〕：`appointmentRecordSchema` 当前 `departmentId` 是**必填**且**没有 `scope`**〔`packages/core/src/domain.ts:144-152`〕。若把 `scope` 直接设为必填，**存量 `appointment` 记录会缺该字段 → 整次 open 失败**——因为 domain 的 `invalidRecords` 默认是**拒绝**（「Absent (the default), the whole open rejects with `invalid-record` — right for authoritative data」〔读源确认：fork `packages/storage/storage-domain/src/spec.ts:56-66`〕），而 core 的 spec **未声明** `invalidRecords`〔读源确认：`packages/core/src/domain.ts:240-244` 无该键〕。

**阶段一：`scope?` 可选期的默认推断规则**〔建议〕（读取时凡遇到缺 `scope` 的记录，按序推断，**不写回**）：

| 序 | 条件 | 推断结果 | 依据 |
| --- | --- | --- | --- |
| 1 | 记录**无** `scope`，且 `departmentId` 存在 | `{ kind: 'department', companyId: <由 departmentId 解析 department.companyId>, departmentId }` | 现有形状即部门级任职（`departmentId` 必填语义，`domain.ts:147`） |
| 2 | 记录**无** `scope`，且是该公司**首个** `role` 推断为 `general_assistant` 的任命 | `{ kind: 'company', companyId }` | 公司级任职无部门可挂——**这正是不加 `scope` 就无法表达的那类**（首任 §2.1） |
| 3 | 记录**无** `scope`，且无法解析出公司 | **判定为数据不一致**，按 `SOLOIPS_CORE_RECORD_INVALID` 处理 | 不猜（对齐首任「交付确定性、不虚构」纪律）；不得静默当作任一 scope |

**关于规则 2 的一个诚实边界**〔未验证〕：规则 2 依赖「首个 `general_assistant`」这个**基于读取顺序/时间的推断**，它**不是**权威事实——存量记录里**没有**信息能把公司级任职与部门级任职区分开（这正是 `scope` 缺失造成的不可判定的历史数据）。因此：

- 规则 2 只应在**明确的迁移路径**中应用（例如「公司创建时自动产生的首个总助理任职」这一已知写入路径），**不应**作为通用读取时的猜测；
- 更稳妥的做法〔建议〕：**阶段一不推断规则 2**，而是让「公司级任职」通过**迁移脚本或重新任命**（新 `operationId` 产生带 `scope` 的新任职、旧的撤销）显式建立；读取时遇无 `scope` 且无 `departmentId` 的记录一律按规则 3 报错。
- **两个方案都必须在切片内二选一并写进实现说明**，不能留给运行时即兴决定。

**阶段二：收紧为必填的前置条件**〔建议〕（**必须全部满足**才可执行）：

| # | 前置条件 | 当前状态 |
| --- | --- | --- |
| P1 | **unit version 戳机制存在**（介质能表达 domain 版本、能判定 version-mismatch） | ★ **不满足**：SQLite 后端未写 unit version 戳、无 version-mismatch 判定〔读源确认：`packages/adapter-dsh/src/ports/storage-sqlite.ts:36-39` 自述既有缺口〕；core 也未声明 `compatibleVersions` |
| P2 | 存量记录已全部带 `scope`（迁移完成、无缺项） | 待阶段一执行后核对 |
| P3 | 收紧动作有**可回退**路径（`compatibleVersions` 或显式迁移步骤） | 不满足（同 P1） |
| P4 | 收紧在**独立切片**内发布，不与业务功能同片 | 待规划 |

**★ 结论**〔推断，依据 P1/P3 现状〕：**在 P1 满足前，`scope` 必须保持可选**。这不是保守选择，而是**介质层能力决定的硬约束**——`compatibleVersions` 与 `invalidRecords` 两个逃生通道目前都不可用（见 R-3 强化后的 §6）。

**与 BE-2 的关系**：首任 BE-2「`appointment` 增 `scope`（判别联合）与 `role`」的验收标准④「公司级任职在旧 `departmentId` 必填约束下不再被迫挂部门」**仍然成立**，但实现方式须按本节：**新写入**的任职带 `scope`（新记录不受存量约束）。`departmentId` 是否同步改为可选，属 BE-2 内决定，**建议同为可选 + 默认推断**（保持两条字段的迁移节奏一致）。

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
  readonly status: 'assigned' | 'revoked';
  readonly createdAt: string;
}
```

**权威归属：待登记进 `data-contract.md` §2（P2 落实）**——本表为本文新引入的持久实体，`data-contract.md` §2 当前无对应类型；P2 需补 `SoloipsTeamSkillAssignmentId` 品牌类型与记录声明。

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

**权威归属：待登记进 `data-contract.md` §2（P2 落实）**——`data-contract.md` §2 现无 MCP 相关类型；P2 需补 `SoloipsTeamMcpIntentId` 品牌类型与记录声明，并明确 `configRef` 指向的配置域（部署层，不含凭据本体）。

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

> **实体 4/6：`team_norm`**——**权威归属：待登记进 `data-contract.md` §2（P2 落实）**。§2 现无团队级资料条目类型；P2 需补 `SoloipsTeamNormId` / `SoloipsTeamNormVersionId` 品牌类型与记录声明，并说明它与 `document_version` 的分工（团队资料 vs 个人资产，`ownerId` 语义不同）。
- **归属**：规范属**团队**（业务归属 `teamId`），不属员工个人。因此**不能**塞进 `document_version`（其 `ownerId` 是 `employeeId`，`domain.ts:173-182`）——这是必须新表的理由，而不是重复建设。

**阅读状态的取证形态**〔建议〕：

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

**权威归属：待登记进 `data-contract.md` §2（P2 落实）**——`data-contract.md` §2 现无「阅读/确认状态」类型；P2 需补 `SoloipsNormAckRecord` 声明，并写明 `method` 的判定语义（弱证据不足以形成资格）。

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

**权威归属：待登记进 `data-contract.md` §2（P2 落实）**——`data-contract.md` §2 现无装配取证类型（§2 只有 `SoloipsExecutionBindingRecord`，语义不同：执行绑定是 Session↔员工↔任职的**活动**映射，本节新表是**装配动作的观测台账**）；P2 需补 `SoloipsAssemblyEvidenceRecord` 声明，并写明与 `employee.assemblyEvidence` 的分工（见下文「并存关系」与 R-2）。

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
| **R-5** | **`requestWorkEntry` 的幂等探测不在提交门队内** | `probe` 在 `commit` 之前调用（`store.ts:695-714`），与并发提交之间存在窗口 | 单 operator 交互式使用无实际风险；但**不得**在文档或验收中声称「准入判定与提交是同一原子步」。缓解：看板查询语义（§4.4）不依赖该原子性 |
| **R-6** | **看板的任务读面完全依赖未接入的 Team 端口** | adapter `team` 端口 fail-closed（`ports/team.ts:37-75`）；`@deepseek-ai/dsh-experimental-agent-team` **不在** `packages/adapter-dsh/package.json` 依赖集（实测 node_modules 无此包） | 首任 §2.3 的「M0.1 只做纯数据层 Team」判断在**本节得到加强**：看板若要显示真实任务，必须等 Team 端口接入（T08）。M0.1 看板只能显示 core 侧事实（入职状态/未决操作）**加上**「Team 未接入」的显式状态，**不得**显示空任务列表冒充「暂无任务」 |
| **R-7** | **智能编组的能力匹配依赖 `verifiedCapabilities`，而该字段目前只能由 `verifyEmployeeCapability` 手工逐项写入** | `store.ts:540-569`；未见任何自动验证能力的路径 | 若一个部门的员工普遍没有 verified 能力，编组建议会**普遍落空**（`missing` 很大、`readyForWork` 全 false）。缓解：编组建议的 `reason` 必须把「能力未验证」与「能力不匹配」区分开（前者可补验证，后者是真实不匹配），否则部长会误判为「没人合适」 |

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
| 5b | **A4 工具名清单** | 首任 §4.1 BE-6（新增小节） | **采纳，但形态修正**〔读源〕。**点号不能用于工具名**：DeepSeek 函数名称约定只允许 `[A-Za-z0-9_-]`（`mcp-client/src/tools.ts:50-51`），且全仓原生工具名**零个**含点号、官方 Team 工具全用下划线。故建议形态改为 **`soloips_<域>_<动作>`**（如 `soloips_company_create`、`soloips_team_update_function`），给 16 行清单与 kind 逐行对应；**刻意与 Remote 端点的点号形态不同形**，并标〔未验证〕待 UI 侧 QA 对齐 |

**新增/变更的既有引用**：R-3 → R-3b（§3.2 内引用同步）；`team.create` 引用统一改为「BE-3 待新增 kind」（§1.2 已加注）。

**本次未改动**：§2.0 的 preset standing 组合发现、§2.4 的案 B 推荐、§3 的 Q-N5 结论、§4 的看板投影与 `unknown` 三态——裁定清单未涉及，保持原样。

**权威归属（本文自身）**：本记录为**过程留痕**，不改写第 1–6 节的结论文本；被裁定修正处已在原处就地更新（非仅在本文追加）。

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
