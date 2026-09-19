/**
 * 测试支持：页面模块表的**替身**（`lib/client.js` 的物化环境）。
 *
 * ── 为什么需要它（FE-1a 起的事实变化）───────────────────────────────────────
 * 浏览器半边在 FE-1a 之前**没有**任何模块表外部面：产物把一切都内联，因此测试
 * 传入的 `require` 可以是一个「必然抛错」的哨兵，用来证明「外部面漏配了」。
 * 公司面板引入 React 后这条性质**变了**：产物现在合法地
 * `require("react")` / `require("react/jsx-runtime")`——两者都在页面模块表
 * （`packages/client/web/src/platform.ts` 的 `PLATFORM_MODULES`，本仓
 * `tsdown.config.ts` 的 `MODULE_TABLE_WORDS` 逐字同步）里，由页面 seed 应答。
 *
 * 因此「任何 `require` 都是缺陷」这条判据不再成立，取而代之的是更精确的一条：
 * **产物请求的每个说明符都必须在页面模块表里**。本模块把该判据做成可执行的
 * 替身：表内的说明符返回真实模块（`react`/`react-dom` 由本包的 devDependencies
 * 提供），表外的一律抛错——与页面运行时的行为一致（`client-modules/src/client/
 * system.ts` 的 `makeRequire`：seed → 已物化 → 已注册工厂，三者皆无即抛）。
 *
 * ── 与 `MODULE_TABLE_WORDS` 的关系（为什么这里手写一份）────────────────────
 * 本清单**必须**与 `tsdown.config.ts` 的 `MODULE_TABLE_WORDS` 一致，否则测试会
 * 用一份比构建面更宽/更窄的表来判定。两者的同步由
 * `tests/client-mount.spec.ts` 的 `pins the page module table` 用例钉住
 * （它从 `tsdown.config.ts` 读真值并与本清单双向比对）——不靠人工记得改。
 */

import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";

/** 页面模块表的**运行时**应答面（只列本仓测试需要真实值的那些）。 */
const REAL_MODULES: Readonly<Record<string, unknown>> = {
  react,
  "react/jsx-runtime": jsxRuntime,
};

/**
 * 页面模块表的说明符清单（与 `tsdown.config.ts` 的 `MODULE_TABLE_WORDS` 逐字相等）。
 *
 * 〔约束〕改动本清单必须同时改 `tsdown.config.ts`；`client-mount.spec.ts` 的
 * 同步用例会在两者分叉时失败。
 */
export const PAGE_MODULE_TABLE_WORDS: readonly string[] = [
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

/** 一次物化请求的记录（用于「请求了哪些外部面」的断言）。 */
export interface ModuleTableRequest {
  readonly specifier: string;
  /** 该说明符是否在页面模块表内（`false` 即产物请求了页面无法应答的模块）。 */
  readonly inTable: boolean;
}

/**
 * 造一个页面 `require` 替身。
 *
 * @param requests - 记录每次请求（调用方据此断言「请求面 ⊆ 模块表」）。
 * @returns 与页面 `makeRequire` 同语义的解析函数。
 */
export function pageRequire(requests: ModuleTableRequest[]): (specifier: string) => unknown {
  return (specifier: string) => {
    const inTable = PAGE_MODULE_TABLE_WORDS.includes(specifier);
    requests.push({ specifier, inTable });
    if (!inTable) {
      throw new Error(
        `页面模块表无法应答 "${specifier}"——本 bundle 请求了表外说明符（构建期的纯度门应当拦下它）。`,
      );
    }
    const real = REAL_MODULES[specifier];
    if (real !== undefined) return real;
    // 表内但本测试未提供真实值（`react-dom` 等）：返回一个惰性代理，使物化成功
    // 而**任何使用**都会抛错。判据是「能否物化 + 请求面是否合法」，不是「渲染」。
    return new Proxy(
      {},
      {
        get(_target, key) {
          throw new Error(
            `测试未提供 "${specifier}" 的真实值，而产物在物化期访问了它的 "${String(key)}" 成员。`,
          );
        },
      },
    );
  };
}
