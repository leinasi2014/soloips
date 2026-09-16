#!/usr/bin/env node
/**
 * 宿主面编译探针入口（r002 adapter 设计 · P5–P9）。
 *
 * 用途：对**已安装的 DSH 工件**做类型级核对，验证 adapter 依赖的宿主 seam 存在。
 * 它验证的是安装工件，不是 fork 源码或邻仓工作区——切换目标会改变结论的含义。
 *
 * 为什么需要这个脚本：`docs/design/r002/adapter/probe/*.json` 里的 `paths` 曾经用
 * 相对路径指向 `SOLOIPS_DEVS_ROOT`。探针目录入库时从
 * `.artifacts/operations/<批次>/probe/` 迁到 `docs/design/r002/adapter/probe/`，
 * 相对深度变了，路径静默解析到不存在的目录，探针整体退化成 TS2307
 * 「找不到模块」。TypeScript 的 JSON 配置**不会**展开 `$env:…`/`${…}`，
 * 机器绝对路径也不能入库，所以由本脚本在运行时解析目标位置并生成临时配置。
 *
 * 用法：
 *   node scripts/development/host-probe.mjs --target "$SOLOIPS_DEVS_ROOT/versions/r001"
 *   node scripts/development/host-probe.mjs --target <...>/runtime/node_modules
 *   node scripts/development/host-probe.mjs --case host --keep
 *
 * `--target` 可指向版本根、其 `runtime/node_modules`、或任意含 `@deepseek-ai/`
 * 的安装目录。退出状态：0 = 全部用例符合预期；1 = 有用例不符或前置条件不满足。
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const probeDir = join(repoRoot, "docs", "design", "r002", "adapter", "probe");
const tscMain = join(repoRoot, "node_modules", "typescript", "bin", "tsc");
const typeRoots = join(repoRoot, "node_modules", "@types");

/** 已入库配置中的占位符，由本脚本替换为实际安装位置。 */
const INSTALL_TOKEN = "__DSH_INSTALL__";

/**
 * 每个用例：配置文件名、期望的 tsc 退出状态语义、以及它证明什么。
 * `expectSuccess: false` 的用例是**对照**：它们必须失败，否则说明正向用例的
 * exit 0 只是「配置没生效」而不是「类型确实对得上」。
 */
const cases = [
  {
    name: "host",
    config: "tsconfig.host.json",
    expectSuccess: true,
    proves: "P5 宿主 seam 存在性（H1–H8）在已安装工件上成立",
  },
  {
    name: "host-control",
    config: "tsconfig.hostcontrol.json",
    expectSuccess: false,
    proves: "P6 对照：换成不存在的 seam 成员必须报错，证明 H8 读的是真实增强",
  },
  {
    name: "augment",
    config: "tsconfig.augment.json",
    expectSuccess: true,
    proves: "P7 服务增强点（declare module '@deepseek-ai/cordis'）可编译",
  },
  {
    name: "dev04",
    config: "tsconfig.dev04.json",
    expectSuccess: true,
    proves: "P8 core 侧依赖面只含 cordis（其余能力包被刻意指向不存在目录）",
  },
];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { target: null, keep: false, cases: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--keep") options.keep = true;
    else if (arg === "--target") options.target = argv[++index];
    else if (arg === "--case")
      options.cases = argv[++index].split(",").map((value) => value.trim());
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "usage: host-probe.mjs --target <version-root|node_modules> [--case name,...] [--keep]\n",
      );
      process.exit(0);
    } else fail(`Unknown argument: ${arg}`);
  }
  return options;
}

/**
 * 解析目标安装位置（ENV-02 的 `SOLOIPS_DEVS_ROOT` 由调用方经 `--target` 传入）。
 * 返回安装的 `node_modules` 目录。
 */
