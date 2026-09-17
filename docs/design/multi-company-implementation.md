# SoloIPs：多公司架构技术实现指南

| 阅读契约 | 内容 |
|---|---|
| 身份 | `SOLO-ORG-IMPL`；多公司架构的 TypeScript 接口定义与实现示例 |
| 目的 | 提供可直接实现的类型定义和代码模板 |
| 范围 | 接口定义、类型约束、实现模式 |
| 决策状态 | 〔设计提案〕；基于 multi-company-organization.md |
| 依据 | [多公司架构设计](./multi-company-organization.md)、[技术架构](../technical-architecture.md) |
| 变更权 | 产品架构师维护 |

## 1. 类型定义扩展

### 1.1 ID 类型扩展（src/ids.ts）

```typescript
// src/ids.ts 扩展

import { soloipsCoreBrand } from "./contracts.js";

/**
 * 核心 ID 品牌类型工厂
 */
export type SoloipsCoreId<Name extends string> = string & { readonly [soloipsCoreBrand]: Name };

// 现有 ID 类型（保留）
export type SoloipsCompanyId = SoloipsCoreId<"company">;
export type SoloipsDepartmentId = SoloipsCoreId<"department">;
export type SoloipsEmployeeId = SoloipsCoreId<"employee">;
export type SoloipsAppointmentId = SoloipsCoreId<"appointment">;
export type SoloipsDocumentVersionId = SoloipsCoreId<"document-version">;
export type SoloipsOperationId = SoloipsCoreId<"operation">;

// 新增 ID 类型
export type SoloipsSubscriptionId = SoloipsCoreId<"subscription">;
export type SoloipsTeamId = SoloipsCoreId<"team">;
export type SoloipsChiefAssistantId = SoloipsCoreId<"chief_assistant">;
export type SoloipsOperationLogId = SoloipsCoreId<"operation_log">;
export type SoloipsMetricsId = SoloipsCoreId<"metrics">;
export type SoloipsAlertId = SoloipsCoreId<"alert">;
export type SoloipsAlertRuleId = SoloipsCoreId<"alert_rule">;

// 校验正则（统一格式）
const ID_PATTERNS: Record<string, RegExp> = {
  company: /^company_[a-z0-9]{16}$/,
  department: /^dept_[a-z0-9]{16}$/,
  employee: /^emp_[a-z0-9]{16}$/,
  appointment: /^appt_[a-z0-9]{16}$/,
  document_version: /^docv_[a-z0-9]{16}$/,
  operation: /^op_[a-z0-9]{16}$/,
  subscription: /^sub_[a-z0-9]{16}$/,
  team: /^team_[a-z0-9]{16}$/,
  chief_assistant: /^ca_[a-z0-9]{16}$/,
  operation_log: /^olog_[a-z0-9]{16}$/,
  metrics: /^met_[a-z0-9]{16}$/,
  alert: /^alert_[a-z0-9]{16}$/,
  alert_rule: /^arule_[a-z0-9]{16}$/,
};

// 校验函数
export function isSubscriptionId(value: string): value is SoloipsSubscriptionId {
  return ID_PATTERNS.subscription.test(value);
}

export function isTeamId(value: string): value is SoloipsTeamId {
  return ID_PATTERNS.team.test(value);
}

export function isChiefAssistantId(value: string): value is SoloipsChiefAssistantId {
  return ID_PATTERNS.chief_assistant.test(value);
}

export function isOperationLogId(value: string): value is SoloipsOperationLogId {
  return ID_PATTERNS.operation_log.test(value);
}

// 工厂函数（使用 nanoid 或类似工具生成）
export function newSubscriptionId(): SoloipsSubscriptionId {
  return `sub_${nanoid(16)}` as SoloipsSubscriptionId;
}

export function newTeamId(): SoloipsTeamId {
  return `team_${nanoid(16)}` as SoloipsTeamId;
}

export function newChiefAssistantId(): SoloipsChiefAssistantId {
  return `ca_${nanoid(16)}` as SoloipsChiefAssistantId;
}
```

### 1.2 记录类型扩展（src/contracts.ts 新增部分）

