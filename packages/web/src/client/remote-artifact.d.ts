/**
 * SOLOIPS-WEB-CLIENT-REMOTE-TYPEFACE
 *
 * 生成物 `soloips-web/remote` 的**类型面环境声明**，只供浏览器半边的 tsc 工程
 * （`packages/web/tsconfig.client.json`）解析导入用。
 *
 * ── 为什么需要它（构建顺序事实，不是风格选择）──────────────────────────────
 * 根 `package.json` 的构建顺序是 `tsc -b && tsdown`：
 *  1. `tsc -b` 先跑，此时 `lib/typert.remote-client.d.ts` **尚不存在**——
 *     它是第 2 步 tsdown 里 Typert 生成器写出的产物；
 *  2. `tsdown` 后跑，其中浏览器 bundle 以**运行时值**导入 `soloips-web/remote`
 *     （`exports["./remote"]` → `lib/typert.remote-client.js`，由本配置的
 *     `materialize-host-artifacts` 先行物化）。
 * 于是 tsc 阶段解析 `soloips-web/remote` 必然落空（TS2307），冷构建（删 `lib`
 * 重建）无法通过。本文件用**环境模块声明**补上类型面。
 *
 * ── 为什么是环境模块声明，而不是 tsconfig `paths` 替身文件（实测）──────────
 * 曾用 `paths: { "soloips-web/remote": ["./src/client/remote-artifact.d.ts"] }`
 * 指向一个替身模块文件，结果是 **rolldown 也读该 `paths`**：
 *  - tsdown 的 `tsconfig: false` 在传给 rolldown 时被 `tsconfig || void 0` 折成
 *    `undefined`（`tsdown/dist/build-BxT2lm9L.mjs:563`），rolldown 于是**自动探测**
 *    包内 tsconfig 并应用其 `paths`；
 *  - 入口若为 `.ts` 源码，解析器还会优先 `types` 条件——两条路都指向 `.d.ts`，
 *    构建以 `MISSING_EXPORT: "TYPERT_REMOTE" is not exported by …` 失败。
 * 环境模块声明**不进入解析器的路径映射**：tsc 靠它解析类型，rolldown 仍按
 * package.json 的 `exports` 解析到真实运行时产物。两侧因此各取所需，不再互相污染。
 *
 * ── 不变量与风险边界 ──────────────────────────────────────────────────────
 *  - 本文件**不得**出现顶层 `import`/`export`：那会把它变成模块，`declare module`
 *    随之降级为**模块增强**而非环境声明，导入将解析不到任何东西。故类型经内联
 *    `import()` 查询引用（见下）。
 *  - 只声明**符号名与最小类型**，刻意不复制生成物里的 namespace 合并
 *    （`TypertRemoteNamespaceMap` 等）：手抄一份必然漂移，而且本切片（BE-0b-i）
 *    的浏览器半边只做挂载，不需要按 namespace 调方法。BE-6 要写
 *    `ctx.remote.soloipsWeb.<method>` 时，必须改为消费**真实生成物**的声明
 *    （即把类型解析改回 `exports["./remote"]`，通常意味着把构建拆成
 *    host/client 两阶段）——**不要**在本文件里补 namespace 合并。
 *  - 符号名漂移由测试拦下：`packages/web/tests/client-mount.spec.ts` 断言生成物
 *    里存在同名导出（生成物在时逐条比对，不在时跳过——与 `typert-artifacts.spec.ts`
 *    的既有分工一致）。
 */

declare module "soloips-web/remote" {
  /** 生成物 `lib/typert.remote-client.js` 的具名导出。 */
  export const TYPERT_REMOTE: import("@deepseek-ai/dsh-typert-protocol").TypertRemoteContribution;

  /** 同一贡献的默认导出（生成物两个导出指向同一对象）。 */
  export default TYPERT_REMOTE;
}
