@echo off
setlocal
set "ROOT=%~dp0"

:: Launch the background supervisor silently without keeping any terminal window open
wscript.exe "%ROOT%start-app.vbs"

:: Close this terminal immediately so it does not occupy windows or taskbar
exit /b 0
