import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 宿主面探针（r002 adapter · P5–P9）的环境定位回归测试。
 *
 * 为什么需要它：探针目录从 `.artifacts/operations/<批次>/probe/` 入库到
 * `docs/design/r002/adapter/probe/` 时，配置里指向 `SOLOIPS_DEVS_ROOT` 的**相对**
 * 路径少了一层 `..`，静默解析到不存在的目录，整批宿主探针退化成 TS2307。
 * 当时没有任何检查会发现「路径已失效但探针看着还在跑」。
 *
 * 本测试固定两件事：
 * 1. 入库的探针配置不得含机器绝对路径或逃出仓库的相对路径（原始缺陷的根因）；
 * 2. `host-probe.mjs` 在缺少/错误目标时清楚失败，在目标有效时确实进入类型检查。
 *
 * 证据边界：本测试用**桩目录**验证定位与前置校验的接线，不核对真实 DSH 工件的
 * 类型结果。真实工件的核对由 `host-probe.mjs --target <实际版本>` 单独执行并记录。
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const probeDir = join(repoRoot, "docs", "design", "r002", "adapter", "probe");
const scriptPath = join(repoRoot, "scripts", "development", "host-probe.mjs");

/** 这些配置把 `@deepseek-ai/*` 指向目标安装，必须经占位符解析。 */
const installBackedConfigs = [
  "tsconfig.host.json",
  "tsconfig.hostcontrol.json",
  "tsconfig.augment.json",
  "tsconfig.dev04.json",
];

let workDir: string;

function runProbe(args: string[]) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

/** 造一个「有 @deepseek-ai 目录、但只装了指定包」的桩安装。 */
function makeStubInstall(name: string, packages: string[]) {
  const root = join(workDir, name);
  const scope = join(root, "runtime", "node_modules", "@deepseek-ai");
  mkdirSync(scope, { recursive: true });
  for (const packageName of packages) {
    const dir = join(scope, packageName);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: `@deepseek-ai/${packageName}`, version: "0.0.0" }),
    );
  }
  return root;
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "soloips-hostprobe-"));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("host probe configs carry no machine or escaping paths", () => {
  it("keeps every install-backed config free of absolute and repo-escaping paths", () => {
    const offenders: string[] = [];
    for (const name of installBackedConfigs) {
      const path = join(probeDir, name);
      expect(existsSync(path), `${name} should exist`).toBe(true);
      const config = JSON.parse(readFileSync(path, "utf8")) as {
        compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
      };
      const values = Object.values(config.compilerOptions?.paths ?? {}).flat();
      for (const value of values) {
        if (/^[A-Za-z]:[\\/]/.test(value)) offenders.push(`${name}: 机器绝对路径 ${value}`);
        // 逃出仓库的相对路径正是本次回归的形态。
        if (value.startsWith("..")) offenders.push(`${name}: 逃出仓库的相对路径 ${value}`);
      }
      expect(config.compilerOptions?.baseUrl ?? ".", `${name} baseUrl 不得是机器路径`).not.toMatch(
        /^[A-Za-z]:[\\/]/,
      );
    }
    expect(offenders).toEqual([]);
  });

  it("marks install-dependent paths with the placeholder token", () => {
    // 没有占位符就说明路径被写死了（机器路径或失效的相对路径）。
    for (const name of installBackedConfigs) {
      const raw = readFileSync(join(probeDir, name), "utf8");
      expect(raw, `${name} 应含 __DSH_INSTALL__ 占位符`).toContain("__DSH_INSTALL__");
    }
  });

  it("leaves the intentional unresolvable placeholder intact", () => {
    // P8 的方法要求能力包不可解析；这不能连同修复一起被“清理”掉。
    const dev04 = JSON.parse(readFileSync(join(probeDir, "tsconfig.dev04.json"), "utf8")) as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    expect(dev04.compilerOptions.paths["@deepseek-ai/dsh-storage-domain"]).toEqual([
      "__nonexistent-probe__/dsh-storage-domain",
    ]);
    expect(dev04.compilerOptions.paths["@deepseek-ai/cordis"]).toEqual([
      "__DSH_INSTALL__/@deepseek-ai/cordis",
    ]);
  });
});

