import { ExtractionPointDto } from "./MeetingAnalysisResponseParser.js";
import { TranscriptIndex, normalizeText, stem } from "./TranscriptIndex.js";
import { TranscriptCoverageDetector } from "./TranscriptCoverageDetector.js";
import { EXTERNAL_PARTIES, GLOSSARY_PEOPLE } from "./glossary/ProjectGlossary.js";

/** Frase explícita de app/móvil en el segmento (regla 7 y 22). */
export const MOBILE_EVIDENCE_REGEX =
  /\b(app|aplicacion movil|aplicativo movil|la movil|el movil|desarrollo movil|celular|operario|supervisor movil|dispositivo)\b/;

/** Ventana de evidencia de app alrededor de la marca citada (sesgada hacia adelante). */
export const APP_EVIDENCE_BEFORE_SEC = 2;
export const APP_EVIDENCE_AFTER_SEC = 20;

/** El código del repo filtra/transforma/descarta el dato (excepción de gestion_externa, regla 6). */
const REPO_CODE_HANDLES_DATA = /\b(filtra|transforma|descarta|el codigo|nuestro codigo|la plataforma no (?:toma|muestra))\b/;

export interface NormalizationChange {
  pointId: string;
  change: string;
}

/**
 * Aplica por código las reglas 6, 7, 21 y 22 sobre la extracción de la etapa 1, antes de que la
 * etapa 2 redacte issues. El objetivo es que un error de clasificación del modelo no llegue a
 * convertirse en un issue (los validadores de la etapa 2 siguen actuando como red de seguridad).
 */
export class ExtractionPointNormalizer {
  public static normalize(
    points: ExtractionPointDto[],
    transcript: string
  ): { points: ExtractionPointDto[]; changes: NormalizationChange[] } {
    const index = new TranscriptIndex(transcript);
    const closures = index.findLaterClosures();
    const changes: NormalizationChange[] = [];

    const normalized = points.map((original) => {
      const p: ExtractionPointDto = { ...original, preguntas: [...(original.preguntas || [])] };
      const sec = TranscriptCoverageDetector.parseSeconds(p.timestamp || "");
      const citaNorm = normalizeText(p.cita || "");
      const segmentText = index.isEmpty ? citaNorm : `${citaNorm} ${index.windowText(sec, 30, 30)}`;

      // Regla 21 (v9): desestimar cierres aportados por el modelo que sean preguntas
      if (
        p.cierre_posterior?.cita &&
        (p.cierre_posterior.cita.trim().endsWith("?") || /¿no\?/i.test(p.cierre_posterior.cita))
      ) {
        changes.push({ pointId: p.id, change: `cierre descartado (pregunta: "${p.cierre_posterior.cita}")` });
        p.cierre_posterior = null;
      }

      // Regla 21: cierre posterior del mismo tema → cerrado, sin issue ni pregunta.
      // Vale tanto el cierre detectado por código como el que el propio modelo registró.
      // Un punto de renombre sin nombre nuevo nunca se cierra por un cierre implícito (sin tema).
      const isRename = citaNorm.includes("cambiar el nombre") || citaNorm.includes("renombr");
      const closure = closures.find((c) => c.sec >= sec - 5 && citaNorm.includes(c.topic));
      let closureCita: string | null = null;
      if (closure) {
        if (!isRename || /\b(asignacion|llamados?|renombr|nombre)\b/i.test(normalizeText(closure.cita))) {
          closureCita = closure.cita;
        }
      }
      if (!closureCita && p.cierre_posterior?.cita) {
        if (!isRename || /\b(asignacion|llamados?|renombr|nombre)\b/i.test(normalizeText(p.cierre_posterior.cita))) {
          closureCita = p.cierre_posterior.cita;
        }
      }

      if (closureCita && p.clase !== "cerrado") {
        changes.push({ pointId: p.id, change: `clase ${p.clase} → cerrado (cierre posterior "${closureCita}")` });
        p.clase = "cerrado";
        p.preguntas = [];
      }

      // Regla 22: dependencia de un tercero → gestion_externa (salvo que el código del repo filtre el dato).
      const external = EXTERNAL_PARTIES.find((party) => citaNorm.includes(normalizeText(party)));
      if (external && p.accion === "codigo" && !REPO_CODE_HANDLES_DATA.test(citaNorm)) {
        changes.push({ pointId: p.id, change: `accion codigo → gestion_externa (depende de "${external}")` });
        p.accion = "gestion_externa";
        if (p.clase === "nuevo") p.clase = "en_curso";
      }

      // Regla 22: responsable solo si se nombra en el segmento; nunca "Hablante N" ni personas marcadas.
      if (p.quien_lo_lleva) {
        const who = p.quien_lo_lleva.trim();
        const person = GLOSSARY_PEOPLE.find((gp) => normalizeText(gp.name) === normalizeText(who));
        const namedInSegment = index.isEmpty || segmentText.includes(normalizeText(who));
        if (/^hablante\s*\d+$/i.test(who) || person?.neverResponsible || !namedInSegment) {
          changes.push({ pointId: p.id, change: `quien_lo_lleva "${who}" → null (no se nombra como responsable en el segmento)` });
          p.quien_lo_lleva = null;
        }
      }

      // Regla 7 y 22: app solo con frase explícita de app en el segmento; si no, el canal por defecto es el panel.
      // Ventana hacia adelante: una frase de app de la fila anterior no cuenta (regla 18; v8: "[30:23]
      // En el desarrollo móvil del operario…" pertenece a la fila previa, no a reprogramación).
      const appWindow = `${citaNorm} ${index.windowText(sec, APP_EVIDENCE_BEFORE_SEC, APP_EVIDENCE_AFTER_SEC)}`;
      if (p.repo === "app" && !index.isEmpty && !MOBILE_EVIDENCE_REGEX.test(appWindow)) {
        changes.push({ pointId: p.id, change: "repo app → panel (sin frase explícita de app en el segmento)" });
        p.repo = "panel";
      }

      // Regla 3: una pregunta solo es BLOQUEANTE con issue bloqueado + "si me equivoco",
      // y nunca si el punto está en curso o depende de un tercero.
      p.preguntas = (p.preguntas || []).map((q: any) => {
        if (!q || typeof q !== "object" || !q.bloqueante) return q;
        const invalid =
          !q.si_me_equivoco ||
          !String(q.si_me_equivoco).trim() ||
          p.clase !== "nuevo" ||
          p.accion !== "codigo";
        if (invalid) {
          changes.push({ pointId: p.id, change: "pregunta BLOQUEANTE → NO BLOQUEANTE" });
          return { ...q, bloqueante: false, bloquea_punto: null };
        }
        return q;
      });

      return p;
    });

    return { points: normalized, changes };
  }

  /** Temas cerrados más adelante en la reunión (regla 21), como raíces normalizadas. */
  public static closedTopics(transcript: string): string[] {
    return new TranscriptIndex(transcript).findLaterClosures().map((c) => stem(c.topic));
  }
}