```typescript
// src/contracts.ts 新增类型定义

// ─────────────────────────────────────────────────────────────────────────────
// §8 订阅计划
// ─────────────────────────────────────────────────────────────────────────────

export type SoloipsSubscriptionPlan = "free" | "pro" | "enterprise";

export type SoloipsSubscriptionRecord = {
  readonly id: SoloipsSubscriptionId;
  readonly ownerId: string;                    // 外部用户账户 ID
  readonly plan: SoloipsSubscriptionPlan;
  readonly maxCompanies: number;
  readonly maxDepartmentsPerCompany: number;
  readonly maxTeamsPerDepartment: number;
  readonly maxEmployeesPerCompany: number;
  readonly maxChiefAssistants: number;
  readonly logRetentionDays: number;
  readonly monitoringRetentionDays: number;
  readonly apiRateLimit: number;
  readonly createdAt: string;
  readonly expiresAt?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// §9 团队
// ─────────────────────────────────────────────────────────────────────────────

export type SoloipsTeamStatus = "active" | "suspended" | "archived";

export type SoloipsTeamRecord = {
  readonly id: SoloipsTeamId;
  readonly departmentId: SoloipsDepartmentId;
  readonly name: string;
  readonly description?: string;
  readonly leaderEmployeeId?: SoloipsEmployeeId;
  readonly createdBy: SoloipsEmployeeId;
  readonly createdAt: string;
  readonly status: SoloipsTeamStatus;
};

// ─────────────────────────────────────────────────────────────────────────────
// §10 任职角色
// ─────────────────────────────────────────────────────────────────────────────

export type SoloipsAppointmentRole = 
  | "chief_assistant"
  | "department_leader"
  | "team_leader"
  | "member";

// 扩展现有 AppointmentRecord
export type SoloipsAppointmentRecord = {
  readonly id: SoloipsAppointmentId;
  readonly employeeId: SoloipsEmployeeId;
  readonly departmentId: SoloipsDepartmentId;
  readonly teamId?: SoloipsTeamId;              // 可选：团队级任职
  readonly role: SoloipsAppointmentRole;
  readonly requiredCapabilities: readonly string[];
  readonly generation: number;
  readonly status: SoloipsAppointmentStatus;
  readonly createdAt: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// §11 总助理
// ─────────────────────────────────────────────────────────────────────────────

export type SoloipsReportingMode = "daily_brief" | "on_demand" | "milestone";
export type SoloipsChiefAssistantStatus = "active" | "inactive";

export type SoloipsChiefAssistantRecord = {
  readonly id: SoloipsChiefAssistantId;
  readonly employeeId: SoloipsEmployeeId;
  readonly companyId: SoloipsCompanyId;
  readonly appointmentId: SoloipsAppointmentId;
  readonly responsibilities: readonly string[];
  readonly reportingMode: SoloipsReportingMode;
  readonly status: SoloipsChiefAssistantStatus;
  readonly createdAt: string;
  readonly createdBy: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// §12 日志
// ─────────────────────────────────────────────────────────────────────────────

export type SoloipsActorType = 
  | "owner"
  | "chief_assistant"
  | "department_leader"
  | "team_leader"
  | "employee"
  | "system";

export type SoloipsAction = 
  | "create"
  | "update"
  | "delete"
  | "archive"
  | "restore"
  | "assign"
  | "revoke"
  | "approve"
  | "reject"
  | "escalate";

export type SoloipsEntityType = 
  | "company"
  | "department"
  | "team"
  | "employee"
  | "appointment"
  | "chief_assistant"
  | "subscription"
  | "document"
  | "work";

export type SoloipsOperationContext = {
  readonly companyId?: SoloipsCompanyId;
  readonly departmentId?: SoloipsDepartmentId;
  readonly teamId?: SoloipsTeamId;
  readonly ipAddress?: string;
  readonly userAgent?: string;
};

export type SoloipsOperationResult = 
  | { readonly status: "success" }
  | { readonly status: "failure"; readonly reason: string };

export type SoloipsOperationLogRecord = {
  readonly id: SoloipsOperationLogId;
  readonly timestamp: string;
  readonly actorId: string;
  readonly actorType: SoloipsActorType;
  readonly action: SoloipsAction;
  readonly entityType: SoloipsEntityType;
  readonly entityId: string;
  readonly context: SoloipsOperationContext;
  readonly result: SoloipsOperationResult;
  readonly metadata?: Readonly<Record<string, SoloipsJsonValue>>;
};

// ─────────────────────────────────────────────────────────────────────────────
// §13 系统监测
// ─────────────────────────────────────────────────────────────────────────────

export type SoloipsMetricsCategory = "performance" | "usage" | "health" | "business";

export type SoloipsSystemMetricsRecord = {
  readonly id: SoloipsMetricsId;
  readonly timestamp: string;
  readonly companyId: SoloipsCompanyId;
  readonly category: SoloipsMetricsCategory;
  readonly metrics: Readonly<Record<string, number>>;
  readonly tags?: Readonly<Record<string, string>>;
};

// ─────────────────────────────────────────────────────────────────────────────
// §14 告警
// ─────────────────────────────────────────────────────────────────────────────

export type SoloipsAlertLevel = "info" | "warning" | "error" | "critical";
export type SoloipsAlertCategory = 
  | "upstream_failure"
  | "resource_limit"
  | "performance"
  | "security"
  | "business";

export type SoloipsAlertRecord = {
  readonly id: SoloipsAlertId;
  readonly timestamp: string;
  readonly level: SoloipsAlertLevel;
  readonly category: SoloipsAlertCategory;
  readonly title: string;
  readonly message: string;
  readonly source: string;
  readonly companyId: SoloipsCompanyId;
  readonly acknowledged: boolean;
  readonly acknowledgedBy?: string;
  readonly acknowledgedAt?: string;
  readonly resolved: boolean;
  readonly resolvedAt?: string;
};

export type SoloipsAlertConditionOperator = "gt" | "lt" | "eq" | "gte" | "lte";

export type SoloipsAlertCondition = {
  readonly metric: string;
  readonly operator: SoloipsAlertConditionOperator;
  readonly threshold: number;
  readonly duration?: number;
};

export type SoloipsAlertActionType = "notify" | "webhook" | "email";

export type SoloipsAlertAction = {
  readonly type: SoloipsAlertActionType;
  readonly config: Readonly<Record<string, string>>;
};

export type SoloipsAlertRuleRecord = {
  readonly id: SoloipsAlertRuleId;
  readonly companyId: SoloipsCompanyId;
  readonly name: string;
  readonly enabled: boolean;
  readonly condition: SoloipsAlertCondition;
  readonly actions: readonly SoloipsAlertAction[];
  readonly createdAt: string;
  readonly updatedAt: string;
};
```

## 2. 权限服务接口

### 2.1 权限服务定义

```typescript
// src/services/permission-service.ts

import type {
  SoloipsCompanyId,
  SoloipsDepartmentId,
  SoloipsTeamId,
  SoloipsEmployeeId,
  SoloipsAppointmentId,
  SoloipsSubscriptionId,
} from "./contracts.js";

/**
 * 权限类型
 */
export type SoloipsPermission = 
  | "company.create"
  | "company.delete"
  | "company.manage_subscription"
  | "company.view"
  | "department.create"
  | "department.update"
  | "department.delete"
  | "department.manage_leader"
  | "team.create"
  | "team.update"
  | "team.delete"
  | "team.manage_leader"
  | "employee.recruit"
  | "employee.manage"
  | "chief_assistant.appoint"
  | "chief_assistant.revoke"
  | "work.review"
  | "work.approve"
  | "log.view_all"
  | "log.view_department"
  | "log.view_team"
  | "monitoring.view"
  | "alert.receive"
  | "alert.acknowledge";

/**
 * 角色类型
 */
export type SoloipsRole = 
  | "owner" 
  | "chief_assistant" 
  | "department_leader" 
  | "team_leader" 
  | "member";

/**
 * 权限上下文
 */
export interface SoloipsPermissionContext {
  readonly userId: string;
  readonly subscriptionId: SoloipsSubscriptionId;
  readonly companyId?: SoloipsCompanyId;
  readonly departmentId?: SoloipsDepartmentId;
  readonly teamId?: SoloipsTeamId;
  readonly employeeId?: SoloipsEmployeeId;
  readonly appointmentId?: SoloipsAppointmentId;
}

/**
 * 权限服务接口
 */
export interface SoloipsPermissionService {
  /**
   * 检查是否具有特定权限
   */
  checkPermission(
    context: SoloipsPermissionContext,
    permission: SoloipsPermission
  ): Promise<boolean>;

  /**
   * 获取用户在当前上下文中拥有的所有权限
   */
  getPermissions(context: SoloipsPermissionContext): Promise<readonly SoloipsPermission[]>;

  /**
   * 获取用户的最高角色
   */
  getHighestRole(context: SoloipsPermissionContext): Promise<SoloipsRole | null>;

  /**
   * 检查用户是否是 Owner
   */
  isOwner(context: SoloipsPermissionContext): Promise<boolean>;
}
```

### 2.2 权限服务实现

