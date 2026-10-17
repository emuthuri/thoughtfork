Option Explicit
Dim shell, files, root, script, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
script = files.BuildPath(root, "windows\launch-thoughtfork.ps1")
If Not files.FileExists(script) Then
  MsgBox "The thoughtFork launcher is incomplete. Keep it inside the downloaded application folder.", vbCritical, "thoughtFork"
  WScript.Quit 1
End If
command = "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & script & Chr(34)
shell.Run command, 0, False
