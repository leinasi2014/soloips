# 系统助理（M0.1）后端设计规划 v0.1

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-SA-BE-01`；系统助理 M0.1 后端设计规划（首版） |
| 目的 | 给定「系统助理 = M0.1 交互载体、组织三级权限链」的产品方向，盘点 core 与 adapter 现状，给出后端模型设计、对话流路径与最小实施切片 |
| 范围 | `packages/core`、`packages/adapter-dsh`、`packages/web`（包边界层面）与 DSH fork 的确认性读源；**不含**代码、不含 UI 视觉设计、不含 PRD |
| 决策状态 | 本文为**设计规划**：数据模型与权限方案标〔建议〕，其余为读源事实与差距记录；不构成实现授权，不改变 `data-contract.md` 的权威地位 |
| 证据范围 | 读源范围见附录 A（文件清单与行号）；本机 DSH fork 核对为静态源码，不代表已安装、已构建或已验收；**本文不含任何运行期验收证据** |
| 依据 | [`data-contract.md`](../design/data-contract.md) §0/§1.1/§2/§3/§4/§6.1；[`02-company-contract.md`](../refactoring/02-company-contract.md) ORG-02/03/05/06、DEP-R01、DEP-D04、DEP-O01、§11.1；[`web-ui-fork.md`](../decisions/web-ui-fork.md) SOLO-UI-FORK-01；[`architecture-summary.md`](../architecture-summary.md) |
| 变更权 | 架构负责人；本文结论被新决定取代时标〔已取代〕并指向新正文 |

**反面声明**：本文不证明系统助理已实现、不证明配额已生效、不证明 Team 能力可用、不证明 `@Remote` 通路已打通、不证明 M0.1 可验收。`data-contract.md` §0 明列配额、权限、Team、执行绑定、审计**均未实现**。

**术语约定**（沿用 [`02-company-contract.md`](02-company-contract.md) §10.1）：
- **系统助理**：系统级/平台级的引导体，面向所有用户，**不产生公司任职**；本任务的产品前提。
- **总助理**：**公司级**任职（`general_assistant`），由招募流程产生（`data-contract.md` §1.1 裁定「公司级任职，复用现有任职机制」）。
- **部长**：部门级管理员。现有文档用词为 `department_lead`（`data-contract.md` §2）/ `department_leader`（`multi-company-implementation.md` §2，〔已取代〕）。本文统一写 **`department_lead`**。
- **团队 / 组长**：`Team` 实体 + `team_lead` 角色。

---

## 1. core 现状盘点（读源实测）

### 1.1 `SoloipsCoreService` 已暴露的服务面

〔读源确认：`packages/core/src/contracts.ts:424-481`〕

| 面 | 方法 | 说明 |
| --- | --- | --- |
| 写（经提交门） | `createCompany` / `createDepartment` / `createEmployee` / `createAppointment` / `revokeAppointment` | 公司/部门/员工/任职 |
| 写（入职事实） | `initializeEmployeeMemory` / `verifyEmployeeCapability` / `recordAssemblyEvidence` | ORG-03 三项事实 |
| 写（文档） | `saveEmployeeDocument` | 不可变版本 + 必需文档 CAS 提升 |
| 写（准入） | `requestWorkEntry` | SOLO-ACC-04 三条路径共用前门 |
| 读（判定） | `checkOnboarding` | 纯读，不写状态、不持锁 |
| 读（投影） | `getCompany` / `listSubsidiaries` / `getCompanyTree` / `listDepartments` / `getEmployee` / `getAppointment` / `getDocumentVersion` / `getOperation` / `listPendingOperations` | 全部同步返回，见 `store.ts:753-860` |
| 生命周期 | `close()` | 逆序释放 domain → stack → lease |

服务名常量 `SOLOIPS_CORE_SERVICE_NAME = "soloipsCore"`〔读源确认：`packages/core/src/contracts.ts:25`〕。

**提交门实测（串行）**：`SoloipsCommitGate.commit` 用单条 Promise 链把同实例的 `commit` 串行（`commit-gate.ts:111-119`），并在**每次** `put/update/delete` 前重新 `lease.assertHeld()`（`commit-gate.ts:176-210`）；失败按 `LEASE_NOT_HELD` / `LEASE_CHECK_FAILED` 翻译（`errors.ts:34-40`）。意图先行 → 业务写 → 标记 committed（`commit-gate.ts:121-159`）。

**缺口（对系统助理直接相关）**：读面**没有** `getDepartment(id)`、`listEmployees(companyId)`、`listAppointments(departmentId|employeeId)`、`listDocumentsByEmployee`、`listTeams`、`getTeam`。系统助理工作台要展示「公司 → 部门 → 部长 → 团队」的组织树与「员工配置页」的文档清单，当前服务面**读不出来**（只能靠 `getEmployee` 拿 id 后逐条 `getDocumentVersion`，且拿不到员工清单本身）。

〔读源确认：`packages/core/src/store.ts:828-835`〕`listDepartments` **未做** `companyId` 形状校验（对比 `listSubsidiaries`/`getCompanyTree` 都校验），也无 `accountId` 过滤——单账户根下不构成越权，但属于入口纪律不一致。

### 1.2 domain 模型（六表）与 `data-contract.md` §2 的差距

六表实测：`company` / `department` / `employee` / `appointment` / `document_version` / `operation`〔读源确认：`packages/core/src/domain.ts:221-244`〕。domain 名 `soloips_company`、版本 `1`〔`contracts.ts:33-36`〕。

以 `data-contract.md` §0 实现状态表为基准逐项核对：

| `data-contract` §0 行 | 本文核对结论 | 证据 |
| --- | --- | --- |
| Company 记录 | **一致**，除 §2 的 `archivedAt?` 未实现（§0 未列该字段为缺失） | `domain.ts:82-92` |
| Department「已实现（部分字段）」 | **一致**；实际只有 `id`/`companyId`/`name`。`description`/`leaderAppointmentId`/`parentDepartmentId`/`status`/`createdAt` 全缺 | `domain.ts:99-104` |
| Employee 记录 | **记录已实现，但 §2 的目标模型与实现不同形**（见 §1.4 冲突清单 C-3） | `domain.ts:126-134` |
| Appointment「已实现（部分字段）」 | **一致**；`scope`（判别联合）与 `role` 完全缺失，`revokedAt` 未实现 | `domain.ts:144-152` |
| DocumentVersion | **一致** | `domain.ts:173-182` |
| Operation | **一致** | `domain.ts:195-214` |
| `ip_summary` / `storyboard` 文档类型 | **确实未实现**；枚举只有 `profile`/`avatar`/`soul`/`operating`/`work` | `contracts.ts:60-63` |
| `SoloipsEntitlement*` + 三层配额 | **确实未实现**：domain 无 `entitlement`、无 `quota` 表；`createCompany` 路径无任何配额判定 | `domain.ts:221-244`、`store.ts:328-386` |
| `SoloipsAuthContext` / `SoloipsPermissionService` | **确实未实现**：core 无权限模块；`createCompany`/`createDepartment`/`createAppointment` 入参**无 actor** | `contracts.ts:250-311` |
| `SoloipsTeamBindingRecord`（及独立 `Team`） | **确实未实现**：domain 无 `team` 表；adapter `team` 端口是 fail-closed 占位 | `domain.ts:221-244`、`ports/team.ts:37-75` |
| `SoloipsExecutionBindingRecord` | **确实未实现**；因此「撤职使执行失效」无载体 | 同上 |
| `SoloipsAuditRecord` | **确实未实现**（M3） | 同上 |
| 跨账户拒绝 / 并发配额 / 多租户隔离验收 | **确实未实现** | 见 §1.3 |

**关键实测：`accountId` 并非「部署注入」**〔读源确认+实测〕：
- `SoloipsCoreConfig` 只有 `enabled` / `storageRoot` / `backend` 三个键，**没有 `accountId`**〔`packages/core/src/index.ts:70-75`、`store.ts:86-92`〕。
- `createCompany` 写入**硬编码** `accountId: "seed"`〔`packages/core/src/store.ts:371-374`〕。
- 稳定错误码联合 `SoloipsCoreErrorCode` **不含** `SOLOIPS_CORE_ACCOUNT_MISMATCH`〔`contracts.ts:487-505`〕；该码只出现在 `data-contract.md` §3.1 的临时例外表里。

结论：`data-contract.md` §3.1 描述的「部署层经插件 config 注入 accountId + 数据根内出现其他账户公司记录即拒绝打开」目前**一条都没实现**，代码停在更早的 `"seed"` 占位。这是任务描述（「accountId 部署注入」）与代码事实之间最需要先澄清的落差。

### 1.3 系统助理对话流经过这些机制时的行为

| 机制 | 实测行为 | 对对话流的含义 |
| --- | --- | --- |
| 写权租约 | `openSoloipsCompanyStore` 先 `acquireWriterLease`，再 `createStack`，再 `requireFacility`，最后 `facility.open`；失败逆序释放（`store.ts:148-185`）。每次发布前复核（`commit-gate.ts:176-210`） | 助理的所有写命令在**失权后必然失败**且业务状态不变；第二 Host 打开即被拒。助理不得把「失败」读成「可换 ID 重做」 |
| 提交门串行 | 同实例单链串行（`commit-gate.ts:111-119`）；跨进程互斥**只**由租约承担 | 助理连续多步（建部门→招募→任命→写文档）是**多个独立提交**，任一步失败即停在中间态（`#commitLocked` 不做跨表事务，`commit-gate.ts:11-14`）。助理话术必须允许「从已提交事实续做」 |
| 幂等 / 未知 | 同 `operationId` 已提交 → 直接返回原结果（`replayed`）；同 ID 不同 `kind` → `CONFLICT`；未决 → `unknown`〔`commit-gate.ts:125-138`、`contracts.ts:382-392`〕 | 助理**必须**为每个业务动作携带稳定 `operationId`并按对话轮次复用；遇 `unknown` 只能停并请求核对，**不得换 ID 重试**（ORG-05） |
| 入职准入 | `evaluateOnboarding` 只读权威持久事实（员工记录 + 任职 + 版本记录内容/摘要），缺项逐项给出 `reason` 与可行动 `message`（`onboarding.ts:168-228`） | 助理可以把 `gaps[]` **原样**渲染成「缺什么、怎么补」，不需要自己编原因 |
| 员工未决阻塞 | `requestWorkEntry` 在该员工存在 pending 操作时返回 `employee-operation-unknown`（`store.ts:716-721`） | 助理话术需区分「资料没齐」与「上一动作结果未知」 |
| 读路径 | 全部经 `#assertOpen()`；关闭后读写一律 `STORE_CLOSED`（`store.ts:230-234, 753-860`）。读**不经**租约/提交门 | 助理面板在 core 未发布（adapter disabled / 缺 `storageRoot`）时**服务不存在**，前端必须处理「服务未就绪」而非空数据（`index.ts:128-181` fail-closed 分支） |

