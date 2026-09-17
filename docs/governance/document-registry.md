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
| 开发流程 | `docs/governance/development-plan.md` | 里程碑规划、PR 流程、风险管控 | architecture-owner |
| **多智能体开发规范** | `docs/governance/multi-agent-development.md` | **团队配置、Agent 派发、任务拆分、通用开发流程** | product-owner |

## 专题决策

| 文档 | 路径 | 用途 | 负责人 |
|---|---|---|---|
| 官方 Team 复用 | `docs/decisions/official-team-and-dsh-fork.md` | 官方 Team / DSH fork 维护规则 | architecture-owner |
| **V1 界面路线** | `docs/decisions/web-ui-fork.md` | **V1 界面 = 复制官方 Web 插件 fork 改造为 soloips-web；装配替换、上游同步、自研双版本推迟** | architecture-owner |
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

| 文档 | 路径 | 用途 | 负责人 |
|---|---|---|---|
| **架构概览** | `docs/architecture-summary.md` | 快速参考：包职责、关键决策、里程碑 | architecture-owner |
| **完整架构设计** | `docs/architecture-complete.md` | 多公司模型、总助理、日志系统（§4.2/§5 的 UI 双版本设计已标〔已取代〕，V1 界面见 web-ui-fork.md） | architecture-owner |
| **权威数据契约** | `docs/design/data-contract.md` | **唯一权威数据模型（含实现状态表、三层配额、S0 临时账户绑定例外）** | architecture-owner |
| **多公司架构** | `docs/design/multi-company-organization.md` | 〔已取代〕历史稿；实现以 data-contract.md 为准 | architecture-owner |
| **多公司实现** | `docs/design/multi-company-implementation.md` | 〔已取代〕历史稿；实现以 data-contract.md 为准 | architecture-owner |
| **弊端与优化** | `docs/design/tradeoffs-and-optimizations.md` | 每个设计的潜在弊端+优化方案对照表 | architecture-owner |
| **运营服务接口（预留）** | `docs/design/operation-services.md` | 用户认证、订阅财务、模型计费接口契约（后期实现） | architecture-owner |

> **注**：`multi-company-organization.md` 和 `multi-company-implementation.md` 中的冲突内容已被 `data-contract.md` 取代，且两文顶部已标〔已取代〕；实现时应以 `data-contract.md` 为准。

## 技术专题文档

| 文档 | 路径 | 用途 | 负责人 |
|---|---|---|---|
| 技术架构 | `docs/technical-architecture.md` | 包边界、装配机制、状态归属、验收设计 | architecture-owner |
| 包结构 | `docs/technical/packages.md` | 包清单、端口映射、目录结构 | architecture-owner |
| 状态归属 | `docs/technical/state.md` | 谁拥有哪个事实 | architecture-owner |
| 装配机制 | `docs/technical/assembly.md` | bundle/patch/profile 组合 | architecture-owner |
| 失败语义 | `docs/technical/failure.md` | 失败与停线边界 | architecture-owner |
| 验收设计 | `docs/technical/acceptance.md` | 验收出口与证据分层 | architecture-owner |
| 术语表 | `docs/technical/glossary.md` | 术语与缩写 | architecture-owner |

## 变更规则

1. 新增文档：在本表登记路径和用途
2. 文档移动或删除：更新本表
3. 不需要完整元数据（变更权、验证方式等）：这些信息在文档本身，不在注册表重复
4. **单一正文原则（2026-09-17 文档冲突审查后设立）**：下列事实只允许在唯一正文维护，其余文档一律引用、不得复述为第二口径——
   - 里程碑定义：`docs/design/data-contract.md` §6.1
   - 三层配额与数据模型：`docs/design/data-contract.md` §2
   - 实现状态：`docs/design/data-contract.md` §0
   - adapter 端口清单：`docs/technical/packages.md`
   - 包目录结构（当前实际）：`docs/technical/packages.md`
   - V1 界面路线（官方 Web fork 改造、装配替换、上游同步、自研双版本推迟）：`docs/decisions/web-ui-fork.md`

   新增同题复述视为冲突，按 `docs/refactoring/README.md` 的「更正唯一正文」规则处理。

## 历史引用迁移

| 旧引用 | 现状 | 现行指向 |
|---|---|---|
| `docs/governance/document-registry.yaml` | 文件不存在（实为 `.md`） | `docs/governance/document-registry.md` |
| `docs/governance/agent-readable-documentation.md` | 文件不存在 | `docs/governance/doc-format.md` |
| `multi-company-*.md` 的数据模型与配额 | 已被取代 | `docs/design/data-contract.md` |
| 「自研 Web+3D 双版本」UI 设计（`architecture-summary.md`、`architecture-complete.md` §4.2/§5、`technical/packages.md`、`technical-architecture.md`） | 推迟，V1 改走官方 Web fork 改造 | `docs/decisions/web-ui-fork.md` |

## 简化说明

相比原 `document-registry.yaml`：
- 去掉 `sourceAuthority`、`refreshPolicy`、`expiryPolicy` 等元数据
- 去掉 `validation`、`mutationAuthority` 等字段
- 只保留：路径、用途、负责人（用于通知）
- 文档内容本身承载权威，引用方直接读文档

**理由**：没有自动刷新工具就不维护需要刷新的元数据。文档间引用靠直接读取，不靠注册表追踪。
