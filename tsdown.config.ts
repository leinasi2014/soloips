import { defineConfig } from "tsdown";

import { typertPlugin } from "@deepseek-ai/dsh-typert-generator/tsdown";

/**
 * SOLOIPS-BUILD-TSDOWN
 *
 * 客户端构建管线：把各包 `lib/types` 的 tsc 产物打成 `lib/` 的 ESM 包，
 * 并由 Typert 插件生成 `lib/typert.host.*` 与 `lib/typert.remote-client.*`。
 *
 * 为什么必须是**根**配置（而不是各包一个）：
 * 生成器的 workspace 模式在**工作区根**读 `tsconfig.host.json` 与
 * `tsconfig.client.json`（`analyzer.ts` 的 `hostConfig`/`clientConfig` 缺省值），
 * 并用 workspaceRoot 向上找 `tsconfig.host.json` 定根
 * （`tsdown-plugin.ts:workspaceRoot`）。故根配置是**必需**的，不是风格选择。
 *
 * 构建顺序契约：`tsc -b`（产 `lib/types`）→ `tsdown`（产 `lib/*.js` 与 Typert 产物）。
 * 顺序不可交换：生成器消费的是 tsc 产物
 * （`tsdown-plugin.ts` 的 `TSC_VERIFIED_INPUT = { checkDiagnostics: false }`）。
 * 两者由根 `package.json` 的 `build` 脚本串起来。
 *
 * `entry` 用 `lib/types/index.js`：`sourcePathForExport` 把包的 exports 目标
 * 反推回 `src/` 去读源码，`lib/types/**` 是该反推可识别的唯一形状。
 *
 * 本切片只构建 host face（`faces: ["host"]`）。client face 需要
 * `tsconfig.client.json` 与浏览器半边（`src/client/**`），属 BE-0b。
 */
export default defineConfig({
  workspace: ["packages/web"],
  entry: ["lib/types/index.js"],
  outDir: "lib",
  format: ["esm"],
  platform: "node",
  target: "es2023",
  // 与 tsc 的 `.js` 输出保持同名（不追加 `.mjs`），否则 exports 指向落空。
  fixedExtension: false,
  // dts 由 tsc 产（lib/types），tsdown 不重复产，避免两份声明互相覆盖。
  dts: false,
  // 不清理：`lib/types` 是 tsc 的产物目录，clean 会把它们一起删掉。
  clean: false,
  plugins: [typertPlugin({ mode: "workspace", faces: ["host"] })],
});
