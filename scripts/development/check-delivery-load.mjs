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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

/** 必须能被原生 Node 按包名导入的公开入口。 */
const entryPoints = [
  { package: "soloips-core", specifier: "soloips-core" },
  { package: "soloips-adapter-dsh", specifier: "soloips-adapter-dsh" },
  { package: "soloips-web", specifier: "soloips-web" },
  { package: "soloips-adapter-dsh", specifier: "soloips-adapter-dsh/contracts" },
  { package: "soloips-core", specifier: "soloips-core/contracts" },
];

/**
 * 尚未实现的入口：本切片（T01–T04）内 `soloips-web` 仍是骨架（`export {}`），
 * `./client` 属 T07。这些入口在实现前不可加载属预期——**显式列出而不是静默跳过**，
 * 以免它们永远不被纳入检查。
 */
const notYetImplemented = [
  { specifier: "soloips-web/client", reason: "客户端入口属 T07（T01 时未声明 dsh.client）" },
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

    process.stdout.write("\n尚未实现、按预期不可加载的入口（显式列出，非静默跳过）：\n");
    for (const entry of notYetImplemented) {
      process.stdout.write(`  SKIP ${entry.specifier} — ${entry.reason}\n`);
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
