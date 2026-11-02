param(
  [switch]$Agent,
  [string]$InstallRoot = "",
  [switch]$PreflightOnly
)

$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$UpdateMode = $env:TIANYUAN_UPDATE_MODE -eq "1"
$RuntimeLayout = [string]$env:TIANYUAN_RUNTIME_LAYOUT
$RootSetupError = ""
$EarlyVersionText = ""
try { $EarlyVersionText = Get-Content -LiteralPath (Join-Path $RootDir "VERSION.txt") -Raw -Encoding UTF8 } catch {}
if ($EarlyVersionText -match '(?m)^package_type=lite-update\r?$') { $UpdateMode = $true }
if (-not $InstallRoot -and $env:TIANYUAN_INSTALL_ROOT) {
  $InstallRoot = [string]$env:TIANYUAN_INSTALL_ROOT
}
if (-not $RuntimeLayout -and -not $UpdateMode) {
  $RuntimeLayout = "visible-root-v1"
}
if (-not $InstallRoot -and $UpdateMode) {
  $DefaultLegacyRoot = Join-Path $env:LOCALAPPDATA "TianyuanWorkbench"
  $ConfigCandidates = @(
    (Join-Path $DefaultLegacyRoot "workbench-runtime\native-helper\runtime-config.json"),
    (Join-Path $DefaultLegacyRoot "native-helper\runtime-config.json")
  ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
  $ConfiguredRoots = @()
  foreach ($ConfigCandidate in $ConfigCandidates) {
    try {
      $Config = Get-Content -LiteralPath $ConfigCandidate -Raw -Encoding UTF8 | ConvertFrom-Json
      $ConfigRoot = [string]$Config.installRoot
      $ConfigLayout = [string]$Config.layout
      if (-not $ConfigRoot) {
        $HelperRoot = Split-Path -Parent $ConfigCandidate
        if ($ConfigCandidate -match '(?i)[\\/]workbench-runtime[\\/]native-helper[\\/]runtime-config\.json$') {
          $ConfigRoot = Split-Path -Parent (Split-Path -Parent $HelperRoot)
          $ConfigLayout = "visible-root-v1"
        } else {
          $ConfigRoot = Split-Path -Parent $HelperRoot
          $ConfigLayout = "legacy-hidden"
        }
      }
      $ConfiguredRoots += [ordered]@{ root = [IO.Path]::GetFullPath($ConfigRoot); layout = $(if ($ConfigLayout) { $ConfigLayout } else { "legacy-hidden" }) }
    }
    catch {
      $RootSetupError = "INSTALL_ROOT_CONFIG_INVALID: 已发现旧运行配置但无法安全读取，不会改写默认目录。"
    }
  }
  $DistinctConfiguredRoots = @($ConfiguredRoots | ForEach-Object { "$($_.root)|$($_.layout)" } | Select-Object -Unique)
  if ($DistinctConfiguredRoots.Count -eq 1) {
    $InstallRoot = [string]$ConfiguredRoots[0].root
    $RuntimeLayout = [string]$ConfiguredRoots[0].layout
  } elseif ($DistinctConfiguredRoots.Count -gt 1) {
    $RootSetupError = "INSTALL_ROOT_AMBIGUOUS: 找到多个工作台运行目录，请从当前工作台触发更新或显式指定安装目录。"
  } elseif (-not $RootSetupError) {
    $RootSetupError = "LITE_INSTALL_ROOT_UNKNOWN: 轻量更新无法确认当前已安装目录，请从已安装工作台触发更新或使用完整安装包。"
  }
}
if (-not $InstallRoot -and -not $UpdateMode -and -not ($Agent.IsPresent -or $env:TIANYUAN_AGENT_MODE -eq "1")) {
  Write-Host "安装根目录（默认使用当前完整安装包所在目录；扩展将保留在该目录的 extension 文件夹）"
  $InputRoot = Read-Host "安装根目录"
  $InputRoot = $InputRoot.Trim('"', ' ')
  if ($InputRoot) { $InstallRoot = $InputRoot }
}
if (-not $InstallRoot) {
  if (-not $UpdateMode) {
    $InstallRoot = $RootDir
    $RuntimeLayout = "visible-root-v1"
  }
}
try {
  if ($InstallRoot) {
    $InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
    New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
    $InstallRootProbe = Join-Path $InstallRoot (".tianyuan-write-test-" + [Guid]::NewGuid().ToString("N"))
    Set-Content -LiteralPath $InstallRootProbe -Value "ok" -Encoding ASCII
    Remove-Item -LiteralPath $InstallRootProbe -Force
  }
}
catch {
  $RootSetupError = "INSTALL_ROOT_UNAVAILABLE: 指定安装目录不可用，不会改写默认安装：$InstallRoot"
}
if ($UpdateMode -and $InstallRoot -and -not $RuntimeLayout) {
  if (Test-Path -LiteralPath (Join-Path $InstallRoot "workbench-runtime\native-helper\runtime-config.json") -PathType Leaf) {
    $RuntimeLayout = "visible-root-v1"
  } elseif (Test-Path -LiteralPath (Join-Path $InstallRoot "native-helper\runtime-config.json") -PathType Leaf) {
    $RuntimeLayout = "legacy-hidden"
  } else {
    # A fresh directory will fail the managed-runtime precheck before deployment.
    $RuntimeLayout = "visible-root-v1"
  }
}
$IsVisibleLayout = $RuntimeLayout -eq "visible-root-v1"
$BundledNodeExe = Join-Path $RootDir "runtime\node\node.exe"
if ($InstallRoot) {
  $RuntimeRoot = if ($IsVisibleLayout) { Join-Path $InstallRoot "workbench-runtime" } else { $InstallRoot }
  $ExtensionDir = if ($IsVisibleLayout) { Join-Path $InstallRoot "extension" } else { Join-Path $InstallRoot "projects\天源评估系统\extension" }
  $NativeHelperDir = Join-Path $RuntimeRoot "native-helper"
  $NativeHostExe = Join-Path $NativeHelperDir "native_host.exe"
  $PythonDir = Join-Path $RuntimeRoot "python"
  $BundledPythonExe = Join-Path $PythonDir "python.exe"
  $ExistingManagedNodeExe = Join-Path $NativeHelperDir "node\node.exe"
  $PrintSkillsDir = Join-Path $RuntimeRoot "print-format-skills"
  $ManifestPath = Join-Path $NativeHelperDir "com.tianyuan.workbench.helper.json"
  $RuntimeConfigPath = Join-Path $NativeHelperDir "runtime-config.json"
} else {
  $RuntimeRoot = ""
  $ExtensionDir = ""
  $NativeHelperDir = ""
  $NativeHostExe = ""
  $PythonDir = ""
  $BundledPythonExe = ""
  $ExistingManagedNodeExe = ""
  $PrintSkillsDir = ""
  $ManifestPath = ""
  $RuntimeConfigPath = ""
}
$PythonExe = $null
$ChromeRegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.tianyuan.workbench.helper"
$EdgeRegistryPath = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.tianyuan.workbench.helper"
$PythonSource = Join-Path $RootDir "runtime\python-portable"
$WheelDir = Join-Path $RootDir "runtime\python-wheels"
$ExtensionId = "lkflndcnklpeaejohaacoaolnmhgigoc"
$LegacyExtensionId = "fdbllnmaaklkcmoacoapbibiggnndkfpa"
$StartedAt = Get-Date
$ChecksumIndex = $null
$CurrentStep = "启动"
$ExtensionBackupPath = $null
$NativeHelperBackupPath = $null
$PackageVersion = "未知"
$PackageBuildNumber = "未知"
$UpdateStatusPath = [string]$env:TIANYUAN_UPDATE_STATUS_PATH
$AgentMode = $Agent.IsPresent -or $env:TIANYUAN_AGENT_MODE -eq "1"
$PreflightOnly = $PreflightOnly.IsPresent -or $env:TIANYUAN_PREFLIGHT_ONLY -eq "1"
$Warnings = New-Object System.Collections.Generic.List[string]
$ManualActions = New-Object System.Collections.Generic.List[string]
$StoppedProcessIds = New-Object System.Collections.Generic.List[int]
$VisibleExtensionShortcut = ""
$VisibleExtensionPathNote = ""
$BrowserExe = $null
$TycpvProbeFailure = ""

function Write-UpdateStatus(
  [string]$Phase,
  [int]$Percent,
  [string]$Message,
  [string]$Reason = ""
) {
  if (-not $UpdateStatusPath) {
    return
  }
  $Payload = [ordered]@{
    ok = $Phase -ne "failed"
    action = "workbench_update"
    phase = $Phase
    percent = $Percent
    message = $Message
    reason = if ($Reason) { Protect-Message $Reason } else { "" }
    exitCode = if ($env:TIANYUAN_UPDATE_EXIT_CODE) { [int]$env:TIANYUAN_UPDATE_EXIT_CODE } else { 0 }
    installerPid = if ($env:TIANYUAN_UPDATE_INSTALLER_PID) { [int]$env:TIANYUAN_UPDATE_INSTALLER_PID } else { $null }
    stoppedProcessIds = @($StoppedProcessIds | Sort-Object -Unique)
    logPath = [string]$env:TIANYUAN_UPDATE_LOG_PATH
    updatedAt = [DateTime]::UtcNow.ToString("o")
    security = @{ credentialsReturned = $false; tokenUsed = $false }
  }
  New-Item -ItemType Directory -Path (Split-Path -Parent $UpdateStatusPath) -Force | Out-Null
  [IO.File]::WriteAllText(
    $UpdateStatusPath,
    ($Payload | ConvertTo-Json -Depth 5),
    [Text.UTF8Encoding]::new($false)
  )
}

function Write-Step([string]$Message) {
  $script:CurrentStep = $Message
  Write-Host ""
  Write-Host $Message -ForegroundColor Cyan
}

function Protect-Message([string]$Message) {
  return $Message `
    -replace '(?i)((?:cookie|authorization|password|passwd|密码|验证码)\s*[=:]\s*)[^\r\n]+', '$1[REDACTED]' `
    -replace '(?i)(bearer\s+)[^\s"'']+', '$1[REDACTED]' `
    -replace '(?i)zhmcp_[A-Za-z0-9._-]+', '[REDACTED]' `
    -replace '(?i)(token\s*[=:]\s*)[^\s"'']+', '$1[REDACTED]'
}

function Unblock-WorkbenchPath([string]$Path) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
    return
  }
  try {
    if ((Get-Command Unblock-File -ErrorAction SilentlyContinue)) {
      if (Test-Path -LiteralPath $Path -PathType Container) {
        Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
          Unblock-File -ErrorAction SilentlyContinue
      } else {
        Unblock-File -LiteralPath $Path -ErrorAction SilentlyContinue
      }
    }
    Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
      ForEach-Object {
        Remove-Item -LiteralPath ($_.FullName + ":Zone.Identifier") -Force -ErrorAction SilentlyContinue
      }
  }
  catch {
    Write-Warning "解除 Windows 下载阻止标记失败，将继续安装：$(Protect-Message $_.Exception.Message)"
  }
}

