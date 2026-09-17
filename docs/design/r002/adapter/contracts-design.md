# T02 · soloips-adapter-dsh seam 契约冻结设计

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-T02-CONTRACTS`；**T02 契约冻结记录**，非需求正文、非实施授权 |
| 目的 | 冻结 `soloips-adapter-dsh` 对 core 暴露的内部接口，使批 2（`core-dev` / `flow-dev` / `web-dev`）可并行开工，不必等待 adapter 实现 |
| 范围 | `apply(ctx, config)` 签名与分层职责；`contracts.ts` 完整类型契约；服务发布模式；settings 注册；禁止项清单；冻结边界。**不含** adapter 内部实现、装配行 patch、业务 domain schema |
| 决策状态 | **〔已冻结〕** 契约形状已由 Lead 2026-09-16 裁定冻结，冻结范围 = §7.1 的 11 组类型；§7.2 条目仍可演进、**不得被批 2 依赖**。本文件不新增〔需求〕，不改 ARCH/DEV/SOLO 系列既有裁定 |
| 证据范围 | 2026-09-16 只读核对：`DSH_FORK_CHECKOUT` 源码（HEAD `abdfeb4831e163462ea4dd17ca5bb4e581d40d1c`）+ `SOLOIPS_DEVS_ROOT/versions/r001/runtime/node_modules` 内**已安装**的 0.1.6-alpha.1 工件；编译探针实测（`probe/compile-receipt.md`）。**未装配、未启动服务、未调用模型**。机器路径按 [ENV-02](../../../operations/environment-handoff.md) 以符号名表示 |
| 依据 | `docs/reference/rewrite-seam-client.md` SEAM-01–15 / SEAM-X1–X5；`docs/governance/code-development-standard.md` DEV-04/05；`docs/technical-architecture.md` §5.1/§7.2/§7.10/§11；`docs/decisions/official-team-and-dsh-fork.md` SOLO-TEAM-03；`.artifacts/operations/r002-baseline-20260916/baseline.md`；`.artifacts/operations/r002-mechanism-audit-20260916/audit.md`（W0）；Lead 2026-09-16 冻结裁定 |
| 变更权 | 冻结范围内变更须经队长确认并通知全部消费方；未冻结区（§7.2）由 T08/T02 实现切片演进。**本设计不写入 `packages/adapter-dsh/**`**（未授权项 A3） |

---

## 0. 结论摘要

0. **〔已冻结〕** Lead 2026-09-16 裁定：**§7.1 的 11 组类型即批 2（`core-dev` / `flow-dev` / `web-dev`）的冻结基线**；§7.2 条目仍可演进、不得被批 2 依赖。§10 的 6 项待裁定已全部采纳本设计推荐。**批 2 据此可并行开工。**
1. **契约面已可编译验证。** `probe/contracts.ts` 在 DEV-02 严格基线下通过类型检查；模拟 core 的消费者（`probe/consumer.ts`）可完成 `lease → stack → open → effect 回收` 的完整装配与一次写提交（P1，exit 0）。
2. **core 的宿主依赖面 = `{@deepseek-ai/cordis}`，且经机械证明。** 把其余**全部**能力包指向不存在目录后 core 侧三文件仍编译通过（P8，exit 0）；只把 cordis 也指坏则失败（P9，exit 2）。这是 DEV-04「core 不直接 import 任何 `@deepseek-ai/*` 能力包」的可复核证据，而非口头约定。
3. **SEAM-X1 的回退路径在目标工件上真实存在，必须在我们的类型层取消。** `ctx.storageDomain` 由 `dsh-storage-domain` 自己增强到 Context（0.1.6-alpha.1 `src/index.ts:35-39`），编译探针 H8 证实其可读（P5），换成不存在成员即失败（P6）。契约的 `SoloipsStoragePort` **不含**该成员，core 侧写不出回退（P3/P4 的 NEG-1）。
4. **`facility` 必须显式传入已提升为类型层要求**，不是运行期检查：`requireFacility(facility: SoloipsDomainFacility | undefined)` 的实参必填，省略即 `TS2554`（P4）。
5. **失败半径已变化（W0 关键发现，我已独立复核）**：0.1.6-alpha.1 的 `auditStartupEntries` 只对 7 个全局必需 id + bootstrap include 失败才 reject；其余 entry 的 import/apply 失败或 pending **只 warn 一次并继续**。因此 adapter 的 `apply` 失败**不会**产生非零退出码、**不会**回滚、**不会**广播事件——契约必须自己显式探测并报错。
6. **官方 Team 面不进入 T02 冻结。** `SpawnTeammateRequest` 无 `model` 字段（〔源码事实〕）；`TeamMemberView.model` 的读回来源变更仍为〔未验证〕（仅据 W0）。该端口在 T08 定稿。

**证据边界见 §9.3**：本设计全部验证为**编译期**证据；不证明 adapter 运行时行为、装配生效、`withFileLock` 的实际跨进程覆盖范围、Team 适配可用性或任何业务功能。

---

## 1. 基线与宿主面核对（〔源码事实〕）

### 1.1 目标工件

| 项 | 值 |
| --- | --- |
| DSH 版本 | **0.1.6-alpha.1** |
| 核对位置 | `SOLOIPS_DEVS_ROOT/versions/r001/runtime/node_modules/@deepseek-ai/*`（**已安装工件**，非 fork 源码） |
| fork 源码 | `DSH_FORK_CHECKOUT` HEAD `abdfeb4831e163462ea4dd17ca5bb4e581d40d1c` |
| 编译器 | TypeScript 5.9.3，DEV-02 严格基线 |

〔源码事实〕**已安装工件的公开签名与 fork 源码一致。** 核对方法：逐项比对已安装 `lib/types/*.d.ts` 的导出签名与 fork `src/*.ts` 的对应声明（`dsh-storage-domain`、`dsh-settings`、`dsh-subagent`、`dsh-tools`、`dsh-session-persistence`、`dsh-experimental-agent-team`）。签名（成员名、参数、返回类型）逐项相同；`.d.ts` 行号与源码不同属编译产物正常差异，不作比较依据。

**已证边界**：本次比对的是**签名**，不是字节。W0 另用 blob hash 证明 `storage-domain/src/{index,domain,spec}.ts` 与 `settings/src/index.ts` 在 `c291e796` 与 HEAD 间为**同一 blob**；其余包未做 blob 级核对，其**实现体**可能不同。故本契约只依赖**签名**，不依赖实现体细节。§1.2 的挂载点结论由探针 H1 在已安装工件上直接编译验证（P5）。

**基线不一致已澄清（与 W0 交叉核对）**：task-1 描述写 fork HEAD `0d1f5000…`，实测为 `abdfeb48…`。W0 证实两者相差**恰好 1 个提交、只动 2 个文件**（`packages/experimental/agent-team/src/roster.ts`、`tests/team.spec.ts`），故 MECH/SOLO-C/SOLO-F/SOLO-DATA 全部机制文件在两 SHA 上逐字节相同。**对本契约而言，基线取 `abdfeb48`。**

### 1.2 五类 seam 的宿主挂载点

| # | 能力 | 宿主服务名 | 类型 | 证据（0.1.6-alpha.1） |
| --- | --- | --- | --- | --- |
| 1 | storage-domain | `ctx.storage.domain`（facility）；`ctx.storage`（hub） | `DomainFacility` / `Storage` | `dsh-storage-domain/src/index.ts:29-39`；`dsh-storage/src/index.ts:30-34` |
| 2 | session | `ctx.sessionPersistence`；`ctx.sessions` | `SessionPersistence` / `SessionStore` | `dsh-session-persistence/src/index.ts:109-113`；`dsh-session/src/index.ts:33-35` |
| 3 | subagent | `ctx.subagents`；`ctx.agents` | `SubagentRuntime` / `AgentRegistry` | `dsh-subagent/src/index.ts:133-136`；`dsh-agent/src/index.ts:26-30` |
| 4 | tools | `ctx.tools` | `ToolRuntime` | `dsh-tools/src/index.ts:130-133` |
| 5 | events | `ctx.on` / `ctx.emit` / `ctx.parallel` / `ctx.serial` | `EventsService` | `vendor/cordis/src/reflect.ts:222` |
| — | settings | `ctx.settings` | `SettingsProvider` | `dsh-settings/src/index.ts:143-147` |
| — | 官方 Team | `ctx.agentTeams` | `TeamService` | `dsh-experimental-agent-team/src/index.ts:38-42` |

以上七项的**挂载点**由编译探针 H1 在**目标工件**上逐项编译验证（P5，exit 0）。H1 实际读取的成员为：`ctx.storage.domain`、`ctx.storage`、`ctx.sessionPersistence`、`ctx.subagents`、`ctx.agents`、`ctx.tools`、`ctx.settings`、`ctx.agentTeams` 八项。**events 一行的 `ctx.on` / `ctx.emit` / `ctx.parallel` / `ctx.serial` 不属 H1 断言范围**——它们是 cordis 自身的 mixin（`reflect.ts:222`），非 DSH 能力包增强；本契约的 `SoloipsEventsPort` 由 adapter 用自己的实现包装它们（§3.2(c)），core 只经 `soloips:*` 词表消费。

### 1.3 与 SEAM 契约的对应

| SEAM | 契约落点 | 本设计处置 |
| --- | --- | --- |
| SEAM-01 | 独立公开面文件 | `src/index.ts` 只做装配 + re-export；类型在 `src/contracts.ts` |
| SEAM-02 | `declare module` 声明自有服务 | `soloipsAdapter`，见 §4；只依赖 cordis |
| SEAM-03 | 收敛声明位置 | **每服务面一个声明文件**，不复用参考的 11 处分散 |
| SEAM-04 | `apply(ctx, config): Promise<void>` | §2 |
| SEAM-05 | 官方依赖只经公开 `@deepseek-ai/*` | §2.2 import 清单 |
| SEAM-06 | settings 注册 + `applies: 'restart'` | §5 |
| SEAM-07 | `enabled === false` 早退 | §2.3 |
| SEAM-08 | `provide` + `effect` 内 unprovide | §4 |
| SEAM-09 | schemastery + namespace 常量 | §5.1 |
| SEAM-10–15 | stack 顺序与逆序释放 | §3.3（机制在 adapter，策略在 core） |
| SEAM-X1 | 禁止 facility 回退 | §6 第 1 条（类型层取消，P3/P4 证据） |
| SEAM-X2 | 不用进程内 `Map` 承担正确性 | §6 第 2 条 |
| SEAM-X3 | 所有写入经单一 commit 入口 | §6 第 3 条（core 侧） |
| SEAM-X4 | 完整准入，不保留 legacy 旁路 | §6 第 4 条（core 侧） |
| SEAM-X5 | 素材真实字节与版本 | S1（tools-pv），不在本切片 |

---

## 2. `apply(ctx, config)` 完整签名与分层职责

### 2.1 签名

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { SoloipsAdapterConfig } from './contracts.ts'

/** 插件显示名（fiber 诊断与 logger 名）。 */
export const name = 'soloips-adapter-dsh'

