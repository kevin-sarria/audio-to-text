/**
 * Stub documentado para transcripción en el cliente mediante WebGPU / Transformers.js.
 * Utiliza feature-detect de `navigator.gpu` e importación dinámica diferida (lazy import).
 */

export interface ClientTranscriptionResult {
  text: string;
  language: string;
}

export async function isWebGpuSupported(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    return false;
  }
  try {
    const adapter = await (navigator as any).gpu?.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

export async function transcribeAudioOnDevice(
  _audioBlob: Blob,
  _onProgress?: (progress: number) => void
): Promise<ClientTranscriptionResult> {
  const supported = await isWebGpuSupported();
  if (!supported) {
    throw new Error("WebGPU no está soportado en este dispositivo o navegador.");
  }

  // Stub para Transformers.js Whisper:
  // const { pipeline } = await import('@xenova/transformers');
  // const transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny');
  console.info("Stub Whisper WebGPU invocado.");

  return {
    text: "Transcripción generada localmente en navegador vía WebGPU (stub).",
    language: "es"
  };
}
