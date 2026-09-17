/**
 * SOLOIPS-ADAPTER-SESSION-PORT
 *
 * session / session-persistence seam（能力 2/5）：把 `ctx.sessionPersistence`
 * 包装成契约的 `SoloipsSessionPersistence` / `SoloipsSessionHandle`。
 *
 * 边界事实（0.1.6-alpha.1）：
 *  - 宿主 `create(header)` 需要**完整** `SessionHeader`；契约只有 `create(id)`。
 *    适配层以 `version: 3`（宿主 `SESSION_FORMAT_VERSION`，类型为字面量，上游
 *    升版会在此编译失败）构造最小头：无 cwd、无父系、非 seed。
 *  - 宿主事件词表是**封闭**的（`SessionEventMap`，读取端 fail-closed）。契约的
 *    `SoloipsSessionEvent` 是开放词表；append 前先用宿主自己导出的
 *    `validateStoredEvents` 做 fail-closed 校验（未知必需类型拒绝），再交宿主。
 *  - `soloips:session/event` / `soloips:session/flush` 事件在本适配层的
 *    append/flush 边界翻译（dsh-session 的原生事件源不在本工件集内，见
 *    src/ports/events.ts 的词表注释）。
 *
 * 禁止项 #10：宿主的 `open(id, 'write')` 写所有权是**进程内**语义，这里照原样
 * 透传，不把它当作跨进程 fence——跨进程写权只经 storage 端口的 writer lease。
 */

import type { Context } from "@deepseek-ai/cordis";
import type {
  SessionHandle,
  SessionHeader,
  SessionPersistence,
  SessionPersistenceSnapshot,
} from "@deepseek-ai/dsh-session-persistence";
import {
  SessionFormatUnsupportedError,
  SessionPersistenceCorruptionError,
  validateStoredEvents,
} from "@deepseek-ai/dsh-session-persistence";
import {
  SoloipsAdapterError,
  type SoloipsSessionAccess,
  type SoloipsSessionEvent,
  type SoloipsSessionHandle,
  type SoloipsSessionId,
  type SoloipsSessionPersistence,
  type SoloipsSessionReadResult,
  type SoloipsSessionSnapshot,
  SoloipsRevision,
} from "../contracts";
import {
  hostSessionId,
  mapHostError,
  soloipsSessionId,
  toSoloipsSessionEvent,
  type HostSessionEvent,
} from "./shared";

/** 宿主 append/校验函数所期望的事件数组类型（经公开面派生）。 */
type HostSessionEvents = Parameters<typeof validateStoredEvents>[1];

function requirePersistence(ctx: Context): SessionPersistence {
  const persistence = ctx.get("sessionPersistence");
  if (persistence === undefined) {
    throw new SoloipsAdapterError(
      "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
      "host service 'sessionPersistence' is not available",
    );
  }
  return persistence;
}

/**
 * 契约的 `revision` 是不透明品牌 `SoloipsRevision`，宿主的是 backend 铸造的
 * 不透明字符串品牌 `SessionPersistenceRevision`。**原样保留完整 token 装箱**——
 * 不做哈希折叠，因为折叠会把精确的身份比较降为概率性比较
 * （碰撞即「已变化」被误判为「未变化」）。
 */
function toSoloipsRevision(token: SessionPersistenceSnapshot["revision"]): SoloipsRevision {
  return SoloipsRevision(token);
}

function toSoloipsSnapshot(snapshot: SessionPersistenceSnapshot): SoloipsSessionSnapshot {
  return {
    id: soloipsSessionId(snapshot.header.id),
    revision: toSoloipsRevision(snapshot.revision),
    ...(snapshot.eventCount !== undefined ? { eventCount: snapshot.eventCount } : {}),
    ...(snapshot.sizeBytes !== undefined ? { sizeBytes: snapshot.sizeBytes } : {}),
  };
}

/**
 * 契约事件 → 宿主事件批次。
 *
 * 复制后先经宿主导出的 `validateStoredEvents` 就地校验（封闭词表 + 记录结构 +
 * 冻结），把「未知事件类型」拒绝在**写入前**，而不是等读取端整日志拒绝。
 * 校验失败（未知词表/损坏记录）按调用方数据缺陷改抛 `TypeError`。
 */
