/**
 * SOLOIPS-WEB-ERROR-COPY-CLAIMS-SPEC（F-02）
 *
 * 错误文案的**能力声明边界**：字典条目向用户承诺的事实，不得宽于 core 实际
 * 保证的事实。本 spec 钉住的是「文案说了什么」，不是「文案长什么样」——
 * 因此断言用**词族**（零副作用承诺词、核对要求词）而非逐字全文。
 *
 * 依据与事实（均为**只读核对**，不 import core 运行时）：
 *
 *  1. `packages/core/src/commit-gate.ts` 的发布顺序（`#commitLocked`）：
 *     写 pending 意图（`:336`）→ 执行业务发布（`:345`）→ 更新 committed（`:347`），
 *     且**每个发布点前**复核写权（`#createPublisher`，`:371-405`），
 *     **不提供跨表回滚**（文件头不变量 2「部分成功按未决意图核对，不虚构原子性」）。
 *     故 `SOLOIPS_CORE_LEASE_NOT_HELD` / `SOLOIPS_CORE_LEASE_CHECK_FAILED`
 *     可能在「意图已落盘」乃至「业务记录已部分写入」之后才发生
 *     （`errors.ts:34-39` 把 adapter 的失权/未知分别翻译成这两个码）。
 *     **错误码本身不能证明零写入**。
 *  2. `SOLOIPS_CORE_CONFLICT` 的检出点在 `#commitLocked` 的重放检测段
 *     （`commit-gate.ts:294` 读台账、`:298-303` kind 比对抛错），**早于**
 *     `#createPublisher()`（`:312`）与意图落盘（`:336`）——该次调用确实零写入。
 *     故本 spec 同时**正向**钉住 conflict 保留零副作用承诺：核实结论若被后续
 *     改动推翻，这里会红，而不是让「谁都没改」变成静默的语义漂移。
 *
 * 〔为什么负向断言必须存在〕「未执行」「nothing was written」这类承诺是**用户
 * 据此做决策**的事实（要不要重做、要不要核对）。一旦 core 无法保证，文案就是
 * 在误导用户换 ID 重做——与 ORG-05「未知即阻塞、不换 ID 重做」的方向相反。
 * 该断言的**先红后绿**证据见 F-02 交付报告：本 spec 在修正前对
 * `leaseLost`/`leaseUnknown` 的旧文案失败（中文命中「未执行」、英文命中
 * 「nothing was written」），修正后通过。
 */

import { describe, expect, it } from "vitest";

import { en, zh } from "../src/client/locales/index";

/**
 * 零副作用承诺词族（**不得**出现在无法保证零写入的文案里）。
 *
 * 〔为什么是词族而非单个词〕同一承诺有多种自然写法（「未执行」/「没有写入」/
 * 「未写入」），只禁一个词等于给后续改动留了同义绕道。英文侧同理：
 * 「nothing was written」之外还有「no data was written」这类变体，故用
 * `nothing`/`no write` 词族 + 明确的 `was written` 组合，而不是逐字全文。
 */
const ZERO_SIDE_EFFECT_CLAIMS_ZH: readonly RegExp[] = [
  /未执行/,
  /未写入/,
  /没有写入/,
  /无任何写入/,
  /未产生任何/,
  /不会产生写入/,
];

const ZERO_SIDE_EFFECT_CLAIMS_EN: readonly RegExp[] = [
  /nothing was written/i,
  /nothing has been written/i,
  /nothing was saved/i,
  /\bno writes?\b/i,
  /was not executed/i,
  /\bno data was written\b/i,
];

/**
 * 语义要点（**必须**齐备）：写入已停止、结果需核对、保留操作编号、勿重复提交。
 *
 * 〔为什么这四条〕它们是用户在「结果未知」时唯一可执行的正确动作（ORG-05 的
 * 「停止并核对、不换 ID 重做」在文案层的对应物）。缺任何一条，用户就可能
 * 换 ID 重做——那正是要防的行为。
 */
const REQUIRED_POINTS_ZH: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "写入已停止", pattern: /停止/ },
  { label: "结果需核对", pattern: /核对|确认/ },
  { label: "保留本次操作编号", pattern: /保留.*(操作)?编号/ },
  { label: "勿重复提交", pattern: /勿重复提交|不要重复提交|请勿重复提交/ },
];

const REQUIRED_POINTS_EN: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "写入已停止", pattern: /stop(ped|s)?/i },
  { label: "结果需核对", pattern: /reconcil|check|verif/i },
  { label: "保留本次操作编号", pattern: /keep (this|the) operation id/i },
  { label: "勿重复提交", pattern: /do not resubmit|don't resubmit|not resubmit/i },
];

