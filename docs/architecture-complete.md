# SoloIPs 完整架构设计文档

> 本文档整合 Codex 技术咨询、架构分析、需求澄清和 UI 设计，为 SoloIPs 提供完整的开发蓝图。
> 
> **核心原则**：所有功能插件化，接入 DSH 方式，方便 DSH 更新合并，尽量复用 DSH 代码。
>
> **权威数据模型**：数据模型、配额与实现状态以 [`docs/design/data-contract.md`](design/data-contract.md) 为准；
> **里程碑定义**同样以该文 §6.1 为唯一正文（本文 §6 的旧阶段划分已被取代，仅作历史参考）。
> 本文与之冲突处以契约为准。
>
> **运营服务接口**：多租户认证、订阅财务、AI 模型计费详见 [`docs/design/operation-services.md`](design/operation-services.md)（后期实现）

---

## 1. 架构总览

### 1.1 核心约束

| 约束 | 说明 |
|------|------|
| **业务写权威按领域划分** | core 管理组织结构和文档模型的写权威；业务插件（如 tools-pv）管理各自领域的写权威 |
| **所有功能作为 DSH 插件** | 复用 DSH 的插件化机制 |
| **方便 DSH 更新合并** | SoloIPs 代码尽量少侵入 DSH |
| **Web/3D 作为 DSH Client 扩展** | 通过 Slots 机制接入 |

### 1.2 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                           用户浏览器                                 │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              DSH Web Client (可替换界面层)                     │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │          SoloIPs Client Plugins (SoloIPs UI 插件)         │  │  │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │  │
│  │  │  │ Company UI  │  │  3D Scene   │  │  Team Panel     │  │  │  │
│  │  │  │ (Slot扩展)  │  │ (R3F Canvas)│  │ (Slot扩展)     │  │  │  │
│  │  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                        ↓ shared stores (Zustand)              │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                               ↓ ctx.remote / Slots                   │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                           Host 服务器                               │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    DSH Runtime + Plugins                       │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │            SoloIPs Host Plugins (SoloIPs 业务插件)       │  │  │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │  │
│  │  │  │soloips-core │  │soloips-web  │  │soloips-tools-pv│  │  │  │
│  │  │  │ (通用Domain)│  │ (API桥接)   │  │ (业务插件)     │  │  │  │
│  │  │  └──────┬──────┘  └──────┬──────┘  └───────┬────────┘  │  │  │
│  │  │         │                │                 │            │  │  │
│  │  │         └────────────────┴─────────────────┘            │  │  │
│  │  │                         ↓                              │  │  │
│  │  │              soloips-adapter-dsh                        │  │  │
│  │  │              (DSH 适配层)                               │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                         ↓ ctx.* ports                         │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │              DSH Official Services                       │  │  │
│  │  │  Storage │ Session │ Agent │ Subagent │ Team │ Tools   │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1.5 公司生态架构（SOLO-COMPANY-01）

SoloIPs 采用**三层公司层级**设计，支持内容发布生态系统：

### 1.5.1 公司层级结构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SoloIPs 平台层                                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  SoloIPs 品牌公司 (type=platform, accountId=soloips_official)       │   │
│  │                                                                         │   │
│  │  └── IT 部门：开发/维护 SoloIPs 系统插件                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  运营子公司群 (type=operation, parentCompanyId=平台公司ID)           │   │
│  │                                                                         │   │
│  │   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │   │
│  │   │ 漫画网站     │ │ 短视频网站   │ │ 音乐网站     │                │   │
│  │   │ 子公司       │ │ 子公司       │ │ 子公司       │                │   │
│  │   │              │ │              │ │              │                │   │
│  │   │ 智能体管理   │ │ 智能体管理   │ │ 智能体管理   │                │   │
│  │   │ 漫画网站运营 │ │ 视频网站运营 │ │ 音乐平台运营 │                │   │
│  │   └──────────────┘ └──────────────┘ └──────────────┘                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│                    用户公司层                                               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  用户公司 (type=enterprise, accountId=用户账户)                       │   │
│  │                                                                         │   │
│  │  用户 A：公司"创意工坊"                                               │   │
│  │  ├── 部门：创作部、运营部                                            │   │
│  │  ├── 子公司 A1（漫画部门）→ 投稿到 SoloIPs 漫画网站子公司            │   │
│  │  └── 子公司 A2（动画部门）→ 投稿到 SoloIPs 视频网站子公司            │   │
│  │                                                                         │   │
│  │  用户 B：公司"星际工作室"                                             │   │
│  │  ├── IP"小明历险记"→ 投稿到 SoloIPs 漫画网站子公司                   │   │
│  │  └── IP"星际传说"→ 短剧→ SoloIPs 视频网站，配乐→ SoloIPs 音乐网站  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.5.2 公司类型定义

