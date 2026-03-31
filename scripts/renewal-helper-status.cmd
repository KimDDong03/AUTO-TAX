@echo off
setlocal
powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File "%~dp0status-renewal-local-helper.ps1"
