# SoloIPs：多公司/部门/团队架构设计

| 阅读契约 | 内容 |
|---|---|
| 身份 | `SOLO-ORG-MULTI`；多公司支持、部门-团队层级、总助理角色的设计正文 |
| 目的 | 定义多公司架构的数据模型、权限体系、日志监测和限制实现策略 |
| 范围 | 数据模型扩展、权限角色、日志系统、限制策略 |
| 决策状态 | 〔设计提案〕；待用户确认需求后实现 |
| 依据 | [产品架构](../architecture.md) SOLO-A02、[技术架构](../technical-architecture.md) ARCH-D02、[公司合同](../refactoring/02-company-contract.md) ORG-01–13 |
| 变更权 | 用户决定业务需求，产品架构师维护技术设计 |

## 1. 设计背景与目标

### 1.1 现有架构回顾

当前 SoloIPs 支持单公司模式：
- `Company` → `Department` → `Employee` + `Appointment`
- 完整的入职/准入系统（Onboarding）
- 文档版本管理 + 操作台账（Operation）
- 提交门（Commit Gate）幂等机制

### 1.2 新增需求

| 需求 | 来源 | 优先级 |
|---|---|---|
| 多公司支持（免费1个/付费多个） | 用户 2026-09-17 | P0 |
| 团队层级（部门 → 团队） | 用户 2026-09-17 | P0 |
| 总助理角色 | 用户 2026-09-17 | P0 |
| 权限体系（Owner vs 各级管理者） | 用户 2026-09-17 | P0 |
| 日志与监测 | 用户 2026-09-17 | P1 |
| 限制实现策略 | 用户 2026-09-17 | P0 |

---

## 2. 数据模型设计

### 2.1 实体关系总览

```
User (外部用户账户)
  │
  ├── OwnerAccount (所有者账户)
  │     │
  │     └── Subscription (订阅计划: free/pro/enterprise)
  │           │
  │           └── Company[] (公司列表，受订阅限制)
  │                 │
  │                 ├── Department[] (部门)
  │                 │     │
  │                 │     └── Team[] (团队)
  │                 │           │
  │                 │           └── Employee[] (员工)
  │                 │                 │
  │                 │                 └── Appointment[] (任职)
  │                 │
  │                 └── ChiefAssistant[] (总助理列表)
  │
  └── AdminAccount (管理员账户，可受托管理)
```

### 2.2 数据模型扩展

#### 2.2.1 订阅计划（Subscription）

```typescript
// 新增表：subscription
export type SoloipsSubscriptionPlan = "free" | "pro" | "enterprise";

export type SoloipsSubscriptionRecord = {
  readonly id: SoloipsSubscriptionId;          // 订阅ID
  readonly ownerId: string;                    // 所有者用户ID（外部账户）
  readonly plan: SoloipsSubscriptionPlan;      // 计划类型
  readonly maxCompanies: number;               // 最大公司数限制
  readonly maxDepartmentsPerCompany: number;   // 每公司最大部门数（pro+）
  readonly maxTeamsPerDepartment: number;      // 每部门最大团队数（pro+）
  readonly maxEmployeesPerCompany: number;     // 每公司最大员工数
  readonly createdAt: string;                   // 创建时间
  readonly expiresAt?: string;                 // 过期时间（企业版）
};

// ID 类型
export type SoloipsSubscriptionId = SoloipsCoreId<"subscription">;
```

#### 2.2.2 公司扩展（Company）

```typescript
// 扩展现有 company 表
export type SoloipsCompanyRecord = {
  readonly id: SoloipsCompanyId;
  readonly subscriptionId: SoloipsSubscriptionId;  // 归属订阅
  readonly name: string;
  readonly status: SoloipsCompanyStatus;          // 状态
  readonly createdAt: string;
  readonly metadata: Readonly<Record<string, SoloipsJsonValue>>; // 扩展字段
};

export type SoloipsCompanyStatus = "active" | "suspended" | "archived";

// ID 类型已存在（来自 contracts.ts）
```

#### 2.2.3 部门扩展（Department）

```typescript
// 扩展现有 department 表
export type SoloipsDepartmentRecord = {
  readonly id: SoloipsDepartmentId;
  readonly companyId: SoloipsCompanyId;
  readonly name: string;
  readonly description?: string;                // 部门描述
  readonly leaderEmployeeId?: SoloipsEmployeeId; // 部门组长（员工）
  readonly parentDepartmentId?: SoloipsDepartmentId; // 上级部门（支持子部门）
  readonly createdAt: string;
  readonly status: SoloipsDepartmentStatus;
};

export type SoloipsDepartmentStatus = "active" | "suspended" | "archived";
```