**`requestWorkEntry` 的幂等探测不在队内**：`probe` 在 `commit` 之前调用（`store.ts:695-714`），与并发提交之间存在窗口。单部署 operator + 交互式使用下无实际风险，但设计上不得声称「准入判定与提交是同一原子步」。

### 1.4 与 `data-contract.md` 的冲突点清单（供文档智能体落实）

> 以下均为**文档与代码/文档自身**的落差，不是本文的裁定。

| ID | 冲突 | 证据 |
| --- | --- | --- |
| C-1 | **配额里程碑口径冲突**：`data-contract.md` §0 写「S0 不校验配额」，§6.1 把三层配额放在 **M0.2**「订阅限制」；本任务要求 M0.1 切片内实现 Free 1 公司 0 子公司的原子校验。需明确 M0.1 是「提前到 M0.1」还是「M0.1 只做机制、策略值留 M0.2」 | `data-contract.md:29` vs `:779` |
| C-2 | **`SOLOIPS_CORE_ACCOUNT_MISMATCH` 是未定义的错误码**：§3.1 把它当既有契约引用（PRD 与 UI 设计也已引用），但 `SoloipsCoreErrorCode` 联合里没有它，config 里也没有 `accountId` | `data-contract.md:330`、`contracts.ts:487-505`、`index.ts:70-75` |
| C-3 | **Employee 目标记录与实现双向不同形**：§0 标「已实现」，但 §2 的目标记录是 `email?`/`modelConfig?`/`status`/`createdAt`，实现是 `currentDocuments`/`assemblyEvidence`/`memoryInitialized`/`verifiedCapabilities`；两边字段集不重叠。以 §0 脚注「字段已实现时以 `contracts.ts` 为准」可解，但 §2 需补注 | `data-contract.md:24,255-262`、`domain.ts:126-134` |
| C-4 | **Appointment 的 scope 与 `departmentId` 重复表达归属**：§2 既保留必填 `departmentId`，又给出 `scope: {kind:'department', companyId, departmentId}`。团队级任职（`kind:'team'`）是否仍必有 `departmentId`（若团队直属公司）未定义 | `data-contract.md:181-193` |
| C-5 | **Team 的「组长」缺落点**：`SoloipsTeamRecord`（§2）无组长字段，`SoloipsTeamBindingRecord` 才有 `leadAppointmentId`——而 TeamBinding 属未实现且是「对接 DSH Team」的绑定层。M0.1 只做纯数据层 Team 时，组长任职放哪里需明确 | `data-contract.md:201-228` |
| C-6 | **§1.1 的「独立 Team + TeamBinding」不覆盖中间态**：M0.1 若只落 `Team` 不落 `TeamBinding`，契约没有描述这个合法中间态，也没有声明「未绑定 Team 是否可见/可用」 | `data-contract.md:51,59-61` |
| C-7 | **§4.2 的配额计数器表与 §2 的类型清单不一致**：§4.2 代码用 `domain.table('quota')`，但 §2 核心类型与 §0 表都只提 `SoloipsEntitlement*`，没有 `SoloipsQuotaCounter` 的持久记录形态（§4.2 只在代码块里给了接口） | `data-contract.md:526-531,638-691` |
| C-8 | **§5.1 的 `defineDomain`/`domainTable` 示例不是本项目的 spec 形态**：实现用 adapter 自己的 `SoloipsValueSchema` 组合子 + `SoloipsDomainSpec`（作者已在 §5.1 加注约束，但示例仍易误读） | `data-contract.md:708-733`、`adapter-dsh/src/contracts.ts:102-148` |
| C-9 | **§0 未列 `listSubsidiaries`/`getCompanyTree`/`saveEmployeeDocument` 等已实现能力**；§0 是「模型/能力」差距表，能力面缺一行聚合描述 | `contracts.ts:424-481` |

