#!/usr/bin/env node
/**
 * P0-2：真实消费者证据的 **fail-closed 证据门**（M-A 装配层身份一致性，裁定六）。
 *
 * ── 为什么是「证据门」而不是「跑 E2E 的 CI 步骤」──────────────────────────
 * 真实消费者链路（真实浏览器 → gateway → Host → core → 介质）需要 **DSH fork
 * 运行时**。本仓 `node_modules/@deepseek-ai/` 只有 `dsh-typert-generator` 与
 * `dsh-typert-protocol`，根 `package.json` 无 fork 依赖，也没有指向内网源的
 * `.npmrc`——fork 运行时**只存在于开发机的实例目录**。故在 GitHub-hosted runner
 * 上跑 E2E 是**不可能的**；写成 CI 步骤只会得到「跳过」或「假绿」。
 *
 * 本门禁因此检查的是**证据是否与候选绑定**，而不是重跑链路：
 *
 *   改动触及 M-A 写面（Host/Remote/装配/构建入口）
 *     ⇒ `docs/evidence/be6a/` 下必须存在**绑定当前候选**的证据
 *     ⇒ 找不到 或 绑定的是别的候选 ⇒ **失败**（不是跳过）
 *
 * 这满足「证据缺失即显性失败」：**没有**真实消费者证据时，本步骤**红**。
 *
 * ── 判据（机械、非人工判断）───────────────────────────────────────────────
 * 1. **是否触及 M-A 写面**：用 `git diff --name-only <base>...HEAD` 判定。命中
 *    以下任一即视为触及：
 *      - `packages/web/src/**`（Host/Remote 实现）
 *      - `packages/web/cordis.patch.yml`（装配行）
 *      - `packages/web/package.json`、`packages/web/tsconfig.json`、
 *        `tsdown.config.ts`（构建入口/产物形状）
 *      - `packages/bundle/**`、`packages/adapter-dsh/src/**`（装配与端口）
 *    未触及 ⇒ 本门**通过**（无 M-A 风险，不需要该证据）。
 * 2. **证据绑定当前候选**：`docs/evidence/be6a/CANDIDATE-MANIFEST.json` 必须存在，
 *    且其 `candidateSha` 与当前 HEAD SHA 相等、`artifactSha256` 与
 *    `packages/web/lib/client.js` 的实际摘要相等。
 * 3. **证据内容自证**：manifest 必须列出 E2E 报告文件，且该报告内
 *    `artifactIdentity.embedded === true`（页面加载的 bundle 确实含本候选字节）、
 *    且报告内 `failure` 字段**不存在**（存在即该轮未通过）。
 *
 * ── 为什么不用「脚本存在」当证据 ──────────────────────────────────────────
 * 本项目已因 `test:artifacts` 学过一次（F-03）：**脚本存在 ≠ 已执行 ≠ 已通过**。
 * 故本门只认**与候选摘要绑定的报告文件**。
 *
 * ── 与裁定六的关系 ────────────────────────────────────────────────────────
 * 裁定六要求「证据必须与候选摘要绑定且可被外部 reviewer 获取」。本门把该要求
 * **机械化**：绑定关系由摘要比对强制，而不是靠人核对。
 *
 * 用法：
 *   node scripts/development/check-m-a-evidence.mjs [--base <ref>] [--repo <path>]
 *
 * 退出状态：0 = 通过（未触及 M-A 写面，或证据与候选绑定且自证通过）；1 = 失败。
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const defaultRepo = resolve(here, "..", "..");

function parseArgs(argv) {
  const options = { base: "origin/main", repo: defaultRepo };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--") continue;
    else if (argv[index] === "--base") options.base = argv[++index];
    else if (argv[index] === "--repo") options.repo = argv[++index];
    else fail(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

/** M-A 写面：改动这些路径即视为触及装配/身份链路（含其测试——测试也是 PR 内容）。 */
const M_A_WRITE_SURFACE = [
  /^packages\/web\/src\//,
  /^packages\/web\/cordis\.patch\.yml$/,
  /^packages\/web\/package\.json$/,
  /^packages\/web\/tsconfig\.json$/,
  /^tsdown\.config\.ts$/,
  /^packages\/bundle\//,
  /^packages\/adapter-dsh\/src\//,
];

/**
 * M-A **产品输入**：改动这些路径会改变**实际交付产物或装配路径**，故使既有证据失效。
 *
 * 〔为什么比 {@link M_A_WRITE_SURFACE} 窄〕写面包含测试与装配声明（它们属于 PR
 * 内容、必须触发证据检查），但**测试改动不改变交付产物**。把测试也算作「产品输入」
 * 会强迫每次补测试都重跑真实链路——那是不可执行的纪律，最终只会被绕过。
 * 本清单 = 「产物字节或装配行会变」的最小集合。
 *
 * 〔`packages/bundle/` 必须在内〕该层持**官方行覆写与装配顺序**
 * （`packages/bundle/cordis.patch.yml` 是顺序契约的落点），改它即改装配路径。
 * QA 独立验收实测复现过漏判：只改 bundle 的 patch 时门禁曾放行并打印
 * 「均不触及 M-A 产品输入」——与本节声明的「装配行」口径矛盾，已补入。
 * 唯一排除的是 bundle 的 `tests/`（测试不改变交付产物，与其余层同规则）。
 */
