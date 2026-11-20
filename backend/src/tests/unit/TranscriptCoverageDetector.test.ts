import { describe, it, expect } from "vitest";
import { TranscriptCoverageDetector } from "../../infrastructure/analysis/TranscriptCoverageDetector.js";

describe("TranscriptCoverageDetector", () => {
  it("reporta 100% de cobertura en una transcripción continua", () => {
    const transcript = `[00:10] Hablante 1: Inicio de la reunión.
[00:30] Hablante 2: Continuamos con el orden del día.
[01:00] Hablante 1: Todo marcha en orden.`;

    const report = TranscriptCoverageDetector.analyze(transcript);
    expect(report.isPartial).toBe(false);
    expect(report.coveragePct).toBe(100);
    expect(report.missingPct).toBe(0);
    expect(report.gaps).toHaveLength(0);
  });

  it("detecta tramos con marcador explícito de audio no disponible y calcula el porcentaje", () => {
    // 45 minutos en total ([00:00] a [45:00] = 2700s), con 18 minutos perdidos (1080s)
    const transcript = `[00:00] Hablante 1: Inicio.
[01:00] Hablante 1: Punto inicial.
[02:00] Hablante 1: Punto previo.
[03:00] [Audio no disponible en este tramo por congestión temporal de servidores: 03:00–06:00]
[06:05] Hablante 1: Reanudamos.
[07:00] Hablante 2: Dimensionamiento.
[08:00] Hablante 1: Indicadores.
[09:00] Hablante 2: Formularios.
[10:00] Hablante 1: Validación.
[11:00] Hablante 2: Ajustes.
[12:00] Hablante 1: Módulos.
[13:00] Hablante 2: Pruebas.
[14:00] Hablante 1: Previo a corte 2.
[14:30] Hablante 2: Listo para pausar.
[15:00] [Audio no disponible en este tramo por congestión temporal de servidores: 15:00–18:00]
[18:05] Hablante 2: Seguimos.
[19:00] Hablante 1: Turnos.
[20:00] Hablante 2: Horarios.
[21:00] Hablante 1: Asignaciones.
[22:00] Hablante 2: Validando.
[23:00] Hablante 1: Previo a corte 3.
[23:30] Hablante 2: Pausa.
[24:00] [Audio no disponible en este tramo por congestión temporal de servidores: 24:00–27:00]
[27:05] Hablante 1: Continuando.
[28:00] Hablante 2: Casi al final.
[29:00] Hablante 1: Preparando cierre.
[29:30] Hablante 2: Pausa 4.
[30:00] [Audio no disponible en este tramo por congestión temporal de servidores: 30:00–39:00]
[39:05] Hablante 2: Cierre final.
[40:00] Hablante 1: Comentarios.
[41:00] Hablante 2: Revisión.
[42:00] Hablante 1: Aprobaciones.
[43:00] Hablante 2: Todo listo.
[44:00] Hablante 1: Agradecimientos.
[45:00] Hablante 1: Fin de la reunión.`;

    const report = TranscriptCoverageDetector.analyze(transcript);
    expect(report.isPartial).toBe(true);
    expect(report.gaps).toHaveLength(4);
    expect(report.gaps[0]?.label).toBe("03:00–06:00");
    expect(report.gaps[3]?.label).toBe("30:00–39:00");

    // 18 min de 45 min = 40% faltante -> 60% cobertura
    expect(report.missingPct).toBe(40);
    expect(report.coveragePct).toBe(60);
  });

  it("detecta saltos mayores a 60 segundos entre marcas de tiempo", () => {
    const transcript = `[01:00] Hablante 1: Punto A.
[04:30] Hablante 2: Punto B tras salto de 3 minutos y medio.`;

    const report = TranscriptCoverageDetector.analyze(transcript);
    expect(report.isPartial).toBe(true);
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0]?.label).toBe("01:00–04:30");
  });

  it("identifica si una marca cae dentro de un tramo sin audio o a menos de 30s del inicio", () => {
    const gaps = [{ startSec: 180, endSec: 360, label: "03:00–06:00" }];

    // 04:00 (240s) está dentro del hueco 03:00-06:00
    expect(TranscriptCoverageDetector.isInsideGap(240, gaps)).not.toBeNull();
    // 02:00 (120s) NO está dentro del hueco
    expect(TranscriptCoverageDetector.isInsideGap(120, gaps)).toBeNull();

    // 02:45 (165s) está a 15s antes del inicio del hueco (180s)
    expect(TranscriptCoverageDetector.isNearGapStart(165, gaps, 30)).not.toBeNull();
    // 01:00 (60s) NO está a menos de 30s
    expect(TranscriptCoverageDetector.isNearGapStart(60, gaps, 30)).toBeNull();
  });
});
