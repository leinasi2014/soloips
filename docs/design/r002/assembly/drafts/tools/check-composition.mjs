#!/usr/bin/env node
/**
 * SoloIPs 组合回归门禁（草案）
 *
 * 目标位置建议：packages/bundle/tests/check-composition.mjs
 * 依据：SOLO-C06、SOLO-REG-01/02/04；设计正文见 design.md §6。
 *
 * 【门禁定位】只证明"配置组合"，**不证明**运行期行为。
 * 已知盲区（design.md §6.6）：
 *   M1 同值覆写不显示 patched by    M2 dump 不校验模块可解析性
 *   M3 pending 不在 dump 中         M4 dump ≠ 任意时点运行树
 *   M5 !!js 不求值                  M6 dump 会重写 <profile>/cordis.yml
 *
 * 【重要】本脚本调用 `--dump-config`，因此**会重写** <profile>/cordis.yml
 * （design.md §6.2.1）。它**不是**只读工具。
 *
 * 【未验证】本脚本**未经真实组合运行**（无授权装配）。其自身正确性
 * 须在实现切片验证；不得据本文件存在声称门禁已通过。
 *
 * 用法：
 *   node check-composition.mjs --home <DSH_HOME> --profile soloips \
 *        --dsh <path/to/dsh/lib/bin.js> [--update-baseline]
 */

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// ── 参数解析 ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { updateBaseline: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--update-baseline") {
      out.updateBaseline = true;
      continue;
    }
    if (!key.startsWith("--")) throw new Error(`unexpected argument: ${key}`);
    const name = key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[name] = argv[++i];
  }
  for (const required of ["home", "profile", "dsh"]) {
    if (!out[required]) throw new Error(`missing required --${required}`);
  }
  return out;
}

// ── dump 调用 ────────────────────────────────────────────────────────────────

/**
 * 运行一次 dump 并**分流** stdout / stderr。
 *
 * 〔实测 P18〕dump 模式**拒绝一切 app 参数**：
 *   `error: config dumps take no app arguments, got "--port" "1234"`
 * 因此**唯一正确形式**是 `--profile <name> --dump-config`（L2 另可加 --patch）。
 * 本函数刻意不传任何额外参数。
 *
 * 〔实测 P16〕dump 走 stdout，warn 走 stderr —— 必须分流，否则 warn 会污染 golden。
 *
 * 〔实测 P17〕dump **会重写** <profile>/cordis.yml。本函数不是只读操作。
 */
function runDumpSplit({ dsh, profile, mode, patches = [], home }) {
  const args = ["--profile", profile, mode];
  for (const p of patches) args.push("--patch", p);
  const res = spawnSync(process.execPath, [dsh, ...args], {
    encoding: "utf8",
    cwd: home,
    // DSH_HOME 必须显式传给子进程：cwd 不决定 home 解析
    // （home 优先级 = 显式 configured → 非空 DSH_HOME → ~/.dsh，SOLO-DATA-01）。
    // 不传会落到 ~/.dsh，导致 profile 找不到。
    env: { ...process.env, DSH_HOME: home },
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

// ── 归一化（design.md §6.4 规则 1–3）─────────────────────────────────────────

/**
 * 只归一化**明确列出**的机器差异字段，不做宽泛归一化（SOLO-FAIL-06）。
 *
 * 允许归一化：
 *   - `# ==` 来源标签中的绝对路径 -> 稳定标记
 *   - 行尾空白、CRLF
 * 禁止归一化：!!js 表达式、config 值、inject、行序、disabled。
 */
export function normalizeDump(text, { home, profileDir }) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      if (!line.startsWith("# == ")) return line.replace(/[ \t]+$/, "");
      let label = line.slice(5);
      // 只替换路径前缀，保留包名与 ", patched by ..." 结构
      if (profileDir) label = label.split(profileDir).join("<PROFILE>");
      if (home) label = label.split(home).join("<HOME>");
      return `# == ${label.replace(/[ \t]+$/, "")}`;
    })
    .join("\n");
}

// ── 结构化解析（用于 G1/G2/G3/G6）────────────────────────────────────────────

