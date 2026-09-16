# r002 文档校对审查

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-DOC-REVIEW-R002`；本机审查记录，非注册文档、非需求正文 |
| 目的 | 独立校对当前全部已登记文档是否符合 `SOLOIP-DOC-001`，并把问题交回单一写者（integrator）处置 |
| 范围 | `document-registry.yaml` 登记的 19 份文档及其 `relatedPaths`；另含被正文引用但未登记的仓库 Markdown |
| 决策状态 | 〔约束〕task-6 与 `sharedAuthorityWriterCount: 1`；**本审查只报告，不修改任何文档** |
| 证据范围 | 2026-09-16 只读扫描 + 运行既有检查器；**审查结论不构成产品验收，也不构成文档合规通过** |
| 依据 | `docs/governance/agent-readable-documentation.md`（正文）、`docs/governance/document-registry.yaml`、`docs/governance/project-binding.yaml`、`AGENTS.md` |
| 变更权 | 处置权归 integrator；本记录随 r002 候选变化另存新回执，不覆盖本次范围 |

**审查基线**（扫描时冻结，SHA-256 见 §6）：

| 项 | 值 |
| --- | --- |
| 工作目录 | `$SOLOIPS_ROOT` |
| HEAD | `2f9fa433983008d138b4e6c241fd470551a31351` |
| 注册表 | 19 个 `documentId`、19 条 `path`、7 条 `relatedPaths` |
| 扫描范围 | 24 份登记 Markdown（19 条 `path` + 7 条 `relatedPaths`）+ 全仓库 tracked/untracked Markdown |

**判定口径**：

- **阻断** = 候选提交前必须处置，否则文档权威、注册表契约、CI 门禁或证据链不可用。
- **建议** = 精确度、覆盖度或可读性补强；不改变既有结论。

**结论摘要**：阻断 **10** 条，建议 **15** 条，明确「已核对无问题」**16** 组（见 §5）。

---

## 1. 阻断级问题（10 条）

### B-01　产品需求权威使用非规范决策标注族

| 项 | 内容 |
| --- | --- |
| 文件 | `docs/architecture.md` |
| 行号 | 16、18、20、22、73、90、117、119、186 |
| 问题类型 | 标注取值超出 §2 封闭枚举；建议类内容以非规范形式承载 |
| 依据条款 | `agent-readable-documentation.md` §2「决策」取值 = 〔需求〕〔约束〕〔建议〕〔待决〕〔已取代〕；§2「复合陈述拆分」 |
| 严重度 | **阻断** |

实测标注为：〔已确认，SOLO-01〕:16、〔已确认，SOLO-02〕:18、〔已确认，SOLO-03〕:20、〔产品愿景，来自 V0.4〕:22、〔沿用重构要求，SOLO-A02〕:73、〔迁移建议，SOLO-A03〕:90、〔已确认范围〕:117、〔已确认样例〕:119、〔用户确认，2026-09-15〕:186。

问题不在「来源缺失」，而在**取值不可机读**：

1. 本文件是 `role: stable-authority` 的产品需求入口，但**全文没有一处规范形式的〔需求〕**；机读消费者按 §2 枚举检索会得到「无已确认需求」。
2. `:90` 〔迁移建议，SOLO-A03〕是**建议**，`:22` 〔产品愿景，来自 V0.4〕不属于决策/证据/交付任一维度，二者都无法映射到 §2。
3. 同一条需求在 `docs/technical-architecture.md:196–198` 被规范化为〔需求〕。**同一事实存在两套标签词表**，违反 §7「单一权威」。
4. `:186` 的〔用户确认〕段内混入反面声明（"不代表团队已创建或成员已经执行"），复合陈述未拆成独立条目。

**建议处置**：把 9 处改写为 §2 取值（如 `〔需求，SOLO-01〕`、`〔建议，SOLO-A03〕`），并把「产品愿景」与反面声明拆为独立条目或改为正文陈述。这是机械改名，不改变任何结论。

### B-02　`AGENTS.md` 投影的 `sourceAuthority` 未覆盖 2 个直接依赖

| 项 | 内容 |
| --- | --- |
| 文件 | `docs/governance/document-registry.yaml`（登记项 `project-instructions`，第 52 行） |
| 行号 | registry:52；受影响正文 `AGENTS.md:23`、`AGENTS.md:26` |
| 问题类型 | 投影来源权威登记不全 |
| 依据条款 | 规范 §7「投影的 `sourceAuthority` 列明直接依赖的登记文档」；registry 第 6 行字段定义 |
| 严重度 | **阻断** |

`AGENTS.md:23` 链接 `docs/reference/rewrite-source-reference.md`（`source-reference-index`），`:26` 链接 `.agents/skills/team-delivery-leadership/SKILL.md`（`team-delivery-leadership`）；两者均**不在** registry:52 的 `sourceAuthority` 列表中。

后果直接命中该条目的 `expiryPolicy: invalid-on-source-authority-change`：这两份来源变化时，`AGENTS.md` **不会**被判定为失效，投影可静默过期。

**建议处置**：在 `sourceAuthority` 追加 `source-reference-index` 与 `team-delivery-leadership`。

### B-03　`profiles/development/README.md` 投影的 `sourceAuthority` 未覆盖 `dsh-plugin-development-index`

| 项 | 内容 |
| --- | --- |
| 文件 | `docs/governance/document-registry.yaml`（登记项 `development-profile`，第 82 行） |
| 行号 | registry:82；受影响正文 `profiles/development/README.md:10` |
| 问题类型 | 投影来源权威登记不全 |
| 依据条款 | 规范 §7 |
| 严重度 | **阻断** |

`:10` 依据列直接链接 `../../.agents/skills/dsh-plugin-development/SKILL.md`，但 `sourceAuthority: [development-iterations, official-team-and-dsh-fork, code-development-standard]` 未列 `dsh-plugin-development-index`。

**建议处置**：追加该 ID。

### B-04　`team-delivery-soloips-context` 投影的 `sourceAuthority` 未覆盖 `project-instructions`

| 项 | 内容 |
| --- | --- |
| 文件 | `docs/governance/document-registry.yaml`（登记项 `team-delivery-soloips-context`，第 129 行） |
| 行号 | registry:129；受影响正文 `.agents/skills/team-delivery-leadership/references/soloips-development.md:10` |
| 问题类型 | 投影来源权威登记不全 |
| 依据条款 | 规范 §7 |
| 严重度 | **阻断** |

`:10` 依据列链接 `../../../../AGENTS.md`（`project-instructions`），该 ID 不在 `sourceAuthority` 中。

**建议处置**：追加 `project-instructions`。注意这会形成 `AGENTS.md ↔ soloips-development.md` 的相互依赖，但 §7 要求登记**直接**依赖，不因成环而省略。

### B-05　`AGENTS.md` §2 授权边界规则集没有已登记的来源权威

| 项 | 内容 |
| --- | --- |
| 文件 | `AGENTS.md` |
| 行号 | 31–80（§2 Authorization Boundary 全节） |
| 问题类型 | 投影承载的规则在注册表中无来源 |
| 依据条款 | 规范 §7「单一权威」；registry 第 5 行「本表是文档身份与归属的唯一权威」 |
| 严重度 | **阻断** |

§2 是操作上强约束的规则集（Task Authorization Envelope、`source.kind === 'user'`、8 种暂停条件、禁止的授权推理）。`project-binding.yaml` 只有 `redLines` 6 条，**不含** Envelope 模型；registry:52 的 `sourceAuthority` 也没有任何条目承载它。

实际来源是用户 2026-09-16 指令与根目录 `AGENTS.authorization-review.md:8`（"〔已合并〕用户 2026-09-16 确认后并入 `AGENTS.md` §2"），而该文件**未登记**（见 B-07）。结果是：一条已被用户确认的规则集，在注册表中找不到来源权威，无法判断其变更触发与失效条件。

**建议处置**：二选一——(a) 把 `AGENTS.authorization-review.md` 整理为已登记正文并列入 `sourceAuthority`；(b) 在 `project-binding.yaml` 增加对应 `authorization` 段并列入 `sourceAuthority`。不得仅凭「已在 AGENTS.md 里」就视为已归属。

### B-06　新增 Skill 未登记且缺少 YAML frontmatter

| 项 | 内容 |
| --- | --- |
| 文件 | `.agents/skills/advanced-agent-cognitive-framework/SKILL.md` |
| 行号 | 1–3（无 frontmatter）；registry 全文无对应条目 |
| 问题类型 | 新增正文未登记；Skill 不可被发现 |
| 依据条款 | 规范 §7「新增不同主题的正文时同步注册与阅读入口」；`AGENTS.md:120` 同款要求 |
| 严重度 | **阻断** |

该文件是 r001/r002 期间新增的 262 行 Markdown，registry 19 条中**无** `advanced-agent-cognitive-framework`。同目录的另两个 Skill（`dsh-plugin-development`、`team-delivery-leadership`）均已登记，说明该目录在注册表职责范围内。

同时文件首行是 `# Advanced Agent Cognitive Framework Skill`，**没有** `---` frontmatter 块；对照 `.agents/skills/dsh-plugin-development/SKILL.md:1-7` 与 `team-delivery-leadership/SKILL.md:1-6` 均有 `name`/`description`。缺 frontmatter 使该文件无法作为 Skill 被会话目录发现（本会话技能目录中确实不含它），其内容目前既不可达也不受管辖。

