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
| `SoloipsEmployeeRecord` | **已实现** | `id`/`displayName`/`currentDocuments`/`assemblyEvidence`/`memoryInitialized`/`verifiedCapabilities` |
| `SoloipsAppointmentRecord` | **已实现（部分字段）** | `id`/`employeeId`/`departmentId`/`requiredCapabilities`/`generation`/`status`；`scope`(判别联合) 与 `role` 见 §2 设计稿 |
| `SoloipsDocumentVersionRecord` | **已实现** | `versionId`/`ownerId`/`documentType`/`content`/`digest`/`previousVersionId?`/`appointmentId?` |
| `SoloipsOperationRecord` | **已实现** | `id`/`kind`/`status`/`employeeId?`/`intent`/`result?` |
| 文档类型 `ip_summary` / `storyboard` | **未实现** | 代码枚举只有 `profile`/`avatar`/`soul`/`operating`/`work` |
| `SoloipsEntitlement*` 与三层配额（§3/§4） | **未实现** | 目标设计；S0 不校验配额 |
| `SoloipsAuthContext` / `SoloipsPermissionService` | **未实现** | S0 用部署账户绑定替代，见 §3.1 临时例外 |
| `SoloipsTeamBindingRecord`（及独立 `Team` 实体） | **未实现** | adapter 的 `team` 端口是 fail-closed 占位；任务/attempt 状态归官方 Team |
| `SoloipsExecutionBindingRecord` | **未实现** | 撤职使执行失效的验收因此尚未覆盖 |
| `SoloipsAuditRecord` | **未实现** | 审计落库属 M3 里程碑 |
| 跨账户拒绝 / 并发配额 / 多租户隔离验收 | **未实现** | 属「S0 多公司基础」，尚未通过 |

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
 */
export type SoloipsAppointmentScope =
  | { readonly kind: 'company'; readonly companyId: SoloipsCompanyId }
  | { readonly kind: 'department'; readonly companyId: SoloipsCompanyId; readonly departmentId: SoloipsDepartmentId }
  | { readonly kind: 'team'; readonly companyId: SoloipsCompanyId; readonly teamBindingId: string };

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
 */
export interface SoloipsTeamRecord {
  readonly id: SoloipsTeamId;
  readonly companyId: SoloipsCompanyId;
  readonly departmentId?: SoloipsDepartmentId;  // 可选归属部门
  readonly name: string;
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
// 员工（员工身份与任职分离）
// =====================

/**
 * 员工记录
 * 员工身份独立于任职，任职才是权限来源
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
| 基数 | 一个业务存储根**只绑定一个账户**；数据根内出现其他账户的公司记录即拒绝打开（`SOLOIPS_CORE_ACCOUNT_MISMATCH`） | 多账户共享数据面时按账户隔离 |
| 命令面 | 业务命令、UI、模型**不得**逐次传入或覆盖 accountId | 每命令携带由 Session 派生的 `SoloipsAuthContext` |

- 平台公司（`platform`）/ 运营子公司（`operation`）的官方账户初始化**不在 S0 范围**，且不自动归属部署账户。
- 存量占位数据（旧 `"seed"` 账户写下的记录）**不认领、不自动改归**部署账户；换绑后旧操作不得重放。


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

### 4.2 实现

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
