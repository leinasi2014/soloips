# SoloIPs 架构草稿：交付形态、装配与边界

## 1. 阅读契约

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | SOLO-ARCH-DRAFT（提案 ID；是否登记为独立文档或并回 SOLO-ARCH 见 DRAFT-D01） |
| 文档状态 | 〔提案〕评审修订稿；文档复核不构成用户确认、产品验收或实施许可。不替换 [架构关系与首版交付](architecture.md)（SOLO-ARCH），也不替换重构文档正文 |
| 读者 | 智能体优先（documentation.primaryReader: agent）；人类可读靠结构而非叙事 |
| 目的 | 收敛「DSH 为基础设施，SoloIPs = 一组插件包 + 一个 profile」这一交付形态：包清单与边界、装配与 patch 机制、事实归属、失败与恢复、验收合同、待决项 |
| 范围 | 交付形态与包边界；装配、profile 与 patch 组合契约；分层/回归/回滚；客户端组合与业务事实分离；失败与恢复；验收场景与反例；待决项。**不含**产品 PRD、PV 创意与制作参数、包内领域建模正文、实现进度、运行版本台账 |
| 决策状态 | 标〔需求〕者必须有用户来源（见 4.1、4.2）。各章技术结论为〔建议〕；**智能体之间达成一致不构成确认** |
| 证据范围 | 仓库文档、DSH 源码、历史团队转录分别标注；沿用而未复核的观察不升格。packages/...、apps/...、vendor/... 默认相对 DSH_CHECKOUT；dsh-agent-swarm/src/... 相对 DSH_CHECKOUT/packages/.external；company-core/... 相对 COMPANY_CORE_CHECKOUT；重构文档相对 REFACTORING_DOCS_ROOT，解析见附录 B。DSH 与项目同名 docs/architecture.md 须区分 |
| 交付状态 | 整篇〔提案〕。本文不提供产品〔已实现〕〔已验证〕〔已集成〕结论；第 11 章为验收设计，不是运行结果 |
| 依据 | 格式：SOLOIP-DOC-001 [SoloIPs 文档格式规范](governance/agent-readable-documentation.md)。权威与边界：[项目绑定](governance/project-binding.yaml)、[文档注册表](governance/document-registry.yaml)、[项目指令](../AGENTS.md)、[架构关系与首版交付](architecture.md)、重构文档入口（用户裁决 2026-09-15：当前开发、修复和验收一切以重构文档为准） |
| 变更权 | 产品负责人（用户）。本文按「唯一文件写者」组装（documentation.sharedAuthorityWriterCount: 1）；审查通过前不得作为实施依据 |

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

- 装配、安装、启用 ≠ 实际被调用（activation-is-invocation）。
- 构建成功 ≠ 产品验收（build-success-is-not-product-acceptance）。
- 文件写入成功 ≠ 停止重启后能读回；文件存在 ≠ 内容有效；「未报错」≠「配置正确」。
- --dump-config 通过 ≠ 功能可用；patchReload: live 下的运行态 ≠ 重启后仍然如此。
- 一个环境（55120）通过 ≠ 普遍兼容；另一个 home 的真实实例不蕴含 55120 同样如此。
- 客户端能渲染一条业务行 ≠ 该业务事实由客户端拥有；持有 ≠ 可访问。
- 成员邮件结论一致 ≠ 用户确认；队长综合结论 ≠ 用户确认。
- 本文记录了某条规则 ≠ 该规则已实现、已验证或已集成。

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

- 交付形态与包清单的候选边界（术语与判据在本文，规则正文在各技术章）。
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
| 修改宿主源码、服务配置、凭据或既有权威文档 | AGENTS.md 红线；本次交付只写本文一个文件 |
| 微服务集群、第二套调度器、向量库等预留设计 | docs/architecture.md §6：需要它们时应有业务量或功能证据 |

### 2.4 单一权威与合并路径

本文按 SOLOIP-DOC-001 §7 不新建同题权威：

- 产品分层、数据归属、首版范围与切片顺序以 docs/architecture.md（SOLO-ARCH）为准；本文只写指针。
- 部门、资料室、员工生命周期、入职准入、头像等要求以 REFACTORING_DOCS_ROOT 正文为准；本文只写 ID 指针，见 4.4。
- 文档格式与标注以 SOLOIP-DOC-001 为准。
- 本文内部同样要求单一正文：各章重复陈述同一机制处登记于附录 A3，定稿前必须合并为一条正文并按 §3 保留 ID 取代关系。

〔待决 DRAFT-D01〕本草稿审查后的落点：(a) 并回 docs/architecture.md 新章节；(b) 登记为 document-registry.yaml 中的独立文档身份；(c) 只作为一次性评审材料丢弃。责任人：队长 + 用户。**在决定前，本文不进入注册表，也不主张任何权威。**

## 3. 术语与边界

本章是本文用词的唯一正文。术语表来自 docs-glm 的审查稿（2026-09-16 邮件），由写者按 SOLOIP-DOC-001 §2 调整标注维度后并入；术语冲突的定稿权在队长与用户（见 3.4）。

### 3.1 术语表

| ID | 术语 | 一句定义与用词规则 | 标注与来源 |
| --- | --- | --- | --- |
| TERM-01 | 插件包 | DSH「Everything-is-a-plugin」体系中的能力交付与安装单元；SoloIPs 交付形态 = 一组插件包 + 一个 profile。用词：交付单元语境中文一律「插件包」，不用「包/插件/扩展」混指；指具体单元时写包名 | 〔约束〕用户 2026-09-15 交付形态要求（见 4.2 SOLO-R02）+ 官方微内核表述 |
| TERM-02 | bundle | dsh.profile.bundles 的条目；该数组决定 bundle patch 层的叠加序，之后另有 profile/home/launcher 层；服务激活不由数组位次保证 | 〔源码事实〕SOLO-C01/C02、§6.1 |
| TERM-03 | profile | 声明 bundles 数组与部署设置的 DSH 装配清单；只负责组合依赖与部署设置，不是状态权威 | 〔约束〕承接 docs/architecture.md §6 既有表述 |
| TERM-04 | 层（包职责标签） | 对插件包职责的文档性标签（装配层 = soloips-bundle、唯一状态包 = soloips-core、可丢弃层 = soloips-web），**无 DSH 运行时语义、不承载加载顺序**；soloips-tools-pv 的标签为「不 open domain」（含义见 DRAFT-D02），adapter 包的层标签待定稿 | 〔建议〕定稿权在队长/用户（TERM 冲突 C-5） |
| TERM-05 | patch | 对配置文件中带行 id 的行执行的整行替换操作，非深合并 | 〔源码事实〕SOLO-C03 |
| TERM-06 | 行 id | 配置行在 patch 机制中的稳定定位标识；patch 按「行 id → 整行替换」定位 | 〔源码事实〕SOLO-C03、SOLO-C04 |
| TERM-07 | domain | DSH 持久化的命名状态域；同一 DomainFacility 实例内每个 domain name 只允许一个 opener；跨实例或跨进程独占另见 SOLO-FENCE-01 | 〔源码事实〕packages/storage/storage-domain/src/index.ts:65-72、103-107；基线附录 B 第 3 项 |
| TERM-08 | 写权威 | 某类事实的唯一合法写入来源；首版建议由 soloips-core 持有业务写入口，其余包只读或经命令服务请求写入。不与人或角色的 owner 混用 | 〔需求〕ORG-06 要求实际独占；〔建议〕包归属见第 7 章 |
| TERM-09 | 投影 | 由权威事实派生的只读视图（界面列表、计数、AGENTS.md 之于 project-binding.yaml）；投影不回写、不是第二事实来源，与 document-registry 的 role=projection 同义 | 〔约束〕引用 document-registry，不重抄定义 |
| TERM-10 | 装配 | DSH 组合配置并按服务依赖激活插件的过程；bundle 层按数组叠加不等于插件顺序启动 | 〔源码事实〕SOLO-C01/C02、SOLO-F02/F04 |
| TERM-11 | 组合 | 一次交付所选插件包 + profile + 版本锁定的静态构成清单；**组合是清单、装配是动作，不得互换** | 〔约束〕本文用词规则 |
| TERM-12 | 验收基线 | 验收结论绑定的指名版本组合（宿主、各插件包版本、公开 API、安装包及 DSH_HOME/patchReload 等配置）；基线外不得外推结论。统一用「验收基线」，旧稿「验收组合」为被取代同义词 | 〔约束〕SOLOIP-DOC-001 §6 |
| TERM-13 | append | dsh plugin add 只追加、不改既有行、无排序语义 | 〔源码事实〕SOLO-C01 依据 2 |
| TERM-14 | 回滚 | 恢复指定装配或状态检查点：装配回退须证明状态兼容；状态回退须有一致恢复点及明确的数据处置 | 〔建议〕SOLO-ROLLBACK-02、SOLO-ACC-06；默认根见 SOLO-DATA-01 |
| TERM-15 | 底座 | 宿主运行时基础设施统称，本项目 = DSH 及其公开扩展点；旧稿「DSH 执行底层」为被取代同义词 | 〔约束〕用户 2026-09-15「DSH 是基础设施」（见 4.2 SOLO-R01） |
| TERM-16 | 单包失败 | 须区分 bundle 解析、Loader 挂载、缺依赖 pending、客户端激活/稳态；不得从“某包出错”一概推出整个 profile 无法启动 | 〔源码事实〕SOLO-F01/F02/F04/F06；CLIENT-03 |
| TERM-17 | 状态包 | open domain 持有持久状态的插件包；soloips-core 是唯一状态包 | 〔建议〕归属正文见第 5、7 章 |

### 3.2 候选插件包清单与边界词表

包清单是〔建议〕（来源与状态见 4.2 DRAFT-S02）。**正式边界以实际调用和状态归属为准**（docs/architecture.md §6）。本节只给术语与判据，包职责的可执行规则归第 5、6、7 章。