**建议处置**：登记为 `role: reference` 并补 frontmatter；或若属未交付草稿，移入忽略目录并从仓库移除。

### B-07　根目录两份实质审查文档未登记、未被忽略

| 项 | 内容 |
| --- | --- |
| 文件 | `AGENTS.authorization-diff.md`（8375 B）、`AGENTS.authorization-review.md`（14885 B） |
| 行号 | 两文件均含阅读契约表（`authorization-review.md:3–11`）；registry 无对应条目 |
| 问题类型 | 未登记正文；仓库卫生（会被提交） |
| 依据条款 | 规范 §7；§1「负责人与路径复用注册表」；`project-binding.yaml:67` `liveStatusInCommittedMarkdown: forbidden` |
| 严重度 | **阻断** |

`git check-ignore` 对二者**无输出**，即未被 `.gitignore` 排除，会随提交进入仓库。二者都自带阅读契约表，属 §1 意义上的实质性文档，因此必须二选一：登记，或移入 `.artifacts/operations/`（已被忽略）。

`authorization-review.md:13` 自述「行号引用指向**合并前**的版本，仅作历史依据」，属 §7 应留在本机记录而非提交正文的历史材料。

**建议处置**：移入 `.artifacts/operations/`（推荐，保留原范围与日期），或登记为 `role: evidence`。若按 B-05 方案 (a) 处理，则须补登为正式正文。

