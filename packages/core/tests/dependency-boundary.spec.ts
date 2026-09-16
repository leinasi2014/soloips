import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * DEV-04 依赖边界的回归测试。
 *
 * 为什么需要它：根 `.oxlintrc.json` 曾对除 adapter 外的所有包一律禁止
 * `@deepseek-ai/*`，把 DEV-04 明确允许的公开插件注册接口、Client API 与 core
 * 安全契约一并拦下；而收窄规则时又会引入「过度放行」的风险。两个方向都不会被
 * 常规检查发现，所以这里对正反例都实际运行断言。
 *
 * 测试的是**真实配置**：把仓库根的 `.oxlintrc.json` 原样复制到临时目录，使其
 * 中相对配置文件解析的 `packages` 源码覆盖项落在本测试构造的 fixture 上。
 * 不转录规则内容，避免「测试副本通过、真实配置已漂移」的假证据。
 *
 * 检查层分工（测试同时固定这一点，避免拿错层的结果冒充另一层）：
 * - oxlint 覆盖**模块说明符**层次：包名、子路径、深层路径、`node:*`。
 * - 相对路径逃逸到其他包源码由 `tsc -b` 的 `rootDir`/项目边界拒绝（TS6059/TS6307），
 *   见下方 `relative source escape` 用例。lint 规则无法在无假阳性的前提下表达它。
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const oxlintMain = join(repoRoot, "node_modules", "oxlint", "bin", "oxlint");
const tscMain = join(repoRoot, "node_modules", "typescript", "bin", "tsc");

interface Fixture {
  source: string;
  /** 期望被本规则拒绝的条数；0 表示应放行。 */
  violations: number;
  reason: string;
}

