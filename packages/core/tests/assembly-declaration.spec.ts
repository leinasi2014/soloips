import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { SOLOIPS_ADAPTER_SERVICE_NAME } from "soloips-adapter-dsh/contracts";

/**
 * core 的装配声明与其实现的一致性。
 *
 * 为什么需要它：`cordis.patch.yml` 的 `inject` 是**运行时装配契约**，而实现的
 * `ctx.inject([...])` 是代码事实。两者不一致时**不会报错**——0.1.6 下缺服务的行
 * 只保持 pending 并产生一条 warning，退出码仍是 0（MECH-06/SOLO-F04）。
 * 于是「patch 注入的服务名写错」表现为整包静默不工作，没有可依赖的失败信号。
 *
 * 本测试把这条一致性变成静态断言。它曾真实触发过一次：T01 草案写的是
 * `storageDomain`（当时的设想要走宿主 facility），T03 实现改为只经 adapter 的
 * `soloipsAdapter` 收敛存储能力，patch 未同步。
 */

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");
const patch = parseYaml(readFileSync(join(packageRoot, "cordis.patch.yml"), "utf8")) as {
  insert?: { id?: string; inject?: string[]; config?: Record<string, unknown> }[];
}[];

/** patch 里本包那一行的 inject（服务名数组）。 */
const injectedServices = patch
  .flatMap((entry) => entry.insert ?? [])
  .find((row) => row.id === "soloips-core")?.inject;
const declaredConfig = patch
  .flatMap((entry) => entry.insert ?? [])
  .find((row) => row.id === "soloips-core")?.config;

describe("core assembly declaration matches its implementation", () => {
  it("declares the adapter service as the only injected service", () => {
    expect(injectedServices).toEqual([SOLOIPS_ADAPTER_SERVICE_NAME]);
  });

  it("does not inject storageDomain (core's write path goes through the adapter)", () => {
    // 写进 inject 会让本行依赖一个 core 已不再使用的服务，并无谓扩大待就绪面；
    // 契约里也不存在 ctx.storageDomain 回退（SEAM-X1）。
    expect(injectedServices ?? []).not.toContain("storageDomain");
  });

  it("names the same service in code as in the patch", () => {
    // 反向断言：实现里确实 inject / get 了同一个常量（避免 patch 对而代码漏）。
    expect(source).toContain("ctx.inject([SOLOIPS_ADAPTER_SERVICE_NAME],");
    expect(source).toContain("ctx2.get(SOLOIPS_ADAPTER_SERVICE_NAME)");
  });

  it("declares every config key the implementation actually reads", () => {
    // 实现从 config 读 enabled / storageRoot / backend；patch 必须全部给出，
    // 否则键缺失会走到 fail-closed 分支（storageRoot 缺失即不发布服务）。
    const implementationKeys = ["enabled", "storageRoot", "backend"];
    for (const key of implementationKeys) {
      expect(
        Object.keys(declaredConfig ?? {}),
        `patch 的 config 缺少实现会读取的键：${key}`,
      ).toContain(key);
    }
  });

  it("keeps environment-specific values out of the product patch", () => {
    // storageRoot 是部署值：产品定义只给空初值占位，实际根由部署层覆写
    // （design.md §5.4/§5.6：产品定义必须与环境无关）。
    expect(declaredConfig?.["storageRoot"]).toBe("");
  });
});
