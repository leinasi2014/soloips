# SoloIPs r002 T00 基线入库盘点与候选准备

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-R002-INTAKE`；**本机只读盘点记录**，非注册文档、非需求正文 |
| 目的 | 固定 T00 候选的逐项范围、format 红门处置建议、DEV-15 集成方案与登记一致性结论，供用户裁定与后续集成直接采用 |
| 范围 | 2026-09-16 12:38–13:15 本机工作树只读核对；12 个已跟踪修改 + 24 个未跟踪文件（`git status` 默认折叠为 14 项）、format 门禁、文档注册表一致性、`.worktrees/team` 第二工作树 |
| 决策状态 | 〔已核实〕事实行给出实际命令与退出码；〔建议〕行为本记录提出的处置方案，**未获授权不执行**；不改变任何已确认需求 |
| 证据范围 | 只读核对：`git`、`prettier`、`pnpm`、文件哈希、链接解析、GitHub REST 读取。**未提交、未推送、未建 PR、未改工作树文件、未启停服务** |
| 依据 | `AGENTS.md` §2/§6、`docs/governance/code-development-standard.md` DEV-12/13/15、`docs/governance/document-registry.yaml`、`docs/governance/agent-readable-documentation.md` §6/§7、`.artifacts/operations/r002-baseline-20260916/baseline.md` §6（A4） |
| 变更权 | 本记录随 T00 推进更新；**不得**据此改写 SOLO-ACC 或降级首片门槛 |

---

## 0. 结论摘要

| # | 结论 | 性质 |
| --- | --- | --- |
| 1 | 工作树 = **12 个已跟踪修改 + 24 个未跟踪文件**（默认折叠 14 项）；`HEAD` = `origin/main` = `2f9fa43`，**无本地提交、无暂存内容** | 〔已核实〕 |
| 2 | 这些改动**全部是 r001 轮次的未交付成果**，无一项由 r002 本轮产生；T00 的角色是**集成既有成果**，不是新写正文 | 〔已核实〕 |
| 3 | `format:check` 红**仅**由 3 个未跟踪文件造成；12 个已跟踪修改因落在 `.prettierignore` 覆盖的 `docs/`、`.agents/`、`AGENTS.md` 内，**对门禁零影响** | 〔已核实〕 |
| 4 | 建议 3 个文件**全部移入 `.gitignore` 覆盖的本机记录位置，不入库**；不建议"格式化后提交" | 〔建议〕 |
| 5 | T00 候选 = 分支 `codex/r002-baseline-intake` + **6 个提交**；其中 `advanced-agent-cognitive-framework` 单列，**是否纳入需用户裁定** | 〔建议〕 |
| 6 | 文档注册表：**19 个 `documentId`、19 个 `path` 全部存在；12 个 `sourceAuthority` 引用 ID 全部可解析**。发现 **4 处登记缺口**（§5） | 〔已核实〕 |
| 7 | `.worktrees/team`（分支 `codex/team-fork-integration`）经逐行比对**不含任何主工作树没有的内容**，是过期副本；**不得删除**（非本任务创建） | 〔已核实〕 |
| 8 | **创建 GitHub Issue、push 分支、建 PR 三者都命中 AGENTS.md §2 #7**，须用户明确授权（基线 §6 A4） | 〔约束〕 |

---

## 1. 版本身份与核对环境

| 项 | 值 | 来源 |
| --- | --- | --- |
| `SOLOIPS_ROOT` | `$SOLOIPS_ROOT` | `pwd` |
| `HEAD` | `2f9fa433983008d138b4e6c241fd470551a31351` | `git rev-parse HEAD` |
| `origin/main` | 同上（本地与远程一致） | `git rev-parse origin/main`；`git ls-remote --heads origin` 仅返回 `refs/heads/main` |
| 当前分支 | `main`（跟踪 `origin/main`） | `git branch -vv` |
| 远程分支总数 | **1**（仅 `main`） | `git ls-remote --heads origin` |
| 本地分支 | `main`、`codex/team-fork-integration`（后者挂在 `.worktrees/team`） | `git branch -vv` |
| 暂存区 | **空**（`git status --porcelain` 无 `^[MADRC]` 行） | `git status --porcelain=v1` |
| `git stash` | 空 | `git stash list` |
| Node / pnpm / Prettier | `v24.18.0` / `9.15.9` / `3.9.6` | `node --version`；`pnpm --version`；`prettier --version` |
| 已跟踪文件数 | 52 | `git ls-files` |
| 核对时间窗 | 2026-09-16 12:38–13:15（本机时区） | 各命令执行时间 |

**门禁实测（本机 `$SOLOIPS_ROOT`，2026-09-16 13:08）**

| 命令 | 退出码 | 实际输出摘要 |
| --- | --- | --- |
| `pnpm run format:check` | **1** | `[warn]` 3 个文件；`Code style issues found in 3 files.` |
| `pnpm run lint` | 0 | `Found 0 warnings and 0 errors. Finished in 304ms on 7 files with 9 rules` |
| `pnpm run typecheck` | 0 | `tsc -b` 无输出 |
| `pnpm run test` | 0 | `Test Files 4 passed (4)` / `Tests 8 passed (8)` / `Duration 1.53s` |
| `pnpm run build` | 0 | `tsc -b` 无输出 |
| `git diff --check` | 0 | 无空白错误 |

**对照基线（证明红门只由未跟踪文件造成）**

| 检查 | 方法 | 退出码 | 说明 |
| --- | --- | --- | --- |
| 纯净 `HEAD` 导出树 | `git archive HEAD \| tar -x -C <tmp>` 后 `prettier --check .` | **0** | `All matched files use Prettier code style!` → **main 本身是绿的** |
| 已跟踪文件的 Prettier 覆盖面 | `prettier --check` 全部 48 个受支持扩展名的已跟踪文件 | **0** | `All matched files use Prettier code style!` |
| 模拟归置后复跑 | `prettier --check . --ignore-path <追加 3 条的临时 ignore>` | **0** | `All matched files use Prettier code style!` → 处置方案可解除红门 |

**证据边界**：以上为本地静态与门禁核对。**未执行**装配、安装、Host 启动、真实模型调用或产品验收；`format:check` 通过**不证明** T00 内容正确。

---

## 2. 逐项盘点

### 2.1 判定口径

| 判定 | 含义 |
| --- | --- |
| **T00-入库** | 属 T00 范围：main 缺失的权威正文 / 交付定义 / 运维入口 / 其投影同步。**集成既有成果**，不改内容 |
| **T00-待裁定** | 是否纳入 T00 需用户或对应权威决定 |
| **T00-排除** | **明确不入库**：本机记录、过程证据、生成物 |
| **他人未交付** | 由前序轮次作者产出、尚未集成；**T00 只搬运不覆盖** |

> **重要前提**：本轮 r002 团队（`baseline-auditor`/`assembly-dev`/`adapter-dev`/`verifier`/`doc-reviewer`/`integrator`）的写面是 `.artifacts/operations/r002-*/**`，全部被 `.gitignore` 覆盖，**不产生工作树改动**。因此下表 36 个条目**全部**来自 r001 及更早轮次，无一项属本轮成员产出。T00 的职责是**集成，不是创作**。

### 2.2 12 个已跟踪修改（` M`）

`git diff --numstat HEAD` 实际数字：

| # | 文件 | +/− | SHA-256（工作树） | 主题 | 判定 |
| --- | --- | --- | --- | --- | --- |
| 1 | `.agents/skills/team-delivery-leadership/SKILL.md` | 78/55 | — | Skill v2.0.0 重写 | T00-入库 |
| 2 | `.agents/skills/team-delivery-leadership/agents/openai.yaml` | 3/3 | — | 随 SKILL 改显示名与默认提示 | T00-入库 |
| 3 | `.agents/skills/team-delivery-leadership/references/decision-cases.md` | 60/2 | — | 新增判断场景 | T00-入库 |
| 4 | `.agents/skills/team-delivery-leadership/references/dsh-case-study.md` | 18/15 | — | DSH 案例修订 | T00-入库 |
| 5 | `.agents/skills/team-delivery-leadership/references/reorganization.md` | 12/8 | — | 重组与交接修订 | T00-入库 |
| 6 | `AGENTS.md` | 62/7 | `69a09a18355731f946c3319fc1231a5c3addd7eb97626a808922bc4369006510` | 新增 §2 授权边界；§2–6 顺延为 §3–7；新增开发迭代与团队路由 | T00-入库 |
| 7 | `docs/architecture.md` | 7/6 | — | 官方 Team 路线取代旧 swarm；协作内核表更新 | T00-入库 |
| 8 | `docs/governance/code-development-standard.md` | 7/2 | — | 新增 SOLO-TEAM-FORK 复用范围、开发实例安装边界、`profiles/development/` 条目 | T00-入库 |
| 9 | `docs/governance/document-registry.yaml` | 48/1 | `5c0ea7066568d043a45b77e69ad760ee67d58c77e17ae0e109df9e2039ac91ef` | 新增 4 个登记项 + 7 条 relatedPaths + sourceAuthority 扩充 | T00-入库 |
| 10 | `docs/operations/environment-handoff.md` | 2/0 | — | 新增 `DSH_FORK_CHECKOUT`、`SOLOIPS_DEVS_ROOT` 两行 | T00-入库 |
| 11 | `docs/reference/rewrite-source-reference.md` | 1/1 | — | 决策状态改为"仅作旧源码参考" | T00-入库 |
| 12 | `docs/technical-architecture.md` | 15/12 | — | 官方 Team 复用取代旧 swarm 表述 | T00-入库 |

**关键核对**：

- 全部 12 个文件路径均落在 `.prettierignore` 已覆盖的 `docs/`、`.agents/`、`AGENTS.md` 之内 → 经 `prettier --file-info` 逐项确认 `"ignored": true` → **对 `format:check` 无影响**。
- 修改时间跨 `09-16 04:44` 至 `12:00`，**均早于 r002 团队建立时间**（`.artifacts/operations/r002-baseline-20260916` 创建于 `12:38:59`）。
- `AGENTS.md` 工作树 144 行 / `HEAD` 89 行（按 LF 字节计）；工作树新增 §2 后小节标题为 §1–§7，编号连续无断档（`L13/31/82/93/102/123/135`）。
- `AGENTS.authorization-diff.md` §0 自述"`AGENTS.md` 由 93 行增至 144 行" —— **行数结论与实际一致**（`HEAD` 89 个 LF + 末行无换行 = 90 行显示；差异来自是否计末行）。

### 2.3 24 个未跟踪文件（`git status` 默认折叠为 14 项）

| # | 折叠项 | 展开文件 | SHA-256 | 主题 | 判定 |
| --- | --- | --- | --- | --- | --- |
| 1 | `.agents/skills/advanced-agent-cognitive-framework/` | `SKILL.md` | `565ed6c4…5e9434` | 通用认知框架 Skill（英文，**无 YAML frontmatter**） | **T00-待裁定** |
| 2 | `.agents/skills/team-delivery-leadership/assets/` | `decision-brief.md` | `b536ef7a…b8bf53` | 决策摘要模板 | T00-入库 |
| 3 | 同上 | `delegation-brief.md` | `7d199b3e…2404e5` | 委派摘要模板 | T00-入库 |
| 4 | 同上 | `learning-note.md` | `b4f9993c…1ada79` | 学习记录模板 | T00-入库 |
| 5 | `…/references/cognitive-judgment.md` | 同 | `732be5d2…5f27ca` | 认知判断参考 | T00-入库 |
| 6 | `…/references/execution-completeness.md` | 同 | `0823492d…6d19c7` | 全局与细节检查 | T00-入库 |
| 7 | `…/references/learning-and-coaching.md` | 同 | `ca761b23…7e5818` | 学习与教练 | T00-入库 |
| 8 | `…/references/soloips-development.md` | 同 | `0ede02e6…b7ea7e` | **SoloIPs 项目情境投影**（被 SKILL.md L22 强制先读） | T00-入库 |
| 9 | `…/references/team-design.md` | 同 | `7285f2e5…95459` | 团队设计与委派 | T00-入库 |
| 10 | `.workbuddy-ai/` | `memory/2026-09-16.md`（98 行） | `aaf8c580…fbef6b` | **本机智能体工作日志** | **T00-排除** |
| 11 | `AGENTS.authorization-diff.md` | 同（181 行） | `59bc7e8f…57743` | AGENTS §2 变更预览（**自述已应用、未注册**） | **T00-排除** |
| 12 | `AGENTS.authorization-review.md` | 同（367 行） | `c5f6587b…d16131` | AGENTS §2 审查记录（**自述已合并、未注册**） | **T00-排除** |
| 13 | `docs/decisions/` | `official-team-and-dsh-fork.md`（120 行） | `91574aa0…590e3f` | **官方 Team 与 DSH fork 专题决策正文**（SOLO-TEAM-01–11） | T00-入库 |
| 14 | `docs/operations/development-iterations.md` | 同（95 行） | `7e1a1245…7abe13` | **开发迭代环境正文**（DEVENV-01–04） | T00-入库 |
| 15 | `profiles/` | `development/.gitignore` | `ab5e8353…ca03d2` | 忽略 `*.local.json` | T00-入库 |
| 16 | 同上 | `development/README.md`（72 行） | `75dd3971…107e62` | 研发 preset 模板说明 | T00-入库 |
| 17 | 同上 | `development/agent-presets/soloips-development/LICENSE.upstream` | `ebb4f099…6ea6be` | 上游 MIT 许可保留 | T00-入库 |
| 18 | 同上 | `development/agent-presets/soloips-development/agent.cordis.yml` | `18d84abd…277379` | preset composition | T00-入库 |
| 19 | 同上 | `development/agent-presets/soloips-development/preset.yml` | `517a01f3…077f3b` | preset 元数据 | T00-入库 |
| 20 | 同上 | `development/cordis.patch.yml` | `818fe56c…a8c12` | agent-presets 覆盖 + 目录对话框关闭 | T00-入库 |
| 21 | 同上 | `development/probe-plugin.mjs` | `cb409c5a…03220d` | 无密钥探针 | T00-入库 |
| 22 | 同上 | `development/upstream.json` | `dfde71c5…106e4e` | **上游固定基线** `0d1f5000…` / `0.1.6-alpha.1` | T00-入库 |
| 23 | 同上 | `development/verify-preset.mjs` | `7c5657dd…483fdf` | preset 验证入口 | T00-入库 |
| 24 | `scripts/` | `development/runtime.ps1`（328 行） | `b7b32974…a146393` | **开发实例启停/状态管理入口** | T00-入库 |

**未跟踪文件的补充核对**

| 检查 | 结果 |
| --- | --- |
| `git check-ignore` 逐项 | 24 项**全部 `UNIGNORED`** → 全部会出现在 `git status` 中 |
| `profiles/development/*.local.json` | 被 `profiles/development/.gitignore` 的 `*.local.json` 排除，**未出现在未跟踪列表**（2 个文件：`probe-result.local.json`、`installed-probe-result.local.json`）——与设计一致 |
| `.worktrees/` | 被根 `.gitignore:15` 排除，**不污染状态** |
| `.artifacts/operations/` | 被根 `.gitignore:42` 排除；本记录写入位置即在此 |
| 换行符 | 3 个 format 失败文件与全部新增正文均为纯 LF、无 BOM、末行有换行 |
| `scripts/development/runtime.ps1` | **纯 ASCII（非 ASCII 字符 0 个）** → 不受 r001 记录的"中文 `.ps1` 必须带 UTF-8 BOM"约束影响 |
| 凭据扫描 | 24 个未跟踪文件中**未发现**真实 token / API key / Bearer。唯一命中是 `verify-preset.mjs:97` 的 `DEEPSEEK_API_KEY: ""`（**空字符串占位**，用于隔离 fixture） |
| 敏感标识扫描 | `.workbuddy-ai/memory/2026-09-16.md` 含机器绝对路径 `$SOLOIPS_DEVS_ROOT/versions/r001`、真实内网地址 `<本机私有内网地址>`、`<APIPA/WSL 地址>`、`<Docker 虚拟网卡地址>`、`<Hyper-V 虚拟网卡地址>`（详见 §3） |
| 反向引用 | 全仓库 `docs/`、`.agents/`、`profiles/`、`scripts/`、`packages/`、`.github/` 中**无任何文件引用** `.workbuddy-ai/`、`AGENTS.authorization-diff.md`、`AGENTS.authorization-review.md` |
| 本地链接可达性 | 工作树 Markdown 共 **97 条本地链接，断链 0 条**（含新增正文的全部交叉引用） |
| 锚点 | `AGENTS.md` 与 `soloips-development.md` 引用的唯一锚点 `#dev-15` 在 `code-development-standard.md:197` 有 `<a id="dev-15">` 定义 |

### 2.4 归属对账（36 项全数闭合）

| 去向 | 已跟踪修改 | 未跟踪文件 | 小计 | 明细 |
| --- | --- | --- | --- | --- |
| C1 决策正文 | 0 | 1 | 1 | `docs/decisions/official-team-and-dsh-fork.md` |
| C2 运维正文 | 0 | 1 | 1 | `docs/operations/development-iterations.md` |
| C3 profile 模板 | 0 | 9 | 9 | `profiles/development/**`（不含被其 `.gitignore` 排除的 2 个 `*.local.json`） |
| C4 启动脚本 | 0 | 1 | 1 | `scripts/development/runtime.ps1` |
| C5 Skill v2.0.0 | 5 | 8 | 13 | `SKILL.md`、`agents/openai.yaml`、3 `references/`（修改）+ 4 `references/`、3 `assets/`（新增） |
| C6 投影同步 | 7 | 0 | 7 | `AGENTS.md`、`architecture.md`、`code-development-standard.md`、`document-registry.yaml`、`environment-handoff.md`、`rewrite-source-reference.md`、`technical-architecture.md` |
| **T00 合计** | **12** | **20** | **32** | |
| 排除（不入库） | 0 | 4 | 4 | `.workbuddy-ai/memory/2026-09-16.md`、`AGENTS.authorization-diff.md`、`AGENTS.authorization-review.md`、`.agents/skills/advanced-agent-cognitive-framework/SKILL.md` |
| **总计** | **12** | **24** | **36** | 与 `git status` 实测一致 |

### 2.5 他人未交付改动的处置纪律

| 约束 | 说明 |
| --- | --- |
| **不覆盖** | T00 只把上述内容**原样搬运**进提交；不重写、不重排、不"顺手修复"任何正文 |
| **不删除** | `.worktrees/team`、`AGENTS.authorization-*.md`、`.workbuddy-ai/` 均非本任务创建；删除或移动命中 AGENTS.md §2 #6，须先确认 |
| **不清理** | 不为"干净状态"清空未跟踪文件；`git status` 的可见性本身就是待处置信号 |
| **越权边界** | `docs/**`、`.agents/**`、`AGENTS.md`、根目录散落文件仅 `integrator` 可写；`doc-reviewer` 只出意见 |

### 2.6 第二工作树 `.worktrees/team` 核对

| 检查 | 结果 |
| --- | --- |
| 路径 / 分支 / HEAD | `.worktrees/team`，分支 `codex/team-fork-integration`，HEAD = `2f9fa43`（**与 main 同提交**） |
| 该分支相对 main 的提交 | **0 个**（`git log main..codex/team-fork-integration` 为空） |
| 该分支是否已推到远程 | **否**（`git ls-remote --heads origin` 仅返回 `main`） |
| 脏状态 | 7 个已跟踪修改 + 1 个未跟踪（`docs/decisions/official-team-and-dsh-fork.md`） |
| 该未跟踪文件 vs 主工作树 | **SHA-256 完全一致**（`91574aa0…590e3f`）→ 无独有内容 |
| 7 个已跟踪修改的**新增行**是否都在主工作树 | **是**。逐行比对：`AGENTS.md` 1/1、`architecture.md` 7/7、`code-development-standard.md` 3/3、`environment-handoff.md` 1/1、`rewrite-source-reference.md` 1/1、`technical-architecture.md` 14/14 全部命中主工作树 |
| `document-registry.yaml` 唯一差异 | 团队工作树缺 `sourceAuthority` 中的 `development-iterations`、`development-profile`、`team-delivery-soloips-context` 三项；其 16 个 `documentId` **全部**是主工作树 19 个的子集 |
| **裁决** | **`.worktrees/team` 不含任何主工作树没有的内容，是过期副本。** 结论：**不删除**（非本任务创建，命中 #6）；记录在案，交用户/owner 决定释放。T00 不依赖它 |

---

## 3. `format:check` 失败处置建议

### 3.1 失败事实

```
$ pnpm run format:check
> prettier --check .

Checking formatting...
[warn] .workbuddy-ai/memory/2026-09-16.md
[warn] AGENTS.authorization-diff.md
[warn] AGENTS.authorization-review.md
[warn] Code style issues found in 3 files. Run Prettier with --write to fix.
 ELIFECYCLE  Command failed with exit code 1.
```

三个文件**均为未跟踪**，且**均未被 `.prettierignore` 或 `.gitignore` 覆盖**（`prettier --file-info` 逐项返回 `"ignored": false`）。

**Prettier 忽略语义实测（可复现）**：在临时 Git 仓库中，把文件写入 `.gitignore` 后 `prettier --check .` 返回 **0**、`--file-info` 返回 `"ignored": true`；移除 `.gitignore` 的对照运行返回 **1**。→ **Prettier 3.9.6 默认同时读取 `.gitignore` 与 `.prettierignore`**；两者任一都能解除该文件的检查。

### 3.2 格式化实际改动量（在副本上实测，未触碰工作树）

| 文件 | 行数 | `prettier --write` 后的增删行 | 改动性质 |
| --- | --- | --- | --- |
| `.workbuddy-ai/memory/2026-09-16.md` | 98 | **1 增 / 1 删** | 仅把行内斜体 `*"…"*` 归一为 `_"…"_`（L68） |
| `AGENTS.authorization-diff.md` | 181 | **29 增 / 29 删** | 阅读契约表与"明确不改的条款"表**重新对齐列宽**（纯空白） |
| `AGENTS.authorization-review.md` | 367 | **74 增 / 70 删** | 表格列宽重排（纯空白） |

→ 改动量小且**无内容语义变化**；但"能格式化"不等于"应该入库"。

### 3.3 归置建议

> **建议：三个文件全部移入 `.gitignore` 已覆盖的本机记录位置，不纳入 T00 提交。不建议"格式化后提交"。**

**逐文件理由**

| 文件 | 建议 | 理由（含依据条款） |
| --- | --- | --- |
| `.workbuddy-ai/memory/2026-09-16.md` | **移入本机记录位置**（如 `.artifacts/operations/r001-20260916/`），或就地保留并将 `.workbuddy-ai/` 加入 `.gitignore` | ① 内容是本机智能体工作日志，含**机器绝对路径** `$SOLOIPS_DEVS_ROOT/versions/r001`、**真实内网地址** `<本机私有内网地址>` 及 WSL/Docker 虚拟网卡地址（L26、L94–L96）——`agent-readable-documentation.md` §6 明确"机器本地绝对路径和瞬时进程细节写入运维交接的本机记录，**不进正文**"；仓库为 `visibility: public`。② 内容是**过程状态**（逐轮调试经过、失败尝试、教训），`project-binding.yaml` 的 `liveStatusInCommittedMarkdown: forbidden` 与 §7"动态状态留在原生任务与发布系统"均不支持入库。③ 其自述的版本事实与本机记录**属同一类本机观察**，入库会形成第二份非权威版本事实来源。④ 全仓库无任何文件引用它 |
| `AGENTS.authorization-diff.md` | **移入本机记录位置**，不入库 | ① 文件自述"**变更预览（已应用）**""本文保留为**合并前快照**；其中行号指向旧版本，**不可用于定位当前内容**"。② 内容是与 `AGENTS.md` §2 **同题**的正文摘要——`agent-readable-documentation.md` §7 明确"**不新建同题** PRD / ADR / **摘要** / 状态台账"。③ 自述"**两份候选未注册进文档注册表——注册即主张权威，须合并后才做**"。④ 含会话事件序号 `seq 500/748/749/786` 属过程状态，`project-binding.yaml` 的 `liveStatusInCommittedMarkdown: forbidden` 不支持入库 |
| `AGENTS.authorization-review.md` | **移入本机记录位置**，不入库 | ① 自述"**审查记录（已合并）**""**本文保留为审查依据，不再是待确认候选**"，且"生效规则以 `AGENTS.md` 为准"。② §10 的 Policy Engine / Authorization Middleware **自述未实现**，留作运行时建议；入库会与"未实现能力不得声称已就绪"冲突。③ 同样含合并前行号与 `seq` 过程引用。④ 按 DEV-13/DEV-15，"**当次检查回执留在工作项中**"——该证据应进 Issue/PR，不进已提交正文 |

**为什么不选"格式化后提交"**

1. **制造同题第二权威**：两份文件都是 `AGENTS.md` §2 的摘要/依据，入库后须在 `document-registry.yaml` 注册；注册即主张权威，而它们的行号与内容已过期，形成**双份可能分歧的规则正文**，直接违反 §7。
2. **违背单一写者与状态边界**：`project-binding.yaml` 的 `documentation.liveStatusInCommittedMarkdown: forbidden` 与 `sharedAuthorityWriterCount: 1` 都指向"规则入正文、过程留工作项"。
3. **收益极低**：格式化只改空白（29/29、74/70 行全为列宽对齐），却换来永久维护两份过期副本的成本。
4. **未获授权**：两份文件自述"注册即主张权威，须合并后才做"，作者已明确把入库决定留待裁定；T00 无权单方改变。

**执行前提（重要）**：以上建议涉及**移动非本任务创建的文件**，命中 AGENTS.md §2 #6（不可逆破坏操作）。**本记录只提出建议，未执行任何移动或改写**。落地须由用户确认目标位置后，由 `integrator` 作为唯一写者执行。

**若用户选择"保持原位 + 只解红门"（最小风险变体）**：只需在 `.prettierignore` 追加 3 行（`.workbuddy-ai/`、`AGENTS.authorization-diff.md`、`AGENTS.authorization-review.md`）或把前两条加入 `.gitignore`。经模拟运行验证：`prettier --check . --ignore-path <追加后的 ignore>` **退出码 0**。该变体不移动、不删除任何文件，`git status` 仍如实显示三者为未跟踪。

---

## 4. T00 候选方案（DEV-15）

### 4.1 前置授权（当前全部未获授权）

| 动作 | 命中 | 状态 |
| --- | --- | --- |
| 创建 GitHub Issue | AGENTS.md §2 #7 对外发布 | **未授权**。已核实仓库当前**开放 Issue 数为 0**（GitHub REST：`#1` closed/not_planned、`#2` closed/completed、`#3` 为已合并 PR） |
| 本地 `commit` | §2 边界澄清：**Envelope 内**（可逆、属交付过程） | 未执行（本任务只做盘点） |
| `git push` 分支 | §2 #7 | **未授权**（基线 §6 A4） |
| 创建 PR | §2 #7 | **未授权**（基线 §6 A4） |

→ **T00 的授权请求应一次打包**：Issue 创建 + 分支 push + PR 创建 + 合并后关闭 Issue，四项一并请用户裁定，避免二次往返。

### 4.2 分支

| 项 | 值 |
| --- | --- |
| 分支名 | **`codex/r002-baseline-intake`** |
| 依据 | DEV-12：新分支默认 `codex/<task>`；历史先例 `codex/issue-task-pr-workflow`（PR #3）、`codex/team-fork-integration` |
| 基点 | `main` = `2f9fa433983008d138b4e6c241fd470551a31351` |
| 工作位置 | **就地使用主工作树**（`.worktrees/` 已有 `team` 目录，且 `.worktrees/` 被忽略；本次无并行写者，无需新建隔离工作区） |
| 分支名占用核对 | `origin` 仅有 `main`；本地已有 `main`、`codex/team-fork-integration` → `codex/r002-baseline-intake` **未占用** |

### 4.3 提交拆分（6 个提交，按依赖顺序）

拆分原则：**每个提交自洽、可独立复核、`format:check` 全绿**；先落"被引用者"，再落"引用者"，使每个提交的历史状态都不出现悬空链接。

| # | 提交信息 | 文件（数量） | 前置 | 复核重点 |
| --- | --- | --- | --- | --- |
| **C1** | `docs(decisions): 新增官方 Team 与 DSH fork 决策正文` | `docs/decisions/official-team-and-dsh-fork.md`（1） | — | SOLO-TEAM-01–11 编号唯一；对旧 swarm 选择的取代关系（SOLO-TEAM-09）明确；上游固定 SHA `0d1f5000…` |
| **C2** | `docs(operations): 新增开发迭代环境正文` | `docs/operations/development-iterations.md`（1） | C1（文中引用决策正文） | DEVENV-01–04；指向 `profiles/development/README.md` 与 `scripts/development/runtime.ps1` 的链接在 C3/C4 后闭合 |
| **C3** | `feat(profiles): 新增研发 preset 模板与无密钥验证入口` | `profiles/development/**`（9） | C2 | `upstream.json` 的 SHA/版本与 `LICENSE.upstream`；`*.local.json` **不入库**（已由 `profiles/development/.gitignore` 排除）；`agent.cordis.yml` 移除的 6 行与 `upstream.json.removedRowIds` 一致 |
| **C4** | `feat(scripts): 新增开发实例运行管理入口` | `scripts/development/runtime.ps1`（1） | C2 | 纯 ASCII、无 BOM；不向 CLI 传 `--host`（注释 L89–94 说明官方 guard）；受保护端口拒绝含 `55120`（L270）；只管理自己登记的进程 |
| **C5** | `docs(skills): 团队管理 Skill v2.0.0 与配套参考` | `.agents/skills/team-delivery-leadership/**`（**13** = 5 修改 + 8 新增） | — | `SKILL.md` frontmatter `name`/`version`；`references/soloips-development.md` 的 12 条链接全部可达（已核对）；3 份 `assets/` 被 `SKILL.md:121` 与 `execution-completeness.md` 引用 |
| **C6** | `docs(governance): 登记开发迭代正文并同步投影` | 7 个已跟踪文件：`AGENTS.md`、`docs/architecture.md`、`docs/governance/code-development-standard.md`、`docs/governance/document-registry.yaml`、`docs/operations/environment-handoff.md`、`docs/reference/rewrite-source-reference.md`、`docs/technical-architecture.md` | C1–C5 | **registry 的 4 个新登记项路径在 C1–C4 已存在**；`sourceAuthority` 12 个 ID 全部可解析；`AGENTS.md` §1–§7 编号连续；`#dev-15` 锚点可达 |

**C6 为什么最后**：`document-registry.yaml` 新增登记 `development-iterations`、`development-profile`、`official-team-and-dsh-fork`，并给 `project-instructions` 的 `sourceAuthority` 加入 `development-iterations`、`development-profile`、`team-delivery-soloips-context`。若先提交 C6，历史中间态会指向尚不存在的文件。

**C1–C4 可否再合并？** 技术上可以（同属"新增正文"），但不建议：C3（profile 模板 + 上游哈希）与 C4（PowerShell 启动器）需要**不同复核视角**（装配契约 vs 进程/端口/编码），合并会稀释复核焦点。

### 4.4 C0：`advanced-agent-cognitive-framework` 需用户裁定

| 事实 | 证据 |
| --- | --- |
| 文件存在：`.agents/skills/advanced-agent-cognitive-framework/SKILL.md`（262 行，`565ed6c4…5e9434`） | `git status` |
| **不在本会话 Skill 目录中** | 会话可用 Skill 仅 `dsh-plugin-development`、`team-delivery-leadership` |
| **无 YAML frontmatter**（首行即 `# Advanced Agent Cognitive Framework Skill`） | 逐行读取 L1–L8；对照 `dsh-plugin-development/SKILL.md`、`team-delivery-leadership/SKILL.md` 均有 `--- name: … description: … ---` |
| 未被任何文件引用 | 全仓库 `grep advanced-agent-cognitive-framework` → **0 命中** |
| 未登记 | `document-registry.yaml` 无对应 `documentId` |

**结论**：该文件当前是**惰性文件**——存在但不被 Skill 目录加载、不被引用、未登记。

**建议**：**不纳入 T00**，单列待裁定。可选路径：
- **(a) 登记为 `reference` 角色**并补 frontmatter（`name`/`description`），使其真正可被加载；
- **(b) 保持本机候选**，移入 `.artifacts/operations/` 作为方法参考；
- **(c) 纳入 T00** 但只作为普通 Markdown 正文登记，**不声称已成为可加载 Skill**。

任一路径都涉及新增 Skill（AGENTS.md §2 #3"修改组织规则"）与新增登记项，**须用户确认**。本记录不预设。

### 4.5 PR 正文草案（套用 `.github/pull_request_template.md`）

```markdown
## Motivation

main 缺少 4 项权威正文与交付定义，接手者从 main 第一步即失去入口：

- `docs/decisions/official-team-and-dsh-fork.md`（SOLO-TEAM-01–11，协作路线与 fork 维护的唯一权威）
- `docs/operations/development-iterations.md`（DEVENV-01–04，开发实例创建与验收规程）
- `profiles/development/`（研发 preset 模板、上游固定基线、无密钥验证入口）
- `scripts/development/runtime.ps1`（开发实例 verify/start/status/stop 入口）

经 `git cat-file -e HEAD:<path>` 逐项确认，上述路径**均不在 main**（退出码非 0）。
同时 `main` 上的 `document-registry.yaml` 尚未登记这些正文，`AGENTS.md` 亦无对应路由。

Related #NN <!-- T00 Issue；本 PR 需合并后核验，不自动关闭 -->

## Changes

- **新增正文（4 项）**：官方 Team / DSH fork 决策、开发迭代环境、研发 preset 模板与上游固定基线、开发实例运行管理脚本。均为**已存在于工作树的既有成果的原样入库**，本次不改写内容。
- **新增 Skill 版本（1 项）**：`team-delivery-leadership` v2.0.0 —— SKILL.md 重写、`agents/openai.yaml` 同步、新增 4 份 references 与 3 份 assets。
- **同步投影（7 个已跟踪文件）**：`AGENTS.md`（新增 §2 授权边界，§2–6 顺延为 §3–7，新增开发迭代与团队路由）、`docs/architecture.md`、`docs/governance/code-development-standard.md`、`docs/governance/document-registry.yaml`（4 个新登记项 + 7 条 relatedPaths + sourceAuthority 扩充）、`docs/operations/environment-handoff.md`、`docs/reference/rewrite-source-reference.md`、`docs/technical-architecture.md`。
- **不含**：产品代码（`packages/**`）、`profiles/soloips/**`、`pnpm-lock.yaml`、任何凭据或本机记录。无依赖变化。

## Evidence layers

| 层                                    | 状态 | 说明 |
| ------------------------------------- | ---- | ---- |
| 静态检查（format / lint / typecheck） | 见下 | 本机实测；CI 结果以 PR 运行回执为准 |
| 行为测试                              | 不适用 | 本候选只含文档、Skill、preset 模板与启动脚本，无产品行为变更 |
| 构建 / 打包                           | 见下 | `tsc -b`；不产生交付工件 |
| 安装 / Host 验证                      | 未执行 | 本 PR 不装配、不安装、不启动任何实例 |
| 用户最终验收                          | 不作声明 | 本 PR 只交付仓库正文与交付定义，不构成产品验收 |

## Testing

- `pnpm run format:check`：**退出码 0**。本 PR 已把 3 个非交付文件（`.workbuddy-ai/memory/2026-09-16.md`、`AGENTS.authorization-diff.md`、`AGENTS.authorization-review.md`）移出检查范围，未将其格式化入库。

  <details>
  <summary>Proof</summary>

  处置前：退出码 1，`[warn]` 上述 3 个文件。
  处置后：`All matched files use Prettier code style!`，退出码 0。
  对照：纯净 `HEAD` 导出树（`git archive HEAD`）`prettier --check .` 退出码 0，证明 main 本身为绿，红门只由未跟踪文件造成。

  </details>

- `pnpm run lint`：**退出码 0**，`Found 0 warnings and 0 errors. Finished in 304ms on 7 files with 9 rules`。

  <details>
  <summary>Proof</summary>

  命令：`pnpm run lint`（工作目录 `$SOLOIPS_ROOT`），2026-09-16 13:08。

  </details>

- `pnpm run typecheck`：**退出码 0**（`tsc -b` 无输出）。
- `pnpm run test`：**退出码 0**，`Test Files 4 passed (4)` / `Tests 8 passed (8)` / `Duration 1.53s`。
- `pnpm run build`：**退出码 0**（`tsc -b` 无输出）。
- 文档链接与锚点：工作树 Markdown **97 条本地链接、断链 0 条**；`#dev-15` 锚点在 `code-development-standard.md:197` 有定义。
- 文档注册表一致性：19 个 `documentId`、19 个 `path` **全部存在**；12 个 `sourceAuthority` 引用 ID **全部可解析**。

  <details>
  <summary>Proof</summary>

  本地候选：`<commit SHA>`；基线：`2f9fa433983008d138b4e6c241fd470551a31351`。

  **未执行**：未装配、未安装、未启动服务、未做故障注入、未调用模型、未在目标实例验证。
  本 PR 的静态检查通过**不证明**所入库正文的需求正确性或产品可用性。

  独立复核记录见本 PR 的 review（复核者与作者不同人，按 DEV-15 记录）。

  </details>

## Remaining

- `.agents/skills/advanced-agent-cognitive-framework/SKILL.md` **不在本 PR**：无 frontmatter、未被引用、未登记，需用户裁定登记方式（见 T00 盘点 §4.4）。
- `document-registry.yaml` 的 4 处登记缺口（`team-delivery-leadership/assets/**`、`profiles/development/` 非 README 文件、`scripts/development/runtime.ps1`、`advanced-agent-cognitive-framework`）**未在本 PR 修复**：涉及新增登记项与角色判定，需单独确认。
- `.worktrees/team`（分支 `codex/team-fork-integration`）经逐行比对**不含独有内容**，为过期副本；本 PR 不删除、不释放，交 owner 决定。
- 本 PR **不装配、不启动 r002 实例**；实例创建仍属基线 §6 未授权项 A1。
```

### 4.6 独立复核安排

| 项 | 安排 | 依据 |
| --- | --- | --- |
| **复核者** | `doc-reviewer`（文档只读，已在本轮编制内） | DEV-12"复核者独立检查实际内容与证据"；`document-registry.yaml` 的 `sharedAuthorityWriterCount: 1` 要求校对者与写者不同人 |
| **复核范围** | C1/C2/C5/C6 全部文档与登记项：阅读契约字段齐备、三类标注未混用、稳定 ID 唯一、本地链接与锚点可达、`sourceAuthority` 覆盖直接依赖 | `agent-readable-documentation.md` §9 |
| **运行视角复核** | C3/C4 的**可执行性**由 `verifier` 独立检查（不是执行安装）：`runtime.ps1` 的端口/进程/路径校验逻辑与 `verify-preset.mjs` 的 fixture 隔离 | DEV-13"持久写权、恢复、权限与真实执行接线变化须有有界独立复核" |
| **复核时点** | 在**准确候选提交**上复核，不是在工作树上 | DEV-15"评审者审查准确提交" |
| **复核产物** | 复核记录作为 PR 的 review（COMMENT）附上，**并明确它与独立 GitHub 账号批准不同** | DEV-15"智能体复核与独立 GitHub 账号的批准分别报告"；PR #3 先例 |
| **批准数说明** | `project-binding.yaml` 的 `requiredApprovingReviewCount: 0`；不声称 GitHub 强制了独立账号批准 | 同上 |
| **阻断处置** | 复核发现阻断问题 → 由 `integrator`（唯一写者）在同一候选修复 → 受影响结论**重新复核** | DEV-15"新提交出现后复核受影响结论" |
| **集成确认** | 合并前由 `integrator` 核对：候选仍为已审查提交、`verify` 通过、目标分支满足最新基线要求 | DEV-15"审查与合并" |

### 4.7 CI 门禁预期

`.github/workflows/verify.yml` 在 `pull_request` 与 `push: branches: [main]` 触发，依次执行 `pnpm install --frozen-lockfile` → `format:check` → `lint` → `typecheck` → `test` → `build`，Node 24 + pnpm 9.15.9。

- 本 PR **不改 `pnpm-lock.yaml`** → `--frozen-lockfile` 不受影响（`pnpm-lock.yaml` 未出现在 `git status` 中）。
- 唯一需要处置的红门是 `format:check`（§3）。**若 §3 建议未落地就 push，PR CI 必然失败。**
- `push` CI 通过**不证明** PR 流程通过（DEV-15）；PR 触发的 `verify` 与合并后 `main` CI 分别核实。

---

## 5. 文档注册表登记一致性核对

核对对象：工作树 `docs/governance/document-registry.yaml`（SHA-256 `5c0ea706…ac91ef`，205 行，19 个 `documentId`）。

### 5.1 已核对无问题

| # | 检查项 | 方法 | 结果 |
| --- | --- | --- | --- |
| 1 | 每个 `documentId` 的 `path` 是否存在 | 逐项 `Test-Path` | **19/19 存在**，无悬空登记 |
| 2 | 每个 `sourceAuthority` 引用 ID 是否有定义 | 12 个引用 ID 与 19 个定义 ID 求差集 | **差集为空**，全部可解析 |
| 3 | 7 条 `relatedPaths` 是否存在 | 逐项 `Test-Path` | **7/7 存在**（全在 `team-delivery-leadership/references/`） |
| 4 | 新增正文是否已登记 | `docs/decisions/`、`docs/operations/development-iterations.md`、`docs/reference/rewrite-*.md`（4 份） | **6/6 已登记**，路径存在 |
| 5 | `profiles/development/README.md` | `documentId: development-profile`，role `projection` | 已登记，路径存在 |
| 6 | 投影的 `sourceAuthority` 是否覆盖直接依赖 | 逐个投影比对正文实际链接 | `project-instructions`（AGENTS.md）12 个来源；`team-delivery-soloips-context` 10 个来源；`development-profile` 3 个来源 —— **正文链接与登记一致**（`soloips-development.md` 的 12 条链接全部可达） |
| 7 | `main`（`HEAD`）侧一致性 | 从 `HEAD` 取 registry 后逐项 `git cat-file -e` | **18/18 在 HEAD 中存在**，`main` 侧亦无悬空登记 |
| 8 | 交叉引用锚点 | 全仓库 `.md#anchor` 扫描 | 仅 `#dev-15`，在 `code-development-standard.md:197` 有定义 |
| 9 | 本地链接可达性 | 工作树 Markdown 全量解析 | **97 条，断链 0 条** |
| 10 | 表格结构 | 2 空格缩进映射、`  - documentId:` 引导、四空格标量 | 符合文件头声明的格式约束 |

### 5.2 登记缺口（逐条列出）

> 判定口径：注册表头声明"**relatedPaths 与该条目共用角色、负责人和变更权；每个路径只登记一次**"以及"本表登记文档**角色、负责人、变更触发与验证入口**"。以下缺口按此口径评估；`scripts/**` 是否属登记范围属**判断项**，已如实标注。

| # | 缺口 | 具体路径 | 严重度 | 说明与依据 |
| --- | --- | --- | --- | --- |
| **G1** | `team-delivery-leadership` 的 `relatedPaths` **漏登 `assets/` 三份** | `.agents/skills/team-delivery-leadership/assets/decision-brief.md`、`delegation-brief.md`、`learning-note.md` | **建议修复** | 三者被 `SKILL.md:121` 明确引用（"[决策摘要](../../../../.agents/skills/team-delivery-leadership/assets/decision-brief.md)、[委派摘要](../../../../.agents/skills/team-delivery-leadership/assets/delegation-brief.md)、[学习记录](../../../../.agents/skills/team-delivery-leadership/assets/learning-note.md)"），且 `references/execution-completeness.md` 引用 `../assets/delegation-brief.md`。`relatedPaths` 已收录 `references/` 全部 7 份，却未收录 `assets/` 3 份 → **同一 Skill 的支撑文件登记不完整**，三者将与 `references/` 分属不同变更权 |
| **G2** | `development-profile` **无 `relatedPaths`**，其描述的同目录文件未登记 | `profiles/development/cordis.patch.yml`、`upstream.json`、`verify-preset.mjs`、`probe-plugin.mjs`、`agent-presets/soloips-development/{agent.cordis.yml,preset.yml,LICENSE.upstream}` | **建议修复** | `documentId: development-profile` 的 `path` 仅为 `README.md`，但 `validation: pinned-source-and-real-preset-team-tool-verification` 依赖 `upstream.json`（上游 SHA `0d1f5000…`、`sourceSha256 942480b0…`）。**被 `validation` 依赖的文件不在登记范围**，变更权无归属 |
| **G3** | `scripts/development/runtime.ps1` 未登记 | 同 | **判断项** | `docs/operations/development-iterations.md`（已登记权威）DEVENV-03 明确"日常启动、状态与停止通过 runtime.ps1 执行"，并给出 3 条调用命令。若注册表只覆盖文档，则不属缺口；若覆盖"验证入口"，则该脚本是 DEVENV-04 的实际入口，应登记 |
| **G4** | `.agents/skills/advanced-agent-cognitive-framework/SKILL.md` 未登记且无 frontmatter | 同 | **阻断（对"可用 Skill"主张而言）** | 文件存在但不被 Skill 目录加载（不在会话 Skill 目录中）、无 `name`/`description`、全仓库 0 引用。**当前状态不得被描述为"已可用 Skill"**。处置见 §4.4 |
| **G5** | `.agents/skills/team-delivery-leadership/agents/openai.yaml` 未登记 | 同 | **判断项（既有）** | 该文件在 `main` 中已被跟踪，本次被修改（3/3 行），但不属任何 `documentId`。属**既有状态**，非本次引入 |

**缺口合计**：G1、G2 建议在本轮或紧随的文档任务修复（各只需追加 `relatedPaths`）；G3、G5 待用户/owner 判定登记范围；G4 见 §4.4。

### 5.3 本次**未**修复缺口的理由

T00 的范围是"**把 main 缺失的权威正文入库**"，而非"修订登记规范"。追加 `relatedPaths` 会改变 `team-delivery-leadership` 与 `development-profile` 两个条目的**变更权归属**（AGENTS.md §2 #3"修改组织规则"边界），且 G3/G5 涉及"注册表是否覆盖非文档路径"的范围判定，属**需要新的判定**（§2 #8）。故本记录只列出，**不擅改**。

---

## 6. 发现的风险

| # | 风险 | 影响 | 建议处置 |
| --- | --- | --- | --- |
| **R1** | **T00 的授权是"打包式"的**：Issue 创建、分支 push、PR 创建三者都命中 §2 #7，缺一即无法完成 DEV-15 闭环 | 分次请示会造成多次往返；只批一部分会停在半程 | 一次请求授权全部四项（含合并后关闭 Issue），并附本 §4 方案供裁定 |
| **R2** | **仓库当前开放 Issue 数为 0**（GitHub REST 实测） | DEV-15 要求 PR 关联 Issue（`Fixes`/`Related`）；无 Issue 则 PR 模板的 Motivation 无法合规填写 | 在授权包中同时请求创建 T00 Issue，正文引用本记录的 §4.5 |
| **R3** | **`format:check` 在 PR CI 上是硬门禁** | 若先 push 分支再处置，PR CI 必然失败，产生一次无效运行记录 | 处置顺序固定为：**先落地 §3 归置 → 再 commit → 再 push**。禁止为通过 CI 而删除或改写文件 |
| **R4** | **`.workbuddy-ai/memory/2026-09-16.md` 含真实内网地址与本机绝对路径** | 仓库 `visibility: public`（`project-binding.yaml`）；内网拓扑与开发机目录结构会进入公开仓库 | 按 §3 移入本机记录位置；**不因"只是一份日志"而放宽** |
| **R5** | **`.worktrees/team` 是过期副本**（同提交、无独有内容、未推远程） | 长期保留会误导后续成员以为存在待集成分支；`codex/team-fork-integration` 分支名占用 | **不删除**（非本任务创建，命中 #6）；在交接中注明"无独有内容，可释放"，交 owner 决定 |
| **R6** | **`advanced-agent-cognitive-framework` 是惰性文件** | 若被当作"已可用 Skill"引用，即违反"安装/启用不等于实际调用"与"未配置能力不得声称已就绪" | 按 §4.4 三选一裁定；在裁定前**不引用、不登记、不纳入 T00** |
| **R7** | **12 个已跟踪修改横跨 4 个主题**（Skill v2.0.0、AGENTS §2 授权边界、官方 Team 路线取代 swarm、开发迭代环境） | 若压成 1 个提交，复核者无法按主题独立验证；若拆得过细，中间态会出现悬空引用 | 按 §4.3 的 6 提交方案；顺序保证每个中间态的链接与登记项自洽 |
| **R8** | **`.agents/**` 与 `AGENTS.md` 的修改命中 §2 #3"修改组织规则"** | 这些修改**已经存在于工作树**（由前序轮次产出），T00 只是集成；但"提交组织规则变更"仍需确认 | 在授权包中明示：T00 提交包含 `AGENTS.md` §2 授权边界与 Skill v2.0.0，**属 §2 #3 范围**，请用户一并确认 |
| **R9** | **4 处登记缺口（G1–G5）** | G1/G2 使被引用文件无变更权归属；G4 使惰性文件可能被误认为可用 | G1/G2 建议紧随修复；G3/G5 待范围判定；G4 见 §4.4 |
| **R10** | **本次核对为只读，未验证任何内容的正确性** | "能入库"不等于"内容对" | 独立复核按 §4.6 在准确提交上进行；产品验收另属 SOLO-ACC |

---

## 7. 核验回执

**工作目录**：`$SOLOIPS_ROOT`　**时间**：2026-09-16 12:38–13:15　**执行者**：`integrator`（共享任务 `task-2`）

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 版本身份 | `git rev-parse HEAD` / `origin/main` / `ls-remote --heads origin` | `2f9fa43` = `origin/main`；远程仅 `main` |
| 暂存区与提交 | `git status --porcelain` / `git stash list` | 无暂存内容、无 stash、无本地提交 |
| 已跟踪修改计数 | `git status --porcelain \| Where ^ M` | **12** |
| 未跟踪计数 | `git status --porcelain` / `-uall` | 折叠 **14** 项 / 展开 **24** 个文件 |
| 修改总量 | `git diff --numstat HEAD` | 313 增 / 112 删，跨 12 文件 |
| 门禁实测 | `pnpm run format:check / lint / typecheck / test / build` | **1** / 0 / 0 / 0 / 0 |
| 纯净 HEAD 对照 | `git archive HEAD` → `prettier --check .` | 退出码 **0** |
| 归置方案模拟 | `prettier --check . --ignore-path <追加 3 条>` | 退出码 **0** |
| Prettier 忽略语义 | 临时 Git 仓库对照实验（有/无 `.gitignore`） | 有 → 0 且 `ignored: true`；无 → 1 |
| 格式化改动量 | 副本上 `prettier --write` + `git diff --no-index --numstat` | 1/1、29/29、74/70 行，**全部为空白/标记归一** |
| 登记表路径存在性 | 逐项 `Test-Path` | **19/19 存在** |
| `sourceAuthority` 闭包 | 12 引用 ID vs 19 定义 ID | 差集为空 |
| `relatedPaths` 存在性 | 逐项 `Test-Path` | **7/7 存在** |
| `main` 侧登记一致性 | `HEAD` 取 registry 后 `git cat-file -e` | **18/18 在 HEAD 中存在** |
| 本地链接 | 全工作树 Markdown 解析 | **97 条，断链 0** |
| 锚点 | `.md#anchor` 扫描 | 仅 `#dev-15`，已定义 |
| 凭据扫描 | 24 个未跟踪文件正则扫描 | **无真实凭据**；唯一命中为 `verify-preset.mjs:97` 空串占位 |
| 第二工作树 | `.worktrees/team` 提交数、脏状态、逐行比对、哈希 | 0 个独有提交；7 个修改文件的**新增行全部**在主工作树；未跟踪文件哈希一致 → **无独有内容** |
| GitHub 状态 | `api.github.com/repos/leinasi2014/soloips/issues?state=all` | `#1` closed/not_planned、`#2` closed/completed、`#3` 已合并 PR → **开放 Issue 0** |

**未执行（如实声明）**：未 `git add`、未 `git commit`、未 `git push`、未创建 PR、未创建 Issue；未修改或删除任何工作树文件（含未跟踪文件）；未启停任何服务；未装配、未安装、未做故障注入、未调用模型。

**证据边界**：以上为本机只读核对，绑定 2026-09-16 13:15 状态。**不证明**所盘点内容的需求正确性、装配可用性或产品验收通过；`format:check` 归置方案为模拟运行，**未落地**。

---

## 8. 待用户裁定事项

| # | 事项 | 选项 | 本记录建议 |
| --- | --- | --- | --- |
| D1 | T00 授权包 | ① 仅授权本地 commit ② commit + push 分支 ③ commit + push + 建 PR ④ 全部含创建 Issue 与合并后关闭 | **④**，一次授权避免往返 |
| D2 | 3 个 format 失败文件 | ① 移入本机记录位置（推荐） ② 保持原位 + 加入忽略（最小风险） ③ 格式化后提交 | **①**；若求零风险则 **②**；**不建议 ③** |
| D3 | `advanced-agent-cognitive-framework` | ① 补 frontmatter + 登记 ② 移入本机记录 ③ 纳入 T00 作普通正文 ④ 暂不处理 | 需用户判定；**不建议 ④**（长期悬空） |
| D4 | 登记缺口 G1/G2 | ① 本 PR 内一并修复 ② 紧随的文档任务修复 | **②**（T00 范围是入库，不是修订登记规范） |
| D5 | `.worktrees/team` 与分支 `codex/team-fork-integration` | ① 保留 ② 由 owner 释放 | **① 保留**（非本任务创建，命中 #6） |
