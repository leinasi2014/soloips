# SoloIPs 架构概览

> 快速参考：包职责、端口映射、依赖关系、关键决策。
>
> **权威数据模型与实现状态**：[`docs/design/data-contract.md`](design/data-contract.md)
>
> **产品目标与需求来源**：[`docs/architecture.md`](architecture.md)

## 包结构

```
packages/                    # 目录名不带前缀；package 名才是 soloips-*
├── bundle/                  # soloips-bundle：装配声明，patch 覆写顺序
├── adapter-dsh/             # soloips-adapter-dsh：DSH 适配层（7 端口，team 为 fail-closed 占位）
├── core/                    # soloips-core：通用业务状态包（组织结构、文档模型、公司层级）
├── web/                     # soloips-web：界面层（V1 = 复制官方 Web 插件 fork 改造版；官方 DSH 源码不动）
└── tools-pv/                # soloips-tools-pv：业务插件（PV 制作，S1 创建，用户/SoloIPS开发团队维护）
```

## 框架定位

SoloIPs 是 **AI 公司协作平台框架**：

| 层次 | 负责方 | 说明 |
|---|---|---|
| 框架核心 | SoloIPS 官方 | core、adapter、bundle、Web UI |
| 业务插件 | 用户 IT / SoloIPS 开发团队 | PV 工具、发行渠道、数据分析等 |
| 产品运营 | 用户 | 具体短剧 IP、团队配置、工作流程 |

## 公司生态架构

> **权威描述**：[`docs/architecture.md`](architecture.md)；以下为快速摘要

| 类型 | 说明 | 持有者 |
|------|------|--------|
| `platform` | SoloIPs 平台公司 | SoloIPS 官方 |
| `operation` | SoloIPs 运营子公司（漫画/视频/音乐网站） | SoloIPS 官方 |
| `enterprise` | 用户企业公司 | 用户 |
| `subsidiary` | 用户子公司 | 用户 |

**三层配额**（详细定义见 data-contract §2）：

| 订阅计划 | 用户公司数 | 子公司数 |
|----------|-----------|----------|
| Free | 1 | 0 |
| Pro | 1 | 3 |
| Enterprise | 无限制 | 无限制 |

**SoloIPs 平台公司和运营子公司不占用户配额。**

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
| ARCH-D08 | Web/3D 双界面 | UI 架构子智能体（〔已取代〕2026-09-17：自研 Web+3D 推迟，V1 改为官方 Web fork 改造，见 [`docs/decisions/web-ui-fork.md`](decisions/web-ui-fork.md)） |

## 包职责

### soloips-bundle

- 携带 `cordis.patch.yml`
- 锁定 bundles 顺序
- **无运行时代码**

### soloips-adapter-dsh

- 收敛 DSH 官方能力（`@deepseek-ai/*`）
- 向 core 暴露内部接口
- **无业务状态**

**端口映射**（共 7 个；`readiness()` 是诊断函数非端口）：

| 端口 | 对应 DSH 能力 | 说明 |
|---|---|---|
| `storage` | storage-domain、storage-json | 持久化（core 唯一消费的端口） |
| `session` | session-persistence | 会话管理 |
| `agents` | agent | Agent 管理 |
| `subagents` | subagent | 子 Agent |
| `team` | agent-team | Team 协作（**fail-closed 占位，未接入**） |
| `tools` | tools | 工具调用 |
| `events` | events | 事件系统 |

> `ports/shared.ts` 是 adapter 内部辅助函数，**不是** facade 上的端口。

### soloips-core

- 唯一**通用**业务状态包
- 持有：**公司层级树（platform/operation/enterprise/subsidiary）**
- 持有：**部门、团队、任职** 等组织结构
- 持有：**文档模型**（`profile`/`avatar`/`soul`/`operating`/`work`；`ip_summary`/`storyboard` 见 data-contract §0 尚未实现）
- **不持有**：具体业务任务的领域逻辑（如 PV 任务、镜头领取）
- **只消费** adapter 的 storage 端口
- 对外暴露公司服务（SoloipsCoreService）

> **边界规则**：`core` 是通用的「组织结构 + 文档模型」包，不是「所有业务领域」的堆放场。

### soloips-web

