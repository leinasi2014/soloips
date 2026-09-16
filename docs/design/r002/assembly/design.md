# T01+T04 设计：装配契约与可复现交付定义

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-R002-ASSEMBLY-DESIGN`；**设计稿与候选内容**，非注册文档、非产品文件 |
| 目的 | 给出可直接落地的装配契约候选：三包 patch、装配层顺序、覆写重述清单、profile 三件套、组合回归门禁 |
| 范围 | `soloips-adapter-dsh` / `soloips-core` / `soloips-web` / `soloips-bundle` 的 patch 定义与 `profiles/soloips/` 交付定义；**不含**包内业务实现 |
| 决策状态 | 〔提案〕除标注〔约束〕者外均为候选，落地须先获得 A3 授权（`baseline.md` §6） |
| 证据范围 | 2026-09-16 本机隔离探针实测（`evidence/probe-log.md`）+ W0 源码核对（`r002-mechanism-audit-20260916/audit.md`）；**不构成装配生效或验收通过** |
| 依据 | `docs/technical-architecture.md` §6（SOLO-C01–C07）、§4.3（MECH-01–10）、§11.1（SOLO-ACC-01）、§11.10（SOLO-REG-01/02/04）；`docs/governance/code-development-standard.md` DEV-02/03/04/11/13；task-3 |
| 变更权 | 仅 task-3 所有者维护；DSH 基线变化时结论失效 |

---

## 0. 授权边界与本次交付性质

**〔约束〕本设计不写入 `packages/**` 或 `profiles/soloips/**`。** 产品实现属未授权项 A3。

| 动作 | 本次是否执行 |
| --- | --- |
| 写设计稿与草案副本到 `.artifacts/operations/r002-assembly-20260916/` | 是 |
| 写 `packages/*/cordis.patch.yml`、`packages/*/package.json` | **否**（A3） |
| 写 `profiles/soloips/**` | **否**（A3） |
| 装配、安装、启动服务 | **否**（A1/A6） |
| 调用模型 | **否**（A5） |

草案副本位于 `drafts/`，其目录结构**镜像目标路径**，落地时可整体复制：

```
drafts/packages/adapter-dsh/cordis.patch.yml   -> packages/adapter-dsh/cordis.patch.yml
drafts/packages/core/cordis.patch.yml          -> packages/core/cordis.patch.yml
drafts/packages/web/cordis.patch.yml           -> packages/web/cordis.patch.yml
drafts/packages/bundle/cordis.patch.yml        -> packages/bundle/cordis.patch.yml
drafts/profiles/soloips/package.json           -> profiles/soloips/package.json
drafts/profiles/soloips/cordis.patch.yml       -> profiles/soloips/cordis.patch.yml
drafts/profiles/soloips/pnpm-workspace.yaml    -> profiles/soloips/pnpm-workspace.yaml
```

---

## 1. 基线与 W0 依赖登记

### 1.1 双重证据面

| 证据面 | 来源 | 性质 |
| --- | --- | --- |
| **源码** | W0 `audit.md`，绑定 fork `abdfeb48`（0.1.6-alpha.1） | 静态核对，给出机制裁决与行号 |
| **已安装工件** | 本设计 `evidence/probe-log.md`，绑定 `soloips-devs/versions/r001/runtime`（0.1.6-alpha.1 tgz） | 可执行核对（boot-free dump 探针） |

两面**独立取得且结论一致**（尤其 SOLO-C03、SOLO-C04）。工件与源码的字节一致性
仍须由打包环节核对（W0 §6.3 已声明该边界）。

### 1.2 W0 依赖登记（task-3 强制要求）

**本设计的全部结论按对 W0 的依赖程度分三档标注。**

| 档 | 含义 | 条目 |
| --- | --- | --- |
| **A：强依赖 W0** | W0 裁决直接决定设计成立与否；W0 若翻案，设计必须重做 | §2.1 架构选型、§4 重述清单、§6 门禁判据、§3 装配层位置 |
| **B：部分依赖 W0** | 设计形状不依赖 W0，但关键参数依赖 | §5 三件套（`patchReload` 默认值）、§6 分层模型 |
| **C：不依赖 W0** | 版本无关的契约结构 | 行 id 前缀规则、patch 文件形状、草案目录结构、门禁流程骨架 |

**逐条对照（W0 裁决 → 本设计处置）：**

| W0 条目 | W0 裁决 | 本设计的处置 |
| --- | --- | --- |
| MECH-01（bundles 层序） | 成立（仅行号位移） | **A**：§2.1 顺序方案依据成立，直接采用 |
| MECH-02 / SOLO-C03（config 整体替换） | **成立** | **A**：§4 重述清单依据成立。本设计**另加可执行实证**（探针 P0） |
| MECH-03（reconcile 追加） | 成立 | C：§3 顺序说明引用，不改变设计 |
| MECH-05（already-open 作用域） | 成立 | C：与装配契约无直接交集 |
| **MECH-06 / SOLO-F01 / SOLO-F02 / SOLO-F04（失败半径）** | **已变化**：仅 7 个 required id 失败才 reject，其余降级 warning | **A**：**直接改变门禁判据**——§6.1 明确"退出码 0 不可信"，§6.2 必须逐行比对；§7 风险 R1 |
| MECH-07（runPlugin 无回滚） | 成立 + **Loader 侧回滚已删除** | **A**：§5.5 明确"装配恢复只能靠外部材料"，不声明自动回滚 |
| MECH-08（静默移除） | 成立 | C：§7 风险 R4 记录 |
| MECH-09 / SOLO-F06（warn/skip） | 成立 | **A**：§6.2 判据把非空 stderr 视为失败，不依赖日志出现与否 |
| **MECH-10 / SOLO-F08（live 失败静默）** | **已变化**：事件已删除，失败仅 warn | **A**：§5.3 强制显式 `patchReload: startup`；§6.6 盲区 M3 |
| **SOLO-C04 / SOLO-F03（重复 id 预检）** | **已变化**：预检**已删除**，静默后者覆盖 | **A**：**本设计最重要的调整**——§6.5 把 id 唯一性断言设为门禁**独立必测项**，不再指望 Loader 报错。本设计另加实证（探针 P5） |
| SOLO-C01（bundles 顺序） | 成立 | **A**：§2.1、§3 直接采用 |
| SOLO-C02（yml 行序无语义） | 成立 | C：§2.1 备注 |
| SOLO-C05（三件套） | 已变化（内容成立、行号位移；`patchReload` 默认 `live`） | **B**：§5 形状不变；§5.3 因默认值变化而**强制显式声明** |
| SOLO-C06（dump 同源） | 成立（一处边界修正） | **A**：§6 门禁依据成立 |
| SOLO-C07（profile 名保留） | 成立 | C：§5.2 名字选择依据成立 |
| SOLO-DATA-01（数据根） | 成立 | **B**：§6.3 基线须绑定 `$DSH_HOME/cordis.patch.yml` 哈希 |
| MECH-04（跨 domain 事务） | **无法核对** | C：§7 风险 R6 记录，设计不依赖 |

**〔约束〕W0 的 3 条"无法核对"（MECH-04、SOLO-F05 后果面、SOLO-F07 安装器面）
不得被本设计当作"已证否"或"已证实"使用。** 相关结论在 §7 单列为待验风险。

### 1.3 本设计新增的、W0 未覆盖的可执行事实

W0 是源码核对，未覆盖 `parsePatchList` 的**形状校验**与 dump 的**运行期落差**。
本设计以隔离探针补充三条，均记入 `evidence/probe-log.md`：

| # | 事实 | 影响 |
| --- | --- | --- |
| **N1** | `insert` 必须是顶层**数组**，写成映射会抛 `TypeError: patch.insert?.forEach is not a function`，**整个 profile 加载失败** | §2.2 形状契约；§7 风险 R2 |
| **N2** | dump 不校验模块可解析性：`name` 指向不存在的包，dump **成功且无报错** | §6.6 盲区 M2；§7 风险 R3 |
| **N3** | 重复 id 时 **dump 行数 > 实际挂载 entry 数**（dump 3 行 / 运行时 1 个 entry） | §6.5 必测项；把 W0 的〔推断〕升级为实证 |

---

## 1A. 被 W0 发现取代的既有结论（取代关系登记）

**〔约束〕本节是 task-3 的强制要求：明确标注哪些结论已被 W0 取代。**
下表左列为**设计前**可能沿用的既有表述（来自技术架构 §6/§10/§11.1 与 task-3 描述），
右列为 W0 核实后的**现行事实**与**本设计的处置**。

| # | 被取代的既有结论 | 取代后的事实（W0 + 本设计实测） | 本设计的处置 | 状态 |
| --- | --- | --- | --- | --- |
| **S1** | 技术架构 §10.3〔建议〕：「按实际 Loader 入口验证重复定义被拒」；SOLO-C04「重复即致命，`group.ts:61-66` 抛 TypeError」 | **重复 id 预检已删除**。`duplicate loader entry id` 全仓零命中；`group.ts` 用 `Object.fromEntries` 静默取后者。**该用例不可执行** | §6.5 改为**自带 id 唯一性断言（G1）**；§6.5 明示"验证重复被拒"的用例**不得编写**；§2.2 行 id 规则升为硬要求 | **已取代** |
| **S2** | SOLO-F01 F-4/F-5、SOLO-F02 第 2 点：「Loader 挂载失败会尝试恢复旧配置，可能报 rollback failed」 | **回滚整体删除**。`updateError` 零命中；entry 失败仅 `logger.error` 吞掉，不抛出、不恢复 | §5.5 明确"**不得声明失败自动回滚**"；§7 风险 R7；装配恢复只能靠 dump 基线 + lockfile + 冷启动 | **已取代** |
| **S3** | 基线 §2「进程退出码 0 不是组合正确证据」（原为**反面声明**） | **升级为强源码证据**。`assertEntriesActivated` 已由 `auditStartupEntries` 取代：仅 7 个 required id + bootstrap include 失败才 reject，其余降级为**一条 warning 并继续** | §6.1 列为最重要的反面声明；§6.5 新增 **G2 缺行检测**；§7 风险 R1。`soloips-*` **不在** required 集合内 | **已取代并强化** |
| **S4** | SOLO-C05：「`initProfile` 三件套」；隐含 `patchReload` 有确定默认 | 三件套语义**成立**，但 `patchReload` 参数改为**可选、默认 `live`**（`profile.ts:171`） | §5.3 强制**显式**写 `patchReload: startup`；§6.5 **G4** 断言字段**显式存在**（非断言生效值） | **已取代** |
| **S5** | MECH-10 / SOLO-F08：live 失败会广播 `hmr/config-update-failed` 事件 | **事件已移除**（代码零命中，仅存归档笔记）。失败仅就地 `logger.warn` 并保留旧树，无事件、无退出码 | §5.3（startup 更必要）；§6.6 盲区 M4；**门禁不得设计依赖 HMR 事件的检测项**；"未观察到错误"不得作为通过证据 | **已取代** |
| **S6** | 技术架构 §11.1：「dump 不启动进程、不求值 `!!js`」 | 前半**成立**，但**不等于不写文件**。`prepareProfile` 每次都重写 `<profile>/cordis.yml`（本机实测 P17） | §6.2 生成方式注明副作用；§6.3 明确基线锚点是 `cordis.patch.yml` 而非 `cordis.yml`；§6.6 盲区 M6 | **已补正** |
| **S7** | task-3 描述：fork HEAD `0d1f50007f9bca3f52b06e1c3074fa14d5fb0720` | 实测 HEAD = **`abdfeb4831e163462ea4dd17ca5bb4e581d40d1c`**；`0d1f5000` 是其**直接父提交**（`rev-list --count` = 1），差异仅 2 个 agent-team 文件（`roster.ts`、`team.spec.ts`），**机制文件零差异** | 本设计一律按 `abdfeb48` 引用（§1.1）；W0 裁决对两个 SHA 均成立 | **已更正** |
| **S8** | 技术架构 §11.1 隐含：dump 可自由加参数 | dump 模式**拒绝 app 参数**：`error: config dumps take no app arguments`（实测 P18） | §6.2 明确唯一调用形式 `dsh --profile <name> --dump-config`；门禁脚本据此实现 | **已补正** |

**未受取代影响的既有结论（继续有效）**：MECH-01、MECH-02/SOLO-C03、MECH-03、MECH-05、
MECH-08、MECH-09/SOLO-F06、SOLO-C01、SOLO-C02、SOLO-C06、SOLO-C07、SOLO-DATA-01、
SOLO-F01 的 F-1/F-2（解析期仍 fail-loud）。

**仍无法核对（不得升格为已证实或已证否）**：MECH-04、SOLO-F05 后果面、
SOLO-F07 安装器面 —— 见 §1.2 与 §7 风险 R6。

**W0 未覆盖、由本设计补充的可执行事实**：N1（`insert` 形状）、N2（dump 不校验模块）、
N3（dump 行数 > 运行 entry 数）、P17（dump 写盘）、P18（dump 拒绝 app 参数）。
W0 是**源码**核对，未覆盖 `parsePatchList` 的形状校验与 dump 的磁盘副作用。

---

## 2. 交付物 1：三包各自的 `cordis.patch.yml`

### 2.1 架构选型：根层 insert，不使用 group（**A 档：依赖 W0 MECH-01/SOLO-C01**）

**〔提案〕三个能力包各自在根层 insert 自己的顶层行；`soloips-bundle` 不定义 group，只做覆写。**

候选方案与实测裁决：

| 方案 | 形状 | 实测结果 | 裁决 |
| --- | --- | --- | --- |
| **A（采纳）** | 各能力包在根层 insert 自己的顶层行 | 三行均进入生效树，来源标签各 1 段，**stderr 为空** | ✅ 采纳 |
| B | `soloips-bundle` 定义 `cordis:group`，能力包 insert 进该 group | group 在排序**最后**才定义，能力包 insert 时它**尚不存在** → warn `entry "soloips" not found`，**行丢失**（探针 P9） | ❌ 否决 |
| C | 第一个能力包（adapter）定义 group，其余 insert 进它 | 可行（探针 P8/P8'），但把 group 定义权绑到 adapter 的排序位置 | ⚠️ 备选 |
| D | `soloips-bundle` 同时 insert group 与三行 | dump 出现**顶层 3 行 + group 内 3 行 = 6 行**（探针 P8 的变体，见 `evidence/probe-log.md` §2），同一包被挂载两次 | ❌ 否决 |

**为何否决 B（关键）**：SOLO-C01 要求 `soloips-bundle` 保持**最终装配位置**（最终覆写层）。
而 patch 只能命中**已存在**的行——`applyEntryPatches` 在遍历 patch 列表时增量建立索引，
**后层能命中前层刚插入的行，反之不能**（W0 SOLO-C01、探针 P8/P9）。
因此"最后装配"与"定义 group 供前层使用"在时序上互斥。

**为何否决 D（关键）**：同一 `name` 被两行挂载时，第二次 `ctx.provide()` 会抛
`service "..." has been registered at <...>`（`@deepseek-ai/cordis` lib/index.js:812）。
在 0.1.6 下该错误被 `logger.error` 吞掉（W0 MECH-07），**进程不失败**——
即"重复挂载"表现为静默的局部失效，而不是启动报错。这比直接失败更难发现。

**方案 A 的副作用与处置**：三行成为**根层平级行**，不再有 `soloips` 父 group 的
`disabled` 总开关。处置：以 `config.enabled` 作为统一开关位（§2.2 各草案），
且**不**用 group 的 `disabled` 做整体停用——因为 group 方案已被否决。

> **〔约束〕若后续切片确需 group 语义**，只能采用方案 C，且必须在设计评审中
> 重新核对 `soloips-adapter-dsh` 是否仍为 SOLO-C01 顺序中的**第一个** soloips 层。
> 该顺序变更属装配契约变更，须走 SOLO-C01 的唯一正文修订流程。

**SOLO-C02 备注**：patch 文件内的**行序不承载加载语义**（激活由服务可用性驱动）。
上述顺序讨论的是**层序**（bundles 数组位次），不是文件内的行序——两者须分别核对。

### 2.2 形状契约（**C 档：版本无关**；N1 为硬约束）

**〔约束〕所有 patch 文件必须满足：**

1. 顶层是 YAML **数组**（`parsePatchList` 强制，否则抛
   `must be a top-level YAML array of loader patch entries`）。
2. 每个数组项是**映射**（非映射抛 `must be a mapping`）。
3. `insert` 若出现，必须是**数组**，与 `id` **同级**（N1）。
4. 非 insert 的 patch 必须有 `id`；否则 warn 后跳过。
5. `name` 只用于**校验**，不用于定位；写错只 warn + skip（探针 P6）。
6. `name` 必须是**裸包名**：`dsh-client-modules` 用 `exactPackageSpecifier` 解析行名，
   带子路径会解析失败（§2.4）。

**行 id 规则（SOLO-C04，C 档）**：

| 规则 | 内容 |
| --- | --- |
| 前缀 | 一律 `soloips-*`；能力包行 id 与包名同名（`soloips-core` 等） |
| 唯一性 | **必须自证**。Loader 预检已删除（W0 SOLO-C04），重复 id 静默取后者且无日志 |
| 单写者 | 每个 row id 只有一个声明者；其他层要改必须完整重述（SOLO-C03） |
| 禁止 | 不使用无前缀 id、不复用官方 id、不 insert 官方已存在的 id |

### 2.3 三包 `package.json` 的**必需改动**（前置阻断项）

**〔约束〕仅添加 `cordis.patch.yml` 文件不够。** `loadProfileDirectory` 读取的是
`package.json` 的 `dsh.bundle.patch` 字段：

```js
const declared = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).dsh?.bundle?.patch;
if (declared === void 0) throw new Error(`... profile bundle "${packageName}" declares no dsh.bundle in its package.json`);
```
（`dsh-app-boot/lib/index.js:1018-1019`；W0 SOLO-F01 F-2 记为 `profile.ts:880-882`）

本机实测（探针 P3）：把无 `dsh.bundle` 的包列入 bundles →
`Error: dsh: profile bundle "@deepseek-ai/dsh-tools" declares no dsh.bundle in its package.json`，
**profile 解析期直接抛错**。

因此三包各需在 `package.json` 增加：

| 包 | 需要的字段 | 现状态 |
| --- | --- | --- |
| `packages/adapter-dsh` | `dsh.bundle.patch`、`exports["./cordis.patch.yml"]`、`files` 含该文件 | **均缺** |
| `packages/core` | 同上 | **均缺** |
| `packages/web` | 同上（另需 `dsh.client` 与 `exports["./client"]`，见 §2.4） | **均缺** |
| `packages/bundle` | 已有 | ✅ 已具备 |

**草案（以 adapter-dsh 为例，core/web 同形）：**

```jsonc
{
  "exports": {
    ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["lib/**/*.js", "lib/**/*.d.ts", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

