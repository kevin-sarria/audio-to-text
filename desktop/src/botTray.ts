import path from "node:path";
import { Menu, Notification, Tray, nativeImage } from "electron";
import type { BotSessionDto, BotSessionState } from "@audio-to-text/shared";
import { noticeFor, trayInfo } from "../../backend/src/desktop/bot/botNotifications.js";

export interface BotTrayDeps {
  iconPath: string;
  showWindow: () => void;
  leaveMeeting: () => Promise<unknown>;
  quit: () => void;
}

export interface BotTray {
  /** Se llama en cada cambio de estado del bot: avisa y actualiza la bandeja. */
  onBotEvent: (session: BotSessionDto, previous: BotSessionState) => void;
  destroy: () => void;
}

export function createBotTray(deps: BotTrayDeps): BotTray {
  let tray: Tray | null = null;
  // Referencias vivas mientras la notificación está visible, para que el GC no la recoja.
  const live = new Set<Notification>();

  try {
    tray = new Tray(nativeImage.createFromPath(path.resolve(deps.iconPath)));
    tray.on("click", deps.showWindow);
  } catch (err) {
    // Sin bandeja disponible solo se omiten el icono y el menú; las notificaciones siguen.
    console.warn("[Bot] No se pudo crear el icono de la bandeja:", err);
    tray = null;
  }

  const refresh = (session: BotSessionDto) => {
    if (!tray) return;
    const info = trayInfo(session);
    tray.setToolTip(info.tooltip);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: info.tooltip, enabled: false },
        { type: "separator" },
        { label: "Terminar reunión", enabled: info.canLeave, click: () => void deps.leaveMeeting().catch((e) => console.warn("[Bot] No se pudo terminar la reunión:", e)) },
        { label: "Abrir app", click: deps.showWindow },
        { type: "separator" },
        { label: "Salir", click: deps.quit }
      ])
    );
  };

  refresh({ state: "IDLE", message: "", meetingUrl: null, platform: null, startedAt: null, error: null, result: null });

  return {
    onBotEvent(session, previous) {
      refresh(session);
      const notice = noticeFor(session, previous);
      if (notice && Notification.isSupported()) {
        const n = new Notification({ title: notice.title, body: notice.body });
        live.add(n);
        const release = () => void live.delete(n);
        n.on("click", () => {
          release();
          deps.showWindow();
        });
        n.on("close", release);
        n.on("failed", release);
        n.show();
      }
    },
    destroy() {
      tray?.destroy();
      tray = null;
    }
  };
}
