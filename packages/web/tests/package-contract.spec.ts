import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const pkgRoot = dirname(fileURLToPath(import.meta.url));
const packageDir = join(pkgRoot, "..");
const repoRoot = join(packageDir, "..", "..");

/**
 * `.oxlintrc.json` 的 web override **允许**的导入面（唯一权威在此）。
 *
 * 〔约束〕这是**精确集合**断言：白名单里多出任何一项都失败。理由见下方用例注释。
 * 改动本集合必须同时改 `.oxlintrc.json` 与 `packages/web/src` 的实际导入面，
 * 三处一致才算完成一次「放行面变更」。
 */
const EXPECTED_WEB_IMPORT_ALLOWLIST = [
  "@deepseek-ai/cordis",
  "@deepseek-ai/cordis/**",
  "@deepseek-ai/dsh-typert-protocol",
  "@deepseek-ai/dsh-typert-protocol/**",
  "soloips-core/contracts",
  "soloips-web/contracts",
] as const;

interface ExportTarget {
  types?: string;
  default?: string;
}

/**
 * 包边界契约测试：断言本包的 exports 面与 Typert 生成物声明成立。
 *
 * 这是对「包边界」这一真实行为的检查，不是填充门禁：
 * 它会在包名、ESM 形态或 exports 声明被改错时失败。
 *
 * BE-0a 扩展：本包自本切片起携带 Host 半边的 Typert 生成物，exports 面因此
 * 增加 `./contracts`、`./typert`、`./remote` 三项。三项的形状是**上游生成器的
 * 硬校验**（`WorkspaceTypertGenerator.validateExport`）：路径必须是
 * `lib/typert.<face>.{js,d.ts}` 且 `files` 必须逐条列出——写错即构建失败，
 * 这里提前用静态断言固定，使错误在测试层就可见，而不必等到跑构建。
 */
