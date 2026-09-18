#!/usr/bin/env node
/**
 * 交付工件的**原生加载门禁**：打包 → 隔离安装 → 用原生 Node 逐个 import 公开入口。
 *
 * 为什么需要它：`tsc -b` 只看类型、lint 不看模块解析、vitest 走 Vite 解析器（能解析
 * 无扩展名相对导入）——三者都不会发现「产物在 Node ESM 下根本加载不了」。
 * 本门禁在装配验证中真实抓到过这类缺陷：源码的相对 import 缺 `.js` 扩展名，
 * `tsc` 原样输出，宿主加载时 `ERR_MODULE_NOT_FOUND`，三个包全部激活失败。
 *
 * 检查方式（依裁定）：不启动 DSH、不用 Vite/Vitest/tsx/自定义 loader、不做扩展名补全。
 * 从 tarball 隔离安装，然后按包名 import。
 *
 * 用法：
 *   node scripts/development/check-delivery-load.mjs [--keep]
 *
 * 退出状态：0 = 全部入口可加载；1 = 有入口失败或前置不满足。
 *
 * 证据边界：**通过只代表这些入口及其加载到的模块图能在 Node ESM 下导入**，
 * 不代表 DSH 装配、激活、工具调用或业务验收通过。懒加载分支不在覆盖内。
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

/**
 * 必须能被原生 Node 按包名导入的公开入口。
 *
 * 〔约束〕**每个 exports 子路径都要有一行**——不能只列包根入口。
 * 变异测试（BE-0a 补强，变异 #6）的背景：把 `zod` 从 `packages/web` 的
 * dependencies 删掉后六门全绿，因为 zod **只被** `lib/typert.host.js` 与
 * `lib/typert.remote-client.js` 这两个**子路径产物** import，而入口清单当时
 * 只有包根 `soloips-web`（它不 import zod）。
 *
 * ⚠ **仅加子路径入口并不能拦下该变异**（实测）：本门禁把 tarball 装进隔离
 * 消费者，而 pnpm 会把 `soloips-adapter-dsh` 所依赖官方包
 * （`@deepseek-ai/dsh-llm` / `dsh-chunked-list` / `dsh-session-projection` 等）
 * 自身依赖的 zod **提升**到 `node_modules/.pnpm/node_modules/zod`，于是
 * `soloips-web/typert` 的 import 被提升副本意外满足、**照常通过**。
 * （对照实验：手工隐藏该提升副本后，`soloips-web` 根入口仍 OK，而
 * `soloips-web/typert` 立即 `ERR_MODULE_NOT_FOUND`——证明子路径入口确实加载
 * zod，只是本地布局掩盖了缺声明。）
 *
 * 因此变异 #6 由 `checkDeclaredDependencies()`（见下）以**静态**方式拦下：
 * 直接比对产物说明符与 manifest 的 dependencies，不依赖解析运气。
 * 子路径入口在此**仍有独立价值**：它覆盖「子路径产物自身可加载」这一面。
 */
const entryPoints = [
  { package: "soloips-core", specifier: "soloips-core" },
  { package: "soloips-adapter-dsh", specifier: "soloips-adapter-dsh" },
  { package: "soloips-web", specifier: "soloips-web" },
  { package: "soloips-adapter-dsh", specifier: "soloips-adapter-dsh/contracts" },
  { package: "soloips-core", specifier: "soloips-core/contracts" },
  // BE-0a：web 的 Host 半边产物（生成物与其运行时依赖的加载面）。
  { package: "soloips-web", specifier: "soloips-web/typert" },
  { package: "soloips-web", specifier: "soloips-web/remote" },
];

/**
 * **浏览器产物**（Node 加载面不适用）：这些入口的产物是给 DSH 客户端模块加载器
 * 消费的闭包工厂（`window.__ModuleLoader__.load(...)`），在 Node 下必然失败
 * ——且**应当**失败：一个能在 Node 里跑起来的浏览器产物反而说明形态错了
 * （它没有依赖浏览器全局）。
 *
 * 为什么不并进 `entryPoints`：那会让「Node 可加载」这条断言失去意义。故单列并
 * 用**预期失败**断言它：期望非 0 退出，且 stderr 含 `expectStderr` 片段——后者
 * 是鉴别力的关键，它把「因等待浏览器全局而失败」与「因路径写错/产物缺失这类
 * 真实故障而失败」区分开。
 *
 * 翻转记录（2026-09-18，指挥）：本条原为 `notYetImplemented`（T01 时 client 半边
 * 未交付，属「尚未实现故不可加载」）。BE-0b-i 交付后语义变为「已实现但 Node 面
 * **不适用**」，故从 SKIP 列表移出并升级为可判定断言——从「未知」变为「已验证的
 * 预期失败」。
 */
