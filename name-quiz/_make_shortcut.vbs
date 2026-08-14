Option Explicit
Dim sh, fso, desktop, folder, sc, target, linkPath
If WScript.Arguments.Count < 1 Then
  WScript.Quit 1
End If
desktop = WScript.Arguments(0)
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
target = folder & "\start.vbs"
If Not fso.FileExists(target) Then target = folder & "\이름외우기 시작.vbs"
linkPath = desktop & "\NameQuiz.lnk"
Set sc = sh.CreateShortcut(linkPath)
sc.TargetPath = target
sc.WorkingDirectory = folder
sc.WindowStyle = 7
sc.Description = "이름 외우기 - 학생 이름 퀴즈"
sc.Save
WScript.Echo linkPath
