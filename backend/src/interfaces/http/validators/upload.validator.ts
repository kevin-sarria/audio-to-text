export interface AudioFileValidationInput {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer?: Buffer;
}

export interface AudioValidationResult {
  isValid: boolean;
  sanitizedFileName: string;
  extension: string;
  errorMessage?: string;
}

export { ALLOWED_AUDIO_EXTENSIONS } from "../../../domain/value-objects/AudioFormat.js";
import { ALLOWED_AUDIO_EXTENSIONS } from "../../../domain/value-objects/AudioFormat.js";

export const ALLOWED_MIME_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
  "audio/webm",
  "video/webm"
]);

export function validateMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 12) {
    return false;
  }

  // RIFF (WAV): 0x52 0x49 0x46 0x46 y 'WAVE' en byte 8-11
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x41 &&
    buffer[10] === 0x56 &&
    buffer[11] === 0x45
  ) {
    return true;
  }

  // MP3 ID3: 0x49 0x44 0x33
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return true;
  }

  // MP3 sync frame: 0xFF seguido de 0xE0+ (p. ej. 0xFB, 0xF3, 0xF2)
  if (buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0) {
    return true;
  }

  // OggS: 0x4F 0x67 0x67 0x53
  if (
    buffer[0] === 0x4f &&
    buffer[1] === 0x67 &&
    buffer[2] === 0x67 &&
    buffer[3] === 0x53
  ) {
    return true;
  }

  // fLaC: 0x66 0x4C 0x61 0x43
  if (
    buffer[0] === 0x66 &&
    buffer[1] === 0x4c &&
    buffer[2] === 0x61 &&
    buffer[3] === 0x43
  ) {
    return true;
  }

  // M4A / MP4 (ftyp en offset 4): 0x66 0x74 0x79 0x70
  if (
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return true;
  }

  // WebM / Matroska EBML: 0x1A 0x45 0xDF 0xA3
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return true;
  }

  return false;
}

export function sanitizeFileName(rawName: string): string {
  // Prevenir path traversal eliminando separadores y caracteres peligrosos
  const base = rawName.replace(/^.*[\\\/]/, "").trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._\-]/g, "_");
  return cleaned || "audio_file";
}

export function validateAudioUpload(
  input: AudioFileValidationInput,
  maxSizeBytes: number
): AudioValidationResult {
  const sanitizedFileName = sanitizeFileName(input.originalName);
  const parts = sanitizedFileName.split(".");
  const extension = parts.length > 1 ? parts.pop()!.toLowerCase() : "";

  if (input.sizeBytes <= 0) {
    return {
      isValid: false,
      sanitizedFileName,
      extension,
      errorMessage: "El archivo de audio está vacío."
    };
  }

  if (input.sizeBytes > maxSizeBytes) {
    return {
      isValid: false,
      sanitizedFileName,
      extension,
      errorMessage: `El archivo supera el tamaño máximo permitido (${Math.round(maxSizeBytes / (1024 * 1024))} MB).`
    };
  }

  if (!ALLOWED_AUDIO_EXTENSIONS.has(extension)) {
    return {
      isValid: false,
      sanitizedFileName,
      extension,
      errorMessage: `Extensión no permitida (.${extension}). Formatos válidos: wav, mp3, m4a, ogg, flac, webm.`
    };
  }

  if (input.mimeType && !ALLOWED_MIME_TYPES.has(input.mimeType.toLowerCase())) {
    return {
      isValid: false,
      sanitizedFileName,
      extension,
      errorMessage: `Tipo MIME '${input.mimeType}' no admitido.`
    };
  }

  if (input.buffer && input.buffer.length > 0) {
    const validMagic = validateMagicBytes(input.buffer);
    if (!validMagic) {
      return {
        isValid: false,
        sanitizedFileName,
        extension,
        errorMessage: "Los datos binarios no coinciden con un formato de audio válido (magic bytes inválidos)."
      };
    }
  }

  return {
    isValid: true,
    sanitizedFileName,
    extension
  };
}
