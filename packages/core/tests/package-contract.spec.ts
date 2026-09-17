import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgRoot = dirname(fileURLToPath(import.meta.url));

/**
 * 骨架契约测试：断言本包的包边界声明成立。
 *
 * 这是对「包边界」这一真实行为的检查，不是填充门禁：
 * 它会在包名、ESM 形态或 exports 声明被改错时失败。
 */
describe("soloips-core package contract", () => {
  const manifest = JSON.parse(readFileSync(join(pkgRoot, "..", "package.json"), "utf8")) as {
    name: string;
    type: string;
    private: boolean;
    exports: Record<string, unknown>;
    dependencies?: Record<string, string>;
  };

  it("uses the agreed package name and ESM form", () => {
    expect(manifest.name).toBe("soloips-core");
    expect(manifest.type).toBe("module");
    expect(manifest.private).toBe(true);
  });

  it("declares a public entry in exports (DEV-04: 跨包只能经公开 exports)", () => {
    expect(Object.keys(manifest.exports)).toContain(".");
  });

  it("公开浏览器安全的 ./contracts 类型入口（contracts-design §7.3：core 拥有自己的服务契约）", () => {
    const contracts = manifest.exports["./contracts"] as { types?: string; default?: string };
    expect(contracts.types).toBe("./lib/contracts.d.ts");
    expect(contracts.default).toBe("./lib/contracts.js");
  });

  it("依赖声明收敛：adapter 经包名、宿主 ABI 只有 cordis（DEV-04）", () => {
    expect(manifest.dependencies).toMatchObject({
      "soloips-adapter-dsh": "workspace:*",
      "@deepseek-ai/cordis": "4.0.2",
    });
  });
});