```typescript
// src/services/impl/permission-service-impl.ts

import type { SoloipsPermissionService } from "./permission-service.js";
import type {
  SoloipsPermissionContext,
  SoloipsPermission,
  SoloipsRole,
} from "./permission-service.js";
import type { SoloipsPermissionStore } from "./stores/permission-store.js";
import { SoloipsCoreError } from "../errors.js";

/**
 * 权限规则定义
 */
const PERMISSION_RULES: ReadonlyMap<SoloipsPermission, ReadonlySet<SoloipsRole>> = new Map([
  // 公司级别
  ["company.create", new Set(["owner"])],
  ["company.delete", new Set(["owner"])],
  ["company.manage_subscription", new Set(["owner"])],
  ["company.view", new Set(["owner", "chief_assistant", "department_leader", "team_leader", "member"])],
  
  // 部门级别
  ["department.create", new Set(["owner", "chief_assistant"])],
  ["department.update", new Set(["owner", "chief_assistant", "department_leader"])],
  ["department.delete", new Set(["owner", "chief_assistant"])],
  ["department.manage_leader", new Set(["owner", "chief_assistant"])],
  
  // 团队级别
  ["team.create", new Set(["owner", "chief_assistant", "department_leader"])],
  ["team.update", new Set(["owner", "chief_assistant", "department_leader", "team_leader"])],
  ["team.delete", new Set(["owner", "chief_assistant", "department_leader"])],
  ["team.manage_leader", new Set(["owner", "chief_assistant", "department_leader"])],
  
  // 员工级别
  ["employee.recruit", new Set(["owner", "chief_assistant", "department_leader", "team_leader"])],
  ["employee.manage", new Set(["owner", "chief_assistant", "department_leader"])],
  
  // 总助理
  ["chief_assistant.appoint", new Set(["owner"])],
  ["chief_assistant.revoke", new Set(["owner"])],
  
  // 审核
  ["work.review", new Set(["owner", "chief_assistant", "department_leader", "team_leader"])],
  ["work.approve", new Set(["owner", "chief_assistant", "department_leader"])],
  
  // 日志
  ["log.view_all", new Set(["owner", "chief_assistant"])],
  ["log.view_department", new Set(["owner", "chief_assistant", "department_leader"])],
  ["log.view_team", new Set(["owner", "chief_assistant", "department_leader", "team_leader"])],
  
  // 监控
  ["monitoring.view", new Set(["owner", "chief_assistant"])],
  
  // 告警
  ["alert.receive", new Set(["owner", "chief_assistant"])],
  ["alert.acknowledge", new Set(["owner", "chief_assistant"])],
]);

/**
 * 角色层级（数字越大权限越高）
 */
const ROLE_HIERARCHY: ReadonlyMap<SoloipsRole, number> = new Map([
  ["member", 0],
  ["team_leader", 1],
  ["department_leader", 2],
  ["chief_assistant", 3],
  ["owner", 4],
]);

export class SoloipsPermissionServiceImpl implements SoloipsPermissionService {
  constructor(private readonly store: SoloipsPermissionStore) {}

  async checkPermission(
    context: SoloipsPermissionContext,
    permission: SoloipsPermission
  ): Promise<boolean> {
    // 1. 获取用户角色
    const role = await this.getHighestRole(context);
    if (role === null) {
      return false;
    }

    // 2. 检查权限规则
    const allowedRoles = PERMISSION_RULES.get(permission);
    if (!allowedRoles) {
      throw new SoloipsCoreError(
        "SOLOIPS_INTERNAL_ERROR",
        `Unknown permission: ${permission}`
      );
    }

    return allowedRoles.has(role);
  }

  async getPermissions(
    context: SoloipsPermissionContext
  ): Promise<readonly SoloipsPermission[]> {
    const role = await this.getHighestRole(context);
    if (role === null) {
      return [];
    }

    const permissions: SoloipsPermission[] = [];
    for (const [permission, allowedRoles] of PERMISSION_RULES) {
      if (allowedRoles.has(role)) {
        permissions.push(permission);
      }
    }
    return permissions;
  }

  async getHighestRole(context: SoloipsPermissionContext): Promise<SoloipsRole | null> {
    // 1. 首先检查是否是 Owner
    if (await this.isOwner(context)) {
      return "owner";
    }

    // 2. 检查总助理
    if (context.appointmentId) {
      const appointment = await this.store.getAppointment(context.appointmentId);
      if (appointment?.role === "chief_assistant") {
        return "chief_assistant";
      }
    }

    // 3. 检查部门组长
    if (context.departmentId) {
      const department = await this.store.getDepartment(context.departmentId);
      if (department?.leaderEmployeeId === context.employeeId) {
        return "department_leader";
      }
    }

    // 4. 检查团队负责人
    if (context.teamId) {
      const team = await this.store.getTeam(context.teamId);
      if (team?.leaderEmployeeId === context.employeeId) {
        return "team_leader";
      }
    }

    // 5. 如果有员工 ID，默认是成员
    if (context.employeeId) {
      return "member";
    }

    return null;
  }

  async isOwner(context: SoloipsPermissionContext): Promise<boolean> {
    const subscription = await this.store.getSubscription(context.subscriptionId);
    return subscription?.ownerId === context.userId;
  }
}
```

## 3. 限制检查服务

### 3.1 限制服务接口

```typescript
// src/services/limit-service.ts

import type {
  SoloipsSubscriptionId,
  SoloipsSubscriptionPlan,
  SoloipsCompanyId,
} from "../contracts.js";

/**
 * 实体类型
 */
export type SoloipsLimitEntityType = 
  | "company"
  | "department"
  | "team"
  | "employee"
  | "chief_assistant";

/**
 * 限制检查结果
 */
export interface SoloipsLimitCheckResult {
  readonly allowed: boolean;
  readonly current: number;
  readonly limit: number;
  readonly reason?: string;
}

/**
 * 订阅使用量
 */
export interface SoloipsSubscriptionUsage {
  readonly subscriptionId: SoloipsSubscriptionId;
  readonly plan: SoloipsSubscriptionPlan;
  readonly companies: SoloipsLimitCheckResult;
  readonly departments: SoloipsLimitCheckResult;
  readonly teams: SoloipsLimitCheckResult;
  readonly employees: SoloipsLimitCheckResult;
  readonly chiefAssistants: SoloipsLimitCheckResult;
}

/**
 * API 速率限制结果
 */
export interface SoloipsRateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: string;
  readonly limit: number;
}

/**
 * 限制检查服务
 */
export interface SoloipsLimitService {
  /**
   * 检查是否允许创建新实体
   */
  canCreate(
    subscriptionId: SoloipsSubscriptionId,
    entityType: SoloipsLimitEntityType,
    parentId?: string
  ): Promise<SoloipsLimitCheckResult>;

  /**
   * 获取订阅使用量
   */
  getUsage(subscriptionId: SoloipsSubscriptionId): Promise<SoloipsSubscriptionUsage>;

  /**
   * 检查 API 速率限制
   */
  checkRateLimit(
    subscriptionId: SoloipsSubscriptionId,
    operation: string
  ): Promise<SoloipsRateLimitResult>;

  /**
   * 获取订阅计划限制
   */
  getPlanLimits(plan: SoloipsSubscriptionPlan): Promise<{
    maxCompanies: number;
    maxDepartmentsPerCompany: number;
    maxTeamsPerDepartment: number;
    maxEmployeesPerCompany: number;
    maxChiefAssistants: number;
    logRetentionDays: number;
    monitoringRetentionDays: number;
    apiRateLimit: number;
  }>;
}
```

### 3.2 订阅计划默认值

