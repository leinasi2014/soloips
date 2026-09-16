# W0 机制重核：DSH 0.1.6-alpha.1 装配与失败机制事实复核

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-R002-MECHANISM-AUDIT`；**本机只读核对记录**，非注册文档、非需求正文 |
| 目的 | 复核 `docs/technical-architecture.md` 中 MECH-01–10、SOLO-C01–C07、SOLO-F01–F08、SOLO-DATA-01 的全部〔源码事实〕行号在 r002 实际使用的 DSH 版本上是否仍成立，供 T01/T04/T05 使用 |
| 范围 | 仅限上述机制条目在 `DSH_CHECKOUT` 指定 HEAD 上的静态源码核对；不含运行验证、故障注入、装配生效判定 |
| 决策状态 | 〔已核对〕逐条给出三态裁决；**本记录不构成装配生效、验收通过或需求确认** |
| 证据范围 | 2026-09-16 本机只读源码核对（`git show` / blob hash / 行号）；**未启动服务、未构建、未 fetch、未调用模型、未做故障注入** |
| 依据 | `docs/technical-architecture.md` §4.3/§6/§8.9/§10；task-1 验收条款；`docs/governance/agent-readable-documentation.md` |
| 变更权 | 仅 task-1 所有者维护；结论随 DSH 基线变化失效 |

---

## 0. 基线与一处必须先纠正的事实

### 0.1 实际核对基线（与 task-1 描述不一致）

| 项 | task-1 描述值 | **本机实测值** | 核对方法 |
| --- | --- | --- | --- |
| DSH fork HEAD | `0d1f50007f9bca3f52b06e1c3074fa14d5fb0720` | **`abdfeb4831e163462ea4dd17ca5bb4e581d40d1c`** | `git rev-parse HEAD` |
| 提交时间 | — | 2026-09-16 12:32:35 +0800 | `git log -1` |
| 提交标题 | — | `fix(agent-team): report a Session's current model in the roster` | 同上 |
| 根包版本 | `0.1.6-alpha.1` | `0.1.6-alpha.1`（一致） | `package.json:3` |
| 当前分支 | — | `codex/team-roster-model` | `git status -sb` |
| 工作树 | — | `M AGENTS.md` + 3 个未跟踪 `.agents/notes/implemented/process/2026-09-16-soloips-upstream-alignment.*` | `git status --porcelain` |

**关系已确证（非推断）**：

- `git merge-base --is-ancestor 0d1f5000… HEAD` → exit 0，`0d1f5000` 是 `abdfeb48` 的祖先。
- `git rev-list --count 0d1f5000…HEAD` → **1**（恰一个提交）。
- `git diff --name-only 0d1f5000…HEAD` → 仅两个文件：
  - `packages/experimental/agent-team/src/roster.ts`
  - `packages/experimental/agent-team/tests/team.spec.ts`

**结论**：**本次重核按 `abdfeb48` 执行**。因两者间差异文件集为空集（除上述两文件），MECH-01–10、SOLO-C01–C07、SOLO-F01–F08、SOLO-DATA-01 所涉**全部机制文件在 `0d1f5000` 与 `abdfeb48` 上逐字节相同**——此结论由 `git diff --name-only` 的空集给出，非"大概没变"。

**对 `docs/technical-architecture.md` 附录 B 第 3 项的影响**：该处记录 DSH_CHECKOUT 为「根包 0.1.5-rc.2、HEAD `c291e7961a515f6d7af9304e7fd1d257929aef26`」。`c291e796` 经 `git merge-base --is-ancestor` 验证**仍是当前 HEAD 的祖先**，即基线可追溯；但 r002 实际使用 `0.1.6-alpha.1`，其间机制文件有实质变化（见下）。附录 B 需更新，属 T01 范围。

### 0.2 文件级变更判定（blob hash 比对 `c291e796` → HEAD）

| 文件 | 状态 |
| --- | --- |
| `vendor/include/src/index.ts` | **CHANGED** |
| `vendor/loader/src/config/group.ts` | **CHANGED** |
| `vendor/loader/src/config/tree.ts` | **CHANGED** |
| `vendor/loader/src/config/entry.ts` | **CHANGED** |
| `packages/boot/app-boot/src/index.ts` | **CHANGED** |
| `packages/boot/app-boot/src/profile.ts` | **CHANGED** |
| `apps/cli/src/profile-boot.ts` | **CHANGED** |
| `vendor/hmr/src/index.ts` | **CHANGED** |
| `packages/bundle/base/cordis.patch.yml` | **CHANGED** |
| `packages/bundle/web-app/cordis.patch.yml` | **CHANGED** |
| `packages/bundle/base/package.json` | **CHANGED**（版本 0.1.5-rc.2 → 0.1.6-alpha.1） |
| `packages/bundle/web-app/package.json` | **CHANGED**（同上） |
| `apps/cli/src/plugin.ts` | **IDENTICAL**（同 blob） |
| `packages/util/home-paths/src/index.ts` | **IDENTICAL** |
| `packages/storage/storage-domain/src/index.ts` | **IDENTICAL** |
| `packages/storage/storage-domain/src/domain.ts` | **IDENTICAL** |
| `packages/storage/storage-domain/src/spec.ts` | **IDENTICAL** |
| `packages/util/package-manifest/src/types.ts` | **IDENTICAL** |
| `apps/cli/src/args.ts` | **IDENTICAL** |
| `apps/cli/src/dump-config.ts` | **IDENTICAL** |
| `packages/settings/settings/src/index.ts` | **IDENTICAL** |
| `vendor/cordis/README.md` | **IDENTICAL** |
| `packages/storage/storage-json/README.md` | **IDENTICAL** |
| `docs/user/develop/basic/publish.md` | **CHANGED** |

**方法说明**：`IDENTICAL` 表示两侧 blob hash 相同（同一对象），是强于"行号内容看起来一样"的证据。`CHANGED` 只说明文件被改过，**不自动等于被引用的机制结论失效**——逐条裁决见下。

### 0.3 裁决统计

task-1 强制清单共 **25 条**：MECH-01–10（10）+ SOLO-C01/C03/C04/C05/C06/C07（6）+ SOLO-F01–F08（8）+ SOLO-DATA-01（1）。

| 裁决 | 条数 | 条目 |
| --- | --- | --- |
| **成立** | **13** | MECH-01、MECH-02、MECH-03、MECH-05、MECH-07、MECH-08、MECH-09、SOLO-C01、SOLO-C03、SOLO-C06、SOLO-C07、SOLO-F06、SOLO-DATA-01 |
| **已变化** | **9** | MECH-06、MECH-10、SOLO-C04、SOLO-C05、SOLO-F01、SOLO-F02、SOLO-F03、SOLO-F04、SOLO-F08 |
| **无法核对** | **3** | MECH-04（整条）、SOLO-F05（后果面）、SOLO-F07（安装器面）— 逐条见 §4.1 |

**合计 13 + 9 + 3 = 25**，与清单条目数一致。

**混合裁决说明（两条条目同时含"成立"与"无法核对"）**：裁决取该条**主张中我无法完全证实的部分**，故整条计入"无法核对"，但机制面已证成立，见各自小节：

- **SOLO-F05**：「移除分支无专门告警」**成立**（`plugin.ts:78-87`，同 blob）；「其他 overlay 仍可能接入能力」**无法核对**（需目标安装的完整生效树）。→ 计入"无法核对"，但机制面无变化。
- **SOLO-F07**：「`runPlugin` 无回滚」**成立**（`plugin.ts:120-162`，同 blob）；「实际残留由安装器与失败阶段决定」**无法核对**（需运行 pnpm）。→ 计入"无法核对"，但 `runPlugin` 面结论不变。

**MECH-07 与 SOLO-F07 为何分列不同裁决**：MECH-07 的主张**仅限** `runPlugin` 路径（可完全证实 → 成立）；SOLO-F07 的主张**包含**安装器残留（不可证实 → 无法核对）。两者不矛盾。

**另附（不在 task-1 清单，附带记录）**：SOLO-C02 判**成立**。

**去重说明**（避免把同一事实数成多条）：

- MECH-06 与 SOLO-F01（F-1/F-2 的半径部分）、SOLO-F02 描述的是**同一失败半径事实**，三条同判"已变化"；MECH-06 记"组合解析与挂载失败"，SOLO-F01 记"故障矩阵逐条状态"，SOLO-F02 记"作用范围"，视角不同但事实同源。
- SOLO-F03 与 SOLO-C04 描述的是**同一"重复 id 预检"事实**（前者机制面，后者契约面），两条同判"已变化"。
- MECH-07 与 SOLO-F07 描述的是**同一"无回滚"事实**，两条同判"成立"（`apps/cli/src/plugin.ts` 同 blob）。
- MECH-10 与 SOLO-F08 描述的是**同一 live/startup 事实**（前者现象，后者取值与验收规则），两条同判"已变化"。
- MECH-09 与 SOLO-F06 描述的是**同一 warn/skip 事实**，两条同判"成立"。
- **独立于上述去重，本次另发现一处 MECH-07/SOLO-F02 的邻接变化**：Loader 侧事务回滚整体删除（`vendor/loader/src/config/group.ts:85-105` 与 `entry.ts` 的 `updateError` 序列）。该变化**不改变** MECH-07（`runPlugin` 无回滚）与 SOLO-F07 的裁决，但**改变** SOLO-F01 F-4/F-5、SOLO-F02 第 2 点、SOLO-F08 第 3 点、SOLO-F01 F-12 的裁决，已计入相应条目。

---

## 1. 装配与 patch 机制（MECH-01–10）

### MECH-01 — bundles 层序与层内遍历：**成立**

**旧结论**：bundles 决定 bundle patch 层序；层内 patch 依列表遍历；其后还有 profile/home/launcher 层。
**新事实（0.1.6-alpha.1）**：

| 断言 | 0.1.6 证据 | 与旧行号对照 |
| --- | --- | --- |
| bundles 决定层序 | `packages/boot/app-boot/src/profile.ts:876-885`（`bundles.map(...)` 逐层解析）；`:11-13` 文档注释 | 旧 cite `profile.ts:784-793` → 内容等价，**行号位移 +92** |
| 层序固定为 bundle→profile→home→overlays | `apps/cli/src/profile-boot.ts:212-219`（`allPatches`） | 旧 cite `:206-213` → 同一函数，**行号位移 +6** |
| 层内依列表遍历 | `vendor/include/src/index.ts:76`（`for (const patch of patches)`） | 旧 cite `:77` → **位移 -1** |
| 根配置恒为空数组、每次启动重写 | `apps/cli/src/profile-boot.ts:88-92`、`:194` | 旧 cite `:84-88`、`:190` → 位移 +4 |

