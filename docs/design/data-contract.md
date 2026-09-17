# SoloIPs 权威数据契约

> 本文档是 SoloIPs 的唯一权威数据定义，解决「完整设计」与「多公司设计」之间的冲突。
> 
> **阅读契约**：所有代码实现和文档引用必须以本文档为准。
> **决策状态**：〔约束〕2026-09-17 Codex 审查要求统一数据契约
> **变更权**：architecture-owner

---

## 0. 实现状态（对照代码事实，2026-09-17）

> 本文档是**目标数据契约**；下表给出它与 `packages/core/src/contracts.ts` 当前代码的差距。
> 「未实现」是实现目标，不代表已交付能力。文档之间冲突时以本文档为准。
>
> **存储后端**：SQLite（Drizzle 0.38 查询构造 + better-sqlite3 driver，见
> `packages/adapter-dsh/src/ports/storage-sqlite.ts`）为默认；可选 JSON。后期可迁移 PostgreSQL
> 〔建议〕迁移面见 `docs/technical/state.md`「后期迁移 PostgreSQL」。

| 模型 / 能力 | 代码状态 | 代码实际字段 |
|---|---|---|
| `SoloipsCompanyRecord`（`accountId`/`parentCompanyId`/`type`/`name`/`status`/`createdAt`） | **已实现** | `contracts.ts` §3 |
| `SoloipsDepartmentRecord` | **已实现（部分字段）** | 只有 `id`/`companyId`/`name`；`description`/`leaderAppointmentId`/`parentDepartmentId`/`status` 见 §2 设计稿 |
| `SoloipsEmployeeRecord` | **已实现（与 §2 目标不同形）** | `id`/`displayName`/`currentDocuments`/`assemblyEvidence`/`memoryInitialized`/`verifiedCapabilities`。**除 `id`/`displayName` 外，§2 目标字段（`email`/`modelConfig`/`status`/`createdAt`）与实现字段不重叠**；以 `contracts.ts` 为准，§2.1 已补注（C-3） |
| `SoloipsAppointmentRecord` | **已实现（部分字段）** | `id`/`employeeId`/`departmentId`/`requiredCapabilities`/`generation`/`status`；`scope`(判别联合) 与 `role` 见 §2 设计稿（`scope` 先可选，见 §2.3） |
| `SoloipsDocumentVersionRecord` | **已实现** | `versionId`/`ownerId`/`documentType`/`content`/`digest`/`previousVersionId?`/`appointmentId?` |
| `SoloipsOperationRecord` | **已实现** | `id`/`kind`/`status`/`employeeId?`/`intent`/`result?` |
| **已实现的能力面**（C-9） | **已实现** | 服务面 `contracts.ts:424-481`。写：`createCompany`/`createDepartment`/`createEmployee`/`createAppointment`/`revokeAppointment`/`initializeEmployeeMemory`/`verifyEmployeeCapability`/`recordAssemblyEvidence`/`saveEmployeeDocument`/`requestWorkEntry`。读：`checkOnboarding`/`getCompany`/`listSubsidiaries`/`getCompanyTree`/`listDepartments`/`getEmployee`/`getAppointment`/`getDocumentVersion`/`getOperation`/`listPendingOperations`。生命周期 `close()`。**缺口**：无 `getDepartment(id)`/`listEmployees`/`listAppointments`/`listTeams`/`getTeam`（BE-4 待补） |
| 文档类型 `ip_summary` / `storyboard` | **未实现** | 代码枚举只有 `profile`/`avatar`/`soul`/`operating`/`work` |
| `SoloipsEntitlement*` 与完整三层配额表（§3/§4） | **未实现** | 目标设计，属 **M0.2**（C-1）。**M0.1 的配额口径见下方「C-1 配额口径」** |
| `SoloipsAuthContext` / `SoloipsPermissionService` | **未实现** | S0 用部署账户绑定替代，见 §3.1 临时例外 |
| `SoloipsTeamBindingRecord`（及独立 `Team` 实体） | **未实现** | adapter 的 `team` 端口是 fail-closed 占位；任务/attempt 状态归官方 Team。M0.1 只落纯数据层 `Team`（§2），`TeamBinding` 留后续——中间态合法，见 §1.2 注（C-6） |
| `SoloipsExecutionBindingRecord` | **未实现** | 撤职使执行失效的验收因此尚未覆盖 |
| `SoloipsAuditRecord` | **未实现** | 审计落库属 M3 里程碑 |
| 跨账户拒绝 / 并发配额 / 多租户隔离验收 | **未实现** | 属「S0 多公司基础」，尚未通过 |

