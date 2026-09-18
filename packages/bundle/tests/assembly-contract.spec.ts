import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

/**
 * T01 装配契约测试：四个包必须能被装进 profile 的 `bundles`。
 *
 * 为什么需要它：`adapter-dsh` / `core` / `web` 原先既无 `cordis.patch.yml` 也无
 * `dsh.bundle.patch` 声明。把这样的包放进 `bundles` 会在 **profile 解析期**直接抛错
 * （`loadProfileDirectory` 读 `package.json` 的 `dsh.bundle.patch`，缺失即
 * `declares no dsh.bundle`），整个 profile 起不来。解析期是 fail-loud 的，
 * 而这个错误只在真正装配时才暴露——所以在这里用静态断言提前固定。
 *
 * 同时固定 patch 的**形状契约**（design.md §2.2）：顶层是 YAML 数组、每项是映射、
 * `insert` 必须是数组且与 `id` 同级、行 id 一律 `soloips-*` 前缀。
 * 这几条都来自 0.1.6 实测：写错形状会在 parsePatchList 阶段抛错或让行静默丢失。
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const packagesRoot = join(repoRoot, "packages");

/** T01 之后四个包都必须具备装配声明。tools-pv 属 S1，不建占位（ARCH-D02）。 */
const assemblyPackages = ["adapter-dsh", "core", "web", "bundle"];

/** 用依赖树里的 YAML 解析器读 patch，避免自造解析。 */
function loadPatch(patchPath: string): unknown {
  return parseYaml(readFileSync(patchPath, "utf8"));
}

interface Manifest {
  name: string;
  exports?: Record<string, unknown>;
  files?: string[];
  dsh?: { bundle?: { patch?: string }; client?: unknown };
}

function readManifest(packageName: string): Manifest {
  return JSON.parse(
    readFileSync(join(packagesRoot, packageName, "package.json"), "utf8"),
  ) as Manifest;
}

describe("T01 assembly contract: every package declares dsh.bundle.patch", () => {
  it.each(assemblyPackages)(
    "packages/%s declares dsh.bundle.patch and ships the file",
    (packageName) => {
      const manifest = readManifest(packageName);
      expect(manifest.dsh?.bundle?.patch, `${packageName} 必须声明 dsh.bundle.patch`).toBe(
        "./cordis.patch.yml",
      );

      // 声明的文件必须真实存在，否则打包后不可达。
      const patchPath = join(packagesRoot, packageName, "cordis.patch.yml");
      expect(existsSync(patchPath), `${packageName}/cordis.patch.yml 必须存在`).toBe(true);

      // exports 必须显式暴露该文件（对照官方 dsh-web-app 的 exports 形状）。
      expect(
        manifest.exports?.["./cordis.patch.yml"],
        `${packageName} 的 exports 必须暴露 ./cordis.patch.yml`,
      ).toBe("./cordis.patch.yml");

      // files 必须包含它，否则 npm/pnpm 打包时不会带上。
      expect(manifest.files ?? [], `${packageName} 的 files 必须包含 cordis.patch.yml`).toContain(
        "cordis.patch.yml",
      );
    },
  );

  it("exposes ./package.json for every assembly package (host reads the manifest)", () => {
    for (const packageName of assemblyPackages) {
      const manifest = readManifest(packageName);
      expect(
        manifest.exports?.["./package.json"],
        `${packageName} 必须暴露 ./package.json（宿主据此读 manifest）`,
      ).toBe("./package.json");
    }
  });

  it("exposes a runtime entry only for packages that have one", () => {
    // bundle 是纯装配声明、无运行时代码（DEV-03 §2.2：无 src/index.ts），
    // 因此它**不应**有 "." 导出；三个能力包则必须各有 Host 入口。
    const manifest = readManifest("bundle");
    expect(manifest.exports?.["."], "bundle 不含运行时代码，不应暴露 .").toBeUndefined();

    for (const packageName of ["adapter-dsh", "core", "web"]) {
      const entry = readManifest(packageName);
      expect(entry.exports?.["."], `${packageName} 必须暴露 Host 入口 .`).toBeDefined();
    }
  });
});

