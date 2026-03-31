@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-renewal-local-helper.ps1" -Detached
echo.
echo AUTO-TAX renewal helper started.
pause
