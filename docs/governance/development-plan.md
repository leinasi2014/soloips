# SoloIPs 开发流程设计

| 阅读契约 | 内容 |
|---|---|
| 身份 | SOLO-DEV-PLAN |
| 目的 | PR 到完整架构的开发路径、多智能体协同与里程碑规划 |
| 范围 | 现状评估、里程碑、PR 流程、多智能体协同、文档体系、风险 |
| 依据 | architecture-summary.md、architecture-complete.md、dsh-agent-swarm 参考、team-delivery-leadership skill |
| 变更权 | architecture-owner；重大变更须用户确认 |

---

## 1. 现状评估

### 1.1 包结构与实现程度

| 包 | 状态 | 核心内容 | 缺口 |
|---|---|---|---|
| `soloips-adapter-dsh` | 已实现 | 7 个端口（storage/session/agents/subagents/tools/events + team） | **Team 端口是 fail-closed 占位** |
| `soloips-core` | 已实现 | 6 张表 schema + CRUD、唯一 opener、提交门、入职/准入判定 | **无配额/权限/Team/执行绑定**；公司树分支缺测试 |
| `soloips-bundle` | 装配声明 | cordis.patch.yml（关闭 llm-retry / otel 遥测） | 无运行时逻辑（符合设计） |
| `soloips-web` | **包边界骨架** | 仅 `export {}` 与装配行，`registerClient: false` | **无 UI 实现代码**；V1 交付方式 = 复制官方 Web 插件 fork 改造（原自研 React/Zustand/3D 路线推迟，见 [`docs/decisions/web-ui-fork.md`](../decisions/web-ui-fork.md)） |
| `soloips-tools-pv` | 未创建 | — | **S1 里程碑交付物** |

> 更细的契约 vs 代码差距见 `docs/design/data-contract.md` §0。

### 1.2 与目标架构的差距

| 差距项 | 影响 | 优先级 |
|---|---|---|
| Team 端口未实现（fail-closed） | 核心协作能力缺失，S0 多公司基础未交付 | **P0** |
| 配额/权限/执行绑定未实现 | 多租户隔离未验收（S0 只有部署账户绑定 + 数据根归属核对） | **P0** |
| `verify:engineering` / CI 门禁未实现 | `pnpm verify` 只跑 S0 脚本，PR 无自动门禁 | **P1** |
| 公司树分支（type/parent/深度上限）缺测试 | 无回归保护 | P1 |
| web 无实现 | 无法展示 IP 业务状态 | P2 |
| 无真实浏览器测试 | 无法验证用户可见路径 | P2 |

### 1.3 可复用的 dsh-agent-swarm 资产

| 资产 | 复用方式 |
|---|---|
| `project-binding.yaml` 结构 | 直接参考，裁剪为 soloips 版本 |
| `document-registry.yaml` 结构 | 直接参考，适配 soloips 文档集 |
| `08-testing-verification.md` | 简化采纳为 soloips 验证策略 |
| 验证脚本模式 | 参考 `scripts/verify-*.mjs` 结构，适配 pnpm verify 命令 |
| `team-delivery-leadership` skill | 直接使用现有简化版 |
| worktree 隔离机制 | 简化采用，初期可暂缓 |

### 1.4 关键依赖链

```
Team 端口实现 ──┬── core CRUD 实现
                │
                └── adapter-dsh agents 端口实现 ──┬── bundle 装配逻辑
                                                  │
                                                  └── web 投影实现
```

**结论**：M0 阶段核心任务是打通「adapter-dsh → core → Team」这条关键链路，其余并行开展。

---

## 2. 里程碑规划

### 里程碑总览

