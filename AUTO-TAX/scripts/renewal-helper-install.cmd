@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-renewal-local-helper-autostart.ps1" -StartNow
echo.
echo AUTO-TAX renewal helper install completed.
pause