| 类型 | 代码值 | 说明 | 持有者 | 是否占配额 |
|------|--------|------|--------|-----------|
| 平台公司 | `platform` | SoloIPs 品牌方 | SoloIPS 官方 | 不占 |
| 运营子公司 | `operation` | 业务平台（漫画/视频/音乐网站） | SoloIPS 官方 | 不占 |
| 用户公司 | `enterprise` | 用户创建的 AI 公司 | 用户 | 占 |
| 用户子公司 | `subsidiary` | 用户公司的下级业务单元 | 用户 | 占 |

### 1.5.3 权益配额规则

| 订阅计划 | 用户公司数 | 用户子公司数 | 说明 |
|----------|-----------|-------------|------|
| Free | 1 | 0 | 基础版 |
| Pro | 1 | 3 | 进阶版 |
| Enterprise | 无限制 | 无限制 | 企业版 |

**配额计算**：按顶层公司计算，控制子公司总数。

### 1.5.4 内容发布流程

```
用户 IP 内容创建
       ↓
  投稿申请（用户公司 → SoloIPs 运营子公司）
       ↓
  SoloIPs 子公司智能体审核
       ↓
  发布到平台（面向观众）
```

---

## 2. 包结构设计

### 2.1 包清单与职责

| 包 | 类型 | 职责 | DSH 集成方式 |
|---|---|---|---|
| **soloips-bundle** | DSH Bundle | 装配声明，patch 覆写 | 作为 DSH Profile 的一部分 |
| **soloips-adapter-dsh** | DSH Plugin | DSH 适配，收敛全部 `@deepseek-ai/*` | **核心复用 DSH** |
| **soloips-core** | DSH Plugin | 通用业务状态（**公司层级**、组织结构、文档模型） | 作为 DSH Service |
| **soloips-web** | DSH Client Plugin | Web 界面 + 3D 可视化 | **通过 Client Slots 扩展** |
| **soloips-tools-pv** | 业务插件 | 制作工具适配 | 独立包，用户/SoloIPS开发团队维护 |

### 2.2 目录结构（插件化）

> 顶层为**实际目录名**（`bundle/`、`adapter-dsh/`、`core/`、`web/`；package 名才是 `soloips-*`）；各包内部结构为设计稿，未实现部分以 `docs/technical/packages.md` 的当前实际登记为准。

```
packages/
├── bundle/                      # package: soloips-bundle
│   ├── cordis.patch.yml          # DSH patch 配置
│   └── package.json
│
├── adapter-dsh/                 # package: soloips-adapter-dsh，DSH 适配层（复用 DSH API）
│   ├── src/
│   │   ├── index.ts              # Plugin 入口
│   │   ├── contracts.ts          # 业务契约
│   │   └── ports/                # 7 个 DSH 端口映射（shared.ts 为内部辅助，非端口）
│   │       ├── storage.ts
│   │       ├── session.ts
│   │       ├── agents.ts
│   │       ├── subagents.ts
│   │       ├── team.ts           # 复用 DSH Agent Team（fail-closed 占位）
│   │       ├── tools.ts
│   │       └── events.ts
│   ├── cordis.patch.yml
│   └── package.json
│
├── core/                        # package: soloips-core，业务 Domain（作为 DSH Service）
│   ├── src/
│   │   ├── index.ts              # Service 入口
│   │   ├── contracts.ts          # Record 类型定义
│   │   ├── store.ts             # 业务 Store
│   │   ├── commit-gate.ts       # 事务门
│   │   ├── services/            # 业务服务
│   │   │   ├── company.ts
│   │   │   ├── department.ts
│   │   │   ├── employee.ts
│   │   │   ├── appointment.ts
│   │   │   └── entitlements.ts  # 权益策略
│   │   └── domain/              # Domain 逻辑
│   │       └── operations.ts
│   ├── cordis.patch.yml
│   └── package.json
│
├── web/                         # package: soloips-web，UI 插件（通过 DSH Client Slots 扩展）
│   ├── src/
│   │   ├── index.ts              # Client Plugin 入口
│   │   ├── host/                  # Host 侧（SSR/API 桥接）
│   │   │   └── controllers/     # API Controllers
│   │   ├── client/               # Browser 侧
│   │   │   ├── App.tsx
│   │   │   ├── slots/           # DSH Client Slots 扩展点
│   │   │   │   ├── company-sidebar.tsx
│   │   │   │   ├── department-panel.tsx
│   │   │   │   ├── employee-view.tsx
│   │   │   │   └── team-dashboard.tsx
│   │   │   ├── three/           # 3D 场景（复用 Three.js）
│   │   │   │   ├── scenes/
│   │   │   │   │   ├── CompanyScene.tsx
│   │   │   │   │   └── DepartmentScene.tsx
│   │   │   │   ├── components/
│   │   │   │   │   ├── Building.tsx
│   │   │   │   │   └── GlowEffect.tsx
│   │   │   │   └── shaders/
│   │   │   ├── stores/         # Zustand 状态（与 3D 共享）
│   │   │   │   └── company-store.ts
│   │   │   └── api/            # Remote API 调用
│   │   │       └── soloips-remote.ts
│   │   └── shared/              # Web/3D 共享
│   │       ├── types/
│   │       └── theme/
│   ├── cordis.patch.yml          # Client Module 配置
│   └── package.json
│
└── tools-pv/                    # package: soloips-tools-pv，制作工具插件（S1 创建）
    ├── src/
    │   ├── index.ts
    │   └── tools/
    └── package.json
```

