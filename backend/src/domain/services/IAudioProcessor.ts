export interface ProcessAudioResult {
  wavPath: string;
  durationSeconds: number;
}

export interface IAudioProcessor {
  convertToWavMono16k(inputPath: string, outputPath: string): Promise<ProcessAudioResult>;
  probeDuration(filePath: string): Promise<number>;
}