### B-08　本机记忆记录未忽略，含机器绝对路径与内网地址

| 项 | 内容 |
| --- | --- |
| 文件 | `.workbuddy-ai/memory/2026-09-16.md` |
| 行号 | 26（`$SOLOIPS_DEVS_ROOT/versions/r001`）、84、94–95（`127.0.0.1:55201`、`<APIPA/WSL 地址>:55201`、`<Docker 虚拟网卡地址>:55201`） |
| 问题类型 | 机器本地绝对路径进入可提交正文；落点错误 |
| 依据条款 | 规范 §6「机器本地绝对路径和瞬时进程细节写入运维交接的本机记录，不进正文」；`environment-handoff.md` ENV-01:15「本机记录固定放在仓库根 `.artifacts/operations/environment.local.md`，由 `.gitignore` 排除」 |
| 严重度 | **阻断** |

`git check-ignore` 对该路径**无输出**，即未被忽略。ENV-01 已规定本机记录的固定落点且该落点被忽略；本文件内容属同类观察（端口、PID、访问地址、版本根），却落在未忽略目录。

凭据方面**已核对无问题**：`:95` 写的是 `?token=<token>` 占位符，不含真实令牌；全仓库凭据扫描 0 命中（见 §5）。

**建议处置**：把内容并入 `.artifacts/operations/environment.local.md`（或另建忽略目录下的记忆文件），并将 `.workbuddy-ai/` 加入 `.gitignore`。

### B-09　`format:check` 为红，CI 门禁当前不通过

| 项 | 内容 |
| --- | --- |
| 文件 | `.workbuddy-ai/memory/2026-09-16.md`、`AGENTS.authorization-diff.md`、`AGENTS.authorization-review.md` |
| 行号 | 整文件（Prettier 报告格式不符） |
| 问题类型 | 项目自有检查未通过 |
| 依据条款 | `code-development-standard.md` DEV-02:41「`pnpm run format:check` 受管源码与配置的格式」；`.github/workflows/verify.yml:37-38` 把该命令设为必需步骤 |
| 严重度 | **阻断** |

实际命令与结果见 §4。`verify.yml` 在 PR 与 `main` 推送时执行 `pnpm run format:check`，因此当前工作树**无法通过 `verify` 门禁**。

**建议处置**：与 B-07、B-08 合并处置——把三个文件移出受管范围（推荐），或在同一候选内格式化。注意 DEV-02:41 明确「修复命令不得顺手重排无关历史文档」。

### B-10　`check_candidate.py` 退出码 1，r002 候选无适用的通过型文档检查

| 项 | 内容 |
| --- | --- |
| 文件 | `.artifacts/operations/dsh-team-adaptation-20260916/check_candidate.py`（第 18 行断言失败） |
| 行号 | `check_candidate.py:18`；冻结清单 `candidate-v2.json` |
| 问题类型 | 检查器失效；候选缺少通过的文档检查回执 |
| 依据条款 | 规范 §9「检查本地链接、稳定 ID 与改动内容，然后运行项目自有文档检查」；`environment-handoff.md` ENV-04:49「候选或范围变化后另存新回执」 |
| 严重度 | **阻断** |

实际命令与结果见 §4。8 个冻结文件中 **4 个已变更**：

| 文件 | 冻结哈希 vs 当前 |
| --- | --- |
| `AGENTS.md` | 已变更 |
| `docs/governance/code-development-standard.md` | 已变更 |
| `docs/governance/document-registry.yaml` | 已变更 |
| `docs/operations/environment-handoff.md` | 已变更 |
| `docs/decisions/official-team-and-dsh-fork.md` | 一致 |
| `docs/architecture.md` | 一致 |
| `docs/technical-architecture.md` | 一致 |
| `docs/reference/rewrite-source-reference.md` | 一致 |

该检查器是**候选冻结验证器**（`assert manifest[name] == frozen[name]`），设计上只对 dsh-team-adaptation 那一次候选有效。它在 r002 候选上失败属预期，但结果是：**r002 候选当前没有任何通过的文档检查**。`validate-docs.cjs` 只覆盖 8 个文件，且见 S-13 的回执覆盖问题。

**建议处置**：为 r002 候选生成新的冻结清单与回执（新目录、新文件，不覆盖旧回执），或明确记录这两个检查器为历史范围并指定 r002 的替代入口。不得把退出码 1 当成「无问题」。

---

## 2. 建议级问题（15 条）

