const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("window-minimize"),
  close: () => ipcRenderer.send("window-close"),
  openKnowledge: () => ipcRenderer.send("open-knowledge"),
  openChatlog: () => ipcRenderer.send("open-chatlog"),
});
