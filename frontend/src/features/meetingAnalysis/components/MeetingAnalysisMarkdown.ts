import { MeetingAnalysisDto, DevIssueType, DevIssuePriority } from "@audio-to-text/shared";

export const DEFAULT_PROJECT_CONTEXT = `Monorepo TypeScript:
- Backend: Express, Prisma ORM, BullMQ, Clean Architecture (domain, application, infrastructure, interfaces).
- Frontend: React 18, Vite, Material UI (MUI v5), Zustand.
- Base de datos: MySQL 8.0 (Web) / SQLite (Desktop).
- Convenciones: Código en TypeScript estricto, separación en casos de uso, DTOs compartidos en packages/shared.`;

export interface FriendlyError {
  title: string;
  description: string;
  technical?: string;
}

export function formatHumanFriendlyError(raw: string): FriendlyError {
  if (!raw) {
    return {
      title: "Error inesperado",
      description: "Ocurrió un error al procesar el análisis de la reunión."
    };
  }

  // Detectar error de validación Zod en formato JSON
  if (
    raw.includes("invalid_enum_value") ||
    raw.includes("Expected 'feature'") ||
    (raw.trim().startsWith("[") && raw.includes("code"))
  ) {
    return {
      title: "Respuesta del modelo con formato adaptado",
      description:
        "El modelo devolvió clasificaciones de issues con términos no estándar (ej. 'enhancement'). El sistema ahora los normaliza automáticamente al generar las tareas.",
      technical: raw
    };
  }

  // Detectar 401
  if (
    raw.includes("401") ||
    raw.toLowerCase().includes("authentication fails") ||
    raw.toLowerCase().includes("invalid api key") ||
    raw.toLowerCase().includes("rechazó la autenticación")
  ) {
    return {
      title: "Error de autenticación (HTTP 401)",
      description:
        "La clave de API fue rechazada por el proveedor. Por favor verifica que tu API Key sea correcta y tenga saldo disponible en Configuración.",
      technical: raw
    };
  }

  // Detectar timeout o abort
  if (
    raw.toLowerCase().includes("aborted") ||
    raw.toLowerCase().includes("timeout") ||
    raw.toLowerCase().includes("timed out")
  ) {
    return {
      title: "Tiempo de espera agotado",
      description:
        "La llamada tomó más tiempo del límite esperado. Te sugerimos usar el modelo ultrarrápido (Cuenta de Google Pro con flash-low) o verificar la conexión del modelo personalizado.",
      technical: raw
    };
  }

  // Detectar error de conexión / red
  if (
    raw.toLowerCase().includes("failed to fetch") ||
    raw.toLowerCase().includes("econnrefused") ||
    raw.toLowerCase().includes("networkerror")
  ) {
    return {
      title: "Error de conexión de red",
      description:
        "No se pudo conectar con el servidor local o el servicio de IA externo. Verifica tu conexión a internet o la URL base configurada.",
      technical: raw
    };
  }

  return {
    title: "Aviso al procesar con IA",
    description: raw,
    technical: undefined
  };
}

export const getRepoChipColor = (repo?: string): "primary" | "secondary" | "info" | "default" => {
  switch (repo) {
    case "backend":
      return "primary";
    case "panel":
      return "secondary";
    case "app":
      return "info";
    default:
      return "default";
  }
};

export const getRepoLabel = (repo?: string): string => {
  switch (repo) {
    case "backend":
      return "Backend";
    case "panel":
      return "Panel Admin";
    case "app":
      return "App Móvil";
    default:
      return "General";
  }
};

export const getTypeChipColor = (
  type: DevIssueType
): "primary" | "error" | "secondary" | "default" | "warning" => {
  switch (type) {
    case "feature":
      return "primary";
    case "bug":
      return "error";
    case "refactor":
      return "secondary";
    case "spike":
      return "warning";
    case "chore":
    default:
      return "default";
  }
};

export const getPriorityChipColor = (priority: DevIssuePriority): "error" | "warning" | "info" => {
  switch (priority) {
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
    default:
      return "info";
  }
};

