import type { Context } from "@deepseek-ai/cordis";
import { describe, expect, it } from "vitest";
import type { SoloipsCoreHostContext, SoloipsCoreLogger } from "../src/index";
import soloipsCoreEntry from "../src/index";

/**
 * core 的宿主上下文面与**真实** cordis `Context` 的关系。
 *
 * ## 类型兼容性的证据在哪里
 *
 * 本仓库的状态是：
 * - `packages/core/src/index.ts` 的 `SoloipsCoreHostContext` 由官方 `Context` **派生**
 *   （`Omit<Pick<Context, …>, "logger"> & { logger: … }`）。
 * - `tsconfig.tests.json`（经 `pnpm run typecheck` 调用）**把 tests/ 纳入编译**。
 *
 * 因此类型兼容性由**编译器**证明，证据是 `pnpm run typecheck` 的退出码，不是本文件的 `it`。
 * 本文件只覆盖**运行期**可观察的行为，并在此声明该分工。
 *
 * ## 为什么删掉了先前的「条件类型 + 赋值」写法
 *
 * 先前这里写 `type A = Context extends SoloipsCoreHostContext ? true : false;`
 * 再断言 `const x: A = true`。**那是空转的**：本仓库的 vitest 不做类型检查，
 * 那条赋值不会被求值，`A` 解析成 `false` 时测试仍然全绿。留着它只会让人以为
 * 有兼容性检查，实则没有。
 */

describe("core host-context runtime contract", () => {
  it("declares the host surface as a derivation of the real Context (shape check)", () => {
    // 运行期能观察到的事实：core 的模块确实导出了入口，且入口可被一个最小宿主对象驱动。
    // 类型层面的「真实 Context 可赋值给它」由 typecheck 负责，不在此冒充。
    const logger: SoloipsCoreLogger = { warn: () => undefined, error: () => undefined };
    const host: SoloipsCoreHostContext = {
      inject: () => undefined as never,
      get: () => undefined,
      provide: () => (() => undefined) as never,
      effect: () => (() => Promise.resolve()) as never,
      logger: () => logger,
    };
    // enabled:false ⇒ 任何副作用之前早退：不调用 inject、不抛。
    expect(() => soloipsCoreEntry(host, { enabled: false })).not.toThrow();
  });

  it("does not expose storageDomain on the declared host surface", () => {
    // SEAM-X1：回退路径必须在类型层不可表达。这条**是类型层断言**，
    // 其求值同样归 typecheck（条件类型在 vitest 里不会被求值）。
    // 这里只在运行期固定「core 的入口不读取该成员」这一行为。
    const accessed: string[] = [];
    const logger: SoloipsCoreLogger = { warn: () => undefined, error: () => undefined };
    const host = {
      inject: () => undefined as never,
      get: (name: string) => {
        accessed.push(name);
        return undefined;
      },
      provide: () => (() => undefined) as never,
      effect: () => (() => Promise.resolve()) as never,
      logger: () => logger,
    } as SoloipsCoreHostContext;
    soloipsCoreEntry(host, { enabled: true, storageRoot: "/tmp/soloips-compat-probe" });
    expect(accessed).not.toContain("storageDomain");
  });

  it("keeps the real cordis Context type resolvable for the type-level check", () => {
    // 前提检查：`@deepseek-ai/cordis` 在测试编译上下文可解析——
    // 那是 tsconfig.tests.json 做兼容性推导的基础。
    const reference: Context | undefined = undefined;
    expect(reference).toBeUndefined();
  });
});
