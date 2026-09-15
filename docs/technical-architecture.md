# SoloIPs 技术架构：交付、装配、状态与验收

## 1. 阅读契约

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | SOLO-TECH-ARCH；由原 SOLO-ARCH-DRAFT 延续，旧需求/机制/验收 ID 保留；角色与路径见文档注册表 |
| 文档状态 | 正式技术设计基线。§1.4 受委托裁定标〔约束〕；未采纳细节仍标〔建议〕/〔待决〕。产品目标与首版范围由 [架构入口](architecture.md) 及其需求来源承载 |
| 读者 | 智能体优先（documentation.primaryReader: agent）；人类可读靠结构而非叙事 |
| 目的 | 收敛「DSH 为基础设施，SoloIPs = 一组插件包 + 一个 profile」这一交付形态：包清单与边界、装配与 patch 机制、事实归属、失败与恢复、验收合同、待决项 |
| 范围 | 交付形态与包边界；装配、profile 与 patch 组合契约；分层/回归/回滚；客户端组合与业务事实分离；失败与恢复；验收场景与反例；待决项。**不含**产品 PRD、PV 创意与制作参数、包内领域建模正文、实现进度、运行版本台账 |
| 决策状态 | 用户 2026-09-16 以“你来给我决定”委托本轮文档落点及技术取舍，§1.4 记录受委托技术约束；不得将其伪写成用户逐项确认的业务需求 |
| 证据范围 | 仓库文档、DSH 源码、历史团队转录分别标注；沿用而未复核的观察不升格。packages/...、apps/...、vendor/... 默认相对 DSH_CHECKOUT；dsh-agent-swarm/src/... 相对 DSH_CHECKOUT/packages/.external；company-core/... 相对 COMPANY_CORE_CHECKOUT；重构文档相对 REFACTORING_DOCS_ROOT，解析见附录 B。DSH 与项目同名 docs/architecture.md 须区分 |
| 交付状态 | 技术决策已经明确；产品交付仍为〔提案〕。本文不提供产品〔已实现〕〔已验证〕〔已集成〕结论，第 11 章仍为未执行的验收设计 |
| 依据 | 格式：SOLOIP-DOC-001 [SoloIPs 文档格式规范](governance/agent-readable-documentation.md)。权威与边界：[项目绑定](governance/project-binding.yaml)、[文档注册表](governance/document-registry.yaml)、[项目指令](../AGENTS.md)、[架构关系与首版交付](architecture.md)、重构文档入口（用户裁决 2026-09-15：当前开发、修复和验收一切以重构文档为准） |
| 变更权 | 用户保留产品目标与最终验收权；获委托者可维护委托范围内技术决定，单一写者，重大需求变更须回到用户。正式设计不自动授权产品实现、建队、启服务或生产变更 |

### 1.1 标注读法

三个维度正交，判定规则见 SOLOIP-DOC-001 §2，本文不重抄规则正文：

| 维度 | 本文取值 | 本文用法约定 |
| --- | --- | --- |
| 决策 | 〔需求〕〔约束〕〔建议〕〔待决〕〔已取代〕 | 〔需求〕〔约束〕必须带来源；其余不得升格 |
| 证据 | 〔源码事实〕〔推断〕〔未验证〕 | 〔源码事实〕必须绑定来源 + 版本/日期 + 已证边界；「本文未独立复核」是边界声明，不是否定结论 |
| 交付 | 〔提案〕〔已实现〕〔已验证〕〔已集成〕 | 只描述交付层级，不用作「源码已核对」的同义词 |

- **复合陈述拆分**：一条陈述只要有一部分仍是建议或未验证，就不得整体标为〔需求〕或〔源码事实〕。
- 〔建议〕内的「必须」只描述该建议成立所需条件，不是已生效命令。
- 跨章引用写稳定 ID，不写「如前所述」。
- **维度归一化说明**：第 11 章原稿把〔已验证〕用作「本次已只读核对到源码行」的证据标签。按 SOLOIP-DOC-001 §2，〔已验证〕属交付维度，故本文把该用法统一改写为〔源码事实〕（绑定来源行与附录 B 基线），场景本身保持〔提案〕+〔未验证〕。语义未变，登记见附录 A2。

### 1.2 阅读路径与修订边界

| 内容 | 正文入口 |
| --- | --- |
| 已确认需求与技术候选分界 | 第 4 章；用户来源保留原消息 ID |
| 包职责、装配顺序、数据根 | 第 5 章、SOLO-C01、SOLO-DATA-01–04 |
| 同实例 open 与跨进程 fencing | §7.2、SOLO-FENCE-01 |
| 装配恢复与状态恢复 | SOLO-ROLLBACK-01–04、SOLO-ACC-06 |
| 上游错误停止、通知与恢复 | SOLO-F09；需求权威仍为 ORG-13 |
| 验收与待决 | 第 11 章、第 12 章 |

初稿材料来自原文档团队。修订直接更正正文，证据与建议分别标注；不受“仅组装、不得更改作者结论”这一历史分工限制。变更权仍见阅读契约与注册表。附录 A 保留修正依据，不维护成员进度或邮件到达状态。

### 1.3 本文的反面声明（只保留与本文相关的区分）

- 装配、安装、启用 ≠ 实际被调用（activation-is-not-invocation）。
- 构建成功 ≠ 产品验收（build-success-is-not-product-acceptance）。
- 文件写入成功 ≠ 停止重启后能读回；文件存在 ≠ 内容有效；「未报错」≠「配置正确」。
- --dump-config 通过 ≠ 功能可用；patchReload: live 下的运行态 ≠ 重启后仍然如此。
- 一个环境（55120）通过 ≠ 普遍兼容；另一个 home 的历史观察不能替代 55120 的实际证据。
- 客户端能渲染一条业务行 ≠ 该业务事实由客户端拥有；持有 ≠ 可访问。
- 成员邮件结论一致 ≠ 用户确认；队长综合结论 ≠ 用户确认。
- 本文记录了某条规则 ≠ 该规则已实现、已验证或已集成。

### 1.4 受委托技术裁定（ARCH-D01–07）

**来源与标注**：用户 2026-09-16 在本项目会话中要求“你来给我决定”，所指清单包括文档落点、包数量、数据根、patchReload、下一步验证及任务限制。下表为据此作出的〔约束〕，不声称用户亲自选择了每个技术细节；既有业务需求及产品验收权不变。

| ID | 决定 | 理由、作用范围与执行边界 |
| --- | --- | --- |
| ARCH-D01 | 将原草稿迁移为独立技术架构正文，登记 stable-authority；architecture.md 保留产品范围与阅读入口 | 技术机制、数据根和验收统一在本文维护，产品目标不抄入第二份 PRD；原草稿身份由本身份接续，不保留并行正文 |
| ARCH-D02 | 首版采用 5 个包的边界：bundle、core、adapter-dsh、web、tools-pv；同仓、统一版本锁与交付组合 | core 持有业务写权威，adapter 收敛 DSH 依赖，web 负责界面，bundle 负责装配，tools-pv 接制作工具。包边界不代表五套服务/发布流水线。S0 只实际交付所需前四包；tools-pv 随 S1 接入真实工具时加入，不建空包占位 |
| ARCH-D03 | 生产、验证、恢复各用独立 DSH_HOME；完整交付使用同一个 soloips profile 定义 | 实际 backend、Session、资产及 overlay 路由也须隔离（SOLO-DATA-01–04）。同 home 双 profile 只用于明确的共享状态测试或已证明兼容的顺序切换，不作为默认灰度/数据恢复方案；独立 home 不能替代 fence 与一致恢复点 |
| ARCH-D04 | 新 SoloIPs 正式与验收 profile 名为 soloips，显式设置 patchReload: startup | 首片优先可复现冷启动与恢复证据。开发 live 仅可在独立验证 home 的临时 profile manifest 中显式设置；正式/验收使用锁定的 startup 定义并冷启动核对。patchReload 来自 manifest.dsh.profile.patchReload（DSH profile.ts:775-782），不能靠业务 patch/overlay 切换；本决定不就地更改现有 55120 配置 |
| ARCH-D05 | ORG-13 直接沿用既有需求正文；本文由 SOLO-F09、SOLO-ACC-07/08 承接 | 其权威在 02-company-contract.md §11.9 及 ORG-A09/A10；站内停线不延期，短信/邮箱按既有后续边界 |
| ARCH-D06 | “任务数为 0”限定于文档阶段，不再作为后续工程的长期限制 | 进入已获授权的工程切片时，使用现有原生任务系统登记真实工作；不为填板而批量建任务，不以本裁定替代 S0 实现或新建团队授权 |
| ARCH-D07 | 后续按 S0 的最小闭环推进：先绑定真实安装候选/数据根，核验公司写保护及 Host 接线，再核对目标 client 组合与冷启动恢复 | fence 候选已存在，重点是每个真实提交点与路径别名的证据。允许在已授权切片中边修接线边完成验收，不要求尚未实现的功能在开工前已经通过；没有通过 ORG-06 则不启用公司写入 |

**技术收敛不等于实施许可**：本次落实文档决定；产品代码、运行探针、新服务、55120 部署切换、凭据与真实外部副作用仍分别遵守项目授权。工程任务登记可与获授权切片的准备并行，不把所有待决项排成串行审批关卡。

## 2. 目的与范围

### 2.1 本文要回答的问题

| ID | 问题 | 承接章节 |
| --- | --- | --- |
| DRAFT-Q01 | SoloIPs 与 DSH 的底座/基础设施关系是什么，边界在哪里 | 4.2、TERM-15、附录 A1 |
| DRAFT-Q02 | 交付形态「一组插件包 + 一个 profile」由哪些插件包组成，各自写权威是什么 | 3.2、第 5 章、第 7 章 |
| DRAFT-Q03 | 装配机制（加载顺序、patch 语义、安装、失败半径、回滚）给出哪些硬约束 | 4.3、第 6 章、第 10 章 |
| DRAFT-Q04 | 单写权威与 domain 归属如何在实际机制上成立，不靠约定 | 4.3、第 10 章、SOLO-ACC-02/03（→ ORG-06） |
| DRAFT-Q05 | Host 业务事实与客户端视图如何分离 | 第 9 章（CLIENT-09、CLIENT-12）、第 8 章（SOLO-REG-04） |
| DRAFT-Q06 | 从复用 DSH Web 换成独立界面时，哪些可丢弃、哪些必须留 | 第 9 章（CLIENT-16、CLIENT-17） |
| DRAFT-Q07 | 失败与恢复（装配失败半径、回滚、上游 API 停线）怎么处理 | SOLO-F09、SOLO-ACC-07/08；已确认权威 ORG-13、ORG-A09/A10 |
| DRAFT-Q08 | 首版（S0/S1）需要观察到什么才算这份形态可用 | 第 11 章（→ docs/architecture.md §5、§6） |
| DRAFT-Q09 | 剩余待决项是什么、责任人是谁 | 第 12 章（队长撰写），汇总见 12.1 |

### 2.2 范围内

- 交付形态与包清单的已选边界（术语与判据在本文，规则正文在各技术章）。
- 装配层必须遵守的宿主机制约束（〔源码事实〕+ 复核状态），集中登记于 4.3，正文归第 6、10 章。
- 业务事实归属与「客户端零可写业务状态」的分离线（SOLO-A02、ORG-06、CLIENT-*）。
- 失败半径、恢复与回滚缺口对应的验收合同（第 10、11 章）。
- 术语统一与冲突登记（第 3 章 + 附录 A3–A9），供定稿时收敛为单一正文。

### 2.3 范围外（明确不做）

| 不做 | 原因与去处 |
| --- | --- |
| 确认或修改产品业务需求 | 用户是产品目标与最终验收的唯一决定者（AGENTS.md 项目红线）；业务需求见 docs/architecture.md §1 与 V0.4 |
| PV 的创意、时长、画幅、画风、声音、生成工具选型 | docs/architecture.md §5、§9 留待制作任务启动前收敛；本文不假定已有视频服务可调用 |
| 包内领域建模、字段定义与持久 schema 细节 | 属第 5、7 章（backend-deepseek）；本文只收录其包级与写权威结论 |
| 实现进度、谁在做、哪个版本当前可用 | documentation.liveStatusInCommittedMarkdown: forbidden；动态状态留在原生任务系统 |
| 第二套任务/尝试状态机或状态台账 | docs/architecture.md §3（SOLO-A02）：任务与尝试的唯一权威在协作内核 |
| 修改宿主源码、服务配置或凭据 | 本文是设计基线；运行与实现动作按项目红线另行授权 |
| 微服务集群、第二套调度器、向量库等预留设计 | docs/architecture.md §6：需要它们时应有业务量或功能证据 |

### 2.4 单一权威与文档落点

〔约束 DRAFT-D01〕按 ARCH-D01 登记为独立技术架构；原 SOLO-ARCH-DRAFT〔已取代〕→ SOLO-TECH-ARCH，保留原 DRAFT-* 等 ID 作为追溯标识。原文件迁移，不保留第二份相同正文。

- 产品目标、首版成果与业务取舍引用 [架构入口](architecture.md) 和既有用户/重构需求来源。
- 包边界、装配、存储身份、运行配置、恢复与技术验收以本文指名正文为准；架构入口不重复维护这些规则。
- 部门、资料室、员工生命周期、入职准入、头像和 ORG-13 仍引用 REFACTORING_DOCS_ROOT；本文不改其需求。
- 文档格式与角色分别由 SOLOIP-DOC-001 与注册表负责。

## 3. 术语与边界

本章是本文用词的唯一正文。术语表来自 docs-glm 的审查稿（2026-09-16 邮件），由写者按 SOLOIP-DOC-001 §2 调整标注维度后并入；术语冲突的定稿权在队长与用户（见 3.4）。

### 3.1 术语表

| ID | 术语 | 一句定义与用词规则 | 标注与来源 |
| --- | --- | --- | --- |
| TERM-01 | 插件包 | DSH「Everything-is-a-plugin」体系中的能力交付与安装单元；SoloIPs 交付形态 = 一组插件包 + 一个 profile。用词：交付单元语境中文一律「插件包」，不用「包/插件/扩展」混指；指具体单元时写包名 | 〔约束〕用户 2026-09-15 交付形态要求（见 4.2 SOLO-R02）+ 官方微内核表述 |
| TERM-02 | bundle | dsh.profile.bundles 的条目；该数组决定 bundle patch 层的叠加序，之后另有 profile/home/launcher 层；服务激活不由数组位次保证 | 〔源码事实〕SOLO-C01/C02、§6.1 |
| TERM-03 | profile | 声明 bundles 数组与部署设置的 DSH 装配清单；只负责组合依赖与部署设置，不是状态权威 | 〔约束〕承接 docs/architecture.md §6 既有表述 |
| TERM-04 | 层（包职责标签） | 对插件包职责的文档性标签（装配层 = soloips-bundle、唯一状态包 = soloips-core、可丢弃层 = soloips-web），**无 DSH 运行时语义、不承载加载顺序**；soloips-tools-pv 的标签为「不 open domain」（含义见 DRAFT-D02），adapter 包的层标签待定稿 | 〔建议〕定稿权在队长/用户（TERM 冲突 C-5） |
| TERM-05 | patch | 按 id 定位行后替换给出的顶层字段；其中 config 若给出则整体替换，非深合并 | 〔源码事实〕SOLO-C03 |
| TERM-06 | 行 id | 配置行的稳定定位标识；多次 patch 可顺序覆写同一既有行，区别于 group 配置重复定义 entry ID | 〔源码事实〕SOLO-C03、SOLO-C04、SOLO-F03 |
| TERM-07 | domain | DSH 持久化的命名状态域；同一 DomainFacility 实例内每个 domain name 只允许一个 opener；跨实例或跨进程独占另见 SOLO-FENCE-01 | 〔源码事实〕packages/storage/storage-domain/src/index.ts:65-72、103-107；基线附录 B 第 3 项 |
| TERM-08 | 写权威 | 某类事实的唯一合法写入来源；ARCH-D02 规定 core 持有业务写入口，其余包只读或经命令服务请求写入，不与人或角色的 owner 混用 | 〔需求〕ORG-06 要求实际独占；〔约束〕包归属见 ARCH-D02 |
| TERM-09 | 投影 | 由权威事实派生的只读视图（界面列表、计数、AGENTS.md 之于 project-binding.yaml）；投影不回写、不是第二事实来源，与 document-registry 的 role=projection 同义 | 〔约束〕引用 document-registry，不重抄定义 |
| TERM-10 | 装配 | DSH 组合配置并按服务依赖激活插件的过程；bundle 层按数组叠加不等于插件顺序启动 | 〔源码事实〕SOLO-C01/C02、SOLO-F02/F04 |
| TERM-11 | 组合 | 一次交付所选插件包 + profile + 版本锁定的静态构成清单；**组合是清单、装配是动作，不得互换** | 〔约束〕本文用词规则 |
| TERM-12 | 验收基线 | 验收结论绑定的指名版本组合（宿主、各插件包版本、公开 API、安装包及 DSH_HOME/patchReload 等配置）；基线外不得外推结论。统一用「验收基线」，旧稿「验收组合」为被取代同义词 | 〔约束〕SOLOIP-DOC-001 §6 |
| TERM-13 | append | dsh plugin add 只追加、不改既有行、无排序语义 | 〔源码事实〕SOLO-C01 依据 2 |
| TERM-14 | 回滚 | 恢复指定装配或状态检查点：装配回退须证明状态兼容；状态回退须有一致恢复点及明确的数据处置 | 〔建议〕SOLO-ROLLBACK-02、SOLO-ACC-06；默认根见 SOLO-DATA-01 |
| TERM-15 | 底座 | 宿主运行时基础设施统称，本项目 = DSH 及其公开扩展点；旧稿「DSH 执行底层」为被取代同义词 | 〔约束〕用户 2026-09-15「DSH 是基础设施」（见 4.2 SOLO-R01） |
| TERM-16 | 单包失败 | 须区分 bundle 解析、Loader 挂载、缺依赖 pending、客户端激活/稳态；不得从“某包出错”一概推出整个 profile 无法启动 | 〔源码事实〕SOLO-F01/F02/F04/F06；CLIENT-03 |
| TERM-17 | 状态包 | 持有业务 domain 的包；soloips-core 为所选唯一业务状态包，其他包不另持有该业务权威 | 〔约束〕ARCH-D02；真实写保护仍按 SOLO-FENCE-01 验证 |

### 3.2 插件包清单与边界词表

包边界与分期交付为 ARCH-D02〔约束〕；包内接口与未采纳实现细节仍保持各自标注。正式写权威必须以实际调用和状态归属验证，不能由包名推导。

| 已选包（ARCH-D02） | 职责与细节标注 | 是否 open domain | 规则正文 |
| --- | --- | --- | --- |
| soloips-bundle | 〔约束〕装配职责；〔建议〕官方行仅经此包覆写，具体规则见第 6 章 | 否 | 第 6 章（SOLO-C01–C07） |
| soloips-core | 〔约束〕唯一业务状态包：company + collaboration + artifacts + ip；内部模块化 | 是（唯一业务 opener 包） | 第 5 章 5.1、第 7 章 7.4 |
| soloips-adapter-dsh | 〔约束〕DSH seam 适配职责；具体 import 契约见第 5 章 | 否（第 5 章 5.1） | 第 5 章 5.1、第 7 章 |
| soloips-web | 〔约束〕可替换视图层；client 注入细节按第 9 章建议验证 | 否 | 第 8、9 章 |
| soloips-tools-pv | 〔约束〕S1 制作工具适配；〔建议〕经 core 命令服务保存 job/产物（DRAFT-D02），不直接写 domain | 否（含义见 DRAFT-D02） | 第 6 章 + 第 5 章 5.1 |

### 3.3 边界判据（中性判据，供各章引用）

