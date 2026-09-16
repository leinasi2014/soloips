#requires -Version 5.1
<#
.SYNOPSIS
Verifies or controls one installed SoloIPs development runtime on Windows.
.DESCRIPTION
release.json selects fixed artifacts and paths. process.json identifies only a
process started here; this is not a fence against other launchers sharing a home.
Stop terminates that process on Windows. Finish active work before stopping.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('verify', 'start', 'status', 'stop')]
  [string] $Action,

  [Parameter(Mandatory = $true)]
  [string] $VersionRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Field($Object, [string] $Name, $Default = $null) {
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $Default }
  return $property.Value
}

function Get-AbsolutePath([string] $Value) {
  if ($Value -notmatch '^[A-Za-z]:[\\/]' -or $Value -match '[\x00-\x1f"*?<>|]' -or $Value.Substring(2).Contains(':')) {
    throw 'Paths must be absolute local drive paths without wildcards, quotes, or alternate streams.'
  }
  # Reject short-name aliases; otherwise two spellings could bypass comparisons.
  if ($Value -match '(?i)~[0-9]') { throw 'Use long-form paths, not Windows short-name aliases.' }
  return [IO.Path]::GetFullPath($Value).TrimEnd('\', '/')
}

function Test-Within([string] $Path, [string] $Parent) {
  return $Path.StartsWith($Parent + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoReparsePoint([string] $Path) {
  $cursor = $Path
  while ($cursor) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Reparse points are not allowed in managed paths: $cursor"
      }
    }
    $parent = [IO.Path]::GetDirectoryName($cursor)
    if ($parent -eq $cursor) { break }
    $cursor = $parent
  }
}

function Get-ManagedPath([string] $Relative) {
  if ([string]::IsNullOrWhiteSpace($Relative) -or [IO.Path]::IsPathRooted($Relative) -or $Relative.Contains(':')) {
    throw 'Managed paths in release.json must be relative to VersionRoot.'
  }
  $path = Get-AbsolutePath ([IO.Path]::Combine($script:root, $Relative))
  if (-not (Test-Within $path $script:root)) { throw 'A managed path escapes VersionRoot.' }
  Assert-NoReparsePoint $path
  return $path
}

function Read-Json([string] $Path) {
  try { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) }
  catch { throw "Cannot read a valid JSON document: $Path" }
}

function Assert-File([string] $Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Required file is absent: $Path" }
}

function Get-CreationTime($Process) {
  return $Process.CreationDate.ToUniversalTime().ToString('o')
}

function Get-ObservedProcess([int] $ProcessId) {
  return Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
}

function Get-LaunchHost {
  # The Profile records the user-selected local/LAN binding. Restrict the
  # launcher to the two development bindings instead of accepting arbitrary
  # patch content as a command argument.
  #
  # The host value is NOT passed to the CLI. The official web-app command
  # rejects `--host 0.0.0.0` outright (dsh-web-app/lib/startup.js) and only
  # publishes a host into the webStartup service when the flag was actually
  # named, so passing it would either abort the launch or shadow the Profile
  # patch layer that intentionally owns the bind. The Profile's cordis patch
  # (the remote-web-ui lan-bind block) supplies `webserver.host` through the
  # configuration layer instead. This function remains for read-only checks.
  $patch = Join-Path $script:profilePath 'cordis.patch.yml'
  Assert-File $patch
  $matches = [regex]::Matches((Get-Content -LiteralPath $patch -Raw -Encoding UTF8), '(?m)^\s*host:\s*(?:''|")?(127\.0\.0\.1|0\.0\.0\.0)(?:''|")?\s*(?:#.*)?$')
  if ($matches.Count -eq 0) { return '127.0.0.1' }
  return $matches[$matches.Count - 1].Groups[1].Value
}

