import path from "node:path";

export interface BotPaths {
  dir: string;
  profileDir: string;
  settingsFile: string;
  outputDir: string;
}

/** Todo lo del bot vive en <userData>/bot, igual en desarrollo y en el instalador. */
export function resolveBotPaths(userDataDir: string): BotPaths {
  const dir = path.join(userDataDir, "bot");
  return {
    dir,
    profileDir: path.join(dir, "profile"),
    settingsFile: path.join(dir, "settings.json"),
    outputDir: path.join(dir, "output")
  };
}
