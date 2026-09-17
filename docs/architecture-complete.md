# SoloIPs 完整架构设计文档

> **本文档是设计参考**，不是实现指南。包含已确认架构决策、未实现功能的设计思路、以及与权威文档的交叉引用。
>
> **权威数据模型**：[`docs/design/data-contract.md`](design/data-contract.md)
>
> **权威里程碑**：[`docs/design/data-contract.md` §6`](design/data-contract.md#6-统一里程碑)
>
> **快速技术参考**：[`docs/architecture-summary.md`](architecture-summary.md)
>
> ⚠️ 本文大量代码示例为**设计稿**，未在 `packages/` 中实现。实现前请以 data-contract.md 和代码实际状态为准。

---

## 1. 架构总览

### 1.1 核心约束

| 约束 | 说明 |
|------|------|
| **业务写权威按领域划分** | core 管理组织结构和文档模型；业务插件各自管理领域状态 |
| **所有功能作为 DSH 插件** | 复用 DSH 的插件化机制 |
| **方便 DSH 更新合并** | SoloIPs 代码尽量少侵入 DSH |
| **Web/3D 作为 DSH Client 扩展** | 通过 Slots 机制接入 |

### 1.2 整体架构

```
用户浏览器 → DSH Web Client → SoloIPs Client Plugins (Company UI / 3D Scene / Team Panel)
                                       ↓ ctx.remote / Slots
Host 服务器 → DSH Runtime → SoloIPs Host Plugins (core / web / tools-pv)
                                       ↓
                              soloips-adapter-dsh
                                       ↓ ctx.* ports
                              DSH Official Services
                              (Storage / Session / Agent / Subagent / Team / Tools)
```

### 1.5 公司生态架构

SoloIPs 采用**三层公司层级**（详细定义见 [`data-contract.md`](design/data-contract.md) §2）：

| 类型 | 代码值 | 持有者 | 是否占配额 |
|------|--------|--------|-----------|
| 平台公司 | `platform` | SoloIPS 官方 | 不占 |
| 运营子公司 | `operation` | SoloIPS 官方 | 不占 |
| 用户公司 | `enterprise` | 用户 | 占 |
| 用户子公司 | `subsidiary` | 用户 | 占 |

**权益配额**（详细定义见 data-contract §2）：

| 订阅计划 | 用户公司数 | 用户子公司数 |
|----------|-----------|-------------|
| Free | 1 | 0 |
| Pro | 1 | 3 |
| Enterprise | 无限制 | 无限制 |

**内容发布流程**：用户 IP → 投稿到 SoloIPs 运营子公司 → 子公司智能体审核 → 发布平台

---

## 2. 包结构设计

### 2.1 包清单与职责

| 包 | 类型 | 职责 | DSH 集成方式 |
|---|---|---|---|
| **soloips-bundle** | DSH Bundle | 装配声明，patch 覆写 | 作为 DSH Profile 的一部分 |
| **soloips-adapter-dsh** | DSH Plugin | DSH 适配，7 端口（team 为 fail-closed 占位） | **核心复用 DSH** |
| **soloips-core** | DSH Plugin | 通用业务状态（公司层级、组织结构、文档模型） | 作为 DSH Service |
| **soloips-web** | DSH Client Plugin | ⚠️ **当前为包边界骨架**，无实际代码 | 通过 Client Slots 扩展 |
| **soloips-tools-pv** | 业务插件 | ⚠️ 尚未创建 | 独立包，S1 创建 |

### 2.2 目录结构

> ⚠️ `web/` 和 `tools-pv/` 的子目录为**设计稿**，当前不存在。

```
packages/
├── bundle/                      # soloips-bundle
├── adapter-dsh/                # 7 端口（storage/session/agents/subagents/team/tools/events）
├── core/                       # 已实现：六表 CRUD、commit-gate、onboarding
└── web.                       # ⚠️ 空骨架；设计稿见 §5
    └── tools-pv/              # ⚠️ S1 创建
```

**core 已实现内容**：
- `src/contracts.ts` — Record 类型定义
- `src/store.ts` — 业务 Store
- `src/commit-gate.ts` — 事务门
- `src/onboarding.ts` — 入职/准入判定
- `src/domain.ts` — 六表 domain spec

**core 未实现内容**（详细见 data-contract.md §0）：
- Department 的 leaderAppointmentId、description、parentDepartmentId
- Appointment 的 scope（判别联合）与 role
- SoloipsEntitlement*（权益策略）
- SoloipsAuthContext / PermissionService
- SoloipsTeamBindingRecord
- SoloipsExecutionBindingRecord
- SoloipsAuditRecord

---

## 3. 核心模块设计

> ⚠️ 本节代码示例为设计稿，尚未实现。权威数据模型见 data-contract.md。

### 3.1 多公司数据模型

**权威定义**：[`data-contract.md` §2`](design/data-contract.md#2-权威数据模型)

需要实现的核心记录：

| 记录 | 用途 | 实现状态 |
|------|------|---------|
| `SoloipsCompanyRecord` | 公司层级树 | ✅ 已实现 |
| `SoloipsDepartmentRecord` | 部门（leaderAppointmentId 等字段未实现） | ⚠️ 部分实现 |
| `SoloipsAppointmentRecord` | 任职（scope/role 未实现） | ⚠️ 部分实现 |
| `SoloipsEntitlementRecord` | 权益配额 | ⏳ 未实现 |
| `SoloipsTeamBindingRecord` | Team 绑定 | ⏳ 未实现 |
| `SoloipsExecutionBindingRecord` | 执行绑定 | ⏳ 未实现 |

### 3.2 权益策略

> 设计稿。权益配额原子操作详细定义见 [`data-contract.md` §4`](design/data-contract.md#4-原子配额操作)

权益策略接口设计（待实现）：
- `EntitlementResolver` — 权益查询接口
- `ConfigEntitlementResolver` — 基于配置文件实现（过渡方案）
- 三层配额：Free=1公司+0子公司，Pro=1公司+3子公司，Enterprise=无限制

### 3.3 总助理服务

> 设计稿。M2 里程碑目标。

总助理职责（待实现）：
- 接收与分解用户目标
- 协调部门工作
- 汇总进度报告
- 向用户提交待决事项

### 3.4 日志与监测

> 设计稿。M3 里程碑目标。详细定义见 [`data-contract.md`](design/data-contract.md)

三层日志：
1. **业务审计层** — 公司创建、部门变动、任职变更（DSH Storage，90天）
2. **执行历史层** — 任务开始/完成、AI 响应、用户交互（DSH Session，30天）
3. **系统监测层** — API 调用、性能指标、错误率（独立时序库）

---

## 4. DSH 插件化设计

> ⚠️ 本节代码示例为设计稿。soloips-core 当前以 DSH Service 方式接入，具体实现见 `packages/core/src/index.ts`。

### 4.1 Host 插件（soloips-core）

**当前实现**：`packages/core/src/index.ts` — DSH Service 入口

**设计思路**（待完善）：
- 通过 `ctx.storage` 注册 domain
- 通过 `ctx.remote` 暴露业务 API
- 通过 `ctx.events` 注册事件监听

### 4.2 Client 插件（soloips-web）

> ⚠️ 当前为包边界骨架，无实现代码。

**设计思路**（待实现）：
- 通过 `client.registerRoute()` 注册 SoloIPs 路由
- 通过 `client.registerSlot()` 注册 Sidebar / Main 扩展点
- 通过 `useRemote()` 调用 Host 暴露的业务 API
- Web 与 3D 共享 Zustand store

---

## 5. UI 双版本设计

> ⚠️ 本节所有代码示例为设计稿，尚未实现。soloips-web 当前只有 `export {}`。

### 5.1 Web 界面

**目标**（M0.1）：公司 CRUD、部门管理、员工列表、任职管理

**设计思路**：
- 左侧：公司列表 + 部门树
- 右侧：公司概览 Dashboard
- 操作：创建/查看/编辑/归档

### 5.2 3D 界面

**目标**（M0.3）：公司架构可视化、部门/员工分布

**技术选型**：
- React Three Fiber + Three.js
- Bloom 后处理发光效果
- 科幻深色主题

**设计思路**（待实现）：
- 公司建筑群（3D 建筑体表示公司）
- 部门楼层（楼层表示部门）
- 点击交互 → 显示详情面板

### 5.3 视觉风格

**设计方向**：科幻深色 + 青色发光（参考 DSH UI 风格）

配色方案（待定）：
- 主色：青色发光
- 背景：深空黑
- 强调色：蓝色、橙色

---

## 6. 开发里程碑〔已取代〕

> **〔已取代〕** 本节已被 [`data-contract.md` §6](design/data-contract.md#6-统一里程碑) 取代。
>
> 权威里程碑定义（M2→总助理，M3→日志与监测，S1→PV 交付）。

---

## 7. DSH 复用清单

### 7.1 复用 DSH 的部分

| DSH 能力 | SoloIPs 集成点 | 实现状态 |
|---|---|---|
| Storage Domain | soloips-core | ✅ 已实现 |
| Session Persistence | soloips-adapter-dsh | ⚠️ 端口就位 |
| Agent Team | soloips-adapter-dsh.team | ⏳ fail-closed 占位 |
| Subagent | soloips-adapter-dsh.subagents | ⚠️ 端口就位 |
| Tools | soloips-tools-pv | ⏳ 未创建 |
| Client Slots | soloips-web | ⏳ 未实现 |
| Remote API | soloips-web | ⏳ 未实现 |

### 7.2 需要扩展 DSH 的部分

| 扩展点 | 说明 | 里程碑 |
|--------|------|--------|
| 权益策略接口 | DSH 无此概念 | M0.2 |
| 总助理服务 | 业务逻辑 | M2 |
| 多租户隔离 | DSH Session 隔离，SoleIPs 需公司级隔离 | S0 多公司基础 |
| 审计日志增强 | DSH 有 OTel，SoleIPs 需业务审计 | M3 |
| 3D 可视化 | DSH 无此功能 | M0.3 |

### 7.3 DSH 升级兼容性策略

1. SoloIPs 尽量少修改 DSH 源码
2. 通过 patch.yml 覆写配置，而非改源码
3. 通过 adapter 层隔离 DSH API 变化
4. 升级 DSH 后只需适配 adapter

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| DSH API 破坏性变更 | 适配层失效 | adapter 层隔离，锁定 DSH 版本 |
| 3D 渲染性能 | 卡顿、崩溃 | LOD、实例化、视锥剔除（M0.3 实现时） |
| 多公司隔离漏洞 | 数据串用 | 强制 companyId 隔离检查 |
| 免费版绕过 | 商业损失 | 服务端权益策略，不信任前端 |
| DSH 升级冲突 | SoloIPs 功能损坏 | 测试矩阵 + CI 验证 |

---

## 9. 下一步行动

### 当前优先级

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | S0 多公司基础缺口 | 配额/权限/执行绑定（data-contract §0） |
| P1 | M0.1 Web UI | 实现公司 CRUD 界面（当前 web 包为空骨架） |
| P1 | 单元测试 | 验证 core store CRUD |
| P2 | M0.2 订阅限制 | 三层配额生效 |
| P2 | M0.3 3D 界面 | 场景搭建 |

### 待确认事项

| 问题 | 影响 | 决策人 |
|------|------|--------|
| 3D 技术栈最终选择 | Three.js vs Babylon.js | 用户 |
| 付费套餐定价 | 三层配额具体值（已定义于 data-contract §2） | 产品 |
| 自托管商业策略 | 许可证模式 | 产品 |

---

## 附录：文档索引

| 文档 | 说明 |
|------|------|
| [`docs/architecture-summary.md`](architecture-summary.md) | 快速技术参考 |
| [`docs/architecture.md`](architecture.md) | 产品需求与目标 |
| [`docs/design/data-contract.md`](design/data-contract.md) | **权威数据模型** |
| [`docs/technical-architecture.md`](technical-architecture.md) | 技术架构 |
| [`docs/decisions/official-team-and-dsh-fork.md`](decisions/official-team-and-dsh-fork.md) | DSH fork 策略 |
| [`packages/core/src/contracts.ts`](packages/core/src/contracts.ts) | **当前数据契约实现** |

**最后更新**：2026-09-17
