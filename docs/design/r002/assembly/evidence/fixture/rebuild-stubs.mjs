#!/usr/bin/env node
// Restore the probe fixture home's synthetic stub packages.
//
// Why this exists: the probe fixture home contains 64 files under
// node_modules/ (synthetic stub packages across 7 profiles). The repo root
// .gitignore excludes node_modules/, so those files cannot be delivered by
// version control without silently producing an incomplete fixture. The
// non-node_modules fixture files ARE delivered under evidence/fixture/home/;
// this script restores the stubs verbatim from stubs.manifest.json, which was
// generated from the original fixture (not reconstructed by guesswork).
//
// Usage:
//   node evidence/fixture/rebuild-stubs.mjs <fixture-home-dir>
//
// Example:
//   node docs/design/r002/assembly/evidence/fixture/rebuild-stubs.mjs /tmp/r002-fixture-home

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const home = process.argv[2];

if (!home) {
  console.error("usage: node rebuild-stubs.mjs <fixture-home-dir>");
  console.error("  <fixture-home-dir> should already contain the copied evidence/fixture/home tree");
  process.exit(2);
}

const manifestPath = join(here, "stubs.manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const target = resolve(home);

let written = 0;
for (const [rel, contents] of Object.entries(manifest)) {
  const dest = join(target, ...rel.split("/"));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, contents);
  written += 1;
}

console.log(`restored ${written} stub files under ${target}`);
console.log(`manifest: ${manifestPath}`);