/** 宿主服务依赖；任一缺失即保持 pending（SOLO-F04 fail-closed）。 */
export const inject = ['storage', 'sessionPersistence', 'subagents', 'agents', 'tools']

/** 配置 schema；同时用于 loader 行 config 与 settings base（SEAM-09）。 */
export const Config: z<SoloipsAdapterConfig> = /* §5.1 */

export async function apply(ctx: Context, config: SoloipsAdapterConfig): Promise<void>
```

`apply` 是**唯一的插件入口**，返回 `Promise<void>`。

### 2.2 分层职责（SEAM-04：入口只做装配）

| 层 | 位置 | 职责 | **不得**做 |
| --- | --- | --- | --- |
| 入口 `apply` | `src/index.ts` | 早退判断；settings 注册（或延迟注册）；端口装配；发布 `soloipsAdapter`；注册 `ctx.effect` 回收 | 业务规则、持久化决策、domain open、写路径 |
| 端口实现 | `src/ports/*.ts` | 把宿主调用面转译为契约类型；错误码映射；事件转译 | 业务判断、跨域不变量、fence 策略 |
| 契约 | `src/contracts.ts` | 只声明类型与常量；无运行时依赖 | 持有 handle、import 能力包 |

**装配顺序（`apply` 内部，全部在副作用之前完成判断）：**

1. `if (config.enabled === false) return`（§2.3）。
2. settings：已就绪则取用其值再构造；未就绪则 `ctx.inject(['settings'], …)` 延迟注册（§5.3）。
3. 构造七个端口对象（**纯对象构造，不触达宿主资源**）。
4. 组装 `SoloipsAdapter` 外观。
5. `ctx.effect(() => { const unprovide = ctx.provide('soloipsAdapter', adapter); return () => unprovide() })`（§4）。

**关键设计决定：发布单个 `SoloipsAdapter` 而非多个服务。** 理由是原子性——core 不会观察到「一半就绪」的 adapter；缺任一能力时 core 保持 pending 并在 `readiness()` 中可见，符合 SOLO-F04 的 fail-closed 要求。

### 2.3 `enabled === false` 早退（SEAM-07）

```ts
export async function apply(ctx: Context, config: SoloipsAdapterConfig): Promise<void> {
  // SEAM-07：在任何副作用之前早退。
  // 「副作用」的判定边界：settings 注册、端口构造、ctx.provide、ctx.effect、
  // ctx.on、任何宿主服务读取都算。此 return 之前只允许纯值计算。
  if (config.enabled === false) return
  // …
}
```

**契约含义**：关闭时 `soloipsAdapter` **不被发布**。因此 core 的消费形状必须能表达「依赖缺失」：

- `ctx.get('soloipsAdapter')` 返回 `SoloipsAdapter | undefined`（探针 `service-augmentation.ts:38-40` 已验证该重载存在）；
- `ctx.inject(['soloipsAdapter'], …)` 的 fiber 保持 pending，不执行。

**这是有意选择**：让 `enabled: false` 表现为「服务不存在」，而不是「服务存在但方法抛错」。前者由框架机制承担，后者要每个方法各自判空——后者更容易漏。

### 2.4 import 清单（SEAM-05 / DEV-04）

`src/index.ts` 与 `src/ports/*.ts` 允许的 `@deepseek-ai/*` import **仅限**：

| 包 | 用途 | 形式 |
| --- | --- | --- |
| `@deepseek-ai/cordis` | `Context` 类型、`Service` 基类 | type + runtime |
| `@deepseek-ai/schemastery` | 配置 schema | runtime（`z`） |
| `@deepseek-ai/dsh-storage` | hub / backend / KvUnit 类型 | type-only |
| `@deepseek-ai/dsh-storage-domain` | `DomainFacility`、`defineDomain` | type + runtime |
| `@deepseek-ai/dsh-storage-json` | JSON backend 构造 | runtime（按需） |
| `@deepseek-ai/dsh-atomic-write` | `withFileLock` / `writeFileAtomic`（写权租约） | runtime |
| `@deepseek-ai/dsh-session-persistence` | `SessionPersistence` 类型 | type-only |
| `@deepseek-ai/dsh-subagent` | `SubagentRuntime` 类型与请求类型 | type + runtime |
| `@deepseek-ai/dsh-tools` | `ToolRuntime`、`ToolDefinition`、`ToolRestriction` | type + runtime |
| `@deepseek-ai/dsh-agent` | `Agent` / `AgentRegistry` 类型 | type-only |
| `@deepseek-ai/dsh-experimental-agent-team` | `TeamService` 类型（T08 起） | type-only |

**禁止**：`@deepseek-ai/dsh-subagent/internal`、任何 `./src/*` 深层路径、以及 SOLO-TEAM-FORK §3 列明的私有实现路径。

〔源码事实〕`dsh-subagent` 的 `exports` 确实暴露 `./internal`（`package.json`），官方 Team 自身也用了该桥接；但 SOLO-TEAM-FORK 明确「不转化为 SoloIPs 对 `subagent/internal` 的直接依赖」。**本契约遵守该边界。**

---

## 3. `contracts.ts` 类型契约草案

**完整正文见 `probe/contracts.ts`（715 行，已通过编译）。** 本节给出结构与关键设计理由；不在此重复代码正文，避免两份漂移。

### 3.1 章节结构

| § | 内容 | 对应能力 |
| --- | --- | --- |
| 0 | 品牌类型、`SoloipsAdapterError`、错误码联合 | 基础设施 |
| 1 | `SoloipsDomainSpec` / `SoloipsDomainFacility` / `SoloipsKvTable` / `SoloipsDomain<S>` / `SoloipsDomainChanged` | storage-domain |
| 2 | `SoloipsWriterLease` | 跨进程 fence（ORG-06） |
| 3 | `SoloipsSessionPersistence` / `SoloipsSessionHandle` / `SoloipsSessionEvent` | session |
| 4 | `SoloipsSubagentPort` / `SoloipsAgentRef` / `SoloipsContinuableStartSpec` | subagent |
| 5 | `SoloipsToolsPort` / `SoloipsToolDefinition` / `SoloipsToolGuard` | tools |
| 6 | `SoloipsEventMap` / `SoloipsEventsPort` | events |
| 7 | `SoloipsTeamPort` | 官方 Team（**T02 不冻结**） |
| 8 | `SoloipsAdapter` / `SoloipsStoragePort` / `SoloipsStorageStack` / `SoloipsAdapterReadiness` | 外观 |
| 9 | `SoloipsAdapterConfig` + 常量 | 配置 |

### 3.2 三个关键设计决定

**(a) 契约不 import 能力包，schema 用结构化端口。**

`SoloipsValueSchema<T>` 只要求 `parse` / `safeParse`——这是 DSH domain 层实际消费 schema 的**全部**调用面（`storage-domain/src/index.ts:126` 表记录 `valueSchema.parse`、`storage-domain/src/spec.ts:140` global 的 null 哨兵 `schema.safeParse(null)`、`storage-domain/src/index.ts:151` global 记录 `schema.parse`）。zod 的 `ZodType<T>` 结构上满足该接口，因此：

- core 可以传 zod schema，而 `contracts.ts` 不必依赖某个 zod 大版本；
- 探针 P8 的 `paths` 实验能成立（不 import 能力包才可能把它们的路径指坏）。

**(b) id 是 adapter 自有的不透明品牌类型。**

`SoloipsSessionId` 等由 adapter 定义，core 不需要 `@deepseek-ai/dsh-brand`。这既收窄依赖面，也让「core 不得凭界面传来的 id 当授权」（SOLO-TEAM-03）在类型上更自然：权威凭证是 `SoloipsAgentRef`，只能经 `SoloipsAgentsPort` 从**真实执行上下文**解析，core 无法构造。

**(c) 事件词表由 adapter 拥有（`soloips:*`）。**

core 订阅 `soloips:domain/changed` 等，**不**订阅 `domain/changed`、`subagent/start` 等 DSH 原生名。DSH 事件改名只影响 adapter 一处。

〔源码事实〕DSH 侧事件名（0.1.6-alpha.1）：`domain/changed`（`storage-domain/src/events.ts:36-47`）、`subagent/start|end|provider-added|provider-removed`（`subagent/src/index.ts:138-171`）、`session/created|disposed|event|flush`（`session/src/index.ts:38-84`）、`tools/pre-execute|execute|post-execute|ptc-dispatch-log|result|change`（`tools/src/index.ts:135-202`）、`settings/updated|document-updated`（`settings/src/types.ts:75-106`）。

〔源码事实〕`hmr/config-update-failed` 在 0.1.6-alpha.1 已移除：`git grep config-update-failed` 在 `packages`/`vendor`/`apps` **代码零命中**，仅 `.agents/notes/archived/**` 2 处归档笔记提及（Lead 2026-09-16 独立复核，我已复现）。live 失败现在只有就地 warn。**本契约的可观测面不包含该事件。**

### 3.3 storage stack 的顺序契约（SEAM-11–15）

契约把「锁在介质上、写面在锁内、释放逆序」变成结构性质：

```text
core: acquireWriterLease(root)        // 1. 先取锁（在任何写面存在之前）
  → adapter.createStack({ root })      // 2. 同一 canonical root 构造 backend + facility
  → core: facility.open(businessSpec)  // 3. 在租约窗口内 open（core 是唯一 opener）
  → …业务运行…
  → dispose: domain.close() → stack.dispose() → lease.dispose()   // 4. 逆序
```

**策略与机制的分界**：adapter 提供 `acquireWriterLease` / `createStack` 两个**机制**入口；**何时**取锁、**每个持久发布点前**复核、失败如何回退，是 core 的**策略**（SEAM-12/13 的不变量由 core 的调用顺序保证，adapter 不替 core 决定）。

〔源码事实〕`dsh-atomic-write` 0.1.6-alpha.1 提供 `withFileLock(filename, operation, { waitMs })`（`wx` 创建的 `<file>.lock` 兄弟文件，跨进程串行）与 `writeFileAtomic`。这正是 SEAM-X2 要求的「文件系统级 writer lease」，而非进程内 `Map`。**边界**：`withFileLock` 保护的是**一个文件**的写入者；把它升格为「整个数据根的跨进程独占」需要在实现切片验证覆盖范围（SOLO-ACC-09 的路径别名与第二 Host 场景）。

---

## 4. 服务发布模式（SEAM-08）

### 4.1 模式

```ts
// src/index.ts —— 唯一发布点
ctx.effect(() => {
  const unprovide = ctx.provide(SOLOIPS_ADAPTER_SERVICE_NAME, adapter)
  return () => {
    unprovide()
  }
}, 'soloipsAdapter.publish()')
```

**服务名常量**：`SOLOIPS_ADAPTER_SERVICE_NAME = 'soloipsAdapter'`（一律 `soloips*` 前缀）。

### 4.2 `provide` 与 `effect` 的真实语义

〔源码事实〕`ctx.provide(name, value, check?)` 的**实现本身就是** `ctx.fiber.effect(...)`（`vendor/cordis/src/reflect.ts:277-304`），返回一个 disposer；该 disposer 删除 store 项、通知依赖 fiber、并等待它们。因此：

| 写法 | 是否必需 | 说明 |
| --- | --- | --- |
| `const unprovide = ctx.provide(name, value)` | 必需 | 发布；自带 fiber 作用域回收 |
| `ctx.effect(() => { const u = ctx.provide(…); return () => u() })` | **推荐** | 让回收顺序显式、可诊断（effect label 出现在诊断树中） |
| 只 `ctx.provide(…)` 不放进 effect | 可行但**不采用** | 回收顺序依赖 fiber 内部顺序，诊断树里不显式 |

**采纳理由**：SEAM-08 要求 `provide` / `effect` 配对。虽然 cordis 的实现使 `provide` 自身已受 fiber 作用域保护，但把配对**写显式**有两个实际收益：(1) 回收顺序在 `EffectMeta` 诊断树中可见；(2) 后续若 adapter 需要在 unprovide **之后**再做清理（例如关端口），配对形式提供了确定的插入点。

**这是设计选择，不是框架强制**——已在探针 H5 验证两种写法都能编译（P5，exit 0）。

### 4.3 多服务情形

若 T08 需要为官方 Team 单独发布服务面，**仍遵守同一模式**：每个服务一个 `ctx.effect` + `provide` + unprovide，服务名一律 `soloips*` 前缀。不得出现 `agentSwarm*` 式命名（旧 swarm 服务名仅作历史参考，见技术架构 §7.4）。

---

## 5. settings 注册（SEAM-06 / SEAM-09）

### 5.1 namespace 常量与 schema

```ts
/**
 * settings namespace。
 * 〔约束〕必须匹配宿主正则 `^[a-z][a-z0-9-]*$`（0.1.6-alpha.1
 * `dsh-settings/src/index.ts:20` 的 NAMESPACE_PATTERN）。
 * 故 `soloips-adapter` 合法；`soloipsAdapter` 非法（大写）。
 */
