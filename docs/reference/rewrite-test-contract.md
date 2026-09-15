# SoloIPs 重写参考 · 测试即行为契约

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | SOLOIP-REF-TEST-CONTRACT；两份候选测试资产的重写参考与交叉核验记录 |
| 目的 | 让重写者不读候选测试全量源码，也能拿到：测试拓扑、可复用的行为契约清单、测试基础设施形态、不可继承的测试，以及对其余成员结论的独立复核 |
| 范围 | `COMPANY_CORE_CHECKOUT/tests/`（330 资产）与 `REPAIR_RELEASE_CHECKOUT/tests/`（325 资产）；外加对 `docs/reference/rewrite-domain-storage.md`、`docs/reference/rewrite-seam-client.md` 关键论断的核验。不含 src 实现细节与产品需求正文 |
| 决策状态 | 〔源码事实〕为只读观察；〔推断〕含假设；〔未验证〕为证据缺口。本文不构成实施许可 |
| 证据范围 | 2026-09-16 只读复核两份候选 checkout（同属 `dsh-agent-swarm` 0.1.5、private、MIT）。**未运行任何测试、未构建、未启动宿主**；行号相对各自 checkout 根 |
| 依据 | `docs/governance/agent-readable-documentation.md`（SOLOIP-DOC-001）；`docs/operations/environment-handoff.md` ENV-02（符号真值）；`docs/technical-architecture.md` 第 11 章验收合同 |
| 变更权 | 队长合并入唯一正文；写者不单独改本文结论 |

## 0. 结论摘要

1. **测试资产是「行为规格」而不是「可搬运代码」。** 〔源码事实〕两候选测试都用白盒相对导入（`../src/...`）直接引用私有模块：COMPANY_CORE 的 `tests/` 内此类导入命中 **780 处**。重写时只能提取**不变量与判定**，不能照搬文件。
2. **测试拓扑是单一层的。** 〔源码事实〕两候选的 `vitest.config.ts` 完全相同：`include: ['tests/**/*.spec.{ts,tsx}']`、`exclude: ['ref/**','node_modules/**','lib/**']`、`testTimeout: 10_000`。**没有**单元/契约/集成/e2e 的目录分层——分层靠文件命名与 helper 选择，不靠目录。
3. **真正不可替代的资产是「真实多进程」与「真实组合」两类。** 〔源码事实〕COMPANY_CORE 独有 19 个 spec 中，`company-writer-*` 5 个文件构成完整跨进程 fence 验收（`company-writer-dual-process.spec.ts` 单例 timeout 90_000ms、`company-writer-recovery-matrix.spec.ts` 为矩阵驱动）；REPAIR_RELEASE 独有 14 个 spec 中 `team-recovery.spec.ts` 是 ORG-14 的唯一行为规格。
4. **候选缺陷被测试「钉住」了。** 〔源码事实〕`ORG_ALLOW_LEGACY_UNBOUND` 旁路在 `tests/org-admission.spec.ts:64-66` 被断言为**期望行为**；`admission-loop.spec.ts:284` 进一步断言「未绑定 legacy lane 在有门禁时仍能上座」。这些测试**不得继承**，重写时必须反向断言。
5. 〔建议〕重写策略：**契约清单照抄语义，测试代码重写**；跨进程/恢复/准入三类优先建等价验收（技术架构 SOLO-ACC-02/05/09/10），UI 类测试整体放弃（首版复用 DSH Web）。

## 1. 对账表：测试资产 × 候选

〔源码事实〕基线：`COMPANY_CORE_CHECKOUT/tests` 330 个资产；`REPAIR_RELEASE_CHECKOUT/tests` 325 个。

