param(
  [Parameter(Mandatory=$true)][string]$RuntimePackage,
  [Parameter(Mandatory=$true)][string]$RuntimePackageSha256,
  [Parameter(Mandatory=$true)][string]$SourceCommit,
  [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
function Hash([string]$Path) {
  $Stream = [IO.File]::OpenRead($Path)
  $Sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($Sha.ComputeHash($Stream))).Replace("-", "").ToLowerInvariant() }
  finally { $Sha.Dispose(); $Stream.Dispose() }
}
function Utf8([string]$Path, [string]$Text) {
  [IO.File]::WriteAllText($Path, $Text, [Text.UTF8Encoding]::new($false))
}
function Checked([string]$Exe, [string[]]$Arguments) {
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "BUILD_COMMAND_FAILED: $Exe" }
}
if (Test-Path -LiteralPath $OutputDirectory) { throw "OUTPUT_DIRECTORY_EXISTS" }
if ($RuntimePackageSha256 -notmatch '^[0-9a-fA-F]{64}$' -or (Hash $RuntimePackage) -ne $RuntimePackageSha256.ToLowerInvariant()) {
  throw "RUNTIME_PACKAGE_SHA256_MISMATCH"
}
if ($SourceCommit -notmatch '^[0-9a-f]{40}$') { throw "SOURCE_COMMIT_REQUIRED" }
$ActualCommit = (& git -C $Repo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $ActualCommit -ne $SourceCommit) { throw "SOURCE_COMMIT_MISMATCH" }
$GitStatus = @(& git -C $Repo status --porcelain --untracked-files=normal)
if ($LASTEXITCODE -ne 0 -or $GitStatus.Count -gt 0) { throw "SOURCE_WORKTREE_DIRTY" }
$Build = Join-Path $env:TEMP ("TW-build-" + [guid]::NewGuid().ToString("N").Substring(0,8))
$Runtime = Join-Path $Build "verified-runtime"
New-Item -ItemType Directory -Path $Runtime -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $RuntimePackage).Path)
try {
  foreach ($Entry in $Zip.Entries) {
    if ($Entry.FullName -notmatch '^TianyuanWorkbench/(runtime/|native-helper/native_host(_bootstrap\.js|\.exe)$)') { continue }
    if ($Entry.FullName -match '(?i)^TianyuanWorkbench/runtime/tycpv(?:[-_].*)?\.(?:exe|pkg)$') { continue }
    if ($Entry.FullName -match '(^|/)__pycache__/') { continue }
    $Target = [IO.Path]::GetFullPath((Join-Path $Runtime $Entry.FullName))
    $Boundary = [IO.Path]::GetFullPath($Runtime).TrimEnd('\') + '\'
    if (-not $Target.StartsWith($Boundary, [StringComparison]::OrdinalIgnoreCase) -or $Target.Length -gt 240) {
      throw "UNSAFE_RUNTIME_ARCHIVE_PATH"
    }
    if ($Entry.FullName.EndsWith("/")) { New-Item -ItemType Directory -Path $Target -Force | Out-Null }
    else {
      New-Item -ItemType Directory -Path (Split-Path -Parent $Target) -Force | Out-Null
      [IO.Compression.ZipFileExtensions]::ExtractToFile($Entry, $Target, $false)
    }
  }
} finally { $Zip.Dispose() }
$Seed = Join-Path $Runtime "TianyuanWorkbench"
if ((Hash (Join-Path $Seed "native-helper\native_host_bootstrap.js")) -ne (Hash (Join-Path $Repo "native-helper\native_host_bootstrap.js"))) {
  throw "BOOTSTRAP_CHANGED_REBUILD_NATIVE_EXE_REQUIRED"
}
$Node = Join-Path $Seed "runtime\node\node.exe"
$Python = Join-Path $Seed "runtime\python-portable\python.exe"
Checked $Node @("--version")
Checked $Python @("-c","import requests,urllib3,certifi,charset_normalizer,idna,openpyxl,et_xmlfile,lxml,docx,typing_extensions;print('verified offline runtime dependencies ok')")
$Version = Get-Content -LiteralPath (Join-Path $Repo "extension\version.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$Fingerprint = (& $Node (Join-Path $Repo "scripts\print-runtime-build-id.mjs") $Repo).Trim()
if ($LASTEXITCODE -ne 0 -or $Fingerprint -notmatch '^[0-9a-f]{64}$') { throw "FINGERPRINT_FAILED" }
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$Results = @()
foreach ($Lite in @($false,$true)) {
  $Kind = if ($Lite) { "lite" } else { "full" }
  $Stage = Join-Path $Build "$Kind\TianyuanWorkbench"
  New-Item -ItemType Directory -Path $Stage -Force | Out-Null
  foreach ($Directory in @("extension","native-helper","skills","plugins")) {
    Copy-Item -LiteralPath (Join-Path $Repo $Directory) -Destination (Join-Path $Stage $Directory) -Recurse
  }
  New-Item -ItemType Directory -Path (Join-Path $Stage "scripts") -Force | Out-Null
  foreach ($Name in @("install-local-runtime.mjs","runtime-fingerprint.mjs","print-runtime-build-id.mjs")) {
    Copy-Item -LiteralPath (Join-Path $Repo "scripts\$Name") -Destination (Join-Path $Stage "scripts\$Name")
  }
  if (-not $Lite) {
    Copy-Item -LiteralPath (Join-Path $Seed "runtime") -Destination (Join-Path $Stage "runtime") -Recurse
    Copy-Item -LiteralPath (Join-Path $Seed "native-helper\native_host.exe") -Destination (Join-Path $Stage "native-helper\native_host.exe")
    Copy-Item -LiteralPath (Join-Path $Repo "skills\zj-land-publicity\scrape_zj_land.py") -Destination (Join-Path $Stage "runtime\python-portable\Lib\site-packages\scrape_zj_land.py") -Force
  }
  $Compatibility = [ordered]@{ version=2; extensionVersion=$Version.chromeVersion; bridgeProtocol=$Version.bridgeProtocol; runtimeBuildId=$Fingerprint; runtimeBuildKind="release"; generatedAt=[DateTime]::UtcNow.ToString("o") }
  foreach ($Directory in @("extension","native-helper")) {
    Utf8 (Join-Path $Stage "$Directory\runtime-compat.json") ($Compatibility | ConvertTo-Json)
  }
  Checked $Node @((Join-Path $Repo "scripts\prepare-windows-launchers.mjs"), (Join-Path $Repo "release\windows-x64"), $Stage)
  Copy-Item -LiteralPath (Join-Path $Repo "release\windows-x64\repair-update-source.cmd") -Destination $Stage
  Utf8 (Join-Path $Stage "VERSION.txt") (@(
    "name=Tianyuan Browser Workbench"
    "version=$($Version.productVersion)"
    "build_number=$($Version.buildNumber)"
    "platform=Windows-x64"
    "package_type=$(if ($Lite) { 'lite-update' } else { 'full-install' })"
    "requires_existing_runtime=$($Lite.ToString().ToLowerInvariant())"
    "git_commit=$SourceCommit"
    "source_dirty=false"
    "runtime_build_id=$Fingerprint"
    "acceptance_status=approved-for-distribution"
    "runtime_build_kind=release"
    "cli_policy=external-optional"
    "cli_bundled=false"
    "runtime_seed_sha256=$RuntimePackageSha256"
  ) -join "`n")
  # Parse the shipped UTF-8 BOM files with the actual Windows PowerShell parser.
  foreach ($Name in @("install.ps1","安装.ps1","uninstall.ps1")) {
    $Tokens=$null; $Errors=$null
    [Management.Automation.Language.Parser]::ParseFile((Join-Path $Stage $Name),[ref]$Tokens,[ref]$Errors) | Out-Null
    if ($Errors.Count) { throw "POWERSHELL_PARSE_FAILED: $Name" }
  }
  $StageFull = (Get-Item -LiteralPath $Stage).FullName
  $Checksums = @()
  foreach ($File in (Get-ChildItem -LiteralPath $Stage -Recurse -File | Sort-Object FullName)) {
    $Relative = $File.FullName.Substring($StageFull.Length+1).Replace("\","/")
    if ($File.FullName.Length -gt 240) { throw "BUILD_PATH_TOO_LONG: $Relative" }
    $Checksums += "$(Hash $File.FullName)  ./$Relative"
  }
  Utf8 (Join-Path $Stage "SHA256SUMS") (($Checksums -join "`n")+"`n")
  $Name = "tianyuan-workbench-v$($Version.productVersion)-windows-x64$(if ($Lite) { '-lite' }).zip"
  $Destination = Join-Path $OutputDirectory $Name
  Checked $Python @((Join-Path $Repo "scripts\create-release-zip.py"), $Stage, $Destination)
  $Digest = Hash $Destination
  Utf8 "$Destination.sha256" "$Digest  $Name`n"
  $Results += [ordered]@{ kind=$Kind; path=$Destination; size=(Get-Item $Destination).Length; sha256=$Digest; stage=$Stage; runtimeBuildId=$Fingerprint; status="release-built" }
}
Utf8 (Join-Path $OutputDirectory "release-build.json") ($Results | ConvertTo-Json -Depth 5)
$Results | ConvertTo-Json -Depth 5
