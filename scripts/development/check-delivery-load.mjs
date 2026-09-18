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
import { fileURLToPath, pathToFileURL } from "node:url";

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

/**
 * Host 侧 Typert 生成物的**文件名形态**：本门据此从文件系统**枚举**待检产物，
 * 而不是依赖一份手写清单。
 *
 * 〔为什么按文件名枚举而不是维护清单（BE-0b-ii 盲区 2）〕
 * 前一版把产物写成显式清单 `TYPERT_HOST_ARTIFACTS`，于是「从清单删一条」就能
 * 让该产物的 codec 形态**完全不受检查**（QA 实测：删掉 remote 条目后，单独
 * 变异 remote 产物 → 门 exit 0）。清单是**手写事实**，会与磁盘现实漂移；
 * 按文件名 glob 枚举则是**从现实读取**——新增 `lib/typert.*.js` 产物自动进入
 * 检查面，无需任何人记得改清单。
 *
 * 〔约束〕命名形态来自上游生成器的硬约定（`WorkspaceTypertGenerator.validateExport`：
 * 产物必须是 `lib/typert.<face>.{js,d.ts}`），不是本仓的任意选择。
 * `typert.remote-client.js` 亦匹配 `typert.*.js`。
 */
const TYPERT_ARTIFACT_PATTERN = /^typert\..*\.js$/;

/** 已知产物 → 描述符容器键与导出名；未知产物按 `face` 推导。 */
const TYPERT_ARTIFACT_SHAPES = {
  "typert.host.js": {
    exportName: "TYPERT",
    descriptorsKey: "invocations",
    // Host face 才有 `schemas`（运行时 `validateTypertManifest` 要求它是数组）；
    // Remote 贡献（TYPERT_REMOTE）只有 package + descriptors，无 schemas 字段。
    expectsSchemas: true,
  },
  "typert.remote-client.js": {
    exportName: "TYPERT_REMOTE",
    descriptorsKey: "descriptors",
    expectsSchemas: false,
  },
};

/**
 * 枚举 `packages/<name>/lib/` 下所有匹配 {@link TYPERT_ARTIFACT_PATTERN} 的产物。
 *
 * @param {string} packageDir - 包目录。
 * @returns {string[]} 产物文件名（排序稳定，便于输出比对）。
 */
function typertArtifactFiles(packageDir) {
  const libDir = join(packageDir, "lib");
  if (!existsSync(libDir)) return [];
  return readdirSync(libDir)
    .filter((entry) => TYPERT_ARTIFACT_PATTERN.test(entry))
    .sort();
}

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

/**
 * 断言 Host 侧 Typert 生成物的 codec 形态**匹配运行时的 `requireStrictCodec`**。
 *
 * ── 为什么需要它（BE-0b-ii 盲区 2）───────────────────────────────────────────
 * QA 实测：把 `packages/web/lib/typert.host.js` 的 `create:` 改回 `schema:`
 * （**正是 BE-0b-ii 修复的缺陷类**）→ `test` / `check:build-repro` /
 * `check:delivery-load` **全绿**。两个既有门禁都抓不到，原因不同：
 *   - `check:build-repro` 会**删除并重建**产物，因此它只会「治愈」这类变异
 *     （重建后自然是正确形态），而不是**检出**它——该门的语义是「构建可复现」，
 *     不是「磁盘上的产物正确」；
 *   - `check:delivery-load` 的入口 import 只覆盖模块图可加载性，而 codec 形态
 *     是**描述符内部字段**，import 成功不代表运行时校验通过；
 *     其 `--activation-log` 层读的是**已录制的**宿主 stderr 文本，对磁盘上
 *     此刻的坏产物不可见。
 *   对照：改 `lib/client.js` 的同一位点会被 `client-mount.spec` 抓到——因为
 *   该测试**真的执行**了 bundle。Host 半边此前没有等价的门。
 *
 * ── 为什么落在这里（而不是测试套件）─────────────────────────────────────────
 * 本门在 CI 中跑在 **build 之后**（`.github/workflows/verify.yml`），是这类
 * 「产物形态」缺陷唯一能被自动抓到的时机：`test` 跑在 build **之前**，产物
 * 可能尚未生成（`packages/web/tests/typert-artifacts.spec.ts` 头注释已说明
 * 该分工）。因此本检查放在 build 之后的门里。
 *
 * ── 判据形态：**真的 import 产物并执行运行时的同一判据**，而非文本 grep ──────
 * 运行时要求（fork `packages/typert/loader/src/index.ts:272-278` 的
 * `requireStrictCodec`）：
 *     codec.mode === 'strict' && typeof codec.create === 'function'
 * 本检查 import 产物后对**每个 invocation 的每个参数 codec 与 result codec**
 * 施加同一判据。不用正则匹配源码文本：文本可以出现 `create:` 而值不是函数
 * （如 `create: null`），只有执行判据才等价于运行时行为。
 *
 * ── 判据与运行时的对齐（BE-0b-ii 盲区 3：本门曾比运行时**宽**）───────────────
 * 运行时 `validateTypertManifest`（fork `packages/typert/loader/src/index.ts`）对
 * 每个 invocation 走 `requireArray(pkgName, invocation.parameters, ...)`
 * （源码 `:210`）：**`parameters` 不是数组即抛错**。
 * 前一版本门写 `descriptor?.parameters ?? []`，于是「描述符级 `parameters` 被改名
 * 为 `args`」时遍历空集、静默通过——QA 实测该变异下本门 exit 0，而真实运行时
 * **会抛错**。门比运行时宽 = 真实漏检，不是等价判据。现改为**非数组即 FAIL**，
 * 与运行时同语义。
 *
 * 〔为何不直接调运行时校验〕`@deepseek-ai/dsh-typert-loader` **不在本仓依赖面内**
 * （`packages/web/package.json` 未声明；本机从 web 锚点解析为 MODULE_NOT_FOUND），
 * 且 CI 上 fork 不可达。因此不新增依赖、不 import 运行时，而是**手抄判据**并
 * 用 `packages/web/tests/typert-artifacts.spec.ts` 的「运行时源码对齐断言」钉住
 * 抄写来源（该断言读 fork 不可用时跳过，见该用例注释）。
 *
 * ── 可测试性（盲区 1/2 的修法基础）───────────────────────────────────────────
 * 本函数**导出**（`export async function`），使测试能**执行**它而非读源码文本：
 * 对构造的坏产物调用它、断言返回非空违规列表。这同时证明「检查真实存在」与
 * 「检查真的能发现问题」，且不受注释/死代码影响。
 *
 * @param {object} [options] - 可选注入点（测试用）。
 * @param {string} [options.packageDir] - 被检包目录；默认 `packages/web`。
 * @returns {Promise<string[]>} 违规描述（空数组 = 通过）。
 */
