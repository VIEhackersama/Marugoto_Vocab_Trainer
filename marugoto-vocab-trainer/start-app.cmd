@echo off
setlocal
set "ROOT=%~dp0"

:: Launch the background supervisor silently without keeping any terminal window open
start "" /B powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%ROOT%launch-app.ps1"

:: Close this terminal immediately so it does not occupy windows or taskbar
exit /b 0