function Copy-DirectoryContents([string]$Source, [string]$Destination) {
  if (Test-Path $Destination) {
    Remove-Item $Destination -Recurse -Force
  }
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  Get-ChildItem -LiteralPath $Source -Force | Copy-Item -Destination $Destination -Recurse -Force
}

function Install-DirectoryAtomic(
  [string]$Source,
  [string]$Destination,
  [string[]]$PreserveRelativePaths = @()
) {
  if (-not (Test-Path -LiteralPath $Source)) {
    throw "安装源目录不存在：$Source"
  }
  $Parent = Split-Path -Parent $Destination
  New-Item -ItemType Directory -Path $Parent -Force | Out-Null
  $Suffix = "$PID-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
  $Staging = "$Destination.staging-$Suffix"
  $Backup = "$Destination.previous"
  Remove-Item -LiteralPath $Staging -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $Staging -Force | Out-Null
  Get-ChildItem -LiteralPath $Source -Force |
    Copy-Item -Destination $Staging -Recurse -Force

  foreach ($RelativePath in $PreserveRelativePaths) {
    $Existing = Join-Path $Destination $RelativePath
    if (-not (Test-Path -LiteralPath $Existing)) {
      continue
    }
    $PreservedTarget = Join-Path $Staging $RelativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $PreservedTarget) -Force | Out-Null
    Copy-Item -LiteralPath $Existing -Destination $PreservedTarget -Recurse -Force
  }

  Remove-Item -LiteralPath $Backup -Recurse -Force -ErrorAction SilentlyContinue
  try {
    if (Test-Path -LiteralPath $Destination) {
      Move-Item -LiteralPath $Destination -Destination $Backup
    }
    Move-Item -LiteralPath $Staging -Destination $Destination
    return $(if (Test-Path -LiteralPath $Backup) { $Backup } else { $null })
  }
  catch {
    Remove-Item -LiteralPath $Staging -Recurse -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path -LiteralPath $Destination) -and (Test-Path -LiteralPath $Backup)) {
      Move-Item -LiteralPath $Backup -Destination $Destination
    }
    throw
  }
}

function Restore-PreviousDirectory([string]$Destination, [string]$Backup) {
  if (-not $Backup -or -not (Test-Path -LiteralPath $Backup)) {
    return
  }
  Remove-Item -LiteralPath $Destination -Recurse -Force -ErrorAction SilentlyContinue
  Move-Item -LiteralPath $Backup -Destination $Destination
}

function Stop-ExistingConnector {
  $Health = $null
  try { $Health = Invoke-RestMethod -Uri "http://127.0.0.1:40415/health" -TimeoutSec 2 } catch {}
  if ($Health -and $Health.ok -and $Health.service -ne "tianyuan-connector-bridge") {
    throw "CONNECTOR_PORT_OCCUPIED_BY_OTHER_SERVICE: 端口 40415 被其他程序占用，不能安全升级 Connector。"
  }
  for ($Attempt = 1; $Attempt -le 3; $Attempt += 1) {
    $Pids = New-Object System.Collections.Generic.List[int]
    if ($Health -and $Health.ok -and $Health.pid) {
      $Pids.Add([int]$Health.pid)
    }
    if ($Health -and $Health.ok -and $Health.service -eq "tianyuan-connector-bridge") {
      try {
        $ListenerLine = netstat.exe -ano -p tcp |
          Select-String -Pattern "127\.0\.0\.1:40415\s+\S+\s+LISTENING\s+(\d+)" |
          Select-Object -First 1
        if ($ListenerLine -and $ListenerLine.Matches[0].Groups[1].Value) {
          $Pids.Add([int]$ListenerLine.Matches[0].Groups[1].Value)
        }
      } catch {}
    }
    foreach ($OwnedPid in Get-WorkbenchOwnedProcessIds) { $Pids.Add([int]$OwnedPid) }
    foreach ($ProcessId in @($Pids | Sort-Object -Unique)) {
      if ($ProcessId -gt 0 -and $ProcessId -ne $PID) {
        try {
          & taskkill.exe /PID $ProcessId /T /F *> $null
          $StoppedProcessIds.Add([int]$ProcessId)
        } catch {}
      }
    }
    Start-Sleep -Milliseconds (250 * $Attempt)
    $Health = $null
    try { $Health = Invoke-RestMethod -Uri "http://127.0.0.1:40415/health" -TimeoutSec 1 } catch {}
    $Remaining = @(Get-WorkbenchOwnedProcessIds)
    if ((-not $Health -or -not $Health.ok) -and $Remaining.Count -eq 0) { return }
    Write-UpdateStatus "waiting_for_file_release" (78 + ($Attempt * 2)) "正在等待工作台文件释放（第 $Attempt/3 次）"
  }
  throw "UPDATE_FILE_LOCKED: 工作台 Connector 或 Native Helper 进程未能完全退出。"
}