| 里程碑 | 目标 | 交付物 | 验收标准 | 预计时间 |
|---|---|---|---|---|
| M0 | 基础就绪 | 依赖锁定、CI 门禁、隔离机制 | `pnpm verify` 通过；可构建 | 1-2 周 |
| **M0.1** | **Web 版基础** | **公司/部门/团队 CRUD**（界面 = 官方 Web fork 改造版 `soloips-web`） | **能在 DSH Web 中创建公司** | — |
| **M0.2** | **订阅限制** | **权益策略接口、三层配额（Free 1 公司+0 子公司；Pro 1 公司+3 子公司）** | **免费用户无法创建第二公司或任一子公司** | — |
| **M0.3** | **3D 版基础** | **场景搭建、部门/团队可视化** | **3D 场景能渲染公司结构** | — (⏳ 随自研 UI 路线推迟) |
| **M1** | **双版本联调** | **Zustand 状态共享、Web↔3D 同步** | **Web 操作同步到 3D 视图** | — (⏳ 依赖 M0.3，推迟) |
| **M2** | **总助理** | **AI 驱动的公司运营** | **对话总助理完成日常事务** | — |
| **M3** | **日志与监测** | **三层日志系统** | **能查询业务审计、执行历史** | — |

### 平台运营里程碑（后期）

> **接口契约详见**：[`docs/design/operation-services.md`](../design/operation-services.md)

| 里程碑 | 目标 | 交付物 | 验收标准 | 优先级 |
|---|---|---|---|---|
| **P1 Auth** | 多租户认证 | 注册/登录/Session 管理 | 用户可注册登录、配额生效 | P1 |
| **P1 Sub** | 订阅管理 | 计划/升级/续费 | 免费/Pro/Enterprise 配额控制 | P1 |
| **P2 Pay** | 支付服务 | 支付网关对接 | 支持支付宝/微信/Stripe | P2 |
| **P2 Billing** | AI 模型计费 | 多种计费模式 | 支持订阅/token/时间/按次计费 | P2 |
| **P3 Invoice** | 发票服务 | 申请/管理 | 用户可申请电子发票 | P3 |

**里程碑说明**：
- M0–M3 是 SoloIPS 框架本身的交付
- 平台运营里程碑（P1–P3）在框架核心完成后实现
- 业务插件（PV 工具等）由用户 IT 团队或 SoloIPS 开发团队交付

### UI 双版本里程碑详情

> **界面路线注记（2026-09-17）**：本节的「自研双版本 + Client Slots」落实方式**推迟**。V1（M0.1）界面改为**复制官方 Web 插件 fork 改造为 `soloips-web`**（官方 DSH 源码不动，装配时替换 profile bundles 的官方 Web 行）；M0.3（3D）与 M1（双版本联调）随自研路线推迟，解冻时点〔待决〕。里程碑口径与验收出口不变，见 [`docs/decisions/web-ui-fork.md`](../decisions/web-ui-fork.md)。

#### M0.1：Web 版基础

**目标**：实现公司/部门/团队 CRUD。原「通过 DSH Client Slots 接入的自研 Web 实现」改为复制官方 Web 插件 fork 改造版承接，验收出口不变。

#### M0.2：订阅限制

**目标**：三层配额生效——免费版 1 个顶层公司且不能创建子公司；Pro 1 个顶层公司 + 最多 3 个子公司；Enterprise 不限（权威口径见 `docs/design/data-contract.md` §2/§6.1）。

#### M0.3：3D 版基础

**目标**：使用 React Three Fiber + Three.js 渲染公司架构场景。⏳ 随自研 UI 路线**推迟**，解冻时点〔待决〕。

#### M1：双版本联调

**目标**：Web 与 3D 共享 Zustand store，操作自动同步。⏳ 依赖 M0.3，随自研 UI 路线**推迟**。

> **注意**：M0.1 可与 M0 并行开发，独立验收；M0.3/M1 待自研路线解冻后再排期。

### 原有里程碑（〔已取代〕）

> **〔已取代〕2026-09-17**：本节及下文 §2.2–2.4 的里程碑定义（M1=单员工闭环、Sonnet=部门协作、Opus=完整框架）已被 [`docs/design/data-contract.md`](../design/data-contract.md) §6.1 取代（M1=双版本联调、M2=总助理、M3=日志与监测；S1=PV 交付、S2=发行反馈为独立切片）。下列内容仅保留为历史任务分解参考，不再作为里程碑口径；其中 §2.3 的"任务状态机"表述同时违背"不建第二套任务状态机"的协作路线（SOLO-TEAM-03），不得据此实现。

