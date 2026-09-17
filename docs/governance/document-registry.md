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

## 设计产物（docs/prds/）

> **本类文档是设计阶段的产物，不是权威正文**：它们给设计建议、读源事实与差距清单，**不改变** `data-contract.md` 的权威地位（各文阅读契约均已自述此边界）。登记用途是让后续切片能找到依据与过程留痕；结论落地后以对应权威正文为准。

| 文档 | 路径 | 用途 | 负责人 |
|---|---|---|---|
| **系统助理 PRD** | `docs/prds/system-assistant-m01-prd-v1.0.md` | `SOLO-PRD-SA-01`；M0.1 系统助理产品需求、验收标准、执行阶段（草稿，含未解缺口） | architecture-owner |
| **系统助理 UI 设计** | `docs/prds/system-assistant-ui-design-v0.1.md` | `SOLO-UI-SA-01`；链式引导旅程、界面落点、结构化卡片、状态机、失败边界 | architecture-owner |
| **系统助理后端设计** | `docs/prds/system-assistant-backend-design-v0.1.md` | `SOLO-SA-BE-01`；core/adapter 现状盘点、后端模型、对话流路径、BE-0~BE-7 最小切片、C-1…C-9 处置记录 | architecture-owner |
| **组织全景后端设计** | `docs/prds/organization-full-backend-design-v0.1.md` | `SOLO-ORG-FULL-BE-01`；智能编组、入团自动三步、子公司、任务领取的领域与服务面设计（Q-N1/N2/N3/N5、R-1…R-7） | architecture-owner |
| **组织全景 UI 设计** | `docs/prds/organization-full-ui-design-v0.1.md` | `SOLO-UI-ORG-01`；组织生命周期界面覆盖矩阵、slot 席位映射、§9b 工具名与两条命名面推导表 | architecture-owner |
| **DSH 设计语言底册** | `docs/prds/dsh-design-language-v0.1.md` | `SOLO-UI-DL-01`；fork 侧 DSH 界面事实（token、组件、布局、强调色纪律、i18n、品牌位 BR1–BR7）——主题一致性权威 | architecture-owner |

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
| **权威数据契约** | `docs/design/data-contract.md` | **唯一权威数据模型（含实现状态表、三层配额、S0 临时账户绑定例外）**。2026-09-18 起另含：§2.2 六新实体（Team 四字段 `function`/`functionSource`/`confirmedBy`/`leadAppointmentId`、TeamSkillAssignment（五态）、TeamMcpIntent、team_norm、NormAck（`ackId` 主键、append-only）、AssemblyEvidence（不变量 INV-AE-1））、§2.1.1 Team 生命周期协议（P-7 禁物理删除、P-8 悬挂组长处置、P-9 三步成团协议）、§2.1 SoloipsOperationRecord（schemaVersion）、§2.1.2 MCP Intent 状态迁移矩阵、§2.3 `scope` 严格三分支（不猜）+ 先可选政策、§2.4 Q-N5/Q-N5b 子公司与总助理裁定、§2.5 20 项工具名、§3.3 权限判定优先级、§4.3 M0.1 配额形态、§6.2 切片候选登记（BE-8）、§2.4.1 SA-01 无总助理显式状态、§2.4.3 SA-04 系统助理职责边界（防隐形 CEO）、§3.1 SA-02 Host 半可信声明、§3.4 SA-03 员工循环 capability gate（四层检查） | architecture-owner |
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
   - **产品定位（AI 公司元框架：用户供 runtime+资源／框架供结构+身份+任务协议／员工自主驱动）：`docs/architecture.md` §1.1**
   - **工具名与两条命名面（下划线模型面 vs 点号 Remote 面）：`docs/design/data-contract.md` §2.5**
   - **DSH 界面事实（token/组件/布局/强调色纪律/i18n/品牌位）：`docs/prds/dsh-design-language-v0.1.md`**

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