```typescript
// src/config/subscription-limits.ts

import type { SoloipsSubscriptionPlan } from "../contracts.js";

export interface SubscriptionPlanLimits {
  readonly maxCompanies: number;
  readonly maxDepartmentsPerCompany: number;
  readonly maxTeamsPerDepartment: number;
  readonly maxEmployeesPerCompany: number;
  readonly maxChiefAssistants: number;
  readonly logRetentionDays: number;
  readonly monitoringRetentionDays: number;
  readonly apiRateLimit: number; // 每分钟
  readonly enabledFeatures: readonly string[];
  readonly disabledFeatures: readonly string[];
}

/**
 * 订阅计划限制表
 */
export const SUBSCRIPTION_PLANS: ReadonlyMap<SoloipsSubscriptionPlan, SubscriptionPlanLimits> = 
  new Map([
    ["free", {
      maxCompanies: 1,
      maxDepartmentsPerCompany: 2,
      maxTeamsPerDepartment: 2,
      maxEmployeesPerCompany: 5,
      maxChiefAssistants: 0,
      logRetentionDays: 7,
      monitoringRetentionDays: 7,
      apiRateLimit: 100,
      enabledFeatures: [
        "basic_ip_management",
        "basic_team_collaboration",
      ],
      disabledFeatures: [
        "multi_company",
        "chief_assistant",
        "advanced_monitoring",
        "custom_integrations",
      ],
    }],
    ["pro", {
      maxCompanies: 3,
      maxDepartmentsPerCompany: 10,
      maxTeamsPerDepartment: 5,
      maxEmployeesPerCompany: 50,
      maxChiefAssistants: 1,
      logRetentionDays: 30,
      monitoringRetentionDays: 30,
      apiRateLimit: 500,
      enabledFeatures: [
        "basic_ip_management",
        "basic_team_collaboration",
        "multi_company",
        "chief_assistant",
        "advanced_monitoring",
        "priority_support",
      ],
      disabledFeatures: [
        "custom_integrations",
        "dedicated_support",
        "sla_guarantee",
      ],
    }],
    ["enterprise", {
      maxCompanies: Infinity,
      maxDepartmentsPerCompany: Infinity,
      maxTeamsPerDepartment: Infinity,
      maxEmployeesPerCompany: Infinity,
      maxChiefAssistants: Infinity,
      logRetentionDays: 90,
      monitoringRetentionDays: 90,
      apiRateLimit: Infinity,
      enabledFeatures: [
        "basic_ip_management",
        "basic_team_collaboration",
        "multi_company",
        "chief_assistant",
        "advanced_monitoring",
        "priority_support",
        "custom_integrations",
        "dedicated_support",
        "sla_guarantee",
      ],
      disabledFeatures: [],
    }],
  ]);

/**
 * 检查功能是否启用
 */
export function isFeatureEnabled(
  plan: SoloipsSubscriptionPlan,
  feature: string
): boolean {
  const limits = SUBSCRIPTION_PLANS.get(plan);
  if (!limits) return false;
  return limits.enabledFeatures.includes(feature);
}

/**
 * 获取计划限制
 */
export function getPlanLimits(plan: SoloipsSubscriptionPlan): SubscriptionPlanLimits {
  const limits = SUBSCRIPTION_PLANS.get(plan);
  if (!limits) {
    throw new Error(`Unknown subscription plan: ${plan}`);
  }
  return limits;
}
```

### 3.3 限制服务实现

```typescript
// src/services/impl/limit-service-impl.ts

import type { SoloipsLimitService } from "./limit-service.js";
import type {
  SoloipsLimitEntityType,
  SoloipsLimitCheckResult,
  SoloipsSubscriptionUsage,
  SoloipsRateLimitResult,
} from "./limit-service.js";
import type { SoloipsLimitStore } from "./stores/limit-store.js";
import type { SoloipsSubscriptionPlan } from "../contracts.js";
import { getPlanLimits } from "../config/subscription-limits.js";

export class SoloipsLimitServiceImpl implements SoloipsLimitService {
  constructor(private readonly store: SoloipsLimitStore) {}

  async canCreate(
    subscriptionId: string,
    entityType: SoloipsLimitEntityType,
    parentId?: string
  ): Promise<SoloipsLimitCheckResult> {
    const subscription = await this.store.getSubscription(subscriptionId);
    if (!subscription) {
      return { allowed: false, current: 0, limit: 0, reason: "Subscription not found" };
    }

    const limits = getPlanLimits(subscription.plan);
    let current: number;
    let limit: number;

    switch (entityType) {
      case "company":
        current = await this.store.countCompanies(subscriptionId);
        limit = limits.maxCompanies;
        break;
      
      case "department":
        if (!parentId) {
          return { allowed: false, current: 0, limit: 0, reason: "Company ID required" };
        }
        current = await this.store.countDepartments(parentId);
        limit = limits.maxDepartmentsPerCompany;
        break;
      
      case "team":
        if (!parentId) {
          return { allowed: false, current: 0, limit: 0, reason: "Department ID required" };
        }
        current = await this.store.countTeams(parentId);
        limit = limits.maxTeamsPerDepartment;
        break;
      
      case "employee":
        const companyId = await this.store.getCompanyIdForEmployee(parentId);
        current = await this.store.countEmployees(companyId);
        limit = limits.maxEmployeesPerCompany;
        break;
      
      case "chief_assistant":
        if (!subscription) {
          return { allowed: false, current: 0, limit: 0, reason: "Subscription not found" };
        }
        current = await this.store.countChiefAssistants(subscriptionId);
        limit = limits.maxChiefAssistants;
        break;
      
      default:
        return { allowed: false, current: 0, limit: 0, reason: `Unknown entity type: ${entityType}` };
    }

    // Infinity 表示无限制
    const allowed = limit === Infinity || current < limit;
    return {
      allowed,
      current,
      limit: limit === Infinity ? -1 : limit, // 返回 -1 表示无限制
      reason: allowed ? undefined : `${entityType} limit exceeded (${current}/${limit})`,
    };
  }

  async getUsage(subscriptionId: string): Promise<SoloipsSubscriptionUsage> {
    const subscription = await this.store.getSubscription(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    const limits = getPlanLimits(subscription.plan);
    const companies = await this.canCreate(subscriptionId, "company");
    
    // 获取公司列表（用于计算子实体）
    const companyIds = await this.store.getCompanyIds(subscriptionId);
    let totalDepartments = 0;
    let totalTeams = 0;
    let totalEmployees = 0;

    for (const companyId of companyIds) {
      totalDepartments += await this.store.countDepartments(companyId);
      const deptIds = await this.store.getDepartmentIds(companyId);
      for (const deptId of deptIds) {
        totalTeams += await this.store.countTeams(deptId);
      }
      totalEmployees += await this.store.countEmployees(companyId);
    }

    const chiefAssistants = await this.canCreate(subscriptionId, "chief_assistant");

    return {
      subscriptionId: subscriptionId as any,
      plan: subscription.plan,
      companies,
      departments: { 
        allowed: true, // 聚合显示
        current: totalDepartments, 
        limit: -1 
      },
      teams: { 
        allowed: true,
        current: totalTeams, 
        limit: -1 
      },
      employees: { 
        allowed: true,
        current: totalEmployees, 
        limit: -1 
      },
      chiefAssistants,
    };
  }

  async checkRateLimit(
    subscriptionId: string,
    operation: string
  ): Promise<SoloipsRateLimitResult> {
    const subscription = await this.store.getSubscription(subscriptionId);
    if (!subscription) {
      return { allowed: false, remaining: 0, resetAt: "", limit: 0 };
    }

    const limits = getPlanLimits(subscription.plan);
    const limit = limits.apiRateLimit;
    
    if (limit === Infinity) {
      return { allowed: true, remaining: -1, resetAt: "", limit: -1 };
    }

    const usage = await this.store.getRateLimitUsage(subscriptionId, operation);
    const resetAt = new Date(Date.now() + 60000).toISOString(); // 1分钟后重置

    return {
      allowed: usage.count < limit,
      remaining: Math.max(0, limit - usage.count),
      resetAt,
      limit,
    };
  }

  async getPlanLimits(plan: SoloipsSubscriptionPlan) {
    return getPlanLimits(plan);
  }
}
```