describe("soloips-web package contract", () => {
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
    name: string;
    type: string;
    private: boolean;
    exports: Record<string, ExportTarget | string>;
    files?: string[];
    dependencies?: Record<string, string>;
  };

  it("uses the agreed package name and ESM form", () => {
    expect(manifest.name).toBe("soloips-web");
    expect(manifest.type).toBe("module");
    expect(manifest.private).toBe(true);
  });

  it("declares a public entry in exports (DEV-04: 跨包只能经公开 exports)", () => {
    expect(Object.keys(manifest.exports)).toContain(".");
  });

  it("exports the Host entry with tsc-produced declarations (lib/types)", () => {
    // Host 入口的 types 来自 tsc（`lib/types`），default 来自 tsdown（`lib`）。
    // 两者混用会让声明与实现指向不同文件。
    const entry = manifest.exports["."] as ExportTarget;
    expect(entry.types).toBe("./lib/types/index.d.ts");
    expect(entry.default).toBe("./lib/index.js");
  });

  it("exports ./contracts for Remote boundary types (generator: 非根子路径)", () => {
    // 生成器要求 Remote 边界的具名类型经**非根**子路径导出
    // （analyzer.publicRemoteType）；生成的 remote-client 声明因此
    // `import type { … } from 'soloips-web/contracts'`。缺这一项会让
    // 生成的 .d.ts 无法解析。
    const contracts = manifest.exports["./contracts"] as ExportTarget;
    expect(contracts.types).toBe("./lib/types/contracts.d.ts");
    expect(contracts.default).toBe("./lib/types/contracts.js");
  });

  it("declares ./typert and ./remote with the generator's exact expected shape", () => {
    // 形状取自 WorkspaceTypertGenerator.validateExport 的期望值，不得改：
    // 生成器逐字段比对 types/default 的**字面量**，不一致即抛
    // TypertAnalysisError。声明了 ./remote 却无 Remote 方法同样会抛错。
    const typert = manifest.exports["./typert"] as ExportTarget;
    expect(typert.types).toBe("./lib/typert.host.d.ts");
    expect(typert.default).toBe("./lib/typert.host.js");

    const remote = manifest.exports["./remote"] as ExportTarget;
    expect(remote.types).toBe("./lib/typert.remote-client.d.ts");
    expect(remote.default).toBe("./lib/typert.remote-client.js");
  });

  it("lists every Typert artifact in files (generator validates the manifest)", () => {
    // validateExport 要求 files 逐条含 `lib/typert.<face>.js` 与 `.d.ts`
    // （Remote 面再加 remote-client 两项）；漏一项即构建失败。
    const files = manifest.files ?? [];
    for (const file of [
      "lib/typert.host.js",
      "lib/typert.host.d.ts",
      "lib/typert.remote-client.js",
      "lib/typert.remote-client.d.ts",
    ]) {
      expect(files, `files 必须含 ${file}`).toContain(file);
    }
  });

  it("keeps the assembly declarations intact (T01 契约不被本切片破坏)", () => {
    // cordis.patch.yml 的装配声明由 packages/bundle/tests 的 T01 契约覆盖；
    // 这里只断言本切片没有把它从 exports/files 里挤掉。
    expect(manifest.exports["./cordis.patch.yml"]).toBe("./cordis.patch.yml");
    expect(manifest.files ?? []).toContain("cordis.patch.yml");
    expect(existsSync(join(packageDir, "cordis.patch.yml"))).toBe(true);
  });

  it("declares the toolchain dependencies the Host half imports (DEV-04 窄口径)", () => {
    // 这三个包是 .oxlintrc.json 的 web override 放行的全部依赖面；
    // 声明与放行面必须一致，否则「能 import 但装不上」。
    expect(manifest.dependencies).toMatchObject({
      "@deepseek-ai/cordis": "4.0.2",
      "@deepseek-ai/dsh-typert-protocol": "0.1.6-alpha.1",
      "soloips-core": "workspace:*",
    });
  });

  it("pins the web import allowlist to an exact set (BE-0a 变异 #5)", () => {
    // 变异测试暴露的盲区：把 web override 的白名单**加宽到另一个合法包**
    // （如放行 `@deepseek-ai/dsh-tools`），六门全绿——因为没有任何断言检查
    // 放行面本身。放行面加宽是 DEV-04 的实质违规（web 层绕过 adapter 直接
    // 依赖官方能力包），必须由测试拦下。
    //
    // 断言方式是**精确集合相等**（不多不少）：
    //   - 多出条目 → 有人加宽放行面 → 红；
    //   - 少条目  → 有人收紧但没同步本清单 → 红（提示三处同步）。
    const configPath = join(repoRoot, ".oxlintrc.json");
    expect(existsSync(configPath), ".oxlintrc.json 必须存在").toBe(true);

    // 用 TypeScript 自带的 JSONC 解析（该文件含整行注释，不能直接 JSON.parse）。
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error !== undefined) {
      throw new Error(
        `解析 .oxlintrc.json 失败：${ts.flattenDiagnosticMessageText(read.error.messageText, " ")}`,
      );
    }
    const config = read.config as {
      overrides?: { files?: string[]; rules?: Record<string, unknown> }[];
    };

    const webOverride = (config.overrides ?? []).find((override) =>
      (override.files ?? []).includes("packages/web/src/**/*.{ts,tsx}"),
    );
    expect(
      webOverride,
      "必须存在 files 恰为 packages/web/src/**/*.{ts,tsx} 的 override",
    ).toBeDefined();

    const rule = (webOverride?.rules ?? {})["no-restricted-imports"] as
      [string, { patterns?: { group?: string[] }[] }] | undefined;
    expect(rule, "web override 必须声明 no-restricted-imports").toBeDefined();
    expect(rule?.[0], "no-restricted-imports 必须是 error 级").toBe("error");

    // 与既有写法一致：**一个** patterns 对象、一个 group（多对象会互相抑制诊断）。
    expect(rule?.[1]?.patterns?.length, "必须恰有一个 patterns 对象").toBe(1);
    const group = rule?.[1]?.patterns?.[0]?.group ?? [];

    // 白名单条目 = 以 `!` 开头的例外项；其余是禁令项。
    const allowlisted = group
      .filter((entry) => entry.startsWith("!"))
      .map((entry) => entry.slice(1));
    expect(
      allowlisted.slice().sort(),
      "web override 的放行面必须恰好等于预期集合（多了即放行面被加宽）",
    ).toEqual([...EXPECTED_WEB_IMPORT_ALLOWLIST].sort());

    // 兜底：确保没有把整个 `@deepseek-ai/**` 或 `soloips-*` 通配放行。
    expect(allowlisted, "不得放行 @deepseek-ai/** 通配").not.toContain("@deepseek-ai/**");
    expect(
      allowlisted.filter((entry) => entry.startsWith("soloips-") && !entry.includes("/")),
      "不得放行裸包名形式的 soloips-* 通配",
    ).toEqual([]);
  });
});