#### 2.2.4 团队（Team）- 新增表

```typescript
// 新增表：team
export type SoloipsTeamRecord = {
  readonly id: SoloipsTeamId;
  readonly departmentId: SoloipsDepartmentId;   // 归属部门
  readonly name: string;
  readonly description?: string;                // 团队描述
  readonly leaderEmployeeId?: SoloipsEmployeeId; // 团队负责人
  readonly createdBy: SoloipsEmployeeId;       // 创建者（部门组长）
  readonly createdAt: string;
  readonly status: SoloipsTeamStatus;
};

export type SoloipsTeamStatus = "active" | "suspended" | "archived";

// ID 类型
export type SoloipsTeamId = SoloipsCoreId<"team">;
```

#### 2.2.5 员工扩展（Employee）

```typescript
// 扩展现有 employee 表
export type SoloipsEmployeeRecord = {
  readonly id: SoloipsEmployeeId;
  readonly displayName: string;
  readonly currentDocuments: Readonly<Partial<Record<SoloipsRequiredDocumentType, SoloipsDocumentVersionId>>>;
  readonly assemblyEvidence: Readonly<Partial<Record<SoloipsRequiredDocumentType, SoloipsDocumentVersionId>>>;
  readonly memoryInitialized: boolean;
  readonly verifiedCapabilities: readonly string[];
  // 新增字段
  readonly teamId?: SoloipsTeamId;             // 当前所属团队
  readonly primaryAppointmentId?: SoloipsAppointmentId; // 主任职（用于权限判断）
  readonly status: SoloipsEmployeeStatus;
};

export type SoloipsEmployeeStatus = "active" | "onboarding" | "cold_storage" | "terminated";
```

#### 2.2.6 任职扩展（Appointment）

```typescript
// 扩展现有 appointment 表
export type SoloipsAppointmentRecord = {
  readonly id: SoloipsAppointmentId;
  readonly employeeId: SoloipsEmployeeId;
  readonly departmentId: SoloipsDepartmentId;
  readonly teamId?: SoloipsTeamId;              // 可选：团队级任职
  readonly role: SoloipsAppointmentRole;        // 角色类型
  readonly requiredCapabilities: readonly string[];
  readonly generation: number;
  readonly status: SoloipsAppointmentStatus;
  readonly createdAt: string;
};

export type SoloipsAppointmentRole = 
  | "chief_assistant"    // 总助理
  | "department_leader"  // 部门组长
  | "team_leader"        // 团队负责人
  | "member";            // 普通员工
```

#### 2.2.7 总助理（ChiefAssistant）- 新增表

```typescript
// 新增表：chief_assistant
export type SoloipsChiefAssistantRecord = {
  readonly id: SoloipsChiefAssistantId;
  readonly employeeId: SoloipsEmployeeId;       // 对应员工ID
  readonly companyId: SoloipsCompanyId;         // 归属公司
  readonly appointmentId: SoloipsAppointmentId; // 任职ID
  readonly responsibilities: readonly string[];  // 职责列表
  readonly reportingMode: SoloipsReportingMode; // 汇报模式
  readonly status: SoloipsChiefAssistantStatus;
  readonly createdAt: string;
  readonly createdBy: string;                   // 创建者（Owner 或上级）
};

export type SoloipsReportingMode = 
  | "daily_brief"        // 每日简报
  | "on_demand"          // 按需汇报
  | "milestone";         // 里程碑汇报

export type SoloipsChiefAssistantStatus = "active" | "inactive";

// ID 类型
export type SoloipsChiefAssistantId = SoloipsCoreId<"chief_assistant">;
```

### 2.3 ID 命名空间扩展

```typescript
// src/ids.ts 扩展
export type SoloipsSubscriptionId = SoloipsCoreId<"subscription">;
export type SoloipsTeamId = SoloipsCoreId<"team">;
export type SoloipsChiefAssistantId = SoloipsCoreId<"chief_assistant">;

// 工厂函数
function newSubscriptionId(): SoloipsSubscriptionId { ... }
function newTeamId(): SoloipsTeamId { ... }
function newChiefAssistantId(): SoloipsChiefAssistantId { ... }

// 校验函数
function isSubscriptionId(value: string): value is SoloipsSubscriptionId { ... }
function isTeamId(value: string): value is SoloipsTeamId { ... }
function isChiefAssistantId(value: string): value is SoloipsChiefAssistantId { ... }
```

### 2.4 表结构变更清单

