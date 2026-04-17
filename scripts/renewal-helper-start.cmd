@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-renewal-local-helper.ps1" -Detached
if errorlevel 1 goto :fail
echo.
echo AUTO-TAX renewal helper started.
pause
exit /b 0

:fail
set "_exit=%errorlevel%"
echo.
echo AUTO-TAX renewal helper start failed.
pause
exit /b %_exit%