describe("host probe fails clearly on bad target input", () => {
  it("refuses to guess when no target is given", () => {
    const { status, output } = runProbe([]);
    expect(status).not.toBe(0);
    expect(output).toContain("--target");
    // 必须指向 ENV-02，而不是自己编一个位置。
    expect(output).toContain("ENV-02");
  });

  it("refuses a target directory that does not exist", () => {
    const missing = join(workDir, "no-such-version");
    const { status, output } = runProbe(["--target", missing]);
    expect(status).not.toBe(0);
    expect(output).toContain("目标目录不存在");
  });

  it("refuses a target that is not an installed DSH artifact", () => {
    const notAnInstall = join(workDir, "not-an-install");
    mkdirSync(notAnInstall, { recursive: true });
    const { status, output } = runProbe(["--target", notAnInstall]);
    expect(status).not.toBe(0);
    expect(output).toContain("@deepseek-ai");
    expect(output).toContain("已安装的 DSH 工件");
  });

  it("fails before compiling when required packages are absent", () => {
    // 只装 cordis，宿主面探针还需要其余能力包。
    const partial = makeStubInstall("partial", ["cordis"]);
    const { status, output } = runProbe(["--target", partial, "--case", "host"]);
    expect(status).not.toBe(0);
    expect(output).toContain("未开始编译");
    // 关键：这必须是前置校验的拒绝，而不是让 tsc 抛一堆 TS2307。
    expect(output).not.toContain("TS2307");
  });
});

describe("host probe actually type-checks a valid target", () => {
  it("resolves the target and reaches tsc instead of the resolver's guards", () => {
    // 桩安装里放齐探针 import 的包（内容为空），目标安装的解析因此成功；
    // 于是流程会进入 tsc。这里断言的是「走到了编译」，不是「类型对得上」——
    // 后者只能在真实工件上核对。
    const packages = [
      "cordis",
      "dsh-storage-domain",
      "dsh-session-persistence",
      "dsh-subagent",
      "dsh-tools",
      "dsh-settings",
      "dsh-experimental-agent-team",
      "dsh-storage",
      "dsh-agent",
      "schemastery",
    ];
    const complete = makeStubInstall("complete", packages);
    const { output } = runProbe(["--target", complete, "--case", "host"]);
    expect(output).toContain("目标安装：");
    expect(output).not.toContain("缺少目标安装位置");
    expect(output).not.toContain("未开始编译");
    // 进入编译后，空桩包必然产生诊断，且诊断必须指向探针源码。
    expect(output).toMatch(/host-surface\.ts\(\d+,\d+\): error TS/);
  });

  it("reports a per-case expectation table", () => {
    const complete = join(workDir, "complete");
    if (!existsSync(complete)) return; // 上一用例未跑到时跳过（正常情况下不会）
    const { output } = runProbe(["--target", complete, "--case", "host"]);
    expect(output).toContain("证据边界");
    expect(output).toMatch(/\d+\/\d+ 符合预期/);
  });
});

describe("probe directory keeps its tracked inventory", () => {
  it("still ships the positive/negative probe configs the receipt references", () => {
    const present = readdirSync(probeDir);
    for (const name of [
      "tsconfig.json",
      "tsconfig.control.json",
      "tsconfig.positive.json",
      "tsconfig.integrity.json",
      "tsconfig.dev04.control.json",
      "tsconfig.host.json",
      "tsconfig.hostcontrol.json",
      "tsconfig.augment.json",
      "tsconfig.dev04.json",
    ]) {
      expect(present, `${name} should remain tracked`).toContain(name);
    }
  });
});
