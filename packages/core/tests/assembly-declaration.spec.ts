import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { SOLOIPS_ADAPTER_SERVICE_NAME } from "soloips-adapter-dsh/contracts";

/**
 * core 的装配声明与其实现的一致性。
 *
 * 为什么需要它：`cordis.patch.yml` 的 `inject` 是**运行时装配契约**，而实现的
 * `ctx.inject([...])` 是代码事实。两者不一致时**不会报错**——0.1.6 下缺服务的行
 * 只保持 pending 并产生一条 warning，退出码仍是 0（MECH-06/SOLO-F04）。
 * 于是「patch 注入的服务名写错」表现为整包静默不工作，没有可依赖的失败信号。
 *
 * 本测试把这条一致性变成静态断言。它曾真实触发过一次：T01 草案写的是
 * `storageDomain`（当时的设想要走宿主 facility），T03 实现改为只经 adapter 的
 * `soloipsAdapter` 收敛存储能力，patch 未同步。
 */

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");
const patch = parseYaml(readFileSync(join(packageRoot, "cordis.patch.yml"), "utf8")) as {
  insert?: { id?: string; inject?: string[]; config?: Record<string, unknown> }[];
}[];

/** patch 里本包那一行的 inject（服务名数组）。 */
const injectedServices = patch
  .flatMap((entry) => entry.insert ?? [])
  .find((row) => row.id === "soloips-core")?.inject;
const declaredConfig = patch
  .flatMap((entry) => entry.insert ?? [])
  .find((row) => row.id === "soloips-core")?.config;

