# 包结构与职责

> 技术架构 §5。SoloIPs 包清单、边界与状态归属。

## 包清单（ARCH-D02）

| 包 | 职责 | 状态归属 | 依赖 |
|---|---|---|---|
| soloips-bundle | 装配声明，patch 覆写顺序 | 无 | 无运行时依赖 |
| soloips-adapter-dsh | DSH 适配，收敛全部 `@deepseek-ai/*`；支持 SQLite/JSON 存储后端 | 无业务状态 | DSH 官方包 |
| soloips-core | **通用业务状态（公司层级、组织结构、文档模型）** | 各业务插件的共享基础 | adapter |
| soloips-web | **界面层**（V1 = 本仓自建最小插件） | 只读投影 | core |
| soloips-tools-pv | **业务插件（PV 制作）** | PV 任务状态 | adapter + core |

> **存储后端**：默认 SQLite（Drizzle 0.38 查询构造 + better-sqlite3 driver，实现见
> `packages/adapter-dsh/src/ports/storage-sqlite.ts`）；可选 JSON。后期可迁移 PostgreSQL
> 〔建议〕（迁移面见 `docs/technical/state.md`）。

> **实现程度（2026-09-17）**：`adapter-dsh` 只差 `team` 端口（fail-closed）；`core` 已实现六表 CRUD 与提交门；
> `web` 的**业务 Host 半边已实测通过**（5 个业务 Remote，真实 E2E 全绿；分支 `fix/BE-6a-runtime-identity` 未合并 main）；V1 界面的交付方式为**本仓自建最小插件**（2026-09-19 用户裁定）
> （非自研 React/Zustand/3D，后者推迟），见 [`docs/decisions/web-ui-fork.md`](../decisions/web-ui-fork.md)；
> `tools-pv` 属 S1，未创建。

## 端口映射（adapter-dsh）

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

**core 只依赖 adapter 的 `storage` 端口**：其他端口存在但当前未使用。

## 依赖方向

```
soloips-bundle          # 无运行时依赖
       ↓
soloips-adapter-dsh     # 依赖 DSH 官方包
       ↑
soloips-core            # 依赖 adapter（只用 storage）
       ↑
soloips-web             # 依赖 core
```

## 建包判据

新增持久业务状态包需满足：

1. **自有 schema**：该能力有独立的持久 schema
2. **独立写权威**：明确的 domain 写入口
3. **独立升级节奏**：确有独立发布/回滚需求

## 包边界规则

- `core` 是通用业务状态包，提供组织结构和文档模型的共享基础
- 各业务插件（如 tools-pv）是独立业务领域的写权威
- 其他包只能读投影或经服务请求
- 禁止跨包相对导入，用 `exports` 和服务契约
- 禁止 `any` 绕过类型检查

## 框架定位

SoloIPs 是 **AI 公司协作平台框架**：
- 框架核心（core/adapter/bundle/web）由 SoloIPS 官方维护
- 业务插件（PV 工具、发行渠道等）由用户 IT 团队或 SoloIPS 开发团队交付

## 目录结构（当前实际）

```
packages/                    # package 名见各自 package.json（soloips-*）
├── bundle/                  # 装配声明，无 src/、无运行时依赖
│   ├── package.json
│   ├── cordis.patch.yml
│   └── tests/
├── adapter-dsh/
│   ├── package.json
│   ├── cordis.patch.yml
│   ├── src/index.ts
│   ├── src/contracts.ts
│   ├── src/ports/           # 7 个端口（team 为 fail-closed 占位）
│   └── tests/
├── core/
│   ├── package.json
│   ├── cordis.patch.yml
│   ├── src/index.ts         # Host 入口
│   ├── src/contracts.ts     # 服务契约与 DTO
│   ├── src/domain.ts        # 六表 domain spec
│   ├── src/store.ts         # 唯一 opener + 业务命令
│   ├── src/commit-gate.ts   # 唯一提交前门（含账户归属盖章）
│   ├── src/onboarding.ts    # 入职/准入判定
│   └── tests/
└── web/                     # V1 交付方式 = 本仓自建最小插件；业务 Host 半边已实现，界面组件待 FE 切片
    ├── package.json
    ├── cordis.patch.yml
    ├── src/index.ts
    └── tests/
```

> 设计与实现差距逐项见 [`docs/design/data-contract.md`](../design/data-contract.md) §0。
> `soloips-tools-pv` 属 S1，**当前不建占位包**。

### 三层公司生态（SOLO-COMPANY-01）

| 层级 | 类型 | 说明 | 持有者 |
|------|------|------|--------|
| **第一层** | `platform` | SoloIPs 品牌方，拥有所有运营子公司 | SoloIPS 官方 |
| **第二层** | `operation` | 漫画网站、视频网站、音乐网站等业务平台 | SoloIPS 官方 |
| **第三层** | `enterprise` / `subsidiary` | 用户创建的 AI 公司及其子公司 | 用户 |

详细内容见 [`docs/architecture-summary.md`](../architecture-summary.md) 三层公司生态架构章节。

### UI 双版本架构（ARCH-D08）

> **〔已取代〕**：V1 界面 = **本仓自建最小插件 `soloips-web`**（2026-09-19 用户裁定；不 fork 官方 Web）；下表自研 Web+3D 路线**推迟**（〔待决〕解冻时点）。正文保留为历史设计稿，见 [`docs/decisions/web-ui-fork.md`](../decisions/web-ui-fork.md)。

| 版本 | 技术栈 | 说明 |
|---|---|---|
| **Web** | React + Zustand | 主界面，公司/部门/团队 CRUD |
| **3D** | React Three Fiber + Three.js | 科幻风格可视化，公司架构场景 |

详细设计见 [`docs/architecture-complete.md`](../architecture-complete.md)

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-17 | 从技术架构拆分 |
| 2026-09-17 | 按用户确认的产品准则统一：三层公司生态的决策引用由不存在的 ARCH-D09 更正为 SOLO-COMPANY-01 |
| 2026-09-17 | 写入 V1 UI 决策：web 行/实现程度/目录注释改为「官方 Web fork 改造」定位；UI 双版本节标〔已取代〕并指向 `docs/decisions/web-ui-fork.md`（存储后端行未改动） | 文档智能体 |
