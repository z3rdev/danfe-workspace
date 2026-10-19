Option Explicit

Dim shell, fileSystem, target, helper, wscriptPath, application, arguments
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count = 0 Then WScript.Quit 2

target = WScript.Arguments(0)
helper = fileSystem.BuildPath(fileSystem.GetParentFolderName(WScript.ScriptFullName), "RUN_BAT_HIDDEN.vbs")
wscriptPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
arguments = """" & helper & """ """ & target & """"

Set application = CreateObject("Shell.Application")
application.ShellExecute wscriptPath, arguments, "", "runas", 0
