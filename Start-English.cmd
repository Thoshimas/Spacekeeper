@echo off
setlocal
cd /d "%~dp0"
set "SPACEKEEPER_NODE="
if exist "%~dp0runtime\node.exe" set "SPACEKEEPER_NODE=%~dp0runtime\node.exe"
if not defined SPACEKEEPER_NODE for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined SPACEKEEPER_NODE set "SPACEKEEPER_NODE=%%N"
if not defined SPACEKEEPER_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "SPACEKEEPER_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined SPACEKEEPER_NODE (
  echo Node.js 22 or newer is required. See README.en.md.
  pause
  exit /b 1
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0Launch.ps1" -NodePath "%SPACEKEEPER_NODE%" -Language en
if errorlevel 1 pause
