/**
 * i18n 资产层测试（i18n-1 切片）。
 *
 * 覆盖三件事，逐条对应 `SOLO-I18N-01` §7 的验证要求：
 *  1. **双字典齐备**（V1）：`zh`/`en` 键集双向相等、占位符一致、无 `common` 副本；
 *  2. **错误码映射完备**（V2）：10 个 `SoloipsCoreErrorCode` 全覆盖（类型 +
 *     运行期双向断言）、未知码与 adapter 码回退、**core 的 `message` 不上屏**；
 *  3. **`gaps` 可达组合完备**（V3）：从 `packages/core/src/onboarding.ts` **读源码
 *     提取** `gap(...)` 调用点，机械推出可达 `(item, reason)` 集合（设计 §9 Q-2），
 *     再断言映射表与它**双向相等**——`evaluateOnboarding` 新增分支而映射表没跟上时，
 *     本测试失败，而不是等到界面上出现缺文案。
 *  4. **零硬编码门禁可执行且有鉴别力**（V4 的静态面）：脚本存在 + `package.json`
 *     接线 + 真实树通过 + 反例（临时树塞中文文案）失败 + 扫描面缩空时失败。
 *
 * 〔为什么本测试直接读 core 的源文件〕读文件不是 import，不违反 DEV-04 的跨包
 * 依赖禁令；而它把「可达组合」这一**实证结论**变成可执行的断言依据，而不是注释里的
 * 一句声明。提取失败（正则不再命中任何调用点）同样会让测试失败——防止「源文件被
 * 改名/重构后测试静默通过」。
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type {
  SoloipsCoreErrorCode,
  SoloipsOnboardingGap,
  SoloipsOnboardingGapItem,
  SoloipsOnboardingGapReason,
} from "soloips-core/contracts";

import {
  SOLOIPS_ADAPTER_ERROR_KEY,
  SOLOIPS_CORE_ERROR_CODE_KEYS,
  SOLOIPS_ERROR_CODE_UNKNOWN,
  SOLOIPS_UNKNOWN_ERROR_KEY,
  soloipsCoreErrorCodes,
  soloipsErrorCodeOf,
  soloipsErrorCopyForCode,
  soloipsErrorCopyOf,
} from "../src/client/i18n/error-codes";
import {
  SOLOIPS_ONBOARDING_GAP_GENERIC_KEY,
  SOLOIPS_ONBOARDING_GAP_KEYS,
  soloipsOnboardingGapCopyFor,
  soloipsOnboardingGapCopyOf,
  soloipsOnboardingGapEntries,
} from "../src/client/i18n/onboarding-gaps";
import { en, SOLOIPS_LOCALE_NAMESPACE, zh } from "../src/client/locales/index";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageDir = join(testDir, "..");
const repoRoot = join(packageDir, "..", "..");

/** core 的入职判定源码（可达组合的**唯一**事实来源；只读，不 import）。 */
const ONBOARDING_SOURCE = join(repoRoot, "packages", "core", "src", "onboarding.ts");

// ─────────────────────────────────────────────────────────────────────────────
// 事实基准（测试专用，不构成生产词表）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `SoloipsCoreErrorCode` 的穷举对象（`Record<T, true>` 范式，同
 * `packages/core/tests/team-data.spec.ts`）：
 *  - 联合**加**一项而漏改这里 → 缺键，编译失败；
 *  - 这里**多**一个不在联合里的键 → 多键，编译失败。
 * 于是下面的双向相等断言有了事实基准：漏项与假项都会让测试失败。
 */
const ALL_CORE_ERROR_CODES: Record<SoloipsCoreErrorCode, true> = {
  SOLOIPS_CORE_CONFIG_INVALID: true,
  SOLOIPS_CORE_ADAPTER_INVALID: true,
  SOLOIPS_CORE_STORE_CLOSED: true,
  SOLOIPS_CORE_LEASE_NOT_HELD: true,
  SOLOIPS_CORE_LEASE_CHECK_FAILED: true,
  SOLOIPS_CORE_VALIDATION: true,
  SOLOIPS_CORE_PRECONDITION: true,
  SOLOIPS_CORE_CONFLICT: true,
  SOLOIPS_CORE_ACCOUNT_MISMATCH: true,
  SOLOIPS_CORE_RECORD_INVALID: true,
};

