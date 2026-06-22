Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")

scriptDir = files.GetParentFolderName(WScript.ScriptFullName)
launcher = scriptDir & "\Launch-FocusVault.ps1"

shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & launcher & Chr(34), 0, False