function Assert-Command($Process) {
  if (-not [string]::Equals([string]$Process.ExecutablePath, $script:nodePath, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The observed process executable does not match this runtime.'
  }
  # Start-Process may omit quotes around paths without spaces. Compare Windows argv.
  if (-not ('SoloIpsRuntimeCommandLine' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class SoloIpsRuntimeCommandLine {
  [DllImport("shell32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern IntPtr CommandLineToArgvW(string commandLine, out int count);
  [DllImport("kernel32.dll")]
  private static extern IntPtr LocalFree(IntPtr pointer);
  public static string[] Parse(string commandLine) {
    int count;
    IntPtr memory = CommandLineToArgvW(commandLine, out count);
    if (memory == IntPtr.Zero) throw new Win32Exception();
    try {
      string[] result = new string[count];
      for (int i = 0; i < count; i++)
        result[i] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(memory, i * IntPtr.Size));
      return result;
    } finally { LocalFree(memory); }
  }
}
'@
  }
  $actual = [SoloIpsRuntimeCommandLine]::Parse([string]$Process.CommandLine)
  # No --host argument is named: the Profile patch layer owns the bind. See
  # Get-LaunchHost for why the launcher must not pass it.
  $expected = @($script:entryPath, '--profile', 'soloips', '--port', [string]$script:port, '--no-open')
  if ($actual.Count -ne ($expected.Count + 1)) {
    throw 'The observed process command line does not match this runtime.'
  }
  for ($index = 0; $index -lt $expected.Count; $index++) {
    if ($actual[$index + 1] -cne $expected[$index]) {
      throw 'The observed process arguments do not match this runtime.'
    }
  }
}

function Get-OwnedProcess {
  if (-not (Test-Path -LiteralPath $script:receiptPath)) { return $null }
  $receipt = Read-Json $script:receiptPath
  if ((Get-Field $receipt 'schemaVersion') -ne 1 -or
      (Get-Field $receipt 'versionRoot') -ine $script:root -or
      (Get-Field $receipt 'home') -ine $script:homePath -or
      (Get-Field $receipt 'entry') -ine $script:entryPath -or
      (Get-Field $receipt 'nodePath') -ine $script:nodePath -or
      (Get-Field $receipt 'profile') -cne 'soloips' -or
      (Get-Field $receipt 'port') -ne $script:port) {
    throw 'process.json does not identify this release; no process was changed.'
  }
  $processId = 0
  if (-not [int]::TryParse([string](Get-Field $receipt 'pid'), [ref]$processId) -or $processId -le 0) {
    throw 'process.json has an invalid process identity.'
  }
  $observed = Get-ObservedProcess $processId
  if ($null -eq $observed) { return $null }
  if ((Get-CreationTime $observed) -cne (Get-Field $receipt 'creationTimeUtc')) {
    throw 'The recorded PID has been reused; no process was changed.'
  }
  Assert-Command $observed
  # Binding may change through the Profile UI between launches. Process identity
  # plus the constrained CLI argument validation above remains the ownership
  # check; do not reject the managed process solely for that saved setting.
  return $observed
}

function Write-JsonAtomic([string] $Path, $Value) {
  $temporary = $Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
  try {
    [IO.File]::WriteAllText($temporary, (($Value | ConvertTo-Json -Depth 8) + "`n"), (New-Object Text.UTF8Encoding($false)))
    if (Test-Path -LiteralPath $Path) { [IO.File]::Replace($temporary, $Path, [System.Management.Automation.Language.NullString]::Value) }
    else { [IO.File]::Move($temporary, $Path) }
  } finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
  }
}

function Assert-Installation {
  if ([Environment]::GetEnvironmentVariable('NODE_OPTIONS', 'Process') -or [Environment]::GetEnvironmentVariable('NODE_PATH', 'Process')) {
    throw 'Clear ambient NODE_OPTIONS and NODE_PATH before inspecting or launching a frozen runtime.'
  }
  foreach ($directory in @($script:runtimePath, $script:homePath, $script:agentsPath, $script:profilePath, $script:workspace)) {
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) { throw "Required directory is absent: $directory" }
  }
  Assert-File $script:nodePath
  Assert-File $script:entryPath
  $nodeVersion = & $script:nodePath --version
  if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24\.') { throw 'This runtime requires Node 24.x.' }

  $covered = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $tarballs = 0
  foreach ($record in @(Get-Field $script:release 'integrity' @())) {
    $path = Get-ManagedPath ([string](Get-Field $record 'path'))
    $digest = [string](Get-Field $record 'sha256')
    if ($digest -notmatch '^[a-fA-F0-9]{64}$' -or -not $covered.Add($path)) { throw 'Invalid or duplicate integrity entry.' }
    if ($path -ieq $script:settingsPath) { throw 'Mutable settings must not be an integrity entry.' }
    Assert-File $path
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $digest) { throw "Integrity mismatch: $path" }
    if ([IO.Path]::GetExtension($path) -ieq '.tgz') { $tarballs++ }
  }
  foreach ($required in @($script:entryPath, (Join-Path $script:runtimePath 'package.json'), (Join-Path $script:profilePath 'package.json'), (Join-Path $script:profilePath 'cordis.patch.yml'))) {
    if (-not $covered.Contains($required)) { throw "Required integrity entry is missing: $required" }
  }
  $hasLock = $covered.Contains((Join-Path $script:runtimePath 'package-lock.json')) -or $covered.Contains((Join-Path $script:runtimePath 'pnpm-lock.yaml'))
  if (-not $hasLock -or $tarballs -eq 0) { throw 'Integrity must cover the runtime lock and at least one artifact tarball.' }
  $profileManifest = Read-Json (Join-Path $script:profilePath 'package.json')
  $dshProfile = Get-Field (Get-Field $profileManifest 'dsh' ([pscustomobject]@{})) 'profile' ([pscustomobject]@{})
  if ((Get-Field $dshProfile 'patchReload') -cne 'startup') { throw 'The managed profile must use patchReload: startup.' }

  # Parse namespace keys with the installed YAML parser. Never return settings values.
  if (Test-Path -LiteralPath $script:settingsPath) {
    $check = @'
const fs = require('node:fs');
const { createRequire } = require('node:module');
try {
  const yaml = createRequire(process.argv[2])('js-yaml');
  const settings = yaml.load(fs.readFileSync(process.argv[3], 'utf8')) ?? {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) process.exit(2);
  if (Object.prototype.hasOwnProperty.call(settings, 'agent-swarm')) process.exit(3);
} catch { process.exit(2); }
'@
    $check | & $script:nodePath - (Join-Path $script:runtimePath 'package.json') $script:settingsPath
    if ($LASTEXITCODE -eq 3) { throw 'The settings contain the legacy agent-swarm namespace; remove it explicitly before launch.' }
    if ($LASTEXITCODE -ne 0) { throw 'Settings namespace validation failed; no settings content was printed.' }
  }
  return $covered.Count
}

