import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { WorkspaceTypertGenerator } from "@deepseek-ai/dsh-typert-generator";
import { typertPlugin } from "@deepseek-ai/dsh-typert-generator/tsdown";
import { defineConfig, type TsdownPlugin, type UserConfig } from "tsdown";

/**
 * SOLOIPS-BUILD-TSDOWN
 *
 * 构建管线：把各包 `lib/types` 的 tsc 产物打成 `lib/` 的产物，并由 Typert 插件
 * 生成 `lib/typert.host.*` 与 `lib/typert.remote-client.*`。
 *
 * 为什么必须是**根**配置（而不是各包一个）：
 * 生成器的 workspace 模式在**工作区根**读 `tsconfig.host.json` 与
 * `tsconfig.client.json`（`analyzer.ts` 的 `hostConfig`/`clientConfig` 缺省值），
 * 并用 workspaceRoot 向上找 `tsconfig.host.json` 定根
 * （`tsdown-plugin.ts:workspaceRoot`）。故根配置是**必需**的，不是风格选择。
 *
 * 构建顺序契约：`tsc -b`（产 `lib/types`）→ `tsdown`（产 `lib/*.js` 与 Typert 产物）。
 * 顺序不可交换：生成器消费的是 tsc 产物
 * （`tsdown-plugin.ts` 的 `TSC_VERIFIED_INPUT = { checkDiagnostics: false }`）。
 * 两者由根 `package.json` 的 `build` 脚本串起来。
 *
 * `entry` 用 `lib/types/index.js`：`sourcePathForExport` 把包的 exports 目标
 * 反推回 `src/` 去读源码，`lib/types/**` 是该反推可识别的唯一形状。
 *
 * ── BE-0b-i：client face 接线 ──────────────────────────────────────────────
 * 本配置同时产出两个半边（两个 config 对象，见 {@link clientBundleConfig}）：
 *  - **Node 半边**（原样保留）：`lib/index.js` + Typert 生成物；
 *  - **浏览器半边**（新增）：`lib/client.js`——DSH `client-modules` 按
 *    package.json 的 `dsh.client` + `exports["./client"]` 找到并下发给页面的
 *    那个闭包工厂产物。
 *
 * 〔约束〕Typert 只跑 `faces: ["host"]`。client face **有意不选**：本切片的浏览器
 * 半边只挂载 Remote 贡献，不发布自己的 cordis 服务；而一旦生成器分析 client face
 * 并发现服务面，`validateExport` 会要求 `exports["./client/typert"]` 与
 * `lib/typert.client.{js,d.ts}`（`lib/index.js:4127-4134`）。在浏览器半边真正需要
 * 反射产物之前不声明空产物，属 fail-closed。届时须同时：加 exports/files、
 * 把 faces 改为 `["host", "client"]`，并按需补根 `tsconfig.client.json` 聚合。
 */

/** 浏览器 bundle 的插件 id（同时是 `__ModuleLoader__.load` 的注册键与页面模块表的行名）。 */
const CLIENT_PACKAGE_ID = "soloips-web";

/**
 * tsdown 追加在产物尾部的 sourcemap 尾注。
 *
 * 出处：DSH `packages/client/modules/src/index.ts:179` 的同名常量——宿主在把 bundle
 * 下发到页面之前会剥掉它（`prepareSource`），因此产物形态校验必须按**剥掉后**的
 * 可执行字节判断，否则会把宿主本来就会去掉的东西当成形态错误。
 */
const SOURCE_MAP_TRAILER = /(?:\r?\n)?\/\/# sourceMappingURL=[^\r\n]*(?:\r?\n)?$/;

