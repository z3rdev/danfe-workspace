Option Explicit

Dim shell, fileSystem, batch, command, i
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count = 0 Then WScript.Quit 2

shell.Environment("Process")("DANFE_HIDDEN") = "1"
batch = WScript.Arguments(0)
If Not fileSystem.FileExists(batch) Then WScript.Quit 3

command = """" & shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\cmd.exe"" /d /c call """ & batch & """"
For i = 1 To WScript.Arguments.Count - 1
  command = command & " """ & Replace(WScript.Arguments(i), """""", """""""") & """"
Next

shell.Run command, 0, True
