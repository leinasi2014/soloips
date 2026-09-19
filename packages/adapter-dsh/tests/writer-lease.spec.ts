/**
 * 写权租约（跨进程 fence）的机制测试：互斥载体、代际语义、释放语义。
 *
 * 依据：
 *  - `src/contracts.ts` 的 `SoloipsWriterLease`（互斥由 `withFileLock` 的锁窗口
 *    承担；`generation` 只是诊断，**不是** fencing token）；
 *  - `src/ports/storage.ts` 的「写权租约」节（锁窗口横跨整个租约生命周期）；
 *  - `data-contract.md` §4.3「第二写者拒绝」（第二 opener 打开即被拒，已持有者
 *    不受干扰）；
 *  - `docs/technical-architecture.md` 验收场景 4「写权独占」。
 *
 * 〔为什么同进程用例能代表跨进程〕本端口的互斥**不经过**任何进程内状态：它由
 * `withFileLock` 在文件系统上 `wx` 独占创建 `<lease>.lock` 实现（见文件头注释
 * 「全程不使用进程内 Map 承担正确性」）。同进程的第二个 acquire 走的是与第二个
 * 进程完全相同的文件路径，因此它是本套件可复现的那一半证据；真实多进程验收按
 * `vitest.config.ts` 的约定另开独立入口，不混入默认套件。
 *
 * 〔本文件与 `storage-port.spec.ts` 的关系〕本文件承接原先散在
 * `storage-port.spec.ts` 的租约用例（原 describe「storage port · writer lease」），
 * 并补齐「互斥载体 / 代际不参与判定 / 介质损坏」三类。原用例的断言逐条保留，
 * 未削弱；`storage-port.spec.ts` 保留 stack/facility/spec 桥部分。
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { SoloipsWriterLease } from "../src/contracts";
import { createStoragePort } from "../src/ports/storage";

/** 租约文件名与它的锁兄弟（与 `src/ports/storage.ts` 的常量同源）。 */
const LEASE_FILE_NAME = ".soloips-writer-lease.json";
const lockPathOf = (root: string): string => join(root, `${LEASE_FILE_NAME}.lock`);
const leasePathOf = (root: string): string => join(root, LEASE_FILE_NAME);

/** 无宿主服务的桩（lease 不触达 ctx）。 */
function bareContext(): Context {
  const stub = {
    get() {
      return undefined;
    },
    emit() {
      /* noop */
    },
  } satisfies Pick<Context, "get" | "emit">;
  return stub as unknown as Context;
}

const tempRoots: string[] = [];
const openLeases: SoloipsWriterLease[] = [];

async function newTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "soloips-adapter-lease-"));
  tempRoots.push(root);
  return root;
}

function newPort(leaseWaitMs: number) {
  return createStoragePort(bareContext(), { defaultBackend: "json", leaseWaitMs });
}

/** 取得租约并登记，保证用例失败时也被释放（不留锁文件给后续用例）。 */
async function acquireTracked(
  port: ReturnType<typeof newPort>,
  root: string,
): Promise<SoloipsWriterLease> {
  const lease = await port.acquireWriterLease({ root });
  openLeases.push(lease);
  return lease;
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readLeaseGeneration(root: string): Promise<unknown> {
  const raw = JSON.parse(await readFile(leasePathOf(root), "utf8")) as { generation?: unknown };
  return raw.generation;
}

/** 锁文件是否存在（返回内容以便核对持有者 pid；不存在即 undefined）。 */
async function readLockFile(root: string): Promise<string | undefined> {
  try {
    return await readFile(lockPathOf(root), "utf8");
  } catch {
    return undefined;
  }
}

afterEach(async () => {
  while (openLeases.length > 0) {
    const lease = openLeases.pop();
    if (lease !== undefined) await lease.dispose();
  }
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  }
});

describe("writer lease · 取得与代际", () => {
  it("取得租约：generation 从 1 起，storageId 规范化，assertHeld 通过", async () => {
    const root = await newTempRoot();
    const lease = await acquireTracked(newPort(200), root);

    expect(lease.generation).toBe(1);
    expect(lease.storageId).toBe(`json:${root}`);
    expect(await readLeaseGeneration(root)).toBe(1);
    await expect(lease.assertHeld()).resolves.toBeUndefined();
  });

  it("释放后可再取：代际在介质上递增（+1 并原子提交）", async () => {
    const root = await newTempRoot();
    const port = newPort(150);

    const first = await acquireTracked(port, root);
    expect(first.generation).toBe(1);
    await first.dispose();

    const second = await acquireTracked(port, root);
    expect(second.generation).toBe(2);
    // 代际是**介质上的**事实（不是内存计数）：直接读租约文件核对。
    expect(await readLeaseGeneration(root)).toBe(2);
  });

  it("相对根以 INVALID_CONFIG 拒绝（不做 home 解析）", async () => {
    await expect(newPort(200).acquireWriterLease({ root: "relative/root" })).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_INVALID_CONFIG",
    });
  });
});