**注意**：`exports` 必须显式暴露 `./cordis.patch.yml`，否则打包后该文件不可达。
对照官方 `dsh-web-app` 的 `exports` 即含 `"./cordis.patch.yml": "./cordis.patch.yml"`。

> **这解释了任务描述中的"三包都没有 `cordis.patch.yml`，也没有 `dsh.bundle.patch` 声明"
> 为何是阻断项**：两者缺任一都会在 profile 解析期抛错，且**解析期是 fail-loud 的**
> （W0 MECH-06 明确"解析期仍抛错阻断"，与挂载期的静默降级不同）。

### 2.4 `soloips-web` 的额外前置：`dsh.client` 是 manifest 字段

**〔源码事实〕客户端注册不通过 patch 行完成。** `dsh-client-modules` 扫描
**Loader entries 的包清单**，用行名解析到包目录后读其 `package.json` 的 `dsh.client`：

- 行名 → 包目录：`locatePkgJson(loaderName, baseUrl)`（`dsh-client-modules/lib/index.js:711-741`），
  用 `exactPackageSpecifier` 取裸包名；**带子路径会返回 `undefined`**（`:82-88`）。
- 读声明：`decl.platform !== "web"` 则跳过（`:682`）；`platform` 缺失/非字符串**抛错**（`:65`）。
- 客户端入口：从 `exports["./client"]` 解析（`clientExportOf`，`:169-178`）。

