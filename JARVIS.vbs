' ============================================================
'  J.A.R.V.I.S. - Ramos : abre la app como ventana propia
'  1) Inicia el servidor local oculto (Python) si no esta activo
'  2) Abre Chrome o Edge en modo aplicacion (sin barras)
' ============================================================
Option Explicit
Dim sh, fso, dir, url, ok, http, chrome, edge, rc
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
url = "http://localhost:8765/"

Function ServerUp()
  On Error Resume Next
  Dim h
  Set h = CreateObject("MSXML2.ServerXMLHTTP")
  h.setTimeouts 500, 500, 800, 800
  h.Open "GET", url & "manifest.webmanifest", False
  h.Send
  ServerUp = (Err.Number = 0 And h.Status = 200)
  Err.Clear
End Function

If Not ServerUp() Then
  On Error Resume Next
  sh.Run "pythonw -m http.server 8765 --bind 127.0.0.1", 0, False
  If Err.Number <> 0 Then
    Err.Clear
    sh.Run "pyw -m http.server 8765 --bind 127.0.0.1", 0, False
  End If
  On Error GoTo 0
  Dim i
  For i = 1 To 20
    WScript.Sleep 250
    If ServerUp() Then Exit For
  Next
End If

If Not ServerUp() Then
  MsgBox "No se encontro Python para iniciar el servidor local." & vbCrLf & _
         "Se abrira la app como archivo (sin avisos en segundo plano ni noticias)." & vbCrLf & _
         "Instala Python desde python.org marcando 'Add to PATH'.", 48, "JARVIS"
  sh.Run """" & dir & "\index.html""", 1, False
  WScript.Quit
End If

chrome = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe"
If Not fso.FileExists(chrome) Then chrome = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe"
If Not fso.FileExists(chrome) Then chrome = sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Google\Chrome\Application\chrome.exe"
edge = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe"
If Not fso.FileExists(edge) Then edge = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe"

If fso.FileExists(chrome) Then
  sh.Run """" & chrome & """ --app=" & url & " --window-size=1380,900", 1, False
ElseIf fso.FileExists(edge) Then
  sh.Run """" & edge & """ --app=" & url & " --window-size=1380,900", 1, False
Else
  sh.Run url, 1, False
End If
