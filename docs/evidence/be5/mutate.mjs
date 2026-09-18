/**
 * BE-5 / F-06 变异自检：对沙箱源码做**语义**手术，跑核心两套件，判定击杀。
 *
 * 判定纪律：只看 exit code + 失败用例名。出现语法/引用/加载错标记时判 BROKEN
 * （不算击杀——那类失败可能在任何断言之前发生）。每体跑完**恢复**并校验字节一致。
 *
 * 用法：node mutate.mjs <mutantId>   或   node mutate.mjs --list
 */
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const MUT = "D:/tmp/be5-f06/mut";
const BACKUP = "D:/tmp/be5-f06/backup";
const LOGS = "D:/tmp/be5-f06/logs";
mkdirSync(LOGS, { recursive: true });

const STORE = `${MUT}/packages/core/src/store.ts`;

function read(p) {
  return readFileSync(p, "utf8");
}
function write(p, s) {
  writeFileSync(p, s, "utf8");
}
function sha256(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}
function replaceOnce(text, needle, repl, tag) {
  const count = text.split(needle).length - 1;
  if (count !== 1) throw new Error(`${tag}: needle count=${count} (期望 1)`);
  return text.replace(needle, repl);
}

const MUTANTS = {
  "X1-懒读部门（前置反解改为命中后才读）": () => {
    // 语义：`#scanAppointments` 不再在进入扫描前反解请求部门，改为**命中过滤键之后**
    // 才读（惰性）。预期：F-06(i) 变红（查损坏的 A、无命中 → 不再触发那次读 → 返回
    // 空数组）；F-06(ii)（查 B）应仍绿（B 的读发生在 B 的命中上）。
    //
    // 〔为什么不用 `const filterDepartment = undefined;`〕那种写法让 `filterDepartment`
    // 收窄为 `never`，`filterDepartment.companyId` 报 TS2339 —— 属**类型破损变异体**，
    // 不算击杀（本仓纪律：区分「仅类型失败」与「运行时语义失败」）。
    const s = read(STORE);
    let next = replaceOnce(
      s,
      `    const filterDepartment =
      filter.departmentId === undefined
        ? undefined
        : this.#domain.table("department").get(filter.departmentId);\n`,
      "",
      "X1-a",
    );
    next = replaceOnce(
      next,
      `        if (scope.kind !== "department" || scope.departmentId !== filter.departmentId) continue;
        // D1：声明的公司必须与部门记录反解出的公司一致（见方法头注释）。
        // 不一致 = 记录自相矛盾（写面会拒），fail-closed 报错而不是按任一侧取值。
        if (filterDepartment === undefined || scope.companyId !== filterDepartment.companyId) {`,
      `        if (scope.kind !== "department" || scope.departmentId !== filter.departmentId) continue;
        // 惰性反解：只在真有命中该部门的记录时才读部门记录。
        const filterDepartment = this.#domain.table("department").get(filter.departmentId);
        if (filterDepartment === undefined || scope.companyId !== filterDepartment.companyId) {`,
      "X1-b",
    );
    write(STORE, next);
  },
  "X2-无关损坏升级为整次失败（扫描中无条件读每条记录的部门）": () => {
    // 语义：扫描到**任何**记录时无条件读其 departmentId 指向的部门记录（哪怕不命中
    // 过滤键）——「介质上有坏记录 → 整次查询失败」。预期：F-06(ii) 变红。
    const s = read(STORE);
    write(
      STORE,
      replaceOnce(
        s,
        `      const resolved = this.#tryResolveAppointmentScope(record);`,
        `      if (record.departmentId !== undefined)
        this.#domain.table("department").get(record.departmentId);
      const resolved = this.#tryResolveAppointmentScope(record);`,
        "X2-a",
      ),
    );
  },
  "X3-介质故障被折成空数组（前置反解 catch 过宽）": () => {
    // 语义：把部门前置反解的介质异常吞掉并当作「部门不存在」。
    // 预期：F-06(i) 与 F-06(ii) 的「查 A 抛错」断言变红。
    const s = read(STORE);
    write(
      STORE,
      replaceOnce(
        s,
        `    const filterDepartment =
      filter.departmentId === undefined
        ? undefined
        : this.#domain.table("department").get(filter.departmentId);`,
        `    let filterDepartment: { readonly companyId: string } | undefined;
    try {
      filterDepartment =
        filter.departmentId === undefined
          ? undefined
          : (this.#domain.table("department").get(filter.departmentId) as
              | { readonly companyId: string }
              | undefined);
    } catch {
      filterDepartment = undefined;
    }`,
        "X3-a",
      ),
    );
  },
  "X4-配额判定移出串行槽位（门外先判，门内不再判）": () => {
    // 语义：配额判定**只**在 gate.commit 之前做（并发下多个请求都读到 0 家），
    // 门内不再复查。预期：B 组并发用例变红（介质上会出现 2 条公司记录）。
    const s = read(STORE);
    let next = replaceOnce(
      s,
      `    return this.#gate.commit<SoloipsCreateCompanyResult, SoloipsQuotaRefused>(`,
      `    const earlyType: SoloipsUserCompanyType =
      companyType === "subsidiary" ? "subsidiary" : "enterprise";
    const earlyRefusal = this.#quotaRefusalFor(earlyType);
    if (earlyRefusal !== undefined) return earlyRefusal;
    return this.#gate.commit<SoloipsCreateCompanyResult, SoloipsQuotaRefused>(`,
      "X4-a",
    );
    next = replaceOnce(
      next,
      `          const userType = this.#requireCreatableCompanyType(companyType, parentId);`,
      `          const userType = this.#requireCreatableCompanyType(companyType, parentId);`,
      "X4-b",
    );
    next = replaceOnce(
      next,
      `          const refusal = this.#quotaRefusalFor(userType);
          return refusal === undefined ? { ok: true } : { ok: false, refusal };`,
      `          void userType;
          return { ok: true };`,
      "X4-c",
    );
    write(STORE, next);
  },
  "X5-拒绝不早退（配额判定移进 mutate，意图落盘之后）": () => {
    // 语义：配额判定从 precondition 移入 mutate → 拒绝前已落盘 pending。
    // 预期：D 组「零新增 pending / 介质逐字不变」断言变红。
    const s = read(STORE);
    let next = replaceOnce(
      s,
      `          const userType = this.#requireCreatableCompanyType(companyType, parentId);`,
      `          this.#requireCreatableCompanyType(companyType, parentId);`,
      "X5-a",
    );
    next = replaceOnce(
      next,
      `          const refusal = this.#quotaRefusalFor(userType);
          return refusal === undefined ? { ok: true } : { ok: false, refusal };`,
      `          return { ok: true };`,
      "X5-b",
    );
    next = replaceOnce(
      next,
      `      async (publish) => {
        const id = newCompanyId();`,
      `      async (publish) => {
        const lateRefusal = this.#quotaRefusalFor(
          companyType === "subsidiary" ? "subsidiary" : "enterprise",
        );
        if (lateRefusal !== undefined) {
          throw Object.assign(new Error("late quota refusal"), {
            code: "SOLOIPS_CORE_PRECONDITION",
          });
        }
        const id = newCompanyId();`,
      "X5-c",
    );
    write(STORE, next);
  },
  "X6-父规则移出串行槽位（门外先判父规则）": () => {
    // 语义：父规则（T-1…T-5 + 深度）移到 gate.commit 之前。
    // 预期：E-l4 变红（遗留操作的父后来被归档 → 重放退化为抛错）。
    const s = read(STORE);
    let next = replaceOnce(
      s,
      `          if (parentId !== undefined) this.#assertParentCompanyRules(parentId);\n`,
      "",
      "X6-a",
    );
    next = replaceOnce(
      next,
      `    return this.#gate.commit<SoloipsCreateCompanyResult, SoloipsQuotaRefused>(`,
      `    if (parentId !== undefined) this.#assertParentCompanyRules(parentId);
    return this.#gate.commit<SoloipsCreateCompanyResult, SoloipsQuotaRefused>(`,
      "X6-b",
    );
    write(STORE, next);
  },
  "X7-类型组合判定移出串行槽位（门外先判）": () => {
    // 语义：类型组合判定（官方类型 / 带父 enterprise / 无父 subsidiary）移到门外。
    // 预期：E-l1/E-l2/E-l3 变红（遗留操作重放退化为抛错）。
    const s = read(STORE);
    let next = replaceOnce(
      s,
      `          const userType = this.#requireCreatableCompanyType(companyType, parentId);`,
      `          const userType: SoloipsUserCompanyType =
            companyType === "platform" || companyType === "operation"
              ? "enterprise"
              : companyType;`,
      "X7-a",
    );
    next = replaceOnce(
      next,
      `    return this.#gate.commit<SoloipsCreateCompanyResult, SoloipsQuotaRefused>(`,
      `    this.#requireCreatableCompanyType(companyType, parentId);
    return this.#gate.commit<SoloipsCreateCompanyResult, SoloipsQuotaRefused>(`,
      "X7-b",
    );
    write(STORE, next);
  },
  "X8-环检测退回旧守卫（提前退出返回错误深度）": () => {
    // 语义：`#computeDepth` 用旧式「深度上限」守卫取代显式环检测。
    // 预期：E8 变红（成环不再报错）。
    const s = read(STORE);
    const needle = [
      `    let depth = 0;`,
      `    const seen = new Set<string>([companyId]);`,
      `    let current: SoloipsCompanyRecord | undefined = this.#domain.table("company").get(companyId);`,
      `    while (current?.parentCompanyId !== undefined) {`,
      `      const parentId = current.parentCompanyId;`,
      `      depth++;`,
    ].join("\n");
    const repl = [
      `    let depth = 0;`,
      `    let current: SoloipsCompanyRecord | undefined = this.#domain.table("company").get(companyId);`,
      `    while (current?.parentCompanyId !== undefined && depth < MAX_TREE_DEPTH) {`,
      `      const parentId = current.parentCompanyId;`,
      `      depth++;`,
    ].join("\n");
    let next = replaceOnce(s, needle, repl, "X8-a");
    next = replaceOnce(
      next,
      `      if (seen.has(parentId)) {
        throw new SoloipsCoreError(
          "SOLOIPS_CORE_VALIDATION",
          \`公司树存在环：从公司 \${companyId} 出发的祖先链在 \${parentId} 处重复出现；\` +
            "深度规则在成环数据上不可判定，拒绝在该链上创建公司（data-contract §2.6，R-4）",
        );
      }
      seen.add(parentId);
`,
      "",
      "X8-b",
    );
    write(STORE, next);
  },
  "X9-T-2 父类型限制过宽（连 enterprise 也禁为父）": () => {
    // 语义：`operation` 之外把 `enterprise` 也禁为父。预期：E2b/E3 的阴性对照变红。
    const s = read(STORE);
    write(
      STORE,
      replaceOnce(
        s,
        `    if (parent.type === "operation") {`,
        `    if (parent.type === "operation" || parent.type === "enterprise") {`,
        "X9-a",
      ),
    );
  },
  "X10-无限制计划被当成已满（-1 失效）": () => {
    // 语义：把 `-1` 无限制误判为「已满」。预期：I4 变红。
    const s = read(STORE);
    write(
      STORE,
      replaceOnce(
        s,
        `    if (limit === -1) return undefined;`,
        `    if (limit === -1)
      return {
        status: "refused",
        reason: "quota-exceeded",
        resourceType: type === "enterprise" ? "companyLimit" : "subsidiaryLimit",
        planCode: this.#planCode,
        current: 0,
        limit: 0,
      };`,
        "X10-a",
      ),
    );
  },
  "X11-删除父状态检查（T-4 失效）": () => {
    // 语义：不再检查父 status。预期：E6 / E-l5 变红。
    const s = read(STORE);
    write(
      STORE,
      replaceOnce(
        s,
        `    if (parent.status !== "active") {`,
        `    if (false && parent.status !== "active") {`,
        "X11-a",
      ),
    );
  },
  "X12-计数忽略 status（archived 也占额）": () => {
    // 语义：计数不再过滤 `status==='active'`。预期：G1 变红。
    const s = read(STORE);
    write(
      STORE,
      replaceOnce(
        s,
        `      if (record.status !== "active") continue;`,
        `      if (false && record.status !== "active") continue;`,
        "X12-a",
      ),
    );
  },
};

