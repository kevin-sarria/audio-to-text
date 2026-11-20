import { GeneratedMeetingData } from "../../../domain/services/IMeetingAnalysisService.js";
import { ExtractionPointDto } from "../MeetingAnalysisResponseParser.js";
import { TranscriptIndex, TranscriptSegment, normalizeText, parseCitedSeconds } from "../TranscriptIndex.js";
import { AMBIGUOUS_CHANNEL_TERMS } from "../glossary/ProjectGlossary.js";

export interface MatrixItem {
  sec: number;
  timestamp: string;
  text: string;
  startSec: number;
  endSec: number;
}

const MATRIX_START_REGEX = /^(?:.{0,35}\b)?(se requiere|se identifico|se evidencio)\b/i;

const CODE_REQUEST_REGEX =
  /(?:se requiere (?:habilitar|implementar|incorporar|crear|agregar)|cambiar el nombre|permita (?:seleccionar|exportar|reprogramar|eliminar)|que tengan la opci[oó]n)/i;

const CLOSURE_PHRASE_REGEX =
  /(?:cerr(?:ar|ado|ada)|doy solucionad|solucionad|resuelt|implementad|ya (?:esta|quedo|se habia|se ha) (?:list|hech|funcionando)|ya se (?:actualiz|solucion|corrig|habia hecho)|\btambien\.?$)/i;

const TIME_REGEX =
  /\b(?:\d{1,2}:\d{2}(?:\s*(?:a\.?\s*m\.?|p\.?\s*m\.?))?|\d{1,2}\s*(?:a\.?\s*m\.?|p\.?\s*m\.?))/gi;