---

## 2. 组织链后端模型设计

### 2.1 总助理：公司级任职的落库路径

**结论**：总助理**不建新表**，落为一条公司级 `appointment`〔建议〕，理由与 `data-contract.md` §1.1 裁定一致（「公司级任职，复用现有任职机制」）。

落库路径（每步一个提交，幂等由 `operationId` 保证）：

| 步 | 命令 | 关键入参 |
| --- | --- | --- |
| 1 | `createEmployee` | `displayName`（总助理也是员工，`02-company-contract.md` §10.1「管理员也是员工」） |
| 2 | `createAppointment` | `employeeId` + `scope: {kind:'company', companyId}` + `role:'general_assistant'` |
| 3 | 入职八件套 | `saveEmployeeDocument`（profile/avatar/soul/operating）→ `recordAssemblyEvidence`（四类各一次）→ `initializeEmployeeMemory` → `verifyEmployeeCapability`（`appointment.requiredCapabilities` 逐项） |
| 4 | 读回 | `checkOnboarding(employeeId)` 期望 `ready:true` |

**这要求 `appointment` 增加 `scope` 与 `role`**（§2.2）——当前 domain 里 `departmentId` 是**必填**（`domain.ts:144-152`），公司级任职**无法表达**。

**「最大权限」的最小权限方案**〔建议，M0.1〕：

- **不在 core 内建完整权限服务**（`SoloipsPermissionService` 属未实现且依赖 `SoloipsAuthContext`/`ExecutionBinding`/Entitlement）。
- 采用两层：
  1. **数据层**：`appointment.scope`（`company`/`department`/`team`）+`role`（`owner`/`general_assistant`/`department_lead`/`team_lead`/`member`）——角色判定只读这两个字段，与 `multi-company-implementation.md` §2.2 的 `PERMISSION_RULES` + `ROLE_HIERARCHY` 同向（该文〔已取代〕，仅作枚举参考）。
  2. **校验层**：在**提交门内**（`mutate` 回调里、写之前）做范围/角色校验，使「不通过 → 不产生任何业务写」，与 `data-contract.md` §4.1 的「同一提交门内串行」同构。
- **部门范围约束的执行点**：`createAppointment`（把员工任到某部门）、`createDepartment`（部门必须属于 actor 授权公司）、后续 `createTeam`（团队必须属于本部门）。校验输入是 `department.companyId` 与 actor 任职的 `scope.companyId` 相等——这条**纯数据比对**在 M0.1 即可靠。
- 〔建议〕**actor 来源**：core 命令新增**显式** `actorAppointmentId`（可选字段），由 Host 半边（§3.2）从真实执行上下文填入，**不接受模型文本**。
- **不得声称**：这不是 ORG-05 的「可信身份链」。`contracts.ts:454-460` 已自行声明「本命令不做凭据核实」；在 `ExecutionBinding` 落地前，`actorAppointmentId` 只是**部署面/宿主面**的自证，架构文档必须原样保留这个限制〔约束〕。

### 2.2 部长：任命链与范围约束（回答 DEP-O01 的一半）

`02-company-contract.md` DEP-O01 把「人事权限表、首任任命、代理管理员范围/期限」列为**产品负责人待决**。本设计只落**机制**，不替产品决定权限表：

| 项 | 设计〔建议〕 | 依据 |
| --- | --- | --- |
| 部长身份 | 一条 `appointment`：`scope={kind:'department', companyId, departmentId}`、`role:'department_lead'` | `data-contract.md` §2 |
| 部门记录指向 | `department.leaderAppointmentId?: SoloipsAppointmentId`（§2 目标字段） | 同上 |
| 任命者 | **总助理**（公司级任职）——正是 DEP-R01「先成立部门，再任命管理员」与用户定义的「总助理创建部门、招募部长」 | 任务前提 + DEP-R01 |
| 本部门范围约束 | 部长的每一条管理命令都必须满足「目标 department ∈ 本任职 scope」；执行点在提交门内（§2.1） | 用户定义「权限限本部门」+ ORG-02「只在获准本部门范围招募」 |
| 「不能自我升权」 | 拒绝 `department_lead` 创建/撤销 `general_assistant` 任职（角色白名单） | ORG-02 |
| 首任无部长态 | 部门可存在而无 `leaderAppointmentId`；`02-company-contract.md` §11.2 的 `awaiting_manager` 是合法状态 | ORG-02 |

**首次部署的总助理从哪来**（用户前提是「招募产生」）：M0.1 需要一个**引导入口**——系统助理在「创建公司」后的引导段末尾触发一次「招募总助理」，即执行 §2.1 的四步。这一步的**授权**在 S0 单账户下等同部署 operator（`accountId`），不新增权限实体〔建议〕；DEP-O01 的正式权限表仍待决。

### 2.3 团队：`Team` 实体 + 组长 + 成员

〔建议〕**M0.1 只做纯数据层 Team，不接 DSH `team` 端口。** 理由（均为读源事实）：

1. adapter 的 `team` 端口是 **fail-closed 占位**，每个成员都抛 `SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE`〔`ports/team.ts:37-75`〕。
2. 对应运行时包**不在依赖集内**：`packages/adapter-dsh/package.json` 的 `dependencies` 无 `@deepseek-ai/dsh-experimental-agent-team`；`ports/team.ts:6-8` 自行记录同一事实。
3. 该端口属 **§7.2「不冻结」** 面〔`adapter-dsh/src/contracts.ts:588-590, 606-614`〕，且 `SoloipsAdapterConfig.teamEnabled` 是保留字段。
4. `data-contract.md` §0 已把 TeamBinding 标为未实现，并把 M0.1 出口定为「能在 DSH Web 中创建公司」——不依赖 Team 执行面。

最小 Team 设计〔建议〕：

| 项 | 内容 |
| --- | --- |
| 新表 `team` | `id` / `companyId` / `departmentId?` / `name` / `status: active\|archived` / `createdAt`，对齐 §2 `SoloipsTeamRecord` |
| 组长 | 一条 `appointment`：`scope={kind:'team', companyId, teamBindingId→teamId}`、`role:'team_lead'`。**M0.1 用 `teamId` 承载**（§2 的 `teamBindingId` 在无 TeamBinding 时无值——对应冲突 C-5，需文档澄清字段语义） |
| 成员 | `member` 角色的 `appointment`，`scope.kind='team'` |
| 「自动组成」 | M0.1 语义 = Host 半边在一个提交序列内自动落「1 条 `team_lead` + N 条 `member` 任职」，**不是** DSH Team 的真实建队。**不得**对外声称已建成可执行团队 |
| 不做的 | `TeamBinding` 记录、`dshTeamRef`、与官方 Team roster/任务状态的任何映射 |

