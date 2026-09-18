import { MIN_EXECUTED_CASES, REQUIRED_CASES } from "./artifact-inventory.js";

/** 从 vitest 的 `File` 树里收集到的单个用例事实。 */
interface CollectedCase {
  /** 用例标题（`it("…")` 的原文）。 */
  title: string;
  /** `run` = 真的执行了；`skip` / `todo` = 被跳过。 */
  mode: string;
  /** 执行结果状态（`pass` / `fail` / undefined）。 */
  state: string | undefined;
}

/** vitest reporter 收到的任务节点（只声明本守卫用到的字段）。 */
interface TaskNode {
  type: string;
  name: string;
  mode?: string;
  result?: { state?: string };
  tasks?: TaskNode[];
}

/** 收集整棵任务树里的用例。 */
function collectCases(files: readonly TaskNode[]): CollectedCase[] {
  const collected: CollectedCase[] = [];
  const walk = (node: TaskNode): void => {
    if (node.type === "test") {
      collected.push({ title: node.name, mode: node.mode ?? "run", state: node.result?.state });
    }
    for (const child of node.tasks ?? []) walk(child);
  };
  for (const file of files) walk(file);
  return collected;
}

/**
 * 产物行为套件的**执行守卫**（BE-0b-ii / F-03 要求 2、3）。
 *
 * ── 它防的是什么 ─────────────────────────────────────────────────────────────
 * 外审 F-03 指出的形态是：产物断言写成 `if (!hasArtifact) return`，于是「目标用例
 * 零执行」在退出码上表现为**通过**。把用例挪到 build 之后的独立步骤只解决了一半
 * ——还需要有人证明「这次运行**真的执行了**那些用例」。本守卫就是那个证明：
 * 它在测试运行结束时核对执行事实，不符即让该步骤**失败**（非 0 退出）。
 *
 * 三条判据（缺一即失败）：
 *  1. {@link REQUIRED_CASES} 逐条必须在本次运行中**实际执行**（`mode === "run"`）；
 *     缺失或被 `skip` / `todo` 都不接受——后者正是「关键断言被异常跳过」；
 *  2. 实际执行的用例总数不得少于 {@link MIN_EXECUTED_CASES}；
 *  3. 任何必需用例的执行结果不得是 `fail`（vitest 自身也会红，这里给出更明确的信息）。
 *
 * 〔为什么不是「断言脚本存在」〕那是**读文本**，无法区分「用例存在」与「用例被执行」。
 * 本守卫读的是本次运行的**运行时事实**（任务树的 mode/state），与执行等价。
 *
 * 〔约束〕本守卫**不**替代 vitest 的退出码：它只做加法（设置非 0 退出码），
 * 从不把失败改写成通过。
 */
export default class ArtifactSuiteGuard {
  /** 汇总执行事实并核对必需用例；不符时设置非 0 退出码。 */
  onFinished(files?: readonly TaskNode[]): void {
    const collected = collectCases(files ?? []);
    const executed = collected.filter((entry) => entry.mode === "run");
    const executedTitles = new Set(executed.map((entry) => entry.title));

    const missing = REQUIRED_CASES.filter((title) => !executedTitles.has(title));
    const skipped = collected.filter((entry) => entry.mode !== "run");
    const failed = executed.filter((entry) => entry.state === "fail");

    const lines: string[] = [
      "",
      "产物行为套件执行核对（BE-0b-ii / F-03）：",
      `  收集 ${String(collected.length)} 条；实际执行 ${String(executed.length)} 条；` +
        `跳过 ${String(skipped.length)} 条；失败 ${String(failed.length)} 条`,
    ];

    const problems: string[] = [];
    if (executed.length < MIN_EXECUTED_CASES) {
      problems.push(
        `实际执行 ${String(executed.length)} 条，少于最少执行数 ${String(MIN_EXECUTED_CASES)}` +
          "——目标用例可能未被执行（本步骤不得以「没跑」当作通过）",
      );
    }
    if (missing.length > 0) {
      problems.push(
        `必需用例未被执行（${String(missing.length)} 条）：\n` +
          missing.map((title) => `    - ${title}`).join("\n") +
          "\n  这些用例是本步骤的必验项；被删除、被 skip/todo 或标题被改动都会落在这里。" +
          "\n  标题改动请同步 packages/web/tests/artifacts/artifact-inventory.ts 的 REQUIRED_CASES。",
      );
    }
    if (skipped.length > 0) {
      problems.push(
        `存在被跳过/待办的用例（${String(skipped.length)} 条）：\n` +
          skipped.map((entry) => `    - [${entry.mode}] ${entry.title}`).join("\n") +
          "\n  产物行为用例不得以 skip/todo 呈现——那会把必验项伪装成通过。",
      );
    }
    if (failed.length > 0) {
      problems.push(
        `存在失败用例（${String(failed.length)} 条）：\n` +
          failed.map((entry) => `    - ${entry.title}`).join("\n"),
      );
    }

    if (problems.length === 0) {
      lines.push(`  OK   必需用例 ${String(REQUIRED_CASES.length)} 条全部实际执行且通过`);
    } else {
      for (const problem of problems) lines.push(`  FAIL ${problem}`);
      lines.push("");
      lines.push("本步骤失败：产物行为覆盖不成立（缺产物、零执行或关键断言被跳过）。");
      process.exitCode = 1;
    }
    process.stderr.write(`${lines.join("\n")}\n`);
  }
}