---

## 3. 核心模块设计

### 3.1 多公司数据模型（遵循 DSH 存储方式）

```typescript
// soloips-core/src/contracts.ts

/**
 * 账户权益（免费版限制）
 * 遵循 DSH 的 typed storage 方式
 */
export interface SoloipsEntitlementRecord {
  readonly accountId: string;
  readonly planCode: 'free' | 'pro' | 'enterprise';
  readonly companyLimit: number;        // 顶层用户公司上限：free/pro=1，enterprise=-1（无限）
  readonly subsidiaryLimit: number;     // 子公司总数上限：free=0，pro=3，enterprise=-1（无限）
  readonly features: readonly string[];
}

/**
 * 公司（归属隔离）
 * companyId 是所有业务数据的隔离条件
 */
export interface SoloipsCompanyRecord {
  readonly id: SoloipsCompanyId;
  readonly accountId: string;          // 归属账户
  readonly parentCompanyId?: SoloipsCompanyId;  // 父公司；无则为顶层公司
  readonly type: 'platform' | 'operation' | 'enterprise' | 'subsidiary';
  readonly name: string;
  readonly status: 'active' | 'archived';
  readonly createdAt: string;
}

/**
 * 部门（公司内组织）
 */
export interface SoloipsDepartmentRecord {
  readonly id: SoloipsDepartmentId;
  readonly companyId: SoloipsCompanyId;
  readonly name: string;
  readonly leaderAppointmentId?: SoloipsAppointmentId;
  readonly status: 'active' | 'paused' | 'archived';
}

/**
 * 任职（带作用域的角色）
 * 作用域支持：公司级 / 部门级 / 团队级
 */
export type SoloipsAppointmentScope =
  | { readonly kind: 'company'; readonly companyId: SoloipsCompanyId }
  | { readonly kind: 'department'; readonly companyId: SoloipsCompanyId; readonly departmentId: SoloipsDepartmentId }
  | { readonly kind: 'team'; readonly companyId: SoloipsCompanyId; readonly teamBindingId: string };

export interface SoloipsAppointmentRecord {
  readonly id: SoloipsAppointmentId;
  readonly employeeId: SoloipsEmployeeId;
  readonly scope: SoloipsAppointmentScope;
  readonly role: 'general_assistant' | 'department_lead' | 'team_lead' | 'member';
  readonly generation: number;          // 权限代际
  readonly status: 'active' | 'revoked';
}

/**
 * 团队绑定（产品团队 ↔ DSH Team）
 */
export interface SoloipsTeamBindingRecord {
  readonly id: string;
  readonly companyId: SoloipsCompanyId;
  readonly departmentId?: SoloipsDepartmentId;
  readonly dshTeamRef: string;         // DSH Team Session Id
  readonly leadAppointmentId: SoloipsAppointmentId;
  readonly status: 'active' | 'archived';
}

/**
 * 执行绑定（谁在哪家公司凭哪次任职执行）
 */
export interface SoloipsExecutionBindingRecord {
  readonly id: string;
  readonly companyId: SoloipsCompanyId;
  readonly employeeId: SoloipsEmployeeId;
  readonly appointmentId: SoloipsAppointmentId;
  readonly appointmentGeneration: number;
  readonly dshSessionRef: string;
  readonly startedAt: string;
}
```