const M_A_PRODUCT_INPUT = [
  /^packages\/web\/src\//,
  /^packages\/web\/cordis\.patch\.yml$/,
  /^packages\/web\/package\.json$/,
  /^packages\/web\/tsconfig\.json$/,
  /^tsdown\.config\.ts$/,
  /^packages\/adapter-dsh\/src\//,
  // bundle 层：装配行覆写与顺序（排除其 tests/——测试不改变交付产物）。
  /^packages\/bundle\/(?!tests\/)/,
];

function sha256Of(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const options = parseArgs(process.argv.slice(2));
const repo = resolve(options.repo);
if (!existsSync(join(repo, ".git"))) fail(`不是 git 仓库：${repo}`);

// ── 1. 是否触及 M-A 写面 ─────────────────────────────────────────────────────
let changed;
try {
  changed = git(repo, ["diff", "--name-only", `${options.base}...HEAD`])
    .split("\n")
    .filter((line) => line.length > 0);
} catch (error) {
  fail(
    `无法计算与 ${options.base} 的差异（需要该 ref 可用；CI 上先 fetch 完整历史）：${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

const touched = changed.filter((path) => M_A_WRITE_SURFACE.some((pattern) => pattern.test(path)));
if (touched.length === 0) {
  process.stdout.write(
    `M-A 证据门：未触及 M-A 写面（改动 ${String(changed.length)} 个文件，均不在装配/身份链路）——通过。\n`,
  );
  process.exit(0);
}

// ── 2. 证据必须存在且绑定当前候选 ────────────────────────────────────────────
const head = git(repo, ["rev-parse", "HEAD"]);
const manifestPath = join(repo, "docs", "evidence", "be6a", "CANDIDATE-MANIFEST.json");
if (!existsSync(manifestPath)) {
  fail(
    `M-A 证据门失败：本 PR 触及 M-A 写面（${touched.slice(0, 5).join(", ")}${
      touched.length > 5 ? ` 等 ${String(touched.length)} 个` : ""
    }），但 docs/evidence/be6a/CANDIDATE-MANIFEST.json 不存在。\n` +
      "  真实消费者链路需要 DSH fork 运行时（GitHub runner 不可得），因此本门检查\n" +
      "  「证据是否与候选绑定」，而不是重跑链路。请在本机跑完 E2E 后按\n" +
      "  docs/evidence/be6a/README.md 的格式落盘 manifest。",
  );
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  fail(
    `CANDIDATE-MANIFEST.json 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
  );
}

if (manifest.candidateSha !== head) {
  // 〔判据为什么不是「manifest.candidateSha === HEAD」〕那会把**纯证据/测试/CI
  // 提交**也判成 stale，强迫每次落盘证据后重跑真实链路——不可执行的纪律会被绕过。
  // 审评要求的是「**改变装配路径**的 commit 后必须重新绑定」。故判据取：
  // 从证据 SHA 到 HEAD 之间，**M-A 产品输入**（装配行 / Host 源码 / 构建入口 /
  // 包清单）必须**未变**；只改测试、证据、CI、文档不算失效。
  // 产物摘要比对（下方）仍是硬判据，二者合起来覆盖「装配路径未变」。
  let evidenceToHead;
  try {
    evidenceToHead = git(repo, ["diff", "--name-only", `${String(manifest.candidateSha)}..HEAD`])
      .split("\n")
      .filter((line) => line.length > 0);
  } catch (error) {
    fail(
      `M-A 证据门失败：无法计算 ${String(manifest.candidateSha)}..HEAD 的差异——` +
        `证据绑定的 SHA 可能不在本仓库历史中。\n  ${
          error instanceof Error ? error.message : String(error)
        }`,
    );
  }
  const productInputsChanged = evidenceToHead.filter((path) =>
    M_A_PRODUCT_INPUT.some((pattern) => pattern.test(path)),
  );
  if (productInputsChanged.length > 0) {
    fail(
      `M-A 证据门失败：证据绑定的是 ${String(manifest.candidateSha)}，当前 HEAD 是 ${head}，\n` +
        `  且两者之间 **M-A 产品输入已变**（${productInputsChanged.slice(0, 5).join(", ")}${
          productInputsChanged.length > 5 ? ` 等 ${String(productInputsChanged.length)} 个` : ""
        }）。\n` +
        "  任一 SHA / 构建输入变化 → 真实链路证据自动 stale（裁定六的「候选身份绑定」纪律）。\n" +
        "  请在本机重跑 E2E 并更新 manifest，不要沿用旧证据。",
    );
  }
  process.stdout.write(
    `M-A 证据门：证据绑定 ${String(manifest.candidateSha).slice(0, 12)}，HEAD ${head.slice(0, 12)}；\n` +
      `  两者之间改动 ${String(evidenceToHead.length)} 个文件，均**不触及 M-A 产品输入**` +
      "（测试/证据/CI/文档）——证据仍有效，继续核对产物摘要。\n",
  );
}

const clientArtifact = join(repo, "packages", "web", "lib", "client.js");
if (!existsSync(clientArtifact)) {
  fail(`M-A 证据门失败：找不到产物 ${clientArtifact}（先跑 pnpm run build）。`);
}
const actualArtifactSha = sha256Of(clientArtifact);
if (manifest.artifactSha256 !== actualArtifactSha) {
  fail(
    `M-A 证据门失败：manifest 的 artifactSha256=${String(manifest.artifactSha256)}，\n` +
      `  实际 ${clientArtifact} 的 sha256=${actualArtifactSha}。\n` +
      "  产物摘要不一致说明证据不是本候选产生的（构建输入变化 / 旧产物 / 别的副本）。",
  );
}

// ── 3. 证据内容自证 ─────────────────────────────────────────────────────────
// `reports` 接受两种形态：
//   - 字符串：`"report.json"`（无独立摘要；仅当 manifest 顶层给了 reportSha256 时校验）
//   - 对象：`{ file, sha256 }`（**推荐**——每份报告各自绑定摘要，多报告时唯一正确形态）
// 〔为什么必须支持对象形态〕多份证据（如「修复后全绿」+「摘除对照全绿」）用一个顶层
// reportSha256 无法表达；若沿用字符串形态，第二份报告就没有摘要绑定。
const reports = Array.isArray(manifest.reports) ? manifest.reports : [];
if (reports.length === 0) {
  fail("M-A 证据门失败：manifest.reports 为空——必须列出至少一份 E2E 报告文件。");
}

for (const entry of reports) {
  const reportName = typeof entry === "string" ? entry : entry?.file;
  if (typeof reportName !== "string" || reportName.length === 0) {
    fail(
      `M-A 证据门失败：manifest.reports 的条目形状非法（需字符串或 {file, sha256}）：${JSON.stringify(entry)}`,
    );
  }
  const reportPath = join(repo, "docs", "evidence", "be6a", reportName);
  if (!existsSync(reportPath)) {
    fail(`M-A 证据门失败：manifest 列出的报告不存在：docs/evidence/be6a/${String(reportName)}`);
  }
  // 报告字节摘要：防止「报告文件被换掉而 manifest 未更新」。声明了摘要就必须被强制
  // ——「声明了却不校验」正是本项目抓过的假绿形态（如 registerClient 声明了却不被读取）。
  const declaredSha =
    typeof entry === "object" && entry !== null && typeof entry.sha256 === "string"
      ? entry.sha256
      : typeof manifest.reportSha256 === "string"
        ? manifest.reportSha256
        : undefined;
  if (declaredSha !== undefined) {
    const actualReportSha = sha256Of(reportPath);
    if (declaredSha !== actualReportSha) {
      fail(
        `M-A 证据门失败：${String(reportName)} 的实际 sha256=${actualReportSha}，\n` +
          `  与 manifest 声明的 ${declaredSha} 不符——报告文件被改动过。`,
      );
    }
  }
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (error) {
    fail(
      `${String(reportName)} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (report.artifactIdentity?.embedded !== true) {
    fail(
      `M-A 证据门失败：${String(reportName)} 的 artifactIdentity.embedded 不是 true——\n` +
        "  无法确认页面实际加载的 bundle 含本候选字节（可能是旧产物/另一份副本）。",
    );
  }
  if (report.failure !== undefined) {
    fail(
      `M-A 证据门失败：${String(reportName)} 记录了 failure：${String(report.failure)}\n` +
        "  「跑了但没通过」不得当作证据。修好后再落盘。",
    );
  }
}

// `additionalEvidence[]` 的存在性校验：QA 复验指出「登记在案的文件可静默消失」
// ——`reports[]` 有存在性 + 摘要校验，而 `additionalEvidence[]` 此前 0 处引用。
// 这里补存在性（摘要可选，因该数组条目形状未约定摘要字段）。
const additional = Array.isArray(manifest.additionalEvidence) ? manifest.additionalEvidence : [];
for (const entry of additional) {
  const name = typeof entry === "string" ? entry : entry?.file;
  if (typeof name !== "string" || name.length === 0) {
    fail(`M-A 证据门失败：manifest.additionalEvidence 条目形状非法：${JSON.stringify(entry)}`);
  }
  if (!existsSync(join(repo, "docs", "evidence", "be6a", name))) {
    fail(
      `M-A 证据门失败：manifest.additionalEvidence 登记的文件不存在：docs/evidence/be6a/${String(name)}\n` +
        "  登记在案的文件不得静默消失（存在性由本门强制）。",
    );
  }
}

process.stdout.write(
  `M-A 证据门通过：触及 M-A 写面 ${String(touched.length)} 个文件；证据绑定 ${String(
    manifest.candidateSha,
  ).slice(0, 12)}（HEAD ${head.slice(0, 12)}），` +
    `产物摘要一致，报告 ${String(reports.length)} 份且 embedded=true、无 failure；` +
    `附加证据 ${String(additional.length)} 份均存在。\n`,
);
