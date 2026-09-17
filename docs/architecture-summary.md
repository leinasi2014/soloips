# SoloIPs 架构概览

> 快速参考：包职责、端口映射、依赖关系、关键决策。
> 
> **详细设计**见 [architecture-complete.md](architecture-complete.md)
>
> **权威数据模型与实现状态见**：[`docs/design/data-contract.md`](design/data-contract.md)
> （§0 逐项列出契约与当前代码的差距；本文与契约冲突时以契约为准）

## 包结构

```
packages/
├── soloips-bundle/          # 装配声明
├── soloips-adapter-dsh/    # DSH 适配层
├── soloips-core/            # 通用业务状态（组织结构、文档模型）
└── soloips-web/             # 界面层（Web + 3D 双版本）

# 业务插件包（独立仓库或子包，由用户/SoloIPS开发团队维护）
├── soloips-tools-pv/        # PV 制作插件
└── ...                     # 其他业务插件
```

## 框架定位

SoloIPs 是 **AI 公司协作平台框架**，不是一站式解决方案：

| 层次 | 负责方 | 说明 |
|---|---|---|
| 框架核心 | SoloIPS 官方 | core、adapter、bundle、Web UI |
| 业务插件 | 用户 IT / SoloIPS 开发团队 | PV 工具、发行渠道、数据分析等 |
| 产品运营 | 用户 | 具体短剧 IP、团队配置、工作流程 |

**插件开发支持**：
- SoloIPS 提供标准插件开发规范
- SoloIPS 默认系统开发团队可帮用户定制开发业务插件
- 插件通过 DSH Slots 机制接入平台

## 公司生态架构（SOLO-COMPANY-01）

SoloIPs 采用**三层公司层级**：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  第一层：SoloIPs 平台层                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  SoloIPs 品牌公司 (type=platform)                                     │   │
│  │  - SoloIPS 官方创建并运营                                            │   │
│  │  └── IT 部门：开发/维护 SoloIPs 系统插件                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│  第二层：SoloIPs 运营子公司群                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  各业务平台子公司 (type=operation)                                   │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │   │
│  │  │ 漫画网站     │ │ 短视频网站   │ │ 音乐网站     │                │   │
│  │  │ 子公司       │ │ 子公司       │ │ 子公司       │                │   │
│  │  │              │ │              │ │              │                │   │
│  │  │ 智能体管理   │ │ 智能体管理   │ │ 智能体管理   │                │   │
│  │  │ 漫画网站运营 │ │ 视频网站运营 │ │ 音乐平台运营 │                │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│  第三层：用户公司层                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  用户创建的 AI 公司 (type=enterprise/subsidiary)                     │   │
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

### 公司类型

| 类型 | 说明 | 持有者 |
|------|------|--------|
| `platform` | SoloIPs 平台公司（SoloIPS 官方） | SoloIPS 官方 |
| `operation` | SoloIPs 运营子公司（业务平台） | SoloIPS 官方 |
| `enterprise` | 用户企业公司 | 用户 |
| `subsidiary` | 用户子公司 | 用户 |

### 权益配额

| 订阅计划 | 用户公司数 | 子公司数 |
|----------|-----------|----------|
| Free | 1 | 0 |
| Pro | 1 | 3 |
| Enterprise | 无限制 | 无限制 |

### 内容发布流程

```
用户 IP 内容创建 → 投稿申请 → SoloIPs 子公司智能体审核 → 发布到平台
```

**SoloIPs 平台公司和运营子公司不占用户配额**。

## 关键架构决策（ARCH-D01–08）

| ID | 决策 | 来源 |
|---|---|---|
| ARCH-D01 | 独立技术架构正文 | 技术裁定 |
| ARCH-D02 | 5 包边界 | 架构设计 |
| ARCH-D03 | 独立 DSH_HOME | 隔离要求 |
| ARCH-D04 | profile: soloips | 固定配置 |
| ARCH-D05 | 上游 API 失败停线 | ORG-13 |
| ARCH-D06 | 原生任务系统 | 协作要求 |
| ARCH-D07 | S0 优先验证 | 开发策略 |
| **ARCH-D08** | **Web/3D 双界面** | **UI 架构子智能体** |

