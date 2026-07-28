// launch-widget-detached.cjs
// Spawns Electron with full Windows process detachment so that closing
// any cmd window (start-triune.bat, a manual cmd, etc.) will NOT kill
// the pet. Equivalent to `electron electron/main.cjs` but in a new
// process group with NO inherited console.
//
// On Windows, child_process.spawn with detached:true passes
// DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP to CreateProcess. The
// child therefore:
//   - has its own (hidden) console, not inherited from start-triune.bat
//   - is in a new process group, so closing the parent console cannot
//     reach it via CTRL_CLOSE_EVENT
//   - has stdio detached (no shared pipes)
//
// After spawn(), we unref() so this Node process can exit immediately
// without waiting for the child. The child continues running as a
// fully detached daemon-like process.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectDir = __dirname;

// require("electron") returns the absolute path to electron.exe when
// loaded from a regular Node script (not from inside Electron itself).
const electronExe = require("electron");

const logFile = path.join(projectDir, "logs", "widget-detached.log");
const widgetLog = path.join(projectDir, "logs", "widget.log");
const logLine = (msg) => {
  try {
    fs.mkdirSync(path.join(projectDir, "logs"), { recursive: true });
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) { /* ignore logging errors */ }
};

// Pipe child stdio into widget.log so we can diagnose startup failures.
// stdio: "ignore" would silently drop everything; "inherit" would tie
// us to the parent console; a writable file handle gives us a real
// standalone log without console coupling.
fs.mkdirSync(path.join(projectDir, "logs"), { recursive: true });
const out = fs.openSync(widgetLog, "w");
const err = fs.openSync(widgetLog, "a");

// Defense in depth: some IDEs/shells (VS Code terminal, Codebuddy sandbox,
// GitHub Actions, etc.) set ELECTRON_RUN_AS_NODE=1 in the environment.
// If that variable reaches electron.exe, it runs in pure-Node mode and
// `require("electron")` returns a string — main.cjs then crashes at
// `app.setPath` (line 21). Strip it before spawn so electron boots as
// a real Electron process regardless of how the launcher was invoked.
const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(electronExe, ["electron/main.cjs"], {
  cwd: projectDir,
  detached: true,
  stdio: ["ignore", out, err],
  windowsHide: true,
  env: cleanEnv,
});

child.on("error", (e) => {
  logLine(`spawn error: ${e.message}`);
});

child.unref();

logLine(`detached, electron PID=${child.pid}`);