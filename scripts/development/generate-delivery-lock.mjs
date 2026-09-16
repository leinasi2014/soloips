#!/usr/bin/env node
/**
 * 生成 `profiles/soloips/` 的**交付锁**：用固定工件（tarball）而非仓库内源码目录。
 *
 * 为什么需要它：T04 要求 profile 是可复现交付定义，其 `pnpm-lock.yaml` 必须是
 * **实际版本锁的唯一落点**（SOLO-C05），且依赖形态须用带版本号的发布工件，
 * 禁止 `file:` 指向个人目录或开发中工作副本（SOLO-LAYER-06、DEV-02、design.md §5.4）。
 *
 * 仓库内提交的 profile 用 `file:../../packages/*`，那是**开发形态**（便于本地联调）；
 * 它不能作为交付锁验收。本脚本在**仓库之外的交付上下文**里，用
 * `scripts/development/pack-delivery-artifacts.mjs` 产出的 tarball 生成交付锁并冻结安装验证。
 *
 * 用法：
 *   node scripts/development/generate-delivery-lock.mjs --artifacts <dir> --out <dir>
 *
 * 退出状态：0 = 交付锁生成且冻结安装通过；1 = 任一步失败。
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const profileSource = join(repoRoot, "profiles", "soloips");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { artifacts: null, out: null };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--") continue;
    if (argv[index] === "--artifacts") options.artifacts = argv[++index];
    else if (argv[index] === "--out") options.out = argv[++index];
    else if (argv[index] === "--help" || argv[index] === "-h") {
      process.stdout.write("usage: generate-delivery-lock.mjs --artifacts <dir> --out <dir>\n");
      process.exit(0);
    } else fail(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

/** 定位 pnpm 的 JS 入口；见 pack-delivery-artifacts.mjs 的同类说明。 */
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

function runPnpm(pnpmCli, args, cwd) {
  return spawnSync(process.execPath, [pnpmCli, ...args], { cwd, encoding: "utf8" });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.artifacts || !options.out) {
    fail(
      "缺少参数。需要 --artifacts（pack-delivery-artifacts.mjs 的输出目录）与 --out（交付上下文目录）。\n" +
        "  node scripts/development/generate-delivery-lock.mjs \\\n" +
        '    --artifacts "$SOLOIPS_DEVS_ROOT/versions/r002/artifacts" --out /tmp/soloips-delivery',
    );
  }
  const artifactDir = resolve(options.artifacts);
  const outDir = resolve(options.out);
  if (outDir.startsWith(repoRoot)) {
    fail(`--out 不得落在源码仓库内：${outDir}\n交付上下文是生成物，不入库。`);
  }
  if (!existsSync(join(artifactDir, "soloips-artifacts.json"))) {
    fail(
      `工件目录缺少 soloips-artifacts.json：${artifactDir}\n先运行 pack-delivery-artifacts.mjs。`,
    );
  }
  const manifest = JSON.parse(readFileSync(join(artifactDir, "soloips-artifacts.json"), "utf8"));
  const artifacts = new Map(manifest.artifacts.map((entry) => [entry.package, entry]));

  const outArtifacts = join(outDir, "artifacts");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outArtifacts, { recursive: true });

  // 交付上下文：profile 三件套 + 工件本体（相对路径引用，便于冻结安装校验）。
  const source = JSON.parse(readFileSync(join(profileSource, "package.json"), "utf8"));
  const packages = ["soloips-adapter-dsh", "soloips-core", "soloips-web", "soloips-bundle"];
  const dependencies = {};
  for (const name of packages) {
    const entry = artifacts.get(name);
    if (!entry) fail(`工件清单缺少 ${name}；清单内容：${[...artifacts.keys()].join(", ")}`);
    // 以相对路径引用工件本体，避免把机器绝对路径写进交付定义。
    dependencies[name] = `file:./artifacts/${entry.file}`;
    writeFileSync(join(outArtifacts, entry.file), readFileSync(join(artifactDir, entry.file)));
  }
  const deliveryManifest = { ...source, dependencies };
  writeFileSync(join(outDir, "package.json"), `${JSON.stringify(deliveryManifest, null, 2)}\n`);
  for (const file of ["cordis.patch.yml", "pnpm-workspace.yaml"]) {
    writeFileSync(join(outDir, file), readFileSync(join(profileSource, file)));
  }

  const pnpmCli = resolvePnpmCli();

  // 1) 生成交付锁。
  const lockOnly = runPnpm(pnpmCli, ["install", "--lockfile-only"], outDir);
  if (lockOnly.status !== 0) {
    fail(`生成交付锁失败：\n${lockOnly.stdout ?? ""}${lockOnly.stderr ?? ""}`);
  }
  const lockPath = join(outDir, "pnpm-lock.yaml");
  if (!existsSync(lockPath)) fail("生成交付锁后未找到 pnpm-lock.yaml。");

  // 2) 冻结安装校验：可复现性必须有实际安装证据，不能只看锁存在。
  const frozen = runPnpm(pnpmCli, ["install", "--frozen-lockfile"], outDir);
  if (frozen.status !== 0) {
    fail(`冻结安装失败（交付定义不可复现）：\n${frozen.stdout ?? ""}${frozen.stderr ?? ""}`);
  }

  const lock = readFileSync(lockPath, "utf8");
  // pnpm 在锁文件里会归一化路径（去掉开头的 `./`），因此接受 `artifacts/` 与 `./artifacts/` 两种写法。
  // 其余任何 `file:` 目标（源码目录、个人路径）都是违规——那正是 SOLO-LAYER-06 禁止的形态。
  const offenders = [...lock.matchAll(/file:([^\s("'}\]]+)/g)]
    .map((match) => match[1])
    .filter((target) => !target.replace(/^\.\//, "").startsWith("artifacts/"));
  if (offenders.length > 0) {
    fail(
      `交付锁仍含非工件引用（应为 artifacts/<tarball>）：\n${[...new Set(offenders)].join("\n")}\n` +
        "交付锁不得指向源码目录或个人路径（SOLO-LAYER-06）。",
    );
  }

  process.stdout.write(`交付上下文：${outDir}\n`);
  process.stdout.write(`交付锁：${lockPath}\n`);
  process.stdout.write(
    `  sha256 ${createHash("sha256").update(readFileSync(lockPath)).digest("hex")}\n`,
  );
  process.stdout.write("工件（锁引用）：\n");
  for (const [name, entry] of artifacts) {
    process.stdout.write(`  ${name}  ${entry.file}  ${entry.sha256.slice(0, 16)}…\n`);
  }
  process.stdout.write(
    "\n已用同一交付锁完成一次冻结安装（可复现性证据）。\n" +
      "该锁与工件留在交付上下文/版本目录；源码仓库中的 profile 仍为开发形态，二者不可混用。\n",
  );
}

main();
