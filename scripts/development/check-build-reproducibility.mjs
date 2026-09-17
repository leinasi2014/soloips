#!/usr/bin/env node
/**
 * 生成物可复现门禁（BE-0a）：删生成物 → 重跑构建 → 逐文件比对字节。
 *
 * 为什么需要它：`build` 通过只证明「这次构建成功」，不证明「同一输入产出同一
 * 产物」。Typert 生成器把**源码位置**写进产物（`sourceLocation` 的
 * file/line/column），任何让行号漂移的改动都会改变字节——那属于**产物不稳定**，
 * 在交付时表现为「同样的源码打不出同样的工件」。本门禁把这条变成可执行证据。
 *
 * 做法（不使用任何测试框架，直接跑真实构建）：
 *   1. 跑一次 `pnpm run build`，记录生成物的 SHA-256；
 *   2. 删除生成物目录；
 *   3. 再跑一次 `pnpm run build`，记录同样的 SHA-256；
 *   4. 逐文件比对；任一不一致即失败（非 0 退出）。
 *
 * 覆盖范围 = `packages/web/lib` 下的全部文件（含 `lib/types` 的 tsc 产物）。
 * 证据边界：只证明**本机、本切片**的构建可复现；不证明跨平台字节一致
 * （不同 OS 的路径分隔符会进入产物），也不证明 DSH 能加载这些产物。
 *
 * 用法：
 *   node scripts/development/check-build-reproducibility.mjs [--keep-artifacts]
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

/** 被检查的生成物根：本切片只有 web 包进 tsdown 管线。 */
const artifactRoots = [join(repoRoot, "packages", "web", "lib")];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { keepArtifacts: false };
  for (const arg of argv) {
    if (arg === "--") continue;
    else if (arg === "--keep-artifacts") options.keepArtifacts = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write("usage: check-build-reproducibility.mjs [--keep-artifacts]\n");
      process.exit(0);
    } else fail(`Unknown argument: ${arg}`);
  }
  return options;
}

function runBuild() {
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, "node_modules", "typescript", "bin", "tsc"), "-b"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) fail(`tsc -b 失败：\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  // tsdown 的入口按包名解析（`tsdown/run`），不假定 pnpm 的 .pnpm 目录布局。
  const tsdownEntry = fileURLToPath(import.meta.resolve("tsdown/run"));
  const tsdown = spawnSync(process.execPath, [tsdownEntry], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (tsdown.status !== 0) fail(`tsdown 失败：\n${tsdown.stdout ?? ""}${tsdown.stderr ?? ""}`);
}

/** 递归列出目录下全部文件（相对路径排序，保证清单顺序稳定）。 */
function listFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory).sort()) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(root);
  return files;
}

function hashAll() {
  const hashes = new Map();
  for (const root of artifactRoots) {
    if (!existsSync(root)) fail(`生成物目录不存在：${root}（构建未产出预期产物）`);
    for (const file of listFiles(root)) {
      const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
      hashes.set(relative(repoRoot, file).replaceAll("\\", "/"), digest);
    }
  }
  return hashes;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  process.stdout.write("第 1 次构建…\n");
  runBuild();
  const first = hashAll();
  process.stdout.write(`  记录 ${String(first.size)} 个生成物\n`);

  if (options.keepArtifacts) {
    process.stdout.write("  （--keep-artifacts：保留第 1 次产物，不做删除）\n");
  } else {
    for (const root of artifactRoots) rmSync(root, { recursive: true, force: true });
    process.stdout.write("  已删除生成物目录\n");
  }

  process.stdout.write("第 2 次构建…\n");
  runBuild();
  const second = hashAll();
  process.stdout.write(`  记录 ${String(second.size)} 个生成物\n`);

  const differences = [];
  for (const [file, digest] of first) {
    const other = second.get(file);
    if (other === undefined) differences.push(`${file}: 第 2 次构建后**缺失**`);
    else if (other !== digest)
      differences.push(`${file}: 字节不一致\n    第 1 次 ${digest}\n    第 2 次 ${other}`);
  }
  for (const file of second.keys()) {
    if (!first.has(file)) differences.push(`${file}: 第 2 次构建**新增**（第 1 次没有）`);
  }

  if (differences.length > 0) {
    process.stderr.write(`\n生成物不可复现：${String(differences.length)} 个文件不一致\n`);
    for (const difference of differences) process.stderr.write(`  ${difference}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `\n生成物可复现：删产物 → 重跑构建 → ${String(second.size)} 个文件字节一致。\n` +
      "证据边界：只覆盖本机、本切片的构建；不覆盖跨平台字节一致，\n" +
      "也不代表 DSH 能加载这些产物（那属装配验证）。\n",
  );
}

main();