describe("core assembly declaration matches its implementation", () => {
  it("declares the adapter service as the only injected service", () => {
    expect(injectedServices).toEqual([SOLOIPS_ADAPTER_SERVICE_NAME]);
  });

  it("does not inject storageDomain (core's write path goes through the adapter)", () => {
    // 写进 inject 会让本行依赖一个 core 已不再使用的服务，并无谓扩大待就绪面；
    // 契约里也不存在 ctx.storageDomain 回退（SEAM-X1）。
    expect(injectedServices ?? []).not.toContain("storageDomain");
  });

  it("names the same service in code as in the patch", () => {
    // 反向断言：实现里确实 inject / get 了同一个常量（避免 patch 对而代码漏）。
    expect(source).toContain("ctx.inject([SOLOIPS_ADAPTER_SERVICE_NAME],");
    expect(source).toContain("ctx2.get(SOLOIPS_ADAPTER_SERVICE_NAME)");
  });

  it("declares every config key the implementation actually reads", () => {
    // 实现从 config 读 enabled / storageRoot / accountId / planCode / backend；patch
    // 必须全部给出，否则键缺失会走到 fail-closed 分支（storageRoot 或 accountId 缺失
    // 即不发布服务）。
    //
    // 〔为什么这份名单是手写的、且必须手写〕它是「实现读了哪些键」的**声明**，而
    // 实现是 `parseCoreConfig` + `entry` 的代码事实——两者之间没有机器可读的桥。
    // 从实现里正则抠键名会随写法变化静默失效（那比手写名单更危险）。故名单手写、
    // 由本断言强制：**新增一个 config 键 → 这里必须加一项 → patch 必须加一行**，
    // 三步缺一即红。`planCode`（BE-5 新增）正是被这条链拦下的一次真实漂移。
    const implementationKeys = ["enabled", "storageRoot", "accountId", "planCode", "backend"];
    for (const key of implementationKeys) {
      expect(
        Object.keys(declaredConfig ?? {}),
        `patch 的 config 缺少实现会读取的键：${key}`,
      ).toContain(key);
    }
  });

  it("planCode 的产品缺省与实现缺省一致（free；写空串会让未覆写部署不发布服务）", () => {
    // 〔本条钉住「初值语义」而不只是「键存在」〕上面那条只保证键在，不保证值合法。
    // `planCode` 若写成 `""`，`validatePlanCode` 会以 `SOLOIPS_CORE_CONFIG_INVALID`
    // 拒绝打开（fail-closed）——即每个未覆写该键的部署都不发布服务。这是与
    // storageRoot/accountId 的**关键差别**：那两个键**没有**安全缺省（空串即
    // 「未配置，应拒绝」），而 planCode 的缺省语义是 `free`（最严格计划）。
    // 两处（patch 与 store.ts 的 `?? "free"`）必须一致，故本断言把 patch 侧的值钉死。
    expect(declaredConfig?.["planCode"]).toBe("free");
  });

  it("keeps environment-specific values out of the product patch", () => {
    // storageRoot 与 accountId 都是部署值：产品定义只给空初值占位，实际值由部署层覆写
    // （design.md §5.4/§5.6：产品定义必须与环境无关）。
    expect(declaredConfig?.["storageRoot"]).toBe("");
    expect(declaredConfig?.["accountId"]).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 跨层：部署层重述 config 不得漏键（BE-5 第二补丁）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 装配层序（`profiles/soloips/cordis.patch.yml` 文件头）：`bundle patches → profile
 * patch → home patch → launcher patch`——**后写的层胜出**。
 *
 * 〔为什么需要这组断言〕0.1.6 的实测语义是「**给出 `config` 时整体替换**，省略
 * `config` 才保留原值」（`packages/bundle/cordis.patch.yml:17` 记录的探针 P4/P0）。
 * 于是**任何**给出 config 的重述层都必须列全键：漏一个键，该键在**该层胜出的
 * 部署**下就**静默丢失**——不报错、不告警，退回实现的缺省值。
 *
 * 这不是假设性风险：BE-5 新增 `planCode` 时，`profiles/soloips/cordis.patch.yml`
 * 的 core 行（只列 4 个键）正是这种形态——`planCode` 会被 profile 层整体替换掉，
 * 使「升到 pro」的部署静默按 free 运行，而当时**所有**测试仍绿（`assembly-declaration`
 * 只读产品 patch，不读 profile 层）。本组断言即为此类漂移而设。
 *
 * 〔为什么按「键集包含」而不是「键集相等」〕部署层**可以**多给键（那是它的职责：
 * 补环境相关值、加部署专属开关）。规则是**不得少**——「少」才是静默丢失。
 *
 * 〔为什么通配扫描而不是写死一个 profile〕规则是「**任何**重述层都必须列全键」，
 * 与「本仓有几个 profile」无关。写死一个路径等于给未来新增的 profile 留同一个
 * 静默失效口子——而那正是本组断言要消灭的缺陷类。本仓当前有两个 profile
 * （`soloips` / `development`），职责不同：前者重述 core/adapter 行，后者只重述
 * 官方 `agent-presets` 行。**未重述**产品行的层**跳过**（不是失败）——断言是
 * 「凡重述者必须列全」，不是「每个 profile 都必须重述」。
 */
const workspaceRoot = join(here, "..", "..", "..");

/**
 * 部署层的重述文件：`profiles/<name>/cordis.patch.yml`（**通配**）。
 *
 * 返回值按 profile 名分组，供断言逐文件施加规则并给出可定位的失败消息
 * （「哪个 profile 的哪一行漏了哪个键 / 哪个键的值与产品层不一致」）。
 */
function deploymentPatchFiles(): readonly {
  readonly name: string;
  readonly keys: ReadonlyMap<string, readonly string[]>;
  readonly configs: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}[] {
  const profilesRoot = join(workspaceRoot, "profiles");
  const found: {
    name: string;
    keys: ReadonlyMap<string, readonly string[]>;
    configs: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  }[] = [];
  for (const profileName of readdirSync(profilesRoot)) {
    const file = join(profilesRoot, profileName, "cordis.patch.yml");
    if (!existsSync(file)) continue;
    const parsed = parseYaml(readFileSync(file, "utf8")) as Parameters<typeof configsByRowId>[0];
    found.push({
      name: profileName,
      keys: configKeysByRowId(parsed),
      configs: configsByRowId(parsed),
    });
  }
  return found;
}

/**
 * 取某层 patch 里所有**声明了 config** 的行：行 id → config 键集。
 *
 * 两种形状都要认（本仓实际并存）：
 *  - 产品层用 `insert: [{ id, config }]`（能力包只 insert 自身行，SOLO-C04）；
 *  - 部署层用裸 `- id: … / config: …`（覆写已存在的行）。
 * 只认一种会让另一种的漏键**静默逃过**本断言——那正是要防的形状。
 */
function configKeysByRowId(
  entries: readonly {
    id?: string;
    insert?: { id?: string; config?: Record<string, unknown> }[];
    config?: unknown;
  }[],
): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, readonly string[]>();
  for (const [id, config] of configsByRowId(entries)) found.set(id, Object.keys(config));
  return found;
}

/**
 * 取某层 patch 里所有**声明了 config** 的行：行 id → **config 内容**（不只是键集）。
 *
 * 〔为什么键集不够（B-3）〕「键都在」不等于「值对」：`planCode: free → pro` 的漂移
 * 在只比键集的断言下**全绿**，而它是本片最需要拦住的漂移（部署实际生效的计划与
 * 产品定义不一致）。故值比对必须有自己的落点。
 *
 * 〔为什么与键集共用同一个解析器〕两者若各自实现一遍「哪些行算声明了 config」，
 * 形状判定就会有两份，其中一份漂移即让另一份静默失准。故本函数是唯一解析点，
 * `configKeysByRowId` 由它派生。
 */
function configsByRowId(
  entries: readonly {
    id?: string;
    insert?: { id?: string; config?: Record<string, unknown> }[];
    config?: unknown;
  }[],
): ReadonlyMap<string, Readonly<Record<string, unknown>>> {
  const found = new Map<string, Readonly<Record<string, unknown>>>();
  for (const entry of entries) {
    const rows = [...(entry.insert ?? []), { id: entry.id, config: entry.config }];
    for (const row of rows) {
      if (row.id === undefined) continue;
      if (row.config === undefined || typeof row.config !== "object" || row.config === null) {
        continue; // 不给 config 的行不参与（省略 config 即保留原值，无漏键风险）
      }
      found.set(row.id, row.config as Readonly<Record<string, unknown>>);
    }
  }
  return found;
}

/**
 * 产品层的行声明散在**各能力包自己的** patch 里（SOLO-C04：行 id 用包名前缀，
 * 每包只 insert 自身行）。故「产品层的键集」必须扫全部包，不能只读本包——
 * 只读本包会让 `soloips-adapter-dsh` 这类**他包行**的漏键逃过断言（本测试首版
 * 正是如此：`productKeys` 只有 `soloips-core`，adapter 那条断言因取不到产品键
 * 而显式抛错——被覆盖断言当场拦下）。
 */
function productKeysAcrossPackages(): ReadonlyMap<string, readonly string[]> {
  const merged = new Map<string, readonly string[]>();
  for (const [id, keys] of productConfigsAcrossPackages())
    merged.set(id, keys === undefined ? [] : Object.keys(keys));
  return merged;
}

/**
 * 产品层的行 config **内容**（行 id → config），跨全部包合并。
 *
 * 与 `productKeysAcrossPackages` 同源（后者由前者派生）——「哪些行算产品行」只有
 * 一个解析点，避免两份形状判定各自漂移。
 */
function productConfigsAcrossPackages(): ReadonlyMap<string, Readonly<Record<string, unknown>>> {
  const merged = new Map<string, Readonly<Record<string, unknown>>>();
  const packagesRoot = join(workspaceRoot, "packages");
  for (const packageName of readdirSync(packagesRoot)) {
    const file = join(packagesRoot, packageName, "cordis.patch.yml");
    if (!existsSync(file)) continue;
    const parsed = parseYaml(readFileSync(file, "utf8")) as Parameters<typeof configsByRowId>[0];
    for (const [id, config] of configsByRowId(parsed)) merged.set(id, config);
  }
  return merged;
}

describe("deployment layer must not drop config keys when it restates a row", () => {
  const productConfigs = productConfigsAcrossPackages();
  const productKeys = productKeysAcrossPackages();
  const deployments = deploymentPatchFiles();
  /** 产品层声明了 config 的行 id（这些行**若被部署层重述**，就必须列全键）。 */
  const restatableRowIds = [...productKeys.keys()];

  it("凡重述产品行的部署层，都列全了该行在产品层的每一个键", () => {
    // 〔判据〕「**凡出现重述的层都必须列全键**」——不是「每个 profile 都必须重述」。
    // 故：遍历每个部署文件 × 每个产品行；文件**没重述**该行 → 跳过（合法：如
    // `development` profile 的职责是开发预设，不重述 core/adapter 行）；
    // **重述了** → 逐键断言。失败消息带 profile 名与行 id，可直接定位。
    const checked: string[] = [];
    for (const deployment of deployments) {
      for (const rowId of restatableRowIds) {
        const deployed = deployment.keys.get(rowId);
        if (deployed === undefined) continue; // 未重述该行：跳过（不是失败）
        const product = productKeys.get(rowId);
        if (product === undefined) continue; // 不可达：rowId 取自 productKeys
        checked.push(`${deployment.name}:${rowId}`);
        for (const key of product) {
          expect(
            deployed,
            `${deployment.name} profile 的 ${rowId} 重述漏了键 "${key}"：` +
              "该键会被整体替换掉而静默丢失（产品层与实现均无补救）",
          ).toContain(key);
        }
      }
    }
    // 〔防空集假绿〕若通配失效（profiles 目录改名、无文件命中）或形状解析全空，
    // 上面整个循环**一次都不进入**、断言全绿——正是本项目记录过的假覆盖形状。
    // 故显式钉住「至少检查到一个（层, 行）组合」。用 `toContain` 而非全等：
    // 新增 profile / 新增重述行**不应**让本断言变红（那不是漂移）。
    expect(checked, "没有任何部署层重述被检查到（通配或解析失效 = 假绿）").toContain(
      "soloips:soloips-core",
    );
  });

  it("防空集：两侧解析都非空，且至少一个部署层重述了产品行", () => {
    expect([...productKeys.keys()], "产品层应声明 soloips-core").toContain("soloips-core");
    expect(deployments.length, "profiles/ 下应至少有一个 cordis.patch.yml").toBeGreaterThan(0);
    const restating = deployments.filter((deployment) =>
      restatableRowIds.some((rowId) => deployment.keys.has(rowId)),
    );
    expect(
      restating.map((deployment) => deployment.name),
      "至少一个部署层应重述产品行",
    ).toContain("soloips");
    for (const deployment of restating) {
      for (const rowId of restatableRowIds) {
        const deployed = deployment.keys.get(rowId);
        if (deployed === undefined) continue;
        expect(deployed.length, `${deployment.name} 的 ${rowId} 键集不得为空`).toBeGreaterThan(0);
      }
    }
  });

  it("重述 core 行的部署层：planCode 的**值**与产品层一致（升计划须改部署层，不是改产品层）", () => {
    // 〔语义〕重述层**胜出**产品层，故部署实际生效的是重述层的值。两处漂移（如产品层
    // 升 free→pro 而部署层仍 free）不会报错，但会让「产品定义说的计划」与「部署跑的
    // 计划」不一致。
    //
    // 〔B-3：为什么必须比值而不是只比键在不在〕初版只断言 `toContain("planCode")`
    // ——即「键在」，于是 `free → pro` 这类**值漂移全绿**。而值漂移恰恰是本片最需要
    // 拦住的：它是唯一能让「部署实际跑的计划」与「产品定义」分叉的改动，且不产生任何
    // 错误信号。故本断言取**产品层的值**作为基准，逐层比对（而非写死 `"free"`——
    // 写死会让「产品层与部署层同时升到 pro」这种合法改动变红）。
    const productCore = productConfigs.get("soloips-core");
    if (productCore === undefined) throw new Error("产品层未声明 soloips-core 行 config");
    const expectedPlan = productCore["planCode"];
    expect(expectedPlan, "产品层 soloips-core 应声明 planCode").toBeDefined();

    let checked = 0;
    for (const deployment of deployments) {
      const coreRow = deployment.keys.get("soloips-core");
      if (coreRow === undefined) continue; // 未重述 core 行的 profile 跳过
      checked += 1;
      expect(
        coreRow,
        `${deployment.name} profile 的 core 行应显式给出 planCode（漏了即被整体替换掉）`,
      ).toContain("planCode");
      expect(
        deployment.configs.get("soloips-core")?.["planCode"],
        `${deployment.name} profile 的 planCode 与产品层不一致：` +
          `部署实际生效的是本层的值，两者分叉即「产品定义说的计划」≠「部署跑的计划」`,
      ).toBe(expectedPlan);
    }
    expect(checked, "应至少有一个部署层重述了 core 行").toBeGreaterThan(0);
  });
});