| ID | 判据 | 依据 |
| --- | --- | --- |
| DRAFT-B01 | **事实归属**：一个状态属于谁 = 谁写它（唯一写路径）、谁能改（授权来源）、重启后从谁读回（可核对） | SOLO-A02、ORG-06、ORG-03 的「实际保存与读回」要求；SOLO-ACC-05 |
| DRAFT-B02 | **可丢弃性**：删除该层后 Host 事实完整、界面可由只读投影重建，才算可丢弃 | CLIENT-09、CLIENT-16、CLIENT-17 |
| DRAFT-B03 | **依赖面**：被其他包 inject/domain 引用、或被 patch 重述的 face，即长期契约，变更须单独验证 | SOLO-C03、SOLO-C04、CLIENT-04 |
| DRAFT-B04 | **失败半径**：一个包出错波及多大范围，由装配机制决定而非由约定决定 | SOLO-F01、SOLO-F02、CLIENT-03、TERM-16 |
| DRAFT-B05 | **合并判据**：两个包若需写同一份持久数据的同一字段，必须合并 | 队长综合 2026-09-15（backend-hy4 判定规则）；正文见第 5、7 章 |
| DRAFT-B06 | **反面声明**：持有不等于可访问；本地存在不等于权威；安装启用不等于被调用 | SOLOIP-DOC-001 §5、CLIENT-08、CLIENT-10、SOLO-REG-04 |

〔建议 DRAFT-D02〕“不 open domain”指 soloips-tools-pv 不取得或保存 core 的持久 domain handle，不直接写状态文件。它可以提供制作工具服务；通过 core 的命令服务提交 operationId、原 jobId、产物引用及结果，由 core 校验身份、资格与 writer fence 后提交。正式服务签名、结果查询与 schema 随 S0/S1 在公开接口上验证；此定义不宣称该接口已经存在。

### 3.4 术语与候选一致性

| ID | 处理规则 | 决策边界 |
| --- | --- | --- |
| C-1 | Team 域指状态；collaboration 指 core 内模块；swarm 指实现来源插件；官方 Team face 指宿主接口 | 〔建议〕不互换含义 |
| C-2 | 包边界见 ARCH-D02；PKG-01–03 专用于新增持久业务状态包判据 | 〔约束〕不复用 PKG-01 作取代 ID，产品分层仍保留 |
| C-3 | 统一用 TERM-12“验收基线” | 〔约束〕本文术语 |
| C-4 | 工作台是用户入口；soloips-web 是候选实现包；DSH Web 是宿主界面 | 〔建议〕分别保留 |
| C-5 | 职责层不决定包数或启动顺序 | 〔建议〕旧产品分层仍有效 |
| C-6 | 投影消费权威事实，不另建可写权威 | 〔约束〕沿用 SOLO-A02 |
| C-7 | DSH 基础设施统一称底座 | 〔需求〕SOLO-R01 |
| C-8 | patch、append、回滚、行 id 使用 TERM-05/06/13/14 | 〔约束〕本文术语 |
| C-9 | 源码基线与部署观察分开记录 | 〔约束〕附录 B |
| C-10 | 完整与 S0 顺序只在 SOLO-C01 定义；5.4、SOLO-LAYER-01 引用它 | 〔约束〕ARCH-D02；服务启动先后仍不由数组位次保证 |
| C-11 | 源码复核用〔源码事实〕；运行验收另给实际证据 | 〔约束〕SOLOIP-DOC-001 §2 |

### 3.5 本文不采用的概念

本文不使用「第二套 Team 权威」「微服务集群」「向量库」「市场验证」「员工数/任务数作为完成度指标」作为设计依据；理由逐条见 docs/architecture.md §2、§6 与 §7。

## 4. 已确认需求与约束

### 4.1 产品需求（用户确认，本文只引用不复制正文）

| ID | 主题 | 决策 | 来源 |
| --- | --- | --- | --- |
| SOLO-01 | SoloIPs 以 DSH 为底层框架；第一版让用户把目标交给 AI 公司，员工协作产出，用户验收 | 〔需求〕 | docs/architecture.md §1「已确认，SOLO-01」（2026-09-15 用户确认） |
| SOLO-02 | 第一版先复用 DSH Web 完成闭环，再逐步替换为 SoloIPs 界面；复用外壳仍需呈现业务目标、当前负责人、待回答事项与真实交付物 | 〔需求〕 | docs/architecture.md §1；本文第 8、9 章是其实现候选 |
| SOLO-03 | 第一条业务验收选择短剧：先 IP 简纲，再测试生成可观看的 PV；PV 是试水宣传短片 | 〔需求〕 | docs/architecture.md §1 |

- 业务主线（IP 孵化 → 试水作品 → 发行 → 数据反馈 → 扩展/重构/资产复用）是**〔产品愿景，来自 V0.4〕**，不是本文的规则来源。
- 反面声明：SOLO-01–SOLO-03 不蕴含界面已完成、不蕴含视频服务已可调用、不蕴含首片等于完整短剧制作与发行完成。

### 4.2 交付形态：用户要求与团队候选必须分开

用户原话（Team 公开记录，作者 local-operator）确立底座关系与交付形态；§1.4 的后续委托确立本稿所选技术约束，不能倒写成此前已逐项确认。

| ID | 陈述 | 决策 | 来源（可核对） |
| --- | --- | --- | --- |
| SOLO-R01 | DSH 是基础设施；SoloIPs 的功能以插件形式组合在其上 | 〔需求〕 | Team 公开消息 public-97c9d584（2026-09-15 15:42:51Z，local-operator） |
| SOLO-R02 | SoloIPs = 一组插件包 + 一个 profile，从 DSH 基础设施上组合起来；用户同时要求研究「如何拆分插件、优化组合方式」并先整理核心包 | 〔需求〕 | public-082313dc（15:46:11Z）、public-74132fa8（「先把核心包给我整理出来」） |
| SOLO-R03 | 先落实一份架构草稿文档，按规范执行，队长与 QA 都要审查 | 〔需求〕 | public-45c5f8fa（16:00:58Z）；本文即该要求的交付物，交付状态仍为〔提案〕 |
| DRAFT-S01 | 「SoloIPs 自身为主」的精确措辞（底座归 DSH、业务事实归 SoloIPs） | 〔建议〕 | 队长对成员意见的综合表述（public-27fd2c06，2026-09-15 15:44:07Z 前后，4/4 选路线 B）；**用户原话只说「DSH 是基础设施」**，故本条不得标〔需求〕 |
| DRAFT-S02 | 5 包边界、分期装配与 SOLO-C01 顺序 | 〔约束〕ARCH-D02 | 原团队方案为技术来源；生效依据为 2026-09-16 用户委托及 ARCH-D02，不以成员一致代替授权 |
| DRAFT-S03 | core 持有唯一业务状态权威，web 为可替换视图层 | 〔约束〕ARCH-D02 | 业务单权威要求沿用 SOLO-A02/ORG-06；具体分包为受委托技术决定 |

- **复合陈述拆分**：SOLO-R01/R02 是已有用户需求；5 包为受委托技术约束 ARCH-D02，二者不得合并成一条业务〔需求〕。
- 历史成员一致不构成用户确认；本轮技术选型的授权来源单独保留在 §1.4。

〔约束 DRAFT-D03〕DRAFT-S02/S03 按 ARCH-D02 纳入技术设计基线；S01 仅为术语建议。实际产品实现须有切片授权，不再重复询问已在 §1.4 决定的技术选择。

### 4.3 装配机制事实（集中登记，便于一次性复核）

第 6、10 章给出正文与源码行号；本节只做集中索引，避免同一机制在多章各写一份（SOLOIP-DOC-001 §7）。基线见附录 B。

| ID | 陈述 | 证据标注 | 正文/反例 | 对交付形态的直接影响 |
| --- | --- | --- | --- | --- |
| MECH-01 | bundles 决定 bundle patch 层序；层内 patch 依列表遍历；其后还有 profile/home/launcher 层；服务激活依赖就绪情况 | 〔源码事实〕apps/cli/src/profile-boot.ts:206-213；packages/boot/app-boot/src/profile.ts:784-793；vendor/include/src/index.ts:77-124；packages/bundle/base/cordis.patch.yml:12-13 | SOLO-C01/C02、SOLO-ACC-CE-A | 配置覆盖序与服务激活先后分别验收 |
| MECH-02 | 命中行的顶层字段按键赋值；提供 config 时整体替换 config，不做深合并；未给出的顶层字段保留 | 〔源码事实〕vendor/include/src/index.ts:121-124；packages/bundle/base/cordis.patch.yml:6-10 | SOLO-C03；SOLO-FAIL-01、SOLO-FAIL-10、CLIENT-F03、CLIENT-X06 | 覆写 config 必须重述所需字段，不能推断整行所有字段都被删除 |
| MECH-03 | reconcile 将新发现的 bundle 追加到数组，不重排已有项；失去声明的受依赖管理项会移除 | 〔源码事实〕apps/cli/src/plugin.ts:65-69、77-90 | SOLO-C01 依据 2；SOLO-FAIL-03；SOLO-LAYER-02 | 交付维护完整 bundles 与 patch 顺序，不能把安装先后当完整装配合同 |
| MECH-04 | 当前设计不得依赖未经证明的跨 domain 原子提交 | 〔未验证〕DRAFT-D05：尚未取得目标存储组合的跨 domain 事务正面证据；检索无结果不证明能力不存在 | SOLO-ACC-CE-G（保持〔提案〕）；DEP-D05、ORG-07 | 多域写入不承诺共同原子提交，具体能力在实现切片核实 |
| MECH-05 | already-open 只拦截同一 DomainFacility 实例内的同名 open；默认 JSON 后端无跨进程写锁 | 〔源码事实〕2026-09-16 复核，storage-domain/src/index.ts:65-72、103-107；storage-json/README.md:142（均位于 packages/storage/） | §7.2、SOLO-FENCE-01、SOLO-ACC-02/09；ORG-06 | 同实例 open 与跨 Host 独占分别验收；缺少后者不能启用公司写入 |
| MECH-06 | bundle 无法解析或缺少声明会拒绝本次 profile 加载；后续挂载、pending 与客户端稳态分别处理 | 〔源码事实〕packages/boot/app-boot/src/profile.ts:749-756、784-793；vendor/cordis/README.md:65；目标运行影响〔未验证〕 | SOLO-F01/F02/F03/F04、CLIENT-03 | 按实际阶段评估失败范围，不由包数推导全部结果 |
| MECH-07 | runPlugin 路径不提供应用级安装快照或失败恢复；实际残留由安装器与失败阶段决定 | 〔源码事实〕apps/cli/src/plugin.ts:120-162 | SOLO-F07；SOLO-ACC-06；SOLO-ACC-CE-D；SOLO-ROLLBACK-01/02/03 | 装配与状态分别恢复；不从此推断安装器所有内部行为 |
| MECH-08 | 失去 dsh.bundle 的受依赖管理项被移出 bundles；该移除分支不发专门告警 | 〔源码事实〕apps/cli/src/plugin.ts:70-75、77-90 | SOLO-F05；SOLO-ACC-CE-E；相关普通依赖场景见 SOLO-FAIL-04 | 核对完整生效树与功能入口，其他层仍可能接入该能力 |
| MECH-09 | 未命中/不匹配分支调用 warn 后跳过；日志可见性由调用入口决定，覆盖次序包含 launcher 层 | 〔源码事实〕vendor/include/src/index.ts:83-90、110-119、267-270；packages/boot/app-boot/src/profile.ts:841-847；apps/cli/src/profile-boot.ts:206-213 | SOLO-F06；SOLO-FAIL-02；SOLO-ACC-CE-C；SOLO-REG-Q5 | 退出码不能替代组合断言；局部 warn/skip 不保证整个启动结果 |
| MECH-10 | live 更新未完成、被拒或恢复旧配置时，磁盘候选与运行树可能不同 | 〔源码事实〕apps/cli/src/profile-boot.ts:328-333、350-381；vendor/include/src/index.ts:296-319；vendor/hmr/src/index.ts:305-315 | SOLO-F08；SOLO-ACC-05；SOLO-ACC-CE-H | 旧树保留受回滚是否成功限制；冷启动与状态读回分别验证 |

〔未验证 DRAFT-D04〕各阶段失败范围见 TERM-16、MECH-06、SOLO-F02 与 CLIENT-03；组合解析、Loader 挂载、客户端激活及稳态须分别核对，具体目标运行表现待 S0 验证。

〔待决 DRAFT-D05〕目标存储组合的跨 domain 事务能力尚未验证。实施者按 MECH-04、ORG-07 核对实际公开契约与提交边界；能力未证时设计不得依赖共同原子提交，不把历史成员结论当作能力不存在的证据。

### 4.4 重构文档既有约束（指针，不复制正文）

来源：REFACTORING_DOCS_ROOT（解析路径见 docs/architecture.md §9）。用户裁决 2026-09-15：**当前开发、修复和验收一切以重构文档为准；旧文档只作参考。** 使用顺序：用户最新明确要求 → 重构文档已确认条目与定稿设计 → 本文〔建议〕。

| ID 族 | 主题 | 正文位置 | 与交付形态的关系（只写关系，不复述规则） |
| --- | --- | --- | --- |
| DEPT-01–DEPT-04 | 部门成立顺序、部门定义、工作风格差异、组织/项目/协作/执行分开 | 01-departments.md | DEPT-04 决定长期资料与 attempt 执行根解耦 → 约束 soloips-core 持久化边界与「不寄托于任一 Team 目录」 |
| LIB-01–LIB-11 | 资料室保存/登记/定位/版本引用/授权访问；先保全再提交引用；审查绑定版本；取消与删除分开 | 01-departments.md | 约束 soloips-core 与 soloips-tools-pv 的素材保存、版本引用与授权面（LIB-04、LIB-05、LIB-08、LIB-10） |
| DEP-D01–DEP-D11 | 部门/任职变动的定稿设计（先处理旧执行再启用新关系、保存/启用/共享分别控制等） | 02-company-contract.md | DEP-D05 与 MECH-04 共同否决「共同原子提交」类承诺 |
| DEP-R01–DEP-R07 | 已确认要求映射（先部门再管理员再招募、入职完成前不派单、Skills 归属等） | 02-company-contract.md | 派单入口的准入拦截面（→ ORG-03） |
| DEP-A01–DEP-A11 | 上述要求的验收场景 | 02-company-contract.md | 第 11 章验收合同的既有来源，本文不重复设计 |
| DEP-O01–DEP-O07 | 人事权、人格初始化、跨部门协作、知识保留边界、审计组织等待决 | 02-company-contract.md | 保持〔待决〕，不得因本文整理而升格 |
| ORG-01–ORG-13 | 公司根与暂停入口、完整入职与增量复核、文件不授权、私人资产、**实际单 writer（ORG-06）**、准备/撤权/接管分开、分层归属、自主与交接、入口分离、先审查再纵向交付、上游故障停线 | 02-company-contract.md | ORG-06 要求跨 Host 独占；ORG-11 否决准入旁路；ORG-13 已确认正文在 §11.9，验收 ORG-A09/A10 在 §11.8；本稿承接见 SOLO-F09、SOLO-ACC-07/08 |
| AVATAR-64-01–AVATAR-64-05 | 仅原生 64、偏好、读写与展示一致性、提示词与反例要求 | 04-avatar-64.md | 入职必需项不降为可选（→ ORG-03）；执行顺序按原需求验证，个人经历不作为目标候选的运行证据 |
| — | 纵向交付顺序、缺项反例、候选集成与实际安装验收 | 03-delivery-and-acceptance.md | 第 11 章验收合同的现行正文；SOLO-REG-04 的〔需求〕来源 |

〔推断〕上表中 DEP-D/R/A/O 按 02-company-contract.md 章节含义归类；具体条目及决策状态以来源正文为准。

### 4.5 项目红线（〔约束〕）

来源：docs/governance/project-binding.yaml 的 redLines 与 AGENTS.md 项目红线。

| 红线 | 对本文形态的直接后果 |
| --- | --- |
| 用户是产品目标与最终验收的唯一决定者 | ARCH-D01–07 仅落实受委托文档/技术决定，不确认新业务需求，不替代产品验收 |
| 上游 API 鉴权、额度、QPS、连接或流中断错误：首次发现立即停止受影响动作并通知用户；不自动重试、不换路由、不归档、不删除、不批量取消 | SOLO-F09、SOLO-ACC-07/08 承接 ORG-13；外部通知占位不阻塞站内停线 |
| 不改凭据、不启新服务、不开原生 Windows 终端或目录选择窗口 | 本文所有核对均为只读；55120 的部署不因本文改变 |
| 单一权威与授权修订 | 按 ARCH-D01 同步本技术正文、产品入口与注册表，不建立同题副本 |
| 安装启用 ≠ 实际调用；构建成功 ≠ 产品验收 | 所有「可用」陈述必须区分装配、调用、验证三层（SOLO-REG-04、第 11 章） |
| 未获用户明确授权，不开展产品实现 | 本文与各章只产出文档候选 |

### 4.6 版本与运行环境基线

为避免同一事实在五章各写一遍且互相矛盾，版本与 home 观察统一收在**附录 B**；各章只引用「附录 B 第 X 项」。〔约束〕一个环境通过 ≠ 普遍兼容；记录版本号 ≠ 已验证兼容；工作树含既有修改，不能当作完全干净的官方发布包（docs/architecture.md §9）。

## 5. 包清单与职责

作者：backend-deepseek。本章范围：包级边界与状态归属；包内模块划分见第 7 章；业务对象字段定义不在本章。本章依据：SOLO-A01（独立产品仓库 + 插件与 Profile 组合）、第 7 章状态归属与写权威。本章证据：组合机制为〔源码事实〕（app-boot、bundle patch 头注释）；包划分为〔提案〕。

### 5.1 首版包边界与分期交付（5 个）

〔约束〕ARCH-D02 确立以下 5 个包的职责边界与统一交付方式。S0 不装配尚未交付的 tools-pv；S1 加入后形成完整首版。每包是否 open domain 必须声明，同实例唯一 opener 不替代跨进程 fence。

| 包 | 职责 | 状态归属 | 依赖方向 | 是否 open domain |
| --- | --- | --- | --- | --- |
| soloips-bundle | 装配层：携带 dsh.bundle.patch，以有序 patch 叠加定义首版组合；不含运行时代码 | 无业务状态（仅装配声明） | 被 profile 引用；无业务运行时 import，profile 仍须安装 patch 引用的完整能力集合 | 否 |
| soloips-core | 唯一状态包：Team 聚合（成员/任务/尝试/消息/预算/目标/记忆）、组织与准入、资料室、IP 业务对象 | **全部可写业务状态的唯一归属** | 依赖 soloips-adapter-dsh；被 soloips-web、soloips-tools-pv 经服务消费 | **是（唯一 opener）** |
| soloips-adapter-dsh | 适配层：把 DSH 官方 seam（storage-domain、subagent、session、tools、events）包装为 SoloIPs 内部接口 | 无自有业务状态；不持有权威 | 依赖 DSH 官方包；被 soloips-core 依赖 | 否 |
| soloips-web | 界面层：工作台读投影与交互（首版复用 DSH Web 插槽） | 无业务写权威；读投影、提交操作意图 | Host 桥依赖 core 的查询/命令服务；Client 只用公开 client API 与安全契约（DEV-04） | 否 |
| soloips-tools-pv | PV 制作工具适配：提交生成请求、保存 jobId、查询、取回结果与失败信息 | 不持有业务权威；外部 jobId 与结果按第 7 章由 core 落库 | 依赖 soloips-adapter-dsh；经服务回写 core | 否 |

〔约束〕ARCH-D02 由 soloips-core 持有业务 domain。〔源码事实〕现有 dsh-agent-swarm 在同包内打开多个 domain（附录 B 第 3 项），这只说明同包承载方式，不证明跨进程独占。

各包的源码目录、公开入口与开发/profile 锁落点见[代码开发规范 §2.1–2.2](governance/code-development-standard.md)；本文只维护职责与装配权威，不再复制目录树。

### 5.2 建包判据

〔建议〕**新增持久业务状态包**须同时满足以下三条；缺任一条则将该业务状态留在 soloips-core。装配、无状态适配与界面包按 5.1 的依赖和替换职责评估，不要求它们另建 schema 或取得 opener：

- **PKG-01 自有 schema**：该能力拥有自己的持久 schema，且不与现有聚合共用 revision CAS 单元。
- **PKG-02 独立写权威**：该能力拥有明确的 domain 写入口，且所有实际存储身份受 SOLO-FENCE-01 保护（第 7 章 R2）。
- **PKG-03 独立升级节奏**：确有独立发布/回滚需求，且该需求不能靠包内模块化满足。

