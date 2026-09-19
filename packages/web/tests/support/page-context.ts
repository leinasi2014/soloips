/**
 * 测试支持：**页面侧 cordis 上下文**的替身（浏览器产物 `apply` 的运行环境）。
 *
 * ── 为什么需要它（FE-1a 的接线事实变化）─────────────────────────────────────
 * `src/client/index.js` 的 `apply` 在 `$mount` 完成后调用
 * `registerSoloipsCompanyPanel(ctx)`，后者经 `ctx.get("remote.soloips")` 直查
 * store（`src/client/company/register.js` 的 `servicesOf`）。公司面板之前 `apply`
 * 只做 `$mount`，于是 `{ remote: { $mount } }` 形状的替身够用；面板引入后
 * `ctx.get` 成为**产品代码真实走过的取值路径**，缺它即
 * `TypeError: ctx.get is not a function`（**实测**：产物套件与默认套件各两条用例
 * 因此红）。
 *
 * ── 替身按**真契约**建模，不是按「让测试过」建模（读源确认）───────────────
 * 三处语义取自官方实现：
 *
 *  1. **`remote.<ns>` 是点分服务键，由 `$mount` 装进服务表**
 *     `@deepseek-ai/dsh-api-gateway` 的 `packages/api/gateway/src/client/index.ts`
 *     `:346-378`（`createNamespace`）：namespace 在**它自己的子插件 fiber** 里构造
 *     `RemoteNamespaceService extends Service`，`super(ctx, remoteServiceKey(name))`
 *     （同文件 `:659-661`，`` `remote.${namespace}` ``）→ cordis 的 `Service` 构造器
 *     → `ctx.reflect.provide(name, self, check)`（cordis 4.0.2 `lib/index.js:1769-1781`）。
 *     故本替身把 namespace 发布进**同一张服务表**，而不是另挂一个字段。
 *  2. **`ctx.get(name)` 是整串键直查 store，且不要求 inject**
 *     cordis `lib/index.js:755-769`（`ReflectService.get` → `_getImpl`），docstring
 *     明写 "without the inject requirement"。未发布的键返回 `undefined`（**不抛**）
 *     ——`servicesOf` 的 fail-closed 分支据此触发。
 *  3. **`$mount` resolve 之前 namespace 已装好**
 *     官方 `$mount` 内部 `await owned`（同文件 `:201-209`），`owned` 的 effect 里
 *     `await this.enqueue(() => this.mountContribution(…))`，而 `mountContribution`
 *     里 `await this.installNamespace(…)`。本替身照此在 resolve 前发布服务。
 *
 * 〔第 3 条顺带钉住一条产品不变量〕`apply` 的顺序契约是「先 `$mount`、再注册面板」
 * （`src/client/index.js` 文件头：反过来会让用户在窗口期内点到尚未挂载的
 * namespace）。若实现把两步调换，本替身的 `ctx.get` 返回 `undefined`，
 * `servicesOf` 抛错、用例失败——**顺序错误在这里是可判定的**，不是靠注释约定。
 *
 * 〔替身的边界（不假装的能力）〕它**不**模拟：fiber 的 inject 等待与隔离、
 * namespace 方法被调用后的网络往返（派生的方法一律以「未连接传输面」拒绝）、
 * 槽位条目在声明塌缩时的注销（`registrations` 是**只增**的记录）。判据因此只覆盖
 * 「注册期真的走到了哪一步」，不覆盖「运行期调用能不能通」。
 */

import type {
  SoloipsLocaleSurface,
  SoloipsSlotsSurface,
} from "../../src/client/company/register.js";

/** 官方 `$mount` 的返回值形态（`TypertDisposer`）：异步卸载。 */
export type PageUnmount = () => Promise<void>;

/** 一条 Remote 描述符里本替身消费的字段（真贡献的其余字段原样留在记录里）。 */
interface PageDescriptor {
  readonly namespace: string;
  readonly method: string;
}

/** 一次挂载在服务表里装出的 namespace 及其方法（供卸载时逐条撤回）。 */
interface InstalledNamespace {
  readonly namespace: string;
  readonly methods: readonly string[];
}

