/**
 * SOLOIPS-WEB-CONTRACTS
 *
 * `soloips-web` Host 半边的跨边界载荷契约（纯 JSON 类型，无运行时值）。
 *
 * 为什么单独成文件而不是放 `src/index.ts`：Typert 的严格分析要求 Remote 边界
 * 的具名类型必须能从**公开的非根子路径**导出（`analyzer.publicRemoteType`：
 * 根子路径 `"."` 只对白名单包开放）。生成的 `lib/typert.remote-client.d.ts` 因此
 * 会 `import type { … } from 'soloips-web/contracts'`，对应 `package.json` 的
 * `exports["./contracts"]`。
 *
 * 不变量：
 *  - 本文件不 import 任何 `@deepseek-ai/*` 包，也不 import `soloips-core`：
 *    边界载荷是**本包自有的 Host 面**，业务命令载荷（`soloips-core/contracts`）
 *    由 BE-6 在引入 `soloipsCore` 服务时按同一形态加入。
 *  - 所有类型均为纯 JSON 值：不携带 domain handle、路径或凭据。
 *  - Remote 方法的参数必须是**具名必填单对象**且**显式标注类型**
 *    （Typert 严格分析：不得解构、不得默认值、不得可选、不得泛型方法）。
 */

/** `getStatus` 的入参：一个具名必填对象（Typert 严格分析要求）。 */
export interface SoloipsWebStatusInput {
  /** 调用方备注，原样回显；用于在 BE-0b 的浏览器侧确认往返载荷未被改写。 */
  readonly note: string;
}

/**
 * `getStatus` 的结果。
 *
 * 〔边界声明〕本切片（BE-0a）只交付**工具链与生成物**，不接业务命令：
 * 返回的是 Host 半边自身的构建信息，**不**代表 `soloipsCore` 已就绪、
 * 也不代表任何公司/部门/员工数据可读。业务方法由 BE-6 加入。
 */
export interface SoloipsWebStatus {
  /** Host 半边的服务键（`soloipsWeb`）。 */
  readonly service: string;
  /** 入参回显，证明载荷往返未被改写。 */
  readonly echo: string;
  /** 本切片固定的工具链标识；BE-6 接入业务面时替换为真实就绪信息。 */
  readonly toolchain: string;
}