〔建议〕包清单之外的收益（代码组织、审查范围）不足以构成建包理由——**拆包不提升任何写安全**（7.1），只改变代码位置并引入跨包栅栏与加载顺序管理成本。

〔反面声明〕「包多」不蕴含「边界清」；「拆包」不蕴含「更安全」。包数不是架构质量的指标，domain name 归属表的清晰度才是。

### 5.3 刻意不建的包

| 不建的包 | 判据 | 理由 |
| --- | --- | --- |
| soloips-collaboration（独立协作内核包） | 违反 PKG-01 | Team 聚合参与同一 revision CAS，拆出即破坏原子性（7.3） |
| soloips-company（独立组织包） | 违反 PKG-02 | ORG-05 占用权威在协作侧（7.7）；首版组织事实由 soloips-core 同一 opener 持有，避免双写 |
| soloips-ip / soloips-artifacts（独立业务对象包） | 违反 PKG-01、PKG-03 | 首版无独立发布需求；IP 与作品版本可并入 core 的同一 domain |
| soloips-scheduler（第二套调度器） | 违反 PKG-02 | 会形成第二个任务权威；与「不维护第二个可写 Team 状态机」冲突 |
| 独立 Runtime / Agent Loop 包 | 〔约束〕官方红线 | 不修改或复制官方 Agent Loop；不注册与官方 service 冲突的影子 Runtime |

### 5.4 加载顺序

〔源码事实〕packages/boot/app-boot/src/profile.ts:11-13 描述 bundle patch 按 dsh.profile.bundles 叠加，然后接 profile 自身 patch；完整层栈另含 home/launcher（§6.1）。packages/bundle/base/cordis.patch.yml:12 说明 Loader 行的书写顺序不承担服务激活语义。

〔建议〕完整数组及变更规则只定义于 SOLO-C01；本节不维护第二份顺序。装配层最后应用，以覆写此前已插入的行；服务激活由 inject/service 可用性决定。

C-10 的顺序按 SOLO-C01 统一；后续修改须同步验收基线。

〔源码事实〕patch 的 config 整体替换语义与精确字段边界统一见 SOLO-C03；包拆分必须计入覆写字段形成的依赖面。

〔源码事实〕新增 bundle 追加机制见 MECH-03，安装路径不提供自动回滚见 MECH-07。各阶段失败范围见 TERM-16、SOLO-F02；具体目标运行表现仍为〔未验证〕，不得把源码证据扩为任意单包错误均导致整个 profile 失败。

〔待决 DRAFT-D06〕是否需要为装配层引入显式的顺序契约检查（防止后续误以为 yml 行序有加载语义）。→ 并入 12.1。

## 6. 组合与装配契约

作者：backend-hy4。本章范围：SoloIPs 由「一组插件包 + 一个 profile」装配时的顺序、覆盖、命名、入 git 与回归门禁规则。本章依据：4.2 的底座与交付形态结论（SOLO-R01/R02）与 3.2 包清单。本章证据：以下标注〔源码事实〕者绑定 DSH_CHECKOUT（bundle 0.1.5-rc.2、swarm 插件 0.1.4，2026-09-15 读取），作者未做启动验证；55120 实际 home（PROFILE-55120）本次未读取 → 〔未验证〕。

### 6.1 装配模型：有序 patch 叠加空根

**〔源码事实〕** profile 树不是一份写好的配置文件，而是**在空 entry list 上按序叠加 patch 层**的结果：

- 根配置恒为空数组，且每次启动由启动器重写：apps/cli/src/profile-boot.ts:84-88（常量 PROFILE_ROOT_CONFIG 内容就是空数组）、:190（每次把 profile 目录下的 cordis.yml 重写为该空根）。注释说明：重写是为了防止 Loader 回写把组合行固化后，下次启动重复 insert。
- 叠放顺序由文档注释给出：packages/boot/app-boot/src/profile.ts:11-13——按 dsh.profile.bundles 顺序叠加每个 bundle 的 patch，然后是 profile 自己的 patch，再是 launcher 层（--patch 文件与 flag 派生 patch）。
- 运行期最终顺序由代码固定：apps/cli/src/profile-boot.ts:206-213 的 allPatches() = bundlePatches → profile.patches → homePatches → overlays；docs/user/develop/basic/publish.md:112-119 给出同一顺序并补充 home 层排在每个 profile 自身层之上。

**〔源码事实〕** 层不是逐层应用，而是**一次性扁平化后单次应用**：apps/cli/src/profile-boot.ts:336 以 structuredClone(allPatches(composed)) 调用 boot；packages/boot/app-boot/src/index.ts:441-449 的 snapshot() 亦把前 k 层 flatMap 后一次性交给 applyEntryPatches。**后果**：不存在「层间事务」或「部分应用成功」的中间态，只有「最后写入者生效」。

### 6.2 唯一 bundles 顺序

**〔约束〕** 按 ARCH-D02 采用以下首版完整 bundles 顺序；S0 暂不列入 soloips-tools-pv，其余相对顺序保持不变，S1 工具包真实交付后加入指定位置。不允许引用未发布或空占位包：

~~~text
@deepseek-ai/dsh-base
@deepseek-ai/dsh-web-app
soloips-adapter-dsh
soloips-core
soloips-tools-pv
soloips-web
soloips-bundle
~~~

- **理由**：能力包插入自己的行，soloips-bundle 作为最终装配层覆写已存在的行。vendor/include/src/index.ts:96-101 把新插入行加入索引供后续 patch 定位；提前覆写尚不存在的行会跳过（:110-119）。此顺序不承诺服务启动先后。
- **〔源码事实〕** 内置 bundle 先从安装目录解析（packages/boot/app-boot/src/profile.ts:746-757）；dsh plugin add 对新 bundle 仅追加（apps/cli/src/plugin.ts:59-91）。默认自定义模板仅含 dsh-base（profile.ts:134），不能替代完整候选清单。
- **actor / trigger**：装配维护者新增包、变更行归属或发布候选时。
- **action / outcome**：维护完整数组；新能力包按依赖与覆写关系插入，soloips-bundle 保持最终装配位置；按 SOLO-C06 核对生效树。不能把 plugin add 的尾部追加结果直接当作验收顺序。
- **边界**：profile、home 和 launcher 层仍在 bundle 层之后（§6.1），最终生效值一并验收。

### 6.3 yml 行序无加载语义（SOLO-C02）

**〔源码事实〕** patch 文件内的**行序不承载加载语义**：packages/bundle/base/cordis.patch.yml:12-13 原文——Row order carries no load semantics（激活由服务可用性驱动）；分组只为便于阅读。

**〔源码事实〕** 配置覆盖顺序由 patch 层和列表的遍历顺序决定：vendor/include/src/index.ts:77 逐条处理 patch。该引用经 2026-09-16 复核成立；不从 patch 循环推导服务激活先后。

**边界**：移动 Loader 行不能保证它先激活；移动同文件内的 patch 指令或 bundles 位次则可能改变配置覆盖结果。两者须分别核对，不能一概称“yml 行序无影响”。

### 6.4 patch 顶层字段替换，config 不做深合并（SOLO-C03）

**〔源码事实〕** 覆盖语义为逐键替换目标行：vendor/include/src/index.ts:78 取 patch 中 id、insert、name 之外的键作为 overrides，:121-124 对每个 override 键执行 target 键赋值。因此 **config 对象整体被替换，不做深合并**。

**〔源码事实〕** 官方 bundle 在文件头把这条约束写成契约：packages/bundle/base/cordis.patch.yml:6-10（patch 替换目标行的整个 config 而非合并；随模式变化的行不放在这里，每个模式 bundle 重申其完整配置）与 packages/bundle/web-app/cordis.patch.yml:5-6（后写者必须重述它拥有的每个 key）。

**〔建议〕** 规则：一行只能由「引入它的那个包」完整声明；任何其他层若要改这一行，**必须完整重述该行全部 config 键**，只写差异键会静默删除其余键。

### 6.5 行 id 前缀与单行单写者（SOLO-C04）

**〔源码事实〕** entry id 在所属 entry 树内必须唯一，且重复即致命：vendor/loader/src/config/group.ts:61-66 在 update() 中收集 id，发现重复直接抛 TypeError（duplicate loader entry id）。该抛出发生在任何条目创建之前，随后走 group.ts:85-105 的回滚路径。

**〔源码事实〕** id 缺失时由树自动补随机 id：vendor/loader/src/config/tree.ts:66-73 的 ensureId。**后果**：遗漏 id 不会报错，但会生成一个不可稳定引用的行，后续 patch 无法可靠命中它。

**〔建议〕** 行 id 一律使用包名前缀：soloips-core.*、soloips-adapter-dsh.*、soloips-web.*、soloips-tools-pv.*；soloips-bundle 作为装配层**不新增业务行**，只负责顺序与开关。单行只有一个写者（声明者），其他包对该行的修改必须走 6.4 的完整重述规则，或直接改为读取其投影。

**〔源码事实〕** 跨包依赖不是「包依赖声明」，而是**服务注册 + inject**：docs/architecture.md:127-129（seam = Service Definition / Provider / Consumer 三角色）；实例见 dsh-agent-swarm 的 cordis.patch.yml:18（inject 含 settings）与 :29-31（inject 含 webRuntime、webServer）。

### 6.6 profile 三件套入 git 与版本锁落点（SOLO-C05）

**〔源码事实〕** profile 目录由启动器初始化出三个文件：packages/boot/app-boot/src/profile.ts:165-185 的 initProfile 写 package.json（含 dsh.profile.bundles 与 patchReload）、cordis.patch.yml（:139-143 模板）、pnpm-workspace.yaml（:150-155，nodeLinker: hoisted、autoInstallPeers: false）。

**〔建议〕** 入 git 的文件：

| 文件 | 是否入 git | 理由 |
| --- | --- | --- |
| package.json | 必须入 | bundles 顺序与依赖声明的唯一权威（profile.ts:653-676 读写接口） |
| cordis.patch.yml | 必须入 | 部署值与开关层（profile-boot.ts:206-213 将其排在 bundle 层之上） |
| pnpm-lock.yaml | 必须入 | **实际版本锁的唯一落点** |
| pnpm-workspace.yaml | 必须入 | profile 自有，决定 pnpm 链接行为与 allowBuilds |
| cordis.yml | 建议忽略 | 启动器每次重写为空根（profile-boot.ts:190），入 git 只产生噪声与误改 |

**〔源码事实〕** packages/util/package-manifest/src/types.ts:21-22 明确版本兼容声明需要 reader 执行；:39-49 定义 engines 字段，类型声明本身不执行兼容检查。**〔未验证〕** 作者在 packages/ 下检索 engines.dsh 的读取点无命中，不足以证明完整启动链没有其他校验。交付者必须核对目标 reader/安装入口；仅写 engines.dsh 不能作为不兼容组合一定被拒的证据。

**〔建议〕** 版本锁只认三处：pnpm-lock.yaml、dependencies 中的精确来源（tarball 文件名或 pinned commit），以及 --dump-config 基线快照（6.7）。不要把 engines.dsh 当作保护。

### 6.7 --dump-config 作为组合回归门禁（SOLO-C06）

**〔源码事实〕** 配置转储与启动使用**同一套扁平化算法**：packages/boot/app-boot/src/index.ts:409-472 的 renderConfigDump，其 :441-449 的 snapshot() 与 apps/cli/src/profile-boot.ts:336 的 boot 调用都把层一次性扁平化后交给同一个 applyEntryPatches；文件头注释（:379-387）声明这是与 boot() 完全一致的组装，使转储不与实际启动漂移。

**〔源码事实〕** 转储输出带来源标注：index.ts:388-395、:452-471 为每段行加注释标明贡献该行的文件与修补它的层。因此**可以逐行判断「这一行现在归谁」**。

**〔建议〕SOLO-C06**：

- **actor**：改任一 bundle patch、任一 bundles 顺序、任一 profile 依赖的人。
- **trigger**：上述任一变更，以及每次 dsh plugin add / remove / update。
- **action**：必须运行 dsh --profile 加 profile 名与 --dump-config，并与基线快照逐行比对。
- **outcome**：差异必须能解释（新增/删除了哪一行、哪一行换了归属层）；解释不了的即视为回归，不得继续。
- **verification**：仅覆盖「组合结果」，**不覆盖**运行期行为——转储不启动服务，不验证服务可用性与数据读写（两级 golden 的划分见 SOLO-REG-01/02）。

### 6.8 profile 名策略（SOLO-C07）

**〔源码事实〕** profile 名被限制且部分名字被保留：packages/boot/app-boot/src/profile.ts:95-102 的 resolveProfileDir 拒绝空值、含斜杠、点号、点点、node_modules；:105-126 的 PROFILE_TEMPLATES 保留 acp / web / headless / sdk / sdk-minimal；:119-124 拒绝用内置名作为自定义 profile 目标（另见 apps/cli/src/profile-boot.ts:119-124）。

**〔源码事实〕** 同名内置 profile 的模板会在首次使用时被写入并可能被「规范化」覆盖：profile.ts:689-711 的 normalizeShippedProfile 在 bundle 列表等于内置元组或缺少 patchReload 默认值时**回写 manifest**。

**〔约束〕** ARCH-D04 选用 profile 名 soloips，不复用内置 web；正式与验收显式配置 patchReload: startup。若用 --from-default-profile web 起底，必须再将继承的 live 改为 startup 并核对 dump。该命令不复制源 profile 的本地装配文件，同 home 仍共享默认业务根（SOLO-DATA-01）。

**〔约束〕** profile 名与环境并存方式已由 ARCH-D03/04 决定：同一个 soloips 定义在独立 home 部署；不靠 soloips-dev 名称证明隔离。

### 6.9 本章稳定 ID 汇总

| ID | 内容 | 状态 |
| --- | --- | --- |
| SOLO-C01 | 完整与 S0 分期 bundles 顺序 | 〔约束〕ARCH-D02，唯一正文 §6.2 |
| SOLO-C02 | yml 行序无加载语义 | 〔源码事实〕 |
| SOLO-C03 | patch 顶层字段替换；config 整体替换，非深合并 | 〔源码事实〕 |
| SOLO-C04 | 行 id 前缀 + 单行单写者 | 〔建议〕 |
| SOLO-C05 | profile 三件套入 git 与版本锁落点 | 〔建议〕 |
| SOLO-C06 | --dump-config 作为组合回归门禁 | 〔建议〕 |
| SOLO-C07 | soloips 名称与 startup 策略 | 〔约束〕ARCH-D03/04 |

### 6.10 DSH_HOME 与多 profile 数据根（SOLO-DATA-01–04）

**SOLO-DATA-01〔源码事实〕默认布局。** 2026-09-16 只读复核 DSH_CHECKOUT（附录 B 第 3 项）：

| 对象 | 默认解析 | 源码 |
| --- | --- | --- |
| home | 显式 configured → 非空 DSH_HOME → ~/.dsh；展开并解析为绝对路径 | packages/util/home-paths/src/index.ts:77-99 |
| profile 装配目录 | home/profiles/profile-name | packages/boot/app-boot/src/profile.ts:95-102 |
| JSON domain 数据 | home/storages；domain 默认路由 json | packages/bundle/base/cordis.patch.yml:148-156 |
| Session 历史 | home/sessions | 同文件 :109-113 |
| home patch | 作用于同 home 的各 profile，排在 profile 层之后 | apps/cli/src/profile-boot.ts:68-75、206-213 |

**〔推断〕** 默认同 home 多 profile 共享业务存储、Session 根与 home overlay。新建 profile、更名或 --patch 不自动隔离状态。上述为默认源码事实；具体部署可覆写 root，必须核对生效配置与实际 backend 路由，不能冒充 PROFILE-55120 的新实测。路径 resolve 不证明 realpath、大小写别名或链接已经归一。

**SOLO-DATA-02〔约束〕最小环境规划。** ARCH-D03 决定一个交付 profile 分别部署到生产、验证与恢复 home，符号和实际根绑定如下：

| 符号 | 用途与边界 |
| --- | --- |
| SOLOIPS_HOME_PROD | 生产实例的 home；其装配、Session、domain 与外部资产实际位置在部署清单逐项绑定 |
| SOLOIPS_HOME_VERIFY | 独立验证 home；使用测试数据或获授权的一致副本，实际写根及外部生成任务须与生产隔离 |
| SOLOIPS_HOME_RECOVER | 隔离恢复 home；先核对恢复结果，再按授权切换正式入口；不覆盖原根 |
| SOLOIPS_STORAGE_ID | 实际业务存储介质的规范化身份，绑定 backend、domain 路由与 writer fence；不能用 profile 名替代 |

实施者在首次启动、root/路由变更或回滚前，必须形成运行绑定：宿主与插件工件散列、profile 名及目录、解析后的 home、每个有效 backend root、Session 根、媒体/资料根、外部 job 引用归属、fence 保护范围。显式路径、链接或 home overlay 若使验证根重新指向生产根，拒绝写入。多个 backend/root 涉及同一业务不变量时须明确保护集合，不能只锁其中一处。凭据保持既有受保护配置，本规划不授权复制或修改。

**SOLO-DATA-03〔建议〕共享数据的顺序切换。** 同一实际数据根的旧/新 profile 只能顺序获得写权。交付者先阻止新派工、确认在途写入排空及旧写入口关闭，再允许后继 Host 获取独占、重新打开 domain 并完成恢复扫描；未知停止状态不放行。独立 home 只有在实际路由和资产路径也隔离后才可视为隔离环境。验收见 SOLO-ACC-09/10。

**SOLO-DATA-04〔建议〕一致恢复点。** 需要状态回退时，交付者必须在静止写入边界绑定：全部相关 domain、schema/版本、Session 与身份绑定引用、作品/素材实际字节、operationId/jobId 与外部副作用账目、匹配的宿主/插件工件及装配材料。只复制 profile 文件或一个 JSON 不构成业务恢复点。恢复保留升级后的有效变化供核对，不清空或覆盖其唯一副本；外部已提交动作不会随本地快照撤销。具体保留/合并或接受丢弃的处置须由用户决定。验证与通过口径见 SOLO-ACC-06。

## 7. 状态归属与写权威

作者：backend-deepseek。本章范围：写权威归属、原子边界、必须同包清单、判定规则 R1–R4、跨域一致性范式、ORG-05 占用裁定。本章依据：SOLOIP-DOC-001、DEPT/LIB 与 DEP/ORG 重构要求、本轮架构论证。本章证据：基线为 DSH_CHECKOUT（根包 0.1.5-rc.2，HEAD c291e7961a515f6d7af9304e7fd1d257929aef26）与 packages/.external/dsh-agent-swarm 0.1.4；company-core 候选为独立 worktree。机制部分为〔源码事实〕；R1–R4 为实现建议，包边界按 ARCH-D02 为技术约束；ORG-05 裁定为〔建议〕并标出需用户裁决点。

### 7.1 核心命题：原子更新绑定 domain handle 内的单次记录操作

〔源码事实〕packages/storage/storage-domain/src/domain.ts:82-89 把 update(key, fn) 定义为 domain 写链上的单条记录原子读改写；fn 读取其排队槽位的当前值。该性质绑定同一 domain handle，不代表多记录共同事务或跨进程互斥。

〔推断〕该原子性**只覆盖单个 domain**。作者本次核查未发现 storage-domain 提供任何跨 domain 事务 API；跨 domain 写入各自排队于各自写链。

〔建议〕需要同次提交的字段应保留在同一记录的 update() 内；首版由 core 统一持有其 domain。跨表或多次 put 即使同包、同 domain，也不能据此宣称共同原子提交。

〔反面声明〕拆包不蕴含更安全；包边界不等于事务边界；包边界也不等于写权威边界。

### 7.2 同一 facility 实例内的唯一 opener

〔源码事实〕packages/storage/storage-domain/src/index.ts:65-72 明确每个 DomainFacility 实例持有自己的 domains Map 与 reserved Set；:103-107 在该实例中检查 spec.name，重复调用抛 DomainError('already-open')。

〔源码事实〕packages/storage/storage-json/README.md:142 明确无跨进程写锁；src/atomic.ts:24-35 的随机临时文件创建与 rename 是整文件替换，不是目标数据根的跨进程独占。

**边界**：同一 facility 内，不同包或同包的第二次同名 open 会被拒；另一个 facility、进程或 Host 不共享此 Set。异名 domain 也可能重复保存同一业务事实。命名边界、包边界与 ORG-06 所要求的真实存储独占须分别说明；跨进程设计见 SOLO-FENCE-01，验收分别见 SOLO-ACC-02/09。