**裁决依据**：`allPatches` 的四元组顺序未变；`profile.ts` 的 bundle 遍历语义未变。行号全部位移，但**机制结论不变**。

**行号更新建议（供 T01）**：
- `apps/cli/src/profile-boot.ts:206-213` → **`:212-219`**
- `packages/boot/app-boot/src/profile.ts:784-793` → **`:876-885`**
- `vendor/include/src/index.ts:77-124` → **`:76-127`**
- `packages/bundle/base/cordis.patch.yml:12-13` → **仍为 `:12-13`**（未位移，见 MECH-02）

**T01/T04/T05 影响**：无机制变化。T01 的 dump 门禁分层模型（L1/L2）与 T04 的层序断言依据不变，仅需替换行号。

---

### MECH-02 — patch 顶层字段替换 / config 非深合并：**成立**

**旧结论**：命中行的顶层字段按键赋值；提供 config 时整体替换 config，不做深合并；未给出的顶层字段保留。
**新事实**：`vendor/include/src/index.ts:120-123` ——

```ts
for (const [key, value] of Object.entries(overrides)) {
  if (key === 'id') continue
  target[key] = value
}
```

`overrides` 由 `:77` 的 `const { id, insert, name, ...overrides } = patch` 得出。逐键**赋值**而非合并，故 `config` 为整体替换。**与旧 cite `:121-124` 语义完全一致，仅位移 -1。**

官方契约文本仍在同一位置且未变：
- `packages/bundle/base/cordis.patch.yml:6-10`：「A patch replaces the targeted row's whole `config` rather than merging into it…」
- `packages/bundle/web-app/cordis.patch.yml:5-6`：「A patch replaces the targeted row's whole `config`, so each row below restates every key it owns.」

**裁决依据**：核心算法行逐字符等价（`if (key === 'id') continue` + `target[key] = value`），契约注释文本未变。

**行号更新建议**：`vendor/include/src/index.ts:121-124` → **`:120-123`**；`packages/bundle/base/cordis.patch.yml:6-10` → **不变**。

**T01/T04/T05 影响**：**无变化**。T01 设计稿第 3 项「覆写官方行时的完整重述要求清单」依据成立，SOLO-C03 结论保持。这是本次重核中对 T01 最重要的"不需要改"结论之一。

---

### MECH-03 — reconcile 追加与移除：**成立**

**旧结论**：reconcile 将新发现的 bundle 追加到数组，不重排已有项；失去声明的受依赖管理项会移除。
**新事实**：`apps/cli/src/plugin.ts` **blob 与 `c291e796` 完全相同（IDENTICAL）**。

- 追加：`:67-69`（`if (isBundle && !plugins.includes(packageName)) { plugins.push(packageName) }`）
- 移除：`:77-87`（`stillBundle` 判定后 `plugins.splice(...)`）
- 无重排：全函数无 `sort`，仅 `push` / `splice`

**裁决依据**：文件级 blob 相同，旧 cite `apps/cli/src/plugin.ts:65-69、77-90` **行号与内容同时成立**。

**T01/T04/T05 影响**：无变化。

---

### MECH-04 — 跨 domain 原子提交：**无法核对**（保持〔未验证〕）

**旧结论**：〔未验证〕DRAFT-D05，尚未取得目标存储组合的跨 domain 事务正面证据。
**核对结果**：**无法给出正面或反面裁决**，原因：

1. 该条在技术架构中本就被标注为〔未验证〕，要求的是"取得正面证据"，而我的授权是**只读静态核对**，不能运行组合事务验证。
2. 静态检索到**否定性指示**（不构成证明）：
   - `packages/storage/storage-domain/README.md:152`：「**No cross-table transactions**, secondary indexes, or multi-segment keys — each write touches one record」
   - `packages/storage/storage-domain/src/domain.ts:257`：注释「notification, not a transaction participant — the commit point has…」
   - `packages/storage/storage-json/README.md:32`：仅建议 SQLite 用于"multiple records need transactional updates"
3. `packages/storage/storage-domain/src/{index,domain,spec}.ts` 三文件与 `c291e796` **blob 相同**，故旧行号 `index.ts:65-72、103-107` 仍成立（属 MECH-05 证据面）。

**裁决**：**无法核对**。检索到的是文档性否定陈述，**不是**可核对的机制证明；按技术架构既有纪律「检索无结果不证明能力不存在」，**不把上述指示升格为"MECH-04 已变化/已证否"**。需要正面证据时须由获授权的实现切片执行运行验证。

**T01/T04/T05 影响**：**维持原状**——设计仍**不得**依赖跨 domain 共同原子提交。T05 验收方案中 SOLO-ACC-CE-G 保持〔提案〕。

---

### MECH-05 — already-open 的作用域：**成立**

**旧结论**：already-open 只拦截同一 `DomainFacility` 实例内的同名 open；默认 JSON 后端无跨进程写锁。
**新事实**：`packages/storage/storage-domain/src/index.ts` **blob 与 `c291e796` 相同（IDENTICAL）**。

- 实例内拦截：`:103-107` —— `if (this.reserved.has(spec.name)) throw new DomainError('already-open', …)`；`reserved` 为实例私有 `Set`（`:72`）。
- 实例作用域声明：`:70-72` 注释「one facility instance owns the open-domain table and enforces single-open per domain name」。
- 跨进程无锁：`packages/storage/storage-json/README.md:142`（**blob IDENTICAL**）「**No cross-process write locking** — two processes writing the same unit can interleave replacements; writes to the same file use last-completion wins.」

**裁决依据**：两个证据文件均为同 blob，旧 cite `storage-domain/src/index.ts:65-72、103-107` 与 `storage-json/README.md:142` **行号与内容同时成立**。

**T01/T04/T05 影响**：无变化。基线 §2 反面声明「同实例 already-open 不能替代跨 Host 独占证据」与 SOLO-ACC-09 的双真实进程要求**继续有效**。

---

### MECH-06 — 组合解析失败与失败半径：**已变化** ⚠️

**旧结论**：bundle 无法解析或缺少声明会拒绝本次 profile 加载；**「整个 profile 起不来」**（SOLO-F01 F-1/F-2 措辞）。
**新事实**：`packages/boot/app-boot/src/index.ts` 被大幅重写（+221/-? 行）。

| 子断言 | 0.1.5-rc.2 | **0.1.6-alpha.1** |
| --- | --- | --- |
| 解析期：bundle 不可解析 → 抛错 | `profile.ts:753-756` | **成立且未变**：`profile.ts:845-848` |
| 解析期：缺 `dsh.bundle` → 抛错 | `profile.ts:788-790` | **成立且未变**：`profile.ts:880-882` |
| 挂载期：任一 enabled entry 非 ACTIVE → 启动失败 | `index.ts:722-755` `assertEntriesActivated`：**遍历所有 entry**，任一 failed/pending 即 `throw` | **已变化**：`index.ts:818-835` `auditStartupEntries` |

**关键变化**：新版把 entry 分为 required / optional 两类：

```ts
// packages/boot/app-boot/src/index.ts:826-834
for (const failure of failures) {
  const target = failure.entry === bootstrapIncludes.get(ctx)
    || requiredStartupEntryIds.has(failure.entry.options.id) ? required : optional
  target.push(failure)
}
if (optional.length > 0) warn(activationDiagnostic(binName, 'warning', optional))
if (required.length > 0) {
  throw new Error(activationDiagnostic('', 'required startup failure', required).trimEnd())
}
```

required 集合为**全局固定 id 列表**（`index.ts:711-719`）：

```
agent-loop, webserver, modules, connection, headless-runner, acp, sdk-jsonrpc-server
```

另加 bootstrap include（`:827`）。**其余任何 entry 失败或 pending 只 warn 一次，兄弟继续运行，进程不失败。**

**佐证（全仓检索）**：`assertEntriesActivated` / `assertEntriesLoaded` 在 `HEAD` 上**已无函数定义**，仅剩两处 README 文字（`packages/boot/app-boot/README.md:114`、`README.zh.md:114`）——即**文档尚未同步**。

**旧结论 → 新事实 → 影响**：

| | 内容 |
| --- | --- |
| **旧结论** | 任一 enabled entry 非 ACTIVE 即整个 profile 启动失败；组合解析失败阻断启动 |
| **新事实** | 仅 `requiredStartupEntryIds` 内 7 个 id + bootstrap include 失败才 reject；其他 inactive entry 降级为 **warning 并继续**；解析期（bundle 不可解析 / 缺 `dsh.bundle`）仍抛错阻断 |
| **对 T01（装配契约）** | ①「bundles 数组含包名不是装配证据」这一反面声明**更强**了：非必需行挂载失败不再产生非零退出码。② T01 的 dump 门禁**不能**依赖"启动失败"作为装配错误信号。③ 必须把 `soloips-*` 行纳入显式断言（L2 diff），因为 Loader 不会替我们失败。④ 若 SoloIPs 行需要 fail-closed，必须在自己的 patch 中显式声明依赖或自检 |
| **对 T04（profile 与组合门禁）** | ① 门禁判据须为**组合断言**（L2 生效树逐行比对），退出码 0 的证明力进一步下降。② 升级到 0.1.6 后，`soloips-core` 等行若 pending 将**静默降级**——门禁必须显式检测 pending 状态 |
| **对 T05（准入）** | ① SOLO-ACC-01「部署组合 == 验收组合」的判据必须落在 dump 比对，不能落在启动成功。② 需新增"pending 检测"用例：构造缺依赖场景，断言门禁**捕获**而非依赖退出码。③ 基线 §2 反面声明「进程退出码 0 不是组合正确证据」由本次重核**升级为强证据** |

**行号更新建议**：`packages/boot/app-boot/src/profile.ts:749-756` → **`:845-848`**；`:784-793` → **`:876-885`**；新增 `packages/boot/app-boot/src/index.ts:711-719、818-835`。

---

### MECH-07 — runPlugin 无回滚：**成立**（但被另一处变化放大）

**旧结论**：`runPlugin` 路径不提供应用级安装快照或失败恢复；实际残留由安装器与失败阶段决定。
**新事实**：`apps/cli/src/plugin.ts` **blob IDENTICAL**。

- 仅退出码 0 才 reconcile：`:148-149`
- 非零只打印提示：`:150-161`（含 git 源 `allowBuilds` 指引）
- 全函数无回滚逻辑：无 `rmSync` / `unlink` / 备份恢复

**裁决依据**：文件级 blob 相同，旧 cite `apps/cli/src/plugin.ts:120-162` **成立**（注意：该文件共 163 行，旧 cite 到 162 行正确）。

**附带变化（重要，但不改变 MECH-07 本身）**：`vendor/loader/src/config/group.ts` 的 **Loader 侧事务回滚已被整体删除**：

