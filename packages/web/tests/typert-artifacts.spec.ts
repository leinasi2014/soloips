import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgRoot = dirname(fileURLToPath(import.meta.url));
const packageDir = join(pkgRoot, "..");
const repoRoot = join(packageDir, "..", "..");
const libDir = join(packageDir, "lib");

/** tsdown 产出（打包产物 + Typert 生成物）：只有 `build` 阶段会写。 */
const tsdownArtifacts = [
  "index.js",
  "typert.host.js",
  "typert.host.d.ts",
  "typert.remote-client.js",
  "typert.remote-client.d.ts",
];

/** tsc 产出（声明与类型面）：`typecheck` / `build` 都会写。 */
const tscArtifacts = [
  "types/index.d.ts",
  "types/contracts.d.ts",
  "types/index.js",
  "types/contracts.js",
];

/**
 * Typert 生成物契约测试（BE-0a）。
 *
 * ── 与 CI 门禁顺序的关系（刻意设计，不是将就）────────────────────────────
 * CI 的顺序是 format → lint → **typecheck** → **test** → **build** →
 * **check:build-repro**（`.github/workflows/verify.yml`），即 `test` 跑在
 * `build` 之前。因此本测试**不得**要求 tsdown 产物存在——那会让默认套件在
 * CI 上必红。
 *
 * **分工（重要）**：本文件在 CI 上对 tsdown 产物的断言**恒为条件检查**
 * （`lib/` 不存在时直接返回），故它不承担「产物有效性」的验证职责。
 * 该职责由 CI 的 `check:build-repro` 步骤承担：它在 `build` **之后**运行，
 * 做「删产物 → 重跑构建 → 逐文件比对 SHA-256」，并显式失败于产物缺失。
 * 变异测试（BE-0a 补强）证明了这个分工的必要性：只在本文件断言「脚本已接线」
 * 而 CI 不跑该脚本，等于产物有效性在 CI 上**从未被验证**。
 *
 * 本测试因此断言两件在**任何**门禁顺序下都成立的事：
 *  1. tsdown 一旦跑过（`lib/index.js` 在），Typert 四个产物就**必须**齐全
 *     —— 这是「部分生成」这一真实故障模式的检查，非空断言；
 *  2. 可复现性证据**已接线**（脚本存在 + `package.json` 有 script +
 *     CI 两个 job 都真的调用它），使覆盖不会因误删/漏接而静默消失。
 */
