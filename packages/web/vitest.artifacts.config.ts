import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

import ArtifactSuiteGuard from "./tests/artifacts/artifact-suite-guard.js";

const packageDir = dirname(fileURLToPath(import.meta.url));

/**
 * 产物行为套件（BE-0b-ii / F-03）：**只在 build 之后跑**，且**要求产物存在**。
 *
 * ── 为什么必须与默认套件分开（外审 F-03 的事实）─────────────────────────────
 * CI 的默认 `Test` 步骤跑在 `Build` **之前**（`.github/workflows/verify.yml`），
 * 因此默认套件里的产物断言只能是条件检查（`if (!hasArtifact) return`）。外审
 * 指出这等于「产物行为测试从未在 CI 上真执行」：`check:build-repro` 是
 * 「删产物 → 重建 → 字节比对」，它**不执行** VM / 挂载 / codec 断言；字节可复现
 * 也不等于产物可用。故产物行为用例必须**单独成组**，挂在 build 之后的步骤里。
 *
 * ── include 与默认套件不相交（实测）────────────────────────────────────────
 * 〔约束〕本配置的 include 只匹配 `tests/artifacts/**`，且用例文件用
 * **`.artifact.ts` 后缀**而不是 `.spec.ts`：
 *   - 默认 include（`vitest.config.ts`）是「包目录下递归的 `.spec.ts`」形态，
 *     它会**递归匹配子目录**——实测 `tests/artifacts/x.spec.ts` 会被默认套件捡走
 *     并在 build 之前因缺产物而红；
 *   - 改后缀后默认 include 不再匹配（实测 `*.artifact.ts` 在默认套件下 0 命中），
 *     产物用例因此**只**在本步骤执行。
 * 这是「两套 include 不相交」的机械保证，不依赖目录位置这一条约定。
 *
 * ── root 必须是本文件所在目录（实测）──────────────────────────────────────
 * vitest 的 `include` 相对 **`process.cwd()`** 解析（不是相对 config 文件）。
 * 从仓库根以 `vitest --config packages/web/…` 调用时，cwd 是仓库根，`tests/artifacts/**`
 * 会匹配不到任何文件（实测 `No test files found, exiting with code 1`）。
 * 显式钉 `root` 后，无论从哪个 cwd 调用都解析到包目录。
 *
 * ── 零执行 / 缺产物 / 关键断言被跳过都必须失败（要求 3）───────────────────────
 * 三层，缺一不可：
 *  1. `passWithNoTests: false`：一个文件都没匹配到时失败（vitest 的默认行为，
 *     显式写出以防被上层配置改动）；
 *  2. 每个用例首句 `requireArtifact(...)`：**缺产物即抛**，而不是 `return`；
 *  3. {@link ArtifactSuiteGuard}：运行结束时核对「必需用例真的执行过、没有被
 *     skip/todo、总数不少于下限」，不符即设非 0 退出码。它防的是「用例被删/
 *     被跳过」这类**退出码看不见**的失效。
 */
export default defineConfig({
  // 〔约束〕见上：include 相对 cwd 解析，必须显式钉 root。
  root: packageDir,
  test: {
    // 只跑产物行为用例；后缀与默认套件（`*.spec.ts`）不相交。
    include: ["tests/artifacts/**/*.artifact.ts"],
    environment: "node",
    // 产物用例要在 VM 里跑 170 kB bundle、并 import typert 产物，给足余量。
    testTimeout: 30_000,
    // 零用例必须失败：这正是「目标用例零执行」的兜底（见 specs 内的守卫）。
    passWithNoTests: false,
    // 〔约束〕守卫必须在 reporters 里：`onFinished` 是唯一能看到「本次运行实际
    // 执行了哪些用例」的位置。它只做加法（设置非 0 退出码），不改写失败。
    reporters: ["default", new ArtifactSuiteGuard()],
  },
});
