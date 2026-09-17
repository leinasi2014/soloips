# SoloIPs 重写参考 · domain + storage 层

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | SOLOIP-REF-DS；`domain/` 与 `storage/` 两层的重写参考（参考重写，不 fork、不整包拷贝） |
| 目的 | 让重写者在不读候选全量源码的前提下，拿到 domain/storage 的可复用规则、行为契约、候选缺陷与取舍结论 |
| 范围 | `COMPANY_CORE_CHECKOUT/src/domain/`（42 文件）+ `src/storage/`（14 文件），与 `REPAIR_RELEASE_CHECKOUT` 同名目录对账；不含 runtime/client/rpc/tools 层 |
| 决策状态 | 〔源码事实〕为只读观察；〔推断〕含假设；〔未验证〕为证据缺口。本文不构成实施许可，重写方案须另行确认 |
| 证据范围 | 2026-09-16 只读复核两份候选 checkout（同属 `dsh-agent-swarm` 0.1.5、private、MIT）。**未运行、未构建、未做故障注入**；行号相对各自 checkout 根 |
| 依据 | [文档格式规范](../governance/doc-format.md)；`docs/operations/environment-handoff.md`（符号真值） |
| 变更权 | 队长合并入唯一正文前，本文为分块草稿 |

## 0. 结论摘要

1. **domain/ 是可复用资产，storage/ 是必须改写的资产。** 〔源码事实〕42 个 domain 文件中仅 **5 个**引官方包（共 8 处 import），其余 37 个纯宿主无关；`storage/` 14 个文件中 **9 个**引官方包（共 15 处）。
2. **两份候选不是二选一，而是嵌套+分叉。** 〔源码事实〕`repair-release` 的 storage 9 文件是 `company-core` 14 文件的**真子集**（差集恰好 5 个 writer/fence 文件）；domain 层则**互为分叉**（cc 独有 5 个组织文件，rr 独有 2 个）。
3. **组织域（org）是 company-core 独有的最大增量**，也是缺陷最集中处——全局已知缺陷中有 4 条落在本层。
4. 〔建议〕重写取舍：**domain 纯规则照搬设计、组织域重做写路径、storage 全部经 adapter 重写**（详见 §5）。

## 1. 对账表：能力 × 候选

〔源码事实〕基线：`COMPANY_CORE_CHECKOUT/src` 293 ts 文件、`REPAIR_RELEASE_CHECKOUT/src` 289 ts 文件；本节只对 `domain/` 与 `storage/`。

### 1.1 domain/ 对账（42 vs 39）

| 能力组 | company-core | repair-release | 差异 | 我方取舍 |
| --- | --- | --- | --- | --- |
| 组织/准入 | `organization-records.ts`、`organization-assets.ts`、`organization-departments.ts`、`organization-admission.ts`、`delivery-evidence.ts` | **无** | cc 独有 5 文件 | **保留能力，重做写路径**（见 §5.2） |
| 团队聚合规则 | `team-domain-*.ts`（board/budget/cancel/communication/goal/interaction/mailbox/open-claim/plan/port/projection/public/public-images/roster/shared/visual-assistance/work-activity/work-requests）、`team-domain.ts`、`team-retirement.ts`、`team-skill-policy.ts` | 同 | 一致 | **照搬设计**（纯规则） |
| 任务/attempt | `task-creation.ts`、`graph.ts`、`work-request.ts`、`work-request-validation.ts` | 同 | 一致 | **照搬设计** |
| 状态校验 | `state-validation.ts`、`types.ts` | 同 | 一致 | **照搬设计** |
| 目标生命周期 | `goal-lifecycle.ts`、`goal-transitions.ts`、`goal-validation.ts` | 同 | 一致 | **照搬设计** |
| 记忆准入 | `memory-admission.ts` | 同 | 一致 | **照搬设计** |
| 身份/头像 | `identity-profile.ts`、`pixel-avatar-grid.ts` | 同 | 一致 | **照搬设计** |
| 公共消息/图像 | `public-message.ts`、`public-image-message.ts` | 同 | 一致（但含宿主耦合，见 §2） | **照搬设计 + 去宿主耦合** |
| 视觉协助 | `visual-assistance.ts` | 同 | 一致 | 照搬设计 |
| 错误基类 | `error.ts` | 同 | 一致（含宿主耦合） | **改写**：去 `HarnessError` 依赖 |
| 头像偏好 | **无** | `avatar-preference.ts` | rr 独有 | **保留**（AVATAR-64 相关，纯规则） |
| 团队恢复 | **无** | `team-recovery.ts` | rr 独有（ORG-14 候选） | **评估后决定**；见 §5.3 |