## 包职责

### soloips-bundle

- 携带 `cordis.patch.yml`
- 锁定 bundles 顺序
- **无运行时代码**

### soloips-adapter-dsh

- 收敛 DSH 官方能力（`@deepseek-ai/*`）
- 向 core 暴露内部接口
- **无业务状态**

端口映射：

| 端口 | 对应 DSH 能力 | 说明 |
|---|---|---|
| `storage` | storage-domain、storage-json | 持久化（core 唯一消费的端口） |
| `session` | session-persistence | 会话管理 |
| `agents` | agent | Agent 管理 |
| `subagents` | subagent | 子 Agent |
| `team` | agent-team | Team 协作（**fail-closed 占位，未接入**） |
| `tools` | tools | 工具调用 |
| `events` | events | 事件系统 |
| `readiness()` | — | 端口就绪诊断（非端口） |

> `ports/shared.ts` 是 adapter 内部辅助函数，**不是** facade 上的端口。

### soloips-core

- 唯一**通用**业务状态包
- 持有：**公司层级树（platform/operation/enterprise/subsidiary）**
- 持有：**部门、团队、任职** 等组织结构
- 持有：**文档模型**（当前实现 `profile`/`avatar`/`soul`/`operating`/`work`；`ip_summary`/`storyboard` 见 data-contract §0 尚未实现）和版本管理
- **不持有**：具体业务任务的领域逻辑（如 PV 任务、镜头领取、制作工具适配）
- **只消费** adapter 的 storage 端口
- 对外暴露公司服务（SoloipsCoreService）
- **可扩展点**：
  - 新增通用文档类型（通过 SoloipsDocumentType 枚举扩展）
  - 新增组织单元（部门、团队）
  - 新增任职关系

> **边界规则**：`core` 是通用的「组织结构 + 文档模型」包，不是「所有业务领域」的堆放场。具体业务的领域逻辑（如 PV 制作、短剧分发）必须独立成包，依赖 `core` 提供的通用服务。

### soloips-web

- **界面层（Web + 3D 双版本）**
- Web：React + Zustand，主界面
- 3D：React Three Fiber + Three.js，可视化增强
- 共享 Zustand store，DSH Slots 机制扩展

## 依赖方向

```
┌─────────────────────────────────────────────────┐
│                 DSH Official Packages            │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│           soloips-adapter-dsh                   │
│    (收敛全部 @deepseek-ai/* 端口)              │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│              soloips-core                       │
│   (通用业务状态：组织结构+文档模型)      │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│              soloips-web                       │
│   ┌─────────────┐      ┌─────────────────┐    │
│   │  Web UI     │ ←→   │  3D Scene      │    │
│   │ React+Zustand│      │ R3F+Three.js   │    │
│   └─────────────┘      └─────────────────┘    │
│              ↓ 共享状态                         │
└─────────────────────────────────────────────────┘

┌─────────────────┐
│ soloips-bundle  │  # 装配层，无运行时依赖
└─────────────────┘
```

## UI 双版本架构（ARCH-D08）

```
┌────────────────────────────────────────────────────────┐
│                    DSH Web Client                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │              SoloIPs Client Plugins               │  │
│  │  ┌──────────────┐ ┌─────────────┐ ┌──────────┐ │  │
│  │  │ Company UI   │ │ 3D Scene   │ │Team Panel │ │  │
│  │  │ (Slot扩展)   │ │(R3F Canvas)│ │(Slot扩展) │ │  │
│  │  └──────────────┘ └─────────────┘ └──────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
│                      ↓ shared stores (Zustand)        │
└────────────────────────────────────────────────────────┘
```

**技术选型**：
- Web：React + Zustand（商务简洁风格）
- 3D：React Three Fiber + Three.js + Bloom（科幻风格）
- 状态共享：同一 Zustand store，Web 操作自动同步 3D

## 核心数据模型

> **权威数据模型见**：[`docs/design/data-contract.md`](design/data-contract.md)

### 公司与组织