| # | 文件 | 行号 | 问题类型 | 依据条款 | 建议处置 |
| --- | --- | --- | --- | --- | --- |
| S-01 | `docs/reference/rewrite-domain-storage.md`、`docs/reference/rewrite-test-contract.md` | 各第 8 行 | 「决策状态」契约字段填入**证据**维度标签（〔源码事实〕〔推断〕〔未验证〕），三维度混用 | 规范 §1（字段须为决策状态）、§2（维度正交） | 改写为显式决策状态（如「〔约束〕本文不承载决策，仅登记证据」），证据标注移入正文 |
| S-02 | `docs/reference/rewrite-test-contract.md` | 172 | 自述「尚未登记进 `document-registry.yaml`」，但 registry 已登记该路径为 `source-reference-test-contract` | 规范 §7、registry 第 5 行 | 删除该句或改为「已登记为 `source-reference-test-contract`」 |
| S-03 | `docs/reference/rewrite-source-reference.md`、`docs/reference/rewrite-domain-storage.md` | 12、11 | 交付状态/变更权仍写「待审后并入注册表」「合并入唯一正文前为分块草稿」，与已登记状态不符 | 规范 §7 | 同步为已登记状态 |
| S-04 | 7 份文档 | 14 处 | 项目内路径写作行内代码而非 Markdown 链接 | 规范 §6「项目内文件用仓库相对链接」 | 改为相对链接；清单见 §3.4 |
| S-05 | `docs/operations/development-iterations.md`、`docs/reference/rewrite-test-contract.md` | DI:30、38（`DSH_AGENTS_HOME`）；test-contract:171（`SWARM_CHECKOUT`） | 符号环境名未在 ENV-02 符号表登记，无法按其解析 | 规范 §6；`environment-handoff.md` ENV-02:21–34 | 在 ENV-02 表补 `DSH_AGENTS_HOME`、`SWARM_CHECKOUT` 两行，或改用已登记符号 |
| S-06 | `.agents/skills/team-delivery-leadership/assets/` | 3 个文件；被 `SKILL.md:121` 链接 | 被正文直接链接却未列入 `relatedPaths` | registry 第 7 行「每个路径只登记一次」 | 追加 3 条 `relatedPaths` |
| S-07 | `scripts/development/runtime.ps1` | 被 `development-iterations.md:73`、`soloips-development.md:97` 直接引用 | 无任何登记项 | 规范 §7 | 登记为 `development-iterations` 的 `relatedPath`，或在 registry 头部注明本表只管 Markdown |
| S-08 | `profiles/development/` | `cordis.patch.yml`、`upstream.json`、`verify-preset.mjs`、`probe-plugin.mjs`、`agent-presets/` | 与 S-07 同类 | 规范 §7 | 同上处置（`development-profile` 的 `relatedPaths`） |
| S-09 | `.github/` | `ISSUE_TEMPLATE/{bug,feature,task}.md`、`pull_request_template.md` | 被 `AGENTS.md:27` 与 `project-binding.yaml:41` 引用，未登记 | 规范 §7 | 登记为 `relatedPaths`，或注明属 GitHub 原生模板、适用不同格式权威 |
| S-10 | `docs/SoloIPs_Studio_Idea_Document_V0.4.md` | 1–9 | 无阅读契约表（登记 `role: reference`、`writeMode: human`） | 规范 §1、§10 | §10 可豁免（人工撰写、非新增决策章节），但应在 registry 或文首**显式记录豁免依据**，否则与 B-01 的整改口径不一致 |
| S-11 | `.agents/skills/team-delivery-leadership/SKILL.md` + 7 份 references（另 3 份 assets 未登记，见 S-06） | 各文首 | 无阅读契约表 | 规范 §1、§10 | 同 S-10：属通用方法参考而非 SoloIPs 决策正文，记录豁免依据即可。**注意** `references/soloips-development.md:3-11` **有**契约表，因其是 SoloIPs 投影（`role: projection`） |
| S-12 | `docs/governance/agent-readable-documentation.md` | 10 | 契约表字段写「实现证据」，而本文 §1:21 要求字段名为「证据范围」 | 规范 §1 自洽 | 改为「证据范围」；否则按字段名机读的消费者会漏掉规范正文自身 |
| S-13 | `.artifacts/operations/r001-20260916/validate-docs.cjs` | 13 | 以固定路径写回执，重跑即覆盖历史回执 | ENV-04:49「候选或范围变化后另存新回执，保留旧回执的原范围」 | 输出路径带时间戳或候选标识。**本次披露见 §4.3** |
| S-14 | 多份文档 | `code-development-standard.md:236-239`、`official-team-and-dsh-fork.md:51`（`c291e796…`，0.1.5-rc.2）vs `profiles/development/README.md:45-48`、`upstream.json`（`0d1f5000…`，0.1.6-alpha.1） | 两套官方基线并存且无交叉说明 | 规范 §6（各自绑定合规）、§7（来源变化时同候选核对） | 增加交叉引用说明两基线各自服务范围（架构机制基线 vs 研发 preset 来源），并注明 r002 实际使用 0.1.6-alpha.1。**实质重核归 task-1** |
| S-15 | `docs/technical-architecture.md`、`docs/reference/rewrite-seam-client.md`、`docs/reference/rewrite-test-contract.md`、`docs/architecture.md` | TA:882；seam:27、46–50、69、92；test:93–101；arch:59、168 | 使用「同上」相对引用；arch:59/168 的取代关系未用 `〔已取代〕→ 新 ID` 形式 | 规范 §3「引用时写 ID，不写"如前所述"」、§3 取代关系形式 | 逐格补 ID 或源码定位。上轮独立复核第 9 项已就 TA 提过同类意见，本次仍存在 |

