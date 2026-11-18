import { describe, it, expect } from "vitest";
import {
  validateAudioUpload,
  validateMagicBytes,
  sanitizeFileName
} from "../../interfaces/http/validators/upload.validator.js";

describe("Upload Validator & Magic Bytes Unit Tests", () => {
  const maxBytes = 50 * 1024 * 1024; // 50MB

  it("sanitiza nombres previniendo path traversal y caracteres maliciosos", () => {
    const maliciousName = "../../../etc/passwd";
    expect(sanitizeFileName(maliciousName)).toBe("passwd");

    const windowsPath = "..\\..\\Windows\\System32\\cmd.exe";
    expect(sanitizeFileName(windowsPath)).toBe("cmd.exe");

    const complexName = "mi audio (reunión #1) [final]!.mp3";
    const cleaned = sanitizeFileName(complexName);
    expect(cleaned).not.toContain("!");
    expect(cleaned).not.toContain("#");
  });

  it("reconoce magic bytes válidos para WAV, MP3, OGG y FLAC", () => {
    // Buffer WAV: RIFF....WAVE
    const wavBuffer = Buffer.alloc(16);
    wavBuffer.write("RIFF", 0);
    wavBuffer.write("WAVE", 8);
    expect(validateMagicBytes(wavBuffer)).toBe(true);

    // Buffer MP3 con tag ID3
    const mp3Id3Buffer = Buffer.alloc(16);
    mp3Id3Buffer.write("ID3", 0);
    expect(validateMagicBytes(mp3Id3Buffer)).toBe(true);

    // Buffer OGG: OggS
    const oggBuffer = Buffer.alloc(16);
    oggBuffer.write("OggS", 0);
    expect(validateMagicBytes(oggBuffer)).toBe(true);

    // Buffer FLAC: fLaC
    const flacBuffer = Buffer.alloc(16);
    flacBuffer.write("fLaC", 0);
    expect(validateMagicBytes(flacBuffer)).toBe(true);
  });

  it("rechaza archivos con magic bytes falsificados o inválidos (p. ej. PDF renombrado a .mp3)", () => {
    const fakeMp3 = Buffer.from("%PDF-1.4 Fake audio payload with invalid magic bytes");
    expect(validateMagicBytes(fakeMp3)).toBe(false);

    const validation = validateAudioUpload(
      {
        originalName: "malicioso.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: fakeMp3.length,
        buffer: fakeMp3
      },
      maxBytes
    );

    expect(validation.isValid).toBe(false);
    expect(validation.errorMessage).toContain("magic bytes inválidos");
  });

  it("rechaza extensiones no permitidas y archivos que superen el límite de tamaño", () => {
    const validWav = Buffer.alloc(16);
    validWav.write("RIFF", 0);
    validWav.write("WAVE", 8);

    // Extensión no permitida
    const invalidExt = validateAudioUpload(
      {
        originalName: "script.sh",
        mimeType: "text/x-shellscript",
        sizeBytes: 100,
        buffer: validWav
      },
      maxBytes
    );
    expect(invalidExt.isValid).toBe(false);
    expect(invalidExt.errorMessage).toContain("Extensión no permitida");

    // Tamaño excedido
    const oversized = validateAudioUpload(
      {
        originalName: "giant.wav",
        mimeType: "audio/wav",
        sizeBytes: 60 * 1024 * 1024, // 60MB > 50MB
        buffer: validWav
      },
      maxBytes
    );
    expect(oversized.isValid).toBe(false);
    expect(oversized.errorMessage).toContain("supera el tamaño máximo");
  });
});