### 3.2 权益策略接口（插件化）

```typescript
// soloips-core/src/services/entitlements.ts

/**
 * 权益策略接口
 * 可替换实现：文件配置 / 许可证服务 / 订阅 API
 */
export interface EntitlementResolver {
  resolve(accountId: string): Promise<EntitlementResult>;
}

export interface EntitlementResult {
  readonly planCode: 'free' | 'pro' | 'enterprise';
  readonly companyLimit: number;        // -1 表示无限
  readonly subsidiaryLimit: number;     // -1 表示无限
  readonly features: readonly string[];
}

/**
 * 默认实现：配置文件
 * 未来可替换为许可证服务
 */
export class ConfigEntitlementResolver implements EntitlementResolver {
  async resolve(accountId: string): Promise<EntitlementResult> {
    // 从 cordis.patch.yml 或环境变量读取；三层配额见 data-contract §2
    const isPro = process.env.SOLOIPS_PRO_ACCOUNTS?.includes(accountId);
    return {
      planCode: isPro ? 'pro' : 'free',
      companyLimit: 1,
      subsidiaryLimit: isPro ? 3 : 0,
      features: isPro ? ['multi_company', 'advanced_analytics'] : [],
    };
  }
}
```

### 3.3 总助理服务（遵循 DSH Service 模式）

```typescript
// soloips-core/src/services/chief-assistant.ts

import type { Context } from '@deepseek-ai/cordis';

/**
 * 总助理职责
 * 直接向用户负责，维护公司日常运作
 */
export interface ChiefAssistantResponsibilities {
  // 接收与分解目标
  receiveGoal(goal: string): Promise<void>;
  
  // 协调部门工作
  coordinateDepartment(departmentId: SoloipsDepartmentId): Promise<void>;
  
  // 汇总进度报告
  summarizeProgress(): Promise<ProgressSummary>;
  
  // 处理日常阻塞
  resolveBlocker(blockerId: string): Promise<void>;
  
  // 向用户提交待决事项
  submitPendingMatters(): Promise<void>;
}

/**
 * 总助理事件触发
 * 遵循 DSH 的事件驱动模式
 */
export type ChiefAssistantTriggerEvent =
  | { readonly type: 'user_goal'; readonly goal: string }
  | { readonly type: 'department_blocked'; readonly departmentId: SoloipsDepartmentId }
  | { readonly type: 'review_completed'; readonly taskId: string }
  | { readonly type: 'execution_failed'; readonly executionId: string }
  | { readonly type: 'upstream_error'; readonly error: string };
```

### 3.4 日志与监测（DSH 集成）

```typescript
// soloips-core/src/services/audit.ts

/**
 * 三层日志架构（遵循 DSH 的分层设计）
 */

/**
 * 1. 业务操作审计
 * 回答：谁以什么身份在哪家公司做了什么？
 */
export interface SoloipsAuditRecord {
  readonly id: string;
  readonly occurredAt: string;
  readonly companyId: SoloipsCompanyId;
  readonly actorId: string;
  readonly appointmentId: SoloipsAppointmentId;
  readonly appointmentGeneration: number;
  readonly operationType: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly outcome: 'success' | 'rejected' | 'error';
  readonly details: Record<string, unknown>;
}

/**
 * 2. 执行历史（复用 DSH Session/Team 日志）
 * 已在 DSH 中实现，SoleIPs 只需读取投影
 */

/**
 * 3. 系统监测（结构化日志）
 */
export interface SoloipsHealthMetrics {
  readonly timestamp: string;
  readonly host: { available: boolean; latency?: number };
  readonly storage: { available: boolean; writeLatency?: number };
  readonly activeExecutions: number;
  readonly pendingOperations: number;
  readonly blockedTasks: number;
  readonly upstreamErrors: readonly string[];
}
```

---

## 4. DSH 插件化设计

### 4.1 Host 插件（soloips-core）