```typescript
// 详见 data-contract.md §2（持久记录用 Soloips* 前缀）

interface SoloipsCompanyRecord {
  id: SoloipsCompanyId;
  accountId: string;                    // 直接归属账户（隔离条件）
  parentCompanyId?: SoloipsCompanyId;   // 父公司；无则为顶层公司
  type: 'platform' | 'operation' | 'enterprise' | 'subsidiary';
  name: string;
  status: 'active' | 'archived';
  createdAt: string;
}

interface SoloipsDepartmentRecord {
  id: SoloipsDepartmentId;
  companyId: SoloipsCompanyId;    // 必须归属公司
  name: string;
  leaderAppointmentId?: SoloipsAppointmentId;  // 通过任职引用负责人（未实现，见 §0）
}

interface SoloipsAppointmentScope {
  kind: 'company' | 'department' | 'team';
  companyId: SoloipsCompanyId;
  departmentId?: SoloipsDepartmentId;
  teamBindingId?: string;
}
```

### 权益策略（原子化）

> **详细实现见**：[`docs/design/data-contract.md` §4](design/data-contract.md#4-原子配额操作)

```typescript
// 权益快照（用于原子操作；三层配额见 data-contract §2）
interface SoloipsEntitlementSnapshot {
  accountId: string;
  planCode: 'free' | 'pro' | 'enterprise';
  companyLimit: number;        // 顶层用户公司上限；-1 表示无限
  subsidiaryLimit: number;     // 子公司总数上限；-1 表示无限
  quotaVersion: number;        // 乐观锁版本
}

// 创建公司（原子操作）
async createCompany(
  ctx: AuthContext,
  name: string,
): Promise<{ success: true; company: CompanyRecord } | { success: false; reason: string }> {
  // 1. 获取权益快照（含版本号）
  // 2. 原子递增配额（乐观锁）
  // 3. 创建公司记录
  // 4. 失败时回滚配额
}
```

### 权限校验链路

> **详细实现见**：[`docs/design/data-contract.md` §3](design/data-contract.md#3-权限校验链路)

```typescript
// 授权上下文（可信来源）
interface AuthContext {
  accountId: string;           // 来自 DSH Session，可信
  executionBinding?: ExecutionBindingRecord;
  sessionId: string;
}

// 权限服务
class PermissionService {
  // ✅ 使用 await 而不是 ||
  async checkPermission(ctx: AuthContext, action: Action, resource: Resource) {
    // 1. 校验公司归属（accountId 匹配）
    // 2. 校验任职有效性（含代际）
    // 3. 校验具体操作权限
  }
}
```

## 总助理（Chief Assistant）

| 特性 | 设计 |
|---|---|
| 角色 | `general_assistant`，公司级任职 |
| 触发 | 事件驱动（用户消息、部门创建、任务分配） |
| 上下文 | 绑定公司 ID，访问公司数据 |
| 通信 | 通过 DSH subagent 接口 |

## 日志与监测（三层分离）

| 层级 | 内容 | 持久化 |
|---|---|---|
| **业务审计层** | 公司创建、部门变动、任职变更 | DSH Storage，保留 90 天 |
| **执行历史层** | 任务开始/完成、AI 响应、用户交互 | DSH Session，保留 30 天 |
| **系统监测层** | API 调用、性能指标、错误率 | 独立时序库，可选开启 |

## 开发里程碑（修订版）

> **权威里程碑定义见**：[`docs/design/data-contract.md` §6](design/data-contract.md#6-统一里程碑)
> 
> **运营服务接口见**：[`docs/design/operation-services.md`](design/operation-services.md)（预留，后期实现）

### 框架核心里程碑（S0–M3）

| 阶段 | 目标 | 验收 | 负责方 |
|---|---|---|---|
| **S0 接通** | 插件装配、受控写入、同包重启 | 加载成功 + 受控写 + 重启读回 | SoloIPS |
| **S0 多公司基础** | 跨账户拒绝、引用归属、撤职失效、并发配额 | 隔离测试通过 | SoloIPS |
| **M0.1** | Web 版基础：公司/部门/团队 CRUD | 能在 DSH Web 中创建公司 | SoloIPS |
| **M0.2** | 订阅限制：三层配额生效（Free 1 公司+0 子公司；Pro 1 公司+3 子公司） | 免费用户无法创建第二公司或任一子公司 | SoloIPS |
| **M0.3** | 3D 版基础：场景搭建、部门/团队可视化 | 3D 场景能渲染公司结构 | SoloIPS |
| **M1** | 双版本联调：Zustand 状态共享 | Web 操作同步到 3D 视图 | SoloIPS |
| **M2** | 总助理：AI 驱动的公司运营 | 对话总助理完成日常事务 | SoloIPS |
| **M3** | 日志与监测：三层日志系统 | 能查询业务审计、执行历史 | SoloIPS |

### 平台运营里程碑（后期）

| 阶段 | 目标 | 验收 | 负责方 | 优先级 |
|---|---|---|---|---|
| **P1 Auth** | 多租户认证：注册/登录/会话管理 | 用户可注册登录、配额生效 | SoloIPS | P1 |
| **P1 Sub** | 订阅管理：计划/升级/续费 | 免费/Pro/Enterprise 配额控制 | SoloIPS | P1 |
| **P2 Pay** | 支付服务：支付网关对接 | 支持支付宝/微信/Stripe | SoloIPS | P2 |
| **P2 Billing** | AI 模型计费：多种计费模式 | 支持订阅/token/时间/按次计费 | SoloIPS | P2 |
| **P3 Invoice** | 发票服务：申请/管理 | 用户可申请电子发票 | SoloIPS | P3 |
| **业务插件** | PV 制作、短剧发行等业务包 | 由用户 IT / SoloIPS 开发团队交付 | 用户/SoloIPS | - |

**里程碑说明**：
- S0–M3 是 SoloIPS 框架本身的交付
- 业务插件（PV 工具等）由用户 IT 团队或 SoloIPS 开发团队作为服务交付
- 平台运营里程碑（P1–P3）在框架核心完成后实现
- 里程碑代号 M2/M3 于 2026-09-17 由 Sonnet/Opus 更名（原代号与模型档位同名易误解）

## 关键约束

> **权威数据契约见**：[`docs/design/data-contract.md`](design/data-contract.md)

1. **core 只用 adapter 的 storage**：其他端口存在但 core 暂不使用
2. **禁止跨包直接导入**：用 `exports` 和服务契约
3. **adapter 无业务状态**：只做 DSH 能力适配
4. **UI 双版本共享状态**：通过 Zustand，Web/3D 自动同步
5. **所有权限校验必须使用 await**：不能用 `||` 短路 Promise
6. **配额操作必须原子化**：检查→递增→创建收在同一提交门内串行执行，失败回滚；不虚构跨表事务（见 data-contract §4.1）
7. **accountId 不接受业务命令传入**：S0 由部署层经插件 config 注入并在打开 store 时绑定，一个数据根一个账户；P1 Auth 后改由 DSH Session 解析（见 data-contract §3.1 临时例外）

## 旧 swarm 参考映射（不作运行依赖）

> 下表仅为旧 `dsh-agent-swarm` 组件与 SoloIPs 服务的概念对照，用于需求追溯与测试经验提取；按 SOLO-TEAM-02，旧 swarm **仅作源码与测试经验参考，不作为运行依赖**，协作执行复用官方 Agent Team。

| dsh-agent-swarm（参考） | SoloIPs 对应 |
|---|---|
| `team-captain` | `company.service` |
| `team-member` | `department.service` |
| `shared/identity` | `soloips-core/identity` |
| `shared/storage` | `soloips-adapter-dsh/storage` |

## 变更历史

| 日期 | 变更 | 来源 |
|---|---|---|
| 2026-09-17 | 创建简化版架构概览 | 架构整理 |
| 2026-09-17 | 新增 UI 双版本、总助理、日志系统 | 子智能体讨论整合 |
| 2026-09-17 | 按用户确认的产品准则统一：M0.2 改三层配额口径；末尾"DSH 复用清单"更正为"旧 swarm 参考映射（不作运行依赖）" | 文档冲突审查 |
| 2026-09-17 | 里程碑代号 Sonnet→M2、Opus→M3（权威定义以 data-contract §6.1 为准） | 用户裁定更名 |
