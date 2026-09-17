# SoloIPs 架构概览

> 快速参考：包职责、端口映射、依赖关系。

## 包结构

```
packages/
├── soloips-bundle/          # 装配声明
├── soloips-adapter-dsh/    # DSH 适配层
├── soloips-core/            # 业务状态（公司、作品、IP）
└── soloips-web/             # 界面层
```

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
| `storage` | storage-domain、storage-json | 持久化 |
| `session` | session-persistence | 会话管理 |
| `agents` | agent | Agent 管理 |
| `subagents` | subagent | 子 Agent |
| `team` | agent-team | Team 协作 |
| `tools` | tools | 工具调用 |
| `events` | events | 事件系统 |
| `shared` | shared | 共享能力 |

### soloips-core

- 唯一业务状态包
- 持有：公司、作品、IP 等 domain
- **只消费** adapter 的 storage 端口
- 对外暴露公司服务

### soloips-web

- 界面层（可替换）
- 读 core 的投影
- 经服务提交操作意图

## 依赖方向

```
┌─────────────┐
│ soloips-web │
└──────┬──────┘
       │
       ▼
┌─────────────┐      ┌──────────────────┐
│ soloips-core│◄─────│ soloips-adapter-dsh│
└─────────────┘      └────────┬─────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │ DSH 官方包   │
                        └──────────────┘

┌─────────────────┐
│ soloips-bundle  │  # 装配层，无运行时依赖
└─────────────────┘
```

## 配置流程

1. DSH 按 `bundles` 数组顺序加载 bundle patch
2. bundle patch 叠加到空 entry list
3. profile patch 在 bundle 层之上
4. 最终配置由 `cordis.patch.yml` 定义

## 状态归属

| 状态类型 | 归属包 | 说明 |
|---|---|---|
| 公司/部门/员工 | soloips-core | 唯一写权威 |
| 作品/IP | soloips-core | 唯一写权威 |
| 会话/任务 | DSH (经 adapter) | 由 DSH 管理 |
| 工具/资源 | DSH (经 adapter) | 由 DSH 管理 |

## 就绪检查

core 依赖 adapter 的 storage 端口：

```
core 启动
  ├── 检查 enabled 配置
  ├── inject('soloipsAdapter')
  │     └── 检查 storage 端口存在
  ├── 检查 storageRoot 配置
  └── 打开公司 store
        ├── acquireWriterLease
        ├── createStack
        └── requireFacility
```

## 关键约束

1. **core 只用 adapter 的 storage**：其他端口存在但 core 暂不使用
2. **禁止跨包直接导入**：用 `exports` 和服务契约
3. **adapter 无业务状态**：只做 DSH 能力适配

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-17 | 创建简化版架构概览 |
