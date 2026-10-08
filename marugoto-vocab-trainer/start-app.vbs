Option Explicit

Dim shell, files, root, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)

' Window style 0 hides the launcher and does not create a console window.
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & files.BuildPath(root, "launch-app.ps1") & Chr(34)
If WScript.Arguments.Named.Exists("no-browser") Then command = command & " -NoBrowser"
shell.Run command, 0, False
