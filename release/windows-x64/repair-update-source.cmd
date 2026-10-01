@echo off
setlocal
title Tianyuan Workbench Update Source Repair

echo Tianyuan Workbench - repair update source
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $p=Join-Path $env:LOCALAPPDATA 'TianyuanWorkbench\native-helper\update-sources.json'; if (!(Test-Path -LiteralPath $p)) { throw ('Native Helper update source not found: ' + $p) }; $existing=$null; try { $existing=Get-Content -LiteralPath $p -Raw | ConvertFrom-Json } catch {}; $gitee=[string]$env:TIANYUAN_GITEE_MANIFEST_URL; if (!$gitee -and $existing) { $gitee=[string]$existing.giteeManifestUrl }; if (!$gitee -and $existing -and $existing.manifestUrls) { $gitee=@($existing.manifestUrls | Where-Object { $_ -match '^https://(?:gitee\.com|raw\.giteeusercontent\.com)/' })[0] }; $urls=@(); if ($gitee) { $urls += $gitee }; $urls += 'https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/latest/download/update-manifest.json'; $json=([ordered]@{schemaVersion=1;giteeManifestUrl=$gitee;manifestUrls=$urls} | ConvertTo-Json -Compress); Set-Content -LiteralPath $p -Value $json -Encoding UTF8; Write-Host ('Updated: ' + $p)"
if errorlevel 1 (
  echo.
  echo Repair failed. Please confirm that Tianyuan Workbench is installed.
  pause
  exit /b 1
)

echo.
echo Repair completed. Fully exit Chrome or Edge, reopen it, and click Check for updates.
pause
