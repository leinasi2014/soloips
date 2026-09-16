// TEMPORARY CI diagnostic. Deleted once the Windows PSModulePath cause is pinned.
//
// Reproduces EXACTLY what packages/bundle/tests/home-patch-integrity.spec.ts does
// (Node -> powershell.exe -File), and reports what the child PowerShell actually sees.
import { spawnSync, execSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const probe = [
  'Write-Output ("psver=" + $PSVersionTable.PSVersion)',
  'Write-Output ("pshome=" + $PSHOME)',
  'Write-Output ("psmp=" + $env:PSModulePath)',
  'Write-Output ("getCmd=" + [bool](Get-Command Get-FileHash -ErrorAction SilentlyContinue))',
].join("; ");
const probePath = join(process.cwd(), "ci-probe.ps1");
writeFileSync(probePath, probe);

const ps51Default = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules";
const inherited = process.env.PSModulePath;

const variants = [
  ["A inherited", inherited],
  ["B deleted", "DELETE"],
  ["C empty", ""],
  ["D 5.1 default only", ps51Default],
  ["E filtered", inherited ? inherited.split(";").filter((s) => s && !/(^|\\)(documents|program files( \(x86\))?)\\powershell(\\\d+(\.\d+)*)?(\\modules)?$/i.test(s.replace(/\//g, "\\").replace(/\\+$/, ""))).join(";") : ""],
];

console.log("DIAG node env PSModulePath =", JSON.stringify(inherited));
try {
  console.log("DIAG where powershell     =", execSync("where.exe powershell").toString().trim().split(/\r?\n/).join(" | "));
} catch (error) {
  console.log("DIAG where powershell ERR =", String(error.message).slice(0, 120));
}

for (const [label, value] of variants) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  if (value === "DELETE") delete env.PSModulePath;
  else env.PSModulePath = value;

  const run = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", probePath],
    { encoding: "utf8", env },
  );
  const out = (run.stdout ?? "").replace(/\r/g, "").trim().split("\n").join(" ; ");
  console.log(`DIAG ${label} status=${run.status} :: ${out}`);
  if ((run.stderr ?? "").trim()) {
    console.log(`DIAG ${label} STDERR ${(run.stderr ?? "").replace(/\r/g, "").trim().slice(0, 160)}`);
  }
}
