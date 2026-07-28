@echo off
REM ============================================================
REM  Triune Journal - Silent widget launcher
REM  Called by start-triune.bat with /min so the black console
REM  never appears in front of the end user. All stdout/stderr
REM  is redirected to logs\widget.log for developer diagnosis.
REM ============================================================
setlocal
set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%" || (echo Cannot find project folder & exit /b 1)

if not exist "logs" mkdir "logs" >nul 2>&1

REM 静默启动 widget：/min 在调用方已设，这里只负责把输出落到日志。
call npm run widget > "logs\widget.log" 2>&1
endlocal
