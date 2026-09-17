/**
 * SOLOIPS-CORE-ACCOUNT-BINDING-SPEC
 *
 * 账户绑定行为测试（BE-1；data-contract §3.1「数据根绑定的持久事实」）：
 *
 *  - config 注入的 `accountId` 被 `createCompany` 实际写入（命令面不承载该值）；
 *  - 未绑定根首次打开**写入绑定**（持久事实，可读回、可审计）；
 *  - 根内异账户公司记录 → 打开被拒（`SOLOIPS_CORE_ACCOUNT_MISMATCH`，fail-closed）；
 *  - 已绑定根换账户打开 → 拒绝（覆盖「换绑后旧 operation 重放」场景：
 *    绑定不符即拒，旧操作不作用于新账户的根）；
 *  - `seed` 占位根 → 拒绝 + 可行动指引（重置路径）；
 *  - 拒绝时**逆序释放** domain/stack/lease，且不留下绑定写入（无半途状态）。
 *
 * 测试风格沿用 store.spec.ts：经公开命令面搭建状态，只有「模拟存量/损坏介质」
 * 的用例才用 fakeMediumTable / fakeGlobalMedium 直达介质。
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { SoloipsStoragePort } from "soloips-adapter-dsh/contracts";

import { SOLOIPS_PLACEHOLDER_ACCOUNT_ID } from "../src/contracts";
import type { SoloipsCompanyId } from "../src/contracts";
import { openSoloipsCompanyStore } from "../src/store";
import {
  fakeAdapterEvents,
  fakeGlobalMedium,
  fakeMediumTable,
  fakeStoragePort,
  resetFakeAdapter,
} from "./adapter-fakes";
import { nextSeedOperationId, TEST_ACCOUNT_ID, TEST_OTHER_ACCOUNT_ID } from "./seed";

const ROOT = "/tmp/soloips-account-binding-root";

beforeEach(() => {
  resetFakeAdapter();
});

describe("accountId 由部署注入（data-contract §3.1 命令面）", () => {
  it("createCompany 写入注入的 accountId，而非硬编码占位值", async () => {
    const service = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    const created = await service.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "账户归属公司",
    });
    if (created.status !== "committed") throw new Error(`建公司失败：${created.status}`);
    expect(service.getCompany(created.result.companyId)).toMatchObject({
      accountId: TEST_ACCOUNT_ID,
    });
    // 反向断言：占位值没有被写入介质（去掉硬编码的验收面）。
    expect(fakeGlobalMedium(ROOT)).not.toBe(undefined);
    for (const [, record] of fakeMediumTable(ROOT, "company")) {
      expect((record as { accountId: string }).accountId).toBe(TEST_ACCOUNT_ID);
    }
    await service.close();
  });

  it("业务命令面不承载 accountId：输入类型上不存在该字段", () => {
    // 这是**类型层**断言（编译期由 typecheck 求值，vitest 不做类型检查）：
    // `SoloipsCreateCompanyInput` 若长出 accountId，下面的条件类型解析为 false。
    // 运行期只能固定「调用方传了也会被剥离」这一可观察行为。
    type CreateCompanyInput = Parameters<
      Awaited<ReturnType<typeof openSoloipsCompanyStore>>["createCompany"]
    >[0];
    type Assert<T extends true> = T;
    type HasNoAccountId = Assert<"accountId" extends keyof CreateCompanyInput ? false : true>;
    const noAccountId: HasNoAccountId = true;
    expect(noAccountId).toBe(true);
  });
});

describe("根级绑定元数据（持久事实，global 单例槽）", () => {
  it("未绑定根首次打开写入绑定：账户、代际与绑定时间可读回", async () => {
    expect(fakeGlobalMedium(ROOT)).toBeUndefined(); // 介质上从未写入
    const service = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    const binding = fakeGlobalMedium(ROOT);
    expect(binding).toMatchObject({
      state: "bound",
      accountId: TEST_ACCOUNT_ID,
      generation: 1,
    });
    // boundAt 是 ISO 8601 时刻（可审计「何时绑到哪个账户」）。
    const boundAt = (binding as { boundAt: string }).boundAt;
    expect(Number.isNaN(Date.parse(boundAt))).toBe(false);
    await service.close();
  });

  it("注入 A 建公司 → 关闭 → 同一根以 A 重开：读回一致且绑定不变", async () => {
    const first = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    const created = await first.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "重启读回公司",
    });
    if (created.status !== "committed") throw new Error("建公司失败");
    const bindingBefore = fakeGlobalMedium(ROOT);
    await first.close();

    const second = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    expect(second.getCompany(created.result.companyId)).toMatchObject({
      id: created.result.companyId,
      name: "重启读回公司",
      accountId: TEST_ACCOUNT_ID,
    });
    // 绑定是既有事实：重开**不**改写（代际仍为 1、时间不变）。
    expect(fakeGlobalMedium(ROOT)).toEqual(bindingBefore);
    await second.close();
  });

  it("换账户打开同一根：拒绝，且不覆盖既有绑定（换绑后旧操作不得重放）", async () => {
    const first = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    await first.close();
    const bindingBefore = fakeGlobalMedium(ROOT);

    await expect(
      openSoloipsCompanyStore({
        storage: fakeStoragePort(),
        root: ROOT,
        accountId: TEST_OTHER_ACCOUNT_ID,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_ACCOUNT_MISMATCH" });
    // 绑定事实未被改写（拒绝路径无副作用）。
    expect(fakeGlobalMedium(ROOT)).toEqual(bindingBefore);
  });

  it("绑定不符的拒绝消息给出期望与实际账户（可行动诊断）", async () => {
    const first = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    await first.close();

    await expect(
      openSoloipsCompanyStore({
        storage: fakeStoragePort(),
        root: ROOT,
        accountId: TEST_OTHER_ACCOUNT_ID,
      }),
    ).rejects.toThrow(new RegExp(`${TEST_ACCOUNT_ID}[\\s\\S]*${TEST_OTHER_ACCOUNT_ID}`));
  });
});

describe("根内公司记录的账户校验（fail-closed）", () => {
  it("根内出现异账户公司记录：打开被拒，且无服务发布", async () => {
    // 模拟存量介质：直接写入一条属于别的账户的公司记录。
    fakeMediumTable(ROOT, "company").set("cmp_foreign_1", {
      id: "cmp_foreign_1",
      accountId: TEST_OTHER_ACCOUNT_ID,
      type: "enterprise",
      name: "异账户公司",
      status: "active",
      createdAt: new Date().toISOString(),
    });
    await expect(
      openSoloipsCompanyStore({
        storage: fakeStoragePort(),
        root: ROOT,
        accountId: TEST_ACCOUNT_ID,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_ACCOUNT_MISMATCH" });
    // 拒绝时未写入绑定（校验失败不留半途绑定事实）。
    expect(fakeGlobalMedium(ROOT)).toBeUndefined();
  });

  it("拒绝时逆序释放 domain → stack → lease（无资源泄漏）", async () => {
    fakeMediumTable(ROOT, "company").set("cmp_foreign_2", {
      id: "cmp_foreign_2",
      accountId: TEST_OTHER_ACCOUNT_ID,
      type: "enterprise",
      name: "异账户公司",
      status: "active",
      createdAt: new Date().toISOString(),
    });
    await expect(
      openSoloipsCompanyStore({
        storage: fakeStoragePort(),
        root: ROOT,
        accountId: TEST_ACCOUNT_ID,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_ACCOUNT_MISMATCH" });

    const events = fakeAdapterEvents();
    const closeAt = events.indexOf("close:soloips_company");
    const stackAt = events.indexOf(`stack-dispose:${ROOT}`);
    const leaseAt = events.indexOf(`lease-dispose:${ROOT}`);
    expect(closeAt).toBeGreaterThanOrEqual(0);
    expect(closeAt).toBeLessThan(stackAt);
    expect(stackAt).toBeLessThan(leaseAt);
    // 释放后域名可再 open（未泄漏单 opener 名额）。
    const reopened = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: TEST_OTHER_ACCOUNT_ID,
    });
    await reopened.close();
  });

  it("同账户公司记录不触发拒绝（阴性对照）", async () => {
    const first = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    const created = await first.createCompany({
      operationId: nextSeedOperationId("company"),
      name: "同账户公司",
    });
    if (created.status !== "committed") throw new Error("建公司失败");
    await first.close();

    const second = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    expect(second.getCompany(created.result.companyId)?.accountId).toBe(TEST_ACCOUNT_ID);
    await second.close();
  });

  it("存量根（有公司记录但无绑定元数据）：首次打开写入绑定并放行", async () => {
    // 模拟升级自 BE-1 之前的根：介质上有同账户公司记录，但没有绑定记录。
    // 语义：绑定元数据缺失即「未绑定」，首次成功打开时补写（不是拒绝）。
    // 与「占位账户记录」不同——后者是**不认领**的历史数据，必须拒绝。
    fakeMediumTable(ROOT, "company").set("cmp_legacy_1", {
      id: "cmp_legacy_1",
      accountId: TEST_ACCOUNT_ID,
      type: "enterprise",
      name: "存量公司",
      status: "active",
      createdAt: new Date().toISOString(),
    });
    expect(fakeGlobalMedium(ROOT)).toBeUndefined();

    const service = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: TEST_ACCOUNT_ID,
    });
    expect(service.getCompany("cmp_legacy_1" as SoloipsCompanyId)).toMatchObject({
      name: "存量公司",
    });
    // 首次打开补写绑定事实。
    expect(fakeGlobalMedium(ROOT)).toMatchObject({
      state: "bound",
      accountId: TEST_ACCOUNT_ID,
      generation: 1,
    });
    await service.close();
  });
});

describe("不合契约的 storage 端口（spec 有 global 槽却不给句柄）", () => {
  it("以 ADAPTER_INVALID 拒绝打开，不降级为「跳过绑定校验」", async () => {
    // 静默降级会让账户绑定失效且无任何信号——故必须 fail-closed。
    const port = fakeStoragePort();
    const broken = {
      ...port,
      async createStack(options: { readonly root: string }) {
        const stack = await port.createStack(options);
        return {
          ...stack,
          facility: {
            async open() {
              return {
                name: "soloips_company",
                // 故意不给 global 句柄（不合冻结契约）。
                table() {
                  throw new Error("不应被访问");
                },
                async close() {
                  /* noop */
                },
              };
            },
            async closeAll() {
              /* noop */
            },
          },
        };
      },
    } as unknown as SoloipsStoragePort;
    await expect(
      openSoloipsCompanyStore({
        storage: broken,
        root: ROOT,
        accountId: TEST_ACCOUNT_ID,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_ADAPTER_INVALID" });
  });
});