describe("writer lease · 互斥载体（第二写者拒绝）", () => {
  it("持有时锁兄弟文件存在且内容为持有者 pid；dispose 后消失", async () => {
    const root = await newTempRoot();
    const lease = await acquireTracked(newPort(200), root);

    // 互斥是**文件系统**事实：`wx` 创建的 `<lease>.lock`（见 dsh-atomic-write
    // 的 withFileLock）。这个断言把「互斥由谁承担」钉在可观察的介质上。
    expect(await readLockFile(root)).toBe(`${process.pid}\n`);

    await lease.dispose();
    expect(await readLockFile(root)).toBeUndefined();
  });

  it("同进程重复 acquire 同一 root：在等待上限内重试，超时以 LEASE_NOT_HELD 拒绝；持有者不受干扰", async () => {
    const root = await newTempRoot();
    const port = newPort(150);
    const holder = await acquireTracked(port, root);

    // 〔记录的实际行为〕不是「立即失败」也不是「阻塞到持有者释放」，而是
    // 在 `leaseWaitMs` 内指数退避重试，到期限仍未取到即失败（fail-closed：
    // 不接管、不回收他人的锁）。争用者与持有者在同进程内也**不**重入。
    const startedAt = Date.now();
    const contender = port.acquireWriterLease({ root });
    // 争用期间：持有者不受干扰，锁文件仍是持有者的（争用者没有破坏/接管它）。
    await delay(30);
    await expect(holder.assertHeld()).resolves.toBeUndefined();
    expect(await readLockFile(root)).toBe(`${process.pid}\n`);

    await expect(contender).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_LEASE_NOT_HELD",
    });
    const elapsed = Date.now() - startedAt;
    // 下界取等待上限的一半（远低于实现保证的 ≥ leaseWaitMs，只排除「立即失败」
    // 与「根本没等」；上界排除挂死）。不按上限取等，避免 CI 计时抖动。
    expect(elapsed).toBeGreaterThanOrEqual(75);
    expect(elapsed).toBeLessThan(5_000);

    // 失败方不改变介质状态：代际没有被递增（bumpGeneration 只在持锁窗口内跑）。
    expect(await readLeaseGeneration(root)).toBe(1);
    await expect(holder.assertHeld()).resolves.toBeUndefined();
  });

  it("争用失败后，同一 root 仍可正常取到（失败路径不留残余锁）", async () => {
    const root = await newTempRoot();
    const port = newPort(120);
    const holder = await acquireTracked(port, root);
    await expect(port.acquireWriterLease({ root })).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_LEASE_NOT_HELD",
    });

    await holder.dispose();
    const next = await acquireTracked(port, root);
    expect(next.generation).toBe(2);
  });
});

describe("writer lease · 释放语义", () => {
  it("dispose 幂等；释放后 assertHeld 以 LEASE_NOT_HELD 拒绝", async () => {
    const root = await newTempRoot();
    const lease = await acquireTracked(newPort(200), root);

    await lease.dispose();
    await expect(lease.dispose()).resolves.toBeUndefined();
    await expect(lease.assertHeld()).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_LEASE_NOT_HELD",
    });
  });
});

describe("writer lease · generation 不参与失权判定（契约边界）", () => {
  it("持有期间介质上的代际被改写，assertHeld 仍通过且互斥仍生效", async () => {
    const root = await newTempRoot();
    const port = newPort(120);
    const lease = await acquireTracked(port, root);

    // 模拟「介质上的代际前进了」：直接改写租约文件（绕过本端口的写路径）。
    // 〔为什么这个断言是契约的一部分〕`SoloipsWriterLease` 明确 `generation`
    // 只是诊断、不是 fencing token；失权判定**不**读它。若将来有人把代际改成
    // 判定依据，本用例会失败——此时必须同时改契约注释与写路径代价说明，
    // 不能只改实现。
    await writeFile(leasePathOf(root), `${JSON.stringify({ generation: 999 })}\n`, {
      mode: 0o600,
    });
    await expect(lease.assertHeld()).resolves.toBeUndefined();
    // 保护不来自代际，而来自锁：改写介质**没有**让第二个写者取到写权。
    await expect(port.acquireWriterLease({ root })).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_LEASE_NOT_HELD",
    });
  });
});

describe("writer lease · 介质损坏（fail-closed）", () => {
  it("代际不是非负整数：acquire 以 LEASE_NOT_HELD 拒绝，锁被释放且修好后可再取", async () => {
    const root = await newTempRoot();
    await mkdir(root, { recursive: true });
    await writeFile(leasePathOf(root), `${JSON.stringify({ generation: "nope" })}\n`, {
      mode: 0o600,
    });

    const port = newPort(120);
    await expect(port.acquireWriterLease({ root })).rejects.toMatchObject({
      code: "SOLOIPS_ADAPTER_LEASE_NOT_HELD",
    });
    // 失败路径不遗留锁（withFileLock 的 finally 删除自己创建的锁）。
    expect(await readLockFile(root)).toBeUndefined();

    // 介质可修：修好后照常取权（坏值不被采纳，也不被当成 0 静默重置）。
    await writeFile(leasePathOf(root), `${JSON.stringify({ generation: 5 })}\n`, { mode: 0o600 });
    const lease = await acquireTracked(port, root);
    expect(lease.generation).toBe(6);
  });
});