/**
 * 页面模块表（shell seed）里的词表——**唯一允许留在 bundle 外**的说明符。
 *
 * 出处：DSH `packages/client/web/src/platform.ts` 的 `PLATFORM_MODULES`。浏览器
 * bundle 的 `require` 只能命中这张表（`client-modules/src/client/system.ts` 的
 * `makeRequire`：seed → 已物化模块 → 已注册工厂，三者皆无即抛）。因此
 * **不在表里的说明符必须内联**，否则页面启动时 `require` 必然抛错。
 *
 * 〔约束〕这份清单是**许可面**而非需求面：多列一项只会在真的 import 它时让该
 * 说明符走模块表（正确行为），少列一项则会把本该共享的单例（如 react）内联成
 * 第二份实例——那类缺陷只在运行时显形。故按上游全表声明，不按当前用量裁剪。
 */
const MODULE_TABLE_WORDS: readonly string[] = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-client-store",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-primitives",
  "@deepseek-ai/dsh-client-ui-dockkit",
];

/**
 * 物化 Host face 的 Typert 产物。
 *
 * 〔为什么需要〕浏览器半边以**运行时值**导入 `soloips-web/remote`
 * （`exports["./remote"]` → `lib/typert.remote-client.js`），该文件由 Typert 生成器
 * 写出；而生成器在 tsdown 里是挂在 Node 半边配置上的**插件**，其 `writeBundle` 与
 * 浏览器 bundle 的 rolldown 构建**并发**（`build-BxT2lm9L.mjs` 的
 * `Promise.all(configs.map(...))`）。冷构建（`lib/` 被删）时浏览器 bundle 会先于
 * 产物落盘去解析该路径 → 解析失败或内联到**上一轮**的陈旧字节。故在浏览器 bundle
 * 的 `buildStart`（先于任何模块解析）里先跑一次生成，把时序变成确定的：
 * **先物化，后打包**。
 *
 * 〔边界〕这不是第二份生成逻辑：Node 半边配置上的 `typertPlugin` 仍是权威步骤，
 * 它随后会重跑生成并写同样的字节（同一输入 → 同一输出，由 `check:build-repro`
 * 逐字节把关）。本函数只保证「浏览器 bundle 解析时磁盘上是最新产物」这一条件。
 *
 * 〔约束〕只在 client 配置的 `buildStart` 调用，**不在配置求值期**调用：配置文件被
 * import 即写盘会让测试与工具链产生意外副作用。故本函数在无参数时也保持惰性。
 *
 * @param workspaceRoot - 工作区根（含 `tsconfig.host.json`）。
 */
function materializeHostArtifacts(workspaceRoot: string): void {
  const generator = new WorkspaceTypertGenerator(workspaceRoot, { checkDiagnostics: false });
  for (const artifact of generator.generate(undefined, ["host"])) {
    const output = join(workspaceRoot, artifact.packageRoot, "lib");
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, `typert.${artifact.face}.js`), artifact.js);
    writeFileSync(join(output, `typert.${artifact.face}.d.ts`), artifact.dts);
    if (artifact.remote === undefined) continue;
    writeFileSync(join(output, "typert.remote-client.js"), artifact.remote.js);
    writeFileSync(join(output, "typert.remote-client.d.ts"), artifact.remote.dts);
    writeFileSync(join(output, "typert.remote-client.d.ts.map"), artifact.remote.dtsMap);
  }
}

/** 产物契约门与纯度门共享的插件名（测试按名定位，改动即契约变更）。 */
export const CLIENT_PURITY_PLUGIN = "soloips-web/client-bundle-purity";
/** 产物契约门的插件名（测试按名定位）。 */
export const CLIENT_ARTIFACT_PLUGIN = "soloips-web/client-artifact-contract";

/**
 * 浏览器产物里**不得**出现的服务端实现/凭据标识（验收条款 5）。
 *
 * 判据取「Host 半边的实现符号 + 存储/账户配置键 + 后端驱动名」：任何一项出现都
 * 说明服务端实现或凭据形态被打进了浏览器产物。
 */
const FORBIDDEN_CLIENT_MARKERS: readonly string[] = [
  "SoloipsWebHost",
  "soloipsCore",
  "storageRoot",
  "accountId",
  "better-sqlite3",
  "drizzle",
];

