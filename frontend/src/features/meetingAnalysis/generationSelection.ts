import type {
  AnalysisGenerationMetaDto,
  ProjectFolderDto,
  CustomAiProviderDto
} from "@audio-to-text/shared";

export interface GenerationSelectionParams {
  meta?: AnalysisGenerationMetaDto | null;
  folder?: ProjectFolderDto | null;
  settings?: {
    issuesDefaultProvider?: string;
    issuesDefaultModel?: string;
  } | null;
  customProviders?: CustomAiProviderDto[];
}

export interface GenerationSelection {
  provider: string;
  model: string;
  profileId: string;
}

export interface FormatGenerationMetaResult {
  modelText: string;
  whenText: string;
  durationText: string;
  statusKind: "ok" | "warnings" | "errors";
  statusText: string;
}

function isCustomProviderValid(providerId: string, customProviders?: CustomAiProviderDto[]): boolean {
  if (!providerId.startsWith("custom-")) return true;
  if (!customProviders || customProviders.length === 0) return false;
  return customProviders.some((cp) => cp.id === providerId);
}

/**
 * Resuelve la selección de proveedor, modelo y perfil aplicando la prioridad:
 * 1. meta (último análisis guardado)
 * 2. folder (carpeta vinculada)
 * 3. settings (Ajustes globales)
 * 4. google-account (predeterminado)
 *
 * Si el proveedor es un custom-* que ya no existe en customProviders, salta al siguiente nivel.
 * El perfil se preselecciona: meta.profileId -> folder.profileId -> "generic".
 */
export function resolveGenerationSelection({
  meta,
  folder,
  settings,
  customProviders
}: GenerationSelectionParams): GenerationSelection {
  let resolvedProvider: string | null = null;
  let resolvedModel: string | null = null;

  // 1. meta
  if (meta?.provider && isCustomProviderValid(meta.provider, customProviders)) {
    resolvedProvider = meta.provider;
    resolvedModel = meta.model ?? "";
  }

  // 2. folder
  if (!resolvedProvider && folder?.defaultProvider && isCustomProviderValid(folder.defaultProvider, customProviders)) {
    resolvedProvider = folder.defaultProvider;
    resolvedModel = folder.defaultModel ?? "";
  }

  // 3. settings
  if (
    !resolvedProvider &&
    settings?.issuesDefaultProvider &&
    isCustomProviderValid(settings.issuesDefaultProvider, customProviders)
  ) {
    resolvedProvider = settings.issuesDefaultProvider;
    resolvedModel = settings.issuesDefaultModel ?? "";
  }

  // 4. fallback
  const provider = resolvedProvider || "google-account";
  const model = resolvedModel ?? "";
  const profileId = meta?.profileId || folder?.profileId || "generic";

  return {
    provider,
    model,
    profileId
  };
}

/**
 * Formatea los metadatos de generación para presentación amigable:
 * - modelText: "modelo predeterminado" si está vacío o null, o el nombre del modelo.
 * - whenText: tiempos relativos en español ("hace un momento", "hace 5 min", "hace 2 h", "hace 3 días").
 * - durationText: duración formateada ("41 s", "2 min 5 s").
 * - statusKind: "ok" | "warnings" | "errors".
 * - statusText: texto legible del estado de validación.
 */
export function formatGenerationMeta(
  meta?: AnalysisGenerationMetaDto | null,
  now?: Date | number | string
): FormatGenerationMetaResult {
  if (!meta) {
    return {
      modelText: "modelo predeterminado",
      whenText: "",
      durationText: "",
      statusKind: "ok",
      statusText: ""
    };
  }

  const modelText = meta.model && meta.model.trim() ? meta.model.trim() : "modelo predeterminado";

  // Duración en segundos/minutos
  const durationSec = Math.max(0, Math.round((meta.durationMs ?? 0) / 1000));
  let durationText = "";
  if (durationSec < 60) {
    durationText = `${durationSec} s`;
  } else {
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    durationText = secs > 0 ? `${mins} min ${secs} s` : `${mins} min`;
  }

  // Tiempo relativo
  const nowDate = now ? new Date(now).getTime() : Date.now();
  const genDate = new Date(meta.generatedAt).getTime();
  const diffSec = Math.max(0, Math.floor((nowDate - genDate) / 1000));
  let whenText = "";
  if (diffSec < 60) {
    whenText = "hace un momento";
  } else if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    whenText = `hace ${mins} min`;
  } else if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    whenText = `hace ${hours} h`;
  } else {
    const days = Math.floor(diffSec / 86400);
    whenText = days === 1 ? "hace 1 día" : `hace ${days} días`;
  }

  // Estado de validación
  let statusKind: "ok" | "warnings" | "errors" = "ok";
  let statusText = "validado ✓";

  if (meta.validationErrors && meta.validationErrors.length > 0) {
    statusKind = "errors";
    const count = meta.validationErrors.length;
    statusText = count === 1 ? "✕ 1 error sin corregir" : `✕ ${count} errores sin corregir`;
  } else if (meta.validationWarnings && meta.validationWarnings.length > 0) {
    statusKind = "warnings";
    const count = meta.validationWarnings.length;
    statusText = count === 1 ? "⚠ 1 aviso para revisar" : `⚠ ${count} avisos para revisar`;
  }

  return {
    modelText,
    whenText,
    durationText,
    statusKind,
    statusText
  };
}