## 4. 日志服务

### 4.1 日志服务接口

```typescript
// src/services/log-service.ts

import type {
  SoloipsOperationLogId,
  SoloipsOperationLogRecord,
  SoloipsActorType,
  SoloipsAction,
  SoloipsEntityType,
  SoloipsCompanyId,
} from "../contracts.js";

export interface SoloipsLogQueryOptions {
  readonly companyId?: SoloipsCompanyId;
  readonly actorId?: string;
  readonly actorType?: SoloipsActorType;
  readonly action?: SoloipsAction;
  readonly entityType?: SoloipsEntityType;
  readonly entityId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface SoloipsLogQueryResult {
  readonly logs: readonly SoloipsOperationLogRecord[];
  readonly total: number;
  readonly hasMore: boolean;
}

/**
 * 日志服务
 */
export interface SoloipsLogService {
  /**
   * 记录操作日志
   */
  logOperation(params: {
    readonly actorId: string;
    readonly actorType: SoloipsActorType;
    readonly action: SoloipsAction;
    readonly entityType: SoloipsEntityType;
    readonly entityId: string;
    readonly context?: {
      readonly companyId?: SoloipsCompanyId;
      readonly departmentId?: string;
      readonly teamId?: string;
      readonly ipAddress?: string;
      readonly userAgent?: string;
    };
    readonly result: "success" | { failure: string };
    readonly metadata?: Record<string, unknown>;
  }): Promise<SoloipsOperationLogId>;

  /**
   * 查询操作日志
   */
  queryLogs(options: SoloipsLogQueryOptions): Promise<SoloipsLogQueryResult>;

  /**
   * 获取实体的操作历史
   */
  getEntityHistory(
    entityType: SoloipsEntityType,
    entityId: string
  ): Promise<readonly SoloipsOperationLogRecord[]>;

  /**
   * 导出审计日志
   */
  exportAuditLog(params: {
    readonly companyId: SoloipsCompanyId;
    readonly from: string;
    readonly to: string;
    readonly format: "json" | "csv";
  }): Promise<Blob>;

  /**
   * 清理过期日志
   */
  cleanupExpiredLogs(subscriptionId: string): Promise<number>;
}
```

### 4.2 日志服务实现

```typescript
// src/services/impl/log-service-impl.ts

import type { SoloipsLogService } from "./log-service.js";
import type {
  SoloipsLogQueryOptions,
  SoloipsLogQueryResult,
} from "./log-service.js";
import type { SoloipsLogStore } from "./stores/log-store.js";
import type { SoloipsMetricsStore } from "./stores/metrics-store.js";
import type {
  SoloipsOperationLogRecord,
  SoloipsOperationLogId,
  SoloipsActorType,
  SoloipsAction,
  SoloipsEntityType,
  SoloipsCompanyId,
} from "../contracts.js";
import { newOperationLogId } from "../ids.js";
import { getPlanLimits } from "../config/subscription-limits.js";

export class SoloipsLogServiceImpl implements SoloipsLogService {
  constructor(
    private readonly logStore: SoloipsLogStore,
    private readonly metricsStore: SoloipsMetricsStore,
    private readonly subscriptionStore: SoloipsSubscriptionStore
  ) {}

  async logOperation(params: {
    actorId: string;
    actorType: SoloipsActorType;
    action: SoloipsAction;
    entityType: SoloipsEntityType;
    entityId: string;
    context?: {
      companyId?: SoloipsCompanyId;
      departmentId?: string;
      teamId?: string;
      ipAddress?: string;
      userAgent?: string;
    };
    result: "success" | { failure: string };
    metadata?: Record<string, unknown>;
  }): Promise<SoloipsOperationLogId> {
    const id = newOperationLogId();
    const timestamp = new Date().toISOString();

    const record: SoloipsOperationLogRecord = {
      id,
      timestamp,
      actorId: params.actorId,
      actorType: params.actorType,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      context: {
        companyId: params.context?.companyId,
        departmentId: params.context?.departmentId,
        teamId: params.context?.teamId,
        ipAddress: params.context?.ipAddress,
        userAgent: params.context?.userAgent,
      },
      result: params.result === "success" 
        ? { status: "success" }
        : { status: "failure", reason: params.result.failure },
      metadata: params.metadata,
    };

    await this.logStore.put(record);

    // 记录指标
    if (params.context?.companyId) {
      await this.recordUsageMetric(
        params.context.companyId,
        "logs_written"
      );
    }

    return id;
  }

  async queryLogs(options: SoloipsLogQueryOptions): Promise<SoloipsLogQueryResult> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const logs = await this.logStore.query({
      companyId: options.companyId,
      actorId: options.actorId,
      actorType: options.actorType,
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId,
      from: options.from,
      to: options.to,
      limit: limit + 1, // 多查一条判断 hasMore
      offset,
    });

    const hasMore = logs.length > limit;
    if (hasMore) {
      logs.pop();
    }

    const total = await this.logStore.count({
      companyId: options.companyId,
      actorId: options.actorId,
      actorType: options.actorType,
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId,
      from: options.from,
      to: options.to,
    });

    return { logs, total, hasMore };
  }

  async getEntityHistory(
    entityType: SoloipsEntityType,
    entityId: string
  ): Promise<readonly SoloipsOperationLogRecord[]> {
    return this.logStore.query({
      entityType,
      entityId,
      limit: 100,
    });
  }

  async exportAuditLog(params: {
    companyId: SoloipsCompanyId;
    from: string;
    to: string;
    format: "json" | "csv";
  }): Promise<Blob> {
    const logs = await this.logStore.query({
      companyId: params.companyId,
      from: params.from,
      to: params.to,
      limit: 10000,
    });

    if (params.format === "json") {
      return new Blob([JSON.stringify(logs, null, 2)], { 
        type: "application/json" 
      });
    }

    // CSV 格式
    const headers = [
      "ID", "时间戳", "行动者ID", "行动者类型", "操作", 
      "实体类型", "实体ID", "结果", "公司ID"
    ];
    const rows = logs.map(log => [
      log.id,
      log.timestamp,
      log.actorId,
      log.actorType,
      log.action,
      log.entityType,
      log.entityId,
      log.result.status === "success" ? "成功" : `失败: ${log.result.reason}`,
      log.context.companyId ?? "",
    ]);
    
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    return new Blob([csv], { type: "text/csv" });
  }

  async cleanupExpiredLogs(subscriptionId: string): Promise<number> {
    const subscription = await this.subscriptionStore.get(subscriptionId);
    if (!subscription) return 0;

    const limits = getPlanLimits(subscription.plan);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - limits.logRetentionDays);
    const cutoff = cutoffDate.toISOString();

    // 获取该公司下所有公司的日志
    const companyIds = await this.subscriptionStore.getCompanyIds(subscriptionId);
    let deletedCount = 0;

    for (const companyId of companyIds) {
      deletedCount += await this.logStore.deleteOlderThan(companyId, cutoff);
    }

    return deletedCount;
  }

  private async recordUsageMetric(companyId: string, metric: string): Promise<void> {
    // 实现指标记录逻辑
  }
}
```

## 5. 总助理服务

### 5.1 总助理服务接口

