' NOVA Personal AI OS - Silent Windows Startup Launcher
' Drop shortcut to this script in %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
' Runs supervisor and frontend completely hidden with no console popup windows.

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
RootDir = FSO.GetParentFolderName(FSO.GetParentFolderName(ScriptDir))

' Launch Process Supervisor silently (0 = hide window, false = don't wait)
WshShell.Run "cmd /c cd /d """ & RootDir & """ && node nova\backend\supervisor.js", 0, False

' Pause 3 seconds for supervisor to bring up core services
WScript.Sleep 3000

' Launch Frontend dev server silently
WshShell.Run "cmd /c cd /d """ & RootDir & "\nova\frontend"" && npm run dev", 0, False
