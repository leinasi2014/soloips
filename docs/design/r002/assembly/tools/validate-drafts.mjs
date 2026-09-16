/**
 * 校验 drafts/ 下的草案文件是否满足 DSH 0.1.6 的形状契约。
 *
 * 检查项（对应 design.md §2.2 形状契约）：
 *   1. patch 文件顶层是 YAML 数组
 *   2. 每个数组项是映射
 *   3. `insert` 若出现必须是数组（N1：写成映射会在 parsePatchList 抛 TypeError）
 *   4. 非 insert 的 patch 必须有 id
 *   5. **insert 的行 id** 带 soloips- 前缀且全局唯一
 *   6. profile package.json 的 patchReload 显式存在且为 startup
 *   7. profile package.json 的 bundles 与 design.md §3.3 一致
 *
 * 【重要区分（SOLO-C04 的适用范围）】
 *   - **insert 的行**：必须带 soloips- 前缀（SOLO-LAYER-03「能力包必须只 insert
 *     自身前缀的 id」），且全局唯一 —— 重复 insert 同一 id 会静默塌缩。
 *   - **覆写 patch（`- id: X`）**：id 必须是**被覆写官方行的 id**，因此**不能**
 *     加 soloips- 前缀（加了就命中不到目标）。多个层顺序覆写同一既有 row 是
 *     **合法机制**（SOLO-FAIL-10：「所给字段后写覆盖前写」），不是重复定义。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRAFTS = join(HERE, "..", "drafts");
const RUNTIME = process.env.SOLOIPS_DEVS_ROOT + "/versions/r001/runtime";
const YAML = createRequire(RUNTIME + "/package.json")("yaml");

const problems = [];
const info = [];
const seenIds = new Map();
const overrideTargets = [];

function parsePatchFile(path) {
  let docs;
  try {
    docs = YAML.parseAllDocuments(readFileSync(path, "utf8"));
  } catch (error) {
    problems.push(`${path}: YAML 解析失败 — ${error.message}`);
    return;
  }
  for (const doc of docs) {
    if (doc.errors.length) {
      problems.push(`${path}: YAML 错误 — ${doc.errors[0].message}`);
      return;
    }
    const list = doc.toJS({ maxAliasCount: -1 });
    if (list === null || list === undefined) continue; // 纯注释文件
    // 检查 1
    if (!Array.isArray(list)) {
      problems.push(`${path}: 顶层必须是数组，实际 ${typeof list}`);
      continue;
    }
    for (const [i, item] of list.entries()) {
      // 检查 2
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        problems.push(`${path}: 第 ${i + 1} 项必须是映射`);
        continue;
      }
      // 检查 3（N1 硬约束）
      if ("insert" in item && !Array.isArray(item.insert)) {
        problems.push(
          `${path}: 第 ${i + 1} 项的 insert 必须是数组（实测会抛 ` +
            `TypeError: patch.insert?.forEach is not a function）`,
        );
      }
      // 检查 4
      if (!("insert" in item) && typeof item.id !== "string") {
        problems.push(`${path}: 第 ${i + 1} 项非 insert 但缺 id`);
      }
      // 检查 5：区分「insert 的行」与「覆写的目标行」
      const isInsert = Array.isArray(item.insert);
      const rows = isInsert ? item.insert : [];
      if (!isInsert && typeof item.id === "string") {
        // 覆写 patch：id 必须是官方行 id，记录为覆写目标
        overrideTargets.push({ id: item.id, file: path });
      }
      for (const row of rows) {
        if (!row || typeof row.id !== "string") continue;
        if (!row.id.startsWith("soloips-")) {
          problems.push(`${path}: insert 行 id "${row.id}" 未带 soloips- 前缀（SOLO-C04）`);
        }
        if (seenIds.has(row.id)) {
          problems.push(
            `${path}: insert 行 id "${row.id}" 重复（已见于 ${seenIds.get(row.id)}）— ` +
              `0.1.6 下静默取后者，前一条永不创建`,
          );
        } else {
          seenIds.set(row.id, path);
        }
        // name 必须是裸包名（client-modules 的 exactPackageSpecifier 要求）
        if (typeof row.name === "string" && !row.name.startsWith("cordis:")) {
          const parts = row.name.startsWith("@") ? row.name.split("/") : [row.name];
          const maxParts = row.name.startsWith("@") ? 2 : 1;
          if (parts.length > maxParts) {
            info.push(`${path}: 行 "${row.id}" 的 name 含子路径 — 客户端扫描将无法定位清单`);
          }
        }
      }
    }
  }
}

// ── 校验 patch 文件 ──────────────────────────────────────────────────────────

const patchFiles = [
  join(DRAFTS, "packages", "adapter-dsh", "cordis.patch.yml"),
  join(DRAFTS, "packages", "core", "cordis.patch.yml"),
  join(DRAFTS, "packages", "web", "cordis.patch.yml"),
  join(DRAFTS, "packages", "bundle", "cordis.patch.yml"),
  join(DRAFTS, "profiles", "soloips", "cordis.patch.yml"),
];

for (const f of patchFiles) {
  if (!existsSync(f)) {
    problems.push(`缺失草案文件: ${f}`);
    continue;
  }
  parsePatchFile(f);
}

// ── 校验 profile package.json ────────────────────────────────────────────────

const manifestPath = join(DRAFTS, "profiles", "soloips", "package.json");
if (!existsSync(manifestPath)) {
  problems.push(`缺失 ${manifestPath}`);
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const reload = manifest?.dsh?.profile?.patchReload;
  // 检查 6：必须显式存在且为 startup（默认值是 live）
  if (reload !== "startup") {
    problems.push(`profile patchReload 必须显式为 "startup"，实际 ${JSON.stringify(reload)}`);
  }
  // 检查 7：bundles 顺序
  const expected = [
    "@deepseek-ai/dsh-base",
    "@deepseek-ai/dsh-web-app",
    "@deepseek-ai/dsh-experimental-agent-team-profile",
    "@deepseek-ai/dsh-experimental-agent-team-web-profile",
    "soloips-adapter-dsh",
    "soloips-core",
    "soloips-web",
    "soloips-bundle",
  ];
  const actual = manifest?.dsh?.profile?.bundles ?? [];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    problems.push(`bundles 顺序与 design.md §3.3 不一致:\n  期望 ${JSON.stringify(expected)}\n  实际 ${JSON.stringify(actual)}`);
  }
  // 检查 8：soloips-bundle 必须最后
  if (actual[actual.length - 1] !== "soloips-bundle") {
    problems.push("bundles 最后一项必须是 soloips-bundle（SOLO-C01 最终装配位置）");
  }
  // 检查 9：三包必须在 bundles 中
  for (const pkg of ["soloips-adapter-dsh", "soloips-core", "soloips-web"]) {
    if (!actual.includes(pkg)) problems.push(`bundles 缺少 ${pkg}`);
  }
}

// ── 报告 ─────────────────────────────────────────────────────────────────────

console.log("=== 草案形状校验 ===");
console.log(`校验 patch 文件: ${patchFiles.length}`);
console.log(`insert 的 soloips-* 行 id: ${seenIds.size}`);
for (const [id, file] of [...seenIds.entries()].sort()) {
  console.log(`  ${id}  <- ${file.replace(DRAFTS, "drafts")}`);
}
console.log(`覆写的官方行目标: ${overrideTargets.length}`);
for (const t of overrideTargets) {
  console.log(`  ${t.id}  <- ${t.file.replace(DRAFTS, "drafts")}`);
}

if (info.length) {
  console.log("\n提示：");
  for (const m of info) console.log(`  - ${m}`);
}

if (problems.length) {
  console.log("\n问题：");
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log("\n✓ 全部检查通过");