```typescript
// soloips-core/src/index.ts

import type { Context } from '@deepseek-ai/cordis';
import { SERVICE_NAME } from '@deepseek-ai/cordis';
import type { StorageDomain } from '@deepseek-ai/dsh-storage-domain';
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence';

/** Service 名称 */
export const name = 'soloips-core';

/** 依赖 DSH 核心服务 */
export const inject = ['storage', 'sessionPersistence'] as const;

export interface Config {
  entitlementResolver?: EntitlementResolver;
}

export const Config = z.object({
  entitlementResolver: z.any().optional(),
});

/**
 * SoloIPs Core Service
 * 作为 DSH Service 接入，符合 DSH 生命周期
 */
export function apply(ctx: Context, config: Config): void {
  // 初始化权益策略
  const entitlements = config.entitlementResolver ?? new ConfigEntitlementResolver();
  
  // 注册存储 Domain
  const domain = ctx.storage.registerDomain({
    name: 'soloips',
    version: 1,
    schemas: {
      company: companyRecordSchema,
      department: departmentRecordSchema,
      employee: employeeRecordSchema,
      appointment: appointmentRecordSchema,
      teamBinding: teamBindingRecordSchema,
      executionBinding: executionBindingRecordSchema,
      entitlements: entitlementsRecordSchema,
      audit: auditRecordSchema,
    },
  });
  
  // 初始化业务服务
  const companyService = new CompanyService(domain, entitlements);
  const departmentService = new DepartmentService(domain);
  const employeeService = new EmployeeService(domain);
  const auditService = new AuditService(domain);
  
  // 注册 Remote API（供 Client 调用）
  ctx.remote.registerNamespace('soloips', {
    // 公司操作
    createCompany: (accountId: string, name: string) => 
      companyService.create(accountId, name),
    getCompany: (id: string) => 
      companyService.get(id),
    listCompanies: (accountId: string) => 
      companyService.listByAccount(accountId),
    
    // 权益检查
    checkEntitlements: (accountId: string) => 
      entitlements.resolve(accountId),
    
    // 审计查询
    queryAudit: (filter: AuditFilter) => 
      auditService.query(filter),
    
    // ... 其他 API
  });
  
  // 注册事件
  ctx.events.on('soloips:company_created', ({ companyId }) => {
    // 初始化总助理任职
  });
}
```

### 4.2 Client 插件（soloips-web）

```typescript
// soloips-web/src/index.ts

import type { ClientModules } from '@deepseek-ai/dsh-client-modules';
import type { WebPluginConfig } from '@deepseek-ai/dsh-client';

/** Client Plugin 入口 */
export function register(client: ClientModules): void {
  // 注册 SoloIPs 路由
  client.registerRoute('/soloips/*', {
    import: () => import('./client/App'),
    slots: ['main', 'sidebar'],
  });
  
  // 注册 Sidebar 扩展
  client.registerSlot('sidebar', {
    id: 'soloips-company-list',
    component: () => import('./client/slots/CompanySidebar'),
    priority: 50,
  });
  
  // 注册 Main 区域扩展
  client.registerSlot('main', {
    id: 'soloips-dashboard',
    component: () => import('./client/slots/Dashboard'),
    route: '/soloips',
  });
  
  // 注册 3D 视图入口
  client.registerSlot('main', {
    id: 'soloips-3d-view',
    component: () => import('./client/three/CompanyScene'),
    route: '/soloips/3d',
  });
}
```

### 4.3 DSH Client Slots 扩展点

```typescript
// soloips-web/src/client/slots/CompanySidebar.tsx

import { useRemote } from '@deepseek-ai/dsh-client-hooks';
import { useCompanyStore } from '../stores/company-store';

/**
 * 公司列表 Sidebar 扩展
 * 接入 DSH 的 sidebar Slot
 */
export function CompanySidebar() {
  const { data: companies, loading } = useRemote('soloips.listCompanies');
  const { selectedCompany, selectCompany } = useCompanyStore();
  
  if (loading) return <SidebarSkeleton />;
  
  return (
    <div className="soloips-sidebar">
      <h3>公司</h3>
      {companies?.map(company => (
        <SidebarItem
          key={company.id}
          active={selectedCompany === company.id}
          onClick={() => selectCompany(company.id)}
        >
          {company.name}
        </SidebarItem>
      ))}
      <Button onClick={() => navigate('/soloips/company/new')}>
        + 新建公司
      </Button>
    </div>
  );
}
```

