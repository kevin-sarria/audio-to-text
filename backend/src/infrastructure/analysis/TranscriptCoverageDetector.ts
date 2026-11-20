export interface MissingAudioGap {
  startSec: number;
  endSec: number;
  label: string;
}

export interface CoverageReport {
  totalDurationSec: number;
  missingDurationSec: number;
  missingPct: number;
  coveragePct: number;
  gaps: MissingAudioGap[];
  isPartial: boolean;
}

export class TranscriptCoverageDetector {
  public static parseSeconds(mmSs: string): number {
    const parts = mmSs.split(":");
    if (parts.length !== 2) return 0;
    const min = parseInt(parts[0] || "0", 10);
    const sec = parseInt(parts[1] || "0", 10);
    return isNaN(min) || isNaN(sec) ? 0 : min * 60 + sec;
  }

  public static formatMmSs(totalSec: number): string {
    const min = Math.floor(Math.max(0, totalSec) / 60);
    const sec = Math.floor(Math.max(0, totalSec) % 60);
    return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }

  public static analyze(transcript: string): CoverageReport {
    if (!transcript || transcript.trim().length === 0) {
      return {
        totalDurationSec: 0,
        missingDurationSec: 0,
        missingPct: 0,
        coveragePct: 100,
        gaps: [],
        isPartial: false
      };
    }

    const rawGaps: { startSec: number; endSec: number }[] = [];
    const lines = transcript.split(/\r?\n/);
    const lineTimestamps: { sec: number; isMissing: boolean }[] = [];
    let maxSec = 0;

    const explicitMarkerRegex = /\[Audio no disponible[^\]]*\]/i;
    const rangeRegex = /(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/;
    const tsRegex = /\[(\d{1,2}:\d{2})\]/;

    for (const line of lines) {
      const tsMatch = line.match(tsRegex);
      const isMissing = explicitMarkerRegex.test(line);

      if (tsMatch && tsMatch[1]) {
        const sec = this.parseSeconds(tsMatch[1]);
        if (sec > maxSec) maxSec = sec;
        lineTimestamps.push({ sec, isMissing });
      }

      if (isMissing) {
        const rangeMatch = line.match(rangeRegex);
        if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
          const s = this.parseSeconds(rangeMatch[1]);
          const e = this.parseSeconds(rangeMatch[2]);
          if (e > s) {
            rawGaps.push({ startSec: s, endSec: e });
            if (e > maxSec) maxSec = e;
          }
        } else if (tsMatch && tsMatch[1]) {
          const s = this.parseSeconds(tsMatch[1]);
          rawGaps.push({ startSec: s, endSec: s + 180 });
          if (s + 180 > maxSec) maxSec = s + 180;
        }
      }
    }

    // Detectar saltos de más de 60 s entre marcas consecutivas de diálogo no cubiertos por marcadores explícitos
    const dialogueTimestamps = lineTimestamps.filter((t) => !t.isMissing);
    dialogueTimestamps.sort((a, b) => a.sec - b.sec);
    for (let i = 0; i < dialogueTimestamps.length - 1; i++) {
      const current = dialogueTimestamps[i];
      const next = dialogueTimestamps[i + 1];
      if (current && next && next.sec - current.sec > 60) {
        // Si ya hay un marcador explícito entre current y next, no crear un salto superpuesto
        const overlapsWithExplicit = rawGaps.some(
          (g) => Math.max(current.sec, g.startSec) < Math.min(next.sec, g.endSec)
        );
        if (!overlapsWithExplicit) {
          rawGaps.push({ startSec: current.sec, endSec: next.sec });
        }
      }
    }

    // Fusionar rangos superpuestos
    rawGaps.sort((a, b) => a.startSec - b.startSec);
    const mergedGaps: MissingAudioGap[] = [];

    for (const g of rawGaps) {
      const last = mergedGaps[mergedGaps.length - 1];
      if (last && g.startSec <= last.endSec) {
        last.endSec = Math.max(last.endSec, g.endSec);
        last.label = `${this.formatMmSs(last.startSec)}–${this.formatMmSs(last.endSec)}`;
      } else {
        mergedGaps.push({
          startSec: g.startSec,
          endSec: g.endSec,
          label: `${this.formatMmSs(g.startSec)}–${this.formatMmSs(g.endSec)}`
        });
      }
    }

    let missingDurationSec = 0;
    for (const g of mergedGaps) {
      missingDurationSec += g.endSec - g.startSec;
    }

    const totalDurationSec = Math.max(maxSec, missingDurationSec);
    const missingPct = totalDurationSec > 0 ? Math.min(100, Math.round((missingDurationSec / totalDurationSec) * 100)) : 0;
    const coveragePct = Math.max(0, 100 - missingPct);

    return {
      totalDurationSec,
      missingDurationSec,
      missingPct,
      coveragePct,
      gaps: mergedGaps,
      isPartial: mergedGaps.length > 0
    };
  }

  public static isInsideGap(sec: number, gaps: MissingAudioGap[]): MissingAudioGap | null {
    for (const g of gaps) {
      if (sec >= g.startSec && sec <= g.endSec) {
        return g;
      }
    }
    return null;
  }

  public static isNearGapStart(sec: number, gaps: MissingAudioGap[], windowSec: number = 30): MissingAudioGap | null {
    for (const g of gaps) {
      if (sec >= g.startSec - windowSec && sec <= g.startSec) {
        return g;
      }
    }
    return null;
  }
}