**C-1 配额口径（2026-09-18 裁定，§0 与 §6.1 统一为此表述）**〔约束〕：

> **M0.1 内做 Free 1/0 的提交门计数校验——不建 `entitlement`/`quota` 表，不用 `quotaVersion` 乐观锁。完整的 Entitlement 记录与 quota 表形态属 M0.2。**
>
> - **M0.1 形态**：`planCode` 由部署配置注入（缺省 `free`，不建表）；`createCompany` 在**提交门 `mutate` 回调内、`put` 之前**按 `accountId + type` 计数复查；三层配额表内联为常量；失败返回稳定码且**不产生任何业务写**。
> - **M0.2 形态**：§2 的 `SoloipsEntitlementRecord` + §4.2 的 `quota` 计数器表 + `quotaVersion` 乐观锁。乐观锁针对「并发 Host / 多账户共享数据面」；在 M0.1「一个业务存储根只绑定一个账户」+ 单 writer 下，计数即权威。
> - **与 §4 的关系**：§4.2 的 `quota` 表代码示例标〔待实现〕（C-7），**不得**被读成 M0.1 的实现要求；M0.1 的校验点与一致性依据见 §4.3。

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
  /** 职能来源：部长定义 or 系统建议后确认（审计「谁定义了职能」） */
  readonly functionSource: 'leader-defined' | 'system-suggested';
  /** 团队组长任职（唯一组长；与 role:'team_lead' 的任职一致） */
  readonly leadAppointmentId: SoloipsAppointmentId;
  readonly status: 'active' | 'archived';
  readonly createdAt: string;
}

export type SoloipsTeamId = SoloipsCoreId<'team'>;

/**
 * 团队绑定（SoloIPs Team → DSH Team）
 * SoloIPs 的团队概念通过 DSH Team 执行
 */
export interface SoloipsTeamBindingRecord {
  readonly id: SoloipsTeamBindingId;
  readonly teamId: SoloipsTeamId;              // 绑定的 SoloIPs 团队
  readonly companyId: SoloipsCompanyId;
  readonly departmentId?: SoloipsDepartmentId;  // 可选归属部门
  readonly name: string;
  readonly dshTeamRef: string;                 // DSH Team Session ID
  readonly leadAppointmentId: SoloipsAppointmentId;  // 团队负责人任职
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
  /** revoked 只停用分配；**已加载进上下文的正文不会因撤回而消失**（ORG-08） */
  readonly status: 'assigned' | 'revoked';
  readonly createdAt: string;
}

export type SoloipsTeamSkillAssignmentId = SoloipsCoreId<'team-skill-assignment'>;

/**
 * 团队 MCP 配置意图
 *
 * 〔待实现〕M0.1 目标实体。
 * **三条硬边界**：①`configRef` **不携带凭据**（凭据留受保护部署配置，红线 2 + ORG-13）；
 * ②「请求」≠「生效」——写一条意图**不会**让工具出现，故状态必须有 `unavailable`，
 * 且不得把 `requested` 呈现为「已配置」；③作用域粒度是 **agent 不是 team**。
 */
