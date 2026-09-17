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

describe("T01 assembly contract: web defers dsh.client to T07", () => {
  it("ships no dsh.client while the client entry does not exist", () => {
    // 0.1.6 的实现：未声明 dsh.client 的包被 client-modules 安全跳过；
    // 但**声明了却没有 exports["./client"] 会抛错**
    // （"declares dsh.client but exports no ./client bundle"）。
    // 客户端实现属 T07，因此现在不得声明，否则指向不存在的文件。
    const manifest = readManifest("web");
    expect(existsSync(join(packagesRoot, "web", "src", "client")), "客户端入口尚不存在").toBe(
      false,
    );
    expect(manifest.dsh?.client, "T07 之前不得声明 dsh.client").toBeUndefined();
    expect(
      manifest.exports?.["./client"],
      "T07 之前不得暴露 ./client（会指向不存在的文件）",
    ).toBeUndefined();
  });

  it("keeps registerClient disabled until the client side exists", () => {
    // config.registerClient 控制 apply() 的运行行为，与 manifest 的安全跳过是两回事。
    const parsed = loadPatch(join(packagesRoot, "web", "cordis.patch.yml")) as {
      insert?: { config?: { registerClient?: boolean } }[];
    }[];
    const config = parsed.find((entry) => entry.insert)?.insert?.[0]?.config;
    expect(config?.registerClient, "T07 之前必须显式 false").toBe(false);
  });
});