| | 0.1.5-rc.2 | 0.1.6-alpha.1 |
| --- | --- | --- |
| `update()` | `:59-106`，含 `try/catch` + `:85-105` 回滚分支（`remove` 新条目 → 重建旧配置 → 可能抛 `AggregateError('loader entry rollback failed')`） | `:48-65`，**无 try/catch、无回滚**；每个 entry 的失败仅 `this.ctx.logger.error(error)`（`:58-60`）吞掉 |
| 失败传播 | 单失败 `throw failures[0]`，多失败 `AggregateError('loader entries failed to apply')` | **不抛出**，仅记日志 |

**旧结论 → 新事实 → 影响**（此变化属 MECH-07 邻接面，须一并计入）：

| | 内容 |
| --- | --- |
| **旧结论** | Loader 挂载失败时所在 group 会尝试恢复旧配置，恢复本身可能失败并抛 `rollback failed`（SOLO-F01 F-4/F-5、SOLO-F02 第 2 点） |
| **新事实** | Loader group `update()` 不再有回滚分支；entry 级失败被 `logger.error` 吞掉后继续，**不抛出、不恢复旧配置** |
| **对 T01** | 「装配与状态分别恢复」的表述需修正：**装配层自身已无回滚**，不能承诺"恢复旧配置"。T01 的 patchReload/恢复设计不得依赖 Loader 回滚 |
| **对 T04** | 门禁不能假设"挂载失败会自动回到旧树"。失败后运行树处于**部分应用**状态，必须整体重建而非局部回退 |
| **对 T05** | SOLO-ACC-06（装配回退与状态恢复）的编排须改为「停止 → 修复输入 → 冷启动」；不能设计"注入失败后观察自动回滚"的用例，因为该机制已不存在。SOLO-F01 F-4/F-5 的预期后果需重写 |

**T01/T04/T05 影响（MECH-07 本身）**：`runPlugin` 无回滚结论不变；但**新增**：Loader 侧亦无回滚。

---

### MECH-08 — 失去 dsh.bundle 的静默移除：**成立**

**旧结论**：失去 `dsh.bundle` 的受依赖管理项被移出 bundles；该移除分支不发专门告警。
**新事实**：`apps/cli/src/plugin.ts`（blob IDENTICAL）

- 移除分支：`:78-87`，`if (wasDependency && !stillBundle) { plugins.splice(plugins.indexOf(packageName), 1); changed = true }`
- **无 warning**：`:78-87` 区间内无 `process.stderr.write`；唯一的 warning 在 `:70-75` 的**普通依赖**分支（与移除无关）
- 写回 manifest：`:88-90`

**裁决依据**：文件级 blob 相同；旧 cite `apps/cli/src/plugin.ts:70-75、77-90` 成立。

**T01/T04/T05 影响**：无变化。SOLO-F05 / SOLO-ACC-CE-E 保持。

---

### MECH-09 — 未命中 patch 的 warn/skip 与日志可见性：**成立**（但一处引用已失效）

**旧结论**：未命中/不匹配分支调用 warn 后跳过；日志可见性由调用入口决定，覆盖次序包含 launcher 层。
**新事实**：`vendor/include/src/index.ts` **CHANGED**，但 warn/skip 语义**逐条成立**：

| 分支 | 0.1.5-rc.2 | 0.1.6-alpha.1 |
| --- | --- | --- |
| insert 目标不存在 | `:83-85` warn + continue | `:82-85` warn + continue |
| insert 目标非 group | `:86-89` | `:86-89`（**行号相同**） |
| 非 insert 但无 id | `:104-107` | `:104-107`（**行号相同**） |
| 目标 id 不存在 | `:110-113` | `:109-113` |
| name 不匹配 | `:115-118` | `:115-118`（**行号相同**） |

**已失效的引用**：旧 MECH-09 cite 的 `vendor/include/src/index.ts:267-270`（「启动 Include 在 :267-270 转发 logger」）**在 0.1.6 上已不对应**。当前 `:267-270` 位于 `stop()`：

```
267:     await this.flushWrite()
268:   } finally {
269:     this.root.stop()
270:     await this.flushWrite()
```

logger 转发实际在 `:239-243`（`applyPatches` 的 warn sink：`this.ctx.root.logger?.('loader').warn(message, ...args)`）。**内容仍存在，行号位移 -28。**

`packages/boot/app-boot/src/profile.ts` 的 `composeEntries` 默认静默 sink：旧 cite `:841-847` → 新 **`:933-939`**（`warn: (message: string) => void = () => {}`，`:934`）。

`apps/cli/src/profile-boot.ts:206-213`（覆盖次序含 launcher 层）→ 新 **`:212-219`**。

**裁决依据**：五个 warn/skip 分支语义逐一未变；仅 logger 转发的行号位移。**机制成立，引用需更新。**

**T01/T04/T05 影响**：无机制变化。SOLO-REG-Q5「告警可见性取决于调用入口」继续成立；T01 的 dump 门禁设计（不依赖日志、用逐行比对）方向正确。

---

### MECH-10 — live 更新与运行树差异：**已变化** ⚠️

**旧结论**：live 更新未完成、被拒或恢复旧配置时，磁盘候选与运行树可能不同；证据为 `vendor/include/src/index.ts:296-319`、`vendor/hmr/src/index.ts:305-315`。

**新事实 1 — Include 的重载失败处理已简化（不再"事务化"）**

| | 0.1.5-rc.2 | 0.1.6-alpha.1 |
| --- | --- | --- |
| `refresh()` | 经 `enqueue()` 串行化 → `read()` → `_apply()`；抛错**向外传播**（调用方处理） | `:279-287`：内部 `try/catch`，失败时 `logger.warn('config reload at %C failed; keeping the running tree')` 并**吞掉** |
| 串行队列 | 有 `applyQueue` + `enqueue()`（注释说明「group 的事务 update 不可重入」） | **已删除**（`applyQueue`、`enqueue`、`ConfigFileError`、`ReadCandidate` 均不存在） |
| 失败语义 | 抛错，由上层决定 | 就地 warn + 保留运行树 |

新代码 `vendor/include/src/index.ts:279-287`：

```ts
async refresh() {
  try {
    if (!await this.read()) return
    await this.root.update(this.applyPatches(this.data!))
  } catch (error) {
    this.ctx.logger.warn('config reload at %C failed; keeping the running tree', this.filename)
    this.ctx.logger.warn(error)
  }
}
```

**新事实 2 — HMR 的 `hmr/config-update-failed` 事件已不存在**

`vendor/hmr/src/index.ts` **CHANGED**（-181 行）。当前公开事件仅两个（`:21-22`）：

```ts
'hmr/change'(url: string): void
'hmr/reload'(reloads: Map<Plugin, Reload>): void
```

全仓检索 `config-update-failed`：**仅命中两处 `.agents/notes/archived/` 归档笔记**，无任何 `src/` 实现。旧 MECH-10 / SOLO-F08 第 3 点与 SOLO-ACC-CE-H 所引的 `hmr/config-update-failed` 事件**在 0.1.6 已移除**。

**新事实 3 — 配置监视改由 `watchConfig` 承担**

`packages/boot/app-boot/src/watch-config.ts:36-89`（新文件，0.1.5-rc.2 无此文件）：

- `:50-67` `onChange`：串行化 + `dirty` 合并；失败时 `:62-63` `ctx.logger.warn('config reload at %C failed', filename)` —— **只有日志，无事件广播**
- `:77-81` `dispose` 关闭 watcher 并 `await running`

`watchUserPatches`（`packages/boot/app-boot/src/index.ts:260-296`）在 refresh 回调中额外做 `inactiveEntries` 审计，`failures.length > 0` 时**抛错**（`:283-284`）——但该错误最终被 `watch-config.ts:60-64` 捕获并降级为 warn。

**新事实 4 — live 分支新增 `await ctx.loader.await()`**

`apps/cli/src/profile-boot.ts:386-392`：补装 timer/hmr 后新增 `await ctx.loader.await()`（`:391`），旧版无此行。这改变了启动期时序（见 §4 与 T01 相关）。

**旧结论 → 新事实 → 影响**：

| | 内容 |
| --- | --- |
| **旧结论** | live 更新失败时旧树保留**受回滚成功条件限制**；HMR 记录日志并广播 `hmr/config-update-failed`；`group.ts:85-105` 可能抛恢复失败 |
| **新事实** | ① Loader 侧回滚已删除（见 MECH-07），故"回滚失败"这一失败模式**不存在了**。② Include 与 watchConfig 的 refresh 失败一律**就地 warn 并保留运行树**，不外抛、不广播事件。③ `hmr/config-update-failed` 事件**已移除**。④ live 分支新增 `await ctx.loader.await()` |
| **对 T01（装配契约）** | ① 「旧树保留受回滚是否成功限制」的措辞**必须改写**：现在是"失败即保留旧树，且不通知"。② T01 若计划用 HMR 事件做可观测性，**该入口已不存在**，须改用日志或 dump 比对。③ `await ctx.loader.await()` 使 live 启动期更长，dump 门禁的时序假设需复核 |
| **对 T04（profile 与组合门禁）** | ① patchReload=startup 的约束**更加必要**：live 模式下失败**完全静默**（仅日志），门禁无法通过事件或退出码察觉。② T04 应显式要求 startup，并把"运行树 == 磁盘候选"的核对放在冷启动后（而非依赖 live 一致性） |
| **对 T05（准入）** | ① SOLO-ACC-05（写入→停止→冷启动→读回）编排**方向正确且更被需要**。② SOLO-ACC-CE-H 中"观察 HMR 失败事件"的步骤**不可执行**，须改为观察日志或直接比对 dump。③ 基线 §2 反面声明「热更新通过不能替代冷启动读回证据」由本次重核强化 |

**行号更新建议**：`vendor/include/src/index.ts:296-319` → **`:279-287`**（且语义已变）；`vendor/hmr/src/index.ts:305-315` → **该事件已删除**，改引 `packages/boot/app-boot/src/watch-config.ts:58-65`；`apps/cli/src/profile-boot.ts:328-333` → **`:344-349`**；`:350-381` → **`:375-406`**。

---

## 2. 组合契约条目（SOLO-C01–C07）

### SOLO-C01 — bundles 顺序与新增 bundle 追加：**成立**

**旧结论**：bundles 顺序决定层序；`dsh plugin add` 只追加不重排；soloips-bundle 保持最终装配位置。
**新事实**：

- 追加语义：`apps/cli/src/plugin.ts:67-69`（**blob IDENTICAL**）
- 无重排：同文件全函数无排序调用
- 插入行可被后续 patch 命中：`vendor/include/src/index.ts:95-101`（`buildMap(insert)` 把本 patch 新增的行加入索引，注释明确「a layer must be able to configure or disable a row an earlier layer inserted」）
- 提前覆写尚不存在的行会跳过：`vendor/include/src/index.ts:109-113`