| 里程碑 | 目标 | 交付物 | 验收标准 |
|---|---|---|---|
| M1（原） | 单员工闭环 | 公司/部门/员工入职、Session 绑定、持久化 | 真实创建 + 重启恢复 |
| Sonnet（原） | 部门协作 | Team 端口、任务领取、跨员工协作 | 单部门内 2 名员工协作 |
| Opus（原） | 完整框架 | 全部 5 包、发行反馈 | 可交付首个 PV 作品 |

### 2.1 M0：基础就绪

**目标**：建立可验证的开发基础设施，为 M1+铺路。

#### 交付物

1. **依赖锁定**
   - `pnpm-lock.yaml` 冻结所有 `@deepseek-ai/*` 版本
   - `docs/OFFICIAL_BASELINE.json` 记录运行时组合

2. **CI 门禁**
   - `pnpm verify:engineering`：format + lint + typecheck + test + build
   - `pnpm verify:structure`：包边界、exports、依赖方向检查
   - GitHub Actions workflow 实现 PR 门禁

3. **隔离机制**（简化版）
   - `.git/hooks/` 预提交检查
   - `docs/governance/document-registry.md` 文档登记

#### 验收标准

- `pnpm build` 成功
- `pnpm verify:engineering` 全部通过
- PR 必须通过 CI 才能合并

#### 关键任务

| 任务 | 依赖 | 负责 |
|---|---|---|
| T0.1 配置 pnpm workspace | — | agent |
| T0.2 实现 verify:engineering | T0.1 | agent |
| T0.3 配置 GitHub Actions | T0.2 | agent |
| T0.4 冻结 OFFICIAL_BASELINE | T0.1 | agent |
| T0.5 完善 document-registry | T0.1 | agent |

### 2.2 M1：单员工闭环〔已取代〕

> **〔已取代〕** 本节为旧 M1 定义的任务分解，里程碑口径以 data-contract §6.1 为准（M1=双版本联调）。本节保留为 core CRUD 任务分解的历史参考；其中 core CRUD 已实现（见 §1.1），未竟事项并入 S0 多公司基础缺口。

**目标**：SoloIPs 可运行的最简形态——一个公司、一个部门、一名员工，可持久化。

#### 交付物

1. **core CRUD 实现**
   - 6 张表的 opener 实现
   - company/department/employee/appointment 的 create/read/update
   - document_version 的 save/read
   - operation 台账（pending/committed）

2. **adapter-dsh agents 端口实现**
   - Session 绑定到 employee/appointment
   - Host 入口实现（onboarding 流程）

3. **恢复验证**
   - 写入 → 停止 → 重启 → 读回完整路径
   - operation 幂等验证

#### 验收标准

- [ ] 创建公司/部门/员工成功
- [ ] 员工可完成入职（资料上传、准入判定）
- [ ] 重启后数据可恢复
- [ ] operation 重放不产生重复身份
- [ ] 上游 API 失败时有停线/通知

#### 关键任务

| 任务 | 依赖 | 可并行 |
|---|---|---|
| T1.1 core opener 实现 | M0 | — |
| T1.2 core CRUD (company/dept/employee) | T1.1 | T1.3 |
| T1.3 core CRUD (appointment/document) | T1.1 | T1.2 |
| T1.4 operation 台账逻辑 | T1.2 | — |
| T1.5 adapter-dsh agents 端口 | T1.2, T1.3 | T1.6 |
| T1.6 adapter-dsh session 端口 | T1.5 | — |
| T1.7 Host onboarding 流程 | T1.6 | — |
| T1.8 恢复测试 | T1.7 | — |

### 2.3 Sonnet：部门协作〔已取代〕