function Get-WorkbenchOwnedProcessIds {
  $Roots = @($NativeHelperDir, $InstallRoot) |
    Where-Object { $_ } |
    ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') }
  try {
    return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.ProcessId -ne $PID -and $_.Name -in @('native_host.exe', 'node.exe') } |
      ForEach-Object {
        $ExecutablePath = [string]$_.ExecutablePath
        $CommandLine = [string]$_.CommandLine
        $Owned = @($Roots | Where-Object {
          ($ExecutablePath -and $ExecutablePath.StartsWith($_ + '\', [StringComparison]::OrdinalIgnoreCase)) -or
          ($CommandLine -and $CommandLine.IndexOf($_, [StringComparison]::OrdinalIgnoreCase) -ge 0)
        }).Count -gt 0
        if ($Owned) { [int]$_.ProcessId }
      } | Sort-Object -Unique)
  } catch {
    return @()
  }
}

function Test-WorkbenchFileUnlocked([string]$TargetPath) {
  if (-not (Test-Path -LiteralPath $TargetPath -PathType Leaf)) { return $true }
  $Stream = $null
  try {
    $Stream = [IO.File]::Open($TargetPath, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    return $true
  } catch {
    return $false
  } finally {
    if ($Stream) { $Stream.Dispose() }
  }
}

function Wait-WorkbenchFileRelease {
  $Candidates = @(
    (Join-Path $NativeHelperDir "native_host.exe"),
    (Join-Path $NativeHelperDir "node\node.exe"),
    (Join-Path $NativeHelperDir "native_host.js"),
    (Join-Path $NativeHelperDir "connector_bridge.js"),
    (Join-Path $NativeHelperDir "update_installer.js")
  )
  for ($Attempt = 1; $Attempt -le 3; $Attempt += 1) {
    $Locked = @($Candidates | Where-Object { -not (Test-WorkbenchFileUnlocked $_) })
    $OwnedProcesses = @(Get-WorkbenchOwnedProcessIds)
    if ($Locked.Count -eq 0 -and $OwnedProcesses.Count -eq 0) { return }
    Write-UpdateStatus "waiting_for_file_release" (78 + ($Attempt * 2)) "正在等待文件释放（第 $Attempt/3 次）"
    Start-Sleep -Milliseconds (250 * $Attempt)
  }
  throw "UPDATE_FILE_LOCKED: 目标 Node 或 Native Helper 文件仍被占用。"
}

function Get-PackageChecksumIndex {
  if ($null -ne $ChecksumIndex) {
    return $ChecksumIndex
  }
  $ChecksumFile = Join-Path $RootDir "SHA256SUMS"
  if (-not (Test-Path $ChecksumFile)) {
    throw "缺少 SHA256SUMS，安装包不完整。"
  }
  $Index = @{}
  foreach ($Line in Get-Content -LiteralPath $ChecksumFile -Encoding UTF8) {
    if ($Line -notmatch "^([0-9a-fA-F]{64})  \./(.+)$") {
      continue
    }
    $Index[$Matches[2].Replace("\", "/")] = $Matches[1].ToLowerInvariant()
  }
  $script:ChecksumIndex = $Index
  return $Index
}

function Test-PackageFile([string]$RelativePath) {
  $Normalized = $RelativePath.Replace("\", "/").TrimStart("/")
  $Index = Get-PackageChecksumIndex
  if (-not $Index.ContainsKey($Normalized)) {
    throw "校验清单缺少文件：$Normalized"
  }
  $Target = Join-Path $RootDir $Normalized.Replace("/", [IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $Target)) {
    throw "安装包缺少文件：$Normalized"
  }
  # .NET hashing also works in Windows PowerShell 5.1 with a mixed PSModulePath.
  $Stream = [IO.File]::OpenRead($Target)
  $Sha = [Security.Cryptography.SHA256]::Create()
  try { $Actual = ([BitConverter]::ToString($Sha.ComputeHash($Stream))).Replace("-", "").ToLowerInvariant() }
  finally { $Sha.Dispose(); $Stream.Dispose() }
  if ($Actual -ne $Index[$Normalized]) {
    throw "文件校验失败：$Normalized"
  }
}

function Test-RuntimeCompatibilityMetadata([string]$VersionText, $PackageVersionConfig) {
  $ChecksumIndex = Get-PackageChecksumIndex
  $RuntimeIdMatch = [regex]::Match($VersionText, '(?m)^runtime_build_id=([0-9a-fA-F]{64})\r?$')
  if (-not $RuntimeIdMatch.Success) {
    throw "运行时兼容信息不匹配：VERSION.txt 缺少 runtime_build_id。"
  }
  $ExpectedRuntimeBuildId = $RuntimeIdMatch.Groups[1].Value.ToLowerInvariant()
  foreach ($RelativePath in @("extension/runtime-compat.json", "native-helper/runtime-compat.json")) {
    if (-not $ChecksumIndex.ContainsKey($RelativePath)) {
      throw "校验清单缺少文件：$RelativePath"
    }
    $Target = Join-Path $RootDir $RelativePath.Replace("/", [IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path -LiteralPath $Target -PathType Leaf)) {
      throw "安装包缺少运行时兼容信息：$RelativePath"
    }
    try {
      $Compatibility = Get-Content -LiteralPath $Target -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
      throw "运行时兼容信息格式无效：$RelativePath"
    }
    if ([int]$Compatibility.version -ne 2 -or
        [string]$Compatibility.extensionVersion -ne [string]$PackageVersionConfig.chromeVersion -or
        [string]$Compatibility.bridgeProtocol -ne [string]$PackageVersionConfig.bridgeProtocol -or
        [string]$Compatibility.runtimeBuildId -ne $ExpectedRuntimeBuildId) {
      throw "运行时兼容信息与安装包不匹配：$RelativePath"
    }
  }
}

function Test-PackagePrefix([string]$Prefix) {
  $NormalizedPrefix = $Prefix.Replace("\", "/").TrimStart("/")
  $Index = Get-PackageChecksumIndex
  $Matches = @($Index.Keys | Where-Object { $_.StartsWith($NormalizedPrefix, [StringComparison]::OrdinalIgnoreCase) })
  if (-not $Matches.Count) {
    throw "校验清单中没有找到：$NormalizedPrefix"
  }
  foreach ($RelativePath in $Matches) {
    if ($RelativePath -in @("extension/runtime-compat.json", "native-helper/runtime-compat.json")) {
      continue
    }
    Test-PackageFile $RelativePath
  }
}

function Refresh-ProcessPath {
  $MachinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$MachinePath;$UserPath"
}

function Add-TycpvPathCandidates($Candidates, $TrustedDirectories, [string]$Directory) {
  if (-not $Directory -or -not (Test-Path -LiteralPath $Directory -PathType Container)) {
    return
  }
  $ResolvedDirectory = (Resolve-Path -LiteralPath $Directory).Path
  if (-not $TrustedDirectories.Contains($ResolvedDirectory)) {
    $TrustedDirectories.Add($ResolvedDirectory)
  }
  foreach ($RelativePath in @("tycpv.exe", "bin\tycpv.exe", "tycpv.cmd", "bin\tycpv.cmd")) {
    $Candidates.Add((Join-Path $ResolvedDirectory $RelativePath))
  }
}

function Test-TycpvExecutableCandidate([string]$Candidate, $TrustedDirectories) {
  if (-not $Candidate -or -not (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
    return $false
  }
  $ResolvedPath = (Resolve-Path -LiteralPath $Candidate).Path
  if ([IO.Path]::GetFileName($ResolvedPath) -notin @("tycpv.exe", "tycpv.cmd")) {
    return $false
  }
  $Parent = [IO.Path]::GetDirectoryName($ResolvedPath)
  return @($TrustedDirectories | Where-Object {
    $Parent.Equals($_, [StringComparison]::OrdinalIgnoreCase) -or
      $Parent.StartsWith($_ + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
  }).Count -gt 0
}

function Get-TycpvPackageVersion([string]$Candidate) {
  $Directory = [IO.Path]::GetDirectoryName((Resolve-Path -LiteralPath $Candidate).Path)
  foreach ($PackagePath in @(
    (Join-Path $Directory "app\package.json"),
    (Join-Path $Directory "package.json"),
    (Join-Path ([IO.Path]::GetDirectoryName($Directory)) "package.json")
  )) {
    if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) {
      continue
    }
    try {
      $Package = Get-Content -LiteralPath $PackagePath -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($Package.version) {
        return [string]$Package.version
      }
    }
    catch {
      continue
    }
  }
  return $null
}

function Invoke-TycpvProbe([string]$Candidate, [int]$TimeoutSeconds = 5) {
  $ResolvedPath = (Resolve-Path -LiteralPath $Candidate).Path
  $ProcessInfo = New-Object Diagnostics.ProcessStartInfo
  $ProcessInfo.UseShellExecute = $false
  $ProcessInfo.CreateNoWindow = $true
  $ProcessInfo.RedirectStandardOutput = $false
  $ProcessInfo.RedirectStandardError = $false
  $ProcessInfo.WorkingDirectory = [IO.Path]::GetDirectoryName($ResolvedPath)
  if ([IO.Path]::GetFileName($ResolvedPath) -eq "tycpv.cmd") {
    $ProcessInfo.FileName = $env:ComSpec
    $ProcessInfo.Arguments = '/d /s /c ""{0}" --help"' -f $ResolvedPath
  } else {
    $ProcessInfo.FileName = $ResolvedPath
    $ProcessInfo.Arguments = "--help"
  }
  $Process = New-Object Diagnostics.Process
  $Process.StartInfo = $ProcessInfo
  try {
    if (-not $Process.Start()) {
      return [PSCustomObject]@{ Ok = $false; TimedOut = $false; Output = "无法启动 CLI" }
    }
    if (-not $Process.WaitForExit($TimeoutSeconds * 1000)) {
      & taskkill.exe /PID $Process.Id /T /F *> $null
      return [PSCustomObject]@{ Ok = $false; TimedOut = $true; Output = "CLI 探测超过 $TimeoutSeconds 秒，已终止进程树" }
    }
    return [PSCustomObject]@{ Ok = $Process.ExitCode -eq 0; TimedOut = $false; Output = "退出码：$($Process.ExitCode)" }
  }
  catch {
    return [PSCustomObject]@{ Ok = $false; TimedOut = $false; Output = (Protect-Message $_.Exception.Message) }
  }
  finally {
    $Process.Dispose()
  }
}

function Get-TycpvVersionInfo([string]$Candidate, $TrustedDirectories) {
  if (-not (Test-TycpvExecutableCandidate $Candidate $TrustedDirectories)) {
    return $null
  }
  $Probe = Invoke-TycpvProbe $Candidate 15
  if ($Probe.TimedOut) {
    # Cold node start under AV scanning can exceed the first window; retry once
    # before declaring the CLI unavailable so a slow machine keeps its binding.
    $Probe = Invoke-TycpvProbe $Candidate 15
  }
  if (-not $Probe.Ok) {
    $script:TycpvProbeFailure = "$Candidate：$($Probe.Output)"
    return $null
  }
  $ResolvedPath = (Resolve-Path -LiteralPath $Candidate).Path
  $Version = Get-TycpvPackageVersion $ResolvedPath
  if (-not $Version) {
    $Version = "可用（--help 探测通过）"
  }
  return [PSCustomObject]@{
    Path = $ResolvedPath
    Version = (Protect-Message $Version)
    Probe = "--help"
  }
}

function Find-Tycpv {
  Refresh-ProcessPath
  $Candidates = New-Object System.Collections.Generic.List[string]
  $TrustedDirectories = New-Object System.Collections.Generic.List[string]
  foreach ($KnownDirectory in @(
    (Join-Path $env:LOCALAPPDATA "Programs\tycpv"),
    (Join-Path $env:LOCALAPPDATA "tycpv"),
    (Join-Path $env:USERPROFILE ".tycpv"),
    (Join-Path $env:APPDATA "npm"),
    $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles "tycpv" }),
    $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} "tycpv" })
  )) {
    Add-TycpvPathCandidates $Candidates $TrustedDirectories $KnownDirectory
  }
  foreach ($RegistryRoot in @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )) {
    Get-ItemProperty $RegistryRoot -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -match "^tycpv(?:\s|$)" } |
      ForEach-Object {
        if ($_.InstallLocation) {
          Add-TycpvPathCandidates $Candidates $TrustedDirectories ([string]$_.InstallLocation)
        }
        if ($_.DisplayIcon) {
          $IconPath = ([string]$_.DisplayIcon).Split(",")[0].Trim('"')
          if ([IO.Path]::GetFileName($IconPath) -in @("tycpv.exe", "tycpv.cmd")) {
            $IconDirectory = [IO.Path]::GetDirectoryName($IconPath)
            if ($IconDirectory -and -not $TrustedDirectories.Contains($IconDirectory)) {
              $TrustedDirectories.Add($IconDirectory)
            }
            $Candidates.Add($IconPath)
          }
        }
      }
  }
  foreach ($CommandName in @("tycpv.exe", "tycpv.cmd")) {
    $Command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if ($Command -and (Test-TycpvExecutableCandidate $Command.Source $TrustedDirectories)) {
      $Candidates.Add($Command.Source)
    }
  }
  $Seen = @{}
  foreach ($Candidate in $Candidates) {
    if (-not (Test-TycpvExecutableCandidate $Candidate $TrustedDirectories)) {
      continue
    }
    $ResolvedPath = (Resolve-Path -LiteralPath $Candidate).Path
    $CandidateKey = $ResolvedPath.ToLowerInvariant()
    if ($Seen.ContainsKey($CandidateKey)) {
      continue
    }
    $Seen[$CandidateKey] = $true
    $VersionInfo = Get-TycpvVersionInfo $ResolvedPath $TrustedDirectories
    if ($VersionInfo) {
      return $VersionInfo
    }
  }
  return $null
}

