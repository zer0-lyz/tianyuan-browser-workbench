@echo off
chcp 65001 >nul
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%安装.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo 安装未完成，请把窗口中的错误信息发给协助人员。
) else (
  echo 安装程序已完成。
)
pause
exit /b %EXIT_CODE%
