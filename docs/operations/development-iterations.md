# SoloIPs 开发迭代环境

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-DEVENV`；开发运行版本与主智能体操作规程 |
| 目的 | 用一版可复现的 DSH 开发下一版 SoloIPs，并保留上一版的工件和独立状态 |
| 范围 | `SOLOIPS_DEVS_ROOT` 下的开发实例、默认配置、插件模板与迭代验收 |
| 决策状态 | 〔约束〕用户要求独立迭代运行、官方 DSH + Team、默认供应商配置与所选八项插件；本文收敛其管理方式 |
| 证据范围 | 本文规定操作与验收；具体版本、路径、哈希、进程及通过结果见版本清单与 ENV-01 本机记录 |
| 依据 | [官方 Team 决策](../decisions/official-team-and-dsh-fork.md)、[代码规范](../governance/code-development-standard.md)、[环境交接](environment-handoff.md)及用户本次配置要求 |
| 变更权 | 按[注册表](../governance/document-registry.yaml)维护；主智能体执行已授权实例的配置与验证，真实业务验收由用户决定 |

## DEVENV-01：目录与版本身份

〔约束〕运行目录与源码 checkout 分开。主智能体在创建每一版前分配唯一版本号、端口和数据根，检查目的目录不存在；不得覆盖旧版。以下为布局契约，具体值按 ENV-02 定位：

```text
SOLOIPS_DEVS_ROOT/
  .dsh/settings.yaml             # 用户提供的初始化来源；不是运行 home
  AGENTS.md                     # 本机操作入口，指向本仓库规则
  versions/<version>/
    artifacts/                  # DSH、Team、社区和已交付 SoloIPs 的固定 tgz
    artifacts.json              # 包身份、来源基线与 SHA-256
    runtime/                    # 由固定工件安装；package.json + package-lock.json
    home/
      settings.yaml             # 每版独立复制的默认供应商配置
      .agent-presets/            # 对应版本的开发预设
      profiles/soloips/          # bundles + startup patch + 外部插件自身依赖与锁
      ...                       # 该版独占的 Session、存储、凭据等运行数据
    agents/                     # 该实例的 DSH_AGENTS_HOME
    logs/                       # 启停与检查日志
    release.json                # 启动身份与不可变输入哈希
    process.json                # 本启动器记录的 PID、创建时间与归属
