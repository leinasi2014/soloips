/**
 * SOLOIPS-CORE-LEASE-FAILURE-COPY-SPEC（F-02）
 *
 * **跨层用例**：提交门在三个时间点发生失权/写权检查失败时，「介质上的持久事实」
 * 与「界面据此告诉用户的内容」必须不矛盾。
 *
 * 依据：
 *  - 外审 F-02（`soloips` issue #35 的 comment §2 F-02）：`leaseLost`/`leaseUnknown`
 *    旧文案写「本次操作未执行」/ "nothing was written"，而提交门的发布顺序是
 *    「写 pending 意图 → 执行业务发布 → 更新 committed」，且**每个发布点前**复核
 *    写权、**不提供跨表回滚**——故错误 code 本身不能证明 zero-write。
 *  - `src/commit-gate.ts` 的 `#commitLocked`：意图落盘 `:336`、业务发布 `:345`、
 *    committed 更新 `:347`；`#createPublisher` 的逐点复核 `:371-405`。
 *  - `src/errors.ts:34-39`：adapter 的失权码翻译为 `SOLOIPS_CORE_LEASE_NOT_HELD`，
 *    其余写权复核失败翻译为 `SOLOIPS_CORE_LEASE_CHECK_FAILED`。
 *  - ORG-05（`docs/design/data-contract.md:1014`）：结果未知即停止并核对，
 *    **不得**换 `operationId` 重做。
 *
 * ── 本 spec 的三条用例与「自证到达目标路径」────────────────────────────────
 *
 *  时间点                | 注入                                | 期望持久事实
 *  ----------------------|-------------------------------------|---------------------------
 *  (a) 意图落盘之前       | 第 1 次 assertHeld 触发真实代际接管  | 无 operation 记录、无业务写
 *  (b) 业务发布之后、     | 第 3 次 assertHeld 触发真实代际接管  | pending 意图 + 业务记录已持久
 *      committed 更新之前 |                                     |
 *  (c) committed 更新时   | 第 3 次 assertHeld 抛出非失权错误    | 同 (b)
 *
 * 「到达目标路径」不靠人工数数，而由三组**独立可观察量**共同钉住：
 *  1. `armed.consumed()` = 注入恰好发生在第 N 次 `assertHeld`；
 *  2. `fakeAdapterEvents()` 的写事件序列——(a) 无任何表写；(b)/(c) 恰有
 *     `write:…/operation` 与 `write:…/company` 两条且**没有** `write-update:…`
 *     （证明 committed 更新从未执行）；
 *  3. 介质快照（`fakeMediumTable` 的 size 与记录状态）。
 *  三者同时成立才可能通过；任何一处错位（例如注入点漂移到业务发布之前）都会
 *  让另一处断言失败。
 *
 * ── 跨层桥接（为什么读文件而不是 import）──────────────────────────────────
 *
 * 本 spec 在 core 包内，而文案在 web 包（`packages/web/src/client/locales/`）。
 * DEV-04 与 `.oxlintrc.json` 的 core override 都禁止 core 依赖 web 的实现面，
 * 故这里**只读** web 的源文件文本（不 import、不执行），与
 * `packages/web/tests/i18n-assets.spec.ts` 读 `core/src/onboarding.ts` 的做法同源
 * ——那已是本仓既有的跨层断言范式。链路由三段机械推导组成，任一段形状变化即抛错
 * （不静默跳过）：**运行期错误码 → 映射表源码里的 i18n 键 → 字典源码里的文案**。
 *
 * 〔证据边界〕本 spec 证明的是「这三条路径的持久事实 + 字典源码里的文案文本」；
 * 它不证明界面已渲染该文案（渲染层尚未接线，见 i18n-2），也不覆盖字典中其余
 * 8 个 core 码的语义（逐码核实结论见 F-02 交付报告的核实表）。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import type { SoloipsStoragePort } from "soloips-adapter-dsh/contracts";

import { asOperationId } from "../src/ids";
import { soloipsAdapterErrorCodeOf } from "../src/errors";
import { openSoloipsCompanyStore } from "../src/store";
import {
  fakeAdapterEvents,
  fakeMediumTable,
  fakeStoragePort,
  fakeTakeoverLease,
  resetFakeAdapter,
} from "./adapter-fakes";
import { TEST_ACCOUNT_ID } from "./seed";

const ROOT = "/tmp/soloips-lease-copy-root";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageDir = join(testDir, "..");
const repoRoot = join(packageDir, "..", "..");

/** web 侧的三份事实来源（只读文本，不 import——见文件头「跨层桥接」）。 */
const ZH_LOCALE_SOURCE = join(repoRoot, "packages", "web", "src", "client", "locales", "zh.ts");
const EN_LOCALE_SOURCE = join(repoRoot, "packages", "web", "src", "client", "locales", "en.ts");
const ERROR_CODE_MAP_SOURCE = join(
  repoRoot,
  "packages",
  "web",
  "src",
  "client",
  "i18n",
  "error-codes.ts",
);