/**
 * 浏览器 bundle 的**纯度门**：把「哪些说明符可以留在 bundle 外、哪些必须内联、
 * 哪些一律禁止」变成构建期错误，而不是等到页面启动才 `require` 落空。
 *
 * 与 DSH `packages/client/tsdown.client.ts` 的 `dsh-client-bundle-purity` 同向，
 * 但口径更窄（本包没有跨插件服务协作面）：
 *  - 页面模块表词表 → 外部（模块表应答）；
 *  - 本包自我引用 `soloips-web/remote` → 内联（生成的贡献，内联就是目的）；
 *  - 其余 `@deepseek-ai/*`、其他 `soloips-*`、`node:` 内置 → **构建失败**。
 *    这三类正是「跨包值耦合」与「服务端实现泄进浏览器」的入口形态。
 *
 * @returns 一个 rolldown 兼容的 resolveId 门。
 */
function clientBundlePurityGate(): TsdownPlugin {
  return {
    name: CLIENT_PURITY_PLUGIN,
    resolveId(source: string) {
      if (source.startsWith("node:")) {
        throw new Error(
          `client bundle purity: "${source}" 是 Node 内置模块，不得进入浏览器产物（验收条款 5）。`,
        );
      }
      if (source === `${CLIENT_PACKAGE_ID}/remote`) return null;
      if (source.startsWith("@deepseek-ai/") || source.startsWith("soloips-")) {
        if (MODULE_TABLE_WORDS.includes(source)) return null;
        throw new Error(
          `client bundle purity: "${source}" 既不在页面模块表（shell seed）中，也不是本包自我引用的 ` +
            `"${CLIENT_PACKAGE_ID}/remote"` +
            "——浏览器半边的跨插件协作一律经 cordis 服务（DEV-04）；" +
            "值导入其他能力包会内联出第二份运行时实例，或产生模块表无法应答的 require。",
        );
      }
      return null;
    },
  };
}

/**
 * 产物契约门：`dsh.client` 声明与 `exports["./client"]` 指向的产物必须**真的存在**
 * 且形态正确——这是 DSH `client-modules` 在宿主启动时那条硬校验
 * （`declares dsh.client but exports no "./client" bundle`，`src/index.ts:790-793`）
 * 的**构建期镜像**，使「声明了却没有产物」在本仓即可判定失败，而不必等宿主启动。
 *
 * 〔判据来源〕产物路径**从 manifest 的 `exports["./client"]` 读**，而不是写死
 * `lib/client.js`：宿主读的就是这个字段（`clientExportOf`，`src/index.ts:183-194`），
 * 写死会让门与实际交付契约分叉——把 exports 改指别处时门仍绿，而宿主会红。
 *
 * @param packageDir - `soloips-web` 包目录（绝对路径）。
 * @returns 一个 rolldown 兼容的 writeBundle 门。
 */
