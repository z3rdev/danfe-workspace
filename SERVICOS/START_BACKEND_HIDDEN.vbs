Option Explicit

Dim shell, fileSystem, batch, command
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
shell.Environment("Process")("DANFE_HIDDEN") = "1"

batch = fileSystem.BuildPath(fileSystem.GetParentFolderName(WScript.ScriptFullName), "START_BACKEND.bat")
command = """" & shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\cmd.exe"" /d /c call """ & batch & """"
shell.Run command, 0, True
