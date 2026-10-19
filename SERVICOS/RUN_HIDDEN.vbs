Option Explicit

Dim shell, fileSystem, batch, command, folder
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
shell.Environment("Process")("DANFE_HIDDEN") = "1"
folder = fileSystem.GetParentFolderName(WScript.ScriptFullName)

If WScript.Arguments.Count > 0 Then
  batch = WScript.Arguments(0)
  If Not fileSystem.FileExists(batch) Then
    batch = fileSystem.BuildPath(folder, batch)
  End If
Else
  batch = fileSystem.BuildPath(folder, "START_BACKEND.bat")
End If

command = """" & shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\cmd.exe"" /d /c call """ & batch & """"
shell.Run command, 0, True
