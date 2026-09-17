# SoloIPs 技术架构

> 快速入口。详细章节见 `technical/` 子文档。

## 阅读契约

| 字段 | 值 |
|---|---|
| 身份 | SOLO-TECH-ARCH |
| 目的 | 包边界、装配机制、状态归属、验收设计 |
| 范围 | 交付形态与包边界；装配；状态；验收 |
| 依据 | [产品架构](architecture.md)、[代码规范](governance/code-development-standard.md) |
| 变更权 | architecture-owner；重大变更须用户确认 |

## 架构决策（ARCH-D01–08）

| ID | 决定 |
|---|---|
| ARCH-D01 | 独立技术架构正文，产品目标在 architecture.md |
| ARCH-D02 | 5 包边界：bundle、core、adapter-dsh、web、tools-pv |
| ARCH-D03 | 生产/验证/恢复各用独立 DSH_HOME |
| ARCH-D04 | profile 名 soloips，patchReload: startup |
| ARCH-D05 | 上游 API 失败停线（ORG-13） |
| ARCH-D06 | 用原生任务系统登记工作 |
| ARCH-D07 | S0 优先：真实安装候选 + 写保护验证 |
| ARCH-D08 | Web/3D 双界面架构，共享 Zustand 状态，通过 DSH Client Slots 扩展（〔已取代〕2026-09-17：自研双版本推迟，V1 界面改为复制官方 Web 插件 fork 改造，见 [`docs/decisions/web-ui-fork.md`](decisions/web-ui-fork.md)） |

## 包结构

```
packages/                    # 目录名不带前缀；package 名才是 soloips-*
├── bundle/                  # soloips-bundle：装配声明
├── adapter-dsh/             # soloips-adapter-dsh：DSH 适配（7 端口，team 为 fail-closed 占位）
├── core/                    # soloips-core：通用业务状态包（组织结构、文档模型）
├── web/                     # soloips-web：界面层（V1 = 复制官方 Web 插件 fork 改造版；官方 DSH 源码不动）
└── tools-pv/                # soloips-tools-pv：业务插件（PV 制作，S1 创建，用户/SoloIPS开发团队维护）
```

详细：见 [packages.md](technical/packages.md)

### UI 双版本架构（ARCH-D08）

> **〔已取代〕2026-09-17**：自研 Web+3D 双版本设计**推迟**（〔待决〕解冻时点）；V1 界面改为**复制官方 Web 插件 fork 改造为 `soloips-web`**。下表保留为历史设计稿，见 [`docs/decisions/web-ui-fork.md`](decisions/web-ui-fork.md)。

| 组件 | 技术栈 | 说明 |
|---|---|---|
| **Web 版本** | React + Zustand | 主界面，创建/管理公司、部门、团队 |
| **3D 版本** | React Three Fiber + Three.js | 科幻风格可视化，增强沉浸感 |
| **状态共享** | Zustand + DSH Slots | 双版本共享同一业务状态 |

详细：见 [docs/architecture-complete.md](architecture-complete.md)

## 装配机制

```
bundle patches → profile patch → home patch → launcher patch
```

详细：见 [assembly.md](technical/assembly.md)

## 状态归属

| 包 | 职责 |
|---|---|
| soloips-core | 通用业务状态（组织结构、文档模型） |
| soloips-adapter-dsh | DSH 能力适配（无业务状态） |
| soloips-tools-pv | 业务插件状态（PV 任务等，由插件自行管理） |
| soloips-web | 只读投影 |

详细：见 [state.md](technical/state.md)

## 失败与恢复

- 单包失败 ≠ 整体失败
- 上游 API 失败：首次停线 + 通知
- 恢复须用户明确指令

详细：见 [failure.md](technical/failure.md)

## 验收场景

S0 验收目标：
1. 公司/部门/员工能建立
2. 工具可调用
3. 重启后可继续
4. 写权独占

详细：见 [acceptance.md](technical/acceptance.md)

## 术语

核心术语见 [glossary.md](technical/glossary.md)

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-17 | 拆分模块化文档结构 |
| 2026-09-17 | 按用户确认的产品准则统一：包结构图改为实际目录名；adapter 端口数更正为 7（shared.ts 非端口） |
| 2026-09-17 | 写入 V1 UI 决策：ARCH-D08 与 UI 双版本节标〔已取代〕、web 行改为 fork 改造定位，均指向 `docs/decisions/web-ui-fork.md` | 文档智能体 |
