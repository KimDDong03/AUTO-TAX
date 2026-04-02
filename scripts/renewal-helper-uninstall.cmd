@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-renewal-local-helper-autostart.ps1"
echo.
echo AUTO-TAX renewal helper autostart removed. Start/Stop/Status shortcuts stay available.
pause
