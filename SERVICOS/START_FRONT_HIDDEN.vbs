Option Explicit

Dim shell, fileSystem, batch, command

Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

shell.Environment("Process")("DANFE_HIDDEN") = "1"

batch = fileSystem.BuildPath(fileSystem.GetParentFolderName(WScript.ScriptFullName), "START_FRONT.bat")

If Not fileSystem.FileExists(batch) Then
    WScript.Quit 3
End If

command = """" & shell.ExpandEnvironmentStrings("%ComSpec%") & """ /d /c call """ & batch & """"

shell.Run command, 0, True
