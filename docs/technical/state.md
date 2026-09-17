# 状态归属

> 技术架构 §7。业务事实的唯一写权威与持久化规则。

## 核心原则

**一个状态只有一个写权威**。

- `soloips-core` 是 SoloIPs 业务事实的唯一写权威
- 其他包只能读投影或经服务请求
- 投影不回写，不是第二事实来源

## 状态归属表

| 状态类型 | 归属包 | 说明 |
|---|---|---|
| 公司/部门/员工 | soloips-core | 唯一写权威 |
| 作品/IP | soloips-core | 唯一写权威 |
| 会话/任务 | DSH（经 adapter） | 由 DSH 管理 |
| 工具/资源 | DSH（经 adapter） | 由 DSH 管理 |

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