| 表名 | 操作 | 新增字段 |
|---|---|---|
| company | 扩展 | subscriptionId, status, createdAt, metadata |
| department | 扩展 | description, leaderEmployeeId, parentDepartmentId, createdAt, status |
| employee | 扩展 | teamId, primaryAppointmentId, status |
| appointment | 扩展 | teamId, role, createdAt |
| subscription | 新增 | 全部字段 |
| team | 新增 | 全部字段 |
| chief_assistant | 新增 | 全部字段 |

---

## 3. 权限体系设计

### 3.1 角色层级

```
Owner (所有者)
  │
  ├── 全部权限
  │
  ├── 总助理 (Chief Assistant)
  │     ├── 向 Owner 汇报
  │     ├── 维护公司日常运营
  │     ├── 监控日志与状态
  │     └── 协调部门工作
  │
  ├── 部门组长 (Department Leader)
  │     ├── 管理本部门
  │     ├── 创建/管理团队
  │     └── 任命团队负责人
  │
  ├── 团队负责人 (Team Leader)
  │     ├── 管理本团队
  │     └── 分配任务给员工
  │
  └── 普通员工 (Member)
        └── 执行分配的任务
```

### 3.2 权限矩阵

| 操作 | Owner | 总助理 | 部门组长 | 团队负责人 | 员工 |
|---|---|---|---|---|---|
| 创建公司 | R/W | - | - | - | - |
| 删除/归档公司 | R/W | - | - | - | - |
| 订阅管理 | R/W | - | - | - | - |
| 创建部门 | R/W | R/W | - | - | - |
| 任命部门组长 | R/W | R/W | - | - | - |
| 创建团队 | R/W | R/W | R/W | - | - |
| 任命团队负责人 | R/W | R/W | R/W | - | - |
| 招募员工 | R/W | R/W | R/W | R | - |
| 任命总助理 | R/W | - | - | - | - |
| 审核作品 | R/W | R/W | R/W | R/W | - |
| 查看所有日志 | R/W | R/W | R | R | - |
| 系统监控 | R/W | R/W | - | - | - |
| 接收告警 | R/W | R/W | R | - | - |

R = 只读，R/W = 可读写，- = 无权限

### 3.3 权限检查接口

```typescript
// src/contracts.ts 扩展

export type SoloipsPermission = 
  | "company.create"
  | "company.delete"
  | "company.manage_subscription"
  | "department.create"
  | "department.manage_leader"
  | "team.create"
  | "team.manage_leader"
  | "employee.recruit"
  | "chief_assistant.appoint"
  | "work.review"
  | "log.view_all"
  | "monitoring.view"
  | "alert.receive";

export type SoloipsRole = "owner" | "chief_assistant" | "department_leader" | "team_leader" | "member";

export interface SoloipsPermissionContext {
  readonly userId: string;                    // 当前操作用户
  readonly subscriptionId: SoloipsSubscriptionId;
  readonly companyId?: SoloipsCompanyId;       // 当前公司上下文
  readonly departmentId?: SoloipsDepartmentId;
  readonly teamId?: SoloipsTeamId;
  readonly employeeId?: SoloipsEmployeeId;    // 对应员工
  readonly appointmentId?: SoloipsAppointmentId;
}

/**
 * 权限检查服务接口
 */
export interface SoloipsPermissionService {
  /**
   * 检查用户是否具有特定权限
   */
  checkPermission(
    context: SoloipsPermissionContext,
    permission: SoloipsPermission
  ): Promise<boolean>;

  /**
   * 获取用户在当前上下文中拥有的所有权限
   */
  getPermissions(
    context: SoloipsPermissionContext
  ): Promise<readonly SoloipsPermission[]>;

  /**
   * 检查订阅限制
   */
  checkSubscriptionLimit(
    subscriptionId: SoloipsSubscriptionId,
    entityType: "company" | "department" | "team" | "employee"
  ): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
  }>;
}
```

### 3.4 权限检查实现策略

