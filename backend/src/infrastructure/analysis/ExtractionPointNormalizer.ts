import { ExtractionPointDto } from "./MeetingAnalysisResponseParser.js";
import { TranscriptIndex, normalizeText, stem } from "./TranscriptIndex.js";
import { TranscriptCoverageDetector } from "./TranscriptCoverageDetector.js";
import { ProjectProfile } from "./profiles/ProjectProfile.js";
import { DIAMANTE_PROFILE } from "./profiles/diamanteProfile.js";

/** Frase explícita de app/móvil en el segmento (regla A7). */
export const MOBILE_EVIDENCE_REGEX =
  /\b(app|aplicacion movil|aplicativo movil|la movil|el movil|desarrollo movil|celular|operario|supervisor movil|dispositivo)\b/;

/** Ventana de evidencia de app alrededor de la marca citada (sesgada hacia adelante). */
export const APP_EVIDENCE_BEFORE_SEC = 2;
export const APP_EVIDENCE_AFTER_SEC = 20;

/** El código del repo filtra/transforma/descarta el dato (excepción de gestion_externa, regla A4). */
const REPO_CODE_HANDLES_DATA = /\b(filtra|transforma|descarta|el codigo|nuestro codigo|la plataforma no (?:toma|muestra))\b/;

export interface NormalizationChange {
  pointId: string;
  change: string;
}

/**
 * Aplica por código las reglas sobre la extracción de la etapa 1, antes de que la
 * etapa 2 redacte issues.
 */
export class ExtractionPointNormalizer {
  public static normalize(
    points: ExtractionPointDto[],
    transcript: string,
    profile: ProjectProfile = DIAMANTE_PROFILE
  ): { points: ExtractionPointDto[]; changes: NormalizationChange[] } {
    const index = new TranscriptIndex(transcript, profile);
    const closures = index.findLaterClosures();
    const changes: NormalizationChange[] = [];
    const externalParties = profile.externalParties || [];
    const people = profile.people || [];
    const defaultChannel = profile.defaultChannel || "panel";

    const normalized = points.map((original) => {
      const p: ExtractionPointDto = { ...original, preguntas: [...(original.preguntas || [])] };
      const sec = TranscriptCoverageDetector.parseSeconds(p.timestamp || "");
      const citaNorm = normalizeText(p.cita || "");
      const segmentText = index.isEmpty ? citaNorm : `${citaNorm} ${index.windowText(sec, 30, 30)}`;

      // Desestimar cierres aportados por el modelo que sean preguntas
      const closureCitaCandidate = p.cierre_posterior?.cita || (p as any).cierre?.frase;
      if (
        closureCitaCandidate &&
        (closureCitaCandidate.trim().endsWith("?") || /¿no\?/i.test(closureCitaCandidate))
      ) {
        changes.push({ pointId: p.id, change: `cierre descartado (pregunta: "${closureCitaCandidate}")` });
        p.cierre_posterior = null;
        if ((p as any).cierre) (p as any).cierre = null;
      }

      // Cierre posterior del mismo tema → cerrado, sin issue ni pregunta.
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

      // Dependencia de un tercero → gestion_externa (salvo que el código del repo filtre el dato).
      const external = externalParties.find((party) => citaNorm.includes(normalizeText(party)));
      if (external && p.accion === "codigo" && !REPO_CODE_HANDLES_DATA.test(citaNorm)) {
        changes.push({ pointId: p.id, change: `accion codigo → gestion_externa (depende de "${external}")` });
        p.accion = "gestion_externa";
        if (p.clase === "nuevo") p.clase = "en_curso";
      }

      // Responsable solo si se nombra en el segmento; nunca "Hablante N" ni personas marcadas neverResponsible.
      if (p.quien_lo_lleva) {
        const who = p.quien_lo_lleva.trim();
        const person = people.find((gp) => normalizeText(gp.name) === normalizeText(who));
        const namedInSegment = index.isEmpty || segmentText.includes(normalizeText(who));
        if (/^hablante\s*\d+$/i.test(who) || person?.neverResponsible || !namedInSegment) {
          changes.push({ pointId: p.id, change: `quien_lo_lleva "${who}" → null (no se nombra como responsable en el segmento)` });
          p.quien_lo_lleva = null;
        }
      }

      // App solo con frase explícita de app en el segmento; si no, canal por defecto
      const appWindow = `${citaNorm} ${index.windowText(sec, APP_EVIDENCE_BEFORE_SEC, APP_EVIDENCE_AFTER_SEC)}`;
      if (p.repo === "app" && !index.isEmpty && !MOBILE_EVIDENCE_REGEX.test(appWindow)) {
        changes.push({ pointId: p.id, change: `repo app → ${defaultChannel} (sin frase explícita de app en el segmento)` });
        p.repo = defaultChannel as any;
      }

      // Pregunta solo es BLOQUEANTE con issue bloqueado + "si me equivoco",
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

  public static closedTopics(transcript: string, profile: ProjectProfile = DIAMANTE_PROFILE): string[] {
    return new TranscriptIndex(transcript, profile).findLaterClosures().map((c) => stem(c.topic));
  }
}
