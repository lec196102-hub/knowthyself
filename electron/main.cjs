// Triune Journal · 桌宠悬浮窗 · Electron 主进程
// 0) 防御性：清掉 ELECTRON_RUN_AS_NODE —— 父进程若把它设上（VSCode 终端/Codebuddy 嵌套等），
//    electron.exe 会以纯 Node 模式启动、require('electron') 返回字符串、主进程没法建窗。
//    必须在 require('electron') 之前删除，否则 const { app } 解构出的就是 undefined。
delete process.env.ELECTRON_RUN_AS_NODE;
const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain } = require("electron");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

const WIDTH = 380;
const HEIGHT = 520;
const PORT = process.env.PORT || 3000;

// ============ 静默启动：消除 Chromium 的 user-data / GPU 磁盘缓存告警 ============
// 最终产品是常驻托盘的桌宠，不应让任何 chromium 内部告警（cache_util_win / disk_cache /
// gpu_disk_cache）显示到用户面前。
// 1) 默认 user-data 落在 %APPDATA%\Triune 陪伴，在 OneDrive 目录 / 权限收紧的机器上
//    会被拒写（0x5 ERROR_ACCESS_DENIED）—— 显式改到 %TEMP%\triune-journal 即可写。
app.setPath("userData", path.join(app.getPath("temp"), "triune-journal"));
// 2) 关闭 GPU 加速 —— 文字聊天窗用不到硬件渲染，且能从源头消除 gpu_disk_cache 告警。
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-rasterization");
// 3) 关闭磁盘缓存 —— 进一步压制 disk_cache / gpu_disk_cache 残留告警。
app.commandLine.appendSwitch("disable-gpu-disk-cache");
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disk-cache-size", "1");

let win = null;
let tray = null;
let quitting = false; // 仅托盘菜单「退出」时置真，避免误关
let knowledgeWin = null; // 知识库窗口（可复用，避免重复打开）
let chatlogWin = null; // 聊天日志窗口（可复用）

// 全局去掉 Electron 英文默认菜单栏（File/Edit/View…）——所有窗口界面统一中文
Menu.setApplicationMenu(null);

// ============ 便捷启动：内置拉起后端服务 ============
// 开发态：若 3000 端口未占用，用 tsx 拉起 src 源码服务；
// 生产态：加载已构建的 dist/api/server.js（需 electron-builder 将 dist 解包到资源目录）。
// 这样用户「双击即用」，无需再开一个终端跑 `npm run dev`。

function isPortOpen(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(800);
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
    sock.once("timeout", () => { sock.destroy(); resolve(false); });
    sock.connect(port, "127.0.0.1");
  });
}

