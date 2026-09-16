# T02 契约草案 · 编译探针回执

- 工作目录：`SOLOIPS_ROOT`
- tsc：Version 5.9.3（DEV-02 基线：strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + noImplicitOverride + verbatimModuleSyntax）
- 目标宿主工件：`SOLOIPS_DEVS_ROOT/versions/r001/runtime/node_modules` 内已安装的 **0.1.6-alpha.1**（非 fork 源码）
- 符号名解析见 [ENV-02](../../../../docs/operations/environment-handoff.md)；本机实际路径不入提交正文
- 证据边界：**仅编译期核对**；未装配、未启动服务、未调用模型。编译通过不证明运行期行为。

## P1 正向 · contracts.ts + consumer.ts（模拟 core 依赖）

```text
exit code: 0
```

**通过边界**：core 侧只 import `./contracts.ts`（不 import 任何 `@deepseek-ai/*` 能力包）即可完成 lease → stack → open → effect 回收的完整装配与一次写提交。

## P2 正向完整性对照 · 注入故意错误必须失败

证明 P1 的 exit 0 不是「配置没生效」：

```text
.artifacts/operations/r002-adapter-20260916/probe/consumer.broken.ts(120,14): error TS2322: Type 'string' is not assignable to type 'number'.
exit code: 2  （非零 = P1 确实在执行类型检查）
```

## P3 反向 · 禁止项的编译期拒绝（exit 0 且无 TS2578）

`@ts-expect-error` 的语义是「下一行**必须**报错」。因此 exit 0 且无 `TS2578 Unused directive` 等价于：4 个禁止项各自都触发了真实错误。

```text
exit code: 0
```

## P4 反向对照 · 剥除 `@ts-expect-error` 后错误必须显形

机械生成：`(Get-Content consumer-negative.ts -Raw) -replace '// @ts-expect-error[^\r\n]*', '// (removed)'`

```text
.artifacts/operations/r002-adapter-20260916/probe/consumer-negative.control.ts(34,26): error TS2339: Property 'storageDomain' does not exist on type 'SoloipsStoragePort'.
.artifacts/operations/r002-adapter-20260916/probe/consumer-negative.control.ts(45,26): error TS2554: Expected 1 arguments, but got 0.
.artifacts/operations/r002-adapter-20260916/probe/consumer-negative.control.ts(55,3): error TS1360: Type '{ name: string; tables: {}; }' does not satisfy the expected type 'SoloipsDomainSpec'.
  Property 'version' is missing in type '{ name: string; tables: {}; }' but required in type 'SoloipsDomainSpec'.
.artifacts/operations/r002-adapter-20260916/probe/consumer-negative.control.ts(65,3): error TS2322: Type 'unknown' is not assignable to type 'SoloipsDomainFacility'.
exit code: 2  （非零预期）
```

## P5 宿主面 · host-surface.ts 对已安装 0.1.6-alpha.1

本探针**故意** import 真实 `@deepseek-ai/*` 包（`tsconfig.host.json` 的 `paths` 指向 r001 runtime）。它验证的是宿主面存在性，属于 adapter 实现层；core 永远看不到这层 import（DEV-04）。

覆盖：H1 五类 seam 挂载点、H2 `facility.open` 形状、H3 `settings.register(ns, schema, {base, applies:'restart', validate})` 且 namespace 常量通过宿主正则、H4 `ctx.inject(['settings'], …)` 延迟注册、H5 `provide`/`effect` 配对、H6 Context 模块增强点、H7 单一配置面、**H8 宿主 `ctx.storageDomain` 回退路径确实存在**。

```text
exit code: 0
```

## P6 H8 对照 · 换成不存在的成员必须失败

证明 H8 读到的 `ctx.storageDomain` 是**真实**的宿主增强，而非 tsc 静默放行任意属性：

```text
.artifacts/operations/r002-adapter-20260916/probe/host-surface.control.ts(168,14): error TS2339: Property 'noSuchSeamMember' does not exist on type 'Context'.
exit code: 2  （非零预期）
```

## P7 服务增强 · service-augmentation.ts（只需 cordis）

验证 `declare module '@deepseek-ai/cordis' { interface Context { soloipsAdapter: SoloipsAdapter } }`
这一增强点可编译，且 core 的 `ctx.get('soloipsAdapter')` / `ctx.inject(['soloipsAdapter'], …)`
两种消费形状都成立（前者返回 `SoloipsAdapter | undefined`，正是 `enabled: false` 未发布服务时的必需分支）。

```text
exit code: 0
```

## P8 DEV-04 决定性证据 · core 依赖面**只**含 cordis