export async function checkTypertCodecContract(options = {}) {
  const violations = [];
  /** 与运行时 `requireStrictCodec` 同形的单点判据。 */
  const inspectCodec = (codec, subject) => {
    if (typeof codec !== "object" || codec === null) {
      violations.push(`${subject}: codec 不是对象`);
      return;
    }
    if (codec.mode !== "strict") {
      violations.push(`${subject}: codec.mode 必须是 "strict"，实际 ${JSON.stringify(codec.mode)}`);
      return;
    }
    if (typeof codec.typeSymbol !== "string") {
      violations.push(`${subject}: codec.typeSymbol 必须是字符串`);
    }
    if (typeof codec.create !== "function") {
      // 这是 BE-0b-ii 的真实缺陷形态：生成器 alpha.1 产出 `schema`（直接持 zod
      // 对象），运行时（fork HEAD）要求 `create()`（惰性 thunk）。
      violations.push(
        `${subject}: codec 缺少可调用的 create()（运行时 dsh-typert-loader 的 ` +
          `requireStrictCodec 要求 typeof codec.create === 'function'）` +
          `——产物可能由旧版生成器（alpha.1 产出 codec.schema）生成`,
      );
      return;
    }
    // 更深一层：create() 必须真的能物化出带 parse 的 schema。只查
    // `typeof create === 'function'` 会放过「是函数但返回坏值」的形态。
    try {
      const materialized = codec.create();
      if (typeof materialized?.parse !== "function") {
        violations.push(`${subject}: create() 未返回带 parse 的 schema`);
      }
    } catch (error) {
      violations.push(`${subject}: create() 调用抛错：${String(error)}`);
    }
  };

  const packageDir = options.packageDir ?? join(repoRoot, "packages", "web");
  const packageLabel =
    packageDir === join(repoRoot, "packages", "web") ? "packages/web" : packageDir;
  const files = typertArtifactFiles(packageDir);
  if (files.length === 0) {
    // 一个 Typert 产物都没有：本检查对该包什么都没验证——假覆盖，必须失败。
    violations.push(`${packageLabel}/lib 下没有任何 typert.*.js 产物（本检查未覆盖任何 codec）`);
    return violations;
  }

  for (const file of files) {
    const shape = TYPERT_ARTIFACT_SHAPES[file];
    if (shape === undefined) {
      // 未知命名形态：不能静默跳过（那会让新增产物逃出检查面）。显式失败，
      // 提示补 TYPERT_ARTIFACT_SHAPES —— 或确认该文件不该匹配本模式。
      violations.push(
        `${packageLabel}/lib/${file} 匹配 typert 产物模式但未登记形态（${Object.keys(TYPERT_ARTIFACT_SHAPES).join(" / ")}）——` +
          `请补 TYPERT_ARTIFACT_SHAPES，否则该产物的 codec 形态不受检查`,
      );
      continue;
    }
    const path = join(packageDir, "lib", file);
    let module;
    try {
      module = await import(pathToFileURL(path).href);
    } catch (error) {
      violations.push(`${packageLabel}/lib/${file} 无法 import：${String(error)}`);
      continue;
    }
    const manifest = module[shape.exportName];
    if (typeof manifest !== "object" || manifest === null) {
      violations.push(`${packageLabel}/lib/${file}: 未导出 ${shape.exportName} 对象`);
      continue;
    }
    // schemas 面：仅 Host face 有该字段。与运行时一致——必须是数组
    // （`requireArray`），逐项须有 create()。
    if (shape.expectsSchemas) {
      if (!Array.isArray(manifest.schemas)) {
        violations.push(
          `${packageLabel}/lib/${file}: schemas 必须是数组（运行时 requireArray 同判）`,
        );
      } else {
        for (const schema of manifest.schemas) {
          if (typeof schema?.create !== "function") {
            violations.push(
              `${file}: TYPERT schema "${String(schema?.name)}" 缺少可调用的 create()`,
            );
          }
        }
      }
    }
    // 描述符面：与运行时一致——容器键必须是数组，且**每个描述符的 parameters
    // 必须是数组**（`requireArray`，源码 :210）；缺一即 FAIL，不再 `?? []` 兜底。
    const descriptors = manifest[shape.descriptorsKey];
    if (!Array.isArray(descriptors)) {
      violations.push(
        `${file}: ${shape.descriptorsKey} 必须是数组（运行时 requireArray 同判），实际 ${typeof descriptors}`,
      );
      continue;
    }
    if (descriptors.length === 0) {
      violations.push(
        `${file}: ${shape.descriptorsKey} 为空——本检查未覆盖任何 codec（形态变更或产物损坏？）`,
      );
      continue;
    }
    for (const descriptor of descriptors) {
      const id = String(descriptor?.id ?? "<无 id>");
      if (typeof descriptor !== "object" || descriptor === null) {
        violations.push(`${file}: 描述符不是对象`);
        continue;
      }
      const parameters = descriptor.parameters;
      if (!Array.isArray(parameters)) {
        // 盲区 3 的正是此处：`?? []` 会让「parameters 被改名」静默通过。
        // 运行时会抛 `typert-loader: ... parameters must be an array`。
        violations.push(
          `${file} "${id}": parameters 必须是数组（运行时 requireArray 同判；` +
            `typert-loader: ... parameters must be an array），实际 ${typeof parameters}`,
        );
      } else if (parameters.length === 0) {
        // 空参数集：对「无参方法」合法，但本包的 getStatus 有 1 个具名参数；
        // 不做数量断言（会随业务面变化），只保证下方遍历有实际覆盖。
        violations.push(`${file} "${id}": parameters 为空——本描述符的参数 codec 未被覆盖`);
      } else {
        parameters.forEach((parameter, index) => {
          inspectCodec(parameter?.codec, `${file} "${id}" parameter[${index}] codec`);
        });
      }
      inspectCodec(descriptor.result, `${file} "${id}" result codec`);
    }
  }
  return violations;
}

