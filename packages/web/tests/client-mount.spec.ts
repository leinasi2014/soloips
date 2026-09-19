import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

import {
  PAGE_MODULE_TABLE_WORDS,
  pageRequire,
  type ModuleTableRequest,
} from "./support/page-modules.js";
import { pageContext } from "./support/page-context.js";

const pkgRoot = dirname(fileURLToPath(import.meta.url));
const packageDir = join(pkgRoot, "..");
const repoRoot = join(packageDir, "..", "..");
const libDir = join(packageDir, "lib");
const clientArtifact = join(libDir, "client.js");
const clientSource = join(packageDir, "src", "client", "index.ts");

/** `dsh.client` 声明的包名（= Loader 行名 = `__ModuleLoader__.load` 的注册键）。 */
const CLIENT_PACKAGE_ID = "soloips-web";

/**
 * 浏览器半边挂载契约测试（BE-0b-i）。
 *
 * ── 与 CI 门禁顺序的关系（刻意设计，不是将就）────────────────────────────
 * CI 顺序是 format → lint → **typecheck** → **test** → **build**
 * （`.github/workflows/verify.yml`），即 `test` 跑在 `build` 之前：**tsdown 产物
 * 此时不存在**。因此本文件对产物的断言一律**条件化**（`lib/client.js` 不在则
 * 跳过），与 `typert-artifacts.spec.ts` 的既有分工一致——产物有效性由
 * `check:build-repro` 在 build **之后**兜住。
 *
 * 但有一条**不能**条件化：`client-modules` 的两段式校验（声明了 `dsh.client`
 * 却缺 `./client` 即抛）必须由**源码与 manifest 的静态一致性**在默认套件里就
 * 拦下——否则「声明了但没产物」只会在宿主启动时才炸。该断言见
 * `package-contract.spec.ts` 的 `declares ./client and dsh.client as one coherent pair`。
 *
 * ── 产物断言做了什么（产物在时才跑）──────────────────────────────────────
 * 真实执行：把 `lib/client.js` 放进 `node:vm` 的上下文里跑一遍，模拟页面的
 * `window.__ModuleLoader__.load`，取出工厂并**物化**它，再调 `apply()`。
 * 这验证的是「产物在目标运行时里真的能注册、能物化、能把贡献交给 `$mount`」，
 * 而不是「文件存在」——后者不是确认（项目红线第 5 条）。
 */