describe("soloips-web Typert artifacts", () => {
  const hasTsdownOutput = existsSync(join(libDir, "index.js"));

  it("keeps the reproducibility evidence wired (删产物→重跑→字节一致)", () => {
    // 这条是**非空**断言：删掉脚本或 script 条目即失败，防止覆盖被静默移除。
    const scriptPath = join(repoRoot, "scripts", "development", "check-build-reproducibility.mjs");
    expect(existsSync(scriptPath), "可复现性门禁脚本必须存在").toBe(true);

    const rootManifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(
      rootManifest.scripts?.["check:build-repro"],
      "根 package.json 必须保留 check:build-repro（否则该门禁不会被跑）",
    ).toBe("node scripts/development/check-build-reproducibility.mjs");
  });

  it("runs the reproducibility gate in CI, after build, in both jobs (BE-0a 变异 #3)", () => {
    // 变异测试暴露的盲区：只断言「脚本已接线」而不断言 **CI 真的跑它**，
    // 结果是把该步骤从 workflow 删掉后六门仍全绿——门禁在 CI 上从未执行。
    // 本测试把「CI 接线」也变成断言。
    const workflowPath = join(repoRoot, ".github", "workflows", "verify.yml");
    expect(existsSync(workflowPath), "verify.yml 必须存在").toBe(true);
    const workflow = readFileSync(workflowPath, "utf8");

    // 两个 job（verify / windows）都必须调用。
    const invocations = workflow.split("pnpm run check:build-repro").length - 1;
    expect(invocations, "verify.yml 的两个 job 都应调用 check:build-repro").toBe(2);

    // 逐个 job 断言调用位置在 build 之后。job 头是**恰好两个空格**缩进的
    // `name:` 行。只扫 `jobs:` 块之后的内容——顶层的 `on:` 下也有同缩进的键
    // （`pull_request:` / `push:`），不限定范围会把它们误当 job。
    const jobsAt = workflow.indexOf("\njobs:");
    expect(jobsAt, "verify.yml 应含 jobs 块").toBeGreaterThanOrEqual(0);
    const jobsBlock = workflow.slice(jobsAt);
    const headers = [...jobsBlock.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)].map((match) => ({
      name: match[1],
      at: match.index,
    }));
    expect(
      headers.map((header) => header.name),
      "verify.yml 应恰好含 verify / windows 两个 job",
    ).toEqual(["verify", "windows"]);

    headers.forEach((header, index) => {
      const next = headers[index + 1];
      const section = jobsBlock.slice(header.at, next === undefined ? jobsBlock.length : next.at);
      const buildAt = section.indexOf("pnpm run build");
      const reproAt = section.indexOf("pnpm run check:build-repro");
      expect(buildAt, `${header.name} 应含 build 步骤`).toBeGreaterThanOrEqual(0);
      expect(reproAt, `${header.name} 应含 check:build-repro 步骤`).toBeGreaterThanOrEqual(0);
      expect(reproAt, `${header.name} 的 check:build-repro 必须在 build 之后`).toBeGreaterThan(
        buildAt,
      );
    });
  });

  it("emits all four Typert artifacts whenever tsdown has run (无部分生成)", () => {
    if (!hasTsdownOutput) {
      // tsdown 未跑（CI 的 test 步骤即此情形）。此时**不**断言产物存在，
      // 由 check:build-repro 覆盖；见本文件头注释。
      return;
    }
    const missing = tsdownArtifacts.filter((file) => !existsSync(join(libDir, file)));
    expect(missing, "tsdown 已运行但 Typert 产物不齐（部分生成）").toEqual([]);
  });

  it("emits tsc declarations for the Host entry and the contracts subpath", () => {
    if (!existsSync(join(libDir, "types"))) return;
    const missing = tscArtifacts.filter((file) => !existsSync(join(libDir, file)));
    expect(missing, "tsc 已产出 lib/types 但声明文件不齐").toEqual([]);
  });

  it("carries the getStatus invocation in the Host face model", () => {
    const path = join(libDir, "typert.host.js");
    if (!existsSync(path)) return;
    const host = readFileSync(path, "utf8");
    // 生成器的 Host 产物是 TYPERT 常量：含 package/face 与 invocations 表。
    expect(host).toContain("export const TYPERT");
    expect(host).toContain("'soloips-web'");
    expect(host).toContain("soloipsWeb/getStatus");
  });

  it("emits a mountable Remote contribution for the browser half", () => {
    const path = join(libDir, "typert.remote-client.js");
    if (!existsSync(path)) return;
    const remote = readFileSync(path, "utf8");
    // Client 侧挂载的是 TYPERT_REMOTE（TypertRemoteContribution，含严格 codec）。
    expect(remote).toContain("export const TYPERT_REMOTE");
    expect(remote).toContain("soloipsWeb/getStatus");
  });

  it("generates Remote consumer types from the public ./contracts subpath", () => {
    const path = join(libDir, "typert.remote-client.d.ts");
    if (!existsSync(path)) return;
    const dts = readFileSync(path, "utf8");
    // 生成器用**非根子路径**引用边界类型（analyzer.publicRemoteType 的硬要求）。
    // 若这里变成 '.'，说明边界类型被搬到了包根，exports["./contracts"] 的
    // 存在意义随之消失——本断言把该约束固定在生成物上。
    expect(dts).toContain("from 'soloips-web/contracts'");
    expect(dts).toContain("getStatus");
  });

  it("declares every bare dependency its emitted artifacts import (BE-0a 变异 #6)", () => {
    // 变异测试暴露的盲区：删掉 `zod` 声明后六门全绿。原因是 zod 只被
    // `typert.host.js` / `typert.remote-client.js` import，而当时的
    // delivery-load 入口清单只有包根入口（不 import zod）；补了子路径入口
    // 后**仍然**漏网——pnpm 把 adapter 依赖链里的官方包所依赖的 zod 提升到
    // `node_modules/.pnpm/node_modules/zod`，本地布局掩盖了缺声明。
    //
    // 因此这里用**静态**断言收口：产物里出现的裸说明符必须都在 dependencies
    // 里声明。它与 delivery-load 的 checkDeclaredDependencies 同源，但这一层
    // 在默认测试套件里就能跑（不依赖构建产物是否已生成——产物不在时跳过，
    // 由 delivery-load 在 CI 的 build 之后兜住）。
    const emitted = ["typert.host.js", "typert.remote-client.js", "index.js"];
    const present = emitted.filter((file) => existsSync(join(libDir, file)));
    if (present.length === 0) return;

    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);

    const pattern =
      /(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*['"]([^'"]+)['"]/g;
    const undeclared = new Set<string>();
    for (const file of present) {
      for (const match of readFileSync(join(libDir, file), "utf8").matchAll(pattern)) {
        const specifier = match[1] ?? match[2];
        if (specifier === undefined) continue;
        if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:"))
          continue;
        const parts = specifier.split("/");
        const packageName = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
        if (packageName !== undefined && !declared.has(packageName)) undeclared.add(specifier);
      }
    }
    expect(
      [...undeclared],
      "产物 import 了未在 dependencies 中声明的包（本地可能因提升而碰巧可解析）",
    ).toEqual([]);
  });
});
