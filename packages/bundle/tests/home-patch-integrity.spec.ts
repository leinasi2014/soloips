import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 启动器 home patch 完整性规则的 fixture 测试。
 *
 * 背景：官方加载契约把 `$DSH_HOME/cordis.patch.yml` 排在 profile patch **之后**
 * 应用（`allPatches = bundles → profile → homePatches → overlays`），因此 home patch
 * 的优先级高于受管 profile 层。它不在 profile manifest 里，原先的安装校验既不要求
 * 登记、也不因未登记而失败——一个未被登记的 home patch 可以改变实际装配而全部检查照过。
 *
 * 本测试调用**真实生产校验路径**（`runtime.ps1 -Action verify`），不复制一份相同算法
 * 测副本：fixture 通过就意味着已交付的规则接受了它。
 *
 * 安全边界：所有 fixture 都在临时目录内；不启动 DSH、不访问模型、不读写真实
 * version 目录或真实用户 home。
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const runtimeScript = join(repoRoot, "scripts", "development", "runtime.ps1");

let workRoot: string;
let nodeExe: string;
let port = 56100;

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

interface Fixture {
  root: string;
  integrity: { path: string; sha256: string }[];
  port: number;
}

/** 写入一个文件并返回其完整性记录。 */
function addHash(versionRoot: string, relative: string, content: string) {
  writeFileSync(join(versionRoot, relative), content);
  return { path: relative, sha256: sha256(content) };
}

/**
 * 建立一版「其他输入全部有效」的 fixture，使 negative case 的失败只能来自
 * home patch 规则本身，而不是无关的 fixture 噪声。
 */
function newFixture(
  name: string,
  options: { homePatch?: string; registerHomePatch?: boolean } = {},
): Fixture {
  const root = join(workRoot, name);
  const currentPort = port++;
  // 启动器要求源码工作目录与版本目录互不包含，故工作目录放在版本根之外。
  const workspace = join(workRoot, `${name}-workspace`);
  for (const relative of [
    "runtime/node_modules/@deepseek-ai/dsh/lib",
    "home/profiles/soloips",
    "agents",
  ]) {
    mkdirSync(join(root, relative), { recursive: true });
  }
  mkdirSync(workspace, { recursive: true });

  const integrity = [
    addHash(root, "runtime/node_modules/@deepseek-ai/dsh/lib/bin.js", "// fixture entry\n"),
    addHash(root, "runtime/package.json", '{"name":"fixture-runtime"}\n'),
    addHash(root, "runtime/package-lock.json", '{"lockfileVersion":3}\n'),
    addHash(
      root,
      "home/profiles/soloips/package.json",
      '{"name":"soloips","dsh":{"profile":{"patchReload":"startup"}}}\n',
    ),
    addHash(root, "home/profiles/soloips/cordis.patch.yml", "- id: fixture\n  disabled: true\n"),
    addHash(root, "artifacts.tgz", "fixture artifact bytes\n"),
  ];

  // home patch：先按内容写入并可选登记，再决定是否篡改。
  if (options.homePatch !== undefined) {
    const record = addHash(root, "home/cordis.patch.yml", options.homePatch);
    if (options.registerHomePatch) integrity.push(record);
  }

  writeFileSync(
    join(root, "release.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        versionId: name,
        nodePath: nodeExe,
        entry: "runtime/node_modules/@deepseek-ai/dsh/lib/bin.js",
        workingDirectory: workspace,
        profile: "soloips",
        port: currentPort,
        home: "home",
        runtime: "runtime",
        agents: "agents",
        integrity,
      },
      null,
      2,
    ),
  );
  return { root, integrity, port: currentPort };
}

/** 运行真实生产校验入口，返回退出状态与输出。 */
function runVerify(versionRoot: string) {
  // 启动器会拒绝带 NODE_OPTIONS/NODE_PATH 的环境（冻结运行时的保护）。测试进程
  // 自身可能带这些变量（如 vitest 注入），故显式清掉，模拟干净的启动环境。
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      runtimeScript,
      "-Action",
      "verify",
      "-VersionRoot",
      versionRoot,
    ],
    { cwd: repoRoot, encoding: "utf8", env },
  );
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

beforeAll(() => {
  const probe = spawnSync("node", ["-e", "process.stdout.write(process.execPath)"], {
    encoding: "utf8",
  });
  nodeExe = (probe.stdout ?? "").trim();
  const version = spawnSync(nodeExe, ["--version"], { encoding: "utf8" });
  if (!/^v24\./.test((version.stdout ?? "").trim())) {
    throw new Error(`The launcher requires Node 24.x; found ${(version.stdout ?? "").trim()}`);
  }
  workRoot = mkdtempSync(join(tmpdir(), "soloips-homepatch-"));
});

afterAll(() => {
  rmSync(workRoot, { recursive: true, force: true });
});

/**
 * 平台前提：`runtime.ps1` 是 **Windows-only** 启动器（`Get-CimInstance`、
 * `Get-NetTCPConnection`、`WindowStyle`、`node.exe` 路径校验）。CI 在 ubuntu-latest
 * 上运行，无法执行该入口，故本套件在非 Windows 平台上跳过，而不是失败或假通过。
 * 跳过是**如实声明未验证**：Windows 上的本地运行才是这些用例的证据来源。
 */
