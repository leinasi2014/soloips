# 状态归属

> 技术架构 §7。业务事实的写权威与持久化规则。

## 核心原则

**一个状态只有一个写权威**。

- `soloips-core` 是组织结构和文档模型的写权威
- 业务插件（如 tools-pv）各自持有领域状态的写权威
- 其他包只能读投影或经服务请求
- 投影不回写，不是第二事实来源

## 状态归属

| 状态类型 | 归属包 | 存储后端 | 说明 |
|---|---|---|---|
| 公司层级树（platform/operation/enterprise/subsidiary） | soloips-core | SQLite（默认） | 公司树结构与层级关系 |
| 部门/员工/文档 | soloips-core | SQLite | 组织结构和文档模型的写权威 |
| PV 任务/分镜 | soloips-tools-pv | 待定 | PV 领域的写权威（业务插件） |
| 会话/任务 | DSH（经 adapter） | — | 由 DSH 管理 |
| 工具/资源 | DSH（经 adapter） | — | 由 DSH 管理 |

### 存储后端

SoloIPs 支持两种存储后端：

| 后端 | 特点 | 适用场景 |
|---|---|---|
| **SQLite**（默认） | 单文件、事务支持、WAL 并发 | 开发、单机部署 |
| **JSON** | 简单、无依赖 | 快速原型、向后兼容 |

**后期迁移 PostgreSQL**：
- 只需修改 Drizzle driver（`drizzle-orm/postgres-js`）
- Schema 定义不变
- Core 代码不需改动表

| 状态类型 | 归属包 | 说明 |
|---|---|---|
| 公司层级树（platform/operation/enterprise/subsidiary） | soloips-core | 公司树结构与层级关系 |
| 部门/员工/文档 | soloips-core | 组织结构和文档模型的写权威 |
| PV 任务/分镜 | soloips-tools-pv | PV 领域的写权威（业务插件） |
| 会话/任务 | DSH（经 adapter） | 由 DSH 管理 |
| 工具/资源 | DSH（经 adapter） | 由 DSH 管理 |

## 公司层级规则

| 规则 | 说明 |
|------|------|
| **SoloIPs 平台公司** | `type='platform'`，SoloIPS 官方持有；accountId 由部署层注入，不硬编码 |
| **SoloIPs 运营子公司** | `type='operation'`，parentCompanyId=平台公司ID，SoloIPS 官方持有 |
| **用户公司** | `type='enterprise'`，无 parentCompanyId，用户持有 |
| **用户子公司** | `type='subsidiary'`，parentCompanyId=用户公司ID，用户持有 |
| **权益配额** | 按顶层公司计算，控制子公司总数 |
| **SoloIPs 平台公司初始化** | 系统启动时自动创建平台公司和各运营子公司 |

## 写入规则

1. **身份验证**：写前验证操作者身份和权限
2. **状态检查**：检查旧状态/revision，防止丢失更新
3. **revision CAS**：用 revision 防止并发冲突
4. **operationId**：命令贯穿提交、结果和恢复

## 并发保证

- **同实例**：DomainFacility 内的 `already-open` 拦截同名 open
- **跨进程**：需要 fence（文件锁或等价机制）
- **禁止**：假设跨 domain 事务

## 写入检查点

```
写请求
  → 身份验证
  → 权限检查
  → 状态检查（旧 revision）
  → 写锁/fence（如需）
  → 持久化
  → 返回结果
```

## Domain 规则

| 规则 | 说明 |
|---|---|
| 同实例每个 domain 只有一个 opener | 重复 open 抛出 `already-open` |
| 跨实例独占另需 fence | 默认 JSON backend 无跨进程锁 |
| 跨 domain 不用事务 | 用"单一权威侧 + 重读 + fail-closed" |

## 失败场景

| 场景 | 期望 |
|---|---|
| 两包打开同名 domain | 第二次 open 抛出异常 |
| 非 opener 包打开已打开 domain | 抛出异常 |
| 跨进程写同一数据 | 需 fence 保护 |

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-17 | 从技术架构拆分 |
