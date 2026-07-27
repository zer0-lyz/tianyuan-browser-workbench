@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if "%EXIT_CODE%"=="0" echo Installation completed.
if not "%EXIT_CODE%"=="0" echo Installation failed. See the PowerShell window and installation report.
pause
exit /b %EXIT_CODE%
