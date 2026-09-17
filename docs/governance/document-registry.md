# SoloIPs 文档注册表

> 简化版：只记录路径和用途，元数据最小化。

## 稳定权威文档

| 文档 | 路径 | 用途 | 负责人 |
|---|---|---|---|
| 项目入口 | `AGENTS.md` | 操作规范、快速入口、授权边界 | product-owner |
| 产品架构 | `docs/architecture.md` | 产品目标、首版范围、需求来源 | architecture-owner |
| 技术架构 | `docs/technical-architecture.md` | 包边界、装配机制、状态归属、验收设计 | architecture-owner |
| 代码规范 | `docs/governance/code-development-standard.md` | 代码编写、验证、交付规则 | engineering-owner |
| 文档格式 | `docs/governance/doc-format.md` | 标注系统、引用规范、文档结构 | product-owner |
| 项目绑定 | `docs/governance/project-binding.yaml` | 团队成员、交付目标、验收标准 | product-owner |

## 专题决策

| 文档 | 路径 | 用途 | 负责人 |
|---|---|---|---|
| 官方 Team 复用 | `docs/decisions/official-team-and-dsh-fork.md` | 官方 Team / DSH fork 维护规则 | architecture-owner |
| 重构需求基线 | `docs/refactoring/README.md` | 公司/部门/员工/作品需求 | product-owner |

## 环境与操作

| 文档 | 路径 | 用途 | 负责人 |
|---|---|---|---|
| 环境交接 | `docs/operations/environment-handoff.md` | 本机路径、版本、命令入口 | engineering-owner |
| 开发迭代 | `docs/operations/development-iterations.md` | 版本管理、开发环境配置 | engineering-owner |

## 开发技能

| 文档 | 路径 | 用途 |
|---|---|---|
| DSH 文档导航 | `.agents/skills/dsh-plugin-development/SKILL.md` | 官方文档查询方式 |
| 团队管理 | `.agents/skills/team-delivery-leadership/SKILL.md` | 任务分配、协作、验收（已简化） |

## 设计文档

| 文档 | 路径 | 用途 |
|---|---|---|
| r002 设计候选 | `docs/design/r002/README.md` | 当前开发批次的设计文档 |

## 变更规则

1. 新增文档：在本表登记路径和用途
2. 文档移动或删除：更新本表
3. 不需要完整元数据（变更权、验证方式等）：这些信息在文档本身，不在注册表重复

## 简化说明

相比原 `document-registry.yaml`：
- 去掉 `sourceAuthority`、`refreshPolicy`、`expiryPolicy` 等元数据
- 去掉 `validation`、`mutationAuthority` 等字段
- 只保留：路径、用途、负责人（用于通知）
- 文档内容本身承载权威，引用方直接读文档

**理由**：没有自动刷新工具就不维护需要刷新的元数据。文档间引用靠直接读取，不靠注册表追踪。