**与现有约束的关系**：CUR-03 / ORG-05〔`02-company-contract.md` §10.1/§11.3〕规定**任务、attempt、审核、邮箱归官方 Team，部门不建第二份任务状态机**。本设计的 `team` 表**不含任何任务/attempt 字段**，只承载组织身份与成员关系，因此不构成第二状态机〔推断，依据字段集为空集〕。

### 2.4 配额执行：Free 1 公司 0 子公司的原子校验

**M0.1 最小方案**〔建议〕：

1. **策略值来源**：部署配置注入，不建 `entitlement` 表。新增 core 配置 `planCode: 'free'|'pro'|'enterprise'`（缺省 `free`），配额表按 §2 的三层配额表内联为常量。
2. **原子校验点**：`createCompany` 的**提交门 `mutate` 回调内**、`publish.put("company", ...)` **之前**，复查一次计数：
   - 计 `enterprise` 数 → 对 `companyLimit`；
   - 计 `subsidiary` 数 → 对 `subsidiaryLimit`；
   - `-1` 表示无限制（§2 明确不用 `Infinity`）；
   - `platform`/`operation` **不占**用户配额（§2）。
3. **一致性依据**（对齐 §4.1 的三件事，而不是数据库事务）：进程内提交门串行 + 跨进程 writer lease + 未决 `operationId` 恢复核对。因为「计数 → 写入」都在**同一 `mutate` 回调**内、且在门持有的串行槽位上，计数与插入之间**没有其他本地提交**可插入；跨进程由租约排除。
4. **失败语义**：返回**可判定的拒绝**（新稳定码，如 `SOLOIPS_CORE_QUOTA_EXCEEDED`，附 `{resourceType, current, limit}`），且**不产生任何业务写**（比照 §3.2 的 `checkQuota` 与 §4.2 的 `reason` 文本形态）。
5. **★ 与 §4.2 的偏差必须在文档中显式登记**：本方案**不建** `quota` 表、**不用** `quotaVersion` 乐观锁。§4.2 的乐观锁针对的是「并发 Host/多账户共享数据面」；在 S0「一个业务存储根只绑定一个账户」+ 单 writer 下，计数即权威。若后续要做多 Host 或多账户，必须回到 §4.2 的计数器形态。

**依赖**：本方案需要 `accountId` 真实落地（§1.2 实测未落地）——计数必须按 `accountId + type` 过滤，而当前所有公司记录的 `accountId` 都是 `"seed"`。

---

## 3. 系统助理对话流的后端路径

### 3.1 对话承接：模型怎么调用 core

**候选路径对比**（adapter 七端口实测：`storage`/`session`/`subagents`/`tools`/`events`/`agents`/`team`，另有诊断函数 `readiness()`〔`adapter-dsh/src/index.ts:191-200`、`contracts.ts:696-713`〕）：

| 路径 | 可行性 | 理由 |
| --- | --- | --- |
| A. 直接 import `soloips-core` | **不可行** | oxlint 把非 adapter 包对 `soloips-core*` 的导入列为 error〔`.oxlintrc.json:82-86`〕，并实测命中（附录 A 探针）；且 `AGENTS.md`「禁止跨包相对导入」 |
| B. core 直接 import `@deepseek-ai/dsh-tools` | **不可行** | core 的宿主依赖面恰好是 `@deepseek-ai/cordis`，其余全禁〔`.oxlintrc.json:103-137`〕、〔`core/src/index.ts:11-14`〕 |
| C. **Host 半边经 `adapter.tools` 注册模型工具** | **可行，推荐** | `tools` 端口可注册/限制/守卫工具，注册是 effect 作用域（`adapter-dsh/src/contracts.ts:517-536`）；执行上下文强制要求 agent 凭证，无 agent 即 fail-closed（`ports/tools.ts:76-88, 111-124`）。工具的 `execute` 在 Host 进程内，可闭包持有 `soloipsCore` 服务并调用其命令 |
| D. Host 半边经 `@Remote` 供浏览器调用 | **可行，但与 C 不同面** | 见 §3.2；`@Remote` 面向**浏览器**，不面向模型 |

**推荐链路（C）**：

```
DSH 会话（系统助理 agent）
  → 工具调用（tool/call）
  → Host 半边注册的 tool.execute(args, exec)
      exec.agent  → SoloipsAgentRef（权威凭证，adapter 强制存在）
      闭包持有的 soloipsCore 服务 → 命令（带 operationId）
  → 提交门（串行 + 每次复核租约） → domain 写入
  → 工具返回 JSON 结果 → 模型继续对话
```

**关键约束（读源）**：
- 工具返回值必须是 JSON 可表示值（`SoloipsToolDefinition.execute → Promise<unknown>`，但输出 schema 要过 `assertSupportedJsonSchema`，`ports/tools.ts:93-102`）。
- 工具参数面同样要过 `assertObjectJsonSchema`；即「宽松 JSON Schema」实际受宿主子集约束〔`ports/tools.ts:8-17, 93-102`〕。
- 工具名冲突在同作用域内失败〔`contracts.ts:524-525`〕，因此工具名必须带前缀。**前缀为下划线形态 `soloips_`**（2026-09-18 更正：原稿写 `soloips-` 连字符）：
  - 〔源码事实〕DeepSeek 函数名约定**只允许 `[A-Za-z0-9_-]`**、≤64 字符；点号属「不允许」字符（fork `abdfeb4831` / `0.1.6-alpha.1`，`packages/mcp/mcp-client/src/tools.ts:48,51,54,81-86`）。
  - 形态为 **`soloips_<域>_<动作>`**（如 `soloips_company_create`），**刻意与 `@Remote` 端点的点号形态不同形**，禁止混用。
  - 完整推导表（20 项）与两条命名面见 [`organization-full-ui-design-v0.1.md`](organization-full-ui-design-v0.1.md) §9b；已登记进 [`data-contract.md`](../design/data-contract.md) §2.5。

**「员工自主生成资料完成入职」的现实边界**：员工（AI）若通过自己的会话写资料，其身份链要求 `Session → Host Binding → Employee`（ORG-05），而 `ExecutionBinding` **未实现**（§0）。M0.1 的可行形态是：**系统助理（或用户）代表员工调用 `saveEmployeeDocument`**，`onboarding` 判定仍只认内容有效性与版本读回，因此**不伪造**入职事实〔建议〕。**不得**把「模型自称已生成资料」当作 ORG-03 的装配证据——`recordAssemblyEvidence` 只接受指向本人已保存版本的证据（`store.ts:585-591`）。

### 3.2 UI 插件的 Host 半边：`@Remote` 暴露 CRUD

〔读源确认，DSH fork `abdfeb4831` / 包版本 `0.1.6-alpha.1`，路径见附录 A〕

