# SoloIPs 权威数据契约

> 本文档是 SoloIPs 的唯一权威数据定义，解决「完整设计」与「多公司设计」之间的冲突。
> 
> **阅读契约**：所有代码实现和文档引用必须以本文档为准。
> **决策状态**：〔约束〕2026-09-17 Codex 审查要求统一数据契约
> **变更权**：architecture-owner

**〔约束〕目标与实现的优先级声明（2026-09-18）**：

> **代码定义「当前实现事实」；本文档定义「未来实现要求」。**
>
> 两者冲突时：**描述现状**的断言以代码为准（`packages/core/src/contracts.ts` 等）；**规定目标**的条目以本文档为准。§0 的实现状态表是二者的**对照**——它不把本文档降级为「建议」，也不把未实现的目标说成已有能力。

---

## 0. 实现状态（对照代码事实，2026-09-18 OPS-00 同步）

> 本文档是**目标数据契约**；下表给出它与 `packages/core/src/contracts.ts` 当前代码的差距。
> 「未实现」是实现目标，不代表已交付能力。文档之间冲突时以本文档为准。
>
> **存储后端**：SQLite（Drizzle 0.38 查询构造 + better-sqlite3 driver，见
> `packages/adapter-dsh/src/ports/storage-sqlite.ts`）为默认；可选 JSON。后期可迁移 PostgreSQL
> 〔建议〕迁移面见 `docs/technical/state.md`「后期迁移 PostgreSQL」。

**〔约束〕§0 同步纪律（2026-09-18 补录）**：**凡改 §0 已实现行，必须对照 `packages/core/src/contracts.ts` 核验**（字段名/类型/服务面逐项对齐，必要时附行号）。理由：本表是「代码事实 ↔ 目标契约」的对照，脱离代码改表会让对照失效、把未实现说成已有能力。该纪律是 **M0.1 的替代手段**——自动化核对（`contract-doc-sync-check` CI）**未采纳**，登记为 **P3 切片候选 BE-8**（见 §6.2）。

| 模型 / 能力 | 代码状态 | 代码实际字段 |
|---|---|---|
| `SoloipsCompanyRecord`（`accountId`/`parentCompanyId`/`type`/`name`/`status`/`createdAt`） | **已实现** | `contracts.ts` §3 |
| `SoloipsDepartmentRecord` | **已实现（部分字段）** | 已实现：`id`/`companyId`/`name`/`leaderAppointmentId?`（BE-2 部长链回填，`contracts.ts:314-322`）。**未实现**：`description`/`parentDepartmentId`/`status`（见 §2 设计稿） |
| `SoloipsEmployeeRecord` | **已实现（部分字段）** | 已实现：`id`/`displayName`/`currentDocuments`/`assemblyEvidence`/`memoryInitialized`/`verifiedCapabilities`。**未实现**：`email`/`modelConfig`/`status`/`createdAt`/`identitySource`（目标新增）。**既有判定字段属目标契约，不得移出**（§2.1 C-3 注）；确切形状以 `contracts.ts` 为准 |
| `SoloipsAppointmentRecord` | **已实现** | `id`/`employeeId`/`departmentId?`（C-4 改可选）/`requiredCapabilities`/`generation`/`status`/**`scope?`**（判别联合 company\|department\|team）/`role?`（五值词表）。可选理由为存量兼容（§2.3 阶段一），与 BE-2/BE-3 实现一致（`contracts.ts:167-194`、`:342-376`） |
| `SoloipsDocumentVersionRecord` | **已实现** | `versionId`/`ownerId`/`documentType`/`content`/`digest`/`previousVersionId?`/`appointmentId?` |
| `SoloipsOperationRecord` | **已实现** | `id`/`kind`/`status`/`employeeId?`/`intent`/`result?`，**及 `schemaVersion?`**（BE-3 交付：`SoloipsOperationKindValue` 开放词表 + 版本读取策略，`contracts.ts:459-510`） |
| **已实现的能力面**（C-9） | **已实现** | 服务面 `contracts.ts:1110-1345`（BE-4a 后）。写：`createCompany`/`createDepartment`/`createEmployee`/`createAppointment`/`revokeAppointment`/`initializeEmployeeMemory`/`verifyEmployeeCapability`/`recordAssemblyEvidence`/`saveEmployeeDocument`/`requestWorkEntry`，以及团队四命令 `createTeam`/`updateTeamFunction`/`activateTeam`/`closeTeam`（BE-3 P-9）。读：`checkOnboarding`/`getCompany`/`listSubsidiaries`/`getCompanyTree`/`listDepartments`/`getEmployee`/`getAppointment`/`getDocumentVersion`/`getOperation`/`listPendingOperations`，`getTeam`/`listTeams`（BE-3，BE-4a 补 `departmentId` 过滤），以及 `getDepartment`/`listEmployees`/`listAppointments`/`listDocumentVersions`/`listAdministrators`（BE-4a）。生命周期 `close()`；恢复辅助 `reconcileTeams`（调用范围见 §2.1.1 P-10）。**读面缺口**：无（C-9 五项已全部落地） |
| 文档类型 `ip_summary` / `storyboard` | **未实现** | 代码枚举只有 `profile`/`avatar`/`soul`/`operating`/`work` |
| `SoloipsEntitlement*` 与完整三层配额表（§3/§4） | **未实现** | 目标设计，属 **M0.2**（C-1）。**M0.1 的配额口径见下方「C-1 配额口径」** |
| `SoloipsAuthContext` / `SoloipsPermissionService` | **未实现** | S0 用部署账户绑定替代，见 §3.1 临时例外。**账户绑定本身已实现**（BE-1）：根级绑定元数据 + `SOLOIPS_CORE_ACCOUNT_MISMATCH` 打开即拒 + `createCompany` 写真实 `accountId`（`store.ts:272-340`、`contracts.ts:531`） |
| `SoloipsTeamRecord`（独立 Team 实体） | **已实现**（BE-3） | 四 kind（`SoloipsTeamKind`）+ 四值 status + P-4 组长引用核验 + P-7~P-9 三步成团协议；读面 `SoloipsTeamView` 带 `usable`/`leadReference` 显式状态（`contracts.ts:403-434`、`:864-917`） |
| `SoloipsTeamBindingRecord`（Team→DSH Team 绑定层） | **未实现** | adapter 的 `team` 端口是 fail-closed 占位；任务/attempt 状态归官方 Team。M0.1 只落纯数据层 `Team`（§2），`TeamBinding` 留后续——中间态合法，见 §1.2 注（C-6） |
| `SoloipsExecutionBindingRecord` | **未实现** | 撤职使执行失效的验收因此尚未覆盖 |
| `SoloipsAuditRecord` | **未实现** | 审计落库属 M3 里程碑 |
| 跨账户拒绝 / 并发配额 / 多租户隔离验收 | **未实现** | 属「S0 多公司基础」，尚未通过 |

**C-1 配额口径（2026-09-18 裁定，§0 与 §6.1 统一为此表述）**〔约束〕：

> **M0.1 内做 Free 1/0 的提交门计数校验——不建 `entitlement`/`quota` 表，不用 `quotaVersion` 乐观锁。完整的 Entitlement 记录与 quota 表形态属 M0.2。**
>
> - **M0.1 形态**：`planCode` 由部署配置注入（缺省 `free`，不建表）；`createCompany` 在**提交门 `mutate` 回调内、`put` 之前**按 `accountId + type` 计数复查；三层配额表内联为常量；失败返回稳定码且**不产生任何业务写**。
> - **M0.2 形态**：§2 的 `SoloipsEntitlementRecord` + `quota` 计数器表 + `quotaVersion` 乐观锁。乐观锁针对「并发 Host / 多账户共享数据面」；在 M0.1「一个业务存储根只绑定一个账户」+ 单 writer 下，计数即权威。**注意**：M0.2 的计数器形态其**恢复协议尚未裁定**（§4.3 Q-1…Q-3），且它是**已知候选之一**、非唯一安全算法。
> - **与 §4 的关系**：§4.2 已**删除**含一致性错误的完整示例（现为「待设计伪代码」占位），**不得**被读成 M0.1 的实现要求；M0.1 的校验点、K-1…K-6 条件与验收要求见 §4.3。

- 术语以本文档为准：持久记录一律用 `Soloips*` 前缀（如 `SoloipsCompanyRecord`），架构概览里的短名（`CompanyRecord`）只是示意。
- 与 `multi-company-organization.md` / `multi-company-implementation.md` 的冲突已由本文档取代（见文档注册表）。
- §2 权威数据模型列出的是**目标设计**；字段已实现时以 `packages/core/src/contracts.ts` 为准。

---

## 1. 冲突分析与解决

### 1.1 原有两套模型对比

| 对象 | 完整设计 | 多公司设计 | **权威决定** |
|---|---|---|---|
| 公司归属 | `accountId` | `subscriptionId` | **accountId**（直接归属更清晰） |
| 部门负责人 | `leaderAppointmentId` | `leaderEmployeeId` | **leaderAppointmentId**（通过任职表达更灵活） |
| 总助理 | 公司级任职，`general_assistant` | 独立表，`chief_assistant` | **公司级任职**（复用现有任职机制） |
| 团队 | `TeamBinding` 对接 DSH Team | 独立 `Team` 实体 | **独立 Team + TeamBinding**（两层概念共存） |
| 员工归属 | 主要经任职表达 | `teamId` + `primaryAppointmentId` | **仅通过任职表达**（避免数据冗余） |

### 1.2 冲突解决原则

1. **以「完整设计」为基础**：该设计更符合 DSH 的领域驱动设计
2. **subscriptionId 改为 accountId**：公司直接归属账户，而不是间接通过订阅
3. **总助理复用任职机制**：不需要独立表，直接创建公司级任职
4. **Team 与 TeamBinding 分层**：
   - `Team`：SoloIPs 业务层团队实体
   - `TeamBinding`：SoloIPs Team → DSH Team 的绑定

**〔约束〕C-6：M0.1「只有 Team、无 TeamBinding」的中间态合法（2026-09-18 裁定）。**

上表的「独立 Team + TeamBinding」描述的是**目标终态**，不蕴含「两者必须同时落地」。M0.1 的团队是**纯数据层 Team**（`team` 表 + 团队级任职），**不建 `TeamBinding`**——因为 `TeamBinding` 的 `dshTeamRef` 依赖 adapter 的 `team` 端口接入（当前 fail-closed 占位），而 M0.1 不接官方 Team（CUR-03：任务/attempt 归官方 Team，core 不建第二状态机）。

该中间态下的语义（必须显式成立，不得靠默认）：

| 问题 | 中间态语义 |
|---|---|
| 未绑定 Team 是否可见/可用 | **可见且可用**：`Team` 是 core 的组织事实，不因缺少 DSH 绑定而失效 |
| 「任务」面是否可用 | **不可用**：`TeamBinding` 缺失即无 DSH Team，M0.1 看板**不得**显示空任务列表冒充「暂无任务」，须显示「Team 未接入」的显式状态 |
| `TeamBinding` 何时补 | 归团队端口接入切片（T08）；补齐前不得声称「团队协作已可用」 |

---

## 2. 权威数据模型

### 2.1 核心类型

```typescript
// ID 类型构造器
type SoloipsCoreId<T extends string> = string & { readonly __brand: T };

// =====================
// 账户与权益
// =====================

/**
 * 账户权益（三层配额）
 * 账户是 SoloIPs 的顶层归属单位
 */