| 资产类别 | company-core | repair-release | 差异 | 我方取舍 |
| --- | --- | --- | --- | --- |
| `.spec.ts`（node 侧） | 262 | 257 | CC 独有 19、RR 独有 14（见 §1.1） | 按能力取并集，逐条重写 |
| `.spec.tsx`（React 组件） | 26 | 28 | RR 多 2 | **整体放弃**（CLIENT-D1：UI 只做投影） |
| `tests/helpers/` | 39 | 37 | CC 多 `company-writer-child-driver.ts`、`company-writer-process.mjs` | 只借鉴 harness 形态，重写 |
| `__snapshots__/` | 1（`prompt-snapshot.spec.ts.snap`，103 行） | 1 | 相同 | **不继承**：锁的是候选提示词原文 |
| 非 helper 的裸 `.ts` fixture | 2（`goal-browser-draft.ts`、`jobs-bridge-shared.ts`） | 2 | 相同 | 按需重写 |
| `it(` 用例数 | 1185 | 1139 | CC 多 46 | 参考覆盖率分布，不追求数量对齐 |
| 目录层级 | `tests/` + `helpers/` + `__snapshots__/` | 同 | 相同 | 重写建议按 DEV-11 分层命名 |

〔源码事实〕`it(` 统计口径：对 `tests/` 全树匹配 `^\s+it\(`；COMPANY_CORE 1185、REPAIR_RELEASE 1139。`describe(` 分别为 269 / 未单独统计。

### 1.1 独有测试清单（能力增量所在）

〔源码事实〕**仅 COMPANY_CORE 存在（19）**：`admission-loop`、`company-recovery-boot`、`company-stack-apply`、`company-stack-lifecycle`、`company-writer-dual-process`、`company-writer-lease`、`company-writer-official-composition`、`company-writer-recovery-matrix`、`delivery-evidence`、`gate-receipt-link`、`org-admission`、`org-assembly`、`org-assets-migration`、`org-assets-repair`、`org-departments`、`org-foundation-schema`、`org-frontdoor`、`org-personal-assets`、`personal-version-carrier`。

〔源码事实〕**仅 REPAIR_RELEASE 存在（14）**：`avatar-preference`、`captain-initial-turn-delivery-boundary`、`member-profile-own-events`、`persistence-read-fixture-offset`、`pixel-avatar-grid-refusal`、`public-chat-directory-stale-retry`、`read-outcome-host`、`restore-config-reachable`、`restore-production-reachability`、`team-dashboard-poll-suppression`、`team-read-outcome`、`team-recovery`、`team-recovery-entry`、`team-roster-projection`。

〔推断〕这与 domain/storage 层对账一致：**CC 独有 = 组织域 + fence 家族；RR 独有 = 头像偏好 + 团队恢复 + 读投影/UI 韧性**。两份测试资产同样「互为分叉、无一方是超集」，不能选单一基线。

## 2. 测试拓扑

### 2.1 分层（按目录/能力，不按测试类型）

〔源码事实〕`tests/` 是**扁平单层目录**：262 个 `.spec.ts` 直接位于 `tests/` 根下，仅 `helpers/`（39）与 `__snapshots__/`（1）为子目录。**不存在** `unit/`、`contract/`、`integration/`、`e2e/` 目录。

〔源码事实〕按文件名归类（COMPANY_CORE，一个文件可落入多族）：

| 能力族 | 文件数 | 代表文件 |
| --- | ---: | --- |
| 团队/任务/目标 | 65 | `directed-scheduling`、`goal-lifecycle-domain`、`team-domain-*` |
| 身份/头像/名册 | 42 | `identity-context`、`pixel-avatar-grid-refusal`(RR)、`team-roster-projection`(RR) |
| 存储/恢复/迁移 | 29 | `migration`、`activation-restart-194`、`company-recovery-boot`(CC) |
| 技能/私有记忆 | 29 | `member-private-memory-*`、`member-assigned-skills-*` |
| RPC/Host/会话 | 26 | `host-read-service`、`read-rpc-harness`、`child-transport-maintenance` |
| 组织/准入 | 24 | `org-admission`、`org-frontdoor`、`admission-loop`（均 CC 独有） |
| 工具/执行/审核 | 20 | `execution-guard-*`、`executable-review`、`execution-roots` |
| 客户端/UI | 14（+26 tsx） | `public-chat-*`、`team-dashboard-*` |
| 预算/用量 | 6 | `budget-family`、`usage-settlement-recovery` |
| 其他（未归类） | 40+ | `mail-*`、`human-*`、`permission-*`、`official-*` |

### 2.2 哪些测试需要真实宿主

