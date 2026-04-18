@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-renewal-local-helper-autostart.ps1"
if errorlevel 1 goto :fail
echo.
echo AUTO-TAX renewal helper autostart removed. Start/Stop/Status shortcuts stay available.
pause
exit /b 0

:fail
set "_exit=%errorlevel%"
echo.
echo AUTO-TAX renewal helper autostart removal failed.
pause
exit /b %_exit%
