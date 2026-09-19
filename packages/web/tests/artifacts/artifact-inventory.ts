import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 产物行为套件的**声明式清单**（BE-0b-ii / F-03）。
 *
 * ── 为什么需要清单，而不是散落在用例里的条件判断 ─────────────────────────────
 * 外审 F-03 的事实：默认套件（`vitest.config.ts`）里的产物断言此前一律写成
 * `if (!hasArtifact) return`，而 CI 的 `Test` 步骤跑在 `Build` **之前**
 * （`.github/workflows/verify.yml`），于是这些断言在 CI 上**从未执行**——
 * 「产物行为测试通过」这件事在 CI 上是假象。修法不是把条件判断改得更聪明，
 * 而是让产物用例成为**要求产物存在的独立步骤**，并用本清单把「哪些产物必须
 * 在、哪些用例必须真的跑过」变成**可机械核对的事实**。
 *
 * 〔约束〕本清单是**手工维护的事实**，因此配套两层守卫（见 `artifact-suite-guard.ts`）：
 *  - 磁盘核对：{@link REQUIRED_ARTIFACTS} 逐条必须存在（缺一即红）；
 *  - 执行核对：{@link REQUIRED_CASES} 逐条必须在本次运行中**实际执行且通过**，
 *    且执行总数不得少于 {@link MIN_EXECUTED_CASES}。
 * 这样「删掉一条用例」或「某用例被 skip/todo」都会让该步骤失败，而不是静默变绿。
 *
 * 〔约束〕本文件的**数据**部分被 `vitest.artifacts.config.ts` 直接 import
 * （config 在主进程里读清单，先于任何用例执行）。因此这里不得引入 vitest 运行时
 * 依赖——只用 `node:*`。
 */

/** 包根目录（`packages/web`）。 */
export const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** `dsh.client` 声明的包名（= Loader 行名 = `__ModuleLoader__.load` 的注册键）。 */
export const PACKAGE_ID = "soloips-web";

/**
 * 产物行为用例**必须**依赖的产物（相对包根）。
 *
 * 判据是「交付面实际指向的文件」：`package.json` 的 `exports` / `files` 指向它们，
 * 缺任何一个都意味着交付工件不可用——这正是本步骤要拦下的形态，而不是构建
 * 成功与否。`lib/types/**` 由 tsc 产出（`typecheck` 阶段即写），`lib/*.js` 由
 * tsdown 产出（只有 `build` 阶段会写）；两者都在本步骤的覆盖内，因为本步骤
 * 在 `build` **之后**运行。
 */
export const REQUIRED_ARTIFACTS = [
  // 浏览器半边（tsdown）：DSH 客户端模块加载器消费的闭包工厂。
  "lib/client.js",
  // Host 半边（tsdown）：Remote 服务实现。
  "lib/index.js",
  // Host 侧 Typert 生成物（tsdown）：Remote 描述符与 codec。
  "lib/typert.host.js",
  "lib/typert.host.d.ts",
  "lib/typert.remote-client.js",
  "lib/typert.remote-client.d.ts",
  // Host 入口声明面（tsc）：exports["."] / exports["./contracts"] 的 types 目标。
  "lib/types/index.d.ts",
  "lib/types/contracts.d.ts",
  "lib/types/client/index.d.ts",
] as const;

/**
 * **关键用例**的 `it` 标题清单：这些用例必须在本次运行中实际执行且通过。
 *
 * 〔为什么按标题而非数量〕数量守卫只能证明「跑了 N 条」，不能证明「跑的是哪几条」：
 * 把关键用例删掉、再补两条无关的，数量守卫照样通过。按标题核对则把「哪几条」
 * 变成事实。标题改动必须同步本清单——这是**有意的摩擦**，避免覆盖被静默削弱。
 */
export const REQUIRED_CASES = [
  // 浏览器产物行为（真执行 VM + 挂载 + codec）。
  "registers a closure factory under the loader row name",
  "materializes in a simulated page and mounts the generated contribution",
  "carries a strict codec that actually validates",
  "keeps server-side implementation and credentials out of the artifact",
  "inlines the generated contribution instead of leaving an external require",
  // Host 侧 Typert 产物行为（真 import + 运行时同判据）。
  "emits every declared artifact named by package.json exports (无部分生成)",
  // 运行期身份唯一（BE-6a 身份分裂修复）：两份 SoloipsWebHost 类定义会让
  // `instanceof` 判别在装配路径上失败（E2E 报 gateway/internal）。
  "exposes exactly one SoloipsWebHost class definition at runtime (身份唯一)",
  // 网关调用路径（BE-6a E2E 红的真正根因）：经 traceable Proxy 改绑 `this` 后调用
  // 不得触达私有成员——V8 的品牌检查不做 Proxy 透传，旧实现抛
  // `Receiver must be an instance of class SoloipsWebHost`。
  "keeps the gateway call path free of private-member access (Proxy receiver)",
  "carries the getStatus invocation in the Host face model",
  "emits a mountable Remote contribution for the browser half",
  "generates Remote consumer types from the public ./contracts subpath",
  // 交付面自洽：exports 的每个条件（含 types）都必须解析到存在的文件。
  "resolves every package.json export target to an existing file (交付面自洽)",
  // 门禁的**执行**判据（不是读文本）：正向 + 反向 + 覆盖面。
  "the codec gate passes on the real artifacts (正向判据)",
  "the codec gate really flags a bad artifact (执行判据，非读文本)",
  "the codec gate covers every typert.*.js artifact on disk (清单完整性)",
  // 产物依赖面：产物 import 的裸说明符必须已在 dependencies 声明。
  "declares every bare dependency its emitted artifacts import",
  // 身份自证：产物内编入的工具链标识必须与根 manifest 的钉版一致。
  "stamps the pinned toolchain identity into the Host artifact",
  // F-04：激活日志的失败诊断扫描（空/仅标题/正常/真实失败四态可区分）。
  "activation scan distinguishes empty / header-only / clean / failure logs (F-04 正反例)",
  // F-04：正向激活确认（空日志、目标缺失、无摘要、摘要不一致都必须失败）。
  "positive activation confirmation rejects empty logs and unbound artifacts (F-04 正向)",
  // F-04：能力声明不得过强（分支措辞与能力一致）。
  "keeps the activation-log branch honest about its capability (F-04 要求 1)",
] as const;

/**
 * 最少执行用例数守卫（与 {@link REQUIRED_CASES} 独立维护，两者都要满足）。
 *
 * 〔为什么两个都要〕标题清单防「删掉关键用例」，数量守卫防「清单本身被缩减」
 * ——两者是不同的失效模式。改动本数字必须是有意的。
 */
export const MIN_EXECUTED_CASES = 20;

/**
 * 取产物的绝对路径，**缺失即抛**。
 *
 * 〔为什么用抛而不是 `expect(...).toBe(true)`〕用例体里的第一句就抛，能给出
 * 「哪个产物缺失、该跑什么命令」的可行动信息；`if (!exists) return` 则会把
 * 必验项伪装成通过——那正是 F-03 要消除的形态。
 *
 * @param relativePath - 相对包根的产物路径。
 * @returns 绝对路径。
 */
export function requireArtifact(relativePath: string): string {
  const absolute = join(packageDir, relativePath);
  if (!existsSync(absolute)) {
    throw new Error(
      `产物缺失：${absolute}\n` +
        `本套件（vitest.artifacts.config.ts）只允许在 \`pnpm run build\` **之后**运行。` +
        `先跑构建，或确认步骤顺序（CI 见 .github/workflows/verify.yml 的 build 之后）。`,
    );
  }
  return absolute;
}
