' 한글 파일명 진입점 → start.vbs 실행
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "wscript.exe """ & folder & "\start.vbs""", 1, False