```typescript
// src/permissions.ts

/**
 * 权限检查规则实现
 */
class SoloipsPermissionChecker {
  
  async checkPermission(
    context: SoloipsPermissionContext,
    permission: SoloipsPermission
  ): Promise<boolean> {
    // 1. Owner 拥有全部权限
    if (await this.isOwner(context)) {
      return true;
    }

    // 2. 按权限类型分发检查
    switch (permission) {
      case "company.create":
      case "company.delete":
      case "company.manage_subscription":
        // 只有 Owner 可操作公司级别
        return false;

      case "department.create":
      case "department.manage_leader":
        // Owner 或总助理
        return this.isChiefAssistant(context) || this.isOwner(context);

      case "team.create":
        // Owner / 总助理 / 部门组长
        return this.hasRole(context, "department_leader") || 
               this.isChiefAssistant(context) ||
               this.isOwner(context);

      case "team.manage_leader":
        // Owner / 总助理 / 部门组长
        return this.hasRole(context, "department_leader") ||
               this.isChiefAssistant(context) ||
               this.isOwner(context);

      case "employee.recruit":
        // Owner / 总助理 / 部门组长 / 团队负责人
        return this.hasMinRole(context, "team_leader") ||
               this.isChiefAssistant(context) ||
               this.isOwner(context);

      // ... 其他权限
    }
  }

  private async isOwner(context: SoloipsPermissionContext): Promise<boolean> {
    // 查询 subscription.ownerId 是否匹配
    // ...
  }

  private async isChiefAssistant(context: SoloipsPermissionContext): Promise<boolean> {
    if (!context.appointmentId) return false;
    const appointment = await this.getAppointment(context.appointmentId);
    return appointment?.role === "chief_assistant";
  }

  private async hasRole(context: SoloipsPermissionContext, role: SoloipsRole): Promise<boolean> {
    // 检查当前上下文中是否具有指定角色
    // ...
  }

  private async hasMinRole(context: SoloipsPermissionContext, minRole: SoloipsRole): Promise<boolean> {
    // 检查是否具有最小角色或更高
    // 角色层级: owner > chief_assistant > department_leader > team_leader > member
    // ...
  }
}
```

---

## 4. 总助理角色设计

### 4.1 总助理职责

```typescript
// 总助理职责定义
export interface ChiefAssistantResponsibility {
  readonly id: string;
  readonly key: SoloipsChiefAssistantResponsibilityKey;
  readonly description: string;
  readonly autoExecute: boolean;     // 是否自动执行
  readonly requiresConfirmation: boolean; // 是否需要确认
}

export type SoloipsChiefAssistantResponsibilityKey = 
  | "daily_operations"      // 日常运营维护
  | "log_management"       // 日志管理
  | "monitoring"           // 状态监控
  | "coordinator"          // 部门协调
  | "escalation"           // 问题升级
  | "reporting";           // 向 Owner 汇报

// 默认职责清单
export const DEFAULT_CHIEF_ASSISTANT_RESPONSIBILITIES: readonly SoloipsChiefAssistantResponsibilityKey[] = [
  "daily_operations",
  "log_management",
  "monitoring",
  "coordinator",
  "escalation",
  "reporting",
];
```

### 4.2 总助理工作流程

```typescript
// 总助理服务接口
export interface SoloipsChiefAssistantService {
  /**
   * 生成每日简报
   */
  generateDailyBrief(
    companyId: SoloipsCompanyId
  ): Promise<SoloipsDailyBrief>;

  /**
   * 检查系统状态
   */
  checkSystemStatus(
    companyId: SoloipsCompanyId
  ): Promise<SoloipsSystemStatus>;

  /**
   * 检查待处理事项
   */
  checkPendingMatters(
    chiefAssistantId: SoloipsChiefAssistantId
  ): Promise<SoloipsPendingMatters>;

  /**
   * 协调跨部门工作
   */
  coordinateWork(
    chiefAssistantId: SoloipsChiefAssistantId,
    request: SoloipsCoordinationRequest
  ): Promise<SoloipsCoordinationResult>;

  /**
   * 升级问题到 Owner
   */
  escalateIssue(
    chiefAssistantId: SoloipsChiefAssistantId,
    issue: SoloipsEscalationIssue
  ): Promise<SoloipsEscalationResult>;
}

export type SoloipsDailyBrief = {
  readonly date: string;
  readonly companyId: SoloipsCompanyId;
  readonly summary: {
    readonly totalEmployees: number;
    readonly activeProjects: number;
    readonly pendingReviews: number;
    readonly issues: number;
  };
  readonly highlights: readonly string[];
  readonly concerns: readonly SoloipsConcern[];
  readonly recommendations: readonly string[];
};

export type SoloipsSystemStatus = {
  readonly timestamp: string;
  readonly overall: "healthy" | "warning" | "critical";
  readonly components: ReadonlyArray<{
    readonly name: string;
    readonly status: "up" | "degraded" | "down";
    readonly metrics?: Record<string, number>;
  }>;
};

export type SoloipsPendingMatters = {
  readonly urgent: readonly SoloipsPendingItem[];
  readonly normal: readonly SoloipsPendingItem[];
  readonly low: readonly SoloipsPendingItem[];
};

export type SoloipsPendingItem = {
  readonly id: string;
  readonly type: "review" | "approval" | "coordination" | "alert";
  readonly title: string;
  readonly dueAt?: string;
  readonly priority: "urgent" | "normal" | "low";
};
```

