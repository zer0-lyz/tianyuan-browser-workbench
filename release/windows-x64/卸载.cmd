@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%uninstall.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if "%EXIT_CODE%"=="0" echo Uninstallation completed.
if not "%EXIT_CODE%"=="0" echo Uninstallation failed. See the PowerShell window for details.
pause
exit /b %EXIT_CODE%
