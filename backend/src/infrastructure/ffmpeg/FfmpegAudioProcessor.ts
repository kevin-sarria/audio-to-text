import ffmpeg from "fluent-ffmpeg";
import { env } from "../config/env.js";
import { IAudioProcessor, ProcessAudioResult } from "../../domain/services/IAudioProcessor.js";

if (env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(env.FFMPEG_PATH);
}
if (env.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(env.FFPROBE_PATH);
}

export class FfmpegAudioProcessor implements IAudioProcessor {
  public async convertToWavMono16k(
    inputPath: string,
    outputPath: string
  ): Promise<ProcessAudioResult> {
    const durationSeconds = await this.probeDuration(inputPath);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec("pcm_s16le")
        .format("wav")
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err: any) => reject(new Error(`Ffmpeg conversion error: ${err.message}`)))
        .run();
    });

    return {
      wavPath: outputPath,
      durationSeconds
    };
  }

  public async probeDuration(filePath: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
        if (err) {
          return reject(new Error("ffprobe no disponible"));
        }
        const duration = metadata?.format?.duration;
        resolve(duration ? Number(duration) : 0);
      });
    });
  }
}
