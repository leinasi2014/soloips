# SoloIPs 源码参考：候选复用与重写依据

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | SOLOIP-SRC-REF；"参考重写"路线的候选源码参考正文（分块由成员产出、队长合并） |
| 目的 | 让重写者**不读候选全量源码**即可掌握：可复用规则、行为契约、已知缺陷、取舍结论 |
| 范围 | 两份候选 checkout 的 domain / storage / seam / client / tests 五层；不含 runtime / rpc / tools / host / human / skills 层 |
| 决策状态 | 用户 2026-09-16 决定**参考重写**（不 fork、不整包拷贝）。本文为技术参考，不构成实施许可 |
| 证据范围 | 2026-09-16 只读复核；**未运行、未构建、未做故障注入**。行号相对各自 checkout 根，符号真值见 [环境交接](../operations/environment-handoff.md) |
| 依据 | [文档格式规范](../governance/agent-readable-documentation.md)；[技术架构](../technical-architecture.md) ARCH-D02 |
| 变更权 | 队长（单一写者）；分块正文见 `docs/reference/` 三份 |
| 交付状态 | 〔提案〕——待审后并入注册表 |

## 1. 候选身份与关系（〔源码事实〕）

| 项 | 值 |
| --- | --- |
| 候选 | `COMPANY_CORE_CHECKOUT`（下称 CC）与 `REPAIR_RELEASE_CHECKOUT`（下称 RR） |
| 身份 | 同属 `dsh-agent-swarm` 0.1.5、`private: true`、**MIT 协议** |
| src 规模 | CC 293 个 ts；RR 289 个 ts |
| 关系 | **互为分叉、无一方是超集**（`git merge-base --is-ancestor` 单方向退出码 1） |

**结论**：不能选单一基线，必须**三方对账**（CC / RR / 我方现状）。许可证允许拷贝，但选择参考重写是**设计决定** —— 避免继承候选的已知债（见 §5）。

## 2. 分层资产图（决定重写策略）

| 层 | CC | RR | 宿主耦合 | 重写策略 |
| --- | --- | --- | --- | --- |
| `domain/` | 42 ts | 39 ts | **37/42 纯宿主无关**；代码 import **8 处**（修正：非 9 处） | **最高价值** —— 照读规则、重写实现 |
| `storage/` | 14 ts | 9 ts | 代码 import **15 处**（修正：非 17 处，多出 2 处为注释行） | 必须经 adapter 重写 |
| `plugin/`+seam | — | — | 集中 | **照搬设计**（见 §4） |
| `client/` | 70 ts | 76 ts | React 依赖 | **基本丢弃**（SOLO-02：UI 只做投影） |
| `tests/` | 262 spec.ts + 26 spec.tsx | 257 + 28 | 780 处 `../src/...` 相对导入 | **语义可抄、代码不可搬** |

**层间差集**：
- `storage/`：**rr ⊂ cc**（真子集），CC 独有 **5 个** `company-writer-{lease,media,recovery,recovery-entry,store}.ts` —— 完整跨进程 lease/fence 家族，RR 完全没有
- `domain/`：**互为分叉** —— CC 独有 5 个组织文件（`organization-{records,assets,departments,admission}`、`delivery-evidence`）；RR 独有 2 个（`avatar-preference.ts`、`team-recovery.ts`）
- `client/`：RR 独有 6 个纯读模型 `.ts`；CC 独有 2 个 plugin 文件
- `tests/`：CC 独有 19 spec（`org-*` + `company-writer-*` 全家族）；RR 独有 14 spec（`team-recovery`、`avatar-preference`、`read-outcome`、`roster-projection`）

**对账结论**：**seam 取 CC、读模型口径取 RR**。

## 3. 行为契约要点

完整清单见三份分块文档的行为契约章节（domain/storage 层契约、SEAM-01–15、PKG-01–05、CLIENT-K1–K6、TC-01–TC-22）。

已核实的 domain 名与表：`agent_swarm`(v1: teams/migration_receipts)、`agent_swarm_retirement`、`member_private_memory`、`skills_management`(6 表)、`workflow_overlay`、`org_personal_assets`(v2: 5 表)、`org_departments`(v1)。

**重写必须新建的**：`already-open` 在候选测试中**命中 0** —— SOLO-ACC-02 没有对应用例，须自行建立。

## 4. 可直接照搬的设计

**最值得照搬：`company-stack.ts` 的装配顺序**（`:123–183`）
单维护者拒绝（`:123-125`）→ 同源构造 backend+facility（`:129-131`）→ **先取 lease 再开写面**（`:132-145`，注释原文 *BEFORE any write face of this generation exists*）→ 窗口内开 ORG 且失败逆序全回退（`:146-159`）→ 逆序幂等释放（`:160-183`）。