因此 `packages/web/package.json` 需要（草案）：

```jsonc
{
  "exports": {
    ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" },
    "./client": { "default": "./lib/client/index.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-api-remotes",
        "@deepseek-ai/dsh-api-session-controller",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-ui-primitives"
      ]
    }
  }
}
```

`dsh.client.inject` 的取值是**包名**（对照官方 `dsh-client-ui-goal` 等包的 manifest），
**不是服务名**——与本 patch 行的 `inject`（服务名）语义不同，不可混用。

### 2.5 三包 patch 草案要点

完整草案见 `drafts/packages/*/cordis.patch.yml`。要点：

| 包 | 行 id | `name` | `inject` | `config` 初值 | 依据 |
| --- | --- | --- | --- | --- | --- |
| adapter-dsh | `soloips-adapter-dsh` | `soloips-adapter-dsh` | `[storage]` | `enabled: true` | `storage` 由 dsh-base 的 `storage` 行提供 |
| core | `soloips-core` | `soloips-core` | `[storageDomain]` | `enabled: true`, `domain: soloips` | `storageDomain` 由 `storage-domain` 行提供；唯一 opener |
| web | `soloips-web` | `soloips-web` | 无 | `enabled: true`, `registerClient: true` | Host 半边用 `ctx.inject([...], cb)` 延迟注册；客户端半边走 `dsh.client` |

**`inject` 的声明纪律（A 档：依赖 W0 MECH-06/SOLO-F04）**：

- `inject` 是**服务名数组**（对照官方 `webserver` 行 `inject: [webStartup]`），
  语义是"本行 apply 前这些服务必须就绪"。
- **只声明必需且由目标组合保证存在的服务。** 0.1.6 下缺服务的行只保持 pending
  并产生一条 warning，**不再导致启动失败**；把非必需服务写进 `inject`
  会让整包**静默不工作**，且没有退出码可依赖。
- 非必需能力用 `ctx.inject([...], cb)` 延迟注册（adapter 契约 SEAM-08）。

**行级 `inject` 与模块级 `inject` 的关系**：二者经 `Inject.resolve` 归一化后**合并**
（`cordis/lib/index.js:1490-1498`、`cordis-plugin-loader/lib/index.js:548`），
行级 `inject` 是**追加**而非替换。因此本 patch 的 `inject` 不会覆盖包内声明的依赖。

**覆写粒度（探针 P10 实证）**：覆写某行只给 `config` 时，该行的 `inject` 等
**其他顶层字段完整保留**；只有 `config` 对象整体替换。这是 SOLO-C03 的精确边界——
"整体替换"针对 `config`，不是整行。

---

## 3. 交付物 2：`soloips-bundle/cordis.patch.yml` 与最终装配位置

### 3.1 草案

完整草案见 `drafts/packages/bundle/cordis.patch.yml`。与**现行**文件的差异：

| 项 | 现行 | 草案 | 理由 |
| --- | --- | --- | --- |
| 空的 `soloips` group 占位行 | 有 | **删除** | 方案 A 不使用 group（§2.1）；保留空 group 只增加噪声 |
| 官方行覆写 | 无 | 加入 `llm-retry` / `session-telemetry-otel` 的 `disabled` | 项目红线首错停线 + 遥测关闭 |

### 3.2 为何 `soloips-bundle` 保持最后装配位置（**A 档**）

**理由一：patch 只能命中已存在的行。** `applyEntryPatches` 逐条遍历 patch 并增量
建立 id 索引；**后层能命中前层刚插入的行，反之不能**（W0 SOLO-C01、探针 P8/P9）。
装配层的职责是**覆写此前已插入的行**，故必须排在最后。

**理由二：只有最后位置才能覆写全部能力包的行。** 若装配层排在某能力包之前，
它对那个包的行覆写会 warn + skip（探针 P9 的直接后果）。

**理由三：能力包只 insert 自身前缀的 id。** SOLO-C04 要求单行单写者；
覆写官方行的权力只归装配层（SOLO-LAYER-03）。二者共同构成"能力包在前插入、
装配层在后覆写"的分工。

**理由四：bundles 数组位次决定层序，但**不**保证服务启动先后（SOLO-C01/C02、
MECH-01）。装配层排在最后是**配置覆盖序**的要求，与激活顺序无关。

### 3.3 bundles 数组（SOLO-C01 的 S0 切片）

```text
@deepseek-ai/dsh-base
@deepseek-ai/dsh-web-app
@deepseek-ai/dsh-experimental-agent-team-profile
@deepseek-ai/dsh-experimental-agent-team-web-profile
soloips-adapter-dsh
soloips-core
soloips-web
soloips-bundle
```

**说明（〔约束〕SOLO-C01 的唯一正文是技术架构 §6.2；本表只落地，不另立顺序）：**

