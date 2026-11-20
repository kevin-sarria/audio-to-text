/**
 * TranscriptSanitizer
 *
 * Detects and repairs transcripts corrupted with embedded JSON snippets
 * (e.g., from fallback parsers in transcription engines where JSON tokens like
 * "speaker", "start", "end", "text" leak into dialogue lines with artificial timestamps).
 */
export class TranscriptSanitizer {
  public static hasEmbeddedJson(transcript: string): boolean {
    if (!transcript) return false;
    return (
      (transcript.includes('"speaker"') || transcript.includes('"text"')) &&
      (transcript.includes('"start"') || transcript.includes('"end"') || transcript.includes('{"'))
    );
  }

  public static sanitize(transcript: string): string {
    if (!transcript || !this.hasEmbeddedJson(transcript)) {
      return transcript || "";
    }

    const lines = transcript.split(/\r?\n/);
    const sanitizedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        sanitizedLines.push("");
        continue;
      }

      // Check if line contains JSON artifacts
      const hasJsonTokens =
        (line.includes('"speaker"') || line.includes('"text"') || line.includes('"start"')) &&
        (line.includes('{') || line.includes('}') || line.includes(':'));

      if (hasJsonTokens) {
        // Extract timestamp and speaker header if present (e.g. "[12:00] Hablante 1:")
        const headerMatch = line.match(/^(\[\d{1,2}:\d{2}\](?:\s+[^:]+:)?)\s*(.*)$/);
        const header = (headerMatch ? headerMatch[1] : "") || "";
        const content = (headerMatch ? headerMatch[2] : line) || "";

        // Try extracting text fields from JSON
        const textMatches = Array.from(content.matchAll(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/g)) as RegExpMatchArray[];
        if (textMatches.length > 0) {
          const recovered = textMatches
            .map((m: RegExpMatchArray) => {
              try {
                return JSON.parse(`"${m[1]}"`);
              } catch {
                return m[1] || "";
              }
            })
            .join(" ")
            .trim();

          if (recovered) {
            sanitizedLines.push(header ? `${header} ${recovered}` : recovered);
          }
        } else {
          // Clean out raw JSON punctuation, keys and quotes
          const stripped = content
            .replace(/```(?:json)?/gi, "")
            .replace(/[{}[\]"]/g, "")
            .replace(/\b(?:speaker|start|end|text)\s*:\s*[^,}\n]+(?:,|})/gi, "")
            .replace(/\s+/g, " ")
            .trim();

          if (stripped.length > 0) {
            sanitizedLines.push(header ? `${header} ${stripped}` : stripped);
          }
        }
      } else {
        sanitizedLines.push(line);
      }
    }

    return sanitizedLines.join("\n");
  }
}