function Get-PythonCandidates {
  $Candidates = New-Object System.Collections.Generic.List[string]
  if ($env:TIANYUAN_PYTHON_BIN) {
    $Candidates.Add($env:TIANYUAN_PYTHON_BIN)
  }
  $Candidates.Add($BundledPythonExe)

  foreach ($CommandName in @("python.exe", "python3.exe")) {
    $Command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if ($Command -and $Command.Source) {
      $Candidates.Add($Command.Source)
    }
  }

  $LocalPythonRoot = Join-Path $env:LOCALAPPDATA "Programs\Python"
  if (Test-Path -LiteralPath $LocalPythonRoot) {
    Get-ChildItem -LiteralPath $LocalPythonRoot -Filter "python.exe" -File -Recurse -ErrorAction SilentlyContinue |
      ForEach-Object { $Candidates.Add($_.FullName) }
  }

  foreach ($ProgramRoot in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
    if (-not $ProgramRoot -or -not (Test-Path -LiteralPath $ProgramRoot)) {
      continue
    }
    Get-ChildItem -LiteralPath $ProgramRoot -Directory -Filter "Python*" -ErrorAction SilentlyContinue |
      ForEach-Object {
        $Executable = Join-Path $_.FullName "python.exe"
        if (Test-Path -LiteralPath $Executable) {
          $Candidates.Add($Executable)
        }
      }
  }

  foreach ($RegistryRoot in @(
    "HKCU:\Software\Python\PythonCore\*\InstallPath",
    "HKLM:\Software\Python\PythonCore\*\InstallPath",
    "HKLM:\Software\WOW6432Node\Python\PythonCore\*\InstallPath"
  )) {
    Get-ItemProperty $RegistryRoot -ErrorAction SilentlyContinue |
      ForEach-Object {
        if ($_.ExecutablePath) {
          $Candidates.Add([string]$_.ExecutablePath)
        } elseif ($_."(default)") {
          $Candidates.Add((Join-Path ([string]$_."(default)") "python.exe"))
        }
      }
  }

  $Seen = @{}
  foreach ($Candidate in $Candidates) {
    if (-not $Candidate) {
      continue
    }
    $Key = $Candidate.ToLowerInvariant()
    if ($Seen.ContainsKey($Key)) {
      continue
    }
    $Seen[$Key] = $true
    $Candidate
  }
}