```

`runtime` 必须由工件安装，不以源码 `link:` 或工作区 `node_modules` 充当冻结发布。运行 DSH 不直接指向下一版开发中的 Host/Client 构建目录。源码修改在 `release.json.workingDirectory` 指定的 checkout 中完成；有写冲突时按 DEV-12 建独立 worktree。

每个版本使用自己的 `DSH_HOME` 和 `DSH_AGENTS_HOME`，Profile 名可同为 `soloips`。复制配置不复制 Session、团队任务、缓存、插件状态或凭据文件；凭据仅从用户已授权的来源迁入，并按字段核对，禁止进入 Git、日志与模型上下文。`agent-swarm` 不进入任何新实例的 settings、patch 或 bundle。

## DEVENV-02：初始化模板与插件组合

主智能体先执行 SOLO-TEAM-11 的官方同步检查，再以该候选的官方完整构建与打包流程产生工件。使用官方 base、Web、Agent Team Host 与 Team Web 四层，按[开发预设模板](../../profiles/development/README.md)装配文件、命令、Skill、项目指令与官方 Team 工具。SoloIPs 包只有具备真实入口与相应验收时才加入；空骨架不登记为已可用业务插件。

用户选择的社区插件是以下八项。每版记录精确包版本、下载完整性、SHA-256 与安装锁，禁止在冻结实例中 `update --latest`：

先安装 `runtime` 的固定工件依赖，再在 Profile 内安装这八个外部 bundles 的精确 tarball 并保存 Profile 锁。仅将插件放在宿主安装根不能保证 Profile 的插件导入。重建按各自锁执行，官方生成的模块代理只允许指向该版本自身的固定 runtime；不得借代理共享另一个版本或源码安装。

| 包名（均为 `@linxin666/` scope） | 用途 | 默认边界 |
| --- | --- | --- |
| `dsh-client-ui-model-capabilities` | 模型能力配置 | 修改的是当前实例供应商配置，变更后重新验证 |
| `dsh-client-ui-skill-explorer` | Skill 查阅与维护 | 可写真实 Skill 文件，按工作目录授权管理 |
| `dsh-client-ui-session-id` | 展示 Session ID | 不据 ID 展示推断恢复通过 |
| `dsh-client-ui-git-graph` | Git 图谱与分支操作 | 有活动写者时不通过界面切换其 checkout |
| `dsh-client-ui-web-ui-settings` | 插件设置入口 | 不从界面改写冻结工件或绕过版本流程 |
| `dsh-usage` | 用量统计 | 须先验证供应商探测的停线行为；存在失败后自动轮询时安装但关闭，统计也不宣称启用 |
| `dsh-ssh` | SSH 工具与界面 | 初始不导入主机或自动连接；调用前核实重试语义，禁止将可能重放的命令用于不可重复的发布/迁移 |
| `dsh-remote-web-ui` | 设备配对与远程 Web | 初始仅 loopback，关闭自动隧道与 relay；LAN/公网入口按具体目标另行配置 |

已选包的发布工件可能与仓库 dev 分支不同。兼容结论以实际 tarball 为依据。社区客户端存在外部查询、心跳或自更新入口时，记录实际边界；不得将自动化浏览器未发请求推断为普通浏览器也不会请求。

〔约束〕初始化时将来源 `settings.yaml` 复制到每版 **home 根**，按版本模板切换默认 preset，保留供应商与默认模型配置。不要把 `settings.yaml` 放入 Profile 目录并声称 DSH 会自动读取。每版随后独立变更，更新模板不回写已运行的旧版。

Profile 使用 `patchReload: startup`。关闭官方 `llm-retry` 自动重试入口，并核对所用 SDK 的内置重试。全团队首错停线仍须按 DEV-07 验证：关闭一次请求的重试不能证明其他成员已被自动停止，AGENTS 指令也不构成 Host 强制控制。

## DEVENV-03：主智能体的迭代操作

1. **定位**：读取本规范、当前版本 `release.json` 与本机记录；检查 Git 改动、当前任务和实例进程，确定开发的下一版目录及独占写面。
2. **准备**：按 SOLO-TEAM-11 获取官方最新代码，保留定制补丁，运行受影响检查；记录上游 SHA、候选 SHA、源码差异、工件哈希与插件锁。
3. **构建下一版**：从模板生成新的 home/Profile，安装固定工件；复制获准的配置与凭据，不克隆在写的 home。旧版继续服务，源码变化不热更新其运行工件。
4. **验证**：运行 DEVENV-04；失败保留候选与证据，在该候选修复。真实上游错误立即停止受影响后续动作并通知用户；无用户恢复指令不重试或换路由。
5. **交接**：独立复核后记录版本状态、适用范围和未证项。技术检查通过可交付开发候选；将其认定为用户业务稳定版仍需用户验收。切换入口必须确认在途任务与具体切换授权。

日常启动、状态与停止通过 [runtime.ps1](../../scripts/development/runtime.ps1) 执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:SOLOIPS_ROOT/scripts/development/runtime.ps1" -Action verify -VersionRoot "$env:SOLOIPS_DEVS_ROOT/versions/<version>"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:SOLOIPS_ROOT/scripts/development/runtime.ps1" -Action start -VersionRoot "$env:SOLOIPS_DEVS_ROOT/versions/<version>"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:SOLOIPS_ROOT/scripts/development/runtime.ps1" -Action status -VersionRoot "$env:SOLOIPS_DEVS_ROOT/versions/<version>"
```

上述命令中的 `$env:SOLOIPS_ROOT` 与 `$env:SOLOIPS_DEVS_ROOT` 是 PowerShell **环境变量**引用；若写成裸 `$SOLOIPS_ROOT`，PowerShell 会按未定义的 PowerShell 变量展开为空串，命令将指向错误路径（甚至静默通过）。符号名按 [ENV-02](environment-handoff.md) 解析。

上述执行策略参数只作用于本次 PowerShell 进程，不修改系统策略。脚本只管理自己登记的进程，并校验路径、入口、PID 与创建时间；这不是覆盖任意启动器的跨进程 fencing。`stop` 使用 Windows 终止进程，执行前必须结束在途工作，不将其称为已验证的优雅排空。脚本拒绝占用端口与受保护端口；端口冲突须重新分配，不杀死未知进程。

`release.json` 是本机版本事实，不是另一个任务系统。规则改动回到本仓库；进度、阻塞和实际验证回执按 ENV-04 与 DEV-15 交接。主智能体不得仅因自己输出“完成”而修改验收标准或替用户接受作品。

## DEVENV-04：交付与回退检查

每个候选至少证明下列实际结果，并保存命令退出状态及输入哈希：

- 工件、lock、Profile 与 preset 与该版本清单一致；八个所选插件逐项标明安装、激活或禁用状态。
- 独立 home/Profile 和端口归属正确，Web 可加载，必要 Host/client 插件无装配失败；不能只看 HTTP 200。
- 无密钥测试实际完成一次官方 Team 创建队员、等待与任务读取，主智能体和队员均读取项目指令，并具备开发工具；真实模型调用另行标注。
- 启动器能识别自己的运行进程、拒绝重复启动，退出后可以用同一工件与同一 home 重启。用户 Session 不能作为故障注入材料。
- 独立复核版本清单、路径隔离、配置差异与剩余限制；缺密钥、远端主机、实际任务或外部目标时明确相应验证未执行。

〔约束〕切回上一版 runtime/home 才是该版运行环境的回退；切 Profile 只改变装配。下一版已经产生的新数据单独保留，不因回退删除，不自动灌入旧 schema。需要延续 Session 或业务状态时按 SOLO-DATA-01–04 与 SOLO-ACC-06 做一致备份及兼容验证。
