# SoloIPs r002 设计产物索引

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-R002-DESIGN-INDEX`；r002 设计候选的**索引与阅读入口**，非稳定权威 |
| 目的 | 让接手者从一处定位 r002 批 1 的六份设计候选、各自的范围与证据边界，无需遍历目录 |
| 范围 | `docs/design/r002/` 下全部正文的清单、角色、来源任务与通过边界；不含产品需求裁定 |
| 决策状态 | 〔提案〕本目录是**设计候选**，不是已确认需求或已生效规则；其中的技术裁定须回到对应权威登记后才生效 |
| 证据范围 | 各正文自带证据范围；本索引只描述范围与边界，**不提供**装配、安装、运行或产品验收证据 |
| 依据 | [代码规范 DEV-12/13/14](../../governance/code-development-standard.md)、[文档注册表](../../governance/document-registry.yaml)、[文档格式规范](../../governance/agent-readable-documentation.md)；需求与验收权威见 [技术架构](../../technical-architecture.md) 与 [产品架构](../../architecture.md) |
| 变更权 | 按注册表 `documentId: r002-design-index` 维护；**各分册的结论归其作者**，索引维护者不改写分册语义 |

## 1. 这个目录是什么

r002 批 1 的六名成员各自产出了设计候选。它们原先位于本机忽略目录 `.artifacts/operations/r002-*/`，GitHub 上零记录，接手者无法从仓库看到任何设计依据。本目录把这些候选移入受版本控制的位置，使 DEV-13 要求的"改动范围、实际检查命令和结果、剩余限制"可被复核。

**三条边界声明：**

- **不是稳定权威。** 本目录整体角色为 `reference`。技术架构、代码规范、项目绑定仍是各自主题的权威；设计候选与权威冲突时以权威为准。
- **不是已实现。** 各正文描述的是**设计**与**只读核对结论**。除正文自述的探针外，未装配、未安装、未启动服务、未调用模型。不得从本目录推断任何出口已通过。
- **不改变授权。** 入库不构成对 `packages/**`、`profiles/soloips/**` 的写入授权（基线 §6 A3），也不构成真实模型调用授权（A5）或 DSH fork fetch/构建授权（A6）。

## 2. 分册清单

| # | 正文 | 来源任务 | 内容与通过边界 |
| --- | --- | --- | --- |
| 1 | [mechanism-audit/audit.md](mechanism-audit/audit.md) | W0 `baseline-auditor` | DSH **0.1.6-alpha.1**（`0d1f5000…`）上重核 MECH-01–10、SOLO-C01–C07、SOLO-F01–F08 与默认数据根，逐条给出「成立 / 已变化 / 无法核对」。技术架构原行号绑定 0.1.5-rc.2（`c291e796…`），本册是换版后的机制事实基线。**只读源码核对**，未启动服务、未做故障注入 |
| 2 | [adapter/contracts-design.md](adapter/contracts-design.md) | T02 `adapter-dev` | adapter-dsh seam 契约冻结草案：`apply(ctx, config)` 签名、`contracts.ts` 类型契约、服务发布、settings 注册、早退与禁止项。附 [adapter/probe/](adapter/probe/) 的 TypeScript 探针与编译回执。**纯设计**，未写入 `packages/**` |
| 3 | [assembly/design.md](assembly/design.md) | T01+T04 `assembly-dev` | 三包 `cordis.patch.yml` 草案、soloips-bundle 装配顺序、覆写重述清单、`profiles/soloips/` 三件套、`--dump-config` 组合门禁方案。附 [assembly/drafts/](assembly/drafts/) 草案副本、[assembly/evidence/](assembly/evidence/) 探针日志与 golden 基线、[assembly/tools/](assembly/tools/) 校验脚本。**隔离临时 home 上的 boot-free dump 探针**，未启动服务 |
| 4 | [qa/acceptance-plan.md](qa/acceptance-plan.md) | `verifier` | SOLO-ACC-01–10 的逐条执行编排、隔离测试根方案、ACC-09 双真实进程编排、ACC-07/08 离线错误注入、ACC-05 冷启动读回、DEV-13 证据模板。**纯设计**，未执行任何场景 |
| 5 | [doc-review/review.md](doc-review/review.md) | `doc-reviewer` | 全部已登记文档的独立校对：阅读契约、三类标注、稳定 ID、链接与登记一致性；阻断 10 条、建议 15 条、已核对无问题 16 组，附检查器实跑回执。**只读审查**，不修改文档 |
| 6 | [baseline-intake/intake.md](baseline-intake/intake.md) | T00 `integrator` | 工作树 36 项逐项盘点与归属对账、`format:check` 红门处置、DEV-15 提交拆分与 PR 方案、登记一致性核对与风险清单。**只读盘点**，不提交、不改工作树 |
| 7 | [baseline/baseline.md](baseline/baseline.md) | 队长 | r002 任务完成基线：版本身份、S0 出口映射、明确不含项、证据格式、未决授权 A1–A8。〔已接受〕用户 2026-09-16 接受 |
| 8 | [baseline/roster.md](baseline/roster.md) | 队长 | r002 团队编制、独占写面、批次与模型分配；含 `SpawnTeammateRequest` 不支持成员级模型的源码事实与四条可行路径。〔待确认〕 |

## 3. 阅读顺序建议

接手开发时按因果顺序读，而非按编号：

1. **先读权威**：[技术架构](../../technical-architecture.md) §11 验收合同与 [代码规范](../../governance/code-development-standard.md) DEV-14 首片顺序。
2. **再读机制事实**：第 1 册（换版后的机制裁决）——它决定后续设计的行号与假设是否成立。
3. **再读交付定义**：第 3 册（装配与 profile 三件套）+ 第 2 册（seam 契约）。这两册是批 2 并行的前置闸门。
4. **再读验收编排**：第 4 册——写「什么算通过」。
5. **需要时读**：第 5 册（文档问题清单，含 10 条阻断项）、第 6 册（集成方案）、第 7/8 册（版本与团队事实）。

## 4. 已知未解决项（不隐藏）

| # | 事项 | 状态 |
| --- | --- | --- |
| 1 | `AGENTS.md` §2 授权边界全节在注册表中**无已登记的来源权威**（doc-reviewer B-05） | **未解决**。原拟以 `AGENTS.authorization-review.md` 登记解决，该文件经用户 2026-09-16 指示删除，路径消失。可选解法是在 [项目绑定](../../governance/project-binding.yaml) 增 `authorization` 段，但属组织规则变更，不在本次授权内 |
| 2 | doc-reviewer 的其余 9 条阻断项（B-01–B-04、B-06–B-10） | **未处理**。本候选只入库正文，未修改被审查的文档结论；处置须单独授权 |
| 3 | `assembly/probe/home/` 临时 home 的 `node_modules/` 部分未入库 | **已按配方重建**。64 个 stub 文件被根 `.gitignore` 的 `node_modules/` 规则排除，直接入库会产生残缺 fixture。现改为：36 个非 `node_modules` 文件入库于 `assembly/evidence/fixture/home/`，64 个 stub 由 `assembly/evidence/fixture/stubs.manifest.json` 还原，重建后文件集合 100/100 一致（洁净检出上 18 个文本文件仅行尾差异，见 `assembly/evidence/fixture/README.md` §3） |
| 4 | 各册内部的探针结论**未在本次集成中复跑** | **未验证**。本候选是原样入库 + 机器路径脱敏；探针结果的真实性由各册自述与 DEV-13 复核承担，未由集成者重新执行 |
| 5 | `assembly/evidence/fixture/` 重建后**未实跑门禁** | **未验证**。fixture 保真度已证（逐字节），但「重建后 `check-composition.mjs` 输出与 `gate-*.txt` 一致」未执行，属基线 §6 未授权的运行验证 |

## 5. 入库时的集成者改动（逐项可核对）

入库不是逐字节复制，改动**限于以下五类**，均不改变任何结论、数字或裁决：

| 类别 | 范围 | 说明 |
| --- | --- | --- |
| 机器绝对路径 → 符号环境名 | 28 个文件 | 开发机绝对路径改为 ENV-02 符号环境名。依据 [文档格式规范 §6](../../governance/agent-readable-documentation.md)「机器本地绝对路径写入本机记录，不进正文」 |
| 私有网络地址 → 占位符 | 2 个文件 | 本机私有内网与虚拟网卡地址（IPv4 私网段）改为 `<…地址>` 占位，**不在本正文复述具体值**。仓库 `visibility: public` |
| 符号名的可执行写法修正 | 4 个文件 | 见下 |
| 相对链接层级修正 | 5 个文件 / 10 行 | 见下 |
| 目录重排 + fixture 拆分 | `assembly/` | 见下 |

**目录重排说明**：原始 `r002-*/` 平级目录改为 `docs/design/r002/<短名>/`，以符合仓库既有 `docs/<类别>/` 布局（`docs/decisions/`、`docs/operations/`、`docs/reference/`）。

**fixture 拆分说明**：`assembly/probe/home/` 含 100 个文件，其中 64 个位于 `node_modules/` 而被根 `.gitignore` 排除。若直接入库会得到**残缺且误导**的 fixture。现拆为两部分：36 个非 `node_modules` 文件入库于 `assembly/evidence/fixture/home/`；64 个 stub 由 `stubs.manifest.json`（**由原始 fixture 直接生成，非按形状猜测**）经 `rebuild-stubs.mjs` 还原。实测重建结果：**文件集合 100/100 完全一致、0 缺失、0 多余**；工作树内逐字节相同，**洁净检出**上 18 个文本文件因 `.gitattributes` 的 `eol=lf` 归一而仅有行尾差异（内容一致）。`assembly/evidence/probe-log.md` 与 `assembly/evidence/fixture/README.md` 已就地记录该安排与保真度边界。

**符号名的可执行写法修正说明**（独立复核 `verifier` 发现的**阻断级回归**）：集成者的脱敏脚本把机器路径一律替换为 `$SYMBOL` 形式，但**符号名只在文档叙述中有效**，在被执行的语言里必须用该语言的取法：

| 位置 | 语言 | 修正 |
| --- | --- | --- |
| `qa/acceptance-plan.md:264` | PowerShell | 裸 `$SOLOIPS_ROOT` → `$env:SOLOIPS_ROOT`。裸写法是**未定义的 PowerShell 变量**，展开为空串，导致 §4.2 的隔离断言**静默通过**（r001 越界检查不触发、session 计数返回 0 —— 恰好等于期望值） |
| `qa/acceptance-plan.md:111` | PowerShell（命令记录） | 裸 `$DSH_FORK_CHECKOUT` → `$env:DSH_FORK_CHECKOUT`。裸写法使 `git -C … rev-parse HEAD` 变成 `git -C rev-parse HEAD`，退出码 128 |
| `assembly/tools/{dup-id-collapse,extract-official-rows,extract-restatement-inventory,validate-drafts}.mjs` | JavaScript | 字面量 `"$SOLOIPS_DEVS_ROOT/…"` → `process.env.SOLOIPS_DEVS_ROOT + "/…"`。原写法是**字面字符串**，脚本会指向名为 `$SOLOIPS_DEVS_ROOT` 的目录 |
| `operations/development-iterations.md:76-78`（本 PR C2 入库，**缺陷为既有正文自带**，非本次脱敏引入） | PowerShell | 裸 `$SOLOIPS_ROOT`/`$SOLOIPS_DEVS_ROOT` → `$env:` 形式，并补一句说明。**同机理，属同批修复** |

修正后：`docs/design/` 全部**可执行**代码块（`powershell`/`bash`/`console` 围栏）与 `.mjs`/`.ts` 源文件中**无裸符号**；4 个 `.mjs` 经 `node --check` 全部退出码 0。文档叙述中的 `$SYMBOL` 作为**符号名**保留（该处按 ENV-02 解析，非可执行上下文）。

**相对链接层级修正说明**：目录重排改变了部分正文与仓库根的距离，原有相对链接因此失效。已按目标文件的真实位置重算相对路径并修正（`README.md` 5 处、`adapter/contracts-design.md` 2 处、`adapter/probe/compile-receipt.md` 1 处、`baseline-intake/intake.md` 3 处指向 Skill `assets/` 的链接——该 3 处**在原 `.artifacts` 源目录中即为断链**，属原作者笔误）。**只改链接目标字符串，未改动任何链接文字、结论或数据。** 修正后全仓库本地 Markdown 链接 119 条**断链 0**。

**未改动**：所有裁决、数字、行号、哈希、ID、结论、待决项，以及各册自述的证据边界。凭据扫描在 `docs/design/` 全树为 0 命中。

## 6. 来源与可追溯

- **原始位置**：`.artifacts/operations/r002-<任务>-20260916/`（本机，被 `.gitignore` 覆盖）。
- **关系**：本目录是**副本**，不是移动。原始目录**保留在本机**，作为未经脱敏的现场记录；本目录是脱敏后的受版本控制副本。
- **漂移风险**：两者可能分歧。**以本目录（受版本控制）为交付基准**；原始目录仅作本机现场。如需以原始目录为准，须重新走本索引 §5 的脱敏流程。
- **新增产物的落点**：后续 r002 设计产物应直接写入 `docs/design/r002/`，不要继续只写 `.artifacts/operations/`，否则会重新产生"GitHub 零记录"的问题。