> **〔已取代〕** 本节为旧 Sonnet 定义；现行口径 M2=总助理（data-contract §6.1）。本节内容保留为 Team 端口适配的历史参考。**特别注意**：下文"任务状态机"（交付物 2 及 T2.2）违背协作路线——任务/attempt 状态归官方 Agent Team，core 只做准入，不建第二套任务状态机（SOLO-TEAM-03、architecture.md §3）；Team 端口实现应以官方 Team 原生任务为准。

**目标**：Team 端口实现，部门内多员工可协作完成有依赖的任务。

#### 交付物

1. **Team 端口实现**
   - `createTask` / `updateTask` / `listTasks`
   - `sendMessage` / `listMembers`

2. **任务协作**
   - 任务领取与状态机
   - 依赖 DAG
   - attempt 记录

3. **审查门禁**
   - 非作者审查机制
   - revision 保护

#### 验收标准

- [ ] 部门内 2 名员工可协作
- [ ] 任务有依赖关系时按序执行
- [ ] 作者不能给自己生成通过记录
- [ ] 任务可被退回并重新领取

#### 关键任务

| 任务 | 依赖 | 可并行 |
|---|---|---|
| T2.1 adapter-dsh team 端口 | M1 | — |
| T2.2 任务状态机 | T2.1 | T2.3 |
| T2.3 消息路由 | T2.1 | T2.2 |
| T2.4 审查门禁 | T2.2 | — |
| T2.5 bundle 装配逻辑完善 | M1 | — |
| T2.6 协作测试 | T2.4, T2.5 | — |

### 2.4 Opus：完整框架〔已取代〕

> **〔已取代〕** 本节为旧 Opus 定义；现行口径 M3=日志与监测（data-contract §6.1）。下文交付物中的 tools-pv 属 **S1（PV 交付）**、发行反馈属 **S2（发行反馈）**，均为独立切片，不再并入某一框架里程碑。

**目标**：全部 5 包就绪，可交付首个 PV 作品。

#### 交付物

1. **soloips-tools-pv**（S1 制作工具适配）
   - 工具适配接口
   - job 管理

2. **soloips-web 界面**
   - IP 简纲输入
   - 任务看板
   - 作品预览

3. **发行反馈**（S2）
   - 试水发布接口
   - 反馈收集

#### 验收标准

- [ ] 5 包全部通过 verify
- [ ] 可完成 IP 简纲到 PV 分镜
- [ ] 用户可验收/退回
- [ ] 首个作品完成发布反馈

---

## 3. PR 流程

### 3.1 特性分支策略

```
main ──────────────────────────────────────────
        │          │          │
      feat/T0x    feat/T1x    feat/T2x ...
        │          │          │
        └──── PR ──┴──── PR ──┘
                   ↓
              review + CI
                   ↓
              squash merge
```

**规则**：
- 每个任务一个分支：`feat/T{task-id}-{short-description}`
- 分支命名用 kebab-case，ID 用任务编号
- 示例：`feat/T1.2-company-crud`

### 3.2 PR 门禁（CI 验证）

#### 分层验证

| 层级 | 命令 | 时机 | 阻塞条件 |
|---|---|---|---|
| 快速检查 | `pnpm lint` + `pnpm typecheck` | 每次 push | 任何失败 |
| 单元测试 | `pnpm test` | PR 时 | 测试失败 |
| 构建验证 | `pnpm build` | PR 时 | 构建失败 |
| 结构检查 | `pnpm verify:structure` | PR 时 | 包边界违规 |
| 完整门禁 | `pnpm verify:engineering` | PR + Merge | 任何失败 |

#### CI 配置

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request, push]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm verify:structure
      - run: pnpm verify:engineering
