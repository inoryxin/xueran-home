@echo off
rem ===========================================================
rem  Xueran Homepage - set as Edge / Chrome start page
rem  (ASCII only on purpose: cmd.exe reads .cmd in the OEM
rem   codepage, so Chinese comments here would break parsing.
rem   All Chinese text is printed by tools\set-homepage.ps1)
rem ===========================================================
chcp 65001 >nul
setlocal
set "PSEXE=powershell.exe"
where pwsh.exe >nul 2>nul && set "PSEXE=pwsh.exe"
"%PSEXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\set-homepage.ps1" %*
if errorlevel 1 (
  echo.
  echo   [ERROR] Failed to run tools\set-homepage.ps1
  echo   Make sure this .cmd sits next to the tools folder.
  echo.
  pause
)
endlocal
