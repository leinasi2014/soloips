# SoloIPs 研发 Profile 模板

| 阅读契约 | 内容                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 身份     | `SOLO-DEV-PROFILE`；研发实例的 Agent preset 配置与验证入口                                                                                                                                                         |
| 目的     | 让研发主智能体及其官方 Team 成员获得项目规范、研发工具与一致的协作接口                                                                                                                                             |
| 范围     | 每个独立研发版本中的 `soloips-development` preset；插件选型、实例数据根与版本交接复用项目运维规范                                                                                                                  |
| 决策状态 | 〔约束〕落实用户要求的“官方 DSH + 官方 Teams 开发 SoloIPs”；不声称已实现 SoloIPs 公司业务门禁                                                                                                                      |
| 证据范围 | 来源声明见 `upstream.json`；无密钥验证检查实际模型输入和真实 Team 创建，不替代真实供应商、Web 界面、插件或业务验收                                                                                                 |
| 依据     | [官方协作决定](../../docs/decisions/official-team-and-dsh-fork.md)、[代码规范 DEV-04/11](../../docs/governance/code-development-standard.md)、[官方文档导航](../../.agents/skills/dsh-plugin-development/SKILL.md) |
| 变更权   | 随目标官方版本复核来源差异，修改候选并验证后安装；运行中实例不原地改写                                                                                                                                             |

## 装配契约

正式研发实例按官方顺序装配 `dsh-base`、`dsh-web-app`、`dsh-experimental-agent-team-profile`、`dsh-experimental-agent-team-web-profile`，然后安装已选择的社区插件与本目录配置。运行 Profile 采用 `patchReload: startup`。

每个独立 `DSH_HOME` 执行以下配置步骤：

1. 把 `agent-presets/soloips-development/` 整个目录复制到 `DSH_HOME/.agent-presets/soloips-development/`，保留来源许可证。
2. 把本目录 `cordis.patch.yml` 的 `agent-presets` 覆盖合入该版本 Profile 的 patch；若已有同 ID 覆盖，在原行合并完整配置，避免多个来源反复覆盖。
3. 复制经批准的供应商模板到该版本的 `DSH_HOME/settings.yaml`。将其中 `agent-presets.default` 设为 `soloips-development`；保留供应商值，清除旧 swarm 配置。不要在本仓库保存密钥。
4. 从真正的研发源码目录启动会话，核对界面所选 preset 与会话实际工作目录。每个版本的 home `AGENTS.md` 提供实例管理入口；项目 `AGENTS.md` 提供代码和文档规范。复制安装目录不能代替设置正确工作目录。

本目录 patch 同时关闭自动选择 OS 目录对话框的入口，显式装配官方 browse Host 与 Client，保证在浏览器内选择工作区。外部社区 bundles 须安装在 Profile 自身的依赖树并锁定，不能只在宿主 runtime 的并列包里安装；详细版本管理见 [DEVENV](../../docs/operations/development-iterations.md)。

`includeShippedRoot: false` 使普通 `standard` 等预设不出现在这一套研发实例中，避免误选回旧的委派工具。`includeUserRoot: true` 从实例自己的 home 发现本模板；这不隔离同一 Team 成员的文件写入，也不阻止获授权的用户创建其他 preset。

## 为什么需要一个研发 preset

官方 Web Team 文档明确记录：现有 Web `standard` / `ptc` / `cordis` 在 preset scope 中继续安装普通 subagent 工具，顶层 Team profile 不能覆盖这些行。因此本模板复制官方 `standard` 的完整 composition，移除以下六行，保留官方其余工具和 `isolate` 结构：

- `tool-subagent-control`
- `tool-subagent-list-agents`
- `tool-subagent`
- `tool-subagent-fork`
- `tool-subagent-codex`（原本禁用）
- `tool-subagent-claude-code`（原本禁用）

Team 工具仍由官方 Host 层 `dsh-experimental-tool-agent-team` 在真实成员的 scope 中安装。preset 不复制 Team 实现，也不再次装载该插件。文件、Shell、Skill、工作流与 AGENTS 加载均沿用官方工具。Windows 使用 `pwsh`，其他平台使用 `bash`。

官方 Team 要求仅在用户明确要求使用 Team 或成员时创建 teammate；本项目的研发团队请求满足这一范围，具体并行仍按项目写权和独立复核规范执行。官方 `writeScopes` 是冲突提示，不能当作文件锁；`workflow` 的一次性子任务仍保留，不将其称为持久 Team 成员。

来源正文（精确基线由 `upstream.json` 维护）：

- [官方 standard preset](https://github.com/deepseek-ai/deepseek-harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/packages/preset/agent-presets/presets/standard/agent.cordis.yml)
- [官方 Web Team 的 preset 限制](https://github.com/deepseek-ai/deepseek-harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/packages/experimental/agent-team-web-profile/README.md#known-limitations-and-deferred-work)
- [官方 preset 发现、默认值与 scope](https://github.com/deepseek-ai/deepseek-harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/packages/preset/agent-presets/README.md)
- [官方项目规范加载](https://github.com/deepseek-ai/deepseek-harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/packages/context/agent-instructions/README.md)

## 验证与升级

目标官方 checkout 已完成 Host 构建后，从 SoloIPs 根目录执行：

```powershell
node profiles/development/verify-preset.mjs $env:DSH_FORK_CHECKOUT
```

核验已经安装的版本时，把其 `runtime` 目录作为第二参数。官方源码仍用于核对 preset 来源哈希和 Web masking；CLI 与包解析改用该版本已安装的工件：

```powershell
node profiles/development/verify-preset.mjs $env:DSH_FORK_CHECKOUT "$env:SOLOIPS_DEVS_ROOT/versions/<version>/runtime"
```

该入口建立一次性 home 和工作目录，仅用确定性内存 LLM fixture；通过官方已构建 CLI、实际 Loader、公共 Agent preset API、Agent Team / subagent / Session 执行。它复用目标 Web bundle 的 agent-plane masking，但不启动 HTTP/Web UI。检查如下：

- Lead 和真实 spawned teammate 的模型工具均包含 Team 九个工具及文件、平台 Shell、Skill、workflow；无重复工具名称和 `subagent*`。
- home 与项目 `AGENTS.md` 的两个测试标记都实际进入两者模型输入。
- Lead 通过真实 `pwsh`（Windows）或 `bash` 工具执行一次仅输出固定标记的命令，校验实际工具结果没有错误、超时或非零退出标记；不打开交互窗口。
- 成员由官方 `spawn` Provider 创建并结束；Lead 实际调用 `wait_agent` 和 `team_task_list`。
- 进程退出非零或无成功标记均视为失败；一次性数据清理后退出。fixture 文件只供该检查使用，不能装进研发实例。

上游升级时按 SOLO-TEAM-11 重新 fetch，并对照新版本官方 `standard` 和 Web masking 的实际差异。官方提供等价 Team-aware preset 后，先验证工具、项目规范与继承路径，再撤销这份复制。不能只更新 `upstream.json` 的 SHA 后沿用旧 composition；复制 preset 不会随 DSH 工件自动升级。