其余可照搬：`public-api.ts:5-10` 模块增强；`apply(ctx, config)` 签名与 9 条官方 import（`apply.ts:2-11,57`）；settings 注册 `applies:'restart'`（`:58-88`）；六处 `ctx.provide`；schemastery 单一配置面（`config.ts:1,11,84-86`）；`exports` 五子路径 + `dsh.bundle.patch` + `dsh.client{platform:web,inject[15]}`；patch `- insert:` 结构组与官方行整行重述。

## 5. 不得继承的候选缺陷（重写必须修正）

| # | 缺陷 | 证据 | 重写要求 |
| --- | --- | --- | --- |
| 1 | **facility 回退可绕过 lease** | `organization-assets.ts:78`、`plugin/apply.ts:271/353`、`organization-departments.ts:159`、`team-retirement-store.ts:70`、`runtime/retirement-data.ts:17`（共 ≥6 处） | 类型层取消 `ctx` 分支，**禁止 ctx.storageDomain 回退**；逐处打补丁不足 |
| 2 | **进程内锁跨进程无效** | `organization-assets.ts:58` `new Map<string,Promise<void>>()`；src 下 ≥17 处同类；对照 `storage-domain-team-store.ts:142` 的 `sharedTeamLocks`（正确做法） | 用真实跨进程 fence，不用进程内 Map |
| 3 | **组织域写路径未接 fence** | `organization-assets.ts` 恰好 7 条 `withLock` 全直接 `.put()`；该文件 `CompanyWriterStore`/`commit(` 命中 **0**；`domain/` 内引用数 **0** | 所有权威写入口必须经唯一 commit 通道 |
| 4 | **ORG-03 准入不完整** | `getEmployeeOnboardingGaps` 只查资料引用与头像存在性；仍保留 `ORG_ALLOW_LEGACY_UNBOUND` | 补全准入；移除 legacy 旁路 |
| 5 | **测试把缺陷断言为期望行为** | `org-admission.spec.ts:64-66` 断言 legacy 为 allow；`admission-loop.spec.ts:284` 断言未绑定 lane 仍能上座 | 重写测试须**反向断言** |
| 6 | **captureWorktreeDiff 不等于素材保存** | `repair-release/src/runtime/execution-roots.ts` 只捕获 Git 工作树差异 | 视频等素材须独立保存并取证 |
| 7 | **client 反例** | 自建 RPC channel（4 文件）、IndexedDB 草稿（3 处）、sessionStorage（1 处） | 改用官方 Remote；UI 零可写业务状态 |

**缺陷的测试层证据**：facility 回退在 `tests/` 内**零覆盖**（`storageDomain:` 命中 0）—— 候选测试无法发现该缺陷。

## 6. 候选测试资产（白盒规格）

扁平单层 `tests/`，无单元/契约/e2e 分层；`vitest.config.ts` 两候选逐字相同（`include: tests/**/*.spec.{ts,tsx}`、10s 超时）；仅一条 `"test": "vitest run"`。
- 用例数：CC 1185 / RR 1139
- 需真实宿主：18 文件 / 32 处｜需真实多进程：10 文件 / 19 处（`company-writer-dual-process` 单例 90s）
- golden 仅 1 个提示词快照
- **不可继承**：提示词快照；26 个 `.tsx` UI 测试；26 处 `'dsh-agent-swarm'` 字面量

## 7. 交叉核验结果（队长裁定）

| 项 | 结论 |
| --- | --- |
| **storage import 数 15 vs 17** | ✅ **裁定 15** —— 我实测 17 处命中含 2 处注释行（`company-writer-lease.ts:7`、`storage-domain-team-store.ts:76`），代码 import 实为 15 |
| **domain import 数 8 vs 9** | ✅ **裁定 8** —— 实测 `from '@deepseek-ai/'` 8 行 |
| **facility 回退处数** | ✅ **采纳 qa-deepseek 的 6 处**（含其新发现的 `apply.ts:271/353`），非首份报告的 4 处 |
| **organization-assets 未走 commit** | ✅ 实测该文件 `CompanyWriterStore|commit(` 命中 **0** |
| **already-open 测试覆盖** | ✅ 实测候选测试命中 **0** |
| **client 文件计数 70 vs 76** | ⚠️ **未复核**（qa-deepseek 已声明） |

## 8. 分块正文

- [domain + storage 层](rewrite-domain-storage.md) —— 对账表、domain 名与表、行为契约、重写要点
- [seam + client 层](rewrite-seam-client.md) —— SEAM-01–15、PKG-01–05、CLIENT-K1–K6 与反例
- [测试契约](rewrite-test-contract.md) —— TC-01–TC-22、测试拓扑、不可继承测试

## 9. 未覆盖（诚实声明）

- 未覆盖层：`runtime`(83) / `rpc`(17) / `tools`(20) / `host`(11) / `human`(10) / `skills`(10) / `shared`(6) / `migration` / `patterns` / `util`
- 未复核：client 文件计数；候选代码是否已进入 55120 实际安装工件
- 未执行：未运行测试、未构建、未做故障注入、未启服务
