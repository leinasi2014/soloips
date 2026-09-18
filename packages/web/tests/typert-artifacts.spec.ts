import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

  /**
   * 把门禁脚本作为**模块**加载，取回它导出的 `checkTypertCodecContract`。
   *
   * 〔为什么必须 import 执行而不是读源码文本（BE-0b-ii 盲区 1/2）〕
   * 前一版测试用 `toContain("await checkTypertCodecContract()")` 断言接线，QA 实测
   * 两处漏检：
   *   - 把调用改成 `// const x = await checkTypertCodecContract();`（注释）或
   *     `false ? await checkTypertCodecContract() : []`（死分支）→ 字符串仍在源码里
   *     → 断言被满足、套件全绿，而检查实际未运行；
   *   - 从清单删条目 → 断言的文件名串仍存在于**注释**中 → 套件全绿。
   * 纯子串匹配无法区分「调用点」与「注释/死分支」。故本用例改为**真的加载模块并
   * 执行判据**：只有「函数存在且真的能发现问题」才能通过。
   * `import.meta.main` 守卫保证加载本模块不会触发完整门禁（打包 + 隔离安装）。
   */
  const loadGate = async () => {
    const gatePath = join(repoRoot, "scripts", "development", "check-delivery-load.mjs");
    const mod = (await import(pathToFileURL(gatePath).href)) as {
      checkTypertCodecContract?: (options?: { packageDir?: string }) => Promise<string[]>;
    };
    expect(
      typeof mod.checkTypertCodecContract,
      "门禁脚本必须导出 checkTypertCodecContract（可执行判据；否则本用例无法验证它真的存在）",
    ).toBe("function");
    return mod.checkTypertCodecContract as (options?: { packageDir?: string }) => Promise<string[]>;
  };

  /**
   * 在包内建一个临时产物目录，跑完必删。
   *
   * 〔为什么不用 `os.tmpdir()`〕门禁会 `import` 这些产物，而产物 `import { z } from 'zod'`。
   * 放在系统临时目录时 Node 从那里向上找不到 `zod`（本包的依赖在
   * `packages/web/node_modules`），于是**每个**产物都报「无法 import」——判据失去
   * 鉴别力（真实故障被 import 失败掩盖）。放在包内则沿正常 node_modules 向上解析。
   * 目录名以 `.tmp` 结尾：`.gitignore` 的 `*.tmp` 覆盖它，不会污染 `git status`。
   *
   * @param run - 接收临时包目录的回调。
   */
  const withScratchArtifacts = async (
    run: (scratchPackageDir: string) => Promise<void>,
  ): Promise<void> => {
    const base = join(packageDir, ".tmp");
    mkdirSync(base, { recursive: true });
    const scratch = mkdtempSync(join(base, "codecgate-"));
    try {
      await run(scratch);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  };

  it("the codec gate really flags a bad artifact (执行判据，非读文本；BE-0b-ii 盲区 1)", async () => {
    const check = await loadGate();
    // 真实产物必须是干净的：否则下面的坏产物断言失去意义（门永远红）。
    expect(await check(), "真实产物应通过 codec 判据").toEqual([]);

    await withScratchArtifacts(async (scratch) => {
      const libScratch = join(scratch, "lib");
      mkdirSync(libScratch, { recursive: true });
      const hostSource = readFileSync(join(libDir, "typert.host.js"), "utf8");
      // `create: <thunk>` → `create: null`：形态仍是「有 create 键」，但值不可调用。
      // 这是「文本 grep 抓不到、只有执行判据能抓」的形态。
      writeFileSync(
        join(libScratch, "typert.host.js"),
        hostSource.replace(/create: soloips_web_[A-Za-z0-9_$]*,/g, "create: null,"),
      );
      writeFileSync(
        join(libScratch, "typert.remote-client.js"),
        readFileSync(join(libDir, "typert.remote-client.js"), "utf8"),
      );
      const violations = await check({ packageDir: scratch });
      expect(
        violations.length,
        "门禁必须能发现坏产物（否则它是假覆盖）——本断言即盲区 1 的解药",
      ).toBeGreaterThan(0);
      expect(violations.join("\n")).toContain("create()");
    });
  });

  it("the codec gate covers every typert.*.js artifact on disk (清单完整性；BE-0b-ii 盲区 2)", async () => {
    // 〔为什么用「文件系统枚举 vs 门禁覆盖面」而不是断言清单里有某字符串〕
    // QA 实测：从 TYPERT_HOST_ARTIFACTS 清单删掉 remote 条目后，spec 里
    // `toContain("typert.remote-client.js")` 仍被门禁**注释**中的同名字符串满足
    // → 套件绿，而该产物的 codec 形态完全不受检查。
    // 现在的判据是**行为性**的：磁盘上每个 `lib/typert.*.js` 产物都必须被门禁
    // 实际检查到——逐个产物单独破坏，门禁都必须报错。
    const check = await loadGate();
    const artifacts = readdirSync(libDir).filter((file) => /^typert\..*\.js$/.test(file));
    expect(artifacts.length, "应至少有一个 typert.*.js 产物").toBeGreaterThan(0);

    for (const artifact of artifacts) {
      await withScratchArtifacts(async (scratch) => {
        const libScratch = join(scratch, "lib");
        mkdirSync(libScratch, { recursive: true });
        // 只破坏这一个产物，其余原样复制——隔离出「该产物是否真被检查」。
        for (const file of artifacts) {
          const source = readFileSync(join(libDir, file), "utf8");
          writeFileSync(
            join(libScratch, file),
            file === artifact ? source.replace(/create: /g, "create_broken: ") : source,
          );
        }
        const violations = await check({ packageDir: scratch });
        expect(
          violations.length,
          `产物 ${artifact} 被破坏后门禁必须报错（否则它不在检查面内）`,
        ).toBeGreaterThan(0);
      });
    }
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