---

## 3. 覆盖面明细（逐项）

### 3.1 阅读契约表（§1）

19 个登记项共覆盖 **24 份 Markdown**（19 条 `path` 中 2 条为 YAML，另 7 条 `relatedPaths`）。其中 **15 份有契约表**，且**7 个必需字段全部齐备**（0 缺失）：

| 文档 | 契约表行 | 必需字段 |
| --- | --- | --- |
| `AGENTS.md` | 3 | 身份/目的/范围/决策状态/证据范围/依据/变更权 ✔ |
| `docs/architecture.md` | 3 | 齐备（另有「交付状态」）✔ |
| `docs/technical-architecture.md` | 5 | 齐备（另有「文档状态」「读者」「交付状态」）✔ |
| `docs/decisions/official-team-and-dsh-fork.md` | 3 | 齐备（另有「交付状态」）✔ |
| `docs/governance/agent-readable-documentation.md` | 3 | 6/7——「证据范围」写作「实现证据」，见 S-12 |
| `docs/governance/code-development-standard.md` | 3 | 齐备（另有「交付边界」）✔ |
| `docs/operations/development-iterations.md` | 3 | 齐备 ✔ |
| `docs/operations/environment-handoff.md` | 3 | 齐备 ✔ |
| `docs/reference/rewrite-source-reference.md` | 3 | 齐备（另有「交付状态」）✔ |
| `docs/reference/rewrite-domain-storage.md` | 3 | 齐备（决策状态内容见 S-01）|
| `docs/reference/rewrite-seam-client.md` | 3 | 齐备 ✔ |
| `docs/reference/rewrite-test-contract.md` | 3 | 齐备（决策状态内容见 S-01）|
| `profiles/development/README.md` | 3 | 齐备 ✔ |
| `.agents/skills/dsh-plugin-development/SKILL.md` | 11 | 齐备 ✔ |
| `.agents/skills/team-delivery-leadership/references/soloips-development.md` | 3 | 齐备 ✔ |
| `docs/SoloIPs_Studio_Idea_Document_V0.4.md` | — | 无契约表，见 S-10 |
| `.agents/skills/team-delivery-leadership/SKILL.md` + 7 references + 3 assets | — | 无契约表，见 S-11 |

**已核对无问题**：上述 15 份的字段齐备性（除 S-12 的字段**名**）。另 9 份无契约表，处置见 S-10、S-11。

### 3.2 三类标注分离（§2）

**已核对无问题**：

- **「智能体一致被写成需求」**：全仓库检索 `智能体(之间)?(一致|共识|都同意)`、`团队一致`、`一致意见` → **0 命中**。反向证据充分：`agent-readable-documentation.md:31`「智能体之间达成一致不构成确认」、`technical-architecture.md:212`「队长对成员意见的综合表述…**用户原话只说「DSH 是基础设施」**，故本条不得标〔需求〕」、`technical-architecture.md:217`、`official-team-and-dsh-fork.md:213`、`architecture.md:29`、`soloips-development.md:65`。
- **「建议被写成约束」**：抽查 `technical-architecture.md:151/155`（〔约束〕装配职责 + 〔建议〕覆写规则，已拆分）、`:134` TERM-08（〔需求〕ORG-06 + 〔约束〕ARCH-D02，已拆分）、`:130` TERM-04（整体〔建议〕）、`:124` 判定规则明示「〔需求〕〔约束〕必须带来源；其余不得升格」。**已核对无问题**。
- **复合陈述拆分**：`technical-architecture.md:216` 与 `:28` 显式声明拆分规则并落实（SOLO-R01/R02 与 ARCH-D02 分开）；`:196–198` SOLO-01–03 逐条独立；`:212` DRAFT-S01 明确「不得标〔需求〕」。**已核对无问题**。

**发现的问题**：见 B-01（`architecture.md` 非规范标注族）、S-01（契约字段维度混用）。

**另记（非缺陷，供 integrator 判读）**：`.agents/skills/team-delivery-leadership/references/cognitive-judgment.md:72` 与 `learning-and-coaching.md:39` 使用 `〔解释〕〔证据〕〔未知〕〔动作〕〔负责人〕`、`〔适用条件〕〔证据/信号〕` 等方括号占位符。它们是**通用方法模板**而非 SoloIPs 决策标注（见 S-11 的 §10 豁免），但形态与 §2 标注同形，机读工具可能误判。`docs/technical-architecture.md:307/488/603` 的〔反面声明〕同理——§5 把反面声明定义为**内容模式**，不是第四类标注取值。

### 3.3 稳定 ID（§3）

**已核对无问题**：

- **唯一性**：registry 19 个 `documentId` 无重复；19 条 `path` + 7 条 `relatedPaths` 无重复。
- **重复定义排查**：脚本报出 4 个候选（`ARCH-D01`、`ARCH-D03`、`C-10`、`SOLO-REG-Q5`），**逐条复核后全部不成立**：
  - `ARCH-D01`/`ARCH-D03`：`official-team-and-dsh-fork.md:113`、`:167` 是**正文引用**（"ARCH-D01 的正文分工…"），定义仍在 `technical-architecture.md:64`、`:66`。
  - `C-10`：`technical-architecture.md:325` 是引用，定义在 `:183`。
  - `SOLO-REG-Q5`：`:746`（§8.8 待决）与 `:1185`（第 12 章待决汇总）属**章内清单 + 全局汇总**的既定设计，`SOLO-LAYER-Q1/Q2/Q3` 同款处理。