〔源码事实〕**需要真实 DSH 宿主/组合（18 个文件、32 处挂载点）**：命中 `node-composition` / `mountCompanyStack` 的 spec，包括 `company-stack-lifecycle`、`delivery-evidence`、`admission-loop`、`dedicated-captain`、`company-recovery-boot`、`communication-control-tools`、`identity-context`、`list-managed-teams`、`managed-multiteam-switch-403`、`member-recruit-retry` 等。

〔源码事实〕**需要真实多进程（10 个文件、19 处 spawn/child_process）**：`company-writer-dual-process.spec.ts`（4 例，timeout 90_000ms）、`company-writer-recovery-matrix.spec.ts`（矩阵驱动）、`company-writer-official-composition.spec.ts`、`public-images-browser`、`retirement-browser` 等。

〔源码事实〕**标记为「real composition」的命中 82 处、分布在 57 个文件**，是两候选最大的集成测试群。

〔源码事实〕**纯规则单元测试**：`org-admission.spec.ts` 的 admission 表（`:61-114` 表驱动）、`persistence-read-fixture-offset.spec.ts`（4 例纯函数）等，不需要宿主。

### 2.3 测试基础设施

〔源码事实〕运行方式：`package.json` 只有 `"test": "vitest run"`（CC :75、RR :74），**没有** unit/integration/e2e 分档脚本；`vitest.config.ts` 两候选逐字相同；coverage 只含 `src/**`。

〔源码事实〕`tests/helpers/` 39 个（CC）：`company-writer-child-driver.ts`、`company-writer-process.mjs`（子进程驱动，含 `child_process` + `mkdtemp`）、`node-composition.ts`、`gated-composition.ts`、`restart-real-composition.ts`、`read-rpc-harness.ts`、`storage-stack.ts`、`startup-recovery-fixture.ts`、`maintenance-recovery.ts`、`persistence-read-fixture.ts` 等；UI 侧另有 `dashboard-ui.tsx`、`sidebar-harness.ts`、`public-chat-ui.ts`。

〔源码事实〕**golden/快照资产只有 1 个**（`__snapshots__/prompt-snapshot.spec.ts.snap`）；`tests/` 下**没有** `.json` fixture 目录。→ 两候选的回归保护主要靠**行为断言**而非 golden 文件，与技术架构 SOLO-REG-01/02 要求的 dump golden 不重合（后者面向 profile 组合，不在本层）。

〔源码事实〕真实文件系统是硬依赖：`tests/helpers` 内 `node:fs` 命中 13 处、`mkdtemp` 命中 18 处（集中在 `company-writer-process.mjs`）；未使用 `realpath`。

## 3. 行为契约清单（可复用语义）

每条格式：**不变量 → 参考位置（仅作证据） → 输入/输出形状 → 失败边界 → 重写必须覆盖的理由**。全部为〔源码事实〕（只读核对到行），**未执行**。