function resolveInstall(target) {
  if (!target) {
    fail(
      "缺少目标安装位置。传入 --target，指向版本根（含 runtime/）或其 node_modules：\n" +
        '  node scripts/development/host-probe.mjs --target "$SOLOIPS_DEVS_ROOT/versions/r001"\n' +
        "位置解析按 docs/operations/environment-handoff.md 的 ENV-02 执行；本脚本不猜机器路径。",
    );
  }
  const absolute = resolve(target);
  if (!existsSync(absolute))
    fail(`目标目录不存在：${absolute}\n请先按 ENV-02 核实实际版本目录，不要用未证实的路径。`);

  const candidates = [
    join(absolute, "runtime", "node_modules"),
    absolute,
    join(absolute, "node_modules"),
    dirname(absolute),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "@deepseek-ai"))) return candidate;
  }
  fail(
    `目标目录下找不到 @deepseek-ai 安装：${absolute}\n` +
      "已按「<target>/runtime/node_modules」「<target>」「<target>/node_modules」「<target>/..」依次查找。\n" +
      "请确认目标是已安装的 DSH 工件（而不是源码 checkout）。",
  );
}

/** 读出配置中被令牌标记的包，并在编译前逐个核实存在；缺失即清楚失败。 */
function assertTokenPackagesExist(config, installRoot, configName) {
  const missing = [];
  const seen = new Set();
  for (const values of Object.values(config.compilerOptions?.paths ?? {})) {
    for (const value of values) {
      if (!value.startsWith(INSTALL_TOKEN)) continue;
      const relative = value.slice(INSTALL_TOKEN.length + 1);
      // `paths` 可以以 `*` 结尾（如 `@deepseek-ai/*`）。此时要核实的是通配符之前
      // 的那一级目录（`@deepseek-ai`），而不是字面的 `*`。
      const literal = relative.split("*")[0].replace(/[/\\]+$/, "");
      const packagePath = resolve(installRoot, literal);
      if (seen.has(packagePath)) continue;
      seen.add(packagePath);
      if (!existsSync(packagePath)) missing.push(packagePath);
    }
  }
  if (missing.length > 0) {
    fail(
      `${configName} 需要的包在目标安装中缺失（${missing.length} 个）；未开始编译：\n` +
        missing.map((value) => `  - ${value}`).join("\n"),
    );
  }
}

/**
 * 在编译前核实探针文件实际 import 的每个官方包都已安装。
 *
 * `paths` 用 `@deepseek-ai/*` 通配符时，只能核实 `<install>/@deepseek-ai` 这一级
 * 存在；漏装的单个包要等 tsc 报 TS2307 才能发现。DEV-04 的宿主面探针要求
 * 「必要包缺失时编译前清楚失败」，所以这里按实际 import 逐个核对。
 */