| 事实 | 出处 |
| --- | --- |
| 业务服务用 `@Remote`（或 `@RemoteScope`）标记对 Client 开放的方法；未标记的方法不进入生成的 Client 类型或运行时贡献 | `docs/api-gateway.zh.md:9` |
| `@Remote` 表示调用**根 Host Context** 上注册的 Cordis 服务 | 同上 `:11` |
| 服务通常继承 `TypertRemoteService`（构造器里绑定 service key 与 Remote namespace）；已有别的基类可改用 `readonly typertRemote = bindTypertRemote(this, serviceKey)` | 同上 `:15` |
| 严格分析要求 Remote 是**公开、非静态、有具体实现**的实例方法；**不能泛型**；参数必须是**具名必填的简单标识符**，不得解构/默认值/rest/可选；取消用末位 `signal: AbortSignal` | 同上 `:117` |
| 复杂 Host 对象不能直接跨 wire，须经 `TypertLookupMap` 声明 wire identity 并由提供方注册解析 | 同上 `:11` |
| Host 生成物：`lib/typert.host.*`；Client 生成物：`lib/typert.remote-client.*`（可挂载的 `TypertRemoteContribution`，含严格描述符与 codec） | 同上 `:107-111` |
| 生成由 `@deepseek-ai/dsh-typert-generator` 在 **tsdown** 中执行（`tsdown-plugin.ts`）；包必须声明 `exports["./typert"]`（Host）与 `exports["./remote"]`（有 Remote 方法时），且 `files` 含对应产物 | `packages/typert/generator/src/workspace.ts:100-131` |
| Client 侧只装配 `@deepseek-ai/dsh-api-remotes`，它以**运行时值**导入被选业务包的 `/remote` 子路径并 `ctx.remote.$mount()`；增加一个 Host Remote 包是 **Client 组合所有者的显式选择** | `docs/api-gateway.zh.md:76` |
| Client 端**拒绝挂载**缺少严格 codec 的 SRC 描述符；类型/codec/注册值始终来自最近一次生成的 `lib/typert.remote-client.*` | 同上 `:137` |
| 每次调用走 `POST /api/<namespace>/<method>`，payload 只含一个具名 `args` 对象 | 同上 `:121-123` |

**落点建议**〔建议〕：

