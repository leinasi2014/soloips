/**
 * **本文件故意包含一个类型错误，不要修复、不要提交。**
 *
 * 用途：P2 完整性对照。它是 `consumer.ts` 的机械副本 + 一行
 * `export const deliberateBreak: number = 'not a number'`。
 * 它必须编译失败（TS2322），以此证明 P1 的 exit 0 不是「tsconfig 没生效」。
 *
 * 生成方式：`(Get-Content consumer.ts -Raw) + "`nexport const deliberateBreak: number = 'not a number'`n"`
 *
 * 编译探针 B：模拟 core 依赖 adapter 契约。
 *
 * 目的（task-4 验收「契约草案可直接被 core 依赖编译」）：
 *  1. core 侧只 import 本契约，不 import 任何 `@deepseek-ai/*` 能力包；
 *  2. 正向：按冻结的调用顺序（lease → stack → open → effect 回收）能通过类型检查；
 *  3. 反向：SEAM-X1 的 `ctx.storageDomain` 回退、缺 facility、任何 any 逃避
 *     都必须**编译失败**。反向用例见 consumer-negative.ts。
 */

import type {
  SoloipsAdapter,
  SoloipsAdapterConfig,
  SoloipsDomainFacility,
  SoloipsDomainSpec,
  SoloipsDomainTableSpec,
  SoloipsKvTable,
  SoloipsStorageStack,
  SoloipsValueSchema,
  SoloipsWriterLease,
} from './contracts.ts'

// ── core 侧自有的业务 domain spec（core 拥有；adapter 只负责 open 机制） ──────

/** 一个最小 schema 实现，证明契约不依赖任何具体 schema 库。 */
declare const employeeSchema: SoloipsValueSchema<{ readonly id: string; readonly name: string }>

type EmployeeTable = SoloipsDomainTableSpec<'employee', { readonly id: string; readonly name: string }>

const companyDomain = {
  name: 'soloips_company',
  version: 1,
  tables: { employee: employeeSchema as unknown as EmployeeTable },
} satisfies SoloipsDomainSpec

// 键/值投影必须从 spec 推导出来，而不是靠手写。
type EmployeeKey = ReturnType<typeof employeeTable> extends SoloipsKvTable<infer K, unknown> ? K : never
declare function employeeTable(): SoloipsKvTable<'employee', { readonly id: string; readonly name: string }>

// ── 正向：core 的装配顺序 ────────────────────────────────────────────────────

/**
 * core 侧唯一的 adapter 消费入口。
 *
 * 顺序是契约的一部分（SEAM-12/13）：先取 lease，再建 stack，最后在租约窗口内
 * open；释放逆序。
 */
export async function applyCore(
  adapter: SoloipsAdapter,
  ctx: {
    effect(fn: () => () => Promise<void>): void
    provide(name: string, value: SoloipsAdapter): void
  },
  config: SoloipsAdapterConfig,
): Promise<void> {
  // SEAM-07 等价物：core 侧同样尊重总开关，不做任何副作用。
  if (config.enabled === false) return

  const lease: SoloipsWriterLease = await adapter.storage.acquireWriterLease({ root: '/tmp/soloips-probe-root' })

  let stack: SoloipsStorageStack | undefined
  try {
    stack = await adapter.storage.createStack({ root: '/tmp/soloips-probe-root', backend: config.defaultBackend ?? 'json' })
  } catch (error: unknown) {
    await lease.dispose()
    throw error
  }

  // SEAM-X1：facility 必须显式来自 stack；类型层要求显式传入。
  const facility: SoloipsDomainFacility = adapter.storage.requireFacility(stack.facility)

  const domain = await facility.open(companyDomain)

  ctx.effect(() => {
    return async () => {
      // 逆序释放：domain → stack → lease（SEAM-14）。
      await domain.close()
      await stack.dispose()
      await lease.dispose()
    }
  })

  ctx.provide('soloipsCore', adapter)
}

// ── 正向：写路径必须在发布前复核写权 ────────────────────────────────────────

export async function commitEmployee(
  adapter: SoloipsAdapter,
  lease: SoloipsWriterLease,
  domain: { table(name: 'employee'): SoloipsKvTable<'employee', { readonly id: string; readonly name: string }> },
  record: { readonly id: string; readonly name: string },
): Promise<void> {
  // 契约要求：每个持久发布点之前复核写权，而不是只在启动时检查一次。
  await lease.assertHeld()
  await domain.table('employee').put(record.id as EmployeeKey & 'employee', record)

  // 事件面经 adapter 转译，core 不订阅 DSH 原生事件名。
  const off = adapter.events.on('soloips:domain/changed', change => {
    void change.operation
  })
  off()
}

// ── 正向：五类端口都存在且类型完整 ──────────────────────────────────────────

export function assertPorts(adapter: SoloipsAdapter): readonly string[] {
  const names: string[] = []
  if (adapter.storage !== undefined) names.push('storage')
  if (adapter.session !== undefined) names.push('session')
  if (adapter.subagents !== undefined) names.push('subagents')
  if (adapter.tools !== undefined) names.push('tools')
  if (adapter.events !== undefined) names.push('events')
  if (adapter.agents !== undefined) names.push('agents')
  if (adapter.team !== undefined) names.push('team')
  const readiness = adapter.readiness()
  return [...names, ...readiness.missingServices, readiness.config.defaultBackend]
}

export const deliberateBreak: number = 'not a number'