方法：`tsconfig.dev04.json` 的 `paths` 把 `@deepseek-ai/cordis` 指向真实安装，
把**其余全部**能力包（storage-domain / storage / session / session-persistence /
subagent / tools / agent / settings / experimental-agent-team / atomic-write）
指向不存在的目录。若 core 侧文件仍编译通过，则其宿主依赖集**恰好**是 `{cordis}`。

```text
exit code: 0  => core 依赖面 = { @deepseek-ai/cordis }
```

**通过边界**：证明 `contracts.ts` + `consumer.ts` + `service-augmentation.ts`
三个 core 侧文件在能力包不可解析时仍可编译。这不证明 adapter 实现层同样如此
（adapter 必须能解析这些包，见 P5）。

## P9 DEV-04 对照 · cordis 不可解析必须失败

证明 P8 不是「paths 整体没生效」：同一配置只把 cordis 也指向不存在目录。

```text
.artifacts/operations/r002-adapter-20260916/probe/service-augmentation.ts(16,30): error TS2307: Cannot find module '@deepseek-ai/cordis' or its corresponding type declarations.
.artifacts/operations/r002-adapter-20260916/probe/service-augmentation.ts(19,16): error TS2664: Invalid module name in augmentation, module '@deepseek-ai/cordis' cannot be found.
exit code: 2  （非零 = P8 的 exit 0 确有解析发生）
```

## 结果汇总

| 探针 | 配置 | 预期 | 实际 |
| --- | --- | --- | --- |
| P1 正向（core 依赖面） | `tsconfig.positive.json` | 0 | 0 |
| P2 完整性对照 | `tsconfig.integrity.json` | 非零 | 2 |
| P3 反向（禁止项） | `tsconfig.json` | 0 且无 TS2578 | 0 |
| P4 反向对照 | `tsconfig.control.json` | 非零 | 2 |
| P5 宿主面 | `tsconfig.host.json` | 0 | 0 |
| P6 H8 对照 | `tsconfig.hostcontrol.json` | 非零 | 2 |
| P7 服务增强 | `tsconfig.augment.json` | 0 | 0 |
| P8 DEV-04（能力包不可解析） | `tsconfig.dev04.json` | 0 | 0 |
| P9 DEV-04 对照（cordis 不可解析） | `tsconfig.dev04.control.json` | 非零 | 2 |

## 复现命令

```powershell
# 在 SOLOIPS_ROOT 下执行（符号名解析见 ENV-02）
$p = ".artifacts/operations/r002-adapter-20260916/probe"
foreach ($f in @("tsconfig.positive.json","tsconfig.integrity.json","tsconfig.json",
                 "tsconfig.control.json","tsconfig.host.json","tsconfig.hostcontrol.json",
                 "tsconfig.augment.json","tsconfig.dev04.json","tsconfig.dev04.control.json")) {
  & node_modules/.bin/tsc.CMD -p "$p/$f" ; "exit=$LASTEXITCODE  $f"
}
```

宿主面探针（P5–P9）的 `paths` 用**相对路径**指向 `SOLOIPS_DEVS_ROOT/versions/r001/runtime/node_modules`（`../../../../../soloips-devs/versions/r001/runtime/node_modules`），不含机器绝对路径；若该 runtime 不在该相对位置，需按 ENV-02 重新定位后调整。

**最终一次全量运行（2026-09-16，入库前路径脱敏后复跑）：9/9 符合预期，0 失败。**

仓库既有门禁（本次未改动 `packages/**`，仅确认未被污染）：`pnpm run lint` exit 0、`pnpm run typecheck` exit 0、`pnpm run test` 4 文件 / 8 用例通过。

**入库前脱敏**：本目录已清除机器绝对路径（改写为 ENV-02 符号名或相对路径）、凭据与内网地址；脱敏后 9 个探针已复跑确认结果不变。`tsconfig.dev04*.json` 中指向不存在目录的 `__nonexistent-probe__` 是**刻意**的占位符（P8/P9 的方法本身要求能力包不可解析），非机器路径。

## 附：`consumer.broken.ts` 与两个 `.control.ts` 的用途

| 文件 | 用途 | 是否可提交 |
| --- | --- | --- |
| `consumer.broken.ts` | P2 完整性对照：**故意含 TS2322**，证明 P1 的 exit 0 不是配置未生效 | 仅作探针，**不是产品代码** |
| `consumer-negative.control.ts` | P4：由 `consumer-negative.ts` 机械剥除 `@ts-expect-error` 生成 | 机械产物 |
| `host-surface.control.ts` | P6：把 `ctx.storageDomain` 换成不存在成员，证明 H8 读到的是真实增强 | 机械产物 |

三者均位于 `.artifacts/operations/`（`.gitignore:42` 已忽略），不进入版本控制、不参与 `pnpm run lint`（`.oxlintrc.json` 的 `ignorePatterns` 含 `.artifacts/**`）。