/** 槽位替身：产品面（`SoloipsSlotsSurface`）+ 记录面。 */
export interface PageSlotsStub extends SoloipsSlotsSurface {
  /** `inject` 请求过的槽位键（按请求顺序）。 */
  readonly injectKeys: readonly string[];
  /** `register` 注册过的条目（按注册顺序；本替身不模拟注销）。 */
  readonly registrations: readonly {
    readonly options: Parameters<SoloipsSlotsSurface["register"]>[0];
    readonly component: unknown;
  }[];
  /** 运行所有 `inject` 回调（模拟槽位声明到来）。 */
  declare(): void;
}

/** 一次 `$mount` 调用的记录。 */
export interface PageMount<Contribution> {
  readonly contribution: Contribution;
  /** 该次挂载的卸载函数（即 `$mount` 的返回值本身）。 */
  readonly unmount: PageUnmount;
}

/** 页面上下文替身（含记录面）。 */
export interface PageContextStub<Contribution> {
  /**
   * 交给产物 `apply` 的上下文。
   *
   * 〔为什么类型是 `unknown`〕它是**页面**对象，不是本包的类型面：浏览器半边不
   * import 官方 cordis 的类型（DEV-04），产物里的 `apply` 参数类型也已擦除。
   * 调用方按需断言，替身不假装自己是 `Context`。
   */
  readonly ctx: unknown;
  /** `$mount` 的调用记录（按调用顺序）。 */
  readonly mounts: readonly PageMount<Contribution>[];
  readonly slots: PageSlotsStub;
  /** 直查服务表（与 `ctx.get` 同一张表——同一批对象实例）。 */
  readonly service: (key: string) => unknown;
  /** 当前已发布的 namespace（namespace 名 → 方法名，升序）。 */
  readonly namespaces: () => Record<string, string[]>;
}

/**
 * 校验一份贡献的**运行时形状**并取出 `namespace`/`method`。
 *
 * 〔为什么 fail-closed〕替身若静默接受任意形状，用例会在「namespace 服务从未发布」
 * 的假象下继续跑——那时红的是 `servicesOf` 的服务缺失分支，而不是「贡献形状不对」，
 * 诊断会指向错误的方向。
 *
 * @param contribution - `$mount` 收到的值。
 * @returns 逐条描述符的 `namespace`/`method`。
 * @throws {Error} 当贡献不是对象、缺 `descriptors` 数组，或某条描述符缺
 *   `namespace`/`method` 字符串。
 */
function descriptorsOf(contribution: unknown): readonly PageDescriptor[] {
  if (typeof contribution !== "object" || contribution === null) {
    throw new Error("页面替身：$mount 收到的贡献不是对象（无法派生 namespace 服务）。");
  }
  const raw = (contribution as { readonly descriptors?: unknown }).descriptors;
  if (!Array.isArray(raw)) {
    throw new Error("页面替身：$mount 收到的贡献缺 descriptors 数组（无法派生 namespace 服务）。");
  }
  const descriptors: readonly unknown[] = raw as readonly unknown[];
  return descriptors.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("页面替身：贡献的描述符不是对象（无法派生 namespace 服务）。");
    }
    const record = entry as { readonly namespace?: unknown; readonly method?: unknown };
    const { namespace, method } = record;
    if (typeof namespace !== "string" || typeof method !== "string") {
      throw new Error(
        "页面替身：描述符缺 namespace/method 字符串——真贡献的这两个字段由 Typert " +
          "生成器写出（`api-gateway/client` 按它们建 namespace 服务与端点）。",
      );
    }
    return { namespace, method };
  });
}