**裁决依据**：`plugin.ts` 同 blob；include 的插入索引语义在新版**被强化**（注释与实现一致），旧 cite `:96-101` → 新 `:95-101`。

**T01/T04/T05 影响**：无变化。§6.2 的七项顺序与「soloips-bundle 最后」的依据继续成立。

---

### SOLO-C02 — yml 行序无加载语义：**成立**（附带记录，不在 task-1 强制清单）

**旧结论**：patch 文件内行序不承载加载语义。
**新事实**：`packages/bundle/base/cordis.patch.yml:12-13` 原文未变——「Row order carries no load semantics (activation is service-availability driven); the grouping is for readers.」该文件 CHANGED 但仅 `:366` 之后的行被增删（新增 `ptc-runtime`、`workflow-ptc`、`image-offload`、`mcp-resources` 行；`workflow-worker-thread` 改名；`tool-ralph` 新增 `disabled: true`），**文件头 1-13 行逐字未变**。

**T01/T04/T05 影响**：无变化。

**附带风险提示（新增，供 T01）**：`tool-ralph` 在 0.1.6 的 base bundle 中**默认 `disabled: true`**（`packages/bundle/base/cordis.patch.yml:426-428`；同文件 `:424-425` 的注释给出了恢复方式 `- id: tool-ralph` / `disabled: false`）。若 SoloIPs 依赖该行，需在自己的层显式 `disabled: false`。同类新增：base 层在 0.1.6 新增了 `ptc-runtime`、`workflow-ptc`、`image-offload`、`mcp-resources` 四行，并把 `workflow-worker-thread` 改名为 `workflow-ptc`；web-app 层新增 `terminal-controller`、`ui-sidebar-terminal`、`ui-settings-unarchive-sessions` 三行并**删除了 `code-runtime`**（`workflow-worker-thread` 亦然）。**这些行 id 变更会直接影响 T01 的 patch 定位与 T04 的 L2 基线快照**。

---

### SOLO-C03 — patch 的 config 整体替换：**成立**

与 MECH-02 同一事实。补充：`packages/bundle/base/cordis.patch.yml:6-10` 与 `packages/bundle/web-app/cordis.patch.yml:5-6` 的契约文本**均未变**（两文件虽 CHANGED，但头部注释区未动）。

**T01/T04/T05 影响**：无变化。T01 设计稿第 3 项「完整重述清单」依据成立。

---

### SOLO-C04 — entry id 唯一性预检 / 缺 id 补随机 id：**已变化** ⚠️

**旧结论**：
1. entry id 在所属 entry 树内必须唯一，**重复即致命**：`vendor/loader/src/config/group.ts:61-66` 在 `update()` 中收集 id，发现重复**直接抛 TypeError**（`duplicate loader entry id`）。
2. 该抛出发生在任何条目创建之前，随后走 `group.ts:85-105` 的回滚路径。
3. id 缺失时由树自动补随机 id：`vendor/loader/src/config/tree.ts:66-73` 的 `ensureId`。

**新事实**：

| 断言 | 0.1.6 证据 | 裁决 |
| --- | --- | --- |
| 重复 id 预检 | **不存在**。`group.ts:48-65` 的 `update()` 无 `seen` Set、无 `ensureId` 循环校验、无 TypeError | **已变化** |
| 回滚路径 | **不存在**（见 MECH-07） | **已变化** |
| 缺 id 补随机 id | **成立**：`tree.ts:51-58`，逻辑逐字相同 | **成立** |

新 `group.ts:48-65` 全文：

```ts
async update(config: EntryOptions[]) {
  const oldConfig = this.data as EntryOptions[]
  this.data = config
  const oldMap = Object.fromEntries(oldConfig.map(options => [options.id, options]))
  const newMap = Object.fromEntries(config.map(options => [options.id ?? Symbol('anonymous'), options]))

  // update inner plugins
  const ids = Reflect.ownKeys({ ...oldMap, ...newMap }) as string[]
  await Promise.all(ids.map(async (id) => {
    if (newMap[id]) {
      await this.create(newMap[id]).catch((error) => {
        this.ctx.logger.error(error)
      })
    } else {
      this.remove(id)
    }
  }))
}
```

**关键机制后果（〔推断〕，基于上述源码）**：重复 id 在 `Object.fromEntries` 中**后者覆盖前者**（`newMap` 只保留最后一个），因此：

- **不再抛错**；
- 重复定义的行**静默地只保留一条**（后写者），前一条**从不创建**；
- 无任何 warning 或 error 记录该覆盖。

**全仓佐证**：`git grep -i 'duplicate.*entry id'` 在 `vendor/`、`packages/`、`apps/` 的 `src/` 中**无命中**（仅命中 client 侧无关的 locale/theme/sidebar 注册表）。旧字符串 `duplicate loader entry id` 全仓**零命中**。

**旧结论 → 新事实 → 影响**：

| | 内容 |
| --- | --- |
| **旧结论** | 重复 entry id 会被 Loader 预检抛 TypeError 拒绝（致命）；本次调用尚未创建条目，也不进入回滚 |
| **新事实** | 预检与回滚**均已删除**。重复 id 由 `Object.fromEntries` 静默后者覆盖，**不抛错、不告警**，且前一条永不创建。缺 id 补随机 id 的行为未变 |
| **对 T01（装配契约）** | ① **SOLO-C04 的「行 id 前缀 + 单行单写者」从〔建议〕升格为必须**：Loader 不再替我们挡住重复 id，前缀命名空间成为**唯一**的防碰撞手段。② T01 设计稿的行 id 必须逐条自检唯一性（`soloips-*` 前缀），不能依赖 Loader 报错。③ T01 的 dump 门禁**必须**包含显式 id 唯一性断言 |
| **对 T04（profile 与组合门禁）** | ① 门禁新增必测项：**id 唯一性静态断言**（在 L2 dump 上做）。② 原设计"验证重复定义被拒"的用例**不可执行**（无拒绝行为），须改为"断言不存在重复 id"的前置校验。③ 由于静默覆盖不产生任何日志，**只能靠 dump 比对发现**——dump 门禁的必要性再次上升 |
| **对 T05（准入）** | ① SOLO-ACC-01 的「entry id 唯一」验收项**必须由我们自己的断言提供证据**，不能引用 Loader 行为。② 技术架构 §10.3 建议「仅取得 --dump-config 输出不能声称执行过 EntryGroup 的预检」——该句**前提已消失**（预检不存在），须改写为「必须在 dump 上自行断言唯一性」。③ 需新增反例用例：构造重复 id，断言**我们的门禁**捕获 |

**行号更新建议**：`vendor/loader/src/config/group.ts:59-66` → **该逻辑已删除**（现 `:48-65` 为无校验版本）；`:85-105` → **已删除**；`vendor/loader/src/config/tree.ts:66-73` → **`:51-58`**。

---

### SOLO-C05 — profile 三件套初始化：**已变化**（内容成立，行号全位移）

**旧结论**：`initProfile` 写 `package.json`、`cordis.patch.yml`、`pnpm-workspace.yaml`。
**新事实**：**三件套语义完全成立**，`initProfile` 在 `packages/boot/app-boot/src/profile.ts:199-219`：

| 文件 | 0.1.6 行号 | 内容 |
| --- | --- | --- |
| `package.json` | `:205-214` | `dsh.profile.bundles` + `patchReload`；`private: true`；已存在则不覆盖 |
| `cordis.patch.yml` | `:215-216` | 模板常量 `:173-177` |
| `pnpm-workspace.yaml` | `:217-218` | 模板常量 `:184-189`：`nodeLinker: hoisted`、`autoInstallPeers: false` |

**判为"已变化"的理由**：旧 cite 的行号**全部失效**，且旧结论中的 `profile.ts:165-185`、`:139-143`、`:150-155`、`:653-676` 均需替换：

| 旧 cite | 新行号 | 位移 |
| --- | --- | --- |
| `profile.ts:165-185`（initProfile） | **`:199-219`** | +34 |
| `profile.ts:139-143`（patch 模板） | **`:173-177`** | +34 |
| `profile.ts:150-155`（pnpm 模板） | **`:184-189`** | +34 |
| `profile.ts:653-676`（manifest 读写） | **`:745-768`** | +92 |

**语义变化（须注意）**：`initProfile` 的第三个参数 `patchReload` 现在是**可选**（`profile.ts:202`：`patchReload: ProfilePatchReload = DEFAULT_PROFILE_PATCH_RELOAD`）。`apps/cli/src/plugin.ts:124-128` 传入 `template?.patchReload`（可能为 `undefined`）→ 落到默认值 `live`（`profile.ts:171`）。**即：无模板的自定义 profile 默认 `live`**，与旧结论一致，但路径经由默认参数而非显式传值。

**旧结论 → 新事实 → 影响**：

| | 内容 |
| --- | --- |
| **旧结论** | 初始化创建三份装配文件（`profile.ts:150-185`）；manifest 读写接口在 `:653-676` |
| **新事实** | 三件套语义**未变**，但行号整体位移 +34/+92；`patchReload` 参数改为可选默认 `live` |
| **对 T01（装配契约）** | ① 设计稿第 4 项「profiles/soloips/ 三件套草案」**依据成立**，无需改设计，仅需更新引用行号。② **必须显式写 `patchReload: startup`**——因为自定义 profile 的默认是 `live`，遗漏即静默获得 live 语义（叠加 MECH-10 的静默失败，风险显著）。③ `pnpm-workspace.yaml` 的 `nodeLinker: hoisted` 语义未变，T01「开发根锁不能代替 profile 锁」的论证继续成立 |
| **对 T04** | 门禁需断言 profile manifest 中 `patchReload === 'startup'` 为**显式存在**（非依赖默认值）。理由：默认值是 `live`，而 live 失败静默 |
| **对 T05** | SOLO-ACC-05 编排中「明确 patchReload 必须为 startup」应升级为**前置断言**（读 manifest 断言字段存在且为 startup），而非事后观察 |

---

### SOLO-C06 — `--dump-config` 同源算法与层来源标注：**成立** ⚠️（有一处边界需修正）

**旧结论**：配置转储与启动使用**同一套扁平化算法**（`renderConfigDump` 的 `snapshot()` 与 `profile-boot.ts:336` 的 boot 调用都把层一次性扁平化后交给同一个 `applyEntryPatches`）；转储输出带来源标注。

**新事实**：