- **跨引用用 ID**：抽查 `technical-architecture.md` 123 个 ID、`official-team-and-dsh-fork.md` 39 个、`code-development-standard.md` 36 个，引用均写 ID。
- **取代关系**：`official-team-and-dsh-fork.md` §8（152–165）6 行逐条标〔已取代〕并给出新 ID；`technical-architecture.md:112` 用 `〔已取代〕→ SOLO-TECH-ARCH` 规范形式；`:525`、`:599`、`:1180` 均标注。

**发现的问题**：S-15（「同上」相对引用；`architecture.md:59/168` 的取代关系未用规范形式）。

### 3.4 链接与环境名（§4、§6）

**已核对无问题**：

- **本地 Markdown 链接可达**：对 19 份登记文档扫描，**断链 0 处**（详见 §4.1、§4.2 两个检查器口径）。
- **机器绝对路径**：登记文档 **0 处**（`[A-Za-z]:[\\/]`、`\\host\share`、`/home|/Users|/mnt|/opt|/srv` 全部 0 命中）。`technical-architecture.md` 附录 B:1218 明确「正文只用符号名」，正文遵守。
- **凭据**：全仓库 tracked + untracked（排除忽略）扫描 `sk-`、`ghp_`、`github_pat_`、`-----BEGIN … PRIVATE KEY-----`、`ANTHROPIC_API_KEY=`、`OPENAI_API_KEY=` → **0 命中**。
- **符号环境名**：`SOLOIPS_ROOT`、`LAUNCH_ROOT`、`DSH_CHECKOUT`、`DSH_FORK_CHECKOUT`、`SOLOIPS_DEVS_ROOT`、`REFACTORING_DOCS_ROOT`、`COMPANY_CORE_CHECKOUT`、`DSH_HOME_LIVE55120`、`PROFILE-55120`、`DSH_HOME_OTHER`、`AGILE_SKILL_ROOT`、`SOLOIPS_HOME_PROD/VERIFY/RECOVER` 均可在 `environment-handoff.md` ENV-02:21–34 解析。

**发现的问题**：S-04（14 处行内代码路径）、S-05（2 个符号未登记）、B-08（未忽略文件含绝对路径）。

**S-04 的 14 处清单**（已逐条核对语境，剔除属 DSH 源码树的相对路径）：

| 文件 | 行 | 路径 |
| --- | --- | --- |
| `AGENTS.md` | 27 | `.github/pull_request_template.md` |
| `docs/governance/agent-readable-documentation.md` | 21 | `docs/governance/document-registry.yaml` |
| `docs/operations/environment-handoff.md` | 15 | `.artifacts/operations/environment.local.md` |
| `docs/reference/rewrite-domain-storage.md` | 10、186 | `docs/operations/environment-handoff.md` |
| `docs/reference/rewrite-seam-client.md` | 10（×3）、52 | `docs/governance/agent-readable-documentation.md`、`docs/technical-architecture.md`、`docs/operations/environment-handoff.md` |
| `docs/reference/rewrite-test-contract.md` | 7（×2）、10（×3） | `docs/reference/rewrite-domain-storage.md`、`docs/reference/rewrite-seam-client.md`、`docs/governance/agent-readable-documentation.md`、`docs/operations/environment-handoff.md`、`docs/technical-architecture.md` |
| `.agents/skills/team-delivery-leadership/references/soloips-development.md` | 40 | `.github/workflows/verify.yml` |

**已排除（非缺陷）**：`docs/architecture.md:204`（`packages/experimental/agent-team/README.md`）与 `code-development-standard.md:238`（`packages/storage/…`、`packages/client/…`）是 **DSH_CHECKOUT 相对路径**，按附录 B 符号解析，不属本仓库文件，写成行内代码正确。

### 3.5 登记一致性（§5）

**已核对无问题**：

- registry 登记的 19 条 `path` **全部存在**；7 条 `relatedPaths` 全部存在。
- 全部 `sourceAuthority` 引用的 ID **全部存在**（无悬空引用）。
- 任务点名的「新增正文」登记状态：`docs/decisions/official-team-and-dsh-fork.md` ✔、`docs/operations/development-iterations.md` ✔、`docs/reference/rewrite-{source-reference,domain-storage,seam-client,test-contract}.md` ✔（4/4）、`profiles/development/README.md` ✔。

**发现的问题**：B-02、B-03、B-04（`sourceAuthority` 覆盖）、B-05（无来源规则集）、B-06、B-07、B-08（未登记/未忽略文件）、S-06～S-09（`relatedPaths` 覆盖）。

### 3.6 检查器运行（§9）

见 §4。

### 3.7 `AGENTS.md` 投影一致性（任务第 7 项）

**已核对无问题**：