$guard = $null
try {
  $script:root = Get-AbsolutePath $VersionRoot
  Assert-NoReparsePoint $script:root
  if (-not (Test-Path -LiteralPath $script:root -PathType Container)) { throw 'VersionRoot must be an existing directory.' }
  $releasePath = Get-ManagedPath 'release.json'
  $script:release = Read-Json $releasePath
  if ((Get-Field $script:release 'schemaVersion') -ne 1) { throw 'Unsupported release.json schemaVersion.' }
  $versionId = [string](Get-Field $script:release 'versionId')
  if ($versionId -notmatch '^r[0-9]{3,}$' -or (Split-Path -Leaf $script:root) -cne $versionId) { throw 'versionId must match the rNNN VersionRoot directory name.' }
  if ((Get-Field $script:release 'profile' 'soloips') -cne 'soloips') { throw 'This manager requires the soloips profile.' }
  $script:homePath = Get-ManagedPath ([string](Get-Field $script:release 'home' 'home'))
  $script:runtimePath = Get-ManagedPath ([string](Get-Field $script:release 'runtime' 'runtime'))
  $script:agentsPath = Get-ManagedPath ([string](Get-Field $script:release 'agents' 'agents'))
  $script:entryPath = Get-ManagedPath ([string](Get-Field $script:release 'entry' 'runtime/node_modules/@deepseek-ai/dsh/lib/bin.js'))
  $expectedEntry = Join-Path $script:runtimePath 'node_modules\@deepseek-ai\dsh\lib\bin.js'
  if ($script:entryPath -ine $expectedEntry) { throw 'The entry must be the official installed dsh CLI under runtime.' }
  $script:profilePath = Join-Path $script:homePath 'profiles\soloips'
  Assert-NoReparsePoint $script:profilePath
  $script:settingsPath = Join-Path $script:homePath 'settings.yaml'
  Assert-NoReparsePoint $script:settingsPath
  $script:workspace = Get-AbsolutePath ([string](Get-Field $script:release 'workingDirectory'))
  $script:nodePath = Get-AbsolutePath ([string](Get-Field $script:release 'nodePath'))
  Assert-NoReparsePoint $script:workspace
  Assert-NoReparsePoint $script:nodePath
  if ([IO.Path]::GetFileName($script:nodePath) -ine 'node.exe') { throw 'nodePath must identify node.exe.' }
  $paths = @($script:homePath, $script:runtimePath, $script:agentsPath)
  for ($left = 0; $left -lt $paths.Count; $left++) {
    for ($right = $left + 1; $right -lt $paths.Count; $right++) {
      if ($paths[$left] -ieq $paths[$right] -or (Test-Within $paths[$left] $paths[$right]) -or (Test-Within $paths[$right] $paths[$left])) { throw 'Runtime, home, and agents directories must be disjoint.' }
    }
  }
  if ($script:workspace -ieq $script:root -or (Test-Within $script:workspace $script:root) -or (Test-Within $script:root $script:workspace)) { throw 'The source workspace and version directory must not contain each other.' }
  $script:port = 0
  if (-not [int]::TryParse([string](Get-Field $script:release 'port' 55201), [ref]$script:port) -or $script:port -lt 1024 -or $script:port -gt 65535 -or $script:port -in @(3092, 3093, 3094, 3095, 55120)) { throw 'Invalid or protected port.' }
  # The bind comes from the Profile patch layer, not from a CLI flag.
  $script:launchHost = Get-LaunchHost
  $script:arguments = '"' + $script:entryPath + '" --profile soloips --port ' + $script:port + ' --no-open'
  $script:receiptPath = Get-ManagedPath 'process.json'

  if ($Action -eq 'verify') {
    $count = Assert-Installation
    [pscustomobject]@{ action = $Action; version = $versionId; result = 'verified'; integrityFiles = $count; settingsPresent = (Test-Path -LiteralPath $script:settingsPath); evidence = 'files-and-configuration-only' } | ConvertTo-Json
  } elseif ($Action -eq 'status') {
    $owned = Get-OwnedProcess
    [pscustomobject]@{ action = $Action; version = $versionId; state = $(if ($null -eq $owned) { 'stopped' } else { 'running' }); pid = $(if ($null -eq $owned) { $null } else { $owned.ProcessId }); readiness = 'not-checked' } | ConvertTo-Json
  } else {
    # Serialize this manager's mutations. The receipt, not this transient lock, tracks a running child.
    $guardPath = Get-ManagedPath '.runtime-manager.lock'
    $guard = [IO.File]::Open($guardPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $owned = Get-OwnedProcess
    if ($Action -eq 'stop') {
      if ($null -ne $owned) {
        # Hold a Process handle and compare its start time before termination to avoid PID reuse.
        $process = [Diagnostics.Process]::GetProcessById([int]$owned.ProcessId)
        try {
          $null = $process.Handle
          # CIM exposes microseconds; Process.StartTime preserves 100 ns ticks.
          $timeFormat = 'yyyy-MM-ddTHH:mm:ss.ffffffZ'
          if ($process.StartTime.ToUniversalTime().ToString($timeFormat) -cne $owned.CreationDate.ToUniversalTime().ToString($timeFormat)) { throw 'Process identity changed before stop.' }
          $process.Kill()
          if (-not $process.WaitForExit(10000)) { throw 'The owned process did not exit within 10 seconds.' }
        } finally { $process.Dispose() }
      }
      [pscustomobject]@{ action = $Action; version = $versionId; state = 'stopped'; shutdown = $(if ($null -eq $owned) { 'already-stopped' } else { 'forced-process-termination' }) } | ConvertTo-Json
    } else {
      if ($null -ne $owned) { throw 'This version already has a running managed process.' }
      $null = Assert-Installation
      $sameEntry = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($script:entryPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
      if ($sameEntry.Count -gt 0) { throw 'A process already references this installed CLI; inspect it before starting another.' }
      $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq $script:port })
      if ($listeners.Count -gt 0) { throw 'The configured port is already listening; no process was changed.' }
      $logs = Get-ManagedPath 'logs'
      $null = New-Item -ItemType Directory -Path $logs -Force
      $logId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
      $stdout = Join-Path $logs ($logId + '.stdout.log')
      $stderr = Join-Path $logs ($logId + '.stderr.log')
      $environment = @{ DSH_HOME = $script:homePath; DSH_AGENTS_HOME = $script:agentsPath; NODE_OPTIONS = $null; NODE_PATH = $null }
      $previous = @{}
      $child = $null
      try {
        foreach ($key in $environment.Keys) {
          $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
          [Environment]::SetEnvironmentVariable($key, $environment[$key], 'Process')
        }
        $child = Start-Process -FilePath $script:nodePath -ArgumentList $script:arguments -WorkingDirectory $script:workspace -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        $observed = Get-ObservedProcess $child.Id
        if ($null -eq $observed) { throw 'The new runtime exited before its identity could be recorded; inspect its logs.' }
        Assert-Command $observed
        Write-JsonAtomic $script:receiptPath ([ordered]@{
          schemaVersion = 1; versionRoot = $script:root; pid = [int]$observed.ProcessId;
          creationTimeUtc = Get-CreationTime $observed; nodePath = $script:nodePath;
          commandLine = [string]$observed.CommandLine; entry = $script:entryPath;
          home = $script:homePath; profile = 'soloips'; port = $script:port;
          stdout = $stdout; stderr = $stderr
        })
      } catch {
        # This direct handle belongs to the child just created, never to a PID looked up by name.
        if ($null -ne $child -and -not $child.HasExited) { $child.Kill(); $null = $child.WaitForExit(10000) }
        throw
      } finally {
        foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
        if ($null -ne $child) { $child.Dispose() }
      }
      [pscustomobject]@{ action = $Action; version = $versionId; state = 'started'; pid = [int]$observed.ProcessId; url = "http://127.0.0.1:$script:port"; readiness = 'not-checked'; stdout = $stdout; stderr = $stderr } | ConvertTo-Json
    }
  }
} catch {
  Write-Error -Message $_.Exception.Message -ErrorAction Continue
  exit 1
} finally {
  if ($null -ne $guard) { $guard.Dispose() }
}