const browserOnlyEntries = [
  {
    specifier: "soloips-web/client",
    expectStderr: "window is not defined",
    reason: "浏览器闭包工厂产物（依赖 window.__ModuleLoader__），Node 加载面不适用",
  },
];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { keep: false, activationLog: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--activation-log") options.activationLog = argv[++index];
    else if (arg === "--keep") options.keep = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "usage: check-delivery-load.mjs [--keep] [--activation-log <host cold-start stderr file>]\n",
      );
      process.exit(0);
    } else fail(`Unknown argument: ${arg}`);
  }
  return options;
}

function resolvePnpmCli() {
  const candidates = [
    process.env.npm_execpath,
    join(repoRoot, "node_modules", "pnpm", "bin", "pnpm.cjs"),
    ...(process.env.APPDATA
      ? [join(process.env.APPDATA, "npm", "node_modules", "pnpm", "bin", "pnpm.cjs")]
      : []),
  ].filter((value) => typeof value === "string" && value.length > 0);
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  fail("找不到 pnpm 的 JS 入口。请经 `pnpm run` 调用本脚本，或设置 npm_execpath。");
}

/**
 * 运行层激活检查：**逐 entry 断言宿主真的激活了它**。
 *
 * 为什么必须单列：宿主对「entry 存在但无法激活」只发 **warning**，进程退出码不受影响
 * （`app-boot` 的 `activationDiagnostic` 走 stderr）。因此只看 exit code 的门禁会漏掉
 * 装配失败——本项目就实测到过：`soloips-web` 的 entry 在生效树里，冷启动却报
 * "failed to import"，而进程照常运行。
 *
 * 判据取自宿主自己的诊断文本（`N entries did not activate` + 逐条 `<id>: ...`），
 * 不硬编码"必须具名导出 apply"——宿主接受的入口形式不止一种（如 `export default`）。
 */
function parseActivationFailures(stderr) {
  const lines = stderr.split(/\r?\n/);
  if (!lines.some((entry) => /did not activate/.test(entry))) return [];
  return lines
    .filter((entry) => /^[a-z0-9-]+ \([^)]*\): /.test(entry))
    .map((entry) => entry.trim());
}

/**
 * 列出 `lib/` 下全部 `.js` 产物里出现的**裸模块说明符**（非相对、非 node:）。
 *
 * 为什么要静态扫产物而不是只靠隔离安装的 import：实测（BE-0a 补强，变异 #6）
 * 证明「删掉 zod 依赖 → 隔离安装 → import 子路径」**不会失败**——因为
 * `soloips-adapter-dsh` 依赖的官方包（`@deepseek-ai/dsh-llm` /
 * `dsh-chunked-list` / `dsh-session-projection` 等）自身依赖 zod，pnpm 把它
 * **提升**到 `node_modules/.pnpm/node_modules/zod`，于是被提升的副本意外满足了
 * web 产物的 import。这种「靠邻居的传递依赖碰巧能跑」正是要拦下的隐患：
 * 它随无关包升级而静默失效，且 tarball 消费者按 `dependencies` 解析时拿不到保证。
 * 因此本门禁**直接比对产物说明符与包的 dependencies 声明**，不依赖解析运气。
 *
 * @param {string} libDir - 包的 `lib/` 目录。
 * @returns {Set<string>} 产物中出现的裸说明符集合。
 */
function bareSpecifiersIn(libDir) {
  const found = new Set();
  const pattern =
    /(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*['"]([^'"]+)['"]/g;
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.endsWith(".js")) continue;
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1] ?? match[2];
        if (specifier === undefined) continue;
        if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:"))
          continue;
        found.add(specifier);
      }
    }
  };
  walk(libDir);
  return found;
}

/** 取说明符的包名（处理 `@scope/name/subpath` 与 `name/subpath`）。 */
function packageNameOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/**
 * 断言每个包产物里用到的裸依赖都已在其 `dependencies` 中声明。
 *
 * 覆盖的是「生成物 import 了某包，但 manifest 没声明」这一**确定性的**故障：
 * 无论本机 node_modules 布局如何（hoist / 传递依赖），该不一致都成立。
 *
 * @returns {string[]} 违规描述（空数组 = 通过）。
 */