| 断言 | 0.1.6 证据 | 裁决 |
| --- | --- | --- |
| 转储与启动共用 `applyEntryPatches` | `packages/boot/app-boot/src/index.ts:455-463`（`snapshot`）与 `apps/cli/src/profile-boot.ts:352`（`boot(...)`）；两者都调用同一导出函数 | **成立** |
| 文件头注释声明"与 boot() 完全一致" | `index.ts:392-400`（新注释，措辞更详细） | **成立** |
| 层来源标注 | `index.ts:466`（`entryOrigins`）、`:474-483`（逐层 diff 记录 `patchedBy`）、`:489-517`（`groupedDump` 输出 `# == <label>` 与 `, patched by ...`） | **成立** |
| `--dump-config` 与 `--dump-default-config` 互斥、后者拒绝 `--patch` | `apps/cli/src/args.ts:100-116`（**blob IDENTICAL**） | **成立** |
| dump 为 boot-free（不启动服务） | `apps/cli/src/dump-config.ts`（**blob IDENTICAL**）；`apps/cli/src/bin.ts:48-57` 直接 `runDumpConfig(...)`，不调 `runProfile` | **成立** |

**须修正的边界（重要）**：旧结论引 `apps/cli/src/profile-boot.ts:336` 作为"启动使用同一算法"的证据。该调用点在 0.1.6 为 **`:352`**，且**语义已扩展**：

- `:352`：`await boot(NAME, rootConfig, structuredClone(allPatches(composed)), async (hostCtx) => {...})`
- `:344-349` 的 `composeLive()` 在 live 模式下**重新读取**两个用户文件（`loadOptionalPatches(NAME, composed.profile.patchPath)` 与 `homePatchPath()`），而非复用 `composed` 中的已解析对象。

因此：「dump 与 boot 使用同一扁平化算法」**成立**；但「dump 结果 == 任意时点的运行树」**不成立**（旧结论已声明此边界，新代码使该边界更明显——live 模式下运行树按 generation 重读磁盘）。

**另一处新增能力**：`dump-config.ts:43-45` 仅当 `existsSync(loaded.patchPath)` 为真才把 profile 用户层加入 layers；`:46-50` 追加 home 层；`:51-54` 追加 `--patch`。与旧版一致（文件 blob 相同）。

**T01/T04/T05 影响**：

- **T01**：设计稿第 5 项「L1/L2 生成方式与逐行比对规则」**依据成立**。L1 = `--dump-default-config`（bundle 层，`defaultOnly=true`，不含用户层与 `--patch`）；L2 = `--dump-config`（含 profile 用户层 + home 层 + `--patch`）。**注意**：`dump-config.ts:46-50` 表明 L2 **默认包含 home 层** `$DSH_HOME/cordis.patch.yml`，基线快照须绑定该文件的哈希，否则跨机 diff 会产生假阳性。
- **T04**：门禁比对规则须明确"层来源标注"是**可解析的结构**（`# == label` 与 `, patched by ...`），可用于定位归属漂移。这是 SOLO-C06 的强项，T04 应直接采用。
- **T05**：SOLO-ACC-01 的判据可落在 L2 逐行比对；**但不得**把 dump 一致当作运行树一致的证据（见 MECH-10）。

**行号更新建议**：`packages/boot/app-boot/src/index.ts:409-472` → **`:423-486`**；`:441-449` → **`:455-463`**；`:388-395、:452-471` → **`:466-483`、`:489-517`**；`apps/cli/src/profile-boot.ts:336` → **`:352`**；`:323-327` → **`:350-351`**。

---

### SOLO-C07 — profile 名保留字与规范化回写：**成立**

**旧结论**：`resolveProfileDir` 拒绝空值、斜杠、点号、点点、`node_modules`；`PROFILE_TEMPLATES` 保留 `acp/web/headless/sdk/sdk-minimal`；拒绝用内置名作为自定义 profile 目标；`normalizeShippedProfile` 在 bundle 列表等于内置元组或缺少 `patchReload` 默认值时回写 manifest。

**新事实**（`packages/boot/app-boot/src/profile.ts`）：

| 断言 | 0.1.6 行号 | 内容 |
| --- | --- | --- |
| 名值拒绝 | `:129-136` | `name === '' \|\| includes('/') \|\| includes('\\') \|\| === '.' \|\| === '..' \|\| === 'node_modules'` → throw |
| 保留模板名 | `:139-160` | `acp`/`web`/`headless`/`sdk`/`sdk-minimal`，**五个全在**，bundles 与 patchReload 值未变 |
| 拒绝内置名作自定义目标 | `:123-128` | `if (Object.hasOwn(PROFILE_TEMPLATES, name)) throw` |
| 模板未知则拒绝且不落盘 | `:114-122` | 先校验模板，后 `mkdirSync` |
| 规范化回写 | `:781-803` | `isRetiredTuple`（`headless` 旧三元组）或 `needsReloadDefault` → `writeProfileManifest` |

**裁决依据**：全部语义逐条成立；`PROFILE_TEMPLATES` 内容与旧版逐字相同（`web` 仍为 `live`，其余 `startup`）。

**行号更新建议**：`profile.ts:95-102` → **`:129-136`**；`:105-126` → **`:139-160`**；`:119-124` → **`:123-128`**；`:689-711` → **`:781-803`**。

**T01/T04/T05 影响**：无机制变化。T01「profile 名 soloips 不复用内置 web」的依据成立；SOLO-FAIL-09 的检测方式成立。

---

## 3. 失败机制（SOLO-F01–F08）

### SOLO-F01 — 故障矩阵：**已变化**（F-1/F-2 成立；F-3/F-4/F-5 失效）

| 编号 | 旧结论 | 0.1.6 裁决 | 证据 |
| --- | --- | --- | --- |
| F-1 bundle 包不可解析 | 启动前失败，**整个 profile 起不来** | **成立** | `profile.ts:845-848`（`resolveBundleDir` 抛错并提示 `dsh plugin ... install`） |
| F-2 列入 bundles 但无 `dsh.bundle` | 同上，启动前抛错 | **成立** | `profile.ts:880-882` |
| F-3 同一次 group 配置重复 entry ID | 预检抛 TypeError，未创建条目、不进 catch 回滚 | **已变化** | 预检**已删除**；`group.ts:48-65` 静默后者覆盖，无抛错、无回滚（见 SOLO-C04） |
| F-4 行 name 指向的模块导入失败 | 所在 group 更新尝试恢复旧配置，恢复可能失败 | **已变化** | `entry.ts:175-189`：`_init()` 捕获 import 错误后 `logger.error` 并 **`return`**（不抛出）；`group.ts:58-60` 再 `catch` 一次。**无恢复、无抛出** |
| F-5 行 apply 抛错 | 所在 group 收集失败并尝试恢复，可能报 rollback failed | **已变化** | 同上：`group.ts:56-64` 的 `Promise.all` + 逐条 `.catch(logger.error)`；**无 rollback 分支、无 AggregateError** |
| F-6 依赖服务未就绪 | 缺 inject 必需服务时插件不运行（pending） | **成立** | `vendor/cordis/README.md:65`（**blob IDENTICAL**）；`index.ts:779-784` 仍按 `fiber.inject` 计算缺失服务并报告 pending |
| F-7 升级丢失 `dsh.bundle` | 无专门告警地移出 bundles | **成立** | `plugin.ts:78-87`（blob IDENTICAL） |
| F-8 patch 目标行不存在/name 不匹配 | warn 后跳过 | **成立** | `include/src/index.ts:109-118` |
| F-9 patch 文件不可解析/非顶层数组 | 抛错，启动失败 | **成立** | `app-boot/src/index.ts:364-382`（`parsePatchList`）；`:329-337`（`loadOverlayPatches` 缺失即抛） |
| F-10 用户 patch 文件缺失 | ENOENT 视为无此层 | **成立** | `app-boot/src/index.ts:309-318`（`loadOptionalPatches`，ENOENT → `undefined`） |
| F-11 git 源安装无 prepare 构建 | 首次 add 失败；加白后重跑 | **成立** | `plugin.ts:150-161`（blob IDENTICAL）；`docs/user/develop/basic/publish.md:161-173`（文件 CHANGED，该段内容经复核仍在） |
| F-12 live reload 配置失败 | HMR 记录日志与失败事件；旧树能否恢复取决于回滚 | **已变化** | 事件**已移除**；失败仅日志（`watch-config.ts:60-64`、`include/src/index.ts:283-286`）；回滚**已删除**（见 MECH-10） |

**F-4/F-5 的新源码细节**（`vendor/loader/src/config/entry.ts`）：

```ts
// :175-189  _init()
private async _init() {
  let exports: any
  try {
    exports = await this.parent.tree.import(this.options.name, this.getOuterStack)
  } catch (error) {
    this.ctx.logger.error(error)
    return                                    // ← 吞掉，不抛出
  } finally {
    this._initTask = undefined
  }
  const plugin = this.loader.unwrapExports(exports)
  this._patchContext([])
  this.loader.showLog(this, 'apply')
  this.fiber = this.ctx.registry.plugin(plugin, this.options.config, this.getOuterStack)
}
```

旧版 `entry.ts` 有 `updateError(stage, …)` 包装（stage 为 `import`/`dispose`/`apply`/`rollback`）与 `_dispose`/`_start`/`commit()` 的事务序列；**新版全部删除**。全仓检索 `updateError`：**零命中**。

**旧结论 → 新事实 → 影响**：

| | 内容 |
| --- | --- |
| **旧结论** | 故障矩阵中 F-3/F-4/F-5/F-12 均描述"抛出 → 尝试回滚 → 可能 rollback failed" |
| **新事实** | Loader 侧**事务与回滚全部移除**。entry 级 import/apply 失败被 `logger.error` 吞掉；group `update()` 无 try/catch；重复 id 无预检。**失败不再传播为异常，也不再恢复旧配置** |
| **对 T01** | ① 装配契约**不能**声明"失败自动回滚"。② T01 的失败语义必须写成"失败即部分应用 + 日志"，并据此设计自检。③ 「装配与状态分别恢复」中的"装配恢复"只能靠**外部材料**（dump 基线 + lockfile + 冷启动），不能靠 Loader |
| **对 T04** | ① 门禁必须**主动检测部分应用状态**：由于失败不产生非零退出码也不回滚，唯一可靠判据是 L2 dump 与基线逐行比对。② 需新增"缺行检测"用例（某 `soloips-*` 行未挂载时应被门禁捕获） |
| **对 T05** | ① SOLO-F01 故障矩阵的 F-3/F-4/F-5/F-12 预期后果**须全部重写**。② SOLO-ACC-CE-C/E 中"观察回滚结果"的步骤不可执行。③ 新增用例：注入 import 失败，断言**我们的门禁**发现缺行（而非期待启动失败） |