1. **新建一个 Host 半边包**（工作名 `soloips-host`，或把 web 包的 Host 半边做实），**不放进 adapter**：adapter 的定位是「收敛 DSH 依赖、无业务状态」〔`architecture-summary.md`「包职责」〕，而 Remote 服务要持有 `soloipsCore` 引用并做业务编排；放进 adapter 会让 adapter 变成业务包。
2. **它需要的最小依赖**：`@deepseek-ai/cordis`、`@deepseek-ai/dsh-typert-protocol`（decorator 与基类）、`soloips-core/contracts`（类型）。
3. **★ 边界收敛的硬阻塞（实测）**：`@deepseek-ai/*` 与 `soloips-core*` 的导入禁令覆盖 `packages/*/src/**`，**唯一豁免是 `packages/adapter-dsh`**〔`.oxlintrc.json:70-90`〕。要让 Host 半边既 import cordis/decorator 又 import core 契约，必须在同一切片内**新增一条窄口径 override**（只对该包、只放行 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-typert-protocol`、`soloips-core/contracts`），或在 adapter 的 `contracts` 里 re-export decorator/基类（后者触碰 §7.2 面，风险更高）。这是**工程配置改动**，须登记在改动清单里〔`web-ui-fork.md` §2 第 2 条〕。
4. **Remote 方法签名形态（受 §3.2 约束推导）**：因「可选参数不允许」，每个命令一个**单一必填对象**参数，例如
   `@Remote('createCompany') createCompany(input: CreateCompanyPayload): Promise<CreateCompanyResult>`
   其中 payload/result 是 core 契约里的**纯 JSON 类型**（`contracts.ts` §5 已是纯 JSON 记录，满足约束）。**不要**直接把 `SoloipsCoreService` 暴露为 Remote 服务（方法带 `close()`，且会把 domain 生命周期交给浏览器）。
5. **失败语义**：业务错误应抛 `RemoteError`（fork 用法：`packages/client/file-upload/src/index.ts` 的 `RemoteError('session/not-found', ...)`），使码原样上 wire；只有未归类 throw 才折成 `gateway/internal`〔`docs/api-gateway.zh.md:127`〕。
6. **`ctx.remote` 依赖声明归调用方**：只有实际读 `ctx.remote.<namespace>` 的包才在 `inject` 里同时声明 `remote` 与 `remote.<namespace>`；只挂载 contribution 的 assembly 不代声明〔`:58`〕。

**与 web-ui-fork 决策的关系**：SOLO-UI-FORK-01 要求「改动做薄、优先用官方扩展点」。本路径**首选**不动官方 Web 源码：Host 半边 + `dsh.client` 声明的自建客户端插件 + `ctx.slots.inject/register` 席位注入，即属官方扩展点用法〔`web-ui-fork.md` §2〕、〔`docs/subsystems/slots.zh.md:17,32-36`〕。

### 3.3 员工配置页的后端

**读**（M0.1 需新增的投影，命名待定）：

| 需求 | 现状 | 需新增 |
| --- | --- | --- |
| 员工列表（按公司/部门） | **无** | `listEmployees(companyId)`（或 `listAppointments(departmentId)` 再解析员工） |
| 单员工档案 | `getEmployee(id)` ✓ | — |
| 四类文档的**内容**（配置页要显示/编辑） | 只有 `getDocumentVersion(id)`；需先有 `currentDocuments[type]` 的 id | 组合即可，但建议加 `listDocumentVersions(employeeId)`（版本历史） |
| 现有能力 | `employee.verifiedCapabilities` ✓ | — |
| 入职缺项 | `checkOnboarding(employeeId)` ✓ | 直接复用 `gaps[]` |
| 部门/部长 | **无 `getDepartment`** | `getDepartment(id)`、`listTeams(departmentId)` |

**写**：`saveEmployeeDocument` 已是配置页的写路径，语义完整：

- 必需文档带 `expectedPreviousVersion` 为 **CAS 提升**；不匹配时返回 `outcome:'conflict'`，版本仍持久化但当前引用不变〔`store.ts:660-676`、`contracts.ts:362-369`〕。配置页的「保存冲突」文案可直接用这个结果，**不新增写路径**〔与 UI 侧「界面不新增写入路径」同向〕。
- 作品（`work`）走 `outcome:'saved'`，不提升当前引用。
- `avatar` 的 64×64 等**内容规范不归 core**：core 只校验非空白与摘要一致（`onboarding.ts:114-131`）；尺寸/SVG 白名单属生成侧与前端〔`04-avatar-64.md` AVATAR-64-01〕。**不得**把 core 的「内容非空白」误读成头像合规验收。

**缺的读面是配置页的主要后端工作量**，不是写面。

---

## 4. 实施切片建议（M0.1 最小后端切片）

> 每片独立验收；片内不得声称跨片能力。全部切片均**不改既有文件的业务语义**以外，只做加法与新增投影。

### 4.1 切片清单（按依赖排序）

| 片 | 内容 | 改动包 | 验收标准 | 依赖 |
| --- | --- | --- | --- | --- |
| **BE-1 账户绑定落地** | core config 增 `accountId`（必填、绝对注入）；打开时校验数据根内公司记录同账户，否则 fail-closed；新增稳定码 `SOLOIPS_CORE_ACCOUNT_MISMATCH`；`createCompany` 写入真实 `accountId`（去掉 `"seed"`） | core | ① 缺 `accountId` 不发布服务；② 公司记录 `accountId` = 注入值；③ 数据根内出现异账户公司记录时打开被拒（无服务发布）；④ 单测覆盖三条 | — |
| **BE-2 任职 scope/role 与部长链** | `appointment` 增 `scope`（判别联合）与 `role`；`department` 增 `leaderAppointmentId?`；domain 版本递增并登记兼容边界 | core | ① 可建公司级 `general_assistant` 任职；② 可建部门级 `department_lead` 任职并回填 `department.leaderAppointmentId`；③ 公司级任职在旧 `departmentId` 必填约束下**不再**被迫挂部门；④ 岗位校验：`department_lead` 不能产生 `general_assistant` | BE-1 |
| **BE-3 Team 数据层（含最小 team 命令 kind）** | **新增最小 team 命令 kind**：`team.create` / `team.update-function` / `team.close`（`SoloipsOperationKind` 的契约扩展，**三处同步**：`contracts.ts` kind 联合 + `domain.ts` 表声明 + `store.ts` 命令实现）；新表 `team`；`scope.kind='team'` 的任职承载 `team_lead`/`member`；`listTeams`/`getTeam` | core | ① **kind 未登记前不存在任何 team 写命令**（详见「组织全景后端设计」§1.4 的契约扩展点说明）；② 部门下可建多个 team；③ 一个团队恰好一名 `team_lead` + N 名 `member` 可读回；④ **不**引用任何任务/attempt 字段（CUR-03）；⑤ 读操作（`listTeams`/`getTeam`）**不产生 kind** | BE-2 |
| **BE-4 读投影扩容** | `getDepartment` / `listEmployees`（按 company/department）/ `listAppointments` / `listDocumentVersions` / `listAdministrators(companyId)` | core | ① 组织树「公司→部门→部长→团队」可一次读回；② 员工配置页所需字段齐备；③ 形状校验与既有读面一致（含 `listDepartments` 补校验） | BE-3 |
| **BE-5 配额最小版** | 部署配置 `planCode`；`createCompany` 在提交门内按 `accountId+type` 计数校验；新稳定码 `SOLOIPS_CORE_QUOTA_EXCEEDED` | core | ① Free 下第二次建 `enterprise` 被拒且**无业务写**；② Free 下建 `subsidiary` 恒被拒；③ `platform`/`operation` 不占配额；④ 重启后计数读回一致（基于既有公司记录，无新表） | BE-1 |
| **BE-6 Host 半边与两条命令链** | 新建 Host 半边包：`@Remote` 服务（**BE-1..BE-5 已实现的命令面**：公司/部门/员工/任职 + BE-3 新增的 team 命令 + 只读投影）+ `adapter.tools` 注册的模型工具（同一命令面）；新增 oxlint 窄口径 override；接入 Typert 生成（tsdown + generator）与 `exports["./typert"]`/`["./remote"]` | 新包 + 根配置 | ① 模型经对话调用工具创建一条公司并读回（M0.1 验收出口的**后端**半边）；② 浏览器经 `ctx.remote.<ns>` 调用同一命令成功；③ 无 agent 上下文的调用 fail-closed；④ 失权后发布被拒且状态不变；⑤ **每个工具都对应一个已存在的命令 kind**（无 kind 的动作不得暴露为工具） | BE-1..BE-5 |
| **BE-7 员工配置页服务面** | 只读投影与 CAS 保存的**组合验收**（写面已存在，无需新命令） | core（读面）+ Host 半边 | ① 配置页可显示四类文档当前版本与内容；② 以过期 `expectedPreviousVersion` 保存返回 `conflict` 且当前引用不变；③ 保存成功版本后 `checkOnboarding` 缺项相应减少；④ 装配证据过期时 `checkOnboarding` 报 `assembly-evidence-stale` | BE-4 |

**BE-6 的前置未知**〔未验证〕：soloips 仓库当前 `build` 只有 `tsc -b`，无 `tsdown`、无 React/Vite 客户端工具链〔`package.json:17-25`；根 `node_modules` 无 react/tsdown〕。Typert 生成是 **tsdown 插件**，因此 BE-6 实际包含「引入客户端构建工具链」这一隐式子片。该子片与 UI 智能体的界面工作**共用**，须在合并前对齐（QA 阶段）。

#### BE-6 系统助理工具名建议清单〔建议，供 UI 侧对齐（QA 裁定 A4）〕

**★ 命名形态修正（本次读源发现，与提议的 `soloips.company.create` 形态不符）**：

提议要点是「工具名与命令 kind 对齐」。但**点号（`.`）不能用于工具名**：

| 证据 | 内容 |
| --- | --- |
| 〔读源确认：fork `packages/mcp/mcp-client/src/tools.ts:50-51,83-86`〕 | DeepSeek **函数名称约定只允许 `[A-Za-z0-9_-]`**；不允许的字符被替换为 `_`，有损时追加 12 位 hash。点号属「不允许」字符 |
| 〔读源确认：全仓 `name: '...'` 字面量检索〕 | **零个**原生工具名含点号；`@deepseek-ai/dsh-experimental-tool-agent-team` 的十个工具全部用 `lowercase_with_underscores`（`spawn_teammate`/`send_message`/`list_agents`/`wait_agent`/`interrupt_agent`/`team_task_create`/`team_task_list`/`team_task_get`/`team_task_update`），`tool-skill` 用 `skill` |
| 〔`AGENTS.md` 命名风格〕 | 项目自身用 kebab-case 标识包名；DSH 工具词汇用下划线 |

⇒ **建议形态：`<包前缀>_<域>_<动作>`，全部小写 + 下划线**，与 DSH 既有工具词汇一致、且与命令 kind 的语义一一对齐（kind 用点号是**持久台账**的命名空间，工具名用下划线是**模型可见**的函数名，两者刻意不同形，通过下表逐行对应）。

| 建议工具名 | 对应命令 kind | 语义 | 备注 |
| --- | --- | --- | --- |
| `soloips_company_create` | `company.create` | 建公司（含 `type`/`parentCompanyId`） | M0.1 验收出口所需 |
| `soloips_company_get` | （无 kind，读） | 读公司 | 读面不产生 kind |
| `soloips_company_tree` | （无 kind，读） | 读公司树/子公司 | 复用 `getCompanyTree`/`listSubsidiaries` |
| `soloips_department_create` | `department.create` | 建部门 | |
| `soloips_department_list` | （无 kind，读） | 列部门 | |
| `soloips_employee_create` | `employee.create` | 建员工 | |
| `soloips_appointment_create` | `appointment.create` | 建任职（含 `scope`/`role`/`requiredCapabilities`） | 总助理/部长/组长/成员均经此 |
| `soloips_appointment_revoke` | `appointment.revoke` | 撤任职 | |
| `soloips_document_save` | `document.save` | 存文档（CAS + `outcome`） | 员工配置页写路径 |
| `soloips_onboarding_check` | （无 kind，读） | 读入职状态/缺项 | 只读判定 |
| `soloips_grouping_suggest` | （无 kind，读） | 生成编组建议（组织全景 §1.2） | **纯读**：产建议不写状态 |
| `soloips_team_create` | `team.create`〔BE-3 新增〕 | 建团队（含 `function`） | **依赖 BE-3 的 kind** |
| `soloips_team_update_function` | `team.update-function`〔BE-3 新增〕 | 改团队职能 | 同上 |
| `soloips_team_close` | `team.close`〔BE-3 新增〕 | 归档团队 | 同上 |
| `soloips_team_list` | （无 kind，读） | 列团队/读团队 | |
| `soloips_work_entry_request` | `work-entry.request` | 请求工作准入 | 返回 `admitted`/`refused`/`unknown` |

**四条纪律**〔建议〕：

1. **工具名与 kind 的对应表是显式契约**：每个写工具**必须**对应一个已存在的 kind；无 kind 的动作（读面、建议生成）**不得**暴露为写工具。这条已写入 BE-6 验收⑤。
2. **`soloips_` 前缀是命名空间隔离**，避免与官方工具（`spawn_teammate`/`send_message`/`team_task_*`）撞名——工具重名在作用域内注册失败〔`adapter-dsh/src/contracts.ts:524-525`〕。注意**不要**用 `team_` 开头（会与官方 `team_task_*` 视觉混淆），故建议 `soloips_team_*`。
3. **工具数控制在 ~16 个以内**：工具面越大，模型选择错误率越高；上表已按 M0.1 必需面裁剪（不含配额、审计、MCP、skill 分配等面）。
4. **本清单**〔未验证〕**未与 UI 侧对齐**——UI 侧可能按 `@Remote` 的 namespace 形态（点号合法，如 `soloips/company-create`）设计浏览器调用面。**两套命名刻意不同形**：Remote 端点是 Cordis 服务 + 方法（点号/斜杠可用），工具名是模型可见函数名（下划线）。QA 阶段需确认 UI 侧引用的是哪一面。

### 4.2 明确不做（留给后续里程碑）

| 不做项 | 归属 | 理由 |
| --- | --- | --- |
| `TeamBinding` 记录与 DSH `team` 端口接入 | T08 / 后续 | 端口 §7.2 不冻结，运行时包不在依赖集内，fail-closed 占位（实测见 §2.3） |
| 完整权限服务（`SoloipsPermissionService` / `SoloipsAuthContext`） | P1 Auth | 依赖 `ExecutionBinding` 与宿主签发身份；S0 无认证（§3.1 临时例外） |
| `SoloipsExecutionBindingRecord`（撤职使执行失效） | S0 多公司基础尾段 | §0 列为未实现 |
| `SoloipsEntitlementRecord` + `quota` 表 + `quotaVersion` 乐观锁 | M0.2 | BE-5 的计数校验是其最小替代，偏差已在 §2.4 登记 |
| 审计（`SoloipsAuditRecord`） | M3 | §0 + §6.1 |
| `ip_summary` / `storyboard` 文档类型 | S1（PV） | §0 未实现，属 tools-pv 领域 |
| 通知通道（短信/邮箱） | 后续切片 | ORG-13 已把通道实现列为后续同切片 |
| 平台公司/运营子公司的官方账户初始化 | S0 之外 | §3.1 明确「不在 S0 范围」 |
| 员工自主入会的**可信身份链** | 依赖 ExecutionBinding | §3.1；M0.1 由助理/用户代表员工写资料 |

### 4.3 最大设计风险（择一为要）

**风险 R1（最高）：M0.1 验收的「后端半边」同时压在三条未验证的链上。**

M0.1 出口是「能在 DSH Web 中创建公司」〔`web-ui-fork.md` §1、`data-contract.md` §6.1〕，而本文实测：

1. 浏览器侧命令必须经 `@Remote`（UI 侧已确认约束），而 `@Remote` 的**生成物依赖 tsdown 构建管线**，soloips 目前**没有**任何客户端构建工具链〔实测：根 `package.json` 仅 `tsc -b`，`node_modules` 无 tsdown/react〕。
2. Host 半边需要 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-typert-protocol`，而**现有 oxlint 边界禁止**非 adapter 包导入 `@deepseek-ai/*`〔实测探针：2 条 error〕——必须同切片改根配置。
3. Client 侧 contribution 的挂载是 **Client 组合所有者的显式选择**（`api-remotes` 装配），涉及 profile bundle 与 `dsh.client` 声明；`profiles/soloips` 当前只有 6 行 bundles，且 `soloips-web` 仍是 `export {}` 骨架。

