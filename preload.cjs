/** Bridge between the main process and the window: game updates in, window requests out. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("game", {
  onInfo: (handler) => ipcRenderer.on("info", (_event, info) => handler(info)),
  onEvent: (handler) => ipcRenderer.on("event", (_event, name) => handler(name)),
  onProblem: (handler) => ipcRenderer.on("problem", (_event, text) => handler(text)),
  onUpdate: (handler) => ipcRenderer.on("update", (_event, update) => handler(update)),
  ready: () => ipcRenderer.send("ready"),
  setOnTop: (flag) => ipcRenderer.send("on-top", flag),
  version: () => ipcRenderer.invoke("version"),
  restart: () => ipcRenderer.send("restart"),
  consentNeeded: () => ipcRenderer.invoke("consent-needed"),
  privacySettings: (tab) => ipcRenderer.send("privacy-settings", tab),
  open: (name) => ipcRenderer.send("open", name),
});