**行号更新建议**：F-1 `profile.ts:753-756` → **`:845-848`**；F-2 `:788-790` → **`:880-882`**；F-3 `group.ts:59-70` → **已删除**；F-4 `entry.ts:217-220、:280-287` → **`:175-184`**；F-5 `entry.ts:287` → **已删除**（现 `group.ts:58-60`）；F-9 `index.ts:350-368` → **`:364-382`**；`:315-323` → **`:329-337`**；F-10 `index.ts:295-304` → **`:309-318`**；F-12 `hmr/src/index.ts:305-315` → **事件已删除**。

---

### SOLO-F02 — 组合失败与挂载失败的作用范围：**已变化** ⚠️

**旧结论**：
1. 解析期：任一 bundle 不可解析或缺 `dsh.bundle` 即抛错（`profile.ts:784-793`）→ **成立且未变**（`:876-885`、`:880-882`）。
2. 挂载期：`group.ts:71` 用 `Promise.allSettled` 并发创建；`:76-80` 抛失败；`:85-105` 移除该 group 本次新增条目并重建旧配置；可能抛 `AggregateError('loader entry rollback failed')`。
3. 「组合层没有跳过坏包继续启动的分支」。

**新事实**：

| 旧断言 | 0.1.6 | 裁决 |
| --- | --- | --- |
| 解析期不跳过 | `profile.ts:876-885`：`bundles.map` 中任一层抛错即中断 | **成立** |
| 挂载期 `Promise.allSettled` + 抛错 + 回滚 | `group.ts:56-64`：`Promise.all` + 逐条 `.catch(logger.error)`；**无抛出、无回滚** | **已变化** |
| 「组合层没有跳过坏包继续启动的分支」 | 挂载期**现在就是**"跳过坏行继续"：`:58-60` 吞掉错误 | **已变化** |

**再叠加 MECH-06**：即使挂载期真有异常，`auditStartupEntries` 也只在 required 集合上 reject，其余降级 warn。

**旧结论 → 新事实 → 影响**：

| | 内容 |
| --- | --- |
| **旧结论** | 组合解析失败可能阻断该组合启动；挂载失败在 group 内回滚；失败半径须按触发路径区分 |
| **新事实** | **失败半径显著收窄且静默化**：解析期仍 fail-loud（bundle 无法解析/缺声明）；挂载期**既不回滚也不抛出**，entry 失败降级为 `logger.error` + `auditStartupEntries` 的 warning（除非命中 7 个 required id） |
| **对 T01** | ① 「不得把源码证据扩为任意单包错误均导致整个 profile 失败」（技术架构 §5.4 反面声明）**现在有正面源码支持**，T01 可引用。② 但反向风险上升：**soloips 包失败会被静默吞掉**，T01 必须自带装配自检 |
| **对 T04** | ① 门禁的失败半径假设**必须改写**：不能以"启动成功"证明组合正确（已是强证据）。② 门禁需覆盖"部分应用"这一新常态。③ 建议 T04 在 L2 dump 上对每个预期 `soloips-*` 行做存在性 + config 断言 |
| **对 T05** | ① SOLO-ACC-CE-A/C/E 的预期后果须按新半径重写。② 技术架构 §4.3 的 DRAFT-D04（各阶段失败范围须分别核对）**部分已被源码回答**：解析期 fail-loud、挂载期静默降级、pending 可诊断。③ 但**目标运行表现**（0.1.6 实际安装）仍属〔未验证〕 |

**行号更新建议**：`profile.ts:784-793` → **`:876-885`**；`group.ts:71` → **`:56`**；`:75-80` → **已删除**；`:85-105` → **已删除**。

---

### SOLO-F03 — 重复 entry ID 的预检拒绝：**已变化** ⚠️

与 SOLO-C04 同一事实，此处按失败机制面记录：

- **旧结论**：`group.ts:59-66` 在创建条目前检查重复 ID；`:64` 的 TypeError 位于 `:70` 的 try 之前，故本次调用尚未创建条目，也不进入 `:85-105` 的恢复分支。
- **新事实**：`:59-66` 的检查与 `:70` 的 try **均不存在**。`group.ts:48-65` 直接构造 `oldMap`/`newMap` 并并发更新。
- **裁决**：**已变化**。
- **对 T01/T04/T05 影响**：见 SOLO-C04 表格（三处影响一致）。补充：技术架构 §10.3 的建议「按实际 Loader 入口验证重复定义被拒」**不可执行**，须替换为"在 dump 上自行断言唯一性"。

---

### SOLO-F04 — 服务未就绪 fail-closed pending：**已变化**（机制成立，可见性变化）

**旧结论**：`vendor/cordis/README.md:65` 说明 inject 声明插件运行前必需存在的服务；缺服务时保持 pending。
**新事实**：

| 断言 | 0.1.6 证据 | 裁决 |
| --- | --- | --- |
| inject 语义（缺服务不运行） | `vendor/cordis/README.md:65`（**blob IDENTICAL**） | **成立** |
| pending 状态可诊断 | `packages/boot/app-boot/src/index.ts:779-784`：按 `fiber.inject` 计算缺失服务并生成 `pending (waiting for services: …)` | **成立** |
| pending 导致启动失败 | 旧：`assertEntriesActivated` 遍历所有 entry → **抛错** | **已变化**：`auditStartupEntries:831` 仅 warn，除非命中 required 集合 |

**旧结论 → 新事实 → 影响**：

| | 内容 |
| --- | --- |
| **旧结论** | 缺 inject 必需服务时插件不运行（pending）；目标挂起状态与可见性另验 |
| **新事实** | pending 语义未变，但**默认不再致命**：非 required 行的 pending 只产生一条 warning，进程继续。可见性从"启动失败"降为"stderr warning" |
| **对 T01** | ① 「缺依赖服务时挂起并保持可诊断」的〔建议〕**仍成立且更关键**——因为不再有启动失败兜底。② T01 必须为 SoloIPs 行设计**显式可观测出口**（日志或自检），否则与静默不工作不可区分 |
| **对 T04** | ① 门禁必须显式检测 pending（解析 dump 或读取启动诊断）。② 不能依赖退出码。③ 若 SoloIPs 关键行需 fail-closed，考虑纳入自有断言而非依赖 DSH |
| **对 T05** | ① SOLO-F04 的〔未验证〕项（挂起是否有统一日志/UI 提示、是否超时）**部分已被源码回答**：有 stderr warning，无超时机制（`:779-784` 仅报告，不设 timer）。② 仍属目标运行表现〔未验证〕，须在 0.1.6 安装上实测 |

---

### SOLO-F05 — 升级丢失 dsh.bundle 的静默移除：**成立**（机制面）+ **无法核对**（后果面）

**机制面 — 成立**：
- `plugin.ts:78-87`（blob IDENTICAL）：`wasDependency && !stillBundle` → `splice`，**无 warning**
- `plugin.ts:88-90`：回写 manifest
- 唯一 warning 在 `:70-75`，属**普通依赖**分支，与移除无关

**后果面 — 无法核对**：旧结论称"其他 overlay 仍可能接入能力"。这需要**在目标安装上**核对完整生效树才能判定，我的授权是只读静态核对，**不能**给出该后果的裁决。

**裁决**：机制**成立**；后果**无法核对**（列入 §4）。

**T01/T04/T05 影响**：机制无变化。T04 的"核对完整生效树与功能入口"要求继续成立。

---

### SOLO-F06 — 未命中 patch 的 warn/skip：**成立**

与 MECH-09 同一事实，按失败机制面：

- `vendor/include/src/index.ts:109-118`：目标不存在 → `warn('patch: entry %C not found')` + `continue`；name 不匹配 → `warn('patch: name mismatch for %C …')` + `continue`。**均不抛错**。
- 日志可见性由调用入口决定：`profile.ts:933-939`（`composeEntries` 默认静默 sink）、`include/src/index.ts:239-243`（转发到 `ctx.root.logger`）。
- 设计意图注释：`app-boot/src/index.ts:351-357`（旧 cite `:341-343`）。

**裁决依据**：五个分支语义逐一未变（见 MECH-09 表）。

**T01/T04/T05 影响**：无变化。T04「发布门禁对非预期 patch 告警及缺失条目判失败」的依据成立。

---

### SOLO-F07 — dsh plugin 无回滚：**成立**（plugin 面）+ **无法核对**（安装器内部）

**plugin 面 — 成立**：`apps/cli/src/plugin.ts`（blob IDENTICAL）
- `:120-130` 初始化 profile
- `:134-138` `spawnSync('pnpm', ...)`
- `:148-149` 仅退出码 0 才 `reconcilePlugins`
- `:150-161` 非零只打印提示
- **全函数无任何回滚**：无 `rmSync`、无备份恢复、无 manifest 还原

**安装器内部 — 无法核对**：旧结论已声明"实际残留由安装器与失败阶段决定"；核对 pnpm 自身行为**超出本任务范围**（且不得运行 pnpm）。

**裁决**：plugin 面**成立**；安装器面**无法核对**（列入 §4）。

**T01/T04/T05 影响**：无变化。T01 的"变更流程必须自带完整装配恢复材料"要求继续成立且**加强**（叠加 MECH-07 的 Loader 无回滚）。

---

### SOLO-F08 — patchReload live/startup 差异：**已变化** ⚠️

**旧结论**：取值仅 `live`/`startup`；自定义 profile 默认 `live`；内置 web 为 `live`，其余 `startup`；非法值抛错；只有 live 安装 HMR 观察并在运行中重放用户层。

**新事实**：

| 断言 | 0.1.6 证据 | 裁决 |
| --- | --- | --- |
| 取值仅两种 | `packages/util/package-manifest/src/types.ts:65-66`（**blob IDENTICAL**） | **成立** |
| 自定义默认 `live` | `profile.ts:171`（`DEFAULT_PROFILE_PATCH_RELOAD = 'live'`） | **成立** |
| 内置模板取值 | `profile.ts:139-160`：web = `live`；acp/headless/sdk/sdk-minimal = `startup` | **成立** |
| 非法值抛错 | `profile.ts:869-874`（原 `:776-782`） | **成立** |
| live 才装 watcher | `apps/cli/src/profile-boot.ts:375-406`（原 `:355-385`） | **成立** |
| 重放保持「bundle 在下、overlay 在上」 | `profile-boot.ts:344-349`（`composeLive`，原 `:328-333`） | **成立** |
| startup 不装 watcher | `profile-boot.ts:374` 注释 | **成立** |
| HMR 失败记录日志 + `hmr/config-update-failed` 事件 | 事件**已移除**；仅日志 | **已变化** |
| 应用失败后旧树保留受回滚限制 | 回滚**已删除**；失败即保留旧树（不通知） | **已变化** |
| `group.ts:85-105` 可能抛恢复失败 | 该分支**已删除** | **已变化** |