/** `SoloipsOnboardingGapItem` 的穷举对象（9 值）。 */
const ALL_GAP_ITEMS: Record<SoloipsOnboardingGapItem, true> = {
  employee: true,
  appointment: true,
  profile: true,
  avatar: true,
  soul: true,
  operating: true,
  memory: true,
  capability: true,
  assembly: true,
};

/** `SoloipsOnboardingGapReason` 的穷举对象（10 值）。 */
const ALL_GAP_REASONS: Record<SoloipsOnboardingGapReason, true> = {
  "employee-not-found": true,
  "appointment-missing": true,
  "appointment-revoked": true,
  "document-missing": true,
  "document-content-invalid": true,
  "document-owner-mismatch": true,
  "memory-not-initialized": true,
  "capability-not-verified": true,
  "assembly-evidence-missing": true,
  "assembly-evidence-stale": true,
};

/** DSH `common` 命名空间的常用词：本命名空间**不得**复制（设计 §6「`common` 复用」）。 */
const COMMON_NAMESPACE_WORDS = [
  "ok",
  "cancel",
  "close",
  "copy",
  "retry",
  "loading",
  "submit",
  "save",
  "search",
  "delete",
  "edit",
  "next",
  "previous",
  "back",
  "unknown",
] as const;

/** 模板里的占位符名（排序；`{code}` → `code`）。 */
function placeholdersOf(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1] ?? "")
    .filter((name) => name !== "")
    .sort();
}

/** 键是否真实存在于两个字典（运行期兜底；类型层已被 `satisfies` 钉住）。 */
function ownsKey(key: string): boolean {
  return Object.hasOwn(zh, key) && Object.hasOwn(en, key);
}

/** 递归复制目录树（反例测试用；只含 `.ts`/`.tsx` 源文件，跳过 node_modules 等）。 */
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "lib" || entry.name === "dist") continue;
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else writeFileSync(target, readFileSync(source));
  }
}

/**
 * 从 `onboarding.ts` 提取 `gap(...)` 调用点。
 *
 * 匹配形态：`gap(<item>, "<reason>"`，其中 `<item>` 可以是字符串字面量
 * （如 `gap("employee", …)`）或标识符（`gap(documentType, …)`——文档类缺项由
 * `documentGaps` 的循环驱动，item 是变量）。跨行写法由 `\s*` 覆盖。
 *
 * 〔为什么能区分函数定义〕`function gap(item: …, reason: …, message: …)` 的第二个
 * 实参不是字符串字面量，故不命中本模式。
 */
function extractGapCallSites(
  source: string,
): { literalItem?: string; identifierItem?: string; reason: string }[] {
  const pattern = /gap\(\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*,\s*"([^"]+)"/g;
  return [...source.matchAll(pattern)].map((match) => ({
    ...(match[1] === undefined ? {} : { literalItem: match[1] }),
    ...(match[2] === undefined ? {} : { identifierItem: match[2] }),
    reason: match[3] ?? "",
  }));
}

