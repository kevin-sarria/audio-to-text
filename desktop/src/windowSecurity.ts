import { BrowserWindow, shell, session } from "electron";

export function configureWindowSecurity(mainWindow: BrowserWindow, localServerOrigin: string): void {
  // 1. Manejo seguro de nuevas ventanas (links con target="_blank", window.open)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:") {
        // Abrir exclusivamente URLs HTTPS en el navegador predeterminado del sistema
        shell.openExternal(url).catch(() => {});
      }
    } catch {}
    return { action: "deny" };
  });

  // 2. Bloquear cualquier navegación interna que apunte fuera del servidor Express local
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      const allowedOrigin = new URL(localServerOrigin).origin;
      if (parsed.origin !== allowedOrigin) {
        event.preventDefault();
        if (parsed.protocol === "https:") {
          shell.openExternal(navigationUrl).catch(() => {});
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  // 3. Deshabilitar etiquetas <webview>
  mainWindow.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  // 4. Denegar permisos por defecto
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    // Todos los permisos denegados por ahora (incluyendo media/micrófono hasta soporte nativo)
    callback(false);
  });
}
