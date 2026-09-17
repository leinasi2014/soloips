import type { Context } from "@deepseek-ai/cordis";
import type { SoloipsCoreHostContext } from "../src/index";

/**
 * **编译期**兼容性断言：真实 `Context` 可赋给 core 所要求的宿主类型。
 *
 * 为什么单独放一个非 spec 文件、且不加运行时断言：本仓库的 vitest **不做类型检查**，
 * 把条件类型写在 `.spec.ts` 的 `it` 里是空转的（实测：必然为 false 的条件类型赋 true
 * 照样通过）。而 tsconfig.tests.json 把各包的 tests 目录纳入编译，
 * 所以放在这里的类型断言**由 `pnpm run typecheck` 求值**——证据是那条命令的退出码。
 *
 * 断言的形状：`Assert<T extends true>` 只接受字面量 `true`。若兼容性不再成立，
 * 条件类型解析为 `false`，此处编译失败。
 */
type Assert<T extends true> = T;

/**
 * 方向：`Context extends SoloipsCoreHostContext`。
 *
 * 这正是运行时要成立的方向——宿主把真实 `Context` 交给 core 的入口。
 * core 对 `logger` 做了收窄（只要求按名取回后能 `warn`/`error`）；该收窄是否仍兼容
 * 由编译器裁定，而不是由 `ReturnType` 派生「看起来对」来推断。
 */
export type SoloipsCoreHostContextCompatibility = Assert<
  Context extends SoloipsCoreHostContext ? true : false
>;

/**
 * 负向边界：core 不得依赖 `storageDomain` 回退（SEAM-X1）。
 * 该成员必须**不在**派生类型上——存在即是缺陷，故断言为 false 才通过。
 */
export type SoloipsCoreHostContextHasNoStorageDomain = Assert<
  "storageDomain" extends keyof SoloipsCoreHostContext ? false : true
>;