const id = process.argv[2];
if (id === "--list") {
  console.log(Object.keys(MUTANTS).join("\n"));
  process.exit(0);
}
if (id === undefined || MUTANTS[id] === undefined) {
  console.log(`用法：node mutate.mjs <id>  或  --list`);
  process.exit(2);
}

// 还原到基线，再应用变异体。
copyFileSync(`${BACKUP}/store.ts`, STORE);
const before = sha256(STORE);
MUTANTS[id]();
const after = sha256(STORE);
if (before === after) {
  console.log(`=== ${id} ===`);
  console.log("VERDICT: NO-OP（变异未改变字节）");
  process.exit(3);
}

const run = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    "packages/core/tests/read-projection.spec.ts",
    "packages/core/tests/quota-tree.spec.ts",
  ],
  { cwd: MUT, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 },
);
const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
const plain = output.replace(/\u001b\[[0-9;]*m/g, "");
writeFileSync(`${LOGS}/mut-${id.replace(/[^A-Za-z0-9-]/g, "_")}.log`, plain, "utf8");

// ── 判定：先判「变异体本身是否可运行」，再判「是否被语义断言击杀」─────────────
//
// 〔为什么不能只看 exit code〕破损变异体（语法错/未声明变量/类型错/模块加载失败）
// 也会让 vitest 非零退出，把它算成「击杀」会虚报鉴别力。区分判据（两道门）：
//
//   门 1（**变异体自身可运行**）：对变异体跑 `tsc -b packages/core`。类型不通过
//     即 TYPE-BROKEN —— 本仓纪律要求区分「仅类型失败」与「运行时语义失败」。
//     这一步同时覆盖语法错、未声明标识符、引用不存在的成员等破损形态。
//   门 2（**测试确实跑起来了**）：两个 spec 文件都必须被收集到。文件级失败
//     （Transform failed / Failed to load / 收集错）即 BROKEN —— 那说明失败发生在
//     任何断言之前。
//
// 〔为什么「非 AssertionError」不构成破损〕产品代码在**本应返回值**的地方抛错，
// 正是变异体造成的**可观察行为差异**（例如把判定移出门外后，遗留操作的重放从
// `replayed` 变成抛 `SoloipsCoreError`）。把它判成「破损」会把真实的语义击杀
// 误记为无效。故破损判据是**错误来源**（变异体能否编译、测试能否收集），
// 不是**错误类型**。错误类型仍逐条打印，供人工核对归属。
const tscRun = spawnSync("node", ["node_modules/typescript/bin/tsc", "-b", "packages/core"], {
  cwd: MUT,
  encoding: "utf8",
  shell: true,
  maxBuffer: 64 * 1024 * 1024,
});
const typecheckClean = tscRun.status === 0;

// 失败清单：从 `Failed Tests N` 标记起、到 `Test Files` 汇总行为止；逐条以行首
// `FAIL ` 切分。每条取报错首行的类型（AssertionError / SoloipsCoreError / …）。
const failedSection = plain.slice(plain.search(/Failed Tests \d+/));
const failureBlocks = [
  ...failedSection.matchAll(
    /^ FAIL\s+(.+?)\n([\s\S]*?)(?=^ FAIL\s|^ *Test Files|^⎯+\[?\d*\/?\d*\]?⎯*\s*$|\Z)/gm,
  ),
];
const failureDetails = failureBlocks.map((block) => {
  const testName = block[1].trim();
  const body = block[2];
  // 报错类型是报错首行的类名。覆盖裸 `Error`（如 `Error: …不符合 schema`）与
  // 带前缀的 `AssertionError` / `SoloipsCoreError` / `TypeError` 等。
  const kind = /^\s*([A-Za-z]*Error)\b/m.exec(body)?.[1] ?? "unknown";
  return { testName, kind };
});
const assertionFailures = failureDetails.filter((f) => f.kind === "AssertionError");
const thrownFailures = failureDetails.filter((f) => f.kind !== "AssertionError");

const passedMatch = /Tests\s+(?:.*?(\d+) failed \| )?(\d+) passed/.exec(plain);
const failedMatch = /Tests\s+.*?(\d+) failed/.exec(plain);
// 收集完整性：两个 spec 都必须出现在文件级结果里。
const collectedBoth =
  plain.includes("read-projection.spec.ts (") && plain.includes("quota-tree.spec.ts (");
const transformFailure = /Transform failed|Failed to load|Failed to parse|SyntaxError/.test(plain);

const verdict = !typecheckClean
  ? "TYPE-BROKEN（变异体类型不通过：不算语义击杀）"
  : !collectedBoth || transformFailure
    ? "BROKEN（测试文件未被完整收集/加载：失败发生在断言之前）"
    : run.status === 0
      ? "SURVIVED（全部通过，无断言变红）"
      : failureDetails.length === 0
        ? "BROKEN（非零退出但未解析出任何失败用例）"
        : "KILLED（失败均来自被测代码的行为差异）";

console.log(`=== ${id} ===`);
console.log(
  `exit=${run.status}  typecheck=${typecheckClean ? "clean" : "FAILED"}  collected-both=${collectedBoth}  failed=${
    failedMatch ? failedMatch[1] : "0"
  }  passed=${passedMatch ? passedMatch[2] : "?"}`,
);
console.log(`VERDICT: ${verdict}`);
console.log(`  失败构成：AssertionError=${assertionFailures.length}  其他抛出=${thrownFailures.length}`);
if (thrownFailures.length > 0) {
  const kinds = [...new Set(thrownFailures.map((f) => f.kind))].join(", ");
  console.log(`  非断言失败的报错类型（来自被测代码，仍属语义击杀）：${kinds}`);
}
for (const f of failureDetails.slice(0, 12)) console.log(`  killed-by: [${f.kind}] ${f.testName}`);

// 恢复并校验字节一致。
copyFileSync(`${BACKUP}/store.ts`, STORE);
const restored = sha256(STORE);
console.log(`恢复校验：${restored === before ? "字节一致" : "不一致（!!）"}  sha256=${restored}`);