**新增（须计入 T01）**：live 分支补装 timer/hmr 后新增 `await ctx.loader.await()`（`profile-boot.ts:391`），旧版无此等待。这使 live 启动路径的时序更确定，但也**延长了启动窗口**。

**旧结论 → 新事实 → 影响**：

| | 内容 |
| --- | --- |
| **旧结论** | live 失败路径记录日志与 `hmr/config-update-failed` 事件；旧树保留受回滚成功条件限制；`group.ts:85-105` 可能抛恢复失败 |
| **新事实** | ① 事件**已移除**，失败仅 stderr/logger warning。② Loader 回滚**已删除**，故不存在"回滚失败"模式——失败即无条件保留旧运行树。③ 新增 `await ctx.loader.await()`。④ 取值、默认值、模板取值、非法值抛错**全部未变** |
| **对 T01（装配契约）** | ① T01「patchReload: startup」的选择**更被支持**：live 的失败完全静默（无事件、无退出码），不适合作为交付默认。② T01 若在设计中引用 HMR 事件做可观测性，**须替换**为日志或 dump 比对。③ 「旧树保留受回滚限制」的措辞须改为"失败即保留旧树，且无通知" |
| **对 T04（profile 与组合门禁）** | ① 门禁须断言 profile manifest **显式**含 `patchReload: startup`（因默认是 `live`，遗漏即静默）。② 不得设计依赖 HMR 事件的检测项。③ 冷启动后 dump 比对是唯一可靠的组合验证路径 |
| **对 T05（准入）** | ① SOLO-ACC-05「写入→停止→冷启动→读回」编排**正确且必要**。② SOLO-ACC-CE-H 中"观察 HMR 失败事件"步骤**不可执行**，须改为观察日志或直接比对 dump。③ 「明确 patchReload 必须为 startup」升级为前置断言。④ 新增：live 模式下失败静默，故**不得**以"未观察到错误"作为通过证据 |

**行号更新建议**：`types.ts:65-66` → **不变**；`profile.ts:137` → **`:171`**；`:112-113` → **`:144-147`**；`:108-125` → **`:139-160`**；`:776-782` → **`:869-874`**；`profile-boot.ts:355-385` → **`:375-406`**；`:366-371` → **`:386-392`**；`:328-333` → **`:344-349`**；`:353-354` → **`:374`**；`vendor/hmr/src/index.ts:305-315` → **已删除**；`vendor/include/src/index.ts:296-319` → **`:279-287`**（语义已变）；`group.ts:85-105` → **已删除**。

---

## 4. 数据根（SOLO-DATA-01）与无法核对条目

### SOLO-DATA-01 — 默认布局：**成立**

**旧结论**：home 解析优先级；profile 目录 `home/profiles/<name>`；JSON domain 数据 `home/storages`；Session 历史 `home/sessions`；home patch 作用于同 home 各 profile。

**新事实**：

| 对象 | 0.1.6 证据 | 与旧 cite 对照 |
| --- | --- | --- |
| home：显式 → 非空 `DSH_HOME` → `~/.dsh`；展开并 resolve 为绝对路径 | `packages/util/home-paths/src/index.ts:87-91`（**blob IDENTICAL**）；`:61-63` 默认 `join(homedir(), '.dsh')`；`:70-74` 展开 `~` | 旧 cite `:77-99` → 内容**逐字相同**，行号亦相同 |
| profile 装配目录 = `home/profiles/<name>` | `profile.ts:129-136`（`join(home, PROFILES_DIR, name)`，`PROFILES_DIR = 'profiles'` 见 `:50`） | 旧 cite `:95-102` → 位移 +34 |
| JSON domain 数据 = `home/storages` | `packages/bundle/base/cordis.patch.yml:148-151`：`- id: storage-json` / `config: root: !!js dshHomePath('storages')` | 旧 cite `:148-156` → **行号相同**（该区间未变） |
| Session 历史 = `home/sessions` | `packages/bundle/base/cordis.patch.yml:110-113`：`- id: session-persistence-jsonl` / `config: root: !!js dshHomePath('sessions')` | 旧 cite `:109-113` → 位移 +1 |
| home patch 层位置（profile 层之后） | `apps/cli/src/profile-boot.ts:77-79`（`homePatchPath`）、`:212-219`（`allPatches`） | 旧 cite `:68-75` → **`:77-79`**；`:206-213` → **`:212-219`** |

**裁决依据**：`home-paths/src/index.ts` 为**同 blob**，语义与行号均成立；base patch 中两个 root 行经逐行核对，`dshHomePath('sessions')` 与 `dshHomePath('storages')` 均未变。

**重要边界（沿用旧结论，仍然有效）**：路径 resolve **不证明** realpath、大小写别名或链接已归一。`home-paths` 提供 `canonicalizeWatchPath`（`:33-55`）用于 watcher 场景，但**不**用于数据根归一。

**T01/T04/T05 影响**：无变化。SOLO-DATA-02 的三 home 隔离规划与 SOLO-ACC-10 的判据继续成立。

**T01 提示**：`dump-config.ts:46-50` 表明 L2 dump **默认包含** `$DSH_HOME/cordis.patch.yml`。基线快照须记录该文件存在性与哈希，否则跨机/跨 home 比对会出现假阳性（SOLO-FAIL-06 的机器差异字段问题）。

---

### 4.1 无法核对条目汇总

| 条目 | 无法核对的部分 | 原因 |
| --- | --- | --- |
| **MECH-04**（整条） | 跨 domain 原子提交能力 | 该条本为〔未验证〕，需**运行**正面证据；我只读核对，且检索到的仅是文档性否定陈述（`storage-domain/README.md:152`、`domain.ts:257`、`storage-json/README.md:32`），按"检索无结果不证明不存在"不得升格为证明。**维持原状：设计不得依赖共同原子提交** |
| **SOLO-F05**（后果面；机制面成立） | 「其他 overlay 仍可能接入能力」 | 需在**目标安装**上核对完整生效树与功能入口；静态源码不能回答目标运行组合。机制面（移除分支无告警）**成立** |
| **SOLO-F07**（安装器面；plugin 面成立） | pnpm 安装失败的实际残留 | 需运行 pnpm；本任务禁止启动服务/安装，且属未授权项 A6 邻接。`runPlugin` 无回滚**成立** |

**以下不属于"条目裁决"，而是所有条目的共同证据边界**（单列以免被误读为某条无法核对）：

| 范围 | 说明 |
| --- | --- |
| 全部 25 条的运行后果 | 组合是否真正生效、服务是否可用、目标安装的实际日志与退出码 | 本任务**不启动服务、不装配、不调用模型**；所有裁决均为〔源码事实〕层面，**不构成装配生效或验收通过** |
| SOLO-F08 / MECH-10 的目标表现面 | 0.1.6 **实际安装**上的 live 失败表现与告警可见性 | 源码结论已给出（静默 warn + 保留旧树），但目标运行表现属〔未验证〕。**条目的源码机制裁决仍为"已变化"** |

**另需声明的核对缺口**：

1. `packages/.external/dsh-agent-swarm` **在本 fork 中不存在**（`git ls-tree -r HEAD -- packages/.external` 为空，`c291e796` 亦为空，本地目录不存在）。技术架构中多处引用 `dsh-agent-swarm/cordis.patch.yml`（如 §8.2 S-F5、§10.4 F-6）**无法在本 fork 核对**。
2. 技术架构 §8.2 S-F5 引用的 `packages/.external/dsh-agent-swarm/cordis.patch.yml:26-31` 因此**无法核对**。
3. 技术架构 §10.4 引用的 `dsh-agent-swarm/cordis.patch.yml:5-9` 同上。

---

## 5. 对 T01 / T04 / T05 的汇总影响

§5.1–§5.2 覆盖 **9 条"已变化"**条目，按影响强度排序；§5.3 覆盖 **13 条"成立"**条目中需要更新引用的部分。每条给出**旧结论 → 新事实 → 具体动作**。

### 5.1 阻断级（设计前提被推翻，必须改）

| # | 条目 | 旧结论 → 新事实 | 对 T01 | 对 T04 | 对 T05 |
| --- | --- | --- | --- | --- | --- |
| 1 | **SOLO-F03 / SOLO-C04** 重复 entry id | 预检抛 TypeError **已删除**；重复 id 静默后者覆盖，无错无警，前条永不创建 | 行 id 唯一性从"Loader 兜底"变为**我们唯一负责**；`soloips-*` 前缀 + 逐条自检成为硬要求 | 门禁**必须**含 id 唯一性静态断言；原"验证重复被拒"用例不可执行 | SOLO-ACC-01 的 id 唯一证据须由**我们的断言**提供，不能引用 Loader |
| 2 | **MECH-07 / SOLO-F01(F-4,F-5) / SOLO-F02** Loader 回滚 | `group.ts:85-105` 回滚分支与 `entry.ts` 的 `updateError`/事务序列**全部删除**；entry 失败仅 `logger.error` 吞掉 | 不得声明"失败自动回滚"；装配恢复只能靠外部材料（dump 基线 + lockfile + 冷启动） | 门禁须检测**部分应用**状态；不能假设失败后回到旧树 | SOLO-ACC-06 编排改为「停止 → 修复 → 冷启动」；删除"观察自动回滚"用例；F-4/F-5/F-12 预期后果重写 |
| 3 | **MECH-06 / SOLO-F01(F-1,F-2) / SOLO-F02 / SOLO-F04** 失败半径 | 任一 entry 非 ACTIVE 即启动失败 → 仅 7 个 required id + bootstrap include 失败才 reject，其余**降级为 warning** | 「退出码 0 不是组合正确证据」升级为强证据；必须自带装配自检 | 门禁判据**必须**是 L2 逐行比对；须显式检测 pending | SOLO-ACC-01 判据落在 dump；新增 pending 检测用例；新增缺行检测用例 |

### 5.2 重要级（设计需调整，但方向未推翻）

| # | 条目 | 旧结论 → 新事实 | 对 T01 | 对 T04 | 对 T05 |
| --- | --- | --- | --- | --- | --- |
| 4 | **MECH-10 / SOLO-F08 / SOLO-F01(F-12)** live 失败可观测性 | `hmr/config-update-failed` 事件**已移除**；失败仅就地 warn；回滚已删 | 可观测性设计不得依赖 HMR 事件；改用日志/dump 比对 | 不得设计依赖 HMR 事件的检测项；须断言 manifest 显式含 `patchReload: startup` | SOLO-ACC-CE-H 的"观察事件"步骤不可执行；改为观察日志或比对 dump；"未观察到错误"不得作为通过证据 |
| 5 | **SOLO-C05** profile 三件套 | 三件套语义未变，但行号整体位移；`patchReload` 参数改为可选默认 `live` | 三件套草案依据成立；**必须显式写 `patchReload: startup`** | 断言字段**显式存在**且为 startup（非依赖默认值） | SOLO-ACC-05 的 patchReload 检查升级为前置断言 |

