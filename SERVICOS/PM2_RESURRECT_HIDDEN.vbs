Option Explicit

Dim shell, fileSystem, root, logDir, pathFile, nodePathFile, pm2Path, command, fallback, wscriptPath, logFile, trace, commandDir, candidate
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

root = fileSystem.GetParentFolderName(fileSystem.GetParentFolderName(WScript.ScriptFullName))
logDir = fileSystem.BuildPath(root, "LOGS")
pathFile = fileSystem.BuildPath(logDir, "pm2-path.txt")
nodePathFile = fileSystem.BuildPath(logDir, "node-path.txt")
logFile = fileSystem.BuildPath(logDir, "pm2-startup.log")
wscriptPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"

Dim nodePath
nodePath = ""
If fileSystem.FileExists(nodePathFile) Then
  nodePath = Trim(fileSystem.OpenTextFile(nodePathFile, 1).ReadAll)
  nodePath = Replace(nodePath, vbCr, "")
  nodePath = Replace(nodePath, vbLf, "")
  nodePath = Trim(nodePath)
End If

If fileSystem.FileExists(pathFile) Then
  pm2Path = Trim(fileSystem.OpenTextFile(pathFile, 1).ReadAll)
  pm2Path = Replace(pm2Path, vbCr, "")
  pm2Path = Replace(pm2Path, vbLf, "")
  pm2Path = Trim(pm2Path)
End If

If LCase(Right(pm2Path, 4)) = ".cmd" Then
  commandDir = fileSystem.GetParentFolderName(pm2Path)
  candidate = fileSystem.BuildPath(commandDir, "node_modules\pm2\bin\pm2")
  If fileSystem.FileExists(candidate) Then
    pm2Path = candidate
  Else
    candidate = fileSystem.BuildPath(fileSystem.GetParentFolderName(commandDir), "pm2\bin\pm2")
    If fileSystem.FileExists(candidate) Then pm2Path = candidate
  End If
End If

Set trace = fileSystem.OpenTextFile(logFile, 8, True)
trace.WriteLine Now & " script=" & WScript.ScriptFullName
trace.WriteLine Now & " nodePath=" & nodePath & " exists=" & fileSystem.FileExists(nodePath)
trace.WriteLine Now & " pm2Path=" & pm2Path & " exists=" & fileSystem.FileExists(pm2Path)
trace.Close

If nodePath <> "" And fileSystem.FileExists(nodePath) And pm2Path <> "" And fileSystem.FileExists(pm2Path) Then
  shell.Environment("Process")("PM2_HOME") = shell.ExpandEnvironmentStrings("%USERPROFILE%") & "\.pm2"
  command = """" & nodePath & """ """ & pm2Path & """ resurrect"
  shell.Run command, 0, True
  WScript.Sleep 1000
  command = """" & nodePath & """ """ & pm2Path & """ restart api-danfe-backend"
  shell.Run command, 0, True
  Set trace = fileSystem.OpenTextFile(logFile, 8, True)
  trace.WriteLine Now & " PM2 commands dispatched"
  trace.Close
Else
  Set trace = fileSystem.OpenTextFile(logFile, 8, True)
  trace.WriteLine Now & " PM2 path unavailable; using START_BACKEND_HIDDEN.vbs"
  trace.Close
  fallback = fileSystem.BuildPath(fileSystem.GetParentFolderName(WScript.ScriptFullName), "START_BACKEND_HIDDEN.vbs")
  If fileSystem.FileExists(fallback) Then
    shell.Run """" & wscriptPath & """ """ & fallback & """", 0, False
  End If
End If
