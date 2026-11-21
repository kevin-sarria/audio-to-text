import {
  ProjectContextScanResultDto,
  ProjectContextScanReportDto
} from "@audio-to-text/shared";
import { buildInventory, ProjectInventory } from "./ProjectInventory.js";
import { ScanBudget } from "./ScanBudget.js";
import { readDocuments } from "./DocumentReader.js";
import {
  parseScanResponse,
  findIncompleteSections,
  ScanResponse,
  SCAN_SECTIONS,
  ScanSectionKey
} from "./ContextScanSchema.js";
import {
  buildScanSystemPrompt,
  buildScanUserPrompt,
  buildRetryPrompt,
  buildMissingSectionsPrompt,
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryUserPrompt
} from "./ContextScanPrompts.js";
import { verifyScanResponse } from "./SourceVerifier.js";
import { refineTopics } from "./TopicRefiner.js";
import { renderTechnicalContext } from "./ContextScanRenderer.js";
import { redactSecrets } from "./SecretRedactor.js";
import { extractWarningHints } from "./WarningHints.js";

export type LlmCallFn = (
  systemPrompt: string,
  userPrompt: string
) => Promise<string>;

export interface ContextScanRunOptions {
  budget: ScanBudget;
  providerLabel: string;
  model: string;
  /** Modelo que se pidió, si el proveedor usó otro (se muestra en el encabezado). */
  requestedModel?: string;
  useGit?: boolean;
}