> V1 界面 = **复制官方 Web 插件（`@deepseek-ai/dsh-web-app` 行代表的浏览器界面面）fork 改造版**，官方 DSH 源码不动；装配时替换 profile bundles 中的官方 Web 行，上游 bug 修正持续同步未改动区域。
>
> 原「自研 Web + 3D 双版本（React/Zustand/Three.js）」路线**推迟**（〔待决〕解冻时点）。决策正文见 [`docs/decisions/web-ui-fork.md`](decisions/web-ui-fork.md)。
>
> ⚠️ 当前 `packages/web/` 仍是包边界骨架（仅 `export {}`），fork 改造尚未开始。

### soloips-tools-pv

> S1 创建，用户 IT / SoloIPS 开发团队维护

## 依赖方向

```
DSH Official Packages
         ↓
  soloips-adapter-dsh
         ↓
    soloips-core
         ↓
    soloips-web

soloips-bundle  # 装配层，无运行时依赖
```

## 核心数据模型

> **权威数据模型与实现状态**：[`docs/design/data-contract.md`](design/data-contract.md)

```typescript
// 详见 data-contract.md §2

interface SoloipsCompanyRecord {
  id: SoloipsCompanyId;
  accountId: string;
  parentCompanyId?: SoloipsCompanyId;
  type: 'platform' | 'operation' | 'enterprise' | 'subsidiary';
  name: string;
  status: 'active' | 'archived';
  createdAt: string;
}
```

## 开发里程碑

> **权威定义**：[`docs/design/data-contract.md` §6](design/data-contract.md#6-统一里程碑)
>
> **运营服务接口**：[`docs/design/operation-services.md`](design/operation-services.md)（预留，后期实现）

> ⚠️ 实现状态以 [`data-contract.md` §0](design/data-contract.md#0-实现状态对照代码事实2026-09-17) 为准。

| 阶段 | 目标 | 验收 | 状态 |
|---|---|---|---|
| **S0 接通** | 插件装配、受控写入、同包重启 | 加载成功 + 受控写 + 重启读回 | ✅ 已通过 |
| **S0 多公司基础** | 跨账户拒绝、引用归属、撤职失效、并发配额 | 隔离测试通过 | ⚠️ 部分通过；配额/权限/执行绑定待实现 |
| **M0.1** | Web 版基础：公司/部门/团队 CRUD | 能在 DSH Web 中创建公司 | ⏳ 待实现；界面 = `soloips-web`（官方 Web fork 改造版，非自研），验收标准不变 |
| **M0.2** | 订阅限制：三层配额生效 | 免费用户无法创建第二公司 | ⏳ 待实现 |
| **M0.3** | 3D 版基础：场景搭建、部门/团队可视化 | 3D 场景能渲染公司结构 | ⏳ 待实现；随自研 UI 路线**推迟**，见 [`docs/decisions/web-ui-fork.md`](decisions/web-ui-fork.md) |
| **M1** | 双版本联调：Zustand 状态共享 | Web 操作同步到 3D 视图 | ⏳ 待实现；依赖 M0.3，随自研 UI 路线**推迟** |
| **Sonnet** | 总助理：AI 驱动的公司运营 | 对话总助理完成日常事务 | ⏳ 待实现 |
| **Opus** | 日志与监测：三层日志系统 | 能查询业务审计、执行历史 | ⏳ 待实现 |

平台运营里程碑（P1–P3）后期实现。

## 关键约束

1. **core 只用 adapter 的 storage**：其他端口存在但 core 暂不使用
2. **禁止跨包直接导入**：用 `exports` 和服务契约
3. **adapter 无业务状态**：只做 DSH 能力适配
4. **配额操作必须原子化**：检查→递增→创建收在同一提交门内串行执行
5. **accountId 由部署层注入**：S0 不接受业务命令传入

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-17 | 创建架构概览 |
| 2026-09-17 | 里程碑加状态列（✅/⚠️/⏳） |
| 2026-09-17 | 移除与 architecture.md 重复的公司生态 ASCII 图，改为引用 |
| 2026-09-17 | 写入 V1 UI 决策：web 行与包职责改为 fork 改造定位；ARCH-D08 标〔已取代〕；M0.1 补界面来源注记，M0.3/M1 标推迟并指向 `docs/decisions/web-ui-fork.md` | 文档智能体 |
