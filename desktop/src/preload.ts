import { contextBridge, ipcRenderer } from "electron";

// npm_package_version solo existe al correr con npm; en la app instalada la versión
// viene del proceso principal (app.getVersion()) vía additionalArguments.
const versionArg = process.argv.find((a) => a.startsWith("--app-version="));
const appVersion = versionArg?.slice("--app-version=".length) || process.env.npm_package_version || "0.0.0";

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  platform: process.platform,
  appVersion,
  openDataFolder: () => ipcRenderer.invoke("open-data-folder"),
  selectProjectFolder: () => ipcRenderer.invoke("select-project-folder")
});
