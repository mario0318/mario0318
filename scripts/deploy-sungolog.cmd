@echo off
setlocal
rem Opt out before PowerShell initializes, not inside the .ps1 script.
set "POWERSHELL_TELEMETRY_OPTOUT=1"
set "DOTNET_CLI_TELEMETRY_OPTOUT=1"
set "CLOUDSDK_CORE_DISABLE_USAGE_REPORTING=true"
"C:\Program Files\PowerShell\7\pwsh.exe" -NoLogo -NoProfile -NonInteractive -File "%~dp0deploy-sungolog.ps1" %*
exit /b %errorlevel%