- **与 `project-binding.yaml` 的 `redLines`**：6 条全部在 `AGENTS.md` 有对应表述——`user-is-sole-business-decision-authority` ✔（`:29`「用户决定产品目标与最终验收」+ `:100`「保护事实与用户决定」）、`upstream-api-failure-stops-affected-work-and-notifies-user` ✔（`:97`）、`no-credential-or-service-config-change-without-authorization` ✔（`:98`）、`no-native-windows-dialogs-or-terminals` ✔（`:98`，同一 bullet）、`activation-is-not-invocation` ✔（`:99`）、`build-success-is-not-product-acceptance` ✔（`:99`）。
- **与 `documentation` 段**：`instructionAdapter: AGENTS.md` ✔；`liveStatusInCommittedMarkdown: forbidden` ✔（`AGENTS.md:121` 落实）；`sharedAuthorityWriterCount: 1` ✔（`AGENTS.md:127`「同一可写面只安排一个写者」）。
- **与 `method`/`authority` 段**：`method.locationAuthority` ✔（`:15` 指向 ENV-02）；`workSource` 与 DEV-15 ✔（`:27`、`:131`）。
- **r002 相关表述**：`AGENTS.md` **不含**任何 `r001`/`r002`/`versions/`/端口字样。这**符合**绑定要求——版本、实例与进度属动态状态，按 `liveStatusInCommittedMarkdown: forbidden` 留在原生任务与交接系统。本次 r002 的版本身份在 `.artifacts/operations/r002-baseline-20260916/baseline.md`（未登记的本机记录）中维护，落点正确。
- **注册表登记**：`AGENTS.md` 已登记为 `project-instructions`（`role: projection`）✔。

**发现的问题**：B-02（`sourceAuthority` 缺 2 项）、B-05（§2 无已登记来源）、S-09（`.github` 模板未登记）。

---

## 4. 检查器运行回执

工作目录统一为 `$SOLOIPS_ROOT`，时间 2026-09-16。

### 4.1 `check_candidate.py`

```text
命令：python .artifacts/operations/dsh-team-adaptation-20260916/check_candidate.py
退出码：1
```

```text
Traceback (most recent call last):
  File ".../check_candidate.py", line 18, in <module>
    assert manifest[name] == frozen[name], ('candidate changed', name)
AssertionError: ('candidate changed', 'AGENTS.md')
```

**处置**：断言在写回执之前触发，因此 `.artifacts/operations/dsh-team-adaptation-20260916/document-check.json` **未被本次运行改动**（运行前后 SHA-256 均为 `03232223991D76120D50C8510D517220E15A9D966DC5310B2C88192991E56D79`，已用运行前备份比对确认）。失败原因与处置见 **B-10**。

### 4.2 `validate-docs.cjs`

```text
命令：node .artifacts/operations/r001-20260916/validate-docs.cjs
退出码：0
```

```json
{"files":8,"linkOccurrences":75,"broken":[],"unregisteredSources":[],"skillFrontmatter":"valid","exitCode":0}
```

**边界**：只覆盖 8 个文件（`AGENTS.md`、`development-iterations.md`、`code-development-standard.md`、`environment-handoff.md`、`profiles/development/README.md`、团队 Skill + `soloips-development.md` + `dsh-case-study.md`），**不覆盖** 19 份登记文档全体，也不覆盖本报告 §3.2–3.5 的任何语义检查。退出码 0 **不等于**文档合规通过。

### 4.3 回执覆盖披露（必须记录）

`validate-docs.cjs:13` 以固定路径 `fs.writeFileSync(.../r001-20260916/document-validation.json)` 写回执。本次运行**覆盖**了该历史回执（原 `at: 2026-09-16T01:24:56.307Z`、`AGENTS.md` 哈希 `b29b3928…`、`linkOccurrences: 70`）。

**处置**：已按字节还原——还原后 SHA-256 = `70B1663824E0CAE1DDE0C49F1AE51B046B61D5403D7FC7E09BC4BD228F7187EB`，与运行前备份一致。本次运行产出另存为 `.artifacts/operations/r002-doc-review-20260916/post-run-document-validation.json`（`at: 2026-09-16T04:58:37.488Z`、`linkOccurrences: 75`）。运行前备份保留于 `pre-run-document-validation.json`。该脚本的覆盖行为本身是 **S-13**。

### 4.4 附加检查（本次审查自建，供定位行号）

| 命令 | 退出码 | 用途 | 产物 |
| --- | --- | --- | --- |
| `python .artifacts/operations/r002-doc-review-20260916/scan.py` | 0 | 契约表/链接/绝对路径/凭据/标注/ID 全量扫描 | `scan.json` |
| `python .../authority.py` | 0 | 投影 `sourceAuthority` 覆盖分析 | `source-authority.json` |
| `python .../labels.py` | 0 | 非规范标注提取 | `noncanonical-labels.json` |
| `python .../idcheck.py` | 0 | 稳定 ID 重复定义与符号清单 | — |
| `python .../links.py` | 0 | 行内代码形式的项目内路径 | — |
| `npx --no-install prettier --check .` | **1** | 项目格式门禁 | 3 个文件未格式化（见 B-09） |

**声明**：以上自建脚本是**审查辅助**，不是新的项目验证器。规范 §9 明确「不为散文新建只数标题或比对措辞的验证器」——它们只提取可机械判定的事实供人工定位，其输出不构成合规判定，也不进入候选。

---