export async function runContextScan(
  rootPath: string,
  llm: LlmCallFn,
  options: ContextScanRunOptions
): Promise<ProjectContextScanResultDto> {
  let llmCallsCount = 0;
  let accumulatedRedactions = 0;

  // 1. Inventario determinístico
  const inventory = buildInventory(rootPath, { useGit: options.useGit });

  // 2. Lectura y resumen de documentos
  const summarizeFn = async (
    fileLabel: string,
    sectionTitle: string,
    text: string
  ): Promise<string> => {
    llmCallsCount++;
    // El texto llega ya redactado desde DocumentReader; buildSummaryUserPrompt vuelve a redactar por seguridad.
    const userPrompt = buildSummaryUserPrompt(fileLabel, sectionTitle, text);
    const raw = await llm(SUMMARY_SYSTEM_PROMPT, userPrompt);
    try {
      let cleaned = raw.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }
      const firstB = cleaned.indexOf("{");
      const lastB = cleaned.lastIndexOf("}");
      if (firstB !== -1 && lastB !== -1) {
        cleaned = cleaned.slice(firstB, lastB + 1);
      }
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.hechos)) {
        return parsed.hechos.map((h: string) => `- ${h}`).join("\n");
      }
    } catch {}
    return raw;
  };

  const { contents, readLog, redactions: docRedactions } = await readDocuments(
    rootPath,
    inventory.documents,
    options.budget,
    summarizeFn,
    inventory.identicalDocuments
  );

  // Pistas deterministas para la sección «Trampas»
  const hints = extractWarningHints(rootPath, inventory.documents);

  // 3. Prompt principal
  const systemPrompt = buildScanSystemPrompt();
  const userPrompt = buildScanUserPrompt(inventory, contents, readLog, hints);

  // Secretos ocultos: los de los documentos (contados antes de redactar) más los del inventario.
  accumulatedRedactions += docRedactions;
  accumulatedRedactions += redactSecrets(JSON.stringify(inventory.deployment) + JSON.stringify(inventory.repositories)).redactions;

  llmCallsCount++;
  const rawMainResponse = await llm(systemPrompt, userPrompt);

  // 4. Parsear respuesta con 1 reintento si falla
  let parseResult = parseScanResponse(rawMainResponse);
  let scanData: ScanResponse;

  if (!parseResult.ok) {
    llmCallsCount++;
    const retryPrompt = buildRetryPrompt(rawMainResponse, parseResult.error);
    // Los proveedores no guardan la conversación: se reenvían los datos junto con la corrección.
    const retryResponse = await llm(systemPrompt, `${userPrompt}

${retryPrompt}`);
    parseResult = parseScanResponse(retryResponse);

    if (!parseResult.ok) {
      throw new Error(
        `La IA no devolvió un JSON válido para el contexto: ${parseResult.error}`
      );
    }
  }

  scanData = parseResult.data;

  // 5. Secciones incompletas: 1 re-pedido si hay alguna
  const incompleteKeys = findIncompleteSections(scanData);
  if (incompleteKeys.length > 0) {
    llmCallsCount++;
    const missingPrompt = buildMissingSectionsPrompt(incompleteKeys);
    try {
      const missingRaw = await llm(systemPrompt, `${userPrompt}

${missingPrompt}`);
      const missingParsed = parseScanResponse(missingRaw);

      if (missingParsed.ok) {
        const partialData = missingParsed.data;
        for (const k of incompleteKeys) {
          if (k === "glosario") {
            const items = partialData.secciones.glosario;
            if (Array.isArray(items) && items.length > 0) {
              scanData.secciones.glosario = items;
            }
          } else {
            const items = (partialData.secciones as any)[k];
            if (Array.isArray(items) && items.length > 0) {
              (scanData.secciones as any)[k] = items;
            }
          }
          if (partialData.no_encontrado?.includes(k)) {
            if (!scanData.no_encontrado.includes(k)) {
              scanData.no_encontrado.push(k);
            }
          }
        }
      } else {
        // Si no parsea, las secciones incompletas pasan a no_encontrado
        for (const k of incompleteKeys) {
          if (!scanData.no_encontrado.includes(k)) {
            scanData.no_encontrado.push(k);
          }
        }
      }
    } catch {
      for (const k of incompleteKeys) {
        if (!scanData.no_encontrado.includes(k)) {
          scanData.no_encontrado.push(k);
        }
      }
    }

    // Lo que siga incompleto después de la llamada pasa a no_encontrado
    const stillIncomplete = findIncompleteSections(scanData);
    for (const k of stillIncomplete) {
      if (!scanData.no_encontrado.includes(k)) {
        scanData.no_encontrado.push(k);
      }
    }
  }

  // 6. Temas: las líneas que nombran el tema sin dar el dato se re-piden una vez
  const refinement = await refineTopics(scanData, inventory, rootPath, llm, systemPrompt, userPrompt);
  if (refinement.called) llmCallsCount++;
  scanData = refinement.data;

  // 7. Verificación final por cita; lo que siga siendo tema se descarta
  const { data: verifiedData, stats, discarded } = verifyScanResponse(scanData, inventory, rootPath, {
    discardTopics: true
  });
  const topicRate =
    refinement.firstAnswerFacts === 0
      ? 0
      : Math.round((refinement.firstAnswerTopics / refinement.firstAnswerFacts) * 1000) / 10;

  // 7. Construcción preliminar del reporte para pasar al renderer
  const notFoundTitles = verifiedData.no_encontrado.map((k) => {
    const sec = SCAN_SECTIONS.find((s) => s.key === k);
    return sec ? sec.title : k;
  });

  const report: ProjectContextScanReportDto = {
    generatedAt: inventory.generatedAt,
    providerLabel: options.providerLabel,
    model: options.model,
    requestedModel: options.requestedModel,
    layout: inventory.layout,
    repositories: inventory.repositories.map((r) => ({
      path: r.path,
      name: r.name,
      headCommit: r.headCommit,
      branch: r.branch,
      kind: r.kind
    })),
    otherFolders: inventory.otherFolders.map((f) => ({
      path: f.path,
      kind: f.kind,
      ownerPath: f.ownerPath,
      branch: f.branch,
      lastModified: f.lastModified,
      notes: f.notes
    })),
    readLog,
    notFullyRead: readLog.filter((l) => l.status === "sections" || l.status === "omitted").map((l) => l.path),
    verification: {
      verified: stats.verified,
      deduced: stats.deduced,
      unconfirmed: stats.unconfirmed,
      discarded: stats.discarded,
      topicRateFirstAnswer: topicRate,
      topicsDiscarded: discarded.filter((d) => d.reason === "nombra el tema sin dar el dato").length,
      topicsReplaced: refinement.replacementsAdded
    },
    discarded: discarded.map((d) => ({
      section: d.section,
      dato: d.dato,
      fuente: d.fuente,
      reason: d.reason
    })),
    openQuestions: verifiedData.secciones.preguntas_abiertas || [],
    contradictions: (verifiedData.secciones.contradicciones || []).length,
    notFound: notFoundTitles,
    redactions: accumulatedRedactions,
    skippedSecretFiles: inventory.skipped.filter((s) => s.reason === "secret").length,
    llmCalls: llmCallsCount
  };

  // 8. Renderizado final a Markdown
  // El contexto se guarda y se envía al proveedor en cada generación de issues: también se redacta.
  const technicalContext = redactSecrets(renderTechnicalContext(verifiedData, inventory, report, hints)).text;

  return {
    technicalContext,
    report
  };
}
