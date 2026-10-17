Option Explicit
Dim shell, files, root, answer, command, result
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
answer = MsgBox("Add thoughtFork to your Start Menu?" & vbCrLf & vbCrLf & "Yes: also add a Desktop shortcut." & vbCrLf & "No: Start Menu only." & vbCrLf & "Cancel: make no changes.", vbYesNoCancel + vbQuestion, "Setup thoughtFork")
If answer = vbCancel Then WScript.Quit 0
command = "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & files.BuildPath(root, "setup-thoughtfork.ps1") & Chr(34) & " -ShowDialog"
If answer = vbYes Then command = command & " -Desktop"
result = shell.Run(command, 0, True)
If result = 0 Then MsgBox "thoughtFork is ready. Open it from your Start Menu." & vbCrLf & "No research files were changed.", vbInformation, "thoughtFork"
