/**
 * core 的 `backend` 配置：声明面 ↔ 实现面的接线（STORAGE-05）。
 *
 * 〔为什么单列一条〕`packages/core/cordis.patch.yml` 的 backend 注释曾写「缺省 json
 * （与 adapter 的 defaultBackend 一致）」——**两处都不实**：core 给的是**显式覆写**
 * （不是「缺省声明」），而 adapter 的真实缺省是 `sqlite`
 * （`packages/adapter-dsh/src/contracts.ts` 的 `SOLOIPS_ADAPTER_CONFIG_DEFAULTS`）。
 * 声明与实现分叉时**没有失败信号**：core 只在本键有值时透传，缺省由 adapter 兜底，
 * 于是「以为在用 JSON、实际用 SQLite」这类事故既不报错也不告警——正是审查批评的
 * 「声明面大于实现面」形态。
 *
 * 本文件把这条链钉成断言：
 *  1. **行为**（跨层）：显式给 backend → adapter 的 `createStack` 收到该值；不给 →
 *     请求里**没有**该键，由 adapter 的 `defaultBackend` 决定。
 *  2. **接线**：插件层 config 的键名与透传（`parseCoreConfig` → `entry`）真的到达
 *     `createStack`（与 `plugin.spec.ts` 对 `planCode` 的接缝断言同构——「store 接受
 *     某配置」不等于「config 的该键真的传到了 store」）。
 *  3. **声明**：产品层与部署层声明的 backend 都是 adapter **可构造**的名字；且两层与
 *     adapter 缺省的取值关系与 `cordis.patch.yml` 的说明文字一致（注释失真即红）。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SOLOIPS_ADAPTER_CONFIG_DEFAULTS,
  SOLOIPS_ADAPTER_SERVICE_NAME,
  type SoloipsStoragePort,
  type SoloipsStorageStackOptions,
} from "soloips-adapter-dsh/contracts";

import type { SoloipsCoreHostContext, SoloipsCoreLogger } from "../src/index";
import soloipsCoreEntry from "../src/index";
import { SOLOIPS_CORE_SERVICE_NAME } from "../src/contracts";
import { openSoloipsCompanyStore } from "../src/store";
import { fakeStoragePort, resetFakeAdapter } from "./adapter-fakes";
import { TEST_ACCOUNT_ID } from "./seed";

const ROOT = "/tmp/soloips-backend-config-root";

beforeEach(() => {
  resetFakeAdapter();
});

// ─────────────────────────────────────────────────────────────────────────────
// 记录 createStack 请求的 storage 端口
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 在 `fakeStoragePort` 外套一层**请求记录**。
 *
 * 记录的是 core 实际交给 adapter 的**那个对象**（不是复制），故 `Object.hasOwn` 能
 * 区分「不透传该键」与「传了 `backend: undefined`」——前者让 adapter 的
 * `options.backend ?? config.defaultBackend` 走兜底，后者在 `exactOptionalPropertyTypes`
 * 下本不可表达，但配置面是 unknown 进的，必须由断言而非类型来保证。
 */
function recordingStoragePort(): {
  readonly port: SoloipsStoragePort;
  readonly created: SoloipsStorageStackOptions[];
} {
  const inner = fakeStoragePort();
  const created: SoloipsStorageStackOptions[] = [];
  const port: SoloipsStoragePort = {
    ...inner,
    async createStack(options) {
      created.push(options);
      return inner.createStack(options);
    },
  };
  return { port, created };
}