**缓解**：把 R1 的三点合并为一个**独立前置切片**（可命名 BE-0「最小 E2E 通路打通」），验收出口就是「一个自建 Host Remote 方法被浏览器调用成功」，先于任何业务 CRUD 扩充；在它通过前，BE-2..BE-5 的 core 侧工作可并行，但**不得**在文档里宣称 M0.1 已具备界面可用性。

**风险 R2（次高）：权限校验不是凭据。** `actorAppointmentId` 由 Host 半边填入，而 Host 半边的「真实执行上下文 → 员工」映射缺 `ExecutionBinding`。在 M0.1 只能说「部署面自证的授权」，不得引用 ORG-05 的可信身份链，也不得据此宣称多租户隔离。

**风险 R3（部署面）：domain schema 变更缺乏介质保护。** SQLite 后端**未写 unit version 戳、无 version-mismatch 判定**，且 `compatibleVersions`/`invalidRecords` 未被消费〔`ports/storage-sqlite.ts:36-39` 自述的既有缺口〕。因此 BE-2 若把 `appointment.scope` 设为**必填**，既有数据根上的旧 `appointment` 记录将**整次 open 失败**（默认无 `invalidRecords` 容错）。缓解〔建议〕：新字段一律先可选、写入路径补默认值，或在切片内声明「M0.1 开发数据根重置」，二者必须明写，不能靠沉默。

---

## 5. C-1…C-9 处置记录（2026-09-18）

本文 §1.4 的 9 条冲突点（C-1…C-9）经 QA 统审后由指挥裁定，**已全部落实进 [`data-contract.md`](../design/data-contract.md)**。逐条落点如下（供复核）：