export interface SoloipsTeamMcpIntentRecord {
  readonly id: SoloipsTeamMcpIntentId;
  readonly teamId: SoloipsTeamId;
  /** 对齐 DSH 的 [A-Za-z0-9_-]{1,32} */
  readonly serverName: string;
  /** 配置意图的内容引用：**不含凭据本体**，只引用受保护的配置位置（部署层） */
  readonly configRef: string;
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
 */
export interface SoloipsNormAckRecord {
  readonly employeeId: SoloipsEmployeeId;
  readonly teamId: SoloipsTeamId;
  /** 哪一个版本被确认 */
  readonly normVersionId: SoloipsTeamNormVersionId;
  /** 该版本摘要快照 */
  readonly digest: string;
  readonly acknowledgedAt: string;
  /**
   * 取证强度（必须显式）：
   * - `host-delivered`：强证据——正文作为**实际请求装配**的一部分被装入该员工会话；
   * - `model-reported`：弱证据——模型自报已阅读。**可记录、可展示、不足以形成资格判定**。
   */
  readonly method: 'host-delivered' | 'model-reported';
}

/**
 * 装配证据（只读装配读模型 = 装配动作的观测台账）
 *
 * 〔待实现〕M0.1 目标实体。
 *
 * **〔约束〕R-2：本表只读、仅供取证与展示，不参与任何判定。**
 * 四类文档的装配事实同时存在于 `employee.assemblyEvidence`（**个人资产**装配事实，
 * 服务 ORG-03 入职判定）与本报文的 `kind='document'` 记录（**装配动作**观测）。
 * 两者**不是同一事实的两份表示**（前者是「个人资产当前引用」，后者是「Host 侧装配动作观测」），
 * 但为避免被读成双事实来源，必须写死：**本表不参与判定**；onboarding 判定继续读
 * `employee.assemblyEvidence`，不改读本表。
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
 * 〔C-3 注 2026-09-18〕**本节为目标设计，与当前实现不同形**：
 * 除 `id`/`displayName` 外，下表的 `email`/`modelConfig`/`status`/`createdAt`
 * 与实现字段（`currentDocuments`/`assemblyEvidence`/`memoryInitialized`/
 * `verifiedCapabilities`）**不重叠**。**以 `packages/core/src/contracts.ts` 为准**；
 * 本节保留为目标设计，不代表已实现字段。
 */
export interface SoloipsEmployeeRecord {
  readonly id: SoloipsEmployeeId;
  readonly displayName: string;
  readonly email?: string;
  readonly modelConfig?: SoloipsModelConfig;
  readonly status: 'pending' | 'active' | 'inactive';
  readonly createdAt: string;
}

export type SoloipsEmployeeId = SoloipsCoreId<'employee'>;

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

### 2.2 新增实体登记（2026-09-18 裁定，全部〔待实现〕）

以下 6 个实体由指挥裁定登记进本节，**权威归属即本文档**（来源：`docs/prds/organization-full-backend-design-v0.1.md` §1.1/§2.1/§2.2/§2.3/§2.4）。**均为 M0.1 目标，§0 未列已实现**。

| # | 实体 | 位置 | 关键点 |
|---|---|---|---|
| 1 | `SoloipsTeamRecord`（+ `function`/`functionSource`/`leadAppointmentId`） | §2.1 | 已有类型，**本次补三字段**；能力项**不入本记录**（走 `appointment.requiredCapabilities`）；组长落点见 C-5 |
| 2 | `SoloipsTeamSkillAssignmentRecord` | §2.1 | 分配（意图+授权）与**实际加载**是两层；撤回不等于清除已加载上下文 |
| 3 | `SoloipsTeamMcpIntentRecord` | §2.1 | `configRef` **不含凭据**；必须有 `unavailable` 态；作用域粒度是 agent |
| 4 | `SoloipsTeamNormRecord`（+ `SoloipsTeamNormVersionId`） | §2.1 | 团队级资料；**不能**塞进 `document_version`（`ownerId` 语义不同） |
| 5 | `SoloipsNormAckRecord` | §2.1 | `method` 必须显式；**弱证据不足以形成资格**（ORG-03） |
| 6 | `SoloipsAssemblyEvidenceRecord` | §2.1 | **只读、不参与判定**（R-2）；与 `employee.assemblyEvidence` 并存不冲突 |

### 2.3 任职 `scope` 政策（C-4，2026-09-18 裁定）

**〔约束〕`scope` 先可选，不一步收紧为必填。**

根因是**介质层硬约束**（非保守选择）：`appointmentRecordSchema` 当前 `departmentId` 必填且无 `scope`，而 domain 的 `invalidRecords` 默认**拒绝整次 open**，core spec 未声明该键——把 `scope` 直接设为必填会让**存量记录整次 open 失败**，且当前默认后端（sqlite）下**逃生通道不可用**（`backupRecord` 只在 JSON 后端 per-record unit 实现）。详见 `docs/prds/organization-full-backend-design-v0.1.md` §1.5 与 §6 R-3。

**阶段一（`scope?` 可选期）的默认推断规则**〔约束〕——读取时凡遇缺 `scope` 的记录按序推断，**不写回**：

| # | 条件 | 推断结果 | 依据 |
|---|---|---|---|
| 1 | 无 `scope`，且 `departmentId` 存在 | `{ kind: 'department', companyId: <由 departmentId 解析>, departmentId }` | 现有形状即部门级任职（`departmentId` 必填语义） |
| 2 | 无 `scope`，且是该公司**首个** `role` 推断为 `general_assistant` 的任命 | `{ kind: 'company', companyId }` | 公司级任职无部门可挂——正是不加 `scope` 就无法表达的那类 |
| 3 | 无 `scope`，且无法解析出公司 | **判定为数据不一致**（`SOLOIPS_CORE_RECORD_INVALID`） | 不猜；不得静默当作任一 scope |

> **规则 2 的诚实边界**〔未验证〕：规则 2 依赖「首个 `general_assistant`」这一**基于读取顺序/时间**的推断，**不是权威事实**——存量记录里没有信息能区分公司级与部门级任职（这正是 `scope` 缺失造成的不可判定历史数据）。更稳妥的做法是**阶段一不推断规则 2**，改由迁移脚本或重新任命（新 `operationId`）显式建立公司级任职；读取时遇无 `scope` 且无 `departmentId` 的记录一律按规则 3 报错。两个方案须在切片内**二选一**。

**收紧为必填的 4 项前置条件**〔约束〕（**当前不满足**，故 `scope` 必须保持可选）：

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
| 与 (d) 候选的关系 | 「子公司不设总助理、母公司兼任」**被排除**——与「总助理是公司级任职」模型冲突（一个任职挂两家公司？），需 `scope` 支持多公司或新增层，本裁定不引入 |

**〔未验证〕**：本裁定是产品+契约层面的决定，不证明引导旅程已实现、不证明子公司视图已具备招募入口。

### 2.5 工具名（模型工具面，2026-09-18 登记）

**〔约束〕模型工具名用下划线 `soloips_<域>_<动作>`；`@Remote` 调用面用点号 `ctx.remote.soloips.<method>`。两套命名面刻意不同形，禁止混用。**

依据〔源码事实〕（fork `abdfeb4831` / `0.1.6-alpha.1`）：

- DeepSeek 函数名约定**只允许 `[A-Za-z0-9_-]`**、≤64 字符；不允许的字符被替换为 `_`，有损时追加 12 位 SHA-256 hash（`packages/mcp/mcp-client/src/tools.ts:48,51,54,81-86` 的 `MAX_PUBLIC_NAME_LENGTH`/`INVALID_NAME_CHARS`/`HASH_LENGTH`/`publicToolName`）。**点号属「不允许」字符**。
- 官方 Team 工具名**全部为下划线**形态（`spawn_teammate`/`send_message`/`list_agents`/`team_task_create`/`team_task_update` 等，`packages/experimental/tool-agent-team/src/index.ts`）。
- `@Remote` 方法名须是 Typert 严格分析下的**具名必填简单标识符**（不得解构/默认值/rest/可选），故用点号 namespace 面。

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
| 11 | `checkOnboarding` | `soloips_employee_check_onboarding` | — |
| 12 | `getCompany` | `soloips_company_get` | — |
| 13 | `getCompanyTree` | `soloips_company_get_tree` | — |
| 14 | `listSubsidiaries` | `soloips_company_list_subsidiaries` | — |
| 15 | `listDepartments` | `soloips_department_list` | — |
| 16 | `getEmployee` | `soloips_employee_get` | — |
| 17 | `getAppointment` | `soloips_appointment_get` | — |
| 18 | `getDocumentVersion` | `soloips_document_version_get` | — |
| 19 | `getOperation` | `soloips_operation_get` | — |
| 20 | `listPendingOperations` | `soloips_operation_list_pending` | — |

**〔待实现〕** 本清单是**目标形状**，无任何一项已注册实现（§0：Host 半边与工具注册属 BE-6，未实现）。

**两条边界**〔约束〕：

1. `close()` **不暴露**为工具或 Remote（会把 domain 生命周期交给浏览器）。
2. **每个工具必须对应一个已存在的命令 kind**；无 kind 的动作不得暴露为工具。`SoloipsOperationKind` 当前**无 `team.*` 项**，故编组/团队类工具名（如 `soloips_team_update_function`）**待 BE-3 新增 kind 后才成立**——在此之前不得定稿，属〔待决〕。

**〔未验证〕** 「DSH 工具名**禁止**点号」未在源码中找到显式校验；上述区分依据是**官方命名先例 + 各协议层分隔符语义**〔推断〕，不是已核实的禁用规则。

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

**〔约束〕S0 过渡例外：accountId 的临时绑定（2026-09-17 用户批准）**

契约目标仍是「accountId 来自 DSH Session」。但 S0 尚未接入认证（P1 Auth 属后期里程碑），
adapter 的 session 端口只有会话持久化、没有账户身份面，core 也没有任何可信账户来源。
因此本阶段采用以下**受限临时决定**，并在 S0 验收中**不得**声称已满足多租户隔离：

| 项 | S0 临时做法 | P1 Auth 的目标做法 |
|---|---|---|
| 来源 | 部署层经插件 config 注入（`accountId` 字段），Host 打开 store 时绑定 | DSH Session → 账户映射 |
| 信任依据 | **部署配置的控制权 + Host 内部调用边界**，不是字符串校验 | 宿主签发的会话身份 |
| 基数 | 一个业务存储根**只绑定一个账户**；数据根内出现其他账户的公司记录即拒绝打开（错误码 `SOLOIPS_CORE_ACCOUNT_MISMATCH`——**〔待实现〕BE-1 交付**，见下方注） | 多账户共享数据面时按账户隔离 |
| 命令面 | 业务命令、UI、模型**不得**逐次传入或覆盖 accountId | 每命令携带由 Session 派生的 `SoloipsAuthContext` |

**〔待实现〕C-2：本节的 account-binding 机制**（2026-09-18 更正）

> **本表的「S0 临时做法」列是目标设计，当前代码尚未实现。** 特别地，错误码 `SOLOIPS_CORE_ACCOUNT_MISMATCH` **不是既有契约**——
> `SoloipsCoreErrorCode` 联合中**没有**该码，`SoloipsCoreConfig` 也**没有** `accountId` 键；
> `createCompany` 目前**硬编码**写入 `accountId: "seed"`。**来源 + 日期 + 边界**：读源确认
> `packages/core/src/index.ts:70-75`、`contracts.ts:487-505`、`store.ts:371-374`（2026-09-18 核对）。
>
> 因此**不得**把本节当作已生效的既有契约引用（此前 PRD 与 UI 设计已发生过此类引用）。该机制的交付责任是 **BE-1「账户绑定落地」**：
> core config 增 `accountId`（必填注入）→ 打开时校验数据根内公司记录同账户、否则 fail-closed →
> 新增稳定码 `SOLOIPS_CORE_ACCOUNT_MISMATCH` → `createCompany` 写入真实 `accountId`（去掉 `"seed"`）。
> 形状成立时间以 BE-1 验收为准。

- 平台公司（`platform`）/ 运营子公司（`operation`）的官方账户初始化**不在 S0 范围**，且不自动归属部署账户。
- 存量占位数据（旧 `"seed"` 账户写下的记录）**不认领、不自动改归**部署账户；换绑后旧操作不得重放。

```typescript
/**
 * 权限校验结果
 */
export type SoloipsPermissionResult =
  | { readonly allowed: true; readonly context: SoloipsAuthContext }
  | { readonly allowed: false; readonly reason: string };
```

### 3.2 正确的权限校验（修复 Promise || 问题）

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

### 4.2 实现〔待实现，M0.2 形态〕

> **〔待实现〕C-7（2026-09-18）**：本节代码是 **M0.2 的目标形态**（`quota` 计数器表 + `quotaVersion` 乐观锁），**不是 M0.1 的实现要求**。M0.1 的配额口径见 §4.3，两者不得混引。
>
> 由此同时消除 §2 与 §4.2 的类型一致性缺口：`SoloipsQuotaCounter`（下图）是**持久记录**形态，属 M0.2 新增表；§2 的类型清单**有意不含**它——§2 的 `SoloipsEntitlementRecord` 是账户权益，本节的 `quota` 表是**按 `accountId+resourceType` 的计数器**，两者职责不同。M0.2 落地时须把 `SoloipsQuotaCounter` 的持久形态登记进 §2（P2 遗留项，见 §0 C-7）。

```typescript
/**
 * 配额计数器（用于原子操作）
 * 三层配额下按 resourceType 分开计数：'company'（顶层用户公司）/ 'subsidiary'（子公司）
 */
export interface SoloipsQuotaCounter {
  readonly resourceType: 'company' | 'subsidiary';
  readonly accountId: string;
  readonly currentCount: number;
  readonly quotaVersion: number;
}

/**
 * 创建公司（原子操作）
 * 在同一提交门内完成：选择配额 → 原子递增 → 创建公司（失败回滚）
 */
export class SoloipsCompanyService {
  constructor(
    private readonly domain: StorageDomain,
    private readonly entitlements: EntitlementResolver,
  ) {}

  /**
   * 原子创建公司
   * 使用乐观锁确保并发安全；平台/运营公司不占用户配额
   */
  async createCompany(
    ctx: SoloipsAuthContext,
    name: string,
    type: SoloipsCompanyType = 'enterprise',
    parentCompanyId?: SoloipsCompanyId,
  ): Promise<{ success: true; company: SoloipsCompanyRecord } | { success: false; reason: string }> {
    // 0. 层级校验：子公司必须有父公司，且父公司同账户
    if (type === 'subsidiary') {
      if (parentCompanyId === undefined) {
        return { success: false, reason: 'subsidiary_requires_parent' };
      }
      const parent = await this.domain.table('company').get(parentCompanyId);
      if (!parent) return { success: false, reason: 'parent_not_found' };
      if (parent.accountId !== ctx.accountId) {
        return { success: false, reason: 'parent_account_mismatch' };
      }
    }

    // 1. 获取权益快照（包含版本号）；官方公司不占配额
    const countsAgainstQuota = type === 'enterprise' || type === 'subsidiary';
    const snapshot = await this.entitlements.resolve(ctx.accountId);
    const resourceType: 'company' | 'subsidiary' = type === 'subsidiary' ? 'subsidiary' : 'company';
    const limit = resourceType === 'subsidiary' ? snapshot.subsidiaryLimit : snapshot.companyLimit;

    // 2. 原子递增配额（如果失败说明超限）
    if (countsAgainstQuota && limit !== -1) {
      const incrementResult = await this.atomicIncrement(
        resourceType,
        ctx.accountId,
        snapshot.quotaVersion,
        limit,
      );

      if (!incrementResult.success) {
        return {
          success: false,
          reason: `${resourceType}_limit_exceeded: current=${incrementResult.currentCount}, limit=${limit}`,
        };
      }
    }

    // 3. 创建公司记录（type 与 parentCompanyId 必须落库，否则与 §2 数据模型不一致）
    const company: SoloipsCompanyRecord = {
      id: this.generateId('company'),
      accountId: ctx.accountId,
      type,
      ...(parentCompanyId === undefined ? {} : { parentCompanyId }),
      name,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    try {
      await this.domain.table('company').put(company.id, company);

      // 4. 创建默认总助理任职
      await this.createDefaultGeneralAssistant(company.id);

      // 5. 记录审计
      await this.audit({
        companyId: company.id,
        actorId: ctx.accountId,
        action: 'company_created',
        resourceType: 'company',
        resourceId: company.id,
        outcome: 'success',
        details: { name, type },
      });

      return { success: true, company };
    } catch (error) {
      // 6. 失败时回滚配额（崩溃窗口由未决意图恢复核对兜底，见 §4.1）
      if (countsAgainstQuota && limit !== -1) {
        await this.atomicDecrement(resourceType, ctx.accountId);
      }
      throw error;
    }
  }

  /**
   * 原子递增配额（使用乐观锁）
   */
  private async atomicIncrement(
    resourceType: 'company' | 'subsidiary',
    accountId: string,
    expectedVersion: number,
    limit: number,
  ): Promise<{ success: boolean; currentCount: number }> {
    const counterKey = `quota:${resourceType}:${accountId}`;

    // 读取当前计数器
    const counter = await this.domain.table('quota').get(counterKey);
    const currentCount = counter?.currentCount ?? 0;

    // 检查是否超限
    if (currentCount >= limit) {
      return { success: false, currentCount };
    }

    // 乐观锁更新
    try {
      await this.domain.table('quota').update(counterKey, (existing) => {
        if (!existing) {
          return { resourceType, accountId, currentCount: 1, quotaVersion: expectedVersion + 1 };
        }
        // 版本不匹配，说明有并发修改
        if (existing.quotaVersion !== expectedVersion) {
          throw new Error('CONCURRENT_MODIFICATION');
        }
        // 再次检查限额
        if (existing.currentCount >= limit) {
          throw new Error('LIMIT_EXCEEDED');
        }
        return {
          ...existing,
          currentCount: existing.currentCount + 1,
          quotaVersion: existing.quotaVersion + 1,
        };
      });
      return { success: true, currentCount: currentCount + 1 };
    } catch (error) {
      if ((error as Error).message === 'CONCURRENT_MODIFICATION' ||
          (error as Error).message === 'LIMIT_EXCEEDED') {
        return { success: false, currentCount };
      }
      throw error;
    }
  }

  /**
   * 原子递减配额（用于回滚）
   */
  private async atomicDecrement(
    resourceType: 'company' | 'subsidiary',
    accountId: string,
  ): Promise<void> {
    const counterKey = `quota:${resourceType}:${accountId}`;
    await this.domain.table('quota').update(counterKey, (existing) => {
      if (!existing) return existing;
      return {
        ...existing,
        currentCount: Math.max(0, existing.currentCount - 1),
      };
    });
  }
}
```

### 4.3 M0.1 的配额形态（提交门计数，不建表）

**〔约束〕C-1/C-7 的 M0.1 落实口径（2026-09-18 裁定）**：

| 项 | M0.1 | M0.2 |
|---|---|---|
| 策略值来源 | 部署配置注入 `planCode`（缺省 `free`），三层配额表**内联为常量** | `SoloipsEntitlementRecord` + `EntitlementResolver` |
| 计数载体 | **不建表**——按 `accountId + type` 扫描既有 `company` 记录 | `quota` 计数器表 + `quotaVersion` |
| 并发保护 | 提交门内串行 + 跨进程 writer lease | 乐观锁（`quotaVersion` CAS） |
| 校验点 | `createCompany` 的**提交门 `mutate` 回调内、`put("company", ...)` 之前**复查 | 同位置 + 原子递增/回滚 |

**一致性依据**（对齐 §4.1 的三件事，**不是**数据库事务）：因为「计数 → 写入」都在**同一 `mutate` 回调**内、且在门持有的串行槽位上，计数与插入之间**没有其他本地提交**可插入；跨进程由租约排除。

**失败语义**：返回**可判定的拒绝**（稳定码，附 `{resourceType, current, limit}`），且**不产生任何业务写**。

**为什么 M0.1 不用乐观锁**〔约束〕：§4.2 的乐观锁针对「并发 Host / 多账户共享数据面」。M0.1 是「一个业务存储根只绑定一个账户」+ 单 writer（§3.1），计数即权威。**若后续要做多 Host 或多账户，必须回到 §4.2 的计数器形态**——这是显式登记的偏差，不得默认延续。

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

### 5.2 Client Plugin 正确用法

**错误示例（完整设计中）**：
```typescript
client.registerRoute('/soloips/*', { ... });     // ❌ 不存在此方法
client.registerSlot('sidebar', { id: '...', ... });  // ❌ 不存在此方法
```

**正确用法（基于 DSH 官方文档）**：

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

**注意**：具体 API 需要按实际安装的 DSH 版本验证，以上为参考结构。

---

## 6. 统一里程碑

### 6.1 修订后的里程碑

| 切片 | 目标 | 最小验收出口 |
|---|---|---|
| **S0 接通** | 插件装配、受控写入、同包重启 | 加载成功 + 受控写 + 重启读回 |
| **S0 多公司基础** | 跨账户拒绝、引用归属、撤职失效、并发配额 | 隔离测试通过 |
| **M0.1 Web 基础** | 公司/部门/团队 CRUD | 创建公司成功 |
| **M0.2 订阅限制** | 三层配额生效（Free 1 公司 + 0 子公司；Pro 1 公司 + 3 子公司） | 免费用户无法创建第二公司或任一子公司 |
| **M0.3 3D 基础** | 场景搭建 | 能渲染公司结构 |
| **M1 双版本联调** | Web ↔ 3D 状态同步 | 操作同步 |
| **M2 总助理** | AI 驱动运营 | 对话完成日常事务 |
| **M3 日志监测** | 三层日志 | 能查询审计记录 |

> **界面路线注记（2026-09-17）**：上表切片口径不变。M0.1「Web 基础」的界面来源为**复制官方 Web 插件 fork 改造的 `soloips-web`**（验收出口「创建公司成功」不变）；M0.3（3D 基础）与 M1（双版本联调）随原「自研 Web+3D 双版本」路线**推迟**，解冻时点〔待决〕。见 [`docs/decisions/web-ui-fork.md`](../decisions/web-ui-fork.md)。

> **C-1 配额口径统一（2026-09-18）**：上表 M0.1 的验收出口**不变**。配额工作的分工是——
> **M0.1 内做 Free 1/0 的提交门计数校验（不建表、不用乐观锁）；完整的 Entitlement 记录与 `quota` 表形态属 M0.2。**
> 本表述与 §0「C-1 配额口径」及 §4.3 逐字一致，两处口径以此为准。此前 §0 曾写「S0 不校验配额」，与「M0.2 才做配额」并存易被读成冲突——现统一为上述分工。

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
