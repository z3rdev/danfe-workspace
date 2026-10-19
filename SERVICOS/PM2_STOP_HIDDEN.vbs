Option Explicit

Dim shell, fileSystem, root, logDir, nodePath, pm2Path, nodePathFile, pm2PathFile, command, logFile, trace, commandDir, candidate
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

root = fileSystem.GetParentFolderName(fileSystem.GetParentFolderName(WScript.ScriptFullName))
logDir = fileSystem.BuildPath(root, "LOGS")
nodePathFile = fileSystem.BuildPath(logDir, "node-path.txt")
pm2PathFile = fileSystem.BuildPath(logDir, "pm2-path.txt")
logFile = fileSystem.BuildPath(logDir, "backend-control.log")

If fileSystem.FileExists(nodePathFile) Then
  nodePath = Trim(fileSystem.OpenTextFile(nodePathFile, 1).ReadAll)
  nodePath = Replace(nodePath, vbCr, "")
  nodePath = Replace(nodePath, vbLf, "")
  nodePath = Trim(nodePath)
End If

If fileSystem.FileExists(pm2PathFile) Then
  pm2Path = Trim(fileSystem.OpenTextFile(pm2PathFile, 1).ReadAll)
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

If nodePath <> "" And fileSystem.FileExists(nodePath) And pm2Path <> "" And fileSystem.FileExists(pm2Path) Then
  shell.Environment("Process")("PM2_HOME") = shell.ExpandEnvironmentStrings("%USERPROFILE%") & "\.pm2"
  command = """" & nodePath & """ """ & pm2Path & """ stop api-danfe-backend"
  shell.Run command, 0, True
  Set trace = fileSystem.OpenTextFile(logFile, 8, True)
  trace.WriteLine Now & " PM2 backend stop solicitado"
  trace.Close
End If
