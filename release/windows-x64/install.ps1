$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallRoot = Join-Path $env:LOCALAPPDATA "TianyuanWorkbench"
$ExtensionDir = Join-Path $InstallRoot "projects\天源评估系统\extension"
$NativeHelperDir = Join-Path $InstallRoot "native-helper"
$NativeHostExe = Join-Path $NativeHelperDir "native_host.exe"
$PythonDir = Join-Path $InstallRoot "python"
$BundledPythonExe = Join-Path $PythonDir "python.exe"
$BundledNodeExe = Join-Path $RootDir "runtime\node\node.exe"
$ExistingManagedNodeExe = Join-Path $NativeHelperDir "node\node.exe"
$PythonExe = $null
$PrintSkillsDir = Join-Path $InstallRoot "print-format-skills"
$ManifestPath = Join-Path $NativeHelperDir "com.tianyuan.workbench.helper.json"
$RuntimeConfigPath = Join-Path $NativeHelperDir "runtime-config.json"
$ChromeRegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.tianyuan.workbench.helper"
$EdgeRegistryPath = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.tianyuan.workbench.helper"
$TycpvInstaller = Join-Path $RootDir "runtime\tycpv-setup-0.1.0-win-x64.exe"
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
$UpdateMode = $env:TIANYUAN_UPDATE_MODE -eq "1"
$UpdateStatusPath = [string]$env:TIANYUAN_UPDATE_STATUS_PATH

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
    updatedAt = [DateTime]::UtcNow.ToString("o")
    security = @{ credentialsReturned = $false; tokenUsed = $false }
  }
  if ($Reason) {
    $Payload.reason = Protect-Message $Reason
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
    -replace '(?i)(bearer\s+)[^\s"'']+', '$1[REDACTED]' `
    -replace '(?i)zhmcp_[A-Za-z0-9._-]+', '[REDACTED]' `
    -replace '(?i)(token\s*[=:]\s*)[^\s"'']+', '$1[REDACTED]'
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
  try {
    $Health = Invoke-RestMethod -Uri "http://127.0.0.1:40415/health" -TimeoutSec 2
  }
  catch {
    return
  }
  if (-not $Health.ok) {
    return
  }
  if ($Health.service -ne "tianyuan-connector-bridge") {
    throw "端口 40415 被其他程序占用，不能安全升级 Connector。"
  }
  if ($Health.pid) {
    Stop-Process -Id ([int]$Health.pid) -Force -ErrorAction SilentlyContinue
  } else {
    $ListenerLine = netstat.exe -ano -p tcp |
      Select-String -Pattern "127\.0\.0\.1:40415\s+\S+\s+LISTENING\s+(\d+)" |
      Select-Object -First 1
    if ($ListenerLine -and $ListenerLine.Matches[0].Groups[1].Value) {
      Stop-Process -Id ([int]$ListenerLine.Matches[0].Groups[1].Value) -Force -ErrorAction SilentlyContinue
    }
  }
  for ($Attempt = 0; $Attempt -lt 30; $Attempt += 1) {
    Start-Sleep -Milliseconds 100
    try {
      $StillRunning = Invoke-RestMethod -Uri "http://127.0.0.1:40415/health" -TimeoutSec 1
      if (-not $StillRunning.ok) {
        return
      }
    }
    catch {
      return
    }
  }
  throw "旧 Connector 未能在升级前停止。"
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
  $Actual = (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Actual -ne $Index[$Normalized]) {
    throw "文件校验失败：$Normalized"
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
    Test-PackageFile $RelativePath
  }
}

function Refresh-ProcessPath {
  $MachinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$MachinePath;$UserPath"
}

function Add-TycpvPathCandidates($Candidates, [string]$Directory) {
  if (-not $Directory) {
    return
  }
  $Candidates.Add((Join-Path $Directory "tycpv.exe"))
  $Candidates.Add((Join-Path $Directory "bin\tycpv.exe"))
  $Candidates.Add((Join-Path $Directory "tycpv.cmd"))
  $Candidates.Add((Join-Path $Directory "bin\tycpv.cmd"))
}