---

## 5. UI 双版本设计

### 5.1 Web 界面（主要交互）

```
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────┐  SoloIPs                    [🔍 搜索] [⚙ 设置]  │
│  │ Logo   │                                                    │
│  └─────────┘                                                    │
├────────────┬──────────────────────────────────────────────────┤
│            │                                                    │
│  公司列表   │  ┌─────────────────────────────────────────────┐  │
│  ├─ 公司A  │  │           公司概览 Dashboard                 │  │
│  │  ├─ 部门1│  │  ┌────────┐ ┌────────┐ ┌────────┐         │  │
│  │  ├─ 部门2│  │  │ 部门数 │ │ 员工数 │ │ 任务数 │         │  │
│  │  └─ ... │  │  └────────┘ └────────┘ └────────┘         │  │
│  ├─ 公司B  │  │                                             │  │
│  │  └─ ... │  │  最近活动                                    │  │
│  └─ ...    │  │  ┌─────────────────────────────────────┐   │  │
│            │  │  │ • 编剧部完成第3集剧本                 │   │  │
│  [+新建]   │  │  │ • 制作部开始渲染                     │   │  │
│            │  │  │ • 总助理提交周报                     │   │  │
│            │  │  └─────────────────────────────────────┘   │  │
│            │  └─────────────────────────────────────────────┘  │
└────────────┴──────────────────────────────────────────────────┘
```

### 5.2 3D 界面（可视化增强）

```typescript
// soloips-web/src/client/three/scenes/CompanyScene.tsx

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Float, Text, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useCompanyStore } from '../stores/company-store';

/**
 * 3D 公司大楼场景
 * 复用 Three.js + React Three Fiber
 * 风格：科幻深色 + 蓝色发光（参考截图）
 */
export function CompanyScene() {
  const { companies, selectedCompany } = useCompanyStore();
  
  return (
    <Canvas camera={{ position: [0, 5, 10], fov: 50 }}>
      {/* 深色背景 */}
      <color attach="background" args={['#0A0E17']} />
      
      {/* 环境光 */}
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={1} color="#00D4FF" />
      
      {/* 公司建筑群 */}
      {companies.map((company, i) => (
        <CompanyBuilding
          key={company.id}
          position={[i * 4 - companies.length * 2, 0, 0]}
          company={company}
          selected={selectedCompany === company.id}
        />
      ))}
      
      {/* 发光后处理 */}
      <EffectComposer>
        <Bloom luminanceThreshold={0.2} intensity={1} />
      </EffectComposer>
      
      {/* 轨道控制 */}
      <OrbitControls enablePan enableZoom enableRotate />
    </Canvas>
  );
}

/**
 * 单个公司建筑
 */
function CompanyBuilding({ position, company, selected }: Props) {
  return (
    <group position={position}>
      {/* 主体建筑 */}
      <Float speed={1} rotationIntensity={0.1} floatIntensity={0.3}>
        <mesh>
          <boxGeometry args={[2, 3, 2]} />
          <meshStandardMaterial
            color={selected ? '#00D4FF' : '#1a2a3a'}
            emissive={selected ? '#00D4FF' : '#000000'}
            emissiveIntensity={selected ? 0.5 : 0}
            transparent
            opacity={0.8}
          />
        </mesh>
      </Float>
      
      {/* 玻璃面板 */}
      <mesh position={[0, 1.5, 1.01]}>
        <planeGeometry args={[1.8, 2.8]} />
        <meshStandardMaterial
          color="#00D4FF"
          transparent
          opacity={0.1}
          metalness={1}
          roughness={0}
        />
      </mesh>
      
      {/* 公司名称 */}
      <Text
        position={[0, 3.5, 0]}
        fontSize={0.3}
        color="#00D4FF"
        anchorX="center"
        anchorY="middle"
      >
        {company.name}
      </Text>
      
      {/* 部门楼层指示 */}
      {company.departments.map((dept, i) => (
        <DepartmentFloor
          key={dept.id}
          position={[0, 1 - i * 0.8, 0]}
          department={dept}
        />
      ))}
    </group>
  );
}
```

### 5.3 视觉风格配置