export const SOLOIPS_ADAPTER_SETTINGS_NAMESPACE = 'soloips-adapter'

/** 配置 schema（schemastery）；缺省值与契约常量共用一处，避免两处漂移。 */
export const Config: z<SoloipsAdapterConfig> = z.object({
  enabled: z.boolean().default(SOLOIPS_ADAPTER_CONFIG_DEFAULTS.enabled),
  defaultBackend: z.string().default(SOLOIPS_ADAPTER_CONFIG_DEFAULTS.defaultBackend),
  leaseWaitMs: z.natural().default(SOLOIPS_ADAPTER_CONFIG_DEFAULTS.leaseWaitMs),
  teamEnabled: z.boolean().default(SOLOIPS_ADAPTER_CONFIG_DEFAULTS.teamEnabled),
})
```

### 5.2 注册调用与 `applies: 'restart'`

```ts
settings.register(SOLOIPS_ADAPTER_SETTINGS_NAMESPACE, Config, {
  base: { /* 与 cordis.patch.yml 行 config 相同的初值 */ },
  // ARCH-D04〔约束〕：新 SoloIPs 正式/验收 profile 为 patchReload: startup，
  // 配置变更只在重启后生效。applies 与之同向。
  applies: 'restart',
  validate: (value) => {
    if (value.leaseWaitMs < 0) throw new TypeError('leaseWaitMs must not be negative')
  },
})
```

〔源码事实〕`SettingsRegisterOptions` 提供 `base` / `applies` / `validate` 三项（`dsh-settings/src/index.ts:49-74`）；`applies` 取值 `'live' | 'restart'`，默认 `live`（`:46`、`:432`）。**必须显式写 `'restart'`**——默认是 `live`，不写就与 ARCH-D04 不符。

`validate` 用于 schema 表达不了的跨字段约束；它在**写入时**拒绝，因此调用方在 `update` / `replace` / `mutate` 就得到错误，而不是存下一个会静默禁用 owner 的值（`:54-73`）。

### 5.3 未就绪时的延迟注册

```ts
// settings 未就绪：先 inject，就绪后在回调内注册。
// 已就绪：直接取用其值再构造 runtime（SEAM-06 后半句）。
const settings = ctx.get('settings')
if (settings === undefined) {
  ctx.inject(['settings'], settingsCtx => {
    registerAdapterSettings(settingsCtx.settings)
  })
} else {
  const scope = registerAdapterSettings(settings)
  // 用已就绪的解析值构造端口（例如 leaseWaitMs / defaultBackend）。
  const resolved = scope.get()
  // …
}
```

**语义边界**：`ctx.inject(deps, callback)` 是 `ctx.plugin({ inject, apply: callback })` 的简写（`vendor/cordis/src/registry.ts:300-302`）；依赖变化时该 fiber 会卸载并重跑。因此回调必须**幂等**，且不得依赖「只执行一次」。

〔源码事实〕注册本身是 effect：`settings.register` 内部 `this.ctx.effect(() => { …; return () => this.registrations.delete(ns) })`（`dsh-settings/src/index.ts:440-445`）。重复注册同一 namespace 会失败（`:425-427`）。**因此延迟注册路径不得与直接注册路径同时执行**——§5.3 的 if/else 是必需的，不是风格。

---

## 6. 禁止项清单（评审要点）

以下每条都是**硬禁止**；标注了机械证据的条目由编译探针拒绝，不依赖评审者记忆。

| # | 禁止 | 后果 | 强制方式 | 证据 |
| --- | --- | --- | --- | --- |
| **1** | **不持有业务 domain handle；不 open 业务 domain** | 违反 TERM-08/ARCH-D02 的 core 唯一写权威 | 契约不提供任何 open 业务 domain 的入口；`SoloipsStorageStack` 只给 facility | 设计约束（§3.3） |
| **2** | **facility 必须显式传入且来自 stack；类型层取消 `ctx.storageDomain` 回退**（SEAM-X1） | 回退可绕过 lease 直接走宿主 facility，使 ORG-06 失效 | `SoloipsStoragePort` **无** `storageDomain` 成员；`requireFacility` 实参必填 | **P3/P4**：`TS2339 Property 'storageDomain' does not exist`；`TS2554 Expected 1 arguments, but got 0` |
| **3** | **不使用进程内 `Map` 承担正确性**（SEAM-X2） | 跨进程无效；`already-open` 只保证同实例 | 写权只经 `SoloipsWriterLease`（基于 `dsh-atomic-write` 的 `withFileLock`） | 设计约束 + W0/技术架构 MECH-05 |
| **4** | **不跨包读取官方私有实现** | 官方内部路径无兼容承诺；SOLO-TEAM-FORK §3 明确禁止 | 只经 `exports` 公开入口；禁用 `dsh-subagent/internal` 与 `./src/*` 深层路径 | SOLO-TEAM-FORK §3；§2.4 清单 |
| **5** | **不假定跨 domain 原子提交**（MECH-04 / DRAFT-D05） | 跨域不变量会静默丢更新 | 契约只暴露单 domain 的 `update()`；跨域一致性由 core 用「单一权威侧 + 重读 + fail-closed」实现（R3） | 技术架构 §7.6；〔未验证〕保持 |
| **6** | **不把 `already-open` 当跨进程保护**（MECH-05） | 误报独占通过 | `SoloipsDomainFacility` 的文档明确写「同实例保证，不构成跨进程独占」 | §3 契约注释 |
| **7** | **不用 `any` / 双重断言 / `@ts-ignore` 绕过契约类型**（DEV-05） | 未校验数据进入打开路径 | 探针 NEG-4 证明 `unknown` 不可直接当 facility 用 | **P3/P4**：`TS2322 Type 'unknown' is not assignable to type 'SoloipsDomainFacility'` |
| **8** | **不把 adapter 失败当作可依赖的启动失败信号** | 0.1.6 的 `auditStartupEntries` 只对 7 个必需 id reject，其余只 warn；**退出码可能仍是 0** | 契约提供 `readiness()`；core 必须自己显式探测 | W0 关键发现；我已独立复核 `app-boot/src/index.ts:818-835` |
| **9** | **不在契约的可观测面引用已移除的 HMR 事件** | `hmr/config-update-failed` 在 0.1.6 已无实现 | 事件词表只含 `soloips:*` | §3.2(c)；Lead 独立复核（我已复现） |
| **10** | **不把进程内 session 写所有权当跨进程 fence** | `SessionPersistence.open(id, 'write')` 是进程内语义 | 跨进程写权只经 `SoloipsWriterLease` | §3 契约注释 |

**第 2、7 条是本清单的核心**：它们把 SEAM-X1 与 DEV-05 从「评审时记得检查」变成「编译器拒绝」。这是本设计相对于纯文档约束的主要增量。

### 6.1 仓库既有门禁已经覆盖 DEV-04（补充证据）

〔源码事实〕根 `.oxlintrc.json` 已配置一条 `no-restricted-imports` 规则，对 `packages/*/src/**`（**排除** `packages/adapter-dsh/**`）禁止 `@deepseek-ai/*`：

```json
{
  "files": ["packages/*/src/**/*.{ts,tsx}"],
  "excludeFiles": ["packages/adapter-dsh/**"],
  "rules": {
    "no-restricted-imports": ["error", { "patterns": [
      { "group": ["@deepseek-ai/*"], "message": "官方 DSH 依赖必须经 soloips-adapter-dsh 暴露的接口使用（DEV-04）…" },
      { "group": ["**/packages/core/**", "soloips-core", "soloips-core/*"], "message": "跨包只能经公开 exports 与服务契约（DEV-04）" }
    ]}]
  }
}
```

**含义**：DEV-04「core 不直接 import 任何 `@deepseek-ai/*`」在**仓库层面已有机械强制**，不是仅靠本契约的自觉。`.oxlintrc.json` 的 `ignorePatterns` 含 `.artifacts/**`，故本设计目录内的探针文件（含 `host-surface.ts` 的真实 import）不参与 lint。

**验证**：`pnpm run lint` 在当前工作树为 **exit 0**（0 warning / 0 error，7 文件）。**边界**：该规则是**静态**检查，只覆盖 `packages/*/src/**`；它不检查 `tests/**`、不检查类型层是否真的可编译（那由 P1–P9 探针覆盖）。两者互补。

---

## 7. 冻结边界声明

**〔已冻结〕Lead 2026-09-16 裁定：§7.1 的 11 组类型即批 2（`core-dev` / `flow-dev` / `web-dev`）的冻结基线；§7.2 仍可演进、不得被批 2 依赖。**

### 7.1 T02 冻结后批 2 可并行依赖（**变更需走接口变更流程**）

| # | 类型 / 常量 | 依赖方 | 冻结理由 |
| --- | --- | --- | --- |
| 1 | `SoloipsAdapter`（外观，七个只读端口成员） | core-dev, flow-dev, web-dev | 唯一注入面；形状变化即破坏所有消费方 |
| 2 | `SoloipsDomainSpec` 及 `SoloipsTableKeyOf` / `SoloipsTableValueOf` | core-dev, flow-dev | domain 声明的类型基础 |
| 3 | `SoloipsDomainFacility` / `SoloipsDomain<S>` / `SoloipsKvTable` / `SoloipsDomainGlobal` | core-dev | 打开与读写路径 |
| 4 | `SoloipsWriterLease`（`generation` / `storageId` / `assertHeld` / `dispose`） | core-dev, flow-dev | ORG-06 的机制面；签名变化影响每个发布点 |
| 5 | `SoloipsStoragePort`（`acquireWriterLease` / `createStack` / `requireFacility`） | core-dev | SEAM-X1 的类型层强制点 |
| 6 | `SoloipsStorageStack` / `SoloipsStorageBinding` | core-dev | 启动绑定清单 |
| 7 | `SoloipsAdapterConfig` + `SOLOIPS_ADAPTER_*` 常量 | core-dev, assembly-dev | 配置面；`cordis.patch.yml` 行 config 必须与之一致 |
| 8 | `SoloipsAdapterErrorCode`（6 个码） | core-dev, flow-dev | 错误分支 switch 的依据 |
| 9 | `SoloipsSessionPersistence` / `SoloipsSessionHandle` | core-dev | 会话读写 |
| 10 | `SoloipsEventsPort` + `SoloipsEventMap` 的键名 | core-dev, flow-dev, web-dev | 订阅面 |
| 11 | `SoloipsAgentRef` / `SoloipsAgentsPort` | core-dev, flow-dev | 权威凭证解析 |

**冻结的含义**：字段名、方法名、参数个数、返回类型、错误码取值。新增**可选**字段/方法属兼容演进，须在 `contracts.ts` 内标注版本注释；删除或改签名属破坏性变更，须队长确认并通知全部消费方。

**冻结依据**：Lead 2026-09-16 裁定（本轮）。批 2 可据此并行开工，不必等待 adapter 实现落地。

### 7.2 T02 后仍可演进（**不得被批 2 依赖**）

| 类型 | 为何不冻结 | 消费者纪律 |
| --- | --- | --- |
| `SoloipsTeamPort` 及其全部成员类型 | 官方 Team 在 0.1.6-alpha.1 仍标实验能力；`TeamMemberView.model` 的读回来源在 fork `abdfeb48` 刚变更（**〔未验证〕**，见 §8） | core **不得**引用成员名；T08 定稿后才可使用 |
| `SoloipsSubagentPort` 的高级方法（`listDescendants`、`sendMessage` 的返回 id 语义） | 依赖官方 continuation manager 的语义，尚需在 T08 验证 | core 可依赖 `startContinuable` / `interrupt`；其余按需 |
| `SoloipsToolDefinition.output` 的 `render` 契约 | 与 PTC 呈现模式耦合，S1 随 tools-pv 才真实消费 | 首版只用 `register` + `restrict` |
| `SoloipsAdapterReadiness` 的字段 | 纯诊断面，不承担门禁 | 不得用于业务判断 |
| `SoloipsAdapterConfig.teamEnabled` | T02 保留字段、无实现（Lead 已采纳「Team 面不做最小占位」） | assembly-dev 可写入 patch，但不得据其断言 Team 已适配 |

---

### 7.1.1 破坏性变更登记：`SoloipsSessionSnapshot.revision`

**〔破坏性变更，2026-09-17，用户已批准〕** 按 §7.1「删除或改签名属破坏性变更，须队长确认并通知全部消费方」，此处登记本次变更。

| 项 | 内容 |
| --- | --- |
| 变更 | `SoloipsSessionSnapshot.revision`：`number` → `SoloipsRevision`（SoloIPs 自有的不透明 `string` 品牌；新增同名装箱函数） |
| 原因 | 宿主 `SessionPersistenceRevision` 是 backend 铸造的**不透明字符串品牌**（`dsh-session-persistence/lib/types/revision.d.ts`）。不存在保真的 string→number 映射；原实现用 sha256 折叠到 53 位安全整数，把**精确的身份比较降为概率性比较**（碰撞即「已变化」被误判为「未变化」）。契约注释本就写「不透明…只可与同实例同 id 比较」，语义上不需要 `number` |
| 属破坏性变更的依据 | §7.1 明确「返回类型」在冻结范围内，改类型即破坏性变更。「当前无消费方使用该字段」只说明**迁移成本为零**，不改变变更性质 |
| 迁移影响 | 实施时 core（T03）已实现但对该字段**零使用**（grep 确认）；`flow-dev` / `web-dev` 尚未消费该字段，**消费方无需改代码** |
| 消费方通知 | 批 2 的 `core-dev` / `flow-dev` / `web-dev`（§7.1 的冻结基线消费方）；本次会话直接执行，通知记录在交付报告与 PR，不使用 DSH Task |
| 验证 | 无哈希折叠残留（`createHash` / `readUInt32BE` 零命中）；adapter 的 session 端口改为**原样装箱宿主完整 token** |

### 7.3 依赖方向（DEV-04）

```text
core ──► adapter/contracts ──► @deepseek-ai/* 能力包
web Host ──► core
web Client ──► core/contracts（仅浏览器安全 DTO/类型）+ 官方 client API
tools-pv ──► adapter/contracts + core 命令契约
```

**禁止反向**：`contracts.ts` 不得 import core（否则成环）。core 的服务契约（业务命令、查询投影）由 **core 自己的** `src/contracts.ts` 拥有，adapter 不感知。

**`exports`（〔已冻结〕，PKG-01 形状；Lead 已采纳公开 `./contracts`）：**

```json
{
  "exports": {
    ".":            { "types": "./lib/types/index.d.ts",    "default": "./lib/index.js" },
    "./contracts":  { "types": "./lib/types/contracts.d.ts","default": "./lib/types/contracts.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

〔源码事实〕`./contracts` 子路径是**类型专用**入口：core 只 import 类型与常量，运行时不需要 adapter 的 JS（服务经 `ctx.inject` 取得）。这与 DEV-04「只需类型时使用类型导入」一致。

---

## 8. 对 W0 结论的依赖与核对状态

| # | 依赖项 | W0 裁决 | 我的独立复核 | 契约影响 |
| --- | --- | --- | --- | --- |
| 1 | `ctx.storageDomain` 增强仍在 | 成立（与 0.1.5-rc.2 同 blob） | ✅ 探针 H8（P5/P6）在**已安装工件**上验证 | 禁止项 #2 的前提；必须在类型层取消 |
| 2 | settings namespace 正则 `^[a-z][a-z0-9-]*$` | 成立（同 blob） | ✅ 探针 H3 编译通过（`soloips-adapter` 合法） | §5.1 常量取值 |
| 3 | `applies: 'live' \| 'restart'`，默认 `live` | 成立 | ✅ 读 `dsh-settings/src/index.ts:46,432` | §5.2 必须显式写 `'restart'` |
| 4 | `spawnTeammate` 无 `model` 字段 | 成立 | ✅ 读已安装 `types.d.ts` | §7.2 Team 端口不冻结 |
| 5 | `TeamMemberView.model` 读回来源在 `abdfeb48` 变更 | 已变化 | **〔未验证〕** 仅据 W0 报告；Lead 未复核 | §7.2 不冻结 Team 面 |
| 6 | **`auditStartupEntries` 取代 `assertEntriesActivated`**；失败半径变化 | **已变化** | ✅ 我独立复核 `app-boot/src/index.ts:711-719, 818-835` | 禁止项 #8；§2.2 的失败语义 |
| 7 | `vendor/loader/.../group.ts` 回滚整体删除 | **已变化** | ✅ 我独立复核全文（90 行，`update()` 只 `logger.error` 吞掉） | 禁止项 #8 |
| 8 | `hmr/config-update-failed` 已移除 | 已变化 | ✅ **Lead 独立复核**：`git grep config-update-failed` 在 `packages`/`vendor`/`apps` **代码零命中**（仅 `.agents/notes/archived/**` 2 处归档笔记）。我已复现该结果 | 禁止项 #9；§3.2(c) |
| 9 | MECH-01–10 / SOLO-C01–C07 / SOLO-F01–F08 的其余条目 | 13 成立 / 9 已变化 / 3 无法核对 | 未逐条复核 | 主要影响 assembly-dev（T01/T04）；对 T02 只经 #6/#7 |

**证据状态**：#8 已由 Lead 独立复核并由我复现，**升级为〔源码事实〕**。#5 仍为**〔未验证〕**——仅据 W0 报告，我未独立取证，Lead 亦未复核。

**两条的影响范围**：它们都只落在「不冻结」的区域（Team 面、HMR 事件），**不影响批 2 的并行开工**。建议 verifier 在验收阶段独立复核 #5。

### 8.1 契约的失败语义（因 W0 #6/#7 而必须写明）

〔源码事实〕0.1.6-alpha.1：

- **解析期（bundle 层）仍 fail-loud**：bundle 不可解析或缺 `dsh.bundle` 声明 → 启动前抛错（`app-boot/src/profile.ts:845-848`、`:880-882`）。**故 adapter 包放入 `bundles` 必须声明 `dsh.bundle.patch`**（assembly-dev 的 T01 职责）。
- **挂载期（entry 层）已静默化**：`auditStartupEntries` 只对 7 个全局必需 id（`agent-loop` / `webserver` / `modules` / `connection` / `headless-runner` / `acp` / `sdk-jsonrpc-server`）+ bootstrap include 失败才 reject；其余 entry 的 import/apply 失败或 pending 只 warn 一次并继续（`app-boot/src/index.ts:818-835`）。
- **Loader 回滚已删除**：`group.ts` 的 `update()` 对每个 entry 的失败只 `logger.error` 吞掉（`:58-60`），无回滚、无抛出。

**对契约的后果**（已写入禁止项 #8）：

1. adapter 的 `apply` 抛错**不会**产生非零退出码、**不会**回滚、**不会**广播事件——只有 stderr warning。
2. **不能依赖宿主把 adapter 的失败暴露出来。** core 必须自己探测：经 `ctx.get('soloipsAdapter')` 判空，或 `ctx.inject(['soloipsAdapter'], …)` 保持 pending。
3. 「服务未就绪时 fail-closed pending」（SOLO-F04）因此**更**重要：它是唯一可靠的就绪信号。

---

## 9. 交付物与验证回执

### 9.1 交付物

| 文件 | 内容 |
| --- | --- |
| `.artifacts/operations/r002-adapter-20260916/contracts-design.md` | 本文件（设计正文） |
| `.artifacts/operations/r002-adapter-20260916/probe/contracts.ts` | **契约完整 TypeScript 草案（715 行）** |
| `.artifacts/operations/r002-adapter-20260916/probe/consumer.ts` | 模拟 core 依赖的编译探针 |
| `.artifacts/operations/r002-adapter-20260916/probe/consumer-negative.ts` | 禁止项的反向编译探针（4 个 `@ts-expect-error`） |
| `.artifacts/operations/r002-adapter-20260916/probe/service-augmentation.ts` | 服务名模块增强 + DEV-04 依赖面探针 |
| `.artifacts/operations/r002-adapter-20260916/probe/host-surface.ts` | 对**已安装 0.1.6-alpha.1** 的宿主面核对（H1–H8） |
| `.artifacts/operations/r002-adapter-20260916/probe/compile-receipt.md` | 9 个编译探针的实测回执 |
| `.artifacts/operations/r002-adapter-20260916/probe/tsconfig*.json` | 各探针的编译配置 |

### 9.2 验证结果（实测）

工作目录 `SOLOIPS_ROOT`，tsc 5.9.3，目标宿主工件 = `SOLOIPS_DEVS_ROOT/versions/r001/runtime/node_modules` 内已安装的 0.1.6-alpha.1（符号名按 [ENV-02](../../../operations/environment-handoff.md) 解析；本机实际路径不入提交正文）。

| 探针 | 内容 | 预期 | 实际 |
| --- | --- | --- | --- |
| P1 | 正向：core 依赖面编译 | 0 | **0** |
| P2 | 完整性对照：注入故意错误 | 非零 | **2** |
| P3 | 反向：4 个禁止项被拒绝 | 0 且无 TS2578 | **0** |
| P4 | 反向对照：剥除指令后错误显形 | 非零 | **2**（TS2339/2554/1360/2322） |
| P5 | 宿主面 H1–H8 对已安装工件 | 0 | **0** |
| P6 | H8 对照：换不存在成员 | 非零 | **2** |
| P7 | 服务增强（只需 cordis） | 0 | **0** |
| P8 | DEV-04：能力包全部不可解析 | 0 | **0** |
| P9 | DEV-04 对照：cordis 不可解析 | 非零 | **2** |

**通过边界**：以上为**编译期**证据。证明契约类型完整、可被 core 依赖编译、禁止项在类型层被拒绝、宿主面在目标工件上存在。
**不证明**：adapter 的运行时行为、装配是否生效、`withFileLock` 的实际跨进程覆盖范围、官方 Team 的适配可用性、任何业务功能。这些属 T02 实现与 SOLO-ACC 验收。

### 9.3 证据边界（**本设计的证明范围**）

**证据层次**：本设计全部验证为**编译期**证据（`tsc -p`，9 个探针，见 §9.2 与 `probe/compile-receipt.md`），叠加只读源码/工件核对（§1、§8）。

**已证明**：

- 契约类型完整、无 `any` 逃避，在 DEV-02 严格基线下通过类型检查；
- core 侧消费形状（`lease → stack → open → effect 回收` + 一次写提交）可编译；
- core 的宿主依赖面**恰好**是 `{@deepseek-ai/cordis}`（P8/P9 的 paths 对照）；
- 4 个禁止项在类型层被编译器拒绝（P3/P4 的指令与剥除双对照）；
- 七类 seam 的挂载点在**目标安装工件**（0.1.6-alpha.1）上存在（P5）；
- SEAM-X1 的 `ctx.storageDomain` 回退路径在目标工件上真实可读（P5/P6）。

**不证明**（不得据本文件外推）：

| 不证明 | 为何 | 由谁关闭 |
| --- | --- | --- |
| adapter 的**运行时行为** | 未实现、未装配、未启动服务 | T02 实现切片 |
| 装配是否生效 | 未执行 `--dump-config`、未读生效树 | T01/T04（assembly-dev）+ SOLO-ACC-01 |
| `withFileLock` 的**实际跨进程覆盖范围** | 只读到其签名与文档；「一个文件的写入者互斥」不等于「整个数据根的跨 Host 独占」；路径别名与第二 Host 未验 | SOLO-ACC-09（两个真实进程） |
| 官方 Team 的适配可用性 | 端口未冻结、未实现；`TeamMemberView.model` 读回变更本身仍为〔未验证〕 | T08 + TEAM-ACC-01–03 |
| 任何业务功能 | 纯设计，无业务代码 | S0 验收 |
| 契约冻结本身 | 冻结是 Lead 的裁定，不是技术验证结果 | Lead（已于 2026-09-16 作出） |

**未执行**：未写入 `packages/adapter-dsh/**`（未授权项 A3）；未装配、未启动服务、未改配置、未 fetch/构建 fork、未调用模型。

**反例（本设计不蕴含）**：编译通过不蕴含装配生效；契约冻结不蕴含实现完成；探针在目标工件上通过不蕴含运行时行为一致；9 个探针全绿不蕴含任何 SOLO-ACC 场景通过。

---

## 10. 已裁定事项（Lead 2026-09-16）

§10 原为 6 项待裁定；Lead 已全部裁定，下表为结果。

| # | 事项 | 裁定 | 落点 |
| --- | --- | --- | --- |
| 1 | **契约冻结确认**：§7.1 清单是否即为批 2 的冻结基线 | ✅ **采纳**：§7.1 的 11 组类型即批 2 冻结基线；§7.2 仍可演进、不得被批 2 依赖 | 阅读契约「决策状态」、§7 |
| 2 | 发布单个 `SoloipsAdapter` 还是多个服务 | ✅ **采纳单个**（原子发布；core 不会观察到「一半就绪」的 adapter） | §2.2 |
| 3 | `SoloipsValueSchema` 结构化端口 vs 直接依赖 zod | ✅ **采纳结构化端口**（使 core 依赖面只含 cordis；P8/P9 为其机械证据） | §3.2(a) |
| 4 | `exports` 是否公开 `./contracts` | ✅ **采纳公开**（DEV-04 要求跨包经 `exports`；类型专用入口，core 运行时不需 adapter JS） | §7.3 |
| 5 | `leaseWaitMs` 缺省 5s 是否合适 | ✅ **采纳 5s**（实现切片可调；调整属兼容演进） | §9、`contracts.ts` 常量 |
| 6 | Team 面是否需要在 T02 前给出最小占位 | ✅ **采纳不占位**（避免 core 依赖未定稿面；T08 定稿后再使用） | §7.2 |

**裁定依据**：Lead 2026-09-16（本轮）。裁定文本已记入本文件；批 2 可据此开工。