/** 从 `onboarding.ts` 提取 `REQUIRED_DOCUMENT_TYPES` 的取值（文档类 item 的展开依据）。 */
function extractRequiredDocumentTypes(source: string): string[] {
  const block = /const REQUIRED_DOCUMENT_TYPES[^=]*=\s*\[([^\]]*)\]/.exec(source);
  if (block === null) throw new Error("onboarding.ts 未找到 REQUIRED_DOCUMENT_TYPES");
  return [...(block[1] ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
}

// ─────────────────────────────────────────────────────────────────────────────
// ① 字典骨架（zh/en + 类型强制）
// ─────────────────────────────────────────────────────────────────────────────

describe("i18n 字典资产（SOLO-I18N-01 §6；V1 双字典齐备）", () => {
  it("zh 与 en 的键集**双向相等**（运行期兜底类型层的 satisfies）", () => {
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();
    expect(zhKeys.length).toBeGreaterThan(0);
    expect(enKeys, "en 的键集必须与 zh 完全一致（多一个或少一个都是缺陷）").toEqual(zhKeys);
  });

  it("所有键都带 soloips. 前缀（命名空间与键前缀一致，映射表值可与键逐字相等）", () => {
    const offenders = Object.keys(zh).filter(
      (key) => !key.startsWith(`${SOLOIPS_LOCALE_NAMESPACE}.`),
    );
    expect(offenders, "键必须以 soloips. 开头").toEqual([]);
    expect(SOLOIPS_LOCALE_NAMESPACE).toBe("soloips");
  });

  it("没有复制 common 命名空间的通用词（设计 §6「common 复用」）", () => {
    // 通用词由 DSH `common` 命名空间提供，查找链会自动兜底；在本命名空间再定义
    // 一份即制造第二份真源（上游词表升级时两边漂移）。
    const copied = COMMON_NAMESPACE_WORDS.filter((word) => Object.hasOwn(zh, word));
    expect(copied, "这些词应复用 common 命名空间，不得在本字典定义").toEqual([]);
  });

  it("译文非空，且 zh/en 的占位符集合逐键一致（否则切换语言会破坏替换）", () => {
    const empty: string[] = [];
    const mismatched: string[] = [];
    for (const [key, zhValue] of Object.entries(zh)) {
      // `en` 的键集已由上一条用例证明与 `zh` 相等；这里按键取值做逐条比对。
      const enValue = en[key as keyof typeof en];
      if (zhValue.trim() === "" || enValue.trim() === "") empty.push(key);
      const zhPlaceholders = placeholdersOf(zhValue);
      const enPlaceholders = placeholdersOf(enValue);
      if (zhPlaceholders.join(",") !== enPlaceholders.join(",")) mismatched.push(key);
    }
    expect(empty, "字典条目不得为空串").toEqual([]);
    expect(mismatched, "同一键在两种语言里的占位符必须一致").toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ② 错误码映射表（V2 完备 + 未知名回退 + 不暴露 core message）
// ─────────────────────────────────────────────────────────────────────────────

describe("错误码 → i18n 键映射（SOLO-I18N-01 §3；V2 完备性）", () => {
  it("10 个 core 码全覆盖：运行期投影与穷举对象**双向相等**（漏项与假项都失败）", () => {
    const codes = soloipsCoreErrorCodes();
    expect(new Set(codes).size, "投影不得有重复项").toBe(codes.length);
    expect([...codes].sort()).toEqual(Object.keys(ALL_CORE_ERROR_CODES).sort());
  });

  it("每个码的键都真实存在于 zh/en 字典，且互不重复（一个码一条可区分的文案）", () => {
    for (const [code, key] of Object.entries(SOLOIPS_CORE_ERROR_CODE_KEYS)) {
      expect(ownsKey(key), `${code} 的键 ${key} 必须存在于两个字典`).toBe(true);
    }
    const keys = Object.values(SOLOIPS_CORE_ERROR_CODE_KEYS);
    expect(new Set(keys).size, "码之间不得共用同一文案键").toBe(keys.length);
  });

  it("已知码：返回专有键、无占位符实参，且实参与模板占位符一一对应", () => {
    for (const code of Object.keys(ALL_CORE_ERROR_CODES) as SoloipsCoreErrorCode[]) {
      const copy = soloipsErrorCopyForCode(code);
      expect(copy.key, `${code} 应映射到专有键`).toBe(SOLOIPS_CORE_ERROR_CODE_KEYS[code]);
      expect(placeholdersOf(zh[copy.key]), `${code} 的实参应与模板占位符一致`).toEqual(
        Object.keys(copy.params).sort(),
      );
    }
  });

  it("未知码回退到通用文案 + 码本身作为可复制诊断（不得空白、不得上屏 core 文本）", () => {
    const copy = soloipsErrorCopyForCode("SOLOIPS_CORE_FUTURE_CODE");
    expect(copy.key).toBe(SOLOIPS_UNKNOWN_ERROR_KEY);
    expect(copy.params).toEqual({ code: "SOLOIPS_CORE_FUTURE_CODE" });
    // 通用键的模板确实使用 {code}，故「码作为可复制诊断」是可见的。
    expect(placeholdersOf(zh[SOLOIPS_UNKNOWN_ERROR_KEY])).toEqual(["code"]);
  });

  it("adapter 侧码按前缀归一（web 不得 import adapter 契约，故不逐码建表）", () => {
    for (const code of [
      "SOLOIPS_ADAPTER_DISABLED",
      "SOLOIPS_ADAPTER_LEASE_NOT_HELD",
      "SOLOIPS_ADAPTER_INVALID_CONFIG",
    ]) {
      const copy = soloipsErrorCopyForCode(code);
      expect(copy.key).toBe(SOLOIPS_ADAPTER_ERROR_KEY);
      expect(copy.params).toEqual({ code });
    }
  });

  it("**不暴露 core 的 message**：带中文诊断的错误对象只按码映射", () => {
    // 模拟 `SoloipsCoreError` 的形状（结构判别，不 import core 运行时）。
    const error = {
      name: "SoloipsCoreError",
      code: "SOLOIPS_CORE_LEASE_NOT_HELD",
      message: "写权复核失败，本次发布被拒绝",
    };
    const copy = soloipsErrorCopyOf(error);
    expect(copy.key).toBe(SOLOIPS_CORE_ERROR_CODE_KEYS.SOLOIPS_CORE_LEASE_NOT_HELD);
    expect(copy.params, "诊断文本不得进入上屏素材").toEqual({});
    expect(JSON.stringify(copy), "上屏素材里不得出现 core 的中文诊断").not.toContain(
      "写权复核失败",
    );
    expect(zh[copy.key]).not.toContain("写权复核失败");
  });

  it("没有可读码时用 UNKNOWN 占位（不得留空、不得把 message 当码）", () => {
    const copy = soloipsErrorCopyOf({ message: "内部诊断：公司不存在" });
    expect(copy.key).toBe(SOLOIPS_UNKNOWN_ERROR_KEY);
    expect(copy.params).toEqual({ code: SOLOIPS_ERROR_CODE_UNKNOWN });
    expect(JSON.stringify(copy)).not.toContain("内部诊断");
  });

  it("码读取是结构判别：非字符串 code 一律视为无码", () => {
    expect(soloipsErrorCodeOf(undefined)).toBeUndefined();
    expect(soloipsErrorCodeOf(null)).toBeUndefined();
    expect(soloipsErrorCodeOf("SOLOIPS_CORE_VALIDATION")).toBeUndefined();
    expect(soloipsErrorCodeOf({ code: 42 })).toBeUndefined();
    expect(soloipsErrorCodeOf({ code: "SOLOIPS_CORE_VALIDATION" })).toBe("SOLOIPS_CORE_VALIDATION");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ③ gaps 映射（V3 可达组合完备；设计 §9 Q-2 的实证结论）
// ─────────────────────────────────────────────────────────────────────────────

describe("入职缺项 → i18n 键映射（SOLO-I18N-01 §4；V3 可达组合）", () => {
  const source = readFileSync(ONBOARDING_SOURCE, "utf8");

  it("从 onboarding.ts 提取的 gap(...) 调用点可机械展开为可达组合（实证基准）", () => {
    const callSites = extractGapCallSites(source);
    expect(callSites.length, "onboarding.ts 里应有 gap(...) 调用点").toBeGreaterThan(0);
    // 文档类缺项的 item 是变量 `documentType`；其余调用点直接给字面量 item。
    const identifiers = [
      ...new Set(
        callSites.flatMap((site) =>
          site.identifierItem === undefined ? [] : [site.identifierItem],
        ),
      ),
    ];
    expect(identifiers, "唯一的变量 item 应是 documentType").toEqual(["documentType"]);
    expect(
      callSites.filter((site) => site.identifierItem === undefined).length,
      "字面量 item 的调用点数（employee/appointment×2/memory/capability/assembly×2）",
    ).toBe(7);
    expect(extractRequiredDocumentTypes(source).sort()).toEqual([
      "avatar",
      "operating",
      "profile",
      "soul",
    ]);
  });

  it("映射表与「可达组合」双向相等（onboarding 新增分支而未补键即失败）", () => {
    const callSites = extractGapCallSites(source);
    const documentTypes = extractRequiredDocumentTypes(source) as SoloipsOnboardingGapItem[];
    const reachable = new Set<string>();
    for (const site of callSites) {
      const items =
        site.identifierItem === undefined
          ? [site.literalItem ?? ""]
          : documentTypes.map((type) => String(type));
      for (const item of items) reachable.add(`${item}.${site.reason}`);
    }
    const mapped = soloipsOnboardingGapEntries().map((entry) => `${entry.item}.${entry.reason}`);
    expect(
      mapped.slice().sort(),
      "映射表的组合集合必须与 evaluateOnboarding 的可达集合逐项相等",
    ).toEqual([...reachable].sort());
    // 9×10 的全空间里有大量组合不可达（如 profile×memory-not-initialized）；
    // 本片不给不可达组合写键——那会随分支变化腐坏（设计 §4「完备性」行）。
    expect(reachable.size, "可达组合数（本片实证）").toBe(19);
    expect(reachable.size).toBeLessThan(
      Object.keys(ALL_GAP_ITEMS).length * Object.keys(ALL_GAP_REASONS).length,
    );
  });

  it("item 维度全定义（9 个 item 都必须有表项）", () => {
    expect(Object.keys(SOLOIPS_ONBOARDING_GAP_KEYS).sort()).toEqual(
      Object.keys(ALL_GAP_ITEMS).sort(),
    );
  });

  it("每个表项的键都真实存在于 zh/en 字典，且互不重复", () => {
    const entries = soloipsOnboardingGapEntries();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(ownsKey(entry.key), `${entry.item}.${entry.reason} 的键 ${entry.key} 必须存在`).toBe(
        true,
      );
    }
    const keys = entries.map((entry) => entry.key);
    expect(new Set(keys).size, "组合之间不得共用同一文案键").toBe(keys.length);
  });

  it("90 个组合逐一判定：可达者给专有键，不可达者回退到通用键（不漏空白）", () => {
    const mapped = new Map(
      soloipsOnboardingGapEntries().map((entry) => [`${entry.item}.${entry.reason}`, entry.key]),
    );
    const items = Object.keys(ALL_GAP_ITEMS) as SoloipsOnboardingGapItem[];
    const reasons = Object.keys(ALL_GAP_REASONS) as SoloipsOnboardingGapReason[];
    let genericCount = 0;
    for (const item of items) {
      for (const reason of reasons) {
        const copy = soloipsOnboardingGapCopyFor(item, reason, { capability: "draw" });
        const expected = mapped.get(`${item}.${reason}`);
        if (expected === undefined) {
          genericCount += 1;
          expect(copy.key, `${item}.${reason} 不可达，应回退通用键`).toBe(
            SOLOIPS_ONBOARDING_GAP_GENERIC_KEY,
          );
          expect(copy.params).toEqual({ reason });
        } else {
          expect(copy.key, `${item}.${reason} 应给专有键`).toBe(expected);
          expect(
            placeholdersOf(zh[copy.key]),
            `${item}.${reason} 的实参应与模板占位符一致`,
          ).toEqual(Object.keys(copy.params).sort());
        }
      }
    }
    expect(genericCount, "不可达组合数 = 90 − 可达组合数").toBe(90 - mapped.size);
  });

  it("参数缺失时回退而不是渲染出未替换的占位符（capability 无值）", () => {
    const copy = soloipsOnboardingGapCopyFor("capability", "capability-not-verified");
    expect(copy.key).toBe(SOLOIPS_ONBOARDING_GAP_GENERIC_KEY);
    expect(copy.params).toEqual({ reason: "capability-not-verified" });
    expect(zh[copy.key]).not.toContain("{capability}");
  });

  it("缺项对象入口只读稳定字段：core 的 message 不进入上屏素材", () => {
    const gap: SoloipsOnboardingGap = {
      item: "profile",
      reason: "document-missing",
      message: "缺少公开资料（profile）的已保存当前版本",
      documentType: "profile",
    };
    const copy = soloipsOnboardingGapCopyOf(gap);
    expect(copy.key).toBe(SOLOIPS_ONBOARDING_GAP_KEYS.profile["document-missing"]);
    expect(JSON.stringify(copy)).not.toContain("已保存当前版本");
  });

  it("capability 缺项的文案带能力名（用户可读参数，非 core 文本）", () => {
    const gap: SoloipsOnboardingGap = {
      item: "capability",
      reason: "capability-not-verified",
      message: "岗位必需能力「ink」未通过最小验证",
      capability: "ink",
    };
    const copy = soloipsOnboardingGapCopyOf(gap);
    expect(copy.key).toBe(SOLOIPS_ONBOARDING_GAP_KEYS.capability["capability-not-verified"]);
    expect(copy.params).toEqual({ capability: "ink" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ④ 零硬编码门禁（V4 的静态面；设计 §6「门禁的触发面」）
// ─────────────────────────────────────────────────────────────────────────────

describe("零硬编码文案门禁（设计 §6；V4）", () => {
  const gateScript = join(repoRoot, "scripts", "development", "verify-client-ui-i18n.mjs");
  const clientSource = join(packageDir, "src", "client");

  /** 以子进程跑门禁（真实 exit code；不经 shell，避免引号/转义差异）。 */
  function runGate(args: string[] = []) {
    return spawnSync(process.execPath, [gateScript, ...args], { cwd: repoRoot, encoding: "utf8" });
  }

  it("门禁脚本存在且已在 package.json 接线（check:i18n）", () => {
    // 非空断言：删掉脚本或 script 条目即失败，防止覆盖被静默移除
    // （范式同 typert-artifacts.spec.ts 的可复现性接线断言）。
    expect(existsSync(gateScript), "门禁脚本必须存在").toBe(true);
    const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(
      manifest.scripts?.["check:i18n"],
      "根 package.json 必须保留 check:i18n（否则该门禁不会被跑）",
    ).toBe("node scripts/development/verify-client-ui-i18n.mjs");
  });

  it("在本仓真实源树上报告 0 违规（退出码 0）", () => {
    // 本测试同时是门禁的**接线**：`pnpm run test` 会因违规文案变红。
    const result = runGate();
    expect(result.status, `门禁应通过；stderr=${result.stderr ?? ""}`).toBe(0);
    expect(result.stdout ?? "").toMatch(/\d+ 个客户端源文件的文案均由字典拥有/);
    expect(existsSync(clientSource), "扫描根必须存在").toBe(true);
  });

  it("有鉴别力：临时树塞入中文文案即失败（反例证据）", { timeout: 30_000 }, () => {
    // 〔为什么要先复刻真实树〕门禁有「扫描面下限」守卫（防假绿）；临时树若只有
    // 反例文件，失败可能来自下限而不是鉴别力。故临时树先**整树复制**真实
    // `src/client/`（含 i18n/ 与 locales/），再在副本上加反例——这样失败只可能
    // 来自鉴别力，且复制面随真实树增长自动跟上（不写死文件名清单）。
    const tree = mkdtempSync(join(tmpdir(), "soloips-i18n-gate-"));
    try {
      copyTree(clientSource, tree);
      // locales/ 是唯一允许有译文的目录：这里放一个**会被检测规则命中**的命名
      // （`title`）但位于 locales/ 下，必须被跳过——若排除失效，下面第一步即红。
      writeFileSync(join(tree, "locales", "probe.ts"), 'export const title = "公司总览";\n');

      const clean = runGate(["--root", tree]);
      expect(clean.status, `真实树副本 + locales 豁免应通过；stderr=${clean.stderr ?? ""}`).toBe(0);

      // 反例：JSX 文本 + 携带文案的属性（两条检测面各一）。
      const violating = join(tree, "Panel.tsx");
      writeFileSync(
        violating,
        'export function Panel() {\n  return <section aria-label="公司总览">创建部门</section>;\n}\n',
      );
      const dirty = runGate(["--root", tree]);
      expect(dirty.status, "塞入中文文案后门禁必须失败").toBe(1);
      expect(dirty.stderr ?? "").toContain("Panel.tsx");
      expect(dirty.stderr ?? "").toContain("创建部门");
      expect(dirty.stderr ?? "").toContain("公司总览");
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it("防假绿：扫描面被缩到下限以下时失败（不得报告 0 违规）", { timeout: 30_000 }, () => {
    const empty = mkdtempSync(join(tmpdir(), "soloips-i18n-empty-"));
    try {
      const result = runGate(["--root", empty]);
      expect(result.status, "空扫描面必须失败，而不是报告 0 违规").toBe(1);
      expect(result.stderr ?? "").toContain("低于下限");
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