const isWindows = process.platform === "win32";
const suite = isWindows ? describe : describe.skip;

suite("runtime.ps1 home patch integrity (production verify path)", () => {
  it("accepts a version that has no home patch", () => {
    const fixture = newFixture("r201");
    const { status, output } = runVerify(fixture.root);
    expect(output).toMatch(/"result":\s*"verified"/);
    expect(status).toBe(0);
  });

  it("rejects an unregistered home patch", () => {
    const fixture = newFixture("r202", { homePatch: "- id: unregistered\n  disabled: true\n" });
    const { status, output } = runVerify(fixture.root);
    expect(status).not.toBe(0);
    // 必须点明是 home patch 未登记，而不是泛泛的失败。
    expect(output).toContain("home-level patch");
    expect(output).toContain("cordis.patch.yml");
    // 不得输出文件内容。
    expect(output).not.toContain("disabled");
  });

  it("accepts a registered home patch whose hash matches", () => {
    const fixture = newFixture("r203", {
      homePatch: "- id: registered\n  disabled: true\n",
      registerHomePatch: true,
    });
    const { status, output } = runVerify(fixture.root);
    expect(output).toMatch(/"result":\s*"verified"/);
    expect(status).toBe(0);
  });

  it("rejects a registered home patch whose content changed", () => {
    // 登记后改写内容：记录描述的是旧字节。
    const fixture = newFixture("r204", {
      homePatch: "- id: original\n  disabled: true\n",
      registerHomePatch: true,
    });
    writeFileSync(
      join(fixture.root, "home/cordis.patch.yml"),
      "- id: tampered\n  disabled: false\n",
    );
    const { status, output } = runVerify(fixture.root);
    expect(status).not.toBe(0);
    expect(output).toContain("Integrity mismatch");
    expect(output).toContain("cordis.patch.yml");
  });

  it("rejects a manifest that registers a home patch which is absent on disk", () => {
    const fixture = newFixture("r205", {
      homePatch: "- id: transient\n  disabled: true\n",
      registerHomePatch: true,
    });
    rmSync(join(fixture.root, "home/cordis.patch.yml"));
    const { status, output } = runVerify(fixture.root);
    expect(status).not.toBe(0);
    expect(output).toContain("Required file is absent");
    expect(output).toContain("cordis.patch.yml");
  });

  it("uses the home directory recorded in release.json (not a fixed name)", () => {
    // home 必须与真正启动时传给 DSH_HOME 的那个目录一致；这里通过改 home 目录名
    // 并同时改 release.json 来固定这一点。
    const fixture = newFixture("r206");
    const renamed = join(fixture.root, "home-renamed");
    // 先建新 home 内容，再移除旧目录，最后改写 release.json 与工作目录别名。
    mkdirSync(join(renamed, "profiles", "soloips"), { recursive: true });
    const relocations: [string, string][] = [
      [
        "profiles/soloips/package.json",
        '{"name":"soloips","dsh":{"profile":{"patchReload":"startup"}}}\n',
      ],
      ["profiles/soloips/cordis.patch.yml", "- id: fixture\n  disabled: true\n"],
    ];
    const integrity = fixture.integrity.filter((entry) => !entry.path.startsWith("home/profiles"));
    for (const [relative, content] of relocations) {
      const record = addHash(renamed, relative, content);
      integrity.push({ path: `home-renamed/${relative}`, sha256: record.sha256 });
    }
    // 未登记的 home patch 放在改名后的 home 根：规则必须看这里。
    writeFileSync(join(renamed, "cordis.patch.yml"), "- id: unregistered\n  disabled: true\n");
    rmSync(join(fixture.root, "home"), { recursive: true, force: true });

    const releasePath = join(fixture.root, "release.json");
    const release = JSON.parse(String(require("node:fs").readFileSync(releasePath, "utf8")));
    release.home = "home-renamed";
    release.integrity = integrity;
    writeFileSync(releasePath, JSON.stringify(release, null, 2));

    const { status, output } = runVerify(fixture.root);
    expect(status).not.toBe(0);
    expect(output).toContain("home-level patch");
    expect(output).toContain("home-renamed");
  });

  it("does not silently register or rehash the offending file", () => {
    const fixture = newFixture("r207", { homePatch: "- id: unregistered\n  disabled: true\n" });
    const releasePath = join(fixture.root, "release.json");
    const before = String(require("node:fs").readFileSync(releasePath, "utf8"));
    runVerify(fixture.root);
    const after = String(require("node:fs").readFileSync(releasePath, "utf8"));
    // 启动器不得改写清单来「修复」异常。
    expect(after).toBe(before);
    expect(existsSync(join(fixture.root, "home/cordis.patch.yml"))).toBe(true);
  });

  it("fails verify before any start-side effect (no lock or log artifacts)", () => {
    const fixture = newFixture("r208", { homePatch: "- id: unregistered\n  disabled: true\n" });
    runVerify(fixture.root);
    // verify 不得创建 start 才该创建的日志或进程记录。
    expect(existsSync(join(fixture.root, "logs"))).toBe(false);
    expect(existsSync(join(fixture.root, "process.json"))).toBe(false);
    // 锁文件仅在 start/stop 路径请求；verify 不应持有残留。
    expect(existsSync(join(fixture.root, ".runtime-manager.lock"))).toBe(false);
  });
});