| ID | 不变量 | 参考位置 | 输入/输出形状 | 失败边界 | 重写理由 |
| --- | --- | --- | --- | --- | --- |
| TC-01 | **跨进程单写者**：同一 canonical root 上第二个真实进程被拒 | `company-writer-dual-process.spec.ts:65`（timeout 90_000） | `{root}` → 第二进程 acquire 失败 | 拒绝即无副作用 | ORG-06 / SOLO-ACC-09 的**唯一**真实多进程证据 |
| TC-02 | **失权旧 writer 在提交点被 fence** | 同上 `:91`、`:186` | 旧 holder 句柄 → commit 抛错 | 不得在 publish 之后才拒绝 | 重写时提交点必须与 fence 检查同序 |
| TC-03 | **崩溃接管不双写、不复活** | 同上 `:128` | 崩溃 holder → 接管 | 记录不重复、不复活 | SOLO-ACC-06 恢复验收的语义来源 |
| TC-04 | **dispose 是真 disposer**：不再写、root 交还 | 同上 `:161` | dispose → 下一 writer 可接管 | 旧回调不得提交 | DEV-06 生命周期要求 |
| TC-05 | **提交窗口不可被接管插入** | `company-writer-lease.spec.ts:136`、`:218` | 暂停的 commit 窗口 + 接管 | 窗口内接管必须被拒且不发布 | 与 TC-01/02 同源，进程内可先验 |
| TC-06 | **恢复窗口是 maintenance stop**：新 acquire/commit 被拒，直到关闭 | 同上 `:174`、`:200`、`:242` | 残留窗口 → 在线路径 fail closed | 只有离线维护入口可恢复 | 技术架构 §7.10 fence 落点 |
| TC-07 | **fence 证据不得被洗白**：形状合法的旧收据仍被拒 | `gate-receipt-link.spec.ts:99,110,141,165` | 收据快照 → 验证器 | 世代/协议不符即拒 | 防「协议形状即通过」的假门禁 |
| TC-08 | **准入判定顺序固定**：legacy → identity → appointment → onboarding → UNKNOWN → writer gate | `org-admission.spec.ts:61-114`；实现 `organization-admission.ts:128-139` | `AdmissionInput` → `{state, reasonCode, hint}` | 每个非 allow 必须带 code + reason + 可修复提示 | ORG-03/ORG-05 的判定表就是验收口径 |
| TC-09 | **身份相等 ≠ 同一 Session**：同一员工不同 Session / 不同 appointment 代际必须拒 | `org-admission.spec.ts:164-178` | 绑定 vs claim 命名 | `ORG_IDENTITY_MISMATCH` | 「模型传 employeeId 不是凭据」的机制保证 |
| TC-10 | **写门禁是证据产物，不是布尔**：缺字段/伪造/不可回读一律拒 | 同上 `:118-160` | gate evidence → durable re-read | `ORG_GATE_UNEVIDENCED` / `UNVERIFIED` / LIMITED | 防「assigned 标志即就绪」 |
| TC-11 | **Session→员工是全域单绑定** | `org-assets-repair.spec.ts:190`、`org-foundation-schema.spec.ts:310` | 两员工并发绑定同一 Session | 恰好一个成功，持久层只留一条 | ORG-05 占用权威的前提 |
| TC-12 | **CAS 提升失败不得假报生效** | `org-personal-assets.spec.ts:180`、`:196` | 版本体 + 摘要 → 指针提升 | 冲突保留候选、不报 live | 个人资产保存的真实性要求 |
| TC-13 | **128/129 码点边界 + 超容量在写前拒** | `org-foundation-schema.spec.ts:128,144,163,195` | 名册/会话字段 | 超界在 put 之前拒 | schema 边界与 ORG-03 头像/资料校验同族 |
| TC-14 | **迁移必须读回校验、保留收据、不动源** | `migration.spec.ts:80,123,145,164,184` | 旧聚合 → 新目标 | 目的地非空/收据缺记录即中止 | 技术架构 SOLO-DATA-03/04 的迁移口径 |
| TC-15 | **交付证据列诚实**：submitted 未审 → acceptance 为 unknown，不得编造 | `delivery-evidence.spec.ts:72,97,107,123,132` | attempt 行读回 → 两列 | 无通道可表达「已发布」 | 反面声明「提交 ≠ 验收」的机制化 |
| TC-16 | **结构锁步**：src 内 attempt 创建点恰好两处，第三处即红 | `org-frontdoor.spec.ts:212-213` | 源码结构断言 | 新增旁路即失败 | ORG-11「不保留旧旁路」的可执行化 |
| TC-17 | **第二 company stack / 不同 json root 被拒** | `company-stack-lifecycle.spec.ts:101,128,137,147` | Context + root → mount | 拒绝前不得触碰声明根 | 与 SEAM-10–14 的装配顺序契约配对 |
| TC-18 | **执行根隔离**：两并行 attempt 根互不污染，无仓库时降级为临时目录 | `execution-roots.spec.ts:109,141,204,218` | `{workspace, team, task}` → root | 外来占用者 fail loud | 执行根与长期资产分离（DEPT-04） |
| TC-19 | **持久读偏移语义**：中段偏移只回尾部，末尾/越界不回绕 | `persistence-read-fixture-offset.spec.ts:15-31`(RR) | `{offset}` → 事件切片 | 越界返回空 | 读投影分页的边界 |
| TC-20 | **头像网格拒绝必须自描述**：报实际行数/宽度/字符/调色板规则 | `pixel-avatar-grid-refusal.spec.ts:36-99`(RR) | 网格 payload → 拒绝原因 | 拒绝时零写入 | AVATAR-64-01 的验收口径 |
| TC-21 | **误归档恢复**：只恢复 cleanup 签名，拒绝故意归档/陈旧 revision/已退役 | `team-recovery.spec.ts:103-240`(RR) | Team id + CAS revision | 幂等（同 operationId 不重复决定） | ORG-14 候选的唯一行为规格 |
| TC-22 | **读结果分类诚实**：forbidden / transport / stale / moved-revision 分开 | `team-read-outcome.ts` + `team-read-outcome.spec.ts`(RR) | 读结果 → 分类 | 重试只用于可能变化的条件 | CLIENT-K1 的测试侧证据 |

