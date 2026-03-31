@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-renewal-local-helper.ps1"
echo.
echo AUTO-TAX renewal helper stopped.
pause
