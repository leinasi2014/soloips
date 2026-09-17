#!/usr/bin/env node
/**
 * 把四个 SoloIPs 包打成固定交付工件（tarball），并记录名称与 SHA-256。
 *
 * 用途：T04 的 `profiles/soloips/pnpm-lock.yaml` 必须是**交付锁**——引用带版本号的
 * 发布工件，而不是 `file:` 指向仓库内源码目录（SOLO-LAYER-06、DEV-02、design.md §5.4）。
 * 本脚本产出工件清单，供锁文件引用与独立安装校验。
 *
 * 工件落点与源码仓库**分开**：tarball 是构建产物（仓库已忽略 `lib/`），且会随代码
 * 改动失效；已发布的同名工件不得覆盖后沿用旧锁。因此默认输出到
 * `SOLOIPS_DEVS_ROOT/versions/<version>/artifacts/` 一类版本目录，不入源码 git。
 *
 * 用法：
 *   node scripts/development/pack-delivery-artifacts.mjs --out <dir> [--version <rNNN>]
 *
 * 退出状态：0 = 四包全部打包并写出清单；1 = 有包失败（不产出半份清单）。
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const packages = ["bundle", "adapter-dsh", "core", "web"];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { out: null, version: null };
  for (let index = 0; index < argv.length; index++) {
    // pnpm 会把分隔符 `--` 原样传下来，跳过它。
    if (argv[index] === "--") continue;
    if (argv[index] === "--out") options.out = argv[++index];
    else if (argv[index] === "--version") options.version = argv[++index];
    else if (argv[index] === "--help" || argv[index] === "-h") {
      process.stdout.write("usage: pack-delivery-artifacts.mjs --out <dir> [--version <rNNN>]\n");
      process.exit(0);
    } else fail(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

/**
 * 定位 pnpm 的 JS 入口，供 `node <pnpmCli> pack …` 直接调用。
 *
 * 直接 `spawnSync("pnpm", …)` 在 Windows 上必须走 shell（pnpm 是 .cmd），而经 shell
 * 拼接参数会触发 Node 的未转义参数告警。改用 JS 入口可避免，但该入口随安装方式不同，
 * 因此按 ENV-02 的「解析而非假定」处理，并给可执行的失败提示。
 */
function resolvePnpmCli() {
  const candidates = [
    // 经 `pnpm run <script>` 调用时由 pnpm 注入。
    process.env.npm_execpath,
    // 依赖装在开发根时（本仓库当前布局）。
    join(repoRoot, "node_modules", "pnpm", "bin", "pnpm.cjs"),
    // 全局安装（Windows 默认 npm 前缀）。
    ...(process.env.APPDATA
      ? [join(process.env.APPDATA, "npm", "node_modules", "pnpm", "bin", "pnpm.cjs")]
      : []),
  ].filter((value) => typeof value === "string" && value.length > 0);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  fail(
    "找不到 pnpm 的 JS 入口。请改用 `pnpm run pack-artifacts` 运行（会注入 npm_execpath），" +
      "或用 `--out` 之外的方式把 pnpm.cjs 路径经 npm_execpath 传入。",
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.out) {
    fail(
      "缺少 --out。工件必须落在源码仓库**之外**的版本目录，例如：\n" +
        '  node scripts/development/pack-delivery-artifacts.mjs --out "$SOLOIPS_DEVS_ROOT/versions/r002/artifacts"',
    );
  }
  const outDir = resolve(options.out);
  // 用**路径边界**判断，而不是字符串前缀：`D:\ws\soloips-t04-verify` 以
  // `D:\ws\soloips` 为前缀，却并不在仓库内——前缀比较会误拒合法的兄弟目录。
  const isInsideRepo = (candidate) => {
    const rel = relative(repoRoot, candidate);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  };
  if (isInsideRepo(outDir)) {
    fail(
      `--out 不得落在源码仓库内：${outDir}\n` +
        "工件是构建产物，会随代码改动失效；入库会让「锁引用的工件」与「仓库内容」纠缠不清。",
    );
  }
  mkdirSync(outDir, { recursive: true });
  const pnpmCli = resolvePnpmCli();

  // 打包前要求构建产物存在：exports 指向 lib/，缺它则工件不可用。
  const missingLib = packages.filter(
    (name) => !existsSync(join(repoRoot, "packages", name, "lib")) && name !== "bundle",
  );
  if (missingLib.length > 0) {
    fail(`以下包缺少构建产物 lib/，先运行 pnpm run build：${missingLib.join(", ")}`);
  }

  const manifest = [];
  for (const name of packages) {
    const packageDir = join(repoRoot, "packages", name);
    const before = new Set(readdirSync(outDir));
    const run = spawnSync(process.execPath, [pnpmCli, "pack", "--pack-destination", outDir], {
      cwd: packageDir,
      encoding: "utf8",
    });
    if (run.status !== 0) {
      fail(
        `打包 ${name} 失败（exit ${String(run.status)}）：\n${run.stdout ?? ""}${run.stderr ?? ""}`,
      );
    }
    const produced = readdirSync(outDir).filter(
      (file) => !before.has(file) && file.endsWith(".tgz"),
    );
    if (produced.length !== 1) {
      fail(
        `打包 ${name} 后预期恰好新增 1 个 tgz，实际 ${produced.length} 个：${produced.join(", ")}`,
      );
    }
    const tarball = join(outDir, produced[0]);
    const bytes = readFileSync(tarball);
    manifest.push({
      package: `soloips-${name}`,
      file: produced[0],
      bytes: statSync(tarball).size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  const manifestPath = join(outDir, "soloips-artifacts.json");
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ version: options.version ?? null, generatedFor: "profiles/soloips delivery lock", artifacts: manifest }, null, 2)}\n`,
  );

  process.stdout.write(`工件目录：${outDir}\n`);
  for (const entry of manifest) {
    process.stdout.write(
      `  ${entry.file}  ${String(entry.bytes).padStart(8)} B  ${entry.sha256.slice(0, 16)}…\n`,
    );
  }
  process.stdout.write(`清单：${manifestPath}\n`);
  process.stdout.write(
    "\n下一步：按此清单生成交付锁（见 scripts/development/README.md 的 T04 说明），\n" +
      "并用该锁在独立安装上下文执行冻结安装以验证可复现性。\n",
  );
}

main();