---

## 5. 日志与监测系统

### 5.1 日志分层

```
日志系统
  │
  ├── 操作日志 (Operation Log)
  │     ├── 谁做了什么
  │     ├── 时间戳
  │     ├── 操作类型
  │     └── 关联实体
  │
  ├── 业务日志 (Business Log)
  │     ├── 任务状态变化
  │     ├── 审核记录
  │     └── 交付里程碑
  │
  ├── 系统日志 (System Log)
  │     ├── 性能指标
  │     ├── API 调用
  │     └── 错误追踪
  │
  └── 审计日志 (Audit Log)
        ├── 合规要求
        ├── 安全事件
        └── 变更追踪
```

### 5.2 日志数据模型

```typescript
// 新增表：operation_log
export type SoloipsOperationLogRecord = {
  readonly id: SoloipsOperationLogId;
  readonly timestamp: string;                    // ISO 时间戳
  readonly actorId: string;                      // 操作用户 ID
  readonly actorType: SoloipsActorType;          // 行动者类型
  readonly action: SoloipsAction;                // 操作类型
  readonly entityType: SoloipsEntityType;        // 实体类型
  readonly entityId: string;                     // 实体 ID
  readonly context: SoloipsOperationContext;     // 上下文信息
  readonly result: SoloipsOperationResult;       // 操作结果
  readonly metadata?: Readonly<Record<string, SoloipsJsonValue>>;
};

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

// ID 类型
export type SoloipsOperationLogId = SoloipsCoreId<"operation_log">;
```

### 5.3 系统监测模型

```typescript
// 新增表：system_metrics
export type SoloipsSystemMetricsRecord = {
  readonly id: SoloipsMetricsId;
  readonly timestamp: string;
  readonly companyId: SoloipsCompanyId;
  readonly category: SoloipsMetricsCategory;
  readonly metrics: Readonly<Record<string, number>>;
  readonly tags?: Readonly<Record<string, string>>;
};

export type SoloipsMetricsCategory = 
  | "performance"     // 性能指标
  | "usage"           // 使用量
  | "health"          // 健康状态
  | "business";       // 业务指标

// ID 类型
export type SoloipsMetricsId = SoloipsCoreId<"metrics">;
```

### 5.4 告警机制

```typescript
// 告警接口
export interface SoloipsAlertService {
  /**
   * 发送告警
   */
  sendAlert(alert: SoloipsAlert): Promise<SoloipsAlertResult>;

  /**
   * 获取告警历史
   */
  getAlertHistory(
    companyId: SoloipsCompanyId,
    options?: {
      readonly level?: SoloipsAlertLevel;
      readonly since?: string;
      readonly limit?: number;
    }
  ): Promise<readonly SoloipsAlert[]>;

  /**
   * 确认告警
   */
  acknowledgeAlert(
    alertId: SoloipsAlertId,
    acknowledgedBy: string
  ): Promise<void>;

  /**
   * 配置告警规则
   */
  configureAlertRules(
    companyId: SoloipsCompanyId,
    rules: readonly SoloipsAlertRule[]
  ): Promise<void>;
}

export type SoloipsAlertLevel = "info" | "warning" | "error" | "critical";

export type SoloipsAlert = {
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

export type SoloipsAlertCategory = 
  | "upstream_failure"      // 上游 API 故障
  | "resource_limit"        // 资源限制
  | "performance"          // 性能告警
  | "security"             // 安全事件
  | "business";            // 业务事件

export type SoloipsAlertRule = {
  readonly id: string;
  readonly enabled: boolean;
  readonly condition: SoloipsAlertCondition;
  readonly actions: readonly SoloipsAlertAction[];
};

export type SoloipsAlertCondition = {
  readonly metric: string;
  readonly operator: "gt" | "lt" | "eq" | "gte" | "lte";
  readonly threshold: number;
  readonly duration?: number;  // 持续时间（秒）
};

// ID 类型
export type SoloipsAlertId = SoloipsCoreId<"alert">;
```

### 5.5 日志查询接口

```typescript
// 日志查询服务
export interface SoloipsLogService {
  /**
   * 查询操作日志
   */
  queryOperationLogs(options: {
    readonly companyId?: SoloipsCompanyId;
    readonly actorId?: string;
    readonly action?: SoloipsAction;
    readonly entityType?: SoloipsEntityType;
    readonly from?: string;
    readonly to?: string;
    readonly limit?: number;
    readonly offset?: number;
  }): Promise<{
    readonly logs: readonly SoloipsOperationLogRecord[];
    readonly total: number;
    readonly hasMore: boolean;
  }>;

  /**
   * 获取实体的操作历史
   */
  getEntityHistory(entityId: string): Promise<readonly SoloipsOperationLogRecord[]>;

  /**
   * 导出审计日志
   */
  exportAuditLog(options: {
    readonly companyId: SoloipsCompanyId;
    readonly from: string;
    readonly to: string;
    readonly format: "json" | "csv";
  }): Promise<Blob>;
}
```

