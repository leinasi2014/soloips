/**
 * 生成「官方行完整重述清单」的机器可核对输入。
 *
 * 目的：SOLO-C03 要求覆写某行 config 时必须重述该行**全部** config 键。
 * 人工转录 160+ 行会出错，故从已安装的 0.1.6-alpha.1 官方 bundle 直接提取。
 *
 * 只读：仅读取 node_modules 下的官方 bundle 文件。
 * 输出：全部行的 id / 来源层 / config 键集合 / 是否被后续层覆写。
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const RUNTIME = process.env.SOLOIPS_DEVS_ROOT + "/versions/r001/runtime";
const require = createRequire(RUNTIME + "/package.json");
const YAML = require("yaml");

// 按 bundles 顺序：base → web-app → team-profile → team-web-profile
const BUNDLES = [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@deepseek-ai/dsh-experimental-agent-team-profile",
  "@deepseek-ai/dsh-experimental-agent-team-web-profile",
];

/** 收集每一行的最终 config 键集合，并记录覆写历史。 */
const rows = new Map(); // id -> { id, configKeys, insertedBy, overriddenBy[] }
const order = [];

function walk(list, layer) {
  for (const entry of list) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      if (typeof entry.id === "string") {
        const rec = rows.get(entry.id) ?? {
          id: entry.id,
          configKeys: null,
          insertedBy: null,
          overriddenBy: [],
        };
        if (entry.config !== undefined && !Array.isArray(entry.config)) {
          rec.configKeys = Object.keys(entry.config);
        }
        rows.set(entry.id, rec);
        if (!order.includes(entry.id)) order.push(entry.id);
      }
      // group 的 config 是子行数组
      if (Array.isArray(entry.config)) walk(entry.config, layer);
    }
  }
}

for (const pkg of BUNDLES) {
  const path = `${RUNTIME}/node_modules/${pkg}/cordis.patch.yml`;
  const docs = YAML.parseAllDocuments(readFileSync(path, "utf8"));
  for (const doc of docs) {
    const list = doc.toJS({ maxAliasCount: -1 });
    if (!Array.isArray(list)) continue;
    for (const patch of list) {
      if (patch.insert) {
        for (const row of patch.insert) {
          const rec = rows.get(row.id) ?? {
            id: row.id,
            configKeys: null,
            insertedBy: null,
            overriddenBy: [],
          };
          rec.insertedBy = pkg;
          if (row.config !== undefined && !Array.isArray(row.config)) {
            rec.configKeys = Object.keys(row.config);
          }
          rows.set(row.id, rec);
          if (!order.includes(row.id)) order.push(row.id);
          if (Array.isArray(row.config)) walk(row.config, pkg);
        }
        continue;
      }
      if (typeof patch.id !== "string") continue;
      const rec = rows.get(patch.id) ?? {
        id: patch.id,
        configKeys: null,
        insertedBy: null,
        overriddenBy: [],
      };
      rec.overriddenBy.push({
        pkg,
        keys: Object.keys(patch).filter((k) => k !== "id"),
        configKeys: patch.config ? Object.keys(patch.config) : null,
      });
      if (patch.config !== undefined && !Array.isArray(patch.config)) {
        rec.configKeys = Object.keys(patch.config);
      }
      rows.set(patch.id, rec);
      if (!order.includes(patch.id)) order.push(patch.id);
    }
  }
}

const all = order.map((id) => rows.get(id));
const withConfig = all.filter((r) => r.configKeys && r.configKeys.length);
const noConfig = all.filter((r) => !r.configKeys || !r.configKeys.length);
const overriddenWithConfig = all.filter((r) =>
  r.overriddenBy.some((o) => o.configKeys),
);

console.log(`# 官方行清单（0.1.6-alpha.1，bundle 层：${BUNDLES.join(" → ")}）`);
console.log(`总行数=${all.length}  有 config 的行=${withConfig.length}  无 config 的行=${noConfig.length}`);
console.log(
  `被后续 bundle 层覆写且带 config 的行=${overriddenWithConfig.length}\n`,
);

console.log("## A. 有 config 的官方行 —— 覆写任一行必须重述下列全部键");
console.log("id\t来源\tconfig 键");
for (const r of withConfig) {
  console.log(`${r.id}\t${r.insertedBy ?? "(覆写产生)"}\t${r.configKeys.join(", ")}`);
}

console.log("\n## B. 被后续 bundle 层以 config 覆写的行（官方内部已有的重述范例）");
for (const r of overriddenWithConfig) {
  for (const o of r.overriddenBy.filter((x) => x.configKeys)) {
    console.log(`${r.id}\t${o.pkg}\t${o.configKeys.join(", ")}`);
  }
}

console.log("\n## C. 无 config 的官方行（覆写时只给 disabled 等键即可，config 自动保留）");
for (const r of noConfig) {
  console.log(`${r.id}\t${r.insertedBy ?? "(覆写产生)"}`);
}

console.log("\n## D. 仅以 disabled 覆写的官方行");
for (const r of all) {
  const d = r.overriddenBy.filter((o) => o.keys.includes("disabled") && !o.configKeys);
  if (d.length) console.log(`${r.id}\t${d.map((x) => x.pkg).join(", ")}`);
}
