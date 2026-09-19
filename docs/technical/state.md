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
| **SQLite**（默认） | 单文件、事务支持、WAL 并发；Drizzle 查询构造 + better-sqlite3 driver | 开发、单机部署 |
| **JSON** | 简单、无依赖 | 快速原型、向后兼容 |

**后期迁移 PostgreSQL**〔建议〕：Drizzle 是迁移载体（查询构造跨方言），但迁移面不止 driver：

- **换 driver**：`drizzle-orm/postgres-js`
- **连接层需重写**：PRAGMA（journal_mode/foreign_keys/busy_timeout/synchronous）与
  `wal_checkpoint(PASSIVE)` 是 SQLite 特有语义，不随 driver 迁移
- **写权协调机制需重新设计**：现为单机文件锁 + 租约代际（`storage.ts`），多机部署须改为
  数据库侧协调
- **存量数据**：导出导入并逐项核对
- **不变的部分**：unit schema 形状与 core 的调用面（KvFacet/KvUnit 方法集）

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
- **跨进程**：由 writer lease 承担——`dsh-atomic-write` 的 `withFileLock` 以 `wx` 独占创建
  `<lease>.lock`，锁窗口横跨整个租约生命周期；每次持久发布前复核（`assertHeld`）
- **禁止**：假设跨 domain 事务

## 写入检查点

```
写请求
  → 身份验证
  → 权限检查
  → 状态检查（旧 revision）
  → 写权复核（租约 assertHeld）
  → 持久化
  → 返回结果
```

## Domain 规则

| 规则 | 说明 |
|---|---|
| 同实例每个 domain 只有一个 opener | 重复 open 抛出 `already-open` |
| 跨实例独占由 writer lease 承担 | `withFileLock` 文件锁提供真实跨进程互斥（锁窗口横跨整个租约生命周期），与 backend 选择无关——缺省 backend 为 `sqlite`（`contracts.ts` 的 `SOLOIPS_ADAPTER_CONFIG_DEFAULTS`），`json` 可选。租约的 `generation` 只作诊断，**不是** fencing token |
| 跨 domain 不用事务 | 用"单一权威侧 + 重读 + fail-closed" |

## 失败场景

| 场景 | 期望 |
|---|---|
| 两包打开同名 domain | 第二次 open 抛出异常 |
| 非 opener 包打开已打开 domain | 抛出异常 |
| 跨进程写同一数据 | 第二写者取权被拒（`SOLOIPS_ADAPTER_LEASE_NOT_HELD`，fail-closed，不接管他人锁） |

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-17 | 从技术架构拆分 |
| 2026-09-19 | 订正跨进程写权表述（缺陷 D-8）：① 缺省后端已是 `sqlite`（`packages/adapter-dsh/src/contracts.ts` 的 `SOLOIPS_ADAPTER_CONFIG_DEFAULTS.defaultBackend`，`7c80cd9` 由 `json` 改为 `sqlite`），不再是 JSON；② 跨实例独占**已有**实现——`withFileLock`（`dsh-atomic-write`）以 `wx` 创建 `<lease>.lock` 提供真实跨进程互斥，锁窗口横跨整个租约生命周期，故删去「默认 JSON backend 无跨进程锁」（该表述与事实相反）；③ 「另需 fence」收紧为「由 writer lease 承担」——`generation` 只作诊断、**不是** fencing token，真互斥由锁提供（STORAGE-03 已核实的契约注释见 `packages/adapter-dsh/src/ports/storage.ts` 与 `contracts.ts` 的 `SoloipsWriterLease`）。同步订正「并发保证」「写入检查点」「失败场景」中的同源表述 |