function Find-CompatiblePython {
  foreach ($Candidate in (Get-PythonCandidates)) {
    if (-not (Test-Path -LiteralPath $Candidate) -or $Candidate -match '(?i)\\Microsoft\\WindowsApps\\python(?:3)?\.exe$') {
      continue
    }
    # Windows PowerShell 5.1: Select-Object -First 1 stops the pipeline early and
    # terminates the native process, corrupting $LASTEXITCODE. Collect all output
    # first so the python probe can exit normally before selecting the line.
    $VersionOutput = (& $Candidate -c "import sys; print('.'.join(map(str, sys.version_info[:3]))); raise SystemExit(0 if sys.version_info >= (3, 9) else 1)" 2>$null)
    $VersionText = @($VersionOutput | Select-Object -First 1)[0]
    if ($LASTEXITCODE -ne 0 -or -not $VersionText) {
      continue
    }

    $DependencyProbe = Test-PythonDependencies $Candidate
    $HasPrintDependencies = $DependencyProbe.ok
    $OpenpyxlVersion = $DependencyProbe.openpyxlVersion

    # PS 5.1 + ErrorActionPreference=Stop: native stderr under redirection becomes
    # a terminating error (e.g. "No module named pip"), so degrade to a soft
    # pip-missing result instead of failing the whole update.
    $HasPip = $true
    try {
      & $Candidate -m pip --version *> $null
      if ($LASTEXITCODE -ne 0) { $HasPip = $false }
    } catch {
      $HasPip = $false
    }

    return [PSCustomObject]@{
      Path = (Resolve-Path -LiteralPath $Candidate).Path
      Version = [string]$VersionText
      HasPrintDependencies = $HasPrintDependencies
      OpenpyxlVersion = if ($HasPrintDependencies) { [string]$OpenpyxlVersion } else { $null }
      HasPip = $HasPip
    }
  }
  return $null
}

function Install-PrintDependencies([string]$Candidate) {
  if ($UpdateMode -and -not (Test-Path -LiteralPath $WheelDir)) {
    return $false
  }
  Test-PackagePrefix "runtime/python-wheels/"
  & $Candidate -m pip install `
    --disable-pip-version-check `
    --no-index `
    --find-links $WheelDir `
    --user `
    "openpyxl==3.1.5" `
    "et_xmlfile==2.0.0" `
    "python-docx==1.2.0" `
    "lxml==6.1.0" `
    "typing_extensions==4.16.0" `
    "requests" "urllib3" "certifi" "charset_normalizer" "idna" | Out-Host
  if ($LASTEXITCODE -ne 0) {
    return $false
  }
  return (Test-PythonDependencies $Candidate).ok
}

