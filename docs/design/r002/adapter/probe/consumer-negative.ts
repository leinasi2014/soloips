/**
 * 编译探针 C：反向用例。**每一个 export 都必须编译失败。**
 *
 * 这是 task-4 禁止项清单的机械证据：不是靠评审者的记忆，而是靠编译器拒绝。
 * 由 negative-check.ps1 逐个注入、断言 tsc 非零退出。
 *
 * 用法：每次只保留一个 `@ts-expect-error` 用例的激活体（脚本按标记切分）。
 */

import type {
  SoloipsAdapter,
  SoloipsDomainFacility,
  SoloipsDomainSpec,
} from './contracts.ts'

// ── NEG-1（SEAM-X1）：不得存在 ctx.storageDomain 回退 ────────────────────────

/**
 * 期望错误：`SoloipsStoragePort` 上**没有** `storageDomain` 成员，
 * 也没有任何「缺省时从 ctx 取 facility」的入口。
 * 因此 core 无法写出 SEAM-X1 的回退路径。
 */
export function neg1(ctxStorageDomain: SoloipsDomainFacility, adapter: SoloipsAdapter): unknown {
  // @ts-expect-error SOLOIPS-ADAPTER-CONTRACTS: no ctx.storageDomain fallback exists.
  return adapter.storage.storageDomain ?? ctxStorageDomain
}

// ── NEG-2（SEAM-X1）：requireFacility 不接受缺省/可省略实参 ───────────────────

/**
 * 期望错误：`requireFacility` 的参数是必填的 `SoloipsDomainFacility | undefined`。
 * 省略实参即编译错误——把「facility 必须显式传入」变成类型层要求。
 */
export function neg2(adapter: SoloipsAdapter): SoloipsDomainFacility {
  // @ts-expect-error SOLOIPS-ADAPTER-CONTRACTS: facility must be passed explicitly.
  return adapter.storage.requireFacility()
}

// ── NEG-3：domain spec 必须带 version（不可依赖运行期默认） ──────────────────

/**
 * 期望错误（TS1360）：`version` 是必填字段，缺失即不满足 `SoloipsDomainSpec`。
 * 指令必须紧邻被检查的表达式，故放在 `satisfies` 所在的整个字面量之前。
 */
// @ts-expect-error SOLOIPS-ADAPTER-CONTRACTS: version is required on a domain spec.
export const neg3: SoloipsDomainSpec = {
  name: 'soloips_x',
  tables: {},
}

// ── NEG-4：不得经 any 逃避契约类型 ──────────────────────────────────────────

/**
 * 期望错误：`noImplicitAny` 下 `unknown` 不可直接当 `SoloipsDomainFacility` 用。
 * 证明契约不允许把未校验数据直接喂进 facility 打开路径。
 */
export function neg4(raw: unknown): SoloipsDomainFacility {
  // @ts-expect-error SOLOIPS-ADAPTER-CONTRACTS: unknown must be validated, not asserted.
  return raw
}
