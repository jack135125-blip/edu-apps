' 이름 외우기 — 항상 같은 주소(http://127.0.0.1:5500)로 실행
Option Explicit
Dim sh, fso, folder, pyCmd, i, cmd, appPort, appUrl

appPort = 5500
appUrl = "http://127.0.0.1:5500/"

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = folder

If HasCmd("python --version") Then
  pyCmd = "python"
ElseIf HasCmd("py --version") Then
  pyCmd = "py"
Else
  MsgBox "Python이 필요합니다." & vbCrLf & vbCrLf & _
    "https://www.python.org/downloads/ 에서 설치하고" & vbCrLf & _
    "'Add python.exe to PATH'를 체크해 주세요.", vbCritical, "이름 외우기"
  WScript.Quit 1
End If

' 이미 5500에서 실행 중이면 새 서버를 띄우지 않고 브라우저만 연다
If Not PortOpen(appPort) Then
  cmd = pyCmd & " -m http.server " & CStr(appPort) & " --bind 127.0.0.1"
  sh.Run cmd, 0, False
  For i = 1 To 50
    WScript.Sleep 150
    If PortOpen(appPort) Then Exit For
  Next
End If

sh.Run appUrl, 1, False

Function HasCmd(c)
  On Error Resume Next
  Dim r
  r = sh.Run("cmd /c " & c & " >nul 2>&1", 0, True)
  HasCmd = (Err.Number = 0 And r = 0)
  Err.Clear
  On Error GoTo 0
End Function

Function PortOpen(p)
  On Error Resume Next
  Dim s
  Set s = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  s.setTimeouts 500, 500, 500, 500
  s.Open "GET", "http://127.0.0.1:" & CStr(p) & "/", False
  s.Send
  PortOpen = (Err.Number = 0 And s.Status >= 200 And s.Status < 500)
  Err.Clear
  On Error GoTo 0
End Function