〔源码事实〕packages/storage/storage-domain/src/spec.ts:1-9 定义 spec 是一个 domain 的身份、布局与记录 schema 的唯一来源，由 owning package 用 defineDomain 定义一次。〔建议〕拆包的 opener 检查沿用 R2，并同时核对业务事实、实际介质与 SOLO-FENCE-01，不能只比对名字是否相交。

### 7.3 Team 聚合不可切：参与 revision CAS 的状态必须与其计数同记录

〔源码事实〕dsh-agent-swarm/src/domain/types.ts:363-419 的 TeamState 是**一个记录**，其中同时包含：

~~~text
schemaVersion, id, revision, name, description, captainSessionId, managedOrigin,
captainRoute, allowedSkills, phase, planDraft, appendChanges, discardReason,
members, publicGoal, goalLifecycle, captainProfile, announcements,
tasks, attempts, messages, publicChat, communicationIntensity,
interactionEffects, budget, usageCursors, memory, nextTaskNumber,
nextMemoryNumber, createdAt, updatedAt
~~~

其中 revision 字段位于 :368。

〔源码事实〕src/storage/team-spec.ts:346-353 把整个聚合存为 teams 表的一条记录；:356-358 的 teamRecordOf 实现为以 workspace 作用域加 structuredClone 后的 team 组成单条记录。

〔推断〕任务、尝试、成员、预算、revision 共用**同一个 CAS 单元**。按名词把它们拆到不同 domain，会使 revision 失去覆盖范围，直接产生双重写与丢失更新。

〔建议〕这印证「沿生命周期切，不沿名词切」的切法（写者注：该条在本草稿中的正式编号为 DRAFT-B05；作者原稿以「已确认边界③」指称，登记于附录 A8）。正确切法是「一次协作的生命周期」（Team 聚合）而非「任务/尝试/成员」等名词。

### 7.4 必须同包清单（原子边界）

〔建议〕以下状态**必须**留在同一个包（soloips-core）的同一 domain 内：

| # | 状态 | 理由 |
| --- | --- | --- |
| 1 | Team 聚合全量 + 其 revision | 7.3：一个 structuredClone 记录，CAS 单元不可切 |
| 2 | 成员 roster 与身份档案 | 与任务分配同 CAS |
| 3 | 任务、尝试、提交与审核结论 | 与 revision 同记录 |
| 4 | 消息邮箱、公共会话、交互效果 | 与 Team 生命周期同记录 |
| 5 | 预算与 usageCursors | 与 attempt 计量同 CAS |
| 6 | 迁移收据（migration_receipts） | 〔源码事实〕team-spec.ts:349-352 与 teams 同 spec；收据必须与它所校验的聚合同包 |
| 7 | 每个 domain name 的唯一 opener | §7.2 只强制同实例 single-open；跨 Host 写保护另需 SOLO-FENCE-01 |

〔建议〕非 opener 包**只能**通过 Cordis service 注入消费状态。现有插件已提供 7 个服务名可作命名参考：agentSwarmProducerFloor、agentSwarmHostRead、agentSwarmPrivateMemory、agentSwarmPermission、agentSwarmHumanControl、agentSwarmHumanInteraction、agentSwarmWorkflow。

### 7.5 判定规则 R1–R4

〔建议〕以下四条可直接用于评审任何拆包提案：

- **R1 原子规则**：需同次原子变更的字段保留在同一记录的 update()；首版统一归 core。包或 domain 的名称不能给多次提交增加原子性。
- **R2 命名规则**：同实例每个 domain name 只有一个 opener；同时枚举业务事实与真实介质的唯一写入口，并满足 SOLO-FENCE-01。domain 名集合不相交只是必要检查，不能单独证明拆包安全。
- **R3 跨域规则**：跨 domain 不变量**只能**用「单一权威侧 + 重读 + fail-closed」实现（7.6），禁止假设事务。
- **R4 聚合规则**：参与 revision CAS 的状态必须与其 revision 计数同记录。

〔建议〕评审出口：任一拆包提案若无法同时通过 R1–R4，则退回。

### 7.6 跨域一致性：只能「单一权威侧 + 重读 + fail-closed」

〔源码事实〕现有实现已给出可复用范式。退休状态是独立 domain（src/storage/team-retirement-store.ts:24 定义 agent_swarm_retirement），与 Team 聚合并非同一 domain：

- :29-34 的 assertTeamWritable / teamIsRetired：**同步最后写检查**，已退休 Team 拒绝写入（TEAM_RETIRED）。
- :36 的 assertRetiredReferencesExcluded：跨 domain 引用栅栏，保证无关 Team 不会在预览与物理清除之间取得被冻结的 Session。

〔推断〕两者都不是事务，而是「提交前重读另一侧权威 + 冲突即失败」。这证明跨 domain 一致性**不需要**也不**应当**假设事务。

〔源码事实〕并发保证绑定在「同一个已打开的 domain handle」上：company-core/src/storage/storage-domain-team-store.ts:238-246 说明 at-most-one-active-Team 由 per-SCOPE 锁保证，该锁在同一已打开 Storage Domain handle 的所有 store 实例间共享，并明确不是 per-instance 的 scopeLocks、也不是新的持久层。

〔建议〕由此得出一条实现约束：任何缓存或单例必须挂在 domain facility 上（现有实现用 WeakMap 以 DomainFacility 为键，见 team-retirement-store.ts:26），**不得按包各存一份**，否则 per-scope 保证失效。

### 7.7 ORG-05 占用权威的裁定

〔需求〕**ORG-05 可信身份与共同提交窗口**（来源：refactoring 文档 02-company-contract.md:209-221，路径相对 REFACTORING_DOCS_ROOT）：从真实执行上下文取得 Session，查 Host Binding，再核对 Employee、当前 Appointment/代际、Team roster 及操作权限；首版每个员工跨 Team 最多一个正式 attempt；等待输入不释放 owner。

〔源码事实〕占用（occupancy）事实**不在组织域**，证据三条：

1. company-core/src/domain/organization-assets.ts:263-264：该行只携带 generational 事实，occupancy 留在 Team authorities（projection-not-record）。
2. company-core/src/domain/organization-records.ts:174：ExecutionBinding 只携带身份与授权代际事实，不含 attempt 状态，occupancy 在门禁处从 Team authorities 重读。
3. company-core/src/domain/organization-assets.ts:309：listExecutionBindings 被注释为跨 Team 占用对账来源，即组织域只提供协调来源，不持有占用权威。

〔需求〕02-company-contract.md:217 进一步规定提交顺序：组织协调入口（writer 有效且恢复完成）→ 查同操作已有结果 → 重核当前资格、暂停及跨 Team 占用 → 保存必要恢复意图 → **Team 同次持久提交 attempt 和 operationId 关联** → 更新可重建索引/结果引用 → 提交后发布、放行执行。

〔建议〕**裁定：ORG-05 占用的唯一写权威在协作侧（Team 聚合），组织域只保存 generational 事实与绑定，不持有占用状态。** 理由：(a) 占用与 attempt 生命周期同生共死，而 attempt 在 Team 聚合内，同记录才能保证 R4；(b) :217 明确 Team attempt 提交是 claim 生效点；(c) 若组织域也持有可写占用，将同时违反 R1 与「一个状态只有一个写权威」。

〔建议〕跨包顺序按 :213 固定为「组织协调入口 → Team 事务」，且「禁止 Team 持锁反向等待组织」——这是**跨包调用方向**的硬约束，不是风格偏好。

### 7.8 失败场景清单

〔建议〕以下场景应在 S0 验收中被显式覆盖：

| ID | 场景 | 期望 |
| --- | --- | --- |
| WA-F1 | 两个包通过同一 facility 打开同名 domain | 第二次 open 报 already-open，首次 handle 与状态保留；跨 Host 另验 SOLO-ACC-09 |
| WA-F2 | 非 opener 包通过同一 facility 再次 open 已打开 domain | 同 WA-F1；另造 facility 不能视为已被同一机制拦截 |
| WA-F3 | 把 tasks 与 attempts 拆到两个 domain | 评审阶段即拒绝（违反 R1/R4） |
| WA-F4 | 组织域与 Team 域同时可写占用 | 评审阶段即拒绝（违反 R1 与单一写权威） |
| WA-F5 | 跨包迁移只搬代码、丢掉 retired 栅栏 | 已退休 Team 仍可写——必须由测试捕获 |
| WA-F6 | per-scope 锁被复制成每包一份 | at-most-one-active-Team 保证失效（team-store.ts:238-246 明确警告） |
| WA-F7 | Team 持锁反向等待组织临界区 | 死锁；违反 :213 固定顺序 |

### 7.9 已选边界与待验证接线

〔约束 DRAFT-D07-D1〕包数与交付粒度按 ARCH-D02：首版 5 包边界、同仓统一版本锁，S0 按所需四包装配；后续拆出独立发布单元须有实际需求证据。

〔约束 DRAFT-D07-D2〕组织域留在 soloips-core，不新增独立组织状态包；跨域调用与原子边界仍按 ORG-05/07 验证。

〔待决 DRAFT-D07-D3〕**agent_swarm domain name 的最终 owner**：〔源码事实〕repair-release 与 company-core 的 src/storage/team-spec.ts:346 声明**同一个** team domain，历史报告称二者分叉（单方向 git merge-base --is-ancestor 退出码 1 只证明该方向非祖先，完整关系待双向核对；前者独有 avatar-preference.ts、team-recovery.ts，后者独有 organization-*.ts、delivery-evidence.ts）。两个包若通过同一 facility 打开同名 domain 则 already-open；另造 facility/Host 不在该保证内。仍须指定唯一业务写入口并保护其实际介质。

〔源码事实〕2026-09-16 复核 COMPANY_CORE_CHECKOUT（附录 B 第 9 项，HEAD 4c6d05ef30452df2b7adbfb24d625aef4e58f239）：src/domain/organization-assets.ts:232-240 的 getEmployeeOnboardingGaps 只检查 profileRef/avatarText 是否缺省；src/domain/organization-admission.ts:135-139 在 session 无 binding 时返回 ORG_ALLOW_LEGACY_UNBOUND。它们尚不能满足 ORG-03 完整入职与公司入口的绑定要求，须在正式业务入口启用前修正，验收见 SOLO-ACC-04。该观察只证明指名候选的源码行为，不证明目标安装已采用它或场景已通过；全文准入候选证据统一引用本段。

〔反面声明〕本章描述的是**写权威归属**，不蕴含「已实现」。所有 soloips-* 包均为〔提案〕，尚无代码；现有证据来自 dsh-agent-swarm 0.1.4 与 company-core 候选，**不等于** SoloIPs 已具备这些性质。

### 7.10 跨进程 fence 落点（SOLO-FENCE-01）

**〔需求〕** ORG-06（02-company-contract.md:223）要求规范化存储身份上的真实独占或等价 fencing：第二 Host 被拒，失权旧 writer 无法写，缺失则不能启用公司写入。既有验收为 ORG-A03（同文档 :285）。本节细化技术候选，不新增业务需求。

**〔源码事实〕可复用候选。** COMPANY_CORE_CHECKOUT（附录 B 第 9 项）已有以下代码；这不证明目标安装包已接线或通过运行验收：

| 候选源码位置 | 本次读到的机制 | 已证边界 |
| --- | --- | --- |
| src/storage/company-writer-store.ts:66-94 | commit 在 withFileLock 窗口内检查恢复状态、writer fence，再执行 publish | 只覆盖确实经过该 commit 的发布回调 |
| src/storage/company-writer-lease.ts:418-434 | 重读 holder 与 generation counter，失权时拒绝 | 单独检查后再无锁写入仍不足 |
| src/plugin/company-stack.ts:129-152 | 同一 storageRoot 构造 JSON backend、facility 并 acquire lease，然后打开组织服务 | 启动时持 lease 不证明每个持久提交都受 fence |
| src/plugin/config.ts:208-212 | 检查 root 非空且无首尾空格 | 该检查不完成实际路径身份规范化 |
| src/domain/organization-assets.ts:77-81 | 优先取 input.facility；缺省时回退到 input.ctx?.storageDomain，再直接 open | open 自身不检查 lease；公司入口必须排除回退路径和任意未受保护 facility，不能以正常装配传入了专属 facility 证明所有打开路径安全 |
| src/domain/organization-assets.ts:57-58、94-106 | 实例上的 Promise Map 串行，源码明确为 process-local | 不是跨进程保护；下列直接表写没有在这些方法内部经 CompanyWriterStore.commit 发布 |

〔源码事实〕同一 COMPANY_CORE_CHECKOUT 候选中，组织资产服务有以下 **7 个公开写方法、8 个 put/delete 点**；行号均相对 src/domain/organization-assets.ts：

| 写方法 / 入口行 | 持久写点 | 必须纳入的验证 |
| --- | --- | --- |
| bindEmployeeSession:119 | employees.put:140 | 绑定的唯一性与失权后发布拒绝 |
| createAppointment:156 | appointments.put:170 | 任职创建的真实提交 |
| setEmployeeProfile:182 | employees.put:194 | 资料更新的真实提交 |
| revokeAppointment:202 | appointments.put:210 | 撤销任职的真实提交 |
| bindExecutionBinding:266 | bindings.put:294 | 执行绑定的真实提交 |
| savePersonalAsset:327 | versions.put:355；校验失败清理 versions.delete:358 | 正常保存与失败清理均受写权保护 |
| promotePersonalAsset:375 | currents.put:399 | current 指针推进与失权拒绝 |

src/domain/organization-departments.ts:205、250 另有部门创建/生命周期的直接表写。上述清单是已核的最小集合；Team、迁移和恢复的完整提交点仍须实施者枚举。正常公司装配（company-stack.ts:129-152）先 acquire 再打开 domain，不能把仅在启动时持 lease 外推成每个直接表写已受提交保护。

**〔建议〕最小接入合同。** 优先复用并修齐该候选，通过 DSH 公开存储/服务扩展点装配；不把自建分布式共识列为前置。

1. **actor / precondition**：Host 的公司写入口启用前，把 SOLOIPS_STORAGE_ID 解析为真实存储身份；backend、lease 与恢复操作必须指向同一介质及保护集合。实际支持的相对路径、链接与平台别名必须落到同一独占键。生产公司入口须拒绝缺少受保护 facility/有效写权的调用；复用候选的 ctx.storageDomain 回退与任意 facility 注入不能成为绕过途径，测试或兼容入口如需保留须证明与正式可写入口隔离。
2. **action**：在装载可写 domain/缓存前取得跨进程写权。枚举公司、Team、迁移、恢复等所有权威写入口；资格检查后到真实持久发布之间，必须持有接管方同样遵守的跨进程互斥窗口，或使用在存储提交点验证的等价 fencing。只在启动、claim 入口或提示词里检查不够。
3. **scope / outcome**：旧 writer 失权后，包括它已持有的 domain handle、排队任务和恢复写路径，均不能发布。后继取得新代际后重开 domain、重建缓存并核对未决 operationId；恢复完成前不接受新任务。跨域顺序仍按 ORG-05/07，不承诺跨域原子提交。
4. **failure / recovery**：锁状态未知、心跳故障、失权、root 不一致或恢复窗口未关闭时，拒绝受影响写入并保留事实与诊断。崩溃遗留锁按经验证的维护恢复协议处理，不按文件年龄擅自清锁；在线入口不能绕过停写边界。
5. **verification**：在目标安装候选和实际文件系统上执行 SOLO-ACC-09，覆盖真实业务发布点。仅通过便利 commitRecord、类单测或同实例 already-open，不能替代真实 Host 验收。

**〔未验证〕** 上述候选在 SoloIPs 中的完整路由、每个发布点包装、存储身份别名处理、崩溃恢复与公开导出组合尚无本稿的运行证据；不得据代码或测试文件存在宣称 ORG-06 已通过。

## 8. 分层、可回归与回滚

作者：frontend-qwen（陆青禾）。本章范围：包的分层顺序、profile 版本锁、golden 与 per-profile e2e、灰度与回滚路径、失败模式清单；不覆盖包内领域边界、客户端渲染组合、需求正文。本章证据：〔源码事实〕基线为 $DSH_CHECKOUT（bundle 版本 0.1.5-rc.2）与 55120 实测 home；作者未做运行时探针、未启服务。本章 §8.7 覆盖作者前一封邮件中的 home 归属错误，以本节为准。

### 8.1 术语与三条底座事实

| ID | 陈述 | 标注与来源 |
| --- | --- | --- |
| L-F1 | profile 的装配单元是 loader row（具名行），行由 id 标识；组合是把若干 patch 层按序作用在一个空根 entry list 上 | 〔源码事实〕packages/boot/app-boot/src/profile.ts:5-13、:784-798；apps/cli/src/profile-boot.ts:84-88（根是空 entry list，注释要求改 cordis.patch.yml 而非 cordis.yml） |
| L-F2 | 一层的 patch 命中同 id 行时整行替换其 config，不做深合并；后写层胜出 | 〔源码事实〕packages/bundle/base/cordis.patch.yml:2-4、:6-10 |
| L-F3 | yml 配置行的书写顺序不保证服务激活先后；同层 patch 指令仍按列表执行 | 〔源码事实〕packages/bundle/base/cordis.patch.yml:12-13；vendor/include/src/index.ts:77；SOLO-C02 |

推论（〔推断〕，前提为 L-F2 + L-F3）：层顺序只决定「谁的 config 最终生效」，不决定「谁先启动」。因此任何跨包状态依赖必须走服务声明（inject），不得用层顺序表达。

### 8.2 层顺序模板与声明方式

| ID | 规则（actor · trigger · action · scope · outcome） | 标注 |
| --- | --- | --- |
| SOLO-LAYER-01 | actor：装配维护者。trigger：发布或调整包组成。action：按 SOLO-C01 维护对应切片的完整顺序，并按 SOLO-C06 回读生效组合。scope：全部交付 profile。outcome：声明与组合一致，服务启动先后由依赖就绪决定 | 〔约束〕ARCH-D02 |
| SOLO-LAYER-02 | actor：交付/部署脚本。trigger：安装或升级 SoloIPs。action：禁止把 dsh plugin --profile <p> add <pkg> 作为装配的权威手段，应当以「已入版本库的 profile 三件套 + pnpm install」完成装配。scope：客户环境与客户演示环境。outcome：任意两台机器组合结果一致 | 〔建议〕（依据 S-F1） |
| SOLO-LAYER-03 | actor：SoloIPs 各包。trigger：包需要改动非自身拥有的行。action：必须只经由 soloips-bundle 提出对官方行的覆写；能力包必须只 insert 自身前缀的 id。scope：全部 SoloIPs 包。outcome：每个 row id 只有一个写者（对齐 TERM-08 与 MECH-05 的单写权威） | 〔建议〕（依据 L-F2、S-F5） |
| SOLO-LAYER-04 | actor：装配维护者。trigger：创建正式/验收 profile。action：按 ARCH-D04 使用 soloips 名与显式 startup，不复用内置名。scope：SoloIPs 交付。outcome：清单与已选定义一致，不把名称当作数据隔离证明 | 〔约束〕ARCH-D04 |

顺序已统一到 SOLO-C01；本节不保留互斥模板。

支撑证据：