function Test-PythonDependencies([string]$Candidate) {
  # Never pass native stderr through a PowerShell 5.1 pipeline: missing modules
  # can become terminating NativeCommandError before the installer can repair.
  $Code = @'
import importlib,json,sys
missing=[]
modules=['requests','urllib3','certifi','charset_normalizer','idna','openpyxl','et_xmlfile','lxml','docx','typing_extensions']
for name in modules:
    try: importlib.import_module(name)
    except Exception: missing.append(name)
version=getattr(sys.modules.get('openpyxl'),'__version__','0')
if tuple(int(x) for x in version.split('.')[:3]) < (3,1,5): missing.append('openpyxl>=3.1.5')
print(json.dumps(dict(ok=not missing,missing=missing,openpyxlVersion=version)))
'@
  $Info = New-Object Diagnostics.ProcessStartInfo
  $Info.FileName = $Candidate
  $EncodedCode = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Code))
  $Info.Arguments = '-c "import base64;exec(base64.b64decode(''' + $EncodedCode + '''))"'
  $Info.UseShellExecute = $false
  $Info.CreateNoWindow = $true
  $Info.RedirectStandardOutput = $true
  $Info.RedirectStandardError = $true
  $Info.EnvironmentVariables["PYTHONUTF8"] = "1"
  $Info.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8"
  $Process = New-Object Diagnostics.Process
  $Process.StartInfo = $Info
  try {
    if (-not $Process.Start()) { throw "PYTHON_PROBE_START_FAILED" }
    $Stdout = $Process.StandardOutput.ReadToEndAsync()
    $Stderr = $Process.StandardError.ReadToEndAsync()
    if (-not $Process.WaitForExit(15000)) {
      & taskkill.exe /PID $Process.Id /T /F *> $null
      throw "PYTHON_PROBE_TIMEOUT"
    }
    if ($Process.ExitCode -ne 0) { throw "PYTHON_PROBE_FAILED" }
    return ($Stdout.Result | ConvertFrom-Json)
  } catch {
    return [PSCustomObject]@{ ok = $false; missing = @("PYTHON_PROBE_FAILED"); openpyxlVersion = "" }
  } finally { $Process.Dispose() }
}

function Resolve-NodeForInstall {
  if (Test-Path -LiteralPath $BundledNodeExe) {
    return (Resolve-Path -LiteralPath $BundledNodeExe).Path
  }
  if ($UpdateMode -and (Test-Path -LiteralPath $ExistingManagedNodeExe)) {
    return (Resolve-Path -LiteralPath $ExistingManagedNodeExe).Path
  }
  foreach ($CommandName in @("node.exe", "node")) {
    $Command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if ($Command -and $Command.Source) {
      return $Command.Source
    }
  }
  if ($UpdateMode) {
    throw "轻量更新包需要复用已安装的 Node.js；本机未找到可用 Node，请手动运行完整安装包。"
  }
  throw "安装包缺少 Node.js 运行时。"
}

function Find-Browser {
  foreach ($Candidate in @(
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
  )) {
    if ($Candidate -and (Test-Path -LiteralPath $Candidate)) {
      return $Candidate
    }
  }
  foreach ($CommandName in @("chrome.exe", "msedge.exe")) {
    $Command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if ($Command) {
      return $Command.Source
    }
  }
  return $null
}

try {
  if ($RootSetupError) { throw $RootSetupError }
  if (-not [Environment]::Is64BitOperatingSystem) {
    throw "此安装包只支持 64 位 Windows。"
  }

  Unblock-WorkbenchPath $RootDir

  $BrowserExe = Find-Browser
  if (-not $BrowserExe) {
    if ($AgentMode) {
      $Warnings.Add("未找到 Google Chrome 或 Microsoft Edge；安装继续，浏览器扩展加载属于后续人工步骤。")
      $ManualActions.Add("安装 Google Chrome 或 Microsoft Edge，并在扩展管理页加载已解压扩展。")
    } else {
      throw "未找到 Google Chrome 或 Microsoft Edge，请先安装其中一个浏览器。"
    }
  }

  Write-Step "1/7 校验核心文件"
  Test-PackageFile "VERSION.txt"
  $VersionText = Get-Content -LiteralPath (Join-Path $RootDir "VERSION.txt") -Raw -Encoding UTF8
  $IsLitePackage = $VersionText -match '(?m)^package_type=lite-update\r?$'
  if ($IsLitePackage) { $UpdateMode = $true }
  Test-PackageFile "extension/version.json"
  $PackageVersionConfig = Get-Content -LiteralPath (Join-Path $RootDir "extension\version.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  Test-RuntimeCompatibilityMetadata $VersionText $PackageVersionConfig
  Test-PackagePrefix "extension/"
  Test-PackagePrefix "native-helper/"
  Test-PackagePrefix "skills/"
  Test-PackagePrefix "plugins/tianyuan-browser-connector/"
  if (-not $UpdateMode -or (Test-Path -LiteralPath $BundledNodeExe)) {
    Test-PackagePrefix "runtime/node/"
  }
  Test-PackageFile "scripts/install-local-runtime.mjs"
  Test-PackageFile "scripts/runtime-fingerprint.mjs"
  Test-PackageFile "scripts/print-runtime-build-id.mjs"
  $PackageVersion = [string]$PackageVersionConfig.productVersion
  $PackageBuildNumber = [string]$PackageVersionConfig.buildNumber
  if ($IsLitePackage) {
    # Check the managed environment before pip, service stops, registry writes
    # or runtime replacement. PATH cannot disguise a fresh PC.
    foreach ($RequiredRuntime in @($ExistingManagedNodeExe, $BundledPythonExe, $NativeHostExe)) {
      if (-not (Test-Path -LiteralPath $RequiredRuntime -PathType Leaf)) {
        throw "LITE_REQUIRES_FULL_INSTALL: 缺少已安装的完整运行环境，请使用同版本 Windows 完整包。"
      }
    }
    $LiteProbe = Test-PythonDependencies $BundledPythonExe
    if (-not $LiteProbe.ok) { throw ("PYTHON_RUNTIME_DEPENDENCIES_INCOMPLETE: " + ($LiteProbe.missing -join ", ")) }
  } else {
    Test-PackageFile "native-helper/native_host.exe"
    Test-PackagePrefix "runtime/node/"
    Test-PackagePrefix "runtime/python-portable/"
    Test-PackagePrefix "runtime/python-wheels/"
    $BundleProbe = Test-PythonDependencies (Join-Path $PythonSource "python.exe")
    if (-not $BundleProbe.ok) { throw ("PYTHON_RUNTIME_DEPENDENCIES_INCOMPLETE: " + ($BundleProbe.missing -join ", ")) }
  }
  if ($PreflightOnly) {
    [ordered]@{ status = "validated"; installed = $false; version = $PackageVersion; buildNumber = $PackageBuildNumber; packageType = $(if ($IsLitePackage) { "lite-update" } else { "full-install" }); pythonDependencies = "ok" } |
      ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallRoot "预检结果.json") -Encoding UTF8
    Write-Host "安装预检通过；没有安装、停止服务或写入 Native Messaging 注册。"
    exit 0
  }
  Write-Host "核心文件校验通过。备用依赖将在实际使用前校验。"

  Write-Step "2/7 检查可选天源 CLI"
  $UsedBundledCli = $false
  $TycpvStatus = "可用"
  $TycpvRepairMessage = ""
  $TycpvInfo = Find-Tycpv
  if (-not $TycpvInfo) {
    $TycpvRepairMessage = "天源 CLI 未安装或无法运行。请从天源官方渠道单独安装或修复后重新检查；无需先做登录授权。CLI 只影响 CLI 相关导出。"
  } else {
    Write-Host "检测到可运行的天源 CLI；该可选组件由用户单独维护。"
  }
  if ($TycpvInfo) {
    $TycpvExe = [string]$TycpvInfo.Path
    $TycpvVersion = [string]$TycpvInfo.Version
    Write-Host "天源 CLI：$TycpvVersion（$($TycpvInfo.Probe) 探测）"
  } else {
    $TycpvExe = $null
    $TycpvVersion = "不可用"
    $TycpvStatus = "未安装/不可用（可选组件）"
    $Warnings.Add("天源 CLI 当前不可用；CLI 相关导出暂不可用，工作台其他核心组件继续安装。")
    Write-Warning $TycpvRepairMessage
  }

  Write-Step "3/7 检查已有 Python"
  $UsedBundledPython = $false
  $InstalledPrintDependencies = $false
  $PythonInfo = Find-CompatiblePython
  # Complete Windows installs must not depend on the extracted ZIP, a PATH
  # interpreter or a user-wide pip library disappearing later.
  if ($PythonInfo -and -not ([IO.Path]::GetFullPath($PythonInfo.Path).Equals([IO.Path]::GetFullPath($BundledPythonExe), [StringComparison]::OrdinalIgnoreCase))) {
    $PythonInfo = $null
  }
  if ($PythonInfo) {
    $PythonExe = $PythonInfo.Path
    Write-Host "检测到 Python $($PythonInfo.Version)：$PythonExe"
  } else {
    Write-Host "未检测到兼容的 Python 3.9+。"
  }

  Write-Step "4/7 准备打印格式依赖"
  if ($PythonInfo -and $PythonInfo.HasPrintDependencies) {
    Write-Host "检测到 openpyxl $($PythonInfo.OpenpyxlVersion)，跳过 Python 和依赖安装。"
  } elseif ($PythonInfo -and $PythonInfo.HasPip) {
    Write-Host "已有 Python 缺少兼容的 openpyxl，尝试从包内 wheel 快速补齐。"
    if (Install-PrintDependencies $PythonExe) {
      $InstalledPrintDependencies = $true
      Write-Host "打印格式依赖已补齐。"
    } else {
      Write-Warning "已有 Python 无法安装离线依赖，将回退到工作台便携 Python。"
      $PythonExe = $null
    }
  } else {
    if ($PythonInfo) {
      Write-Host "已有 Python 不含 pip，将回退到工作台便携 Python。"
    }
    $PythonExe = $null
  }

  if (-not $PythonExe) {
    if ($UpdateMode -and -not (Test-Path -LiteralPath $PythonSource)) {
      throw "轻量更新包需要复用已安装的 Python/openpyxl；本机缺少可用环境，请手动运行完整安装包。"
    }
    Test-PackagePrefix "runtime/python-portable/"
    if (-not (Test-Path -LiteralPath $PythonSource)) {
      throw "缺少工作台便携 Python。"
    }
    Copy-DirectoryContents $PythonSource $PythonDir
    $PythonExe = $BundledPythonExe
    $UsedBundledPython = $true
    Write-Host "已启用工作台便携 Python。"
  }

  $FinalDependencyProbe = Test-PythonDependencies $PythonExe
  if (-not $FinalDependencyProbe.ok) { throw ("PYTHON_RUNTIME_DEPENDENCIES_INCOMPLETE: " + ($FinalDependencyProbe.missing -join ", ")) }

  Write-UpdateStatus "stopping_services" 76 "正在停止工作台服务"
  Stop-ExistingConnector
  Wait-WorkbenchFileRelease
  Write-Step "5/7 同步扩展、Native Helper、Bridge 和 Connector"
  Write-UpdateStatus "installing" 82 "正在同步全部工作台组件"
  $NodeForInstall = Resolve-NodeForInstall
  $env:TIANYUAN_PYTHON_BIN = $PythonExe
  $env:TIANYUAN_BUNDLED_NODE_SOURCE = $NodeForInstall
  $env:TIANYUAN_NODE_BIN = $NodeForInstall
  if ($TycpvExe) {
    $env:TYCPV_BIN = $TycpvExe
  } else {
    Remove-Item Env:TYCPV_BIN -ErrorAction SilentlyContinue
  }
  $env:TIANYUAN_UPDATE_DEFER_COMPLETE = "1"
  $env:TIANYUAN_INSTALL_ROOT = $InstallRoot
  $env:TIANYUAN_RUNTIME_LAYOUT = $RuntimeLayout
  $env:TIANYUAN_PROJECT_RUNTIME_ROOT = $(if ($IsVisibleLayout) { $InstallRoot } else { Join-Path $InstallRoot "projects\天源评估系统" })
  $env:TIANYUAN_NATIVE_RUNTIME_ROOT = $NativeHelperDir
  $env:TIANYUAN_PRINT_SKILLS_ROOT = $PrintSkillsDir
  $InstallJson = (& $NodeForInstall (Join-Path $RootDir "scripts\install-local-runtime.mjs") 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    try {
      $InstallFailure = $InstallJson | ConvertFrom-Json
      $InstallFailureReason = [string]$InstallFailure.reason
    }
    catch {
      $InstallFailureReason = $InstallJson
    }
    throw "本机运行组件同步失败：$InstallFailureReason"
  }
  $InstallResult = $InstallJson | ConvertFrom-Json
  if (-not $InstallResult.ok) {
    throw "本机运行组件同步未通过：$InstallJson"
  }
  if (-not $InstallResult.runtimeCompatibility.runtimeBuildId) {
    throw "RUNTIME_BUILD_ID_MISSING"
  }
  if ([string]$InstallResult.runtimeCompatibility.extensionVersion -ne [string]$PackageVersionConfig.chromeVersion) {
    throw "RUNTIME_EXTENSION_VERSION_MISMATCH"
  }
  Unblock-WorkbenchPath $NativeHelperDir

  Write-Step "6/7 检查 Native Messaging 和 Agent 插件"
  $ExtensionDir = [string]$InstallResult.extensionPath
  $ManifestPath = [string]$InstallResult.nativeManifest
  $NativeHostLauncher = Join-Path $NativeHelperDir "native_host_launcher.cmd"
  $ManagedNodeExe = [string]$InstallResult.nodeRuntimePath
  if (-not (Test-Path -LiteralPath $ExtensionDir)) {
    throw "浏览器扩展运行目录没有安装成功。"
  }
  if (-not (Test-Path -LiteralPath $NativeHostLauncher)) {
    throw "Native Host 启动器没有安装成功。"
  }
  if (-not (Test-Path -LiteralPath $InstallResult.connectorPath)) {
    throw "Connector 插件没有安装成功。"
  }
  if (-not (Test-Path -LiteralPath $InstallResult.codexConnectorCachePath)) {
    throw "Codex Connector 缓存没有安装成功。"
  }
  $InstalledVersionConfig = Get-Content -LiteralPath (Join-Path $ExtensionDir "version.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  if (
    [string]$InstalledVersionConfig.productVersion -ne [string]$PackageVersionConfig.productVersion -or
    [string]$InstalledVersionConfig.buildNumber -ne [string]$PackageVersionConfig.buildNumber
  ) {
    throw "INSTALLED_VERSION_METADATA_MISMATCH"
  }
  try {
    $VisibleSupportRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) "天源工作台"
    New-Item -ItemType Directory -Path $VisibleSupportRoot -Force | Out-Null
    $VisibleExtensionPathNote = Join-Path $VisibleSupportRoot "浏览器扩展路径.txt"
    [IO.File]::WriteAllText(
      $VisibleExtensionPathNote,
      ($ExtensionDir + [Environment]::NewLine),
      [Text.UTF8Encoding]::new($false)
    )
    $VisibleExtensionShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) "天源工作台-浏览器扩展.lnk"
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = $Shell.CreateShortcut($VisibleExtensionShortcut)
    $Shortcut.TargetPath = $ExtensionDir
    $Shortcut.Save()
  }
  catch {
    $Warnings.Add("未能创建浏览器扩展可见入口：$(Protect-Message $_.Exception.Message)")
  }

  Write-Step "7/7 执行环境检查"
  $ExtensionContract = $InstallResult.runtimeCompatibility
  $OpenpyxlVersion = (& $PythonExe -c "import openpyxl; print(openpyxl.__version__)").Trim()
  $PythonDependencyStatus = (Test-PythonDependencies $PythonExe).ok
  if (-not $PythonDependencyStatus) {
    throw "PYTHON_RUNTIME_DEPENDENCIES_INCOMPLETE"
  }
  $SelfTestJson = $InstallResult.selfTest | ConvertTo-Json -Depth 8 -Compress
  $ConnectorJson = $InstallResult.connector | ConvertTo-Json -Depth 8 -Compress

  $InstallMode = if ($UsedBundledPython) {
    "完整安装（使用包内 Python 运行时）"
  } elseif ($InstalledPrintDependencies) {
    "快速安装（复用已有 Python，补充打印依赖）"
  } else {
    "快速安装（复用已有 Python 和打印依赖）"
  }
  $ElapsedSeconds = [Math]::Round(((Get-Date) - $StartedAt).TotalSeconds, 1)
  $ReportPath = Join-Path $InstallRoot "安装检查结果.txt"
  $JsonReportPath = Join-Path $InstallRoot "安装检查结果.json"
  $ChromeNativeMessagingOk = [bool]((Get-ItemProperty -Path $ChromeRegistryPath -Name "(default)" -ErrorAction SilentlyContinue).'(default)' -eq $ManifestPath)
  $EdgeNativeMessagingOk = [bool]((Get-ItemProperty -Path $EdgeRegistryPath -Name "(default)" -ErrorAction SilentlyContinue).'(default)' -eq $ManifestPath)
  if ($BrowserExe) {
    $ManualActions.Add("通过桌面「天源工作台-浏览器扩展」入口，在 Chrome 或 Edge 扩展管理页加载：$ExtensionDir")
  }
  $ManualActions.Add("由用户本人在工作台面板输入 MCP token（不发送给 Agent）")
  if ($TycpvExe) {
    $ManualActions.Add("由用户本人完成天源 CLI 授权（如面板显示需要授权）")
  } else {
    $ManualActions.Add("CLI 为可选组件；如需 CLI 相关导出，请从天源官方渠道单独安装或修复 CLI，再重新检查")
  }
  $ConnectorHealth = if ($InstallResult.connector.connector) { $InstallResult.connector.connector } else { [ordered]@{} }
  $ConnectorOk = [bool]($InstallResult.connector.ok -and $ConnectorHealth.ok)
  $InstallModeCode = if ($UpdateMode) { "upgrade" } elseif ($UsedBundledPython) { "full" } else { "quick" }
  $AllComponentsReady = [bool]($ConnectorOk -and
    $ChromeNativeMessagingOk -and
    $EdgeNativeMessagingOk -and
    (Test-Path -LiteralPath $ExtensionDir -PathType Container) -and
    (Test-Path -LiteralPath $NativeHostExe -PathType Leaf) -and
    (Test-Path -LiteralPath $ManagedNodeExe -PathType Leaf) -and
    (Test-Path -LiteralPath $InstallResult.codexConnectorCachePath -PathType Container) -and
    ($InstallResult.selfTest.ok -eq $true) -and
    $FinalDependencyProbe.ok)
  if (-not $AllComponentsReady) {
    throw "REQUIRED_COMPONENT_VALIDATION_FAILED: 核心扩展、Native Host、Node、Python、Connector、浏览器注册或 Codex 插件缓存核验未通过。"
  }
  $JsonReport = [ordered]@{
    product = "天源浏览器工作台"
    status = "success"
    allComponentsReady = $AllComponentsReady
    readinessScope = "required-components-only"
    installation = [ordered]@{ status = "success"; mode = $InstallModeCode }
    version = $PackageVersion
    buildNumber = $PackageBuildNumber
    platform = "Windows-x64"
    packageSha256 = if ($env:TIANYUAN_PACKAGE_SHA256) { [string]$env:TIANYUAN_PACKAGE_SHA256 } else { "not-provided-after-extraction" }
    installMode = $InstallModeCode
    elapsedSeconds = $ElapsedSeconds
    paths = [ordered]@{
      installRoot = $InstallRoot
      extension = $ExtensionDir
      nativeHelper = $NativeHelperDir
      connector = [string]$InstallResult.connectorPath
      codexConnectorCache = [string]$InstallResult.codexConnectorCachePath
      python = [string]$PythonExe
      node = [string]$ManagedNodeExe
      cli = [string]$TycpvExe
      extensionShortcut = $VisibleExtensionShortcut
      extensionPathNote = $VisibleExtensionPathNote
    }
    components = [ordered]@{
      extension = if (Test-Path -LiteralPath $ExtensionDir) { "ok" } else { "failed" }
      nativeHelper = if (Test-Path -LiteralPath $NativeHostExe) { "ok" } else { "failed" }
      nativeMessagingChrome = if ($ChromeNativeMessagingOk) { "ok" } else { "failed" }
      nativeMessagingEdge = if ($EdgeNativeMessagingOk) { "ok" } else { "failed" }
      connector = if ($ConnectorOk) { "ok" } else { "failed" }
      python = "ok"
      openpyxl = "ok"
      pythonDependencies = "ok"
      node = if (Test-Path -LiteralPath $ManagedNodeExe) { "ok" } else { "failed" }
      codexPluginCache = if (Test-Path -LiteralPath $InstallResult.codexConnectorCachePath) { "ok" } else { "failed" }
      cli = if ($TycpvExe) { "ok" } else { "unavailable" }
    }
    optionalDependencies = [ordered]@{
      cli = [ordered]@{ required = $false; status = if ($TycpvExe) { "available" } else { "unavailable" }; path = $TycpvExe; message = $TycpvRepairMessage }
    }
    connectorHealth = [ordered]@{
      ok = $ConnectorOk
      protocolVersion = [string]$ConnectorHealth.protocolVersion
      runtimeBuildId = [string]$ExtensionContract.runtimeBuildId
      sessionCount = if ($null -ne $ConnectorHealth.sessionCount) { $ConnectorHealth.sessionCount } else { 0 }
      bindingCount = if ($null -ne $ConnectorHealth.bindingCount) { $ConnectorHealth.bindingCount } else { 0 }
    }
    warnings = @($Warnings)
    manualActions = @($ManualActions)
    security = [ordered]@{ credentialsReturned = $false; tokenUsed = $false; secretsWritten = $false }
  }
  @(
    "天源浏览器工作台 Windows x64"
    "安装时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    "安装模式：$InstallMode"
    "安装耗时：$ElapsedSeconds 秒"
    "产品版本：$PackageVersion"
    "构建编号：$PackageBuildNumber"
    "运行指纹：$($ExtensionContract.runtimeBuildId)"
    "扩展目录：$ExtensionDir"
    "扩展桌面入口：$VisibleExtensionShortcut"
    "扩展路径说明：$VisibleExtensionPathNote"
    "扩展 ID：$ExtensionId"
    "Native Host：$NativeHostLauncher"
    "Node 运行时：$ManagedNodeExe"
    "Chrome Native Host 注册：$ChromeRegistryPath -> $ManifestPath"
    "Edge Native Host 注册：$EdgeRegistryPath -> $ManifestPath"
    "运行配置：$RuntimeConfigPath"
    "Python：$PythonExe"
    "openpyxl：$OpenpyxlVersion"
    "天源 CLI：$TycpvExe"
    "天源 CLI 版本：$TycpvVersion"
    "天源 CLI 状态：$TycpvStatus"
    "天源 CLI 修复提示：$TycpvRepairMessage"
    "自检：$SelfTestJson"
    "Connector：$ConnectorJson"
    "Connector 插件：$($InstallResult.connectorPath)"
    "Codex Connector 缓存：$($InstallResult.codexConnectorCachePath)"
    "安全：安装程序未写入 MCP token、Cookie、Authorization、密码或验证码。"
  ) | Set-Content -LiteralPath $ReportPath -Encoding UTF8
  [IO.File]::WriteAllText($JsonReportPath, ($JsonReport | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))

  if ($ExtensionBackupPath) {
    Remove-Item -LiteralPath $ExtensionBackupPath -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($NativeHelperBackupPath) {
    Remove-Item -LiteralPath $NativeHelperBackupPath -Recurse -Force -ErrorAction SilentlyContinue
  }

  Write-Host ""
  if ($AllComponentsReady) { Write-Host "工作台核心组件安装完成。" -ForegroundColor Green }
  else { Write-Warning "核心组件已安装，但存在未通过项目；请查看报告，不能视为完整安装通过。" }
  if (-not $TycpvExe) { Write-Warning $TycpvRepairMessage }
  Write-Host "安装模式：$InstallMode"
  Write-Host "耗时：$ElapsedSeconds 秒"
  Write-Host "扩展管理页应加载以下固定本机目录："
  Write-Host $ExtensionDir -ForegroundColor Yellow
  Write-Host ""
  Write-Host "安装检查结果：$ReportPath"
  Write-Host "机器可读安装结果：$JsonReportPath"

  Write-UpdateStatus "complete" 100 "工作台核心组件更新完成，浏览器扩展可重新加载"
  if (-not $AgentMode) {
    Set-Clipboard -Value $ExtensionDir
    Start-Process explorer.exe -ArgumentList ('"' + $ExtensionDir + '"')
    Write-Host "扩展目录已复制到剪贴板；桌面入口：$VisibleExtensionShortcut"
  }
  if (-not $UpdateMode -and -not $AgentMode -and $BrowserExe) {
    Start-Process "explorer.exe" -ArgumentList "`"$ExtensionDir`""
    $ExtensionPage = if ($BrowserExe -match '(?i)msedge\.exe$') { "edge://extensions/" } else { "chrome://extensions/" }
    Start-Process $BrowserExe -ArgumentList $ExtensionPage
  }
  exit 0
}
catch {
  $OriginalError = $_
  Write-UpdateStatus "failed" 0 "完整更新失败" $OriginalError.Exception.Message
  if ($NativeHelperBackupPath -or $ExtensionBackupPath) {
    try { Stop-ExistingConnector } catch {}
    Restore-PreviousDirectory $NativeHelperDir $NativeHelperBackupPath
    Restore-PreviousDirectory $ExtensionDir $ExtensionBackupPath
    if (Test-Path -LiteralPath $NativeHostExe) {
      try { & $NativeHostExe --start-connector *> $null } catch {}
    }
  }
  $ReportPath = ""
  $JsonReportPath = ""
  try {
    if (-not $InstallRoot) { throw "INSTALL_ROOT_UNKNOWN" }
    New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
    if (-not (Test-Path -LiteralPath $InstallRoot -PathType Container)) { throw "REPORT_DIRECTORY_UNAVAILABLE" }
    $ReportPath = Join-Path $InstallRoot "安装检查结果.txt"
    $JsonReportPath = Join-Path $InstallRoot "安装检查结果.json"
    $ReportProbe = Join-Path $InstallRoot (".tianyuan-report-probe-" + [Guid]::NewGuid().ToString("N"))
    [IO.File]::WriteAllText($ReportProbe, "", [Text.UTF8Encoding]::new($false))
    Remove-Item -LiteralPath $ReportProbe
  }
  catch {
    # If the selected root is unavailable, only the failure report goes to a
    # fresh temporary directory. Never silently install over the default root.
    $FailureReportRoot = Join-Path ([IO.Path]::GetTempPath()) ("TW-install-failure-" + [Guid]::NewGuid().ToString("N").Substring(0,8))
    New-Item -ItemType Directory -Path $FailureReportRoot | Out-Null
    $ReportPath = Join-Path $FailureReportRoot "安装检查结果.txt"
    $JsonReportPath = Join-Path $FailureReportRoot "安装检查结果.json"
  }
  $ExtensionExists = $false
  $NativeHostExists = $false
  $RuntimeConfigExists = $false
  $ManifestExists = $false
  if ($ExtensionDir) { $ExtensionExists = Test-Path -LiteralPath $ExtensionDir }
  if ($NativeHostExe) { $NativeHostExists = Test-Path -LiteralPath $NativeHostExe }
  if ($RuntimeConfigPath) { $RuntimeConfigExists = Test-Path -LiteralPath $RuntimeConfigPath }
  if ($ManifestPath) { $ManifestExists = Test-Path -LiteralPath $ManifestPath }
  @(
    "天源浏览器工作台 Windows x64"
    "安装状态：失败"
    "失败时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    "失败阶段：$CurrentStep"
    "错误：$(Protect-Message $OriginalError.Exception.Message)"
    "包内产品版本：$PackageVersion"
    "包内构建编号：$PackageBuildNumber"
    "扩展目录存在：$ExtensionExists"
    "Native Host 存在：$NativeHostExists"
    "运行配置存在：$RuntimeConfigExists"
    "Native Messaging 清单存在：$ManifestExists"
    "安全：安装失败报告不记录 MCP token、Cookie、Authorization、密码或验证码。"
  ) | Set-Content -LiteralPath $ReportPath -Encoding UTF8
  $FailureExitCode = if ($CurrentStep -like "1/7*") { 20 } elseif ($CurrentStep -like "2/7*" -or $CurrentStep -like "3/7*") { 10 } elseif ($CurrentStep -like "5/7*") { 30 } elseif ($CurrentStep -like "6/7*" -or $CurrentStep -like "7/7*") { 40 } else { 50 }
  [ordered]@{
    product = "天源浏览器工作台"
    version = $PackageVersion
    buildNumber = $PackageBuildNumber
    platform = "Windows-x64"
    installMode = if ($UpdateMode) { "upgrade" } else { "unknown" }
    status = "failed"
    allComponentsReady = $false
    readinessScope = "required-components-only"
    failedStep = $CurrentStep
    error = (Protect-Message $OriginalError.Exception.Message)
    paths = [ordered]@{ installRoot = $InstallRoot; extension = $ExtensionDir; nativeHelper = $NativeHelperDir }
    optionalDependencies = [ordered]@{
      cli = [ordered]@{
        required = $false
        status = if ($TycpvExe) { "available" } elseif ($TycpvRepairMessage) { "unavailable" } else { "not_checked" }
        path = $TycpvExe
        message = $TycpvRepairMessage
      }
    }
    warnings = @($Warnings)
    manualActions = @($ManualActions)
    security = [ordered]@{ credentialsReturned = $false; tokenUsed = $false; secretsWritten = $false }
  } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $JsonReportPath -Encoding UTF8
  Write-Host ""
  Write-Host "安装失败：$(Protect-Message $OriginalError.Exception.Message)" -ForegroundColor Red
  Write-Host "安装检查结果：$ReportPath"
  Write-Host "机器可读安装结果：$JsonReportPath"
  exit $FailureExitCode
}