- 前四项为**官方基础层**：`dsh-base` 提供共享核心行，`dsh-web-app` 提供浏览器面，
  两个 `agent-team-*` 提供官方 Team 的 Host 与 Web 层。
  **〔源码事实〕官方 Team 不是单个 bundle，而是两个**：Host 层
  `dsh-experimental-agent-team-profile` 必须排在 `dsh-web-app` 之后
  （其文件头注释："Apply after dsh-web-app and the host-side dsh-agent-team-profile"）。
- 后四项为 SoloIPs 层，顺序按 **SOLO-C01 的相对关系**：
  `adapter-dsh → core → web → bundle`。
- **不含** `soloips-tools-pv`：S1 才创建，不建空包占位（ARCH-D02、基线 §3）。
- **`@deepseek-ai/dsh-experimental-agent-team-*` 属 SOLO-TEAM-06 的适配切片范围**；
  本设计给出顺序位置，其**实际组合须由适配切片补齐并验证**，不能据本表宣称已装配官方 Team。

---

## 4. 交付物 3：覆写官方行的完整重述清单（**A 档：依赖 W0 MECH-02/SOLO-C03**）

### 4.1 规则（SOLO-C03）

**〔约束〕覆写任何已存在行的 `config` 时，必须重述该行当前全部 `config` 键。**

不重述的后果已**实测**（探针 P0）：官方 `dsh-web-app` 给 `system-prompt` 写
`personaSuffix` + `personaPrefix`；本层只写 `personaPrefix` 时，
**`personaSuffix` 被静默删除，全程无任何 warning**。

**精确边界（易错，探针 P4/P10 实证）：**

| 情形 | 结果 |
| --- | --- |
| 只给 `disabled` 等**非 config** 键，不给 `config` | 原 `config` **完整保留** ✅ |
| 给出 `config`，只写部分键 | 未写出的键**被静默删除** ❌ |
| 给出 `config`，重述全部键 | 等价替换 ✅ |
| 给出 `inject`（顶层字段） | 只替换 `inject`；`config` 不受影响 |

**即：危险动作是"给出 config 但不写全"，不是"覆写行"。** 只改开关时**不要**写 `config`。

### 4.2 完整清单（机器生成，可核对）

**全量清单见 `evidence/official-rows.txt`**（由 `tools/extract-restatement-inventory.mjs`
从已安装的 0.1.6-alpha.1 官方 bundle 直接提取，退出码 0）。

汇总（bundle 层 = base → web-app → team-profile → team-web-profile）：

| 项 | 数量 |
| --- | --- |
| 官方行总数 | 160 |
| **有 config 的行**（覆写时必须重述） | **41** |
| 无 config 的行（只给 disabled 即可） | 119 |
| 被后续官方层以 config 覆写的行（官方内部重述范例） | 3 |

**A. 有 config 的行 —— 覆写任一行必须重述下列全部键（41 行）**

| 行 id | 来源层 | 必须重述的 config 键 |
| --- | --- | --- |
| `hmr` | base | `root` |
| `session-title` | base | `fallbackMaxWords`, `fallbackMaxBytes`, `maxTitleBytes` |
| `session-title-llm` | base | `targetWords`, `targetCjkCharacters`, `maxInputBytes`, `maxOutputTokens`, `timeoutMs` |
| `agent-default-model` | base | `provider`, `model` |
| `session-persistence-jsonl` | base | `root` |
| `session-query-sqlite` | base | `path`, `openAt` |
| `storage-json` | base | `root` |
| `storage-domain` | base | `backend` |
| `session-projection-cache` | base | `writeEveryEvents`, `writeIntervalMs` |
| `session-telemetry-otel` | base | `mode`, `shutdownTimeoutMillis`, `exporter`, `processor` |
| `sandbox-policy` | base | `mode`, `workspaceRoot` |
| `bash-sandbox` | base | `timeoutMs` |
| `approval` | base | `policy` |
| `permission` | base | `presets` |
| `tool-fs-search` | base | `sampleOverCapGlobResults` |
| `agent-instructions` | base | `maxBytes` |
| `plan-mode` | base | `section` |
| `subagent-spawn-in-process` | base | `providerName` |
| `subagent-fork-in-process` | base | `providerName` |
| `tool-subagent` | base | `provider`, `toolName`, `backgroundMode` |
| `tool-subagent-fork` | base | `provider`, `toolName`, `backgroundMode` |
| `workflow-ptc` | base | `provider` |
| `spill-policy` | base | `maxInlineBytes` |
| `tool-result-pruner` | base | `thresholdChars`, `headChars`, `tailChars` |
| `tool-todo` | base | `allowParallelInProgress` |
| `tool-ralph` | base | `subagentProvider`, `maxRounds` |
| `repeat-tool-reminder` | base | `thresholds`, `argumentsPreviewChars` |
| `web` | base | `searchProvider`, `fetchProvider` |
| `web-search-deepseek` | base | `apiKeyEnv` |
| `tool-web` | base | `fetch`, `searchTimeoutMs` |
| `tools` | base | `mode` |
| `system-prompt` | base | `personaSuffix`, `personaPrefix` |
| `agent-loop` | base | `agents` |
| `message-feedback` | web-app | `maxNoteBytes` |
| `open-in-app` | web-app | `probeTimeoutMs`, `iconTimeoutMs`, `launchWatchMs` |
| `webserver` | web-app | `host`, `port`, `compression`, `compressionLevel`, `compressionThresholdBytes` |
| `web-runtime` | web-app | `openBrowser`, `printUrl`, `surfaceContext`, `trustedHosts` |
| `connection` | web-app | `trustedHosts` |
| `agent-presets` | web-app | `default` |
| `agent-team` | team-profile | `maxMembers`, `maxTasks`, `maxPendingMessagesPerMember`, `maxMessageBytes`, `disposalTimeoutMs` |
| `tool-agent-team` | team-profile | `freshProvider`, `forkProvider` |

**B. 官方内部已有的重述范例（可作写法参照）**

| 行 id | 覆写层 | 重述的键 |
| --- | --- | --- |
| `session-query-sqlite` | web-app | `path`, `openAt` |
| `tools` | web-app | `mode` |
| `system-prompt` | web-app | `personaSuffix`, `personaPrefix` |

**C. 无 config 的行（119 行）** —— 覆写时只给 `disabled` 等键即可，`config` 自动保留。
完整列表见 `evidence/official-rows.txt` §C。含 `llm-retry`、`settings`、`credentials`、
`storage`、`tool-bash`、`tool-pwsh`、`directory-picker` 等。

**D. 仅以 `disabled` 覆写的官方行（23 行）** —— 官方 Web 层与 Team 层的既有做法，
可作为"只改开关不写 config"的范例。完整列表见 `evidence/official-rows.txt` §D。

### 4.3 清单维护规则（**C 档：版本无关**）

**〔约束〕本清单是 0.1.6-alpha.1 的**快照**，不是长期契约。**

- **升级 DSH 后必须重新生成**（`tools/extract-restatement-inventory.mjs`），
  并在 PR 中附新旧 diff。理由：W0 已证实 base 层在 0.1.5-rc.2 → 0.1.6 之间
  **新增 4 行、改名 1 行**（`workflow-worker-thread` → `workflow-ptc`），
  web-app 层**新增 3 行、删除 1 行**（`code-runtime`）。
- **本清单不得手工转录**。人工维护 160 行必然漂移；工具是唯一权威。
- 覆写前必须**在 L2 dump 上核对目标行的当前键集合**（§6.4 规则 4），
  不能只信本表——因为 profile/home/launcher 层可能已改过该行。

### 4.4 环境相关值**不得**进入产品 patch（**C 档**）

`webserver` 的 `host`/`port`、`connection` 的 `trustedHosts`、`web-runtime` 的
`openBrowser` 等**环境相关值**必须放在实例 profile 或 `$DSH_HOME/cordis.patch.yml`，
**不得**写入 `packages/*/cordis.patch.yml`。

理由：产品定义必须与环境无关（DEV-02「交付定义不包含机器绝对路径」）；
`packages/bundle/cordis.patch.yml` 随包发布，写入端口即把某台机器的部署值固化进产品。

---

## 5. 交付物 4：`profiles/soloips/` 三件套

### 5.1 草案

见 `drafts/profiles/soloips/`：`package.json`、`cordis.patch.yml`、`pnpm-workspace.yaml`。

**关键点：**