describe("T01 assembly contract: patch shape (0.1.6 parser requirements)", () => {
  it.each(assemblyPackages)("packages/%s patch is a top-level YAML array", (packageName) => {
    const parsed = loadPatch(join(packagesRoot, packageName, "cordis.patch.yml"));
    // parsePatchList 强制顶层为数组，否则抛
    // "must be a top-level YAML array of loader patch entries"。
    expect(Array.isArray(parsed), `${packageName} 的 patch 顶层必须是数组`).toBe(true);
  });

  it.each(assemblyPackages)("packages/%s patch entries are mappings", (packageName) => {
    const parsed = loadPatch(join(packagesRoot, packageName, "cordis.patch.yml")) as unknown[];
    for (const entry of parsed) {
      expect(entry !== null && typeof entry === "object", `${packageName} 的每项必须是映射`).toBe(
        true,
      );
      expect(Array.isArray(entry), `${packageName} 的每项不能是数组`).toBe(false);
    }
  });

  it("keeps insert as an array alongside id (N1: never an object)", () => {
    // 写成映射会在 parsePatchList 阶段抛
    // "TypeError: patch.insert?.forEach is not a function"，整个 profile 加载失败。
    for (const packageName of assemblyPackages) {
      const parsed = loadPatch(join(packagesRoot, packageName, "cordis.patch.yml")) as {
        insert?: unknown;
      }[];
      for (const entry of parsed) {
        if ("insert" in entry && entry.insert !== undefined) {
          expect(Array.isArray(entry.insert), `${packageName} 的 insert 必须是数组`).toBe(true);
        }
      }
    }
  });

  it("prefixes every inserted row id with soloips- (SOLO-C04)", () => {
    const offenders: string[] = [];
    for (const packageName of assemblyPackages) {
      const parsed = loadPatch(join(packagesRoot, packageName, "cordis.patch.yml")) as {
        insert?: { id?: string; name?: string }[];
      }[];
      for (const entry of parsed) {
        for (const inserted of entry.insert ?? []) {
          if (!inserted.id?.startsWith("soloips-")) {
            offenders.push(
              `${packageName}: 插入的行 id 未使用 soloips- 前缀 -> ${String(inserted.id)}`,
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("gives each inserted row a bare package name (subpaths break resolution)", () => {
    // client-modules 用 exactPackageSpecifier 解析行名，带子路径会返回 undefined。
    const offenders: string[] = [];
    for (const packageName of assemblyPackages) {
      const parsed = loadPatch(join(packagesRoot, packageName, "cordis.patch.yml")) as {
        insert?: { name?: string }[];
      }[];
      for (const entry of parsed) {
        for (const inserted of entry.insert ?? []) {
          if (inserted.name !== undefined && inserted.name.includes("/")) {
            offenders.push(`${packageName}: 行 name 含子路径 -> ${inserted.name}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("assigns each row id to exactly one declarer across all packages (SOLO-C04 单写者)", () => {
    // 单行单写者：重复 id 在 0.1.6 下静默取后者且无日志（Loader 预检已删除）。
    const declarers = new Map<string, string[]>();
    for (const packageName of assemblyPackages) {
      const parsed = loadPatch(join(packagesRoot, packageName, "cordis.patch.yml")) as {
        id?: string;
        insert?: { id?: string }[];
      }[];
      for (const entry of parsed) {
        const ids = [entry.id, ...(entry.insert ?? []).map((item) => item.id)].filter(
          (id): id is string => typeof id === "string",
        );
        for (const id of ids) {
          declarers.set(id, [...(declarers.get(id) ?? []), packageName]);
        }
      }
    }
    const duplicated = [...declarers.entries()]
      .filter(([, owners]) => new Set(owners).size > 1)
      .map(([id, owners]) => `${id}: 由 ${[...new Set(owners)].join(", ")} 同时声明`);
    expect(duplicated).toEqual([]);
  });

  it("does not insert the bundle package's own row (bundle only overwrites)", () => {
    // SOLO-C04：本层不新增业务行；三行由各能力包自己 insert。
    const parsed = loadPatch(join(packagesRoot, "bundle", "cordis.patch.yml")) as {
      insert?: { id?: string }[];
    }[];
    const inserted = parsed.flatMap((entry) => (entry.insert ?? []).map((item) => item.id));
    expect(inserted).toEqual([]);
  });
});

describe("T01→T07 assembly contract: web declares dsh.client with a real client bundle", () => {
  // 〔翻转记录，2026-09-18，指挥〕本组原为「T07 之前不得声明 dsh.client」的**状态型
  // 断言**（断言「当前不存在」）。BE-0b-i（T07）交付浏览器半边后该前提被推翻，故按
  // 「正当同步翻转」改为断言**新事实**——保留为回归保护，**不是**删除。
  //
  // 为什么留在 bundle 测试：本组守的是**装配契约**（声明与产物必须一致），不是 web
  // 包的实现细节。该风险翻转后依然存在：声明了 dsh.client 却缺 ./client 产物会让宿主
  // 启动时抛 "declares dsh.client but exports no './client' bundle"（0.1.6 实测）；
  // 误删产物或改错 exports 同样会踩。
  it("declares dsh.client only together with an existing client entry and ./client export", () => {
    const manifest = readManifest("web");
    expect(existsSync(join(packagesRoot, "web", "src", "client")), "客户端入口必须存在").toBe(true);
    // dsh.client 与 ./client 必须**成对**成立：只有一方即宿主启动失败（见上）。
    const clientDeclaration = manifest.dsh?.client;
    const clientExport = manifest.exports?.["./client"];
    expect(
      clientDeclaration === undefined,
      "dsh.client 与 exports[./client] 必须成对出现（只有声明没有产物会抛错）",
    ).toBe(clientExport === undefined);
    expect(clientDeclaration, "T07 之后必须声明 dsh.client").toBeDefined();
    expect(clientExport, "T07 之后必须暴露 ./client").toBeDefined();
    // 产物路径必须被 files 覆盖，否则发布后 ./client 指向不存在的文件。
    const files: string[] = manifest.files ?? [];
    expect(
      files.some((entry) => entry.startsWith("lib/client")),
      "files 必须覆盖 client 产物",
    ).toBe(true);
  });

  it("keeps registerClient enabled now that the client side exists", () => {
    // config.registerClient 控制 apply() 的运行行为，与 manifest 的安全跳过是两回事。
    const parsed = loadPatch(join(packagesRoot, "web", "cordis.patch.yml")) as {
      insert?: { config?: { registerClient?: boolean } }[];
    }[];
    const config = parsed.find((entry) => entry.insert)?.insert?.[0]?.config;
    expect(config?.registerClient, "T07 之后必须显式 true").toBe(true);
  });
});