| 候选包 | 一句话职责（〔建议〕） | 是否 open domain | 规则正文 |
| --- | --- | --- | --- |
| soloips-bundle | 装配层：组合依赖、profile 与 patch；唯一允许覆写官方行的包 | 否 | 第 6 章（SOLO-C01–C07） |
| soloips-core | 唯一状态包：company + collaboration + artifacts + ip，内部按模块分目录，不拆包 | 是（唯一） | 第 5 章 5.1、第 7 章 7.4 |
| soloips-adapter-dsh | 官方 seam 适配层，收敛所有 @deepseek-ai/* import | 否（第 5 章 5.1） | 第 5 章 5.1、第 7 章 |
| soloips-web | 可丢弃视图层，client 注入 | 否 | 第 8、9 章 |
| soloips-tools-pv | 制作工具 job，写 core 的 artifact domain | 否（含义见 DRAFT-D02） | 第 6 章 + 第 5 章 5.1 |

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
| C-2 | 5 包候选见 DRAFT-S02；PKG-01–03 专用于新增持久业务状态包判据 | 〔建议〕不将 SOLO-A01 标为已取代，不复用 PKG-01 作取代 ID |
| C-3 | 统一用 TERM-12“验收基线” | 〔约束〕本文术语 |
| C-4 | 工作台是用户入口；soloips-web 是候选实现包；DSH Web 是宿主界面 | 〔建议〕分别保留 |
| C-5 | 职责层不决定包数或启动顺序 | 〔建议〕旧产品分层仍有效 |
| C-6 | 投影消费权威事实，不另建可写权威 | 〔约束〕沿用 SOLO-A02 |
| C-7 | DSH 基础设施统一称底座 | 〔需求〕SOLO-R01 |
| C-8 | patch、append、回滚、行 id 使用 TERM-05/06/13/14 | 〔约束〕本文术语 |
| C-9 | 源码基线与部署观察分开记录 | 〔约束〕附录 B |
| C-10 | 含 core 的完整候选顺序只在 SOLO-C01 定义；5.4、SOLO-LAYER-01 引用它 | 〔建议〕最终装配层覆写此前插入的行；不升格为用户确认 |
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

用户原话（Team 公开记录，作者 local-operator）已直接确立底座关系与交付形态；把功能**拆成哪几个插件包、怎么组合**是用户要求团队研究的问题，其结论仍是候选。

| ID | 陈述 | 决策 | 来源（可核对） |
| --- | --- | --- | --- |
| SOLO-R01 | DSH 是基础设施；SoloIPs 的功能以插件形式组合在其上 | 〔需求〕 | Team 公开消息 public-97c9d584（2026-09-15 15:42:51Z，local-operator） |
| SOLO-R02 | SoloIPs = 一组插件包 + 一个 profile，从 DSH 基础设施上组合起来；用户同时要求研究「如何拆分插件、优化组合方式」并先整理核心包 | 〔需求〕 | public-082313dc（15:46:11Z）、public-74132fa8（「先把核心包给我整理出来」） |
| SOLO-R03 | 先落实一份架构草稿文档，按规范执行，队长与 QA 都要审查 | 〔需求〕 | public-45c5f8fa（16:00:58Z）；本文即该要求的交付物，交付状态仍为〔提案〕 |
| DRAFT-S01 | 「SoloIPs 自身为主」的精确措辞（底座归 DSH、业务事实归 SoloIPs） | 〔建议〕 | 队长对成员意见的综合表述（public-27fd2c06，2026-09-15 15:44:07Z 前后，4/4 选路线 B）；**用户原话只说「DSH 是基础设施」**，故本条不得标〔需求〕 |
| DRAFT-S02 | 5 个插件包清单（3.2）与锁定顺序（SOLO-C01） | 〔建议〕 | 队长综合 public-a6e12b45（2026-09-15 15:57:18Z，5/5 成员一致）；成员一致不构成确认；该消息本身列明「需要用户裁决」的 5 项 |
| DRAFT-S03 | soloips-core 是唯一状态包；soloips-web 是可丢弃层 | 〔建议〕 | 判据 DRAFT-B01/B02/B05；归属正文见 5.1、7.4 与 CLIENT-09 |

- **复合陈述拆分**：SOLO-R01/R02 是用户确立的；「拆成 5 个包」不是。二者不得合并成一条〔需求〕。
- 反面声明：队长公开结论、成员 5/5 一致、本文或任一章的〔源码事实〕，都不构成交付形态的用户确认；交付形态的包数量取舍仍是用户的裁决项（见 12.1）。

〔待决 DRAFT-D03〕DRAFT-S01/S02/S03 是否作为 S0 的实施边界提交用户确认。责任人：队长 + 用户。

### 4.3 装配机制事实（集中登记，便于一次性复核）

第 6、10 章给出正文与源码行号；本节只做集中索引，避免同一机制在多章各写一份（SOLOIP-DOC-001 §7）。基线见附录 B。

| ID | 陈述 | 证据标注 | 正文/反例 | 对交付形态的直接影响 |
| --- | --- | --- | --- | --- |
| MECH-01 | bundles 决定 bundle patch 层序；层内 patch 依列表遍历；其后还有 profile/home/launcher 层；服务激活依赖就绪情况 | 〔源码事实〕§6.1、SOLO-C02 | SOLO-C01、SOLO-ACC-CE-A | 配置覆盖序与服务激活先后分别验收 |
| MECH-02 | patch 是整行替换，不是深合并；被替换行的 config 必须整行重述 | 〔源码事实〕（同上） | SOLO-C03；SOLO-FAIL-01、SOLO-FAIL-10、CLIENT-F03、CLIENT-X06 | 静默丢字段风险；覆写官方行必须整行重述 |
| MECH-03 | dsh plugin add 只 append，无排序语义 | 〔源码事实〕（同上） | SOLO-C01 依据 2；SOLO-FAIL-03；SOLO-LAYER-02 | 插入位置需靠 patch 行写入，装配不能靠安装顺序 |
| MECH-04 | DSH 不提供跨包事务 | 〔推断〕+〔未验证〕：qa-hy4 未取得正面源码证据，检索无结果不等于证明不存在；队长公开结论把它表述为事实 | SOLO-ACC-CE-G（保持〔提案〕）；DEP-D05、ORG-07 | 多域写入不承诺共同原子提交；实现阶段必须重核（DRAFT-D05） |
| MECH-05 | already-open 只拦截同一 DomainFacility 实例内的同名 open；默认 JSON 后端无跨进程写锁 | 〔源码事实〕2026-09-16 复核，storage-domain/src/index.ts:65-72、103-107；storage-json/README.md:142（均位于 packages/storage/） | §7.2、SOLO-FENCE-01、SOLO-ACC-02/09；ORG-06 | 同实例 open 与跨 Host 独占分别验收；缺少后者不能启用公司写入 |
| MECH-06 | bundle 无法解析或缺少声明时组合失败；挂载错误、pending 与客户端稳态另有边界 | 〔源码事实〕解析路径，运行影响待目标验证 | SOLO-F01/F02/F04、CLIENT-03 | 按实际阶段评估失败范围，不由包数推导全部结果 |
| MECH-07 | dsh plugin 无回滚（就地写 manifest，无快照） | 〔源码事实〕（同上） | SOLO-F07；SOLO-ACC-06；SOLO-ACC-CE-D；SOLO-ROLLBACK-01/02/03 | 装配与状态分别恢复；数据根、兼容性与一致检查点见 SOLO-DATA-01–04、SOLO-ACC-06 |
| MECH-08 | 升级后包丢失 dsh.bundle 声明会被静默移出 bundles（profile 照常启动、功能消失） | 〔源码事实〕（同上） | SOLO-F05；SOLO-ACC-CE-E；SOLO-FAIL-04 | 必须用生效树核对，不能只看 bundles 数组（SOLO-REG-04） |
| MECH-09 | patch 目标行不存在只告警不阻断；用户层最后写赢 | 〔源码事实〕（同上） | SOLO-F06；SOLO-FAIL-02；SOLO-ACC-CE-C；SOLO-REG-Q5 | 退出码 0 不代表组合正确；patch 告警应按错误处理 |
| MECH-10 | patchReload: live 下磁盘组合与进程组合可分离 | 〔源码事实〕（同上）；55120 实际取值见附录 B | SOLO-F08；SOLO-ACC-05；SOLO-ACC-CE-H | 直接冲击 S0「写入→停止→重启→读回」验收口径 |

〔未验证 DRAFT-D04〕各阶段失败范围见 TERM-16、MECH-06、SOLO-F02 与 CLIENT-03；组合解析、Loader 挂载、客户端激活及稳态须分别核对，具体目标运行表现待 S0 验证。

〔待决 DRAFT-D05〕MECH-04（无跨包事务）的标注分歧：队长公开结论按事实表述，qa-hy4 标注为推断且未取得正面证据。责任人：backend-deepseek（第 5、7 章）、qa-hy4。

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
| AVATAR-64-01–AVATAR-64-05 | 仅原生 64、偏好、读写与展示一致性、提示词与反例要求 | 04-avatar-64.md | 入职必需项不降为可选（→ ORG-03）；AVATAR-64-01 的「先存文本资料、回读、再生成头像」顺序在本文作者装配自身头像时已被实证可行 |
| — | 纵向交付顺序、缺项反例、候选集成与实际安装验收 | 03-delivery-and-acceptance.md | 第 11 章验收合同的现行正文；SOLO-REG-04 的〔需求〕来源 |

〔推断〕上表中 DEP-D/R/A/O 按 02-company-contract.md 章节含义归类；具体条目及决策状态以来源正文为准。

### 4.5 项目红线（〔约束〕）

来源：docs/governance/project-binding.yaml 的 redLines 与 AGENTS.md 项目红线。

| 红线 | 对本文形态的直接后果 |
| --- | --- |
| 用户是产品目标与最终验收的唯一决定者 | 4.2 的形态候选必须由用户裁决（包数量、patchReload、profile 名、发布形态、与 swarm 的关系） |
| 上游 API 鉴权、额度、QPS、连接或流中断错误：首次发现立即停止受影响动作并通知用户；不自动重试、不换路由、不归档、不删除、不批量取消 | SOLO-F09、SOLO-ACC-07/08 承接 ORG-13；外部通知占位不阻塞站内停线 |
| 不改凭据、不启新服务、不开原生 Windows 终端或目录选择窗口 | 本文所有核对均为只读；55120 的部署不因本文改变 |
| 不修改既有权威（本次只写本文一个文件） | 注册表登记动作待 DRAFT-D01 决定后由获授权者执行 |
| 安装启用 ≠ 实际调用；构建成功 ≠ 产品验收 | 所有「可用」陈述必须区分装配、调用、验证三层（SOLO-REG-04、第 11 章） |
| 未获用户明确授权，不开展产品实现 | 本文与各章只产出文档候选 |

### 4.6 版本与运行环境基线

为避免同一事实在五章各写一遍且互相矛盾，版本与 home 观察统一收在**附录 B**；各章只引用「附录 B 第 X 项」。〔约束〕一个环境通过 ≠ 普遍兼容；记录版本号 ≠ 已验证兼容；工作树含既有修改，不能当作完全干净的官方发布包（docs/architecture.md §9）。

## 5. 包清单与职责

作者：backend-deepseek。本章范围：包级边界与状态归属；包内模块划分见第 7 章；业务对象字段定义不在本章。本章依据：SOLO-A01（独立产品仓库 + 插件与 Profile 组合）、第 7 章状态归属与写权威。本章证据：组合机制为〔源码事实〕（app-boot、bundle patch 头注释）；包划分为〔提案〕。

### 5.1 包清单（5 个）

〔建议〕首版收敛为 5 个包。每包是否 open domain 必须显式声明；§7.2 的同实例唯一 opener 不替代 SOLO-FENCE-01 对真实写路径的跨进程保护。

| 包 | 职责 | 状态归属 | 依赖方向 | 是否 open domain |
| --- | --- | --- | --- | --- |
| soloips-bundle | 装配层：携带 dsh.bundle.patch，以有序 patch 叠加定义首版组合；不含运行时代码 | 无业务状态（仅装配声明） | 被 profile 引用；不依赖其它 SoloIPs 包 | 否 |
| soloips-core | 唯一状态包：Team 聚合（成员/任务/尝试/消息/预算/目标/记忆）、组织与准入、资料室、IP 业务对象 | **全部可写业务状态的唯一归属** | 依赖 soloips-adapter-dsh；被 soloips-web、soloips-tools-pv 经服务消费 | **是（唯一 opener）** |
| soloips-adapter-dsh | 适配层：把 DSH 官方 seam（storage-domain、subagent、session、tools、events）包装为 SoloIPs 内部接口 | 无自有业务状态；不持有权威 | 依赖 DSH 官方包；被 soloips-core 依赖 | 否 |
| soloips-web | 界面层：工作台读投影与交互（首版复用 DSH Web 插槽） | 无权威；仅消费投影 | 依赖 soloips-core 的只读服务 | 否 |
| soloips-tools-pv | PV 制作工具适配：提交生成请求、保存 jobId、查询、取回结果与失败信息 | 不持有业务权威；外部 jobId 与结果按第 7 章由 core 落库 | 依赖 soloips-adapter-dsh；经服务回写 core | 否 |

〔建议〕首版由 soloips-core 统一持有业务 domain。〔源码事实〕现有 dsh-agent-swarm 在同一包内打开多个 domain，见 src/storage/team-spec.ts:346、member-private-memory.ts:98、workflow-run-overlay.ts:79 与 src/human/human-interaction-store.ts:194（附录 B 第 3 项）。这些调用不证明跨进程独占。

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

C-10 的候选顺序按 SOLO-C01 统一；后续修改须同步验收基线。

〔源码事实〕patch 是**整行替换而非深合并**：packages/bundle/base/cordis.patch.yml:6-7「A patch replaces the targeted row's whole config rather than merging into it」；packages/bundle/web-app/cordis.patch.yml:5-6 同义重述。

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

### 6.2 唯一候选 bundles 顺序（SOLO-C01）

**〔建议〕** dsh.profile.bundles 的首版完整候选如下。包数量仍属 DRAFT-S02；此顺序不代表用户已批准实施。

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

### 6.4 patch 是整行替换，不是深合并（SOLO-C03）

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

**〔源码事实〕** 版本约束**不被运行期强制**：packages/util/package-manifest/src/types.ts:39-49，engines.dsh 的注释明确写「DSH compatibility is declarative until a reader enforces it」；作者在 packages/ 下检索 engines.dsh 的读取点命中数为 0。即：**写 engines.dsh 不会阻止不兼容组合启动。**

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

**〔建议〕** SoloIPs 使用独立 profile 名（建议 soloips），不复用 web。理由：web 属于内置模板，其 bundle 列表可能被 normalizeShippedProfile 写回；且 patchReload 默认 live（profile.ts:112-113）。独立名可用 --from-default-profile web 一次性复制模板（apps/cli/src/profile-boot.ts:104-154，只复制模板 bundle 列表与 patchReload，不复制源 profile 的本地装配文件；同 home 默认仍共享业务状态，见 SOLO-DATA-01）。

**〔待决〕** profile 最终名、以及是否允许同一台机器并存 soloips-dev 与 soloips，需用户确认（并入 12.1，与队长公开结论 public-a6e12b45 第六节裁决项 3 合并）。

### 6.9 本章稳定 ID 汇总

| ID | 内容 | 状态 |
| --- | --- | --- |
| SOLO-C01 | 唯一候选 bundles 顺序与新增包校验 | 〔建议〕（顺序正文只在 §6.2） |
| SOLO-C02 | yml 行序无加载语义 | 〔源码事实〕 |
| SOLO-C03 | patch 整行替换，非深合并 | 〔源码事实〕 |
| SOLO-C04 | 行 id 前缀 + 单行单写者 | 〔建议〕 |
| SOLO-C05 | profile 三件套入 git 与版本锁落点 | 〔建议〕 |
| SOLO-C06 | --dump-config 作为组合回归门禁 | 〔建议〕 |
| SOLO-C07 | 独立 profile 名策略 | 〔待决〕 |

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

**SOLO-DATA-02〔建议〕最小环境规划。** 一个交付 profile 可部署到不同 home；验证用 home 不改变 SOLO-R02 的产品交付形态。

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

作者：backend-deepseek。本章范围：写权威归属、原子边界、必须同包清单、判定规则 R1–R4、跨域一致性范式、ORG-05 占用裁定。本章依据：SOLOIP-DOC-001、DEPT/LIB 与 DEP/ORG 重构要求、本轮架构论证。本章证据：基线为 DSH_CHECKOUT（根包 0.1.5-rc.2，HEAD c291e7961a515f6d7af9304e7fd1d257929aef26）与 packages/.external/dsh-agent-swarm 0.1.4；company-core 候选为独立 worktree。机制部分为〔源码事实〕；R1–R4 与包划分建议为〔建议〕；ORG-05 裁定为〔建议〕并标出需用户裁决点。

### 7.1 核心命题：原子更新绑定 domain handle 内的单次记录操作

〔源码事实〕packages/storage/storage-domain/src/domain.ts:82-89 把 update(key, fn) 定义为 domain 写链上的单条记录原子读改写；fn 读取其排队槽位的当前值。该性质绑定同一 domain handle，不代表多记录共同事务或跨进程互斥。

〔推断〕该原子性**只覆盖单个 domain**。作者本次核查未发现 storage-domain 提供任何跨 domain 事务 API；跨 domain 写入各自排队于各自写链。

〔建议〕需要同次提交的字段应保留在同一记录的 update() 内；首版由 core 统一持有其 domain。跨表或多次 put 即使同包、同 domain，也不能据此宣称共同原子提交。

〔反面声明〕拆包不蕴含更安全；包边界不等于事务边界；包边界也不等于写权威边界。

### 7.2 同一 facility 实例内的唯一 opener

〔源码事实〕packages/storage/storage-domain/src/index.ts:65-72 明确每个 DomainFacility 实例持有自己的 domains Map 与 reserved Set；:103-107 在该实例中检查 spec.name，重复调用抛 DomainError('already-open')。

〔源码事实〕packages/storage/storage-json/README.md:142 明确无跨进程写锁；src/atomic.ts:24-35 的随机临时文件创建与 rename 是整文件替换，不是目标数据根的跨进程独占。

**边界**：同一 facility 内，不同包或同包的第二次同名 open 会被拒；另一个 facility、进程或 Host 不共享此 Set。异名 domain 也可能重复保存同一业务事实。命名边界、包边界与 ORG-06 所要求的真实存储独占须分别说明；跨进程设计见 SOLO-FENCE-01，验收分别见 SOLO-ACC-02/09。

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

### 7.9 待决与需用户裁决

〔待决 DRAFT-D07-D1〕**拆包粒度**：现有插件把多个 domain 放在一个包内，同实例命名隔离见 §7.2；实际存储独占另见 SOLO-FENCE-01。拆成多包的主要收益是**可独立发布**，代价是跨包栅栏与加载顺序管理。是否值得，需用户裁决（与队长公开结论裁决项 1 合并）。

〔待决 DRAFT-D07-D2〕**组织域是否分包**：直接决定 7.7 裁定的落地形态（同包 = 由 soloips-core 单一 opener 持有；分包 = 必须为占用权威设计跨包栅栏）。

〔待决 DRAFT-D07-D3〕**agent_swarm domain name 的最终 owner**：〔源码事实〕repair-release 与 company-core 的 src/storage/team-spec.ts:346 声明**同一个** team domain，历史报告称二者分叉（单方向 git merge-base --is-ancestor 退出码 1 只证明该方向非祖先，完整关系待双向核对；前者独有 avatar-preference.ts、team-recovery.ts，后者独有 organization-*.ts、delivery-evidence.ts）。两个包若通过同一 facility 打开同名 domain 则 already-open；另造 facility/Host 不在该保证内。仍须指定唯一业务写入口并保护其实际介质。

〔未验证〕company-core 的 getEmployeeOnboardingGaps（src/domain/organization-assets.ts 附近）是否满足 ORG-03 完整准入、以及 ORG_ALLOW_LEGACY_UNBOUND 是否已移除，本次未逐条复核，实施前须验证。（写者注：docs/architecture.md §4 已把同两条缺口记为「必须在正式业务入口启用前修正」，两者一致，不构成本文内的冲突。）

〔反面声明〕本章描述的是**写权威归属**，不蕴含「已实现」。所有 soloips-* 包均为〔提案〕，尚无代码；现有证据来自 dsh-agent-swarm 0.1.4 与 company-core 候选，**不等于** SoloIPs 已具备这些性质。

### 7.10 跨进程 fence 落点（SOLO-FENCE-01）

**〔需求〕** ORG-06（02-company-contract.md:223）要求规范化存储身份上的真实独占或等价 fencing：第二 Host 被拒，失权旧 writer 无法写，缺失则不能启用公司写入。既有验收为 ORG-A03（同文档 :285）。本节细化技术候选，不新增业务需求。

**〔源码事实〕可复用候选。** COMPANY_CORE_CHECKOUT（附录 B 第 9 项）已有以下代码；这不证明目标安装包已接线或通过运行验收：

| 落点 | 本次读到的机制 | 已证边界 |
| --- | --- | --- |
| src/storage/company-writer-store.ts:66-94 | commit 在 withFileLock 窗口内检查恢复状态、writer fence，再执行 publish | 只覆盖确实经过该 commit 的发布回调 |
| src/storage/company-writer-lease.ts:418-434 | 重读 holder 与 generation counter，失权时拒绝 | 单独检查后再无锁写入仍不足 |
| src/plugin/company-stack.ts:129-152 | 同一 storageRoot 构造 JSON backend、facility 并 acquire lease，然后打开组织服务 | 启动时持 lease 不证明每个持久提交都受 fence |
| src/plugin/config.ts:208-212 | 检查 root 非空且无首尾空格 | 该检查不完成实际路径身份规范化 |
| src/domain/organization-assets.ts:77-81、119-140 | 通过传入 facility 打开 domain；绑定入口直接 employees.put | 这条已读调用链未由 CompanyWriterStore.commit 包裹，须补真实提交点接线证据 |

**〔建议〕最小接入合同。** 优先复用并修齐该候选，通过 DSH 公开存储/服务扩展点装配；不把自建分布式共识列为前置。

1. **actor / precondition**：Host 的公司写入口启用前，把 SOLOIPS_STORAGE_ID 解析为真实存储身份；backend、lease 与恢复操作必须指向同一介质及保护集合。实际支持的相对路径、链接与平台别名必须落到同一独占键。
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
| L-F3 | yml 内的书写行序不携带加载语义；实际启动由服务可用性驱动 | 〔源码事实〕同上文件 :12-13 |

推论（〔推断〕，前提为 L-F2 + L-F3）：层顺序只决定「谁的 config 最终生效」，不决定「谁先启动」。因此任何跨包状态依赖必须走服务声明（inject），不得用层顺序表达。

### 8.2 层顺序模板与声明方式

| ID | 规则（actor · trigger · action · scope · outcome） | 标注 |
| --- | --- | --- |
| SOLO-LAYER-01 | actor：装配维护者。trigger：发布或调整包组成。action：只维护 SOLO-C01 的完整顺序，并按 SOLO-C06 回读生效组合。scope：全部交付 profile。outcome：声明与组合一致，服务启动先后由服务可用性决定 | 〔建议〕 |
| SOLO-LAYER-02 | actor：交付/部署脚本。trigger：安装或升级 SoloIPs。action：禁止把 dsh plugin --profile <p> add <pkg> 作为装配的权威手段，应当以「已入版本库的 profile 三件套 + pnpm install」完成装配。scope：客户环境与客户演示环境。outcome：任意两台机器组合结果一致 | 〔建议〕（依据 S-F1） |
| SOLO-LAYER-03 | actor：SoloIPs 各包。trigger：包需要改动非自身拥有的行。action：必须只经由 soloips-bundle 提出对官方行的覆写；能力包必须只 insert 自身前缀的 id。scope：全部 SoloIPs 包。outcome：每个 row id 只有一个写者（对齐 TERM-08 与 MECH-05 的单写权威） | 〔建议〕（依据 L-F2、S-F5） |
| SOLO-LAYER-04 | actor：SoloIPs 装配层。trigger：创建 profile。action：必须使用 SoloIPs 专有名，不得复用 dsh 内置名 web / headless / sdk / acp / sdk-minimal。scope：全部 profile 命名。outcome：不被启动器的模板归一化改写（依据 S-F6） | 〔建议〕 |

候选顺序已统一到 SOLO-C01；本节不保留互斥模板。

支撑证据：

- S-F1 〔源码事实〕apps/cli/src/plugin.ts:59-91 对新发现 bundle 执行 append、对失去声明的既有 bundle 移除；它不重新排序已有项。〔推断〕不同安装历史可能形成不同数组，最终权威仍是实际 bundles 数组与后续 patch 层，不能将依赖书写顺序直接等同于完整装配顺序。
- S-F2 〔源码事实〕profile 目录恰好三件：package.json（含 dsh.profile.bundles 有序清单）、cordis.patch.yml（用户层，最后应用）、pnpm-workspace.yaml。packages/boot/app-boot/src/profile.ts:165-185；工作区设置见 :150-155。
- S-F3 〔源码事实〕层叠应用顺序为：bundles 数组序 → profile 自身 cordis.patch.yml → home 级 $DSH_HOME/cordis.patch.yml → 启动器 --patch 与派生 patch。profile.ts:5-13；apps/cli/src/profile-boot.ts:68-75（home 级 overlay 位于 profile 层之上）。
- S-F4 〔源码事实〕组合是一次纯函数式 applyEntryPatches，作用于空根并把各层摊平，dump 与启动看到同一结果。profile.ts:841-848。
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
| SOLO-REG-02 | actor：同上。trigger：同。action：必须生成并比对 L2 golden = 含 profile 用户层与 overlay 的生效导出（--dump-config），必须覆盖每个交付 profile。scope：CI。outcome：客户实际生效树被锁住 | 〔建议〕（依据 S-R1、S-R2） |
| SOLO-REG-03 | actor：同上。trigger：每次发布。action：应当按项目既有 per-profile e2e 范式补一条 SoloIPs profile 场景（golden 文件与 overlay patch 同目录组织）；应当在 Web 侧以「只追加自己的 overlay 层」方式复用同一组合栈，不复制整棵配置树。scope：CI。outcome：装配回归与界面回归同源 | 〔建议〕（依据 S-R3、S-R4） |
| SOLO-REG-04 | actor：任一成员/交付者。trigger：主张「某包已装配生效」。action：禁止以 bundles 数组含包名、依赖列表含包名或「已安装启用」作为装配证据；必须给出 L2 生效树中的对应行 + 一次功能探针结果。scope：全部汇报与验收。outcome：杜绝「安装启用 ≠ 实际被调用」类误报 | 〔建议〕（依据 S-R5、S-R6） |

支撑证据：

- S-R1 〔源码事实〕导出开关与语义：--dump-config 与 --dump-default-config 互斥，后者显式拒绝 --patch 且不含用户层；导出带层来源标记（回归用例断言输出含层来源注释）。apps/cli/src/args.ts:100-114、:149、:184；apps/cli/tests/built-bin.e2e.ts:1015-1024。
- S-R2 〔源码事实〕bundles-only 消费方被显式设计为不读用户层，以免损坏的用户层让导出失败（userLayer:false）。profile.ts:810-812。〔推断〕这是「L1 看不到用户层覆写」的根因；SoloIPs 的界面相关配置多为覆写型，只在 L2 可见。
- S-R3 〔源码事实〕仓库内已存在 per-profile e2e 目录 apps/cli/tests/profiles/，内含场景子目录、expected.e2e.ts、expected.jsonl 与 overlay patch 文件。〔未验证〕作者只列目录，未读该目录说明，范式细节以该目录既有说明为准。
- S-R4 〔源码事实〕Web 侧测试用同一组合栈（bundle 层按 bundles 序 composeEntries 作用于同一空根），并支持注入额外 overlay。apps/web/tests/scaffold.ts:501-522。
- S-R5 〔源码事实〕存在「依赖里有包但 bundles 里没有」的真实 profile：另一个 home（$DSH_HOME_OTHER，**非 55120**，见 §8.7）的 web profile 依赖含 dsh-rlm（link 形式）而 bundles 不含它；同一 profile 的 cordis.patch.yml 以一条 insert: id: rlm 把它插入树 → 只读 bundles 数组必然漏项。
- S-R6 〔需求〕用户确认的验收口径：不能把安装某包等同于功能可用，安装包存在不等于工具可调用（refactoring 03-delivery-and-acceptance.md:40，路径相对 $REFACTORING_DOCS_ROOT）。〔约束〕装配属宿主、UI 只做投影（refactoring 02-company-contract.md:189）。

### 8.5 灰度与回滚

| ID | 规则 | 标注 |
| --- | --- | --- |
| SOLO-ROLLBACK-01 | actor：验证/部署者。trigger：试验候选组合。action：在 SOLOIPS_HOME_VERIFY 使用具名 profile 或 overlay，并核对实际 backend、Session 与资产根不指向生产。scope：候选验证。outcome：装配身份与数据隔离分别可证；单独换名或复制 profile 不算隔离 | 〔建议〕SOLO-DATA-01–03 |
| SOLO-ROLLBACK-02 | actor：交付/运维。trigger：恢复旧组合。action：先停写并确认单 writer 边界；状态兼容已证时恢复旧装配并读回，需数据回退时在隔离根恢复一致检查点。scope：指名组合及数据根。outcome：装配恢复、状态核对与副作用对账分别给证据，不承诺一次改参数或零耗时 | 〔建议〕SOLO-ACC-06 |
| SOLO-ROLLBACK-03 | actor：运维。trigger：装配清单或 patch 损坏。action：可用 --from-default-profile 创建恢复装配，并恢复锁定工件和声明层；运行前显式绑定恢复数据根。scope：装配修复。outcome：只证明未复制损坏装配文件；同 home 默认仍读旧业务状态，数据恢复另按 SOLO-DATA-04 | 〔建议〕S-B3 |
| SOLO-ROLLBACK-04 | actor：SoloIPs 装配层。trigger：需要按环境差异化配置。action：必须把环境差异放在 overlay（profile 用户层或 --patch 文件），禁止为差异复制一棵 bundle 配置树。scope：全部交付。outcome：差异是一层可 diff 的补丁 | 〔建议〕（依据 S-B5） |

支撑证据：

- S-B1 〔源码事实〕profile 身份取目录名，manifest 的 name 字段不参与身份。profile.ts:95-102、:798。〔源码事实〕作者观察到一个复制产物：$DSH_HOME_OTHER（**非 55120**）下并存 web 与 web-rc2 两份，清单内容一致且 web-rc2 的 manifest name 仍写 dsh-profile-web → 复制式灰度会留下误导性元数据。
- S-B2 〔源码事实〕模块面是跨 profile 共享的安装闭包镜像目录，另有 profile 私有目录承接 bundle 独有依赖。profile.ts:535-560、:610-645。〔推断〕只改层不动该共享目录；「卸载某个包」不能当作影响隔离手段。
- S-B3 〔源码事实〕从内置模板初始化具名 profile 的能力存在且受保护：目标名为内置名则拒绝、模板未知则拒绝且不落盘、启动器不读取源 profile 的本地装配文件，也不写继承元数据；同 home 业务状态仍按 SOLO-DATA-01 共享。apps/cli/src/profile-boot.ts:104-140；回归用例 apps/cli/tests/built-bin.e2e.ts:1026-1047。
- S-B4 〔源码事实〕dsh plugin 的路径不提供安装快照或状态恢复（SOLO-F07）。〔推断〕选择旧 profile 只能恢复相应装配；能否读回业务数据取决于实际 root、schema 兼容性和恢复点，不能推出“回滚粒度天然是 profile”。
- S-B5 〔源码事实〕overlay 形态有官方先例：可选用户 overlay 与示例 overlay 以单文件分发（apps/cli/config/examples/ 下存在多个 .cordis.yml 示例；docs/cookbook/extension-cookbook.zh.md:98）。〔未验证〕作者只列目录未读内容。
- S-B6 〔源码事实〕patch 允许 !!js 表达式（如以宿主 home 路径函数拼路径）packages/bundle/base/cordis.patch.yml:113；profile 用户层模板也注明允许 !!js（profile.ts:139-143）。〔推断〕→ golden 必须先做机器路径归一化，否则跨机 diff 恒不等。
- S-B7 〔源码事实〕自定义 profile 用户层默认热加载（live），内置模板各自声明（web 为 live，headless/sdk/acp 为 startup）。profile.ts:105-126、:136-137。〔推断〕单点临时回退可改 overlay 完成；改 bundle 层需按该 profile 的 patchReload 决定是否重启。

### 8.6 反面声明（本章明确不蕴含）

- 层顺序声明不蕴含启动顺序可控（L-F3）。
- L1 golden 通过不蕴含客户生效树正确（L2 才含用户层，S-R2）。
- bundles 含包名不蕴含该包已挂载（S-R5）；反之 bundles 不含也不蕴含未挂载（overlay 可 insert）。
- 新建 profile 不蕴含与旧 profile 数据隔离：默认数据在 home/storages 与 home/sessions，实际 root 可被 patch 覆写（SOLO-DATA-01）；模块闭包共享是另一项依赖事实。
- SoloIPs 用 profile 组合装配不蕴含可替换底座：底座层解析以安装目录为第一锚点，同名 bundle 不会取自 profile 本地副本（〔源码事实〕profile.ts:734-757）。

### 8.7 更正（覆盖作者前一封邮件的错误归属，以本节为准）

- 前一封给队长的结论把另一个 home 标注为 55120 实际 home，该归属错误，队长已实测纠正：55120 实际 home 为 $DSH_HOME_LIVE55120（真值入运维交接，见附录 B 第 2 项），其 swarm 版本 0.1.5、patchReload 为 live、bundles 为 dsh-base + dsh-web-app + dsh-agent-swarm、依赖为 freeze-20260915-reteam 下的 tgz。
- 因此本章凡引用 $DSH_HOME_OTHER（含 dsh-canvas、dsh-rlm 为 link、另有 web 与 web-rc2 两份）的观察，一律降级为「另一个 home 的真实实例」：仍证明机制存在，但不蕴含 55120 同样如此。〔未验证〕55120 的 profile 用户层是否也以 insert 挂载 rlm、是否含 dsh-canvas，本次未读取。
- 上一封邮件中「checkout bundle 版本见 web-app/package.json:5」应为 :4（base 与 web-app 均在第 4 行）。

### 8.8 待决（需用户裁决，勿代为确认）

| ID | 待决问题 | 影响条目 |
| --- | --- | --- |
| SOLO-LAYER-Q1 | 官方行（connection、web-runtime、session 系列等）的覆写权是否只归 soloips-bundle | SOLO-LAYER-03、SOLO-REG-01/02 |
| SOLO-LAYER-Q2 | 是否强制 row id 前缀命名空间（soloips-*） | SOLO-LAYER-03、SOLO-C04 |
| SOLO-LAYER-Q3 | 版本锁是否写成客户交付硬要求（lockfile 入 git + 禁 file:/link: 个人路径） | SOLO-LAYER-05、SOLO-LAYER-06、SOLO-C05 |
| SOLO-LAYER-Q4 | 交付是一个 profile 还是「少量具名 profile + overlay」 | SOLO-ROLLBACK-01、SOLO-ROLLBACK-04 |
| SOLO-REG-Q5 | 未命中行的 patch 是静默跳过还是启动期报错（见 SOLO-FAIL-02 冲突） | SOLO-REG-04、SOLO-FAIL-02、MECH-09 |

### 8.9 附录 · 失败场景清单（SOLO-FAIL-01…10）

每条：现象与触发 → 后果与检测。行号除注明外均相对 $DSH_CHECKOUT。

| ID | 现象与触发 | 后果 / 检测 | 证据与标注 |
| --- | --- | --- | --- |
| SOLO-FAIL-01 | 用户层整行覆写吞掉新宿主默认字段：覆写型 overlay 早于宿主新增默认字段发布，宿主升级后 overlay 仍生效 | 新增默认值静默丢失；检测 = L2 golden diff + 关键字段断言 | packages/bundle/base/cordis.patch.yml:6-10〔源码事实〕；真实整行覆写实例 $DSH_HOME_OTHER/profiles/web/cordis.patch.yml（非 55120）〔源码事实〕；对 55120 的影响〔未验证〕 |
| SOLO-FAIL-02 | 覆写的目标行在当前 mode 不存在 → 该 patch 被跳过 | 少挂一行且可能无报错；检测 = L1/L2 diff 比对行数与来源段 | packages/.external/dsh-agent-swarm/cordis.patch.yml:26-31 自述「目标行缺失则跳过」〔源码事实（注释声明）〕；组合层存在「跳过 patch」告警通道且默认静默 profile.ts:841-847〔源码事实〕；冲突：apps/web/tests/scaffold.ts:501-504 注释称 id 不再匹配会响亮失败 → 运行期语义〔未验证〕，见 SOLO-REG-Q5 |
| SOLO-FAIL-03 | 层顺序由安装历史决定：两人以不同先后 add 同一组包 | 组合不同而清单看起来相同；检测 = 比对声明与实际清单 | apps/cli/src/plugin.ts:59-91（append、无插入位置）〔源码事实〕；apps/cli/tests/built-bin.e2e.ts:995-1004〔源码事实〕 |
| SOLO-FAIL-04 | 未声明 dsh.bundle 的包只被提示一次，之后靠 overlay insert 挂载 | 装配清单不完整、审计漏项；检测 = L2 生效树 vs 声明 | apps/cli/src/plugin.ts:72-74〔源码事实〕；真实实例（非 55120）：依赖含 dsh-rlm 而 bundles 不含，用户层一条 insert 才挂上〔源码事实〕 |
| SOLO-FAIL-05 | 多个 profile 共用同一 link:/file: 源 | 一处本地改动同时影响多套组合；检测 = 交付 lockfile 内不得出现个人路径 | 关联 SOLO-LAYER-06；〔源码事实〕某 home 下 web、web-rc2、rlm 三份 profile 指向同一 link 源（非 55120）；〔来源：队长实测〕55120 用 freeze tgz，未见 link |
| SOLO-FAIL-06 | patch 含 !!js 表达式，golden 携带机器本地路径 | 跨机 golden 恒不等，或被人為放宽导致漏检；检测 = golden 前做路径归一化 | packages/bundle/base/cordis.patch.yml:113、profile.ts:139-143〔源码事实〕；归一化做法〔建议〕 |
| SOLO-FAIL-07 | 只跑 L1 得到假绿：L1 显式不含用户层与 overlay | SoloIPs 多为覆写型配置，L1 看不见；检测 = 强制跑 L2 | apps/cli/src/args.ts:100-114、profile.ts:810-812〔源码事实〕 |
| SOLO-FAIL-08 | 复制 profile 目录做灰度：元数据失真（name 仍指源、身份实为目录名），且模块闭包目录共享 | 误判隔离范围、回滚错对象；检测 = 禁止复制式 profile | profile.ts:95-102、:798、:535-560〔源码事实〕；复制实例（非 55120）〔源码事实〕 |
| SOLO-FAIL-09 | 复用内置 profile 名，或 bundles 恰好等于内置/退役 tuple | 清单被启动器回写、目标名被拒绝；检测 = SOLO-LAYER-04 命名断言 | profile.ts:689-711；apps/cli/src/profile-boot.ts:119-124〔源码事实〕 |
| SOLO-FAIL-10 | 两个包覆写同一 row id | 后加载层整行胜出、前一层意图消失且无冲突提示；检测 = SOLO-LAYER-03 唯一写者断言 | packages/bundle/base/cordis.patch.yml:2-4、:6-10〔源码事实〕 |

### 8.10 本章未覆盖（避免被误读为已完成）

- 〔未验证〕未启动任何服务、未执行任何 dsh 命令；本章结论来自源码只读与队长实测数值。SOLO-FAIL-02 的运行期语义尤其需要一次有界实测。
- 〔待决 DRAFT-D08〕是否提供显式 disable 层及其支持边界；各阶段失败范围见 TERM-16、SOLO-F02，目标运行表现待 S0 验证，不预设任何包错误都必须整 profile 失败。→ 并入 12.1。

〔源码事实〕packages/storage/storage-domain/src/spec.ts:1-9 定义 spec 是一个 domain 的身份、布局与记录 schema 的唯一来源，且由 owning package 用 defineDomain 定义一次。

〔建议〕domain opener 名单不相交仅是拆包检查之一；还须核对业务事实、实际介质与跨进程写保护，见 R2、SOLO-FENCE-01。

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
| F-3 | 行 id 重复 | vendor/loader/src/config/group.ts:61-66（duplicate loader entry id 的 TypeError） | 整组回滚（group.ts:86-104） | 否 |
| F-4 | 行 name 指向的模块导入失败 | vendor/loader/src/config/entry.ts:217-220、:280-287 | 该组回滚，不只是掉这一行 | 否 |
| F-5 | 行 apply 抛错 | entry.ts:287、group.ts:71-80（allSettled，任一失败即 throw） | 同上 | 否 |
| F-6 | 依赖服务未就绪 | inject 机制（docs/architecture.md:127-129；实例见 dsh-agent-swarm/cordis.patch.yml:5-9 注释：没有那些服务时 enabled 的子项保持 pending，fail closed） | 该行挂起等待，不报错也不工作 | **是（fail-closed pending）** |
| F-7 | 升级后包丢失 dsh.bundle 声明 | apps/cli/src/plugin.ts:77-87（wasDependency 且不再 isBundle 则 splice） | **静默从 bundles 移除**：profile 仍启动，功能消失 | 是（静默） |
| F-8 | patch 目标行不存在 / name 不匹配 | vendor/include/src/index.ts:111-119 | 只 warn 并跳过，**配置漂移且不阻断启动** | 是（静默） |
| F-9 | patch 文件本身不可解析或不是顶层数组 | packages/boot/app-boot/src/index.ts:350-368 的 parsePatchList（抛错）；:315-323 的 loadOverlayPatches（缺失即抛） | 启动失败 | 否 |
| F-10 | 用户 patch 文件缺失 | index.ts:295-304 的 loadOptionalPatches（ENOENT 视为无此层） | 视为「无这一层」，不报错 | 是（按设计） |
| F-11 | git 源安装无 prepare 构建 | docs/user/develop/basic/publish.md:161-173；apps/cli/src/plugin.ts:155-160（提示加 allowBuilds） | 首次 add 失败；加白后重跑 | 否（安装期） |
| F-12 | live reload 期间 patch 应用失败 | vendor/hmr/src/index.ts:309-312（warn config reload failed + hmr/config-update-failed 事件） | 运行中原配置保留，新配置不生效 | 是（保留旧态） |

### 10.2 组合失败与挂载失败的作用范围（SOLO-F02）

**〔源码事实〕** 组合层没有「跳过坏包继续启动」的分支：

1. 解析期：profile.ts:784-793 对每个 bundle 逐层解析，任一不可解析或缺少 dsh.bundle 即抛错；profile.ts:753-756 的错误信息明确要求先执行 dsh plugin 安装。
2. 挂载期：vendor/loader/src/config/group.ts:71 用 Promise.allSettled 并发创建，:76-80 把一个失败原样抛出、多个失败包成 AggregateError；:85-105 捕获后**回滚全部新增行并按旧配置重建**，失败则再抛 AggregateError（loader entry rollback failed）。
3. 单条目的错误被统一包装：vendor/loader/src/config/entry.ts:24-27 的 updateError（stage 为 import / dispose / apply / rollback）。

**〔推断〕** 组合解析失败可能阻断该组合启动；挂载回滚的具体范围须按触发路径区分，不能由包数量直接推出任意错误的全部影响。无效 patch 可仅 warn/skip（SOLO-F06），服务缺失可保持 pending（SOLO-F04），客户端稳态另见 CLIENT-03。

**〔建议〕** core 与 adapter 合包可减少交付单元，但不消除插件自身失败；也可通过依赖声明、预检、保持旧组合及明确支持的禁用配置控制影响。是否合包按 PKG-01–03 与实际成本评估，仍属 DRAFT-D07-D1。

**〔待决〕** 包数量与故障半径的取舍由用户裁决。

### 10.3 重复行 id 的整树回滚（SOLO-F03）

**〔源码事实〕** vendor/loader/src/config/group.ts:59-66：update() 先遍历配置收集 id，若已存在同名 id 直接抛 TypeError。抛出发生在任何 create 之前（group.ts:71 之后），因此**不会产生半挂载状态**；随后由 group.ts:85-105 回滚。

**〔源码事实〕** 未写 id 的行不会撞车，但会得到随机 id：vendor/loader/src/config/tree.ts:66-73。这类行后续无法被 patch 稳定命中，属于隐性缺陷。

**〔建议〕** 每条 patch 行必须显式写 id，并采用 6.5 的包名前缀；--dump-config 的输出应作为 id 唯一性的机器可查证据（同 id 在启动前即失败，故门禁价值在于**提前发现重名包前缀**）。

### 10.4 服务未就绪：fail-closed pending（SOLO-F04）

**〔源码事实〕** entry 通过 inject 声明所需服务，未满足时保持挂起而非报错——机制见 docs/architecture.md:127-129；行为契约的现成实例见 dsh-agent-swarm/cordis.patch.yml:1-9（安装只贡献一个结构组；启用该组从不自动创建 Team；子项消费单独组合的官方 storage hub、KV 后端、Storage Domain 与 Session persistence；**没有这些服务时，enabled 的子项保持 pending，即 fail closed**）。

**〔建议〕** SoloIPs 的包必须沿用同一约定：**缺依赖服务时挂起并保持可诊断**，不得自行降级为「用内存实现顶上」。挂起必须有可观察出口（日志或 UI 提示），否则与「静默不工作」不可区分。

**〔未验证〕** 挂起行的具体可观察表现（是否有统一日志/UI 提示、是否会超时）本次未验证。

### 10.5 升级丢失 dsh.bundle 的静默移除（SOLO-F05）

**〔源码事实〕** apps/cli/src/plugin.ts:59-91 的 reconcilePlugins 以**已安装状态**而非依赖 diff 来校对 bundles：:82 判定 stillBundle 为「在依赖集合中且该行导出 patch」，:83-86 当「曾是依赖但现在不是 bundle」时从列表 splice 并回写 manifest（:88-90）。反向也成立：:67-69 与文件头注释 :8-9（新版本获得 dsh.bundle 声明会被自动激活）。

**〔源码事实〕** 对普通依赖（无 dsh.bundle）只打印一次警告，不阻断：plugin.ts:70-75；docs/user/develop/basic/publish.md:64。

**〔建议〕** 这是**最危险的静默失败**：profile 照常启动、功能整体消失。唯一可靠检测是 6.7 的 --dump-config 基线比对——该包的层会从输出中整体消失。（对应 SOLO-ACC-CE-E、SOLO-FAIL-04。）

### 10.6 patch 未命中的静默 skip（SOLO-F06）

**〔源码事实〕** vendor/include/src/index.ts:111-119：目标 id 不存在则 warn（patch: entry not found）；name 与目标行不一致则 warn（name mismatch）并 continue。两条都**只告警不阻断**。设计意图见 packages/boot/app-boot/src/index.ts:341-343（单个 patch 目标缺失保持为 per-entry Loader 警告，以便一份 overlay 可跨多个 surface 复用）。

**〔源码事实〕** insert 到不存在的组、或插入到非组行，同样只 warn：vendor/include/src/index.ts:83-90。

**〔建议〕** 规则：把「patch 告警」当作**错误**处理。--dump-config 会输出带来源标注的逐行结果（index.ts:388-395、:452-471），可用作「预期存在的行是否仍存在、归属层是否变化」的核对面。（与 SOLO-REG-Q5 的运行期语义待决并行保留。）

### 10.7 dsh plugin 无回滚（SOLO-F07）

**〔源码事实〕** apps/cli/src/plugin.ts:120-162 的 runPlugin：初始化 profile（:122-130）→ spawnSync 调用 pnpm（:134-138）→ :148-149 仅当退出码 0 才 reconcilePlugins；:150-160 非零时只打印提示（含 git 源的 allowBuilds 指引）。**没有对已写入的 node_modules、pnpm-lock.yaml 或 manifest 做任何回滚**；移除语义见 docs/user/develop/basic/publish.md:110（remove 同时删依赖与层）。

**〔建议〕** 变更流程必须自带完整装配恢复材料（宿主及插件工件/散列、profile 配置及 lockfile、home/launcher overlay、dump 基线）；涉及状态变化时另备 SOLO-DATA-04 的一致恢复点与兼容性证据。备份 manifest 不等于备份业务状态（SOLO-ACC-06）。

### 10.8 patchReload：live 与 startup 的差异（SOLO-F08）

**〔源码事实〕** 取值与默认：packages/util/package-manifest/src/types.ts:65-66 声明取值仅 live 与 startup 两种；profile.ts:137 的 DEFAULT_PROFILE_PATCH_RELOAD 为 live（自定义 profile 默认 live）；内置模板 web 为 live（profile.ts:112-113），headless/sdk/acp/sdk-minimal 为 startup（:108-125）。非法值直接抛错：profile.ts:776-782。

**〔源码事实〕** 只有 live 会安装 HMR 观察并在运行中重放用户层：apps/cli/src/profile-boot.ts:355-385（patchReload 为 live 且树仍活跃时才挂载 watcher；:366-371 必要时补装 timer 与 hmr）；重放的组合函数 composeLive（:328-333）保持「bundle 层在下、overlay 在上」，因此用户层可覆写 bundle 层已有行；“在下”不意味着受保护。startup 不装任何 watcher（:353-354 注释）。

**对「重启读回」的影响（〔推断〕，重要）**：

1. patchReload **与持久化无关**，它只决定 cordis.patch.yml 的编辑是否在运行中即时生效。它不保证、也不影响「写入 → 停止 → 重启 → 读回」。
2. live 模式下，**运行中的树可能与磁盘上的 cordis.patch.yml 已经不同步**（编辑已热应用但未经过一次真实冷启动）。因此以 live 运行获得的行为，不能作为「重启后仍如此」的证据。
3. live 的重放失败是「保留旧态」而非崩溃：vendor/hmr/src/index.ts:309-312。**后果**：一次失败的热更新会静默停留在旧配置，且失败只体现在日志与事件里。
4. startup 模式下所有用户层在启动时一次性应用，配置与磁盘一致，但每次改 cordis.patch.yml 都必须完整重启才能生效。

**〔建议〕验收规则 SOLO-F08**：

- **actor**：验证「写入 → 停止 → 重启 → 读回」的人。
- **trigger**：任何涉及持久性与配置生效的验收。
- **action**：必须显式确认当前 profile 的 patchReload 取值；live 模式下，验收前必须执行一次真实重启后再读回，不得以热更新后的状态作为证据。
- **outcome**：读回结果与磁盘 cordis.patch.yml + 重启后重跑的 --dump-config 一致。
- **verification**：本规则只覆盖配置生效路径；不覆盖业务数据持久性（属第 11 章 SOLO-ACC-05 与业务侧正文）。

### 10.9 本章稳定 ID 汇总

| ID | 内容 | 状态 |
| --- | --- | --- |
| SOLO-F01 | 装配层故障矩阵 | 〔源码事实〕+〔推断〕混合，逐条标注 |
| SOLO-F02 | 组合解析失败与 Loader 挂载失败的作用范围 | 〔源码事实〕路径；目标运行后果〔未验证〕 |
| SOLO-F03 | 重复行 id 整树回滚 | 〔源码事实〕 |
| SOLO-F04 | 服务未就绪 fail-closed pending | 〔源码事实〕机制／〔未验证〕具体表现 |
| SOLO-F05 | 升级丢失 dsh.bundle 的静默移除 | 〔源码事实〕 |
| SOLO-F06 | patch 未命中的静默 skip | 〔源码事实〕 |
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
- action：必须 (1) 读取 profile 的 package.json 中的 dsh.profile.bundles 数组与依赖版本/tgz 路径，形成「部署组合清单」；(2) 对同一 profile 执行 dsh --profile 加名称与 --dump-config；(3) 将输出与受版本控制的「验收组合清单」（期望 bundles 顺序 + 每包版本/SHA）逐行比对。
- scope：全部 SoloIPs 包 + 官方基础层（@deepseek-ai/dsh-base；web profile 另含 @deepseek-ai/dsh-web-app）。
- outcome（通过）：dump 的层标签顺序、数量与验收清单一致，且每行 id 均命中（无 unmatched patch 报告）。
- outcome（失败）：顺序不一致、缺层、多出层，或 dump 报告某 patch 未匹配任何行。
- failure/recovery：--dump-config 与 --dump-default-config 互斥，且 dump 不启动进程、不求值 !!js（〔源码事实〕apps/cli/src/dump-config.ts:1-7、apps/cli/src/args.ts:103-114）。若 profile 自身 cordis.patch.yml 损坏导致 dump 失败，必须改用 --dump-default-config（跳过用户层，〔源码事实〕dump-config.ts:25-27），**不得**换一个 profile 重跑以绕开。
- verification：本条只验配置组成；业务功能、数据恢复与停线按 SOLO-ACC-02–10 及既有首片验收分别覆盖。
- 证据状态：机制〔源码事实〕（作者核对到源码行）；场景〔未验证〕——**当前未执行**。

**禁止的替代做法（反面声明）**：

- 用「profile 能启动、退出码 0」推断组合正确 —— 不成立：patch 指定了不存在的条目时只输出 stderr 警告（〔源码事实〕packages/boot/app-boot/README.zh.md:55）。
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
- 证据状态：场景〔未验证〕——**当前未执行**。相邻事实（〔源码事实〕，基线 51ddbe29，核对日期 2026-09-14）：现有 getEmployeeOnboardingGaps 仅检查资料引用与头像字段是否存在，且仍保留 ORG_ALLOW_LEGACY_UNBOUND 旁路。该旁路必须在业务入口启用前移除，否则本场景不可能通过（与 docs/architecture.md §4、7.9 一致）。

### 11.4 重启读回验收

**SOLO-ACC-05〔建议〕写入 → 停止 → 重启 → 读回，且不受 patchReload 干扰。**

- actor：实施者。
- trigger/precondition：已建立至少一个公司/部门/员工、一个任务、一个已保存作品版本。
- action：必须 (1) 绑定安装工件、profile、解析后 home、有效存储根与 patchReload，并保存生效组合；(2) 写入业务数据；(3) 停止进程并确认写入口关闭；(4) 用同一安装包、同一 profile、同一实际数据根重启；(5) 取得唯一写权、完成恢复后核对公司、任职、任务、operationId 与作品版本。
- scope：同一数据根只有一个合法 writer；不得出现第二个进程/分支持有同一数据根。
- outcome（通过）：数据可核对且一致；无双重执行；重启前后 dump 组合一致。
- outcome（失败）：读不回；读回值与写入值不一致；出现两个 writer；重启后组合与停止前 dump 不一致。
- failure/recovery：patchReload 为 live 时，被拒绝的编辑会让**最后一个可用应用继续运行**（〔源码事实〕packages/boot/app-boot/README.zh.md:57），即磁盘组合与进程组合可分离。因此本场景应当 (a) 在 patchReload 为 startup 下执行，或 (b) 在步骤 (1) 显式记录并核对「进程内生效组合」。
- 现状：55120 部署 profile 为 patchReload live（〔源码事实〕已部署 profile 的 package.json，附录 B 第 2 项）。
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
| SOLO-ACC-CE-B | 业务不变量（完整入职 ORG-03 / 单员工占用 ORG-05）只写在包 patch 的 config 里 | 在 home 级 cordis.patch.yml 对同一行整行替换并去掉该开关 | profile 正常启动、无错误，不变量被**静默关闭** | 〔源码事实〕packages/bundle/base/cordis.patch.yml:7-9（patch 整行替换、非深合并）；packages/boot/app-boot/README.zh.md:55（用户层最后写赢、home 级优先） |
| SOLO-ACC-CE-C | 部署 profile 依赖官方 0.1.5-rc.2 的某行名/scope | 升级 DSH 至该行消失或改名 | 退出码 **0**、仅一行 stderr 警告，功能静默缺失（比崩溃更坏） | 〔源码事实〕packages/boot/app-boot/README.zh.md:55（条目不存在只警告）；packages/.external/dsh-agent-swarm/cordis.patch.yml:26-31（该行自述针对 Official 0.1.5-rc.2） |
| SOLO-ACC-CE-D | 在临时 profile 成功安装 A，并记录 manifest/lockfile/node_modules 基线 | 安装 B 时受控失败，逐项检查文件和安装闭包实际差异 | 可能留下部分变更且 DSH 不自动恢复；须报告实际残留，不能预设 manifest 必含 A+B | 〔源码事实〕apps/cli/src/plugin.ts:120-162：仅 pnpm 退出 0 才 reconcile；该路径无快照恢复 |
| SOLO-ACC-CE-E | 某包已作为 bundle 在层栈中 | 升级该包，新版本丢失 dsh.bundle 声明 | 该包被静默 splice 移出层栈，profile 启动成功、功能缺失、无告警 | 〔源码事实〕apps/cli/src/plugin.ts:82-86（wasDependency 且不再 isBundle）、:71-74（仅对新装 bundle-less 依赖给一次性 warning） |
| SOLO-ACC-CE-F | 两个包通过同一 facility 打开 storage domain | 顺序或并发 open 同名 domain | 第二次 already-open；改用异名并写同一业务事实仍可能双写；换 facility/进程不能据该错误预测结果 | 〔源码事实〕packages/storage/storage-domain/src/index.ts:65-72、103-107；跨 Host 单独验 SOLO-ACC-09 |
| SOLO-ACC-CE-G | 建员工 + 过入职门 + 绑 Session + 建私有记忆 | 让这些写入跨越两个包各自 commit | 出现半状态：员工已建但入职未过；或 attempt 已建但所属员工不在 roster | DSH 不提供跨包事务（〔推断〕+〔未验证〕：作者未取得正面源码证据，检索无结果不等于证明不存在，实现阶段必须重核）。与 7.1 的〔推断〕一致；本文登记为 MECH-04、DRAFT-D05 |
| SOLO-ACC-CE-H | patchReload 为 live 的 profile（现状 55120 即 live） | 做一次 live 编辑后再走「停止 → 重启 → 读回」 | 磁盘是新组合、停止前运行的是旧组合 → 重启读回验的是**另一套组合**，复现 docs/architecture.md §7「运行包与候选分支不同」 | 〔源码事实〕packages/boot/app-boot/README.zh.md:57；现状〔源码事实〕已部署 profile patchReload 为 live |
| SOLO-ACC-CE-I | checkout 源码与部署包各自构建 | 用 checkout 构建产物去验收 55120 | 验收的包 ≠ 部署的包：checkout 的 dsh-agent-swarm = **0.1.4**，部署 = **0.1.5**（依赖 file: 指向 dsh-agent-swarm-0.1.5.tgz），其 peer 全钉死 0.1.5-rc.2（精确版本、无 caret） | 〔源码事实〕两侧 package.json 与已部署 profile 的 package.json（附录 B 第 2、3 项） |

**CE-G 的证据诚实说明**：跨包事务「不存在」目前是〔推断〕，未取得正面源码证据。关键词检索无结果不等于证明不存在；实现阶段必须重核。在此之前 CE-G 的交付标签保持〔提案〕，**不得**因表格整齐而升格为事实。

### 11.7 本章与上游的关系

- 本章是**验收合同**：写「什么算通过、什么算失败」，不是「已通过」。
- 本章引用已确认的底座与交付形态、首片结果及 ORG 要求；5 个包仍为 DRAFT-S02〔建议〕。机制正文与验收判定分别维护，不重新制造需求。
- 本章不记录动态状态（谁在跑、跑到哪一步）；动态状态留在原生任务系统。

### 11.8 验收门槛与技术候选

| 项目 | 处理方式 | 决策边界 |
| --- | --- | --- |
| 装配身份 | 〔建议〕绑定宿主、插件、lockfile 与工件 SHA-256；仅版本号不足以发现同版本替换 | 具体执行工具随交付路径确定 |
| patchReload | 〔建议〕保留目标既有配置，冷启动核对磁盘组合与进程行为；无需为测试预先改生产配置 | 改动运行配置须另有授权 |
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
| 路径别名 | B 用目标平台支持的相对/绝对路径、链接或等价别名访问相同介质 | 仍识别相同独占身份；产生第二独占键并可写即失败 |
| 失权旧 handle | 保留 A 的真实 handle，经受控接管使 B 获新代际并写入，再触发 A 的各业务发布点 | A 在持久发布前被拒，独立 reader 读回 B 的数据；只测便利 commitRecord 不够 |
| 检查/发布竞争 | 在 A 的 fence 检查与发布间设可控暂停，尝试 B 接管 | A 合法提交先完成，或 B 先接管且 A 被拒；不允许失权发布 |
| 崩溃恢复 | A 写入后异常退出，按指定维护协议恢复并接管 | 原数据和未决 operationId 可核对，恢复完成前不派工，无重复 attempt；盲目清锁或旧写入迟到覆盖则失败 |

verification：留存进程、实际存储身份、代际、拒绝原因、发布计数及新 reader 读回证据；同实例 already-open 或测试文件存在不算通过。本场景〔未验证〕。

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
| DRAFT-D01 | 草稿最终并回 SOLO-ARCH、登记独立文档，或仅保留评审用途 | 用户决定；在此之前只作评审材料，不改变注册表与既有权威 |
| DRAFT-D03、DRAFT-S01–03 | 5 包及 core/adapter 拆分候选；推荐职责见第 5 章 | 用户决定产品实施范围；技术候选不自动生效 |
| DRAFT-D04 | loader 组合期与客户端稳态故障边界 | 工程核验各条目作用范围与真实失败结果，不以单包故障一概外推 |
| DRAFT-D05 | 跨 domain 事务能力与目标存储组合 | 保持〔未验证〕；禁止依赖未经证明的共同原子提交 |
| DRAFT-D06 | 装配顺序检查 | 〔建议〕按 SOLO-C01/C06 直接纳入候选回归，不另建第二套顺序正文 |
| DRAFT-D07-D1 / D2 | 拆包粒度、组织域是否独立发布 | 技术推荐按生命周期与实际写权威评估，用户裁决产品取舍 |
| DRAFT-D07-D3 | agent_swarm domain 的迁移与唯一业务写入口 | 工程核实候选差异、迁移与所有写路径；ORG-06 结果要求已确认 |
| DRAFT-D08 | 是否提供显式 disable 层及其可用边界 | 后续设计不得绕过准入、停线或存储独占 |
| DRAFT-D09 | 实际 home/root 绑定、数据兼容性、一致恢复点及升级后变化处置 | 工程按 SOLO-DATA-01–04 提供具体材料；用户决定真实切换及有效数据处置 |
| SOLO-C07、SOLO-LAYER-Q4 | 交付 profile 最终名、开发/验证环境部署 | 建议独立名及不同 home；测试用 profile 数量不改写 SOLO-R02 的交付形态 |
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
| A1 | 用户来源与团队建议混淆 | SOLO-R01–03 保留用户来源；5 包清单仅为 DRAFT-S02，不得称已确认 |
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
| A12 | 5 包与 core/adapter 合包两种候选 | 5 包仅为当前文档候选；数量取舍保留 DRAFT-D07-D1，不把减少包数说成唯一故障缓解方式 |
| A13 | already-open 被外推为跨进程保护 | 纠正 TERM-07、MECH-05、R2、WA-F1/F2、SOLO-ACC-02/CE-F；新增 SOLO-FENCE-01、SOLO-ACC-09，并记录现有 lease 候选及提交点接线缺口 |
| A14 | 切 profile 被外推为状态回滚 | SOLO-DATA-01–04 固定数据根含义，SOLO-ACC-06 分开装配兼容回退与一致检查点恢复；不承诺一次改参数完成恢复 |
| A15 | vendor/include/src/index.ts:77 被指为空行 | 2026-09-16 复核 DSH_CHECKOUT 文件共 377 行，:77 为 patch 循环；保留正确引用，证据仅说明配置遍历 |
| A16 | 已确认首片门槛被列成可降级待决 | §11.8 区分已有结果要求与技术测试编排；ORG-06/13 等不能被降级 |

## 附录 B · 证据基线与符号环境名

正文只用符号名；机器本地绝对路径、home 真值与瞬时进程细节一律写运维交接，不进正文（SOLOIP-DOC-001 §6）。各章引用「附录 B 第 N 项」时指向本表。

| # | 符号名 / 基线项 | 含义与已证边界 | 标注与日期 |
| --- | --- | --- | --- |
| 1 | 仓库内权威 | SOLOIP-DOC-001（格式）、project-binding.yaml、document-registry.yaml、AGENTS.md、docs/architecture.md（SOLO-ARCH）；基线提交 3f30ebaf3788f9a1a4c7bda63ad54135deadec31 | 〔源码事实〕仓库内文件，2026-09-15 建立（binding 记录） |
| 2 | PROFILE-55120 | 端口 55120 实际使用的运行数据根与其 profile：swarm 0.1.5、patchReload 为 live、bundles 为 dsh-base + dsh-web-app + dsh-agent-swarm、依赖来自 freeze-20260915-reteam 下的 tgz（swarm 0.1.5、rlm 0.0.0）；是否存在 profile 级 lockfile 未读取 | 〔源码事实〕队长实测 2026-09-15；本文与 backend-hy4、qa-hy4 均未独立复核该 home → 引用它的运行时结论一律保持〔未验证〕。**实际生效版本属动态状态，权威在原生任务系统**（binding.liveStatusInCommittedMarkdown: forbidden） |
| 3 | DSH_CHECKOUT | DSH 源码工作树：根包 0.1.5-rc.2、HEAD c291e7961a515f6d7af9304e7fd1d257929aef26；同 checkout 内 dsh-agent-swarm 为 0.1.4；工作树含既有修改，不能当官方纯净发布包（docs/architecture.md §9） | 〔源码事实〕多名成员 2026-09-15 静态只读；**未做启动/故障注入验证** |
| 4 | DSH_HOME_OTHER | 另一个 DSH home：swarm 0.1.0（不是 55120，早期取证曾误标，已由队长实测更正）；其下并存 web 与 web-rc2 两份 profile、rlm 与 canvas 以 link 形式挂载 | 〔源码事实〕成员读取 + 队长更正 2026-09-15。**其观察只证明机制存在，不蕴含 PROFILE-55120 同样如此**（第 8 章 §8.7） |
| 5 | REFACTORING_DOCS_ROOT | 重构文档入口（README + 01-departments.md + 02-company-contract.md + 03-delivery-and-acceptance.md + 04-avatar-64.md）；解析路径见 docs/architecture.md §9。用户裁决 2026-09-15：当前开发、修复与验收以重构文档为准 | 〔约束〕文档正文；条目 ID 见 4.4 |
| 6 | 旧插件候选基线 | repair-release 与 company-core 两个 worktree：前者独有 avatar-preference.ts、team-recovery.ts，后者独有 organization-*.ts、delivery-evidence.ts；曾记录 git merge-base --is-ancestor 单方向退出码 1；该结果只证明该方向不是祖先，分叉关系需双向核对；两者声明同一个 team domain（team-spec.ts:346） | 〔源码事实〕backend-deepseek 核对（日期随其邮件，2026-09-15/16）；D3 待决未解 |
| 7 | Team 公开记录（用户来源） | public-97c9d584（2026-09-15 15:42:51Z）、public-082313dc（15:46:11Z）、public-74132fa8、public-a6e12b45（15:57:18Z，队长综合与 5 项裁决清单）、public-45c5f8fa（16:00:58Z） | 〔需求〕来源条目见 4.2；队长综合结论本身不构成用户确认 |
| 8 | 本文自身 | docs/architecture-draft.md 为评审材料；其文档角色的最终安排见 DRAFT-D01 | 〔提案〕不因文本修订主张产品实现或运行验收 |
| 9 | COMPANY_CORE_CHECKOUT | 由 REFACTORING_DOCS_ROOT 向上两级到 restore-control，再取 .worktree/company-core；本轮 HEAD 4c6d05ef30452df2b7adbfb24d625aef4e58f239。仅作为可复用候选，不等于已安装版本 | 〔源码事实〕2026-09-16 只读 writer lease/store、company-stack/config 与组织写入口；已证范围见 SOLO-FENCE-01 |
| 10 | 本次直接复核 | ORG-06/13 与 ORG-A03/A09/A10；DSH 的 domain facility、JSON 原子写与默认根、home/profile 解析、include patch 循环；DSH HEAD 与第 3 项一致 | 〔源码事实〕2026-09-16；源码与需求文本检查，未启动服务或运行故障场景 |

通用判定约定（适用于 SOLO-ACC-01–10 与 SOLO-ACC-CE-A…I）：

- 每条场景写成 **起点 → 动作 → 可观察结果**（通过与失败各一条），不写「应能正常工作」。
- 通过判定必须可由**不修改任何代码**的观察者复现：命令输出、退出码、日志行、状态文件内容。
- 任何场景只要未实际执行，交付标签只能是〔提案〕；执行后按实际结果改为〔已验证〕并写明执行边界（哪个 profile、哪个 DSH 版本、哪次运行）。
- 规则写法遵循 actor + trigger/precondition + action + scope + outcome；正确性相关补 authority / failure-recovery / verification。
- 动词统一：必须（MUST）/ 应当（SHOULD）/ 可以（MAY）。