function clientArtifactContractGate(packageDir: string): TsdownPlugin {
  return {
    name: CLIENT_ARTIFACT_PLUGIN,
    writeBundle() {
      const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
        dsh?: { client?: unknown };
        exports?: Record<string, unknown>;
      };
      // 未声明 dsh.client 时本门不适用：client-modules 会安全跳过该行
      // （`parseDshClient` 返回 undefined → 记 null 返回）。
      if (manifest.dsh?.client === undefined) return;
      const target = manifest.exports?.["./client"];
      const relative =
        typeof target === "string"
          ? target
          : typeof target === "object" &&
              target !== null &&
              typeof (target as { default?: unknown }).default === "string"
            ? (target as { default: string }).default
            : undefined;
      if (relative === undefined) {
        throw new Error(
          `client artifact contract: ${CLIENT_PACKAGE_ID} 声明了 dsh.client，但 exports["./client"] ` +
            "不是字符串也不是带字符串 default 的对象——DSH client-modules 的 clientExportOf 会因此抛错。",
        );
      }
      // 〔解析规则〕exports 的路径是**包根相对**的，因此相对 `packageDir` 解析，
      // 与宿主一致（`client-modules/src/index.ts:794` 的
      // `join(dirname(pkgPath), clientRel)`）。相对 `options.dir`（= `lib/`）解析
      // 会得到 `lib/lib/client.js` 这种双重前缀，是错的。
      const artifact = join(packageDir, relative.replace(/^\.\//, ""));
      if (!existsSync(artifact)) {
        throw new Error(
          `client artifact contract: ${artifact} 未产出（exports["./client"] 指向它）——` +
            'DSH client-modules 会在宿主启动时因 "declares dsh.client but exports no \\"./client\\" bundle" 抛错。',
        );
      }
      const source = readFileSync(artifact, "utf8");
      // 〔实测〕rolldown 会重排 banner 的空白（banner 里的单行写法在产物里变成
      // 多行缩进），因此判据取**语义片段**而非逐字节前缀：加载调用、注册键、
      // 工厂返回值三处都在，才构成 DSH 模块表可应答的注册形态。
      const head = /^window\.__ModuleLoader__\.load\(\{/;
      if (!head.test(source)) {
        throw new Error(
          `client artifact contract: ${artifact} 未以 window.__ModuleLoader__.load({ 开始——` +
            "DSH 的模块表只认这种注册形态，产物不会被执行到。",
        );
      }
      if (!source.includes(`id: ${JSON.stringify(CLIENT_PACKAGE_ID)}`)) {
        throw new Error(
          `client artifact contract: ${artifact} 的注册键不是 ${JSON.stringify(CLIENT_PACKAGE_ID)}——` +
            "注册键必须等于 loader 行名（包名），否则 `require` 与图行都对不上。",
        );
      }
      // 收尾判据在**剥掉 sourcemap 尾注之后**取：rolldown 追加
      // `//# sourceMappingURL=client.js.map`，而 DSH 在服务该 bundle 时会把它与
      // `//# sourceURL=` 一起剥掉（`client-modules/src/index.ts` 的 `prepareSource`），
      // 因此这里按「剥掉后的可执行字节」判断，与页面实际执行的字节一致。
      const executable = source.replace(SOURCE_MAP_TRAILER, "").trimEnd();
      if (!executable.endsWith("});")) {
        throw new Error(
          `client artifact contract: ${artifact} 未以工厂注册的收尾 }); 结束——` +
            "闭包工厂产物必须是「一条 load 调用」，尾部被改写即注册失败。",
        );
      }
      for (const marker of FORBIDDEN_CLIENT_MARKERS) {
        if (source.includes(marker)) {
          throw new Error(
            `client artifact contract: ${artifact} 含服务端实现/凭据标识 "${marker}"——` +
              "浏览器产物不得携带 Host 实现（验收条款 5）。",
          );
        }
      }
    },
  };
}

/**
 * 浏览器半边（client face）的 tsdown 配置。
 *
 * 〔形状依据〕DSH `packages/client/tsdown.client.ts` 的 `clientConfig`：闭包工厂
 * （banner/footer/intro 三件套）+ `format: "cjs"` + `platform: "browser"` +
 * 产物名固定 `client.js`。**不是**普通 ESM 库：它由 `<script>` 以经典脚本加载，
 * 执行时只向 `window.__ModuleLoader__` 注册工厂，模块体副作用留到物化时。
 *
 * @param packageDir - `soloips-web` 包目录（绝对路径）。
 * @param workspaceRoot - 工作区根（Typert 生成器定根用）。
 * @returns 一个 tsdown 配置对象。
 */
function clientBundleConfig(packageDir: string, workspaceRoot: string): UserConfig {
  const isModuleTableWord = (specifier: string): boolean => MODULE_TABLE_WORDS.includes(specifier);
  return {
    name: `${CLIENT_PACKAGE_ID}/client`,
    cwd: packageDir,
    // 〔入口取源码，不是 tsc 中间产物〕浏览器半边由 `tsconfig.client.json` 以
    // **declaration-only** 编译（只产 `lib/types/client/index.d.ts`，它是
    // `exports["./client"].types` 需要的全部）。理由：若 tsc 也产该文件的 JS，
    // `lib/types/client/index.js` 会带着裸说明符 `soloips-web/remote` 留在
    // `lib/**/*.js` 里，被 `check-delivery-load` 的 `checkDeclaredDependencies`
    // 读作「产物 import 了未声明的依赖」——而它既不是交付面（`exports["./client"]
    // .default` 指向本配置的 `lib/client.js`），也不该被当成依赖问题的证据。
    // 因此 rolldown 直接从源码打包，与 DSH `packages/client/tsdown.client.ts`
    // 的 `clientEntry = face === undefined ? 'src/client/index.ts' : …` 同形。
    entry: { client: "src/client/index.ts" },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    target: "es2023",
    // 与 tsc 的 `.js` 输出保持同名（不追加 `.cjs`）；产物名再由 entryFileNames 钉死。
    fixedExtension: false,
    dts: false,
    // 不清理：`lib/types` 是 tsc 的产物目录，clean 会把它们一起删掉。
    clean: false,
    // 插件代码在 Vite 模块图之外被加载，自带 TS 映射才能被浏览器分析工具读懂。
    sourcemap: true,
    // 〔约束〕关掉 tsconfig 解析。实测：tsdown 的 `tsconfig: false` 传给 rolldown 时
    // 被 `tsconfig || void 0` 折成 `undefined`（`tsdown/dist/build-BxT2lm9L.mjs:563`），
    // rolldown 于是**自动探测**包内 tsconfig。历史上包内曾用 `paths` 指向类型面替身
    // （`.d.ts`），探测到的 paths 让 rolldown 把**声明文件**当运行时模块解析，构建以
    // `MISSING_EXPORT: "TYPERT_REMOTE" is not exported by …` 失败。
    // 类型面现已改为**环境模块声明**（`src/client/remote-artifact.d.ts`，不经路径映射，
    // 故 rolldown 看不到它），本项作为**显式姿态**保留：不让构建行为依赖
    // 「包内 tsconfig 恰好没有 paths」这一巧合。
    tsconfig: false,
    deps: {
      // 模块表应答的说明符留在外部；其余全部内联（含 zod 与生成的 /remote 贡献）。
      neverBundle: (specifier: string) => isModuleTableWord(specifier),
      alwaysBundle: (specifier: string) => !isModuleTableWord(specifier),
      // 内联 zod 是本 bundle 的**预期形态**（生成的贡献带严格 codec，zod 是其运行时），
      // 关掉 tsdown 的「建议只打包声明依赖」提示，避免它随依赖变化而改变输出。
      onlyBundle: false,
    },
    plugins: [
      {
        // 〔时序契约〕先物化 Typert 产物，再让 rolldown 解析 `soloips-web/remote`。
        name: "soloips-web/materialize-host-artifacts",
        buildStart() {
          materializeHostArtifacts(workspaceRoot);
        },
      },
      clientBundlePurityGate(),
      clientArtifactContractGate(packageDir),
    ],
    outputOptions: {
      entryFileNames: "client.js",
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_PACKAGE_ID)}, factory: (require) => {`,
      footer: "return module.exports; } });",
      intro: "var module = { exports: {} }; var exports = module.exports;",
    },
  };
}

export default defineConfig(() => {
  const workspaceRoot = process.cwd();
  return [
    {
      workspace: ["packages/web"],
      entry: ["lib/types/index.js"],
      outDir: "lib",
      format: ["esm"],
      platform: "node",
      target: "es2023",
      // 与 tsc 的 `.js` 输出保持同名（不追加 `.mjs`），否则 exports 指向落空。
      fixedExtension: false,
      // dts 由 tsc 产（lib/types），tsdown 不重复产，避免两份声明互相覆盖。
      dts: false,
      // 不清理：`lib/types` 是 tsc 的产物目录，clean 会把它们一起删掉。
      clean: false,
      plugins: [typertPlugin({ mode: "workspace", faces: ["host"] })],
    },
    clientBundleConfig(resolve(workspaceRoot, "packages", "web"), workspaceRoot),
  ];
});
