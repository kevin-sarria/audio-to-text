import { contextBridge, ipcRenderer } from "electron";

const appVersion = process.env.npm_package_version || "1.0.0";

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  platform: process.platform,
  appVersion,
  openDataFolder: () => ipcRenderer.invoke("open-data-folder"),
  selectProjectFolder: () => ipcRenderer.invoke("select-project-folder")
});
