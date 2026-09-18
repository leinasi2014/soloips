import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { Context } from "@deepseek-ai/cordis";
import { describe, expect, it } from "vitest";

import {
  PACKAGE_ID,
  packageDir,
  REQUIRED_ARTIFACTS,
  requireArtifact,
} from "./artifact-inventory.js";

/**
 * 产物行为套件（BE-0b-ii / F-03）：**只在 build 之后跑**，且**要求产物存在**。
 *
 * ── 与外审 F-03 的对应关系 ───────────────────────────────────────────────────
 * 外审事实：CI 的 `Test` 步骤跑在 `Build` **之前**（`.github/workflows/verify.yml`），
 * 而默认套件里的产物断言一律写成 `if (!hasArtifact) return`。两者叠加的后果是
 * 「产物行为测试通过」在 CI 上**从未发生过**——那是假绿，不是覆盖。
 *
 * 本文件是那条断言的替代物，四条要求逐条落地：
 *  1. 默认套件（构建前那批源码/接线断言）保持不动；
 *  2. 本套件用**独立 config**（`vitest.artifacts.config.ts`）与独立 include，
 *     只跑产物行为用例，并挂在 build **之后**的步骤上；
 *  3. 每个用例**第一句就 `requireArtifact(...)`**——缺产物即抛、即失败；
 *     另有 `ArtifactSuiteGuard` 核对「必需用例真的被执行、且没有被 skip」；
 *  4. 先红后绿证据见交付报告（删 `lib/client.js` → 步骤失败；恢复 → 通过）。
 *
 * ── 判据形态：真执行，不是读文本 ─────────────────────────────────────────────
 * 浏览器半边把产物放进 `node:vm` 的页面沙箱里**跑一遍**（注册工厂 → 物化 →
 * 调 `apply` → 取出贡献 → 用 codec 真校验）；Host 半边**真 import** 产物并读
 * 运行时的同一字段。字符串 grep 不能区分「注释里出现」与「运行时如此」，
 * 而项目红线第 5 条要求断言核到职能层。
 */