```

### 3.3 Review 流程

#### 风险分级

| 变更类型 | 示例 | Review 要求 |
|---|---|---|
| Low | 文档更新、注释修改、测试用例 | 作者自查 |
| Medium | 新增端口实现、schema 变更 | 非作者 review |
| High | 跨包依赖方向变更、状态归属变更 | 独立专家 review |

#### Review 检查清单

- [ ] 代码符合 TypeScript strict 模式
- [ ] 无 `any` 类型
- [ ] 异步操作有错误处理
- [ ] 符合包边界规则（无跨包相对导入）
- [ ] 文档已更新（如需）
- [ ] 测试覆盖新增逻辑

### 3.4 合并时机

**M0-M1 阶段（单人开发）**：
- CI 通过
- 自我 review 完成
- 无未解决的 blocking comments

**M2+ 阶段（多智能体，指进入 M2 里程碑及以后的多人/多智能体协作期）**：
- CI 通过
- 至少 1 个非作者 approval
- 无 blocking comments

---

## 4. 多智能体协同策略

> **详细规范见**：[多智能体开发规范](../governance/multi-agent-development.md)
> 
> 本章只描述与 milestone/phase 相关的协同策略，详细 Agent 配置、任务拆分模板、派发规范见 `multi-agent-development.md`。

### 4.1 任务分配原则

```
┌─────────────────────────────────────────────────────┐
│                    队长 (Product Owner)              │
│  - 任务拆解与分配                                    │
│  - 优先级判定                                        │
│  - 验收复核                                          │
└────────────────────┬────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
┌─────────┐    ┌─────────┐    ┌─────────┐
│ 架构师  │    │ 开发者  │    │   QA   │
│ (core)  │    │(adapter)│    │ (verify)│
└─────────┘    └─────────┘    └─────────┘
```

### 4.2 可并行任务识别

| 阶段 | 可并行任务组 | 依赖关系 |
|---|---|---|
| M0 | T0.2 CI 配置、T0.4 基线冻结 | T0.1 完成后 |
| S0 多公司基础 | agents/session 端口核对、配额/权限/执行绑定补齐 | core CRUD 已完成 |
| M2（总助理） | 总助理任职初始化、事件触发链 | S0 多公司基础完成后 |

### 4.3 子智能体角色定义

#### 架构师 (core-focused)

```
角色: 架构师
职责:
  - core 包 CRUD 实现
  - schema 定义与验证
  - 状态归属规则
