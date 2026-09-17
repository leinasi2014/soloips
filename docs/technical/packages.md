# 包结构与职责

> 技术架构 §5。SoloIPs 包清单、边界与状态归属。

## 包清单（ARCH-D02）

| 包 | 职责 | 状态归属 | 依赖 |
|---|---|---|---|
| soloips-bundle | 装配声明，patch 覆写顺序 | 无 | 无运行时依赖 |
| soloips-adapter-dsh | DSH 适配，收敛全部 `@deepseek-ai/*` | 无业务状态 | DSH 官方包 |
| soloips-core | 公司、作品、IP 等业务 domain | **唯一业务写权威** | adapter |
| soloips-web | 界面层（可替换） | 只读投影 | core |
| soloips-tools-pv | 制作工具适配（S1） | 无业务状态 | adapter + core |

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

- `core` 是唯一业务写权威
- 其他包只能读投影或经服务请求
- 禁止跨包相对导入，用 `exports` 和服务契约
- 禁止 `any` 绕过类型检查

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
│   └── tests/
└── soloips-web/
    ├── package.json
    ├── cordis.patch.yml
    ├── src/index.ts          # Host 桥
    ├── src/client/index.ts   # Client 入口
    └── tests/
```

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-17 | 从技术架构拆分 |