describe("soloips-web artifact behavior (BE-0b-ii / F-03)", () => {
  /** 读取产物文本；缺失时抛（不返回空串——空串会让断言静默通过）。 */
  const readArtifact = (relativePath: string): string =>
    readFileSync(requireArtifact(relativePath), "utf8");

  /** 在页面沙箱里执行浏览器产物，取回注册的工厂。 */
  const loadClientBundle = (): {
    registrations: { id: string; factory: (require: (spec: string) => unknown) => unknown }[];
  } => {
    const source = readArtifact("lib/client.js");
    const registrations: {
      id: string;
      factory: (require: (spec: string) => unknown) => unknown;
    }[] = [];
    const sandbox = {
      window: {
        __ModuleLoader__: {
          load(registration: (typeof registrations)[number]) {
            registrations.push(registration);
          },
        },
      },
      console,
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: "client.js" });
    return { registrations };
  };

  // ── 浏览器半边：真在 VM 里执行 ─────────────────────────────────────────────

  it("registers a closure factory under the loader row name", () => {
    const { registrations } = loadClientBundle();
    // DSH 的模块表只认 `window.__ModuleLoader__.load({id, factory})` 这一种注册形态
    // （`client-modules/src/client/manifest.ts` 的 ClientBundleRegistration）。
    expect(registrations.length, "bundle 必须恰好注册一次工厂").toBe(1);
    expect(registrations[0]?.id, "注册键必须等于 Loader 行名（包名）").toBe(PACKAGE_ID);
    expect(typeof registrations[0]?.factory, "工厂必须是可物化的函数").toBe("function");
  });

  it("materializes in a simulated page and mounts the generated contribution", async () => {
    const { registrations } = loadClientBundle();
    const registration = registrations[0];
    expect(registration, "bundle 必须注册工厂").toBeDefined();

    // 物化工厂。传入的 `require` 故意抛错：本 bundle 的说明符要么走模块表
    // （页面 seed），要么已被内联——任何 `require` 都说明外部面漏配了。
    const exports = registration?.factory((specifier: string) => {
      throw new Error(`意外的 require：${specifier}（既非页面模块表词，也未被内联）`);
    }) as { apply?: unknown; inject?: unknown };

    expect(exports.inject, "inject 必须声明 remote 服务").toEqual(["remote"]);
    expect(typeof exports.apply, "apply 必须是函数").toBe("function");

    // `apply` 必须把生成的贡献交给 `$mount`，并**透传**其 disposer
    // （cordis 以 apply 的返回值作为卸载钩子；丢弃会让重载泄漏 namespace）。
    const disposer = async (): Promise<void> => undefined;
    const mounted: { package?: string; descriptors?: { id: string }[] }[] = [];
    const returned = await (exports.apply as (ctx: unknown) => Promise<unknown>)({
      remote: {
        async $mount(contribution: { package: string; descriptors: { id: string }[] }) {
          mounted.push(contribution);
          return disposer;
        },
      },
    });

    expect(mounted.length, "$mount 必须被调用一次").toBe(1);
    expect(mounted[0]?.package).toBe(PACKAGE_ID);
    expect(
      mounted[0]?.descriptors?.map((descriptor) => descriptor.id),
      "挂载的必须是 Host 半边生成的 getStatus 描述符",
    ).toContain("soloips-web#soloips/getStatus");
    expect(returned, "apply 必须透传 $mount 的 disposer").toBe(disposer);
  });

  it("carries a strict codec that actually validates", async () => {
    const { registrations } = loadClientBundle();
    const exports = registrations[0]?.factory(() => {
      throw new Error("本 bundle 不应有外部 require");
    }) as { apply: (ctx: unknown) => Promise<unknown> };

    let contribution:
      | {
          descriptors: {
            id: string;
            parameters: {
              codec: {
                mode: string;
                create: () => { safeParse: (v: unknown) => { success: boolean } };
              };
            }[];
            result: { create: () => { safeParse: (v: unknown) => { success: boolean } } };
          }[];
        }
      | undefined;
    await exports.apply({
      remote: {
        async $mount(c: typeof contribution) {
          contribution = c;
          return async () => undefined;
        },
      },
    });

    // 〔按 id 选，不按下标〕BE-6a 起本贡献含 6 条描述符（getStatus + 业务面五项），
    // 顺序由生成器决定。按 `descriptors[0]` 取会让判据随数量与顺序漂移——本用例
    // 要证明的是「getStatus 的 codec 是真 codec」，按 id 取才与标题一致。
    const descriptor = contribution?.descriptors?.find(
      (entry) => entry.id === "soloips-web#soloips/getStatus",
    );
    expect(descriptor, "贡献必须带 getStatus 描述符").toBeDefined();
    // Client 端**拒绝挂载**缺少严格 codec 的 SRC 描述符（api-gateway.zh.md:137），
    // 因此 `mode: "strict"` 是能被挂载的前提，不是可选装饰。
    expect(descriptor?.parameters?.[0]?.codec.mode).toBe("strict");

    // 真实校验：接受正确载荷、拒绝错误类型——证明内联的是**真 codec**，
    // 而不是被内联成空壳的替身（那会让所有调用静默通过校验）。
    //
    // 〔BE-0b-ii 契约〕codec 由 `schema` 改为 `create: () => TypertSchema`（惰性
    // thunk）。`create()` 每次调用返回同一惰性物化实例，故两次断言各自调用一次，
    // 不假设返回对象可跨调用复用身份。
    const parameterSchema = descriptor?.parameters?.[0]?.codec.create();
    expect(parameterSchema?.safeParse({ note: "ping" }).success).toBe(true);
    expect(parameterSchema?.safeParse({ note: 1 }).success).toBe(false);
    const resultSchema = descriptor?.result.create();
    expect(resultSchema?.safeParse({ service: "s", echo: "e", toolchain: "t" }).success).toBe(true);
    expect(resultSchema?.safeParse({ service: "s" }).success).toBe(false);
  });

  it("keeps server-side implementation and credentials out of the artifact", () => {
    const source = readArtifact("lib/client.js");
    // 判据：Host 半边的实现符号、存储/账户配置键、后端驱动名。
    for (const marker of [
      "SoloipsWebHost",
      "soloipsCore",
      "storageRoot",
      "accountId",
      "better-sqlite3",
      "drizzle",
    ]) {
      expect(source, `浏览器产物不得含服务端实现/凭据标识 "${marker}"`).not.toContain(marker);
    }
    // Node 内置模块（`node:` 前缀与裸名）都不得出现：本 bundle 在浏览器里执行。
    const nodeRequires = [...source.matchAll(/require\(\s*["'](?:node:)?([a-z_]+)["']\s*\)/g)].map(
      (match) => match[1],
    );
    expect(nodeRequires, "浏览器产物不得 require Node 内置模块").toEqual([]);
  });

  it("inlines the generated contribution instead of leaving an external require", () => {
    // 〔实测的静默失败模式〕浏览器半边以运行时值导入 `soloips-web/remote`，该文件由
    // Typert 生成器写出；而生成器插件挂在 **node 配置**上，其 writeBundle 与浏览器
    // bundle 的构建**并发**。控制实验（删掉物化步骤 + 冷构建）的结果是：**构建退出码
    // 仍为 0**，但 `lib/client.js` 从 170.6 kB 缩到 3.4 kB——rolldown 把未解析的
    // `soloips-web/remote` 当作**外部依赖**留下，产物变成一个没有贡献对象的空壳。
    // 本用例固定的事实：物化步骤是**承载时序的必需件**，不是优化。
    const source = readArtifact("lib/client.js");
    expect(source, "产物必须内联生成的贡献（真内联）").toContain("soloips/getStatus");
    expect(source, "产物不得把 soloips-web/remote 留成外部 require（那是空壳形态）").not.toMatch(
      /require\(\s*["']soloips-web\/remote["']\s*\)/,
    );
  });

  // ── Host 半边：真 import 产物 ──────────────────────────────────────────────

  it("emits every declared artifact named by package.json exports (无部分生成)", () => {
    // 判据取自**交付契约本身**（manifest 的 exports 与 files），不是另一份手写清单：
    // 写死清单会与交付面分叉，而 exports 指向不存在的文件正是「装不上」的形态。
    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
      exports?: Record<string, { types?: string; default?: string } | string>;
      files?: string[];
    };
    const declared = new Set<string>();
    for (const target of Object.values(manifest.exports ?? {})) {
      if (typeof target === "string") continue;
      for (const path of [target.types, target.default]) {
        if (path !== undefined && path.startsWith("./")) declared.add(path.slice(2));
      }
    }
    for (const file of manifest.files ?? []) {
      // `files` 里带 glob 的条目（`lib/**/*.js`）不逐条解析，只取具体文件。
      if (!file.includes("*")) declared.add(file);
    }
    const missing = [...declared].filter((path) => {
      try {
        requireArtifact(path);
        return false;
      } catch {
        return true;
      }
    });
    expect(
      missing,
      "manifest 声明的交付文件必须全部存在（exports/files 指向缺失即交付不可用）",
    ).toEqual([]);

    // 清单与磁盘双向核对：本套件的必需产物清单也必须全部存在（缺一即抛）。
    for (const required of REQUIRED_ARTIFACTS) requireArtifact(required);
  });

  it("exposes exactly one SoloipsWebHost class definition at runtime (身份唯一)", async () => {
    // ── 本用例防的缺陷（BE-6a 的真实故障）────────────────────────────────────
    //
    // 旧构建面同时产出两份类定义：tsc 的 `lib/types/index.js`（`outDir: lib/types`
    // 且未关 JS emit）与 tsdown 的 `lib/index.js`（`entry: ["lib/types/index.js"]`）。
    // 同一进程里 `A === B` 为 false、`prototype` 也不同，于是 `instanceof` 判别在
    // 装配路径上必然失败：E2E 报
    // `soloips/createCompany → gateway/internal` /
    // `"Receiver must be an instance of class SoloipsWebHost"`。
    //
    // 〔为什么这条必须在产物层测，而不是读配置文本〕配置面已由
    // `packages/web/tests/typert-artifacts.spec.ts` 的「lib/types 无 JS」用例覆盖；
    // 但那条判据是**路径形状**，任何别的机制（多一份产物、别名指向副本、打包器
    // 意外内联）都能重建出两份定义而不违反它。本用例按**运行期事实**判定：
    // 枚举 `lib/` 下每个可加载的 `.js`，真的 import，收集「导出名为
    // SoloipsWebHost 的函数」，断言该集合恰有一个成员。
    //
    // 〔为什么不需要实例〕判据是**模块级导出身份**，不是对象归属：两份定义的
    // 存在性与 `new` 无关。本套件不构造 Host（那需要真实 cordis Context 与
    // core 服务，属 E2E 的范围）。
    const libRoot = join(packageDir, "lib");
    const modules = readdirSync(libRoot, { recursive: true })
      .map((entry) => String(entry).replaceAll("\\", "/"))
      .filter((entry) => entry.endsWith(".js"))
      .sort();
    expect(modules.length, "lib/ 下必须存在产物（本用例不得在空目录上通过）").toBeGreaterThan(0);

    /** 导出名为 SoloipsWebHost 的函数定义（模块路径 + 导出键 + 类身份）。 */
    const definitions: { file: string; key: string; ctor: unknown }[] = [];
    const loaded: string[] = [];
    for (const file of modules) {
      const absolute = join(libRoot, file);
      const source = readFileSync(absolute, "utf8");
      // 浏览器闭包工厂在 Node 下必然失败（依赖 window.__ModuleLoader__），且它按
      // 设计**不得**携带 Host 实现（验收条款 5 另有专条断言）。跳过它而不是
      // 吞掉它的加载错误：判据是「产物注册形态」，不是「Node 可加载」。
      if (source.startsWith("window.__ModuleLoader__.load(")) continue;
      const namespace = (await import(pathToFileURL(absolute).href)) as Record<string, unknown>;
      loaded.push(file);
      for (const [key, value] of Object.entries(namespace)) {
        if (typeof value !== "function" || value.name !== "SoloipsWebHost") continue;
        definitions.push({ file, key, ctor: value });
      }
    }

    expect(loaded, "至少有一个可加载的 Host 产物（否则本用例在空集合上通过）").toContain(
      "index.js",
    );

    // 〔判据按**类身份**去重，不按（文件, 导出键）〕同一份定义可以有多个导出名
    // （`export class SoloipsWebHost` + `export default SoloipsWebHost` 是**同一
    // 对象**的两种引用）。按键计数会把「一份定义的两种引用」误报成两份。
    // 真正要防的是**不同的类对象**：那才是 `instanceof` 判别失败的原因。
    const distinctClasses = [...new Set(definitions.map((definition) => definition.ctor))];
    expect(
      distinctClasses.length,
      "运行期只能有**一份** SoloipsWebHost 类定义——两份会让 instanceof 判别失败" +
        `（E2E 报 gateway/internal）。实际来源：${definitions
          .map((definition) => `${definition.file}#${definition.key}`)
          .join(", ")}`,
    ).toBe(1);

    // 且它必须来自包根入口 `lib/index.js`（交付面指向的那一份）。若唯一定义来自
    // 别处（如某个中间产物目录），说明交付面与实现分叉——那同样是缺陷，只是
    // 形态不同。
    //
    // 〔为什么按文件去重再断言〕同一文件可以有多个导出名（具名 + default），
    // 断言精确列表会把「导出名数量变化」误报成缺陷；本判据要的是**文件来源唯一**。
    expect(
      [...new Set(definitions.map((definition) => definition.file))].sort(),
      "唯一的类定义必须由包根入口 lib/index.js 提供",
    ).toEqual(["index.js"]);

    // 包根入口的 default 与具名导出必须是**同一个**类对象（同一份定义的两种引用），
    // 不是各自持有一份。旧形状下这条也可能被满足，但它是「一份定义」的必要条件，
    // 与上面的集合断言互补：集合断言管「有几份」，本断言管「入口引用哪一份」。
    const entry = (await import(pathToFileURL(requireArtifact("lib/index.js")).href)) as {
      default?: unknown;
      SoloipsWebHost?: unknown;
    };
    expect(entry.SoloipsWebHost, "包根入口必须导出 SoloipsWebHost").toBeDefined();
    expect(entry.default, "default 与具名导出必须是同一个类对象（同一份定义）").toBe(
      entry.SoloipsWebHost,
    );

    // 〔更深一层：基类身份〕产物里的 `TypertRemoteService` 必须与**本测试解析到的**
    // 同一个模块实例。这正是身份分裂的镜像面：若产物把协议包内联成第二份副本，
    // 网关（它持有自己那份协议）就认不出这个服务——`instanceof` 与
    // `Symbol.metadata` 链都会断。此判据不需要实例（`instanceof` 在类对象上成立）。
    const protocol = await import("@deepseek-ai/dsh-typert-protocol");
    expect(
      Object.getPrototypeOf(entry.SoloipsWebHost as object),
      "类必须直接继承**同一份** TypertRemoteService（内联副本会让网关认不出该服务）",
    ).toBe(protocol.TypertRemoteService);

    // 类体必须是完整的 Host 实现（六个 Remote 方法都在原型上）。缺任一说明入口
    // 指向了残缺定义（如只有装饰器桩），而不是真实现。
    const methods = Object.getOwnPropertyNames(
      (entry.SoloipsWebHost as { prototype: object }).prototype,
    ).filter((name) => name !== "constructor");
    expect(methods.sort(), "类原型必须带全部六个 Remote 方法（缺任一即入口指向残缺定义）").toEqual(
      [
        "createCompany",
        "getCompany",
        "getCompanyTree",
        "getStatus",
        "listDepartments",
        "listTeams",
      ].sort(),
    );
  });

  it("keeps the gateway call path free of private-member access (Proxy receiver)", async () => {
    // ── 本用例防的缺陷（BE-6a E2E 红）────────────────────────────────────────
    //
    // 网关经 cordis 的 traceable Proxy 取接收者并调用
    // （`prepareInvocation` → `Reflect.get(receiver, method)` → `Reflect.apply`）。
    // 该 Proxy 的 get trap 把方法包成 `createShadowMethod`，调用时把 `this` 改绑到
    // shadow；**V8 的私有成员品牌检查不做 Proxy 透传**，故方法体内 `this.#x` 抛
    // `TypeError: Receiver must be an instance of class SoloipsWebHost`（本用例在旧
    // 实现上实测到的原文），网关再折叠成 `gateway/internal` 且不暴露 cause。
    //
    // 〔为什么必须在**产物**层再测一次，而不是只留默认套件那条〕默认套件跑的是
    // vitest 的 esbuild 转换产物：私有成员的降级 helper 报的是
    // `Cannot access private method`（措辞不同、实现不同），而**交付的**
    // `lib/index.js` 走原生 V8 私有字段，报的才是 E2E 里那条原文。两条判据覆盖
    // 两个运行面；只留源码面时，「源码过了但产物形态不同」无人拦。
    //
    // 〔为什么真的构造实例〕判据是**调用路径**，不是类形状：只有真调一次才能
    // 触达 V8 的品牌检查。构造需要真实 cordis Context（本套件允许——它是
    // `lib/index.js` 的 dependencies 之一），core 用最小替身（本用例不验 core 语义，
    // 那是 `packages/core/tests` 与 E2E 的范围）。
    const entry = (await import(pathToFileURL(requireArtifact("lib/index.js")).href)) as {
      SoloipsWebHost: new (ctx: Context) => object;
    };
    const ctx = new Context();
    const calls: string[] = [];
    ctx.provide("soloipsCore", {
      createCompany: async () => {
        calls.push("createCompany");
        return { status: "committed", result: { companyId: "cmp_artifact" } };
      },
      getCompany: () => {
        calls.push("getCompany");
        return undefined;
      },
      getCompanyTree: () => {
        calls.push("getCompanyTree");
        return [];
      },
      listDepartments: () => {
        calls.push("listDepartments");
        return [];
      },
      listTeams: () => {
        calls.push("listTeams");
        return [];
      },
    });
    new entry.SoloipsWebHost(ctx);

    // 网关等价路径：`ctx.get` 取回的**不是**构造时的实例，而是 traceable Proxy。
    //
    // 〔为什么用 `Reflect.get` 动态取方法，而不是 `receiver.createCompany(...)`〕
    // 两者都会经过 Proxy 的 get trap（本用例对两种形态都实测过，结论一致）；
    // 取动态形态是为了逐字复刻网关的三步（`Reflect.get` → `Reflect.apply`），
    // 使「接收者是 Proxy」这一条在用例里是**显式**的，而不是隐含在属性访问里。
    // 两处 `as unknown as` 是本套件既有风格（声明合并把 `ctx.get('soloipsWeb')`
    // 的类型钉成 Host 类，而这里要按动态方法名取成员）。
    const service = ctx.get("soloipsWeb");
    if (service === undefined) throw new Error("前置失败：ctx.get('soloipsWeb') 必须已发布");
    const receiver = service as unknown as Record<string, unknown>;
    const invoke = (method: string, input: unknown): unknown =>
      Reflect.apply(receiver[method] as (...args: never[]) => unknown, receiver, [input]);

    // 五个业务方法全部经 core 解析（旧实现下它们全炸，`getStatus` 独通——那正是
    // 判别证据）。断言业务结果而非仅「不抛」：解析退化成 `undefined` 的实现同样
    // 不抛，却会静默返回 `unavailable`（§2.5.1 裁定三明禁的「伪装」）。
    await expect(
      invoke("createCompany", { operationId: "op-artifact", name: "甲", type: "enterprise" }),
    ).resolves.toEqual({ status: "committed", result: { companyId: "cmp_artifact" } });
    expect(invoke("getCompany", { companyId: "cmp_1" })).toEqual({ status: "not-found" });
    expect(invoke("getCompanyTree", { companyId: "cmp_1" })).toEqual({
      status: "ok",
      companies: [],
    });
    expect(invoke("listDepartments", { companyId: "cmp_1" })).toEqual({
      status: "ok",
      departments: [],
    });
    expect(invoke("listTeams", { companyId: "cmp_1" })).toEqual({ status: "ok", teams: [] });
    expect(calls, "core 必须真的被调用（Proxy 接收者不得让解析退化）").toEqual([
      "createCompany",
      "getCompany",
      "getCompanyTree",
      "listDepartments",
      "listTeams",
    ]);
  });

  it("carries the getStatus invocation in the Host face model", async () => {
    const host = (await import(pathToFileURL(requireArtifact("lib/typert.host.js")).href)) as {
      TYPERT?: { package?: string; face?: string; invocations?: { id?: string }[] };
    };
    expect(host.TYPERT, "Host 产物必须导出 TYPERT").toBeDefined();
    expect(host.TYPERT?.package).toBe(PACKAGE_ID);
    expect(host.TYPERT?.face).toBe("host");
    const ids = (host.TYPERT?.invocations ?? []).map((invocation) => invocation.id);
    expect(ids, "Host face 必须含 getStatus invocation").toContain("soloips-web#soloips/getStatus");
  });

  it("emits a mountable Remote contribution for the browser half", async () => {
    const remote = (await import(
      pathToFileURL(requireArtifact("lib/typert.remote-client.js")).href
    )) as {
      TYPERT_REMOTE?: {
        package?: string;
        descriptors?: {
          id?: string;
          parameters?: { codec?: { mode?: string; create?: unknown } }[];
          result?: { mode?: string; create?: unknown };
        }[];
      };
    };
    expect(remote.TYPERT_REMOTE, "Remote 产物必须导出 TYPERT_REMOTE").toBeDefined();
    expect(remote.TYPERT_REMOTE?.package).toBe(PACKAGE_ID);
    const descriptor = (remote.TYPERT_REMOTE?.descriptors ?? []).find(
      (entry) => entry.id === "soloips-web#soloips/getStatus",
    );
    expect(descriptor, "Remote 贡献必须含 getStatus 描述符").toBeDefined();
    // 运行时 `requireStrictCodec` 要求 `create` 是函数——这里是**执行判据**：
    // 真的读产物导出的对象字段，不是 grep 源码文本。
    //
    // 〔形状实测〕参数的 codec 是**嵌套**的 `parameters[i].codec`，而结果的 codec
    // **就是 `result` 自身**（`{ mode, typeSymbol, create }`）。这与门禁
    // `checkTypertCodecContract` 的取法一致（`inspectCodec(descriptor.result, …)`）；
    // 把 result 当成 `{codec}` 容器会写出永远失败的断言。
    expect(typeof descriptor?.parameters?.[0]?.codec?.create, "参数 codec 必须有 create()").toBe(
      "function",
    );
    expect(descriptor?.parameters?.[0]?.codec?.mode, "参数 codec 必须是 strict").toBe("strict");
    expect(typeof descriptor?.result?.create, "结果 codec 必须有 create()").toBe("function");
    expect(descriptor?.result?.mode, "结果 codec 必须是 strict").toBe("strict");
  });

  it("generates Remote consumer types from the public ./contracts subpath", () => {
    const dts = readArtifact("lib/typert.remote-client.d.ts");
    // 生成器用**非根子路径**引用边界类型（analyzer.publicRemoteType 的硬要求）。
    // 若这里变成 '.'，说明边界类型被搬到了包根，exports["./contracts"] 的
    // 存在意义随之消失——本断言把该约束固定在生成物上。
    expect(dts).toContain("from 'soloips-web/contracts'");
    expect(dts).toContain("getStatus");
  });

  it("resolves every package.json export target to an existing file (交付面自洽)", () => {
    // 〔为什么本用例在这里〕它是**产物存在性**判据：`exports` 指向不存在的文件
    // 只在安装后暴露（`ERR_MODULE_NOT_FOUND` / 类型解析失败），本地 worktree 一切
    // 正常。判据按 manifest 逐条解析，与 `check:delivery-load` 的隔离安装互补：
    // 那个门按包名 import，这个门逐条核对**每个子路径的每个条件**（含 `types`，
    // 它不会被运行期 import 覆盖）。
    //
    // 〔BE-6a 的直接动因〕`./contracts` 的 `default` 曾指向
    // `./lib/types/contracts.js`——那是 tsc 的 JS 中间产物，与 Host 入口的
    // `lib/types/index.js` 同源。BE-6a 起 Host 工程只产声明，该文件不再存在；
    // 本用例把「exports 全部解析到存在的文件」变成**每次构建后都执行**的事实，
    // 使同类残留（改了 exports 却忘了改构建面）不会静默留到安装期。
    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
      exports?: Record<string, string | { [condition: string]: string }>;
    };
    const dangling: string[] = [];
    for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
      const targets = typeof target === "string" ? [target] : Object.values(target);
      for (const path of targets) {
        if (typeof path !== "string" || !path.startsWith("./")) continue;
        const absolute = join(packageDir, path.slice(2));
        if (!existsSync(absolute)) dangling.push(`${subpath} → ${path}`);
      }
    }
    expect(dangling, "exports 的每个条件都必须解析到存在的文件（悬空即交付不可用）").toEqual([]);

    // 〔type-only 姿态〕`./contracts` 不得再有运行期条件：`src/contracts.ts` 零运行期
    // 导出（全文只有类型与 `export {}`），任何 `default`/`import` 条件都只能指向
    // 一个空模块——而它要求 tsc 在 `lib/types/` 下产 JS，正是身份分裂的来源。
    const contracts = manifest.exports?.["./contracts"];
    expect(contracts, "exports 必须保留 ./contracts（生成物的边界类型引用它）").toBeDefined();
    expect(
      typeof contracts === "string" ? contracts : Object.keys(contracts ?? {}),
      "./contracts 必须是 type-only（只留 types 条件）",
    ).toEqual(["types"]);
  });

  // ── F-04：激活日志的**失败诊断扫描**与**正向确认** ────────────────────────

  /**
   * 加载门禁脚本，取回 F-04 相关的导出。
   *
   * 〔为什么在这里测而不是在默认套件〕这些函数读的是**产物身份**与**宿主日志**；
   * 本套件在 build 之后运行，可同时拿到候选产物与真实日志样本，判据完整。
   */
  const loadActivationScan = async (): Promise<{
    scanActivationLog: (stderr: string) => {
      state: string;
      failures: string[];
      unrecognized: string[];
    };
    checkActivationEvidence: (evidence: {
      logText: string;
      expectInvocations: string[];
      artifactDigest?: string | null;
    }) => {
      violations: string[];
      perInvocation: { id: string; lines: number; digests: string[] }[];
    };
  }> => {
    const gatePath = join(
      packageDir,
      "..",
      "..",
      "scripts",
      "development",
      "check-delivery-load.mjs",
    );
    const mod = (await import(pathToFileURL(gatePath).href)) as {
      scanActivationLog?: unknown;
      checkActivationEvidence?: unknown;
    };
    expect(typeof mod.scanActivationLog, "门禁必须导出 scanActivationLog").toBe("function");
    expect(typeof mod.checkActivationEvidence, "门禁必须导出 checkActivationEvidence").toBe(
      "function",
    );
    return mod as never;
  };

  it("activation scan distinguishes empty / header-only / clean / failure logs (F-04 正反例)", async () => {
    const { scanActivationLog } = await loadActivationScan();

    // 〔为什么这四条缺一不可〕外审 F-04 的形态是「用『没找到失败』代替成功」：
    // 空日志返回 []、有失败总标题但明细不匹配也返回 []，调用方随即输出
    // 「无 entry 报告 did not activate」。下面四条把「不可区分」拆开。

    // 1) 空日志：必须**单列**，不得计入成功。
    const empty = scanActivationLog("");
    expect(empty.state, "空日志必须单列（不得读作「无失败」）").toBe("empty");
    const whitespace = scanActivationLog("   \n\n  ");
    expect(whitespace.state, "纯空白日志同样是 empty").toBe("empty");

    // 2) 只有失败总标题、明细格式不认识：必须报 unrecognized（不得读作通过）。
    const headerOnly = scanActivationLog("dsh: warning: 1 entry did not activate\n");
    expect(headerOnly.state, "有总标题但无明细必须报 unrecognized").toBe("unrecognized");
    const headerWithUnknownDetail = scanActivationLog(
      "dsh: warning: 1 entry did not activate\n  - some.entry: Failed to import\n",
    );
    expect(
      headerWithUnknownDetail.state,
      "明细形态不认识时必须报 unrecognized（此前返回 [] 被读作通过）",
    ).toBe("unrecognized");
    expect(
      headerWithUnknownDetail.unrecognized.length,
      "无法识别的明细必须被保留下来供诊断",
    ).toBeGreaterThan(0);

    // 3) 正常日志（无失败）：state=clean，且**不得**被表述为「全部激活」。
    const clean = scanActivationLog("dsh web: http://127.0.0.1:55311/?token=x\n");
    expect(clean.state).toBe("clean");
    expect(clean.failures).toEqual([]);

    // 4) 真实失败明细：必须被识别为 failures。
    const realFailure = scanActivationLog(
      "dsh: warning: 1 entry did not activate\n" +
        "typert-loader (@deepseek-ai/dsh-typert-loader): AggregateError: boom\n",
    );
    expect(realFailure.state, "规范形态的失败明细必须被识别").toBe("failures");
    expect(realFailure.failures.length).toBe(1);
    expect(realFailure.failures[0]).toContain("typert-loader");

    // 5) 〔要求 4：不要把 warning 一律判失败〕与激活**无关**的 warning 不得被判为
    //    未激活。宿主会为各种非激活事项发 warning（例如 .env 加载失败），把它们
    //    当失败会让门禁变成噪声源、进而被绕过。
    const unrelatedWarning = scanActivationLog(
      "dsh: warning: failed to load .env: ENOENT\n" + "dsh web: http://127.0.0.1:55311/?token=x\n",
    );
    expect(
      unrelatedWarning.state,
      "非激活类 warning 不得被读作 entry 未激活（本层只扫激活失败）",
    ).toBe("clean");
    expect(unrelatedWarning.failures).toEqual([]);
  });

  it("positive activation confirmation rejects empty logs and unbound artifacts (F-04 正向)", async () => {
    const { checkActivationEvidence } = await loadActivationScan();
    const digest = "a".repeat(64);
    const otherDigest = "b".repeat(64);

    // 1) 空日志：即使给了期望，也不能通过。
    const emptyResult = checkActivationEvidence({
      logText: "",
      expectInvocations: ["soloips/getStatus"],
    });
    expect(emptyResult.violations.length, "空日志下正向确认必须失败").toBeGreaterThan(0);

    // 2) 目标 entry/调用缺失：必须失败（这正是「能力声明过强」的对照面）。
    const missing = checkActivationEvidence({
      logText: "dsh web: http://127.0.0.1:55311/?token=x\n",
      expectInvocations: ["soloips/getStatus"],
    });
    expect(missing.violations.length, "期望调用缺失时必须失败").toBeGreaterThan(0);
    expect(missing.violations.join("\n")).toContain("soloips/getStatus");

    // 3) 证据存在但没有产物摘要：无法绑定候选 → 必须失败。
    const noDigest = checkActivationEvidence({
      logText: "probe: soloips/getStatus ok\n",
      expectInvocations: ["soloips/getStatus"],
      artifactDigest: digest,
    });
    expect(noDigest.violations.length, "无产物摘要时必须失败（无法排除旧 lib）").toBeGreaterThan(0);
    expect(noDigest.violations.join("\n")).toContain("产物摘要");

    // 4) 摘要不一致：说明跑的不是本次候选 → 必须失败。
    const mismatch = checkActivationEvidence({
      logText: `probe: soloips/getStatus ok sha256=${otherDigest}\n`,
      expectInvocations: ["soloips/getStatus"],
      artifactDigest: digest,
    });
    expect(mismatch.violations.length, "摘要不一致时必须失败").toBeGreaterThan(0);

    // 5) 正向通过：证据在、摘要与候选一致。
    const ok = checkActivationEvidence({
      logText: `probe: soloips/getStatus ok sha256=${digest}\n`,
      expectInvocations: ["soloips/getStatus"],
      artifactDigest: digest,
    });
    expect(ok.violations, "证据齐全且摘要一致时应通过").toEqual([]);
    expect(ok.perInvocation[0]?.digests).toContain(digest);

    // 〔能力边界断言〕只给日志、不给期望时，本函数**不做**任何正向声明——
    // 调用方（main）据此输出「未执行」，而不是「全部激活」。
    const noExpectation = checkActivationEvidence({ logText: "anything\n", expectInvocations: [] });
    expect(noExpectation.violations).toEqual([]);
    expect(noExpectation.perInvocation).toEqual([]);
  });

  it("keeps the activation-log branch honest about its capability (F-04 要求 1)", async () => {
    // 〔判据〕分支的**输出文本**不得声称「断言每个 entry 真的激活」。
    // 这是纯文本断言，但它断言的对象**就是**能力声明本身（外审指出的正是措辞
    // 与能力不符），因此这里读文本是正确的判据，不是「用字符串匹配冒充行为」。
    //
    // 〔为什么要剥注释〕本文件的说明文字与门禁脚本的注释里都**引用**了旧措辞
    // （用于记录外审事实），不剥掉就会把「记录历史」误判成「仍在声称」。
    const stripComments = (source: string): string =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const gatePath = join(
      packageDir,
      "..",
      "..",
      "scripts",
      "development",
      "check-delivery-load.mjs",
    );
    const code = stripComments(readFileSync(gatePath, "utf8"));

    // 降级后的表述必须在场（在**代码**里，不是在注释里）。
    expect(code, "必须明确本层是失败诊断扫描").toContain("失败诊断扫描");
    expect(code, "必须显式输出「未执行正向确认」的边界").toContain("未执行");
    // 旧的过强表述不得出现在**输出语句**里。
    expect(
      code,
      "不得再输出「无 entry 报告 did not activate」这类过强结论（空日志/格式不认识都返回 []，不能当成功）",
    ).not.toContain("无 entry 报告 did not activate");
    // 旧的无鉴别力实现已被结构化结果替代。
    expect(code, "旧的无鉴别力实现不得残留").not.toContain("function parseActivationFailures");
  });

  // ── 门禁的**执行**判据（不是读文本）─────────────────────────────────────────

  /**
   * 把门禁脚本作为**模块**加载，取回它导出的 `checkTypertCodecContract`。
   *
   * 〔为什么必须 import 执行而不是读源码文本〕纯子串匹配无法区分「调用点」与
   * 「注释/死分支」：把调用改成注释或三元死分支后字符串仍在源码里，断言被满足
   * 而检查实际未运行（BE-0b-ii 盲区 1 的实测形态）。
   */
  const loadCodecGate = async (): Promise<
    (options?: { packageDir?: string }) => Promise<string[]>
  > => {
    const gatePath = join(
      packageDir,
      "..",
      "..",
      "scripts",
      "development",
      "check-delivery-load.mjs",
    );
    const mod = (await import(pathToFileURL(gatePath).href)) as {
      checkTypertCodecContract?: (options?: { packageDir?: string }) => Promise<string[]>;
    };
    expect(
      typeof mod.checkTypertCodecContract,
      "门禁脚本必须导出 checkTypertCodecContract（可执行判据）",
    ).toBe("function");
    return mod.checkTypertCodecContract as (options?: { packageDir?: string }) => Promise<string[]>;
  };

  /**
   * 在包内建一个临时产物目录，跑完必删。
   *
   * 〔为什么不用 `os.tmpdir()`〕门禁会 `import` 这些产物，而产物 `import { z } from 'zod'`。
   * 放在系统临时目录时 Node 从那里向上找不到 `zod`（本包的依赖在
   * `packages/web/node_modules`），于是**每个**产物都报「无法 import」——判据失去
   * 鉴别力（真实故障被 import 失败掩盖）。目录名以 `.tmp` 结尾：`.gitignore` 覆盖它。
   */
  const withScratchArtifacts = async (
    run: (scratchPackageDir: string) => Promise<void>,
  ): Promise<void> => {
    const base = join(packageDir, ".tmp");
    mkdirSync(base, { recursive: true });
    const scratch = mkdtempSync(join(base, "codecgate-"));
    try {
      await run(scratch);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  };

  it("the codec gate passes on the real artifacts (正向判据)", async () => {
    // 正向面：真实产物必须干净，否则下面的坏产物断言失去意义（门永远红）。
    const check = await loadCodecGate();
    expect(await check(), "真实产物应通过 codec 判据").toEqual([]);
  });

  it("the codec gate really flags a bad artifact (执行判据，非读文本)", async () => {
    const check = await loadCodecGate();
    expect(await check(), "真实产物应通过 codec 判据").toEqual([]);

    await withScratchArtifacts(async (scratch) => {
      const libScratch = join(scratch, "lib");
      mkdirSync(libScratch, { recursive: true });
      const hostSource = readArtifact("lib/typert.host.js");
      // `create: <thunk>` → `create: null`：形态仍是「有 create 键」，但值不可调用。
      // 这是「文本 grep 抓不到、只有执行判据能抓」的形态。
      writeFileSync(
        join(libScratch, "typert.host.js"),
        hostSource.replace(/create: soloips_web_[A-Za-z0-9_$]*,/g, "create: null,"),
      );
      writeFileSync(
        join(libScratch, "typert.remote-client.js"),
        readArtifact("lib/typert.remote-client.js"),
      );
      const violations = await check({ packageDir: scratch });
      expect(
        violations.length,
        "门禁必须能发现坏产物（否则它是假覆盖）——本断言即盲区 1 的解药",
      ).toBeGreaterThan(0);
      expect(violations.join("\n")).toContain("create()");
    });
  });

  it("the codec gate covers every typert.*.js artifact on disk (清单完整性)", async () => {
    // 〔为什么用「文件系统枚举 vs 门禁覆盖面」而不是断言清单里有某字符串〕
    // 纯文本断言会被门禁**注释**里的同名字符串满足 → 套件绿，而该产物的 codec
    // 形态完全不受检查。现在的判据是**行为性**的：磁盘上每个 `lib/typert.*.js`
    // 产物都必须被门禁实际检查到——逐个产物单独破坏，门禁都必须报错。
    const check = await loadCodecGate();
    const libDir = join(packageDir, "lib");
    const artifacts = readdirSync(libDir).filter((file) => /^typert\..*\.js$/.test(file));
    expect(artifacts.length, "应至少有一个 typert.*.js 产物").toBeGreaterThan(0);

    for (const artifact of artifacts) {
      await withScratchArtifacts(async (scratch) => {
        const libScratch = join(scratch, "lib");
        mkdirSync(libScratch, { recursive: true });
        // 只破坏这一个产物，其余原样复制——隔离出「该产物是否真被检查」。
        for (const file of artifacts) {
          const source = readFileSync(join(libDir, file), "utf8");
          writeFileSync(
            join(libScratch, file),
            file === artifact ? source.replace(/create: /g, "create_broken: ") : source,
          );
        }
        const violations = await check({ packageDir: scratch });
        expect(
          violations.length,
          `产物 ${artifact} 被破坏后门禁必须报错（否则它不在检查面内）`,
        ).toBeGreaterThan(0);
      });
    }
  });

  it("declares every bare dependency its emitted artifacts import", () => {
    // 产物里出现的裸说明符必须都在 dependencies 里声明。它与 delivery-load 的
    // checkDeclaredDependencies 同源，但这一层在**本套件**里跑（build 之后、
    // 产物在磁盘上），因此不依赖「本机 node_modules 布局碰巧可解析」。
    const emitted = ["typert.host.js", "typert.remote-client.js", "index.js"];
    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);

    const pattern =
      /(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*['"]([^'"]+)['"]/g;
    const undeclared = new Set<string>();
    for (const file of emitted) {
      for (const match of readArtifact(join("lib", file)).matchAll(pattern)) {
        const specifier = match[1] ?? match[2];
        if (specifier === undefined) continue;
        if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:"))
          continue;
        const parts = specifier.split("/");
        const packageName = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
        if (packageName !== undefined && !declared.has(packageName)) undeclared.add(specifier);
      }
    }
    expect(
      [...undeclared],
      "产物 import 了未在 dependencies 中声明的包（本地可能因提升而碰巧可解析）",
    ).toEqual([]);
  });

  // ── 身份自证：产物必须真的是本次候选 ───────────────────────────────────────

  it("stamps the pinned toolchain identity into the Host artifact", async () => {
    // 〔为什么在产物套件里查这个〕`SOLOIPS_WEB_TOOLCHAIN` 是 `getStatus` 的返回值之一，
    // **浏览器侧读到的就是它**。它声称「本产物出自哪个生成器版本」，是工具链自证；
    // 写成旧版本即**假事实**。默认套件里有一条静态断言（源码常量 vs 根 manifest 钉版），
    // 这里补的是**产物侧**：磁盘上的 index.js 真的把它编进去了。
    const host = (await import(pathToFileURL(requireArtifact("lib/index.js")).href)) as {
      SOLOIPS_WEB_TOOLCHAIN?: string;
    };
    const rootManifest = JSON.parse(
      readFileSync(join(packageDir, "..", "..", "package.json"), "utf8"),
    ) as { devDependencies?: Record<string, string> };
    const pinned = rootManifest.devDependencies?.["@deepseek-ai/dsh-typert-generator"];
    expect(pinned, "根 manifest 必须钉住生成器版本").toBeDefined();
    expect(
      host.SOLOIPS_WEB_TOOLCHAIN,
      "产物内的工具链自证必须含根 manifest 的生成器钉版（否则浏览器读到假事实）",
    ).toContain(String(pinned));
  });
});
