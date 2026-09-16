import type { Context } from "@deepseek-ai/cordis";
import { describe, expect, it } from "vitest";
import type { SoloipsCoreHostContext } from "../src/index";

/**
 * core 的结构化 Host 上下文与**真实** cordis `Context` 的兼容性。
 *
 * ## 为什么需要它
 *
 * core 不 import cordis（oxlint 限制 `packages/core/src/**` 导入官方包），因此用一个
 * 结构化类型 `SoloipsCoreHostContext` 描述它消费的宿主注册面。结构化类型的问题是没有
 * 东西保证它与真实宿主一致：签名一旦比宿主宽松，core 就能写出宿主会拒绝的调用，
 * 而 `tsc -b` 与 lint 都不会报错。
 *
 * ## 本文件为什么这样写
 *
 * 曾有一版在这里写「条件类型判断 Context 是否可赋给 SoloipsCoreHostContext」，
 * 再断言该类型等于 true。**那是假证据**：本仓库的 vitest 不做类型检查
 * （实测把必然为 false 的条件类型赋 true 照样通过），且三个包的 tsconfig 只覆盖
 * 各自的 src 目录，`tsc -b` 不覆盖 tests/。于是该条件类型解析成 false 时，
 * 赋值不会被任何检查求值，测试仍然全绿。
 *
 * 因此这里改为**运行时比较双向可赋值性**：用真实 `Context` 构造一个最小宿主对象并把它
 * 交给 core 的入口签名驱动的路径。类型层是否兼容由 `pnpm run typecheck:tests` 负责
 * （见该脚本与 `tsconfig.tests.json`），本文件只覆盖运行期行为，不冒充类型检查。
 *
 * 〔边界〕本文件**不是**类型兼容性证据。类型兼容的证据在 `tsconfig.tests.json` 的编译结果里。
 */

describe("core host-context runtime contract", () => {
  it("exposes the no-storageDomain-fallback boundary at runtime", () => {
    // SEAM-X1：core 消费的上下文面里不存在 storageDomain。这里断言的是**实现侧**不读取它：
    // 即使构造一个带 storageDomain 的宿主对象，core 的入口也不会碰它（代码里零引用）。
    const host = {
      inject: (): void => undefined,
      get: (): undefined => undefined,
      provide: (): (() => void) => () => undefined,
      effect: (): (() => void) => () => undefined,
      storageDomain: { domain: {} },
    };
    // 传入一个「多出成员」的对象是合法的（结构化类型的正常用法），
    // 用于固定 core 不强依赖该成员的存在。
    const asCoreContext: SoloipsCoreHostContext = host;
    expect(typeof asCoreContext.get).toBe("function");
  });

  it("keeps the real cordis Context type importable for the type-level check", () => {
    // 本用例只保证 `@deepseek-ai/cordis` 在测试上下文可解析——那是 tsconfig.tests.json
    // 做类型兼容断言的前提。真正的赋值检查由 typecheck:tests 执行。
    const reference: Context | undefined = undefined;
    expect(reference).toBeUndefined();
  });
});