```typescript
// src/services/chief-assistant-service.ts

import type {
  SoloipsChiefAssistantId,
  SoloipsCompanyId,
  SoloipsEmployeeId,
  SoloipsAppointmentId,
} from "../contracts.js";

/**
 * 每日简报
 */
export interface SoloipsDailyBrief {
  readonly date: string;
  readonly companyId: SoloipsCompanyId;
  readonly summary: {
    readonly totalEmployees: number;
    readonly activeProjects: number;
    readonly pendingReviews: number;
    readonly issuesResolved: number;
    readonly issues: number;
  };
  readonly highlights: readonly string[];
  readonly concerns: readonly SoloipsConcern[];
  readonly recommendations: readonly string[];
  readonly generatedAt: string;
}

export interface SoloipsConcern {
  readonly id: string;
  readonly title: string;
  readonly severity: "low" | "medium" | "high";
  readonly description: string;
  readonly suggestedAction?: string;
}

/**
 * 系统状态
 */
export interface SoloipsSystemStatus {
  readonly timestamp: string;
  readonly overall: "healthy" | "warning" | "critical";
  readonly components: ReadonlyArray<{
    readonly name: string;
    readonly status: "up" | "degraded" | "down";
    readonly latencyMs?: number;
    readonly errorRate?: number;
  }>;
  readonly recentAlerts: ReadonlyArray<{
    readonly id: string;
    readonly level: string;
    readonly title: string;
  }>;
}

/**
 * 待处理事项
 */
export interface SoloipsPendingMatters {
  readonly urgent: readonly SoloipsPendingItem[];
  readonly normal: readonly SoloipsPendingItem[];
  readonly low: readonly SoloipsPendingItem[];
}

export interface SoloipsPendingItem {
  readonly id: string;
  readonly type: "review" | "approval" | "coordination" | "alert";
  readonly title: string;
  readonly description?: string;
  readonly dueAt?: string;
  readonly priority: "urgent" | "normal" | "low";
  readonly relatedEntityType?: string;
  readonly relatedEntityId?: string;
}

/**
 * 总助理服务
 */
export interface SoloipsChiefAssistantService {
  /**
   * 生成每日简报
   */
  generateDailyBrief(companyId: SoloipsCompanyId): Promise<SoloipsDailyBrief>;

  /**
   * 检查系统状态
   */
  checkSystemStatus(companyId: SoloipsCompanyId): Promise<SoloipsSystemStatus>;

  /**
   * 检查待处理事项
   */
  checkPendingMatters(
    chiefAssistantId: SoloipsChiefAssistantId
  ): Promise<SoloipsPendingMatters>;

  /**
   * 获取总助理信息
   */
  getChiefAssistant(
    chiefAssistantId: SoloipsChiefAssistantId
  ): Promise<{
    id: SoloipsChiefAssistantId;
    employeeId: SoloipsEmployeeId;
    companyId: SoloipsCompanyId;
    responsibilities: readonly string[];
    reportingMode: string;
    status: string;
  } | null>;

  /**
   * 列出公司所有总助理
   */
  listChiefAssistants(
    companyId: SoloipsCompanyId
  ): Promise<readonly {
    id: SoloipsChiefAssistantId;
    employeeId: SoloipsEmployeeId;
    status: string;
  }[]>;
}
```

### 5.2 总助理服务实现

```typescript
// src/services/impl/chief-assistant-service-impl.ts

import type { SoloipsChiefAssistantService } from "./chief-assistant-service.js";
import type {
  SoloipsDailyBrief,
  SoloipsSystemStatus,
  SoloipsPendingMatters,
} from "./chief-assistant-service.js";
import type { SoloipsChiefAssistantStore } from "./stores/chief-assistant-store.js";
import type { SoloipsCompanyStore } from "./stores/company-store.js";
import type { SoloipsAlertStore } from "./stores/alert-store.js";
import type { SoloipsMetricsStore } from "./stores/metrics-store.js";

export class SoloipsChiefAssistantServiceImpl implements SoloipsChiefAssistantService {
  constructor(
    private readonly chiefAssistantStore: SoloipsChiefAssistantStore,
    private readonly companyStore: SoloipsCompanyStore,
    private readonly alertStore: SoloipsAlertStore,
    private readonly metricsStore: SoloipsMetricsStore
  ) {}

  async generateDailyBrief(companyId: string): Promise<SoloipsDailyBrief> {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    // 收集统计数据
    const [
      employeeCount,
      departmentCount,
      recentAlerts,
      metrics,
    ] = await Promise.all([
      this.companyStore.countEmployees(companyId),
      this.companyStore.countDepartments(companyId),
      this.alertStore.getRecentAlerts(companyId, yesterday),
      this.metricsStore.getDailyMetrics(companyId, today),
    ]);

    // 生成摘要
    const summary = {
      totalEmployees: employeeCount,
      activeProjects: metrics.projectsActive ?? 0,
      pendingReviews: metrics.pendingReviews ?? 0,
      issuesResolved: metrics.issuesResolved ?? 0,
      issues: recentAlerts.filter(a => !a.resolved).length,
    };

    // 生成亮点
    const highlights: string[] = [];
    if (summary.issuesResolved > 0) {
      highlights.push(`今日解决了 ${summary.issuesResolved} 个问题`);
    }
    if (summary.activeProjects > 0) {
      highlights.push(`${summary.activeProjects} 个项目正在进行中`);
    }

    // 生成关注点
    const concerns: SoloipsDailyBrief["concerns"] = [];
    const unresolvedAlerts = recentAlerts.filter(a => !a.resolved);
    for (const alert of unresolvedAlerts.slice(0, 3)) {
      concerns.push({
        id: alert.id,
        title: alert.title,
        severity: alert.level === "critical" ? "high" : alert.level === "warning" ? "medium" : "low",
        description: alert.message,
      });
    }

    // 生成建议
    const recommendations: string[] = [];
    if (summary.pendingReviews > 5) {
      recommendations.push("有多个待审核项目，建议优先处理");
    }
    if (unresolvedAlerts.length > 3) {
      recommendations.push("待处理告警较多，建议检查系统状态");
    }

    return {
      date: today,
      companyId: companyId as any,
      summary,
      highlights,
      concerns,
      recommendations,
      generatedAt: new Date().toISOString(),
    };
  }

  async checkSystemStatus(companyId: string): Promise<SoloipsSystemStatus> {
    const [
      recentAlerts,
      componentStatuses,
    ] = await Promise.all([
      this.alertStore.getRecentAlerts(companyId, undefined, 10),
      this.getComponentStatuses(companyId),
    ]);

    // 判断整体状态
    let overall: SoloipsSystemStatus["overall"] = "healthy";
    for (const comp of componentStatuses) {
      if (comp.status === "down") {
        overall = "critical";
        break;
      }
      if (comp.status === "degraded" && overall === "healthy") {
        overall = "warning";
      }
    }

    const criticalAlerts = recentAlerts.filter(a => a.level === "critical" && !a.resolved);
    if (criticalAlerts.length > 0) {
      overall = "critical";
    }

    return {
      timestamp: new Date().toISOString(),
      overall,
      components: componentStatuses,
      recentAlerts: recentAlerts.slice(0, 5).map(a => ({
        id: a.id,
        level: a.level,
        title: a.title,
      })),
    };
  }

  async checkPendingMatters(
    chiefAssistantId: string
  ): Promise<SoloipsPendingMatters> {
    const chiefAssistant = await this.chiefAssistantStore.get(chiefAssistantId);
    if (!chiefAssistant) {
      return { urgent: [], normal: [], low: [] };
    }

    const [
      pendingReviews,
      unresolvedAlerts,
      pendingApprovals,
    ] = await Promise.all([
      this.companyStore.getPendingReviews(chiefAssistant.companyId),
      this.alertStore.getUnresolvedAlerts(chiefAssistant.companyId),
      this.companyStore.getPendingApprovals(chiefAssistant.companyId),
    ]);

    const urgent: SoloipsPendingMatters["urgent"] = [];
    const normal: SoloipsPendingMatters["normal"] = [];
    const low: SoloipsPendingMatters["low"] = [];

    // 分类告警
    for (const alert of unresolvedAlerts) {
      const item: SoloipsPendingMatters["urgent"][0] = {
        id: alert.id,
        type: "alert",
        title: alert.title,
        description: alert.message,
        priority: alert.level === "critical" ? "urgent" : alert.level === "error" ? "normal" : "low",
        relatedEntityType: "alert",
        relatedEntityId: alert.id,
      };
      if (item.priority === "urgent") urgent.push(item);
      else if (item.priority === "normal") normal.push(item);
      else low.push(item);
    }

    // 分类待审核
    for (const review of pendingReviews) {
      normal.push({
        id: review.id,
        type: "review",
        title: `待审核: ${review.title}`,
        description: review.description,
        priority: review.priority ?? "normal",
        relatedEntityType: review.entityType,
        relatedEntityId: review.entityId,
      });
    }

    return { urgent, normal, low };
  }

  async getChiefAssistant(chiefAssistantId: string) {
    const ca = await this.chiefAssistantStore.get(chiefAssistantId);
    if (!ca) return null;

    return {
      id: ca.id as any,
      employeeId: ca.employeeId as any,
      companyId: ca.companyId as any,
      responsibilities: ca.responsibilities,
      reportingMode: ca.reportingMode,
      status: ca.status,
    };
  }

  async listChiefAssistants(companyId: string) {
    const assistants = await this.chiefAssistantStore.listByCompany(companyId);
    return assistants.map(ca => ({
      id: ca.id as any,
      employeeId: ca.employeeId as any,
      status: ca.status,
    }));
  }

  private async getComponentStatuses(companyId: string) {
    // 实际实现应查询真实组件状态
    return [
      { name: "api", status: "up" as const, latencyMs: 45 },
      { name: "storage", status: "up" as const, latencyMs: 12 },
      { name: "auth", status: "up" as const, latencyMs: 23 },
    ];
  }
}
```

