const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("focusVaultAI", {
  getSettings: () => ipcRenderer.invoke("ai:get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("ai:save-settings", settings),
  chat: (payload) => ipcRenderer.invoke("ai:chat", payload),
});