### 1.2 storage/ 对账（14 vs 9）

| 文件 | company-core | repair-release | 差异 | 我方取舍 |
| --- | --- | --- | --- | --- |
| `team-spec.ts` | ✓ | ✓ | cc:346 vs rr:333（行号位移） | 照搬设计 |
| `storage-domain-team-store.ts` | ✓ | ✓ | 一致 | **改写**（宿主耦合最重） |
| `member-private-memory.ts` | ✓ | ✓ | 一致 | **改写**（宿主耦合） |
| `member-private-memory-operations.ts` | ✓ | ✓ | 一致 | 评估 |
| `skills-management.ts` | ✓ | ✓ | 一致 | **改写**（宿主耦合） |
| `skills-release-tables.ts` | ✓ | ✓ | 一致 | 照搬设计 |
| `team-retirement-store.ts` | ✓ | ✓ | 一致（含 facility 回退缺陷） | **改写** |
| `team-store.ts` | ✓ | ✓ | 一致 | 照搬（只读遗留 reader） |
| `workflow-run-overlay.ts` | ✓ | ✓ | 一致 | **改写**（宿主耦合） |
| `company-writer-lease.ts` | ✓ | **无** | cc 独有 | **重做**（见 §5.1） |
| `company-writer-media.ts` | ✓ | **无** | cc 独有 | **重做** |
| `company-writer-recovery.ts` | ✓ | **无** | cc 独有 | **重做** |
| `company-writer-recovery-entry.ts` | ✓ | **无** | cc 独有 | **重做** |
| `company-writer-store.ts` | ✓ | **无** | cc 独有 | **重做**（唯一 commit 前门） |

〔源码事实〕**差在哪 5 个**：`company-writer-{lease,media,recovery,recovery-entry,store}.ts`——即完整的跨进程单写者 lease/fence 家族。`repair-release` **完全没有**该家族，其 `storage/` 是 `company-core` 的真子集（差集为 0 反向）。

〔推断〕这解释了为何两份候选「互为分叉、无一方是超集」：**storage 层 cc ⊃ rr，domain 层 cc ⊅ rr 且 rr ⊅ cc**。组织域与 fence 家族只在 cc，头像偏好与团队恢复只在 rr。因此**不能选单一基线**，必须三方对账。

## 2. domain 文件清单：纯规则 vs 宿主耦合

〔源码事实〕`domain/` 中引 `@deepseek-ai` 的**恰好 5 个文件、共 8 处**：

| 文件 | 行 | 引入 | 耦合程度 | 重写处置 |
| --- | --- | --- | --- | --- |
| `error.ts` | :1 | `HarnessError` from `dsh-llm` | 仅基类 | 换成自有错误基类，1 行改动 |
| `organization-records.ts` | :14 | `defineDomain`、`domainTable` from `dsh-storage-domain` | 仅 schema 声明 | 经 adapter 转接；表结构本身可照搬 |
| `organization-departments.ts` | :21,:22 | `type Context`（cordis）、`defineDomain/domainTable/Domain/DomainFacility` | schema + `ctx.storageDomain` 回退 | **改写**：删 `ctx` 回退，只收 facility |
| `organization-assets.ts` | :32,:33 | `type Context`、`type Domain/DomainFacility` | schema + `ctx` 回退 + 锁 | **改写**：见 §5.2 |
| `public-image-message.ts` | :5,:6 | `type ImageAttachmentRef`、`textOnlyImageText` | 附件类型 + 文本抽取 | 保留类型契约，函数经 adapter |

〔源码事实〕其余 **37 个** domain 文件**零** `@deepseek-ai` import → 纯规则，可直接作为重写的设计来源。