---

## 6. 限制实现策略

### 6.1 订阅计划限制表

| 限制项 | Free | Pro | Enterprise |
|---|---|---|---|
| 公司数量 | 1 | 3 | 无限制 |
| 每公司部门数 | 2 | 10 | 无限制 |
| 每部门团队数 | 2 | 5 | 无限制 |
| 每公司员工数 | 5 | 50 | 无限制 |
| 总助理数量 | 0 | 1 | 多个 |
| 日志保留天数 | 7 | 30 | 90 |
| 监控数据保留天数 | 7 | 30 | 90 |
| API 速率限制 | 100/分钟 | 500/分钟 | 自定义 |

### 6.2 限制检查实现

```typescript
// src/subscription-limits.ts

export interface SoloipsSubscriptionLimits {
  readonly maxCompanies: number;
  readonly maxDepartmentsPerCompany: number;
  readonly maxTeamsPerDepartment: number;
  readonly maxEmployeesPerCompany: number;
  readonly maxChiefAssistants: number;
  readonly logRetentionDays: number;
  readonly monitoringRetentionDays: number;
  readonly apiRateLimit: number;
}

/**
 * 订阅计划限制映射
 */
export const SUBSCRIPTION_LIMITS: Record<SoloipsSubscriptionPlan, SoloipsSubscriptionLimits> = {
  free: {
    maxCompanies: 1,
    maxDepartmentsPerCompany: 2,
    maxTeamsPerDepartment: 2,
    maxEmployeesPerCompany: 5,
    maxChiefAssistants: 0,
    logRetentionDays: 7,
    monitoringRetentionDays: 7,
    apiRateLimit: 100,
  },
  pro: {
    maxCompanies: 3,
    maxDepartmentsPerCompany: 10,
    maxTeamsPerDepartment: 5,
    maxEmployeesPerCompany: 50,
    maxChiefAssistants: 1,
    logRetentionDays: 30,
    monitoringRetentionDays: 30,
    apiRateLimit: 500,
  },
  enterprise: {
    maxCompanies: Infinity,
    maxDepartmentsPerCompany: Infinity,
    maxTeamsPerDepartment: Infinity,
    maxEmployeesPerCompany: Infinity,
    maxChiefAssistants: Infinity,
    logRetentionDays: 90,
    monitoringRetentionDays: 90,
    apiRateLimit: Infinity,
  },
};

/**
 * 限制检查服务
 */
export interface SoloipsLimitCheckService {
  /**
   * 检查是否允许创建新实体
   */
  canCreate(
    subscriptionId: SoloipsSubscriptionId,
    entityType: SoloipsEntityType,
    parentId?: string
  ): Promise<{
    allowed: boolean;
    reason?: string;
    current: number;
    limit: number;
  }>;

  /**
   * 获取当前使用量
   */
  getUsage(
    subscriptionId: SoloipsSubscriptionId
  ): Promise<SoloipsSubscriptionUsage>;

  /**
   * 检查 API 速率限制
   */
  checkRateLimit(
    subscriptionId: SoloipsSubscriptionId,
    operation: string
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: string;
  }>;
}

export type SoloipsSubscriptionUsage = {
  readonly companies: { readonly current: number; readonly limit: number };
  readonly departments: { readonly current: number; readonly limit: number };
  readonly teams: { readonly current: number; readonly limit: number };
  readonly employees: { readonly current: number; readonly limit: number };
  readonly chiefAssistants: { readonly current: number; readonly limit: number };
};
```

### 6.3 限制检查流程