## 6. 服务集成到 Store

### 6.1 扩展现有 SoloipsCoreService

```typescript
// src/store.ts 扩展

export interface SoloipsCoreService {
  // ... 现有方法 ...

  // 新增：订阅相关
  createSubscription(input: {
    operationId: SoloipsOperationId;
    ownerId: string;
    plan: SoloipsSubscriptionPlan;
  }): Promise<SoloipsCommitOutcome<{ subscriptionId: SoloipsSubscriptionId }>>;

  getSubscription(id: SoloipsSubscriptionId): SoloipsSubscriptionRecord | undefined;
  updateSubscription(
    id: SoloipsSubscriptionId,
    updates: Partial<Pick<SoloipsSubscriptionRecord, "plan" | "expiresAt">>
  ): Promise<void>;

  // 新增：团队相关
  createTeam(input: {
    operationId: SoloipsOperationId;
    departmentId: SoloipsDepartmentId;
    name: string;
    description?: string;
    createdBy: SoloipsEmployeeId;
  }): Promise<SoloipsCommitOutcome<{ teamId: SoloipsTeamId }>>;

  getTeam(id: SoloipsTeamId): SoloipsTeamRecord | undefined;
  listTeams(departmentId: SoloipsDepartmentId): readonly SoloipsTeamRecord[];
  updateTeam(
    id: SoloipsTeamId,
    updates: Partial<Pick<SoloipsTeamRecord, "name" | "description" | "leaderEmployeeId" | "status">>
  ): Promise<void>;

  // 新增：总助理相关
  appointChiefAssistant(input: {
    operationId: SoloipsOperationId;
    employeeId: SoloipsEmployeeId;
    companyId: SoloipsCompanyId;
    responsibilities?: readonly string[];
    reportingMode?: SoloipsReportingMode;
  }): Promise<SoloipsCommitOutcome<{ chiefAssistantId: SoloipsChiefAssistantId }>>;

  revokeChiefAssistant(input: {
    operationId: SoloipsOperationId;
    chiefAssistantId: SoloipsChiefAssistantId;
  }): Promise<SoloipsCommitOutcome<void>>;

  getChiefAssistant(id: SoloipsChiefAssistantId): SoloipsChiefAssistantRecord | undefined;
  listChiefAssistants(companyId: SoloipsCompanyId): readonly SoloipsChiefAssistantRecord[];

  // 新增：扩展的 appointment
  createAppointment(input: {
    operationId: SoloipsOperationId;
    employeeId: SoloipsEmployeeId;
    departmentId: SoloipsDepartmentId;
    teamId?: SoloipsTeamId;
    role: SoloipsAppointmentRole;
    requiredCapabilities?: readonly string[];
  }): Promise<SoloipsCommitOutcome<{
    appointmentId: SoloipsAppointmentId;
    generation: number;
  }>>;

  // 新增：日志
  logOperation(params: {
    actorId: string;
    actorType: SoloipsActorType;
    action: SoloipsAction;
    entityType: SoloipsEntityType;
    entityId: string;
    context?: {
      companyId?: SoloipsCompanyId;
      departmentId?: string;
      teamId?: string;
    };
    result: "success" | { failure: string };
  }): Promise<void>;

  queryOperationLogs(options: {
    companyId?: SoloipsCompanyId;
    actorId?: string;
    action?: SoloipsAction;
    entityType?: SoloipsEntityType;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<{
    logs: readonly SoloipsOperationLogRecord[];
    total: number;
    hasMore: boolean;
  }>;
}
```

---

## 7. 测试模板

### 7.1 限制检查测试