〔建议〕按能力分组（均可照搬设计）：团队聚合 18 个 `team-domain-*.ts`、任务/图 4 个、目标 3 个、状态/类型 2 个、记忆 1 个、身份/头像 2 个、公共消息 2 个、视觉协助 1 个、退休 1 个、技能策略 1 个。

## 3. 行为契约清单

### 3.1 domain 名与表（唯一 opener 规则）

〔源码事实〕storage 层 5 个 domain spec：

| domain name | version | 表 | 声明位置 | 作用 |
| --- | --- | --- | --- | --- |
| `agent_swarm` | 1 | `teams`、`migration_receipts` | `team-spec.ts:22/:24/:346-353` | 团队聚合（唯一写权威） |
| `agent_swarm_retirement` | 1 | `operations` | `team-retirement-store.ts:24-25` | 退休收据 |
| `agent_swarm_member_private_memory`（见 :96-100） | 1 | `memories` | `member-private-memory.ts:96-100` | 成员私有记忆 |
| （见 `skills-management.ts:185-194`） | — | `requests`/`consumers`/`manager`/`releases`/`assignments`/`candidates` | `skills-management.ts:185-194` | 技能管理 6 表 |
| （见 `workflow-run-overlay.ts:79-83`） | — | `runs` | `workflow-run-overlay.ts:79-83` | 工作流运行叠加 |

〔源码事实〕domain 层另有 2 个组织 domain spec：

| domain name | version | 表 | 声明位置 |
| --- | --- | --- | --- |
| `org_personal_assets` | 2 | `employees`、`appointments`、`asset_versions`、`asset_currents`、`execution_bindings` | `organization-records.ts:17/:35/:247-257` |
| `org_departments` | 1 | `departments` | `organization-departments.ts:25/:26/:96-102` |

〔源码事实〕**不变量（opener 唯一）**：DSH `storage-domain` 在 `packages/storage/storage-domain/src/index.ts:105` 对已打开的 domain name 抛 `already-open`。**写权威的强制单位是 domain name，不是包。**

〔源码事实〕**revision CAS 单元**：`TeamState` 单记录含 `revision`（`domain/types.ts:363-419`，`revision` 在 :368）；`team-spec.ts:350` 把整个聚合存为 `teams` 表一条记录；`teamRecordOf` = `structuredClone(team)`。→ 成员/任务/尝试/消息/预算/记忆与 `revision` **同记录**，不可按名词拆分。

### 3.2 org_personal_assets 失败边界

〔源码事实〕`organization-assets.ts` 的错误码族（`deny(...)`）：`ORG_INPUT_INVALID`、`ORG_EMPLOYEE_UNKNOWN`、`ORG_SESSION_UNBOUND`、`ORG_APPOINTMENT_UNKNOWN`、`ORG_APPOINTMENT_EMPLOYEE_MISMATCH`、`ORG_APPOINTMENT_NOT_ACTIVE`、`ORG_SESSION_ALREADY_BOUND`；另有 `assertOpen()` 守卫。

〔源码事实〕**关键不变量**：session→employee 是**全域单绑定**（`bindEmployeeSession` :124 用 `GLOBAL_BIND_LANE` 串行化整个 authority，:127 检测 foreign binding），注释 :59-65 明示「WHOLE-AUTHORITY fact」。

〔源码事实〕**准入判定顺序**（`organization-admission.ts:128-139`）固定为：legacy passthrough → binding identity → appointment currency → onboarding → operation UNKNOWN → writer gate；`AdmissionDecision` 三态 `allow`/`deny`/`unknown`（:110-113）。

### 3.3 失败边界：facility 回退

〔源码事实〕`organization-assets.ts:78` `const source = input.facility ?? input.ctx?.storageDomain`——当 `facility` 缺省时回退到 `ctx.storageDomain`，**绕过公司 lease**。

〔源码事实〕**同类缺陷不止一处**（本次新发现，超出全局清单）：
- `organization-departments.ts:159` `const source = input.facility ?? input.ctx?.storageDomain`
- `team-retirement-store.ts:70` `const source = facility ?? ctx.storageDomain`
- `runtime/retirement-data.ts:17` `await (facility ?? ctx.storageDomain).open(...)`