### 5.3 引用级（结论不变，仅需更新行号）

本表覆盖**所有需要替换行号的条目**（含"成立"条目与 §5.1/§5.2 中另需改引用的条目）。标注「**不变**」者为同 blob，旧行号可原样保留。

| # | 条目 | 需更新的引用 |
| --- | --- | --- |
| 6 | MECH-01 / SOLO-C01 | `profile-boot.ts:206-213` → `:212-219`；`profile.ts:784-793` → `:876-885`；`include/src/index.ts:77-124` → `:76-127` |
| 7 | MECH-02 / SOLO-C03 | `include/src/index.ts:121-124` → `:120-123`；`base/cordis.patch.yml:6-10`、`web-app/cordis.patch.yml:5-6` **不变** |
| 8 | MECH-09 / SOLO-F06 | `include/src/index.ts:267-270` → **`:239-243`**（logger 转发；旧行号现指向 `stop()`）；`profile.ts:841-847` → `:933-939`；`app-boot/src/index.ts:341-343` → `:351-357` |
| 9 | SOLO-C06 | `app-boot/src/index.ts:409-472` → `:423-486`；`:441-449` → `:455-463`；`:388-395、:452-471` → `:466-483`、`:489-517`；`profile-boot.ts:336` → `:352`；`:323-327` → `:350-351`；`args.ts:100-114、:149、:184` **不变** |
| 10 | SOLO-C07 | `profile.ts:95-102` → `:129-136`；`:105-126` → `:139-160`；`:119-124` → `:123-128`；`:689-711` → `:781-803` |
| 11 | SOLO-DATA-01 | `home-paths/src/index.ts:77-99` **不变**（同 blob）；`profile.ts:95-102` → `:129-136`；`base/cordis.patch.yml:148-156`、`:109-113` **基本不变**（`:110-113` 为 session root）；`profile-boot.ts:68-75` → `:77-79`、`:206-213` → `:212-219` |
| 12 | SOLO-F01(F-9,F-10) | `app-boot/src/index.ts:350-368` → `:364-382`；`:315-323` → `:329-337`；`:295-304` → `:309-318` |
| 13 | MECH-03 / MECH-08 / SOLO-F05 / SOLO-F07 | `apps/cli/src/plugin.ts:65-69、77-90、120-162` **全部不变**（同 blob） |
| 14 | MECH-05 | `storage-domain/src/index.ts:65-72、103-107`；`storage-json/README.md:142` **全部不变**（同 blob） |
| 15 | SOLO-F04 | `vendor/cordis/README.md:65` **不变**（同 blob）；**新增** `app-boot/src/index.ts:711-719、779-784、818-835` |
| 16 | MECH-06 / SOLO-F02 | `profile.ts:749-756` → `:845-848`；`:784-793` → `:876-885`；`group.ts:71、:75-80、:85-105` → **全部删除**（现 `:56-64`） |
| 17 | SOLO-C04 / SOLO-F03 | `group.ts:59-66` → **已删除**；`group.ts:85-105` → **已删除**；`tree.ts:66-73` → `:51-58` |
| 18 | SOLO-C05 | `profile.ts:165-185` → `:199-219`；`:139-143` → `:173-177`；`:150-155` → `:184-189`；`:653-676` → `:745-768` |
| 19 | MECH-10 / SOLO-F08 | `profile-boot.ts:328-333` → `:344-349`；`:350-381` → `:375-406`；`:355-385` → `:375-406`；`:366-371` → `:386-392`；`:353-354` → `:374`；`include/src/index.ts:296-319` → `:279-287`（语义已变）；`hmr/src/index.ts:305-315` → **事件已删除**，改引 `watch-config.ts:58-65`；`profile.ts:137` → `:171`；`:112-113` → `:144-147`；`:108-125` → `:139-160`；`:776-782` → `:869-874` |
| 20 | SOLO-F01(F-3,F-4,F-5,F-12) | `group.ts:59-70` → **已删除**；`entry.ts:217-220、:280-287、:287` → **已删除**（现 `:175-189`）；`entry.ts:24-27`（`updateError`）→ **已删除**；`hmr/src/index.ts:305-315` → **已删除** |

### 5.4 附录 B 更新要求（T01 负责）

`docs/technical-architecture.md` 附录 B 第 3 项当前记录「根包 0.1.5-rc.2、HEAD `c291e7961a515f6d7af9304e7fd1d257929aef26`」。经本次核对：

- `c291e796` **仍是**当前 HEAD 的祖先（可追溯），但**不再等于** r002 实际使用的源码。
- r002 实际：**`abdfeb48` / 0.1.6-alpha.1**。
- 建议：附录 B 第 3 项拆为两条——「历史基线（多名成员 2026-09-15 读取，0.1.5-rc.2 / `c291e796`）」与「r002 实际基线（0.1.6-alpha.1 / `abdfeb48`，2026-09-16 只读复核）」，并把 §6/§8.9/§10 的行号按 §5.3 更新。

**注**：附录 B 与 §6/§8/§10 属 `docs/technical-architecture.md`，其变更权为 `user-authorized-reviewed-candidate`（`document-registry.yaml:142-150`）。**本记录只提出更新要求，不修改该文档。**

---

## 6. 证据边界与未执行项

### 6.1 已执行（只读）

| 操作 | 具体命令/方法 |
| --- | --- |
| HEAD 与版本核对 | `git rev-parse HEAD`、`git log -1`、`git status -sb`、`git status --porcelain` |
| 提交关系确证 | `git merge-base --is-ancestor`、`git rev-list --count`、`git diff --name-only`、`git diff --stat` |
| 文件级变更判定 | `git rev-parse <rev>:<path>` blob hash 两两比对 |
| 旧基线内容读取 | `git show c291e796…:<path>`（**未 checkout、未 fetch、未修改工作树**） |
| 现行源码读取 | `read` 工具逐文件读取 + 行号定位 |
| 全仓检索 | `git grep`（用于确认 `duplicate loader entry id`、`assertEntriesActivated`、`config-update-failed`、`updateError` 的存废） |

### 6.2 未执行（授权边界内）

- **未** `git fetch` / `git pull` / 任何网络操作（未授权项 A6）
- **未** 构建、打包、安装（A6）
- **未** 修改 `$DSH_FORK_CHECKOUT` 任何文件（只读；工作树保持原有 `M AGENTS.md` + 3 未跟踪文件）
- **未** 启动任何服务、**未** 执行任何 `dsh` 命令（A1）
- **未** 做故障注入
- **未** 调用任何模型（A5）
- **未** 修改 `docs/technical-architecture.md` 或任何注册文档
- **未** 触碰 r001 实例、55120 生产实例、任何 home 或凭据

### 6.3 裁决的证据层次声明

- 本记录全部裁决为**〔源码事实〕层面**：绑定 `abdfeb48`（0.1.6-alpha.1）的源码文件与行号。
- **〔推断〕** 标注处（如 SOLO-C04 的"静默后者覆盖"后果）为由源码结构推出的行为，**未经运行验证**。
- **〔未验证〕** 处（如 MECH-04、目标运行表现）已单列于 §4.1。
- **本记录不构成**：装配生效证据、验收通过证据、需求确认、或对任何 SOLO-ACC 场景的裁决。
- 源码候选 ≠ 目标安装版本。r002 实际运行的是**由该候选构建打包的 tgz**，其字节与源码的一致性须由 T01 另行核对。

### 6.4 与团队成员的交叉核对

`adapter-dev`（task-4）于本次核对期间发来 7 条 seam 事实请求交叉验证。已回复，结论要点：

- 其报的 HEAD 不一致**属实**，与本节 §0.1 一致。
- 其 1（`ctx.storageDomain` 增强仍在 `storage-domain/src/index.ts:35-39`）与 5（namespace 正则 `^[a-z][a-z0-9-]*$` 在 `packages/settings/settings/src/index.ts:20`）**经我独立核对成立**，且两文件均与 0.1.5-rc.2 **同 blob**。
- 其 4 中「`spawnTeammate` 无 model 字段」**成立**（`agent-team/src/types.ts:144-151`）；但 `TeamMemberView.model` 的**读回来源**在 `abdfeb48` 已改变（`roster.ts:132/143/438-446`），其契约若读回 model 须以 `abdfeb48` 为准。
- 其 3 的路径 `packages/core/subagent/` **有误**，实际为 `packages/subagent/subagent/`。
- 其 2/6/7 我**未逐行核对**，已如实告知按〔未验证〕对待，不代为背书。
- 已告知其 MECH-06/SOLO-F02 失败半径变化对其 adapter apply 入口契约的直接影响（pending 不再致命、退出码 0 不再可信）。

---

## 7. 核验回执

**工作目录**：`$SOLOIPS_ROOT`　**核对对象**：`$DSH_FORK_CHECKOUT`　**时间**：2026-09-16

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| fork HEAD | `git rev-parse HEAD` | `abdfeb4831e163462ea4dd17ca5bb4e581d40d1c`（**≠ task-1 描述值**） |
| 与 task-1 描述 SHA 的关系 | `git rev-list --count 0d1f5000…HEAD` | `1`（直接父提交） |
| 差异文件集 | `git diff --name-only 0d1f5000…HEAD` | 仅 2 个 agent-team 文件；机制文件零差异 |
| 根包版本 | `package.json:3` | `0.1.6-alpha.1` |
| 旧基线可追溯性 | `git merge-base --is-ancestor c291e796… HEAD` | exit 0 |
| 机制文件变更面 | blob hash 两两比对（24 个文件） | 12 CHANGED / 12 IDENTICAL |
| 重复 id 预检存废 | `git grep 'duplicate loader entry id'` | **零命中**（已删除） |
| 全树断言存废 | `git grep 'assertEntriesActivated\|assertEntriesLoaded'` | 仅 2 处 README 文字，**无函数定义** |
| HMR 失败事件存废 | `git grep 'config-update-failed'` | 仅 2 处归档笔记，**无实现** |
| `updateError` 存废 | `git grep 'updateError' vendor/loader/src` | **零命中** |
| dsh-agent-swarm 存在性 | `git ls-tree -r HEAD -- packages/.external` | **空**（无法核对相关引用） |

**未执行**：未 fetch、未构建、未打包、未修改 fork 工作树、未启动服务、未做故障注入、未调用模型、未修改任何注册文档。

**证据边界**：以上为 2026-09-16 本机只读源码核对，绑定 `abdfeb48` 当时的源码状态。**本记录不证明任何机制在目标安装上生效，不构成装配生效或验收通过。**
