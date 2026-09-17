/**
 * SOLOIPS-TYPERT-ANALYSIS-SHIM
 *
 * Typert 生成器的**分析面协议 shim**：根 `tsconfig.host.json` 的 `paths` 把它
 * 当作 `@deepseek-ai/dsh-typert-protocol` 的类型来源。
 *
 * 只被生成器的分析程序消费；**不**参与构建、不进入 tarball、不被任何 `tsc -b`
 * 项目编译（根 `tsconfig.json` 是纯 references 壳；`tsconfig.tests.json` 只含
 * packages 下的 tests 目录；`packages/web/tsconfig.json` 只含 `src` 下的 ts）。
 *
 * ── 为什么必须有它（**实测**，探针 B2/B3）────────────────────────────────
 *
 * 生成器用 `analyzer.isTypeMetaSymbol` 判定某符号是否为 Typert 的 decorator /
 * 基类，判据是**声明的归属包名**，只有两条成立路径：
 *   a. 声明位于工作区 `packages/` 下名为 `@deepseek-ai/dsh-typert-protocol` 的包内；
 *   b. 声明的祖先链上有 `declare module '@deepseek-ai/dsh-typert-protocol'` 块。
 * 从 node_modules 解析到的已安装包两条都不满足 → `@Remote` 方法不被收集 →
 * 构建以 `typert(host): <pkg> publishes Remote artifacts but has no Remote methods`
 * 失败。本文件走路径 (b)。（移除本文件即可复现该报错。）
 *
 * ── 形态与位置：实测矩阵（BE-0a 补强重测，每格跑 2 次结果一致）─────────────
 *
 * 下表是实测结果（标注〔复现〕= 双方独立复现一致；标注〔未复现〕= QA 复核未能触发，
 * 依赖写手当时的具体变体——**不得据这些格做决策**，改动前请先补最小复现）：
 *
 * | 变体                                                        | 位置            | 结果 |
 * |-------------------------------------------------------------|-----------------|------|
 * | **本文件的形态**（模块内 import 别名 + `class … extends`）    | 仓库根          | OK〔复现〕 |
 * | 同上                                                        | `packages/web/` | OK〔复现〕 |
 * | `const TypertRemoteService: typeof import("…/upstream").X`  | 仓库根          | OK〔复现〕 |
 * | 同上（内联 `import()` 类型查询形态）                          | `packages/web/` | **失败**（QA 复现失败成立，但实际报错为 `TypeError: reading 'filter'`，非 `members is not iterable`〔消息以实测为准〕） |
 * | 顶层 `import type { … } from "…/upstream"` + `declare module` | 仓库根          | OK〔复现〕 |
 * | 顶层 `import { Remote } from "@deepseek-ai/dsh-typert-protocol"`（**自指**）| 仓库根 | 〔未复现：QA 三种自指写法均构建成功〕 |
 *
 * 结论（限定在上述已测范围，不外推）：
 *  - **位置本身不是独立约束**：本文件的形态在包内/包外都通过。失败只出现在
 *    「内联 `import()` 类型查询的 `const` 基类」+「位于 `packages/web/`」的**组合**。
 *    本文件因此保留在仓库根：不是因为它「必须」在根，而是因为根是已复现通过的
 *    配置之一，且不把分析面文件混进 `files` 白名单。
 *  - **顶层 import 不是普遍禁忌**：从 `/upstream` 顶层 import type 后接
 *    `declare module` 是通过的。真正会失败的是**自指**——顶层 import 那个被
 *    `paths` 重定向到本文件自身的裸说明符，形成循环。
 *
 * 〔未验证〕上表未覆盖的组合（如其它基类写法 × 其它位置、`/upstream` 顶层 import
 * 置于 `packages/web/` 内）**未做实验**，不得据本文推断其行为。
 *
 * 〔约束〕本文件**只做派生，不手抄签名**：全部导出经别名绑定到真实包，上游改
 * 签名时这里不会静默漂移——与项目对「手抄宿主签名会引入漂移」的既有纪律一致
 * （见 `packages/core/src/index.ts` 关于 `SoloipsCoreHostContext` 的说明）。
 * 「上游」经 `tsconfig.host.json` 的 `@deepseek-ai/dsh-typert-protocol/upstream`
 * 别名指向已安装的真实包。
 *
 * 〔约束〕只声明 Typert **识别面**的成员。多声明的每个成员都会在分析面上凭空
 * 造出一个真实包并不存在的形状；`export *` 与 `RemoteError` 等三项属该包既有
 * 公开面，一并转发以免分析面缺项。
 */
declare module "@deepseek-ai/dsh-typert-protocol" {
  import {
    Remote as UpstreamRemote,
    RemoteScope as UpstreamRemoteScope,
    TypertRemoteService as UpstreamTypertRemoteService,
    bindTypertRemote as upstreamBindTypertRemote,
  } from "@deepseek-ai/dsh-typert-protocol/upstream";

  export * from "@deepseek-ai/dsh-typert-protocol/upstream";
  export {
    RemoteError,
    remoteErrorOf,
    isTypertRemoteSegment,
  } from "@deepseek-ai/dsh-typert-protocol/upstream";

  /**
   * 具名绑定基类（`class X extends TypertRemoteService`）。
   *
   * 〔约束〕保持 **class 声明 + extends**（上表已复现通过）：生成器的
   * `gatewayServiceBinding` 只从 `extends` 子句识别该基类，且要求
   * `super(ctx, serviceKey)` 的服务键是**字符串字面量**（用常量标识符会被拒：
   * `Gateway service key must be a string literal`——该条由 BE-0a 主切片实测）。
   */
  export abstract class TypertRemoteService extends UpstreamTypertRemoteService {}

  /** 方法装饰器（`@Remote()` / `@Remote("name")` / `@Remote({ mode: "stream" })`）。 */
  export const Remote: typeof UpstreamRemote;

  /** Scope 方法装饰器（跨 face 用；本切片不消费，保留识别面完整性）。 */
  export const RemoteScope: typeof UpstreamRemoteScope;

  /** 字段式绑定（`readonly typertRemote = bindTypertRemote(this, key)`）。 */
  export const bindTypertRemote: typeof upstreamBindTypertRemote;
}