〔推断〕这是**一处被复制的模式**而非孤立 bug：至少 4 处回退点。重写时应在类型层取消 `ctx` 分支（facility 必填），而非逐处打补丁。

## 4. 重写要点

### 4.1 可直接照搬设计（纯规则，零宿主耦合）

〔源码事实〕37 个无官方 import 的 domain 文件，含：任务图与依赖（`graph.ts`）、任务创建（`task-creation.ts`）、工作请求校验（`work-request-validation.ts`）、目标生命周期与转换（`goal-*.ts`）、状态校验（`state-validation.ts`）、记忆准入（`memory-admission.ts`）、身份与 64 头像网格（`identity-profile.ts`、`pixel-avatar-grid.ts`）、团队聚合 18 个 `team-domain-*.ts`、技能策略（`team-skill-policy.ts`）、退休（`team-retirement.ts`）、视觉协助（`visual-assistance.ts`）。

〔建议〕照搬的是**规则与不变量**（CAS、fence 语义、DAG 校验、状态机转换），不是文件布局；重写时按 SoloIPs 的模块边界重新归置。

### 4.2 必须改写

见 §5。核心三类：(a) 全部 `storage/` 官方 import 经 adapter；(b) 组织域写路径重做；(c) 删除全部 `ctx` 回退与进程内锁。

### 4.3 候选已知缺陷（不要继承）

见 §5，逐条给出位置与替代设计。

## 5. 必须改写：候选缺陷与替代设计

### 5.1 【全局缺陷·本层】facility 回退可绕过 lease

〔源码事实〕`organization-assets.ts:78`（另见 §3.3 三处同类）。
〔推断〕后果：调用方只要不传 `facility`，就可用任意 `ctx.storageDomain` 打开 `org_personal_assets`，绕过 `CompanyWriterLease` 的独占窗口。
〔建议〕替代设计：**opener 只接受显式 facility/lease token**，类型上不提供 `ctx` 分支；在 adapter 层把「打开 domain」与「持有 lease」绑定为单一入口。

### 5.2 【全局缺陷·本层】进程内锁 + 未走 commit

〔源码事实〕`organization-assets.ts:58` `private readonly locks = new Map<string, Promise<void>>()`，注释自述「Process-local per-employee serialization (explicitly NOT cross-process)」。
〔源码事实〕该 service 内**恰好 7 条** `withLock` 写路径，全部直接 `.put()`，无一经过 `CompanyWriterStore.commit`：
`:124→140`（bindEmployeeSession→employees.put）、`:160→170`（appointments.put）、`:189→194`（employees.put）、`:208→210`（appointments.put）、`:273→294`（bindings.put）、`:337→355`（versions.put）、`:380→399`（currents.put）。
〔源码事实〕`domain/` 目录内对 `CompanyWriterStore` 的引用数 = **0**。
〔推断〕组织域的写路径**整体未接入跨进程 fence**；进程内锁只防同进程并发，对第二 Host 无效（违反 ORG-06）。
〔建议〕替代设计：所有组织域写入必须经单一 commit 前门（`commit(publish)` 在 `withFileLock` 内二次校验 recovery window 与 fence）；进程内锁仅作性能优化，不作为正确性依据。

### 5.3 【全局缺陷·本层】ORG-03 准入不完整 + LEGACY_UNBOUND 旁路

〔源码事实〕`organization-assets.ts:232-241` 的 `getEmployeeOnboardingGaps` **只检查两项**：`profileRef === undefined` → `'profile-missing'`；`avatarText === undefined` → `'avatar-missing'`。未覆盖 ORG-03 要求的 SOUL/性格、OPERATING/操作规范、记忆初始化、岗位能力、版本读回、实际请求装配。
〔源码事实〕`organization-admission.ts:139` 在 `binding === undefined` 时直接返回 `{ state: 'allow', reasonCode: 'ORG_ALLOW_LEGACY_UNBOUND' }`；该 reasonCode 在 :111 的类型里是正式取值。
〔推断〕未绑定 Session 走 legacy 直通，完全不查询 onboarding gaps（`runtime/execution-admission-provider.ts:144` 仅在 `binding !== undefined` 时采样）。即「无绑定」= 免检。
〔建议〕替代设计：ORG-03 准入需覆盖 02-company-contract.md:201 全部必需项；`ORG_ALLOW_LEGACY_UNBOUND` 在新入口中**不保留**（架构 §4 已记为「必须在正式业务入口启用前修正」）。