async function waitForPort(port, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

let backendStarted = false;
async function ensureBackend() {
  if (backendStarted) return;
  if (await isPortOpen(PORT)) { backendStarted = true; return; }

  if (app.isPackaged) {
    // 生产：在主进程内加载已构建的服务（esbuild 单文件 ESM bundle，随 extraResources 解包到 resources/dist）
    const candidates = [
      path.join(process.resourcesPath, "dist", "api", "server.bundle.mjs"),
      path.join(__dirname, "..", "..", "dist", "api", "server.bundle.mjs"),
    ];
    for (const p of candidates) {
      try {
        await import(pathToFileURL(p).href); // 加载即启动监听（server.bundle.mjs 顶层 app.listen）
        console.log("[backend] 已加载内置服务:", p);
        backendStarted = true;
        return;
      } catch (e) {
        console.error("[backend] 加载内置服务失败:", p, e);
      }
    }
    console.error("[backend] 所有内置服务候选路径均加载失败");
  } else {
    // 开发：用 tsx 拉起源码服务
    const entry = path.join(app.getAppPath(), "src", "api", "server.ts");
    const child = spawn("npx", ["tsx", entry], {
      cwd: app.getAppPath(),
      stdio: "ignore",
      shell: true,
      env: { ...process.env, PORT: String(PORT) },
    });
    child.on("error", (e) => console.error("[backend] 启动开发服务失败:", e));
    backendStarted = true;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    minimizable: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const { screen } = require("electron");
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
  win.setPosition(screenW - WIDTH - 20, screenH - HEIGHT - 60);

  win.loadURL(`http://localhost:${PORT}/widget.html`);

  globalShortcut.register("Ctrl+Shift+J", () => {
    win.isVisible() ? win.hide() : showWindow();
  });

  // 关键：点 X / 关按钮不再退出程序，而是收进托盘，避免"误删窗口又要重启"
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on("closed", () => { win = null; });
}

/** 显示并聚焦窗口 */
function showWindow() {
  if (!win) return;
  win.show();
  win.focus();
}

/** 切换窗口显隐 */
function toggleWindow() {
  if (!win) return;
  win.isVisible() ? win.hide() : showWindow();
}

/** 创建系统托盘：最小化后保留桌面小按钮，点击可找回窗口 */
function createTray() {
  const iconPath = path.join(__dirname, "assets", "tray-icon.png");
  let icon = nativeImage.createFromPath(iconPath);
  // 兜底：图标缺失时用纯色块，保证托盘一定有入口
  if (icon.isEmpty()) {
    icon = nativeImage.createFromBuffer(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAOklEQVR42u3OMQEAAAgDoJk/aRZw0gJ6mUm3bdu2bdu2bdu2bdu2bdu2bdu2bdu2bdu2D9cH9QQAAP//Q6YAAAAASUVORK5CYII=",
        "base64"
      )
    );
  }
  tray = new Tray(icon);
  tray.setToolTip("Triune 陪伴 · 点击显示 / 隐藏");

  const contextMenu = Menu.buildFromTemplate([
    { label: "显示陪伴窗", click: () => showWindow() },
    { label: "隐藏到托盘", click: () => win && win.hide() },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  // Windows：左键单击切换显隐（macOS 单击是触发 contextMenu，这里统一处理）
  tray.on("click", () => toggleWindow());
}

// IPC: 窗口控制 —— 最小化 / 关闭 都收进托盘，而非退出
ipcMain.on("window-minimize", () => win && win.hide());
ipcMain.on("window-close", () => win && win.hide());

// IPC: 打开「三我知识库」网页（复用已有窗口，避免重复打开）
ipcMain.on("open-knowledge", () => {
  if (knowledgeWin && !knowledgeWin.isDestroyed()) {
    knowledgeWin.show();
    knowledgeWin.focus();
    return;
  }
  knowledgeWin = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 720,
    minHeight: 520,
    show: true,
    autoHideMenuBar: true, // 隐藏英文默认菜单栏（File/Edit/View…），界面全中文
    backgroundColor: "#f4f6f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  knowledgeWin.loadURL(`http://localhost:${PORT}/knowledge.html`);
  knowledgeWin.on("closed", () => { knowledgeWin = null; });
});

// IPC: 打开「聊天日志」网页（搜索 / 删除聊天记录；复用窗口）
ipcMain.on("open-chatlog", () => {
  if (chatlogWin && !chatlogWin.isDestroyed()) {
    chatlogWin.show();
    chatlogWin.focus();
    return;
  }
  chatlogWin = new BrowserWindow({
    width: 860,
    height: 680,
    minWidth: 640,
    minHeight: 480,
    show: true,
    autoHideMenuBar: true, // 同样隐藏英文默认菜单栏
    backgroundColor: "#f4f6f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  chatlogWin.loadURL(`http://localhost:${PORT}/chatlog.html`);
  chatlogWin.on("closed", () => { chatlogWin = null; });
});

app.whenReady().then(async () => {
  // 开机自启（像成熟桌宠一样，登录后自动驻留托盘）
  try {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  } catch (e) {
    console.error("[launcher] 设置开机自启失败:", e);
  }

  // 先确保后端服务可用，再建窗，避免首屏连不上
  await ensureBackend();
  await waitForPort(PORT);

  createWindow();
  createTray();
});

// 托盘应用：窗口全部关闭也不要退出，保持常驻；只有托盘「退出」才真正退出
app.on("window-all-closed", () => {
  // 不再 app.quit()，改为常驻托盘
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else showWindow();
});

app.on("before-quit", () => {
  quitting = true;
  globalShortcut.unregisterAll();
  if (tray) tray.destroy();
});