- S-F1 〔源码事实〕apps/cli/src/plugin.ts:59-91 对新发现 bundle 执行 append、对失去声明的既有 bundle 移除；它不重新排序已有项。〔推断〕不同安装历史可能形成不同数组，最终权威仍是实际 bundles 数组与后续 patch 层，不能将依赖书写顺序直接等同于完整装配顺序。
- S-F2 〔源码事实〕初始化创建三份装配文件：package.json、cordis.patch.yml、pnpm-workspace.yaml（packages/boot/app-boot/src/profile.ts:150-185）；后续可有 lockfile、node_modules 等。profile 用户层在完整叠层中的位置见 SOLO-C01 与 §6.1。
- S-F3 〔源码事实〕层叠应用顺序为：bundles 数组序 → profile 自身 cordis.patch.yml → home 级 $DSH_HOME/cordis.patch.yml → 启动器 --patch 与派生 patch。profile.ts:5-13；apps/cli/src/profile-boot.ts:68-75（home 级 overlay 位于 profile 层之上）。
- S-F4 〔源码事实〕composeEntries 克隆输入后调用同一 patch 算法组合（profile.ts:841-847）；启动器也为可变 patch 输入作克隆（apps/cli/src/profile-boot.ts:323-327）。共享算法不等于任意时点的 dump 与运行树一致，输入层、求值和生效时点另按 SOLO-C06、SOLO-F08 验证。
- S-F5 〔源码事实〕真实包已在用「覆写官方行」：dsh-agent-swarm 的 bundle 层给官方行 connection 补注入，并在注释里点明依赖宿主 rc 版本、目标行不存在时跳过该 patch。packages/.external/dsh-agent-swarm/cordis.patch.yml:26-31。
- S-F6 〔源码事实〕启动器会回写「与内置或已退役 tuple 完全相同」的 bundles 清单，其它清单视为用户所有；内置 profile 名不可作为自定义目标。profile.ts:689-711；apps/cli/src/profile-boot.ts:119-124。

### 8.3 版本锁唯一落点

| ID | 规则 | 标注 |
| --- | --- | --- |
| SOLO-LAYER-05 | actor：SoloIPs 装配层。trigger：生成交付物。action：必须把 profile 三件套连同 profile 自己的 lockfile 一起纳入版本库；版本锁的唯一落点即该 lockfile（profile 目录本身是独立 pnpm 工作区）。scope：全部交付。outcome：包版本可复现，跨机一致 | 〔建议〕（依据 S-F2） |
| SOLO-LAYER-06 | actor：交付/验收执行者。trigger：验收装配。action：禁止以 file: 指向个人目录或 link: 指向开发中工作副本的形式交付；SoloIPs 各包必须以带版本号的发布工件进入 lockfile。scope：客户环境。outcome：不存在「本地未发布改动混入交付」的路径 | 〔建议〕 |

现状基线（〔源码事实〕，来源：队长实测 $DSH_HOME_LIVE55120 与 $DSH_CHECKOUT，2026-09-15；已并入附录 B 第 2、3 项）：55120 profile 的 bundles 为 dsh-base、dsh-web-app、dsh-agent-swarm，patchReload 为 live；依赖以 freeze-20260915-reteam 下的 tgz 安装（swarm 0.1.5、rlm 0.0.0）；checkout 侧 bundle 版本 0.1.5-rc.2（packages/bundle/base/package.json:4、packages/bundle/web-app/package.json:4）、swarm 0.1.4。〔推断〕freeze 工件目录方向正确，但工件由人工冻结、未与 lockfile 绑定，故 SOLO-LAYER-05/06 仍有必要。〔未验证〕55120 的 profile 是否存在 lockfile，本次未读取。

### 8.4 两级 golden 与回归

| ID | 规则（actor · trigger · action · scope · outcome） | 标注 |
| --- | --- | --- |
| SOLO-REG-01 | actor：SoloIPs 回归流水线。trigger：任一包或层顺序变更。action：必须生成并比对 L1 golden = 仅 bundle 层的组合导出（--dump-default-config，按层来源分段标注，不含 profile 用户层与 --patch）。scope：CI。outcome：升级宿主或调整层序造成的组合漂移以 diff 可见 | 〔建议〕（依据 S-R1、S-R2） |
| SOLO-REG-02 | actor：CI/验收执行者。trigger：相关装配变更或发布候选产出。action：必须生成并比对 L2 golden = 含 bundle、profile、home 与 launcher overlay 的完整导出（--dump-config），覆盖每个交付 profile。scope：CI。outcome：声明组合及预期字段可核对；运行接线仍另验 | 〔建议〕（依据 S-R1、S-R2） |
| SOLO-REG-03 | actor：CI/验收执行者。trigger：每次发布。action：应当按项目既有 per-profile e2e 范式补一条 SoloIPs profile 场景（golden 文件与 overlay patch 同目录组织）；应当在 Web 侧以「只追加自己的 overlay 层」方式复用同一组合栈，不复制整棵配置树。scope：CI。outcome：装配回归与界面回归同源 | 〔建议〕（依据 S-R3、S-R4） |
| SOLO-REG-04 | actor：任一成员/交付者。trigger：主张「某包已装配生效」。action：禁止以 bundles 数组含包名、依赖列表含包名或「已安装启用」作为装配证据；必须给出 L2 生效树中的对应行 + 一次功能探针结果。scope：全部汇报与验收。outcome：杜绝「安装启用 ≠ 实际被调用」类误报 | 〔建议〕（依据 S-R5、S-R6） |

支撑证据：

- S-R1 〔源码事实〕导出开关与语义：--dump-config 与 --dump-default-config 互斥，后者显式拒绝 --patch 且不含用户层；导出带层来源标记（回归用例断言输出含层来源注释）。apps/cli/src/args.ts:100-114、:149、:184；apps/cli/tests/built-bin.e2e.ts:1015-1024。
- S-R2 〔源码事实〕bundles-only 消费方被显式设计为不读用户层，以免损坏的用户层让导出失败（userLayer:false）。profile.ts:810-812。〔推断〕这是「L1 看不到用户层覆写」的根因；SoloIPs 的界面相关配置多为覆写型，只在 L2 可见。
- S-R3 〔源码事实〕仓库内已存在 per-profile e2e 目录 apps/cli/tests/profiles/，内含场景子目录、expected.e2e.ts、expected.jsonl 与 overlay patch 文件。〔未验证〕作者只列目录，未读该目录说明，范式细节以该目录既有说明为准。
- S-R4 〔源码事实〕Web 侧测试用同一组合栈（bundle 层按 bundles 序 composeEntries 作用于同一空根），并支持注入额外 overlay。apps/web/tests/scaffold.ts:501-522。
- S-R5 〔源码事实〕普通依赖不自动成为 bundle 层（apps/cli/src/plugin.ts:70-75），而用户 patch 可通过 insert 增加 entry（vendor/include/src/index.ts:80-102）。〔推断〕只审 bundles 数组不足以列全可能的入口，须审完整组合。OTHER home 的旧实例缺独立回执，按 §8.7 保持〔未验证〕，不承担该机制的证明。
- S-R6 〔需求〕用户确认的验收口径：不能把安装某包等同于功能可用，安装包存在不等于工具可调用（refactoring 03-delivery-and-acceptance.md:40，路径相对 $REFACTORING_DOCS_ROOT）。〔约束〕装配属宿主、UI 只做投影（refactoring 02-company-contract.md:189）。

### 8.5 灰度与回滚

| ID | 规则 | 标注 |
| --- | --- | --- |
| SOLO-ROLLBACK-01 | actor：验证/部署者。trigger：试验候选组合。action：在 SOLOIPS_HOME_VERIFY 使用具名 profile 或 overlay，并核对实际 backend、Session 与资产根不指向生产。scope：候选验证。outcome：装配身份与数据隔离分别可证；单独换名或复制 profile 不算隔离 | 〔建议〕SOLO-DATA-01–03 |
| SOLO-ROLLBACK-02 | actor：交付/运维。trigger：恢复旧组合。action：先停写并确认单 writer 边界；状态兼容已证时恢复旧装配并读回，需数据回退时在隔离根恢复一致检查点。scope：指名组合及数据根。outcome：装配恢复、状态核对与副作用对账分别给证据，不承诺一次改参数或零耗时 | 〔建议〕SOLO-ACC-06 |
| SOLO-ROLLBACK-03 | actor：运维。trigger：装配清单或 patch 损坏。action：可用 --from-default-profile 创建恢复装配，并恢复锁定工件和声明层；运行前显式绑定恢复数据根。scope：装配修复。outcome：只证明未复制损坏装配文件；同 home 默认仍读旧业务状态，数据恢复另按 SOLO-DATA-04 | 〔建议〕S-B3 |
| SOLO-ROLLBACK-04 | actor：SoloIPs 装配层。trigger：需要按环境差异化配置。action：必须把环境差异放在 overlay（profile 用户层或 --patch 文件），禁止为差异复制一棵 bundle 配置树。scope：全部交付。outcome：差异是一层可 diff 的补丁 | 〔建议〕（依据 S-B5） |

支撑证据：

- S-B1 〔源码事实〕profile 身份取目录名，manifest 的 name 字段不参与身份。profile.ts:95-102、:798。〔推断〕直接复制可能留下旧 name，不能据 name 判断实际 profile 身份。OTHER home 的历史实例未独立复验，按附录 B 第 4 项使用。
- S-B2 〔源码事实〕模块面是跨 profile 共享的安装闭包镜像目录，另有 profile 私有目录承接 bundle 独有依赖。profile.ts:535-560、:610-645。〔推断〕只改层不动该共享目录；「卸载某个包」不能当作影响隔离手段。
- S-B3 〔源码事实〕从内置模板初始化具名 profile 的能力存在且受保护：目标名为内置名则拒绝、模板未知则拒绝且不落盘、启动器不读取源 profile 的本地装配文件，也不写继承元数据；同 home 业务状态仍按 SOLO-DATA-01 共享。apps/cli/src/profile-boot.ts:104-140；回归用例 apps/cli/tests/built-bin.e2e.ts:1026-1047。
- S-B4 〔源码事实〕dsh plugin 的路径不提供安装快照或状态恢复（SOLO-F07）。〔推断〕选择旧 profile 只能恢复相应装配；能否读回业务数据取决于实际 root、schema 兼容性和恢复点，不能推出“回滚粒度天然是 profile”。
- S-B5 〔源码事实〕overlay 形态有官方先例：可选用户 overlay 与示例 overlay 以单文件分发（apps/cli/config/examples/ 下存在多个 .cordis.yml 示例；docs/cookbook/extension-cookbook.zh.md:98）。〔未验证〕作者只列目录未读内容。
- S-B6 〔源码事实〕patch 允许 !!js 表达式（packages/bundle/base/cordis.patch.yml:113；profile.ts:139-143），dump 不求值表达式（apps/cli/src/dump-config.ts:1-7）。〔建议〕仅对导出中实际出现的机器差异字段作明确归一化，保留相关断言；不能因存在表达式就预设跨机 diff 不等，也不能用归一化后的 dump 证明真实数据根隔离。
- S-B7 〔源码事实〕自定义 profile 用户层默认热加载（live），内置模板各自声明（web 为 live，headless/sdk/acp 为 startup）。profile.ts:105-126、:136-137。〔推断〕单点临时回退可改 overlay 完成；改 bundle 层需按该 profile 的 patchReload 决定是否重启。

### 8.6 反面声明（本章明确不蕴含）

- 层顺序声明不蕴含启动顺序可控（L-F3）。
- L1 golden 通过不蕴含客户生效树正确（L2 才含用户层，S-R2）。
- bundles 含包名不蕴含该包已挂载（S-R5）；反之 bundles 不含也不蕴含未挂载（overlay 可 insert）。
- 新建 profile 不蕴含与旧 profile 数据隔离：默认数据在 home/storages 与 home/sessions，实际 root 可被 patch 覆写（SOLO-DATA-01）；模块闭包共享是另一项依赖事实。
- SoloIPs 用 profile 组合装配不蕴含可替换底座：底座层解析以安装目录为第一锚点，同名 bundle 不会取自 profile 本地副本（〔源码事实〕profile.ts:734-757）。

### 8.7 历史环境证据的使用边界

- 早期报告曾把 OTHER home 误归属为 55120；相关历史转述见附录 B 第 2、4 项。实际路径与新的元数据观察在 ENV-01 指定的本机记录维护，正文不另设运行状态权威。
- OTHER home 的实例与原始回执尚未定位，不能据其推断 55120 的安装、挂载或机制已验证。场景可以保留为待验证用例，机制依据改用指名源码。
- 55120 的完整运行插件/client 组合和实际生效 overlay 尚无本章运行证据；磁盘声明与历史配置不替代该验证。

### 8.8 技术细节与已决定事项

| ID | 待决问题 | 影响条目 |
| --- | --- | --- |
| SOLO-LAYER-Q1 | 官方行（connection、web-runtime、session 系列等）的覆写权是否只归 soloips-bundle | SOLO-LAYER-03、SOLO-REG-01/02 |
| SOLO-LAYER-Q2 | 是否强制 row id 前缀命名空间（soloips-*） | SOLO-LAYER-03、SOLO-C04 |
| SOLO-LAYER-Q3 | 版本锁是否写成客户交付硬要求（lockfile 入 git + 禁 file:/link: 个人路径） | SOLO-LAYER-05、SOLO-LAYER-06、SOLO-C05 |
| SOLO-LAYER-Q4 | 已按 ARCH-D03/04 选择一个 soloips 定义、独立 home；共享根双 profile 不作为默认灰度 | SOLO-DATA-02、SOLO-ROLLBACK-01 |
| SOLO-REG-Q5 | 源码分支已按 SOLO-F06 收敛为 warn/skip；待验证目标入口的告警可见性、组合断言与发布门禁是否拒绝漂移 | SOLO-REG-04、SOLO-FAIL-02、MECH-09 |

### 8.9 附录 · 失败场景清单（SOLO-FAIL-01…10）

本表保留场景 ID 与检测方法，机制只引用其正文。SOLO-FAIL-* 与 SOLO-F0x 不按序对应：前者是装配/交付场景，后者是第 10 章的机制与恢复规则；同一问题的机制结论只在所指正文维护。

每条：现象与触发 → 后果与检测。行号除注明外均相对 $DSH_CHECKOUT。

| ID | 现象与触发 | 后果 / 检测 | 证据与标注 |
| --- | --- | --- | --- |
| SOLO-FAIL-01 | 旧 overlay 给出的 config 未包含新宿主的默认字段 | 新字段可能被覆盖；检测 = L2 diff + 关键字段断言 | 机制正文 SOLO-C03 / MECH-02；场景〔未验证〕，不依赖 OTHER home 转述 |
| SOLO-FAIL-02 | 当前组合没有 patch 所指的目标行 | 检测 = 完整导出与期望 entry/字段、来源层比对，日志辅助诊断 | 机制正文 SOLO-F06 / MECH-09；目标可见性及门禁见 SOLO-REG-Q5，场景〔未验证〕 |
| SOLO-FAIL-03 | 两人以不同先后 add 相同依赖集合 | bundles 数组顺序可能不同；检测 = 对比实际有序清单与后续 patch 层 | 机制正文 SOLO-C01 / MECH-03；交付约束 SOLO-LAYER-02，场景〔未验证〕 |
| SOLO-FAIL-04 | 普通依赖没有 dsh.bundle，却由 overlay insert 接入 | 只审 bundles 会漏入口；检测 = L2 完整树与实际入口声明 | 普通依赖分支见 apps/cli/src/plugin.ts:70-75；检测 SOLO-REG-04；升级移除另见 SOLO-F05，场景〔未验证〕 |
| SOLO-FAIL-05 | 多 profile 指向同一未冻结开发源 | 本地编辑可能影响多套候选；检测 = 安装锁、来源和工件字节 | 工件约束正文 SOLO-C05 / SOLO-LAYER-06；场景〔未验证〕，历史 home 不作通过证据 |
| SOLO-FAIL-06 | 导出含机器差异字段，或被宽泛归一化掩盖 | 检测 = 只归一化明确差异字段并保留关键断言，实际数据根独立核实 | 机制正文 SOLO-C06 / S-B6；检测 SOLO-REG-01/02；存在 !!js 不等于导出已求值，场景〔未验证〕 |
| SOLO-FAIL-07 | 仅跑 L1，未覆盖 profile/home/launcher 层 | 检测 = 增加与目标一致的 L2 完整组合 | 机制正文 SOLO-C06；检测 SOLO-REG-01/02，场景〔未验证〕 |
| SOLO-FAIL-08 | 把复制 profile 当成状态隔离或恢复证明 | 检测 = 实际 profile 身份、业务/Session/资产根与恢复边界 | 机制正文 SOLO-C07、SOLO-DATA-01–04；恢复 SOLO-ROLLBACK-01–03，场景〔未验证〕 |
| SOLO-FAIL-09 | 复用内置名，或清单等于内置/退役 tuple | 检测 = 命名与最终清单断言，观察拒绝/回写分支 | 机制正文 SOLO-C07；约束 SOLO-LAYER-04，场景〔未验证〕 |
| SOLO-FAIL-10 | 多个包的 patch 顺序覆写同一既有 row | 所给字段后写覆盖前写；检测 = row 写者和完整 config 断言 | 机制正文 SOLO-C03/C04、MECH-02；此操作区别于 SOLO-F03 的重复 entry 定义，场景〔未验证〕 |

### 8.10 本章未覆盖（避免被误读为已完成）

- 〔未验证〕未启动任何服务、未执行任何 dsh 命令；本章采用指名源码基线及明确标注的历史观察。SOLO-FAIL-02 的 warn/skip 分支已由 SOLO-F06 定位，目标日志可见性、整体启动和业务结果仍需有界实测。
- 〔待决 DRAFT-D08〕是否提供显式 disable 层及其支持边界；各阶段失败范围见 TERM-16、SOLO-F02，目标运行表现待 S0 验证，不预设任何包错误都必须整 profile 失败。→ 并入 12.1。

## 9. 客户端组合与业务事实分离

作者：frontend-deepseek（沈砚）。本章范围：浏览器侧组合入口、官方扩展点、数据面、加载顺序、换界面时的保留分界、失败场景；不含 host 业务域建模与 profile 解析（见第 7、8 章）。本章证据：绑定 DSH_CHECKOUT（根包 0.1.5-rc.2，2026-09-15 观察）与 dsh-agent-swarm 0.1.4 checkout；55120 上实际生效的 client 组合图属〔未验证〕。本章结论为〔建议〕，须经用户或获授权主体确认后才成为规则；标〔需求〕〔约束〕者沿用上游已确认结论。

### 9.1 本章回答的问题

业务界面如何进入 DSH Web；哪些东西可以放在客户端包；哪些必须留在 Host；换独立界面时哪些可以丢、哪些必须留；以及哪些做法会让 UI 变成第二份业务事实来源。

### 9.2 客户端注入机制

CLIENT-01〔源码事实〕客户端包通过自身 package.json 声明 dsh.client（platform 为 web、可选 inject 边）并在 exports 的 client 子路径导出构建产物，即成为 Web Client 的一个 entry；宿主扫描 Loader entry 组合出图并注入 window.__DSH_BOOT__。来源：DSH 官方文档 docs/subsystems/client-modules.zh.md:5,11,77（基线见附录 B 第 3 项）。

CLIENT-02〔源码事实〕inject 是包级依赖边，只决定 factory 到达与插件组合；Cordis 的激活顺序由 service 等待决定，不由 inject 表达。来源：client-modules.zh.md:73。

CLIENT-03〔源码事实〕组合失败是「响亮失败」：激活期某包声明畸形或缺失 bundle 会聚合成 AggregateError 并使该 fiber FAILED；**稳态下损坏包只记警告且不殃及其他包**；同一包名被两个 Loader 源解析则组合失败。来源：client-modules.zh.md:77,79。

CLIENT-04〔约束〕规则：**当** SoloIPs 客户端包声明 dsh.client，**则** 必须同时提供 exports 的 client 产物，且其 inject 只列真正消费的官方 client 包；**范围** 所有 soloips-* 客户端包；**结果** 组合图可被 dump 与启动核对，不出现激活期 FAILED。**授权** 沿用 SOLO-A01 交付形态；**失败与恢复** 见 CLIENT-F01、CLIENT-F02。**验证** 待 S0 在锁定安装包上执行并读回。

### 9.3 业务视图的两条官方入口

CLIENT-05〔建议〕规则：**当** SoloIPs 需要在内建 Web Client 中呈现业务行，**则** 客户端包应当只使用两条官方入口——uiConversation 的事件注册（注册 ConversationNodeDefinition）与 slots.register（注册 keyed renderer）；**范围** 首版全部业务视图；**结果** 业务行进入官方 Conversation 组装与 slot 渲染，不需要复制 shell 或 assembler。**授权** 需用户确认（〔待决〕CLIENT-D01）。**证据** docs/cookbook/extension-cookbook.zh.md:39,133；conversation.zh.md:208-217 示例。

CLIENT-06〔建议〕SoloIPs 首版不注册第二个 Conversation target/View 包。官方选择规则是「有效且已注册的持久化选择优先，其次是已注册的 chat，否则不渲染 View；绝不选择第一个已注册 View」（conversation.zh.md:47，另见 :27）。注册 target 意味着承担该 target 的快照 builder 与渲染契约，属于额外长期面。