### 5.4 【全局缺陷·本层】storage 层官方耦合 15 处

〔源码事实〕`storage/` 14 文件中 9 个引官方包，共 15 处 import：`company-writer-lease.ts`(withFileLock/writeFileAtomic)、`company-writer-recovery-entry.ts`(writeFileAtomic)、`company-writer-store.ts`(withFileLock/writeFileAtomic)、`member-private-memory.ts`(Context/defineDomain/domainTable/Domain)、`skills-management.ts`(Context/defineDomain/domainTable/Domain/KvTable)、`team-retirement-store.ts`(Context/defineDomain/domainTable/Domain/DomainFacility)、`storage-domain-team-store.ts`(Context/Domain/DomainChanged)、`workflow-run-overlay.ts`(Context/defineDomain/domainTable/Domain)、`team-spec.ts`(defineDomain/domainTable)。
〔建议〕替代设计：全部经 `soloips-adapter-dsh` 转接；`defineDomain/domainTable` 属官方公开 seam 可保留语义，但 import 路径须收敛到 adapter 单一出口。

### 5.5 【本层新发现】重复的进程内锁模式

〔源码事实〕`new Map<string, Promise<...>>()` 作为串行锁的模式在 src 下**至少 17 处**（本层 `organization-assets.ts:58`、`storage-domain-team-store.ts:53/:130/:142`、`human/human-interaction-store.ts:58`、`skills/module.ts:87` 等）。其中 `storage-domain-team-store.ts:142` 已用 `sharedTeamLocks` 按 domain 共享（正确做法），其余多为 per-instance。
〔推断〕per-instance 锁在「同一 domain 多实例」时失效；`organization-assets.ts:58` 正是 per-instance。
〔建议〕重写时统一为一个「按 domain facility 共享」的锁设施（`WeakMap<DomainFacility, Locks>`），禁止 per-instance 锁承担正确性。

### 5.6 【本层新发现】team-retirement-store 的 facility 回退

〔源码事实〕`team-retirement-store.ts:70` 同 §5.1 模式；该 store 提供 `assertTeamWritable`/`teamIsRetired`（:29-34）作为跨域 fail-closed 栅栏，但自身 opener 可被绕过。
〔建议〕与 §5.1 合并修复；栅栏设计本身**应保留**（跨域一致性范式正确）。

## 6. 证据标注与复核范围

**〔源码事实〕** 本文所有行号均于 2026-09-16 只读核对两份 checkout。已实际打开：`domain/` 与 `storage/` 的**文件名全集**（glob）、`organization-records.ts:244-257`、`organization-departments.ts:93-102`、`organization-assets.ts:50-82/:119-140/:225-254`、`organization-admission.ts:100-149`、`team-spec.ts:22/:24/:346-353`、`team-retirement-store.ts:24-25/:70`、`member-private-memory.ts:96-100`、`skills-management.ts:185-194`、`workflow-run-overlay.ts:79-83`、5 个 writer 家族文件头。

**〔未验证〕** 未运行、未构建、未做故障注入；`already-open` 与 fence 的**运行期**行为未实测，仅据源码契约。未读：`domain/` 37 个纯规则文件的**正文**（仅据 glob 清单与能力命名分类）、`storage/` 各文件的完整实现、`runtime/` 与 `client/` 层。

**无法核对**：候选的实际安装版本与本文 checkout 是否一致（`docs/operations/environment-handoff.md` 的符号真值未逐项比对）；两份候选的 MIT 许可范围与派生义务（属法律判断，非技术复核）。

**〔推断〕** §3.3 的「被复制的模式」、§5.5 的「per-instance 锁失效」为基于多处同类代码的推断，未构造反例验证。
