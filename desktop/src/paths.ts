import path from "node:path";
import fs from "node:fs";
import { app } from "electron";

export interface ResolvedPaths {
  userDataDir: string;
  resourcesDir: string;
  binDir: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  whisperPath?: string;
}

export function resolveDesktopPaths(): ResolvedPaths {
  const userDataDir = app.getPath("userData");
  const isPackaged = app.isPackaged;
  const isWin = process.platform === "win32";

  const resourcesDir = isPackaged
    ? process.resourcesPath
    : path.resolve(__dirname, "../../resources");

  const binDir = path.join(
    resourcesDir,
    isPackaged ? "bin" : path.join("bin", process.platform)
  );

  const ffmpegName = isWin ? "ffmpeg.exe" : "ffmpeg";
  const ffprobeName = isWin ? "ffprobe.exe" : "ffprobe";
  const whisperName = isWin ? "whisper-cli.exe" : "whisper-cli";

  const ffmpegCandidate = path.join(binDir, ffmpegName);
  const ffprobeCandidate = path.join(binDir, ffprobeName);
  const whisperCandidate = path.join(binDir, whisperName);

  return {
    userDataDir,
    resourcesDir,
    binDir,
    ffmpegPath: fs.existsSync(ffmpegCandidate) ? ffmpegCandidate : undefined,
    ffprobePath: fs.existsSync(ffprobeCandidate) ? ffprobeCandidate : undefined,
    whisperPath: fs.existsSync(whisperCandidate) ? whisperCandidate : undefined
  };
}