function toHostSessionEvents(
  events: readonly SoloipsSessionEvent[],
  header: SessionHeader,
): HostSessionEvents {
  const batch = events.map((event) => ({ ...event })) as HostSessionEvents;
  try {
    return validateStoredEvents(header, batch);
  } catch (error: unknown) {
    if (
      error instanceof SessionFormatUnsupportedError ||
      error instanceof SessionPersistenceCorruptionError
    ) {
      throw new TypeError(
        `soloips-adapter: session event batch rejected by the host vocabulary: ${
          error instanceof Error ? error.message : "unknown failure"
        }`,
        { cause: error },
      );
    }
    throw error;
  }
}

function wrapSessionHandle(ctx: Context, host: SessionHandle): SoloipsSessionHandle {
  const id = soloipsSessionId(host.id);
  return {
    id,
    access: host.access satisfies SoloipsSessionAccess,
    async read(offset?: number, length?: number): Promise<SoloipsSessionReadResult> {
      try {
        const result = await host.read(offset, length);
        return { events: result.events.map(toSoloipsSessionEvent) };
      } catch (error: unknown) {
        throw mapHostError(`session.read('${id}')`, error);
      }
    },
    async append(events: readonly SoloipsSessionEvent[]): Promise<void> {
      const batch = toHostSessionEvents(events, host.header);
      try {
        await host.append(batch);
      } catch (error: unknown) {
        throw mapHostError(`session.append('${id}')`, error);
      }
      // 已提交的 append 之后广播契约事件（契约 §6 的语义）。
      for (const event of events) {
        ctx.emit("soloips:session/event", id, event);
      }
    },
    async flush(): Promise<void> {
      try {
        await host.flush();
      } catch (error: unknown) {
        throw mapHostError(`session.flush('${id}')`, error);
      }
      // 持久性检查点：宿主 flush 完成后并行派发并等待全部监听。
      await ctx.parallel("soloips:session/flush", id);
    },
    async close(): Promise<void> {
      try {
        await host.close();
      } catch (error: unknown) {
        throw mapHostError(`session.close('${id}')`, error);
      }
    },
  };
}

/** 构造会话端口。纯对象构造：只捕获 ctx，不触达宿主资源。 */
export function createSessionPort(ctx: Context): SoloipsSessionPersistence {
  return {
    async create(id: SoloipsSessionId): Promise<SoloipsSessionHandle> {
      const header: SessionHeader = {
        // 字面量 3 = 宿主 SESSION_FORMAT_VERSION；其声明类型是字面量 3，
        // 上游升版时此行编译失败（有意留出的漂移哨兵）。
        version: 3,
        id: hostSessionId(id),
        createdAt: Date.now(),
        isSeeded: false,
      };
      try {
        return wrapSessionHandle(ctx, await requirePersistence(ctx).create(header));
      } catch (error: unknown) {
        throw mapHostError(`session.create('${id}')`, error);
      }
    },
    async open(id: SoloipsSessionId, access: SoloipsSessionAccess): Promise<SoloipsSessionHandle> {
      try {
        return wrapSessionHandle(
          ctx,
          await requirePersistence(ctx).open(hostSessionId(id), access),
        );
      } catch (error: unknown) {
        throw mapHostError(`session.open('${id}', '${access}')`, error);
      }
    },
    async stat(id: SoloipsSessionId): Promise<SoloipsSessionSnapshot | undefined> {
      try {
        const snapshot = await requirePersistence(ctx).stat(hostSessionId(id));
        return snapshot === undefined ? undefined : toSoloipsSnapshot(snapshot);
      } catch (error: unknown) {
        throw mapHostError(`session.stat('${id}')`, error);
      }
    },
    async list(): Promise<readonly SoloipsSessionSnapshot[]> {
      try {
        const snapshots = await requirePersistence(ctx).list();
        return snapshots.map(toSoloipsSnapshot);
      } catch (error: unknown) {
        throw mapHostError("session.list()", error);
      }
    },
  };
}

// 静态自检：宿主事件确可直接投影为契约事件（字段同名同型）。
type AssertHostEventProjects = HostSessionEvent extends SoloipsSessionEvent ? true : never;
const assertHostEventProjects: AssertHostEventProjects = true;
void assertHostEventProjects;