```typescript
// soloips-web/src/client/shared/theme/sci-fi.ts

/**
 * 科幻风格主题
 * 基于用户提供的参考截图
 */
export const sciFiTheme = {
  colors: {
    primary: '#00D4FF',       // 青色发光
    secondary: '#4A9EFF',     // 蓝色
    accent: '#FF6B35',        // 橙色警示
    success: '#00FF88',       // 绿色成功
    warning: '#FFD700',       // 黄色警告
    error: '#FF4444',         // 红色错误
    background: '#0A0E17',    // 深空黑背景
    surface: 'rgba(0, 212, 255, 0.05)',  // 玻璃表面
    card: 'rgba(0, 212, 255, 0.1)',       // 卡片
    border: 'rgba(0, 212, 255, 0.2)',      // 边框
    text: '#E8F4FF',          // 主文字
    textSecondary: '#8BA4B4',  // 次要文字
  },
  effects: {
    glow: {
      enabled: true,
      color: '#00D4FF',
      intensity: 0.5,
    },
    pulse: {
      enabled: true,
      speed: 2,  // 脉冲速度（秒）
    },
    glass: {
      enabled: true,
      blur: 10,
      opacity: 0.1,
    },
    particles: {
      enabled: true,
      count: 100,
    },
  },
  shadows: {
    glow: '0 0 20px rgba(0, 212, 255, 0.3)',
    card: '0 4px 30px rgba(0, 0, 0, 0.5)',
  },
  animations: {
    transition: 'all 0.3s ease',
    hover: 'scale(1.02)',
  },
};
```

---

## 6. 开发里程碑〔已取代〕

> **〔已取代〕2026-09-17**：本节的阶段代号与含义（M1=Web 核心、Sonnet=3D 可视化、Opus=协作功能、M4+）与统一里程碑冲突，已被 [`docs/design/data-contract.md`](design/data-contract.md) §6.1 取代：
>
> | 切片 | 目标 |
> |---|---|
> | S0 接通 / S0 多公司基础 | 装配、受控写、同包重启 / 跨账户拒绝、配额、撤职失效 |
> | M0.1 / M0.2 / M0.3 / M1 | Web 基础 / 订阅限制（三层配额） / 3D 基础 / 双版本联调 |
> | M2 / M3 | **总助理** / **日志与监测** |
> | S1 / S2 | PV 交付 / 发行反馈 |
>
> 下列旧阶段表仅保留为任务清单的历史参考，代号含义以 §6.1 为准；其中"阶段 2（M1）"的权益策略验收对应现行 **M0.2**，"阶段 3（Sonnet）"对应现行 **M0.3**，"阶段 4（Opus）"中的总助理服务/日志系统分别对应现行 **M2/M3**，Team 绑定对应 S0 多公司基础缺口。

### 阶段 1：基础设施（M0）

**目标**：建立 DSH 插件化基础

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| 初始化 soloips-web 包结构 | 目录骨架、package.json | pnpm build 通过 |
| 配置 Client Module | cordis.patch.yml | DSH 能加载 |
| 基础 Sidebar Slot | CompanySidebar 组件 | 显示公司列表 |
| Zustand 状态层 | company-store | Web/3D 共享 |

### 阶段 2：Web 核心（M1）

**目标**：完整 CRUD + 基本协作

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| 公司 CRUD | 创建/查看/编辑/归档 | 操作成功，数据持久 |
| 部门 CRUD | 部门管理 | 属于公司，层级正确 |
| 员工管理 | 员工列表/详情 | 入职流程完整 |
| 总助理初始化 | 首席任职创建 | 公司创建时自动创建 |
| 权益策略 | 免费版限制 | 创建第2家公司被拒绝 |

### 阶段 3：3D 可视化（Sonnet）

**目标**：3D 公司概览

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| 3D 场景基础 | CompanyScene | 显示公司建筑 |
| 发光效果 | Bloom postprocessing | 符合参考截图风格 |
| 部门楼层 | DepartmentFloor | 显示部门分布 |
| 点击交互 | 选中 → 显示面板 | 状态同步 |
| 视图切换 | Web ↔ 3D | Zustand 共享状态 |

### 阶段 4：协作功能（Opus）

**目标**：基础团队协作

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| Team 绑定 | 部门 ↔ DSH Team | 复用 DSH Agent Team |
| 任务面板 | Team Dashboard Slot | 显示任务列表 |
| 总助理服务 | 事件触发 | 接收目标、协调部门 |
| 日志系统 | 审计记录 | 可查询操作历史 |

### 阶段 5：完善与扩展（M4+）

**目标**：完整功能