const fixtures: Record<string, Fixture> = {
  // ---- 放行：官方公开插件注册接口（cordis 类型与 Context） ----
  "packages/core/src/allow-registration.ts": {
    violations: 0,
    reason: "core 的宿主依赖面含 @deepseek-ai/cordis（公开注册接口及类型）",
    source: `import type { Context } from "@deepseek-ai/cordis";
export type A = Context;
`,
  },
  // ---- 放行：Web Client 用官方公开 Client API + core 浏览器安全契约 ----
  "packages/web/src/client/allow-client-api.ts": {
    violations: 0,
    reason: "Client 可用 dsh-client-*/dsh-api-* 公开 API 与 core 的 ./contracts",
    source: `import type { Context } from "@deepseek-ai/cordis";
import type { A } from "@deepseek-ai/dsh-client-ui-chat";
import type { B } from "@deepseek-ai/dsh-api-remotes";
import type { Rule } from "soloips-core/contracts";
export type C = [Context, A, B, Rule];
`,
  },
  // ---- 放行：web Host 经 core 公开 exports 依赖 ----
  "packages/web/src/allow-host-core.ts": {
    violations: 0,
    reason: "web Host → core 的公开 exports 是允许方向",
    source: `import type { Command } from "soloips-core";
export type A = Command;
`,
  },
  // ---- 放行：core 经 adapter 的类型专用公开入口 ----
  "packages/core/src/allow-adapter-contracts.ts": {
    violations: 0,
    reason: "core 可经 adapter 的 ./contracts（类型／常量）依赖，不取 handle",
    source: `import type { Port } from "soloips-adapter-dsh/contracts";
export type A = Port;
`,
  },
  // ---- 放行：adapter 直接依赖 DSH 能力包（它是收敛层） ----
  "packages/adapter-dsh/src/allow-capability.ts": {
    violations: 0,
    reason: "adapter 是唯一可依赖 @deepseek-ai/* 能力包的包",
    source: `import type { Storage } from "@deepseek-ai/dsh-storage";
export type A = Storage;
`,
  },
  // ---- 拒绝：core 直接依赖 DSH 执行能力包 ----
  "packages/core/src/deny-capability.ts": {
    violations: 1,
    reason: "core 不得直接 import DSH 能力包，须由 adapter 收敛",
    source: `import type { A } from "@deepseek-ai/dsh-storage";
export type B = A;
`,
  },
  // ---- 拒绝：core 经包名 import 自身 ----
  "packages/core/src/deny-self-name.ts": {
    violations: 1,
    reason: "core 不得经包名解析到自身构建产物",
    source: `import type { A } from "soloips-core";
export type B = A;
`,
  },
  // ---- 拒绝：core 经自身 ./contracts 子路径 import（自己的契约用相对路径，不走包名） ----
  "packages/core/src/deny-self-contracts.ts": {
    violations: 1,
    reason: "core 不得经包名子路径引自身；包内应用相对路径",
    source: `import type { A } from "soloips-core/contracts";
export type B = A;
`,
  },
  // ---- 拒绝：裸 `src` 入口（`/src/**` 要求 src 后至少一段，拦不到裸的 `/src`） ----
  "packages/adapter-dsh/src/deny-bare-src.ts": {
    violations: 2,
    reason: "`.../src` 与 `.../src/deep/x.ts` 都必须按源码路径拒绝",
    source: `import type { A } from "@deepseek-ai/dsh-storage/src";
import type { B } from "@deepseek-ai/dsh-subagent/src/deep/x.ts";
export type C = [A, B];
`,
  },
  // ---- 拒绝：经 `..` 遍历穿越白名单（例外的 `**` 会吃掉 `..` 段） ----
  "packages/web/src/client/deny-traversal.ts": {
    violations: 1,
    reason: "Client 的 dsh-client-* 例外不得被 `..` 穿越到 Host 包",
    source: `import type { A } from "@deepseek-ai/dsh-client-ui-chat/../../dsh-storage";
export type B = A;
`,
  },
  // ---- 拒绝：Client 引入**裸** Node 内建（`node:*` 前缀形式拦不到裸名） ----
  "packages/web/src/client/deny-bare-node.ts": {
    violations: 3,
    reason: "裸 Node 内建模块同样不得进入浏览器端",
    source: `import { readFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
export const a = [readFileSync, join, spawn];
`,
  },
  // ---- 拒绝：core 取 adapter 的 Host 实现入口 ----
  "packages/core/src/deny-adapter-host-entry.ts": {
    violations: 1,
    reason: "core 只能经 adapter 的 ./contracts，不得取持 handle 的 Host 入口",
    source: `import type { A } from "soloips-adapter-dsh";
export type B = A;
`,
  },
  // ---- 拒绝：官方包的深层/私有路径（含 dsh-subagent/internal） ----
  "packages/adapter-dsh/src/deny-deep-path.ts": {
    violations: 2,
    reason: "adapter 可依赖能力包，但不得走 ./src/* 与 ./internal",
    source: `import type { A } from "@deepseek-ai/dsh-subagent/src/x.ts";
import type { B } from "@deepseek-ai/dsh-subagent/internal";
export type C = [A, B];
`,
  },
  // ---- 拒绝：**多段**子路径。`@deepseek-ai/*` 只匹配一个路径段，
  //      漏掉这组会让「收窄规则」在子路径层面退化成事实上的全局放行。 ----
  "packages/adapter-dsh/src/deny-subpath.ts": {
    violations: 2,
    reason: "能力包的公开子路径仍受 export 约束之外的深层路径禁令",
    source: `import type { A } from "@deepseek-ai/dsh-subagent/src/deep/x.ts";
import type { B } from "@deepseek-ai/dsh-subagent/internal/nested";
export type C = [A, B];
`,
  },
  // ---- 拒绝：core 取能力包的**子路径** ----
  "packages/core/src/deny-capability-subpath.ts": {
    violations: 1,
    reason: "core 连能力包的公开子路径也不得引入，只允许 cordis",
    source: `import type { A } from "@deepseek-ai/dsh-storage/provider";
export type B = A;
`,
  },
  // ---- 拒绝：core 经自身构建产物路径 import ----
  "packages/core/src/deny-self-build-output.ts": {
    violations: 1,
    reason: "经包名子路径引用自身会解析到构建产物",
    source: `import type { A } from "soloips-core/lib/index.js";
export type B = A;
`,
  },
  // ---- 拒绝：core 反向依赖界面层 ----
  "packages/core/src/deny-reverse-dependency.ts": {
    violations: 1,
    reason: "core 不得依赖 web（DEV-04：同步编译依赖不得成环）",
    source: `import type { A } from "soloips-web/build/x.js";
export type B = A;
`,
  },
  // ---- 拒绝：Client 取 Host 能力包的子路径 ----
  "packages/web/src/client/deny-host-capability-subpath.ts": {
    violations: 1,
    reason: "Client 不得经子路径绕过而引入 Host 能力包",
    source: `import type { A } from "@deepseek-ai/dsh-storage/provider";
export type B = A;
`,
  },
  // ---- 拒绝：Client 引入 Node 子路径（node:* 只匹配一段，须并列 node:*/*） ----
  "packages/web/src/client/deny-node-subpath.ts": {
    violations: 1,
    reason: "node:fs/promises 是最常见的 Node 形态，必须一并拒绝",
    source: `import { readFile } from "node:fs/promises";
export const a = readFile;
`,
  },
  // ---- 拒绝：Client 经 core 构建产物路径取 Host 实现 ----
  "packages/web/src/client/deny-core-build-output.ts": {
    violations: 1,
    reason: "Client 只能消费 core 的 ./contracts",
    source: `import type { A } from "soloips-core/lib/host.js";
export type B = A;
`,
  },
  // ---- 拒绝：Client 取 adapter 的实现路径 ----
  "packages/web/src/client/deny-adapter-impl.ts": {
    violations: 1,
    reason: "Client 不得依赖 adapter 的 Host 执行层",
    source: `import type { A } from "soloips-adapter-dsh/lib/impl.js";
export type B = A;
`,
  },
  // ---- 拒绝：adapter 经 core 构建产物路径反向依赖 ----
  "packages/adapter-dsh/src/deny-core-build-output.ts": {
    violations: 1,
    reason: "adapter 不得 import core 的构建产物",
    source: `import type { A } from "soloips-core/lib/x.js";
export type B = A;
`,
  },
  // ---- 拒绝：bundle 取官方包子路径 ----
  "packages/bundle/src/deny-capability-subpath.ts": {
    violations: 1,
    reason: "bundle 不含运行时代码，不得 import 官方包（含子路径）",
    source: `import type { A } from "@deepseek-ai/dsh-storage/sub";
export type B = A;
`,
  },
  // ---- 拒绝：默认拒绝兜底——未声明依赖面的包（含尚未创建的 packages/tools-pv） ----
  "packages/tools-pv/src/deny-undeclared-package.ts": {
    violations: 1,
    reason: "未在配置中声明依赖面的包由「默认拒绝」覆盖，不能无声放行",
    source: `import type { A } from "@deepseek-ai/dsh-storage";
export type B = A;
`,
  },
  // ---- 拒绝：相对路径逃逸到邻包的**构建产物**（lint 层必须拦截；
  //      逃逸到邻包源码由 tsc 的 rootDir 边界拒绝，见下方 tsc 用例） ----
  "packages/core/src/deny-relative-build-output.ts": {
    violations: 1,
    reason: "不得经相对路径引用邻包构建产物（DEV-04 禁止跨包相对路径）",
    source: `import type { A } from "../../adapter-dsh/lib/index.js";
export type B = A;
`,
  },
  // ---- 拒绝：Client → core 的 Host 实现 ----
  "packages/web/src/client/deny-host-impl.ts": {
    violations: 1,
    reason: "Client 只能消费 core 的 ./contracts，不得引入 Host 实现",
    source: `import type { A } from "soloips-core";
export type B = A;
`,
  },
  // ---- 拒绝：Client → DSH Host 能力包 ----
  "packages/web/src/client/deny-host-capability.ts": {
    violations: 1,
    reason: "Client 不得引入 DSH Host 能力包",
    source: `import type { A } from "@deepseek-ai/dsh-storage";
export type B = A;
`,
  },
  // ---- 拒绝：Client → Node 专用模块 ----
  "packages/web/src/client/deny-node-builtin.ts": {
    violations: 1,
    reason: "Client 在浏览器运行，不得引入 node:* 模块",
    source: `import { readFileSync } from "node:fs";
export const a = readFileSync;
`,
  },
  // ---- 拒绝：Client → adapter（持凭据与存储 handle） ----
  "packages/web/src/client/deny-adapter.ts": {
    violations: 1,
    reason: "Client 不得依赖 adapter 的 Host 执行层",
    source: `import type { A } from "soloips-adapter-dsh/contracts";
export type B = A;
`,
  },
  // ---- 拒绝：adapter 反向 import core（成环） ----
  "packages/adapter-dsh/src/deny-import-core.ts": {
    violations: 1,
    reason: "契约由 core 自己拥有，adapter 反向 import core 会成环",
    source: `import type { A } from "soloips-core/contracts";
export type B = A;
`,
  },
  // ---- 拒绝：bundle 含运行时 import ----
  "packages/bundle/src/deny-runtime-import.ts": {
    violations: 1,
    reason: "bundle 只承载装配声明，不含运行时代码",
    source: `import type { A } from "@deepseek-ai/cordis";
export type B = A;
`,
  },
  // ---- 拒绝：web Host 引入官方 Client API（该 API 只属 Client 侧） ----
  "packages/web/src/deny-client-api-in-host.ts": {
    violations: 1,
    reason: "官方 Client API 只允许出现在 packages/web/src/client/ 下",
    source: `import type { A } from "@deepseek-ai/dsh-client-ui-chat";
export type B = A;
`,
  },
};