async function main() {
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

    // 0b) 产物形态：Host 侧 Typert codec 必须匹配运行时 `requireStrictCodec`。
    //
    // 放在 build 之后（本门在 CI 的位置即是）、隔离安装之前：它是**确定性**的
    // （只读磁盘上的产物），且正是「产物由哪个生成器版本产出」这类缺陷唯一
    // 可被自动检出的位置。`check:build-repro` 抓不到——它删产物再重建，
    // 属治愈而非检出；`test` 抓不到——它跑在 build 之前。
    // 详见 checkTypertCodecContract 的注释。
    const codecViolations = await checkTypertCodecContract();
    process.stdout.write("\nTypert codec 契约检查（产物形态 ⊆ 运行时 requireStrictCodec）：\n");
    if (codecViolations.length === 0) {
      process.stdout.write("  OK   全部 Host 侧 Typert 产物的 codec 均为可调用的 create() 形态\n");
    } else {
      for (const violation of codecViolations) process.stdout.write(`  FAIL ${violation}\n`);
      process.stdout.write(
        "\nHost 侧 Typert 产物的 codec 形态与运行时不符。运行时 " +
          "`dsh-typert-loader` 的 `requireStrictCodec` 要求\n" +
          "`codec.mode === 'strict'` 且 `typeof codec.create === 'function'`；不满足时该 entry 在宿主\n" +
          "冷启动时**激活失败**，而宿主只发 warning、退出码仍为 0（故必须在此显式失败）。\n" +
          "最常见原因：生成器版本与运行时契约不匹配——alpha.1 产出 `codec.schema`，alpha.2 产出\n" +
          "`codec.create`。请核对根 package.json 的 @deepseek-ai/dsh-typert-generator 钉版。\n",
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

// 〔约束〕仅在被直接执行时跑主流程。测试要 import 本模块以**执行**判据
// （见 checkTypertCodecContract 的可测试性说明），若此处无条件 `await main()`
// 会让 import 触发完整门禁（打包 + 隔离安装），既慢又污染测试语义。
// `import.meta.main` 在 Node 22.15+/24 可用（本仓 engines: ^22.19 || >=24）。
if (import.meta.main) await main();
