# SoloIPs 智能体工作入口

> 本文件是 SoloIPs 项目的操作规范，简化版。面向人类和 AI 智能体。

## 身份

| 字段 | 值 |
|---|---|
| 项目 | SoloIPs |
| 框架 | DSH（Claude Harness）插件 + profile 组合交付 |
| 当前阶段 | S0（运行接通与恢复） |
| 负责人 | product-owner |

## 快速入口

| 任务类型 | 读这个 | 得到什么 |
|---|---|---|
| 任何开工 | `docs/architecture.md` + `docs/technical-architecture.md` | 做什么、怎么做 |
| 写代码 | `docs/governance/code-development-standard.md` | 怎么写、怎么验证 |
| 写文档 | `docs/governance/doc-format.md` | 怎么标注、怎么引用 |
| 查包边界 | `docs/technical-architecture.md` §5 | 哪个包负责什么 |
| 查装配规则 | `docs/technical-architecture.md` §6 | bundle/patch/profile 怎么组合 |
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
packages/
├── soloips-bundle/          # 装配声明，patch 覆写顺序
├── soloips-adapter-dsh/     # DSH 适配层
├── soloips-core/            # 唯一业务状态包（公司、作品、IP）
├── soloips-web/             # 界面层（可替换）
└── soloips-tools-pv/        # S1 加入（制作工具）
```

**包职责规则**：
- `core` 是唯一业务写权威，其他包只能读投影或经服务请求
- 禁止跨包相对导入（用 `exports` 和服务契约）
- 新增持久状态包需满足：自有 schema、独立写权威、独立升级节奏

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

| 日期 | 变更 |
|---|---|
| 2026-09-17 | 重构精简版：合并多文档、减少标注维度、简化元数据 |