/** 断言 createStack 收到过请求，并返回第一个（`noUncheckedIndexedAccess` 下的收窄）。 */
function firstStackRequest(
  created: readonly SoloipsStorageStackOptions[],
): SoloipsStorageStackOptions {
  const request = created[0];
  if (request === undefined) throw new Error("createStack 未被调用（端口未被 core 使用）");
  return request;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 行为：core → adapter 的透传（跨层）
// ─────────────────────────────────────────────────────────────────────────────

describe("openSoloipsCompanyStore 的 backend 透传（core → adapter.createStack）", () => {
  it("显式 backend 按原样交给 adapter（core 覆写 adapter 缺省的那一层）", async () => {
    const { port, created } = recordingStoragePort();
    const service = await openSoloipsCompanyStore({
      storage: port,
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
      backend: "sqlite",
    });
    expect(firstStackRequest(created).backend).toBe("sqlite");
    await service.close();
  });

  it("不给 backend：请求里**没有**该键（由 adapter 的 defaultBackend 决定，不是 core 造一个值）", async () => {
    const { port, created } = recordingStoragePort();
    const service = await openSoloipsCompanyStore({
      storage: port,
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    // 〔为什么断言「键不存在」而不是 `=== undefined`〕`options.backend ?? default` 对
    // 两者等价，但「core 自己填了个 undefined 进去」会在 `exactOptionalPropertyTypes`
    // 之外（如 JSON 序列化的配置日志）留下可观察差异；契约是「不透传」。
    expect(Object.hasOwn(firstStackRequest(created), "backend")).toBe(false);
    await service.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 接线：插件层 config → store → adapter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 宿主替身：只实现本文件被测路径用到的成员。
 *
 * 理由与 `plugin.spec.ts` 同：真实 `Context` 有 30+ 成员，让替身实现完整接口等于
 * 要求伪造全部成员；「与宿主同形」的证据在 `host-context-compat.spec.ts` 的编译期
 * 断言，不在替身自身。`asHostContext` 的 `satisfies` 在此处求值。
 */
class FakeHostContext {
  static readonly asHostContext = (instance: FakeHostContext): SoloipsCoreHostContext =>
    instance satisfies SoloipsCoreHostContext;

  readonly provided = new Map<string, unknown>();
  readonly warnings: string[] = [];
  readonly #services = new Map<string, unknown>();
  readonly #disposers: Array<() => void | Promise<void>> = [];

  inject(
    ...args: Parameters<SoloipsCoreHostContext["inject"]>
  ): ReturnType<SoloipsCoreHostContext["inject"]> {
    const [, callback] = args;
    void callback(this as never);
    return undefined as unknown as ReturnType<SoloipsCoreHostContext["inject"]>;
  }

  get(name: string): unknown {
    return this.#services.get(name);
  }

  provide(
    ...args: Parameters<SoloipsCoreHostContext["provide"]>
  ): ReturnType<SoloipsCoreHostContext["provide"]> {
    // 〔为什么用下标取值 + 显式标注，而不是 `const [name, value] = args`〕宿主签名是
    // `provide(name: string, value?: any)`，元组第二项因此是 `any`；解构赋值会把 `any`
    // 直接灌进局部变量（`no-unsafe-assignment` 的报点）。`this.provided` 的声明是
    // `Map<string, unknown>`，所以标注 `unknown` 与消费面一致，且把「这个值未经校验」
    // 显式写在类型上。（与 `plugin.spec.ts` 的同名替身逐字同形。）
    const name = args[0];
    const value: unknown = args[1];
    this.provided.set(name, value);
    return (() => {
      this.provided.delete(name);
    }) as ReturnType<SoloipsCoreHostContext["provide"]>;
  }

  /** 与宿主同形（`AsyncDisposable<Promise<void>>`：可调用且 thenable）。 */
  effect(execute: () => unknown): ReturnType<SoloipsCoreHostContext["effect"]> {
    const returned = execute();
    const disposers: unknown[] =
      typeof returned === "function" ? [returned] : [...(returned as Iterable<unknown>)];
    this.#disposers.push(...(disposers as (() => void | Promise<void>)[]));
    const dispose = async (): Promise<void> => {
      for (const disposer of disposers) {
        const index = this.#disposers.indexOf(disposer as () => void | Promise<void>);
        if (index >= 0) this.#disposers.splice(index, 1);
      }
    };
    return Object.assign(dispose, {
      then: <R>(onfulfilled: (value: () => Promise<void>) => R): Promise<R> =>
        Promise.resolve(dispose).then(onfulfilled),
    }) as ReturnType<SoloipsCoreHostContext["effect"]>;
  }

  readonly logger = Object.assign((): SoloipsCoreLogger => this.logger, {
    warn: (message: string): void => {
      this.warnings.push(message);
    },
    error: (message: string): void => {
      this.warnings.push(message);
    },
  });

  setService(name: string, value: unknown): void {
    this.#services.set(name, value);
  }

  /** 模拟宿主卸载：驱动入口注册的 disposer（逆序释放的触发点）。 */
  async unload(): Promise<void> {
    for (const disposer of this.#disposers.splice(0)) {
      await disposer();
    }
  }
}

describe("插件层 config.backend 的键名与透传（parseCoreConfig → entry → createStack）", () => {
  it("config.backend 到达 createStack（键名漂移会让部署配置静默失效）", async () => {
    const { port, created } = recordingStoragePort();
    const ctx = new FakeHostContext();
    ctx.setService(SOLOIPS_ADAPTER_SERVICE_NAME, { storage: port });
    soloipsCoreEntry(ctx, {
      enabled: true,
      storageRoot: ROOT,
      accountId: TEST_ACCOUNT_ID,
      backend: "sqlite",
    });
    await vi.waitFor(() => {
      expect(ctx.provided.has(SOLOIPS_CORE_SERVICE_NAME)).toBe(true);
    });
    expect(firstStackRequest(created).backend).toBe("sqlite");
    await ctx.unload();
  });

  it("config 不给 backend：不透传该键，且服务照常发布（走 adapter 缺省，不是 fail-closed）", async () => {
    const { port, created } = recordingStoragePort();
    const ctx = new FakeHostContext();
    ctx.setService(SOLOIPS_ADAPTER_SERVICE_NAME, { storage: port });
    soloipsCoreEntry(ctx, { enabled: true, storageRoot: ROOT, accountId: TEST_ACCOUNT_ID });
    await vi.waitFor(() => {
      expect(ctx.provided.has(SOLOIPS_CORE_SERVICE_NAME)).toBe(true);
    });
    expect(Object.hasOwn(firstStackRequest(created), "backend")).toBe(false);
    expect(ctx.warnings).toEqual([]);
    await ctx.unload();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 声明：产品层 / 部署层声明的 backend 值
// ─────────────────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(here, "..", "..", "..");
const PRODUCT_PATCH = join(workspaceRoot, "packages", "core", "cordis.patch.yml");
const DEPLOYMENT_PATCH = join(workspaceRoot, "profiles", "soloips", "cordis.patch.yml");

/**
 * 本适配层能自行构造的 backend 名。
 *
 * 〔为什么在这里硬编码〕adapter 的 `CONSTRUCTIBLE_BACKENDS`（`ports/storage.ts`）**未
 * 导出**，而本断言的对象是**声明文件里的字面量**（不经 adapter 运行）。硬编码的代价
 * 是「adapter 新增可构造后端时本名单要同步」——由 adapter 侧的拒绝路径用例
 * （`storage-port.spec.ts` 的「非支持 backend fail-closed」）作为权威，本名单只做
 * 声明面的拼写防线（`sqllite` 这类错拼在运行期只表现为 fail-closed 不发布服务）。
 */
const CONSTRUCTIBLE_BACKENDS: readonly string[] = ["json", "sqlite"];

/** 取某 patch 文件里某行声明的 config（`insert: [{id, config}]` 与裸 `- id/config` 两种形状）。 */
function rowConfig(file: string, rowId: string): Readonly<Record<string, unknown>> | undefined {
  const entries = parseYaml(readFileSync(file, "utf8")) as readonly {
    readonly id?: string;
    readonly config?: Record<string, unknown>;
    readonly insert?: readonly {
      readonly id?: string;
      readonly config?: Record<string, unknown>;
    }[];
  }[];
  for (const entry of entries) {
    if (entry.id === rowId && entry.config !== undefined) return entry.config;
    for (const row of entry.insert ?? []) {
      if (row.id === rowId && row.config !== undefined) return row.config;
    }
  }
  return undefined;
}

describe("backend 声明的取值（产品层 / 部署层）", () => {
  it("两处声明都是 adapter 可构造的名字（错拼只会在运行期静默 fail-closed）", () => {
    const declared = [
      { layer: "产品层", value: rowConfig(PRODUCT_PATCH, "soloips-core")?.["backend"] },
      { layer: "部署层", value: rowConfig(DEPLOYMENT_PATCH, "soloips-core")?.["backend"] },
    ];
    for (const { layer, value } of declared) {
      expect(value, `${layer}应声明 core 行的 backend`).toBeTypeOf("string");
      expect(
        CONSTRUCTIBLE_BACKENDS,
        `${layer}声明的 backend "${String(value)}" 不是 adapter 可构造的名字：` +
          `createStack 会以 SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE 拒绝，服务不发布`,
      ).toContain(value);
    }
  });

  it("产品层与 adapter 缺省**不同**、部署层与 adapter 缺省相同——注释所述关系的机械依据", () => {
    // 〔本断言不主张「两层必须满足某关系」，它主张「注释描述的关系与事实一致」〕
    // `packages/core/cordis.patch.yml` 的 backend 说明写着：这是**显式覆写**（产品层给
    // json），未给时由 adapter 的 defaultBackend（sqlite）决定，且部署层重述为 sqlite
    // 因而当前部署实际用 SQLite。三者（产品值、部署值、adapter 缺省）中**任一**变化都会
    // 让那段说明失真，而说明失真没有别的失败信号。
    //
    // 〔红了怎么办（这是**绊线**，不是禁止变更）〕本条只要求改动者显式处理：
    //  - 改产品层值（如 json → sqlite，即与 adapter 缺省对齐）：这是**行为变更**——
    //    未重述 core 行的部署会把介质由 JSON 换成 SQLite，两种格式不互通、存量数据不
    //    自动迁移。须先取得裁定，再同时改产品层值、`cordis.patch.yml` 的说明与本断言。
    //  - 改 adapter 缺省：影响**所有**省略 backend 的部署，同样须同步说明与本断言。
    // 刻意**不**写成「产品层必须等于 json」：那会把合法变更也判红，而本条要拦的是
    // 「静默分叉」，不是「变更」本身。
    const product = rowConfig(PRODUCT_PATCH, "soloips-core")?.["backend"];
    const deployed = rowConfig(DEPLOYMENT_PATCH, "soloips-core")?.["backend"];
    const adapterDefault = SOLOIPS_ADAPTER_CONFIG_DEFAULTS.defaultBackend;
    expect(
      product,
      "产品层 backend 已与 adapter 缺省相同——若这是有意对齐，请同步改 " +
        "packages/core/cordis.patch.yml 的说明文字与本断言（改值属行为变更，须先裁定）",
    ).not.toBe(adapterDefault);
    expect(
      deployed,
      "部署层 backend 与 adapter 缺省不同——部署实际生效的是部署层的值，请核对 " +
        "packages/core/cordis.patch.yml 与 profiles/soloips/cordis.patch.yml 的说明是否仍成立",
    ).toBe(adapterDefault);
  });
});