/** 造一个**槽位服务**替身（记录 `inject` 的键与 `register` 的条目）。 */
function slotsStub(): PageSlotsStub {
  const injectKeys: string[] = [];
  const callbacks: (() => (() => void) | Iterable<() => void, void, void>)[] = [];
  const registrations: {
    options: Parameters<SoloipsSlotsSurface["register"]>[0];
    component: unknown;
  }[] = [];
  return {
    injectKeys,
    registrations,
    inject: (key, callback) => {
      injectKeys.push(key);
      callbacks.push(callback);
      return () => undefined;
    },
    register: (options, component) => {
      registrations.push({ options, component });
      return () => undefined;
    },
    declare: () => {
      // 〔边界〕回调的返回值（条目 disposer）在此被丢弃——本替身不模拟注销，
      // `registrations` 因此是**只增**的记录（见文件头「替身的边界」）。
      for (const callback of callbacks) callback();
    },
  };
}

/**
 * 造一个页面侧上下文替身。
 *
 * @typeParam Contribution - `$mount` 收到的贡献类型。它只服务调用方的断言可读性：
 *   替身按**运行时形状**校验（见 {@link descriptorsOf}），不依赖类型参数。
 * @returns 替身（含记录面）。
 */
export function pageContext<Contribution = unknown>(): PageContextStub<Contribution> {
  const mounts: PageMount<Contribution>[] = [];
  /** 服务表：`ctx.get` 与 `ctx.<name>` 属性读取共用同一批实例（真 cordis 亦然）。 */
  const services = new Map<string, unknown>();
  /** `namespace → 方法表`（方法表即发布出去的 namespace 服务对象本身）。 */
  const tables = new Map<string, Record<string, (...args: unknown[]) => unknown>>();

  const install = (contribution: Contribution): readonly InstalledNamespace[] => {
    const descriptors = descriptorsOf(contribution);
    const byNamespace = new Map<string, string[]>();
    for (const descriptor of descriptors) {
      let table = tables.get(descriptor.namespace);
      if (table === undefined) {
        table = Object.create(null) as Record<string, (...args: unknown[]) => unknown>;
        tables.set(descriptor.namespace, table);
        // 〔发布时机〕与官方 `createNamespace` 同步（`await fiber` 之后方法已装好，
        // 故 `$mount` resolve 时 `ctx.get` 一定读得到）。
        services.set(`remote.${descriptor.namespace}`, table);
      }
      table[descriptor.method] = async (..._args: unknown[]): Promise<never> => {
        throw new Error(
          `页面替身未连接传输面：${descriptor.namespace}/${descriptor.method} 的调用没有载体` +
            "（本替身只模拟注册期，不模拟往返）。",
        );
      };
      const methods = byNamespace.get(descriptor.namespace) ?? [];
      methods.push(descriptor.method);
      byNamespace.set(descriptor.namespace, methods);
    }
    return [...byNamespace].map(([namespace, methods]) => ({ namespace, methods }));
  };

  const uninstall = (installed: readonly InstalledNamespace[]): void => {
    for (const entry of installed) {
      const table = tables.get(entry.namespace);
      if (table === undefined) continue;
      for (const method of entry.methods) delete table[method];
      // 官方 `disposeNamespace`：namespace 空了才撤服务（`api-gateway/client:380-384`）。
      if (Object.keys(table).length > 0) continue;
      tables.delete(entry.namespace);
      services.delete(`remote.${entry.namespace}`);
    }
  };

  const slots = slotsStub();
  const locale: SoloipsLocaleSurface = {
    register: () => () => undefined,
    bind:
      () =>
      (key: string): string =>
        key,
  };
  const remote = {
    async $mount(contribution: Contribution): Promise<PageUnmount> {
      const installed = install(contribution);
      const unmount: PageUnmount = async (): Promise<void> => {
        uninstall(installed);
      };
      mounts.push({ contribution, unmount });
      return unmount;
    },
  };
  services.set("remote", remote);
  services.set("slots", slots);
  services.set("locale", locale);

  return {
    ctx: {
      get: (name: string): unknown => services.get(name),
      remote,
      slots,
      locale,
    },
    mounts,
    slots,
    service: (key: string): unknown => services.get(key),
    namespaces: () => {
      const result: Record<string, string[]> = {};
      for (const [namespace, table] of tables) result[namespace] = Object.keys(table).sort();
      return result;
    },
  };
}