function checkDeclaredDependencies() {
  const violations = [];
  for (const name of ["core", "adapter-dsh", "web"]) {
    const packageDir = join(repoRoot, "packages", name);
    const libDir = join(packageDir, "lib");
    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ]);
    for (const specifier of bareSpecifiersIn(libDir)) {
      const packageName = packageNameOf(specifier);
      if (declared.has(packageName)) continue;
      violations.push(
        `packages/${name}: 产物 import "${specifier}"，但 dependencies 未声明 "${packageName}"`,
      );
    }
  }
  return violations;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  // 构建产物必须存在：exports 指向 lib/。
  for (const name of ["core", "adapter-dsh", "web"]) {
    if (!existsSync(join(repoRoot, "packages", name, "lib"))) {
      fail(`packages/${name}/lib 不存在，先运行 pnpm run build。`);
    }
  }

  const workDir = mkdtempSync(join(tmpdir(), "soloips-loadgate-"));
  const pnpmCli = resolvePnpmCli();
  try {
    // 0) 静态一致性：产物用到的裸依赖必须在 dependencies 里声明。
    //
    // 这一步放在隔离安装**之前**：它是确定性的（只读产物与 manifest），
    // 不依赖本机 node_modules 布局或 pnpm 的提升行为，因此能拦下
    // 「产物 import zod 但没声明 zod」这类靠邻居传递依赖碰巧能跑的问题
    // （BE-0a 补强，变异 #6；详见 checkDeclaredDependencies 的注释）。
    const dependencyViolations = checkDeclaredDependencies();
    process.stdout.write("产物依赖声明检查（产物 import ⊆ dependencies）：\n");
    if (dependencyViolations.length === 0) {
      process.stdout.write("  OK   全部产物的裸依赖均已在各自 dependencies 中声明\n");
    } else {
      for (const violation of dependencyViolations) process.stdout.write(`  FAIL ${violation}\n`);
      process.stdout.write(
        "\n产物使用了未声明的依赖。隔离安装可能因 pnpm 提升/传递依赖而**碰巧通过**，\n" +
          "但 tarball 消费者不享有该保证（无关包升级即静默失效）。请补进该包 dependencies。\n",
      );
      process.exit(1);
    }

    // 1) 打真实 tarball。
    const artifactDir = join(workDir, "artifacts");
    mkdirSync(artifactDir, { recursive: true });
    const pack = spawnSync(
      process.execPath,
      [
        join(repoRoot, "scripts", "development", "pack-delivery-artifacts.mjs"),
        "--out",
        artifactDir,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    if (pack.status !== 0) {
      fail(`打包失败：\n${pack.stdout ?? ""}${pack.stderr ?? ""}`);
    }
    const manifest = JSON.parse(readFileSync(join(artifactDir, "soloips-artifacts.json"), "utf8"));

    // 2) 隔离消费者目录：按工件装四包（含包间依赖的 overrides，否则会去 npm 找）。
    const consumerDir = join(workDir, "consumer");
    mkdirSync(consumerDir, { recursive: true });
    const dependencies = {};
    const overrides = {};
    for (const entry of manifest.artifacts) {
      const target = `file:./artifacts/${entry.file}`;
      dependencies[entry.package] = target;
      overrides[entry.package] = target;
    }
    writeFileSync(
      join(consumerDir, "package.json"),
      `${JSON.stringify({ name: "soloips-loadgate-consumer", version: "0.0.0", private: true, dependencies, pnpm: { overrides } }, null, 2)}\n`,
    );
    writeFileSync(
      join(consumerDir, "pnpm-workspace.yaml"),
      "packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n",
    );
    for (const entry of manifest.artifacts) {
      writeFileSync(join(artifactDir, entry.file), readFileSync(join(artifactDir, entry.file)));
    }
    mkdirSync(join(consumerDir, "artifacts"), { recursive: true });
    for (const entry of manifest.artifacts) {
      writeFileSync(
        join(consumerDir, "artifacts", entry.file),
        readFileSync(join(artifactDir, entry.file)),
      );
    }
    const install = spawnSync(process.execPath, [pnpmCli, "install", "--ignore-scripts"], {
      cwd: consumerDir,
      encoding: "utf8",
    });
    if (install.status !== 0) {
      fail(`隔离安装失败：\n${install.stdout ?? ""}${install.stderr ?? ""}`);
    }

    // 3) 原生 Node 按包名导入（不用 Vite/Vitest/tsx/loader）。
    const failures = [];
    for (const entry of entryPoints) {
      const probe = `await import(${JSON.stringify(entry.specifier)}).then(() => process.exit(0)).catch((error) => { console.error(error && error.message ? error.message.split("\\n")[0] : String(error)); process.exit(1); });`;
      const run = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
        cwd: consumerDir,
        encoding: "utf8",
      });
      const ok = run.status === 0;
      const detail = `${run.stderr ?? ""}`.trim().split("\n")[0] ?? "";
      process.stdout.write(
        `  ${ok ? "OK  " : "FAIL"} ${entry.specifier}${ok ? "" : ` — ${detail}`}\n`,
      );
      if (!ok) failures.push({ specifier: entry.specifier, detail });
    }

    // 浏览器产物：**预期失败**断言（非 0 退出 + stderr 含预期片段）。
    // 两个方向都查：既不能意外成功（说明没依赖浏览器全局=产物形态错了），
    // 也不能因别的原因失败（说明是真实故障，不是「Node 面不适用」）。
    process.stdout.write("\n浏览器产物入口（Node 加载面不适用；断言其**按预期失败**）：\n");
    for (const entry of browserOnlyEntries) {
      const probe = `await import(${JSON.stringify(entry.specifier)}).then(() => process.exit(0)).catch((error) => { console.error(error && error.message ? error.message.split("\\n")[0] : String(error)); process.exit(1); });`;
      const run = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
        cwd: consumerDir,
        encoding: "utf8",
      });
      const detail = `${run.stderr ?? ""}`.trim().split("\n")[0] ?? "";
      if (run.status === 0) {
        failures.push({
          specifier: entry.specifier,
          detail: `预期在 Node 下失败（${entry.reason}），实际却加载成功——产物可能未依赖浏览器全局`,
        });
        process.stdout.write(`  FAIL ${entry.specifier} — 意外加载成功\n`);
      } else if (!detail.includes(entry.expectStderr)) {
        failures.push({
          specifier: entry.specifier,
          detail: `失败原因不是预期的「${entry.expectStderr}」，而是：${detail}（可能是产物缺失/路径错误的真实故障）`,
        });
        process.stdout.write(`  FAIL ${entry.specifier} — ${detail}\n`);
      } else {
        process.stdout.write(`  OK   ${entry.specifier} — 按预期失败（${entry.expectStderr}）\n`);
      }
    }

    if (failures.length > 0) {
      process.stdout.write(
        `\n${failures.length} 个入口无法被原生 Node 加载。这表示**交付工件在目标运行时不可用**，\n` +
          "而不是测试环境问题——请检查相对导入的扩展名、exports 指向与 tarball 内容。\n",
      );
      process.exit(1);
    }
    process.stdout.write(
      "\n全部公开入口均可被原生 Node ESM 加载。\n" +
        "证据边界：只覆盖这些入口及其加载到的模块图；不代表 DSH 装配、激活、\n" +
        "工具调用或业务验收通过，也不覆盖懒加载分支。\n",
    );

    // 4) 运行层：若给了 --activation-log，断言宿主真的激活了每个 entry。
    //
    // 这一层不能省：宿主对「entry 在生效树里但无法激活」只发 warning、退出码不变，
    // 因此只看 exit code 会漏掉真实装配失败（本项目实测过）。
    if (options.activationLog !== null) {
      if (!existsSync(options.activationLog)) {
        fail(`--activation-log 指定的文件不存在：${options.activationLog}`);
      }
      const stderr = readFileSync(options.activationLog, "utf8");
      const activationFailures = parseActivationFailures(stderr);
      process.stdout.write("\n运行层激活检查（宿主诊断文本）：\n");
      if (activationFailures.length === 0) {
        process.stdout.write("  OK   无 entry 报告 did not activate\n");
      } else {
        for (const failure of activationFailures) process.stdout.write(`  FAIL ${failure}\n`);
        process.stdout.write(
          `\n${activationFailures.length} 个 entry 未能激活。宿主只把这写成 warning、不影响退出码，\n` +
            "所以这里必须显式失败——它表示该 entry 在目标运行时**没有生效**。\n" +
            "若该 entry 的实现确实不在本阶段范围内，应在阶段验收契约里登记为「已知未实现、非阻断」，\n" +
            "而不是把这里的失败改记为通过或跳过检查。\n",
        );
        process.exit(1);
      }
    } else {
      process.stdout.write(
        "\n运行层激活检查：**未执行**。\n" +
          "提供 --activation-log <宿主冷启动的 stderr> 可断言每个 entry 真的激活。\n" +
          "未提供时本门禁只覆盖「入口可被原生加载」，不覆盖「宿主实际激活」。\n",
      );
    }
  } finally {
    if (options.keep) process.stdout.write(`\n保留临时目录：${workDir}\n`);
    else rmSync(workDir, { recursive: true, force: true });
  }
}

main();
