import { defineConfig } from "vitest/config";

// 默认测试为确定性本地单元与契约测试，不访问真实外部服务（DEV-02）。
// 需要真实 Host / 多进程的验收在切片内增加独立入口，不混入默认套件。
export default defineConfig({
  // 〔FE-1a〕JSX 的**自动运行时**：`packages/web/src/client/company/*.tsx` 用
  // `react-jsx`（与 `packages/web/tsconfig.client.json` 的 `jsx` 同值、也与 fork 的
  // `tsconfig.base.client.json` 同值）。Vite/esbuild **不读 tsconfig 的 `jsx`**——
  // 它按自己的 `esbuild.jsx` 选项决定，默认是 `transform`（经典运行时，注入
  // `React.createElement`），于是 `.tsx` 模块里没有 `React` 绑定时报
  // `ReferenceError: React is not defined`（实测：14 条渲染用例全红）。
  // 显式声明 `automatic` 使测试面与构建面的 JSX 语义一致——不一致会让
  // 「测试绿而产物红」（或反之）成为可能。
  esbuild: { jsx: "automatic" },
  test: {
    include: ["packages/*/tests/**/*.spec.ts"],
    environment: "node",
    testTimeout: 10_000,
    passWithNoTests: false,
  },
});
