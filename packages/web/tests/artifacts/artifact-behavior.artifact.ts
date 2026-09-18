import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
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