```typescript
// 限制检查的完整流程示例

async function createDepartment(
  subscriptionId: SoloipsSubscriptionId,
  companyId: SoloipsCompanyId,
  input: SoloipsCreateDepartmentInput
): Promise<SoloipsCommitOutcome<SoloipsCreateDepartmentResult>> {
  // 1. 检查订阅限制
  const limitCheck = await limitCheckService.canCreate(
    subscriptionId,
    "department",
    companyId
  );
  
  if (!limitCheck.allowed) {
    throw new SoloipsCoreError(
      "SOLOIPS_SUBSCRIPTION_LIMIT_EXCEEDED",
      `部门数量已达上限 (${limitCheck.current}/${limitCheck.limit}): ${limitCheck.reason}`
    );
  }

  // 2. 检查权限
  const canCreate = await permissionService.checkPermission(
    context,
    "department.create"
  );
  
  if (!canCreate) {
    throw new SoloipsCoreError(
      "SOLOIPS_PERMISSION_DENIED",
      "您没有权限创建部门"
    );
  }

  // 3. 执行创建（现有逻辑）
  return this.#gate.commit(
    { operationId, kind: "department.create", intent: { companyId, name } },
    async (publish) => {
      const id = newDepartmentId();
      await publish.put("department", id, {
        id,
        companyId,
        name,
        status: "active",
        createdAt: new Date().toISOString(),
      });
      return { departmentId: id };
    }
  );
}
```

### 6.4 配置驱动的限制实现

```typescript
// config/subscription-limits.yaml
# 订阅计划配置

plans:
  free:
    display_name: "免费版"
    max_companies: 1
    max_departments_per_company: 2
    max_teams_per_department: 2
    max_employees_per_company: 5
    max_chief_assistants: 0
    log_retention_days: 7
    monitoring_retention_days: 7
    api_rate_limit: 100
    features:
      - basic_ip_management
      - basic_team_collaboration
    disabled_features:
      - multi_company
      - chief_assistant
      - advanced_monitoring

  pro:
    display_name: "专业版"
    max_companies: 3
    max_departments_per_company: 10
    max_teams_per_department: 5
    max_employees_per_company: 50
    max_chief_assistants: 1
    log_retention_days: 30
    monitoring_retention_days: 30
    api_rate_limit: 500
    features:
      - basic_ip_management
      - basic_team_collaboration
      - multi_company
      - chief_assistant
      - advanced_monitoring
      - priority_support
    disabled_features: []

  enterprise:
    display_name: "企业版"
    max_companies: -1  # 无限制
    max_departments_per_company: -1
    max_teams_per_department: -1
    max_employees_per_company: -1
    max_chief_assistants: -1
    log_retention_days: 90
    monitoring_retention_days: 90
    api_rate_limit: -1
    features:
      - basic_ip_management
      - basic_team_collaboration
      - multi_company
      - chief_assistant
      - advanced_monitoring
      - priority_support
      - custom_integrations
      - dedicated_support
      - sla_guarantee
    disabled_features: []
```

### 6.5 限制检查的幂等处理

```typescript
// 限制检查使用操作台账记录

async checkLimitWithLogging(
  subscriptionId: SoloipsSubscriptionId,
  entityType: SoloipsEntityType,
  operationId: SoloipsOperationId
): Promise<boolean> {
  // 1. 查询操作台账中最近的同类操作
  const recentOps = await this.#gate.listRecentOperations(
    operationId,
    { entityType, since: "24h" }
  );

  // 2. 如果有成功的创建操作在限制边界，考虑拒绝
  // （实际限制主要在创建前检查，这里用于追踪）

  // 3. 记录检查结果
  await this.#gate.recordLimitCheck({
    operationId,
    subscriptionId,
    entityType,
    timestamp: new Date().toISOString(),
  });

  return true;
}
```

---

## 7. 新增表清单

### 7.1 表汇总

| 表名 | 类型 | 主键 | 关联 |
|---|---|---|---|
| subscription | 新增 | subscriptionId | → User (外部) |
| team | 新增 | teamId | → department |
| chief_assistant | 新增 | chiefAssistantId | → employee, company |
| operation_log | 新增 | operationLogId | → 全部实体 |
| system_metrics | 新增 | metricsId | → company |
| alert | 新增 | alertId | → company |
| alert_rule | 新增 | ruleId | → company |

### 7.2 表创建顺序

```
1. subscription (无外键依赖)
2. company (依赖 subscription)
3. department (依赖 company)
4. team (依赖 department)
5. employee (无外键依赖)
6. appointment (依赖 employee, department, team)
7. chief_assistant (依赖 employee, company, appointment)
8. operation_log (无外键依赖，但记录所有实体)
9. system_metrics (依赖 company)
10. alert (依赖 company)
11. alert_rule (依赖 company)
```

---

## 8. 错误码扩展