| ID | 处置 | 落点 |
| --- | --- | --- |
| C-1 | **M0.1 做 Free 1/0 的提交门计数（不建表、不用乐观锁）；完整 Entitlement 记录与 `quota` 表形态属 M0.2**。两处口径统一为此表述 | `data-contract.md` §0「C-1 配额口径」+ §6.1 注 + §4.3 |
| C-2 | `SOLOIPS_CORE_ACCOUNT_MISMATCH` 的引用改为「**〔待实现〕BE-1 交付**」——代码不存在是事实，不当既有契约引 | `data-contract.md` §3.1（表内 + 注） |
| C-3 | 注明「除 `id`/`displayName` 外，§2 目标字段（`email`/`modelConfig`/`status`/`createdAt`）与实现字段**不重叠**；以 `contracts.ts` 为准」 | `data-contract.md` §0 Employee 行 + §2.1 记录注 |
| C-4 | 裁定 **`scope` 先可选**（3 条默认推断规则照录）+ **收紧必填的 4 项前置条件**（P1 当前不满足） | `data-contract.md` §2.3 |
| C-5 | M0.1 纯数据层 Team 的**组长落点 = `Team` 记录 `leadAppointmentId`**（`role: 'lead'\|'teammate'` 契约面） | `data-contract.md` §2.1 `SoloipsTeamRecord` |
| C-6 | §1.1 补注「**M0.1 只有 Team 无 TeamBinding 的中间态合法**」及其语义 | `data-contract.md` §1.2 |
| C-7 | §4.2 的 `domain.table('quota')` 示例改为 **M0.1 提交门计数口径** + M0.2 表形态标〔待实现〕 | `data-contract.md` §4.2（标〔待实现〕）+ 新增 §4.3 |
| C-8 | `defineDomain` 示例改为**本项目实际 spec 形态**（`SoloipsValueSchema` 组合子，参照 `core/domain.ts`） | `data-contract.md` §5.1 |
| C-9 | §0 补**已实现能力面清单**（`listSubsidiaries`/`getCompanyTree`/`saveEmployeeDocument` 等） | `data-contract.md` §0 |

**本附录自身修正的一条**：§3.1 的「工具名必须带 `soloips-` 前缀」已按裁定改为**下划线 `soloips_`**，并引用 UI 设计 §9b 推导表（原连字符形态会导致工具名不符 DeepSeek 函数名约定）。

**本文未改动**：§1.4 的冲突清单原样保留为**过程留痕**（它记录的是裁定前的落差发现），结论以 `data-contract.md` 为准。

---

## 附录 A：证据范围

**实际读源（全文或指定区间）**：
- `packages/core/src/`：`index.ts`（全文 184）、`contracts.ts`（全文 505）、`domain.ts`（全文 247）、`store.ts`（全文 861）、`commit-gate.ts`（全文 211）、`onboarding.ts`（全文 228）、`ids.ts`（86）、`errors.ts`（40）
- `packages/core/tests/`：`store.spec.ts`（用例名清单）
- `packages/adapter-dsh/src/`：`index.ts`（全文）、`contracts.ts`（全文）、`ports/team.ts`（全文）、`ports/tools.ts`（全文）、`ports/agents.ts`（全文）、`ports/events.ts`（增强块）、`ports/storage.ts`（1–120）、`ports/storage-sqlite.ts`（1–130）、`ports/shared.ts`（片段）
- `packages/{core,adapter-dsh,web}/package.json`、`packages/{bundle,core,web}/cordis.patch.yml`、`profiles/soloips/{package.json,cordis.patch.yml}`、`.oxlintrc.json`、`package.json`、`tsconfig.base.json`
- `docs/`：`design/data-contract.md`（全文含 §0/§3.1/§4.2/§5.1/§6.1）、`refactoring/02-company-contract.md`（全文）、`refactoring/01-departments.md`（DEPT 条目）、`refactoring/03-delivery-and-acceptance.md`（片段）、`refactoring/04-avatar-64.md`（片段）、`decisions/web-ui-fork.md`（全文）、`reference/rewrite-seam-client.md`（全文）、`architecture-summary.md`（全文）、`architecture-complete.md`（§3.3）、`technical/state.md`（片段）、`governance/doc-format.md`（片段）、`governance/document-registry.md`（片段）、`operations/environment-handoff.md`（片段）、`design/multi-company-{organization,implementation}.md`（权限/总助理章节，〔已取代〕仅作枚举参考）
- `.agents/skills/dsh-plugin-development/SKILL.md`、`.oxlintrc.json`

**DSH fork 静态读源**（`D:/Source/workspace/deepseek-harness`，HEAD `abdfeb4831`，分支 `codex/team-roster-model`，包版本 `0.1.6-alpha.1`）：
- `docs/api-gateway.zh.md`、`docs/subsystems/web-client.zh.md`、`docs/subsystems/slots.zh.md`
- `packages/typert/protocol/src/index.ts`（`Remote`/`RemoteScope`/`TypertRemoteService`）
- `packages/typert/generator/src/{workspace.ts,tsdown-plugin.ts,analyzer.ts}`（导出契约、生成时机、Remote 严格分析规则）
- `packages/typert/loader/src/index.ts`、`packages/typert/registry/src/types.ts`
- `packages/api/gateway/src/index.ts`（source-mode 认领）、`packages/api/remotes/package.json`
- `packages/client/file-upload/{package.json,src/index.ts,src/client/{index.ts,runtime.ts},lib/typert.remote-client.d.ts}`（Host/Client 半边 + 生成的 Remote 形态范例）
- `packages/client/ui-deliverables/{package.json,src/client/index.ts}`（`dsh.client.inject` 与 slot 用法范例）、`packages/client/ui-slots/{package.json,src}`

**实测命令（一次性探针，探针文件已删除）**：
- `npx oxlint --type-aware packages/web/src/__boundary-probe.ts` → **2 errors**：`'@deepseek-ai/cordis' import is restricted`、`'soloips-core/contracts' import is restricted`（证据：`packages/*/src/**` 的 import 禁令对非 adapter 包确实生效，包括 `import type`）
- `ls node_modules | grep -iE "^react|^tsdown|^vite"` → 仅命中 `vitest`（证据：soloips 无客户端构建工具链）
- `ls packages/adapter-dsh/node_modules/@deepseek-ai/` → cordis、dsh-agent、dsh-atomic-write、dsh-session-persistence、dsh-settings、dsh-storage、dsh-storage-domain、dsh-storage-json、dsh-subagent、dsh-tools、schemastery（证据：`dsh-typert-protocol` 与 `dsh-experimental-agent-team` **均不在**依赖集内）

**未验证 / 无法核对**：
- 上述任何能力在**安装后的运行实例**中的行为（未启动服务、未运行验收）
- `profiles/soloips` 声明与实际运行 bundles 的一致性（`web-ui-fork.md` §3.2 已把该项列为〔未验证〕）
- Typert 生成在 soloips 工作区（非 fork 工作区）内的可用性：generator 是 fork 内包，是否可被 soloips 直接消费、是否需要搬入客户端构建基础设施，**未做构建实验**
- 系统助理人设（agent preset / system prompt / Skill）如何注入其会话——本文只设计后端链路，未核对 preset 装配面

**本文不蕴含**：登记设计等于已实现；读源结论等于运行验收；`data-contract.md` §0 的「未实现」已被本文解决。

---

## 变更历史

| 日期 | 变更 | 变更者 | 原因 |
| --- | --- | --- | --- |
| 2026-09-18 | 新增 §5「C-1…C-9 处置记录」：9 条冲突点逐条登记裁定结论与 `data-contract.md` 落点 | 文档智能体 | P2 设计裁定落实（指挥派发） |
| 2026-09-18 | §3.1 工具名前缀由 `soloips-` 连字符更正为下划线 `soloips_`，补 DeepSeek 函数名约定事实与 §9b/`data-contract.md` §2.5 引用 | 文档智能体 | 名形态裁定：点号不符 DSH 函数名约定 |