## 4. 重写要点

### 4.1 可直接照搬的**语义**（不照搬代码）

- TC-08/09/10 的**判定顺序与错误码族**：这是 ORG-03/05 最完整的可执行口径，重写应保持同序同码。
- TC-01–06 的**场景设计**（谁在什么时刻被拒、拒绝后是否留痕）：这是 SOLO-ACC-09/10 的场景来源。
- TC-11–15 的**「读回才算数」范式**：每次写入断言「durable read-back」，而非仅断言返回值。

### 4.2 必须改写

- **所有测试都从白盒相对导入改为公开契约导入**。〔源码事实〕COMPANY_CORE `tests/` 内 `../src/...` 命中 780 处；直接搬运会把候选的私有模块结构固化进 SoloIPs。
- **测试分层**：候选只有扁平 `tests/`；重写按 DEV-11 的变更类型分档（单元/契约/集成/Host），并给出分档命令（候选只有 `vitest run` 一条）。
- **golden 缺失**：候选只有 1 个提示词快照；技术架构 SOLO-REG-01/02 要求的 L1/L2 dump golden 在本层**没有**对应资产，须新建。
- **10s 默认超时**：真实多进程用例已在候选内用 90_000ms 覆盖；重写的 fence 类用例必须显式声明超时，否则会被默认值误杀。

### 4.3 候选的已知缺陷（**不要继承**，测试层同样适用）

| 缺陷 | 测试层证据 | 重写要求 |
| --- | --- | --- |
| `ORG_ALLOW_LEGACY_UNBOUND` 旁路 | `org-admission.spec.ts:64-66` 把它断言为 **allow**；`admission-loop.spec.ts:284` 断言未绑定 lane **仍能上座** | 反向断言：无绑定必须 deny；这两条测试**禁止搬运** |
| `facility ?? ctx.storageDomain` 回退（可绕过 lease） | `tests/` 内 `storageDomain:` 显式注入命中 **0 处** → 该回退**无测试保护** | 重写必须补「facility 缺失即拒绝」的负例（`organization-assets.ts:78`、`organization-departments.ts:159`、`team-retirement-store.ts:70`、`runtime/retirement-data.ts:17`、`plugin/apply.ts:271/353`） |
| `organization-assets.ts:58` 进程内 `Map` 锁 | `company-writer-lease.spec.ts` 自述 **in-process lifecycle**（17 例中 14 例带此语境） | 进程内锁测试只作**前置冒烟**；跨进程结论只认 `company-writer-dual-process.spec.ts` 一类 |
| `withLock` 旁路单一 commit 点 | `organization-assets.ts` 内 `withLock` 命中 7 处（:124,160,189,208,273,337,380），`CompanyWriterStore`/`commit` 命中 **0 处** | 重写测试须断言「所有写路径经唯一 commit」——可用结构锁步断言（参考 TC-16 范式） |
| `captureWorktreeDiff` 只捕获 Git 差异 | `execution-roots.spec.ts:165,182` 只断言 patch 内容与失败 | 素材保存验收须断言**真实字节 + 版本读回**，不能复用该断言 |

### 4.4 不可继承的测试（明确清单）

