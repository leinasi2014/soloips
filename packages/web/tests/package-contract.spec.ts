import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  SOLOIPS_WEB_REMOTE_NAMESPACE,
  SOLOIPS_WEB_SERVICE_NAME,
  SOLOIPS_WEB_TOOLCHAIN,
} from "../src/index.js";

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
  // BE-0b-i：浏览器半边以运行时值导入**本包生成的** `/remote` 贡献并自行
  // `ctx.remote.$mount(...)`（官方 `@deepseek-ai/dsh-api-remotes` 的 Client 装配是
  // 硬编码导入清单，不认识本包）。这是**包自我引用**，不是跨包耦合：
  // `no-restricted-imports` 的包名模式匹配无法区分「自己」与「别人」，
  // 故配置侧需要一条显式例外。放行理由与边界见 `.oxlintrc.json` 该 override 的注释。
  "soloips-web/remote",
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
    dsh?: { client?: { platform?: string; inject?: string[]; external?: string[] } };
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
    // ── type-only（BE-6a 身份分裂修复）───────────────────────────────────────
    //
    // 〔为什么没有 `default`〕`src/contracts.ts` **零运行期导出**（全文只有类型
    // 与 `export {}`），旧的 `default: "./lib/types/contracts.js"` 指向的是一个
    // 只含 `export {}` 的空模块——它从来不是可用的运行期入口，只是「exports 全部
    // 解析到存在的文件」这条检查的形式满足。
    //
    // 〔为什么必须去掉〕该 `default` 与 Host 入口的 JS 中间产物是**同一个机制**的
    // 两处：都要求 tsc 在 `lib/types/` 下产 `.js`。BE-6a 起 Host 工程开
    // `emitDeclarationOnly`（否则 `lib/types/index.js` 与 tsdown 的 `lib/index.js`
    // 会构成两份 `SoloipsWebHost` 类定义，`instanceof` 判别在装配路径上失败），
    // 该文件随之消失。故这里收敛为 **type-only**——与 `src/contracts.ts` 的实际
    // 形态一致，且不再要求任何 tsc 的 JS 产物。
    //
    // 〔生成器侧不受影响〕`sourcePathForExport` 只读 exports 的**字符串目标**，
    // 且按 `types` → `import` → `default` 顺序取第一个；去掉 `default` 后仍解析到
    // `./lib/types/contracts.d.ts` → `src/contracts.ts`（实测：生成的
    // `typert.remote-client.d.ts` 仍写 `from 'soloips-web/contracts'`）。
    expect(contracts.default).toBeUndefined();
    expect(
      Object.keys(contracts),
      "只留 types 条件——多一个运行期条件就要求 tsc 产 JS 中间产物（那正是身份分裂的来源）",
    ).toEqual(["types"]);
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

  it("declares ./client and dsh.client as one coherent pair (BE-0b-i)", () => {
    // 〔为什么成对断言〕DSH `client-modules` 的扫描规则（0.1.6-alpha.1，
    // `packages/client/modules/src/index.ts:779-793`）是**两段式**：
    //   1. 读 package.json 的 `dsh.client`：缺 `platform` 抛错、非 `web` 跳过；
    //   2. 声明了 `dsh.client` 就必须有 `exports["./client"]`，否则抛
    //      `declares dsh.client but exports no "./client" bundle`。
    // 因此「只声明一半」是**运行期抛错**的形态，不是风格问题：
    //   - 有 dsh.client 无 ./client → 宿主启动即抛；
    //   - 有 ./client 无 dsh.client → 该包被安全跳过，客户端半边**永不加载**
    //     （静默失效，比抛错更难发现）。
    // 本用例把「两半同时存在且形状正确」固定成契约。
    const client = manifest.exports["./client"] as ExportTarget;
    expect(client.types).toBe("./lib/types/client/index.d.ts");
    expect(client.default).toBe("./lib/client.js");

    const declaration = manifest.dsh?.client;
    expect(declaration, "dsh.client 必须存在（否则客户端半边被安全跳过）").toBeDefined();
    expect(declaration?.platform).toBe("web");
    // `inject` 是**包名清单**（页面按它排序并保证 provider 先物化），
    // 不是 cordis 服务键。api-remotes 是 `ctx.remote` 的提供者：本包的
    // `apply()` 直接调 `ctx.remote.$mount`，因此它必须先就位。
    expect(declaration?.inject).toEqual(["@deepseek-ai/dsh-api-remotes"]);
  });

  it("lists the client artifact in files (否则 tarball 缺产物)", () => {
    // `files` 决定 tarball 内容。产物不列进来时本地 worktree 一切正常，
    // 只有交付安装后才会暴露「exports 指向不存在的文件」——正是
    // check:delivery-load 要拦的那类缺陷。
    expect(manifest.files ?? []).toContain("lib/client.js");
  });

  it("declares the toolchain dependencies the Host half imports (DEV-04 窄口径)", () => {
    // 这三个包是 .oxlintrc.json 的 web override 放行的全部依赖面；
    // 声明与放行面必须一致，否则「能 import 但装不上」。
    expect(manifest.dependencies).toMatchObject({
      "@deepseek-ai/cordis": "4.0.2",
      // 〔BE-0b-ii〕与运行时对齐：fork HEAD 的 dsh-typert-loader 实现
      // alpha.2 的 `codec.create` 契约，而生成器 alpha.1 产出的是 alpha.1 的
      // `codec.schema`；二者混用会让 soloips-web 的 typert entry 在宿主
      // 冷启动时激活失败（宿主只发 warning、退出码仍为 0）。
      "@deepseek-ai/dsh-typert-protocol": "0.1.6-alpha.2",
      "soloips-core": "workspace:*",
    });
  });

  it("keeps SOLOIPS_WEB_TOOLCHAIN in step with the pinned generator version (BE-0b-ii 盲区 1)", () => {
    // ── 为什么必须钉住 ────────────────────────────────────────────────────────
    // `SOLOIPS_WEB_TOOLCHAIN` 是 `getStatus` 的返回值之一，**浏览器侧读到的就是它**；
    // 它声称「本产物出自哪个生成器版本」，是工具链自证。写成旧版本即**假事实**
    // ——BE-0b-ii 实测过：升级到 alpha.2 后常量仍是 alpha.1，浏览器返回
    // `toolchain: "tsdown+typert-generator@0.1.6-alpha.1"` 而产物实际由 alpha.2 生成。
    //
    // ── 为什么不能靠别的门禁 ──────────────────────────────────────────────────
    // 根 `package.json` 的**依赖钉版**漂移能被 `--frozen-lockfile` 拦下（exit 1），
    // 但**源码常量**漂移不能：QA 实测把本常量回退成 alpha.1 后，
    // test / build / delivery-load **全绿**。故必须有本条断言。
    //
    // ── 判据形态：从根 manifest 读版本，而非在本文件硬编码 ─────────────────────
    // 硬编码 `"0.1.6-alpha.2"` 会让「升级依赖时忘了改常量」**继续漏网**（本文件也
    // 得跟着改，但没有任何东西强制两处同步）。改读根 `package.json` 的 generator
    // 钉版后，**任一侧单独漂移即红**：升依赖不升常量 → 红；降常量不降依赖 → 红。
    const rootManifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      devDependencies?: Record<string, string>;
    };
    const pinnedGenerator = rootManifest.devDependencies?.["@deepseek-ai/dsh-typert-generator"];
    expect(
      pinnedGenerator,
      "根 package.json 必须钉住 @deepseek-ai/dsh-typert-generator",
    ).toBeDefined();

    // 常量形如 `tsdown+typert-generator@<version>`，须含根 manifest 的钉版串。
    expect(
      SOLOIPS_WEB_TOOLCHAIN,
      `SOLOIPS_WEB_TOOLCHAIN（${SOLOIPS_WEB_TOOLCHAIN}）必须含根 manifest 的 generator 钉版（${String(pinnedGenerator)}）` +
        "——不一致时浏览器读到的「工具链自证」是假事实。改依赖版本请同步 packages/web/src/index.ts。",
    ).toContain(String(pinnedGenerator));
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

  it("pins the browser wire namespace to the frozen contract value (BE-6a)", () => {
    // 〔为什么必须由测试钉，而不是靠源码里写常量〕
    //
    // Typert 分析器**只从字面量**读服务键与 namespace，传常量标识符即构建失败
    // （实测两条：`Gateway service key must be a string literal` 与
    // `Gateway namespace must be a string literal`）。因此
    // `src/index.ts` 的 `super(ctx, "soloipsWeb", { namespace: "soloips" })`
    // 里**必须**逐字写字符串；编译器与分析器都无法把那里的字面量与下面这两个
    // 导出常量联系起来。若只留字面量，「有人把 namespace 改成别的值」不会有
    // 任何门禁响应——而它是 `data-contract.md` §2.5 调用面矩阵的冻结项。
    //
    // 本用例把三者固定成一处可判定的事实：
    //   ① 源码里的字面量与服务键常量一致（`"soloipsWeb"`）；
    //   ② 源码里的 namespace 字面量与 `SOLOIPS_WEB_REMOTE_NAMESPACE` 一致；
    //   ③ namespace 与服务键**不同值**（防止两者被「顺手统一」而静默改变
    //      已冻结的浏览器调用面）。
    const source = readFileSync(join(packageDir, "src", "index.ts"), "utf8");
    const call = /super\(ctx,\s*"([^"]+)",\s*\{\s*namespace:\s*"([^"]+)"\s*\}\s*\)/.exec(source);
    expect(
      call,
      'src/index.ts 必须以字面量形态调用 super(ctx, "…", { namespace: "…" })' +
        "（分析器不接受常量标识符）",
    ).not.toBeNull();

    const serviceKey = call?.[1];
    const namespace = call?.[2];
    expect(serviceKey, "服务键字面量必须等于 SOLOIPS_WEB_SERVICE_NAME").toBe(
      SOLOIPS_WEB_SERVICE_NAME,
    );
    expect(namespace, "wire namespace 字面量必须等于 SOLOIPS_WEB_REMOTE_NAMESPACE").toBe(
      SOLOIPS_WEB_REMOTE_NAMESPACE,
    );
    // 契约值本身：`data-contract.md` §2.5 / §2.5.1 逐行写作 `ctx.remote.soloips.<method>`。
    expect(namespace, "契约冻结的浏览器 namespace 是 soloips（§2.5 调用面矩阵）").toBe("soloips");
    expect(namespace, "服务键与 wire namespace 必须分离——合并会静默改变已冻结的调用面").not.toBe(
      serviceKey,
    );
  });
});