```typescript
// src/errors.ts 新增错误码

export type SoloipsCoreErrorCode =
  // ... 现有错误码 ...
  
  // 订阅与限制相关
  | "SOLOIPS_SUBSCRIPTION_NOT_FOUND"
  | "SOLOIPS_SUBSCRIPTION_EXPIRED"
  | "SOLOIPS_SUBSCRIPTION_LIMIT_EXCEEDED"
  | "SOLOIPS_PLAN_NOT_ALLOWED"

  // 权限相关
  | "SOLOIPS_PERMISSION_DENIED"
  | "SOLOIPS_ROLE_NOT_FOUND"

  // 团队相关
  | "SOLOIPS_TEAM_NOT_FOUND"
  | "SOLOIPS_TEAM_LIMIT_EXCEEDED"

  // 总助理相关
  | "SOLOIPS_CHIEF_ASSISTANT_NOT_FOUND"
  | "SOLOIPS_CHIEF_ASSISTANT_LIMIT_EXCEEDED"
  | "SOLOIPS_CHIEF_ASSISTANT_ALREADY_EXISTS"

  // 日志相关
  | "SOLOIPS_LOG_NOT_FOUND"
  | "SOLOIPS_LOG_RETENTION_EXCEEDED";
```

---

## 9. 接口设计总结

### 9.1 核心服务接口

| 服务 | 方法数 | 说明 |
|---|---|---|
| SoloipsCoreService (扩展) | +8 | 新增订阅、团队、总助理相关方法 |
| SoloipsPermissionService | ~10 | 权限检查 |
| SoloipsLimitCheckService | ~5 | 限制检查 |
| SoloipsLogService | ~5 | 日志查询 |
| SoloipsAlertService | ~5 | 告警管理 |
| SoloipsChiefAssistantService | ~5 | 总助理工作 |

### 9.2 新增 ID 类型

| 类型 | 用途 |
|---|---|
| SoloipsSubscriptionId | 订阅标识 |
| SoloipsTeamId | 团队标识 |
| SoloipsChiefAssistantId | 总助理标识 |
| SoloipsOperationLogId | 操作日志标识 |
| SoloipsMetricsId | 指标标识 |
| SoloipsAlertId | 告警标识 |

---

## 10. 实施建议

### 10.1 实施顺序

1. **Phase 1: 基础扩展**
   - 扩展 company 表（subscriptionId）
   - 新增 subscription 表
   - 实现订阅限制检查

2. **Phase 2: 团队层级**
   - 新增 team 表
   - 扩展 department（leaderId）
   - 扩展 employee（teamId）
   - 扩展 appointment（teamId, role）

3. **Phase 3: 总助理**
   - 新增 chief_assistant 表
   - 实现总助理服务
   - 实现汇报机制

4. **Phase 4: 权限体系**
   - 实现权限服务
   - 权限检查集成到所有写操作
   - Owner 角色支持

5. **Phase 5: 日志与监测**
   - 新增 operation_log 表
   - 实现日志服务
   - 实现告警服务
   - 实现系统监测

### 10.2 向后兼容

- 所有新增字段在旧数据中设为可选或默认值
- 新增表为空时不影响现有功能
- 权限检查默认放行（渐进式启用）

### 10.3 数据迁移

```typescript
// 迁移脚本示例：v1 → v2

async function migrateV1ToV2(domain: SoloipsDomain) {
  // 1. 为现有 company 添加 subscriptionId
  for (const [id, company] of domain.table("company").entries()) {
    if (!("subscriptionId" in company)) {
      await domain.table("company").update(id, {
        subscriptionId: "default_free_subscription",
        status: "active",
        createdAt: new Date().toISOString(),
        metadata: {},
      });
    }
  }

  // 2. 为现有 department 添加默认值
  for (const [id, dept] of domain.table("department").entries()) {
    if (!("status" in dept)) {
      await domain.table("department").update(id, {
        status: "active",
        createdAt: new Date().toISOString(),
      });
    }
  }

  // 3. 为现有 employee 添加默认值
  for (const [id, emp] of domain.table("employee").entries()) {
    if (!("status" in emp)) {
      await domain.table("employee").update(id, {
        status: emp.memoryInitialized ? "active" : "onboarding",
      });
    }
  }

  // 4. 创建默认订阅记录
  const defaultSubId = "default_free_subscription";
  await domain.table("subscription").put(defaultSubId, {
    id: defaultSubId,
    ownerId: "system",
    plan: "free",
    maxCompanies: 1,
    maxDepartmentsPerCompany: 2,
    maxTeamsPerDepartment: 2,
    maxEmployeesPerCompany: 5,
    maxChiefAssistants: 0,
    logRetentionDays: 7,
    monitoringRetentionDays: 7,
    createdAt: new Date().toISOString(),
  });
}
```

---

## 11. 变更历史

| 日期 | 变更 | 责任人 |
|---|---|---|
| 2026-09-17 | 初稿：多公司/部门/团队架构设计 | product-owner |
