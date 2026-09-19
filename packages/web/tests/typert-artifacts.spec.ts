import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
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
const tscArtifacts = ["types/index.d.ts", "types/contracts.d.ts"];

/**
 * tsc 在 `lib/types/` 下**不得**产出的文件（BE-6a 身份分裂修复）。
 *
 * 〔为什么是「不得存在」而不是「可以存在但不用」〕这两份 JS 中间产物是运行期
 * 身份分裂的**唯一**来源：`lib/types/index.js`（tsc 副本）与 `lib/index.js`
 * （tsdown 副本）各含一份 `SoloipsWebHost` 类定义，同一进程里 `A === B` 为
 * false，`instanceof` 判别在装配路径上失败——E2E 实测表现为
 * `soloips/createCompany → gateway/internal` /
 * `"Receiver must be an instance of class SoloipsWebHost"`。
 *
 * 〔为什么不是只删掉不引用〕`files` 的 `lib/` 全量 glob 会把它们打进 tarball，
 * `check-delivery-load` 的 `checkDeclaredDependencies` 也会把它们当交付面证据
 * 扫裸说明符。故判据是**磁盘上不存在**。
 */
const forbiddenTscJsArtifacts = ["types/index.js", "types/contracts.js"];

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
 * 该职责由两个 **build 之后**的步骤承担：
 *  - `check:build-repro`：删产物 → 重跑构建 → 逐文件比对 SHA-256；
 *  - `test:artifacts`（BE-0b-ii / F-03）：`packages/web/vitest.artifacts.config.ts`
 *    驱动 `tests/artifacts/*.artifact.ts`，**要求产物存在**并真执行 VM / 挂载 /
 *    codec 断言。它不在这里重复——产物用例写进本文件会在 `build` 之前跑，
 *    那正是 F-03 要消除的形态。
 * 变异测试（BE-0a 补强）证明了这个分工的必要性：只在本文件断言「脚本已接线」
 * 而 CI 不跑该脚本，等于产物有效性在 CI 上**从未被验证**。
 *
 * 〔BE-0b-ii 修正（实测）〕此前本文件有两条**执行判据**用例（`the codec gate
 * really flags a bad artifact` / `…covers every typert.*.js artifact on disk`），
 * 它们会 `import` `lib/typert.host.js`。CI 的 `test` 跑在 `build` 之前、磁盘上
 * 只有 `lib/types/**`，于是这两条**必然失败**（实测：`pnpm run test` exit 1，
 * `Test Files 1 failed | 21 passed`）——即冻结提交把 CI 的 `Test` 步骤改红了。
 * 它们已迁到 `tests/artifacts/artifact-behavior.artifact.ts`（build 之后跑，
 * 判据不变、且额外补了正向用例）。本文件因此只保留**不依赖 tsdown 产物**的接线
 * 断言与条件检查。
 *
 * 本测试因此断言两件在**任何**门禁顺序下都成立的事：
 *  1. tsdown 一旦跑过（`lib/index.js` 在），Typert 四个产物就**必须**齐全
 *     —— 这是「部分生成」这一真实故障模式的检查，非空断言；
 *  2. 可复现性证据与产物行为套件**已接线**（脚本/配置存在 + `package.json` 有
 *     script + CI 两个 job 都真的调用它），使覆盖不会因误删/漏接而静默消失。
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

  it("runs the artifact-behavior suite in CI, after build, in both jobs (BE-0b-ii / F-03)", () => {
    // 〔为什么这条断言不能省〕F-03 的教训同型：只把产物用例写出来、而不断言
    // CI **真的在 build 之后调用它**，等于覆盖在 CI 上不存在（删掉 workflow 里
    // 那一行后全部测试仍绿）。本用例把「接线本身」变成断言。
    //
    // 三个事实缺一不可：
    //  1. 根 package.json 有 `test:artifacts` script（调用点存在）；
    //  2. 两个 job 都调用它，且**位置在 build 之后**（顺序是 F-03 的核心）；
    //  3. 该套件用的是独立 config，且其 include 只匹配 `*.artifact.ts`
    //     ——与默认 include（`*.spec.ts`）不相交，否则产物用例会在 build 之前
    //     被默认套件捡走并因缺产物而红（实测）。
    const rootManifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(
      rootManifest.scripts?.["test:artifacts"],
      "根 package.json 必须保留 test:artifacts（否则该步骤不会被跑）",
    ).toBe("vitest run --config packages/web/vitest.artifacts.config.ts");

    const configPath = join(repoRoot, "packages", "web", "vitest.artifacts.config.ts");
    expect(existsSync(configPath), "产物套件 config 必须存在").toBe(true);
    const configSource = readFileSync(configPath, "utf8");
    expect(
      configSource,
      "产物套件的 include 必须只匹配 *.artifact.ts（与默认套件 *.spec.ts 不相交）",
    ).toContain("tests/artifacts/**/*.artifact.ts");

    const workflowPath = join(repoRoot, ".github", "workflows", "verify.yml");
    const workflow = readFileSync(workflowPath, "utf8");
    const jobsAt = workflow.indexOf("\njobs:");
    const jobsBlock = workflow.slice(jobsAt);
    const headers = [...jobsBlock.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)].map((match) => ({
      name: match[1],
      at: match.index,
    }));
    headers.forEach((header, index) => {
      const next = headers[index + 1];
      const section = jobsBlock.slice(header.at, next === undefined ? jobsBlock.length : next.at);
      const buildAt = section.indexOf("pnpm run build");
      const artifactsAt = section.indexOf("pnpm run test:artifacts");
      expect(artifactsAt, `${header.name} 应含 test:artifacts 步骤`).toBeGreaterThanOrEqual(0);
      expect(
        artifactsAt,
        `${header.name} 的 test:artifacts 必须在 build 之后（build 之前产物不存在，必红）`,
      ).toBeGreaterThan(buildAt);
    });
  });

  it("keeps the Typert codec-shape gate wired into CI after build (BE-0b-ii 盲区 2)", () => {
    // 断言「门禁存在 + 真的在 CI 的 build 之后跑」。
    //
    // 为什么这层断言不能省（BE-0a 变异 #3 的同型教训）：只把检查写进
    // check-delivery-load.mjs 而不断言 CI 调用它，等于该检查在 CI 上**从未执行**
    // ——删掉 workflow 里那一行后全部测试仍绿。本用例把接线本身变成断言。
    const gatePath = join(repoRoot, "scripts", "development", "check-delivery-load.mjs");
    expect(existsSync(gatePath), "交付加载门禁脚本必须存在").toBe(true);

    const workflowPath = join(repoRoot, ".github", "workflows", "verify.yml");
    const workflow = readFileSync(workflowPath, "utf8");
    const jobsAt = workflow.indexOf("\njobs:");
    const jobsBlock = workflow.slice(jobsAt);
    const headers = [...jobsBlock.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)].map((match) => ({
      name: match[1],
      at: match.index,
    }));
    headers.forEach((header, index) => {
      const next = headers[index + 1];
      const section = jobsBlock.slice(header.at, next === undefined ? jobsBlock.length : next.at);
      const buildAt = section.indexOf("pnpm run build");
      const loadAt = section.indexOf("pnpm run check:delivery-load");
      expect(loadAt, `${header.name} 应含 check-delivery-load 步骤`).toBeGreaterThanOrEqual(0);
      expect(loadAt, `${header.name} 的 check:delivery-load 必须在 build 之后`).toBeGreaterThan(
        buildAt,
      );
    });
  });

  it("main() really calls the codec check as a live statement (AST 判据；BE-0b-ii 盲区 1)", () => {
    // 〔为什么不能用 `toContain`〕QA 实测两处漏检，都是纯子串匹配的固有缺陷：
    //   - `// const x = await checkTypertCodecContract();`（**注释**）→ 字符串在源码里；
    //   - `false ? await checkTypertCodecContract() : []`（**死分支**）→ 同上。
    // 两种情况下套件全绿，而检查实际未运行。子串无法区分「活的调用语句」与
    // 「注释/死代码里的同名字符串」。
    //
    // 〔判据〕用 TypeScript 自身的解析器读源码，在 **AST** 上找对
    // `checkTypertCodecContract` 的 CallExpression：
    //   - AST **不含注释**，故注释形态天然不产生 CallExpression；
    //   - 再排除位于 ConditionalExpression（三元）内的调用，故死分支不满足。
    // 这使判据与「运行时真的会执行它」对齐，而不是与「文本里出现过」对齐。
    const gateSource = readFileSync(
      join(repoRoot, "scripts", "development", "check-delivery-load.mjs"),
      "utf8",
    );
    const source = ts.createSourceFile(
      "check-delivery-load.mjs",
      gateSource,
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.JS,
    );

    /** 收集所有对 `checkTypertCodecContract` 的调用及其是否位于三元分支内。 */
    const calls: { insideConditional: boolean; insideLogical: boolean }[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "checkTypertCodecContract"
      ) {
        let parent: ts.Node | undefined = node.parent;
        let insideConditional = false;
        let insideLogical = false;
        // 向上找最近的语句：途中若穿过三元或 `&&`/`||` 短路，即非「无条件执行」。
        while (parent !== undefined && !ts.isStatement(parent)) {
          if (ts.isConditionalExpression(parent)) insideConditional = true;
          if (ts.isBinaryExpression(parent)) {
            const kind = parent.operatorToken.kind;
            if (
              kind === ts.SyntaxKind.AmpersandAmpersandToken ||
              kind === ts.SyntaxKind.BarBarToken
            ) {
              insideLogical = true;
            }
          }
          parent = parent.parent;
        }
        calls.push({ insideConditional, insideLogical });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    expect(
      calls.length,
      "check-delivery-load.mjs 必须存在对 checkTypertCodecContract 的调用表达式" +
        "（注释与字符串不算——AST 里没有 CallExpression）",
    ).toBeGreaterThan(0);
    expect(
      calls.filter((call) => !call.insideConditional && !call.insideLogical).length,
      "checkTypertCodecContract 必须在**无条件**语句位置被调用" +
        "（三元/短路分支里的调用是死代码，不能让门禁在 CI 上不执行）",
    ).toBeGreaterThan(0);
  });

  it("emits tsc declarations for the Host entry and the contracts subpath", () => {
    if (!existsSync(join(libDir, "types"))) return;
    const missing = tscArtifacts.filter((file) => !existsSync(join(libDir, file)));
    expect(missing, "tsc 已产出 lib/types 但声明文件不齐").toEqual([]);
  });

  it("keeps lib/types free of JS (运行期身份分裂的唯一来源)", () => {
    // 〔为什么非条件断言〕判据是「tsc 的 JS 中间产物**不存在**」，与 tsdown 是否
    // 跑过无关；`lib/types` 由 `typecheck` 阶段写出，故 CI 的 `test` 步骤
    // （build 之前）就已覆盖这一面。条件早退会让本断言在 CI 上恒被跳过。
    //
    // 〔本用例防的失效模式〕把 `packages/web/tsconfig.json` 的
    // `emitDeclarationOnly` 去掉（或把 tsdown 的 entry 改回 `lib/types/index.js`）：
    // 前者让 `lib/types/*.js` 复活、后者让交付面依赖它。两者都重建出
    // 「两份 SoloipsWebHost 类定义」，而**没有任何其它门禁**会因此变红
    // （tsc 通过、lint 通过、构建通过、产物形态检查通过）——只有真实浏览器
    // E2E 才会在调用时以 `gateway/internal` 暴露。
    if (!existsSync(join(libDir, "types"))) return;
    const resurrected = forbiddenTscJsArtifacts.filter((file) => existsSync(join(libDir, file)));
    expect(
      resurrected,
      "lib/types 下不得出现 tsc 的 JS 中间产物——它与 lib/index.js 构成两份 " +
        "SoloipsWebHost 类定义（instanceof 判别失败，E2E 报 gateway/internal）",
    ).toEqual([]);

    // 〔更深一层〕目录里**任何** `.js` 都不得存在，而不只是上面两条具名文件：
    // 新增源文件（如 `src/foo.ts`）会带来 `lib/types/foo.js`，具名清单漏掉它。
    // 判据按扩展名扫全目录，与 `check-delivery-load` 的 `checkDeclaredDependencies`
    // 口径一致（它扫 `lib/` 下全部 `.js`）。
    const allJs = readdirSync(join(libDir, "types"), { recursive: true })
      .map((entry) => String(entry).replaceAll("\\", "/"))
      .filter((entry) => entry.endsWith(".js") || entry.endsWith(".js.map"));
    expect(allJs, "lib/types 必须是纯声明目录（.d.ts / .d.ts.map）").toEqual([]);
  });

  it("carries the getStatus invocation in the Host face model", () => {
    const path = join(libDir, "typert.host.js");
    if (!existsSync(path)) return;
    const host = readFileSync(path, "utf8");
    // 生成器的 Host 产物是 TYPERT 常量：含 package/face 与 invocations 表。
    expect(host).toContain("export const TYPERT");
    expect(host).toContain("'soloips-web'");
    // 〔端点 id 用 wire namespace，不是服务键〕BE-6a 起 namespace 显式覆盖为
    // `soloips`（data-contract §2.5 的调用面矩阵）；服务键仍是 `soloipsWeb`。
    // 两者不同形是**刻意的**（§2.5 的「两套命名面」约束），故本断言固定端点 id，
    // 并由紧随的断言固定服务键仍在产物里——只钉一个会漏掉「两者被合并」这一形态。
    expect(host).toContain("soloips/getStatus");
    expect(host, "服务键仍须是 soloipsWeb（与 wire namespace 分离）").toContain("'soloipsWeb'");
  });

  it("emits a mountable Remote contribution for the browser half", () => {
    const path = join(libDir, "typert.remote-client.js");
    if (!existsSync(path)) return;
    const remote = readFileSync(path, "utf8");
    // Client 侧挂载的是 TYPERT_REMOTE（TypertRemoteContribution，含严格 codec）。
    expect(remote).toContain("export const TYPERT_REMOTE");
    expect(remote).toContain("soloips/getStatus");
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
