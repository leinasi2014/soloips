// Isolated keyless composition check; never load the user's settings or providers.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const checkout = resolve(process.argv[2] ?? "");
assert.ok(
  process.argv[2],
  "usage: node verify-preset.mjs <built-official-checkout> [installed-runtime]",
);
const cliDirectory = process.argv[3]
  ? join(resolve(process.argv[3]), "node_modules/@deepseek-ai/dsh")
  : join(checkout, "apps/cli");
const ownDirectory = fileURLToPath(new URL(".", import.meta.url));
const upstream = JSON.parse(await readFile(join(ownDirectory, "upstream.json"), "utf8"));
const sourceBytes = await readFile(join(checkout, upstream.sourcePath));
assert.equal(
  createHash("sha256").update(sourceBytes).digest("hex"),
  upstream.sourceSha256,
  "official standard preset changed; review and regenerate this template before verification",
);
const scratch = await mkdtemp(join(tmpdir(), "soloips-preset-"));
try {
  const home = join(scratch, "home");
  const profile = join(home, "profiles", "soloips-probe");
  await mkdir(profile, { recursive: true });
  await mkdir(join(scratch, ".git"));
  await writeFile(join(scratch, "AGENTS.md"), "# SOLOIPS_PROJECT_INSTRUCTIONS_PROBE\n");
  await writeFile(join(home, "AGENTS.md"), "# SOLOIPS_HOME_INSTRUCTIONS_PROBE\n");
  await writeFile(
    join(profile, "package.json"),
    JSON.stringify(
      {
        name: "soloips-preset-probe",
        private: true,
        dsh: {
          profile: {
            bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-experimental-agent-team-profile"],
            patchReload: "startup",
          },
        },
      },
      null,
      2,
    ),
  );
  // Reuse the official Web agent-plane masking verbatim. HTTP and browser rows
  // are excluded because this probe checks preset scope rather than the UI.
  const webPatch = await readFile(
    join(checkout, "packages/bundle/web-app/cordis.patch.yml"),
    "utf8",
  );
  const maskStart =
    webPatch.indexOf("- id: tool-bash\n") >= 0
      ? webPatch.indexOf("- id: tool-bash\n")
      : webPatch.indexOf("- id: tool-bash\r\n");
  const maskEnd = webPatch.indexOf("# The preset roster.", maskStart);
  assert.ok(
    maskStart >= 0 && maskEnd > maskStart,
    "upstream Web composition changed; re-review before checking",
  );
  const quote = (text) => `'${text.replaceAll("'", "''")}'`;
  const patch = `${webPatch.slice(maskStart, maskEnd)}
- id: llm-deepseek
  disabled: true
- insert:
    - id: agent-presets
      name: '@deepseek-ai/dsh-agent-presets'
      config:
        default: soloips-development
        includeShippedRoot: false
        includeUserRoot: false
        roots:
          - path: ${quote(join(ownDirectory, "agent-presets"))}
            trust: system
    - id: soloips-development-probe
      name: ${quote(pathToFileURL(join(ownDirectory, "probe-plugin.mjs")).href)}
`;
  await writeFile(join(profile, "cordis.patch.yml"), patch);
  const result = spawnSync(
    process.execPath,
    [join(cliDirectory, "lib/bin.js"), "--profile", "soloips-probe"],
    {
      cwd: scratch,
      encoding: "utf8",
      timeout: 90000,
      windowsHide: true,
      env: {
        ...process.env,
        DSH_HOME: home,
        DSH_AGENTS_HOME: join(scratch, ".agents"),
        DSH_TELEMETRY_DISABLED: "1",
        DEEPSEEK_API_KEY: "",
        SOLOIPS_PROBE_ANCHOR: join(cliDirectory, "package.json"),
      },
    },
  );
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  assert.equal(result.error, undefined, "probe process failed");
  assert.equal(result.status, 0, "probe exited unsuccessfully");
  assert.ok(
    result.stdout.includes('"result": "SOLOIPS_DEVELOPMENT_PRESET_OK"'),
    "probe result missing",
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