| 项 | 值 | 依据 |
| --- | --- | --- |
| profile 名 | `soloips` | ARCH-D04；不复用内置 `web`（SOLO-C07 保留名） |
| `patchReload` | **`startup`（必须显式写）** | ARCH-D04〔约束〕；见 §5.3 |
| `bundles` | §3.3 的八项 | SOLO-C01 |
| `private` | `true` | 与启动器生成形状一致 |

### 5.2 profile 名选择（**C 档**）

`resolveProfileDir` 拒绝空值、含 `/`、含 `\`、`.`、`..`、`node_modules`；
`PROFILE_TEMPLATES` 保留 `acp` / `web` / `headless` / `sdk` / `sdk-minimal`
（W0 SOLO-C07 逐条成立）。`soloips` **不在保留集内**，可安全使用；
且不得用保留名作为自定义 profile 目标。

### 5.3 `patchReload: startup` 必须**显式**声明（**B 档：依赖 W0 SOLO-C05/SOLO-F08**）

**〔约束〕自定义 profile 的 `patchReload` 默认值是 `live`，不是 `startup`。**

W0 核实：`DEFAULT_PROFILE_PATCH_RELOAD = 'live'`（`profile.ts:171`），
且 `initProfile` 的 `patchReload` 参数已改为**可选**，无模板时落到该默认值。

**为何这在本设计中是硬要求**：0.1.6 的 live 失败路径**完全静默**——
`hmr/config-update-failed` 事件**已删除**，失败仅 `logger.warn` 并保留旧运行树，
**无事件、无退出码**（W0 MECH-10/SOLO-F08）。

即：**遗漏显式声明 → 静默获得 live → 更新失败时无任何可观测信号。**
这与 SOLO-ACC-05（写入→停止→冷启动→读回）的验收要求直接冲突。

**门禁配套**：§6.5 的必测项要求**读取 manifest 断言该字段显式存在且为 `startup`**，
而不是断言"最终生效值是 startup"（后者无法区分显式声明与默认值）。

### 5.4 profile 是**独立安装上下文**（**B 档**）

**〔约束〕`profiles/soloips/` 是版本控制内的可移植定义与验收锁；
实际运行 profile 位于 `$DSH_HOME/profiles/soloips`。二者是不同对象。**

**为何是独立安装上下文（源码事实）：**

1. **`dsh plugin` 在 profile 目录内运行 pnpm。**
   `apps/cli/src/plugin.ts` 以 profile 目录为 cwd `spawnSync('pnpm', ...)`，
   安装结果落在 profile 自己的 `node_modules`。
2. **bundle 解析的第二锚点是 profile 目录。**
   `resolveBundleDir` 先查安装锚点，再查 `join(profileDir, "package.json")`
   （`app-boot/lib/index.js:993-999`）。因此 profile 的依赖闭包**决定 bundle 从哪来**。
3. **profile 有自己的 `pnpm-workspace.yaml`。**
   启动器 `initProfile` 生成 `packages: [.]` + `nodeLinker: hoisted` +
   `autoInstallPeers: false`，这些决定 pnpm 的链接行为。
4. **开发根 workspace 明确排除 profile。**
   根 `pnpm-workspace.yaml` 只含 `packages/*`（DEV-03 §2.1：
   "它不加入 `packages/*` 开发 workspace"）。

**〔约束〕开发根锁不能代替 profile 锁（DEV-02）。** 理由：

| 维度 | 开发根锁 `pnpm-lock.yaml` | profile 锁 |
| --- | --- | --- |
| 覆盖范围 | `packages/*` 的 workspace 依赖图 | profile 自身的依赖闭包 |
| 解析方式 | workspace 协议 / 符号链接 | 按 profile 的 `.npmrc` 与 workspace 设置解析 |
| 链接行为 | 根配置 | profile 的 `nodeLinker: hoisted` |
| 消费者 | 开发者（typecheck/lint/test） | 运行时 Loader（实际挂载哪些字节） |

**结论**：即使开发根锁冻结，profile 仍可能解析出**不同的版本组合**。
只有 profile 目录内的 `pnpm-lock.yaml`（`pnpm install --frozen-lockfile`）才能重现交付组合。
这正是 SOLO-FAIL-05「多 profile 指向同一未冻结开发源」的检测点。

**入 git 清单（SOLO-C05）：**

| 文件 | 入 git | 理由 |
| --- | --- | --- |
| `package.json` | **必须** | bundles 顺序与依赖声明的唯一权威 |
| `cordis.patch.yml` | **必须** | 部署值与开关层 |
| `pnpm-lock.yaml` | **必须** | **实际版本锁的唯一落点** |
| `pnpm-workspace.yaml` | **必须** | profile 自有，决定链接行为 |
| `cordis.yml` | 建议忽略 | 启动器每次重写为空根（`profile-boot-CuwbWsnH.js:209`） |
| `node_modules/` | 忽略 | 安装产物 |

**`dependencies` 的写法（**C 档**，但须注意）：**

- **交付形态**：使用**精确来源**（tarball 文件名或 pinned commit），
  禁止个人 `file:` / `link:` 路径（DEV-02、SOLO-LAYER-06）。
- 草案中 `drafts/profiles/soloips/package.json` 使用 `file:../../packages/*`
  仅为**仓库内开发形态**，便于本地装配联调。
  **发布候选必须替换为 tarball 引用**，否则命中 SOLO-FAIL-05 与 DEV-02 的禁止项。
  此替换是发布门禁的必查项（§6.5 必测项 G7）。

### 5.5 装配恢复只能靠外部材料（**A 档：依赖 W0 MECH-07**）

**〔约束〕本设计不声明任何"失败自动回滚"。** W0 证实：

- `runPlugin` 路径无安装快照、无回滚（`plugin.ts:120-162`）；
- **Loader 侧的回滚分支也已整体删除**：`group.ts` 的 `update()` 无 try/catch，
  entry 级 import/apply 失败仅 `logger.error` 吞掉后继续。

因此装配恢复的**唯一可靠材料**是：dump 基线（§6）+ profile lockfile + 冷启动重建。
失败后的运行树处于**部分应用**状态，只能整体重建，不能局部回退。

### 5.6 官方行覆写的**写者分配**（**C 档：SOLO-C04 单写者原则的落地**）

**〔约束〕同一个 row id 只能有一个写者。** 官方行被两个 SoloIPs 层同时覆写
会产生"第二个写者"，其害处不止是 SOLO-FAIL-10 的顺序依赖：

> **同值覆写在 dump 中不显示 `patched by`**（探针 P13、盲区 M1）。
> 因此若两层都声明同一行，**从证据上无法区分**"两层都生效了"
> 与"只有后一层生效"。门禁会给出误导性的绿色。

**分配规则（按覆写性质，而非按层）：**

| 覆写性质 | 写者 | 判据 | 例子 |
| --- | --- | --- | --- |
| **产品级语义** | `soloips-bundle` | 所有部署应一致；写错即产品缺陷 | `llm-retry` 关闭、遥测关闭 |
| **部署级取值** | `profiles/soloips/cordis.patch.yml` | 每实例不同；来自环境交接 | `webserver` 的 host/port、`connection` 的 trustedHosts |

**本设计的落地**：

- `packages/bundle/cordis.patch.yml` 声明 `llm-retry` 与 `session-telemetry-otel` 的 `disabled`。
- `profiles/soloips/cordis.patch.yml` **刻意不重复**这两条，只保留部署级覆写的**形状示范**（全部注释）。
- 校验脚本 `tools/validate-drafts.mjs` 检查该约束：当前 4 个覆写目标中，
  两个官方行各只有 `soloips-bundle` 一个写者。

**为何不把产品级策略也放 profile 层**：profile 是**随实例走**的部署定义。
若把首错停线等产品级策略只写在 profile 层，换一个实例或 `--from-default-profile`
就会静默丢失该策略。产品级语义必须随包发布。

---

## 6. 交付物 5：`--dump-config` 组合回归门禁（**A 档**）

### 6.1 门禁定位与反面声明

**〔约束〕门禁只证明"配置组合"，不证明运行期行为。**

| 门禁**证明** | 门禁**不证明** |
| --- | --- |
| 层序与来源可追溯 | 模块可解析（探针 P7：指向不存在的包也成功） |
| 生效树的 entry 与字段符合期望 | 插件可挂载、apply 成功 |
| entry id 唯一（**须自带断言**，§6.5） | 服务可用、数据读写 |
| patch 是否命中（经 stderr） | 业务功能正确 |

**SOLO-REG-02 的明确边界**：dump **不启动服务**，不验证服务可用性与数据读写。
运行接线仍须另验（SOLO-ACC-02–10）。

**最重要的反面声明（A 档：依赖 W0 MECH-06）**：

> **进程退出码 0 不是组合正确证据。** 0.1.6 下仅 7 个 required entry id
> （`agent-loop`、`webserver`、`modules`、`connection`、`headless-runner`、`acp`、
> `sdk-jsonrpc-server`）+ bootstrap include 失败才 reject；**其余任何 entry
> 失败或 pending 只 warn 一次，进程照常退出 0**。
> `soloips-*` 行**不在** required 集合内——它们的失败**不会**让进程失败。

### 6.2 L1 / L2 两级 golden（SOLO-REG-01/02）

| 级 | 命令 | 覆盖层 | 用途 | 依据 |
| --- | --- | --- | --- | --- |
| **L1** | `dsh --profile soloips --dump-default-config` | 仅 bundle 层 | 宿主升级或层序调整造成的组合漂移 | SOLO-REG-01 |
| **L2** | `dsh --profile soloips --dump-config` | bundle + profile + **home** + `--patch` | 交付组合的完整生效树 | SOLO-REG-02 |

**实测确认（探针 P11/P12）：**

- **L2 含 home 层**（`$DSH_HOME/cordis.patch.yml` 出现在来源标签中）。
- **L1 不含 home 层与 profile 层**（`tool-todo` 的 `allowParallelInProgress` 保持
  base 值 `true`，而 home 层写的是 `false`）。
- **L1 含自定义 bundle 层**（来源标签出现 `# == soloips-probe-bundle`），
  因此 L1 对 SoloIPs 的 bundle 层变更**有效**。

**生成方式（**C 档**）：**

```powershell
# 前置：绑定 home、profile 与工件哈希；见 §6.3
$env:DSH_HOME = '<绑定后的 home>'
$dsh = '<runtime>\node_modules\@deepseek-ai\dsh\lib\bin.js'

# L1 —— 分流 stdout/stderr（探针 P16 确认 dump 走 stdout、warn 走 stderr）
node $dsh --profile soloips --dump-default-config 1> L1.stdout.txt 2> L1.stderr.txt

# L2
node $dsh --profile soloips --dump-config 1> L2.stdout.txt 2> L2.stderr.txt
```

**CLI 约束（实测）：**

- `--dump-config` 与 `--dump-default-config` **互斥**（`error: ... are mutually exclusive`，退出码 1）。
- `--dump-default-config` **拒绝 `--patch`**（`error: ... takes no --patch`，退出码 1）。
- **dump 模式拒绝一切 app 参数**（探针 P18）：
  `error: config dumps take no app arguments, got "--port" "1234"`，退出码 1。
  位置参数同样被拒。→ **唯一正确调用形式是 `dsh --profile <name> --dump-config`**
  （L2 另可加 `--patch <file>`）。门禁脚本必须精确使用该形式；参数被拒的失败原因
  与"组合漂移"无关，容易误诊。
- profile 不存在（且非内置名）时抛 `profile "..." does not exist`。
- **L1 可作恢复诊断**：profile 用户层损坏时 L2 抛错、**L1 退出码 0 且正常输出**（探针 P15）。
  SOLO-ACC-01 明确要求：若 profile 自身 `cordis.patch.yml` 损坏导致 dump 失败，
  必须改用 `--dump-default-config`，**不得换一个 profile 重跑以绕开**。

### 6.2.1 `--dump-config` 会写盘（**〔约束〕必读**）

**〔约束〕dump 有磁盘副作用，交付说明不得声称它是只读操作。**

技术架构 §11.1 说「dump 不启动进程、不求值 `!!js`」——该说法**成立**，
但**不等于不写文件**。`dsh --profile <name> --dump-config` 内部经 `prepareProfile`，
而它**每次**都执行
`writeFileSync(join(profile.dir, 'cordis.yml'), PROFILE_ROOT_CONFIG)`
（`dsh/lib/profile-boot-CuwbWsnH.js:206-211`）。

本机实测（探针 P17）：把 `<profile>/cordis.yml` 写成哨兵内容后运行 dump，
该文件被**重写为空根**，mtime 前移，退出码仍为 0。

**这不是缺陷，而是有意设计**：文件头注释说明 Loader 的 tree write-back 可能把组合行
固化进该文件，下次启动会重复 insert，故每次启动/dump 都重写为空根。

**对门禁与交付说明的四条硬要求：**

| # | 要求 | 理由 |
| --- | --- | --- |
| 1 | 交付说明写"dump 会重写 `<profile>/cordis.yml`"，**不得**用"未启动服务"代替"无副作用" | 区分证据层次（项目红线） |
| 2 | `cordis.yml` **不入 git** | 每次 dump/启动都被重写，入 git 只产生噪声与误改（SOLO-C05 已建议忽略，本探针给出更强理由） |
| 3 | **基线锚点是 profile 的 `cordis.patch.yml`**（组合来源），**不是** `cordis.yml`（空根） | `cordis.yml` 内容恒定为空数组，不承载组合信息 |
| 4 | 比对**不得**把 `cordis.yml` 纳入基线；dump 前后不得依赖其内容 | 同上 |

> **对 `verifier` 的 ACC-01 编排的直接影响**：`--dump-config` 可在**只读意图**的
> 验收步骤中改变 profile 目录的字节。若验收要求"证明未修改任何文件"，
> dump 步骤本身即构成反例。ACC-01 的证据格式须把该写入列为**已知副作用**，
> 或改用任务专属临时 profile 根。

### 6.3 基线存放位置与绑定（**B 档：依赖 SOLO-DATA-01**）

**〔提案〕基线存放在 `profiles/soloips/baselines/`，随 profile 定义入 git。**

```text
profiles/soloips/baselines/
├── README.md          # 绑定信息与比对规则
├── L1.golden.txt      # --dump-default-config 的归一化输出
├── L2.golden.txt      # --dump-config 的归一化输出
└── binding.json       # 机器可读的绑定信息
```

**`binding.json` 必须记录（否则 diff 无法解释）：**

| 字段 | 内容 | 为何必需 |
| --- | --- | --- |
| `dsh.version` | 宿主版本（如 `0.1.6-alpha.1`） | 层内容随版本变 |
| `dsh.artifactSha256` | 宿主 tgz 的 SHA-256 | 仅版本号不足以发现同版本替换（§11.8） |
| `profile.bundles` | 八项有序数组 | 层序权威 |
| `profile.patchReload` | `startup` | §5.3 |
| `profile.lockSha256` | `profiles/soloips/pnpm-lock.yaml` 的 SHA-256 | 版本锁唯一落点 |
| **`home.cordisPatch.sha256`** | `$DSH_HOME/cordis.patch.yml` 的 SHA-256（不存在则记 `null`） | **L2 默认含 home 层**（探针 P11）；不绑定会产生假阳性 |
| `home.cordisPatch.present` | 布尔 | 区分"不存在"与"存在但为空" |
| `overlays` | 本次 `--patch` 的文件与哈希（无则空数组） | L2 含 overlays 层 |
| `generatedAt` | 生成时间（**不参与比对**） | 仅供追溯 |

**为何绑定 home 层哈希是必需的**：L2 默认包含 `$DSH_HOME/cordis.patch.yml`。
该文件是**机器本地**的（SOLO-DATA-01：home patch 作用于同 home 的各 profile）。
若基线未绑定它，换一台机器或换一个 home 就会产生**无法解释的 diff**——
正是 SOLO-FAIL-06「导出含机器差异字段」的形态。

### 6.4 逐行比对规则（**A 档**）

**〔约束〕比对必须按"归一化 → 结构化解析 → 断言"三步，不能做纯文本 diff。**

| # | 规则 | 理由 |
| --- | --- | --- |
| **1** | **只归一化明确列出的差异字段**，不做宽泛归一化 | SOLO-FAIL-06：宽泛归一化会掩盖真实漂移 |
| **2** | 归一化项**仅限**：`# ==` 来源标签中的绝对路径前缀 → 稳定标记（如 `<HOME>`、`<PROFILE>`）；行尾空白；`\r\n` → `\n` | 探针确认来源标签含**绝对路径**（`# == ...\operations\...\cordis.patch.yml`） |
| **3** | **不得**归一化：`!!js` 表达式文本、`config` 值、`inject` 数组、行序、`disabled` | 这些正是组合语义 |
| **4** | 比对前**先断言目标行的当前键集合**，再比对值 | SOLO-C03：不先核对键集合就无法发现"重述不全" |
| **5** | 差异必须能**逐条解释**：新增/删除了哪一行、哪一行换了归属层 | SOLO-C06 outcome |
| **6** | 来源标签用于**定位**，不用于**证明声明** | 探针 P13：同值覆写不显示 `patched by`（§6.6 盲区 M1） |
| **7** | **非空 stderr 判失败**（白名单除外） | warn 即 patch 未命中或 name 不匹配（MECH-09/SOLO-F06） |
| **8** | `!!js` **原样比对**，不求值 | dump 不求值（`dump-config` 模块注释）；求值结果依赖环境 |

**解释不了的差异即视为回归，不得继续**（SOLO-C06）。

**比对输出必须包含**：差异行的 id、旧值/新值、归属层变化。仅给"有差异/无差异"
不满足 SOLO-C06 的"差异必须能解释"要求。

### 6.5 必测项（**A 档：SOLO-C04 变化的直接后果**）

**〔约束〕以下断言**独立于** L1/L2 diff，必须各自成项。**
理由：0.1.6 删除了重复 id 预检（W0 SOLO-C04），且 dump 不校验模块（探针 P7），
diff 无法覆盖这些失败模式。

| # | 必测项 | 判据 | 若不做的后果 |
| --- | --- | --- | --- |
| **G1** | **entry id 唯一性** | 解析 L2 生效树，**递归**收集所有 entry id（含 group 内），断言无重复 | 重复 id 静默取后者，**前一条永不创建**（探针 P5） |
| **G2** | **期望行存在性** | 断言 `soloips-adapter-dsh`、`soloips-core`、`soloips-web` 三行**存在于 L2 生效树** | 行丢失不产生非零退出码（探针 P9） |
| **G3** | **期望字段断言** | 断言各行的 `name` 与 `config` 关键字段符合期望 | diff 只能发现"变了"，不能发现"一开始就错" |
| **G4** | **`patchReload` 显式性** | 读 `package.json`，断言 `dsh.profile.patchReload` **字段存在**且 === `"startup"` | 默认值是 `live`，遗漏即静默（§5.3） |
| **G5** | **stderr 为空** | 断言 L1/L2 的 stderr 无 warn（白名单须显式列出并说明） | 未命中 patch 只 warn，退出码仍 0 |
| **G6** | **dump 行数 == 运行时 entry 数**（**新增，源自 N3**） | 对 L2 生效树统计顶层+嵌套 entry 数，与去重后的 id 数一致 | 重复 id 时 dump 3 行 / 运行时 1 个 entry |
| **G7** | **无个人路径** | 断言 `profiles/soloips/package.json` 的 `dependencies` 不含 `file:` / `link:` 指向个人目录；发布候选中为 tarball 引用 | SOLO-FAIL-05、DEV-02 |
| **G8** | **`dsh.bundle.patch` 存在性** | 对 `bundles` 中**每个**包，断言其 `package.json` 有 `dsh.bundle.patch` 且文件可达 | 缺失即解析期抛错（§2.3，探针 P3） |
| **G9** | **pending 检测**（**非 dump 项**，见 §6.6.1） | `startup` 冷启动一次，断言 stderr 无涉及 `soloips-*` 的 `pending (waiting for services: ...)` | pending 不在 dump 中（盲区 M3）；宿主只 warn、退出码仍 0 |

**G1/G6 的补充说明**：G6 是 G1 的**冗余检查**，保留理由不同——
G1 直接断言唯一性（发现即失败），G6 断言 dump 与运行时的**结构一致性**
（能发现 G1 未覆盖的"dump 算法与运行算法分叉"）。
两者都失败时，优先按 G1 的定位信息修复。

**G9 的证据层次**：G9 **启动真实进程**，属运行验证，**不属** dump 门禁。
其证据须与 L1/L2 分开记录（DEV-13），不得被表述为"dump 门禁覆盖 pending"。

### 6.6 已知盲区（**必须如实声明，不得据门禁过度声称**）

| # | 盲区 | 证据 | 处置 |
| --- | --- | --- | --- |
| **M1** | **同值覆写不显示 `patched by`** | 探针 P13：`session-query-sqlite`/`tool-ralph` 被覆写为相同值时，来源标签**不出现**装配层 | 门禁**不得**用 `patched by` 证明"某层声明了某行"。若要证明声明存在，须核对**源文件**或改用哨兵值 |
| **M2** | **dump 不校验模块可解析性** | 探针 P7：`name` 指向不存在的包，dump **成功且无报错**，该行照常出现 | 装配证据必须配**一次功能探针**（SOLO-REG-04）；G8 只覆盖 manifest 声明，不覆盖模块内容 |
| **M3** | **pending 状态不在 dump 中** | dump 是静态组合，不执行服务解析 | 门禁**不能**发现"行挂载了但服务未就绪"。须由启动诊断或运行探针补充（W0 SOLO-F04） |
| **M4** | **dump ≠ 任意时点的运行树** | W0 SOLO-C06：live 模式下 `composeLive` 按 generation 重读磁盘 | 本设计强制 `startup`（§5.3）；冷启动后比对，不依赖 live 一致性 |
| **M5** | **`!!js` 不求值** | 探针确认 `!!js` 原样输出 | 门禁**不能**验证表达式求值结果；数据根/端口等运行值须另验 |
| **M6** | **dump 会写盘** | 探针 P17：`prepareProfile` 每次都重写 `<profile>/cordis.yml` | 见 §6.2.1；交付说明须声明该副作用；`cordis.yml` 不入 git、不入基线 |

**〔约束〕门禁通过时，交付说明必须同时列出这 6 条盲区**，
不得用"dump 一致"替代 SOLO-ACC-01–10 的运行验收。

### 6.6.1 宿主不会替我们报的失败（**必须自带检测**）

**〔约束〕以下失败模式在 0.1.6 下不产生非零退出码，也不产生 dump 差异。
必须由 §6.5 的必测项主动检测。**

| 失败模式 | 宿主行为 | 由哪一项检测 |
| --- | --- | --- |
| **`soloips-*` 行未挂载**（如 patch 未命中、insert 目标缺失） | 非 required 行降级为**一条 warning**，进程退出 0；该行**不在** dump 中 | **G2**（缺行检测）+ G5（stderr） |
| **`soloips-*` 行挂载但服务 pending** | 保持 pending，产生 warning，进程退出 0；**dump 是静态组合，看不到 pending** | **M3 盲区** → 须由启动诊断或运行探针补充（**G9**，见下） |
| **重复 entry id** | 静默取后者，无错无警；dump 保留重复行、运行时只建一条 | **G1** + **G6** |
| **模块不可解析** | dump 不校验；挂载期 `logger.error` 吞掉 | **G8** + SOLO-REG-04 功能探针 |
| **Loader 部分应用** | 无回滚、不抛出；运行树处于部分应用状态 | 只能靠 **L2 逐行比对**（§6.4）+ 冷启动重建 |

**G9（新增，pending 检测）**：由于 dump 无法表达 pending（盲区 M3），
本设计建议增加一项**独立于 dump 的**启动诊断检查：

| # | 必测项 | 判据 | 依据 |
| --- | --- | --- | --- |
| **G9** | **pending 检测** | 以 `startup` 冷启动一次，采集 stderr；断言**无** `pending (waiting for services: ...)` 告警涉及 `soloips-*` 行 | W0 SOLO-F04：`app-boot` 按 `fiber.inject` 计算缺失服务并生成该诊断；0.1.6 下 pending 不再致命 |

**G9 的边界声明**：该项**启动了一次真实进程**，属运行验证，**不属** dump 门禁。
它必须与 §6.2 的 L1/L2 分开记录证据层次（DEV-13），
且**不得**被表述为"dump 门禁覆盖了 pending"。

### 6.7 门禁触发时机（**C 档**）

**〔提案〕触发条件（SOLO-C06 actor/trigger）：**

| 触发 | 说明 |
| --- | --- |
| 任一 `packages/*/cordis.patch.yml` 变更 | 组合可能改变 |
| 任一 `packages/*/package.json` 的 `dsh` 字段变更 | `dsh.bundle.patch` / `dsh.client` 变更 |
| `profiles/soloips/package.json` 的 `bundles` 或 `patchReload` 变更 | 层序权威 |
| `profiles/soloips/cordis.patch.yml` 变更 | 用户层 |
| `dsh plugin add` / `remove` / `update` | 会改 bundles 数组（MECH-03） |
| **DSH 宿主版本升级** | base 层行集可能变（W0 已证实 0.1.5→0.1.6 有增删改名） |

**DSH 升级时的额外要求**：重新生成 §4.2 的重述清单，并在 PR 中附新旧 diff。

### 6.8 门禁脚本草案

见 `drafts/tools/check-composition.mjs`（Node ESM，无第三方依赖；
仅用 `node:child_process` / `node:fs` / `node:path` / `node:url`）。
落地位置建议 `packages/bundle/tests/`（DEV-03 §2.2：配置回归放 `tests/`）。

**该脚本已在替身包构成的参考组合上实测运行**（`evidence/probe-log.md` §4）：

| 场景 | 退出码 | 结果 |
| --- | --- | --- |
| 建立基线 | 0 | 写入 L1/L2 golden |
| 无变化 | **0** | 11 项断言全部 ✓ |
| **缺行**（清空 web 的 insert） | **1** | `✗ G2` + 两条基线差异 |
| **重复 id**（web 额外 insert `soloips-core`） | **1** | `✗ G1: 重复 id: soloips-core×2`；`✗ G6: dump 164 行，去重后 163` |

**场景 D 是本门禁存在的核心理由**：重复 id 在 0.1.6 下**不再由宿主捕获**
（预检已删除，静默取后者），只能靠我们自己的断言发现。

**开发该脚本时发现并修复的 3 个真实缺陷**（见 `evidence/probe-log.md` §4），
其中一个值得写入门禁设计原则：

> **入口守卫写错会让门禁静默通过** —— 与它要防的失败模式同构。
> 因此门禁脚本**必须自证"确实运行了"**：在成功路径打印断言计数，
> 并在 CI 中断言该输出存在。仅看退出码 0 不足以区分
> "检查通过"与"脚本根本没跑"。

**〔约束〕本脚本调用 `--dump-config`，因此会重写 `<profile>/cordis.yml`**
（§6.2.1）。它**不是**只读工具；不得在要求"未修改任何文件"的验收步骤中
无声明地使用。

**未验证**：脚本尚未在真实交付 profile 上运行（无授权装配）。
其自身正确性须在实现切片用真实 `packages/*` 重做验证。

---

## 7. 装配风险登记

| # | 风险 | 证据 | 影响 | 处置 |
| --- | --- | --- | --- | --- |
| **R1** | **失败静默化**：`soloips-*` 行失败不产生非零退出码 | W0 MECH-06/SOLO-F02；探针 P2/P6 | "启动成功"完全不能作为装配证据 | §6.5 G1–G3/G6；交付说明必须列盲区 |
| **R2** | **`insert` 形状错误**导致整个 profile 加载失败 | 探针 P1（N1） | 最易犯且后果最重；W0 源码核对未覆盖 | §2.2 形状契约；patch 需 YAML 解析测试 |
| **R3** | **dump 通过但模块不可解析** | 探针 P7（N2） | 门禁绿色但插件装不上 | §6.5 G8 + SOLO-REG-04 功能探针 |
| **R4** | **重复挂载同一包**（如方案 D） | 探针 P-literal；`cordis` `provide` 抛错但被吞 | 静默局部失效 | §2.1 方案 A；§6.5 G1/G6 |
| **R5** | **升级 DSH 后行 id 漂移** | W0：0.1.5→0.1.6 新增 4 行、改名 1 行、删除 1 行 | patch 未命中 → warn + skip，退出码 0 | §6.4 规则 7；§6.7 升级触发 |
| **R6** | **跨 domain 无原子提交** | W0 MECH-04 **无法核对** | 设计不得依赖共同原子提交 | 保持〔未验证〕；由 T03/T05 在实现切片核实 |
| **R7** | **装配无自动回滚** | W0 MECH-07（Loader 侧回滚已删除） | 失败后处于部分应用状态 | §5.5：恢复只能靠 dump 基线 + lockfile + 冷启动 |
| **R8** | **profile 锁与开发根锁分叉** | DEV-02；SOLO-FAIL-05 | 开发通过 ≠ 交付组合可重现 | §5.4；G7 断言依赖来源 |
| **R9** | **官方 Team 组合未经验证** | SOLO-TEAM-06：旧数组的完整清单声明〔已取代〕 | 本设计的 bundles 顺序**不构成**"已装配官方 Team"的证据 | §3.3 说明；须由适配切片补齐并验证 |
| **R10** | **home 层哈希未绑定** | 探针 P11（L2 含 home 层） | 跨机 diff 假阳性 | §6.3 绑定 `home.cordisPatch.sha256` |

---

## 8. 交付清单与验收对应

| task-3 要求 | 交付位置 | 状态 |
| --- | --- | --- |
| 1. 三包各自 `cordis.patch.yml` 完整草案 | `drafts/packages/{adapter-dsh,core,web}/cordis.patch.yml`；§2 | ✅ |
| 2. `soloips-bundle/cordis.patch.yml` + 最终装配位置说明 | `drafts/packages/bundle/cordis.patch.yml`；§3 | ✅ |
| 3. 覆写官方行的完整重述清单 | `evidence/official-rows.txt`；§4 | ✅ |
| 4. `profiles/soloips/` 三件套 + 独立安装上下文论证 | `drafts/profiles/soloips/`；§5 | ✅ |
| 5. `--dump-config` 组合回归门禁方案 | `drafts/tools/check-composition.mjs`；§6；实测验证见 `evidence/probe-log.md` §4 | ✅ |
| 前置依赖：标注依赖 W0 的结论 | §1.2（A/B/C 三档逐条对照） | ✅ |
| 明确标注被 W0 取代的既有结论 | **§1A（S1–S8 取代关系登记）** | ✅ |
| 行 id 唯一且带前缀 | §2.2；三包草案均用 `soloips-*` | ✅ |
| 覆写项完整重述 | §4；草案中 `llm-retry`/`session-telemetry-otel` 只给 `disabled` 不写 `config` | ✅ |
| **草案形状经机器校验** | `tools/validate-drafts.mjs` 退出码 **0**（`evidence/drafts-validation.txt`） | ✅ |
| **门禁脚本经实测运行** | 4 场景（基线/通过/缺行/重复 id），见 `evidence/probe-log.md` §4 | ✅ |
| **单写者约束** | §5.6；校验脚本确认两个官方行各只有一个写者 | ✅ |

### 8.1 验收自检

| 检查 | 结果 |
| --- | --- |
| 行 id 唯一性（`soloips-*`） | `soloips-adapter-dsh` / `soloips-core` / `soloips-web` 三行，互不重复，不与官方 160 行冲突 |
| 覆写项是否完整重述 | 草案中两处覆写**均不提供 `config`**，因此不触发重述义务（探针 P4 语义）；§4 给出需要重述时的完整键清单 |
| 是否写入产品目录 | **否**（`git status` 可核；全部产物在 `.artifacts/operations/r002-assembly-20260916/`） |
| 是否装配/启动服务 | **否**（仅 boot-free dump 探针） |
| 依赖 W0 的条目是否标注 | 是（§1.2 A/B/C 三档） |

---

## 9. 证据边界与未执行项

**本设计不构成**：产品装配生效、验收通过、需求确认，或对任何 SOLO-ACC 场景的裁决。

**已执行**：隔离临时 home 上的 boot-free dump 探针（`evidence/probe-log.md`，16 项）；
官方 bundle patch 的机器提取（`tools/*.mjs`，退出码 0）；W0 审计的交叉核对。

**未执行**：未写入 `packages/**` 或 `profiles/soloips/**`（A3）；
未装配、未安装、未启动服务（A1/A6）；未调用模型（A5）；
未 fetch 或构建 DSH fork（A6）；未触碰 r001/55120 实例、home 或凭据。

**剩余缺口**：

1. 探针使用**替身包**（`export function apply() {}`），非真实 `packages/*`。
   真实包的 `apply` 接线须在实现切片验证。
2. 安装工件（tgz）与 W0 源码（`abdfeb48`）的**字节一致性未核对**，须由打包环节补。
3. `soloips-tools-pv`（S1）未纳入；本设计的顺序方案为其预留了
   `soloips-web` 与 `soloips-bundle` 之间的插入位（SOLO-C01）。
4. 门禁脚本 `drafts/tools/check-composition.mjs` **未经真实组合运行**
   （无授权装配），其自身正确性须在实现切片验证。
