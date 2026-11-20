/** Extensiones de audio aceptadas por el sistema (fuente única para validación y claves de almacenamiento). */
export const ALLOWED_AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  "wav",
  "mp3",
  "m4a",
  "ogg",
  "flac",
  "webm"
]);

/** Extensión neutra usada cuando el nombre original no trae una extensión permitida. */
export const FALLBACK_AUDIO_EXTENSION = "audio";

/**
 * Devuelve la extensión del nombre si está en la lista permitida; si no, la extensión neutra.
 * Nunca devuelve separadores de ruta ni "..", así que es segura para construir claves de almacenamiento.
 */
export function safeAudioExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return FALLBACK_AUDIO_EXTENSION;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return ALLOWED_AUDIO_EXTENSIONS.has(ext) ? ext : FALLBACK_AUDIO_EXTENSION;
}
