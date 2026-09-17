/**
 * SOLOIPS-ADAPTER-EVENTS-PORT
 *
 * 事件 seam（能力 5/5）：adapter 拥有的事件词表（契约 §3.2(c)）。
 *
 * core 只订阅/派发 `soloips:*`，不订阅 DSH 原生事件名；DSH 事件改名只影响本
 * 文件。词表经模块增强登记到 cordis `Events`，端口方法把调用面约束在
 * `SoloipsEventMap` 的键上。
 *
 * DSH → soloips 翻译来源（0.1.6-alpha.1 工件集）：
 *  - `domain/changed`（dsh-storage-domain）→ `soloips:domain/changed`；
 *  - `subagent/start|end`（dsh-subagent）→ `soloips:subagent/start|end`；
 *  - `tools/change`（dsh-tools）→ `soloips:tools/change`；
 *  - `soloips:session/event|flush` 在会话端口的 append/flush 边界翻译
 *    （dsh-session 的事件源不在本包依赖集内；见 src/ports/session.ts）。
 *
 * 禁止项 #9：词表只有 `soloips:*`；已移除的 `hmr/config-update-failed`
 * （0.1.6 无实现）不在可观测面内。
 */

import type { Context } from "@deepseek-ai/cordis";
import type { SoloipsEventMap, SoloipsEventsPort } from "../contracts.js";
import { soloipsSessionId, toSoloipsBlocks } from "./shared.js";

/** 端口可见的事件键（= `keyof SoloipsEventMap`）。 */
type SoloipsEventKey = keyof SoloipsEventMap;

declare module "@deepseek-ai/cordis" {
  interface Events {
    "soloips:domain/changed": SoloipsEventMap["soloips:domain/changed"];
    "soloips:subagent/start": SoloipsEventMap["soloips:subagent/start"];
    "soloips:subagent/end": SoloipsEventMap["soloips:subagent/end"];
    "soloips:session/event": SoloipsEventMap["soloips:session/event"];
    "soloips:session/flush": SoloipsEventMap["soloips:session/flush"];
    "soloips:tools/change": SoloipsEventMap["soloips:tools/change"];
  }
}

/** 构造事件端口。纯对象构造：只捕获 ctx，不触达宿主资源。 */
export function createEventsPort(ctx: Context): SoloipsEventsPort {
  return {
    on<K extends SoloipsEventKey>(name: K, listener: SoloipsEventMap[K]): () => void {
      // 宿主泛型按完整键联合实例化后，监听器类型逐成员等价（增强条目与契约同型）。
      const key: SoloipsEventKey = name;
      return ctx.on(key, listener);
    },
    once<K extends SoloipsEventKey>(name: K, listener: SoloipsEventMap[K]): () => void {
      const key: SoloipsEventKey = name;
      return ctx.once(key, listener);
    },
    async parallel<K extends SoloipsEventKey>(
      name: K,
      ...args: Parameters<SoloipsEventMap[K]>
    ): Promise<void> {
      await ctx.parallel(name, ...args);
    },
    async serial<K extends SoloipsEventKey>(
      name: K,
      ...args: Parameters<SoloipsEventMap[K]>
    ): Promise<void> {
      await ctx.serial(name, ...args);
    },
  };
}

/**
 * 注册 DSH → soloips 的事件翻译（返回解除函数）。
 *
 * 由 `apply` 在副作用阶段经 `ctx.effect` 挂载（SEAM-07：`enabled === false`
 * 时不会执行到这里）。
 */
export function wireEventTranslations(ctx: Context): () => void {
  const offs: Array<() => boolean> = [];
  offs.push(
    ctx.on("domain/changed", (change) => {
      ctx.emit("soloips:domain/changed", change);
    }),
  );
  offs.push(
    ctx.on("subagent/start", (info) => {
      ctx.emit("soloips:subagent/start", {
        runId: info.runId,
        childId: soloipsSessionId(info.id),
        provider: info.provider,
      });
    }),
  );
  offs.push(
    ctx.on("subagent/end", (info) => {
      ctx.emit("soloips:subagent/end", {
        runId: info.runId,
        childId: soloipsSessionId(info.id),
        // 宿主 end 事件不带 structured/diagnostic；output 无最后一条非空
        // assistant 消息时按契约取空数组。
        result: {
          stopReason: info.stopReason,
          output: toSoloipsBlocks(info.lastAssistantMessage ?? []),
        },
      });
    }),
  );
  offs.push(
    ctx.on("tools/change", () => {
      ctx.emit("soloips:tools/change");
    }),
  );
  return () => {
    for (const off of offs) off();
  };
}