let workDir: string;

/**
 * 解析 oxlint 输出为「文件 → 违规条数」。
 *
 * 用 `--format=json` 而不是解析默认的彩色诊断块：默认版的排版（分隔符、
 * 换行、是否绝对路径）随平台与终端能力变化，曾经在本机 Windows 通过、
 * 在 Linux CI 上解析出 0 条诊断，从而把整套断言变成假通过/假失败。
 * 结构化输出的字段与平台无关。
 */
function runOxlint(target: string[] = ["packages"]) {
  const result = spawnSync(
    process.execPath,
    [oxlintMain, "--config", join(workDir, ".oxlintrc.json"), "--format=json", ...target],
    { cwd: workDir, encoding: "utf8" },
  );
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const byFile = new Map<string, number>();
  let parsed: { diagnostics?: { filename?: string; code?: string; message?: string }[] } | null =
    null;
  try {
    parsed = JSON.parse(stdout) as typeof parsed;
  } catch {
    parsed = null;
  }
  if (parsed?.diagnostics) {
    for (const diagnostic of parsed.diagnostics) {
      if (!diagnostic.filename) continue;
      // `filename` 可能是相对 cwd（即 workDir）的路径，也可能是绝对路径（平台相关）。
      // 直接对相对路径调用 path.relative(dir, p) 会先按 process.cwd() 解析出错误结果，
      // 所以先判断再折算；再去掉可能的 "./" 前缀，使键与 fixture 的写法一致。
      const normalized = (
        isAbsolute(diagnostic.filename)
          ? relative(workDir, diagnostic.filename).replace(/\\/g, "/")
          : diagnostic.filename.replace(/\\/g, "/")
      ).replace(/^\.\//, "");
      byFile.set(normalized, (byFile.get(normalized) ?? 0) + 1);
    }
  }
  return { byFile, status: result.status, output: `${stdout}${stderr}`, parsed };
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "soloips-lintboundary-"));
  // 原样复制真实配置。覆盖项的 glob 相对配置文件解析，故 fixture 必须按 packages/ 布局落位。
  writeFileSync(join(workDir, ".oxlintrc.json"), readFileSync(join(repoRoot, ".oxlintrc.json")));
  // 配置启用了 type-aware lint，oxlint 需从 cwd 解析 oxlint-tsgolint。用 junction 复用
  // 仓库依赖，而不是复制配置或关掉真实选项。
  symlinkSync(join(repoRoot, "node_modules"), join(workDir, "node_modules"), "junction");
  for (const [file, fixture] of Object.entries(fixtures)) {
    const target = join(workDir, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, fixture.source);
  }
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("DEV-04 dependency boundary (real .oxlintrc.json)", () => {
  it("actually applies the rule (so the fixtures below cannot pass vacuously)", () => {
    const { byFile, parsed } = runOxlint();
    // 必须能从结构化输出里读到诊断，且这些诊断确实来自依赖边界规则本身。
    expect(parsed, "oxlint 应输出可解析的 JSON").not.toBeNull();
    const codes = new Set((parsed?.diagnostics ?? []).map((d) => d.code ?? ""));
    expect([...codes]).toContain("eslint(no-restricted-imports)");
    expect(byFile.size).toBeGreaterThan(0);
  });

  it("keeps one patterns object per override (whitelist suppression footgun)", () => {
    // 实测（oxlint 1.83）：`patterns` 数组中只要有一个对象产生白名单（`!`）命中，
    // 就会**抑制其他对象已累积的诊断**。把「宽禁令」与「! 例外」拆成两个对象，
    // 会让深层路径禁令等约束被静默解除——配置看着更清晰，实际更松。
    // 因此每个覆盖项必须只用一个 patterns 对象，例外与禁令同组排序。
    // 配置是 JSONC（含整行 `//` 注释）；oxlint 能直接读，JSON.parse 不能。
    const raw = readFileSync(join(repoRoot, ".oxlintrc.json"), "utf8");
    const config = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")) as {
      overrides: { files?: string[]; rules?: Record<string, unknown> }[];
    };
    const offenders: string[] = [];
    for (const override of config.overrides) {
      const restricted = override.rules?.["no-restricted-imports"];
      if (!Array.isArray(restricted)) continue;
      const patterns = (restricted[1] as { patterns?: unknown[] } | undefined)?.patterns;
      if (Array.isArray(patterns) && patterns.length > 1) {
        offenders.push(`${(override.files ?? []).join(",")}: ${patterns.length} patterns objects`);
      }
    }
    expect(
      offenders,
      `这些覆盖项的 no-restricted-imports 用了多个 patterns 对象，白名单会抑制其他对象的禁令：\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("scopes the core ./contracts exemption to the consuming package and exact subpath", () => {
    // `soloips-core/contracts` 是**消费方**（web Client）可用的浏览器安全契约入口，
    // 但它对 **core 自己**不是合法依赖——core 引用自身应走相对路径。
    // 本测试分别固定这两种策略，并固定「豁免不放宽成前缀放行」。
    const expectations: [string, string, boolean][] = [
      // [file, specifier, allowed]
      ["packages/core/src/exempt.ts", "soloips-core", false],
      ["packages/core/src/exempt.ts", "soloips-core/contracts", false],
      ["packages/core/src/exempt.ts", "soloips-core/lib/index.js", false],
      ["packages/core/src/exempt.ts", "soloips-core/contracts/x", false],
      ["packages/web/src/client/exempt.ts", "soloips-core/contracts", true],
      ["packages/web/src/client/exempt.ts", "soloips-core/contracts/x", false],
      ["packages/web/src/client/exempt.ts", "soloips-core", false],
      ["packages/web/src/client/exempt.ts", "soloips-core/lib/host.js", false],
    ];
    const wrong: string[] = [];
    for (const [index, [file, specifier, allowed]] of expectations.entries()) {
      const casePath = file.replace(/\.ts$/, `-${index}.ts`);
      const target = join(workDir, casePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `import type { A } from "${specifier}";\nexport type B = A;\n`);
      const { byFile } = runOxlint([casePath]);
      const hits = byFile.get(casePath) ?? 0;
      if ((hits === 0) !== allowed) {
        wrong.push(
          `${casePath} importing "${specifier}": expected ${allowed ? "ALLOW" : "BLOCK"}, got ${hits === 0 ? "ALLOW" : "BLOCK"}`,
        );
      }
      rmSync(target);
    }
    expect(wrong).toEqual([]);
  });

  it("rejects every disallowed import by the dependency-boundary rule itself", () => {
    const { byFile, parsed } = runOxlint();
    // 拒绝必须来自依赖边界规则，而不是「模块不存在」之类的解析失败。
    const messages = (parsed?.diagnostics ?? []).map((d) => d.message ?? "").join("\n");
    expect(messages).not.toMatch(/Cannot find module/i);
    const wrong: string[] = [];
    for (const [file, fixture] of Object.entries(fixtures)) {
      if (fixture.violations === 0) continue;
      const actual = byFile.get(file) ?? 0;
      if (actual !== fixture.violations) {
        wrong.push(`${file}: expected ${fixture.violations} violations, got ${actual}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("allows every fixture that DEV-04 permits", () => {
    const { byFile } = runOxlint();
    const wronglyBlocked: string[] = [];
    for (const [file, fixture] of Object.entries(fixtures)) {
      if (fixture.violations !== 0) continue;
      const actual = byFile.get(file) ?? 0;
      if (actual !== 0) {
        wronglyBlocked.push(`${file}: blocked ${actual}x — ${fixture.reason}`);
      }
    }
    expect(wronglyBlocked).toEqual([]);
  });

  it("rejects a relative escape to another package's source (tsc layer, not lint)", () => {
    // 声明检查层分工：该场景由 tsc 的 rootDir/项目边界拒绝。测试实际运行 tsc，
    // 而不是用 lint 的缺席冒充「已被检查」。
    //
    // fixture 必须让相对路径真的解析到另一包的源码，否则失败会退化成 TS2307
    // 「模块不存在」——那是解析失败，不是边界拒绝。
    const siblingSrc = join(workDir, "packages", "tsc-core", "src");
    const probeSrc = join(workDir, "packages", "tsc-escape", "src");
    mkdirSync(siblingSrc, { recursive: true });
    mkdirSync(probeSrc, { recursive: true });
    writeFileSync(join(siblingSrc, "index.ts"), "export const coreThing = 1;\n");
    writeFileSync(
      join(probeSrc, "escape.ts"),
      `import { coreThing } from "../../tsc-core/src/index";\nexport const y = coreThing;\n`,
    );
    writeFileSync(
      join(workDir, "packages", "tsc-escape", "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2023",
          lib: ["ES2023"],
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          noEmit: true,
          rootDir: "src",
        },
        include: ["src/**/*.ts"],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [tscMain, "--noEmit", "-p", join(workDir, "packages", "tsc-escape")],
      { cwd: workDir, encoding: "utf8" },
    );
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(result.status, `tsc should reject the escape. output:\n${output}`).not.toBe(0);
    // 必须是 rootDir 边界（TS6059）或项目文件列表（TS6307），而不是找不到模块。
    expect(output).toMatch(/TS6059|TS6307/);
    expect(output).not.toMatch(/TS2307/);
  });

  it("keeps rootDir declared on every package (the premise the tsc layer relies on)", () => {
    // 上面那个用例证明了「相对路径逃逸到邻包源码由 tsc 拒绝」；而这**只在包 tsconfig
    // 声明了 rootDir 时成立**。若某包去掉 rootDir，这条保护会无声消失，lint 也不覆盖它
    // （相对路径由 tsc 层负责），于是 DEV-04「禁止跨包相对路径」在该包上再无强制。
    // 这里把该前提固定下来：改动即失败，并给出应恢复的字段。
    //
    // 只检查**拥有 TypeScript 源码**的包。像 bundle 这样只承载装配声明、无 src/ 的包
    // （DEV-03 §2.2）本来就没有 tsconfig，也没有可逃逸的源码，不属于该前提的适用范围。
    const packages = readdirSync(join(repoRoot, "packages"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(repoRoot, "packages", name, "src")));

    // 先证明前提确实是承重的：同一份 fixture 去掉 rootDir 后不再被拒绝。
    const premiseDir = join(workDir, "packages", "premise-core", "src");
    const probeDir2 = join(workDir, "packages", "premise-probe", "src");
    mkdirSync(premiseDir, { recursive: true });
    mkdirSync(probeDir2, { recursive: true });
    writeFileSync(join(premiseDir, "index.ts"), "export const sibling = 1;\n");
    writeFileSync(
      join(probeDir2, "escape.ts"),
      `import { sibling } from "../../premise-core/src/index";\nexport const y = sibling;\n`,
    );
    const configPath = join(workDir, "packages", "premise-probe", "tsconfig.json");
    const baseOptions = {
      target: "ES2023",
      lib: ["ES2023"],
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      noEmit: true,
    };
    const runPremise = () => {
      const result = spawnSync(
        process.execPath,
        [tscMain, "--noEmit", "-p", join(workDir, "packages", "premise-probe")],
        { cwd: workDir, encoding: "utf8" },
      );
      return `${result.stdout ?? ""}${result.stderr ?? ""}`;
    };

    writeFileSync(
      configPath,
      JSON.stringify({
        compilerOptions: { ...baseOptions, rootDir: "src" },
        include: ["src/**/*.ts"],
      }),
    );
    expect(runPremise(), "with rootDir the escape must be rejected").toMatch(/TS6059|TS6307/);

    writeFileSync(
      configPath,
      JSON.stringify({ compilerOptions: baseOptions, include: ["src/**/*.ts"] }),
    );
    expect(
      runPremise(),
      "without rootDir the escape is NOT rejected — so rootDir is the load-bearing guard",
    ).not.toMatch(/TS6059|TS6307/);

    // 据此要求每个真实包声明 rootDir。
    const missing = packages.filter((name) => {
      const path = join(repoRoot, "packages", name, "tsconfig.json");
      if (!existsSync(path)) return true;
      const config = JSON.parse(readFileSync(path, "utf8")) as {
        compilerOptions?: { rootDir?: string };
      };
      return config.compilerOptions?.rootDir !== "src";
    });
    expect(
      missing,
      `这些包缺少 rootDir: "src"，相对路径逃逸将不再被 tsc 拒绝：${missing.join(", ")}`,
    ).toEqual([]);
  });
});
