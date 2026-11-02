param(
  [string]$InstallRoot = "",
  [string]$RuntimeLayout = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$HostName = "com.tianyuan.workbench.helper"
$RegistryPaths = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
)
$DocumentsRoot = [Environment]::GetFolderPath("MyDocuments")
$DesktopRoot = [Environment]::GetFolderPath("Desktop")
$ExtensionPathNote = Join-Path $DocumentsRoot "天源工作台\浏览器扩展路径.txt"
$ExtensionShortcut = Join-Path $DesktopRoot "天源工作台-浏览器扩展.lnk"

function Read-RuntimeConfig([string]$ConfigPath) {
  if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { return $null }
  try { return (Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json) }
  catch { return $null }
}

function Get-OwnedWorkbenchProcesses {
  param(
    [string]$NativeHostExe,
    [string]$ManagedNodeExe,
    [string[]]$NativeHostScripts,
    [object[]]$Processes = @()
  )
  $ExpectedExecutables = @($NativeHostExe, $ManagedNodeExe) |
    Where-Object { $_ } |
    ForEach-Object { [IO.Path]::GetFullPath($_) }
  $ScriptPatterns = @($NativeHostScripts | Where-Object { $_ } | ForEach-Object {
    '(?i)(?:^|[\s"]){0}(?:$|[\s"])' -f [regex]::Escape([IO.Path]::GetFullPath($_))
  })
  foreach ($Process in $Processes) {
    $ExecutablePath = [string]$Process.ExecutablePath
    $CommandLine = [string]$Process.CommandLine
    $MatchesExecutable = $false
    if ($ExecutablePath) {
      try {
        $ResolvedExecutable = [IO.Path]::GetFullPath($ExecutablePath)
        $MatchesExecutable = @($ExpectedExecutables | Where-Object {
          $_.Equals($ResolvedExecutable, [StringComparison]::OrdinalIgnoreCase)
        }).Count -gt 0
      } catch {}
    }
    $MatchesScript = $false
    foreach ($Pattern in $ScriptPatterns) {
      if ($CommandLine -match $Pattern) { $MatchesScript = $true; break }
    }
    if ($MatchesExecutable -or $MatchesScript) { $Process }
  }
}

if (-not $InstallRoot -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot "workbench-runtime\native-helper\runtime-config.json"))) {
  $InstallRoot = $PSScriptRoot
}
if (-not $InstallRoot -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot "native-helper\runtime-config.json"))) {
  $InstallRoot = $PSScriptRoot
}
if (-not $InstallRoot) {
  Write-Host "此目录未安装，未删除任何文件。请从已安装的工作台目录运行卸载器，或使用 -InstallRoot 指定已安装目录。" -ForegroundColor Yellow
  exit 2
}
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
if (-not $RuntimeLayout) {
  if (Test-Path -LiteralPath (Join-Path $InstallRoot "workbench-runtime\native-helper\runtime-config.json")) {
    $RuntimeLayout = "visible-root-v1"
  } elseif (Test-Path -LiteralPath (Join-Path $InstallRoot "native-helper\runtime-config.json")) {
    $RuntimeLayout = "legacy-hidden"
  } else {
    Write-Host "指定目录没有可核验的工作台运行配置；没有删除任何文件。" -ForegroundColor Yellow
    exit 2
  }
}

if ($RuntimeLayout -notin @("visible-root-v1", "legacy-hidden")) {
  Write-Host "运行配置中的布局不受支持；没有删除任何文件。" -ForegroundColor Yellow
  exit 2
}
$RuntimeConfigPath = if ($RuntimeLayout -eq "visible-root-v1") {
  Join-Path $InstallRoot "workbench-runtime\native-helper\runtime-config.json"
} else {
  Join-Path $InstallRoot "native-helper\runtime-config.json"
}
$RuntimeConfig = Read-RuntimeConfig $RuntimeConfigPath
$ConfigMatchesTarget = $false
if ($RuntimeConfig -and (-not $RuntimeConfig.layout -or $RuntimeConfig.layout -eq $RuntimeLayout)) {
  try {
    $ConfiguredRoot = [string]$RuntimeConfig.installRoot
    if (-not $ConfiguredRoot) {
      $HelperRoot = Split-Path -Parent $RuntimeConfigPath
      $ConfiguredRoot = if ($RuntimeLayout -eq "visible-root-v1") {
        Split-Path -Parent (Split-Path -Parent $HelperRoot)
      } else {
        Split-Path -Parent $HelperRoot
      }
    }
    $ConfiguredRoot = [IO.Path]::GetFullPath($ConfiguredRoot)
    $ConfigMatchesTarget = $ConfiguredRoot.Equals($InstallRoot, [StringComparison]::OrdinalIgnoreCase)
  } catch {}
}
if (-not $ConfigMatchesTarget) {
  Write-Host "运行配置与指定安装目录不一致；没有删除任何文件。" -ForegroundColor Yellow
  exit 2
}