/** 两个写权类码（本 spec 覆盖的失败面）。 */
const LEASE_CODES = ["SOLOIPS_CORE_LEASE_NOT_HELD", "SOLOIPS_CORE_LEASE_CHECK_FAILED"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// 注入装置：可武装的写权复核（不 sleep、不依赖真实时钟）
// ─────────────────────────────────────────────────────────────────────────────

interface ArmedStorage {
  readonly port: SoloipsStoragePort;
  /**
   * 自此刻起第 `ordinal` 次 `assertHeld` 触发注入（计数从 1 起、相对武装时刻）。
   *
   * - `takeover`：先 `fakeTakeoverLease` 做**真实**代际接管，再委托给 fake 的
   *   lease——它按代际不符抛出 adapter 的 `SOLOIPS_ADAPTER_LEASE_NOT_HELD`，
   *   于是 core 走 `wrapLeaseFailure` 的真实翻译路径（→ `…_LEASE_NOT_HELD`）；
   * - `unknown`：抛一个**非失权**错误（模拟复核通道故障），core 的翻译走另一分支
   *   （→ `…_LEASE_CHECK_FAILED`）。
   */
  arm(ordinal: number, mode: "takeover" | "unknown"): void;
  /** 已消费的 `assertHeld` 次数（自武装起）——注入点自证。 */
  consumed(): number;
}

/**
 * 包装 `fakeStoragePort` 的写权面。
 *
 * 〔为什么必须包装而非用 `fakeTakeoverLease` 单打〕接管是「下一次断言即失权」，
 * 而本 spec 需要在**同一次 `commit` 内**精确命中第 N 个发布点——那要求注入装置
 * 持有自己的调用计数。故计数器与接管都收在此处，而**接管本身仍是真实的**
 * （代际递增 + fake 自己的失权判定），不是伪造的错误对象。
 */
function armedStorage(root: string): ArmedStorage {
  const base = fakeStoragePort();
  let failAt: number | undefined;
  let mode: "takeover" | "unknown" = "takeover";
  let consumed = 0;
  let takenOver = false;
  return {
    port: {
      ...base,
      acquireWriterLease: async (options: { readonly root: string }) => {
        const lease = await base.acquireWriterLease(options);
        return {
          generation: lease.generation,
          storageId: lease.storageId,
          assertHeld: async () => {
            consumed += 1;
            if (failAt !== undefined && consumed >= failAt) {
              if (mode === "takeover" && !takenOver) {
                takenOver = true;
                fakeTakeoverLease(root); // 真实接管：下面委托的断言会以代际不符失败
              }
              if (mode === "unknown") {
                throw new Error("写权复核通道故障（模拟：状态未知，非确认失权）");
              }
            }
            return lease.assertHeld();
          },
          dispose: () => lease.dispose(),
        };
      },
    },
    arm(ordinal, nextMode) {
      failAt = ordinal;
      mode = nextMode;
      consumed = 0;
    },
    consumed: () => consumed,
  };
}

/** 介质上的表写事件（`write:` / `write-update:`），按发生顺序。 */
function tableWriteEvents(): readonly string[] {
  return fakeAdapterEvents().filter(
    (event) => event.startsWith("write:") || event.startsWith("write-update:"),
  );
}

interface ScenarioResult {
  /** 运行期实际呈现的 core 错误码（结构读取，不依赖 instanceof）。 */
  readonly code: string;
  /** 注入恰好在第几次 `assertHeld` 生效（自武装起）。 */
  readonly assertOrdinal: number;
  readonly operationRecords: number;
  readonly operationStatus: string | undefined;
  readonly companyRecords: number;
  readonly pendingListed: boolean;
  readonly writes: readonly string[];
}

/**
 * 跑一次「在指定发布点失败」的提交，返回持久事实与自证量。
 *
 * 用 `company.create`（无 `precondition`、单次业务写）：其发布序列恰为
 * ① put operation（意图）→ ② put company（业务）→ ③ update operation（committed），
 * 三个发布点各对应一次 `assertHeld`，因此 `ordinal` 即发布点序号。
 */
async function runLeaseFailureAt(
  ordinal: number,
  mode: "takeover" | "unknown",
): Promise<ScenarioResult> {
  resetFakeAdapter();
  const armed = armedStorage(ROOT);
  const service = await openSoloipsCompanyStore({
    storage: armed.port,
    root: ROOT,
    accountId: TEST_ACCOUNT_ID,
  });
  const operationId = asOperationId(`lease-copy-${mode}-${ordinal}`);

  armed.arm(ordinal, mode); // 武装点放在 open 之后：open 期的绑定复核不占计数
  let code = "";
  let failed = false;
  try {
    await service.createCompany({ operationId, name: "文案用例公司" });
  } catch (error) {
    failed = true;
    code = soloipsAdapterErrorCodeOf(error) ?? "";
  }
  if (!failed) throw new Error("注入点未命中：提交成功，本用例的前提不成立");

  const record = service.getOperation(operationId);
  return {
    code,
    assertOrdinal: armed.consumed(),
    operationRecords: fakeMediumTable(ROOT, "operation").size,
    operationStatus: record?.status,
    companyRecords: fakeMediumTable(ROOT, "company").size,
    pendingListed: service.listPendingOperations().some((pending) => pending.id === operationId),
    writes: tableWriteEvents(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 文案侧：源码文本提取（形状变化即抛错，不静默跳过）
// ─────────────────────────────────────────────────────────────────────────────

/** 从映射表源码里提取某码的 i18n 键（`CODE: "key"`）。 */
function extractKeyForCode(source: string, code: string): string {
  const match = new RegExp(`\\b${code}:\\s*"([^"]+)"`).exec(source);
  const key = match?.[1];
  if (key === undefined || key.trim() === "") {
    throw new Error(`映射表源码里找不到 ${code} 的键：该码被删、被改名，或表形状变化`);
  }
  return key;
}

/** 从字典源码里提取某键的文案（`"key": "文案"`，允许换行）。 */
function extractLocaleCopy(source: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`"${escaped}":\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(source);
  const copy = match?.[1];
  if (copy === undefined || copy.trim() === "") {
    throw new Error(`字典源码里提取不到 ${key} 的文案：键被删、被改名，或字符串形状变化`);
  }
  return copy;
}

/** 零副作用承诺词族（core 无法保证，故不得出现在这两个码的文案里）。 */
const ZERO_WRITE_CLAIMS_ZH = [/未执行/, /未写入/, /没有写入/, /未产生任何/, /无任何写入/] as const;
const ZERO_WRITE_CLAIMS_EN = [
  /nothing was written/i,
  /nothing has been written/i,
  /nothing was saved/i,
  /\bno writes?\b/i,
  /was not executed/i,
] as const;

/** 文案必须齐备的处置要点（ORG-05 在文案层的对应物）。 */
const REQUIRED_POINTS_ZH = [
  { label: "写入已停止", pattern: /停止/ },
  { label: "结果需核对", pattern: /核对|确认/ },
  { label: "保留本次操作编号", pattern: /保留.*编号/ },
  { label: "勿重复提交", pattern: /勿重复提交|不要重复提交/ },
] as const;
const REQUIRED_POINTS_EN = [
  { label: "写入已停止", pattern: /stop(ped|s)?/i },
  { label: "结果需核对", pattern: /reconcil|check|verif/i },
  { label: "保留本次操作编号", pattern: /keep (this|the) operation id/i },
  { label: "勿重复提交", pattern: /do not resubmit|don't resubmit|not resubmit/i },
] as const;

/** 不得出现的「未知结果换 ID 重做」引导（ORG-05 反向）。 */
const FORBIDDEN_RETRY_ZH = [
  /换(一个|个)?编号/,
  /更换编号/,
  /换个编号/,
  /新(的)?编号重(做|试|新)/,
] as const;
const FORBIDDEN_RETRY_EN = [
  /new (operation )?id/i,
  /different (operation )?id/i,
  /retry under a new/i,
] as const;

function hitsOf(template: string, patterns: readonly RegExp[]): readonly string[] {
  return patterns.filter((pattern) => pattern.test(template)).map((pattern) => String(pattern));
}

/**
 * 断言「该码的文案」与「本次观察到的持久事实」不矛盾。
 *
 * 判据由**观察到的持久事实**驱动（不硬编码结论）：既然介质上确有该 operation
 * 记录，文案就不得声称「本次操作未执行」——那正是 F-02 要修的矛盾。
 */
function assertCopyMatchesFacts(args: {
  readonly code: string;
  readonly facts: ScenarioResult;
  readonly zhSource: string;
  readonly enSource: string;
  readonly mapSource: string;
}): void {
  expect(
    args.facts.operationStatus,
    `${args.code}：本断言的前提是失败发生在意图落盘之后（介质上留有未决意图）`,
  ).toBe("pending");
  const key = extractKeyForCode(args.mapSource, args.code);
  const zhCopy = extractLocaleCopy(args.zhSource, key);
  const enCopy = extractLocaleCopy(args.enSource, key);

  expect(
    hitsOf(zhCopy, ZERO_WRITE_CLAIMS_ZH),
    `${args.code} → ${key} 的中文文案与持久事实矛盾（介质上有未决意图）：${zhCopy}`,
  ).toEqual([]);
  expect(
    hitsOf(enCopy, ZERO_WRITE_CLAIMS_EN),
    `${args.code} → ${key} 的英文文案与持久事实矛盾（介质上有未决意图）：${enCopy}`,
  ).toEqual([]);
  for (const point of REQUIRED_POINTS_ZH) {
    expect(point.pattern.test(zhCopy), `${key} 中文缺「${point.label}」：${zhCopy}`).toBe(true);
  }
  for (const point of REQUIRED_POINTS_EN) {
    expect(point.pattern.test(enCopy), `${key} 英文缺「${point.label}」：${enCopy}`).toBe(true);
  }
  expect(hitsOf(zhCopy, FORBIDDEN_RETRY_ZH), `${key} 中文出现换 ID 引导`).toEqual([]);
  expect(hitsOf(enCopy, FORBIDDEN_RETRY_EN), `${key} 英文出现换 ID 引导`).toEqual([]);
}

beforeEach(() => {
  resetFakeAdapter();
});

describe("写权失败：持久事实与用户文案不矛盾（F-02；commit-gate 发布顺序）", () => {
  const zhSource = readFileSync(ZH_LOCALE_SOURCE, "utf8");
  const enSource = readFileSync(EN_LOCALE_SOURCE, "utf8");
  const mapSource = readFileSync(ERROR_CODE_MAP_SOURCE, "utf8");

  it("提取链自检：两个码都能经「映射表 → 字典」取到非空文案（形状变化即失败）", () => {
    // 〔为什么单独一条〕跨层断言依赖三段文本提取。若字典或映射表被重排/改名，
    // 提取会抛错——本用例把「抛错」变成可见的失败信号，避免整组断言因提取失败
    // 而失去意义（范式同 i18n-assets.spec.ts 的「提取失败即失败」守卫）。
    for (const code of LEASE_CODES) {
      const key = extractKeyForCode(mapSource, code);
      expect(key.startsWith("soloips.error."), `${code} 的键应在 soloips.error 命名空间`).toBe(
        true,
      );
      expect(extractLocaleCopy(zhSource, key).length).toBeGreaterThan(0);
      expect(extractLocaleCopy(enSource, key).length).toBeGreaterThan(0);
    }
  });

  it("(a) 意图落盘之前失权：介质上无该 operation 记录、无业务写", async () => {
    const facts = await runLeaseFailureAt(1, "takeover");

    // 运行期呈现的码是**失权**（非「未知」）：接管是真实的代际递增。
    expect(facts.code).toBe("SOLOIPS_CORE_LEASE_NOT_HELD");
    // 自证一：注入恰在第 1 次 assertHeld（= 意图落盘前的复核）。
    expect(facts.assertOrdinal).toBe(1);
    // 自证二：本次提交没有产生任何表写事件（open 期的绑定写不走表）。
    expect(facts.writes, "意图落盘前失败不应有任何表写").toEqual([]);
    // 持久事实：无该 operation 记录、无业务记录。
    expect(facts.operationRecords).toBe(0);
    expect(facts.companyRecords).toBe(0);
    expect(facts.pendingListed).toBe(false);
  });

  it("(b) 业务发布之后、committed 更新之前失权：留下 pending 意图 + 业务记录已持久", async () => {
    const facts = await runLeaseFailureAt(3, "takeover");

    expect(facts.code).toBe("SOLOIPS_CORE_LEASE_NOT_HELD");
    // 自证一：注入恰在第 3 次 assertHeld（= committed 更新的复核点）。
    expect(facts.assertOrdinal).toBe(3);
    // 自证二：恰好两条表写（意图 + 业务），且**没有** committed 更新。
    expect(facts.writes).toHaveLength(2);
    expect(facts.writes[0]).toContain("/operation:");
    expect(facts.writes[1]).toContain("/company:");
    expect(
      facts.writes.some((event) => event.startsWith("write-update:")),
      "committed 更新不得发生",
    ).toBe(false);

    // 持久事实：意图留在台账（ORG-05 的恢复锚点），业务记录已耐久。
    expect(facts.operationRecords).toBe(1);
    expect(facts.operationStatus).toBe("pending");
    expect(facts.pendingListed).toBe(true);
    expect(facts.companyRecords).toBe(1);

    // 跨层：该码的文案不得承诺零副作用，且须要求核对/保留编号/勿重复提交。
    assertCopyMatchesFacts({ code: facts.code, facts, zhSource, enSource, mapSource });
  });

  it("(c) committed 更新时写权状态未知：同 (b) 的核对要求（码不同、持久事实相同）", async () => {
    const facts = await runLeaseFailureAt(3, "unknown");

    // 复核点相同、错误性质不同 → 另一个码（写权状态未知）。
    expect(facts.code).toBe("SOLOIPS_CORE_LEASE_CHECK_FAILED");
    expect(facts.assertOrdinal).toBe(3);
    expect(facts.writes).toHaveLength(2);
    expect(facts.writes.some((event) => event.startsWith("write-update:"))).toBe(false);

    expect(facts.operationStatus).toBe("pending");
    expect(facts.companyRecords).toBe(1);

    assertCopyMatchesFacts({ code: facts.code, facts, zhSource, enSource, mapSource });
  });

  it("同一码覆盖两种事实：(a) 零写与 (b) 已写都呈现 LEASE_NOT_HELD → 该码不得承诺零写", async () => {
    // 〔本条把外审的论断变成可执行断言〕「错误 code 本身不能证明 zero-write」
    // 的证据不是引文，而是**同一个码在两次运行里伴随相反的持久事实**。
    const beforeIntent = await runLeaseFailureAt(1, "takeover");
    const afterBusiness = await runLeaseFailureAt(3, "takeover");

    expect(beforeIntent.code).toBe(afterBusiness.code); // 同一个码
    expect(beforeIntent.code).toBe("SOLOIPS_CORE_LEASE_NOT_HELD");
    // 而持久事实相反：前者什么都没写，后者写了意图 + 业务记录。
    expect([beforeIntent.operationRecords, beforeIntent.companyRecords]).toEqual([0, 0]);
    expect([afterBusiness.operationRecords, afterBusiness.companyRecords]).toEqual([1, 1]);
    // ⇒ 该码的用户文案只能是较弱的那条声明（写入已停止、结果需核对）。
    assertCopyMatchesFacts({
      code: afterBusiness.code,
      facts: afterBusiness,
      zhSource,
      enSource,
      mapSource,
    });
  });
});
