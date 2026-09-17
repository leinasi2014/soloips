# SoloIPs 智能体工作入口

> 本文件是 SoloIPs 项目的操作规范，简化版。面向人类和 AI 智能体。

## 身份

| 字段 | 值 |
|---|---|
| 项目 | SoloIPs |
| 框架 | DSH（DeepSeek Harness）插件 + profile 组合交付 |
| 当前阶段 | S0 多公司基础 / M0.1（详见 [`docs/design/data-contract.md` §0](../docs/design/data-contract.md#0-实现状态对照代码事实2026-09-17)） |
| 负责人 | product-owner |

## 快速入口

| 任务类型 | 读这个 | 得到什么 |
|---|---|---|
| **任何开工** | `docs/architecture-summary.md` | **快速参考：包职责、关键决策、开发里程碑** |
| **写代码前必读** | `docs/design/data-contract.md` | **权威数据模型、权限链路、配额原子操作** |
| **写代码** | `docs/governance/code-development-standard.md` | 怎么写、怎么验证 |
| **多智能体开发** | `docs/governance/multi-agent-development.md` | **团队配置、任务拆分、Agent 派发、开发流程** |
| 写文档 | `docs/governance/doc-format.md` | 怎么标注、怎么引用 |
| 完整架构 | `docs/architecture-complete.md` | UI双版本、多公司模型、总助理、日志系统 |
| 查装配规则 | `docs/technical/assembly.md` | bundle/patch/profile 怎么组合 |
| 查架构决策 | `docs/decisions/` | 哪些是已确认决定 |
| 环境与工具 | `docs/operations/environment-handoff.md` | 本机路径、版本、命令 |

## 授权边界

### 什么是任务授权

用户发布任务 → 形成授权包（含 goal、scope、write_scope）。

**Envelope 内自主执行**：拆解任务、改文件、选方案、跑测试。

**Envelope 外必须暂停确认**：

1. 超出任务目标
2. 超出允许目录
3. 修改组织规则（`AGENTS.md`、Skill、公共工作流）
4. 修改权限系统
5. 修改身份体系
6. 不可逆破坏操作
7. 对外发布（push、PR、发布）
8. 需要新的业务决策

### 判定规则

- 环境状态变化 **不能** 创建或扩大授权
- 用户未反对 **不等于** 同意
- 历史授权 **只覆盖原任务范围**

## 包结构

```
packages/                    # 目录名不带前缀；package 名才是 soloips-*
├── bundle/                  # soloips-bundle：装配声明，patch 覆写顺序
├── adapter-dsh/             # soloips-adapter-dsh：DSH 适配层（7 端口，team 为 fail-closed 占位）
├── core/                    # soloips-core：通用业务状态包（组织结构、文档模型、公司层级）
├── web/                     # soloips-web：界面层（Web + 3D 双版本；⚠️ 当前为包边界骨架，无实现代码）
└── tools-pv/                # soloips-tools-pv：业务插件（PV 制作，S1 创建，由用户/SoloIPS开发团队维护）
```

**包职责规则**：
- `core` 是组织结构和文档模型的写权威；业务插件（如 tools-pv）各自持有领域写权威
- 禁止跨包相对导入（用 `exports` 和服务契约）
- 新增持久状态包需满足：自有 schema、独立写权威、独立升级节奏
- **UI 双版本**：Web + 3D 通过 DSH Client Slots 扩展，共享状态

## 公司生态架构

SoloIPs 采用**三层公司层级**：

| 层级 | 类型 | 说明 | 持有者 |
|------|------|------|--------|
| **第一层** | 平台公司 | SoloIPs 品牌方，拥有所有运营子公司 | SoloIPS 官方 |
| **第二层** | 运营子公司 | 漫画网站、视频网站、音乐网站等业务平台 | SoloIPS 官方 |
| **第三层** | 用户公司/子公司 | 用户创建的 AI 公司及其子公司 | 用户 |

**公司类型**：`platform` | `operation` | `enterprise` | `subsidiary`

**权益配额**：按顶层公司计算，控制子公司总数
- Free：1个用户公司 + 0个子公司
- Pro：1个用户公司 + 3个子公司
- Enterprise：无限制

**内容发布**：用户 IP 作品 → 投稿到 SoloIPs 运营子公司 → 面向观众发布

## 代码规范

### 必须遵守

- TypeScript + ESM，两空格缩进
- `strict` 模式，类型必须显式
- 禁止 `any`，禁止 `@ts-ignore`
- 异步操作必须有错误处理
- 外部 API 失败：首次停线、通知用户、不自动重试

### 验证入口

```bash
pnpm run format:check   # 格式化检查
pnpm run lint           # 静态检查
pnpm run typecheck      # 类型检查
pnpm run test           # 单元测试
pnpm run build          # 构建
```

### 提交规范

```
<type>(<scope>): <描述>

type: feat | fix | docs | test | refactor | chore
```

## 文档规范

### 标注系统（简化版）

只用 **决策维度**：

| 标签 | 含义 |
|---|---|
| 〔需求〕 | 用户明确的需求，必须有来源 |
| 〔约束〕 | 既有工程约束，受委托技术决定 |
| 〔建议〕 | 设计建议，可根据情况取舍 |
| 〔待决〕 | 未决定，需要补充信息 |
| 〔已取代〕 | 被新决定替代 |

**标注规则**：
- 复合陈述拆分：只要一部分是建议，就不能整体标为需求
- 建议内的"必须"只描述该建议成立的条件，不是命令

### 引用规范

- 稳定 ID：需求/决策用 `SOLO-01`、`ARCH-D01` 等格式
- 文档间引用：用仓库相对路径或稳定 ID
- 源码事实：必须写 `来源 + 版本/日期 + 边界`

### 文档入口

- 每份实质性文档开头加「阅读契约表」：身份、目的、范围、依据、变更权
- 短文档一句话契约即可
- 负责人和路径在 `docs/governance/document-registry.md` 集中维护

## Git 工作流

```
开发分支 → PR → review → 合并
         ↓
      CI 门禁（format/lint/typecheck/test/build）
```

**规则**：
- 禁止直接推 `main`
- PR 必须关联 Issue
- 合并前必须通过 CI
- 提交信息必须符合 commit 规范

## 项目红线

1. **上游 API 失败**：鉴权/额度/连接错误首次出现 → 立即停线、通知用户
2. **凭据保护**：不经用户明确授权，不执行凭据操作
3. **证据分层**：安装 ≠ 调用、构建 ≠ 验收、源码 ≠ 运行版本
4. **用户决定**：产品目标与验收权归用户，智能体只执行和反馈

## 变更历史

| 日期 | 变更 | 变更者 |
|---|---|
| 2026-09-17 | 重构精简版：合并多文档、减少标注维度、简化元数据 | 主会话 |
| 2026-09-17 | 新增多智能体开发入口 | 主会话 |
| 2026-09-17 | 按用户确认的产品准则统一文档：DSH 更正为 DeepSeek Harness；当前阶段更新为 S0 多公司基础/M0.1；包结构图改为实际目录名 | 主会话 |