function fmt(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function first8(text: string): string {
  return (text || "").trim().split(/\s+/).slice(0, 8).join(" ");
}

/**
 * Detecta los ítems leídos de la matriz de hallazgos en la transcripción (Regla 23).
 * Inicios = segmentos cuyo texto normalizado contiene 'se requiere', 'se identifico' o 'se evidencio'
 * (NO 'se solicita' ni 'asimismo'), más los timestamp de los puntos de extracción (si se pasan).
 * Ordena y deduplica inicios a menos de 5 s. Tramo: [inicio - 5 s, min(inicio + 45 s, siguiente inicio)).
 */
export function detectMatrixItems(
  transcript: string,
  extractionPoints?: ExtractionPointDto[]
): MatrixItem[] {
  const index = new TranscriptIndex(transcript || "");
  const rawInicios: Array<{ sec: number; text: string }> = [];

  for (const seg of index.segments) {
    if (seg.norm.includes("asimismo") || seg.norm.includes("se solicita")) continue;
    if (MATRIX_START_REGEX.test(seg.norm)) {
      rawInicios.push({ sec: seg.sec, text: seg.text });
    }
  }

  if (extractionPoints && extractionPoints.length > 0) {
    for (const pt of extractionPoints) {
      if (!pt.timestamp) continue;
      const m = pt.timestamp.match(/^(\d{1,3}):(\d{2})$/);
      if (m && m[1] && m[2]) {
        const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        rawInicios.push({ sec, text: pt.cita || "" });
      }
    }
  }

  rawInicios.sort((a, b) => a.sec - b.sec);

  // Deduplicar inicios a menos de 5 s
  const deduped: Array<{ sec: number; text: string }> = [];
  for (const item of rawInicios) {
    if (deduped.length === 0) {
      deduped.push(item);
    } else {
      const prev = deduped[deduped.length - 1]!;
      if (item.sec - prev.sec >= 5) {
        deduped.push(item);
      }
    }
  }

  const items: MatrixItem[] = [];
  for (let i = 0; i < deduped.length; i++) {
    const cur = deduped[i]!;
    const next = deduped[i + 1];
    const inicio = cur.sec;
    const startSec = Math.max(0, inicio - 5);
    const endSec = next ? Math.min(inicio + 45, next.sec) : inicio + 45;
    const segMatch = index.segments.find((s) => Math.abs(s.sec - inicio) <= 2);
    const text = cur.text || segMatch?.text || "";

    items.push({
      sec: inicio,
      timestamp: fmt(inicio),
      text,
      startSec,
      endSec
    });
  }

  return items;
}

export class MeetingAnalysisV9Validators {
  public static validateErrors(
    data: GeneratedMeetingData,
    transcript: string | undefined,
    errors: string[],
    extractionPoints?: ExtractionPointDto[]
  ): void {
    const rawTranscript = transcript || "";
    const index = new TranscriptIndex(rawTranscript);
    const matrixItems = detectMatrixItems(rawTranscript, extractionPoints);

    // Mapeo de destinos por ítem de la matriz
    const matrixDestinations = new Map<
      number,
      {
        alreadyResolved: string[];
        inProgress: string[];
        keyDecisions: string[];
        backlog: string[];
        issues: Array<{ id: string; title: string }>;
      }
    >();

    for (const item of matrixItems) {
      matrixDestinations.set(item.sec, {
        alreadyResolved: [],
        inProgress: [],
        keyDecisions: [],
        backlog: [],
        issues: []
      });
    }

    const assignToItems = (
      citedSecs: number[],
      category: "alreadyResolved" | "inProgress" | "keyDecisions" | "backlog",
      entry: string
    ) => {
      for (const cSec of citedSecs) {
        for (const item of matrixItems) {
          if (cSec >= item.startSec && cSec <= item.endSec) {
            matrixDestinations.get(item.sec)![category].push(entry);
          }
        }
      }
    };

    for (const r of data.alreadyResolved || []) {
      assignToItems(parseCitedSeconds(r), "alreadyResolved", r);
    }
    for (const p of data.inProgress || []) {
      assignToItems(parseCitedSeconds(p), "inProgress", p);
    }
    for (const d of data.keyDecisions || []) {
      assignToItems(parseCitedSeconds(d), "keyDecisions", d);
    }
    for (const b of data.backlog || []) {
      assignToItems(parseCitedSeconds(b), "backlog", b);
    }
    for (const issue of data.issues || []) {
      const issueText = `${issue.title || ""} ${issue.description || ""} ${(issue.acceptanceCriteria || []).join(" ")}`;
      const cited = parseCitedSeconds(issueText);
      for (const cSec of cited) {
        for (const item of matrixItems) {
          if (cSec >= item.startSec && cSec <= item.endSec) {
            matrixDestinations.get(item.sec)!.issues.push({ id: issue.id, title: issue.title || "" });
          }
        }
      }
    }

    // 1. Cobertura de la matriz: al menos una salida por ítem y no salidas incompatibles
    for (const item of matrixItems) {
      const dest = matrixDestinations.get(item.sec)!;
      const totalDestinations =
        dest.alreadyResolved.length +
        dest.inProgress.length +
        dest.keyDecisions.length +
        dest.backlog.length +
        dest.issues.length;

      if (totalDestinations === 0) {
        errors.push(
          `El ítem leído en [${item.timestamp}] ("${first8(item.text)}") no tiene salida (cerrado, en curso, issue, decisión o backlog) (Regla 23).`
        );
      }

      // Conflictos de salidas incompatibles
      const hasResolved = dest.alreadyResolved.length > 0;
      const hasInProgress = dest.inProgress.length > 0;
      const hasIssues = dest.issues.length > 0;
      const hasBacklog = dest.backlog.length > 0;

      if ((hasResolved && (hasInProgress || hasIssues || hasBacklog)) || (hasIssues && hasBacklog)) {
        errors.push(
          `El ítem leído en [${item.timestamp}] ("${first8(item.text)}") aparece en dos salidas incompatibles (Regla 23).`
        );
      }
    }

    // 2. Pedido de código sin issue: contiene pedido de código y no tiene issue ni salida alternativa
    for (const item of matrixItems) {
      const normText = normalizeText(item.text);
      if (CODE_REQUEST_REGEX.test(normText)) {
        const dest = matrixDestinations.get(item.sec)!;
        const hasIssue = dest.issues.length > 0;
        const hasOtherDest =
          dest.alreadyResolved.length > 0 || dest.inProgress.length > 0 || dest.backlog.length > 0;
        if (!hasIssue && !hasOtherDest) {
          errors.push(
            `El ítem leído en [${item.timestamp}] ("${first8(item.text)}") contiene un pedido de código pero no genera ningún issue de desarrollo (Regla 23).`
          );
        }
      }
    }

    // 3. Cerrado sin cierre: frase de cierre (no pregunta) a ±60 s o cierre explícito posterior
    const isQuestion = (s: TranscriptSegment) => s.text.trim().endsWith("?") || /¿no\?/i.test(s.text);
    const closures = index.findLaterClosures();

    for (const entry of data.alreadyResolved || []) {
      const cited = parseCitedSeconds(entry);
      if (cited.length === 0) continue; // sin marcas citadas se trata como aviso en validateWarnings

      const existingCited = cited.filter((sec) => index.timestampExists(sec));
      if (existingCited.length === 0) continue;

      const entryNorm = normalizeText(entry);
      const hasExplicitLater = closures.some((c) => entryNorm.includes(c.topic));
      const hasNearbyNonQuestion = existingCited.some((sec) =>
        index.segments.some(
          (s) => Math.abs(s.sec - sec) <= 60 && CLOSURE_PHRASE_REGEX.test(s.norm) && !isQuestion(s)
        )
      );

      if (!hasExplicitLater && !hasNearbyNonQuestion) {
        const nearbyQuestion = index.segments.find(
          (s) =>
            existingCited.some((sec) => Math.abs(s.sec - sec) <= 60) &&
            CLOSURE_PHRASE_REGEX.test(s.norm) &&
            isQuestion(s)
        );
        if (nearbyQuestion) {
          errors.push(
            `La entrada "${entry}" en Ya resuelto se marcó como resuelto pero la frase "${nearbyQuestion.text}" es una pregunta, no un cierre (Regla 21).`
          );
        } else {
          errors.push(
            `La entrada "${entry}" en Ya resuelto se marcó como resuelto sin frase de cierre en la transcripción (Regla 21).`
          );
        }
      }
    }

    // 4. Hora/cifra no respaldada en todo el texto de salida
    const textBlocks: Array<{ where: string; text: string }> = [
      { where: "el resumen", text: data.summary || "" },
      ...(data.alreadyResolved || []).map((r) => ({ where: `Ya resuelto ("${first8(r)}...")`, text: r })),
      ...(data.inProgress || []).map((p) => ({ where: `En curso ("${first8(p)}...")`, text: p })),
      ...(data.keyDecisions || []).map((d) => ({ where: `la decisión ("${first8(d)}...")`, text: d })),
      ...(data.backlog || []).map((b) => ({ where: `el backlog ("${first8(b)}...")`, text: b })),
      ...(data.globalOpenQuestions || []).map((q) => ({ where: `la pregunta ("${first8(q)}...")`, text: q })),
      ...(data.issues || []).flatMap((i) => [
        { where: `el issue [${i.id}] (descripción)`, text: `${i.title || ""} ${i.description || ""}` },
        { where: `el issue [${i.id}] (prompt de agente)`, text: i.agentPrompt || "" }
      ])
    ];

    for (const block of textBlocks) {
      if (block.text.includes("[Interpretación") || block.text.includes("[Supuesto]")) continue;
      // Remover marcas [mm:ss] entre corchetes
      const stripped = block.text.replace(/\[[^\]]*\d{1,2}:\d{2}[^\]]*\]/g, "");
      const citedSecs = parseCitedSeconds(block.text);

      TIME_REGEX.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TIME_REGEX.exec(stripped)) !== null) {
        const timeVal = m[0];
        const timeNorm = normalizeText(timeVal).replace(/\s+/g, "");

        const inNearbySegment =
          citedSecs.length > 0
            ? citedSecs.some((sec) =>
                index.segments.some(
                  (s) => Math.abs(s.sec - sec) <= 60 && normalizeText(s.text).replace(/\s+/g, "").includes(timeNorm)
                )
              )
            : index.segments.some((s) => normalizeText(s.text).replace(/\s+/g, "").includes(timeNorm));

        if (!inNearbySegment) {
          errors.push(
            `Se encontró la hora o cifra no respaldada "${timeVal}" en ${block.where} sin aparecer literal en la transcripción a ±60 s de la marca citada (Regla 23).`
          );
        }
      }
    }

    // 5. Resuelto y en curso a la vez / texto truncado
    for (const res of data.alreadyResolved || []) {
      if (res.trim().endsWith("…") || res.trim().endsWith("...")) {
        errors.push(`La entrada "${res}" en Ya resuelto termina con texto truncado ("...") (Regla 23).`);
      }
      const resSecs = parseCitedSeconds(res);
      for (const prog of data.inProgress || []) {
        const progSecs = parseCitedSeconds(prog);
        const overlap = resSecs.some((r) => progSecs.some((p) => Math.abs(r - p) <= 8));
        if (overlap) {
          errors.push(
            `El ítem con marca de tiempo cercana [${resSecs.map(fmt).join(", ")}] aparece como resuelto y en curso a la vez (Regla 23).`
          );
        }
      }
    }

    // 6. Canal ambiguo en issues de panel o app
    for (const issue of data.issues || []) {
      if (issue.repo !== "panel" && issue.repo !== "app") continue;
      const issueBody = `${issue.title || ""} ${issue.description || ""}`;
      const issueNorm = normalizeText(issueBody);
      const directMatch = AMBIGUOUS_CHANNEL_TERMS.some((re) => re.test(issueNorm));

      const cited = parseCitedSeconds(issueBody);
      const nearbyMatch = cited.some((sec) => {
        const seg = index.segments.find((s, idx) => {
          const next = index.segments[idx + 1];
          const end = next ? next.sec : s.sec + 30;
          return sec >= s.sec && sec < end;
        });
        return seg && AMBIGUOUS_CHANNEL_TERMS.some((re) => re.test(seg.norm));
      });

      if (directMatch || nearbyMatch) {
        errors.push(
          `El issue [${issue.id}] trata un requerimiento de canal ambiguo ("${issue.title}") que no debe ser issue de panel ni app (Regla 23).`
        );
      }
    }
  }

  public static validateWarnings(
    data: GeneratedMeetingData,
    transcript: string | undefined,
    warnings: string[],
    _extractionPoints?: ExtractionPointDto[]
  ): void {
    const rawTranscript = transcript || "";
    const index = new TranscriptIndex(rawTranscript);

    // Entrada de alreadyResolved sin marcas citadas
    for (const entry of data.alreadyResolved || []) {
      if (parseCitedSeconds(entry).length === 0) {
        warnings.push(`La entrada "${entry}" en Ya resuelto no contiene marcas de tiempo citadas (Regla 21).`);
      }
    }

    // 7. Nombre nuevo inventado en issues de renombre
    for (const issue of data.issues || []) {
      const titleNorm = normalizeText(issue.title || "");
      if (!titleNorm.includes("renombr") && !titleNorm.includes("cambiar el nombre")) continue;

      const issueText = `${issue.title || ""} ${issue.description || ""}`;
      const renameMatch = issueText.match(/(?:→|por)\s*["'“]([^"'”]+)["'”]/i);
      if (renameMatch && renameMatch[1]) {
        const proposedName = renameMatch[1].trim();
        const propNorm = normalizeText(proposedName);
        const hasTag = propNorm.includes("propuesto") || propNorm.includes("por definir");
        if (!hasTag && !index.containsAnywhere(proposedName)) {
          warnings.push(
            `El issue [${issue.id}] propone el nombre "${proposedName}" que no aparece literal en la transcripción sin rotularlo como 'PROPUESTO' o 'por definir' (Regla 23).`
          );
        }
      }
    }
  }
}
