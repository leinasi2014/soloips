# 包结构与职责

> 技术架构 §5。SoloIPs 包清单、边界与状态归属。

## 包清单（ARCH-D02）

| 包 | 职责 | 状态归属 | 依赖 |
|---|---|---|---|
| soloips-bundle | 装配声明，patch 覆写顺序 | 无 | 无运行时依赖 |
| soloips-adapter-dsh | DSH 适配，收敛全部 `@deepseek-ai/*` | 无业务状态 | DSH 官方包 |
| soloips-core | **通用业务状态（公司层级、组织结构、文档模型）** | 各业务插件的共享基础 | adapter |
| soloips-web | **界面层（Web + 3D 双版本）** | 只读投影 | core |
| soloips-tools-pv | **业务插件（PV 制作）** | PV 任务状态 | adapter + core |

## 端口映射（adapter-dsh）

| 端口 | 对应 DSH 能力 | 说明 |
|---|---|---|
| `storage` | storage-domain、storage-json | 持久化 |
| `session` | session-persistence | 会话管理 |
| `agents` | agent | Agent 管理 |
| `subagents` | subagent | 子 Agent |
| `team` | agent-team | Team 协作 |
| `tools` | tools | 工具调用 |
| `events` | events | 事件系统 |
| `shared` | shared | 共享能力 |

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

## 目录结构

```
packages/
├── soloips-bundle/
│   ├── package.json
│   ├── cordis.patch.yml
│   └── tests/
├── soloips-adapter-dsh/
│   ├── package.json
│   ├── cordis.patch.yml
│   ├── src/index.ts
│   ├── src/contracts.ts
│   ├── src/ports/           # 8 个端口
│   └── tests/
├── soloips-core/
│   ├── package.json
│   ├── cordis.patch.yml
│   ├── src/index.ts         # Host 入口
│   ├── src/contracts.ts
│   ├── src/store.ts         # 公司 store
│   ├── src/company/         # 多公司支持
│   ├── src/department/      # 部门管理
│   ├── src/team/            # 团队管理
│   └── tests/
└── soloips-web/
    ├── package.json
    ├── cordis.patch.yml
    ├── src/index.ts          # Host 桥
    ├── src/client/index.ts   # Client 入口
    ├── src/client/web/       # Web 版本（React + Zustand）
    ├── src/client/3d/       # 3D 版本（R3F + Three.js）
    └── tests/
```

### 三层公司生态（ARCH-D09）

| 层级 | 类型 | 说明 | 持有者 |
|------|------|------|--------|
| **第一层** | `platform` | SoloIPs 品牌方，拥有所有运营子公司 | SoloIPS 官方 |
| **第二层** | `operation` | 漫画网站、视频网站、音乐网站等业务平台 | SoloIPS 官方 |
| **第三层** | `enterprise` / `subsidiary` | 用户创建的 AI 公司及其子公司 | 用户 |

详细内容见 [`docs/architecture-summary.md`](../architecture-summary.md) 三层公司生态架构章节。

### UI 双版本架构（ARCH-D08）

| 版本 | 技术栈 | 说明 |
|---|---|---|
| **Web** | React + Zustand | 主界面，公司/部门/团队 CRUD |
| **3D** | React Three Fiber + Three.js | 科幻风格可视化，公司架构场景 |

详细设计见 [`docs/architecture-complete.md`](../architecture-complete.md)

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-17 | 从技术架构拆分 |