export interface SoloipsEntitlementRecord {
  readonly id: SoloipsEntitlementId;
  readonly accountId: string;              // 账户 ID（DSH session 绑定）
  readonly planCode: 'free' | 'pro' | 'enterprise';
  readonly companyLimit: number;            // 顶层用户公司数上限；-1 = 无限制
  readonly subsidiaryLimit: number;         // 子公司总数上限；-1 = 无限制
  readonly features: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

**三层配额表（权威；SOLO-COMPANY-01）**：

| planCode | companyLimit | subsidiaryLimit |
|---|---|---|
| `free` | 1 | 0 |
| `pro` | 1 | 3 |
| `enterprise` | -1（无限制） | -1（无限制） |

- 配额只统计**用户持有**的公司：`enterprise`（顶层用户公司）计入 `companyLimit`，`subsidiary`（用户子公司）计入 `subsidiaryLimit`。
- `platform` / `operation`（SoloIPS 官方平台与运营子公司）**不占用户配额**。
- 统一用 `-1` 表示无限制；**不使用 `Infinity`**（`Infinity` 无法 JSON 持久化，会静默变成 `null`）。

```typescript

export type SoloipsEntitlementId = SoloipsCoreId<'entitlement'>;

// =====================
// 公司与组织
// =====================

/**
 * 公司类型：区分 SoloIPS 平台/运营公司与用户公司/子公司
 */
export type SoloipsCompanyType =
  | 'platform'    // SoloIPS 平台公司（SoloIPS 官方）
  | 'operation'   // SoloIPS 运营子公司（SoloIPS 官方，业务平台如漫画/视频网站）
  | 'enterprise'  // 用户企业公司（用户创建）
  | 'subsidiary'; // 用户子公司（用户创建，属于用户企业公司）

/**
 * 公司（多层公司层级架构）
 * - platform/operation 类型：由 SoloIPS 官方持有
 * - enterprise/subsidiary 类型：由用户持有
 * - parentCompanyId：无则为顶层公司，有则为子公司
 */
export interface SoloipsCompanyRecord {
  readonly id: SoloipsCompanyId;
  readonly accountId: string;               // 直接归属账户（隔离条件）
  readonly parentCompanyId?: SoloipsCompanyId; // 父公司（无则为顶层公司）
  readonly type: SoloipsCompanyType;          // 公司类型
  readonly name: string;
  readonly status: 'active' | 'archived';
  readonly createdAt: string;
  readonly archivedAt?: string;
}

export type SoloipsCompanyId = SoloipsCoreId<'company'>;

/**
 * 部门（公司内组织）
 * ⚠️ 以下为目标设计；代码只有 id/companyId/name，description/leaderAppointmentId/parentDepartmentId/status 待实现
 */
export interface SoloipsDepartmentRecord {
  readonly id: SoloipsDepartmentId;
  readonly companyId: SoloipsCompanyId;    // 必须归属公司
  readonly name: string;
  readonly description?: string;           // 待实现
  readonly leaderAppointmentId?: SoloipsAppointmentId;  // 待实现
  readonly parentDepartmentId?: SoloipsDepartmentId;    // 待实现
  readonly status?: 'active' | 'paused' | 'archived';   // 待实现
  readonly createdAt?: string;             // 待实现
}

export type SoloipsDepartmentId = SoloipsCoreId<'department'>;

/**
 * 任职作用域（判别联合）
 * 用于区分公司级、部门级、团队级任职
 * 〔C-4 裁定 2026-09-18〕scope 先**可选**，不一步收紧为必填——理由见本节下方注
 */
export type SoloipsAppointmentScope =
  | { readonly kind: 'company'; readonly companyId: SoloipsCompanyId }
  | { readonly kind: 'department'; readonly companyId: SoloipsCompanyId; readonly departmentId: SoloipsDepartmentId }
  | { readonly kind: 'team'; readonly companyId: SoloipsCompanyId; readonly teamId: SoloipsTeamId };

/**
 * 任职角色枚举
 */
export type SoloipsAppointmentRole =
  | 'owner'                           // 公司所有者（账户级）
  | 'general_assistant'                // 总助理（公司级）
  | 'department_lead'                 // 部门组长（部门级）
  | 'team_lead'                       // 团队负责人（团队级）
  | 'member';                         // 普通成员

/**
 * 任职记录
 * ⚠️ 以下为目标设计；代码用 departmentId/requiredCapabilities，scope(判别联合) 与 role 待实现
 */
export interface SoloipsAppointmentRecord {
  readonly id: SoloipsAppointmentId;
  readonly employeeId: SoloipsEmployeeId;
  // 当前已实现字段：
  readonly departmentId: SoloipsDepartmentId;
  readonly requiredCapabilities: readonly string[];
  // 待实现字段：
  readonly scope?: SoloipsAppointmentScope;     // 任职作用域（判别联合）
  readonly role?: SoloipsAppointmentRole;       // 任职角色
  readonly generation: number;                   // 权限代际（用于撤职后失效）
  readonly status: 'active' | 'revoked';
  readonly revokedAt?: string;
}

export type SoloipsAppointmentId = SoloipsCoreId<'appointment'>;

/**
 * 团队（SoloIPs 业务层团队实体）
 * Team 承担工作协作的身份；实际执行经 TeamBinding 对接 DSH Team
 *
 * 〔C-5 裁定 2026-09-18〕M0.1 纯数据层 Team 的**组长落点 = 本记录 `leadAppointmentId`**。
 * 不落在 `TeamBinding.leadAppointmentId`——M0.1 不建 TeamBinding（C-6），
 * 若组长只存在于绑定层，纯数据层 Team 将无法表达「谁是组长」。
 * 组长/成员由任职 `role`（'team_lead' | 'member'）区分，本字段是**唯一组长引用**。
 *
 * **两套角色词表不可混用**〔约束〕：本项目的 `SoloipsAppointmentRole` 用
 * `'team_lead'`/`'member'`；而 DSH 官方 roster 用 `'lead'`/`'teammate'`
 * （`TeamMemberView.role`，fork `abdfeb4831`，`packages/experimental/agent-team/src/types.ts:61`）。
 * 二者分属不同层（core 任职 vs DSH Team roster），**不得**在 core 记录里写 `'lead'`/`'teammate'`。
 *
 * 〔待实现〕以下字段均属 M0.1 目标（`team` 表尚未建，见 §0）。
 */
export interface SoloipsTeamRecord {
  readonly id: SoloipsTeamId;
  readonly companyId: SoloipsCompanyId;
  readonly departmentId?: SoloipsDepartmentId;  // 可选归属部门
  readonly name: string;
  /** 本团队职能定义（纯文本，非空白）。**不承载能力项**——能力走 appointment.requiredCapabilities */
  readonly function: string;
  /**
   * 职能来源（审计「谁定义了职能」）：部长定义 or 系统建议后确认。
   *
   * **枚举扩展〔待决 M0.2+〕**：`'user'`/`'template'`/`'import'` 等来源**尚未裁定**——
   * 未裁定前实现**不得**自行新增取值；本字段当前只认下列两值。
   */
  readonly functionSource: 'leader-defined' | 'system-suggested';
  /**
   * 确认者任职 ID（**`functionSource='system-suggested'` 时必填**）〔待实现〕。
   *
   * 系统建议**本身不是**职能定义——须由一名**有效任职**（部长/总助理）确认后才成为团队职能。
   * `'leader-defined'` 时可省略（定义者即 `leadAppointmentId`）。
   * **缺 `confirmedBy` 的 `system-suggested` 记录 = 未确认草稿**，不得被读作团队职能、
   * 不得作为分配/准入的依据。
   */
  readonly confirmedBy?: SoloipsAppointmentId;
  /**
   * 团队组长任职（唯一组长；与 role:'team_lead' 的任职一致）。
   *
   * **pending 期可缺省**〔约束〕（BE-001 三步成团协议的必然结果，2026-09-18）：
   * `team.create` 只建 `status='pending'` 团队，**此时尚无组长**——若本字段仍为必填，
   * 第一步就无法写入（或只能写一个假引用，更坏）。故：
   * - **`status='pending'` 时**：本字段**可缺省**（无组长是 pending 的定义特征）；
   * - **转为可用时**：本字段**必须存在且满足 P-4 四项**（`team.activate` 的校验内容，见 P-9）；
   * - **归档时**：保留最后有效值（历史事实），不因归档而清空。
   */
  readonly leadAppointmentId?: SoloipsAppointmentId;
  /**
   * 团队状态。**语义必须成立**〔约束〕——**字段形态留 BE-3 裁定**（下方三值为**目标候选**；
   * 「不可用」可另立第四值，或由组长引用有效性导出，与 §2.1.1 P-6 的「等效显式标记」一致）；
   * **语义不允许缺项**：
   * - **pending**：**成团中间态**（BE-001）——团队记录已建、组长任职未建（或未验证）。
   *   **不得**读作可用团队；不出现在 `listTeams` 的可用结果中（P-3/P-9.1）；
   * - **可用**：组长引用有效（满足 §2.1.1 P-4 四项）且未归档——可参与协作、可出现在 `listTeams`；
   * - **不可用**：无有效组长（撤职未换任，或引用悬挂未修复）——**不得**读作可用团队（P-3/P-6/P-8）；
   * - **归档**：显式关闭（`team.close`）后的终态，只读保留供追溯。
   *
   * **禁物理删除**〔约束〕：Team **不得**被物理删除（**无 delete 路径**），只能经 `status` transition
   * 变更语义（pending → 可用 ↔ 不可用 → 归档）。理由：任职、skill 分配、规范确认、装配证据均以 `teamId`
   * 为引用键，物理删除会制造**悬挂引用**，并让历史取证失去确定的所指。
   */
  readonly status: 'pending' | 'active' | 'archived';
  readonly createdAt: string;
}

export type SoloipsTeamId = SoloipsCoreId<'team'>;

/**
 * 团队绑定（SoloIPs Team → DSH Team）
 * SoloIPs 的团队概念通过 DSH Team 执行
 *
 * 〔2026-09-18 codex 终审〕**重复字段登记为派生快照**：
 * 本记录的 `companyId`/`departmentId`/`name`/`leadAppointmentId` 与
 * `SoloipsTeamRecord` **同名字段重复**。它们**不是第二写权威**，而是绑定时刻的
 * **派生快照**（便于 DSH Team 侧独立读回，无需回查 core）。
 *
 * **T08 前置同步义务**〔约束〕：Team 侧上述字段变更时，绑定快照**必须同步更新**；
 * 若无法保证同步，则**应删除**这些重复字段、改为读时关联 Team。二者择一，
 * 不得让快照与 Team 长期分叉。**该选择留 T08 裁定**〔待决〕。
 */
export interface SoloipsTeamBindingRecord {
  readonly id: SoloipsTeamBindingId;
  readonly teamId: SoloipsTeamId;              // 绑定的 SoloIPs 团队（权威引用）
  readonly companyId: SoloipsCompanyId;        // 〔派生快照〕来自 Team
  readonly departmentId?: SoloipsDepartmentId; // 〔派生快照〕来自 Team
  readonly name: string;                       // 〔派生快照〕来自 Team
  readonly dshTeamRef: string;                 // DSH Team Session ID（本记录特有）
  readonly leadAppointmentId: SoloipsAppointmentId;  // 〔派生快照〕来自 Team
  readonly status: 'active' | 'archived';
  readonly createdAt: string;
}

export type SoloipsTeamBindingId = SoloipsCoreId<'team-binding'>;

/**
 * 执行绑定（谁在哪家公司凭哪次任职执行）
 * 记录合法执行的上下文，用于审计和权限校验
 */
export interface SoloipsExecutionBindingRecord {
  readonly id: SoloipsExecutionBindingId;
  readonly companyId: SoloipsCompanyId;
  readonly employeeId: SoloipsEmployeeId;
  readonly appointmentId: SoloipsAppointmentId;
  readonly appointmentGeneration: number;       // 任职代际快照
  readonly dshSessionRef: string;
  readonly startedAt: string;
  readonly endedAt?: string;
}

export type SoloipsExecutionBindingId = SoloipsCoreId<'execution-binding'>;

// =====================
// 入团装配（C 裁定 2026-09-18；6 新实体登记，全部〔待实现〕）
//
// 来源：docs/prds/organization-full-backend-design-v0.1.md §2.1–§2.4
// （指挥裁定的 6 实体登记，P2 落实）
// =====================

/**
 * 团队 skill 分配（层 1：分配 = 意图 + 授权记录）
 *
 * 〔待实现〕M0.1 目标实体。
 * **关键边界**：「分配」≠「实际加载」。分配只让候选**可见**，模型仍可能不调用
 * `skill` 工具；DSH `ctx.skills` 是发现的唯一权威，core 不建第二份 skill 目录索引。
 */
export interface SoloipsTeamSkillAssignmentRecord {
  readonly id: SoloipsTeamSkillAssignmentId;
  readonly teamId: SoloipsTeamId;
  /** DSH skill 名（kebab-case：^[a-z0-9]+(?:-[a-z0-9]+)*$，不引入第二套命名） */
  readonly skillName: string;
  /** 分配时的来源标识（provider 名或目录），用于对账 */
  readonly skillSourceRef: string;
  /** 谁分配的（部长/总助理） */
  readonly assignedByAppointmentId: SoloipsAppointmentId;
  /**
   * 分配生命周期状态〔待实现，BE-004 2026-09-18〕。
   *
   * **枚举先定义全**（与 §2.1.2 的 MCP 生命周期**对齐**），**M0.1 实际只走到 `requested`**
   * ——M0.1 不接 skill provider 与逐 agent 加载路径，故 `available`/`active`/`failed`
   * **在 M0.1 不可达**，实现**不得**自行写入。
   *
   * - `requested`：**分配已登记**（意图 + 授权记录）。**不表示**该 skill 可被加载，
   *   更**不表示**已加载——M0.1 的**唯一可达态**；
   * - `available`：该 skill 名在目标 agent 作用域**确实可发现**（provider 供出候选）。
   *   对齐 MCP 的 `active` 语义：**只能由可信接入流程写入**，**模型不得自声明**；
   * - `active`：**实际被加载/使用**的确认态。对齐 ORG-08——「分配 ≠ 加载 ≠ 有效使用」，
   *   本态**不**由分配动作推导；
   * - `failed`：接入失败（provider 报错、名字不存在、作用域不匹配等），**可判定**，
   *   与「尚未接入」区分（不得用 `requested` 冒充失败）；
   * - `revoked`：**只停用分配**；**已加载进上下文的正文不会因撤回而消失**（ORG-08）
   *   ——必须如实报告，**不得**声称撤回即清除。
   *
   * **迁移矩阵**〔约束〕（与 §2.1.2 同构；**`revoked` 无出边**，恢复须新建分配记录）：
   *
   * | 起点 → 终点 | 允许 | 说明 |
   * |---|---|---|
   * | `requested` → `available` | ✅ | **仅可信接入流程**（provider 实际供出候选后回写） |
   * | `requested` → `failed` | ✅ | 接入失败，记录可判定原因 |
   * | `requested` / `available` → `revoked` | ✅ | 显式撤回；不回溯已加载内容 |
   * | `available` → `active` | ✅ | 观测到实际加载/使用（对齐 ORG-08） |
   * | `failed` → `requested` | ✅ | 条件修复后**重新登记**（回到待确认，不是直接生效） |
   * | `revoked` → 任意 | ❌ | **终态**：恢复须**新建一条分配记录**（新 `id`） |
   * | `available` → `requested` | ❌ | **不得**回退到「未接入」——该态已由可信流程确认可发现；失效应走 `failed` 或 `revoked` |
   */
  readonly status: 'requested' | 'available' | 'active' | 'failed' | 'revoked';
  readonly createdAt: string;
}

export type SoloipsTeamSkillAssignmentId = SoloipsCoreId<'team-skill-assignment'>;

/**
 * 团队 MCP 配置意图
 *
 * 〔待实现〕M0.1 目标实体。
 * **本记录只表达「期望配置」，不表达「生效情况」**——逐 agent 生效情况由独立运行态查询提供。
 * `configRef` 限**部署层可解析的受控标识**；`active` 只能由可信接入流程确认，模型不得自声明。
 */
export interface SoloipsTeamMcpIntentRecord {
  readonly id: SoloipsTeamMcpIntentId;
  readonly teamId: SoloipsTeamId;
  /** 对齐 DSH 的 [A-Za-z0-9_-]{1,32} */
  readonly serverName: string;
  /**
   * **部署层可解析的受控标识**（如部署配置中的键名/别名）。
   * **禁止**：任意路径、含凭据的连接串（`url`/`token`/`Authorization`/`env` 值）。
   * 凭据留在受保护的部署配置里（红线 2 + ORG-13）；core 只存**意图与引用**。
   */
  readonly configRef: string;
  /**
   * - `requested`：已登记期望配置，**未**确认生效；
   * - `active`：**仅由可信接入流程**确认后写入（见下「生效确认」）；
   * - `revoked`：期望已撤回（不回溯已加载的工具/上下文）；
   * - `unavailable`：当前无法生效（未接路径、缺 provider、作用域不匹配等）。
   *
   * **迁移矩阵（权威）见 §2.1.2**——特别地：`revoked` **不可**直接回 `active`（须新建 intent）。
   */
  readonly status: 'requested' | 'active' | 'revoked' | 'unavailable';
  readonly assignedByAppointmentId: SoloipsAppointmentId;
  readonly createdAt: string;
}

export type SoloipsTeamMcpIntentId = SoloipsCoreId<'team-mcp-intent'>;

/**
 * 团队规范条目（团队级资料，最小实现）
 *
 * 〔待实现〕M0.1 目标实体。
 * **与 `document_version` 的分工**：本表 `ownerId` 语义是**团队**（`teamId`），属团队级
 * 参考资料；`document_version` 的 `ownerId` 是 `employeeId`，属**个人资产**。因此规范
 * **不能**塞进 `document_version`——这是新表的理由，不是重复建设。
 * 走 LIB-01/LIB-02 的资料条目模型，但**不建完整资料室**（LIB-02 允许技术负责人选最小实现）。
 */
export interface SoloipsTeamNormRecord {
  readonly id: SoloipsTeamNormId;
  readonly teamId: SoloipsTeamId;
  readonly versionId: SoloipsTeamNormVersionId;
  readonly content: string;
  /** 内容摘要（对齐 document_version 的 digest 纪律） */
  readonly digest: string;
  readonly createdAt: string;
}

export type SoloipsTeamNormId = SoloipsCoreId<'team-norm'>;
export type SoloipsTeamNormVersionId = SoloipsCoreId<'team-norm-version'>;

/**
 * 规范阅读确认（阅读状态的取证形态）
 *
 * 〔待实现〕M0.1 目标实体。
 * **★ 最关键的设计判断**：`method: 'model-reported'` **不能单独构成「已阅读」**。
 * ORG-03 明禁「模型自报独立形成 ready」——把「员工说它读了」直接记为合规即重犯该错误。
 * `method` 字段的作用就是让强/弱证据在数据上**可区分**。
 * 命名纪律：本记录表达的是「**送达/确认**」，**不是**「已阅读理解」——见 §2.1.3。
 *
 * **★ append-only 事件流**〔约束〕：本表是**只追加的事件台账**，主键是 `ackId`（唯一事件 ID），
 * **不是** `(employeeId, teamId, normVersionId)`。理由：同一员工对同一团队同一规范版本会在
 * **不同任职代际**重复送达（撤职再任命即属此类），若以三元组为主键，新代际的强确认会
 * **覆盖**旧行——与「旧代际确认不作证据」（§2.1.3 效力规则）直接冲突，且销毁审计线索。
 * 读取语义见 §2.1.3「append-only 与读取证据」。
 */
export interface SoloipsNormAckRecord {
  /** 唯一事件 ID（主键）。每次确认写入**新增一行**，旧行永不改写 */
  readonly ackId: SoloipsNormAckId;
  readonly employeeId: SoloipsEmployeeId;
  readonly teamId: SoloipsTeamId;
  /** 哪一个版本被确认 */
  readonly normVersionId: SoloipsTeamNormVersionId;
  /** 该版本摘要快照 */
  readonly digest: string;
  readonly acknowledgedAt: string;
  /**
   * 取证强度（必须显式）：
   * - `host-delivered`：强证据——▸**仅由可信 Host 请求装配流程写入**◂；
   * - `model-reported`：弱证据——模型自报已阅读。**可记录、可展示、不足以形成资格判定**。
   */
  readonly method: 'host-delivered' | 'model-reported';
  /**
   * 执行上下文关联（强证据必填、弱证据可空）：写入强确认时的任职/会话/代际，
   * 使「送达」可追溯到那次真实装配。
   */
  readonly appointmentId?: SoloipsAppointmentId;
  readonly appointmentGeneration?: number;
  readonly sessionRef?: string;
}

export type SoloipsNormAckId = SoloipsCoreId<'norm-ack'>;

/**
 * 装配证据（只读装配读模型 = 装配动作的观测台账）
 *
 * 〔待实现〕M0.1 目标实体。
 *
 * **〔约束〕R-2 不变量（INV-AE-1，2026-09-18 升格）：本表只读、仅供取证与展示，禁止作为任何判定的输入。**
 * 四类文档的装配事实同时存在于 `employee.assemblyEvidence`（**个人资产**装配事实，
 * 服务 ORG-03 入职判定）与本报文的 `kind='document'` 记录（**装配动作**观测）。
 * 两者**不是同一事实的两份表示**（前者是「个人资产当前引用」，后者是「Host 侧装配动作观测」），
 * 但为避免被读成双事实来源，必须写死：
 *
 * - **禁作 onboarding 判定输入**——准入判定继续读 `employee.assemblyEvidence`，不改读本表；
 * - **禁作 permission 输入**——权限链路（§3）不得以本表记录作为授权或拒绝的依据；
 * - **禁作 readiness 判定输入**——任何「是否就绪/可上岗」的判定不得消费本表。
 *
 * **违反即契约违规**（不是「不推荐」）：实现若从本表读取判定输入，属**破坏单写权威**，
 * 须在评审中拒绝；本不变量由 BE-3/编组切片的验收逐条核对。
 */
export interface SoloipsAssemblyEvidenceRecord {
  readonly id: SoloipsAssemblyEvidenceId;
  readonly employeeId: SoloipsEmployeeId;
  readonly appointmentId?: SoloipsAppointmentId;
  /** ORG-03「任职代际」 */
  readonly appointmentGeneration?: number;
  /** ORG-03「Session/request」 */
  readonly sessionRef?: string;
  readonly kind: 'document' | 'norm' | 'skill' | 'mcp';
  readonly targetRef: SoloipsDocumentVersionId | SoloipsTeamNormVersionId | string;
  /** ORG-03「源版本/摘要」 */
  readonly digest?: string;
  readonly observedAt: string;
}

export type SoloipsAssemblyEvidenceId = SoloipsCoreId<'assembly-evidence'>;

// =====================
// 员工（员工身份与任职分离）
// =====================

/**
 * 员工记录
 * 员工身份独立于任职，任职才是权限来源
 *
 * 〔C-3 注 + 2026-09-18 补全〕本记录是**完整的目标形状**——**既包含**已实现并服务
 * ORG-03 准入判定的字段（`currentDocuments`/`assemblyEvidence`/`memoryInitialized`/
 * `verifiedCapabilities`），**也包含**目标新增字段（`email`/`modelConfig`/`status`/
 * `createdAt`）。**既有判定字段属于目标契约的一部分，不得移出**（它们是准入判定的
 * 权威输入，移出会使契约无法表达 ORG-03）。
 *
 * 与当前实现的关系（§0 C-3）：实现**已有** `id`/`displayName` + 上述四个判定字段；
 * `email`/`modelConfig`/`status`/`createdAt` **尚未实现**。字段的**确切形状与校验**
 * 以 `packages/core/src/contracts.ts` 的 `SoloipsEmployeeRecord` 为准（含
 * `currentDocuments` 的类型为 `Partial<Record<SoloipsRequiredDocumentType, SoloipsDocumentVersionId>>`）。
 */
export interface SoloipsEmployeeRecord {
  readonly id: SoloipsEmployeeId;
  readonly displayName: string;
  // ── 已实现：服务 ORG-03 准入判定的字段（不得移出目标契约）──
  /** 当前引用：员工只持各必需文档的当前版本（个人文档集边界） */
  readonly currentDocuments: Readonly<
    Partial<Record<SoloipsRequiredDocumentType, SoloipsDocumentVersionId>>
  >;
  /** Host 实际装配证据：被装入请求的版本（ORG-03「对当前版本的实际请求装配」） */
  readonly assemblyEvidence: Readonly<
    Partial<Record<SoloipsRequiredDocumentType, SoloipsDocumentVersionId>>
  >;
  /** 记忆初始化事实；初始记忆允许空集合（ORG-03），只记事实不存内容 */
  readonly memoryInitialized: boolean;
  /** 已通过最小验证的能力名（ORG-03「所需工具/能力的最小验证」） */
  readonly verifiedCapabilities: readonly string[];
  // ── 〔待实现〕目标新增字段 ──
  readonly email?: string;
  readonly modelConfig?: SoloipsModelConfig;
  /**
   * 员工身份来源〔待实现〕：
   * - `user_created`：用户在界面直接创建（如创建公司后招募首个总助理）；
   * - `recruited`：由已有员工/总助理经招募流程产生。
   *
   * **两值起步**：只区分「用户直建」与「经招募」，**不**在此字段编码招募者身份
   * （招募者可追溯性由 `appointment` 与 operation 台账承担）。
   * 枚举**允许后续扩展**（如 `imported`/`template` 等来源）——扩展属**待决 M0.2+**，
   * 未裁定前实现**不得**自行新增取值。
   */
  readonly identitySource?: 'user_created' | 'recruited';
  readonly status: 'pending' | 'active' | 'inactive';
  readonly createdAt: string;
}

export type SoloipsEmployeeId = SoloipsCoreId<'employee'>;

// =====================
// 操作台账（提交门）
// =====================

/**
 * 操作记录（提交门的意图先行台账）
 *
 * 〔2026-09-18 BE-002〕**目标形状补 `schemaVersion`**——现有代码**无**该字段
 * （核验 `contracts.ts:183-191`），属〔待实现〕。
 *
 * **为什么需要**：`kind` 是**封闭联合**，而契约扩展（如 BE-3 新增 `team.*`）
 * 会不断加项。若 operation 台账**不带版本**，则：
 * - 旧写入的 operation 记录在新版本代码下**可能不可读**（`kind` 不在联合内 → schema 校验失败）；
 * - 而台账是**崩溃恢复的核对锚点**——不可读即**无法恢复**，未决操作会永久悬挂。
 *
 * 本字段使「用哪个版本的 kind 词表解释这条记录」成为**记录自身的属性**，
 * 从而把「kind 联合扩展」从**破坏性变更**降为**兼容性变更**。
 */
export interface SoloipsOperationRecord {
  readonly id: SoloipsOperationId;
  readonly kind: SoloipsOperationKind;
  readonly status: 'pending' | 'committed';
  readonly employeeId?: SoloipsEmployeeId;
  readonly intent: SoloipsOperationIntent;
  readonly result?: SoloipsOperationResult;
  /**
   * 写入该记录时的 kind 词表版本〔待实现〕。
   *
   * - **新写入必须带当前版本**（新记录不豁免）；
   * - **读取遇 unknown kind**（不在当前联合内）时按 `schemaVersion` 兼容处理：
   *   以该版本的词表解释 `kind`，**不得**因词表扩展而判记录损坏；
   * - **恢复路径不得跳过**：未决（`pending`）记录即使 `kind` 是当前代码不认识的项，
   *   也**必须**可读并可参与核对——「读不懂」不等于「可忽略」。
   *
   * **取值口径与版本戳机制**〔待决〕：初始值、递增规则、以及与 §2.3 P1
   * （unit version 戳 + `compatibleVersions`）的关系**留 BE-2/BE-3 实现裁定**；
   * 本字段的**存在性**是硬要求，取值机制不是。
   */
  readonly schemaVersion?: number;
}

export type SoloipsOperationId = SoloipsCoreId<'operation'>;

// =====================
// 权益快照（用于原子检查）
// =====================

/**
 * 权益快照
 * 由 EntitlementResolver.resolve() 返回，用于原子操作
 */
export interface SoloipsEntitlementSnapshot {
  readonly accountId: string;
  readonly planCode: 'free' | 'pro' | 'enterprise';
  readonly companyLimit: number;              // -1 表示无限
  readonly subsidiaryLimit: number;           // -1 表示无限
  readonly quotaVersion: number;              // 配额版本，用于乐观锁
  readonly expiresAt?: string;
}

// =====================
// 审计日志
// =====================

export interface SoloipsAuditRecord {
  readonly id: SoloipsAuditId;
  readonly companyId: SoloipsCompanyId;
  readonly actorId: string;                   // 行动者 ID
  readonly action: string;                    // 操作类型
  readonly resourceType: string;
  readonly resourceId: string;
  readonly outcome: 'success' | 'rejected' | 'error';
  readonly details: Readonly<Record<string, unknown>>;
  readonly timestamp: string;
}

export type SoloipsAuditId = SoloipsCoreId<'audit'>;
```

#### 2.1.1 组长唯一性协议（BE-3 前置，2026-09-18 裁定）〔约束〕

`leadAppointmentId` 是**唯一组长引用**，其唯一性不能靠「先建 Team 再补任职」的天然顺序保证——两步之间崩溃会留下**无组长的 Team**。协议如下：

| # | 要求 |
|---|---|
| P-1 | **预分配 ID**：`Team` 与组长 `Appointment` 的 ID 在**同一操作内预先分配**（写入前生成），使两步引用彼此可知，无需回读 |
| P-2 | **经可恢复操作关联写入**：Team 与组长任职经**同一 `operationId`** 关联写入（提交门的意图先行 + 重放语义使其可恢复）；崩溃后按未决 `operationId` 核对并补齐，**不重新分配 ID** |
| P-3 | **中间状态不得作为可用团队返回**：Team 已写、组长任职未写的中间态，**读面必须排除**（不出现在 `listTeams`/`getTeam` 结果中），不得被当作可用团队。判据是「`leadAppointmentId` 指向的任职不存在或不可用」 |
| P-4 | **`leadAppointmentId` 约束**：必须满足**全部**四项——① 该任职**有效**（`status='active'`）；② **同公司**（`scope.companyId === team.companyId`）；③ **同团队**（`scope.kind='team'` 且 `scope.teamId === team.id`）；④ `role === 'team_lead'`。任一不满足即视为**无效引用**，按 P-3 排除 |
| P-5 | **第二组长拒绝**：同一 Team 已有有效组长时，再建一条 `team_lead` 任职须返回**可判定的拒绝**，不得产生第二条 |
| P-6 | **组长撤职后的语义（指挥裁定，三选一写死）**：组长任职被撤职时，**团队进入明确的不可用状态**——`Team` 的 `status` 转为不可用（或等效的显式标记），**不是**静默保留、也**不是**自动提升某成员继任。**换任须显式操作**（重新指定组长并建立新的 `team_lead` 任职），从而恢复可用 |
| P-7 | **生命周期：禁物理删除**〔约束〕：Team **不得**被物理删除（无 delete 路径），**只允许 `status` transition**（pending → 可用 ↔ 不可用 → 归档）。理由与状态语义见 §2.1 `SoloipsTeamRecord` 的 `status` 注——任职、skill 分配、规范确认、装配证据均以 `teamId` 为引用键 |

**P-6 的理由**：自动继任需要一套「谁继任」的规则（资历？能力匹配？部长指定？），那等于在契约里埋一个未裁定的策略；而静默保留会让「有组长」这一事实失真。写死为「不可用 + 显式换任」使失效可见、恢复可控，且不引入新策略。

**P-8 悬挂组长引用的处置协议**〔约束〕：**介质允许短暂存在 `leadAppointmentId` 无效的 Team**——P-1/P-2 的「同一操作内写入」在崩溃后可能留下中间态，且介质层**无法**用外键约束表达 P-4 的四项语义（「有效任职 + 同公司 + 同团队 + `team_lead`」跨表且含状态判定）。因此**不禁止**该状态出现，但**必须**按下表处置：

| # | 要求 |
|---|---|
| P-8.1 | **恢复流程必须扫描**：每次打开数据根（或每次执行团队读面）时，**扫描全部 `status='active'` 的 Team**，逐一核验 `leadAppointmentId` 是否满足 P-4 四项 |
| P-8.2 | **归入不可用**：核验不通过的 Team **一律归入不可用**——`listTeams`/`getTeam` **不得**将其作为可用团队返回（与 P-3 同判据、同读面） |
| P-8.3 | **不自动修复**：恢复流程**只标记、不自动**补任职或改指引用。**不得**自动指定新组长（P-6 同理由：会引入未裁定的继任策略） |
| P-8.4 | **待显式修复或换任**：Team 恢复可用**只能**经两类显式操作之一——① **修复**：补齐/改正使 `leadAppointmentId` 重新满足 P-4；② **换任**：建立新的 `team_lead` 任职并显式改指 `leadAppointmentId`（对齐 P-5 的第二组长拒绝） |
| P-8.5 | **读面不得静默降级**：不可用 Team **必须**以显式状态呈现（「无有效组长」），**不得**返回空成员列表或空任务列表冒充正常团队（对齐 §1.2 C-6 对「Team 未接入」的同类要求） |
| P-8.6 | **归档 Team 不参与扫描**：`status='archived'` 的 Team 不再要求有效组长（归档是终态，见 §2.1 `SoloipsTeamRecord` 的禁物理删除与状态语义） |

**P-8 与 P-3 的关系**：P-3 是**写入时的中间态**排除（同一次操作的两步之间）；P-8 是**恢复时的悬挂态**处置（崩溃残留或任职被撤）。两者判据一致（`leadAppointmentId` 无效即排除），但触发时机不同——**读面必须两条都覆盖**。

**P-9 三步成团协议（BE-001，2026-09-18 冻结）**〔约束〕：

> **⚠️ 口径关系（2026-09-18 OPS-00 标注，#35 §3.2 第 7 项）**：本协议**取代** P-1/P-2 对「成团写入形态」的描述——
> P-1「同一操作内预先分配 ID」与 P-2「经**同一** `operationId` 关联写入」写于「成团可能是一次操作」的假设下；
> P-9 冻结后成团是**三步、三个 kind、三个 `operationId`**，故 P-1/P-2 在本节**只保留其不变量**（ID 可预先分配以便引用；崩溃后按未决 `operationId` 核对并补齐、**不重新分配 ID**），
> **不再**读作「Team 与组长任职必须同一 `operationId`」——那是被取代的旧口径。
> P-3~P-8 继续有效（P-8 里「P-1/P-2 的『同一操作内写入』在崩溃后可能留下中间态」一句，按 P-9 的三步中间态理解）。
> 历史表述保留于此，避免两种现行口径并存。

**成团不是一次原子提交**（提交门不提供跨表事务），故把「建团队 + 建组长任职」冻结为**三步、三个 kind、三个 `operationId`**：

| 步 | kind | 动作 | 写入后状态 | 校验 |
|---|---|---|---|---|
| ① | `team.create` | 只建团队记录（含 `function`/`functionSource`/`confirmedBy`） | `status='pending'`，**无组长**（`leadAppointmentId` 缺省） | 公司/部门存在且同账户；`function` 非空白 |
| ② | `appointment.create` | 建组长任职（`role='team_lead'`，`scope.kind='team'` 且 `scope.teamId` = ①的 team） | 任职已存在；团队**仍为 `pending`** | 对齐 P-5（第二组长拒绝）；对齐 §2.3 的 `scope` 规则 |
| ③ | `team.activate` | 校验 `leadAppointmentId` 满足 P-4 四项后 `pending` → 可用 | 团队**可用** | **P-4 四项全部满足**；不满足则**拒绝**（团队留在 `pending`） |

**三步各自独立可恢复**：每步携带自己的 `operationId`，失败后**从已提交事实续做**——不得回退已提交的步骤，也不得把三步合并成一次提交。理由：**不得声称成团是原子的**（首任 §1.3 既有纪律），且合一步会让「已建团队、未建组长」的中间态无法表达，反而使恢复无据。

**恢复入口（与 P-8 衔接）**〔约束〕：**`activate` 之前的 `pending` 即「成团中间态」**，其处置分两类——

| 情形 | 处置 |
|---|---|
| **续做**（③ 尚未执行或结果未知） | 扫描 `status='pending'` 的 Team，若 `leadAppointmentId` 已存在且满足 P-4 → 执行 ③ `team.activate`；若 ② 未提交 → 先补 ② 再 ③ |
| **收敛**（确认 ② 未提交且不再需要） | 经**显式操作**归档该 `pending` 团队（`team.close`），**不物理删除**（P-7）；**不得**让 `pending` 团队长期悬挂而不处置 |
| **不得**自动 | **不得**自动建组长（P-6/P-8.3 同理由：会引入未裁定的继任策略）；**不得**自动把 `pending` 当作可用返回（P-9.1/P-9.2） |

**四条读面纪律**〔约束〕：

| # | 要求 |
|---|---|
| P-9.1 | **`pending` 不得出现在可用结果中**：`listTeams`/`getTeam` 的**可用**结果集**必须排除** `status='pending'` 的 Team（与 P-3/P-8.2 同判据） |
| P-9.2 | **读面不得静默降级**：需要展示 `pending` 团队时**必须**以显式状态呈现（「成团未完成/无组长」），**不得**返回空成员列表或空任务列表冒充正常团队 |
| P-9.3 | **`activate` 是唯一的 pending→可用 通道**：不得用「直接改 `status`」或「`team.update-function`」等方式越过 ③ |
| P-9.4 | **P-9 与 P-8 的分工**：`pending` 是**成团期**的中间态（③ 尚未成功执行）；`不可用` 是**成团后**组长失效（撤职未换任）或引用悬挂。两者**都不得**读作可用，但**成因与恢复路径不同**——`pending` 走「续做/收敛」，`不可用` 走「修复/换任」 |

**与 DSH Team roster 的分工**：本协议约束 **core 侧 `Team` 记录与任职**；DSH roster 的 `role: 'lead' | 'teammate'` 是**另一层**词表（见 §2.1 `SoloipsTeamRecord` 的两套词表不可混用）。M0.1 不接 DSH Team（§1.2 C-6），故本协议在 M0.1 内自成闭环。

**〔待实现〕**：P-1…P-9 均为 M0.1 目标要求（`team` 表尚未建，见 §0）；BE-3 须逐条验收。

**P-10 `reconcileTeams` 的调用范围裁定（2026-09-18，补 BE-3 遗留；#35 §3.2 第 8 项）**〔约束〕：

**问题**：`reconcileTeams` 是 core 内**第二处不经提交门的写**（第一处是账户绑定元数据写入），因此必须查清它的实际可调用范围——若运行期可与正常写入并行，它就是一个绕过「意图先行 + 串行槽位」的口子。

**已核事实**（读源确认 `store.ts:2040-2120`，2026-09-18）：

| 事实 | 证据 |
|---|---|
| 它是**显式命令**，**不在** `open` 时自动执行 | 实现者在注释中写明三条理由；`openSoloipsCompanyStore` 路径不含它 |
| 写入**前复核写权** | `#reconcileOne` 首行 `await this.#lease.assertHeld()`，失权即拒（`team-reconcile` 包装） |
| **幂等收敛**：多次 `update` 之间崩溃留下的部分标记是收敛中间态 | 已标记保持 `inactive`，未标记下次扫描继续 |
| **读面不依赖标记** | `#isUsableTeam` 始终按 P-4 实时核验——「标记没跑全」不会让失效团队被读作可用（P-8.2 由读面自身满足） |
| 写入形态为 `update`（读-改-写），不是整条 `put` | 不会用陈旧快照覆盖其他字段 |

**裁定**：

| # | 规则 |
|---|---|
| **P-10.1** | **当前形态在 M0.1 可接受**——它不经门，但满足「写前复核写权 + 幂等收敛 + 读面不依赖标记」三条补偿；其写入是**收敛型**（只把失效团队标记为 `inactive`），不是业务语义写入 |
| **P-10.2** | **不得暴露给任何非 Host-内部主体**：不进 §2.5 工具面、不进 §2.5.1 的 Remote 面（矩阵已列）；调用者是**运维/恢复流程**，不是 UI 或模型 |
| **P-10.3** | **若后续裁定要求「core 内全部业务写都经提交门」**，则为它登记 `team.reconcile` kind 并改为经门提交（入参加 `operationId`）——这是一次机械改造，语义与读面纪律不变。**登记为 BE-4c/后续切片候选**，不在 M0.1 强制 |
| **P-10.4** | **不得**把它的存在当成「读 API 可以悄悄变成写 API」的先例——它之所以可豁免门，是因为**收敛型 + 幂等 + 读面自足**三条同时成立；不满足这三条的写入一律走门 |

**〔待实现〕**：P-10.3 的收紧路径未实施（当前形态即上文已核事实）。**在收紧前，不得声称「core 内全部写都经提交门」。**

#### 2.1.2 MCP：期望与生效的分工（2026-09-18 裁定）〔约束〕

| 层 | 载体 | 谁写 | 说明 |
|---|---|---|---|
| **期望配置** | `SoloipsTeamMcpIntentRecord`（§2.1） | 部长的分配操作（经 Host） | 只表达「这个团队希望用哪些 MCP server」 |
| **逐 agent 生效情况** | **独立运行态查询**（**不落在意图记录上**） | 运行态读取 | 查「某 agent/会话当前实际可用的 MCP 工具」；M0.1 未接该路径时**返回不可用**，而不是返回空集冒充「无工具」 |

**为什么不把生效情况写进意图记录**：生效是**运行时作用域**事实（每 agent 一实例、随装配变化），不是可持久化的稳定业务事实。写进意图记录会制造「配置意图被读成加载事实」的错误——正是 ORG-08「保存、批准、分配、实际加载和有效使用是不同事实」要避免的。

**生效确认规则**：

1. **`active` 只能由可信接入流程写入**——Host 侧在**实际完成挂载并读取到可见性**后回写；**模型不得自声明** `active`。
2. **无该流程时保持 `requested` 或 `unavailable`**。M0.1 **未接**逐 agent 挂载路径，故 M0.1 的意图记录**停留在这两个状态**，**不得**出现 `active`。
3. **`requested` 不得呈现为「已配置/已生效」**；界面与工具输出须区分二者。

**`configRef` 取值限制**：**部署层可解析的受控标识**（如部署配置中的键名/别名）。**禁止**任意路径、含凭据的连接串（`url`/`token`/`Authorization`/`env` 值）——凭据留受保护部署配置（红线 2 + ORG-13）。

**作用域粒度**：**agent，不是 team**。DSH 的 `serverName` 唯一性以**注册作用域**为单位，而 teammate 继承父 preset 的 standing 组合——团队级隔离**必须**走 per-agent 挂载或自建 provider，**不能**写进 preset 行（R-1）。

**状态迁移矩阵（权威，2026-09-18 补录）**〔约束〕：

| 起点 → 终点 | 允许 | 条件与说明 |
|---|---|---|
| `requested` → `active` | ✅ | **仅可信接入流程**：Host 侧实际完成挂载并读取到可见性后回写。**模型不得自声明** |
| `requested` → `unavailable` | ✅ | 接入时判定当前无法生效（未接路径/缺 provider/作用域不匹配） |
| `unavailable` → `requested` | ✅ | 条件变化后重新登记期望（如路径接入、provider 补齐）——**回到待确认**，不是直接生效 |
| `unavailable` → `active` | ❌ | **不得**跳跃：生效确认须经可信接入流程，而该流程的写入前置是 `requested`（先登记期望、后确认生效） |
| `active` → `revoked` | ✅ | 显式撤回期望。**不回溯**已加载的工具/上下文（ORG-08：撤回 ≠ 已加载内容消失） |
| `requested` / `unavailable` → `revoked` | ✅ | 未生效的期望同样可撤回 |
| `revoked` → `active` | ❌ | **禁止**。撤回是**终态**——恢复同一配置须**新建一条 intent**（新 `id`、新 `createdAt`），旧行保留供审计。理由：原地复活会让「撤回—再启用」在台账上不可见，且 `revoked` 行无法表达「这是哪一次重新登记」 |
| `revoked` → `requested` / `unavailable` | ❌ | 同上：`revoked` **无出边**，任何恢复都走新行 |
| `active` → `unavailable` | ❌ | **不得**由 `active` 直接降级：先经可信流程撤回（`active` → `revoked`），再按新期望登记新 intent。理由：`active` 的失效是**运行态**事实，改写意图行会覆盖「曾确认生效」的历史 |

**M0.1 停留态（不变）**：M0.1 **未接**逐 agent 挂载路径，故 intent **只允许停留在 `requested` / `unavailable`**，**不得**出现 `active`（与上「生效确认规则」第 2 条逐字一致）；`revoked` 在 M0.1 亦不可达（无生效态可撤）。

**违反迁移矩阵即契约违规**：实现**不得**用「直接改 `status` 字段」的方式绕过上表；每次迁移须由**对应动作**触发（登记期望 / 可信接入确认 / 显式撤回），并在 operation 台账留痕。

**〔未验证〕**：本节只登记意图形态与确认规则；**不声称**「团队级 MCP 已隔离」，也不声称逐 agent 挂载已可行（该路径未做挂载实验）。

#### 2.1.3 规范确认（NormAck）强证据契约（2026-09-18 裁定）〔约束〕

**命名纪律**：本记录表达「**送达/确认**」，**不是**「已阅读理解」。字段与界面文案**避免**「已阅读理解」「已掌握」等表述——送达是事实，理解不可由送达推出。

**写入方分工（谁产生哪种证据）**：

| 证据 | 写入方 | 触发条件 | `method` |
|---|---|---|---|
| **强确认** | **可信 Host 请求装配流程** | 规范正文**作为该次请求装配的一部分被实际装入**员工会话时，Host 侧写一条 | `host-delivered` |
| **弱确认** | 模型自报 | 模型声称已阅读（工具调用或对话） | `model-reported` |

**强确认必须关联**（写入时同步落库，缺项即为无效强证据）：**规范版本**（`normVersionId` + `digest`）、**员工**（`employeeId`）、**执行上下文**（`appointmentId` / `appointmentGeneration` / `sessionRef`——三者至少可追溯至那次装配）。

**「送达」作为准入证据的语义**：

1. **送达 ≠ 理解**。强确认证明的是「该版本正文进入了这次装配」，**不证明**模型已理解或遵循。任何晋级判定只能把送达当作**必要条件**，不能当作充分条件。
2. **强确认是准入可用的取证**；**弱确认不足以形成资格判定**（ORG-03：模型自报不能独立形成 `ready`）。
3. **弱确认不覆盖强确认**：已有 `host-delivered` 记录时，后来的 `model-reported` **不得**降级或替换它（两方法并存时以强为准）；反向亦然——弱记录不因后来出现强记录而被「补正」为强。

**主键与追加语义**〔约束〕：

- **主键**：`ackId`（唯一事件 ID）。**不是** `(employeeId, teamId, normVersionId)`——三元组在**不同任职代际**会重复（撤职再任命、重新送达），以其为主键会导致新证据**覆盖**旧行。
- **本表 append-only**：确认写入一律**新增事件行**，**不得**改写或删除既有行。旧行保留供审计（「当时谁在哪个代际送达过」）。
- **强确认重复装配**：同一 `(employeeId, teamId, normVersionId)` 在**同一代际**内重复装配时，**新增一行**事件（携带该次的 `appointmentGeneration` / `sessionRef` / `acknowledgedAt`），**不更新旧行**。「幂等」在此表现为**同一 `operationId` 重放不产生第二行**（提交门语义），而**不是**「重复装配不新增行」。
- **跨版本不合并**：新版本是**新行**（`normVersionId` 不同），旧行保留供追溯。
- **跨代际不合并**：同一版本在**新任职代际**重新送达是**新行**（`appointmentGeneration` 不同），旧行保留。

**append-only 与「读取证据」**〔约束〕——**写入是事件流，读取是单条投影**，二者不可混：

| 操作 | 语义 |
|---|---|
| **读取证据**（判定用） | 按 `(employeeId, teamId, normVersionId)` 取**当前有效代际**的**最新事件**（按 `acknowledgedAt` 取最新；代际匹配见下）。**只**取该条参与判定 |
| **当前有效代际** | 由该员工在该团队的**有效任职**（`status='active'` 的 `team_lead`/`member` 任职）的 `generation` 决定；无有效任职即**无有效代际**（该团队下无任何强确认可用） |
| **代际不匹配的事件** | 保留为历史事实，但**不作为**当前证据（对齐下「效力规则」的「旧确认不再作为当前代际的证据」） |
| **审计读取** | 可取**全部**历史行（按时间序列），用于回答「送达到过几次、每次在哪一代际」 |
| **弱证据的读取** | `model-reported` 行可读可展示，但**不参与**任何资格判定（不因存在强证据而被补正，见下效力规则 3） |

> **反面声明**：读取规则**不蕴含**「取最新一行即可」——必须先按代际过滤再取最新；否则撤职后重新送达前，旧代际的行会被误读为当前证据。

**效力规则**〔约束〕：

| 情形 | 效力 |
|---|---|
| 规范出新版本 | 旧版本的确认**不自动延续**到新版本。新版本需**新的**强确认；`normVersionId` 不同即另起一行 |
| 旧版本确认 | 保留为历史事实（「当时送达过 v1」），**不**因新版本出现而失效或删除 |
| 员工撤职后再入团 | 任职代际（`generation`）变化 → **旧确认不再作为当前代际的证据**（`appointmentGeneration` 不匹配即视为过期）；须重新送达并**写新事件行**（旧行保留，不覆盖——见上「append-only 与读取证据」） |
| 同一员工换团队 | 按 `teamId` 分开；不跨团队复用 |

**`SoloipsTeamNormRecord` 的版本不可变性**〔约束〕：**已写入的规范版本不可修改**——内容变更即**新版本**（新的 `normVersionId` + 新 `digest`）。「当前版本」由**指向前一版本链的最新 `versionId`** 定位（或由团队记录持当前引用），不得原地覆盖历史版本的内容或摘要。理由：确认事件以 `normVersionId` 为**引用键**（`ackId` 是主键，但事件所指的版本必须是确定不变的），若版本内容可变，历史确认就失去确定的所指。

**〔待实现〕**：以上字段与规则均为 M0.1 目标；`SoloipsNormAckRecord` 尚未实现（§0），强确认的 Host 写入路径**依赖** §2.1 的 `SoloipsAssemblyEvidenceRecord`（装配动作的观测台账）作为落点。

### 2.2 新增实体登记（2026-09-18 裁定，全部〔待实现〕）

以下 6 个实体由指挥裁定登记进本节，**权威归属即本文档**（来源：`docs/prds/organization-full-backend-design-v0.1.md` §1.1/§2.1/§2.2/§2.3/§2.4）。**均为 M0.1 目标，§0 未列已实现**。

| # | 实体 | 位置 | 关键点 |
|---|---|---|---|
| 1 | `SoloipsTeamRecord`（+ `function`/`functionSource`/`confirmedBy`/`leadAppointmentId?`） | §2.1 | 已有类型，**本次补字段**；能力项**不入本记录**（走 `appointment.requiredCapabilities`）；组长落点见 C-5；**禁物理删除，只允许 `status` transition**，状态语义（pending/可用/不可用/归档）必须成立（字段形态留 BE-3）；**三步成团协议见 §2.1.1 P-9**（`leadAppointmentId` 在 pending 期可缺省） |
| 2 | `SoloipsTeamSkillAssignmentRecord` | §2.1 | 分配（意图+授权）与**实际加载**是两层；撤回不等于清除已加载上下文；**五态生命周期 + 迁移矩阵见 §2.1**（`revoked` 无出边；M0.1 只走 `requested`） |
| 3 | `SoloipsTeamMcpIntentRecord` | §2.1 | `configRef` **不含凭据**；必须有 `unavailable` 态；作用域粒度是 agent；**状态迁移矩阵见 §2.1.2**（`revoked` 无出边） |
| 4 | `SoloipsTeamNormRecord`（+ `SoloipsTeamNormVersionId`） | §2.1 | 团队级资料；**不能**塞进 `document_version`（`ownerId` 语义不同） |
| 5 | `SoloipsNormAckRecord` | §2.1 | `method` 必须显式；**弱证据不足以形成资格**（ORG-03）；**主键 `ackId`、append-only 事件流**（三元组非主键） |
| 6 | `SoloipsAssemblyEvidenceRecord` | §2.1 | **只读、不参与判定**（R-2 不变量 INV-AE-1：禁作 onboarding/permission/readiness 输入，违反即契约违规）；与 `employee.assemblyEvidence` 并存不冲突 |

### 2.3 任职 `scope` 政策（C-4，2026-09-18 裁定）

**〔约束〕`scope` 先可选，不一步收紧为必填。**

根因是**介质层硬约束**（非保守选择）：`appointmentRecordSchema` 当前 `departmentId` 必填且无 `scope`，而 domain 的 `invalidRecords` 默认**拒绝整次 open**，core spec 未声明该键——把 `scope` 直接设为必填会让**存量记录整次 open 失败**，且当前默认后端（sqlite）下**逃生通道不可用**（`backupRecord` 只在 JSON 后端 per-record unit 实现）。详见 `docs/prds/organization-full-backend-design-v0.1.md` §1.5 与 §6 R-3。

**阶段一（`scope?` 可选期）的运行时推断规则**〔约束〕——读取时凡遇缺 `scope` 的记录按下表**严格三分支**处理，**不写回**、**不猜测**：

| # | 条件 | 结果 | 依据 |
|---|---|---|---|
| 1 | **有 `scope`** | **直接采用 `scope`**（不做任何推断） | 显式字段优先，推断只服务缺失场景 |
| 2 | 无 `scope`，且 `departmentId` 存在 | `{ kind: 'department', companyId: <由 departmentId 解析>, departmentId }` | 现有形状即部门级任职（`departmentId` 必填语义） |
| 3 | 无 `scope`，且**无法解析出公司**（含无 `departmentId` 的情形） | **判定为数据不一致**（`SOLOIPS_CORE_RECORD_INVALID`） | **不猜**；不得静默当作任一 scope |

> **★ 规则「首个 `general_assistant` → company 级」已从运行时规则中删除（BE-003，2026-09-18）**〔约束〕
>
> **该推断不得存在于运行时**。理由：它依赖「首个」这一**基于读取顺序/时间**的猜测——存量记录里**没有**任何信息能区分公司级与部门级任职，而「读取顺序」在并发、分页、重放、数据根迁移下**都不稳定**，会产出**非确定性**结果（同一记录在不同读取次序下被判成不同 scope）。以时序猜测填补契约缺口，违反「交付确定性、不虚构」纪律。
>
> **改为严格三分支**（上表 1/2/3）：**能定则定、不能定即报错**。原规则 3 的「无 `scope` 且无 `departmentId`」情形**归入分支 3 报错**，不再尝试推断为公司级。
>
> **该推断的合法去向**〔约束〕：**仅允许存在于 migration 工具**，且**必须人工确认**——
>
> | 项 | 要求 |
> |---|---|
> | 载体 | **迁移工具/脚本**（独立切片），**不是** core 读取路径、**不是** `checkOnboarding` 等服务方法 |
> | 人工确认 | 工具**必须**把候选判定呈现给人工确认后才写入（写入的是**带 `scope` 的新记录**或显式 `scope` 字段更新），**不得**静默批量改判 |
> | 写入方式 | 经**新 `operationId`** 的显式操作产生（重新任命），或经显式声明的迁移脚本留痕；**不得**在读取时写回 |
> | 留痕 | 每一条改判须可追溯（哪条记录、依据什么、谁确认的） |

**收紧为必填的 4 项前置条件**〔约束〕（**当前不满足**，故 `scope` 必须保持可选）：

> **锚点〔约束〕**：**目标在 M1 前完成 `scope` required 迁移**（即「M0.1/M0.2 期间保持可选、M1 里程碑前收紧为必填」）。该锚点是**目标时点**，不是当前授权——迁移**必须**先满足下列 4 项前置，且不得因该锚点提前收紧（存量记录整次 open 失败的风险见上「根因」）。

1. `P1`：unit version 戳 + `compatibleVersions` 机制落地（**当前不满足**——含 sqlite 后端的版本戳实现）；
2. 存量 `appointment` 记录已全部带 `scope`（迁移完成、无缺项）；
3. `invalidRecords` 的处理策略在当前默认后端下**真正可用**（依赖 `backupRecord` 或等效机制）；
4. 迁移脚本/重新任命路径已在独立切片内验证可读回。

> **`kind: 'team'` 的引用目标**〔约束〕：`teamId`（**不是** `teamBindingId`）。理由：C-6 裁定 M0.1 只落纯数据层 `Team`、不建 `TeamBinding`，而 BE-3 要求「一个团队恰好一名 `team_lead` + N 名 `member` 可读回」——若指向 `TeamBinding`，团队级任职在 M0.1 将**无法表达**。本项修正由 C-5/C-6 推导得出，2026-09-18 登记。

**〔待实现〕** `scope`/`role` 本身尚未实现（§0）；本节的推断规则是**过渡期读取纪律**，不是已实现行为。

### 2.4 Q-N5 子公司政策（2026-09-18 裁定）

**Q-N5(a)：允许子公司嵌套**〔约束〕。母公司/子公司/用户公司均可作父（现有代码只禁 `operation` 作父，保留该禁令）。「三层公司层级」描述的是**生态角色分层**（平台/运营/用户），**不是树的深度约束**——把生态分层误读为深度限制会引入契约里没有的规则。

**Q-N5(b)：配额按全部 `subsidiary` 计数，不论深度**〔约束〕。`subsidiaryLimit` 计该公司账户下**全部** `type='subsidiary'` 的 `active` 公司数。理由：

- 与 §2.1 的「子公司总数上限」逐字一致（是**总数**，非「顶层子公司数量」）；
- 按深度分层计数（如「只算第一层」）会让「建一个子公司再在其下建一个」**绕过限制**，形成没有契约依据的漏洞；
- 按 `parentCompanyId` 归属统计能得出同一集合，但对孤儿记录（父缺失）处理更脆弱。

**用户侧默认收窄**〔建议〕：界面默认**不**暴露「在子公司下再建子公司」入口（把常见路径做成一层）；深层嵌套**能力保留但不诱导**。

**Q-N5b：每个公司（含子公司）的首个总助理由用户直接招募**〔约束〕。

> **裁定内容（2026-09-18）**：**每个公司——包括每个子公司——的首个总助理由用户直接招募**，与既有「用户创建公司 → 招募总助理」**同构**。这使递归**终止**：「谁来招募子公司的首个总助理」的答案为「用户」，不需要任何总助理先行存在。

| 项 | 裁定 |
|---|---|
| 首个总助理的招募者 | **用户**（对每个公司，含子公司，各成立一次） |
| 依据 | 链式旅程已确立「总助理由公司创建后招募」（用户 Q1/Q2），且总助理兼人事角色；用户是该旅程的起点，故首任同构延伸 |
| 递归终止 | 成立——不再需要「子公司总助理的招募者」先存在 |
| 母公司总助理跨公司招募 | **〔待决〕**，属后续**权限增强**；本裁定不授权，也不排除。在裁定前**不得**假设母公司总助理可跨公司招募 |
| 界面约束 | 引导需为每个子公司重复「招募总助理」步骤；权限差异视图（母公司/子公司）层数取决于跨公司招募裁定的结果 |
| 与 (d) 候选的关系 | 「子公司不设总助理、母公司兼任」**被排除**——见下方「排除理由的更正」 |

#### 2.4.1 创建后「待招募」状态合法〔约束〕

**`createCompany` 不创建任何总助理任职。** 公司创建后**无总助理**是**合法的中间状态**，不是数据缺陷：

| 事实 | 语义 |
|---|---|
| 公司记录已存在、无 `general_assistant` 任职 | **合法**。公司处于「待招募总助理」状态 |
| 该状态是否阻断其他操作 | **不阻断**组织事实本身（部门/员工/团队记录可建）；但依赖总助理职权（如跨部门编组、招募部长）的操作按授权规则拒绝——**拒绝的原因是没有相应任职**，不是「公司不完整」 |
| 是否要求「必须有总助理」才能算公司建成 | **不要求**。M0.1 验收出口是「创建公司成功」（§6.1），不含「已有总助理」 |

**读面必须显式表达该状态**〔约束〕（SA-01，2026-09-18）——**「无总助理」不得被静默省略**：

| # | 要求 |
|---|---|
| SA-01.1 | **读面须能显式返回「无总助理」**：BE-4 的查询服务（`listAdministrators(companyId)`——**BE-4 已登记**，见 `system-assistant-backend-design-v0.1.md` §4.1；或 `getCompanyTree` 携带等效状态）**必须**能区分「该公司没有有效 `general_assistant` 任职」与「查询未覆盖该公司/查询失败」——**不得**用「字段缺省」「空数组」「不返回该节点」等方式让调用方无法区分。**查询名以 BE-4 登记为准**，本节不新造服务名 |
| SA-01.2 | **不得静默省略**：组织树/公司详情读面**不得**因为「没有总助理」就省略该信息——省略会让界面无从判断是「待招募」还是「读面缺陷」。**须返回可判定的显式状态**（如 `generalAssistant: null` 或等效的显式标记，形态留 BE-4） |
| SA-01.3 | **界面据此显示「待招募」引导**：界面收到该显式状态后，显示「待招募总助理」引导（与 [`system-assistant-ui-design-v0.1.md`](../prds/system-assistant-ui-design-v0.1.md) 的收尾引导衔接）——**不是**显示空白、**不是**显示错误态 |
| SA-01.4 | **与 §2.4.2 的分工**：本节只要求**读面能表达**该状态；**写面**（招募入口、幂等、恢复）见 §2.4.2 |

**〔已实现〕**：SA-01 的读面由 **BE-4a 的 `listAdministrators(companyId)`** 落地（`contracts.ts:1342`，返回 `SoloipsAdministratorProjection`），**四态显式投影**：

| 分支 | 含义 | 形状要点 |
|---|---|---|
| `vacant` | 公司存在，**无**有效的公司级 `general_assistant` 任职 | **显式携带空数组** `administrators: []`——「没有」在结构上可判定，调用方不必区分「字段缺省」与「空集合」（SA-01.1/2） |
| `uncovered` | 公司**不在本读面覆盖范围内**（公司记录不存在） | **不携带** `administrators` 字段——与 `vacant` 的形状差异即二者的可区分性；消息明写「这不表示该公司『没有总助理』——两者不得互相冒充」 |
| `present` | 存在**恰好一条**有效任职 | 携带单元素清单 |
| `inconsistent` | 存在**多于一条**有效任职（§2.4.2 唯一性被破坏） | 独立分支 + **全量清单**，**不取首条掩盖**（BE-4a 实现裁定：写面/迁移缺陷必须可见，ORG-05 哲学） |

**查询失败不在此形状内**：失败以**抛出的错误**呈现（`SOLOIPS_CORE_STORE_CLOSED`/`SOLOIPS_CORE_RECORD_INVALID`/介质错误），**不编码为分支**——把失败编码成返回值会让调用方把「读不到」误读成「没有」。**本投影的每个分支都表示查询已成功执行。**（BE-4a 实现者裁定，经 QA 独立核验。）

界面据 `vacant` 显示「待招募」引导（SA-01.3）；`uncovered`/抛错**不得**被显示为「待招募」。

**⚠️ 已删除的旧示例**：本契约早前在 §4.2 的 `createCompany` 示例中含 `createDefaultGeneralAssistant(company.id)` 步骤（「创建默认总助理任职」）。该步骤**已删除**，理由：

1. 与「总助理由**招募**产生」的产品决定**冲突**——自动创建会绕过招募流程（该冲突此前已由 [`system-assistant-ui-design-v0.1.md`](../prds/system-assistant-ui-design-v0.1.md) 与 [`system-assistant-m01-prd-v1.0.md`](../prds/system-assistant-m01-prd-v1.0.md) 登记为待澄清项，现按本裁定关闭）。
2. 它从未实现（§0），故删除**不涉及数据迁移**。
3. 它会与 §4.3 的配额计数、以及提交门的「一个 operationId 一个业务写」语义纠缠——创建公司与招募助理是**两个独立的可恢复操作**，不应合成一个。

#### 2.4.2 可信用户入口：招募首个总助理〔约束〕

**入口是可信的 Host 侧用户入口**，不是模型工具、也不是 `createCompany` 的副作用。语义如下：

| 项 | 要求 |
|---|---|
| 入口形态 | 用户侧引导流程（系统助理引导段）经 **Host 半边**调用既有命令面，**不新增命令 kind**——落库路径 = `createEmployee` + `createAppointment(scope={kind:'company', companyId}, role='general_assistant')`（两条独立提交） |
| 幂等 | 每个业务动作携带**稳定 `operationId`**；同 `operationId` 重放返回原结果（提交门 `replayed`），**不产生第二个员工或第二条任职** |
| 部分完成 | 两步之间崩溃 → 公司处于「员工已建、任职未建」；**恢复时先读回**（该员工是否已有该公司的 `general_assistant` 有效任职）再决定是否补第 2 步，**不得**盲目重建员工 |
| 结果未知 | 提交门返回 `unknown`（未决 operationId）时**停止并请求核对**，**不得**换 `operationId` 重试（ORG-05） |
| 唯一性 | 一个公司**同一时刻至多一条**有效的公司级 `general_assistant` 任职；已有有效任职时重复招募应返回可判定的拒绝，而不是再建一条 |
| 授权 | 招募者身份经 Host 侧上下文确认；M0.1 的授权自证边界见 §3.2「M0.1 实际授权规则」 |

**反面声明**：本节不证明引导流程已实现、不证明幂等已验收。「待招募」是**契约层的合法状态**，不等于界面已能表达它。

**〔未验证〕**：本裁定是产品+契约层面的决定，不证明引导旅程已实现、不证明子公司视图已具备招募入口。

#### 2.4.4 部门部长唯一性与换任（2026-09-18 裁定；补 BE-2 遗留）〔约束〕

**问题的来由**：BE-2 实现 `department_lead` 任职时**回填** `department.leaderAppointmentId`，但当时**契约为部长登记的唯一性规则缺失**——团队组长有 §2.1.1 P-4/P-5/P-8，公司总助理有 §2.4.2，**部门部长没有**。实现者据此作出诚实披露：第二条 `department_lead` 任职会**覆盖** `leaderAppointmentId`（**后写者胜**），旧任职仍 `active`；该行为已在测试中钉住可见，并明确「不得据此声称部长唯一性已实现」。本裁定关闭该缺口（#35 §3.2「部长唯一性遗留」，FE-2b 暴露界面前必须收口）。

**裁定：与总助理唯一性同构，写死四条。**

| # | 规则 | 说明 |
|---|---|---|
| **DL-1** | **同一部门同一时刻至多一条有效 `department_lead` 任职** | 判据与总助理一致：只算 `status === 'active'` 的、作用域为该部门的部门级任职。第二条提交返回可判定拒绝（`SOLOIPS_CORE_PRECONDITION`），**零业务写**（判定在提交门串行槽位内、意图落盘前） |
| **DL-2** | **换任必须显式**：先 `revokeAppointment` 旧任职，再 `createAppointment` 新任职 | **不得**依赖「后写者胜」隐式换任；不得引入自动继任策略（与 P-6 同理由：自动继任需要一套未裁定的「谁继任」规则） |
| **DL-3** | **`leaderAppointmentId` 是「当前有效部长」的显式引用**，不是历史 | 撤销部长任职时**联动清除**该引用（与 P-8 的悬挂引用处置同向：失效可见、不静默保留）；清除后部门回到合法的「无部长态」（ORG-02 `awaiting_manager`） |
| **DL-4** | **读面显式表达「无部长」** | 与 SA-01 对总助理的要求同构：部门读面**不得**用字段缺省让调用方无法区分「无部长」与「读面缺陷」。BE-4a 的 `getDepartment` 返回记录时 `leaderAppointmentId` 缺省即「无有效部长」，界面据此显示「待任命」引导 |

**与 P-8 的关系**：§2.1.1 P-8 已经处理了「**团队**组长引用悬挂」的处置协议（不禁止介质短暂存在失效引用，但读面不得静默降级为可用）。DL-3 对部门采取**更强**的处置——**撤销即清除**（而非保留失效引用）：部门与团队的风险面不同，部门的「部长」引用不参与任何可用性判定（团队要判 `usable`），因此清除即最简且无歧义。

**实现归属**：
- **DL-1/DL-2**（唯一性拒绝）：**BE-4c 或其后首个 core 切片**补实现（`createAppointment` 的 `precondition` 已有总助理/组长两分支，追加第三分支）。**本裁定不重开 BE-2**——已合并的 BE-2 行为按 DL-1 收口即可。
- **DL-3**（撤销清除）：随 `revokeAppointment` 的部门处理补。
- **DL-4**（读面）：**BE-4a 的 `getDepartment` 已满足形状要求**（返回记录、缺省即无），界面侧归 FE-2b。

**〔待实现〕**：DL-1/DL-3 的拒绝与清除逻辑**尚未实现**（当前为后写者胜）。**在实现落地前，不得声称部长唯一性已强制**；FE-2b 不得只按「最后写入者即唯一部长」呈现数据。

#### 2.4.3 系统助理职责边界（SA-04，2026-09-18）〔约束〕

**定位一句话**：**系统助理是系统级协调入口，不是组织最高决策主体**（防「隐形 CEO」）。

**与总助理的区别**（对齐 `system-assistant-m01-prd-v1.0.md` D-10/C-12）：**系统助理是系统级/平台级**（面向所有用户、平台提供、**不产生任何公司任职**）；**总助理是公司级的**，公司建好后**像员工一样走招募流程产生**。二者**不得混同**——系统助理**不是**某公司的岗位，**不产生** `general_assistant` 任职。

| 类别 | 内容 |
|---|---|
| **允许** | ① **引导招募**（把「建公司 → 招募总助理」的流程以对话+卡片收口）；② **解释状态**（回答「公司到哪一步了」「还缺什么」等**只读**状态问题）；③ **协调流程**（推进引导步骤、在步骤间做衔接与交接说明）；④ **提供建议**（给出可解释的建议，如编组建议——对齐 `organization-full-backend-design-v0.1.md` §1.2「建议不是授权」） |
| **禁止** | ① **自己创建任职**（**任何**任职，含 `general_assistant`/`department_lead`/`team_lead`——任职**只能**经招募/任命的显式写命令产生）；② **修改自身权限**（不得提升/扩大自己的工具与作用域）；③ **绕过审批**（不得跳过部长/总助理的确认环节，也不得代为「确认」）；④ **替员工执行业务工作**（不代写文档、不代做团队工作、不代领任务） |

**为什么写死**〔约束〕：

1. **「隐形 CEO」风险**：系统助理若可创建任职或修改权限，它就在**事实上**成为组织最高决策者——而它**没有**任何组织内的任职依据（它是平台能力，不是公司岗位）。这会让「权限来自任职」的整条链路（§3）失去意义。
2. **与 ORG-02 一致**：招募与任命是**管理员的组织动作**（部长/总助理按作用域执行），系统助理**不在**该链路上——它是**流程的引导者**，不是**流程的执行者**。
3. **与 ORG-05/ORG-08 一致**：禁止「绕过审批」与「代为确认」，正是「提交不是验收」「分配不是加载」在引导层的对应纪律。

**允许/禁止的判据（可操作版）**〔约束〕：**系统助理可以「说」，不可以「做组织动作」**——凡会**产生或变更组织事实**（任职、权限、审批结果、业务产物）的动作，系统助理**只能引导用户或相应任职者去执行**，**不得**代为执行。

**与 §2.4.2 的关系**：§2.4.2 的招募入口是**可信用户入口**——用户（或系统助理**引导**下的用户）经 Host 半边调用命令面。系统助理**引导**该流程属「允许」；系统助理**自行发起**该写命令属「禁止」。

**〔待实现〕**：本节是**职责边界声明**，**不是**已实现的能力隔离——M0.1 尚无系统助理的实现载体（`soloips-web` 引导段属 BE-6/UI 切片）。**在实现落地前，不得声称系统助理的权限边界已被技术强制**；本节的约束是**设计与验收依据**，须在对应切片内逐条核对。

### 2.5 工具名（模型工具面，2026-09-18 登记）

**〔约束〕模型工具名用下划线 `soloips_<域>_<动作>`；`@Remote` 调用面用点号 `ctx.remote.soloips.<method>`。两套命名面刻意不同形，禁止混用。**

依据：**SoloIPs 命名规范**——依据是 DSH MCP 桥接的**名称约束**与**官方工具先例**（见下），不是「DSH 禁止点号」的通用规则。

- DSH MCP 桥接对**它自己产生**的工具名有字符约束：只允许 `[A-Za-z0-9_-]`、≤64 字符；不允许的字符被替换为 `_`，有损时追加 12 位 SHA-256 hash（`packages/mcp/mcp-client/src/tools.ts:48,51,54,81-86` 的 `MAX_PUBLIC_NAME_LENGTH`/`INVALID_NAME_CHARS`/`HASH_LENGTH`/`publicToolName`）。**该约束的适用范围是 MCP 桥接的名称转换，不能外推为「所有注册路径都禁点号」**。
- 官方 Team 工具名**全部为下划线**形态（`spawn_teammate`/`send_message`/`list_agents`/`team_task_create`/`team_task_update` 等，`packages/experimental/tool-agent-team/src/index.ts`）——作为**先例**支持下划线风格。
- `@Remote` 方法名须是 Typert 严格分析下的**具名必填简单标识符**（不得解构/默认值/rest/可选），故用点号 namespace 面。

> **〔未验证〕** 「DSH 工具名**禁止**点号」**未**在源码中找到通用校验；上述区分依据是**官方命名先例 + 各协议层分隔符语义 + MCP 桥接的局部约束**〔推断〕，属**本项目命名规范**，不是已核实的禁用规则。若后端能给出显式校验点，应回填并据此收紧或放宽。

**20 项工具名清单**（源：`docs/prds/organization-full-ui-design-v0.1.md` §9b.2 推导表，**从权威命令面导出**）：

| # | operation kind / 服务方法 | 模型工具名 | `@Remote` 方法 |
|---|---|---|---|
| 1 | `company.create` | `soloips_company_create` | `ctx.remote.soloips.createCompany` |
| 2 | `department.create` | `soloips_department_create` | `ctx.remote.soloips.createDepartment` |
| 3 | `employee.create` | `soloips_employee_create` | `ctx.remote.soloips.createEmployee` |
| 4 | `appointment.create` | `soloips_appointment_create` | `ctx.remote.soloips.createAppointment` |
| 5 | `appointment.revoke` | `soloips_appointment_revoke` | `ctx.remote.soloips.revokeAppointment` |
| 6 | `employee.initialize-memory` | `soloips_employee_initialize_memory` | `ctx.remote.soloips.initializeEmployeeMemory` |
| 7 | `employee.verify-capability` | `soloips_employee_verify_capability` | `ctx.remote.soloips.verifyEmployeeCapability` |
| 8 | `employee.record-assembly` | `soloips_employee_record_assembly` | `ctx.remote.soloips.recordAssemblyEvidence` |
| 9 | `document.save` | `soloips_document_save` | `ctx.remote.soloips.saveEmployeeDocument` |
| 10 | `work-entry.request` | `soloips_work_entry_request` | `ctx.remote.soloips.requestWorkEntry` |
| 11 | `checkOnboarding` | `soloips_employee_check_onboarding` | 不暴露（读面，经既有服务面） |
| 12 | `getCompany` | `soloips_company_get` | 不暴露（读面，经既有服务面） |
| 13 | `getCompanyTree` | `soloips_company_get_tree` | 不暴露（读面，经既有服务面） |
| 14 | `listSubsidiaries` | `soloips_company_list_subsidiaries` | 不暴露（读面，经既有服务面） |
| 15 | `listDepartments` | `soloips_department_list` | 不暴露（读面，经既有服务面） |
| 16 | `getEmployee` | `soloips_employee_get` | 不暴露（读面，经既有服务面） |
| 17 | `getAppointment` | `soloips_appointment_get` | 不暴露（读面，经既有服务面） |
| 18 | `getDocumentVersion` | `soloips_document_version_get` | 不暴露（读面，经既有服务面） |
| 19 | `getOperation` | `soloips_operation_get` | 不暴露（读面，经既有服务面） |
| 20 | `listPendingOperations` | `soloips_operation_list_pending` | 不暴露（读面，经既有服务面） |

**〔待实现〕** 本清单是**目标形状**，无任何一项已注册实现（§0：Host 半边与工具注册属 BE-6，未实现）。

**两条边界**〔约束〕：

1. `close()` **不暴露**为工具或 Remote（会把 domain 生命周期交给浏览器）。
2. **写读分开要求**：
   - **每个「写」工具必须对应一个已登记的命令 `kind` 和服务方法**；无 `kind` 的动作不得暴露为写工具。`SoloipsOperationKind` 当前**无 `team.*` 项**，故编组/团队类写工具名（如 `soloips_team_update_function`）**待 BE-3 新增 kind 后才成立**——在此之前不得定稿，属〔待决〕。**BE-001 后新增的 `team.activate` 同样须先登记 kind 才可暴露工具名**（三步协议见 §2.1.1 P-9）。
   - **每个「读」工具必须对应一个已登记的查询服务**；**查询不要求创建 `operation`**（读路径不写台账，见 §2.5 表内读面各行）。

**`@Remote` 列的「—」含义**〔约束〕：**不因本表而暴露**（该查询经**Host 进程内**的既有服务面消费）。上表第 11–20 行的读面因此只有模型工具名、没有 Remote 方法——**不是**「待补」。但**浏览器不可直接到达 Host 进程内服务**，故当界面需要读回时，其 Remote 暴露由 **§2.5.1 调用暴露矩阵**决定（**不是**「永久不暴露」，2026-09-18 收口）。

**不拆分 `tool-registry.md`（2026-09-18 登记：提案未采纳）**〔约束〕：

> **提案**：把本节的工具清单拆出为独立文档 `tool-registry.md`。
> **裁定：不拆。** 理由：§2.5 的**单一权威刚刚建立**（此前 16 行版与 20 项版并存的**双清单**问题刚由本次收敛消除，见 `system-assistant-backend-design-v0.1.md` §4.1 BE-6 小节）；拆分会让工具名清单**再次**出现第二来源，与 `doc-format.md` §6「单一权威 / 投影不复制」相悖。清单的**引用点**已由外部文档指向本节，拆分需同步改动全部引用方，收益不足。
> **复议触发条件**：**工具数 > 40 时再议**。届时若清单长度确实影响本节可读性，可在**保持单一权威**的前提下拆分（拆分后须有一处为权威、其余为投影引用）。

**`contract-doc-sync-check` CI（提案未采纳）**〔待决〕：审查曾提议新增 CI，自动核对文档中的模型/字段/工具名与 `packages/core/src/contracts.ts` 是否同步。**本轮不实施**，登记为 **P3 切片候选 BE-8**——**权威登记与理由见 §6.2**（本节不重复）。**M0.1 的替代纪律**：凡改 §0 已实现行，必须对照 `packages/core/src/contracts.ts` 核验（见 §0 开头注）。

#### 2.5.1 调用暴露矩阵（2026-09-18 冻结；BE-6a 前置）〔约束〕

**问题**（#35 §3.2「调用暴露边界」）：§2.5 登记了 20 项**模型工具名**，覆盖全部写命令；而 §2.4.3（SA-04）规定系统助理**不得代为执行组织动作**。两者相加会被读成「模型可调 `soloips_company_create` 建公司」——与 SA-04 冲突，也与 M-A「**用户**经可信入口创建公司」的表述冲突。本节消除该冲突，作为 BE-6a 的派发前置。

**裁定一：以「谁是行为主体」分面，不以「工具名是否登记」分面。**

§2.5 的表登记的是**工具名的命名面**（名称、形态约束、与 kind 的一一对应），**不构成「该工具应注册给任何 agent」的授权**。是否注册、注册给谁，由本节决定。**core 存在某个命令 ≠ 模型应当拥有该工具。**

**裁定二：组织写动作走「用户确认的可信 Remote」，不注册为模型工具。**

| 动作（core 命令） | 用户 Remote（浏览器） | 模型工具面 | 身份来源 | 拒绝方式 |
|---|---|---|---|---|
| `createCompany` | **✓（用户显式确认后触发）** | **✗ 不注册** | Host 会话 + 部署注入 `accountId` | 模型面：工具不存在；Remote：服务未就绪/范围不符各有稳定码 |
| `createDepartment` | **✓（用户确认）** | **✗ 不注册** | 同上 | 同上 |
| `createEmployee` | **✓（用户确认）** | **✗ 不注册** | 同上 | 同上 |
| `createAppointment`（首任总助理/部长/组长） | **✓（用户确认）** | **✗ 不注册**（SA-04 明禁「自己创建任职」） | 同上 | 同上 |
| `revokeAppointment` | **✓（用户确认）** | **✗ 不注册** | 同上 | 同上 |
| `saveEmployeeDocument` | **✓（用户经员工配置页，代表员工）** | **✗ 不注册**（SA-04 禁「代写文档」） | 同上 | 同上 |
| team 四命令（`createTeam`/`updateTeamFunction`/`activateTeam`/`closeTeam`） | **✓（用户确认）** | **✗ 不注册** | 同上 | 同上 |
| `requestWorkEntry` | **✗**（不是浏览器面：属员工自身准入前门） | **✗** | 需 agent 上下文（DSH agents 端口强制） | 无 agent 凭证即 fail-closed（`ports/tools.ts`） |
| `initializeEmployeeMemory` / `verifyEmployeeCapability` / `recordAssemblyEvidence` | **✗ fail-closed** | **✗ fail-closed** | 需可信流程（`ExecutionBinding` 未实现） | 入口不存在即拒；**不得**为开发方便开启，**不得**接受模型自报 |
| `reconcileTeams` | **✗**（恢复辅助，非用户面） | **✗** | Host 内部运维入口 | 不注册 |
| `close()` / 底层存储句柄 | **✗** | **✗** | — | §2.5 边界 1 |
| 只读投影（`getCompany`/`listSubsidiaries`/`getCompanyTree`/`listDepartments`/`getTeam`/`listTeams`/`getEmployee`/`getAppointment`/`getDocumentVersion`/`getOperation`/`listPendingOperations` + BE-4a 五项） | **✓ 最小必要集**（见裁定三） | **✓**（§2.5 已登记；只读零业务写） | Host 会话 | 服务未就绪 → 「未就绪」态，**不伪装空数据** |

**裁定三：只读面必须有浏览器可达路径（收口 §2.5 的「—」）。**

§2.5 表第 11–20 行原注「不暴露（经既有服务面消费）」中的「既有服务面」是 **Host 进程内**的 `SoloipsCoreService`，**浏览器无法直接到达**。若界面需要读回（M-A 明确需要），就必须有 Remote 方法。**裁定**：

- 读面按**最小必要**新增 `@Remote` 只读方法（M-A 集：公司状态与树、部门列表、团队列表；后续切片按界面需要扩）。
- §2.5 表「`@Remote` 列 = —」的含义同步更正为：**该查询不因 `toolview` 卡片需要而自动暴露**，其 Remote 暴露由本矩阵与对应切片决定；**不是**「永久不暴露」。
- 只读 Remote **不产生 `operation`**（§2.5 两条边界 2 后半）。

**裁定四：身份与拒绝的分层（防止「靠 prompt 约定代替入口拒绝」）。**

| 层 | 规则 |
|---|---|
| accountId | **不由任何 UI 或模型参数传入/覆盖**——来自部署注入 + 根级绑定元数据（§3.1） |
| actor（`actorAppointmentId`） | 属**半可信输入**（§3.1 SA-02）：可作审计线索，**不可作授权唯一依据** |
| 模型工具调用 | 强制要求 agent 上下文；无 agent 凭证即 fail-closed（**不能**靠菜单隐藏或 prompt 约定替代） |
| 用户引导 Remote | **不得**误要求 agent 上下文——否则冷启动死锁（M-A 的用户确认路径必须可用） |
| 未注册的工具 | 模型侧表现为**工具不存在**（不是「存在但调用被拒」）——这是本矩阵对 SA-04 的**技术强制**手段 |

**裁定五：与既有验收口径的关系。**

`system-assistant-backend-design-v0.1.md` §4.1 BE-6 验收①「模型经对话调用工具创建一条公司并读回」**被本节取代**——M-A 的读法是「**用户**经引导确认 → 可信 Remote → core 提交 → 读回」。该验收条目的功能等价物（创建并读回）保留，行为主体由「模型」更正为「用户」。**不改 BE-6 的其余验收**（②③④⑤继续有效，其中③「无 agent 上下文拒绝」按裁定四的适用范围解释）。

**〔待实现〕**：本矩阵是 BE-6a 的**实现与验收依据**，M0.1 尚无 Host 半边（§0）。**在 BE-6a 落地前，不得声称该边界已被技术强制。**

### 2.6 公司树规则（2026-09-18 codex 终审补录）〔约束〕

`parentCompanyId` 的校验规则必须**完整**，否则会产生不可读回或跨账户的树。逐条如下：

| # | 规则 | 现状（读源确认，2026-09-18） |
|---|---|---|
| T-1 | **父必须存在** | **已实现**：`#readCompany(parentCompanyId)` 不存在则抛 `SOLOIPS_CORE_PRECONDITION` |
| T-2 | **父类型限制**：仅禁 `operation` 作父（`platform`/`enterprise`/`subsidiary` 均可作父） | **已实现** |
| T-3 | **深度上限**：`MAX_TREE_DEPTH = 10` | **已实现** |
| T-4 | **父状态**：`archived` 的父公司**不得**接收新子公司 | **未实现**——现有校验**不看** `parent.status`。须在 BE-5 补：父状态非 `active` 即拒绝 |
| T-5 | **同账户**：父公司 `accountId` 必须等于当前账户 | **未实现**（`accountId` 硬编码 `"seed"`，§3.1 C-2）。由 **BE-1** 关闭 |
| T-6 | **孤儿记录处置** | **须写死**，见下 |

**孤儿记录（父缺失）的处置**〔约束〕——**写死为「不静默容忍」**：

| 情形 | 处置 |
|---|---|
| 读树时遇到父缺失的子公司 | **不加入**结果集，并按数据不一致处理（报错或显式标记），**不得**静默把它当作顶层公司返回 |
| 计数（§4.3）时遇到孤儿 | **照常计入** `subsidiary` 配额（按 `type` 计数**不遍历树**，故天然覆盖孤儿）。理由：孤儿仍是该公司账户持有的子公司，漏计会形成绕过；其读回问题由本表显式登记，而非靠计数宽容掩盖 |
| 修复孤儿 | 须经**显式**操作（补父引用或归档），属独立切片；**不得**在读取路径自动修复 |

**`enterprise` 带 `parentCompanyId` 的处置**〔约束〕——**写死为「拒绝」**：

- `type === 'enterprise'`（顶层用户公司）**不得**携带 `parentCompanyId`。若携带 → **拒绝创建**（`SOLOIPS_CORE_VALIDATION`）。
- 理由：三层语义中 `enterprise` 是用户顶层公司，`subsidiary` 才是带父的子级。允许 `enterprise` 带父会让「顶层公司计数」（§2.1 `companyLimit`）与树结构脱节——一个带父的 `enterprise` 既占 `companyLimit` 又出现在某棵子树里，使 §4.3 的 `type` 计数与组织树读回**对不上**。
- 现状：**未实现**（现有代码不检查该组合）。须在 **BE-5** 补。
- **迁移边界**：若存量数据已存在该组合，须按上表孤儿路径显式修复，**不得**靠读时宽容掩盖。

**〔待实现〕**：T-4 / T-5 / T-6 与 `enterprise` 带父检查均未实现——T-5 由 BE-1 关闭，T-4 与 `enterprise` 检查由 BE-5 关闭，孤儿处置由读面与迁移切片分别处理。

### 2.7 国际化分层（2026-09-18 裁定；后端侧缺口补齐）〔约束〕

**背景**：前端 i18n 已有详尽设计（`system-assistant-ui-design-v0.1.md` §3.4/§7.5），但**后端侧零设计**——本节是契约侧落点，完整设计见 [`docs/design/backend-i18n-design.md`](backend-i18n-design.md)（`SOLO-I18N-01`）。

**核心裁定三条**：

| # | 规则 | 含义 |
|---|---|---|
| **I18N-1** | **core 是语言中立的领域层** | `code` 是契约（`SOLOIPS_CORE_*`，语言无关）；`message` 是**面向开发者与运维的诊断**，**保持单一语言、不做运行时本地化**，且**不得直接上屏** |
| **I18N-2** | **用户可见文本一律由 web 层从机器可判定物映射** | 映射最左列是**稳定 id**（错误码、`reason`、`item` 枚举），**绝不用本地化文本做内部匹配**（底册 C8）。映射表权威落点 = **web 包内的显式表**（`packages/web/src/client/i18n/`），须**完备**（类型强制 + 运行期双向断言） |
| **I18N-3** | **字典是唯一拥有译文的地方** | `zh`/`en` 双字典齐备由类型系统强制；文案资产随插件包发布、**不落业务库**；`common` 命名空间优先复用 |

**一句话**：**core 说「发生了什么（码）」，web 说「怎么告诉用户（文案）」。**

**七类文本的分层归属**（完整表见设计文档 §1）：错误码 / 诊断 `message` / 结构化判据 / 参数化诊断 → **不本地化**（core）；用户可见文案 → **必须本地化**（web）；工具名 → 语言无关标识符；工具描述与模型可见说明 → **单一语言（英文）**，不随界面 locale；文档内容（用户数据）→ 不适用；日志 → 不本地化（可检索性优先）。

**两处既有〔待决〕的关闭**：

| 原〔待决〕 | 裁定 |
|---|---|
| `checkOnboarding` 的 `gaps[].message` 是否本地化（PRD Q12） | **界面不显示 `message`**；按 `item` + `reason`（+ 参数）映射到 `soloips.onboarding.gap.<item>.<reason>`；`message` 保留给日志与「复制诊断」入口。可达组合**必须有键**，缺失即失败 |
| 「错误码须映射为本地化文案」的映射表落点 | **web 包内的显式映射表**（唯一且被测试钉住）；**不在** core（领域层不得耦合界面键名）、**不在**本契约正文（码随领域演进、键随界面迭代，节奏不同） |

**门禁事实更正**〔实测 2026-09-18〕：UI 设计稿 §7 与底册 §5.5 引用的 `pnpm run verify-client-ui-i18n` 存在于 **DSH fork**（`deepseek-harness/scripts/verify-client-ui-i18n.ts`），**本仓 `package.json` 无此脚本**。本仓的门禁接线**登记为待实现**（i18n 实现切片须同时交付，**不得**只写文案不接门禁）。

**〔待实现〕**：本节的映射表、字典、门禁均未实现（§0：web 半边尚无 i18n 资产）。**在实现与验证落地前，不得声称「界面已支持 i18n」或「零硬编码文案已强制」。**

---

## 3. 权限校验链路

### 3.1 授权上下文（可信来源）

```typescript
/**
 * 授权上下文
 * 所有业务操作必须从可信上下文获取，不接受外部传入的 accountId
 */
export interface SoloipsAuthContext {
  readonly accountId: string;                // 来自 DSH Session，可信
  readonly executionBinding?: SoloipsExecutionBindingRecord;
  readonly sessionId: string;
}
```

**★ SA-02：Host 层 actor 属「半可信」输入（2026-09-18 声明）**〔约束〕

**Host 层传入的 actor / `actorAppointmentId` 是「非可信输入」**——它是**部署面自证**，**不得**与 ORG-05 的**可信身份链**混同。逐条写死：

| # | 要求 |
|---|---|
| SA-02.1 | **定性**：Host 传入的 actor 标识（含 `actorAppointmentId` 及等效字段）**属非可信输入**——core **不**因「它来自 Host」就把它当作已认证身份。理由：S0/M0.1 无认证（§3.1 过渡例外），Host 与模型同处一个信任域内的部署进程，**「Host 传的」不等于「已验证的」** |
| SA-02.2 | **「半可信」的确切边界**——**可作审计线索，不可作授权唯一依据**：<br>① **可**用于：审计留痕（谁声称执行了该动作）、错误信息归属、operation 台账的 `actorId` 记录；<br>② **不可**用于：作为**授权判定的唯一依据**——不得仅凭 Host 传入的 `actorAppointmentId` 就放行需要任职的敏感操作（该情形须另有可核对的事实，如数据根账户绑定、提交门内的记录比对） |
| SA-02.3 | **禁止混同 ORG-05 可信身份链**：`ExecutionBinding` **未落地**前，**不得**把 Host 传入的 actor 表述为「已核实的执行者」、**不得**称其为 ORG-05 的可信身份链（ORG-05 要求 `Session → Host Binding → Employee` 的可验证链路，当前**不存在**）。文档、验收、界面文案均不得使用「已认证」「已确认身份」等表述 |
| SA-02.4 | **与 A-4 的关系**：本声明是 §3.2 **A-4「禁止自证授权」**的**上位表述**——A-4 约束「不接受模型文本」，本声明进一步明确「**即使来自 Host 也只是半可信**」。两条**同时生效**，A-4 不因本条而放宽 |
| SA-02.5 | **失效条件**：本声明在 **`ExecutionBinding` 落地并验收后**重新评估——届时若链路可验证，actor 可信度须由该切片的验收结论重新定义，**不得**沿用本条的「半可信」定性，也**不得**在验收前提前升级为可信 |

**反面声明**：本声明**不蕴含**「Host 不可信到不可用」——Host 仍是**部署层受控组件**（§3.1 信任依据：部署配置控制权 + Host 内部调用边界）；本条只**拒绝**把它的输出**升格**为已认证身份，并**明确其证据分层位置**（审计线索层，非授权唯一依据层）。

**〔约束〕S0 过渡例外：accountId 的临时绑定（2026-09-17 用户批准）**

契约目标仍是「accountId 来自 DSH Session」。但 S0 尚未接入认证（P1 Auth 属后期里程碑），
adapter 的 session 端口只有会话持久化、没有账户身份面，core 也没有任何可信账户来源。
因此本阶段采用以下**受限临时决定**，并在 S0 验收中**不得**声称已满足多租户隔离：

| 项 | S0 临时做法 | P1 Auth 的目标做法 |
|---|---|---|
| 来源 | 部署层经插件 config 注入（`accountId` 字段），Host 打开 store 时绑定 | DSH Session → 账户映射 |
| 信任依据 | **部署配置的控制权 + Host 内部调用边界**，不是字符串校验 | 宿主签发的会话身份 |
| 基数 | 一个业务存储根**只绑定一个账户**；数据根内出现其他账户的公司记录即拒绝打开（错误码 `SOLOIPS_CORE_ACCOUNT_MISMATCH`——**已实现，BE-1 交付**，见下方注） | 多账户共享数据面时按账户隔离 |
| 命令面 | 业务命令、UI、模型**不得**逐次传入或覆盖 accountId | 每命令携带由 Session 派生的 `SoloipsAuthContext` |

**〔已实现〕C-2：本节的 account-binding 机制**（2026-09-18 更正 → 2026-09-18 BE-1 交付后更新）

> **BE-1 已交付，本节的「S0 临时做法」列即当前实现事实**〔实测〕：`SoloipsCoreErrorCode` 含
> `SOLOIPS_CORE_ACCOUNT_MISMATCH`；`SoloipsCoreConfig` 含 `accountId?`（缺省/空白/占位 `"seed"` 一律不发布服务，fail-closed）；根级绑定元数据
> `SoloipsRootBindingRecord` 已落（`contracts.ts:531`），打开时按「绑定元数据 → 根内公司记录 → 占位账户」三条判据校验（`store.ts:272-340`）；
> `createCompany` 写入部署注入的真实 `accountId`，不再硬编码 `"seed"`；存量 `"seed"` 记录的处置路径按本节下方三选一（默认 (a) 拒绝）
> 实现于 `placeholderResetGuidance`。**来源 + 日期 + 边界**：读源确认 `packages/core/src/index.ts:77-96`、`contracts.ts:531`、`store.ts:203-340`（2026-09-18 核对）。
>
> 换绑重放的判据字段落点（本节下方「〔待决〕」）以 BE-1 实际实现为准（对照源码核验后再引用）。交付验收证据见 PR #28。

- 平台公司（`platform`）/ 运营子公司（`operation`）的官方账户初始化**不在 S0 范围**，且不自动归属部署账户。
- 存量占位数据（旧 `"seed"` 账户写下的记录）**不认领、不自动改归**部署账户；换绑后旧操作不得重放。

**数据根绑定的持久事实（2026-09-18 裁定：根级绑定元数据）**〔约束〕：

账户绑定**不是**「读时比对」，而是一个**持久事实**——否则无法回答「这个根换绑过吗」「旧操作能否重放」。

| 项 | 要求 |
|---|---|
| 载体 | **根级绑定元数据**（存储根内的绑定记录，记 `accountId` 与其绑定代际/时间）。**不采用**「只做读时比对」或「把绑定塞进某条公司记录」的等效弱方案 |
| 理由 | 绑定必须可**独立读取且先于业务读**：打开时先读绑定元数据再校验根内公司记录；绑定本身也必须可审计（何时绑到哪个账户） |
| 与 §4.3 计数的关系 | 计数按 `accountId + type` 过滤，其 `accountId` 即取自该绑定元数据——绑定未落地则计数口径无据（BE-1 依赖） |

**换绑后的重放校验规则**〔约束〕：

| 情形 | 规则 |
|---|---|
| 换绑后重放**换绑前**的 `operationId` | **拒绝**。绑定代际不匹配即视为**跨代操作**，返回可判定的拒绝；**不得**把旧操作的意图作用于新账户的根 |
| 换绑后重放**换绑后**的 `operationId` | 按 §4.1 常规语义（`replayed` 返回原结果） |
| 判据的字段落点 | **属 BE-1 实现裁定**〔待决〕：可给 operation 加绑定代际字段，或在打开时按代际过滤未决操作——两者须**择一并在 BE-1 内写死** |

**`seed` 数据根的处置路径（BE-1 验收项）**〔约束〕——三条里**必须选定一条**，不得含糊：

| 路径 | 内容 | 适用 |
|---|---|---|
| **(a) 拒绝** | 打开时检测到根内存在 `accountId="seed"` 的记录 → **拒绝打开**（`SOLOIPS_CORE_ACCOUNT_MISMATCH` 类），要求人工处置 | 默认最安全；S0 若不必保留旧数据，选此 |
| **(b) 迁移** | 在**独立切片**内、经显式声明的迁移脚本把 `seed` 记录改归目标账户，并留痕 | 需要保留旧数据时；须显式声明「开发数据根重置或迁移」 |
| **(c) 隔离** | 把含 `seed` 数据的根**整体隔离**（不纳入新绑定），新根从空开始 | 旧数据仅供取证、不参与业务时 |

**共同底线**：**不得**把 `seed` 记录**静默认领**为部署账户的数据（本节的「不认领、不自动改归」）。BE-1 须在验收中明确选了哪一条并验证。

```typescript
/**
 * 权限校验结果
 */
export type SoloipsPermissionResult =
  | { readonly allowed: true; readonly context: SoloipsAuthContext }
  | { readonly allowed: false; readonly reason: string };
```

### 3.2 权限校验（示例已降级）

> **⚠️〔约束〕下列代码是「修复 Promise `||` 反模式」的示意，<u>不可作为实现模板</u>**（2026-09-18 codex 终审裁定）。
>
> 它自身存在若干**演示性缺陷**（下节逐条列出），且依赖尚未落地的 `scope`/`role`/`ExecutionBinding`。**不得**把它当作 BE-6 的 API 依据或验收标准。M0.1 的实际授权规则见本节末「M0.1 实际授权规则」。

```typescript
/**
 * 权限服务
 * 所有权限校验必须通过此服务
 */
export class SoloipsPermissionService {
  constructor(
    private readonly domain: StorageDomain,
    private readonly entitlements: EntitlementResolver,
  ) {}

  /**
   * 校验用户是否有权访问指定公司
   */
  async checkCompanyAccess(
    ctx: SoloipsAuthContext,
    companyId: SoloipsCompanyId,
  ): Promise<SoloipsPermissionResult> {
    // 1. 获取公司记录
    const company = await this.domain.table('company').get(companyId);
    if (!company) {
      return { allowed: false, reason: 'company_not_found' };
    }

    // 2. 校验公司归属账户
    if (company.accountId !== ctx.accountId) {
      // 记录审计
      await this.audit({
        companyId,
        actorId: ctx.accountId,
        action: 'access_denied',
        resourceType: 'company',
        resourceId: companyId,
        outcome: 'rejected',
      });
      return { allowed: false, reason: 'account_mismatch' };
    }

    return { allowed: true, context: ctx };
  }

  /**
   * 校验用户是否有权执行指定操作
   */
  async checkPermission(
    ctx: SoloipsAuthContext,
    action: SoloipsAction,
    resource: { type: string; id: string; companyId: SoloipsCompanyId },
    companyType?: SoloipsCompanyType,
  ): Promise<SoloipsPermissionResult> {
    // 1. 创建公司时目标公司尚不存在：不做归属校验，只校验配额。
    if (action === 'company:create') {
      return this.checkQuota(ctx, companyType ?? 'enterprise');
    }

    // 2. 其余操作先校验公司归属
    const companyAccess = await this.checkCompanyAccess(ctx, resource.companyId);
    if (!companyAccess.allowed) {
      return companyAccess;
    }

    // 3. 校验具体操作权限
    switch (action) {
      case 'department:create':
      case 'department:update':
        // 需要部门级或更高级任职
        return this.checkAppointmentWithRole(ctx, resource.companyId, [
          'owner', 'department_lead', 'general_assistant',
        ]);

      case 'team:create':
        // 需要团队级或更高级任职
        return this.checkAppointmentWithRole(ctx, resource.companyId, [
          'owner', 'department_lead', 'team_lead', 'general_assistant',
        ]);

      default:
        return { allowed: false, reason: 'unknown_action' };
    }
  }

  /**
   * 校验任职是否存在且有效（修复：使用 await 而不是 ||）
   */
  private async checkAppointmentWithRole(
    ctx: SoloipsAuthContext,
    companyId: SoloipsCompanyId,
    allowedRoles: SoloipsAppointmentRole[],
  ): Promise<SoloipsPermissionResult> {
    // 查询当前有效的任职
    const appointments = await this.domain.table('appointment').scan({
      filter: {
        employeeId: ctx.executionBinding?.employeeId,
        status: 'active',
      },
    });

    // 找到匹配公司的任职（三种作用域都携带 companyId；不能只认公司级任职，
    // 否则部门级/团队级任职永远无法通过校验）
    const validAppointment = appointments.find((apt) => {
      return apt.scope.companyId === companyId && allowedRoles.includes(apt.role);
    });

    if (!validAppointment) {
      return { allowed: false, reason: 'insufficient_permission' };
    }

    // 校验任职代际（防止已撤销的任职继续使用）
    if (ctx.executionBinding && 
        validAppointment.generation !== ctx.executionBinding.appointmentGeneration) {
      return { allowed: false, reason: 'appointment_stale' };
    }

    return { allowed: true, context: ctx };
  }

  /**
   * 校验配额（只读预检；真正的原子扣减见 §4）
   *
   * 三层配额：enterprise 计 companyLimit，subsidiary 计 subsidiaryLimit；
   * platform / operation（官方公司）不占用户配额。
   */
  private async checkQuota(
    ctx: SoloipsAuthContext,
    type: SoloipsCompanyType,
  ): Promise<SoloipsPermissionResult> {
    // 官方公司不受用户配额限制
    if (type === 'platform' || type === 'operation') {
      return { allowed: true, context: ctx };
    }

    // 获取权益快照
    const snapshot = await this.entitlements.resolve(ctx.accountId);

    // 统计当前账户下同类型公司数
    const companies = await this.domain.table('company').scan({
      filter: { accountId: ctx.accountId, type, status: 'active' },
    });

    const currentCount = companies.length;
    const limit = type === 'subsidiary' ? snapshot.subsidiaryLimit : snapshot.companyLimit;

    if (limit !== -1 && currentCount >= limit) {
      return {
        allowed: false,
        reason: `${type}_limit_exceeded: current=${currentCount}, limit=${limit}`,
      };
    }

    return { allowed: true, context: ctx };
  }
}
```

#### 上例的已登记缺陷〔约束〕

以下 7 条是 codex 终审指出的示例自身缺陷。**登记为缺陷而非修正**——该示例已降级为示意，不在此重写；实现时须逐条处理：

| # | 缺陷 | 说明 |
|---|---|---|
| D-1 | **未分支处理 `scope` 可选** | 示例直接读 `apt.scope.companyId`，而 `scope` 按 §2.3 是**可选**字段——存量记录缺 `scope` 时此处会**抛错**（读 `undefined.companyId`）。实现须按 §2.3 的**严格三分支**（有 `scope` 用之 / 无 `scope` 有 `departmentId` 归 department / 否则报错）先分支，**不得**依赖任何时序推断 |
| D-2 | **`executionBinding` 缺失未提前分支** | 示例在 `checkAppointmentWithRole` 里用 `ctx.executionBinding?.employeeId` 作为 filter——`executionBinding` 为 `undefined` 时该 filter 退化为「不按员工过滤」，**扫到任何员工的任职**。须在入口处**先判定 `executionBinding` 是否存在**，缺失即拒绝 |
| D-3 | **未核对绑定的确切 `appointmentId`** | 示例用「扫出任一角色匹配的 active 任职」代替「**这次执行所绑定的那条**任职」。正确做法：以 `executionBinding.appointmentId` 精确定位，再校验该条的角色与作用域——否则同一员工在多部门的任职可互相冒充 |
| D-4 | **代际相等 ≠ 同一任职** | 示例只比 `generation`。两条**不同**任职可能有相同代际值，故代际相等**不能**证明是绑定的那条。须与 D-3 合用，以 `appointmentId` 为主键、`generation` 只作失效校验 |
| D-5 | **资源作用域未限定** | 示例对 `department:create`/`team:create` 只校验「公司内有该角色」，**未校验目标资源在该角色作用域内**。部门负责人**只能在本部门**操作（ORG-02）——须比对 `scope.kind='department'` 的 `departmentId` 与目标部门 |
| D-6 | **未显式拒绝官方公司类型** | 示例的 `checkQuota` 对 `platform`/`operation` 直接放行（「不占配额」），但放行**不等于允许普通入口创建**。S0 普通入口须**显式拒绝** `platform`/`operation` 类型（官方公司初始化不属 S0，见 §3.1） |
| D-7 | **`SoloipsPermissionService` 整体未实现** | 该服务依赖 `AuthContext`/`ExecutionBinding`/`Entitlement`，三者**均未实现**（§0）。因此本示例描述的是**目标形态**，不可作为 M0.1 的实现或验收依据 |

#### M0.1 实际授权规则〔约束〕

**M0.1 不建 `SoloipsPermissionService`**（见 D-7）。实际执行的授权规则如下——它们是**提交门内的数据比对**，不是独立权限服务：

| 规则 | 内容 | 依据 |
|---|---|---|
| A-1 | **账户归属**：数据根只绑定一个账户；写入时业务命令**不接受**外部传入的 accountId（由 Host 注入） | §3.1；BE-1 |
| A-2 | **公司归属**：目标资源的 `companyId` 所属公司，其 `accountId` 必须等于注入账户 | §3.1 |
| A-3 | **官方公司拒绝**：普通入口**显式拒绝** `platform`/`operation` 类型的创建（D-6） | §3.1 |
| A-4 | **禁止自证授权**：`actorAppointmentId`（如引入）由 Host 从真实执行上下文填入，**不接受模型文本**；且**不得**称其为 ORG-05 的可信身份链——`ExecutionBinding` 未落地前只是**部署面自证** | `system-assistant-backend-design-v0.1.md` §2.1 |
| A-5 | **配额**：`createCompany` 在提交门内按 `accountId + type` 计数（不建表、不用乐观锁） | §4.3 |
| A-6 | **树约束**：父公司存在、同账户、非 `operation`、深度 ≤ `MAX_TREE_DEPTH` | §2.6 |

**这些规则不蕴含**：不构成多租户隔离证据（A-4 的自证边界）；不覆盖跨公司/跨部门越权的全部情形——`scope`/`role` 落地前，**角色级授权不在 M0.1 范围**，涉及角色的操作须按 A-4 自证并如实标注限制。

**〔待实现〕**：A-1/A-2/A-3 依赖 BE-1（账户绑定）；A-6 的「同账户」与「非 operation」在现有代码中**部分未实现**（§2.6 已逐条标注）。

### 3.3 权限判定优先级（M0.2 权限服务约束）〔约束〕

**判定顺序写死为：`explicit deny` > `allow` > `inherited default`。** 三条语义如下：

| 层 | 语义 | 作用 |
|---|---|---|
| **`explicit deny`** | **显式拒绝**：某条规则明确拒绝该主体对该资源执行该动作 | **最高优先级**——**任何** `allow` 或继承默认**不得**覆盖它。命中即拒绝，不再向下求值 |
| **`allow`** | **显式允许**：某条规则明确允许 | 仅在**无** `explicit deny` 时生效 |
| **`inherited default`** | **继承默认**：由上级作用域（公司 → 部门 → 团队）或角色默认推导出的许可 | **最低优先级**——可被同层或下层的 `allow` 收紧/放宽，**更**被 `explicit deny` 一票否决 |

**为什么写死**：若允许「`allow` 覆盖 `explicit deny`」，则**任何**一条宽松规则都能让禁止失效——这使「拒绝」不构成安全边界，且在撤职/换任后无法保证失效生效（与 §2.1.1 P-6「撤职即不可用」、ORG-05 的可信身份链方向相反）。**失败方向必须是拒绝**（fail-closed）。

**适用范围**：M0.1 **不建** `SoloipsPermissionService`（D-7），故本节**不是** M0.1 的实现要求；它约束 **M0.2 权限服务**的判定实现——届时 `SoloipsPermissionResult`（§3.1）的求值须逐字遵守本节顺序。

**与 §3.2 示例的关系**：§3.2 的示例**未**表达本节语义（它没有 deny 层，默认分支直接 `unknown_action` 拒绝）——这正是它已降级为「不可作为实现模板」的原因之一（见 D-1…D-7）。本节**不**通过改写该示例落地。

**〔待实现〕**：`explicit deny` 的**载体形态**（独立 deny 规则表 / 角色内嵌 deny 列表 / 资源属性策略）**尚未裁定**〔待决〕，属 M0.2 设计；本节只写死**优先级语义**，不预设载体。在载体裁定前，**不得**声称权限优先级已实现。

### 3.4 员工自主循环的能力闸门（SA-03）〔待实现 M0.2+；**原则 M0.1 生效**〕

**员工自主 ≠ 无限自主。** 员工的自主循环是**受闸门的循环**，不是「随意调用工具」：

```
Observe → Plan → Request capability → Execute → Record evidence → Reflect → Continue
                        ↑
                   ★ 能力闸门（本节的约束点）
```

**循环的七个阶段**（顺序是纪律，不是建议）：

| # | 阶段 | 语义 | 关键约束 |
|---|---|---|---|
| 1 | **Observe** | 读取可用事实（团队/任务/自身状态） | 只读；**不得**在观察阶段产生写副作用 |
| 2 | **Plan** | 形成计划 | 计划**不是授权**——计划本身不产生任何执行许可 |
| 3 | **Request capability** | **申请所需工具/能力** | ★ **闸门所在**：未经本阶段放行，**不得**进入 Execute |
| 4 | **Execute** | 执行（调用工具/能力） | 仅限**已放行**的能力；**不得**超出授权范围 |
| 5 | **Record evidence** | 记录执行证据（装配/操作台账） | 对齐 §2.1.3（NormAck）与 §2.1（AssemblyEvidence）；**不记录 ≠ 未发生**，但**无证据不得声称已执行** |
| 6 | **Reflect** | 反思与调整 | **不得**以「反思」为由回写或改写历史证据 |
| 7 | **Continue** | 继续循环 | 继续**不豁免**第 3 阶段的闸门——**每一轮**都须重新申请 |

**★ 四层检查（能力闸门的内容）**〔约束〕——工具/能力调用**必须**逐层通过，**任一层不通过即拒绝**：

| 层 | 检查 | 不通过的处置 |
|---|---|---|
| **L1 身份** | 执行者身份是否可信/可追溯（当前受 SA-02「半可信」边界约束） | 拒绝；**不得**因「Host 传入」而放行 |
| **L2 任职** | 该员工是否有**有效任职**（`status='active'`，代际匹配——对齐 §2.1.1 P-4 的四项语义） | 拒绝；撤职后**立即失效**（P-6） |
| **L3 工具授权** | 该工具/能力是否**已分配给**该员工所在团队（`SoloipsTeamSkillAssignmentRecord` / MCP intent，见 §2.1） | 拒绝；**分配 ≠ 加载**（ORG-08），未分配即不可用 |
| **L4 scope** | 目标资源是否在**该任职的作用域内**（§2.3 的 `scope`：公司/部门/团队） | 拒绝；部门负责人**只能在本部门**操作（ORG-02，对齐 D-5） |

**四层是「与」关系**：**全部**通过才放行；**任何**一层不通过即拒绝，**不得**用「其他层已通过」补偿。

**反例明示禁止**〔约束〕：**「直接调用所有工具」是明确禁止的反例**——具体形态包括：

| 反例 | 为什么禁止 |
|---|---|
| 员工**跳过 Request capability** 直接调用工具 | 绕过闸门（第 3 阶段形同虚设）；「模型能调用」≠「被授权调用」 |
| 员工**自声明**能力可用/已加载 | 违反 ORG-08「分配 ≠ 实际加载 ≠ 有效使用」；生效确认**只能由可信接入流程**写入（§2.1.2） |
| 以「已分配」为由**跳过 L2 任职检查** | 分配是团队级意图，任职是执行者合法性；**撤职后分配仍在**，跳过 L2 会让撤职失效 |
| 以「同一团队」为由**跳过 L4 scope 检查** | 团队级任职的作用域**不含**其他部门/公司的资源（ORG-02） |
| 员工**自主扩大**自己的工具集合 | 工具集合的变更**是组织动作**（部长/总助理的分配），不是员工的自主行为 |

**与 ORG-05 的关系**〔约束〕：本闸门**不替代** ORG-05 的「未知即阻塞」——能力请求返回 `unknown` 时，须**停止并核对**，**不得**换 `operationId` 重试（对齐 §2.4.2「结果未知」行）。

**与「员工自主驱动」的关系**：本闸门**不削弱**「员工自主驱动」的平台方向——自主指的是**在授权范围内自主决策与行动**，**不是**绕过组织授权。闸门保护的是**授权边界**，不是限制主动性。

**适用范围**〔约束〕：

- **原则自 M0.1 生效**：M0.1 虽无完整循环实现，但**「不得直接调用所有工具」「不得自声明能力」**两条**立即**成立——它们不依赖任何未实现的服务；
- **完整四层检查**属 **M0.2+**（依赖 §3.3 的权限服务与 `scope`/`role` 落地，见 §0）；
- **〔待实现〕**：L1–L4 的**实现载体**（是走 §3.3 的 `explicit deny` 规则、还是在工具注册层做过滤）**尚未裁定**〔待决〕——本节只写死**检查顺序与不可跳过性**，不预设载体。在载体裁定前，**不得**声称能力闸门已实现。

---

## 4. 原子配额操作

### 4.1 问题描述

**原问题**：先 `canCreate()` 检查，后 `gate.commit()` 创建，并发时可能超限。

**解决方案**：把「配额预检 → 原子递增 → 创建公司」收在**同一个提交门**内串行执行，任一失败即回滚配额。

**〔约束〕不虚构跨表事务**：DSH storage 的多条写**不构成**跨表事务（CE-G / DEV-08）。
因此一致性由三件事共同保证，而不是靠一个数据库事务：

1. **进程内串行**：同一 store 实例的提交门串行化（`commit-gate` 的请求链）。
2. **跨进程互斥**：由 storage 的 writer lease 承担；每次持久发布前重新 `assertHeld`。
3. **崩溃恢复**：崩溃在「递增成功、公司未落」之间时，按未决 operationId 核对并回滚配额；
   不按文件年龄擅自清锁，也不把未决操作当作成功。

> **与 §4.3 的分工**：本节描述**通用原则**（三件事共同保证一致性）与**原问题**（预检与创建分离导致超限）。
> M0.1 的落地形态见 §4.3（扫表计数，**不建计数器表**，故「递增/回滚」在 M0.1 不适用）；
> M0.2 的计数器形态其**具体恢复协议尚未裁定**（§4.3「部分成功与版本归属」Q-1…Q-3）——
> 本节第 3 条的「回滚配额」**依赖**该裁定，不得径直实现。

### 4.2 实现〔待实现，M0.2 形态〕

> **〔待实现〕C-7（2026-09-18）**：本节描述 **M0.2 的目标形态**（`quota` 计数器表 + `quotaVersion` 乐观锁），**不是 M0.1 的实现要求**。M0.1 的配额口径见 §4.3，两者不得混引。
>
> 由此同时消除 §2 与 §4.2 的类型一致性缺口：`SoloipsQuotaCounter` 是**持久记录**形态，属 M0.2 新增表；§2 的类型清单**有意不含**它——§2 的 `SoloipsEntitlementRecord` 是账户权益，本节的 `quota` 表是**按 `accountId+resourceType` 的计数器**，两者职责不同。M0.2 落地时须把 `SoloipsQuotaCounter` 的持久形态登记进 §2（P2 遗留项，见 §0 C-7）。

**〔待设计伪代码·占位〕** 原示例已删除（2026-09-18 codex 终审）——它含**一致性错误**：公司 `put` 成功后若 catch 中递减配额，**公司记录仍在**（不会消失），导致「配额说没占、事实说占了」的偏差；且未处理 `quotaVersion` 的**版本归属**与重放语义。

**删除的不是「实现要求」，而是「错误的实现示意」。** M0.2 形态的目标仍然存在（计数器表 + 乐观锁），但其**正确伪代码须在上述「部分成功与版本归属」（§4.3 Q-1…Q-3）裁定后补写**。

届时伪代码至少须回答：

| 待答 | 说明 |
|---|---|
| 提交点 | 计数器递增与公司 `put` 的**顺序**，以及各自失败时的可见状态 |
| 回滚语义 | 「公司已落、后续失败」与「计数器已增、公司未落」分别怎么处理——**不能**用一个 catch 笼统递减 |
| 版本归属 | `quotaVersion` 由谁递增、何时递增；重放（`replayed`）时是否递增 |
| 幂等键 | 恢复动作的幂等键，避免重复回滚 |

> **阅读提示**：本小节**有意不含可复制的实现代码**。若需要配额实现依据，M0.1 见 §4.3；M0.2 待上述待决项裁定。

### 4.3 M0.1 的配额形态（提交门计数，不建表）

**〔约束〕C-1/C-7 的 M0.1 落实口径（2026-09-18 裁定）**：

| 项 | M0.1 | M0.2 |
|---|---|---|
| 策略值来源 | 部署配置注入 `planCode`（缺省 `free`），三层配额表**内联为常量** | `SoloipsEntitlementRecord` + `EntitlementResolver` |
| 计数载体 | **不建表**——按 `accountId + type` 扫描既有 `company` 记录 | `quota` 计数器表 + `quotaVersion` |
| 并发保护 | 提交门内串行 + 跨进程 writer lease | 乐观锁（`quotaVersion` CAS） |
| 校验点 | `createCompany` 的**提交门 `mutate` 回调内、`put("company", ...)` 之前**复查 | 同位置 + 原子递增/回滚 |

**一致性依据**（对齐 §4.1 的三件事，**不是**数据库事务）：因为「计数 → 写入」都在**同一 `mutate` 回调**内、且在门持有的串行槽位上，计数与插入之间**没有其他本地提交**可插入；跨进程由租约排除。

#### 计数方案成立的 6 个条件〔约束〕（2026-09-18 codex 终审补录）

写入该方案前须**逐条**满足；任一不满足即**方案不成立**，不得声称配额已生效：

| # | 条件 | 具体要求 |
|---|---|---|
| K-1 | **互斥边界全覆盖** | 「计数 + 写入」必须完全落在**提交门的同一串行槽位**内。**不得**存在另一条绕过提交门的 `company` 写路径（如直接 `put`/`update`/迁移脚本批量插入），否则边界有洞 |
| K-2 | **锁覆盖「计数 → 持久发布」全程** | 守卫（进程内串行 + 跨进程 writer lease）的持有时长必须**覆盖到 `put` 持久发布完成为止**，不能只覆盖计数读取。每次发布前的 `lease.assertHeld()` 复核即是此要求的落点 |
| K-3 | **读当前权威数据** | 计数必须扫**当前存储的权威记录**，**不得**依赖缓存、内存镜像、或调用前算好的计数传入。基准是「提交那一刻的持久事实」 |
| K-4 | **重放先识别「已成功创建」** | 同一 `operationId` 重放时，提交门须**先返回 `replayed` 结果**（`#commitLocked` 的既有语义），**不得**再走一次计数——否则重放会被误判为超限拒绝，破坏幂等 |
| K-5 | **过滤口径写死** | 计数口径固定为 `accountId + type + status='active'`。**`archived` 公司不占配额**；改口径须改本节，不得在实现里静默调整 |
| K-6 | **区分「配额拒绝」与「部分写失败」** | 配额超限是**可判定的业务拒绝**（返回稳定码、`current`/`limit`，**零业务写**）；而「配额通过但公司 `put` 失败」是**不同情形**（须走 §4.3 末的失败恢复，见下条）。二者**不得**共用一个错误码或同一种处理 |

**本方案的失效条件**〔约束〕——出现任一即须重新设计，不得沿用：

1. 出现**第二个公司写者**（第二 Host / 第二 opener 绕过租约）；
2. **多账户共享同一数据根**（K-5 的 `accountId` 过滤将不再等价于「本根内全部用户公司」）；
3. 公司记录**可被非提交门路径修改**（破坏 K-1）；
4. 计数口径需要**跨根聚合**（如账户级配额跨多个存储根）。

**验收要求**〔约束〕——K-1…K-6 的验证须覆盖以下四类，缺项不得声称通过：

| 验收项 | 期望结果 |
|---|---|
| **同账户并发创建**（同根、并发提交） | 计数与写入串行化生效；不超过 limit；无「两个都成功」 |
| **第二写者拒绝** | 第二 Host/opener 打开即被拒（租约）；**已持有者不受干扰**，无部分写 |
| **失租停写** | 持有者失租后，后续每次发布被拒（`LEASE_NOT_HELD`/`LEASE_CHECK_FAILED`），业务状态不变 |
| **重启重放** | 重启后按未决 `operationId` 核对：已提交的返回 `replayed`（不重复计数/不重复建公司）；未决的按 §4.1 第 3 条核对并回滚 |

**失败语义**：返回**可判定的拒绝**（稳定码，附 `{resourceType, current, limit}`），且**不产生任何业务写**。

**扫表计数的适用边界**〔约束〕（2026-09-18 补录）：

| 项 | 要求 |
|---|---|
| **适用规模** | 单账户**公司数 ≤ 1000**（含 `enterprise`/`subsidiary`/`platform`/`operation` 全部 `active` 记录） |
| **判据** | 该边界是**扫表全表计数**成立的条件——每次 `createCompany` 都要扫出同账户同类型全部记录，规模越大单次提交门持有时间越长（K-2 要求锁覆盖全程） |
| **超出处置** | 规模**超出**该边界，或**实测性能不达标**（提交门内计数耗时使写入不可接受）→ **必须**转入 **M0.2 的 `quota` 计数器表**（§4.2 形态），**不得**在 M0.1 的扫表方案上叠加缓存/近似计数绕过 |
| **性能验证** | 边界是**设计上限**，不替代实测——切片内须有计数耗时观测；无观测数据时**不得**声称该边界已够用〔未验证〕 |
| **与失效条件的关系** | 本条是**规模维度**的边界，与上文「本方案的失效条件」1–4 条（写者/多账户/绕过路径/跨根聚合）**并列**，任一触发即须重新设计 |

#### 部分成功与版本归属（待设计）〔待决〕

**已知未解问题**：K-6 区分出的第二类情形——「配额检查通过、公司 `put` 已成功、但后续步骤失败」——**当前没有完整方案**。§4.2 的 M0.2 示例曾试图用「catch 内递减配额」处理，但该示例**自身有缺陷**（公司记录不会随递减而消失，导致配额与事实不一致），故**已删除**（见 §4.2）。

须在实现前裁定：

| # | 待决问题 |
|---|---|
| Q-1 | **部分成功的恢复契约**：公司已落库但同操作后续步骤失败时，是「保留公司 + 回滚配额计数」还是「保留公司并接受计数已反映事实」？**注意**：M0.1 不建计数器表，计数由扫表得出——**扫表口径下「配额已扣」不是独立状态**，故 M0.1 天然不存在该不一致；Q-1 只对 **M0.2 的计数器形态**成立 |
| Q-2 | **版本归属**：`quotaVersion`（M0.2）由谁递增、在哪一步递增、重放时是否递增——须与 K-4 的重放语义一致 |
| Q-3 | 恢复动作本身的**幂等键**与崩溃窗口处理 |

**〔约束〕在这三个问题裁定前，M0.2 的计数器实现不得开工**；M0.1 的扫表计数**不受此阻塞**。

**为什么 M0.1 不用乐观锁**〔约束〕：§4.2 的乐观锁针对「并发 Host / 多账户共享数据面」。M0.1 是「一个业务存储根只绑定一个账户」+ 单 writer（§3.1），计数即权威。

**演进约束（非唯一安全算法）**〔约束〕：M0.1 的扫表计数是**在当前条件下成立的实现选择**，**不是**唯一安全的配额算法。**若后续要做多 Host 或多账户**，须重新评估——§4.2 的计数器 + 乐观锁是**已知候选之一**，不是预设必选；届时应连同 Q-1…Q-3 一并裁定。

**依赖**：本形态需要 `accountId` 真实落地（当前硬编码 `"seed"`，见 §3.1 C-2）——计数必须按 `accountId + type` 过滤。该依赖由 BE-1 关闭。

**〔待实现〕** 本节的 M0.1 形态当前**未实现**（`createCompany` 路径无任何配额判定）。

---

## 5. DSH 集成修正

### 5.1 Storage Domain 正确用法

**错误示例（完整设计中）**：
```typescript
ctx.storage.registerDomain({ ... });  // ❌ 不存在此方法
```

**正确用法（基于 DSH 官方文档）**：
```typescript
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';

// 在包顶层定义 domain spec
const soloipsDomainSpec = defineDomain({
  name: 'soloips',
  version: 1,
  tables: {
    company: domainTable(companyRecordSchema),
    department: domainTable(departmentRecordSchema),
    // ...
  },
});

export { soloipsDomainSpec };

// 在运行时打开 domain（apply 必须 async：内部有 await）
export async function apply(ctx: Context, config: Config): Promise<void> {
  const domain = await ctx.storageDomain.open(soloipsDomainSpec);
  // 使用 domain...
}
```

**〔约束〕C-8：本项目实际的 spec 形态（2026-09-18 更新示例）。**

上面的 `defineDomain`/`domainTable` 是 **DSH 官方 API 形状**，**不是**本项目的 spec 写法。core 用的是 **adapter 自带的组合子**（`SoloipsValueSchema` + `SoloipsDomainTableSpec` + `SoloipsDomainSpec`，见 `packages/adapter-dsh/src/contracts.ts` 与 `packages/core/src/domain.ts`）——实际形态如下：

```typescript
// 本项目实际形态（参照 packages/core/src/domain.ts）
import type { SoloipsDomainSpec, SoloipsDomainTableSpec } from "soloips-adapter-dsh/contracts";
import { literalUnionSchema, nonEmptyStringSchema, objectSchema, optionalSchema } from "./schema.js";

const companyRecordSchema: SoloipsSchema<SoloipsCompanyRecord> = objectSchema<SoloipsCompanyRecord>({
  id: companyIdSchema,                              // constrainedStringSchema(isCompanyId, "公司 id")
  accountId: nonEmptyStringSchema(),
  parentCompanyId: optionalSchema(companyIdSchema),
  type: literalUnionSchema(["platform", "operation", "enterprise", "subsidiary"] as const),
  name: nonEmptyStringSchema(),
  status: literalUnionSchema(["active", "archived"] as const),
  createdAt: nonEmptyStringSchema(),
});

const SOLOIPS_COMPANY_TABLES = {
  company: { valueSchema: companyRecordSchema },
  // …其余五表
} as const;

export const SOLOIPS_COMPANY_DOMAIN_SPEC = {
  name: SOLOIPS_COMPANY_DOMAIN_NAME,      // "soloips_company"
  version: SOLOIPS_COMPANY_DOMAIN_VERSION, // 1
  tables: SOLOIPS_COMPANY_TABLES,
} as const satisfies SoloipsDomainSpec;
```

**要点**：schema 组合子全部来自 `packages/core/src/schema.ts`（`stringSchema`/`nonEmptyStringSchema`/`constrainedStringSchema`/`booleanSchema`/`positiveIntegerSchema`/`literalUnionSchema`/`optionalSchema`/`arraySchema`/`objectSchema`/`jsonRecordSchema`）；**不使用** DSH 的 `defineDomain`/`domainTable`、**不使用** schemastery 构造 record。

**〔约束〕SoloIPs core 不走 `ctx.storageDomain`**：core 只消费 adapter 的
`SoloipsStoragePort`（租约先行 → 同一 canonical root 建栈 → 显式 facility → `facility.open(spec)`），
契约中不存在 `ctx.storageDomain` 回退（SOLO-FENCE-01 / SEAM-X1）。上面的 `ctx.storageDomain`
示例只说明 DSH 官方 API 形状，不代表本项目的写路径。

### 5.2 Client Plugin 参考结构（待核验）

> **⚠️〔约束〕本节的 API 形状是<u>待核验参考结构</u>，不得作为 BE-6 的 API 依据**（2026-09-18 codex 终审裁定）。
>
> 理由：① 本节示例是**按 DSH 官方文档整理的参考结构**，**未**在目标版本上做实际类型/运行时核对；② `soloips-web` 的 V1 路线已改为**复制官方 Web 插件 fork 改造**（[`docs/decisions/web-ui-fork.md`](../decisions/web-ui-fork.md)），客户端扩展点应以**fork 内实际源码**为准，而非本节示例；③ BE-6 的 Host 半边与工具注册的权威依据是 `system-assistant-backend-design-v0.1.md` §3.2（`@Remote` 事实清单）。
>
> 本节保留**仅作反例说明**：它指出两个不存在的方法名，避免后来者照抄旧设计。

**错误示例（完整设计中）**：
```typescript
client.registerRoute('/soloips/*', { ... });     // ❌ 不存在此方法
client.registerSlot('sidebar', { id: '...', ... });  // ❌ 不存在此方法
```

**参考结构（待核验；<u>不得</u>作为 BE-6 API 依据）**：

```typescript
import type { ClientModules } from '@deepseek-ai/dsh-client-modules';

// Client Plugin 入口
export function register(client: ClientModules): void {
  // 注册路由
  client.routes.add({
    path: '/soloips/*',
    handler: () => import('./client/App'),
  });
  
  // 注册 Slot（在 DSH Slots 系统内扩展）
  client.slots.inject({
    slot: 'sidebar',
    id: 'soloips-company-list',
    component: () => import('./client/slots/CompanySidebar'),
    priority: 50,
  });
}
```

**注意**：上列 API **未在目标版本核对**，属待核验参考结构；V1 的客户端扩展点以 fork 内实际源码为准（见本节开头的降级声明）。

---

## 6. 统一里程碑

### 6.1 修订后的里程碑

**表格口径（2026-09-18 codex 终审补录）**〔约束〕：本表的「最小验收出口」列是**界面层的最小出口**（M0.1 起即用户可见的判定），**不等于**该切片的全部验收。**各后端切片（BE-0…BE-7、T08 等）有各自的验收清单**，以对应设计正文为准——本表**不**替代它们，也不因为本表只写一个出口就降低后端切片的验收要求。

| 切片 | 目标 | 最小验收出口（界面层） |
|---|---|---|
| **S0 接通** | 插件装配、受控写入、同包重启 | 加载成功 + 受控写 + 重启读回 |
| **S0 多公司基础** | 跨账户拒绝、引用归属、撤职失效、并发配额 | 隔离测试通过 |
| **M0.1 Web 基础** | 公司/部门/团队 CRUD | 创建公司成功 |
| **M0.2 订阅限制** | 三层配额生效（Free 1 公司 + 0 子公司；Pro 1 公司 + 3 子公司） | 免费用户无法创建第二公司或任一子公司 |
| **M0.3 3D 基础** | 场景搭建 | 能渲染公司结构 |
| **M1 双版本联调** | Web ↔ 3D 状态同步 | 操作同步 |
| **M2 总助理** | AI 驱动运营 | 对话完成日常事务 |
| **M3 日志监测** | 三层日志 | 能查询审计记录 |

**各后端切片的验收**〔约束〕：见 `docs/prds/system-assistant-backend-design-v0.1.md` §4.1（BE-0…BE-7 逐片验收标准）。**界面最小出口达成 ≠ 后端切片全部通过**；反向亦然——后端切片通过也不等于界面可用。两者分别取证。

> **界面路线注记（2026-09-17）**：上表切片口径不变。M0.1「Web 基础」的界面来源为**复制官方 Web 插件 fork 改造的 `soloips-web`**（验收出口「创建公司成功」不变）；M0.3（3D 基础）与 M1（双版本联调）随原「自研 Web+3D 双版本」路线**推迟**，解冻时点〔待决〕。见 [`docs/decisions/web-ui-fork.md`](../decisions/web-ui-fork.md)。

> **C-1 配额口径统一（2026-09-18）**：上表 M0.1 的验收出口**不变**。配额工作的分工是——
> **M0.1 内做 Free 1/0 的提交门计数校验（不建表、不用乐观锁）；完整的 Entitlement 记录与 `quota` 表形态属 M0.2。**
> 本表述与 §0「C-1 配额口径」及 §4.3 逐字一致，两处口径以此为准。此前 §0 曾写「S0 不校验配额」，与「M0.2 才做配额」并存易被读成冲突——现统一为上述分工。

### 6.2 切片候选登记（未排期）〔待决〕

本节登记**提案未采纳、但保留复议条件**的切片候选。**它们不属 M0.1/M0.2 的承诺范围**，列入此处只为避免提案遗失或被误读为已排期。

| 候选 | 内容 | 优先级 | 未采纳理由 | 复议触发条件 |
|---|---|---|---|---|
| **BE-8** | **`contract-doc-sync-check` CI**：自动核对文档中的模型/字段/工具名与 `packages/core/src/contracts.ts` 是否同步 | **P3** | 需先定义可解析的文档结构约定与「合法差距」容错规则（目标 vs 现状），约定成型前实施会产生误报，反而促使实现去迁就检查器 | §0 连续两次出现「文档与代码不符」返工，或 BE-1…BE-7 全部落地后需长期维护 §0 表 |

**M0.1 的替代手段**〔约束〕：**人工核验纪律**——凡改 §0 已实现行，必须对照 `packages/core/src/contracts.ts` 核验（见 §0 开头注）。该纪律**不因** BE-8 未实施而放宽。

> **注**：§2.5 另登记一项**文档层面**的未采纳提案（工具清单不拆 `tool-registry.md`，工具数 > 40 时再议）——因属文档组织而非切片，**不**入本表，权威登记在 §2.5。

---

## 7. 变更历史

| 日期 | 变更 | 原因 |
|---|---|---|
| 2026-09-17 | 创建权威数据契约 | Codex 审查发现两套模型冲突 |
| 2026-09-17 | 统一公司归属为 accountId | 直接归属更清晰 |
| 2026-09-17 | 总助理改为公司级任职 | 复用现有任职机制 |
| 2026-09-17 | 添加原子配额操作 | 解决并发超限问题 |
| 2026-09-17 | 修正 DSH 接口示例 | 与官方文档对齐 |
| 2026-09-17 | 配额改三层模型（companyLimit + subsidiaryLimit），统一用 -1 表示无限 | 用户裁定沿用三层配额；`Infinity` 无法 JSON 持久化 |
| 2026-09-17 | 新增 §0 实现状态表 | 契约与代码差距需要显式化 |
| 2026-09-17 | 添加 §3.1 S0 临时账户绑定例外 | 批准部署层注入 accountId；P1 Auth 前不得声称多租户隔离 |
| 2026-09-17 | 修正 createCompany（补 `type`/`parentCompanyId`）、任职作用域判定、`apply` 的 async、跨表事务表述 | 消除契约内部自相矛盾 |
| 2026-09-17 | 里程碑代号 Sonnet→M2（总助理）、Opus→M3（日志监测） | 用户裁定：原代号借用模型档位名、与里程碑内容无关，易致多套含义漂移 |
| 2026-09-17 | §6.1 加界面路线注记：M0.1 界面来源改为官方 Web fork 改造版；M0.3/M1 随自研双版本推迟 | 用户 2026-09-17 两轮确认的 V1 UI 决策，见 `docs/decisions/web-ui-fork.md` |
| 2026-09-18 | **P2 设计裁定落实**：①C-1 配额口径统一（M0.1 提交门计数不建表 / 完整 Entitlement+quota 表属 M0.2，§0 与 §6.1 同述）；②C-2 §3.1 account-binding 与 `SOLOIPS_CORE_ACCOUNT_MISMATCH` 标〔待实现〕BE-1；③C-3 §0 与 §2.1 注明 Employee 目标字段与实现字段不重叠；④C-4 新增 §2.3 `scope` 先可选 + 3 条推断规则 + 4 项收紧前置（当前不满足）；⑤C-5 `SoloipsTeamRecord` 补 `leadAppointmentId`；⑥C-6 §1.2 补「只有 Team 无 TeamBinding」中间态；⑦C-7 §4.2 标〔待实现〕M0.2 + 新增 §4.3 M0.1 形态；⑧C-8 §5.1 示例改为本项目实际 spec 形态；⑨C-9 §0 补已实现能力面清单 | 用户 2026-09-18 授权技术自主决策；指挥裁定，来源 `docs/prds/system-assistant-backend-design-v0.1.md` §1.4 与 `docs/prds/organization-full-backend-design-v0.1.md` §7 |
| 2026-09-18 | **新实体与裁定登记**：§2.1 登记 6 个新实体（Team 三字段 / TeamSkillAssignment / TeamMcpIntent / team_norm / NormAck / AssemblyEvidence，均标〔待实现〕，其中 AssemblyEvidence 写死「只读不参与判定」）；§2.2 新增实体登记表；§2.4 记 Q-N5(a) 允许子公司嵌套、Q-N5(b) 配额按全部 `subsidiary` 计数、**Q-N5b 每个公司（含子公司）首个总助理由用户直接招募**（递归终止，跨公司招募待决）；§2.5 登记 20 项工具名（下划线模型面 vs 点号 Remote 面）与两条边界 | 用户 2026-09-18 授权技术自主决策；指挥裁定 |
| 2026-09-18 | 修缮：§3.1 缺失的代码块起栅栏补齐（原有闭合栅栏无起始，会导致后续正文渲染为代码） | 文档智能体自查发现（写入范围内的既有缺陷） |
| 2026-09-18 | **codex 终审修正（12 条全部接受）**：①§2.4 删自动创建总助理示例、补「待招募合法」与可信用户入口（幂等/恢复）、「母公司兼任」排除理由改为不依赖「模型无法表达」；②§3.2 示例降级为不可作实现模板 + 7 条已登记缺陷（D-1…D-7）+ M0.1 实际授权规则（A-1…A-6）；③新增 §2.1.1 组长唯一性协议（P-1…P-6，撤职→团队不可用+显式换任）；④新增 §2.1.2 MCP 期望/生效分工与生效确认规则；⑤新增 §2.1.3 NormAck 强证据契约（写入方/关联字段/主键唯一/效力规则/版本不可变）；⑥§4.3 补 K-1…K-6 条件、失效条件、四类验收、部分成功与版本归属 Q-1…Q-3、演进约束改写；⑦§4.2 删除含一致性错误的完整示例，改为待设计占位；⑧§2.5 改写工具名依据为本项目命名规范、读写工具分开要求、Remote「—」注明不暴露；⑨§3.1 补根级绑定元数据、换绑重放规则、seed 根三条处置路径；⑩§0 加「代码定义现状/本文定义目标」优先级声明、§2.1 Employee 补完整目标形状（既有判定字段不得移出）；⑪新增 §2.6 公司树规则（T-1…T-6、孤儿处置、enterprise 带父拒绝）、TeamBinding 重复字段登记为派生快照、§6.1 区分界面最小出口与各后端切片验收、§5.2 降为待核验参考结构 | codex CLI 终审「需修正后重审」，指挥逐条裁定全部接受 |
| 2026-09-18 | **PR #15 审查意见修正（N-1…N-9 采纳，2 条登记不采纳）**：①**N-1** NormAck 改 **append-only 事件流**——主键改 `ackId`，三元组不再作主键；重复装配**新增事件行**（含 `appointmentGeneration`/`sessionRef`/`acknowledgedAt`），删除「不新增行只更新上下文」表述；新增「append-only 与读取证据」（按当前有效代际取最新事件，旧行留审计）；②**N-2** Team 生命周期——§2.1 `status` 注 + §2.1.1 **P-7 禁物理删除**、**P-8 悬挂组长引用处置协议**（扫描/归入不可用/不自动修复/待显式修复或换任/读面不静默降级/归档不扫描），语义三分写死、字段形态留 BE-3；③**N-3** AssemblyEvidence 升格为显式不变量 **INV-AE-1**（禁作 onboarding/permission/readiness 输入，违反即契约违规）；④**N-4** §2.1.2 补 **MCP Intent 状态迁移矩阵**（`revoked` 无出边、`unavailable→active` 禁跳跃、`active→unavailable` 禁直降；M0.1 停留 requested/unavailable 维持）；⑤**N-5** `functionSource` 补 `confirmedBy`（system-suggested 必填）+ 枚举扩展标〔待决 M0.2+〕；⑥**N-6** 新增 **§3.3 权限判定优先级**（explicit deny > allow > inherited default，M0.2 权限服务遵守）；⑦**N-7** Employee 补 `identitySource`（`user_created`/`recruited` 两值起步，〔待实现〕）；⑧**N-8** §4.3 补**扫表计数适用边界**（单账户公司数 ≤1000，超出或性能不达转 M0.2 quota 表）；⑨**N-9** §2.3 收紧前置旁加**锚点「目标 M1 前完成 scope required 迁移」**；⑩**登记不采纳 2 条**——工具清单**不拆** `tool-registry.md`（§2.5，工具数 >40 再议）；`contract-doc-sync-check` CI 登记为 **P3 切片候选 BE-8**（新增 §6.2 切片候选登记表），M0.1 替代纪律写入 **§0 开头注**「凡改 §0 已实现行，必须对照 `packages/core/src/contracts.ts` 核验」 | ChatGPT 对 PR #15 的审查意见；指挥逐条核实属实并裁定（9 采纳 2 登记） |
| 2026-09-18 | **ChatGPT 第二阶段审查修正（BE-001…004 + P2-001…003）**：①**BE-001** §2.1.1 新增 **P-9 三步成团协议**（`team.create`(pending,无组长) → `appointment.create`(team_lead) → `team.activate`(P-4 校验后转可用)），三步三 kind 三 `operationId` 各自可恢复；恢复入口=扫描 pending 续做或收敛；四条读面纪律 P-9.1…P-9.4；`SoloipsTeamRecord.leadAppointmentId` 改**可缺省**（pending 期无组长）、`status` 增 `pending`；②**BE-002** 新增 **`SoloipsOperationRecord.schemaVersion`**〔待实现〕——新写入带当前版本、读取遇 unknown kind 按版本兼容，使 kind 联合扩展由破坏性降为兼容性变更；③**BE-003** §2.3 运行时推断**删除规则 2**（「首个 `general_assistant` → company 级」），改为**严格三分支**（有 scope 用之 / 无 scope 有 departmentId 归 department / 否则 invalid，不猜）；该推断**仅允许存在于 migration 工具且须人工确认**；D-1 同步改写；④**BE-004** `SoloipsTeamSkillAssignmentRecord.status` 扩为 **`requested`/`available`/`active`/`failed`/`revoked`** 五态 + 迁移矩阵（与 MCP 对齐，`revoked` 无出边；M0.1 只走 `requested`）；⑤§2.2 实体登记表行 1/2 同步 | ChatGPT 第二阶段审查（BE 切片闭合）；指挥逐条核实裁定（四条 P1 全采纳，P2 一采纳一折中一采纳） |
| 2026-09-18 | **ChatGPT 第三阶段终审 SA 建议（SA-01…SA-04，全部采纳）**：①**SA-01** §2.4.1 补「读面必须显式表达『无总助理』状态」（SA-01.1…SA-01.4）——BE-4 查询服务须能区分「无有效 `general_assistant` 任职」与「未覆盖/查询失败」，**不静默省略**，界面据此显示「待招募」引导；②**SA-02** §3.1 补「**Host 层 actor 属半可信输入**」声明（SA-02.1…SA-02.5）——非可信输入（部署面自证），**可作审计线索、不可作授权唯一依据**，**不得**与 ORG-05 可信身份链混同；`ExecutionBinding` 落地后重新评估；③**SA-03** 新增 **§3.4 员工自主循环的能力闸门**〔待实现 M0.2+，原则 M0.1 生效〕——七阶段循环（Observe→Plan→**Request capability**→Execute→Record evidence→Reflect→Continue）+ **四层检查**（身份→任职→工具授权→scope，全部通过与关系）+ 五条**反例明示禁止**（含「直接调用所有工具」）；④**SA-04** 新增 **§2.4.3 系统助理职责边界**——允许（引导招募/解释状态/协调流程/提供建议）与禁止（自建任职/改自身权限/绕过审批/替员工执行业务）分列，判据「**可以『说』，不可以『做组织动作』**」，定位写死为**系统级协调入口，不是组织最高决策主体（防「隐形 CEO」）** | ChatGPT 第三阶段终审 4 项 SA 建议；指挥核实裁定全部采纳（PR 收口补入） |
| 2026-09-18 | **OPS-00 同步（#35 §3.2）**：§0 对照 `contracts.ts`@8abf815 修正 5 处滞后行——①Department 补 `leaderAppointmentId?`；②Appointment 补 `scope?`/`role?` 与 `departmentId?` 可选、状态改「已实现」；③Operation 补 `schemaVersion?`（BE-3 交付）、删「未实现」；④能力面补 team 四命令 + `getTeam`/`listTeams` + `reconcileTeams`、缺口改为 5 个未落地读方法；⑤Team 实体行改「已实现」、TeamBinding 行拆分独立；§3.1 C-2 注从〔待实现〕改〔已实现〕（BE-1 交付：根级绑定元数据 + 占位拒绝 + 真实 accountId）；§2.4.1 SA-01 注指向 BE-4a 切片 | OPS-00 接管收口（#35 §3.2「§0 滞后」项）；逐项对照源码核验（附行号） |
| 2026-09-18 | **新增 §2.5.1 调用暴露矩阵（OPS-00 / #35 §3.2「调用暴露边界」）**：以「谁是行为主体」分面消除「§2.5 登记 20 项模型工具名」与「§2.4.3 SA-04 系统助理不得代为执行组织动作」的冲突——①组织写动作（createCompany/createDepartment/createEmployee/createAppointment/revokeAppointment/saveEmployeeDocument/team 四命令）**走用户确认的可信 Remote，不注册为模型工具**；②`requestWorkEntry`/`initializeEmployeeMemory`/`verifyEmployeeCapability`/`recordAssemblyEvidence`/`reconcileTeams`/`close` 全面 fail-closed；③只读投影需浏览器可达路径（§2.5「—」含义收口为「不因本表暴露」，非永久不暴露）；④身份分层（accountId 部署注入、actor 半可信、模型面强制 agent 上下文、用户 Remote 不得误要求 agent 上下文）；⑤`system-assistant-backend-design` §4.1 BE-6 验收① 行为主体由「模型」更正为「用户」 | OPS-00 收口；BE-6a 派发前置裁定（C 亲手） |
| 2026-09-18 | **新增 §2.4.4 部门部长唯一性与换任（OPS-00 / #35 §3.2「部长唯一性遗留」）**：补 BE-2 缺失的部长唯一性规则——**DL-1** 同一部门至多一条有效 `department_lead`（与总助理同构的拒绝、零业务写）；**DL-2** 换任必须显式（先 revoke 再 create，禁隐式后写者胜、禁自动继任）；**DL-3** `leaderAppointmentId` 是当前有效部长引用，撤销时联动清除（比 P-8 团队处置更强：撤销即清除）；**DL-4** 读面显式表达「无部长」（BE-4a `getDepartment` 已满足形状）。实现归属：DL-1/DL-2 → BE-4c 或其后 core 切片；DL-3 → 随 `revokeAppointment`；DL-4 → FE-2b 界面 | OPS-00 收口；BE-2 实现者的诚实披露触发（后写者胜为未裁定行为） |
| 2026-09-18 | **新增 P-10 `reconcileTeams` 调用范围裁定 + P-9 口径关系标注（OPS-00 / #35 §3.2 第 7、8 项）**：①**P-10** 核清 `reconcileTeams` 为显式恢复命令、不经门但有「写前复核写权 + 幂等收敛 + 读面不依赖标记」三条补偿——裁定其当前形态在 M0.1 可接受，但**不得暴露**给非 Host-内部主体，收紧路径（登记 `team.reconcile` kind 改经门）登记为后续切片候选；②**P-9 标注**：明确 P-9 三步协议**取代** P-1/P-2 关于「同一 `operationId` 关联写入」的旧口径，P-1/P-2 只保留不变量（ID 预分配、崩溃后不重分配 ID），P-3~P-8 继续有效 | OPS-00 收口（#35 §3.2「P-1/P-2 与 P-9」「reconcileTeams 遗留」两项）；逐项对照 `store.ts:2040-2120` 核验 |
| 2026-09-18 | **BE-4a 交付同步**：①§0 能力面行更新为 BE-4a 后状态（读面 5 方法全部落地、`listTeams` 补 `departmentId` 过滤、**读面缺口：无**、服务面行号改 `contracts.ts:1110-1345`）；②§2.4.1 SA-01 段从〔待实现〕改〔已实现〕——`listAdministrators` 的四态显式投影（`vacant` 显式空数组 / `uncovered` 不携带字段 / `present` / `inconsistent` 全量不掩盖）+ **失败以抛错呈现不编码为分支**（映射 SA-01.1~04）；③补记读面统一校验收紧（6 个 `get*` 非法 id 由静默 `undefined` 改为抛 `SOLOIPS_CORE_VALIDATION`；`operationId` 依 `ids.ts` 既定契约按 `isOperationIdShape` 校验） | BE-4a 交付（Issue #21/#31）；实现裁定经独立 QA 核验（含 D1 缺陷修复与真实介质验证） |
| 2026-09-18 | **新增 §2.7 国际化分层（后端侧缺口补齐，用户 2026-09-18 指示）**：①**I18N-1 core 语言中立**——`code` 是契约、`message` 是面向开发者/运维的诊断（单一语言、不本地化、**不得上屏**）；②**I18N-2 用户文案由 web 层从稳定 id 映射**——映射表权威落点在 web 包内（类型强制 + 双向断言完备），**不在** core、**不在**本契约正文；③**I18N-3 字典是唯一有译文处**（zh/en 双字典由类型系统强制、随插件包发布、不落业务库）；④七类文本分层归属表（完整设计见 `docs/design/backend-i18n-design.md`）；⑤关闭两处既有〔待决〕——`gaps[].message` 按 `item`+`reason` 映射不上屏、错误码映射表落点；⑥**门禁事实更正**：`verify-client-ui-i18n` 在 DSH fork 而**非本仓**（实测），本仓接线登记待实现 | 用户 2026-09-18 指示「需要国际化的后端项目，没有就全部补上设计文档」；指挥取证（core 零 i18n 设计、102 处中文串）后裁定 |