describe("soloips-web browser half (BE-0b-i)", () => {
  const hasArtifact = existsSync(clientArtifact);

  it("keeps the client entry as a real module with apply/inject (源码面)", () => {
    // 这一条**非条件**：即使产物未构建，源码也必须存在且导出挂载面。
    // 它是「客户端半边存在」的最低事实，与 bundle 是否已打包无关。
    expect(existsSync(clientSource), `客户端入口必须存在：${clientSource}`).toBe(true);
    const source = readFileSync(clientSource, "utf8");
    // 〔判据一律先剥注释〕本文件的说明文字与 `src/client/index.ts` 的文件头都会
    // **逐字引用**这些声明形态（讨论缺陷时必然要写出旧形态的原文）。不剥注释时
    // `toContain` 会被注释本身满足——**实测**：把源码改回 `export function apply(`
    // 后断言仍通过，因为文件头里写着 `export async function apply(...)`。故取值面
    // 必须先剥掉注释，否则这是一条「读文本却读到了说明文本」的假绿。
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // 〔FE-1a-FIX 订正〕原断言是 `toContain("export function apply(")`，它把**缺陷形态**
    // 当成了契约。cordis 的 `Fiber._execute` 用 `isConstructor` 分派
    // （`@deepseek-ai/cordis@4.0.2` 的 `lib/index.js:1066-1070`），而该判据就是
    // 「`func.prototype` 存在」（同文件 `:57-62`）——**函数声明有 `prototype`**，于是
    // `apply` 被 `new` 调用、其返回值（卸载钩子）被丢弃，卸载路径静默失效。
    // `async function` 声明没有 `prototype`，走普通调用分支，返回值被
    // `Fiber._execute` 以 `then` 收下（`:1144`）。故本断言钉住的是**正确形态**；
    // 行为判据（真 cordis 卸载路径）见
    // `tests/artifacts/artifact-behavior.artifact.ts` 的「hands apply's disposer to
    // the framework」用例——本条只是廉价的前哨，不能替代那条。
    expect(code, "必须导出 async 形态的 apply（无 prototype，cordis 才会收下返回值）").toContain(
      "export async function apply(",
    );
    expect(
      code,
      "不得残留函数声明形态的 apply（有 prototype 即被 cordis 以 new 调用、返回值被丢弃）",
    ).not.toContain("export function apply(");
    expect(code, "必须导出 inject（服务等待声明）").toContain("export const inject");
    // 值导入面必须**只有**本包的 /remote（`./company/register.js` 的导入不算：
    // 它是**本包内部**的相对导入，不是跨包值耦合）。判据取**裸说明符**：相对
    // 导入以 `.` 开头，而跨包值耦合必然是裸包名。
    const valueImports = [...source.matchAll(/^import\s+(?!type\b)[^;]*from\s+"([^"]+)"/gm)]
      .map((match) => match[1])
      .filter((specifier) => specifier !== undefined && !specifier.startsWith("."));
    expect(
      valueImports,
      "浏览器半边只允许值导入本包生成的 /remote（其余经 cordis 服务协作）",
    ).toEqual([`${CLIENT_PACKAGE_ID}/remote`]);
    // 〔约束〕不得声明 cordis `Context` 增强。实测：生成器把「本包声明的、出现在
    // Context 增强里的具名类型」读作**本包贡献的服务**（`collectServices` 要求类型
    // 与增强成员同属一个包），于是 client face 凭空多出一条服务面，并进而要求
    // `exports["./client/typert"]` 与 `lib/typert.client.*` 产物
    // （`typert(client): soloips-web must export ./client/typert as …`）。
    // `remote` 的提供者是官方 api-gateway/client，我们只是消费者。
    //
    // 判据用的 `code`（已剥注释）见本用例开头——本文件的说明文字里就写着这条约束，
    // 不剥会把注释本身当违规。
    expect(code, "浏览器半边不得声明 Context 增强（会被生成器读成服务贡献面）").not.toContain(
      "declare module",
    );
  });

  it("keeps the client compile face declaration-only (构建面不产自引用 JS 中间产物)", () => {
    // 〔为什么非条件断言〕浏览器半边以运行时值导入 `soloips-web/remote`（本包自我
    // 引用）。若 client 编译工程也产 JS，`lib/types/client/index.js` 会带着那条裸
    // 说明符留在 `lib/**/*.js` 里，被 `check:delivery-load` 的
    // `checkDeclaredDependencies` 读作「产物 import 了未声明的依赖」而失败
    // （实测）。该中间产物既不是交付面（`exports["./client"].default` 指向 tsdown
    // 的 `lib/client.js`），也不该被当成依赖问题的证据——故编译面必须只产声明。
    const config = JSON.parse(
      readFileSync(join(packageDir, "tsconfig.client.json"), "utf8")
        // tsconfig 是 JSONC：剥掉整行注释后再解析。
        .replace(/^\s*\/\/.*$/gm, ""),
    ) as { compilerOptions?: { emitDeclarationOnly?: boolean; paths?: unknown } };
    expect(
      config.compilerOptions?.emitDeclarationOnly,
      "client 编译工程必须 emitDeclarationOnly（否则会产出自引用的 JS 中间产物）",
    ).toBe(true);
    // 〔约束〕不得声明 paths：rolldown 会读走它并把类型替身当运行时模块解析
    // （实测 `MISSING_EXPORT: "TYPERT_REMOTE" is not exported by …`）。
    // 类型面由 `src/client/remote-artifact.d.ts` 的环境模块声明提供。
    expect(
      config.compilerOptions?.paths,
      "client 编译工程不得声明 paths（会被 rolldown 读走，污染运行时解析）",
    ).toBeUndefined();
  });

  it("registers a closure factory under the loader row name (产物形态)", () => {
    if (!hasArtifact) return;
    const source = readFileSync(clientArtifact, "utf8");
    // DSH 的模块表只认 `window.__ModuleLoader__.load({id, factory})` 这一种注册形态
    // （`client-modules/src/client/manifest.ts` 的 ClientBundleRegistration）。
    expect(source).toContain("window.__ModuleLoader__.load(");
    expect(source, "注册键必须等于 Loader 行名（包名）").toContain(
      `id: ${JSON.stringify(CLIENT_PACKAGE_ID)}`,
    );
  });

  it("materializes in a simulated page and mounts the generated contribution", async () => {
    if (!hasArtifact) return;
    const source = readFileSync(clientArtifact, "utf8");

    // 页面侧最小环境：只有 `window.__ModuleLoader__` 的注册口。
    const registrations: {
      id: string;
      factory: (require: (spec: string) => unknown) => unknown;
    }[] = [];
    const sandbox = {
      window: {
        __ModuleLoader__: {
          load(registration: {
            id: string;
            factory: (require: (spec: string) => unknown) => unknown;
          }) {
            registrations.push(registration);
          },
        },
      },
      console,
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: "client.js" });

    expect(registrations.length, "bundle 必须恰好注册一次工厂").toBe(1);
    const registration = registrations[0];
    expect(registration?.id).toBe(CLIENT_PACKAGE_ID);

    // 物化工厂。`require` 用页面模块表的替身：表内说明符返回真实模块，表外的抛错。
    // 〔FE-1a 起的事实变化〕此前这里传的是「必然抛错」的哨兵，用来证明「外部面
    // 漏配了」；公司面板引入 React 后产物**合法地**请求 `react`（页面模块表的行），
    // 故判据精确化为「请求面 ⊆ 模块表」——见 `./support/page-modules.js`。
    const requests: ModuleTableRequest[] = [];
    const exports = registration?.factory(pageRequire(requests)) as {
      apply?: unknown;
      inject?: unknown;
    };

    expect(
      requests.map((request) => request.specifier).sort(),
      "产物请求的每个说明符都必须在页面模块表内（表外即页面无法应答）",
    ).toEqual(
      requests
        .filter((request) => request.inTable)
        .map((request) => request.specifier)
        .sort(),
    );
    expect(requests.length, "产物至少应请求 react 的 JSX 运行时").toBeGreaterThan(0);
    expect(exports.inject, "inject 必须声明 remote / slots / locale 三个服务").toEqual([
      "remote",
      "slots",
      "locale",
    ]);
    expect(typeof exports.apply, "apply 必须是函数").toBe("function");

    // `apply` 必须把生成的贡献交给 `$mount`，并**透传**其 disposer
    // （cordis 以 apply 的返回值作为卸载钩子；丢弃会让重载泄漏 namespace）。
    //
    // 〔为什么用 `./support/page-context.js` 而不是手写 ctx 字面量〕FE-1a 起 `apply`
    // 在 `$mount` 之后还要注册公司面板，面板经 `ctx.get("remote.soloips")` 解析本包
    // 的 namespace 服务（`register.js` 的 `servicesOf`，**产品代码真实走过的取值
    // 路径**）。手写的 `{ remote: { $mount } }` 替身没有 `get` →
    // `TypeError: ctx.get is not a function`（实测）。替身按官方语义补齐三件事：
    // `$mount` 在 resolve 前把 namespace 装进服务表（`api-gateway/client` 的
    // `createNamespace` → cordis 的 `Service` → `reflect.provide`）、`ctx.get` 整串
    // 键直查 store、未发布的键返回 `undefined`。读源清单见该模块文件头。
    const page = pageContext<{ package: string; descriptors: { id: string }[] }>();
    const returned = await (exports.apply as (ctx: unknown) => Promise<unknown>)(page.ctx);

    expect(page.mounts.length, "$mount 必须被调用一次").toBe(1);
    expect(page.mounts[0]?.contribution.package).toBe(CLIENT_PACKAGE_ID);
    expect(
      page.mounts[0]?.contribution.descriptors?.map((descriptor) => descriptor.id),
      "挂载的必须是 Host 半边生成的 getStatus 描述符",
    ).toContain("soloips-web#soloips/getStatus");
    // 〔顺序契约的可判定形态〕既定顺序是「先 `$mount`、再注册面板」；调换后
    // `ctx.get("remote.soloips")` 读不到（服务表里还没有），`servicesOf` 抛错。
    // 这里把事实钉住：面板注册**读到了**与挂载同一批实例的 namespace 服务。
    expect(
      page.service("remote.soloips"),
      "面板注册必须在 $mount 之后：`ctx.get('remote.soloips')` 应解析到本次挂载装出的服务",
    ).toBeDefined();
    expect(returned, "apply 必须透传 $mount 的 disposer").not.toBe(page.mounts[0]?.unmount);
    // 〔为什么是「不相等」〕FE-1a 起 `apply` 的返回值不再是 `$mount` 的 disposer
    // 本身，而是一个**组合** disposer（先注销面板、再 await 卸载贡献）——卸载顺序
    // 与安装顺序相反。断言「不是同一个函数」证明包装确实存在；断言「await 它不抛」
    // 证明包装是可调用的（下一条）。
    await (returned as () => Promise<void>)();
    expect(page.namespaces(), "卸载后 namespace 服务必须从服务表撤回").toEqual({});
  });

  it("carries a strict codec that actually validates (非空贡献)", async () => {
    if (!hasArtifact) return;
    const source = readFileSync(clientArtifact, "utf8");
    const registrations: { factory: (require: (spec: string) => unknown) => unknown }[] = [];
    const sandbox = {
      window: {
        __ModuleLoader__: { load: (r: (typeof registrations)[number]) => registrations.push(r) },
      },
      console,
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: "client.js" });

    const exports = registrations[0]?.factory(pageRequire([])) as {
      apply: (ctx: unknown) => Promise<unknown>;
    };
    // 本用例只消费贡献的 **codec 形状**（真贡献的其余字段不参与断言）。
    interface CodecContribution {
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
    // 〔替身同上一用例〕`apply` 需要 `ctx.get("remote.soloips")` 解析本包的
    // namespace 服务（面板注册路径）；见 `./support/page-context.js` 的读源清单。
    // 本用例的判据是**贡献内容**，故从替身的挂载记录里取回贡献。
    const page = pageContext<CodecContribution>();
    await exports.apply(page.ctx);
    const contribution = page.mounts[0]?.contribution;

    // 〔按 id 选，不按下标〕BE-6a 起本贡献含 6 条描述符（getStatus + 业务面五项），
    // 且生成顺序由生成器决定。按 `descriptors[0]` 取会让本用例的**判据**随描述符
    // 数量与顺序漂移——它想证明的是「getStatus 的 codec 是真 codec」，不是
    // 「第一条描述符的 codec 是真 codec」。按 id 取使两者一致。
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
    // 〔BE-0b-ii 契约变更〕codec 由 `schema: TypertSchema`（直接持 zod 对象）
    // 改为 `create: () => TypertSchema`（惰性 thunk，首次边界使用时物化）。
    // 依据：`@deepseek-ai/dsh-typert-protocol@0.1.6-alpha.2` 的 `TypertCodec`，
    // 以及运行时 `dsh-typert-loader` 的 `requireStrictCodec`（要求
    // `typeof codec.create === "function"`）。生成器 alpha.1 产出 `schema`、
    // alpha.2 产出 `create`——运行时是 fork HEAD（alpha.2 契约），故本仓
    // 生成器/协议必须同为 alpha.2，否则装配期 entry 激活失败。
    // 注意 `create()` 每次调用返回同一惰性物化实例，故下面的两次断言
    // 必须各自调用一次 `create()`，不能假设返回对象可跨调用复用身份。
    const parameterSchema = descriptor?.parameters?.[0]?.codec.create();
    expect(parameterSchema?.safeParse({ note: "ping" }).success).toBe(true);
    expect(parameterSchema?.safeParse({ note: 1 }).success).toBe(false);
    const resultSchema = descriptor?.result.create();
    expect(resultSchema?.safeParse({ service: "s", echo: "e", toolchain: "t" }).success).toBe(true);
    expect(resultSchema?.safeParse({ service: "s" }).success).toBe(false);
  });

  it("keeps server-side implementation and credentials out of the artifact (验收条款 5)", () => {
    if (!hasArtifact) return;
    const source = readFileSync(clientArtifact, "utf8");
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
    // Node 内置模块都不得出现：本 bundle 在浏览器里执行。
    //
    // 〔判据口径（FE-1a 收紧）〕原判据是「任何裸 `require("<小写名>")` 都不允许」，
    // 它把 `react` 这类**页面模块表行**也判成 Node 内置——因为正则只按「小写裸名」
    // 匹配。公司面板引入 React 后该口径直接误报（实测：`expected [ 'react' ] to
    // deeply equal []`）。改为按**Node 内置清单**判定（`node:` 前缀 + 官方内置名），
    // 这才是原判据真正想表达的性质；「模块表外的裸说明符」由
    // `materializes in a simulated page …` 用例的请求面断言覆盖。
    const nodeBuiltins = new Set([
      "assert",
      "buffer",
      "child_process",
      "cluster",
      "crypto",
      "dgram",
      "dns",
      "events",
      "fs",
      "http",
      "https",
      "net",
      "os",
      "path",
      "process",
      "querystring",
      "readline",
      "stream",
      "string_decoder",
      "timers",
      "tls",
      "tty",
      "url",
      "util",
      "v8",
      "vm",
      "worker_threads",
      "zlib",
    ]);
    const requires = [...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map(
      (match) => match[1] ?? "",
    );
    expect(
      requires.filter((specifier) => specifier.startsWith("node:")),
      "浏览器产物不得 require node: 前缀的内置模块",
    ).toEqual([]);
    expect(
      requires.filter((specifier) => nodeBuiltins.has(specifier)),
      "浏览器产物不得 require Node 内置模块的裸名",
    ).toEqual([]);
  });

  it("pins the page module table to the build-time word list (模块表同步)", () => {
    // 〔为什么必须钉住〕产物合法请求的说明符集合必须 ⊆ 页面模块表；而测试用的
    // 替身（`./support/page-modules.js` 的 `PAGE_MODULE_TABLE_WORDS`）是**手写**的
    // 一份。两者分叉时，测试会用一个比构建面更宽或更窄的表来判定——
    // 更宽 → 放过表外说明符（假绿）；更窄 → 把合法请求判成违规（假红）。
    // 故从**真值源**（`tsdown.config.ts` 的 `MODULE_TABLE_WORDS`）读出来双向比对。
    const config = readFileSync(join(repoRoot, "tsdown.config.ts"), "utf8");
    const block = /const MODULE_TABLE_WORDS: readonly string\[\] = \[([\s\S]*?)\];/.exec(config);
    expect(block, "tsdown.config.ts 必须声明 MODULE_TABLE_WORDS").not.toBeNull();
    const words = [...(block?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
    expect(words.length, "MODULE_TABLE_WORDS 不得为空").toBeGreaterThan(0);
    expect(
      [...PAGE_MODULE_TABLE_WORDS].sort(),
      "测试的页面模块表替身必须与构建期的 MODULE_TABLE_WORDS 逐字相等",
    ).toEqual([...words].sort());
  });

  it("wires the build-time mirror of the missing-bundle error (反例可判定)", () => {
    // 〔为什么本用例**不**做 `hasArtifact` 条件跳过（QA 变异发现，2026-09-18）〕
    // 它断言的全是**配置文本**（`tsdown.config.ts` 的内容），不需要任何产物。
    // 此前它带着 `if (!hasArtifact) return`，而 CI 的 `test` 跑在 `build` **之前**
    // （`.github/workflows/verify.yml`），故该断言在 CI 上**恒被跳过**——QA 实测：
    // 把 `clientArtifactContractGate(` 从配置里整条摘掉，CI 门禁链仍全绿
    // （test/build/repro/delivery-load 均 exit 0）。那是**假绿**：门是产物契约的
    // 唯一构建期守卫，摘掉它没有任何门禁会响。故本用例无条件执行。
    const config = readFileSync(join(repoRoot, "tsdown.config.ts"), "utf8");
    expect(config, "构建期必须有产物契约门").toContain("soloips-web/client-artifact-contract");
    expect(config, "门必须检查产物存在").toContain("未产出");
    expect(config, "门必须检查注册形态").toContain("__ModuleLoader__.load({");
    // 〔判据来源〕产物路径必须**从 manifest 读**（宿主就是这么解析的），
    // 写死路径会让门与实际交付契约分叉。
    expect(config, '门必须读 exports["./client"] 而不是写死路径').toContain(
      'manifest.exports?.["./client"]',
    );
    // 门必须在 **client 配置**上（而非只在 node 配置上）：它判的是浏览器产物。
    const clientConfigAt = config.indexOf("function clientBundleConfig");
    expect(clientConfigAt, "必须存在 clientBundleConfig").toBeGreaterThanOrEqual(0);
    const clientConfigBody = config.slice(clientConfigAt);
    expect(clientConfigBody).toContain("clientArtifactContractGate(");
  });

  it("materializes the Typert artifacts before the browser bundle resolves them (时序契约)", () => {
    // 〔同上的条件跳过修正〕配置接线断言（物化步骤存在/挂载位置/执行阶段）只读
    // `tsdown.config.ts` 文本，不依赖产物 → 无条件执行；**产物形态**断言（真内联、
    // 无外部 require）需要 `lib/client.js`，保留条件化（CI 的 test 在 build 之前）。
    const config = readFileSync(join(repoRoot, "tsdown.config.ts"), "utf8");
    expect(config, "必须存在物化步骤").toContain("soloips-web/materialize-host-artifacts");
    const clientConfigAt2 = config.indexOf("function clientBundleConfig");
    const clientConfigBody2 = config.slice(clientConfigAt2);
    expect(clientConfigBody2, "物化必须挂在 client 配置上").toContain(
      "soloips-web/materialize-host-artifacts",
    );
    // 必须在 `buildStart`（先于模块解析）而不是 writeBundle（后于打包）里跑。
    expect(clientConfigBody2, "物化必须在 buildStart 阶段执行").toMatch(
      /materialize-host-artifacts[\s\S]{0,200}buildStart\(\)/,
    );

    // ── 以下需要产物 ──────────────────────────────────────────────────────
    if (!hasArtifact) return;
    // 〔实测的静默失败模式〕浏览器半边以运行时值导入 `soloips-web/remote`，该文件由
    // Typert 生成器写出；而生成器插件挂在 **node 配置**上，其 writeBundle 与浏览器
    // bundle 的构建**并发**。控制实验（删掉物化步骤 + 冷构建）的结果是：
    // **构建退出码仍为 0**，但 `lib/client.js` 从 170.6 kB 缩到 3.4 kB——rolldown 把
    // 未解析的 `soloips-web/remote` 当作**外部依赖**留下，产物变成一个没有贡献对象的
    // 空壳。这正是本用例要固定的事实：物化步骤是**承载时序的必需件**，不是优化。
    const source = readFileSync(clientArtifact, "utf8");
    expect(source, "产物必须内联生成的贡献（真内联）").toContain("soloips/getStatus");
    expect(source, "产物不得把 soloips-web/remote 留成外部 require（那是空壳形态）").not.toMatch(
      /require\(\s*["']soloips-web\/remote["']\s*\)/,
    );
  });

  it("pins the Typert face posture and the dual-face trap (BE-0b-i 遗留约束)", () => {
    // 〔本用例固定的是一条**陷阱**，不是风格偏好〕
    //
    // 生成器的 `isDualFacePackage`（`lib/index.js:2019-2022`）= 有 `dsh.client` 且有
    // `exports["./client*"]`。本包自 BE-0b-i 起满足该判据，于是 host 聚合引用包根
    // `tsconfig.json` 时，生成器会**双面展开**该包（`lib/index.js:292-300`），client
    // 那份用的是**包根 tsconfig 的 fileNames**。实测：`faces: ["host", "client"]` 报
    //   `typert(client): soloips-web export ./client resolves to missing source
    //    …/src/client/index.ts`
    // 因为包根 tsconfig 为让 Host 工程不产自引用 JS 中间产物而 `exclude` 了
    // `src/client/**`（理由见该文件注释）。
    //
    // 实测的边界（不要据此过度推断）：把根 `tsconfig.client.json` 的引用从
    // `packages/web/tsconfig.client.json` 改成 `packages/web`，报错**不变**——说明
    // 胜出的 client 登记来自 host 聚合的双面展开，根聚合的引用目标不是这条错误的自变量。
    // 因此修复方向在**包内配置形态**（例如把 Host 与 client 拆成两个 tsc 工程、
    // 让双面展开各自读到正确的 fileNames），不在根聚合。
    //
    // 本用例把当前姿态钉住：改动 `faces` 前必须先解决上述冲突。
    const config = readFileSync(join(repoRoot, "tsdown.config.ts"), "utf8");
    expect(
      config,
      '当前只跑 faces: ["host"]；改为 ["host","client"] 会触发 dual-face 冲突（见本用例注释）',
    ).toContain('faces: ["host"]');
    // 根 `tsconfig.client.json` 必须存在：生成器在 workspace 根按固定名读它
    // （`clientConfig ?? "tsconfig.client.json"`）。缺失时请求 client face 会以
    // `Cannot read file '…/tsconfig.client.json'` 失败（实测）——fail-closed，
    // 但错误信息指向配置缺失而非真实原因。
    expect(
      existsSync(join(repoRoot, "tsconfig.client.json")),
      "根 client 聚合必须存在（生成器按固定名读取）",
    ).toBe(true);
  });
});