CLIENT-07〔建议〕渲染契约：Definition 的 match 只做身份提取，State 折叠放在 update；buildViewNode 只返回 renderer 直接可用的数据；已发布 node 的 context.key 不得撤回，需要暂时离开可见流时使用 visibility 为 hidden；热路径不得遍历完整事件窗口、所有 Context 或已渲染 Node。来源：conversation.zh.md:219,223,241。

CLIENT-08〔约束〕反面声明：**注册并渲染一个业务节点，不蕴含客户端拥有该业务的事实。** 官方验证要求明确要求 keyed renderer 只消费 node.data 与受限 Location hook，不扫描 Session 事件窗口、Context 或 Chat Node（conversation.zh.md:245-256，第 6 条）。

### 9.4 业务事实归属

CLIENT-09〔建议〕规则：**当** 任何客户端包渲染或提交业务信息，**则** 业务事实必须只存在于 Host 侧；客户端包必须零可写业务状态，只消费只读投影；**范围** soloips-web 及其全部子模块；**结果** 任一业务对象的写权威唯一且可定位在 Host。**失败与恢复** 客户端本地副本一律视为可丢弃缓存，不得作为写路径的输入。

CLIENT-10〔建议〕反面声明：**持有不等于可访问；本地存在不等于权威。** 客户端 IndexedDB/localStorage 中的任何业务对象副本都不是事实来源，丢失后必须能由 Host 投影重建。

CLIENT-11〔建议〕客户端数据面应当消费 DSH 官方生成的 Remote（由 Host 侧 controller 的 Remote 贡献生成），而不是自建 HTTP/RPC channel。**理由（证据）** 官方分层为 Host 状态 → Remote 传输 → Client model → UI adapter → Conversation/presentation → Slots → React，且 presentation component 绝不接收 Cordis ctx、transport object 或其他功能插件的实现（web-client.zh.md 分层表）；事件生产方拥有 branded id 与 SessionEventMap，Client 包只做 type-only 副作用导入（conversation.zh.md:49）。**后果** 数据面自建会让「换界面」退化为重写传输层（见 9.6 与附 9.A 反例）。

CLIENT-12〔建议〕不得维护第二份可写业务状态机：客户端不得在 IndexedDB、localStorage、内存 Map 或 reducer 中保留可写权威副本。与 dsh-agent-swarm 章程红线「不维护第二个可写 Team 状态机；UI reducer、transcript、browser cache、Canvas/BFF 或本地 Map 都不是权威」一致。

CLIENT-13〔建议〕若确需客户端本地状态，应当仅限以下三类：会话内存中的视图状态（展开/折叠、当前选中、草稿输入）、可丢弃且带过期语义的草稿缓存、纯展示偏好；且必须可被 Host 投影重建。首版建议直接省略本地持久化。

### 9.5 加载顺序

CLIENT-14〔建议〕组装 web profile 时，bundle 配置层序只引用 SOLO-C01，完整覆盖序见 §6.1；能力包插入 Host/client 行，客户端包的 factory 依赖图与服务激活顺序按 CLIENT-02/15 分别声明。验收必须同时核对生效配置和实际服务依赖，不能用数组位次证明客户端已激活。

CLIENT-15〔约束〕规则：**当** 客户端包需要「先激活 A 再激活 B」，**则** 不得用 inject 表达该先后（inject 只保证 factory 到达）；先后必须由 Cordis service 等待或官方 slot/inject 语义表达。来源：client-modules.zh.md:73。

### 9.6 换独立界面时的分界

CLIENT-16〔建议〕换界面时的保留分界：

| 必须留在客户端包（可丢弃） | 必须留在 Host（不可丢弃） |
| --- | --- |
| ConversationNodeDefinition 与 keyed renderer | 业务事实与全部写路径 |
| locales、样式、slot 贡献 | Remote/service face 与鉴权策略 |
| 仅会话内存的视图状态、可丢弃草稿 | 附件字节、附件读取授权与 URL 解析 |
| 官方 client 包的 inject 边 | 事件生产与 SessionEventMap 的权威声明 |

CLIENT-17〔建议〕规则：**当** 首版复用 DSH Web、后续替换为 SoloIPs 界面，**则** 客户端包应当整体可丢弃，替换成本只落在视图与交互层；**范围** 首版到独立界面的过渡；**结果** 独立界面消费同一 Host 业务接口，不重建事实来源。**授权** SOLO-02（首版复用 DSH Web，后续独立界面消费同一业务接口）。

CLIENT-18〔建议〕附件与图片：客户端不得自行构造文件路径或长期 URL；应当经官方会话授权入口取得可读 URL（例如 ui-conversation 提供的按会话授权 imageUrl，随 Session binding 释放而撤销；来源 conversation 子系统 README:12），使「持有不等于可访问」在实现层成立。

### 9.7 失败场景

| ID | 场景 | 可观察后果 | 依据 |
| --- | --- | --- | --- |
| CLIENT-F01 | 声明 dsh.client 但 exports 的 client 产物缺失或畸形 | 激活期 AggregateError、相关 fiber FAILED；不能单由此断言整个 Web profile 退出 | client-modules.zh.md:79；完整运行影响需验证 |
| CLIENT-F02 | 同一包名被两个 Loader 源解析 | 组合失败 | client-modules.zh.md:77 |
| CLIENT-F03 | patch 覆盖官方行但未重述该行全部 config | 静默丢失未重述字段 | app-boot README.zh.md:144 |
| CLIENT-F04 | 业务事实被写入客户端本地存储 | 双写权威；违反 CLIENT-09/12 与官方验证要求 6 | conversation.zh.md:245-256 |
| CLIENT-F05 | 只加载到 update 而无 start 就渲染 | Context pending，界面缺行；须由 terminal/checkpoint 携带完整 fallback 状态 | conversation.zh.md:43 |
| CLIENT-F06 | 冷启动 replace 与实时 append 结果不一致；prepend 更早分页替换了既有 keyed node | 历史显示错乱 | conversation.zh.md:251-255（验证 3/4/7） |
| CLIENT-F07 | 换独立界面时才发现数据只在自建 channel | 传输层重写 | CLIENT-11；附 9.A |
| CLIENT-F08 | 视图与事实两处独立实现同一对象 | 双权威；用户看到的状态与任务事实不一致 | CLIENT-09；dsh-agent-swarm 章程红线 |

### 9.8 本章不蕴含什么

- 复用 DSH Web 外壳不等于 SoloIPs 产品界面已完成。
- 安装启用客户端包不等于其业务视图已被实际调用或验证。
- 客户端能渲染一条业务行不等于该业务事实由客户端拥有。
- 组件可复用不等于换界面零成本；成本取决于 CLIENT-11 是否被遵守。

### 9.9 待决

- CLIENT-D01〔待决〕首版业务视图采用会话内卡片（main.conversation 插槽）还是独立 View target；责任人：用户。
- CLIENT-D02〔待决〕conversation 头部动作、右侧栏面板 tab 等官方 shell 插槽是否长期占用（绑定官方结构，DSH 预览期会变）。责任人：用户/架构负责人。
- CLIENT-D03〔待决〕客户端包是随 soloips-bundle 一同安装，还是作为独立可替换包单独安装（影响「可丢弃层」的落地方式）。责任人：架构负责人。
- CLIENT-D04〔未验证〕55120 上实际生效的 client 组合图（entry 列表与 rev）未核对；0.1.4 checkout 与 0.1.5 部署的差异使组合基线无法确认。责任人：S0。

### 附 9.A 现有插件客户端的反例清单

阅读契约：证据范围 = dsh-agent-swarm 0.1.4 checkout（2026-09-15）；用途 = 说明「客户端如何不应当承载业务事实」；不评价该插件自身的正确性。

| 编号 | 反例（源码事实） | 位置 | 与第 9 章规则的冲突 | 建议处置 |
| --- | --- | --- | --- | --- |
| CLIENT-X01 | 客户端自建 RPC channel（自建 PUBLIC_RPC_CHANNEL 与 ENDPOINTS，经官方 client-connection seam 发送），Host 侧用 webServer 注册挂精确路由并做 loopback 检查 | src/client/public-rpc-client.ts；src/rpc/read-rpc-service.ts:215-239 | 冲突 CLIENT-11：数据面不走官方生成 Remote，换界面需重写传输 | 迁移到生成 Remote；S0 核对 |
| CLIENT-X02 | 客户端使用 IndexedDB 保存业务草稿（swarm.goal.drafts、swarm.public.drafts） | src/client/goal-draft-store.ts:37；public-draft-store.ts:28 | 冲突 CLIENT-09/12 的「零可写业务状态」（若草稿被当作写路径输入） | 明确为可丢弃缓存并加过期语义，或移除 |
| CLIENT-X03 | 客户端持有公共聊天读模型缓存与本地键，含 viewer/team/revision 校验 | src/client/public-chat-controller.ts:83-107 | 风险：本地读模型与 Host 投影的权威边界 | 保持只读 + revision 校验（现状注释已声明非权威），迁移时复核 |
| CLIENT-X04 | 客户端模块规模与官方插槽占用：src/client 68 个文件；注册右侧栏 tab、main.conversation、会话头部动作、settings.plugin.item | src/client（68 个 ts/tsx）；team-dashboard-plugin.ts:143,147,152,173,177 | 提示：视图层与业务耦合后不易整体丢弃 | 新包按 9.6 分界切分，不复用其分层 |
| CLIENT-X05 | 包级 client 注入面：dsh.client 的 inject 列 15 个官方 client 包、platform 为 web | dsh-agent-swarm/package.json 的 dsh.client 段 | 可作正向样例（只列真正消费的官方包） | 可直接沿用该声明方式 |
| CLIENT-X06 | patch 层重述官方行：对官方 connection 行重述 inject 含 webRuntime、webServer | dsh-agent-swarm/cordis.patch.yml | 印证 CLIENT-F03：不重述即丢字段 | 新 bundle 逐行核对 |

## 10. 失败与恢复

初稿装配材料来自 backend-hy4。本章范围：装配失败与恢复，以及 SOLO-F09 对既有 ORG-13 上游停线要求的承接。装配证据来自 DSH_CHECKOUT 静态阅读（附录 B）；源码行为与提议的恢复动作分别标注，均不构成目标服务的故障注入结果。

### 10.1 故障矩阵（SOLO-F01）

| 编号 | 触发 | 代码位置 | 可观察后果 | 是否降级 |
| --- | --- | --- | --- | --- |
| F-1 | bundle 包不可解析 | packages/boot/app-boot/src/profile.ts:753-756（抛错并提示用 dsh plugin 安装） | 启动前即失败，**整个 profile 起不来** | 否 |
| F-2 | 列入 bundles 的包没有 dsh.bundle 声明 | profile.ts:788-790 | 同上，启动前抛错 | 否 |
| F-3 | 同一次 group 配置重复定义 entry ID | vendor/loader/src/config/group.ts:59-70 | 预检抛 TypeError，本次未创建条目且不进入该次 catch 回滚；外层影响另验 SOLO-F03 | 否 |
| F-4 | 行 name 指向的模块导入失败 | vendor/loader/src/config/entry.ts:217-220、:280-287；group.ts:71-105 | 所在 group 的更新尝试恢复旧配置，恢复本身可能失败；作用范围见 SOLO-F02 | 否 |
| F-5 | 行 apply 抛错 | vendor/loader/src/config/entry.ts:287；group.ts:71-105 | 所在 group 更新收集失败并尝试恢复，可能再报 rollback failed；见 SOLO-F02 | 否 |
| F-6 | 依赖服务未就绪 | vendor/cordis/README.md:65；dsh-agent-swarm/cordis.patch.yml:5-9 的 pending 声明 | 缺少 inject 必需服务时插件不运行；目标挂起状态与可见性另验 SOLO-F04 | 是（等待依赖） |
| F-7 | 受依赖管理的包升级后丢失 dsh.bundle 声明 | apps/cli/src/plugin.ts:77-90 | 该分支无专门告警地移出 bundles；其他接入层及最终启动/功能结果另验 SOLO-F05 | 是（移除该层） |
| F-8 | patch 目标行不存在 / name 不匹配 | vendor/include/src/index.ts:111-119；SOLO-F06 | 此分支调用 warn 后跳过，不自行抛错；可见日志与整个启动结果由目标入口验证 | 是（跳过该 patch） |
| F-9 | patch 文件本身不可解析或不是顶层数组 | packages/boot/app-boot/src/index.ts:350-368 的 parsePatchList（抛错）；:315-323 的 loadOverlayPatches（缺失即抛） | 启动失败 | 否 |
| F-10 | 用户 patch 文件缺失 | index.ts:295-304 的 loadOptionalPatches（ENOENT 视为无此层） | 视为「无这一层」，不报错 | 是（按设计） |
| F-11 | git 源安装无 prepare 构建 | docs/user/develop/basic/publish.md:161-173；apps/cli/src/plugin.ts:155-160（提示加 allowBuilds） | 首次 add 失败；加白后重跑 | 否（安装期） |
| F-12 | live reload 期间配置读取或应用失败 | vendor/hmr/src/index.ts:305-315；vendor/include/src/index.ts:296-319；group.ts:85-105 | HMR 记录日志与失败事件；应用失败后旧树能否恢复取决于回滚结果，不能只据日志断言保留旧态 | 条件成立时恢复旧配置，见 SOLO-F08 |

### 10.2 组合失败与挂载失败的作用范围（SOLO-F02）

**〔源码事实〕** 组合层没有「跳过坏包继续启动」的分支：

1. 解析期：profile.ts:784-793 对每个 bundle 逐层解析，任一不可解析或缺少 dsh.bundle 即抛错；profile.ts:753-756 的错误信息明确要求先执行 dsh plugin 安装。
2. 挂载期：vendor/loader/src/config/group.ts:71 用 Promise.allSettled 并发创建；所在 fiber 仍存活时（:75），:76-80 将失败抛出，:85-105 尝试移除**该 group 本次新增条目**并重建该 group 旧配置。恢复本身可能失败并抛 AggregateError（loader entry rollback failed）；nested group 与外层传播需按具体入口判断，不提供全宿主整树必然回滚的保证。
3. 单条目的错误被统一包装：vendor/loader/src/config/entry.ts:24-27 的 updateError（stage 为 import / dispose / apply / rollback）。

**〔推断〕** 组合解析失败可能阻断该组合启动；挂载回滚的具体范围须按触发路径区分，不能由包数量直接推出任意错误的全部影响。无效 patch 可仅 warn/skip（SOLO-F06），服务缺失可保持 pending（SOLO-F04），客户端稳态另见 CLIENT-03。

**〔约束〕** ARCH-D02 保留 core 与 adapter 的边界，同仓统一交付，不为各包另建发布流水线。包数不证明故障隔离，仍须按实际阶段验证失败范围。

包数已由 ARCH-D02 决定；故障半径仍须真实验证，证据不因该决定补齐。

### 10.3 重复 entry ID 的预检拒绝（SOLO-F03）

**〔源码事实〕** vendor/loader/src/config/group.ts:59-66 在创建条目前检查本次 group 配置中的重复 ID；:64 的 TypeError 位于 :70 的 try 之前，因此本次调用尚未创建条目，也不会进入本函数 :85-105 的恢复分支。nested group 的异常可能继续经外层调用传播，最终启动或恢复结果按实际入口验证。此检查不拒绝多个 patch 顺序覆写同一既有 row（SOLO-FAIL-10、SOLO-C03）。

**〔源码事实〕** 未写 id 的行不会撞车，但会得到随机 id：vendor/loader/src/config/tree.ts:66-73。这类行后续无法被 patch 稳定命中，属于隐性缺陷。

**〔建议〕** 每条 patch 按 SOLO-C04 使用稳定目标 ID，insert 的 entry 使用包名前缀。对导出的 entry 结构执行明确的 ID 唯一性断言，并按实际 Loader 入口验证重复定义被拒；仅取得 --dump-config 输出不能声称执行过 EntryGroup 的预检。

### 10.4 服务未就绪：fail-closed pending（SOLO-F04）

**〔源码事实〕** vendor/cordis/README.md:65 说明 inject 声明插件运行前必需存在的服务。现成插件的声明见 dsh-agent-swarm/cordis.patch.yml:1-9：子项消费单独组合的 storage hub、KV 后端、Storage Domain 与 Session persistence，缺服务时保持 pending。前者是官方公开契约，后者是插件声明；目标安装中具体挂起状态与诊断表现仍须验证。

**〔建议〕** SoloIPs 的包必须沿用同一约定：**缺依赖服务时挂起并保持可诊断**，不得自行降级为「用内存实现顶上」。挂起必须有可观察出口（日志或 UI 提示），否则与「静默不工作」不可区分。

**〔未验证〕** 挂起行的具体可观察表现（是否有统一日志/UI 提示、是否会超时）本次未验证。

### 10.5 升级丢失 dsh.bundle 的静默移除（SOLO-F05）

**〔源码事实〕** apps/cli/src/plugin.ts:59-91 的 reconcilePlugins 以**已安装状态**而非依赖 diff 来校对 bundles：:82 判定 stillBundle 为「在依赖集合中且该行导出 patch」，:83-86 当「曾是依赖但现在不是 bundle」时从列表 splice 并回写 manifest（:88-90）。反向也成立：:67-69 与文件头注释 :8-9（新版本获得 dsh.bundle 声明会被自动激活）。

**〔源码事实〕** 对普通依赖（无 dsh.bundle）只打印一次警告，不阻断：plugin.ts:70-75；docs/user/develop/basic/publish.md:64。

**〔源码事实〕** apps/cli/src/plugin.ts:81-90 的移除分支没有专门 warning；它只决定 bundles 数组的变化，不保证 profile 最终启动成功或能力完全消失，其他 overlay 仍可能接入能力。〔建议〕发布门禁结合 SOLO-C06 的完整生效树比对、预期入口断言与功能验证识别遗漏，不能只检查进程退出码。（SOLO-ACC-CE-E 验升级移除；SOLO-FAIL-04 另验普通依赖由 overlay 接入。）

### 10.6 未命中 patch 的告警与跳过（SOLO-F06）

**〔源码事实〕** vendor/include/src/index.ts:111-119：目标 id 不存在或 name 不匹配时调用 warn 并 continue；这两个分支不自行抛错。启动 Include 在 :267-270 转发 logger，而 packages/boot/app-boot/src/profile.ts:841-847 的 composeEntries 默认 warning sink 为空。因而调用入口决定告警是否可见；该局部分支不能推出整个程序退出码、总告警数量或最终功能结果。设计意图见 packages/boot/app-boot/src/index.ts:341-343。

**〔源码事实〕** insert 到不存在的组、或插入到非组行，同样只 warn：vendor/include/src/index.ts:83-90。

**〔建议〕** 发布门禁对非预期 patch 告警及缺失条目判失败；同时按 SOLO-C06 比对带来源的配置导出与期望 entry/字段，不依赖日志必定出现。源码 warn/skip 语义已收敛，SOLO-REG-Q5 只保留目标可见性和门禁验证，不再将测试注释与实现分支列为未裁定冲突。

### 10.7 dsh plugin 无回滚（SOLO-F07）

**〔源码事实〕** apps/cli/src/plugin.ts:120-162 的 runPlugin：初始化 profile（:122-130）→ spawnSync 调用 pnpm（:134-138）→ :148-149 仅当退出码 0 才 reconcilePlugins；:150-160 非零时只打印提示（含 git 源的 allowBuilds 指引）。**没有对已写入的 node_modules、pnpm-lock.yaml 或 manifest 做任何回滚**；移除语义见 docs/user/develop/basic/publish.md:110（remove 同时删依赖与层）。

**〔建议〕** 变更流程必须自带完整装配恢复材料（宿主及插件工件/散列、profile 配置及 lockfile、home/launcher overlay、dump 基线）；涉及状态变化时另备 SOLO-DATA-04 的一致恢复点与兼容性证据。备份 manifest 不等于备份业务状态（SOLO-ACC-06）。

### 10.8 patchReload：live 与 startup 的差异（SOLO-F08）