/**
 * 从 dump 中解析出 entry 行。
 * dump 是 YAML 文档 + `# ==` 注释分段；这里只做**保守**的行级解析，
 * 因为门禁需要的是 id/name/config 键集合，不是完整 YAML 语义。
 */
export function parseEntries(normalizedDump) {
  const lines = normalizedDump.split("\n");
  const entries = [];
  let current = null;
  let inConfig = false;

  for (const line of lines) {
    if (line.startsWith("# == ")) {
      if (current) entries.push(current);
      current = null;
      continue;
    }
    const idMatch = /^(\s*)- id:\s*(.+?)\s*$/.exec(line);
    if (idMatch) {
      if (current) entries.push(current);
      current = {
        id: idMatch[2].replace(/^['"]|['"]$/g, ""),
        indent: idMatch[1].length,
        name: null,
        configKeys: [],
        group: false,
      };
      inConfig = false;
      continue;
    }
    if (!current) continue;
    const nameMatch = /^\s+name:\s*(.+?)\s*$/.exec(line);
    if (nameMatch && current.name === null) {
      current.name = nameMatch[1].replace(/^['"]|['"]$/g, "");
      continue;
    }
    if (/^\s+group:\s*true\s*$/.test(line)) current.group = true;
    if (/^\s+config:\s*$/.test(line)) {
      inConfig = true;
      continue;
    }
    if (inConfig) {
      const keyMatch = /^(\s+)([A-Za-z0-9_-]+):/.exec(line);
      if (keyMatch && keyMatch[1].length > 0) current.configKeys.push(keyMatch[2]);
      else if (/^\S/.test(line)) inConfig = false;
    }
  }
  if (current) entries.push(current);
  return entries;
}

// ── 断言（design.md §6.5）────────────────────────────────────────────────────

const REQUIRED_SOLOIPS_ROWS = ["soloips-adapter-dsh", "soloips-core", "soloips-web"];

const failures = [];
const notes = [];
function check(ok, id, message) {
  if (ok) notes.push(`  ✓ ${id}`);
  else failures.push(`  ✗ ${id}: ${message}`);
}

export function runAssertions({ l2Normalized, l1Normalized, l2Stderr, l1Stderr, profileDir }) {
  const l2Entries = parseEntries(l2Normalized);

  // G1 —— entry id 唯一性（0.1.6 已删除 Loader 预检，我们必须自证）
  const idCounts = new Map();
  for (const e of l2Entries) idCounts.set(e.id, (idCounts.get(e.id) ?? 0) + 1);
  const dups = [...idCounts.entries()].filter(([, n]) => n > 1);
  check(
    dups.length === 0,
    "G1 entry id 唯一性",
    `重复 id: ${dups.map(([id, n]) => `${id}×${n}`).join(", ")}` +
      "（0.1.6 静默取后者，前一条永不创建）",
  );

  // G2 —— 期望行存在性（缺行不产生非零退出码）
  for (const id of REQUIRED_SOLOIPS_ROWS) {
    check(
      l2Entries.some((e) => e.id === id),
      `G2 期望行存在: ${id}`,
      "该行不在 L2 生效树中",
    );
  }

  // G3 —— 期望字段断言
  for (const id of REQUIRED_SOLOIPS_ROWS) {
    const entry = l2Entries.find((e) => e.id === id);
    if (!entry) continue;
    check(entry.name === id, `G3 name 指向: ${id}`, `实际 name=${String(entry.name)}`);
  }

  // G4 —— patchReload 显式性（默认值是 live，遗漏即静默）
  const manifestPath = join(profileDir, "package.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const raw = manifest?.dsh?.profile?.patchReload;
    check(
      raw === "startup",
      "G4 patchReload 显式 startup",
      `字段值=${JSON.stringify(raw)}（undefined 表示未显式声明，将静默获得 live）`,
    );
  } else {
    failures.push(`  ✗ G4: 找不到 profile manifest ${manifestPath}`);
  }

  // G5 —— stderr 为空（warn 即 patch 未命中/name 不匹配）
  const allowlist = [/^$/];
  const l1Lines = l1Stderr.split("\n").filter((l) => l.trim() && !allowlist.some((re) => re.test(l)));
  const l2Lines = l2Stderr.split("\n").filter((l) => l.trim() && !allowlist.some((re) => re.test(l)));
  check(l1Lines.length === 0, "G5a L1 stderr 为空", l1Lines.join(" | "));
  check(l2Lines.length === 0, "G5b L2 stderr 为空", l2Lines.join(" | "));

  // G6 —— dump 行数 == 去重后 id 数（N3：重复 id 时 dump 行数 > 运行 entry 数）
  check(
    l2Entries.length === idCounts.size,
    "G6 dump 行数 == 去重 id 数",
    `dump ${l2Entries.length} 行，去重后 ${idCounts.size} 个 id`,
  );

  return { entries: l2Entries, failures, notes };
}

// ── 主流程 ───────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  const home = resolve(args.home);
  const profileDir = join(home, "profiles", args.profile);
  const dsh = resolve(args.dsh);

  if (!existsSync(profileDir)) {
    console.error(`门禁前置失败：profile 目录不存在 ${profileDir}`);
    process.exit(2);
  }

  // L1：仅 bundle 层（SOLO-REG-01）
  const l1 = runDumpSplit({ dsh, profile: args.profile, mode: "--dump-default-config", home });
  if (l1.status !== 0) {
    console.error(`门禁前置失败：L1 dump 退出码 ${l1.status}`);
    console.error(l1.stderr.slice(0, 4000));
    process.exit(2);
  }

  // L2：bundle + profile + home + overlays（SOLO-REG-02）
  const l2 = runDumpSplit({ dsh, profile: args.profile, mode: "--dump-config", home });
  if (l2.status !== 0) {
    console.error(`门禁前置失败：L2 dump 退出码 ${l2.status}`);
    console.error(l2.stderr.slice(0, 4000));
    console.error("提示：若 profile 的 cordis.patch.yml 损坏，按 SOLO-ACC-01 改用 L1 诊断，"
      + "不得换一个 profile 重跑以绕开。");
    process.exit(2);
  }

  const l1Norm = normalizeDump(l1.stdout, { home, profileDir });
  const l2Norm = normalizeDump(l2.stdout, { home, profileDir });

  const { failures: assertFailures, notes: assertNotes } = runAssertions({
    l2Normalized: l2Norm,
    l1Normalized: l1Norm,
    l2Stderr: l2.stderr,
    l1Stderr: l1.stderr,
    profileDir,
  });

  // golden 比对（SOLO-REG-01/02）
  const baselineDir = join(profileDir, "baselines");
  const pairs = [
    ["L1", l1Norm, join(baselineDir, "L1.golden.txt")],
    ["L2", l2Norm, join(baselineDir, "L2.golden.txt")],
  ];

  const diffs = [];
  for (const [label, actual, goldenPath] of pairs) {
    if (args.updateBaseline) {
      mkdirSync(dirname(goldenPath), { recursive: true });
      writeFileSync(goldenPath, actual);
      console.log(`已更新基线 ${label}: ${goldenPath}`);
      continue;
    }
    if (!existsSync(goldenPath)) {
      diffs.push(`${label}: 基线不存在 ${goldenPath}`);
      continue;
    }
    const golden = readFileSync(goldenPath, "utf8");
    if (golden !== actual) diffs.push(`${label}: 与基线不同（需逐条解释）`);
  }

  console.log("\n断言：");
  for (const n of assertNotes) console.log(n);
  for (const f of assertFailures) console.log(f);

  if (diffs.length) {
    console.log("\n基线差异：");
    for (const d of diffs) console.log(`  ! ${d}`);
  }

  console.log("\n【门禁边界】本门禁只证明配置组合。已知盲区 M1–M6（design.md §6.6）；");
  console.log("pending 检测须另跑 G9（启动真实进程），dump 不能替代。");

  const failed = assertFailures.length > 0 || diffs.length > 0;
  process.exit(failed ? 1 : 0);
}

// Windows 路径必须经 pathToFileURL 归一化后才能与 import.meta.url 比较
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
