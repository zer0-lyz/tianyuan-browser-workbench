$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$InstallRoot = Join-Path $env:LOCALAPPDATA "TianyuanWorkbench"
$RegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.tianyuan.workbench.helper"

try {
  if (Test-Path $RegistryPath) {
    Remove-Item $RegistryPath -Recurse -Force
  }
  foreach ($Name in @("TYCPV_BIN", "TIANYUAN_PYTHON_BIN", "TIANYUAN_PRINT_SKILLS_DIR")) {
    [Environment]::SetEnvironmentVariable($Name, $null, "User")
  }
  if (Test-Path -LiteralPath $InstallRoot) {
    Remove-Item -LiteralPath $InstallRoot -Recurse -Force
  }
  Write-Host "天源浏览器工作台本机文件和 Native Host 注册已删除。" -ForegroundColor Green
  Write-Host "请在 Chrome 扩展管理页移除“天源浏览器工作台”。"
  Write-Host "天源 CLI 没有卸载，用户导出的 Excel 文件也没有删除。"
  exit 0
}
catch {
  Write-Host "卸载失败：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
