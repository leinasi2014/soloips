# SoloIPs r002 验收执行方案（SOLO-ACC-01–10 与 CE-A…I）

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-R002-QA-PLAN`；本机验收**执行设计**记录，非注册文档、非需求正文、非通过记录 |
| 目的 | 让独立 QA 接手者不读聊天记录即可逐条执行技术架构 §11 的验收合同，并给出可复现的判据、命令与证据格式 |
| 范围 | SOLO-ACC-01–10 与 SOLO-ACC-CE-A…I 的编排；隔离测试根；ACC-09 双真实进程；ACC-07/08 离线注入；ACC-05 冷启动读回；证据模板。**不含**产品实现、不含任何场景的实际运行结果 |
| 决策状态 | 〔提案〕本方案全部编排均为**执行设计**；技术架构 §11 的〔需求〕〔约束〕标签不因本方案改写，首片门槛（§11.8）不因本方案降级 |
| 证据范围 | 2026-09-16 本机只读核对：技术架构 §11 全文、DEV-07/11/13、r002 基线、DSH 0.1.6-alpha.1 已安装工件与 fork 源码、`runtime.ps1` 实际行为。**本方案未执行任何场景**：未启动服务、未做故障注入、未改任何配置 |
| 依据 | `docs/technical-architecture.md` §11（含 §11.8/§11.9/§11.10）、§6.10、§7.10、第 10 章；`docs/governance/code-development-standard.md` DEV-07/11/12/13；`docs/operations/environment-handoff.md` ENV-01–04；`docs/operations/development-iterations.md` DEVENV-01–04；`.artifacts/operations/r002-baseline-20260916/baseline.md` |
| 变更权 | 独立 QA（`verifier`）；发现判据不足或门槛被降级时不得自行放宽，须回到技术架构 §11 与该条权威 |

---

## 1. 目的与边界

### 1.1 本方案回答什么

技术架构 §11 是**验收合同**：它写「什么算通过、什么算失败」，不写「已通过」（§11.7）。本方案把该合同翻译成**可执行编排**：每条给出起点、动作、可观察通过判据、可观察失败判据、所需输入/工件/命令。

### 1.2 本方案不回答什么（反面声明）

- 本方案**不是**通过记录。文中出现的任何命令都是**待执行**，未执行。
- 本方案**不**证明 r002 任何出口已达成。
- 本方案**不**授权启动服务、注入故障、修改配置、迁移凭据、操作 55120 或触碰 r001。执行需另获覆盖该动作的授权（r002 基线 §6 A1/A2/A3/A5）。
- 本方案**不**降低 §11.8 的首片门槛：ORG-03 完整准入、ORG-05 唯一占用、ORG-06 实际 writer、ORG-13 首错停线不得因「尚未实现」而标为不要求，只能标为**未执行**。

### 1.3 当前可执行性（关键前置判断）

〔源码事实〕2026-09-16 只读核对 SOLOIPS_ROOT：

| 路径 | 实际内容 | 后果 |
| --- | --- | --- |
| `packages/core/src/index.ts` | `export {}`（仅注释骨架） | 无公司/部门/员工/任务/attempt/作品实现 |
| `packages/adapter-dsh/src/index.ts` | `export {}` | 无 Host seam 接线 |
| `packages/web/src/index.ts` | `export {}` | 无客户端投影 |
| `packages/bundle/cordis.patch.yml` | 仅一条 `insert` 一个 `cordis:group` 空组行 | 无业务行 |
| `profiles/soloips/` | **不存在** | 无验收 profile |

因此本方案把每条场景标注**执行就绪度**：

- **M** = 机制层可执行：只需已安装的 DSH 0.1.6 工件 + 测试专属插件，**现在**即可执行，验证宿主机制本身。
- **P** = 阻塞于产品实现：需要 SoloIPs 业务服务真实存在（`packages/**` + `profiles/soloips/**`，属 r002 基线 §6 A3 未授权项），**现在不可执行**。
- **B** = 阻塞于前置：需要 A1（创建并启动 r002 实例）或 A2（凭据）或独立授权。

**M 不替代 P**：机制层通过**不能**用于宣称产品出口通过（SOLO-REG-04、§11.7）。M 的用途是：在实现落地前先把**判据与门禁本身**验红/验绿，避免实现完成后才发现判据写不出来。

---

## 2. 独立复核：本方案所依赖事实的实际核对

> 本节是本方案与「采信作者摘要」的分界线。全部结论来自本次直接读取文件与运行命令；命令与退出码逐条给出。

### 2.1 输入基线与哈希（DEV-13「实际输入与哈希」）

工作目录 `$SOLOIPS_ROOT`，时间 2026-09-16。方法：`Get-FileHash -Algorithm SHA256`。

| 输入 | 字节 | SHA-256 |
| --- | ---: | --- |
| `docs/technical-architecture.md` | 153318 | `f42d204203012c81139773cf5a4a5d6d7a9a67e57b2418c26f66a7f3dea0bd50` |
| `docs/governance/code-development-standard.md` | 33145 | `081d7e73d43fa4bedc24e11d969d1da0f9a7496b2cd251de5b2b2ce6ebb9ff61` |
| `docs/governance/agent-readable-documentation.md` | 6765 | `22a0593ed75847ecca64fb6b277c5d1316bbf02b8a3b6648960069deb3edbbdf` |
| `docs/operations/environment-handoff.md` | 7271 | `a26d26ba790e3a18259596df0b1cd9853338720db27035d0c897f681a3496f58` |
| `docs/operations/development-iterations.md` | 9649 | `7e1a1245a666cca01d0090debf1e7679bf565e32e003458d9fc0d10a807abe13` |
| `docs/governance/project-binding.yaml` | 3338 | `97bc21021377f42e52f73d14862b7ee7e8bf3093e9a95cf69e31d42094d9df56` |
| `.artifacts/operations/r002-baseline-20260916/baseline.md` | 9276 | `676cd962b76cdfb68510bae99179a83cdfac7807408728a554dbd91f83e877ae` |
| `scripts/development/runtime.ps1` | 19480 | `b7b3297490f8cf3799205761ce41231d0fd06969e7ea526e6e33222d9a146393` |
| `SOLOIPS_DEVS_ROOT/versions/r001/release.json` | 47977 | `6748af9683ae3b9d4036ce8b64266b683c157c9ab7fbda49cc73d980082faef4` |
| `…/r001/home/profiles/soloips/package.json` | 1594 | `bb812f8ecb69c8efe5cac1e5167da746df9e41b69468b0537ccc6176df1d59de` |
| `…/r001/home/profiles/soloips/cordis.patch.yml` | 1158 | `5572cd296c05b726742f67960419963883439a6b3b6aeefede04e827d4e40175` |
| `packages/bundle/cordis.patch.yml` | 913 | `196b7977244a2f30765d110a1c9a9fda00928e7bf97dbeb392fd4b8db79449a7` |
| `packages/bundle/package.json` | 436 | `30b27d47f66d591a51566ea0adbb2266fc88cd7fb4106dc15cfccbeda83a6524` |

### 2.2 机制行号独立复核（DSH 0.1.6-alpha.1）

方法：直接读取 `DSH_FORK_CHECKOUT` 源码（`$DSH_FORK_CHECKOUT`，根包 0.1.6-alpha.1）。**行号为本方案实测**，与技术架构正文所引 0.1.5-rc.2 行号可能有偏移，执行时以本节为准。

| 机制 | 本方案实测位置 | 技术架构所引 | 裁决 |
| --- | --- | --- | --- |
| `DomainFacility` 实例持有 `domains` Map 与 `reserved` Set | `packages/storage/storage-domain/src/index.ts:69-72` | `:65-72` | 成立（行号偏移 4） |
| 同实例同名 open 抛 `DomainError('already-open')` | 同上 `:104-107` | `:103-107` | 成立 |
| JSON 后端**无跨进程写锁** | `packages/storage/storage-json/README.md:142` | 同 | **逐字一致** |
| `writeAtomic` 为临时文件 + rename，非跨进程独占 | `packages/storage/storage-json/src/atomic.ts:24-35` | 同 | 成立 |
| patch 循环：未命中 `warn` 后 `continue` | `vendor/include/src/index.ts:109-113` | `:111-119` | 成立（行号偏移） |
| patch：`name` 不匹配 warn 后跳过 | 同上 `:115-118` | 同区段 | 成立 |
| patch 覆盖为逐键赋值 → config 整体替换 | 同上 `:120-123` | `:121-124` | 成立 |
| `insert` 目标不存在/非组 → warn 后跳过 | 同上 `:79-91` | `:83-90` | 成立 |
| 新插入行被索引，供**同层后续 patch** 命中 | 同上 `:66-73`、`:100` | `:96-101` | 成立 |
| bundle 解析失败 / 缺 `dsh.bundle` → 抛错 | `packages/boot/app-boot/src/profile.ts:876-885`（`:880-882` 抛） | `:784-793` | 成立（行号偏移大） |
| `patchReload` 取值仅 live/startup，非法抛错 | 同上 `:869-875` | `:776-782` | 成立 |
| 自定义 profile 默认 `live` | 同上 `:171` | `:137` | 成立 |
| 内置模板：`web` 为 live，其余 startup | 同上 `:139-159`（web `:146`） | `:108-125` | 成立 |
| 层序 = bundlePatches → profile.patches → homePatches → overlays | `apps/cli/src/profile-boot.ts:212-218` | `:206-213` | 成立 |
| home 层 patch 路径 = `$DSH_HOME/cordis.patch.yml` | 同上 `:77-79` | `:68-75` | 成立 |
| 仅 `live` 挂 watcher；`startup` 不挂 | 同上 `:374-401` | `:353-385` | 成立 |
| dump 与 boot 共用同一扁平化算法 | `packages/boot/app-boot/src/index.ts:423-486`（`:455-463` snapshot） | `:409-472` | 成立 |
| dump 为每段行标注来源层与修补层 | 同上 `:466`、`:477-483` | `:388-395`、`:452-471` | 成立 |
| `--dump-config` 与 `--dump-default-config` 互斥 | `apps/cli/src/args.ts:103-105` | 同 | 成立 |
| dump 不接受 app 参数 | 同上 `:109-111` | — | **本方案新增** |
| `--dump-default-config` 拒绝 `--patch` | 同上 `:113-115` | 同 | 成立 |
| `runPlugin` 仅 pnpm 退出 0 才 reconcile，无回滚 | `apps/cli/src/plugin.ts:120-162`（`:148-149`） | 同 | 成立 |
| reconcile 以「已安装状态」校对，移除分支无专门告警 | 同上 `:59-91`（`:82-86`） | `:59-91`、`:77-90` | 成立 |
| `storage` / `storage-json` / `storage-domain` 行与默认根 | `packages/bundle/base/cordis.patch.yml:145-156`（sessions `:110-113`、storages `:148-151`） | `:148-156`、`:109-113` | 成立 |
| home 解析优先级：configured → `$DSH_HOME` → `~/.dsh` | `packages/util/home-paths/src/index.ts:87-91` | `:77-99` | 成立 |

### 2.3 独立复核发现的偏差（本方案对基线的净增量）

**Q1〔已变化〕DSH fork 主检出 HEAD 已前移，与 r002 基线/task-1 的记录不一致。**

```
命令: git -C $DSH_FORK_CHECKOUT rev-parse HEAD
输出: abdfeb4831e163462ea4dd17ca5bb4e581d40d1c        (exit 0)
命令: git -C ... branch --show-current
输出: codex/team-roster-model                          (exit 0)
命令: git -C ... status --porcelain
输出: " M AGENTS.md" + 3 个未跟踪 note 文件            (exit 0)
命令: git -C ... merge-base --is-ancestor 0d1f5000… HEAD ; echo $LASTEXITCODE
输出: exit=0   （0d1f5000 是 HEAD 的祖先）
命令: git -C ... rev-list --count 0d1f5000…HEAD
输出: 1
命令: git -C ... worktree 的 .worktrees/team
输出: HEAD 0d1f5000…，分支 codex/dsh-team-adaptation   (exit 0)
```

- r002 基线与 task-1 均以 `0d1f5000…` 描述 fork 状态；**主检出已多出 1 个提交** `abdfeb48…`（`fix(agent-team): report a Session's current model in the roster`，2026-09-16 12:32:35 +08:00）。
- r001 已安装 runtime 的 `release.json.sourceCommit` 为 `0d1f50007f9bca3f52b06e1c3074fa14d5fb0720`。
- **对验收的影响**：任何以「checkout 源码」代替「已安装工件」的结论现在多了一层漂移（SOLO-ACC-CE-I 的同类错误）。本方案强制：**所有判据绑定已安装 runtime 工件哈希，不绑定 fork HEAD**；引用源码行号时写明是「0.1.6-alpha.1 源码，与 r002 工件同版本号但不同提交」。
- **不构成**：不证明该提交影响任何被测机制（未做 diff 分析）；不授权 fetch/构建/回退该仓库（基线 §6 A6）。

**Q2〔本方案新增〕`--dump-config` 会写盘，不是纯只读操作。**

`apps/cli/src/profile-boot.ts` 的 `prepareProfile` 在返回前执行
`writeFileSync(join(profile.dir, PROFILE_ROOT_FILENAME), PROFILE_ROOT_CONFIG)`，
即每次 dump 都会重写 `<home>/profiles/<name>/cordis.yml`。

- 技术架构 §11.1 说「dump 不启动进程、不求值 `!!js`」——**成立**；但「不启动进程」**不等于**「不写文件」。
- **对 ACC-01 的影响**：dump 前后必须记录 `cordis.yml` 的 mtime 与哈希，并在证据中说明该写入属预期行为，否则「组合未变」的结论会被一次意外写盘污染。

**Q3〔本方案新增〕dump 命令不得带 app 参数。**

`args.ts:109-111`：dump 模式下 `args.length > 0` 直接 `program.error`。
因启动器 `allowUnknownOption().passThroughOptions()`，`--port 55202` 会被当作 app 参数。

- **正确形式**：`node <runtime>/node_modules/@deepseek-ai/dsh/lib/bin.js --profile soloips --dump-config`
- **错误形式**（会失败）：`… --profile soloips --dump-config --port 55202`
- 该错误本身是 ACC-01 失败分支的一条可观察判据。

**Q4〔本方案新增〕`runtime.ps1` 不能管理两个共享同一 runtime 入口的进程，也不能管理第二个 profile 名。**

| 实测位置 | 行为 | 对 ACC-09 的后果 |
| --- | --- | --- |
| `runtime.ps1:304-305` | `start` 时若**任何** `node.exe` 命令行含本 runtime 的 entry 路径即抛错 | 同一 runtime 不能起第二个 Host |
| `runtime.ps1:306-307` | 端口已监听即抛错 | 两进程必须不同端口 |
| `runtime.ps1:135` | 期望命令行硬编码 `--profile soloips --port <release.port> --no-open` | 一个版本根只能一个 profile/端口 |
| `runtime.ps1:253` | `profilePath` 硬编码 `home\profiles\soloips` | 不能管理第二个 profile 名 |
| `runtime.ps1:245` | `versionId` 必须匹配目录名 `^r[0-9]{3,}$` | QA 版本根须用 r9xx 命名 |
| `runtime.ps1:215` | 强制 profile `patchReload: startup` | 受管实例天然满足 ARCH-D04；**但这不替代** ACC-05 对 dump 的核对 |
| `runtime.ps1:296` | `stop` = `process.Kill()` | **不是**优雅排空；不得据此宣称写入口已排空 |
| `runtime.ps1:34` | 拒绝 Windows 短名别名 `~[0-9]` | 别名用例须另找别名形式（见 ACC-09 子场景 3） |
| `runtime.ps1:42-55` | 拒绝托管路径上任意 reparse point | 测试根不得含 junction/symlink |
| `runtime.ps1:195` | 要求 Node 24.x | QA 必须用 Node 24 执行 |
| `runtime.ps1:186-188` | 要求清空 `NODE_OPTIONS`/`NODE_PATH` | QA 启动前须显式清理 |

- **结论**：ACC-09 的第二个 Host **必须**用独立版本根（独立 runtime 入口），或直接用官方 CLI 入口启动并完整记录命令行与哈希。本方案采用**双版本根**方案（见 §7）。

**Q5〔源码事实〕官方 SDK 的隐式重试已被显式关闭，但 provider 级策略仍在。**

- `packages/llm/llm-pi-ai/src/adapter.ts:130` 传入 `maxRetries: 0`；
- 已安装的 `@earendil-works/pi-ai/dist/api/openai-completions.js:211` 亦在 `requestOptions` 中写死 `maxRetries: 0`，并通过 `retryProviderRequest(..., { maxRetries: options?.maxRetries })` 包裹；
- `packages/llm/llm/src/retry-policy.ts:14-24`：默认 `maxRetries = 5`，可重试码 `[EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT]`；
- `packages/llm/llm-pi-ai/src/config.ts:370-379`：旧 `maxRetries`/`maxRetryDelayMs` 已移除，改由 `retryPolicy` + `dsh-llm-retry` 组合；
- `packages/llm/llm-retry/src/index.ts:24-28`：`llm-retry` 自身**无 config**，策略由 provider 拥有。

- **对 ACC-07 的影响**：这是 DEV-07「评审必须检查实际 SDK、中间件与模型适配器的重试行为」的**可执行证据点**。判据不能只看业务层 `catch`，必须同时断言：(a) 替身收到的请求数，(b) `llm-retry` 行的实际生效状态，(c) provider `retryPolicy` 的实际取值。
- **〔未验证〕** r001 profile 关闭 `llm-retry` 行的实际效果未在本轮运行验证；且「关闭一次请求重试」**不证明**全团队已自动停线（r002 基线 §5）。

**Q6〔源码事实〕站内通知的可观察面。**

`packages/client/ui-chat/src/client/conversation-nodes/event-projection.ts:39` 的 `KnownContextForm` 含 `'notice'`，说明会话投影存在 notice 形态。**〔未验证〕** 首片停线通知是否落到该形态、是否在 Web 可见，本轮未运行验证，执行 ACC-08 时必须实测并如实记录。

### 2.4 r001 与 55120 的只读事实（用于证明隔离）

```
命令: Get-NetTCPConnection -State Listen | Where LocalPort -ge 55200 -and -le 55230
输出: 0.0.0.0:55201 LISTENING PID 40724        (exit 0)
命令: 同上，LocalPort -ge 55202 -and -le 55230
输出: （空）                                    (exit 0)
命令: Get-ChildItem SOLOIPS_DEVS_ROOT/versions
输出: 仅 r001                                   (exit 0)
```

- `…/r001/release.json`：`port 55201`、`profile soloips`、`sourceCommit 0d1f5000…`、`dshVersion 0.1.6-alpha.1`。
- `…/r001/home/profiles/soloips/package.json`：`patchReload: startup`，bundles 12 项（官方 4 + `@linxin666/*` 8）。
- `…/r001/home/profiles/soloips/cordis.patch.yml`：`llm-retry disabled: true`；`webserver` 行 `host 0.0.0.0 / port 55201`。
- `…/r001/home/cordis.patch.yml` **不存在**（home 层 overlay 未启用）。
- **隔离结论**：r001 占用 55201 且正在运行；55202–55230 全空闲；`versions/` 下无 r002。本方案的全部测试根**不得**位于 `…/r001/` 之下。

---

## 3. 必须写进每条执行记录的反面声明

执行任何场景时，证据文件**必须**逐条抄录并勾选以下声明；缺一条即该次证据不可用于宣称通过。

| # | 反面声明 | 依据 | 执行时的具体检查 |
| --- | --- | --- | --- |
| N1 | bundles 数组含包名**不是**装配证据 | SOLO-REG-04 | 必须给 L2 生效树中的对应行 + 一次功能探针；只有 `package.json` 的 `bundles` 数组即失败 |
| N2 | 进程退出码 0 **不是**组合正确证据 | SOLO-F06、§11.1 | 未命中的 patch 会 warn/skip；必须比对带来源标注的 dump 与期望 entry/字段 |
| N3 | 清空数据后能启动**不算**恢复通过 | SOLO-ACC-05 | 必须用**写入前同一数据根**读回同一批业务事实；空根启动只能证明「能启动」 |
| N4 | 同实例 `already-open` **不能**替代跨 Host 独占 | MECH-05、SOLO-ACC-02/09 | 跨进程结论只认两个真实进程；`DomainFacility` 的 `reserved` Set 是进程内的 |
| N5 | 通知的 `accepted` **不等于** `delivered` | SOLO-ACC-08、SOLO-F09 | 必须分开记录「已请求发送」与「已确认送达」；无回执能力时标**未知**，不得写「已通知」 |
| N6 | 构建成功**不是**产品验收 | 项目红线、SOLOIP-DOC-001 §5 | 构建/安装/实际调用/冷启动恢复/目标集成/用户验收分层记录，一层不替代另一层 |
| N7 | `--dump-config` 通过**不等于**功能可用 | §1.3 反面声明 | dump 不启动服务、不验证数据读写（SOLO-C06） |
| N8 | 安装/启用**不等于**实际被调用 | SOLO-REG-04 | 必须有实际调用计数（如替身收到的请求数） |
| N9 | 历史观察**不等于**当前组合 | ENV-04、§11.4 | 每次动作前按 ENV-03 重新核实 home/profile/patchReload/端口 |

---

## 4. 隔离测试根方案（ARCH-D03 / SOLO-DATA-02）

### 4.1 根布局

**任务专属根**（唯一写面，`.gitignore` 已排除 `.artifacts/operations/`，不入 git）：

```text
SOLOIPS_ROOT/.artifacts/operations/r002-qa-20260916/
  acceptance-plan.md                 # 本文件
  run/                               # 全部 QA 运行数据；每个场景一个子树
    <SCENARIO>/                      # 例如 ACC-05、ACC-09
      a/r901/                        # 版本根 A（leaf 必须匹配 ^r[0-9]{3,}$）
        release.json                 # 由 r002 版本根派生；路径与端口改为 QA 值
        artifacts/                   # 固定 tgz（从 r002 artifacts 复制，逐个记录 SHA-256）
        runtime/                     # 由工件安装；node_modules/@deepseek-ai/dsh 为正式入口
        home/                        # 本场景独占 DSH_HOME
          settings.yaml              # 合成配置；见 §4.2
          profiles/soloips/          # 三件套 + 锁
        agents/                      # DSH_AGENTS_HOME
        logs/                        # runtime.ps1 的 stdout/stderr
      b/r902/                        # 仅 ACC-09/ACC-10 需要第二 Host
      shared-business/               # 跨 Host 共享的规范化业务根（仅竞争类场景）
      stub/                          # 离线替身（仅 ACC-07/08）
      evidence/                      # 命令输出、哈希清单、dump、读回记录
  receipts/                          # 跨场景汇总回执（DEV-13 模板实例）
```

**命名纪律**：版本根 leaf 一律 `r901`/`r902`/…（避开 r001/r002，避免与真实版本混淆；`runtime.ps1:245` 要求 `^r[0-9]{3,}$`）。

### 4.2 禁止项与逐条检查

| 禁止 | 检查方法 | 失败即中止 |
| --- | --- | --- |
| 复用 r001 home | 断言 QA 根不在 `…/versions/r001` 之下；断言 `DSH_HOME` 指向 QA 根 | 是 |
| 使用用户 Session | QA home 为**新建空目录**；断言 `home/sessions` 在运行前为空或不存在；断言未引用 `%USERPROFILE%\.dsh` | 是 |
| 使用生产数据 | 断言未触碰 `LAUNCH_ROOT`、55120 home、`…/versions/r001`；断言 QA 根内无指向上述位置的链接 | 是 |
| 复用真实凭据 | `settings.yaml` 只含**合成** provider 与占位 env 名；断言 QA home 无 `.credentials.yaml` 真实内容；断言 `DEEPSEEK_API_KEY` 等真实键为空 | 是 |
| 触碰 55120 / r001 进程 | 运行前后各执行一次端口与进程快照；断言 55201 与 55120 的 PID 未变 | 是 |
| 真实付费上游故障 | 断言替身仅监听 `127.0.0.1`；断言替身请求日志覆盖全部模型请求；见 §8.2 | 是 |
| 使用 `--latest` 或原地升级 | 断言未执行任何 `update`；断言工件哈希与 r002 一致 | 是 |
| `agent-swarm` 进入实例 | 断言 settings 无 `agent-swarm` 命名空间（`runtime.ps1:226-231` 亦会拒绝） | 是 |

**根级断言命令**（每次场景前后各跑一次，退出码与输出入证据）：

```powershell
# 隔离断言（工作目录 = SOLOIPS_ROOT）
$qa = "$SOLOIPS_ROOT\.artifacts\operations\r002-qa-20260916\run"
if ((Resolve-Path $qa).Path -like "*\versions\r001*") { throw "QA root must not be under r001" }
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 55201,55120 } |
  Select-Object LocalPort, OwningProcess | ConvertTo-Json    # 前后 PID 必须一致
Get-ChildItem "$qa\*\*\home\sessions" -ErrorAction SilentlyContinue |
  Measure-Object | Select-Object -ExpandProperty Count        # 运行前必须为 0/不存在
```

### 4.3 场景 × home / profile / backend / 端口 分配

端口均为实测空闲（55202–55230）；全部避开 3092–3095、55120、55201。

| 场景 | 执行就绪度 | home（每场景独占） | profile | backend / 数据根 | 端口 | 服务启动 |
| --- | --- | --- | --- | --- | --- | --- |
| ACC-01 组合装配 | **P**（需 `profiles/soloips`） | `run/ACC-01/a/r901/home` | `soloips` | 不涉及（dump 不读业务） | **不需要** | 否（dump 不启动） |
| ACC-02 同实例 already-open | **M** | `run/ACC-02/a/r901/home` | `soloips-qa-probe` | json，`root` 指向 `run/ACC-02/business` | 55210 | 是 |
| ACC-03 异名双写探测 | **P** | `run/ACC-03/a/r901/home` | `soloips` | 各业务事实各自的权威介质 | 55211 | 是 |
| ACC-04 半状态拒绝 | **P** | `run/ACC-04/a/r901/home` | `soloips` | json，`run/ACC-04/business` | 55212 | 是 |
| ACC-05 冷启动读回 | **P**（机制半程 **M**） | `run/ACC-05/a/r901/home` | `soloips` | json，`run/ACC-05/business`（**固定不变**） | 55213 | 是（两次） |
| ACC-06 回滚 | **P** | `run/ACC-06/{old,new}/r90{1,2}/home` | `soloips` | 各自 + `run/ACC-06/checkpoint` | 55214 / 55215 | 是 |
| ACC-07 首错停线 | **P** | `run/ACC-07/a/r901/home` | `soloips` | json + `run/ACC-07/stub` | 55216 | 是 |
| ACC-08 通知占位 | **P** | 同 ACC-07（同一次运行复用） | `soloips` | 同 ACC-07 | 55216 | 是 |
| ACC-09 跨 Host 独占 | **P**（机制层 **M**） | `run/ACC-09/{a/r901,b/r902}/home` | `soloips` ×2 | **共享** `run/ACC-09/shared-business` | 55217 / 55218 | 是（两进程） |
| ACC-10 数据根隔离 | **M**（机制层） | `run/ACC-10/{h1,h2}/…/home` + `h3` 同 home 双 profile | `soloips` / `soloips-alt` | 三个互异根 + 一个越界根 | 55219 / 55220 | 是 |
| CE-A…CE-I | 见 §6 | 每例 `run/CE-<X>/…` | 见 §6 | 见 §6 | 55221+ | 多数否 |

**backend 统一取值**：`storage-domain` 行 `backend: json`，`storage-json` 行 `root: <绝对路径>`。
覆写这两行时**必须完整重述该行全部 config**（SOLO-C03）：`storage-json` 只有 `root` 一个键，`storage-domain` 只有 `backend` 一个键；少写即静默删除其余键。

### 4.4 启动器使用纪律

- **受管启动**（推荐用于需要 integrity 校验的场景）：`runtime.ps1 -Action verify|start|status|stop -VersionRoot <QA 版本根>`。
- **不受管启动**（仅 ACC-09 的第二进程与 ACC-07 的 headless 一次性运行）：直接执行
  `node <runtime>/node_modules/@deepseek-ai/dsh/lib/bin.js --profile soloips --port <N> --no-open`，
  并**记录**：可执行文件绝对路径与 SHA-256、完整命令行、PID、创建时间、`DSH_HOME`、`DSH_AGENTS_HOME`。理由见 Q4。
- **`stop` 语义**：`runtime.ps1:296` 为 `Kill()`。任何「写入口已关闭/已排空」的结论**不得**由退出码或 `state: stopped` 推出，必须另有独立证据（端口不再监听 + 无同 entry 的 node.exe + 一次失败的写入尝试）。
- **执行前环境**：清空 `NODE_OPTIONS`/`NODE_PATH`（`runtime.ps1:186-188`）；`DSH_TELEMETRY_DISABLED=1`（参照 `profiles/development/verify-preset.mjs:96` 的既有做法）。

---

## 5. SOLO-ACC-01–10 逐条执行方案

> 每条格式：**起点 → 动作 → 通过判据 → 失败判据 → 输入/工件/命令**。
> 判据一律写成「不修改任何代码的观察者可复现」的形式（命令输出、退出码、日志行、状态文件内容），符合技术架构附录 B 的通用判定约定。

### 5.1 SOLO-ACC-01 组合装配：部署组合 == 验收组合

- **起点**：`profiles/soloips/` 三件套已存在并锁定；QA 版本根的 runtime 由 r002 固定工件安装；L1/L2 基线快照已受版本控制。
- **动作**：
  1. 记录 layer 输入：`home/profiles/soloips/package.json`（bundles 顺序）、`home/profiles/soloips/cordis.patch.yml`、`home/cordis.patch.yml`（若存在）、`--patch` overlay 列表、全部 bundle 工件的 SHA-256 与锁文件 SHA-256。
  2. 生成 **L1**：`node <runtime>/…/lib/bin.js --profile soloips --dump-default-config > evidence/L1.dump.yml`
  3. 生成 **L2**：`node <runtime>/…/lib/bin.js --profile soloips --dump-config > evidence/L2.dump.yml`
  4. 记录 dump 前后 `home/profiles/soloips/cordis.yml` 的 SHA-256 与 mtime（见 Q2）。
  5. 逐行比对 L2 与受版本控制的验收组合清单：层序、每个 `soloips-*` 行的 `id`/`name`/`config`、来源注释归属层。
  6. entry id 唯一性断言（对 L2 导出的 entry 结构执行，不只看文本）。
  7. 功能探针：至少一次真实调用证明该包被实际执行（SOLO-REG-04 要求「L2 行 + 一次功能探针」）。
- **通过判据**：
  - L2 含四个 `soloips-*` 行，且各自 `# ==` 来源注释指向预期层；
  - entry id 全树唯一（断言脚本退出码 0）；
  - 每个预期字段的值与验收清单逐字一致；
  - 无非预期 patch 告警（stderr 中无 `patch: entry ... not found` / `name mismatch` / `insert: entry ... not found`）；
  - 功能探针实际执行并留下调用记录。
- **失败判据**：层序不一致、缺层、多出层、预期字段/entry 缺失或重复、出现非预期 patch 告警、`soloips-*` 行只出现在 `package.json` 的 `bundles` 而未出现在 L2。
- **输入/工件/命令**：
  ```powershell
  $cli = "<QA 版本根>\runtime\node_modules\@deepseek-ai\dsh\lib\bin.js"
  $env:DSH_HOME = "<QA 版本根>\home"; $env:DSH_AGENTS_HOME = "<QA 版本根>\agents"
  $env:NODE_OPTIONS = $null; $env:NODE_PATH = $null; $env:DSH_TELEMETRY_DISABLED = "1"
  node $cli --profile soloips --dump-default-config > evidence\L1.dump.yml; "L1 exit=$LASTEXITCODE"
  node $cli --profile soloips --dump-config        > evidence\L2.dump.yml; "L2 exit=$LASTEXITCODE"
  Get-FileHash evidence\L1.dump.yml, evidence\L2.dump.yml -Algorithm SHA256
  ```
- **禁止的替代做法**：以「profile 能启动、退出码 0」推断组合正确（N2）；以 `bundles` 数组含包名作为装配证据（N1）；以 checkout 源码推断部署组合（SOLO-ACC-CE-I）。
- **失败恢复**：若 profile 自身 `cordis.patch.yml` 损坏导致 dump 失败，改用 `--dump-default-config`（跳过用户层），**不得**换一个 profile 重跑以绕开（§11.1）。

### 5.2 SOLO-ACC-02 同一 facility 的重复 open 拒绝

- **起点**：任务专属临时根；同一 `DomainFacility` 已打开待测 domain；与生产根隔离。
- **动作**：在同实例内分别**顺序**与**并发**打开同名 domain；可从同包与不同包触发。
- **通过判据**：第二次 open 以 `DomainError('already-open')` 拒绝，**无第二 handle**；首次 handle 与已写状态完整（写后读回一致）。经真实激活路径触发时，另记录错误可见性与该路径的退出行为。
- **失败判据**：重复 open 成功；或错误被吞并并据此宣称双 writer 安全。
- **权威/边界**：源码保证只来自**本实例**的 `reserved` Set（`storage-domain/src/index.ts:72`）。该拒绝**不**证明整进程非零退出，**不**证明 ORG-06。
- **输入/工件/命令**：测试专属插件（置于 QA 根，**不**写入 `packages/**`），经 `--patch` overlay 挂载：
  ```yaml
  # run/ACC-02/overlay/acc02.yml
  - insert:
      - id: qa-acc02-probe
        name: '<file URL of run/ACC-02/probe/acc02.mjs>'
  ```
  探针调用公开 `ctx.storageDomain.open(spec)` 两次（顺序 + `Promise.all` 并发），把 `{ok, code, message}` 逐次写入 `evidence/acc02.json`。
- **禁止的替代做法**：用本场景结论替代跨 Host 独占（N4）。

### 5.3 SOLO-ACC-03 异名双写探测

- **起点**：业务事实清单已枚举（入职状态 ORG-03、员工占用 ORG-05、任务/attempt 状态、artifact version、审核 receipt、mailbox）。
- **动作**：对**每项**业务事实指出唯一权威服务及实际持久介质/记录；对使用 domain 的注明 domain + 表。
- **通过判据**：每项都能指出唯一权威 + 实际介质；官方 Team/Session 的日志**未**被复制入 core 表（归属按 SOLO-TEAM-03）。
- **失败判据**：任一项指不出唯一权威 → 记为〔未验证〕缺口，**不得**在文档中写为「已保证」。
- **输入/工件/命令**：静态枚举 + 每次写入后对实际介质的直接读取（`run/ACC-03/business/**` 的文件清单与内容哈希）。
- **说明**：本条主要是**可核对性**验收，不是单次运行；产出是「事实 → 权威 → 介质」对照表 + 介质读回证据。

### 5.4 SOLO-ACC-04 半状态拒绝：入职未过不得进入工作路径

- **起点**：某员工入职检查（完整入职 ORG-03）未通过。
- **动作**：**分别**触发并拒绝三条路径：(a) 经理显式派单；(b) 员工自领 open-claim 任务；(c) 自动调度器分配。
- **通过判据**：三条路径**均**被拒；返回**具体缺项原因**（非泛化失败）；重试有界且**不重建员工身份**；任务保持 `pending` / `ready=false`。
- **失败判据**：任一路径放行；放行「资料文件数量合格但内容无效」的员工；拒绝后反复重建员工身份。
- **失败恢复**：缺项必须可修正并重试至通过；重试**不得**产生第二条员工身份或第二个 appointment。
- **输入/工件/命令**：三条路径各一次调用记录 + 每次拒绝的 `{code, reason, hint}` + 任务状态读回 + 员工身份计数前后一致。
- **已知缺口**：`docs/technical-architecture.md:601` 记录 `getEmployeeOnboardingGaps` 只检查 `profileRef`/`avatarText` 是否缺省，且 `ORG_ALLOW_LEGACY_UNBOUND` 在无 binding 时放行；须在正式业务入口启用前修正。**源码已核对不等于本场景通过**。

### 5.5 SOLO-ACC-05 写入 → 停止 → 冷启动 → 读回

见 §9 的完整编排。要点：

- `patchReload` **必须**为 `startup`（ARCH-D04〔约束〕、§11.8）；`runtime.ps1:215` 亦强制该值。
- 停止**不是**优雅排空（Q4）；必须另有「写入口已关闭」的独立证据。
- 反面声明：清空数据后能启动**不算**恢复通过（N3）；`patchReload: live` 下进程未重启**不算**执行了本场景。

### 5.6 SOLO-ACC-06 装配回退与状态恢复分开验收

- **起点**：绑定 SOLO-DATA-02 的旧/新工件、profile、home、实际数据根、schema 与媒体位置；旧装配可重现；切换满足 SOLO-DATA-03、SOLO-ACC-09；使用专属临时根与合成状态。
- **分支 A（装配回退）**：候选未改变状态，或已有证据证明旧组合能读取候选写入后的 schema/语义。停止候选并关闭写入口 → 恢复旧装配 → 取得同一数据根唯一写权 → 重新打开 domain、完成恢复后读回核对。
  - **失败判据**：以「旧 profile 成功启动」代替兼容性证明。
- **分支 B（状态恢复）**：已有 SOLO-DATA-04 的一致检查点、对应旧装配与升级后有效变化的保全/处置方案。在停写且排空的边界把检查点恢复到**隔离根**，核对公司、任务、身份/Session 引用与媒体字节；按 `operationId`/`jobId` 对账外部实际结果。
  - **失败判据**：有效 root 漂移、旧 schema 不可读、仅备份 manifest、快照跨域不一致、丢失有效变化未处置、失权 writer 仍可写、把「新 profile 启动」报成恢复完成。
- **执行条件**：**按需执行**（发布切换时）。前置未定义时**不可执行**，不得给通过结论。
- **机制边界**：`dsh plugin` 不提供安装快照或业务状态回滚（SOLO-F07）；默认同 home 共享数据（SOLO-DATA-01）。双 profile 与 manifest 快照均**不能**单独解决状态恢复。

### 5.7 SOLO-ACC-07 首错停线（细化 ORG-A09 / ORG-13）

见 §8 的完整编排。要点：离线受控替身注入；断言首错立即可见、受影响执行与依赖派工停止、无静默重试/换路由/换账号/换模型/自动续跑、身份/任务/attempt/产物/Session 历史保留、无关工作未被任意处置。

### 5.8 SOLO-ACC-08 通知占位与后续交付

见 §8.5。要点：`accepted` 与 `delivered` **分开**（N5）；通道失败**不解除**停线；站内提示始终保留；通知不得含密钥、完整提示词、私有记忆或完整日志。

### 5.9 SOLO-ACC-09 跨 Host 与实际独占

见 §7 的完整编排。五个子场景：第二 Host、打开路径绕过、路径别名、失权旧 handle、检查/发布竞争、崩溃恢复。

### 5.10 SOLO-ACC-10 实际根绑定

- **起点**：两个不同 home 的临时实例，以及同一临时 home 下的两个 profile；无生产数据引用。
- **动作**：
  1. 读取各实例真实 backend / Session / 资产路由；
  2. 写入互异的合成标记；
  3. 分别验证不同 home 的隔离、同 home 的默认共享；
  4. 以路径别名或 overlay 尝试把验证根指向已有受保护临时根。
- **通过判据**：不同 home 且路由隔离时标记互不可见；同 home 默认共享被**明确识别**，第二 writer 受 SOLO-ACC-09 拒绝；错误 root 在**业务写入前**被门禁拒绝；绑定清单与实际读回一致。
- **失败判据**：只检查 profile 名；把目录不同当介质不同；home/overlay 漂移绕开独占；资产引用仍回指另一环境却声称完全隔离。
- **输入/工件/命令**：`DSH_HOME=h1|h2|h3` 三个实例 + `h3` 下 `soloips`/`soloips-alt` 两个 profile；配置表达式与实际解析路径成对记录。
- **反面声明**：**不能**只以不求值 `!!js` 的 dump 证明隔离（§11.10）；必须给出 `storages`/`sessions` 的**实际解析后路径**与写入后的文件落地位置。

---

## 6. SOLO-ACC-CE-A … CE-I 逐条执行方案

> 每条给 **起点 → 动作 → 可观察失败（判定该反例成立）**。全部场景本轮〔未执行〕。

| ID | 就绪度 | 起点 | 动作 | 可观察失败判据（反例成立） | 命令/工件 |
| --- | --- | --- | --- | --- | --- |
| **CE-A** | M | 仅移动 company/collaboration 的 yml 行，声称能保证公司服务先激活 | 在隔离候选中改变两者服务就绪时点并观察激活；另核对同层 patch 的配置遍历 | 激活遵循 service/inject 依赖；**一次恰好同序不能证明 yml 位次提供保证**。若实现依赖位次且在依赖未就绪时放行则失败 | 两份候选 L2 dump 逐行 diff + 就绪时序日志 |
| **CE-B** | M/P | 业务不变量（完整入职 ORG-03 / 单员工占用 ORG-05）只依赖包 patch 的 config 开关 | 在隔离候选的 home 级 `cordis.patch.yml` 覆写同一行 config 并去掉该开关 | 若缺少业务门禁仍可提交违规状态，则反例成立。**启动/日志结果按实际记录，不预设必成功或无错误** | home 层 patch + 违规提交尝试 + 介质读回 |
| **CE-C** | M | 隔离 profile 的 patch 依赖某行名/scope | 切换到该行消失或改名的 DSH 候选，核对完整导出及实际入口 | 未命中分支可跳过该 patch；若预期 entry/字段缺失却被发布门禁接受，则反例成立。**记录真实退出码与日志，不预设 0 或一行 stderr** | 改名候选 + L2 dump + 门禁脚本退出码 |
| **CE-D** | M | 在临时 profile 成功安装 A，并记录 manifest/lockfile/node_modules 基线 | 安装 B 时受控失败，逐项检查文件和安装闭包实际差异 | 可能留下部分变更且 DSH **不自动恢复**；须报告实际残留，**不能预设** manifest 必含 A+B | `dsh plugin --profile <p> add <B>` 受控失败（离线 tgz 缺失/校验不符）+ 前后三件套哈希 |
| **CE-E** | M | 受依赖管理的某包已列入 bundles | 升级至丢失 `dsh.bundle` 的候选并完成 reconcile，核对后续完整组合 | 该项从 bundles 移除；若能力未由其他合法入口提供且遗漏未被发布门禁发现，则反例成立。**整体启动、功能与告警按实际观察，不预设必成功或全无告警** | 构造无 `dsh.bundle` 的候选 tgz + `plugin.ts:59-91` 路径 + L2 dump |
| **CE-F** | M | 两个包通过同一 facility 打开 storage domain | 顺序或并发 open 同名 domain | 第二次 `already-open`；改用**异名**并写同一业务事实仍可能双写；**换 facility/进程不能据该错误预测结果** | 同 ACC-02 探针 + 异名双写尝试 |
| **CE-G** | **P** | 建员工 + 过入职门 + 绑 Session + 建私有记忆 | 让这些写入跨越两个包各自 commit | 出现半状态：员工已建但入职未过；或 attempt 已建但所属员工不在 roster | 需产品实现；跨包事务「不存在」目前是〔推断〕，**不得**因表格整齐升格为事实 |
| **CE-H** | M | 隔离的**历史兼容 profile 显式 live**，先记录成功运行组合 | 注入受控失败编辑，观察实际更新/回滚；恢复可加载候选后执行停止、冷启动与读回 | 若把未生效的磁盘候选、恢复失败状态或重启后的另一组合当同次验证通过，则反例成立。**分别记录**更新、回滚与冷启动结果；任何一次失败**不自动**证明旧树完整 | QA 专属 live profile（**不操作 55120**）+ `vendor/hmr/src/index.ts` 事件日志 |
| **CE-I** | M | checkout 源码与部署包各自构建 | 用 checkout 构建产物去验收 55120 | 验收的包 ≠ 部署的包 | **本轮实测见 §2.3 Q1**：fork 主检出 HEAD `abdfeb48…` ≠ r001 `release.json.sourceCommit 0d1f5000…`；且主检出工作树为脏（` M AGENTS.md` + 3 未跟踪） |

**CE-G 的证据诚实说明（必须随证据抄录）**：跨包事务「不存在」目前是〔推断〕，未取得正面源码证据。关键词检索无结果**不等于**证明不存在；实现阶段必须重核。在此之前 CE-G 的交付标签保持〔提案〕，**不得**因表格整齐而升格为事实。

**CE-H 的隔离纪律**：使用 QA 专属 live profile 与 QA home；**不得**在 55120 或 r001 上做 live reload 实验（`docs/technical-architecture.md:1096` 明确「场景不操作 55120」）。

---

## 7. SOLO-ACC-09 双真实进程编排（详）

### 7.1 共同前置

- 目标安装候选：QA 版本根 A `r901` 与 B `r902`，两者 runtime 均由**同一批 r002 固定工件**安装，工件 SHA-256 逐个记录并断言一致。
- 实际目标文件系统：Windows NTFS 本地盘（非网络盘、非可移动盘）。
- 专属临时根与合成业务数据：`run/ACC-09/shared-business`（两进程**共享**的规范化业务根）。
- **两个真实进程从正式 Host 入口执行**：
  - 进程 A：`runtime.ps1 -Action start -VersionRoot <…>/a/r901`
  - 进程 B：`runtime.ps1 -Action start -VersionRoot <…>/b/r902`
  - 二者各自是独立 OS 进程、独立 runtime 入口、独立 home/agents、独立端口（55217/55218）。
  - **不以同一 JS 对象代替进程**：判据必须包含两个不同的 PID、两个不同的可执行文件路径、两个不同的命令行、两个不同的 `process.json`/启动回执，以及两个进程各自写入的独立证据文件。
  - 若因预算无法准备第二个版本根，退化为「A 受管 + B 直接 CLI 启动」，并**在证据中显式标注** B 未经 integrity 校验，且完整记录其 entry 哈希与命令行。**不得**用同一进程内的两次调用冒充。
- **先枚举所有权威发布点**，纳入公司、Team、迁移与恢复路径（`docs/technical-architecture.md:632` 已核最小集合：7 个公开写方法 / 8 个 put/delete 点 + 部门 2 处；Team、迁移、恢复的完整提交点仍须实施者枚举）。
- **控制通道**：因沙箱环境下 `child_process` 管道 stdio 可能 EPERM，采用**文件通道**（`cmd/*.json` 原子 rename 投递 → `res/*.json` 回执）。该形态已在候选 `tests/helpers/company-writer-process.mjs:1-23,64-77` 与 `company-writer-child-driver.ts:63-88` 中被验证为可行，本方案沿用其形态、**不搬运其代码**。
- 每个 Host 进程加载一个 **QA 专属测试插件**（`--patch` overlay），仅暴露以下 op，全部经**真实公开入口**调用业务服务：

  | op | 语义 | 产出 |
  | --- | --- | --- |
  | `identity` | 回执 PID、创建时间、可执行路径、完整命令行、`DSH_HOME`、端口 | `res/identity.json` |
  | `acquire` | 申请写权（跨进程） | `{ok, generation, incarnation}` 或 `{ok:false, code}` |
  | `write` | 经业务发布点写入合成记录 | `{ok, key, generation, publishedCount}` |
  | `read` | 独立读回指定 key | `{ok, value, generation}` |
  | `hold` | 保持 handle 不释放（用于失权场景） | 阻塞直到 `release` |
  | `probe-handle` | 用**接管前**取得的 handle 尝试发布 | `{ok:false, code:'WRITER_FENCED_OUT'}` 或实际结果 |
  | `pause-before-publish` | 在 fence 检查与发布之间设可控暂停 | 暂停确认 |
  | `crash` | 不清理直接异常退出 | 进程消失，锁/窗口残留 |
  | `release` | 释放写权 | `{ok}` |

### 7.1.1 子场景与 §11.10 的映射（覆盖核对）

任务说明列「五个子场景」（第二 Host 被拒、路径别名绕过、失权旧 handle、检查与发布竞争、崩溃恢复）。`docs/technical-architecture.md` §11.10 的表实际有**六行**，其中「打开路径绕过」与「路径别名」是两行独立门槛。本方案按 §11.10 的六行**全覆盖**（超集），映射如下：

| §11.10 行 | 本方案小节 | 是否被任务说明的五个之一覆盖 |
| --- | --- | --- |
| 第二 Host | §7.2 | 是 |
| 打开路径绕过 | §7.3 | 否（**本方案补足**；任务说明的「路径别名绕过」对应下一行） |
| 路径别名 | §7.4 | 是 |
| 失权旧 handle | §7.5 | 是 |
| 检查/发布竞争 | §7.6 | 是 |
| 崩溃恢复 | §7.7 | 是 |

**不得**以「任务说明只要求五个」为由省略 §7.3：「打开路径绕过」是 ORG-06 在正式公司入口的**准入门槛**（§11.10 原文：缺少有效公司写权时必须在取得可写 domain handle 前拒绝），与「路径别名」是不同失败面。

### 7.2 子场景一：第二 Host 被拒

- **起点**：A 取得写权并已写入合成记录。
- **动作**：B 指向**同一规范化根**申请写权。
- **通过判据**：B 在**业务发布前**被拒（`acquire` 返回失败码，且 B 的 `publishedCount == 0`）；A 状态完整（A 的记录可读回、A 的 generation 未变）。
- **失败判据**：B 可写（`acquire` 成功或 `publishedCount > 0`）。
- **证据**：A/B 各自 `identity.json`、B 的拒绝码、共享根上的记录读回、A 的 generation 前后值。

### 7.3 子场景二：打开路径绕过

- **起点**：正式公司入口存在；候选已知回退路径 `facility ?? ctx.storageDomain`（`organization-assets.ts:78` 一类）。
- **动作**：分别尝试三种绕过：(a) 在正式公司入口**省略专属 facility**；(b) 传入**普通宿主 facility**；(c) 走候选的 `ctx.storageDomain` 回退。
- **通过判据**：缺少有效公司写权时，必须在**取得可写 domain handle 之前**拒绝。
- **失败判据**：先取得可写句柄再在 `put` 处阻止 —— **不能**替代本门槛。取得句柄后失权另按子场景四验收。
- **证据**：三种绕过的返回值与错误码；断言**未**产生 domain handle（探针记录 `handleObtained: false`）。

### 7.4 子场景三：路径别名

- **起点**：B 用目标平台支持的相对/绝对路径、链接或等价别名访问**同一介质**。
- **动作**：对同一共享根构造别名集合并逐个申请写权：
  1. 相对路径（`..\shared-business`）；
  2. 大小写变体（NTFS 大小写不敏感）；
  3. 末尾分隔符变体（`shared-business\`）；
  4. **目录联接 / 符号链接**指向共享根（注意：`runtime.ps1:42-55` 会拒绝托管路径上的 reparse point，因此该别名**只能**作为 `storage-json.root` 的值传入，不能作为版本根/home 路径）；
  5. 8.3 短名（若该卷启用了短名生成；`runtime.ps1:34` 仅在**版本根路径**上拒绝 `~[0-9]`，root 配置值不受该检查）。
- **通过判据**：**仍识别相同独占身份**（拒绝）。
- **失败判据**：产生**第二独占键**并可写。
- **证据**：每种别名下的 `acquire` 结果 + 规范化后的实际路径 + 共享根上的记录数（必须仍为 1 条 writer 记录）。
- **说明**：`docs/technical-architecture.md:459` 明确「路径 resolve **不证明** realpath、大小写别名或链接已经归一」——本条正是该缺口的验收。

### 7.5 子场景四：失权旧 handle

- **起点**：保留 A 的**真实 handle**（`hold`）。
- **动作**：经受控接管使 B 获新代际并写入，再触发 A 的各业务发布点（`probe-handle`）。
- **通过判据**：A 在**持久发布前**被拒；独立 reader 读回 **B 的数据**。
- **失败判据**：A 的写入落在 B 的数据之后（旧写入迟到覆盖）。
- **证据**：A 的 handle 代际 vs B 的 generation；A 的拒绝码（期望 `WRITER_FENCED_OUT` 一类）；独立 reader 的读回值。
- **纪律**：**只测便利 `commitRecord` 不够**（§11.10）；必须覆盖 7 个公开写方法与部门写点中的每一个。

### 7.6 子场景五：检查/发布竞争

- **起点**：在 A 的 fence 检查与发布之间设可控暂停（`pause-before-publish`）。
- **动作**：暂停窗口内尝试 B 接管。
- **通过判据**：**A 合法提交先完成，或 B 先接管且 A 被拒**；**不允许失权发布**。
- **失败判据**：A 在已失权的情况下仍完成发布。
- **证据**：暂停时刻、B 的 `acquire` 结果与时间戳、A 的发布结果与 `publishedCount`、共享根上的最终记录顺序。
- **实现提示**：候选已提供 `beforePublishPauseMs` 一类的暂停缝并在暂停**两侧**各做一次 fence 复核（`company-writer-store.ts:66-93`）；QA 的暂停 op 应复用**产品公开**的等价缝，不得为此修改产品代码。

### 7.7 子场景六：崩溃恢复

- **起点**：A 写入后**异常退出**（`crash`，不清理）。
- **动作**：按**指定维护协议**恢复并接管。
- **通过判据**：原数据和未决 `operationId` 可核对；**恢复完成前不派工**；**无重复 attempt**。
- **失败判据**：**盲目清锁**（按文件年龄删除锁）；或旧写入迟到覆盖。
- **证据**：崩溃时的进程身份与退出方式；残留锁/窗口文件的实际内容与时间戳；恢复入口的调用记录与返回收据（`recoveryWatermark`、generation）；恢复期间派工尝试被拒的记录；attempt 计数前后一致。
- **纪律**：`docs/technical-architecture.md:639` 明确「崩溃遗留锁按经验证的维护恢复协议处理，**不按文件年龄擅自清锁**」。

### 7.8 ACC-09 汇总证据清单（§11.10 verification 要求）

逐项绑定：**进程**（PID/创建时间/可执行路径/命令行/端口）、**实际存储身份**（规范化路径 + realpath + 别名映射）、**代际**（generation/incarnation）、**拒绝原因**（稳定错误码）、**发布计数**（每进程 publishedCount）、**新 reader 读回**（第三进程或 B 的独立读回）。

**不得**作为通过证据：同实例 `already-open`（N4）；只测试便利 `commitRecord`；测试文件存在。

---

## 8. SOLO-ACC-07 / 08 离线错误注入（详）

### 8.1 绝对禁止

- **禁止制造真实付费上游故障**：不得对任何真实供应商发起请求以触发鉴权/额度/限流/5xx/超时/流中断/协议错误。
- 不得使用真实密钥；不得读取用户凭据；不得让 QA home 引用生产 provider 配置。
- 若执行过程中**意外**出现真实上游错误，立即按项目红线与 DEV-07 停线并通知用户——该情形**不**算完成了一次注入用例（DEV-07：「测试中发生任何真实上游错误仍按本条处理」）。

### 8.2 受控替身设计

**L1 主用：回环 HTTP 替身（推荐）**

- `llm-pi-ai` 的 provider profile 支持 `baseURL`（`packages/llm/llm-pi-ai/src/config.ts:103`），因此把合成 provider 指向 `http://127.0.0.1:<port>/v1` 即可让**真实已安装适配器 + 真实 SDK** 走到替身。
- QA `settings.yaml` 只含一个合成 provider 路由（例如 `qa-stub`），`apiKeyEnv` 指向一个**占位**环境变量（值为无害字符串），**不含**任何真实供应商配置。
- 替身行为按用例切换（每次只开一种）：

  | 用例 | 替身行为 | 期望的失败分类 |
  | --- | --- | --- |
  | 鉴权 | `401` + `{"error":{"message":"invalid api key"}}` | 鉴权失败 |
  | 额度/账号不可用 | `402` / `403` + 含 `insufficient quota` / `balance exhausted` 措辞 | `QUOTA`（`llm/src/error.ts:28`） |
  | 限流 | `429` + `Retry-After` | `RATE_LIMIT` |
  | 5xx | `500` / `503` | `SERVER` |
  | 连接失败 | 立即 `ECONNREFUSED`（替身不监听该端口） | `TRANSPORT` |
  | 超时 | 接受连接后不回包，超过 `streamIdleTimeoutMs` | `TIMEOUT`（`adapter.ts:415`） |
  | 流中断 | 发 SSE 若干 chunk 后**直接关闭连接**（无 `done`/`error`） | `STREAM_CLOSED`（`pi-ai/src/stream.ts:233`） |
  | 协议错误 | 返回非 SSE 的畸形体 / 非法 JSON | 不可处理协议错误 |

- **断言「无自动重试」的机制依据**：`adapter.ts:130` 与已安装 SDK `openai-completions.js:211` 均写死 `maxRetries: 0`；`llm/src/retry-policy.ts:14-24` 的默认 5 次重试**仅在** `llm-retry` 行生效且 provider 声明了可重试码时发生。
- **因此可观察判据是替身的请求计数**：对同一用例，替身记录的请求数必须为 **1**（首错后不再有第二次请求）。计数 > 1 即「存在自动重试」→ 失败。

**L2 补充：确定性 `LlmAdapter` 替身**

- 经测试插件 `ctx.llm.registerAdapter([...], new QaAdapter())` 注册（形态参照既有 `profiles/development/probe-plugin.mjs:51,126`），用于 L1 无法忠实产生的分类（如 `INVALID_CREDENTIAL`，`llm/src/error.ts:48`）。
- **限制**：mock 只证明与 mock 约定一致（DEV-11 表）；L2 结果**不得**单独用于宣称停线通过。

### 8.3 起点与前置

- 真实 Host、派工与工具适配入口；隔离数据根；受控替身注入错误。
- 存在**已保存**任务 / attempt / 产物及**一次可关联的外部 job**。
- 另有**不依赖该失败请求**的任务，用于核对影响范围。
- 运行前记录：任务数、attempt 数、产物版本、外部 job 引用、各状态值（作为「事实保留」的基线）。

### 8.4 逐类注入的执行与判据

每类注入从**明确起点**观测：首错、派工门禁、停止请求与确认、站内通知、持久事实。

- **通过判据**：
  1. 首错**立即可见**（会话/日志/通知中有明确错误事实与时间）；
  2. 受影响执行与**依赖派工停止**（依赖任务未被派发）；
  3. **无**静默重试（替身请求数 == 1）；
  4. **无**换路由/账号/模型（其他路由替身请求数 == 0；失败请求的 `provider`/`model` 与配置一致）；
  5. **无**自动续跑；
  6. 身份、任务、attempt、产物和 Session 历史**保留**，未改成完成/取消/归档，未删除或批量取消；
  7. **无关工作**未被任意处置（不依赖失败请求的任务状态与基线一致）。
- **失败判据**：任一自动续跑/重试；伪报实际停止；提前归档；通知泄露；已保存事实丢失；**未获恢复指令即对受影响上游发探测请求继续工作**。
- **补充动作（必须做）**：令通知通道失败；重复发出同故障事件；模拟外部 job 无法取消；模拟额度或健康恢复但不授权；再由用户明确恢复。
- **补充通过**：通知失败仍停，错误仍可读；重复事件**合并计数**且首错**不被去重隐藏**；停不下/结果未知**如实展示**；健康恢复**不续跑**；收到明确恢复指令后重核资格、暂停与 writer，按原 `operationId`/`jobId` 查回再续接，**无重复提交**。

### 8.5 SOLO-ACC-08 通知占位与后续交付

| 子场景 | 动作 | 通过 / 失败 |
| --- | --- | --- |
| 首片占位真实性 | 读取通道能力并调用受控空实现/未配置路径 | 返回 `not_implemented`/`not_configured` 且**保留站内停线**；显示可用发送入口或伪造「已发送」则失败 |
| 后续真实通知 | 在通知扩展切片，通过插件选择通道、读回配置、按获准收件目标真实发送并核对返回 | **`accepted` 与 `delivered` 分开**，有事件/结果关联；不支持送达回执则标**未知**。选择、读回或发送缺一**不算**该切片完成 |
| 隐私与失败 | 检查去敏 notice 与 `recipientRef`；令通道失败/重复 | 不泄露凭据和完整私密内容，不刷屏，**不解除业务停线**；任一不满足则失败 |

**反面声明 N5 必须随证据抄录**：通知的 `accepted` **不等于** `delivered`。

### 8.6 记录要求（§11.9 verification）

同时记录：**错误时间、对象与路由、去敏原因、停止状态、待用户事项、适配器请求计数、门禁决定与权威读回**。
通知内容**不得**含密钥、完整提示词、私有记忆或完整日志。

### 8.7 本轮就绪度

**P（阻塞于产品实现）**。当前 `packages/core` 与 `packages/adapter-dsh` 均为 `export {}`，不存在停线事实、派工门禁与通知投影。§11.8 的首片门槛**不因未实现而降级**：本条标记为**未执行**，不得标记为「不要求」。

---

## 9. SOLO-ACC-05 冷启动读回编排（详）

### 9.1 前置绑定（动作 1）

必须一次性记录并冻结：

| 项 | 取值来源 | 检查 |
| --- | --- | --- |
| 安装工件 | QA 版本根 `artifacts/*.tgz` | 逐个 SHA-256；与 r002 清单一致 |
| runtime 入口 | `<runtime>/node_modules/@deepseek-ai/dsh/lib/bin.js` | SHA-256（`runtime.ps1:252` 强制该路径） |
| profile 名与目录 | `soloips` / `<home>/profiles/soloips` | `runtime.ps1:253` 硬编码 |
| 解析后 home | 显式 `DSH_HOME` | 绝对路径 + realpath |
| 有效存储根 | `storage-json` 行 `root` | **实际解析后**的绝对路径（非 `!!js` 表达式） |
| Session 根 | `session-persistence-jsonl` 行 `root` | 同上 |
| `patchReload` | `package.json` 的 `dsh.profile.patchReload` | **必须为 `startup`** |
| 生效组合 | L2 dump | 保存为 `evidence/before.dump.yml` + SHA-256 |

- `patchReload` 的**双重核对**：manifest 值（`profile.ts:869-875` 读取处）+ L2 dump 实际值 + `runtime.ps1:215` 的强制检查。三者一致才算绑定。
- **`startup` 的机制含义**（`profile-boot.ts:374-401`）：不安装任何 watcher；运行期间编辑磁盘**不会**自动更新运行树。因此本场景的重启**必须**是真实冷启动。

### 9.2 写入（动作 2）

写入至少：一个公司、一个部门、一个员工（含任职）、一个任务、一个已保存作品版本，以及一个 `operationId`。
写入后立刻**读回**并记录值 + 落盘位置 + 文件哈希。

### 9.3 停止并确认写入口关闭（动作 3）

- 停止：`runtime.ps1 -Action stop -VersionRoot <QA 版本根>`。
- **必须认识到**：`runtime.ps1:296` 为 `process.Kill()`，**不是**优雅排空。因此需要三条独立证据：
  1. 端口不再监听（`Get-NetTCPConnection -State Listen` 不含该端口）；
  2. 无 `node.exe` 命令行引用该 runtime 的 entry 路径；
  3. **负向探针**：从新进程尝试写入该数据根，必须**失败**（或按维护协议明确拒绝），而**不是**成功。
- 记录停止时刻、退出方式（`forced-process-termination`）、残留锁/窗口文件的实际内容。
- **不得**以 `state: stopped` 或退出码 0 作为「写入口已排空」的证据。

### 9.4 重启（动作 4）

用**同一安装包、同一 profile、同一实际数据根**重启：

- 断言：runtime 入口 SHA-256 与 9.1 一致；profile 三件套哈希与 9.1 一致；`DSH_HOME` 一致；`storage-json.root` 解析值一致；端口一致。
- 生成 `evidence/after.dump.yml` 并断言与 `before.dump.yml` **逐行一致**（`startup` 下应一致；若不一致即为失败判据）。
- 重新获取唯一写权并完成恢复扫描（恢复完成前**不**接受新任务）。

### 9.5 读回与判据（动作 5）

- **通过判据**：公司、任职、任务、`operationId`、作品版本**全部可核对且与写入值一致**；**无双重执行**（attempt 数、外部副作用计数与写入时一致）；重启前后 dump 组合一致。
- **失败判据**：读不回；读回值与写入值不一致；出现两个 writer；重启后组合与停止前 dump 不一致。
- **反面声明 N3 必须抄录**：清空数据后能启动**不算**恢复通过；`patchReload: live` 下进程未重启**不算**执行了本场景。

### 9.6 机制半程（现在就绪的 M 变体）

在 `packages/**` 落地前，可先执行**机制半程**：用 QA 测试插件经真实 Host 打开一个 domain、写入合成记录、停止、冷启动、读回该记录。

- 该半程证明的是**宿主持久化与冷启动机制**，**不**证明公司/任职/任务/作品任何业务出口。
- 证据中必须显式写「机制半程，非 SOLO-ACC-05 通过」。

---

## 10. 证据格式模板（DEV-13 / ENV-04）

### 10.1 单场景证据文件模板

复制以下骨架到 `run/<SCENARIO>/evidence/receipt.md`，**逐字段填写**；不适用的字段写「不适用」并给理由，**不得**删除。

```markdown
# <SCENARIO> 验收回执

## 0. 结论
- 结论：通过 / 失败 / 部分通过 / 未执行
- 交付标签：〔已验证〕/〔未验证〕/〔未执行〕   ← 三态必须显式选一个
- 执行者 / 时间（含时区）：
- 授权依据：<覆盖本次动作的授权条目；无则写「无，未执行」>

## 1. 实际输入与哈希（DEV-13）
| 输入 | 绝对路径 | 字节 | SHA-256 |
| --- | --- | ---: | --- |
| 安装工件 … | | | |
| runtime 入口 bin.js | | | |
| profile/package.json | | | |
| profile/cordis.patch.yml | | | |
| profile/pnpm-lock.yaml 或 package-lock.json | | | |
| 生效组合 dump（前/后） | | | |

## 2. 基线（ENV-03）
| 项 | 取值 | 取得方式 |
| --- | --- | --- |
| 宿主 / 插件版本组合 | | |
| profile 名 | | |
| 解析后 home（绝对 + realpath） | | |
| 有效存储根（实际解析值） | | |
| Session 根 | | |
| patchReload 实际取值 | | manifest + dump 双证 |
| 端口 | | |
| Node 版本 | | |

## 3. 命令与退出码（工作目录逐条注明）
| # | 工作目录 | 命令（去敏） | 退出码 | 关键 stdout/stderr |
| --- | --- | --- | ---: | --- |
| 1 | | | | |

## 4. 观察到的判据
| 判据 | 期望 | 实际 | 通过? |
| --- | --- | --- | --- |

## 5. 通过边界（本条证明什么 / 不证明什么）
- 证明：
- 不证明：

## 6. 反面声明勾选（缺一即不可用于宣称通过）
- [ ] N1 bundles 含包名不是装配证据
- [ ] N2 退出码 0 不是组合正确证据
- [ ] N3 清空数据后能启动不算恢复通过
- [ ] N4 同实例 already-open 不能替代跨 Host 独占
- [ ] N5 accepted 不等于 delivered
- [ ] N6 构建成功不是产品验收
- [ ] N7 dump 通过不等于功能可用
- [ ] N8 安装/启用不等于实际被调用
- [ ] N9 历史观察不等于当前组合

## 7. 证据分层（三态分开写，禁止合并）
- **已验证**（在指名边界内实际运行并观察到）：
- **未验证**（有静态/源码证据但未运行，或运行范围不覆盖）：
- **未执行**（本轮完全没做）：
- 附带说明：未验证项必须写「未验证」，不得写成「应该没问题」。

## 8. 剩余事项与资源处置
- 缺口 / 下一步：
- 本场景产生的进程、临时根、端口：已释放 / 保留（路径 + 负责人 + 释放条件）
```

### 10.2 三态判定规则（防止把静态核对写成通过）

| 情形 | 允许的标签 | 禁止写法 |
| --- | --- | --- |
| 只读了源码/文档，未运行 | 〔未验证〕 | 「已验证」「已保证」「应该通过」 |
| 运行了但范围不覆盖某边界 | 〔已验证〕+ 明确写出边界 | 用无范围的汇总数代替回执 |
| 本轮完全没做 | 〔未执行〕 | 省略不写 |
| 构建/安装成功 | 〔已实现〕（在指名候选） | 「产品验收通过」 |

---

## 11. 执行前置与阻塞清单

| # | 阻塞项 | 影响的场景 | 解除条件 |
| --- | --- | --- | --- |
| B1 | `packages/**` 无业务实现 | ACC-03/04/05(业务)/07/08/09(业务发布点)/10(业务标记)/CE-G | r002 基线 §6 **A3** 授权实现并落地 |
| B2 | `profiles/soloips/` 不存在 | ACC-01 全部 | A3；assembly-dev 的 T01/T04 设计落地 |
| B3 | 未创建/启动 r002 实例（端口 55202） | 所有需要真实 Host 的场景 | r002 基线 §6 **A1**（新服务启动须明确授权） |
| B4 | 凭据未迁入 r002 home | ACC-07/08 若需真实供应商（**本方案不需要**，用合成 provider 即可） | A2；**本方案设计上避免依赖它** |
| B5 | 第二个 QA 版本根（`r902`）未准备 | ACC-09 子场景一/五/六 | QA 自建（属本任务授权内的临时根），无需额外授权 |
| B6 | 站内通知面未实测 | ACC-08 | 随 B1 解除；须实测 notice 是否在 Web 可见 |
| B7 | fork 主检出 HEAD 漂移（Q1） | 所有引用源码行号的结论 | 执行时以**已安装工件**为准；如需对齐须另获 A6 授权 |

---

## 12. 本方案的证据边界（必须随交付抄录）

- **已验证**（本方案自身，2026-09-16，工作目录 `$SOLOIPS_ROOT`）：
  - 技术架构 §11 全文、§6.10、§7.10、第 10 章、DEV-07/11/13、ENV-01–04、DEVENV-01–04、r002 基线、项目绑定、文档规范的实际内容（哈希见 §2.1）；
  - DSH 0.1.6-alpha.1 fork 源码的机制行号（§2.2 全部条目，逐条直接读取）；
  - `runtime.ps1` 的实际行为与限制（§2.3 Q4 全部条目）；
  - r001 只读事实与端口/目录占用（§2.4）；
  - fork 主检出 HEAD 漂移与工作树脏状态（§2.3 Q1，含退出码）。
- **未验证**（有依据但本轮未运行）：
  - 任何 DSH 机制的**运行期**行为（未启动服务）；
  - `llm-retry` 关闭后的实际重试行为（Q5 仅为源码路径）；
  - 站内 notice 的实际可见性（Q6）；
  - fork `abdfeb48…` 相对 `0d1f5000…` 的差异对被测机制的影响（未做 diff 分析）。
- **未执行**：
  - **未启动任何服务**；**未做任何故障注入**；**未修改任何配置**；
  - 未创建 QA 版本根、未安装工件、未生成任何 dump；
  - 未触碰 r001、55120、生产数据、用户 Session、任何凭据；
  - 未执行 §5–§9 中的任何命令。
- **本方案不证明**：r002 的任何出口已通过；任何场景已执行；任何机制在目标安装上成立。
- **资源处置**：本方案未产生进程、临时根或端口，无需清理。§4.1 的 `run/` 子树在执行阶段创建，按 DEV-12 在场景结束时释放；仍有消费者的保留路径、负责人与释放条件须写入对应回执的 §8。