function assertImportedPackagesExist(config, probeFiles, installRoot, configName) {
  const scope = join(installRoot, "@deepseek-ai");
  const missing = new Set();
  for (const file of probeFiles) {
    if (!existsSync(file)) fail(`${configName} 引用的探针文件不存在：${file}`);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+['"](@deepseek-ai\/[^'"]+)['"]/g)) {
      const specifier = match[1];
      // 只核对包名一级；`pkg/sub` 子路径由 tsc 按 exports 解析。
      const packageName = specifier.split("/").slice(0, 2).join("/");
      const packagePath = join(scope, packageName.slice("@deepseek-ai/".length));
      if (!existsSync(packagePath)) missing.add(packagePath);
    }
  }
  if (missing.size > 0) {
    fail(
      `${configName} 所需的官方包在目标安装中缺失（${missing.size} 个）；未开始编译：\n` +
        [...missing]
          .sort()
          .map((value) => `  - ${value}`)
          .join("\n"),
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(tscMain)) fail(`找不到 TypeScript：${tscMain}\n先在仓库根安装开发依赖。`);
  const installRoot = resolveInstall(options.target);

  const selected = options.cases
    ? cases.filter((entry) => options.cases.includes(entry.name))
    : cases;
  if (selected.length === 0)
    fail(`--case 未匹配任何用例。可选：${cases.map((c) => c.name).join(", ")}`);

  const workDir = mkdtempSync(join(tmpdir(), "soloips-host-probe-"));
  const results = [];
  process.stdout.write(`目标安装：${installRoot}\n临时配置：${workDir}\n\n`);

  try {
    for (const entry of selected) {
      const sourcePath = join(probeDir, entry.config);
      if (!existsSync(sourcePath)) fail(`缺少探针配置：${sourcePath}`);

      const raw = readFileSync(sourcePath, "utf8");
      if (!raw.includes(INSTALL_TOKEN)) {
        fail(
          `${entry.config} 不含占位符 ${INSTALL_TOKEN}，无法解析目标安装。\n` +
            "受版本控制的探针配置不得写入机器路径；请保留占位符形式。",
        );
      }
      // 探针配置必须保持严格 JSON：其他消费方（回归测试、工具）会直接 JSON.parse。
      let source;
      try {
        source = JSON.parse(raw);
      } catch (error) {
        fail(
          `${entry.config} 不是严格 JSON（${error.message}）。探针配置不放注释；说明写在 compile-receipt.md。`,
        );
      }
      assertTokenPackagesExist(source, installRoot, entry.config);
      const probeFiles = (source.include ?? []).map((value) => join(probeDir, value));
      assertImportedPackagesExist(source, probeFiles, installRoot, entry.config);

      // 生成临时配置：替换令牌，并把 baseUrl/include 锚定到探针目录，使
      // `__nonexistent-probe__` 之类的相对项语义与直接在该目录运行一致。
      const resolvedPaths = {};
      for (const [key, values] of Object.entries(source.compilerOptions.paths ?? {})) {
        resolvedPaths[key] = values.map((value) =>
          value.startsWith(INSTALL_TOKEN)
            ? value.replace(INSTALL_TOKEN, installRoot.replace(/\\/g, "/"))
            : value,
        );
      }
      const generated = {
        ...source,
        compilerOptions: {
          ...source.compilerOptions,
          baseUrl: probeDir.replace(/\\/g, "/"),
          // 配置位于临时目录，`types` 需显式指回仓库的 @types 才能解析 node。
          typeRoots: [typeRoots.replace(/\\/g, "/")],
          paths: resolvedPaths,
        },
        include: (source.include ?? []).map((value) => join(probeDir, value).replace(/\\/g, "/")),
      };
      const generatedPath = join(workDir, entry.config);
      writeFileSync(generatedPath, JSON.stringify(generated, null, 2));

      const run = spawnSync(process.execPath, [tscMain, "-p", generatedPath], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      const output = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
      const succeeded = run.status === 0;
      results.push({
        name: entry.name,
        exit: run.status,
        ok: succeeded === entry.expectSuccess,
        expectSuccess: entry.expectSuccess,
        proves: entry.proves,
        output,
      });
      process.stdout.write(`── ${entry.name} (${entry.config})\n${output || "(无输出)"}\n\n`);
    }
  } finally {
    if (options.keep) process.stdout.write(`保留临时配置：${workDir}\n`);
    else rmSync(workDir, { recursive: true, force: true });
  }

  process.stdout.write("用例       期望      实际    结果\n");
  let failures = 0;
  for (const result of results) {
    const expected = result.expectSuccess ? "成功" : "失败";
    const actual = result.exit === 0 ? "成功" : "失败";
    if (!result.ok) failures++;
    process.stdout.write(
      `${result.name.padEnd(12)} ${expected.padEnd(8)} ${String(actual).padEnd(6)} ${result.ok ? "符合" : "不符"}\n`,
    );
  }
  process.stdout.write(
    `\n${results.length - failures}/${results.length} 符合预期；证据边界：仅编译期，未装配、未启动服务、未调用模型。\n`,
  );
  if (failures > 0) {
    // 失败时点明对照用例的意义，避免把「配置没生效」误读为通过。
    process.stdout.write("不符的用例见上方 tsc 输出；对照用例不符通常意味着 paths 未生效。\n");
    process.exit(1);
  }
}

main();
