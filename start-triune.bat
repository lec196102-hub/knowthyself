@echo off
REM ============================================================
REM  Triune Journal - One-click desktop launcher
REM  Starts backend (port 3000) then the Electron widget.
REM  Widget lives in the system tray; use tray icon or
REM  Ctrl+Shift+J to show/hide. Right-click tray -> Exit to quit.
REM ============================================================
setlocal
set "PROJECT_DIR=C:\Users\LYGY\Documents\Codex\2026-07-27\s-m\triune-journal"
set "PORT=3000"

cd /d "%PROJECT_DIR%" || (echo Cannot find project folder & pause & exit /b 1)

REM 1) Start backend only if port 3000 is free
powershell -NoProfile -Command "$c=New-Object Net.Sockets.TcpClient; try { $c.Connect('127.0.0.1',%PORT%); $c.Close(); exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Starting backend service...
  start "Triune Backend" /min cmd /c "npm run dev"
) else (
  echo Backend already running, skipping.
)

REM 2) Wait for backend port (up to 30s)
echo Waiting for backend...
set /a tries=0
:waitloop
powershell -NoProfile -Command "$c=New-Object Net.Sockets.TcpClient; try { $c.Connect('127.0.0.1',%PORT%); $c.Close(); exit 0 } catch { exit 1 }"
if errorlevel 1 (
  timeout /t 1 >nul
  set /a tries+=1
  if %tries% lss 30 goto waitloop
)

REM 3) Launch the Electron widget (tray-resident)
echo Backend ready. Launching companion window...
npm run widget