**〔源码事实〕** 取值与默认：packages/util/package-manifest/src/types.ts:65-66 声明取值仅 live 与 startup 两种；profile.ts:137 的 DEFAULT_PROFILE_PATCH_RELOAD 为 live（自定义 profile 默认 live）；内置模板 web 为 live（profile.ts:112-113），headless/sdk/acp/sdk-minimal 为 startup（:108-125）。非法值直接抛错：profile.ts:776-782。

**〔源码事实〕** 只有 live 会安装 HMR 观察并在运行中重放用户层：apps/cli/src/profile-boot.ts:355-385（patchReload 为 live 且树仍活跃时才挂载 watcher；:366-371 必要时补装 timer 与 hmr）；重放的组合函数 composeLive（:328-333）保持「bundle 层在下、overlay 在上」，因此用户层可覆写 bundle 层已有行；“在下”不意味着受保护。startup 不装任何 watcher（:353-354 注释）。

**对「重启读回」的影响（〔推断〕，重要）**：

1. patchReload 控制配置生效时机，不提供持久化或状态恢复保证。配置变化仍可能改变存储路由、schema 或服务接线，因此会影响恢复验收所绑定的运行条件。
2. live 更新未完成、被拒或恢复旧配置时，磁盘候选可能与运行树不同；未冷启动本身不证明二者不同步。热更新通过也不能替代冷启动后的配置与状态读回证据。
3. HMR 失败路径记录日志和 hmr/config-update-failed 事件（vendor/hmr/src/index.ts:305-315）；vendor/include/src/index.ts:296-319 明确应用失败后旧树保留受回滚成功条件限制，group.ts:85-105 还可能抛恢复失败。必须观察实际恢复结果，不能只据失败日志断言旧态完整。
4. startup 在启动时按当时读取的配置应用；运行期间编辑磁盘不会自动更新运行树，新候选需冷启动后再验证。两种模式均须记录实际生效组合与读回边界。

**〔建议〕验收规则 SOLO-F08**：

- **actor**：验证「写入 → 停止 → 重启 → 读回」的人。
- **trigger**：任何涉及持久性与配置生效的验收。
- **action**：必须显式确认当前 profile 的 patchReload 取值；live 模式下，验收前必须执行一次真实重启后再读回，不得以热更新后的状态作为证据。
- **outcome**：冷启动实际生效组合与本次绑定的 profile/home/launcher 输入及配置导出一致；表达式的实际求值结果另行核对。业务数据读回与本次已写事实比较，按 SOLO-ACC-05 验收。
- **verification**：本规则只覆盖配置生效路径；不覆盖业务数据持久性（属第 11 章 SOLO-ACC-05 与业务侧正文）。

### 10.9 本章稳定 ID 汇总

| ID | 内容 | 状态 |
| --- | --- | --- |
| SOLO-F01 | 装配层故障矩阵 | 〔源码事实〕+〔推断〕混合，逐条标注 |
| SOLO-F02 | 组合解析失败与 Loader 挂载失败的作用范围 | 〔源码事实〕路径；目标运行后果〔未验证〕 |
| SOLO-F03 | 重复 entry ID 在当前 group 创建前拒绝；外层影响另验 | 〔源码事实〕预检路径／〔未验证〕目标后果 |
| SOLO-F04 | 服务未就绪 fail-closed pending | 〔源码事实〕机制／〔未验证〕具体表现 |
| SOLO-F05 | 升级丢失 dsh.bundle 的静默移除 | 〔源码事实〕 |
| SOLO-F06 | patch 未命中的 warn/skip；可见性取决于入口 | 〔源码事实〕分支／〔未验证〕目标表现 |
| SOLO-F07 | dsh plugin 无回滚 | 〔源码事实〕 |
| SOLO-F08 | patchReload live/startup 与重启读回验收规则 | 〔源码事实〕机制／〔建议〕验收规则 |

### 10.10 本章未覆盖与证据缺口

- **覆盖入口**：上游停线见 SOLO-F09；并发 writer 见 SOLO-FENCE-01；数据根与恢复检查点见 SOLO-DATA-01–04。具体业务 schema 迁移算法须在实施切片设计和验证，本文不虚构迁移能力。
- **证据缺口**：PROFILE-55120（附录 B 第 2 项）的本次未读取，本章全部源码证据绑定 DSH_CHECKOUT（bundle 0.1.5-rc.2 / swarm 插件 0.1.4）；两者行为可能不同，落地前需在该实际 home 上复核 → 〔未验证〕。
- **证据缺口**：F-6 挂起行的可观察出口、F-12 热更新失败的用户可见性，均未启动验证 → 〔未验证〕。

### 10.11 上游停线、通知与显式恢复（SOLO-F09）

**〔需求〕** 来源为 REFACTORING_DOCS_ROOT/02-company-contract.md §11.9 的 ORG-13（:300-316），既有验收 ORG-A09/A10（:291-292）；[现有架构](architecture.md) §5 第 5 条及 §6 表后 S0/S1 优先事项沿用它。此要求已经确认；原草稿未编入该主题不构成需求缺失。以下按本稿模块关系给出承接，权威正文仍在来源文档。

| 项目 | 现行要求与承接 |
| --- | --- |
| actor / trigger | Host、模型/制作工具适配与派工入口在首次观察到鉴权失败、额度/账号不可用、限流、服务端错误、连接失败、超时、流中断或不可处理协议响应时立即进入停线处理 |
| action / scope | 停止出错执行，暂停依赖该失败请求的后续派工、自动重试与续跑；不等耗尽重试次数，不自动换模型、账号池或路由 |
| 保留与禁止 | 保留团队、成员身份、任务、attempt、已提交产物和 Session 历史，记录实际错误；不改写为完成/取消/归档，不删除、不批量取消；无关工作不因该错误被任意处置 |
| 站内通知 | 首错立即经现有用户界面可见，含时间、受影响团队/任务、模型路由、去敏错误、实际停止状态与等待用户处理事项；不得包含密钥、完整提示词、私有记忆或完整日志；重复事件合并计数 |
| 停止证据 | 分别展示“已请求停止”和“已确认停止”；外部任务停不下、结果未知或尚在执行时如实报告，不能伪报已停止 |
| 通知失败 | 通道失败不解除停线，站内错误事实保留并可重读；不能因发通知失败而自动恢复业务 |
| 恢复 | 仅用户明确恢复指令允许续接；充值、健康检查成功或通知送达均不构成授权。恢复前重核身份、资格、暂停、writer 及未决提交，从既有事实续接以避免重复副作用 |
| 后续通知扩展 | ORG-A10 的短信/邮箱、方式选择与配置读回属于同一后续切片；本轮只预留契约。空实现返回 not_implemented，未配置返回 not_configured；accepted 不等于 delivered，站内提示始终保留 |

**〔建议〕模块归属。** core 持有停线事实及派工门禁，adapter/tools-pv 上报去敏错误和真实外部状态，web 只投影通知；不另建第二任务状态机。未知 operationId/jobId 的原提交须先核对；未取得用户恢复授权前不为探测而重复调用受影响上游。此处是接口职责建议，不宣称已存在相应服务。验收细化见 SOLO-ACC-07/08。

## 11. 验收场景与反例

初稿验收材料来自 qa-hy4。本章是验收设计，不是通过记录。〔需求〕来源包括 SOLO-01–03、SOLO-R01/R02、ORG-03/05/06/13 及 ORG-A03/A09/A10、现有架构 §5/§6；具体测试编排为〔建议〕，交付层级为〔提案〕。已确认的结果要求不因测试尚未执行而降级。本章不提供任何场景的实际运行结果。

### 11.1 组合装配验收

**SOLO-ACC-01〔建议〕组合装配：部署组合 == 验收组合。**

- actor：实施者（或 CI 脚本）。
- trigger/precondition：任一 SoloIPs 包被安装、升级或移除之后；每次发布候选产出之后。
- action：必须 (1) 读取 profile 的 bundles 与依赖工件，记录 bundle、profile、home、launcher overlay 的完整层序、内容哈希及相关锁；(2) 对该组合执行 dsh --profile 加名称与 --dump-config，带上对应 launcher overlay；(3) 将导出的层、entry 及关键字段与受版本控制的验收组合清单比对，分别检查版本/SHA、唯一 entry ID 和预期 patch 结果。
- scope：全部 SoloIPs 包 + 官方基础层（@deepseek-ai/dsh-base；web profile 另含 @deepseek-ai/dsh-web-app）。
- outcome（通过）：层序、工件与关键 entry/字段均符合验收清单，entry ID 唯一，所有预期 patch 结果可核对；不能只凭没有 unmatched 日志判通过。
- outcome（失败）：顺序不一致、缺层、多出层、预期字段/entry 缺失或重复，或出现非预期 patch 告警。
- failure/recovery：--dump-config 与 --dump-default-config 互斥，且 dump 不启动进程、不求值 !!js（〔源码事实〕apps/cli/src/dump-config.ts:1-7、apps/cli/src/args.ts:103-114）。若 profile 自身 cordis.patch.yml 损坏导致 dump 失败，必须改用 --dump-default-config（跳过用户层，〔源码事实〕dump-config.ts:25-27），**不得**换一个 profile 重跑以绕开。
- verification：本条只验配置组成；业务功能、数据恢复与停线按 SOLO-ACC-02–10 及既有首片验收分别覆盖。
- 证据状态：机制〔源码事实〕（作者核对到源码行）；场景〔未验证〕——**当前未执行**。

**禁止的替代做法（反面声明）**：

- 用「profile 能启动、退出码 0」推断组合正确 —— 不成立：未命中的 patch 分支可以跳过，具体日志由调用入口决定，须核对实际组合（SOLO-F06）。
- 用 checkout 源码推断部署组合 —— 不成立：当前 checkout 的 dsh-agent-swarm 为 0.1.4，55120 部署为 0.1.5（〔源码事实〕两侧 package.json，附录 B 第 2、3 项）。

### 11.2 单写权威验收

**SOLO-ACC-02〔建议〕同一 facility 的重复 open 拒绝。**

- actor：实施者。
- trigger/precondition：任务专属临时根，同一 DomainFacility 已打开待测 domain；与生产根隔离（SOLO-DATA-02）。
- action：在同实例内分别顺序、并发打开同名 domain；可从同包与不同包触发。
- outcome（通过）：第二次 open 以 DomainError('already-open') 拒绝，无第二 handle；首次 handle 与已写状态完整。经真实激活路径触发时，另记录错误可见性和该路径的退出行为。
- outcome（失败）：重复 open 成功或错误被吞并据此宣称双 writer 安全。
- authority / boundary：源码保证只来自本实例的 reserved Set（§7.2）。该调用拒绝不直接证明整进程非零退出，更不证明 ORG-06。
- verification：场景〔未验证〕；跨进程、路径别名和失权提交必须另过 SOLO-ACC-09。

**SOLO-ACC-03〔建议〕异名双写探测**：对每项业务事实（入职状态 ORG-03、员工占用 ORG-05、任务/attempt 状态、artifact version、审核 receipt、mailbox），必须能指出唯一持有它的 domain + 表。指不出即〔未验证〕缺口，不得在文档中写为「已保证」。

### 11.3 半状态拒绝验收

**SOLO-ACC-04〔建议〕入职未过，不得进入工作路径。**

- actor：员工（AI）/ 调度器 / 经理。
- trigger/precondition：某员工入职检查（完整入职 ORG-03）未通过。
- action：必须分别触发并拒绝三条路径：(a) 经理显式派单；(b) 员工自领 open-claim 任务；(c) 自动调度器分配。
- scope：三条路径全覆盖，不得只拦其中一条。
- outcome（通过）：三条路径均被拒，返回**具体缺项原因**（非泛化失败）；重试有界且不重建员工身份；任务保持 pending/ready=false。
- outcome（失败）：任一路径放行；或放行「资料文件数量合格但内容无效」的员工；或拒绝后反复重建员工身份。
- failure/recovery：缺项必须可修正并重试至通过；重试不得产生第二条员工身份或第二个 appointment。
- 证据状态：场景〔未验证〕——**当前未执行**。准入源码观察与精确候选统一见 §7.9；已知完整入职与未绑定旁路缺口须在正式业务入口启用前修正，源码已核对不等于本场景通过。

### 11.4 重启读回验收

**SOLO-ACC-05〔建议〕写入 → 停止 → 重启 → 读回，且不受 patchReload 干扰。**

- actor：实施者。
- trigger/precondition：已建立至少一个公司/部门/员工、一个任务、一个已保存作品版本。
- action：必须 (1) 绑定安装工件、profile、解析后 home、有效存储根与 patchReload，并保存生效组合；(2) 写入业务数据；(3) 停止进程并确认写入口关闭；(4) 用同一安装包、同一 profile、同一实际数据根重启；(5) 取得唯一写权、完成恢复后核对公司、任职、任务、operationId 与作品版本。
- scope：同一数据根只有一个合法 writer；不得出现第二个进程/分支持有同一数据根。
- outcome（通过）：数据可核对且一致；无双重执行；重启前后 dump 组合一致。
- outcome（失败）：读不回；读回值与写入值不一致；出现两个 writer；重启后组合与停止前 dump 不一致。
- failure/recovery：新的正式/验收 profile 必须符合 ARCH-D04 的 startup。历史 live 观察只作诊断；热更新失败可能保留旧进程组合，不得用其替代本条冷启动验收。
- 历史观察：附录 B 第 2 项记录 2026-09-15 的 profile 声明为 live；本次动作前须按 ENV-03 重新核实，不能把历史声明当当前运行组合。
- 反面声明：清空数据后能启动**不算**恢复通过；patchReload 为 live 下进程未重启**不算**执行了本场景。
- 证据状态：机制〔源码事实〕；场景〔未验证〕——**当前未执行**。

### 11.5 回滚验收

**SOLO-ACC-06〔建议〕装配回退与状态恢复分开验收。**

- actor：交付/恢复执行者。
- trigger/precondition：绑定 SOLO-DATA-02 的旧/新工件、profile、home、实际数据根、schema 与媒体位置；旧装配可重现，切换过程须满足 SOLO-DATA-03、SOLO-ACC-09。验证使用专属临时根和合成状态，不动生产数据。
- **分支 A：装配回退。** 候选未改变状态，或已有证据证明旧组合能读取候选写入后的 schema/语义。停止候选并关闭写入口，恢复旧装配，取得同一数据根唯一写权，重新打开 domain、完成恢复后读回核对。若兼容性未证，不得以旧 profile 成功启动代替。
- **分支 B：状态恢复。** 已有 SOLO-DATA-04 的一致检查点、对应旧装配与升级后有效变化的保全/处置方案。在停写且排空的边界，将检查点恢复到隔离根，核对公司、任务、身份/Session 引用与媒体字节；按 operationId/jobId 对账外部实际结果，避免重复已提交操作。产品入口切换及可能舍弃有效变化另需具体授权。
- scope：A 只恢复装配并证明对指定状态的兼容；B 只证明从指定检查点恢复及其明确的数据保留边界。不承诺零数据损失。
- outcome（通过）：选定分支的前提完整，旧组合与指定数据可核对，无双 writer、悬空引用或重复外部提交；恢复点之后的数据保全与处置结果可说明。
- outcome（失败）：有效 root 漂移、旧 schema 不可读、仅备份 manifest、快照跨域不一致、丢失有效变化未处置、失权 writer 仍可写，或把“新 profile 启动”报成恢复完成。
- failure/recovery：兼容性、恢复点、原提交结果或停止状态未知时，保持受影响写入口关闭并报告缺少的证据；保存新旧数据供诊断，不覆盖唯一副本。
- authority/机制边界：dsh plugin 不提供安装快照或业务状态回滚（SOLO-F07）；默认同 home 共享数据（SOLO-DATA-01）。双 profile 与 manifest 快照均不能单独解决状态恢复。
- verification：场景〔未验证〕；前置未定义时不可执行，不得给通过结论。

### 11.6 九条反例转验收判定（SOLO-ACC-CE-A … CE-I）

每条给 **起点 → 动作 → 可观察失败**。机制事实标〔源码事实〕（作者只读核对到源码行/实际配置）；场景本身〔未验证〕——**全部未执行**。

| ID | 起点 | 动作 | 可观察失败（判定该反例成立） | 机制证据 |
| --- | --- | --- | --- | --- |
| SOLO-ACC-CE-A | 仅移动 company/collaboration 的 yml 行，声称能保证公司服务先激活 | 在隔离候选中改变两者服务就绪时点并观察激活；另核对同层 patch 的配置遍历 | 激活遵循 service/inject 依赖；一次恰好同序不能证明 yml 位次提供保证。若实现依赖位次且在依赖未就绪时放行则失败 | 〔源码事实〕packages/bundle/base/cordis.patch.yml:12；配置遍历见 vendor/include/src/index.ts:77，二者作用不同 |
| SOLO-ACC-CE-B | 业务不变量（完整入职 ORG-03 / 单员工占用 ORG-05）只依赖包 patch 的 config 开关 | 在隔离候选的 home 级 cordis.patch.yml 覆写同一行 config 并去掉该开关 | 若缺少业务门禁仍可提交违规状态，则反例成立；启动/日志结果按实际记录，不预设必成功或无错误 | 〔源码事实〕SOLO-C03 的 config 替换、§6.1 的层序；业务后果为〔未验证〕场景 |
| SOLO-ACC-CE-C | 隔离 profile 的 patch 依赖某行名/scope | 切换到该行消失或改名的 DSH 候选，核对完整导出及实际入口 | 未命中分支可跳过该 patch；若预期 entry/字段缺失却被发布门禁接受，则反例成立。记录真实退出码与日志，不预设 0 或一行 stderr | 〔源码事实〕vendor/include/src/index.ts:111-119、267-270；packages/boot/app-boot/src/profile.ts:841-847；机制正文 SOLO-F06 |
| SOLO-ACC-CE-D | 在临时 profile 成功安装 A，并记录 manifest/lockfile/node_modules 基线 | 安装 B 时受控失败，逐项检查文件和安装闭包实际差异 | 可能留下部分变更且 DSH 不自动恢复；须报告实际残留，不能预设 manifest 必含 A+B | 〔源码事实〕apps/cli/src/plugin.ts:120-162：仅 pnpm 退出 0 才 reconcile；该路径无快照恢复 |
| SOLO-ACC-CE-E | 受依赖管理的某包已列入 bundles | 升级至丢失 dsh.bundle 的候选并完成 reconcile，核对后续完整组合 | 该项从 bundles 移除；若能力未由其他合法入口提供且遗漏未被发布门禁发现，则反例成立。整体启动、功能与告警按实际观察，不预设必成功或全无告警 | 〔源码事实〕apps/cli/src/plugin.ts:70-90；机制正文 SOLO-F05 |
| SOLO-ACC-CE-F | 两个包通过同一 facility 打开 storage domain | 顺序或并发 open 同名 domain | 第二次 already-open；改用异名并写同一业务事实仍可能双写；换 facility/进程不能据该错误预测结果 | 〔源码事实〕packages/storage/storage-domain/src/index.ts:65-72、103-107；跨 Host 单独验 SOLO-ACC-09 |
| SOLO-ACC-CE-G | 建员工 + 过入职门 + 绑 Session + 建私有记忆 | 让这些写入跨越两个包各自 commit | 出现半状态：员工已建但入职未过；或 attempt 已建但所属员工不在 roster | DSH 不提供跨包事务（〔推断〕+〔未验证〕：作者未取得正面源码证据，检索无结果不等于证明不存在，实现阶段必须重核）。与 7.1 的〔推断〕一致；本文登记为 MECH-04、DRAFT-D05 |
| SOLO-ACC-CE-H | 隔离的历史兼容 profile 显式 live，先记录成功运行组合 | 注入受控失败编辑，观察实际更新/回滚；恢复可加载候选后执行停止、冷启动与读回 | 若把未生效的磁盘候选、恢复失败状态或重启后的另一组合当同次验证通过，则反例成立。分别记录更新、回滚与冷启动结果；任何一次失败不自动证明旧树完整 | 〔源码事实〕vendor/include/src/index.ts:296-319、vendor/hmr/src/index.ts:305-315；机制正文 SOLO-F08；场景不操作 55120 |
| SOLO-ACC-CE-I | checkout 源码与部署包各自构建 | 用 checkout 构建产物去验收 55120 | 验收的包 ≠ 部署的包：checkout 的 dsh-agent-swarm = **0.1.4**，部署 = **0.1.5**（依赖 file: 指向 dsh-agent-swarm-0.1.5.tgz），其 peer 全钉死 0.1.5-rc.2（精确版本、无 caret） | 〔源码事实〕两侧 package.json 与已部署 profile 的 package.json（附录 B 第 2、3 项） |