$IsVisibleLayout = $RuntimeLayout -eq "visible-root-v1"
$NativeHelperRoot = if ($IsVisibleLayout) { Join-Path $InstallRoot "workbench-runtime\native-helper" } else { Join-Path $InstallRoot "native-helper" }
$NativeHostExe = Join-Path $NativeHelperRoot "native_host.exe"
$ManagedNodeExe = Join-Path $NativeHelperRoot "node\node.exe"
$NativeHostScript = Join-Path $NativeHelperRoot "native_host.js"
$ExpectedManifestPath = Join-Path $NativeHelperRoot "$HostName.json"
$ExtensionPath = if ($IsVisibleLayout) { Join-Path $InstallRoot "extension" } else { Join-Path $InstallRoot "projects\天源评估系统\extension" }
$MatchingRegistryPaths = @()
foreach ($RegistryPath in $RegistryPaths) {
  $RegisteredManifest = [string](Get-ItemProperty -LiteralPath $RegistryPath -Name "(default)" -ErrorAction SilentlyContinue).'(default)'
  if ($RegisteredManifest -and [IO.Path]::GetFullPath($RegisteredManifest).Equals($ExpectedManifestPath, [StringComparison]::OrdinalIgnoreCase)) {
    $MatchingRegistryPaths += $RegistryPath
  }
}

$NoteMatches = $false
if (Test-Path -LiteralPath $ExtensionPathNote -PathType Leaf) {
  try {
    $NoteTarget = [IO.Path]::GetFullPath((Get-Content -LiteralPath $ExtensionPathNote -Raw -Encoding UTF8).Trim())
    $NoteMatches = $NoteTarget.Equals($ExtensionPath, [StringComparison]::OrdinalIgnoreCase)
  } catch {}
}
$ShortcutMatches = $false
if (Test-Path -LiteralPath $ExtensionShortcut -PathType Leaf) {
  try {
    $Shell = New-Object -ComObject WScript.Shell
    $ShortcutTarget = [string]$Shell.CreateShortcut($ExtensionShortcut).TargetPath
    $ShortcutMatches = $ShortcutTarget -and [IO.Path]::GetFullPath($ShortcutTarget).Equals($ExtensionPath, [StringComparison]::OrdinalIgnoreCase)
  } catch {}
}
if (-not $MatchingRegistryPaths.Count -and -not $NoteMatches -and -not $ShortcutMatches) {
  Write-Host "当前注册、桌面入口或文档路径都未指向此目录；为保护其他安装，没有删除任何文件。" -ForegroundColor Yellow
  exit 2
}

try {
  $RunningProcesses = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop)
} catch {
  Write-Host "无法核对工作台运行进程（$($_.Exception.Message)）；为保护运行中的文件，没有删除注册或文件。" -ForegroundColor Yellow
  exit 3
}
$OwnedProcesses = @(Get-OwnedWorkbenchProcesses `
  -NativeHostExe $NativeHostExe `
  -ManagedNodeExe $ManagedNodeExe `
  -NativeHostScripts @($NativeHostScript, (Join-Path $NativeHelperRoot "server.js")) `
  -Processes $RunningProcesses)
if ($OwnedProcesses.Count) {
  $ProcessSummary = ($OwnedProcesses | ForEach-Object { "PID $($_.ProcessId) ($($_.Name))" }) -join ", "
  Write-Host "检测到此安装根的工作台进程：$ProcessSummary。请关闭对应的 Chrome/Edge 和本机工作台进程后重试；没有按端口结束其他安装，也没有删除注册或文件。" -ForegroundColor Yellow
  exit 3
}

function Remove-ContainedPath([string]$TargetPath) {
  if (-not (Test-Path -LiteralPath $TargetPath)) { return }
  $FullTarget = [IO.Path]::GetFullPath($TargetPath)
  $Boundary = $InstallRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
  if (-not $FullTarget.StartsWith($Boundary, [StringComparison]::OrdinalIgnoreCase)) {
    throw "UNINSTALL_TARGET_OUTSIDE_INSTALL_ROOT: $FullTarget"
  }
  Remove-Item -LiteralPath $FullTarget -Recurse -Force
}

foreach ($RegistryPath in $MatchingRegistryPaths) {
  Remove-Item -LiteralPath $RegistryPath -Force
}
if ($NoteMatches) { Remove-Item -LiteralPath $ExtensionPathNote -Force }
if ($ShortcutMatches) { Remove-Item -LiteralPath $ExtensionShortcut -Force }

if ($IsVisibleLayout) {
  Remove-ContainedPath (Join-Path $InstallRoot "workbench-runtime")
} else {
  foreach ($ManagedPath in @(
    (Join-Path $InstallRoot "native-helper"),
    (Join-Path $InstallRoot "python"),
    (Join-Path $InstallRoot "print-format-skills"),
    (Join-Path $InstallRoot "projects\天源评估系统\extension")
  )) {
    Remove-ContainedPath $ManagedPath
  }
}

Write-Host "已清理指向 $InstallRoot 的工作台运行组件和入口。扩展包源码、浏览器扩展、共享 Connector、天源 CLI、Python 系统安装和用户文件均保留。" -ForegroundColor Green
Write-Host "请在 Chrome 或 Edge 扩展管理页手动移除“天源浏览器工作台”。"
