@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-renewal-local-helper-autostart.ps1" -StartNow
if errorlevel 1 goto :fail
echo.
echo AUTO-TAX renewal helper install completed.
pause
exit /b 0

:fail
set "_exit=%errorlevel%"
echo.
echo AUTO-TAX renewal helper install failed.
pause
exit /b %_exit%