**CE-G 的证据诚实说明**：跨包事务「不存在」目前是〔推断〕，未取得正面源码证据。关键词检索无结果不等于证明不存在；实现阶段必须重核。在此之前 CE-G 的交付标签保持〔提案〕，**不得**因表格整齐而升格为事实。

### 11.7 本章与上游的关系

- 本章是**验收合同**：写「什么算通过、什么算失败」，不是「已通过」。
- 本章引用既有业务需求及受委托技术约束 ARCH-D01–07；5 包为 ARCH-D02 的技术决定，仍非用户逐项确认的业务需求。验收结果须另给运行证据。
- 本章不记录动态状态（谁在跑、跑到哪一步）；动态状态留在原生任务系统。

### 11.8 验收门槛与技术候选

| 项目 | 处理方式 | 决策边界 |
| --- | --- | --- |
| 装配身份 | 〔建议〕绑定宿主、插件、lockfile 与工件 SHA-256；仅版本号不足以发现同版本替换 | 具体执行工具随交付路径确定 |
| patchReload | 〔约束〕新的 SoloIPs 正式与验收 profile 采用 startup；冷启动核对生效组合与业务读回 | ARCH-D04；现有 55120 不因本决定立即改配置 |
| 回滚 | 〔建议〕按 SOLO-ACC-06 分支 A/B 及 SOLO-DATA-01–04 执行 | 用户决定真实状态回退中有效数据的处置 |
| 首片门槛 | 〔需求〕ORG-03 完整准入、ORG-05 唯一占用、ORG-06 实际 writer、ORG-13 首错停线及现有架构 §5 必观察结果不得降级 | 测试编排仍可细化，不能借“未批准测试”豁免已确认结果 |
| 后续扩展 | ORG-A10 外部通知送达与通知方式选择/读回在后续同一切片完成 | 本轮不要求短信/邮箱已实现；站内通知与停线不延期 |

〔建议〕S0 工程验收覆盖装配、准入、独占、数据根隔离、重启与停线（SOLO-ACC-01–05、07、09、10）；发布切换须按适用分支执行 SOLO-ACC-06。SOLO-ACC-08 区分首片占位真实性与后续真实送达。S1 仍须执行现有架构的可播放 PV、准确版本审查和用户验收，不能用这些技术场景替代。

### 11.9 上游停线与通知验收

**SOLO-ACC-07〔建议〕细化 ORG-A09 / ORG-13 的首错停线。**

- actor / precondition：实施者通过真实 Host、派工与工具适配入口，在隔离数据根使用受控替身注入错误，不制造真实付费上游故障。存在已保存任务/attempt/产物及一次可关联的外部 job，另有不依赖该失败请求的任务用于核对影响范围。
- action：逐类注入鉴权、额度/账号不可用、限流、5xx、连接失败、超时、流中断及不可处理协议错误；每次从明确起点观测首错、派工门禁、停止请求与确认、站内通知及持久事实。
- outcome（通过）：首错立即可见且受影响执行/依赖派工停止；没有静默重试、换路由/账号/模型或自动续跑；身份、任务、attempt、产物和 Session 历史保留，未改成完成/取消/归档，未删除或批量取消，无关工作未被任意处置。
- 补充动作：令通知通道失败、重复发出同故障事件、模拟外部 job 无法取消、模拟额度或健康恢复但不授权，再由用户明确恢复。
- 补充通过：通知失败仍停，错误仍可读；重复事件合并计数且首错不被去重隐藏；停不下/结果未知如实展示；健康恢复不续跑。收到明确恢复指令后重核资格、暂停与 writer，按原 operationId/jobId 查回再续接，无重复提交。
- outcome（失败）：任一自动续跑/重试、伪报实际停止、提前归档、通知泄露或已保存事实丢失；未获恢复指令即对受影响上游发探测请求继续工作。
- verification：同时记录错误时间、对象与路由、去敏原因、停止状态、待用户事项、适配器请求计数、门禁决定与权威读回；通知不得含密钥、完整提示词、私有记忆或完整日志。本场景〔未验证〕。

**SOLO-ACC-08〔建议〕细化 ORG-A10 的通知占位与后续交付。**

| 子场景 | 动作 | 通过 / 失败 |
| --- | --- | --- |
| 首片占位真实性 | 读取通道能力并调用受控空实现/未配置路径 | 返回 not_implemented/not_configured 且保留站内停线；显示可用发送入口或伪造“已发送”则失败 |
| 后续真实通知 | 在通知扩展切片，通过插件选择通道、读回配置、按获准收件目标真实发送并核对返回 | accepted 与 delivered 分开，有事件/结果关联；不支持送达回执则标未知。选择、读回或发送缺一不算该切片完成 |
| 隐私与失败 | 检查去敏 notice 与 recipientRef；令通道失败/重复 | 不泄露凭据和完整私密内容，不刷屏，不解除业务停线；任一不满足则失败 |

本场景〔未验证〕；后续真实发送需要相应目标与授权，本次文档修订不执行发送。

### 11.10 跨 Host 与数据根验收

**SOLO-ACC-09〔建议〕细化 ORG-A03 / ORG-06 的实际独占。**

共同前置：目标安装候选、实际目标文件系统、专属临时根与合成业务数据；两个真实进程从正式 Host 入口执行，不以同一 JS 对象代替进程。先枚举所有权威发布点，纳入公司、Team、迁移与恢复路径。

| 子场景 | 动作 | 通过 / 失败 |
| --- | --- | --- |
| 第二 Host | A 取得写权并写入；B 指向同一规范化根申请写权 | B 在业务发布前拒绝，A 状态完整；B 可写即失败 |
| 打开路径绕过 | 在正式公司入口省略专属 facility、传入普通宿主 facility，或尝试候选的 ctx.storageDomain 回退 | 缺少有效公司写权时，必须在取得可写 domain handle 前拒绝；先取得可写句柄再阻止 put 不能替代本门槛。取得句柄后失权另按旧 handle 场景验收 |
| 路径别名 | B 用目标平台支持的相对/绝对路径、链接或等价别名访问相同介质 | 仍识别相同独占身份；产生第二独占键并可写即失败 |
| 失权旧 handle | 保留 A 的真实 handle，经受控接管使 B 获新代际并写入，再触发 A 的各业务发布点 | A 在持久发布前被拒，独立 reader 读回 B 的数据；只测便利 commitRecord 不够 |
| 检查/发布竞争 | 在 A 的 fence 检查与发布间设可控暂停，尝试 B 接管 | A 合法提交先完成，或 B 先接管且 A 被拒；不允许失权发布 |
| 崩溃恢复 | A 写入后异常退出，按指定维护协议恢复并接管 | 原数据和未决 operationId 可核对，恢复完成前不派工，无重复 attempt；盲目清锁或旧写入迟到覆盖则失败 |

verification：以 SOLO-FENCE-01 的已核写点为最低清单，补全 Team、迁移、恢复和失败清理路径；逐项绑定实际公开入口与持久发布证据。留存进程、实际存储身份、代际、拒绝原因、发布计数及新 reader 读回证据；同实例 already-open、只测试便利 commitRecord 或测试文件存在不算通过。本场景〔未验证〕。

**SOLO-ACC-10〔建议〕验证 SOLO-DATA-01–03 的实际根绑定。**

- actor / precondition：实施者建立两个不同 home 的临时实例，以及同一临时 home 下的两个 profile；没有生产数据引用。
- action：读取各实例真实 backend/Session/资产路由，写入互异的合成标记；分别验证不同 home 的隔离、同 home 的默认共享；以路径别名或 overlay 尝试把验证根指向已有受保护临时根。
- outcome（通过）：不同 home 且路由隔离时标记互不可见；同 home 默认共享被明确识别，第二 writer 受 SOLO-ACC-09 拒绝；错误 root 在业务写入前被门禁拒绝，绑定清单与实际读回一致。
- outcome（失败）：只检查 profile 名、把目录不同当介质不同、home/overlay 漂移绕开独占，或资产引用仍回指另一环境却声称完全隔离。
- verification：记录配置表达式及解析后的实际路径，不能只以不求值 !!js 的 dump 证明隔离；场景〔未验证〕。

## 12. 待决事项

未决产品选择与技术验证分开；工程推荐不构成用户确认。正文已能定位需求与验收，不能再以“等成员交稿”作为要求缺失的理由。

### 12.1 仍需决定或验证的边界

| ID / 来源 | 内容与建议 | 处置边界 |
| --- | --- | --- |
| DRAFT-D01 | 已按 ARCH-D01 迁移并登记技术架构；产品入口保留于 architecture.md | 已收敛；原草稿身份由 SOLO-TECH-ARCH 接续 |
| DRAFT-D03、DRAFT-S01–03 | 包边界/分期与唯一业务状态包按 ARCH-D02；S01 保持术语建议 | 已收敛技术选型；实现授权与运行证据另行处理 |
| DRAFT-D04 | loader 组合期与客户端稳态故障边界 | 工程核验各条目作用范围与真实失败结果，不以单包故障一概外推 |
| DRAFT-D05 | 跨 domain 事务能力与目标存储组合 | 保持〔未验证〕；禁止依赖未经证明的共同原子提交 |
| DRAFT-D06 | 装配顺序检查 | 〔建议〕按 SOLO-C01/C06 直接纳入候选回归，不另建第二套顺序正文 |
| DRAFT-D07-D1 / D2 | 首版 5 包边界、S0 所需四包；组织域留 core | 已按 ARCH-D02 决定，独立发布需新的实际需求证据 |
| DRAFT-D07-D3 | agent_swarm domain 的迁移与唯一业务写入口 | 工程核实候选差异、迁移与所有写路径；ORG-06 结果要求已确认 |
| DRAFT-D08 | 是否提供显式 disable 层及其可用边界 | 后续设计不得绕过准入、停线或存储独占 |
| DRAFT-D09 | 独立 home 策略按 ARCH-D03；实际根/兼容性/一致检查点仍须工程取证 | 不再等待 home 选型；真实有效数据的处置仍由用户决定 |
| SOLO-C07、SOLO-LAYER-Q4 | soloips 定义在独立 home 部署，新的正式/验收 profile 为 startup | 已按 ARCH-D03/04 决定；现有 55120 配置未因本决定改变 |
| SOLO-LAYER-Q1 / Q2 / Q3 | 行覆写权、前缀与工件锁定 | 本稿技术推荐见 SOLO-LAYER-03、SOLO-C04/C05、§11.8，随正式候选验证 |
| SOLO-REG-Q5 | 缺失 patch 目标在具体调用方的告警呈现与发布门禁 | 源码 warn/skip 与验收拒绝是不同层面，须核对实际输出 |
| CLIENT-D01 / D02 / D03 | 首版视图形态、插槽与安装方式 | 用户决定体验取舍；工程验证服务及界面适配成本 |
| CLIENT-D04 | 目标部署实际 client 组合图 | 工程绑定实际安装工件与组合，源码版本号不能代替 |
| DEP-O01–DEP-O07 | 人事权、人格、跨部门协作、知识保留及审计组织 | 沿用 02-company-contract.md 既有待决，不在本稿重作裁决 |
| 现有交付选择 | 本地 tgz 或正式包发布、swarm fork 或参考迁移 | 先给可复现候选与公开接口证据，再由用户确定交付方式 |

DRAFT-D02 的语义已在 §3.3 明确为技术建议；C-1–C-11 的用词和顺序按 §3.4 统一。ORG-13 正文及 ORG-A09/A10 已确认，落点在 SOLO-F09、SOLO-ACC-07/08；剩余的是产品实现与验收证据，不是需求待决。

## 附录 A · 修订依据与稳定 ID

本表记录文档结论的更正边界；不记录成员进度、待办数或运行状态。各规则的完整正文留在指名章节。

| ID | 问题或归一化 | 正文处置 |
| --- | --- | --- |
| A1 | 用户来源与团队建议混淆 | SOLO-R01–03 保留原来源；5 包经后续委托成为 ARCH-D02 技术约束，不能倒写成此前用户已逐项确认 |
| A2 | 证据与交付标签混用 | 静态代码阅读为〔源码事实〕，验收设计为〔建议〕+〔提案〕；不提供运行通过结论 |
| A3 | 重复机制扩张为不同保证 | 同实例 open 正文在 §7.2，fence 在 §7.10，数据根在 §6.10，回滚在 §8.5；第 11 章只定义验收 |
| A4 | 章级契约与成员交稿状态重复 | 阅读契约统一于第 1 章；原动态组装表改为阅读路径 |
| A5 | 不同 home 与源码基线混用 | 附录 B 分开默认源码、历史部署观察与公司候选；未访问实际 home 不写新实测 |
| A6 | 三份互斥 bundles 顺序 | 统一候选到 SOLO-C01，最终装配层放最后覆写既有行；移除“新包只能追加”，其余位置只引用 |
| A7 | 源码说明与目标运行证据不同 | 保留每种证据的边界；代码路径不等于实际激活、冷启动或故障注入 |
| A8 | 第 7 章的“已确认边界③”无对应来源 | 归入 DRAFT-B05 的技术判据，保持〔建议〕 |
| A9 | PKG-01 同时拟作替代决策与建包判据 | PKG-01–03 只指新增持久业务状态包判据；不据此宣布 SOLO-A01 已被取代 |
| A10 | 术语冲突与技术候选迟迟未收敛 | C-1–C-11 按 §3.4 给出一致用词，不升格业务决定 |
| A11 | ORG-13 被误记为缺口 | 引用现有 §11.9、ORG-A09/A10，正文承接 SOLO-F09，验收细化 SOLO-ACC-07/08；取消“待交稿”前置 |
| A12 | 5 包与 core/adapter 合包两种候选 | ARCH-D02 选择 5 包边界及统一交付；包数不证明故障隔离，真实行为仍验收 |
| A13 | already-open 被外推为跨进程保护 | 纠正 TERM-07、MECH-05、R2、WA-F1/F2、SOLO-ACC-02/CE-F；新增 SOLO-FENCE-01、SOLO-ACC-09，并记录现有 lease 候选及提交点接线缺口 |
| A14 | 切 profile 被外推为状态回滚 | SOLO-DATA-01–04 固定数据根含义，SOLO-ACC-06 分开装配兼容回退与一致检查点恢复；不承诺一次改参数完成恢复 |
| A15 | vendor/include/src/index.ts:77 被指为空行 | 2026-09-16 复核 DSH_CHECKOUT 文件共 377 行，:77 为 patch 循环；保留正确引用，证据仅说明配置遍历 |
| A16 | 已确认首片门槛被列成可降级待决 | §11.8 区分已有结果要求与技术测试编排；ORG-06/13 等不能被降级 |

## 附录 B · 证据基线与符号环境名

正文只用符号名；机器本地绝对路径、home 真值与瞬时进程细节一律按[环境定位与运维交接](operations/environment-handoff.md)写入本机记录，不进正文（SOLOIP-DOC-001 §6）。各章引用「附录 B 第 N 项」时指向本表；表内历史观察不能代替本次动作所需的最新环境核实。

| # | 符号名 / 基线项 | 含义与已证边界 | 标注与日期 |
| --- | --- | --- | --- |
| 1 | 仓库内权威 | SOLOIP-DOC-001（格式）、project-binding.yaml、document-registry.yaml、AGENTS.md、docs/architecture.md（SOLO-ARCH）；基线提交 3f30ebaf3788f9a1a4c7bda63ad54135deadec31 | 〔源码事实〕仓库内文件，2026-09-15 建立（binding 记录） |
| 2 | PROFILE-55120 | 端口 55120 实际使用的运行数据根与其 profile：swarm 0.1.5、patchReload 为 live、bundles 为 dsh-base + dsh-web-app + dsh-agent-swarm、依赖来自 freeze-20260915-reteam 下的 tgz（swarm 0.1.5、rlm 0.0.0）；是否存在 profile 级 lockfile 未读取 | 〔源码事实〕队长实测 2026-09-15；本文与 backend-hy4、qa-hy4 均未独立复核该 home → 引用它的运行时结论一律保持〔未验证〕。**实际生效版本属动态状态，权威在原生任务系统**（binding.liveStatusInCommittedMarkdown: forbidden） |
| 3 | DSH_CHECKOUT | DSH 源码工作树：根包 0.1.5-rc.2、HEAD c291e7961a515f6d7af9304e7fd1d257929aef26；同 checkout 内 dsh-agent-swarm 为 0.1.4；工作树含既有修改，不能当官方纯净发布包（docs/architecture.md §9） | 〔源码事实〕多名成员 2026-09-15 静态只读；**未做启动/故障注入验证** |
| 4 | DSH_HOME_OTHER | 历史报告提及的另一 home：swarm 0.1.0、web/web-rc2 profile 及 link 挂载；早期曾误归属为 55120，后被更正。本机交接尚未定位该实例与原始回执 | 〔未验证〕2026-09-15 历史转述，保留为来源线索；不得将它当作独立可复验的机制证明或 PROFILE-55120 证据。机制应引用指名源码，实例结论需补证 |
| 5 | REFACTORING_DOCS_ROOT | 重构文档入口（README + 01-departments.md + 02-company-contract.md + 03-delivery-and-acceptance.md + 04-avatar-64.md）；解析路径按 ENV-02 核实。用户裁决 2026-09-15：当前开发、修复与验收以重构文档为准 | 〔约束〕文档正文；条目 ID 见 4.4 |
| 6 | 旧插件候选基线 | repair-release 与 company-core 两个 worktree：前者独有 avatar-preference.ts、team-recovery.ts，后者独有 organization-*.ts、delivery-evidence.ts；曾记录 git merge-base --is-ancestor 单方向退出码 1；该结果只证明该方向不是祖先，分叉关系需双向核对；两者声明同一个 team domain（team-spec.ts:346） | 〔源码事实〕backend-deepseek 核对（日期随其邮件，2026-09-15/16）；D3 待决未解 |
| 7 | Team 公开记录（用户来源） | public-97c9d584（2026-09-15 15:42:51Z）、public-082313dc（15:46:11Z）、public-74132fa8、public-a6e12b45（15:57:18Z，队长综合与 5 项裁决清单）、public-45c5f8fa（16:00:58Z） | 〔需求〕来源条目见 4.2；队长综合结论本身不构成用户确认 |
| 8 | 本文自身 | SOLO-TECH-ARCH，登记为技术设计基线；原草稿身份由 DRAFT-D01 接续 | 决策状态见 §1.4，产品运行交付仍为〔提案〕 |
| 9 | COMPANY_CORE_CHECKOUT | 复用候选的位置按 ENV-02 定位；本轮 HEAD 4c6d05ef30452df2b7adbfb24d625aef4e58f239。仅作为源码候选，不等于已安装版本；本轮引用文件的哈希与 Git 核验结果在本机交接回执保留 | 〔源码事实〕2026-09-16 复核 writer lease/store、company-stack/config/apply、organization-assets/admission/departments；这些已核文件无已跟踪修改。范围见 §7.9、SOLO-FENCE-01；未执行产品验收 |
| 10 | 本次直接复核 | ORG-06/13 与 ORG-A03/A09/A10；DSH 的 domain facility、JSON 原子写与默认根、home/profile 解析、include patch 循环；DSH HEAD 与第 3 项一致 | 〔源码事实〕2026-09-16；源码与需求文本检查，未启动服务或运行故障场景 |

通用判定约定（适用于 SOLO-ACC-01–10 与 SOLO-ACC-CE-A…I）：

- 每条场景写成 **起点 → 动作 → 可观察结果**（通过与失败各一条），不写「应能正常工作」。
- 通过判定必须可由**不修改任何代码**的观察者复现：命令输出、退出码、日志行、状态文件内容。
- 任何场景只要未实际执行，交付标签只能是〔提案〕；执行后按实际结果改为〔已验证〕并写明执行边界（哪个 profile、哪个 DSH 版本、哪次运行）。
- 规则写法遵循 actor + trigger/precondition + action + scope + outcome；正确性相关补 authority / failure-recovery / verification。
- 动词统一：必须（MUST）/ 应当（SHOULD）/ 可以（MAY）。
