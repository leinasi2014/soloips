# 装配与组合回归证据日志（T01）

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-R002-T01-EVIDENCE`；本机实测证据记录，非注册文档 |
| 目的 | 记录 T01 设计所依据的 0.1.6-alpha.1 装配机制实测结果，供复核者按原始输出重放 |
| 范围 | 隔离临时 home 上的 `dsh --dump-config` / `--dump-default-config` 探针；不含产品装配 |
| 决策状态 | 〔已实测〕每条给出命令与可观察输出；**不构成产品装配生效或验收通过** |
| 证据范围 | 2026-09-16 本机只读+隔离探针；**未写入 packages/ 或 profiles/ 产品目录、未启动服务、未调用模型** |
| 依据 | task-3；`.artifacts/operations/r002-mechanism-audit-20260916/audit.md`（W0）；`docs/technical-architecture.md` §6 |
| 变更权 | 仅 task-3 所有者维护；结论随 DSH 基线变化失效 |

---

## 0. 探针环境（可重放）

| 项 | 值 |
| --- | --- |
| 宿主 | `$SOLOIPS_DEVS_ROOT/versions/r001\runtime`（DSH **0.1.6-alpha.1**，tgz 安装） |
| 入口 | `node <runtime>\node_modules\@deepseek-ai\dsh\lib\bin.js` |
| Node | `v24.18.0` |
| 隔离 home | `.artifacts/operations/r002-assembly-20260916/probe/home`（**任务专属临时根**，非 r001 home、非生产） |
| 关键约束 | 全程只跑 `--dump-config` / `--dump-default-config`（boot-free）；**未启动任何服务** |

> 〔集成者注，**非作者结论**〕该临时 home 目录树未随本候选入库：按 DEV-02「临时 home 按忽略规则隔离」，且其中 `node_modules/` 被根 `.gitignore` 排除，部分入库会造成不完整且误导的 fixture。入库的探针证据为 `probe/*.txt` 原始输出与 `evidence/baselines/*.golden.txt`（由 `probe/home/profiles/soloips-ref/baselines/` 复制而来）；本行路径供重放时按需重建。原始完整目录仍保留在本机 `.artifacts/operations/`（被忽略）。

**为何用 runtime 而非 fork 源码**：`baseline-auditor` 的 W0 是**源码**核对（`abdfeb48`）；
本日志是**已安装工件**上的可执行核对。二者互为独立证据面。安装工件与源码的一致性
仍须由打包环节核对（W0 §6.3 已声明此边界）。

**方法说明**：全部探针在同一个临时 home 下的**不同 profile 目录**进行，互不干扰。
`--dump-config` 不启动服务、不求值 `!!js`（`dump-config-CpQgpJa2.js` 模块注释），
因此这些命令不构成 A1「启动服务」。

---

## 1. 探针结果汇总

| # | 问题 | 结果 | 裁决 |
| --- | --- | --- | --- |
| P1 | `insert` 写成映射（`- insert:` 下直接 `id:`）会怎样 | `TypeError: patch.insert?.forEach is not a function`，profile 加载失败 | **形状硬约束** |
| P2 | `insert` 目标 group id 不存在 | stderr warn `patch insert: entry "..." not found`，**退出码 0** | 静默跳过 |
| P3 | 普通依赖（无 `dsh.bundle`）列入 bundles | `Error: profile bundle "@deepseek-ai/dsh-tools" declares no dsh.bundle` | **解析期抛错** |
| P4 | 只给 `disabled`、不给 `config` | 目标行原 config **完整保留** | 部分覆写安全 |
| P0 | 提供 `config` 但只写部分键 | 未写出的键**被静默删除**（`personaSuffix` 消失） | **SOLO-C03 实证** |
| P5 | 通过 insert 制造重复 entry id | dump 输出 **2 条**同 id 行；`composeEntries` 保留 3 条；运行时 `Object.fromEntries` 只留 **1 条** | **dump ≠ 运行树** |
| P6 | patch 的 `name` 与目标行不符 | stderr warn `name mismatch ... skipping`，**退出码 0** | 静默跳过 |
| P7 | 行 `name` 指向不存在的包 | dump **成功且无任何报错**，该行照常出现在 dump 里 | dump 不校验模块 |
| P8 | 跨层 group insert 链（bundle→profile→`--patch`） | 后层能命中前层刚插入的 group，无 warn | 层间可见性成立 |
| P9 | 能力包（排序在前）insert 进装配层（排序在后）定义的 group | warn `entry "soloips" not found`，行**丢失** | **顺序陷阱** |
| P10 | 层覆写能力包行的 `config`，未重述 `inject` | `inject` **保留**（只有 `config` 整体替换） | 覆写粒度精确 |
| P11 | L2 是否含 home 层 | **含**（`$DSH_HOME/cordis.patch.yml` 出现在来源标签中） | 门禁须绑定该文件哈希 |
| P12 | L1 是否含 home 层与 profile 层 | **均不含**（`allowParallelInProgress` 保持 base 值 `true`） | L1/L2 分层成立 |
| P13 | 同值覆写是否显示为 `patched by` | **不显示**（`session-query-sqlite`、`tool-ralph` 无 patched by 标签） | **门禁盲区** |
| P14 | L2 两次运行的字节是否一致 | SHA-256 完全相同 | dump 确定性成立 |
| P15 | profile 用户层损坏时 L1 是否仍可运行 | L2 抛错；**L1 退出码 0 且正常输出** | L1 可作恢复诊断 |
| P16 | stdout / stderr 是否分离 | dump 走 **stdout**，warn 走 **stderr** | 门禁可分流 |
| **P17** | **`--dump-config` 是否写盘** | **会写**：`<profile>/cordis.yml` 被重写为空根，哨兵内容被覆盖、mtime 前移 | **dump 有副作用** |
| **P18** | dump 模式是否接受 app 参数 | 拒绝：`error: config dumps take no app arguments, got "--port" "1234"`，退出码 1 | 调用形式受限 |

---

## 2. 关键探针的原始输出

### P1 — `insert` 形状（最易犯且后果最重）

profile 层写成：
```yaml
- insert:
    id: soloips-probe-missing-group
    insert: []
```

实测：
```
TypeError: patch.insert?.forEach is not a function
    at anchorInsertedPluginNames (.../dsh-app-boot/lib/index.js:2142:45)
    at parsePatchList (.../dsh-app-boot/lib/index.js:2169:9)
    at loadOverlayPatches (.../dsh-app-boot/lib/index.js:2133:9)
    at loadProfileDirectory (.../dsh-app-boot/lib/index.js:1029:73)
```

**结论**：`insert` 必须是**顶层数组**，与 `id` 同级。写成映射在 `parsePatchList` 阶段
（早于任何 patch 应用）抛错，**整个 profile 加载失败**。这是 W0 源码核对未覆盖的
可执行面事实（W0 关注 `applyEntryPatches` 的语义，未覆盖 `parsePatchList` 的形状校验）。

### P0 — SOLO-C03 的直接实证

官方 `dsh-web-app` 给 `system-prompt` 写两个键；profile 层只写一个：
```yaml
- id: system-prompt
  config:
    personaPrefix: PROBE_ONLY_PREFIX
```

实测 dump：
```yaml
# == @deepseek-ai/dsh-base, patched by @deepseek-ai/dsh-web-app, ...\soloips-exp\cordis.patch.yml
- id: system-prompt
  name: '@deepseek-ai/dsh-system-prompt'
  config:
    personaPrefix: PROBE_ONLY_PREFIX
```

**`personaSuffix`（官方 web-app 写入的 `Your working directory is {{cwd}}.`）已消失，
且全程无任何 warning。** 这正是 SOLO-C03 所说的"静默丢字段"。

### P5 — dump 与实际运行树不一致（本日志最重要的发现）

用 `composeEntries`（纯函数，不 boot）加 `Object.fromEntries`（复现
`vendor/loader/src/config/group.ts:48-65` 的索引构造）：

```
composed 行数: 3
composed: [{"id":"dup-row","name":"pkg-a"},{"id":"dup-row","name":"pkg-b"},{"id":"dup-row","name":"pkg-c"}]
实际会创建的 entry id 数: 1
胜出者: {"id":"dup-row","name":"pkg-c"}
```

脚本：`tools/dup-id-collapse.mjs`（退出码 0）。

**结论**：`--dump-config` 输出的是 `applyEntryPatches` 的结果（保留重复行），
而运行时 `EntryGroup.update()` 用 `Object.fromEntries` 建索引，**重复 id 只保留最后一条**。
因此**在重复 id 存在时，dump 行数 > 实际挂载 entry 数**，且无任何日志。
→ 与 W0 SOLO-C04「静默后者覆盖」的〔推断〕一致，本日志把它**升级为可执行实证**。
→ 门禁**必须自带 id 唯一性静态断言**，不能只依赖 dump 比对（见 design.md §6）。

### P7 — dump 不校验模块可解析性

插入两行，`name` 分别指向不存在的包与不存在的子路径：
```
- id: soloips-probe-bogus-module
  name: 'soloips-does-not-exist-anywhere'
- id: soloips-probe-bogus-subpath
  name: '@deepseek-ai/dsh-tools/nonexistent-subpath'
```
实测：退出码 **0**，无 warn，两行**照常出现在 dump 中**。

**结论**：L2 组合门禁**不能**证明模块可解析或可挂载。装配证据仍须配一次功能探针
（SOLO-REG-04）。这为基线 §2「bundles 数组含包名不是装配证据」提供了新的具体边界。

### P9 — 顺序陷阱（设计决策的直接依据）

把 group 声明放在排序**最后**的装配层，而让排序**在前**的能力包 insert 进该 group：
```
dsh: [soloips-core] patch insert: entry "soloips" not found
```
该行**从未进入 entry 树**（dump 中不存在），退出码仍为 0。

**结论**：SOLO-C01 的「soloips-bundle 保持最后装配位置」意味着
**soloips-bundle 不能是 group 的定义者**，否则能力包无法把行插进该 group。
→ 采纳方案：各能力包在**根层** insert 自己的顶层行，soloips-bundle 只做覆写（见 design.md §2.1）。

### P13 — 同值覆写不可见（门禁盲区）`soloips-bundle` 覆写 `session-query-sqlite` 与 `tool-ralph` 为**与 base 完全相同的值**时，
dump 中的来源标签**不出现** `patched by soloips-bundle`：
```
# == @deepseek-ai/dsh-base
- id: session-query-sqlite
  name: '@deepseek-ai/dsh-session-query-sqlite'
  config:
    path: ':memory:'
    openAt: never
```
（`renderConfigDump` 按 `JSON.stringify` 逐行比对判断是否"被 patch 过"，
值相同则不计入 `patchedBy`。）

**结论**：来源标签证明的是**"这一行的值被改过"**，不是**"这一行被某层声明过"**。
门禁若要求"soloips-bundle 确实声明了某行"，**不能**用 `patched by` 标签作为证据。
→ 见 design.md §6.4 的规则 5 与 §6.6 的已知盲区。

### P17 — `--dump-config` **会写盘**（来自 `verifier` 的独立发现，本机复核成立）

**背景**：技术架构 §11.1 说「dump 不启动进程」。该说法成立，但**不等于不写文件**。

`dsh --profile <name> --dump-config` 内部调用 `prepareProfile`，而
`prepareProfile` **每次**都执行
`writeFileSync(join(profile.dir, PROFILE_ROOT_FILENAME), PROFILE_ROOT_CONFIG)`
（`dsh/lib/profile-boot-CuwbWsnH.js:206-211`）。

实测：把 `<profile>/cordis.yml` 写成哨兵内容后运行 dump：

```
=== dump 前 cordis.yml ===
- id: SENTINEL-MUST-BE-OVERWRITTEN
  name: 'x'
=== mtime 前: 13:19:55.261 ===
EXIT=0
=== dump 后 cordis.yml ===
# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any
# --patch overlays. Edit cordis.patch.yml, not this file.
[]
=== mtime 后: 13:19:56.580 ===
```

**结论**：dump **有磁盘副作用**——它把 profile 根配置重写为空数组。

**对门禁设计的三条影响**：

1. **dump 不能声称"只读"。** 交付说明与验收证据里必须写明"dump 会重写
   `<profile>/cordis.yml`"，不得把"dump 未启动服务"表述为"dump 无副作用"。
2. **`cordis.yml` 不应入 git**（SOLO-C05 已建议忽略）——本探针给出**更强的理由**：
   它每次 dump/启动都会被重写，入 git 只会产生噪声与误改。
3. **比对不得把 `cordis.yml` 纳入基线**，也不得在 dump 前后依赖该文件的内容。
   基线锚点是 **profile 的 `cordis.patch.yml`**（组合来源），不是 `cordis.yml`（空根）。

**设计意图说明（避免误判为缺陷）**：重写是**有意**的——注释说明 Loader 的
tree write-back 可能把组合行固化进该文件，下次启动会重复 insert。因此这不是 bug，
而是必须如实记录的行为边界。

### P18 — dump 模式**拒绝** app 参数

实测：
```
$ dsh --profile soloips-ref --dump-config --port 1234
error: config dumps take no app arguments, got "--port" "1234"      (退出码 1)

$ dsh --profile soloips-ref --dump-config "some-task"
error: config dumps take no app arguments, got "some-task"          (退出码 1)
```

**结论**：dump 的正确调用形式**只有**
`dsh --profile <name> --dump-config`（可加 `--patch <file>`，但 `--dump-default-config`
连 `--patch` 也拒绝）。门禁脚本必须使用这一精确形式，否则会因参数被拒而失败——
且失败原因（参数错误）与门禁目标（组合漂移）无关，容易误诊。

---

## 3. 参考组合的端到端验证

按 design.md 采纳的方案构造完整参考组合（4 官方 bundle + 4 soloips bundle），
实测：

| 检查 | 结果 |
| --- | --- |
| `--dump-config` 退出码 | **0** |
| `--dump-default-config` 退出码 | **0** |
| stderr（warn） | **空** |
| L2 stdout 行数 | 599 |
| L1 stdout 行数 | 592 |
| 三行 `soloips-*` 是否在 L2 生效树 | **是**（`soloips-adapter-dsh` / `soloips-core` / `soloips-web`） |
| 来源标签 | `# == soloips-adapter-dsh`、`# == soloips-core`、`# == soloips-web` 各 1 段 |
| `!!js` 表达式 | 原样输出（`root: !!js dshHomePath('sessions')`），**未求值** |

产物：`probe/ref-L2.stdout.txt`、`probe/ref-L1.stdout.txt`、`probe/ref-L2.stderr.txt`（空）。

**通过边界**：这证明**配置组合正确**——三行确实进入了生效树且来源可追溯。
**不证明**：模块可解析、插件可挂载、服务可用、业务可用（P7 + SOLO-REG-04）。
本参考组合用的是**替身包**（`export function apply() {}`），不是真实 `packages/*`。

---

## 4. 门禁脚本的实测验证（`drafts/tools/check-composition.mjs`）

**目的**：证明门禁**自身**可运行且能捕获目标失败模式，而不是只存在于纸面。

| 场景 | 注入 | 退出码 | 捕获结果 |
| --- | --- | --- | --- |
| A 建立基线 | `--update-baseline` | 0 | 写入 `baselines/L1.golden.txt`、`L2.golden.txt` |
| B 无变化 | — | **0** | 11 项断言全部 ✓（G1–G6） |
| C **缺行** | 清空 `soloips-web/cordis.patch.yml` 的 insert | **1** | `✗ G2 期望行存在: soloips-web` + 两条基线差异 |
| D **重复 id** | 让 `soloips-web` 额外 insert 一行 `id: soloips-core` | **1** | `✗ G1: 重复 id: soloips-core×2`；`✗ G6: dump 164 行，去重后 163 个 id` + 两条基线差异 |

**场景 D 的意义**：这是 0.1.6 **不再由宿主捕获**的失败模式
（重复 id 预检已删除，静默取后者）。门禁独立捕获它，证明
W0 要求的"id 唯一性从 Loader 兜底变为我们唯一负责"已被落实为可执行断言。

**脚本开发过程中发现并修复的 3 个真实缺陷**（记录以证明脚本经过实际运行）：

| # | 缺陷 | 症状 | 修复 |
| --- | --- | --- | --- |
| 1 | Windows 下 `import.meta.url` 与 `process.argv[1]` 直接比较 | 脚本**静默不执行**，退出码 0 且无输出（最危险：看起来"通过"） | 改用 `pathToFileURL(process.argv[1]).href` |
| 2 | 子进程未显式传 `DSH_HOME` | 落到 `~/.dsh`，报 `profile "soloips-ref" does not exist` | 在 `spawnSync` 的 `env` 中显式传 `DSH_HOME`（cwd 不决定 home 解析） |
| 3 | `name` 正则用 `[2]` 取捕获组 | `TypeError: Cannot read properties of undefined` | 该正则只有 1 个捕获组，改用 `[1]` |

**缺陷 1 的教训（值得写入门禁设计）**：入口守卫写错会让门禁**静默通过**——
与它要防的失败模式（静默失败）同构。因此门禁脚本**必须自证"确实运行了"**：
建议在成功路径打印断言计数，并在 CI 中断言该输出存在。

**证据边界**：以上验证在**替身包**构成的参考组合上进行，不是真实 `packages/*`；
且 `check-composition.mjs` 尚未在真实交付 profile 上运行（无授权装配）。

---

## 4A. 草案文件的形状校验（`tools/validate-drafts.mjs`）

**目的**：证明 7 个草案文件满足 DSH 0.1.6 的解析形状，而不只是"看起来对"。

实测（`evidence/drafts-validation.txt`，退出码 **0**）：

```
=== 草案形状校验 ===
校验 patch 文件: 5
insert 的 soloips-* 行 id: 3
  soloips-adapter-dsh  <- drafts\packages\adapter-dsh\cordis.patch.yml
  soloips-core         <- drafts\packages\core\cordis.patch.yml
  soloips-web          <- drafts\packages\web\cordis.patch.yml
覆写的官方行目标: 2
  llm-retry               <- drafts\packages\bundle\cordis.patch.yml
  session-telemetry-otel  <- drafts\packages\bundle\cordis.patch.yml

✓ 全部检查通过
```

**校验项**：顶层数组（检查 1）、项为映射（2）、`insert` 是数组（3，N1 硬约束）、
非 insert 必有 id（4）、insert 行 id 带 `soloips-` 前缀且全局唯一（5）、
`patchReload` 显式为 `startup`（6）、`bundles` 顺序与 design.md §3.3 一致且
`soloips-bundle` 在末位（7/8/9）。

**校验过程中修正的一处设计错误（重要）**：

校验器最初把**所有** id 都要求带 `soloips-` 前缀，因而报出 6 个"违规"。
复核 SOLO-C04 / SOLO-LAYER-03 原文后确认这是**校验器**的问题，不是草案的问题：

- SOLO-LAYER-03 的原文是「能力包必须只 **insert** 自身前缀的 id」——
  前缀规则约束的是 **insert 的行**；
- **覆写 patch 的 id 必须是官方行 id**，加了前缀反而命中不到目标；
- 多个层顺序覆写同一既有 row 是**合法机制**（SOLO-FAIL-10：
  「所给字段后写覆盖前写」），**不是** SOLO-F03 的重复 entry 定义。

修正后校验器区分二者，并额外发现一个**真实的设计问题**：
`llm-retry` / `session-telemetry-otel` 原本在 `soloips-bundle` 与
`profiles/soloips/cordis.patch.yml` **两处**声明，构成"第二个写者"。
已按 design.md §5.6 的写者分配规则修正为**只有 `soloips-bundle` 声明**。

**证据边界**：本校验只证明草案文件的**解析形状**成立，
**不证明**它们能在真实组合中生效（须由 §3 的端到端验证在真实包上重做）。

---

## 5. 未执行项（授权边界内）

- **未**写入 `packages/**` 或 `profiles/soloips/**` 任何产品文件（未授权项 A3）。
- **未**启动任何服务、**未**运行 `dsh --profile <name>`（不带 dump 标志）。
- **未**调用任何模型（A5）。
- **未**安装任何包、**未**运行 pnpm、**未** fetch 或构建 DSH fork（A6）。
- **未**触碰 r001 实例、55101/55120 生产实例、任何 home 或凭据。
- **未**修改任何注册文档。

探针只在 `.artifacts/operations/r002-assembly-20260916/probe/` 下产生文件；
该目录是 task-3 的独占写面。

---

## 6. 证据边界声明

- 本日志全部结果为**已安装工件 0.1.6-alpha.1** 上的可执行核对，属〔已实测〕。
- **不构成**：产品装配生效、验收通过、需求确认，或对任何 SOLO-ACC 场景的裁决。
- 探针使用**替身包**与**隔离临时 home**；结论不能外推到真实 `packages/*` 或目标实例。
- 参考组合的 dump 基线（`probe/ref-L2.stdout.txt`）绑定**本机绝对路径**，
  不能直接作为交付基线使用（见 design.md §6.3 的机器差异字段处理）。