describe("seed 占位数据根的处置（§3.1 路径 (a)：拒绝 + 指引）", () => {
  it("根内含占位账户记录：拒绝打开，且消息给出重置路径", async () => {
    fakeMediumTable(ROOT, "company").set("cmp_seed_1", {
      id: "cmp_seed_1",
      accountId: SOLOIPS_PLACEHOLDER_ACCOUNT_ID,
      type: "enterprise",
      name: "占位公司",
      status: "active",
      createdAt: new Date().toISOString(),
    });
    let caught: unknown;
    try {
      await openSoloipsCompanyStore({
        storage: fakeStoragePort(),
        root: ROOT,
        accountId: TEST_ACCOUNT_ID,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "SOLOIPS_CORE_ACCOUNT_MISMATCH" });
    const message = (caught as Error).message;
    // 可行动指引：点明占位账户、说明「不认领不自动改归」、并给出具体重置路径。
    expect(message).toContain(SOLOIPS_PLACEHOLDER_ACCOUNT_ID);
    expect(message).toContain("不认领、不自动改归");
    expect(message).toContain(ROOT); // 重置路径含实际存储根
    expect(message).toContain("重置数据根");
    // 不静默认领：拒绝路径不写任何状态。
    expect(fakeGlobalMedium(ROOT)).toBeUndefined();
  });

  it("占位记录不会被自动改归部署账户（拒绝即不写）", async () => {
    const seedRecord = {
      id: "cmp_seed_2",
      accountId: SOLOIPS_PLACEHOLDER_ACCOUNT_ID,
      type: "enterprise",
      name: "占位公司",
      status: "active",
      createdAt: new Date().toISOString(),
    };
    fakeMediumTable(ROOT, "company").set("cmp_seed_2", seedRecord);
    await expect(
      openSoloipsCompanyStore({
        storage: fakeStoragePort(),
        root: ROOT,
        accountId: TEST_ACCOUNT_ID,
      }),
    ).rejects.toMatchObject({ code: "SOLOIPS_CORE_ACCOUNT_MISMATCH" });
    // 介质逐字未变：记录仍是占位账户，未被改写为部署账户。
    expect(fakeMediumTable(ROOT, "company").get("cmp_seed_2")).toEqual(seedRecord);
  });
});