function Test-TycpvExecutableCandidate([string]$Candidate) {
  if (-not $Candidate) {
    return $false
  }
  if (-not (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
    return $false
  }
  return $Candidate -match "\.(exe|cmd)$"
}

function Get-TycpvVersionInfo([string]$Candidate) {
  if (-not (Test-TycpvExecutableCandidate $Candidate)) {
    return $null
  }
  try {
    $ResolvedPath = (Resolve-Path -LiteralPath $Candidate).Path
    if ($ResolvedPath -match "\.cmd$") {
      $CommandLine = '""{0}" --version"' -f $ResolvedPath
      $OutputLines = @(& $env:ComSpec /d /s /c $CommandLine 2>&1)
    } else {
      $OutputLines = @(& $ResolvedPath --version 2>&1)
    }
    $ExitCode = $LASTEXITCODE
    $VersionLine = $OutputLines |
      ForEach-Object { [string]$_ } |
      Where-Object { $_.Trim() } |
      Select-Object -First 1
    if ($ExitCode -ne 0 -or -not $VersionLine) {
      return $null
    }
    return [PSCustomObject]@{
      Path = $ResolvedPath
      Version = (Protect-Message $VersionLine.Trim())
    }
  }
  catch {
    return $null
  }
}

function Find-Tycpv {
  Refresh-ProcessPath
  $Candidates = New-Object System.Collections.Generic.List[string]
  $Command = Get-Command "tycpv.exe" -ErrorAction SilentlyContinue
  if ($Command -and (Test-TycpvExecutableCandidate $Command.Source)) {
    $Candidates.Add($Command.Source)
  }
  $Command = Get-Command "tycpv.cmd" -ErrorAction SilentlyContinue
  if ($Command -and (Test-TycpvExecutableCandidate $Command.Source)) {
    $Candidates.Add($Command.Source)
  }

  Add-TycpvPathCandidates $Candidates (Join-Path $env:LOCALAPPDATA "Programs\tycpv")
  Add-TycpvPathCandidates $Candidates (Join-Path $env:LOCALAPPDATA "tycpv")
  Add-TycpvPathCandidates $Candidates (Join-Path $env:USERPROFILE ".tycpv")
  if ($env:ProgramFiles) { Add-TycpvPathCandidates $Candidates (Join-Path $env:ProgramFiles "tycpv") }
  if (${env:ProgramFiles(x86)}) { Add-TycpvPathCandidates $Candidates (Join-Path ${env:ProgramFiles(x86)} "tycpv") }

  foreach ($RegistryRoot in @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )) {
    Get-ItemProperty $RegistryRoot -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -match "tycpv" } |
      ForEach-Object {
        if ($_.InstallLocation) { Add-TycpvPathCandidates $Candidates $_.InstallLocation }
        if ($_.DisplayIcon) {
          $IconPath = ([string]$_.DisplayIcon).Split(",")[0].Trim('"')
          if ($IconPath -match "\.(exe|cmd)$") {
            $Candidates.Add($IconPath)
          }
        }
      }
  }

  foreach ($SearchRoot in @(
    (Join-Path $env:LOCALAPPDATA "Programs"),
    $env:ProgramFiles,
    ${env:ProgramFiles(x86)}
  )) {
    if (-not $SearchRoot -or -not (Test-Path -LiteralPath $SearchRoot)) {
      continue
    }
    Get-ChildItem -LiteralPath $SearchRoot -Include "tycpv.exe", "tycpv.cmd" -File -Recurse -ErrorAction SilentlyContinue |
      ForEach-Object { $Candidates.Add($_.FullName) }
  }

  $Seen = @{}
  foreach ($Candidate in $Candidates) {
    if (-not (Test-TycpvExecutableCandidate $Candidate)) {
      continue
    }
    $ResolvedPath = (Resolve-Path -LiteralPath $Candidate).Path
    $CandidateKey = $ResolvedPath.ToLowerInvariant()
    if ($Seen.ContainsKey($CandidateKey)) {
      continue
    }
    $Seen[$CandidateKey] = $true
    $VersionInfo = Get-TycpvVersionInfo $ResolvedPath
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
    if (-not (Test-Path -LiteralPath $Candidate)) {
      continue
    }
    $VersionText = (& $Candidate -c "import sys; print('.'.join(map(str, sys.version_info[:3]))); raise SystemExit(0 if sys.version_info >= (3, 9) else 1)" 2>$null |
      Select-Object -First 1)
    if ($LASTEXITCODE -ne 0 -or -not $VersionText) {
      continue
    }

    $OpenpyxlVersion = (& $Candidate -c "import openpyxl, et_xmlfile; v=tuple(int(x) for x in openpyxl.__version__.split('.')[:3]); print(openpyxl.__version__); raise SystemExit(0 if v >= (3, 1, 5) else 1)" 2>$null |
      Select-Object -First 1)
    $HasPrintDependencies = $LASTEXITCODE -eq 0

    & $Candidate -m pip --version *> $null
    $HasPip = $LASTEXITCODE -eq 0

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
    "et_xmlfile==2.0.0" | Out-Host
  if ($LASTEXITCODE -ne 0) {
    return $false
  }
  & $Candidate -c "import openpyxl, et_xmlfile; raise SystemExit(0 if tuple(int(x) for x in openpyxl.__version__.split('.')[:3]) >= (3, 1, 5) else 1)" *> $null
  return $LASTEXITCODE -eq 0
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
  if (-not [Environment]::Is64BitOperatingSystem) {
    throw "此安装包只支持 64 位 Windows。"
  }

  $BrowserExe = Find-Browser
  if (-not $BrowserExe) {
    throw "未找到 Google Chrome 或 Microsoft Edge，请先安装其中一个浏览器。"
  }

  Write-Step "1/7 校验核心文件"
  Test-PackageFile "VERSION.txt"
  Test-PackagePrefix "extension/"
  Test-PackagePrefix "native-helper/"
  Test-PackagePrefix "skills/"
  Test-PackagePrefix "plugins/tianyuan-browser-connector/"
  if (-not $UpdateMode -or (Test-Path -LiteralPath $BundledNodeExe)) {
    Test-PackagePrefix "runtime/node/"
  }
  Test-PackageFile "scripts/install-local-runtime.mjs"
  $PackageVersionConfig = Get-Content -LiteralPath (Join-Path $RootDir "extension\version.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  $PackageVersion = [string]$PackageVersionConfig.productVersion
  $PackageBuildNumber = [string]$PackageVersionConfig.buildNumber
  Write-Host "核心文件校验通过。备用依赖将在实际使用前校验。"

  Write-Step "2/7 安装或检查天源 CLI"
  $UsedBundledCli = $false
  $TycpvStatus = "可用"
  $TycpvRepairMessage = ""
  $TycpvInfo = Find-Tycpv
  if (-not $TycpvInfo) {
    Write-Warning "未检测到可运行的天源 CLI，尝试使用包内安装程序修复；CLI 修复失败不会阻断工作台其他组件更新。"
    try {
      Test-PackageFile "runtime/tycpv-setup-0.1.0-win-x64.exe"
      if (-not (Test-Path -LiteralPath $TycpvInstaller)) {
        throw "缺少 Windows 版天源 CLI 安装程序。"
      }
      $Process = Start-Process -FilePath $TycpvInstaller -ArgumentList @(
        "/VERYSILENT",
        "/SUPPRESSMSGBOXES",
        "/NORESTART",
        "/SP-"
      ) -Wait -PassThru
      if ($Process.ExitCode -notin @(0, 3010)) {
        throw "天源 CLI 安装失败，退出码：$($Process.ExitCode)"
      }
      $UsedBundledCli = $true
      $TycpvInfo = Find-Tycpv
      if (-not $TycpvInfo) {
        throw "安装程序执行后仍未找到可运行的 tycpv.exe 或 tycpv.cmd。"
      }
    }
    catch {
      $TycpvRepairMessage = Protect-Message $_.Exception.Message
    }
  } else {
    Write-Host "检测到可运行的天源 CLI，跳过安装。"
  }
  if ($TycpvInfo) {
    $TycpvExe = [string]$TycpvInfo.Path
    $TycpvVersion = [string]$TycpvInfo.Version
    Write-Host "天源 CLI：$TycpvVersion"
  } else {
    $TycpvExe = $null
    $TycpvVersion = "不可用"
    $TycpvStatus = "待修复（未阻断工作台组件安装）"
    Write-Warning "天源 CLI 当前不可用：$TycpvRepairMessage"
    Write-Warning "将继续更新浏览器扩展、Native Helper、Connector 和打印组件；仅 CLI 导出功能暂不可用。"
  }

  Write-Step "3/7 检查已有 Python"
  $UsedBundledPython = $false
  $InstalledPrintDependencies = $false
  $PythonInfo = Find-CompatiblePython
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

  & $PythonExe -c "import sys, openpyxl, et_xmlfile; print('Python', sys.version.split()[0], '| openpyxl', openpyxl.__version__)"
  if ($LASTEXITCODE -ne 0) {
    throw "最终 Python 环境或 openpyxl 无法运行。"
  }

  Write-Step "5/7 同步扩展、Native Helper、Bridge 和 Connector"
  Write-UpdateStatus "installing" 88 "正在同步全部工作台组件"
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

  Write-Step "7/7 执行环境检查"
  $ExtensionContract = $InstallResult.runtimeCompatibility
  $OpenpyxlVersion = (& $PythonExe -c "import openpyxl; print(openpyxl.__version__)").Trim()
  $SelfTestJson = $InstallResult.selfTest | ConvertTo-Json -Depth 8 -Compress
  $ConnectorJson = $InstallResult.connector | ConvertTo-Json -Depth 8 -Compress

  $InstallMode = if (-not $TycpvExe) {
    "工作台组件安装完成（天源 CLI 待修复）"
  } elseif (-not $UsedBundledCli -and -not $UsedBundledPython -and -not $InstalledPrintDependencies) {
    "快速安装（复用已有 CLI、Python 和打印依赖）"
  } elseif (-not $UsedBundledCli -and -not $UsedBundledPython) {
    "快速安装（复用已有 CLI 和 Python，补充打印依赖）"
  } else {
    "完整安装（使用包内缺失依赖）"
  }
  $ElapsedSeconds = [Math]::Round(((Get-Date) - $StartedAt).TotalSeconds, 1)
  $ReportPath = Join-Path $InstallRoot "安装检查结果.txt"
  @(
    "天源浏览器工作台 Windows x64"
    "安装时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    "安装模式：$InstallMode"
    "安装耗时：$ElapsedSeconds 秒"
    "产品版本：$PackageVersion"
    "构建编号：$PackageBuildNumber"
    "运行指纹：$($ExtensionContract.runtimeBuildId)"
    "扩展目录：$ExtensionDir"
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

  if ($ExtensionBackupPath) {
    Remove-Item -LiteralPath $ExtensionBackupPath -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($NativeHelperBackupPath) {
    Remove-Item -LiteralPath $NativeHelperBackupPath -Recurse -Force -ErrorAction SilentlyContinue
  }

  Write-Host ""
  Write-Host "安装完成。" -ForegroundColor Green
  Write-Host "安装模式：$InstallMode"
  Write-Host "耗时：$ElapsedSeconds 秒"
  Write-Host "扩展管理页应加载以下固定本机目录："
  Write-Host $ExtensionDir -ForegroundColor Yellow
  Write-Host ""
  Write-Host "安装检查结果：$ReportPath"

  if ($TycpvExe) {
    Write-UpdateStatus "complete" 100 "全部组件更新完成，浏览器扩展可重新加载"
  } else {
    Write-Warning "工作台组件更新完成，但天源 CLI 仍需单独修复。"
    Write-UpdateStatus "complete" 100 "工作台组件更新完成，天源 CLI 待修复"
  }
  if (-not $UpdateMode) {
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
  $ReportPath = Join-Path $InstallRoot "安装检查结果.txt"
  New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
  @(
    "天源浏览器工作台 Windows x64"
    "安装状态：失败"
    "失败时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    "失败阶段：$CurrentStep"
    "错误：$(Protect-Message $OriginalError.Exception.Message)"
    "包内产品版本：$PackageVersion"
    "包内构建编号：$PackageBuildNumber"
    "扩展目录存在：$(Test-Path -LiteralPath $ExtensionDir)"
    "Native Host 存在：$(Test-Path -LiteralPath $NativeHostExe)"
    "运行配置存在：$(Test-Path -LiteralPath $RuntimeConfigPath)"
    "Native Messaging 清单存在：$(Test-Path -LiteralPath $ManifestPath)"
    "安全：安装失败报告不记录 MCP token、Cookie、Authorization、密码或验证码。"
  ) | Set-Content -LiteralPath $ReportPath -Encoding UTF8
  Write-Host ""
  Write-Host "安装失败：$(Protect-Message $OriginalError.Exception.Message)" -ForegroundColor Red
  Write-Host "安装检查结果：$ReportPath"
  exit 1
}
