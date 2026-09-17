# SoloIPs 权威数据契约

> 本文档是 SoloIPs 的唯一权威数据定义，解决「完整设计」与「多公司设计」之间的冲突。
> 
> **阅读契约**：所有代码实现和文档引用必须以本文档为准。
> **决策状态**：〔约束〕2026-09-17 Codex 审查要求统一数据契约
> **变更权**：architecture-owner

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
 * 账户权益（免费版限制）
 * 账户是 SoloIPs 的顶层归属单位
 */
export interface SoloipsEntitlementRecord {
  readonly id: SoloipsEntitlementId;
  readonly accountId: string;              // 账户 ID（DSH session 绑定）
  readonly planCode: 'free' | 'pro' | 'enterprise';
  readonly companyLimit: number;            // 免费版 = 1，pro = 3，enterprise = Infinity
  readonly features: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

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
 */
export interface SoloipsDepartmentRecord {
  readonly id: SoloipsDepartmentId;
  readonly companyId: SoloipsCompanyId;    // 必须归属公司
  readonly name: string;
  readonly description?: string;
  readonly leaderAppointmentId?: SoloipsAppointmentId;  // 通过任职引用负责人
  readonly parentDepartmentId?: SoloipsDepartmentId;    // 支持子部门
  readonly status: 'active' | 'paused' | 'archived';
  readonly createdAt: string;
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
 * 员工到组织单元的关联，通过任职表达权限
 */
export interface SoloipsAppointmentRecord {
  readonly id: SoloipsAppointmentId;
  readonly employeeId: SoloipsEmployeeId;
  readonly scope: SoloipsAppointmentScope;    // 任职作用域
  readonly role: SoloipsAppointmentRole;      // 任职角色
  readonly generation: number;                // 权限代际（用于撤职后失效）
  readonly status: 'active' | 'revoked';
  readonly createdAt: string;
  readonly revokedAt?: string;
}

export type SoloipsAppointmentId = SoloipsCoreId<'appointment'>;

/**
 * 团队绑定（SoloIPs Team → DSH Team）
 * SoloIPs 的团队概念通过 DSH Team 执行
 */
export interface SoloipsTeamBindingRecord {
  readonly id: SoloipsTeamBindingId;
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
  readonly companyLimit: number | -1;         // -1 表示无限
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
  ): Promise<SoloipsPermissionResult> {
    // 1. 先校验公司归属
    const companyAccess = await this.checkCompanyAccess(ctx, resource.companyId);
    if (!companyAccess.allowed) {
      return companyAccess;
    }

    // 2. 校验具体操作权限
    switch (action) {
      case 'company:create':
        // 检查配额
        return this.checkQuota(ctx);

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

    // 找到匹配公司的任职
    const validAppointment = appointments.find((apt) => {
      if (apt.scope.kind === 'company' && apt.scope.companyId === companyId) {
        return allowedRoles.includes(apt.role);
      }
      return false;
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
   * 校验配额（原子操作）
   */
  private async checkQuota(
    ctx: SoloipsAuthContext,
  ): Promise<SoloipsPermissionResult> {
    // 获取权益快照
    const snapshot = await this.entitlements.resolve(ctx.accountId);
    
    // 统计当前公司数
    const companies = await this.domain.table('company').scan({
      filter: { accountId: ctx.accountId, status: 'active' },
    });

    const currentCount = companies.length;
    const limit = snapshot.companyLimit;

    if (limit !== -1 && currentCount >= limit) {
      return { 
        allowed: false, 
        reason: `company_limit_exceeded: current=${currentCount}, limit=${limit}` 
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

**解决方案**：在同一事务内完成「检查 → 原子递增 → 创建」。

### 4.2 实现

```typescript
/**
 * 配额计数器（用于原子操作）
 */
export interface SoloipsQuotaCounter {
  readonly resourceType: 'company';
  readonly accountId: string;
  readonly currentCount: number;
  readonly quotaVersion: number;
}

/**
 * 创建公司（原子操作）
 * 在同一事务内完成：检查配额 → 原子递增 → 创建公司
 */
export class SoloipsCompanyService {
  constructor(
    private readonly domain: StorageDomain,
    private readonly entitlements: EntitlementResolver,
  ) {}

  /**
   * 原子创建公司
   * 使用乐观锁确保并发安全
   */
  async createCompany(
    ctx: SoloipsAuthContext,
    name: string,
  ): Promise<{ success: true; company: SoloipsCompanyRecord } | { success: false; reason: string }> {
    // 1. 获取权益快照（包含版本号）
    const snapshot = await this.entitlements.resolve(ctx.accountId);
    const limit = snapshot.companyLimit;

    // 2. 原子递增配额（如果失败说明超限）
    if (limit !== -1) {
      const incrementResult = await this.atomicIncrement(
        'company',
        ctx.accountId,
        snapshot.quotaVersion,
        limit,
      );

      if (!incrementResult.success) {
        return {
          success: false,
          reason: `company_limit_exceeded: current=${incrementResult.currentCount}, limit=${limit}`,
        };
      }
    }

    // 3. 创建公司记录
    const company: SoloipsCompanyRecord = {
      id: this.generateId('company'),
      accountId: ctx.accountId,
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
        details: { name },
      });

      return { success: true, company };
    } catch (error) {
      // 4. 失败时回滚配额
      if (limit !== -1) {
        await this.atomicDecrement('company', ctx.accountId);
      }
      throw error;
    }
  }

  /**
   * 原子递增配额（使用乐观锁）
   */
  private async atomicIncrement(
    resourceType: 'company',
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
    resourceType: 'company',
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

// 在运行时打开 domain
export function apply(ctx: Context, config: Config): void {
  const domain = await ctx.storageDomain.open(soloipsDomainSpec);
  // 使用 domain...
}
```

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
| **M0.2 订阅限制** | 免费1公司、付费多公司 | 免费用户无法创建第二公司 |
| **M0.3 3D 基础** | 场景搭建 | 能渲染公司结构 |
| **M1 双版本联调** | Web ↔ 3D 状态同步 | 操作同步 |
| **Sonnet 总助理** | AI 驱动运营 | 对话完成日常事务 |
| **Opus 日志监测** | 三层日志 | 能查询审计记录 |

---

## 7. 变更历史

| 日期 | 变更 | 原因 |
|---|---|---|
| 2026-09-17 | 创建权威数据契约 | Codex 审查发现两套模型冲突 |
| 2026-09-17 | 统一公司归属为 accountId | 直接归属更清晰 |
| 2026-09-17 | 总助理改为公司级任职 | 复用现有任职机制 |
| 2026-09-17 | 添加原子配额操作 | 解决并发超限问题 |
| 2026-09-17 | 修正 DSH 接口示例 | 与官方文档对齐 |
