/**
 * 提取官方 bundle patch 中「带 config 的行」与「只改 disabled 的行」清单。
 * 目的：为 SOLO-C03 的完整重述清单提供机器生成的权威输入，避免人工转录错误。
 * 只读：仅读取已安装的 0.1.6-alpha.1 官方 bundle 文件。
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const RUNTIME = process.env.SOLOIPS_DEVS_ROOT + "/versions/r001/runtime";
const require = createRequire(RUNTIME + "/package.json");
const YAML = require("yaml");

const targets = [
  ["@deepseek-ai/dsh-base", "cordis.patch.yml"],
  ["@deepseek-ai/dsh-web-app", "cordis.patch.yml"],
  ["@deepseek-ai/dsh-experimental-agent-team-profile", "cordis.patch.yml"],
  ["@deepseek-ai/dsh-experimental-agent-team-web-profile", "cordis.patch.yml"],
];

const byId = new Map();
const inserted = new Map();

for (const [pkg, file] of targets) {
  const path = `${RUNTIME}/node_modules/${pkg}/${file}`;
  const docs = YAML.parseAllDocuments(readFileSync(path, "utf8"));
  for (const doc of docs) {
    const list = doc.toJS({ maxAliasCount: -1 });
    if (!Array.isArray(list)) continue;
    for (const patch of list) {
      if (patch.insert) {
        for (const row of patch.insert) {
          inserted.set(row.id, { pkg, row });
        }
        continue;
      }
      if (!patch.id) continue;
      const keys = Object.keys(patch).filter((k) => k !== "id");
      const rec = byId.get(patch.id) ?? { id: patch.id, layers: [] };
      rec.layers.push({ pkg, keys, configKeys: patch.config ? Object.keys(patch.config) : null });
      byId.set(patch.id, rec);
    }
  }
}

const withConfig = [...byId.values()].filter((r) => r.layers.some((l) => l.configKeys));
const disabledOnly = [...byId.values()].filter((r) => r.layers.every((l) => !l.configKeys));

console.log("### A. 被覆写且提供 config 的官方行（提供 config => 整体替换，必须重述全部键）");
for (const r of withConfig.sort((a, b) => a.id.localeCompare(b.id))) {
  const last = r.layers.filter((l) => l.configKeys).at(-1);
  console.log(`${r.id}\t[${last.pkg}]\t${last.configKeys.join(", ")}`);
}
console.log(`\ncount=${withConfig.length}`);

console.log("\n### B. 仅以 disabled 覆写的官方行（不提供 config => 原 config 保留）");
for (const r of disabledOnly.sort((a, b) => a.id.localeCompare(b.id))) {
  console.log(`${r.id}\t${r.layers.map((l) => `${l.pkg}:${l.keys.join("+")}`).join(" | ")}`);
}
console.log(`\ncount=${disabledOnly.length}`);

console.log("\n### C. insert 的官方行（含 config 的）");
for (const [id, v] of inserted) {
  if (v.row.config) console.log(`${id}\t[${v.pkg}]\t${Object.keys(v.row.config).join(", ")}`);
}
console.log(`\ninserted total=${inserted.size}`);
