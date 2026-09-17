import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgRoot = dirname(fileURLToPath(import.meta.url));

/**
 * 装配层契约测试（SOLO-C03/C05）：
 * bundle 只做装配声明，必须携带 dsh.bundle.patch 且不含运行时代码。
 */
describe("soloips-bundle assembly contract", () => {
  const manifest = JSON.parse(readFileSync(join(pkgRoot, "..", "package.json"), "utf8")) as {
    name: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    dsh?: { bundle?: { patch?: string } };
  };

  it("declares the dsh.bundle.patch entry", () => {
    expect(manifest.name).toBe("soloips-bundle");
    expect(manifest.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
  });

  it("carries no runtime dependencies (装配层不含运行时代码)", () => {
    expect(Object.keys(manifest.dependencies ?? {})).toHaveLength(0);
    expect(Object.keys(manifest.devDependencies ?? {})).toHaveLength(0);
  });
});
