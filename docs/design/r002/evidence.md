# SoloIPs r002 功能架构分析：证据台账

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-R002-FUNC-EVIDENCE`；`function-architecture.md` 与 `version-architecture.md` 的**逐条依据台账** |
| 目的 | 让复核者不重读全部权威正文即可核对每条结论的来源、标注层级与已证边界 |
| 范围 | 两份正文中每条结论的依据（需求 ID / 源码行号 / 产物路径）、本次实测探针回执、证据缺口清单 |
| 决策状态 | 〔本机核对记录〕；不新增裁定，不改变任何被引用正文的结论 |
| 证据范围 | 2026-09-16 只读核对 + 2 个隔离静态探针；**未实现、未装配、未启动服务、未调用模型** |
| 依据 | `function-architecture.md`、`version-architecture.md`（本台账服务的正文）；全部被引用正文见各表「来源」列 |
| 变更权 | task-9 所有者维护；被引用正文变化时本台账结论失效 |

---

## 1. 标注层级说明

本台账与两份正文使用同一套标注，**不得互相推断**：

| 类别 | 取值 | 含义 |
| --- | --- | --- |
| 决策状态 | 〔需求〕〔约束〕〔建议〕〔待决〕〔已取代〕 | 该陈述的效力来源 |
| 证据性质 | 〔源码事实〕〔推断〕〔未验证〕 | 该陈述的取证程度 |
| 交付状态 | 〔提案〕〔已实现〕〔已验证〕〔已集成〕 | 该交付物的落地程度 |

**本台账全部条目均为〔提案〕交付状态**——本次交付是设计分析。

---

## 2. `function-architecture.md` 逐条依据

### 2.1 §2 的 8 项裁定

| 裁定 | 依据（file:line） | 标注 |
| --- | --- | --- |
| #1 建公司/部门 = 功能 | `docs/technical-architecture.md:254`（ORG-01/02 归属）；`docs/architecture.md:106`（DEPT-01–04 承接） | 〔需求〕 |
| #2 招聘员工 = 功能 | 同上 | 〔需求〕 |
| #3 员工入职 = 功能 | `docs/architecture.md:107`（ORG-03–07、AVATAR-64）；`docs/technical-architecture.md:1042-1051`（SOLO-ACC-04） | 〔需求〕 |
| #4 准入拦截 = 门禁 | `docs/technical-architecture.md:1042-1051`（SOLO-ACC-04 的 actor 为「员工/调度器/经理」，action 为「分别触发并拒绝三条路径」——是决策而非新事实）；`:254`（ORG-11「入口分离」） | 〔需求〕+〔建议〕 |
| #5 工作台看板 = 投影型功能 | `docs/architecture.md:138`（§5 必观察结果第 2 条）；`docs/technical-architecture.md:802`（CLIENT-09）、`:808`（CLIENT-12） | 〔需求〕+〔建议〕 |
| #6 重启读回 = 验收条件 + 持久化约束 | `docs/technical-architecture.md:1003`（章标题「11. 验收场景与反例」）、`:1005`（「本章是验收设计，不是通过记录」）、`:1055-1066`（SOLO-ACC-05 五段编排）；`docs/governance/code-development-standard.md:149`（DEV-08 schema/迁移边界）；`docs/technical-architecture.md:954`（SOLO-F08 第 1 点「不提供持久化或状态恢复保证」） | 〔需求〕+〔约束〕 |
| #7 独占写 = 存储层性质（机制半）+ core 策略（策略半） | `.artifacts/operations/r002-adapter-20260916/probe/contracts.ts:236-248`（`SoloipsWriterLease` 四成员）；同文件 `:230-234`（「core 负责**策略**」）；`.artifacts/operations/r002-adapter-20260916/contracts-design.md:217`（「adapter 提供两个**机制**入口；何时取锁…是 core 的**策略**」） | 〔源码事实〕+〔已冻结〕 |
| #8 上游停线 = 跨切面功能 | `docs/technical-architecture.md:1001`（「core 持有停线事实及派工门禁，adapter/tools-pv 上报…，web 只投影通知」）；`:986-999`（SOLO-F09 全表） | 〔需求〕+〔建议〕 |

### 2.2 §3 的问题 4 核验

| 断言 | 依据 | 标注 |
| --- | --- | --- |
| 三条派工路径 | `docs/technical-architecture.md:1046`：「必须分别触发并拒绝三条路径：(a) 经理显式派单；(b) 员工自领 open-claim 任务；(c) 自动调度器分配」 | 〔需求〕 |
| 停线也拦这三条 | 同文件 `:993`：「暂停依赖该失败请求的**后续派工**、自动重试与续跑」 | 〔需求〕 |
| G-1 同入口 | 上两条比对 | 〔推断〕 |
| G-2 同失败语义 | 同文件 `:1048`（「三条路径均被拒，返回**具体缺项原因**…任务保持 pending/ready=false」）与 `:1125`（「受影响执行/依赖派工停止；没有静默重试」） | 〔需求〕 |
| G-3 同作用时机 | 同文件 `:1150`（「必须在取得可写 domain handle 之前拒绝」）与 `:1153`（「在 A 的 fence 检查与发布间设可控暂停」） | 〔需求〕 |
| 停线**有条件**、准入**无条件** | 同文件 `:1123`（precondition「另有**不依赖该失败请求的**任务用于核对影响范围」）、`:1125`（「**无关工作未被任意处置**」） | 〔需求〕 |
| 门禁点实现成两个门会漏接新入口 | `docs/technical-architecture.md:254`（ORG-11「入口分离」）；`:313`（刻意不建独立协作内核包，故 (c) 必是官方 Team 之上的策略层） | 〔推断〕（基于〔需求〕ORG-11） |
| `TC-08` 的判定表形态 | `docs/reference/rewrite-test-contract.md:99`（TC-08：「准入判定顺序固定：legacy → identity → appointment → onboarding → UNKNOWN → writer gate」；「每个非 allow 必须带 code + reason + 可修复提示」） | 〔源码事实〕（对候选 checkout） |

### 2.3 §4 的耦合簇

| 簇 | 依据 | 标注 |
| --- | --- | --- |
| A 组织事实与入职 | `docs/technical-architecture.md:543`（R1：需同次原子变更的字段在权威提交机制内一同保存）、`:546`（R4：参与 revision CAS 的状态必须与其 revision 计数同记录）；`:1050`（SOLO-ACC-04「重试不得产生第二条员工身份或第二个 appointment」） | 〔建议〕R1/R4 + 〔需求〕 |
| B 提交前门 + fence | `docs/technical-architecture.md:70`（ARCH-D07「没有通过 ORG-06 则不启用公司写入」）；`docs/governance/code-development-standard.md:145`（DEV-08）；`docs/reference/rewrite-seam-client.md:60`（SEAM-X3）；`:59`（SEAM-X2）；`.artifacts/operations/r002-adapter-20260916/probe/contracts.ts:602-604`（顺序契约） | 〔约束〕+〔源码事实〕 |
| B 的具体故障（7 条直接 put） | `docs/reference/rewrite-domain-storage.md:151-152`：「该 service 内**恰好 7 条** `withLock` 写路径，全部直接 `.put()`，无一经过 `CompanyWriterStore.commit`」；`:153`（「`domain/` 目录内对 `CompanyWriterStore` 的引用数 = **0**」） | 〔源码事实〕（对候选 checkout） |
| C 派工门禁点 | 同 §2.2；另 `docs/technical-architecture.md:1152`（失权旧 handle 子场景） | 〔需求〕 |
| D 停线事实 + 通知 | `.artifacts/operations/r002-reference-runtime-host-human/rewrite-runtime-host-human.md:219`（`REF-RHH-X3`）；同文件 `:223`（`REF-RHH-X7`） | 〔源码事实〕（对候选 checkout） |
| E 工作台读投影 | `docs/technical-architecture.md:802`（CLIENT-09）、`:808`（CLIENT-12）；`docs/reference/rewrite-seam-client.md:91-92`（`CLIENT-D3`/`CLIENT-D4` 反例）；`docs/technical-architecture.md:840`（`CLIENT-F04`） | 〔建议〕+〔源码事实〕 |
| F 装配与交付定义 | `.artifacts/operations/r002-mechanism-audit-20260916/audit.md:216-235`（`MECH-06`：仅 7 个 required id + bootstrap include 才 reject）；`.artifacts/operations/r002-assembly-20260916/design.md` §6.1 | 〔源码事实〕 |
| G adapter seam | `.artifacts/operations/r002-adapter-20260916/contracts-design.md:369-385`（§7.1 冻结的 11 组类型）；`:399-408`（依赖方向） | 〔已冻结〕 |

### 2.4 §5 的并行宽度

| 断言 | 依据 | 标注 |
| --- | --- | --- |
| 同包 `tsc -b` 是整体 | `package.json:16`（`"typecheck": "tsc -b"`）；`tsconfig.json:3-7`（references 含 adapter-dsh / core / web） | 〔源码事实〕 |
| ARCH-D02 只有 5 包，拆包不增宽度 | `docs/technical-architecture.md:305`：「**拆包不提升任何写安全**」；`:309-317`（刻意不建的包清单） | 〔建议〕/〔约束〕 |
| 基线同向结论 | `.artifacts/operations/r002-baseline-20260916/roster.md:91`：「这是并行宽度的真实上限，不由人数决定」 | 〔本机记录〕 |
| 3→4→5 的具体数字 | **本文件的设计推演** | 〔推断〕——见 §4 缺口 |

### 2.5 §6 的模块化设计

| 断言 | 依据 | 标注 |
| --- | --- | --- |
| core 包内目录约定 | `docs/governance/code-development-standard.md:108`（DEV-03 §2.2 表：`package.json`、`cordis.patch.yml`、`src/index.ts`、`src/contracts.ts`、`src/company/`、`src/collaboration/`、`src/persistence/`、`tests/`） | 〔约束〕 |
| `collaboration/` 不建 Team 状态机 | 同文件 `:108`：「collaboration 只承载业务绑定 / 规则，不另建官方 Team 状态机」；`docs/decisions/official-team-and-dsh-fork.md:39`（SOLO-TEAM-03） | 〔约束〕 |
| 唯一 opener 与写权威 | `docs/technical-architecture.md:288`（soloips-core「**是（其业务 domain 的唯一 opener）**」）；`:543-546`（R1/R2/R4） | 〔约束〕+〔建议〕 |
| 官方 Team 事实不落 core 可写副本 | `docs/decisions/official-team-and-dsh-fork.md:39`、`:41` | 〔约束〕 |
| `already-open` 只拦同实例 | `.artifacts/operations/r002-mechanism-audit-20260916/audit.md:188-199`（`MECH-05` 成立；`storage-domain/src/index.ts` 与 `c291e796` 同 blob）；`.artifacts/operations/r002-baseline-20260916/baseline.md:54`（反面声明） | 〔源码事实〕 |
| 共享单文件清单 | `packages/core/` 实际内容（`package.json`、`tsconfig.json`、`src/index.ts`；`src/` 下仅 1 文件）；`.artifacts/operations/r002-assembly-20260916/design.md:189-230`（三包 `package.json` 必需改动） | 〔源码事实〕 |
| `inject` 是追加合并 | `.artifacts/operations/r002-assembly-20260916/design.md:292-294` | 〔源码事实〕（探针实证） |
| roster 写面冲突 | `.artifacts/operations/r002-baseline-20260916/roster.md:21`（`assembly-dev`：`packages/*/cordis.patch.yml`）与 `:25`（`core-dev`：`packages/core/**`）交集非空 | 〔源码事实〕（本机编制记录） |
| `src/dispatch/**` 不在 roster 任一方 | `roster.md:25`（`core-dev`：`packages/core/**` 除两目录）与 `:26`（`flow-dev`：`src/company/**`、`src/lifecycle/**`）——`dispatch` 未出现 | 〔源码事实〕（本机编制记录） |
| 预留点 R-1…R-7 | 逐条见 `function-architecture.md` §6.5 表内「不预留的具体返工」列，均引需求或源码行 | 〔建议〕 |
| 预留边界规则 | `docs/architecture.md:172`：「需要它们时应有业务量或功能证据」；task-11 §D「过度设计与返工同样是失败」 | 〔约束〕+〔建议〕 |

### 2.6 §7 的 S0/S1 关系

| 断言 | 依据 | 标注 |
| --- | --- | --- |
| S0 内容与出口 | `docs/architecture.md:161`；`docs/technical-architecture.md:1117` | 〔需求〕 |
| S1 内容 | `docs/architecture.md:162` | 〔需求〕 |
| T08 落在 S0 关键路径 | `docs/technical-architecture.md:1046`（三条路径）+ `docs/decisions/official-team-and-dsh-fork.md:39`（原生任务状态归官方 Team） | 〔推断〕（两条〔需求〕/〔约束〕的合成） |
| 不得建第二套调度器 | `docs/technical-architecture.md:313`、`:316` | 〔建议〕/〔约束〕 |
| 首片门槛不得降级 | `docs/technical-architecture.md:1114` | 〔需求〕 |

---

## 3. `version-architecture.md` 逐条依据

| 断言 | 依据 | 标注 |
| --- | --- | --- |
| 版本号约定 r002 起 | `.artifacts/operations/r002-baseline-20260916/baseline.md:19`（实测 `versions/` 下仅 `r001`）；`docs/operations/development-iterations.md` DEVENV-01–04 | 〔本机记录〕+〔约束〕 |
| r002 功能 1/2/3 与验收 | `docs/architecture.md:161`（S0 出口「新公司/部门/员工能建立」）；`docs/technical-architecture.md:1009-1019`（SOLO-ACC-01）、`:1028-1036`（ACC-02）、`:1042-1051`（ACC-04）、`:1055-1066`（ACC-05）、`:1143-1156`（ACC-09）、`:1158-1164`（ACC-10） | 〔需求〕 |
| r002 的 ACC-04 依赖 T08 | §2.6 的 T08 断言 | 〔推断〕 |
| r003 功能 4/8 与验收 | `docs/technical-architecture.md:1121-1129`（ACC-07）、`:1131-1139`（ACC-08）、`:986-999`（SOLO-F09） | 〔需求〕 |
| `llm-retry` 默认 maxRetries=5 | `.artifacts/operations/r002-dev-readiness/official-llm-error-surface.md` §1.5（四环节完整链条：`packages/bundle/base/cordis.patch.yml:84-85` → `:504-505` 无 config → `llm-deepseek/src/config.ts:324` → `retry-policy.ts:153-160`） | 〔源码事实〕 |
| 带内 finish chunk | 同文件 §1.3（`packages/llm/llm/src/index.ts:1126-1134`） | 〔源码事实〕 |
| 唯一判据位置 `agent/request-error` | 同文件 §1.4（`packages/core/agent-loop/src/agent.ts:442-465`） | 〔源码事实〕 |
| r004 功能 5 与硬约束 | `docs/architecture.md:138`；`docs/technical-architecture.md:802`、`:808`、`:806`（CLIENT-11）、`:866`（CLIENT-X01 反例）；`docs/reference/rewrite-seam-client.md:91-92`（CLIENT-D3/D4） | 〔需求〕+〔建议〕+〔源码事实〕 |
| r004 的待决项 | `docs/technical-architecture.md:855-857`（CLIENT-D01/D02） | 〔待决〕 |
| r005 功能 9/10/11 | `docs/architecture.md:140`（§5 第 4 条）、`:139`（第 3 条）、`:145-151`（PV 最小业务接口）；`docs/governance/code-development-standard.md:152`（DEV-09） | 〔需求〕+〔约束〕 |
| r005 不包含项 | `docs/architecture.md:153`（工具选型先核实、不购买服务）、`:163`（S2）、`:164`（后续能力分项）、`:172`（无业务量证据不建） | 〔需求〕/〔建议〕 |
| S0 拆三版 | `docs/architecture.md:166`（S0/S1 优先处理的问题） | 〔需求〕+〔建议〕 |

---

## 4. 本次实测探针回执（已验证）

**工作目录**：`SOLOIPS_ROOT`（本机实际路径按 [ENV-02](../../operations/environment-handoff.md) 符号化）。**时间**：2026-09-16。

原始输出：`.artifacts/operations/r002-function-architecture/probe/lint-output.txt`。

| # | 探针 | 命令 | 期望 | 实测 | 通过边界 |
| --- | --- | --- | --- | --- | --- |
| P-LINT | core 用 `import type { Context } from '@deepseek-ai/cordis'` | `oxlint -c .oxlintrc.json packages/core/src/index.ts` | 拒绝 | **exit 1**；`eslint(no-restricted-imports)`：`'@deepseek-ai/cordis' import is restricted from being used by a pattern` | 证明**类型导入也被拒**；不证明运行期行为 |
| P-LINT-CONTROL | 同文件同配置 + `allowTypeImports: true` | `oxlint -c .oxlintrc.control.json …` | 通过 | **exit 0**，0 warning 0 error | 证明 P-LINT 的 exit 1 **来自该规则**，不是配置错误或文件语法问题 |
| P-LINT-REPO | 仓库真实门禁基线 | `oxlint --type-aware`（根脚本 `package.json:15`） | 通过 | **exit 0**，7 文件 0 warning 0 error | 只证明**当时**基线为绿；不证明未来改动后仍绿 |
| P-PATH | 三包装配声明存在性 | `Test-Path packages/{core,adapter-dsh,web}/cordis.patch.yml` | 均缺 | **三者均 False**；`packages/bundle/` 为 True | 证明现状；不证明装配行为 |
| P-SRC | `packages/core/src` 内容 | 目录列举 | 仅占位 | 仅 `index.ts`（内容为 `export {}`） | 证明现状 |

**第二组：Mermaid 语法解析探针**（原始输出：`.artifacts/operations/r002-function-architecture/probe/mermaid-output.txt`）

| # | 探针 | 命令 | 期望 | 实测 | 通过边界 |
| --- | --- | --- | --- | --- | --- |
| P-MMD-CONTROL | 负向对照：故意写坏的图 | `node probe/mermaid/parse-mermaid.mjs …`（脚本内置） | 被拒 | **被拒**（`control ok: intentionally-broken diagram was rejected`） | 证明探针**确实在做语法校验**，不会永远返回 ok |
| P-MMD | 4 张 Mermaid 图 | 同上，参数为两份正文 | 全部解析 | **exit 0**；`function-architecture.md` 3 块（73/28/52 行）+ `version-architecture.md` 1 块（53 行）；`blocks=4 failed=0` | 只证明**语法可解析**；不证明渲染外观、不证明图内容正确 |

**依赖与边界**〔源码事实〕：`mermaid` 11.16.0 与 `jsdom` 取自 `DSH_FORK_CHECKOUT` 的 `node_modules`（**只读引用，未安装任何依赖、未改该仓库**）。

**为何用 jsdom 而非手写 DOM shim（一次被纠正的方法错误，记录在案）**：初版探针用手写 shim 提供 `document`/`window`，结果**4 张图全部报** `DOMPurify.sanitize is not a function`。逐一试验后确认：`mermaid.parse()` 会走 `DOMPurify.sanitize`，而 DOMPurify 需要真实 DOM；手写 shim 下**只有不含 label 的最小图能通过**（`flowchart LR; A --> B` 报 ok，任何带 `["…"]` label 或 `subgraph` 的图都失败）。**若不追查，会得出「我的图语法有错」这一错误结论**；若换成「只测最小图」，则会得出**假阳性通过**。改用 jsdom 后 4 张图全部通过，且负向对照仍被正确拒绝。脚本中因此内置了负向对照。

**第三组：domain 版本语义探针**（**task-17 新增；由 task-15 独立验证产出**）

原始输出：`.artifacts/operations/r002-walkthrough/probe-version-semantics-output.txt`；脚本：`.artifacts/operations/r002-walkthrough/probe-version-semantics.mjs`。

**对象**：**已安装工件** `@deepseek-ai/dsh-storage-json@0.1.6-alpha.1`（`SOLOIPS_DEVS_ROOT/versions/r001/runtime/node_modules`），公开入口 `JsonStorageBackend.kv.open(descriptor)`。在系统临时目录建独立根，**自动清理**。

| # | 用例 | 条件 | **实测结果** | 用途 |
| --- | --- | --- | --- | --- |
| P-VER-C | C-1（**正向对照**） | single，v1 与存量一致 | **OPENED OK** `tables=[companies]` | 证明探针确实能成功打开，非恒失败 |
| P-VER-A | A-1 | single，v2，无 `compatibleVersions` | **REJECTED** `version-mismatch` | bump version 即整次拒绝 |
| P-VER-B | B-1 | single，v2，`compatibleVersions:[1]` | **REJECTED**（同上） | **补救无效** |
| P-VER-E | E-1 | single，**v1 不变** + **新增表 `departments`** | **OPENED OK** `tables=[companies,departments]` | **前提不成立** |
| P-VER-D1 | D-1 | per-record，v2，无 compat | OPENED OK，keys=[] | 旧记录读作缺席 |
| P-VER-D2 | D-2 | per-record，v2，`compat=[1]` | OPENED OK，keys=[c1] | **仅此 layout 有效** |

**可重放性**：`node --check` **exit 0**；连跑 **3 次结论一致**。

**探针自证与方法错误（Skill §8.4，记录在案）**：首轮 C-1 **失败**，暴露探针自身 3 处缺陷——① 未关闭 unit 句柄致后续 `open` 报 `already open`（E-1 首轮假失败）；② 把 `loadAll().tables` 当 `Map` 致 C-1 假失败；③ per-record 两组共用同一 unit name 致 D-2 被拒。**均由内置正向对照发现并修正。** 若不修正会得出「E-1 拒绝」——而 E-1 恰是推翻 R-4 的关键证据。

**本组证明**：默认 `single` layout 下 bump `version` 即整次拒绝且 `compatibleVersions` 无效；加表**不**需要 bump。
**本组不证明**：其他 backend（如 SQLite）、其他工件版本的行为；`per-record` 是否更适合 SoloIPs 业务 domain。

**探针落点**：

| 文件 | 内容 |
| --- | --- |
| `.artifacts/operations/r002-function-architecture/probe/lint/.oxlintrc.json` | 探针配置（与根 `.oxlintrc.json` 的 `no-restricted-imports` 规则同形） |
| `.artifacts/operations/r002-function-architecture/probe/lint/.oxlintrc.control.json` | 对照配置 |
| `.artifacts/operations/r002-function-architecture/probe/lint/packages/core/src/index.ts` | 探针输入 |
| `.artifacts/operations/r002-function-architecture/probe/lint-output.txt` | 第一组全部原始输出与退出码 |
| `.artifacts/operations/r002-function-architecture/probe/mermaid/parse-mermaid.mjs` | 第二组脚本（只解析、不渲染、不写产物） |
| `.artifacts/operations/r002-function-architecture/probe/mermaid-output.txt` | 第二组原始输出与退出码 |
| `.artifacts/operations/r002-walkthrough/probe-version-semantics.mjs` | 第三组脚本（**只读、临时根、自动清理**） |
| `.artifacts/operations/r002-walkthrough/probe-version-semantics-output.txt` | 第三组原始输出与退出码 |

**交付级检查（本次一并执行）**：

| 检查 | 命令 | 结果 | 通过边界 |
| --- | --- | --- | --- |
| 格式 | `prettier --check`（三份新正文） | **exit 0**，`All matched files use Prettier code style!` | 只证明格式；不证明内容 |
| 本地链接 | 自建正则扫描 Markdown 行内链接语法并 `Test-Path` 解析其目标 | 三份共 2 条链接，**断链 0** | 只覆盖 Markdown 行内链接；反引号内的路径文本不在链接语法内，未按链接校验 |
| 敏感信息 | 正则扫描 Windows 绝对路径 / 私网地址 / API key 形态 / 凭据关键词 | 三份**全部 0 命中** | 仓库 `visibility: public`；此检查为形态匹配，不构成凭据审计 |

**为何用隔离目录**：`DEV-12` 要求不更改其他人的未提交内容；且 `packages/core/**` 属产品实现目录（A3 未授权）。探针在 `.artifacts/`（本机忽略目录）内构造最小配置与输入，**未触碰 `packages/**` 任何文件**。

**对照基线**：根 `.oxlintrc.json` 的真实规则见其 `overrides[1]`（`files: ["packages/*/src/**/*.{ts,tsx}"]`、`excludeFiles: ["packages/adapter-dsh/**"]`、`no-restricted-imports` 禁 `@deepseek-ai/*` 与 `soloips-core`）。探针配置保留了同一 `no-restricted-imports` 形状，去掉与本探针无关的 type-aware 规则集以缩短运行时间——**这不影响 P-LINT 的结论**，因为被触发的规则就是被保留的那条。

---

## 5. 证据缺口（未验证 / 未执行，逐条列出）

### 5.1 〔未验证〕——本次据其推断但未取证

> **口径说明**：下表 8 条中，**U-4 已于 2026-09-16 由 task-15 探针关闭**（实测**推翻**原推断，见 §4 第三组与 `function-architecture.md` §6.5.1）。其余 7 条仍为〔未验证〕。**保留已关闭条目的行**（不删除）以便追溯取代关系（文档规范 §7）。

| # | 项 | 为何未验证 | 由谁关闭 |
| --- | --- | --- | --- |
| U-1 | 可并行宽度 3→4→5 | 设计推演；真实返工次数只能在实现切片观察 | T03/T05 实现切片 |
| U-2 | 各簇「拆开的具体故障」的具体形态 | 设计推演；簇 A 的「两条 Appointment」与簇 B 的「失权旧 handle 覆盖数据」须由双真实进程场景取证 | `SOLO-ACC-09`（两个真实进程） |
| U-3 | 官方 Team 是否提供 (c) 自动调度路径所需原语 | 需在目标安装上核对官方 Team 公开接口 | T08 适配切片 |
| ~~U-4~~ **〔已关闭：实测推翻〕** | ~~r003 加表是否触发 domain 版本整次拒绝~~ | **原为〔未验证〕推断（依 T02 契约 `contracts.ts:118-119` 的默认值说明推断）**。task-15 探针在**已安装工件** `@deepseek-ai/dsh-storage-json@0.1.6-alpha.1` 上实测**推翻**：加表**不**触发版本拒绝（E-1）；真正的风险是 **bump `version`**（A-1 拒绝、B-1 `compatibleVersions` 救不回、D-2 仅 `per-record` 有效）。**同时发现原引用错字段**（`:118` 是 `invalidRecords`）。详见 `function-architecture.md` §6.5.1 与 `.artifacts/operations/r002-walkthrough/verification.md` §3 | **已关闭**（task-15，2026-09-16） |
| U-5 | `dispatch/gate.ts` 的谓词注册表能否承载 `ORG-13` 的「按范围区分」 | 设计候选 | T06 实现切片 |
| U-6 | `llm-retry` 在目标安装（0.1.6 tgz）上的实际生效 | task-10 自述为〔未验证〕（`official-llm-error-surface.md` §1.7） | `SOLO-ACC-07/08` 编排 |
| U-7 | `SOLO-ACC-04` 的 (c) 自动调度路径的官方实现形态 | 依赖 U-3 | T08 |
| U-8 | 各版工期与人力 | 本文件不做工期估算 | Lead / 用户 |

### 5.2 未执行

- 未写入 `packages/**`（A3 未授权）
- 未写入 `profiles/soloips/**`（A3）
- 未装配、未安装、未启动服务
- 未做故障注入
- 未调用任何模型（A5）
- 未 fetch / 构建 / 打包 DSH fork（A6）
- 未创建 r002 实例（A1）、未改凭据（A2）

### 5.3 未复核（超出本任务范围）

| 项 | 说明 |
| --- | --- |
| `.artifacts/operations/r002-dev-readiness/` 其余三份材料 | 本文件只消费 `official-llm-error-surface.md`；`prereq-dependency-and-packaging.md`、`test-fixture-and-gate.md`、`env-and-governance-readiness.md` 未逐行读取 |
| 候选 checkout（`COMPANY_CORE_CHECKOUT` / `SWARM_CHECKOUT` / `REPAIR_RELEASE_CHECKOUT`） | 本文件**未直接读取**任何候选源码；全部候选结论均**转引**已有参考正文（`rewrite-domain-storage.md`、`rewrite-seam-client.md`、`rewrite-test-contract.md`、task-8 的 `rewrite-runtime-host-human.md`），并已标注其原始来源 |
| DSH fork 源码 | 本文件未直接读取 `DSH_FORK_CHECKOUT`；全部 DSH 机制结论转引自 W0 `audit.md` 与 task-10 的 `official-llm-error-surface.md` |
| `docs/design/r002/` 其余各册 | 只读取了 T01（assembly）、T02（adapter）两册全文，其余按需引用 |

**转引的边界声明**：转引结论的取证责任在原正文；本台账只保证「引用位置准确」，**不保证原正文的核对已由本次独立复现**。

---

## 6. 交付状态

〔提案〕——本台账与两份正文均为 **task-9 的设计分析交付物**。

| 交付物 | 落点 | 状态 |
| --- | --- | --- |
| 功能架构正文 | `docs/design/r002/function-architecture.md` | 〔提案〕 |
| 版本架构正文 | `docs/design/r002/version-architecture.md` | 〔提案〕 |
| 证据台账（本文件） | `docs/design/r002/evidence.md` | 〔提案〕 |
| `oxlint` 探针原始输出 | `.artifacts/operations/r002-function-architecture/probe/lint-output.txt` | 〔已验证〕（静态检查层） |
| Mermaid 解析探针原始输出 | `.artifacts/operations/r002-function-architecture/probe/mermaid-output.txt` | 〔已验证〕（语法解析层） |
| registry 登记需求 | 见 §7 | **待 `integrator` 执行** |

**反面声明**：
- 本交付**不构成实现授权**，不改变 `.artifacts/operations/r002-baseline-20260916/baseline.md` §6 的 A1–A8 未授权项。
- 本交付**不是**验收通过记录。文中的 `SOLO-ACC-*` 全部是**待执行的验收**。
- 本交付**不改变** `docs/architecture.md` §6 的 S0/S1 划分与 `docs/technical-architecture.md` §11 的验收合同。
- 本交付**不写入** `packages/**` 或 `profiles/soloips/**`。

---

## 7. registry 登记需求（交 `integrator` 执行）

**〔建议〕** 按 `docs/governance/document-registry.yaml` 的 `layoutPolicy: adapt-existing` 与既有条目形状，为三份新增正文登记。**本文件的作者不改 registry**（属 `integrator` 独占写面）。

| documentId（建议） | path | role | subject | 依据 |
| --- | --- | --- | --- | --- |
| `r002-function-architecture` | `docs/design/r002/function-architecture.md` | `reference` | `r002-function-coupling-and-module-design` | 与 `docs/design/r002/README.md` 已确立的「本目录整体角色为 `reference`」一致（`README.md:19`） |
| `r002-version-architecture` | `docs/design/r002/version-architecture.md` | `reference` | `r002-version-scope-and-demo-path` | 同上 |
| `r002-function-evidence` | `docs/design/r002/evidence.md` | `reference` | `r002-function-architecture-evidence` | 同上 |

**另需 `integrator` 处理的两项**：

1. **更新 `docs/design/r002/README.md` §2 分册清单**：现为 8 册（`README.md:25-34`），需新增本 task-9 的三册，并在 §3 阅读顺序中插入位置。
2. **落点张力提示（与 `README.md` §4 第 6 项同类）**：本三册含**过程性证据**（探针原始输出、逐条依据台账）。`agent-readable-documentation.md` §7 要求「动态状态留在原生任务与发布系统」，项目绑定亦有 `liveStatusInCommittedMarkdown: forbidden`。**本三册的处理**：正文中**不写**瞬时值（端口、PID、进程状态、任务板状态、成员状态）；`evidence.md` §4 只写探针的**命令与退出码**（可重放，非瞬时状态）。**若 `integrator` 认为 §4 仍需进一步处置，请回本作者，不由集成者改语义。**

**登记不改变三册的〔提案〕状态**：登记是身份与归属的登记，不是需求确认或验收通过。