1. `__snapshots__/prompt-snapshot.spec.ts.snap`（锁候选提示词原文）。
2. `org-admission.spec.ts:64-66`、`admission-loop.spec.ts:284`（把旁路当契约）。
3. 26 个 `.spec.tsx` UI 组件测试（CLIENT-D1：首版复用 DSH Web，界面整体重写）。
4. 依赖候选私有模块路径的断言（780 处相对导入所在的文件全部需要改写）。
5. 任何断言 `dsh-agent-swarm` 包名/事件源字符串的用例（`tests/` 内 26 处 `'dsh-agent-swarm'` 字面量）。

## 5. 交叉核验（对另两名成员结论的独立复核）

复核方式：直接在候选 checkout 内重数、重定位。**5 处一致，1 处口径需注明，2 处新增。**

| # | 被核验论断 | 我的复核结果 | 判定 |
| --- | --- | --- | --- |
| 1 | domain/ 42 vs 39；storage/ 14 vs 9；storage 差集恰为 5 个 `company-writer-*` | 实测 42/39、14/9；差集 = `company-writer-{lease,media,recovery,recovery-entry,store}.ts`；反向差集 0 | **一致** |
| 2 | domain/ 5 文件引官方包、共 8 处 | 实测 5 文件；文本命中 9 处，其中 `organization-records.ts:23` 是**注释**（`NOT assumed`），实际 import 8 处 | **一致**（口径需注明：数 import 而非数命中） |
| 3 | storage/ 9 文件引官方包、共 15 处 | 实测 9 文件；文本命中 17 处，其中 `company-writer-lease.ts:7`、`storage-domain-team-store.ts:76` 为注释 → 实际 import 15 处 | **一致**（同上口径） |
| 4 | `team-spec.ts` cc:346 vs rr:333 | `export const teamDomainSpec` 在 CC:346、RR:333 | **一致** |
| 5 | facility 回退不止一处（peer 新发现 3 处） | 确认 `organization-departments.ts:159`、`team-retirement-store.ts:70`、`runtime/retirement-data.ts:17` | **一致** |
| 6 | （peer 未列） | **新增 2 处**：`plugin/apply.ts:271`、`:353` 的 `companyStack?.domainFacility ?? ctx.storageDomain` | **补充** |
| 7 | `organization-assets.ts:58` 为进程内 Map 锁；≥7 处 `withLock` 未走 commit | 确认 :58 为 `new Map<string, Promise<void>>()`；`withLock` 7 处；该文件内 `CompanyWriterStore|commit` 命中 0 | **一致** |
| 8 | 唯一 opener（`already-open`）是写权威强制单位 | **测试层无覆盖**：`tests/` 全树搜 `already-open` 命中 **0 处**；相关语义只由 `company-stack-lifecycle.spec.ts:147`（第二个生命周期在同一介质上被拒）间接覆盖 | **新增缺口** |
| 9 | client 层 70 vs 76 文件、RR 多 6 个纯读模型 | 本轮**未复核**（超出测试资产范围） | 未核 |

〔推断〕第 8 条意味着：技术架构 SOLO-ACC-02（第二个 opener 必须失败）在候选测试中**没有**直接对应用例，重写时必须新建——这是本次核验对验收合同的净增量。

## 6. 待补与边界

- **第 4 项（交叉核验）已完成**：两名成员的参考文档（`rewrite-domain-storage.md`、`rewrite-seam-client.md`）在我开工时已落盘，故未留待补。client 文件计数（上表第 9 行）未复核。
- **未执行**：未运行任何测试、未构建、未启动宿主或服务、未做故障注入；所有结论为静态只读。
- **未覆盖**：`ref/` 目录（候选内的参考副本）、`scripts/`、`.github/workflows` 的 CI 编排；两候选的 `lib/` 编译产物。
- **无法核对**：`tests/` 内测试的**实际通过率**（未运行）；REPAIR_RELEASE 的 `SWARM_CHECKOUT` Git 对象损坏问题（`.artifacts/operations/environment.local.md:25` 记录退出码 128）对本目录无影响，但其工作树完整性未验证。
- **登记**：本文为 `docs/reference/` 下的分块草稿，尚未登记进 `document-registry.yaml`；合并入唯一正文时由队长统一处理注册与阅读入口。
