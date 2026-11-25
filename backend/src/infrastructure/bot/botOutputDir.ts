import path from "node:path";
import { MeetingBotConfigManager } from "./MeetingBotConfigManager.js";

/**
 * Carpeta donde el bot deja sus entregables (y los `reunion_*.json` que la app importa).
 * Si no se configuró, es `<raíz>/output`, la misma que usa el bot al ejecutarse con `npm run bot` desde la raíz.
 */
export function resolveBotOutputDir(
  config: { botOutputDir?: string } = MeetingBotConfigManager.getInstance().getConfig(),
  cwd: string = process.cwd()
): string {
  const configured = config.botOutputDir?.trim();
  if (configured) return path.resolve(configured);

  const rootDir = ["backend", "algorithm-manager-bot", "desktop"].includes(path.basename(cwd)) ? path.dirname(cwd) : cwd;
  return path.resolve(rootDir, "output");
}