```typescript
// tests/limit-service.spec.ts

import { describe, it, expect, beforeEach } from "vitest";
import { SoloipsLimitServiceImpl } from "../src/services/impl/limit-service-impl.js";
import { InMemoryLimitStore } from "./stubs/in-memory-limit-store.js";

describe("SoloipsLimitService", () => {
  let service: SoloipsLimitServiceImpl;
  let store: InMemoryLimitStore;

  beforeEach(() => {
    store = new InMemoryLimitStore();
    service = new SoloipsLimitServiceImpl(store);
  });

  describe("canCreate", () => {
    it("free 计划只能创建 1 个公司", async () => {
      await store.putSubscription({
        id: "sub_free" as any,
        ownerId: "user1",
        plan: "free",
        maxCompanies: 1,
        maxDepartmentsPerCompany: 2,
        maxTeamsPerDepartment: 2,
        maxEmployeesPerCompany: 5,
        maxChiefAssistants: 0,
        logRetentionDays: 7,
        monitoringRetentionDays: 7,
        apiRateLimit: 100,
        createdAt: new Date().toISOString(),
      });

      // 第一个公司应该被允许
      const result1 = await service.canCreate("sub_free", "company");
      expect(result1.allowed).toBe(true);
      expect(result1.current).toBe(0);
      expect(result1.limit).toBe(1);

      // 创建第一个公司
      await store.putCompany({
        id: "company1" as any,
        subscriptionId: "sub_free" as any,
        name: "Company 1",
        status: "active",
        createdAt: new Date().toISOString(),
        metadata: {},
      });

      // 第二个公司应该被拒绝
      const result2 = await service.canCreate("sub_free", "company");
      expect(result2.allowed).toBe(false);
      expect(result2.current).toBe(1);
      expect(result2.limit).toBe(1);
    });

    it("free 计划不允许创建总助理", async () => {
      await store.putSubscription({
        id: "sub_free" as any,
        ownerId: "user1",
        plan: "free",
        maxCompanies: 1,
        maxDepartmentsPerCompany: 2,
        maxTeamsPerDepartment: 2,
        maxEmployeesPerCompany: 5,
        maxChiefAssistants: 0,
        logRetentionDays: 7,
        monitoringRetentionDays: 7,
        apiRateLimit: 100,
        createdAt: new Date().toISOString(),
      });

      const result = await service.canCreate("sub_free", "chief_assistant");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("limit exceeded");
    });

    it("pro 计划允许创建 3 个公司", async () => {
      await store.putSubscription({
        id: "sub_pro" as any,
        ownerId: "user1",
        plan: "pro",
        maxCompanies: 3,
        maxDepartmentsPerCompany: 10,
        maxTeamsPerDepartment: 5,
        maxEmployeesPerCompany: 50,
        maxChiefAssistants: 1,
        logRetentionDays: 30,
        monitoringRetentionDays: 30,
        apiRateLimit: 500,
        createdAt: new Date().toISOString(),
      });

      const result = await service.canCreate("sub_pro", "company");
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(3);
    });
  });

  describe("getUsage", () => {
    it("返回订阅使用量统计", async () => {
      await store.putSubscription({
        id: "sub_test" as any,
        ownerId: "user1",
        plan: "free",
        maxCompanies: 1,
        maxDepartmentsPerCompany: 2,
        maxTeamsPerDepartment: 2,
        maxEmployeesPerCompany: 5,
        maxChiefAssistants: 0,
        logRetentionDays: 7,
        monitoringRetentionDays: 7,
        apiRateLimit: 100,
        createdAt: new Date().toISOString(),
      });

      const usage = await service.getUsage("sub_test");
      
      expect(usage.subscriptionId).toBe("sub_test");
      expect(usage.plan).toBe("free");
      expect(usage.companies.current).toBe(0);
      expect(usage.companies.limit).toBe(1);
      expect(usage.chiefAssistants.limit).toBe(0);
    });
  });
});
```

### 7.2 权限检查测试

```typescript
// tests/permission-service.spec.ts

import { describe, it, expect, beforeEach } from "vitest";
import { SoloipsPermissionServiceImpl } from "../src/services/impl/permission-service-impl.js";
import { InMemoryPermissionStore } from "./stubs/in-memory-permission-store.js";

describe("SoloipsPermissionService", () => {
  let service: SoloipsPermissionServiceImpl;
  let store: InMemoryPermissionStore;

  beforeEach(() => {
    store = new InMemoryPermissionStore();
    service = new SoloipsPermissionServiceImpl(store);
  });

  describe("checkPermission", () => {
    it("owner 可以执行所有操作", async () => {
      await store.putSubscription({
        id: "sub1" as any,
        ownerId: "owner1",
        plan: "pro",
        maxCompanies: 3,
        maxDepartmentsPerCompany: 10,
        maxTeamsPerDepartment: 5,
        maxEmployeesPerCompany: 50,
        maxChiefAssistants: 1,
        logRetentionDays: 30,
        monitoringRetentionDays: 30,
        apiRateLimit: 500,
        createdAt: new Date().toISOString(),
      });

      const context = {
        userId: "owner1",
        subscriptionId: "sub1" as any,
      };

      expect(await service.checkPermission(context, "company.create")).toBe(true);
      expect(await service.checkPermission(context, "company.delete")).toBe(true);
      expect(await service.checkPermission(context, "department.create")).toBe(true);
      expect(await service.checkPermission(context, "chief_assistant.appoint")).toBe(true);
    });

    it("普通员工只能执行基础操作", async () => {
      const context = {
        userId: "employee1",
        subscriptionId: "sub1" as any,
        employeeId: "emp1" as any,
        appointmentId: "appt1" as any,
      };

      // 设置员工角色为 member
      await store.putAppointment({
        id: "appt1" as any,
        employeeId: "emp1" as any,
        departmentId: "dept1" as any,
        role: "member",
        requiredCapabilities: [],
        generation: 1,
        status: "active",
        createdAt: new Date().toISOString(),
      });

      expect(await service.checkPermission(context, "company.create")).toBe(false);
      expect(await service.checkPermission(context, "department.create")).toBe(false);
      expect(await service.checkPermission(context, "work.review")).toBe(false);
    });

    it("chief_assistant 可以创建部门和团队", async () => {
      const context = {
        userId: "ca1",
        subscriptionId: "sub1" as any,
        employeeId: "emp_ca" as any,
        appointmentId: "appt_ca" as any,
      };

      await store.putAppointment({
        id: "appt_ca" as any,
        employeeId: "emp_ca" as any,
        departmentId: "dept1" as any,
        role: "chief_assistant",
        requiredCapabilities: [],
        generation: 1,
        status: "active",
        createdAt: new Date().toISOString(),
      });

      expect(await service.checkPermission(context, "company.create")).toBe(false);
      expect(await service.checkPermission(context, "department.create")).toBe(true);
      expect(await service.checkPermission(context, "team.create")).toBe(true);
      expect(await service.checkPermission(context, "chief_assistant.appoint")).toBe(false);
    });

    it("department_leader 可以创建团队", async () => {
      await store.putDepartment({
        id: "dept1" as any,
        subscriptionId: "sub1" as any,
        name: "Department 1",
        leaderEmployeeId: "emp_leader" as any,
        status: "active",
        createdAt: new Date().toISOString(),
        metadata: {},
      });

      const context = {
        userId: "leader1",
        subscriptionId: "sub1" as any,
        employeeId: "emp_leader" as any,
        departmentId: "dept1" as any,
        appointmentId: "appt_leader" as any,
      };

      await store.putAppointment({
        id: "appt_leader" as any,
        employeeId: "emp_leader" as any,
        departmentId: "dept1" as any,
        role: "department_leader",
        requiredCapabilities: [],
        generation: 1,
        status: "active",
        createdAt: new Date().toISOString(),
      });

      expect(await service.checkPermission(context, "team.create")).toBe(true);
      expect(await service.checkPermission(context, "team.manage_leader")).toBe(true);
      expect(await service.checkPermission(context, "department.delete")).toBe(false);
    });
  });
});
```

---

## 8. 变更历史

| 日期 | 变更 | 责任人 |
|---|---|---|
| 2026-09-17 | 初稿：技术实现指南 | product-owner |