## 5. 「已核对无问题」汇总（不省略）

1. **契约表字段齐备性**：16 份有契约表的文档，7 个必需字段全部齐备，0 缺失（唯一例外是 S-12 的字段**名**）。
2. **智能体一致未被写成需求**：检索 0 命中，且 6 份文档有显式反面声明。
3. **建议未被写成约束**：抽查 `technical-architecture.md:151/155/134/130` 均正确拆分。
4. **复合陈述拆分**：`technical-architecture.md:28/216` 显式声明并落实。
5. **registry `documentId` 唯一性**：19/19 无重复。
6. **registry 路径存在性**：19 条 `path` + 7 条 `relatedPaths` 全部存在，无重复。
7. **`sourceAuthority` 悬空引用**：0 处。
8. **稳定 ID 重复定义**：4 个候选逐条复核后全部为「一处定义 + 他处引用」，无真实重复。
9. **跨引用形式**：抽查 198 个 ID 的引用均写 ID（例外见 S-15）。
10. **本地 Markdown 链接可达**：19 份登记文档 **0 断链**。
11. **机器绝对路径**：登记文档 **0 处**。
12. **凭据**：全仓库 tracked + untracked（排除忽略）**0 处**凭据字面量；`.workbuddy-ai/memory/2026-09-16.md:95` 为 `<token>` 占位符。
13. **`AGENTS.md` 与 `project-binding.yaml` 的 `redLines`**：6/6 覆盖。
14. **`AGENTS.md` 与绑定 `documentation` 段**：3/3 一致。
15. **r002 版本状态未写入提交正文**：符合 `liveStatusInCommittedMarkdown: forbidden`。
16. **任务点名的 4 组新增正文**：全部已登记（`docs/decisions/`、`development-iterations.md`、`rewrite-*.md` 4/4、`profiles/development/README.md`）。

---

## 6. 基线哈希（供复核与复现）

| 文件 | SHA-256 |
| --- | --- |
| `AGENTS.md` | `69A09A18355731F946C3319FC1231A5C3ADDD7EB97626A808922BC4369006510` |
| `docs/governance/document-registry.yaml` | `5C0EA7066568D043A45B77E69AD760EE67D58C77E17AE0E109DF9E2039AC91EF` |
| `docs/governance/project-binding.yaml` | `97BC21021377F42E52F73D14862B7EE7E8BF3093E9A95CF69E31D42094D9DF56` |
| `docs/governance/agent-readable-documentation.md` | `22A0593ED75847ECCA64FB6B277C5D1316BBF02B8A3B6648960069DEB3EDBBDF` |
| `docs/governance/code-development-standard.md` | `081D7E73D43FA4BEDC24E11D969D1DA0F9A7496B2CD251DE5B2B2CE6EBB9FF61` |
| `docs/operations/environment-handoff.md` | `A26D26BA790E3A18259596DF0B1CD9853338720DB27035D0C897F681A3496F58` |
| `docs/operations/development-iterations.md` | `7E1A1245A666CCA01D0090DEBF1E7679BF565E32E003458D9FC0D10A807ABE13` |
| `docs/technical-architecture.md` | `F42D204203012C81139773CF5A4A5D6D7A9A67E57B2418C26F66A7F3DEA0BD50` |
| `docs/architecture.md` | `93223320EF00F9D671ACB802CCC8ABAEB29145ED71E22F5CD969E80D05861429` |
| `docs/decisions/official-team-and-dsh-fork.md` | `91574AA0C3E6447F13FC9A01AB24D0B6ECDFB6D800AB4D8306E170B436590E3F` |
| `profiles/development/README.md` | `75DD39713C389A8D8F78C5335078185910C136173FC441CC36F389B414107E62` |

**扫描期间未检测到并发写入**：上述哈希在扫描开始与结束时两次测量一致。

---

## 7. 边界与未执行项

**未执行**：未修改任何被审文档；未提交、未推送、未建 PR；未启动任何服务；未调用模型；未运行产品验收或故障注入。

**唯一例外并已还原**：运行 `validate-docs.cjs` 时该脚本按其固定路径覆盖了 `.artifacts/operations/r001-20260916/document-validation.json`。该文件**不在我的写面内**；已按运行前备份字节还原并核对哈希一致，本次运行产出另存于本任务目录。详见 §4.3。

**未覆盖**：

- 未复核 `.artifacts/` 下的历史回执内容是否仍与当时候选一致（属历史范围，且 ENV-04 要求保留原范围）。
- 未复核 `docs/technical-architecture.md` 与 `docs/decisions/official-team-and-dsh-fork.md` 的**源码事实行号**是否仍对 DSH 0.1.6-alpha.1 成立——该重核归 **task-1（baseline-auditor）**；本报告只记录基线并存这一登记事实（S-14）。
- 未复核团队 Skill 7 份通用 references 与 3 份 assets 的**内容质量**（§10 豁免其格式，且非 SoloIPs 决策正文）。
- 未评估 `.artifacts/operations/` 下未忽略的子目录是否会进入提交（`git check-ignore` 确认 `.artifacts/operations/` 整体被忽略）。

**审查结论不构成产品验收**，也不构成文档合规通过；`validate-docs.cjs` 的退出码 0 只覆盖其 8 个文件。