| 任务 | 优先级 |
|------|--------|
| IP/作品管理 | P1 |
| 3D 沉浸式导航 | P1 |
| 实时通知 | P2 |
| 系统监测面板 | P2 |
| 高级分析 | P3 |

---

## 7. DSH 复用清单

### 7.1 复用 DSH 的部分

| DSH 能力 | 复用方式 | SoloIPs 集成点 |
|-----------|----------|----------------|
| **Storage Domain** | 持久化业务数据 | soloips-core |
| **Session Persistence** | 会话恢复 | soloips-adapter-dsh |
| **Agent Team** | 团队协作 | soloips-adapter-dsh.team |
| **Subagent** | 子智能体 | soloips-adapter-dsh.subagents |
| **Tools** | 工具调用 | soloips-tools-pv |
| **Client Slots** | UI 扩展 | soloips-web |
| **Web Client Modules** | 插件加载 | soloips-web |
| **Remote API** | 前后端通信 | soloips-web |
| **OTel** | 结构化日志 | soloips-core.audit |

### 7.2 需要扩展 DSH 的部分

| 扩展点 | 说明 | 优先级 |
|--------|------|--------|
| **权益策略接口** | DSH 无此概念，需在 soloips-core 实现 | 必须 |
| **总助理服务** | 业务逻辑，DSH 无对应 | 必须 |
| **多租户隔离** | DSH Session 隔离，SoleIPs 需公司级隔离 | 必须 |
| **审计日志增强** | DSH 有 OTel，SoleIPs 需业务审计 | 必须 |
| **3D 可视化** | DSH 无此功能，纯 SoloIPs 实现 | 独立包 |

### 7.3 DSH 升级兼容性策略

```
1. SoloIPs 尽量少修改 DSH 源码
2. 通过 patch.yml 覆写配置，而非改源码
3. 通过 adapter 层隔离 DSH API 变化
4. 升级 DSH 后只需适配 adapter
5. 保留 DSH API 版本记录，便于回退
```

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| DSH API 破坏性变更 | 适配层失效 | adapter 层隔离，锁定 DSH 版本 |
| 3D 渲染性能 | 卡顿、崩溃 | LOD、实例化、视锥剔除 |
| 多公司隔离漏洞 | 数据串用 | 强制 companyId 隔离检查 |
| 免费版绕过 | 商业损失 | 服务端权益策略，不信任前端 |
| DSH 升级冲突 | SoloIPs 功能损坏 | 测试矩阵 + CI 验证 |

---

## 9. 下一步行动

### 立即可执行

1. **创建 soloips-web 包骨架**
   ```bash
   mkdir -p packages/web/src/{host/controllers,client/{slots,three,stores,api},shared}
   ```

2. **配置 DSH Client Module**
   ```yaml
   # cordis.patch.yml
   modules:
     soloips-web:
       route: /soloips/*
       slots:
         - sidebar
         - main
   ```

3. **实现基础 CompanySidebar Slot**
   ```tsx
   // src/client/slots/CompanySidebar.tsx
   export function CompanySidebar() { ... }
   ```

4. **连接 DSH Remote API**
   ```typescript
   // src/client/api/soloips-remote.ts
   const soloips = ctx.remote.soloips;
   ```

### 待确认事项

| 问题 | 影响 | 决策人 |
|------|------|--------|
| 3D 技术栈最终选择 | Three.js vs Babylon.js | 用户 |
| 付费套餐定价 | `companyLimit` / `subsidiaryLimit` 具体值（当前三层配额见 data-contract §2） | 产品 |
| 自托管商业策略 | 许可证模式 | 产品 |

---

## 附录：文档索引

| 文档 | 说明 |
|------|------|
| `docs/architecture.md` | 产品架构 |
| `docs/technical-architecture.md` | 技术架构 |
| `docs/decisions/official-team-and-dsh-fork.md` | DSH fork 策略 |
| `docs/refactoring/01-departments.md` | 部门架构 |
| `docs/refactoring/02-company-contract.md` | 公司合同 |
| `docs/refactoring/03-delivery-and-acceptance.md` | 交付验收 |
| `packages/adapter-dsh/src/contracts.ts` | 当前数据契约 |
| `packages/core/src/contracts.ts` | 当前 core 契约 |

---

**最后更新**：2026-09-17
**基于**：Codex 技术咨询 + 子智能体分析 + UI 架构设计
