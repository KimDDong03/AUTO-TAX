@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-renewal-local-helper.ps1"
if errorlevel 1 goto :fail
echo.
echo AUTO-TAX renewal helper stopped.
pause
exit /b 0

:fail
set "_exit=%errorlevel%"
echo.
echo AUTO-TAX renewal helper stop failed.
pause
exit /b %_exit%
