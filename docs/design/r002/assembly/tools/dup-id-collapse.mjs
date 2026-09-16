/**
 * 演示 0.1.6-alpha.1 下「重复 entry id」的实际后果。
 * 只用纯函数 composeEntries（不 boot、不启服务），再复现 vendor/loader
 * EntryGroup.update() 的 newMap 构造，观察重复 id 如何塌缩。
 */
import { createRequire } from "node:module";

const RUNTIME = "$SOLOIPS_DEVS_ROOT/versions/r001/runtime";
const require = createRequire(RUNTIME + "/package.json");
const { composeEntries } = await import(
  "file:///$SOLOIPS_DEVS_ROOT/versions/r001/runtime/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js"
);

// 两层 patch：第一层 insert 两行相同 id；第二层再 insert 一行相同 id。
const layers = [
  [
    {
      insert: [
        { id: "dup-row", name: "pkg-a" },
        { id: "dup-row", name: "pkg-b" },
      ],
    },
  ],
  [{ insert: [{ id: "dup-row", name: "pkg-c" }] }],
];

const composed = composeEntries(layers);
console.log("composed 行数:", composed.length);
console.log("composed:", JSON.stringify(composed));

// 复现 vendor/loader/src/config/group.ts update() 的索引构造
const newMap = Object.fromEntries(
  composed.map((options) => [options.id ?? Symbol("anonymous"), options]),
);
const ids = Reflect.ownKeys(newMap);
console.log("实际会创建的 entry id 数:", ids.length);
console.log("胜出者:", JSON.stringify(newMap["dup-row"]));
console.log(
  "\n结论：composed（dump 可见）与运行时实际挂载的 entry 数不一致 ——",
  `dump ${composed.length} 行，运行时 ${ids.length} 个 entry。`,
);