/** 不得出现的「换 ID 重做」引导（ORG-05 反向）。 */
const FORBIDDEN_RETRY_GUIDANCE_ZH: readonly RegExp[] = [
  /换(一个|个)?编号/,
  /更换编号/,
  /换个编号/,
  /新(的)?编号重(做|试|新)/,
];

const FORBIDDEN_RETRY_GUIDANCE_EN: readonly RegExp[] = [
  /new (operation )?id/i,
  /different (operation )?id/i,
  /retry under a new/i,
];

/** 两个 lease 类码的文案键（无法保证零写入，故适用本 spec 的全部负向断言）。 */
const LEASE_COPY_KEYS = ["soloips.error.leaseLost", "soloips.error.leaseUnknown"] as const;

function hit(template: string, patterns: readonly RegExp[]): readonly string[] {
  return patterns.filter((pattern) => pattern.test(template)).map((pattern) => String(pattern));
}

describe("错误文案不得超出 core 的能力声明（F-02；依据 commit-gate.ts 的发布顺序）", () => {
  it("leaseLost / leaseUnknown：中英文案都不含零副作用承诺词", () => {
    // 〔为什么聚合成一条断言〕逐个 `expect` 会在第一处失败即中止，看不到另一种
    // 语言是否同样越界。聚合后「先红」的证据能一次给出**全部**越界点，而不是
    // 逐轮挤出一处（这也让「英文侧是否也红」不依赖执行顺序）。
    const violations: string[] = [];
    for (const key of LEASE_COPY_KEYS) {
      for (const [language, copy, patterns] of [
        ["zh", zh[key], ZERO_SIDE_EFFECT_CLAIMS_ZH],
        ["en", en[key], ZERO_SIDE_EFFECT_CLAIMS_EN],
      ] as const) {
        const hits = hit(copy, patterns);
        if (hits.length > 0) violations.push(`${key}[${language}] ${hits.join(",")} → ${copy}`);
      }
    }
    expect(violations, "这些文案承诺了 core 无法保证的零写入").toEqual([]);
  });

  it("leaseLost / leaseUnknown：中英文案都齐备四条语义要点（停止/核对/保留编号/勿重复提交）", () => {
    for (const key of LEASE_COPY_KEYS) {
      const zhCopy = zh[key];
      const enCopy = en[key];
      for (const point of REQUIRED_POINTS_ZH) {
        expect(point.pattern.test(zhCopy), `${key} 中文缺「${point.label}」：${zhCopy}`).toBe(true);
      }
      for (const point of REQUIRED_POINTS_EN) {
        expect(point.pattern.test(enCopy), `${key} 英文缺「${point.label}」：${enCopy}`).toBe(true);
      }
    }
  });

  it("leaseLost / leaseUnknown：不引导「未知结果换 ID 重做」（ORG-05）", () => {
    for (const key of LEASE_COPY_KEYS) {
      expect(hit(zh[key], FORBIDDEN_RETRY_GUIDANCE_ZH), `${key} 中文出现换 ID 引导`).toEqual([]);
      expect(hit(en[key], FORBIDDEN_RETRY_GUIDANCE_EN), `${key} 英文出现换 ID 引导`).toEqual([]);
    }
  });

  it("leaseLost 保留「不自动重试」的红线语义（中英各一）", () => {
    // 项目红线第 1 条（上游失败不自动重试）在文案层的落点；映射表注释
    // （i18n/error-codes.ts:58）把它写成该键的契约。
    // 〔正则口径〕「不自动重试」与「勿自动重试」是同一条语义的两种写法，
    // 断言的是语义而非措辞，故两者都接受。
    expect(zh["soloips.error.leaseLost"]).toMatch(/[不勿]自动重试/);
    expect(en["soloips.error.leaseLost"]).toMatch(/not retry automatically/i);
  });

  it("conflict：保留零副作用承诺（该码的检出点在意图落盘之前，确有保证）", () => {
    // 〔正向对照〕核实结论：`SOLOIPS_CORE_CONFLICT` 在 `commit-gate.ts:294-303`
    // 抛出，早于 `:312` 的 publisher 与 `:336` 的意图落盘——该次调用零写入。
    // 故本键**保留**承诺，且本条与上面的负向断言共同构成「有保证的保留、
    // 无保证的删去」这一区分：若有人把 lease 的旧文案搬回 conflict，或把
    // conflict 的承诺一并删掉，本 spec 都会给出明确信号。
    expect(hit(zh["soloips.error.conflict"], ZERO_SIDE_EFFECT_CLAIMS_ZH).length).toBeGreaterThan(0);
    expect(hit(en["soloips.error.conflict"], ZERO_SIDE_EFFECT_CLAIMS_EN).length).toBeGreaterThan(0);
  });
});