范围:
  - packages/core/*
  - adapter-dsh 的 contracts.ts
输出:
  - 可运行的 CRUD 函数
  - 单元测试
  - schema 文档
升级条件:
  - 测试通过
  - 符合包边界
  - 文档已更新
```

#### 开发者 (adapter-focused)

```
角色: 开发者
职责:
  - adapter-dsh 端口实现
  - bundle 装配逻辑
  - Host 入口
范围:
  - packages/adapter-dsh/src/ports/*
  - packages/bundle/*
输出:
  - 端口实现
  - 集成测试
  - 装配配置
升级条件:
  - 依赖 core 接口正确
  - CI 通过
```

#### QA (verification-focused)

```
角色: QA
职责:
  - 验证脚本实现
  - 测试用例设计
  - 回归测试
范围:
  - scripts/verify-*.mjs
  - packages/*/tests/*
输出:
  - 验证脚本
  - 测试报告
  - 缺陷报告
升级条件:
  - 验证脚本可运行
  - 覆盖关键路径
```

### 4.4 复核机制

#### 双人复核（High Risk 变更）

```
变更 → 实现者自审 → 独立专家复核 → 队长核准 → 合并
```

#### 集成复核（M1 后）

每个 PR 合并前：
1. 实现者运行 `pnpm verify:engineering`
2. QA 运行相关测试用例
3. 队长复核验收标准达成

### 4.5 冲突解决

| 冲突类型 | 解决策略 |
|---|---|
| 接口定义冲突 | 以 contracts.ts 为准，core 是权威 |
| 包边界冲突 | 架构师裁定，参考 ARCH-D02 |
| 验收标准冲突 | 回到 architecture.md / 用户确认 |
| 依赖版本冲突 | 锁定版本优先，升级需单独 PR |

---

## 5. 文档体系

### 5.1 文档清单

| 文档 | 路径 | 用途 | 更新时机 | 负责人 |
|---|---|---|---|---|
| 项目绑定 | `docs/governance/project-binding.yaml` | 权威治理契约 | 架构变更时 | governance-owner |
| 文档登记 | `docs/governance/document-registry.md` | 文档路径与角色 | 新增文档时 | governance-owner |
| 代码规范 | `docs/governance/code-development-standard.md` | 编码要求 | 规范变更时 | engineering-owner |
| **架构概览** | `docs/architecture-summary.md` | **快速参考：包职责、关键决策、里程碑** | 架构更新时 | architecture-owner |
| **完整架构设计** | `docs/architecture-complete.md` | **UI双版本、多公司模型、总助理、日志系统** | 重大设计变更时 | architecture-owner |
| **权威数据契约** | `docs/design/data-contract.md` | **唯一权威数据模型、三层配额、实现状态** | 数据模型变更时 | architecture-owner |
| **多公司架构** | `docs/design/multi-company-organization.md` | 〔已取代〕历史稿 | — | architecture-owner |
| **多公司实现** | `docs/design/multi-company-implementation.md` | 〔已取代〕历史稿 | — | architecture-owner |
| **弊端与优化** | `docs/design/tradeoffs-and-optimizations.md` | **每个设计的潜在弊端+优化方案** | 设计时 | architecture-owner |
| 技术架构 | `docs/technical-architecture.md` | 包边界与技术决策 | 技术决策时 | architecture-owner |
| 环境交接 | `docs/operations/environment-handoff.md` | 本机路径与命令 | 环境变化时 | operations-owner |
| 里程碑报告 | `docs/development/milestone-{M0,M1...}.md` | 阶段交付记录 | 里程碑完成时 | 队长 |
| 开发日志 | `docs/development/log-{YYYY-MM}.md` | 开发过程记录 | 日常 | 开发者 |
| API 契约 | `docs/api/contracts.md` | 端口接口定义 | 接口变更时 | architecture-owner |

### 5.2 文档更新规则

| 文档类型 | 更新权限 | 验证方式 |
|---|---|---|
| 稳定权威 | governance-owner | `pnpm verify:policy` |
| 技术决策 | architecture-owner | `pnpm verify:structure` |
| 开发记录 | 开发者 | 无自动验证 |
| API 契约 | 架构师 | `pnpm typecheck` |

### 5.3 文档维护流程

```
新文档 → 登记到 document-registry → 实现 → 关联到代码
              ↓
         验证通过
              ↓
         正式生效
```

---

## 6. 风险与依赖

### 6.1 风险矩阵

| 风险 | 概率 | 影响 | 缓解策略 | 依赖 |
|---|---|---|---|---|
| DSH 官方 API 变更 | 中 | 高 | 锁定版本；隔离适配层；升级前验证 | 官方 release 节奏 |
| Team 端口接口不稳定 | 高 | 高 | fail-closed 占位；等待稳定版本 | 官方 API 冻结 |
| 单人开发进度慢 | 高 | 中 | 简化验证流程；聚焦核心路径 | — |
| 多智能体并行冲突 | 中 | 中 | git-worktree 隔离；队长裁定机制 | worktree 配置 |
| 依赖版本冲突 | 低 | 高 | frozen-lockfile；独立验证 | — |
| **3D 性能问题** | 中 | 中 | **LOD + InstancedMesh；视锥剔除** | **M0.3 实现时** |
| **Web/3D 状态同步延迟** | 低 | 中 | **immer 批量更新；异步读取** | **M1 联调时** |
| **权益策略绕过** | 中 | 高 | **服务端强制检查（core 层拦截）** | **M0.2 实现时** |

### 6.2 外部依赖

| 依赖 | 当前状态 | 升级策略 |
|---|---|---|
| `@deepseek-ai/dsh-*` | 0.1.6-alpha.1 | 官方 release 后验证兼容性 |
| `@deepseek-ai/cordis` | 4.0.2 | 与 DSH 同步升级 |
| `typescript` | ^5.9.3 | 跟随 DSH 依赖 |
| `vitest` | ^3.2.4 | 安全更新 |

### 6.3 回退计划

| 场景 | 回退策略 |
|---|---|
| DSH 升级破坏 | 切回 frozen-lockfile 版本；冻结升级 |
| PR 引入缺陷 | revert PR；重新 review |
| 数据损坏 | 使用备份 DSH_HOME；检查 operation 台账 |
| 包边界破坏 | 拒绝合并；修复后重提 |

---

## 7. 下一步行动

### 立即可执行（M0 启动）

| 步骤 | 任务 | 预期产出 | 执行者 |
|---|---|---|---|
| 1 | 配置 pnpm workspace | `pnpm-workspace.yaml`、可用的 monorepo | agent |
| 2 | 实现 verify:engineering | `pnpm lint`/`typecheck`/`test`/`build` 脚本化 | agent |
| 3 | 配置 GitHub Actions | CI workflow | agent |
| 4 | 冻结 OFFICIAL_BASELINE | `docs/OFFICIAL_BASELINE.json` | agent |
| 5 | 完善 document-registry | 添加所有已知文档 | agent |

### M0 完成信号

```
[ ] pnpm build 成功
[ ] pnpm verify:engineering 全部通过
[ ] PR 到 main 必须通过 CI
[ ] 文档登记完整
```

### M1 启动条件

M0 完成后，且：
- Team 端口接口已明确（官方或内部定义）
- core schema 已评审通过

---

## 附录 A：参考来源

- [dsh-agent-swarm project-binding.yaml](D:\Source\workspace\dsh-agent-swarm\docs\governance\project-binding.yaml)
- [dsh-agent-swarm document-registry.yaml](D:\Source\workspace\dsh-agent-swarm\docs\governance\document-registry.yaml)
- [dsh-agent-swarm testing-verification](D:\Source\workspace\dsh-agent-swarm\docs\08-testing-verification.md)
- [team-delivery-leadership skill](D:\Source\workspace\soloips\.agents\skills\team-delivery-leadership\SKILL.md)
- [SoloIPs architecture.md](D:\Source\workspace\soloips\docs\architecture.md)
- [SoloIPs technical-architecture.md](D:\Source\workspace\soloips\docs\technical-architecture.md)
- [SoloIPs project-binding.yaml](D:\Source\workspace\soloips\docs\governance\project-binding.yaml)

---

## 附录 B：术语表

| 术语 | 定义 |
|---|---|
| M0/M1/M2/M3 | 里程碑代号（权威定义见 data-contract §6.1），M0=基础就绪，M1=双版本联调，M2=总助理，M3=日志与监测；曾用代号 Sonnet/Opus 已于 2026-09-17 更名（原代号借用模型档位名、与内容无关，易致多套含义漂移） |
| verify:engineering | 完整工程验证命令（format/lint/typecheck/test/build） |
| fail-closed | 服务不可用时默认拒绝访问，而非返回错误数据 |
| cordis.patch.yml | Cordis 框架的装配配置文件 |
| OFFICIAL_BASELINE | 锁定运行时依赖组合的基准 |

---

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-17 | 按用户确认的产品准则统一：「原有里程碑」及 §2.2–2.4 标〔已取代〕（里程碑权威定义归 data-contract §6.1）；M0.2 改三层配额口径；§4.2 并行任务表去除旧代号与"任务状态机"；术语表同步 |
| 2026-09-17 | 里程碑代号 Sonnet→M2、Opus→M3（含 §3.4 合并时机、§4.2 并行任务表、术语表）；原代号与模型档位同名易误解，用户裁定更名 |
| 2026-09-17 | 写入 V1 UI 决策：§1.1 web 行、里程碑总览 M0.1/M0.3/M1、UI 双版本里程碑详情与 M0.1/M0.3/M1 小节补界面路线注记，指向 `docs/decisions/web-ui-fork.md` | 文档智能体 |
