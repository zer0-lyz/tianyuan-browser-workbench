@echo off
setlocal
title Tianyuan Workbench Update Source Repair

echo Tianyuan Workbench - repair update source
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $p=Join-Path $env:LOCALAPPDATA 'TianyuanWorkbench\native-helper\update-sources.json'; if (!(Test-Path -LiteralPath $p)) { throw ('Native Helper update source not found: ' + $p) }; $json='{\"schemaVersion\":1,\"manifestUrls\":[\"https://github.com/zer0-lyz/tianyuan-browser-workbench-releases/releases/latest/download/update-manifest.json\"]}'; Set-Content -LiteralPath $p -Value $json -Encoding UTF8; Write-Host ('Updated: ' + $p)"
if errorlevel 1 (
  echo.
  echo Repair failed. Please confirm that Tianyuan Workbench is installed.
  pause
  exit /b 1
)

echo.
echo Repair completed. Fully exit Chrome or Edge, reopen it, and click Check for updates.
pause
