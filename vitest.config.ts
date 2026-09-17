import { defineConfig } from "vitest/config";

// 默认测试为确定性本地单元与契约测试，不访问真实外部服务（DEV-02）。
// 需要真实 Host / 多进程的验收在切片内增加独立入口，不混入默认套件。
export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.spec.ts"],
    environment: "node",
    testTimeout: 10_000,
    passWithNoTests: false,
  },
});