export function buildStructuredMarkdown(analysisData: MeetingAnalysisDto, title: string): string {
  let md = `# ${title || "Resumen de Reunión e Issues Técnicas"}\n\n`;
  md += `**Fecha**: ${new Date(analysisData.createdAt).toLocaleString()}\n\n`;

  // 1. Resumen Ejecutivo
  md += `## 1. Resumen Ejecutivo\n${analysisData.summary}\n\n`;

  // 2. Ya Resuelto
  if (analysisData.alreadyResolved && analysisData.alreadyResolved.length > 0) {
    md += `## 2. Ya Resuelto / Cerrado\n`;
    analysisData.alreadyResolved.forEach((r) => {
      md += `- [x] ${r}\n`;
    });
    md += `\n`;
  }

  // 3. En Curso
  if (analysisData.inProgress && analysisData.inProgress.length > 0) {
    md += `## 3. En Curso\n`;
    analysisData.inProgress.forEach((p) => {
      md += `- ⏳ ${p}\n`;
    });
    md += `\n`;
  }

  // 4. Decisiones Clave
  if (analysisData.keyDecisions && analysisData.keyDecisions.length > 0) {
    md += `## 4. Decisiones Clave\n`;
    analysisData.keyDecisions.forEach((d) => {
      md += `- ${d}\n`;
    });
    md += `\n`;
  }

  // 5. Preguntas Abiertas Globales
  if (analysisData.globalOpenQuestions && analysisData.globalOpenQuestions.length > 0) {
    md += `## 5. Preguntas Abiertas Globales\n`;
    analysisData.globalOpenQuestions.forEach((q) => {
      md += `- ❓ ${q}\n`;
    });
    md += `\n`;
  }

  // 6. Issues Agrupados por Repositorio
  md += `## 6. Issues para Programación con IA (Agrupados por Repositorio)\n\n`;
  const repos = ["backend", "panel", "app", "otro"] as const;
  const repoLabels: Record<string, string> = {
    backend: "Repositorio Backend",
    panel: "Repositorio Panel Administrativo",
    app: "Repositorio App Móvil",
    otro: "Otros Módulos"
  };

  repos.forEach((repoKey) => {
    const repoIssues = analysisData.issues.filter((i) => (i.repo || "backend") === repoKey);
    if (repoIssues.length > 0) {
      md += `### ${repoLabels[repoKey]} (${repoIssues.length} issues)\n\n`;
      repoIssues.forEach((issue) => {
        md += `#### [${issue.id}] ${issue.title}\n`;
        md += `- **Repo**: \`${issue.repo || repoKey}\` | **Tipo**: \`${issue.type}\` | **Prioridad**: \`${issue.priority}\` | **Componente**: \`${issue.component}\`\n`;
        if (issue.estimation) {
          md += `- **Estimación**: \`${issue.estimation.text || `Total: ${issue.estimation.totalHours}h`}\`\n`;
        }
        if (issue.dependencies && issue.dependencies.length > 0) {
          md += `- **Dependencias**: ${issue.dependencies.join(", ")}\n`;
        }
        if (issue.prWorkflow) {
          md += `- **Flujo de PR**: ${issue.prWorkflow}\n`;
        }
        md += `- **Descripción**: ${issue.description}\n`;
        if (issue.openQuestions && issue.openQuestions.length > 0 && issue.openQuestions[0] !== "Ninguna") {
          md += `- **Preguntas abiertas**:\n`;
          issue.openQuestions.forEach((q) => {
            md += `  - ⚠️ ${q}\n`;
          });
        }
        if (issue.expectedFiles && issue.expectedFiles.length > 0) {
          md += `- **Archivos sugeridos (verificar en el repo)**: ${issue.expectedFiles.map((f) => `\`${f}\``).join(", ")}\n`;
        }
        if (issue.acceptanceCriteria && issue.acceptanceCriteria.length > 0) {
          md += `- **Criterios de Aceptación**:\n`;
          issue.acceptanceCriteria.forEach((crit) => {
            md += `  - [ ] ${crit}\n`;
          });
        }
        md += `\n<details><summary>Prompt para Agente de IA</summary>\n\n\`\`\`markdown\n${issue.agentPrompt}\n\`\`\`\n</details>\n\n---\n\n`;
      });
    }
  });

  // 7. Backlog
  if (analysisData.backlog && analysisData.backlog.length > 0) {
    md += `## 7. Backlog (No bloqueante / Próximas etapas)\n`;
    analysisData.backlog.forEach((b) => {
      md += `- 📌 ${b}\n`;
    });
    md += `\n`;
  }

  // 8. Totales de Horas por Repositorio
  if (analysisData.repoHoursTotals) {
    md += `## 8. Totales de Horas por Repositorio (Verificación Aritmética)\n`;
    md += `- **Backend**: ${analysisData.repoHoursTotals.backend}h\n`;
    md += `- **Panel Administrativo**: ${analysisData.repoHoursTotals.panel}h\n`;
    md += `- **App Móvil**: ${analysisData.repoHoursTotals.app}h\n`;
    md += `- **TOTAL GENERAL**: ${analysisData.repoHoursTotals.total}h\n\n`;
  }

  return md;
}
