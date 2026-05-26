@echo off
setlocal
echo Starting AUTO-TAX helper...
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0start-renewal-local-helper.ps1" -Detached
if errorlevel 1 goto :fail
echo.
echo AUTO-TAX helper start command completed.
echo.
echo Current helper status:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0status-renewal-local-helper.ps1"
if errorlevel 1 goto :fail
echo.
echo Check status=running above to confirm the helper is ON.
pause
exit /b 0

:fail
set "_exit=%errorlevel%"
echo.
echo AUTO-TAX renewal helper start failed.
pause
exit /b %_exit%
