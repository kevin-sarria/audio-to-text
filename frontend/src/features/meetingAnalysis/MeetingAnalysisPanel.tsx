import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Card,
  CardContent,
  CardActions,
  Divider,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Snackbar,
  IconButton,
  Tooltip
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ContentCopy as ContentCopyIcon,
  Check as CheckIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  SmartToy as SmartToyIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  Tune as TuneIcon,
  AutoAwesome as AutoAwesomeIcon,
  Code as CodeIcon,
  AssignmentTurnedIn as AssignmentTurnedInIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Folder as FolderIcon,
  AddCircleOutline as AddIcon,
  WarningAmber as WarningIcon,
  AccessTime as TimeIcon,
  HelpOutline as QuestionIcon,
  CheckCircle as ResolvedIcon,
  PendingActions as InProgressIcon,
  BookmarkBorder as BacklogIcon
} from "@mui/icons-material";
import {
  MeetingAnalysisDto,
  DevIssueDto,
  DevIssueType,
  DevIssuePriority,
  MeetingAnalysisProvider,
  CustomAiProviderDto,
  ProjectFolderDto
} from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { useAppStore } from "../../store/index.js";
import { useProjectFolders } from "../projectFolders/useProjectFolders.js";
import { CustomProviderModal } from "../customAi/CustomProviderModal.js";
import { LlmModelSelector } from "../customAi/LlmModelSelector.js";

interface MeetingAnalysisPanelProps {
  sessionId: string;
}

const DEFAULT_PROJECT_CONTEXT = `Monorepo TypeScript:
- Backend: Express, Prisma ORM, BullMQ, Clean Architecture (domain, application, infrastructure, interfaces).
- Frontend: React 18, Vite, Material UI (MUI v5), Zustand.
- Base de datos: MySQL 8.0 (Web) / SQLite (Desktop).
- Convenciones: Código en TypeScript estricto, separación en casos de uso, DTOs compartidos en packages/shared.`;

function formatHumanFriendlyError(raw: string): { title: string; description: string; technical?: string } {
  if (!raw) {
    return {
      title: "Error inesperado",
      description: "Ocurrió un error al procesar el análisis de la reunión."
    };
  }

  // Detectar error de validación Zod en formato JSON (como el mostrado en la captura)
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

export const MeetingAnalysisPanel: React.FC<MeetingAnalysisPanelProps> = ({ sessionId }) => {
  const { guestToken, currentSession, updateSessionProjectFolder } = useAppStore();
  const { folders, refreshFolders } = useProjectFolders();

  const [analysis, setAnalysis] = useState<MeetingAnalysisDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);

  // Título editable del análisis
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editableTitle, setEditableTitle] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // Opciones de configuración
  const [projectContext, setProjectContext] = useState(DEFAULT_PROJECT_CONTEXT);
  const [provider, setProvider] = useState<string>("google-account");
  const [customApiKey, setCustomApiKey] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);

  // Proveedores personalizados registrados
  const [customProviders, setCustomProviders] = useState<CustomAiProviderDto[]>([]);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

  // Estado de claves guardadas en el sistema
  const [systemKeys, setSystemKeys] = useState<Record<string, { hasKey: boolean; last4: string }>>({});

  // Filtros de issues
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterRepo, setFilterRepo] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Carpeta asociada a la sesión
  const linkedFolder = useMemo(() => {
    if (!currentSession?.projectFolderId) return null;
    return folders.find((f) => f.id === currentSession.projectFolderId) || null;
  }, [currentSession?.projectFolderId, folders]);

  // Cargar configuración de desktop y proveedores
  const fetchSettingsAndProviders = async () => {
    try {
      const res = await api.get<any>("/desktop/settings");
      if (res.success && res.data) {
        if (res.data.settings?.customProviders) {
          setCustomProviders(res.data.settings.customProviders);
        }
        if (res.data.keys) {
          setSystemKeys(res.data.keys);
        }
        if (res.data.settings?.issuesDefaultProvider) {
          setProvider(res.data.settings.issuesDefaultProvider);
        }
        if (res.data.settings?.issuesDefaultModel) {
          setCustomModel(res.data.settings.issuesDefaultModel);
        }
      }
    } catch {
      // Ignorar en entorno web puro
    }
  };

  const fetchAnalysis = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = {};
      if (guestToken) {
        headers["x-guest-token"] = guestToken;
      }
      const res = await api.get<{ success: boolean; data: MeetingAnalysisDto | null }>(
        `/sessions/${sessionId}/meeting-analysis`,
        { headers }
      );
      if (res.success && res.data) {
        setAnalysis(res.data);
        setEditableTitle(res.data.title || `Análisis: ${currentSession?.originalFileName || "Reunión"}`);
        if (res.data.projectContext) {
          setProjectContext(res.data.projectContext);
        }
      } else {
        setEditableTitle(`Análisis: ${currentSession?.originalFileName || "Reunión"}`);
        setIsConfigExpanded(true);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al cargar el análisis de la reunión.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsAndProviders();
    fetchAnalysis();
  }, [sessionId]);

  // Si la sesión está vinculada a una carpeta de proyecto, sincronizar su contexto
  useEffect(() => {
    if (linkedFolder) {
      setProjectContext(linkedFolder.technicalContext);
      if (linkedFolder.defaultProvider) {
        setProvider(linkedFolder.defaultProvider);
      }
      if (linkedFolder.defaultModel) {
        setCustomModel(linkedFolder.defaultModel);
      }
    }
  }, [linkedFolder]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = {};
      if (guestToken) {
        headers["x-guest-token"] = guestToken;
      }

      const matchedCustom = customProviders.find((cp) => cp.id === provider);
      const effectiveBaseUrl = matchedCustom ? matchedCustom.baseUrl : customBaseUrl.trim() || undefined;
      const effectiveModel = customModel.trim() || matchedCustom?.defaultModel || undefined;
      const effectiveApiKey = customApiKey.trim() || undefined;
      const effectiveProvider = (matchedCustom ? matchedCustom.id : provider) as MeetingAnalysisProvider;

      const body = {
        title: editableTitle.trim() || undefined,
        projectContext: projectContext.trim() || undefined,
        provider: effectiveProvider,
        apiKey: effectiveApiKey,
        model: effectiveModel,
        baseUrl: effectiveBaseUrl
      };

      const res = await api.post<{ success: boolean; data: MeetingAnalysisDto }>(
        `/sessions/${sessionId}/meeting-analysis`,
        body,
        { headers }
      );

      if (res.success && res.data) {
        setAnalysis(res.data);
        setEditableTitle(res.data.title || `Análisis: ${currentSession?.originalFileName || "Reunión"}`);
        setIsConfigExpanded(false);
        setSnackMessage("¡Resumen e issues generadas exitosamente!");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al generar el análisis con IA.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveTitle = async () => {
    if (!editableTitle.trim()) return;
    setIsSavingTitle(true);
    try {
      const headers: Record<string, string> = {};
      if (guestToken) {
        headers["x-guest-token"] = guestToken;
      }

      const res = await api.patch<{ success: boolean; data: any }>(
        `/sessions/${sessionId}/meeting-analysis/title`,
        { title: editableTitle.trim() },
        { headers }
      );

      if (res.success) {
        setAnalysis((prev) => (prev ? { ...prev, title: editableTitle.trim() } : null));
        setIsEditingTitle(false);
        setSnackMessage("Título actualizado correctamente en el historial.");
      }
    } catch (err: any) {
      setSnackMessage(`Error al actualizar título: ${err.message}`);
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleLinkFolder = async (folderId: string) => {
    try {
      const headers: Record<string, string> = {};
      if (guestToken) {
        headers["x-guest-token"] = guestToken;
      }
      const res = await api.patch<{ success: boolean; data: any }>(
        `/sessions/${sessionId}/project`,
        { projectFolderId: folderId || null },
        { headers }
      );
      if (res.success) {
        updateSessionProjectFolder(folderId || null);
        setSnackMessage(folderId ? "Sesión vinculada a la carpeta de proyecto." : "Sesión desvinculada.");
      }
    } catch (err: any) {
      setSnackMessage(`Error al vincular carpeta: ${err.message}`);
    }
  };

  const copyToClipboard = async (text: string, idNotice: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(idNotice);
      setSnackMessage(message);
      setTimeout(() => setCopiedId(null), 3000);
    } catch {
      setSnackMessage("No se pudo copiar al portapapeles.");
    }
  };

  const buildStructuredMarkdown = (analysisData: MeetingAnalysisDto, title: string): string => {
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
  };

  const handleCopyAllIssues = () => {
    if (!analysis || !analysis.issues.length) return;
    const md = buildStructuredMarkdown(analysis, editableTitle || "Documento Completo de Issues");
    copyToClipboard(md, "all-issues", "¡Documento estructurado completo copiado en formato Markdown!");
  };

  const handleDownloadMarkdown = () => {
    if (!analysis) return;
    const md = buildStructuredMarkdown(analysis, editableTitle || "Resumen de Reunión e Issues Técnicas");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(editableTitle || "meeting-issues").toLowerCase().replace(/[^a-z0-9]/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    if (!analysis) return;
    const blob = new Blob([JSON.stringify(analysis, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(editableTitle || "meeting-issues").toLowerCase().replace(/[^a-z0-9]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredIssues = useMemo(() => {
    if (!analysis) return [];
    return analysis.issues.filter((issue) => {
      const matchType = filterType === "all" || issue.type === filterType;
      const matchPriority = filterPriority === "all" || issue.priority === filterPriority;
      const matchRepo = filterRepo === "all" || (issue.repo || "backend") === filterRepo;
      return matchType && matchPriority && matchRepo;
    });
  }, [analysis, filterType, filterPriority, filterRepo]);

  const getRepoChipColor = (repo?: string): "primary" | "secondary" | "info" | "default" => {
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

  const getRepoLabel = (repo?: string): string => {
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

  const getTypeChipColor = (type: DevIssueType): "primary" | "error" | "secondary" | "default" | "warning" => {
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

  const getPriorityChipColor = (priority: DevIssuePriority): "error" | "warning" | "info" => {
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

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      {/* Barra de Vinculación de Carpeta de Proyecto */}
      <Paper
        sx={{
          p: 2,
          mb: 2.5,
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.5,
          bgcolor: linkedFolder ? "action.hover" : "background.paper",
          border: "1px solid",
          borderColor: linkedFolder ? "primary.main" : "divider"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FolderIcon color={linkedFolder ? "primary" : "action"} />
          {linkedFolder ? (
            <Box>
              <Typography variant="subtitle2" fontWeight={700}>
                Carpeta vinculada: {linkedFolder.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Contexto técnico y credenciales optimizadas para este proyecto.
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Esta sesión no está vinculada a ninguna carpeta de proyecto.
            </Typography>
          )}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="link-folder-select">Vincular a Carpeta</InputLabel>
            <Select
              labelId="link-folder-select"
              label="Vincular a Carpeta"
              value={currentSession?.projectFolderId || ""}
              onChange={(e) => handleLinkFolder(e.target.value)}
            >
              <MenuItem value="">
                <em>Ninguna (Contexto libre)</em>
              </MenuItem>
              {folders.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  📁 {f.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            size="small"
            variant="outlined"
            startIcon={<TuneIcon />}
            onClick={() => setIsConfigExpanded(!isConfigExpanded)}
          >
            Configurar manualmente el contexto
          </Button>
        </Box>
      </Paper>

      {/* Título Renombrable del Análisis / Issues */}
      <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          {isEditingTitle ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1, maxWidth: 600 }}>
              <TextField
                fullWidth
                size="small"
                label="Nombre personalizado del análisis"
                value={editableTitle}
                onChange={(e) => setEditableTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
                autoFocus
              />
              <Button
                variant="contained"
                size="small"
                startIcon={<SaveIcon />}
                onClick={handleSaveTitle}
                disabled={isSavingTitle}
              >
                Guardar
              </Button>
              <Button size="small" onClick={() => setIsEditingTitle(false)}>
                Cancelar
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="h5" fontWeight={700}>
                {analysis?.title || editableTitle}
              </Typography>
              <Tooltip title="Renombrar en el historial">
                <IconButton size="small" onClick={() => setIsEditingTitle(true)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}

          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="contained"
              color="primary"
              disabled={isGenerating}
              startIcon={isGenerating ? <CircularProgress size={18} color="inherit" /> : <AutoAwesomeIcon />}
              onClick={handleGenerate}
            >
              {isGenerating
                ? "Procesando con IA..."
                : analysis
                ? "Regenerar Resumen e Issues"
                : "Generar Resumen e Issues"}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Alerta amigable si falla la llamada o si no hay configuración */}
      {errorMsg && (() => {
        const friendly = formatHumanFriendlyError(errorMsg);
        return (
          <Alert
            severity="warning"
            icon={<WarningIcon fontSize="medium" />}
            sx={{
              mb: 3,
              borderRadius: 2,
              p: 2,
              "& .MuiAlert-message": { width: "100%", overflow: "hidden" }
            }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, width: "100%" }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {friendly.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {friendly.description}
              </Typography>

              {friendly.technical && (
                <Accordion
                  disableGutters
                  elevation={0}
                  sx={{
                    bgcolor: "rgba(0, 0, 0, 0.04)",
                    borderRadius: 1,
                    mt: 0.5,
                    "&:before": { display: "none" }
                  }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 36, px: 1.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
                      Ver detalles técnicos del error
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0, px: 1.5, pb: 1.5 }}>
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        p: 1,
                        fontSize: "0.75rem",
                        fontFamily: "monospace",
                        bgcolor: "background.paper",
                        borderRadius: 1,
                        overflowX: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                        maxHeight: 160
                      }}
                    >
                      {friendly.technical}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              )}

              <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, pt: 1 }}>
                <Button
                  color="warning"
                  size="small"
                  variant="contained"
                  sx={{ textTransform: "none", whiteSpace: "nowrap" }}
                  onClick={() => {
                    setProvider("google-account");
                    setErrorMsg(null);
                    handleGenerate();
                  }}
                >
                  Reintentar con Google Pro (Rápido y Gratis)
                </Button>
                <Button
                  color="inherit"
                  size="small"
                  variant="outlined"
                  sx={{ textTransform: "none", whiteSpace: "nowrap" }}
                  onClick={() => setIsConfigExpanded(true)}
                >
                  Ajustar Contexto y Proveedor
                </Button>
              </Box>
            </Box>
          </Alert>
        );
      })()}

      {isGenerating && (
        <Paper sx={{ p: 3, mb: 3, borderRadius: 2, bgcolor: "action.hover" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <CircularProgress size={28} />
            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                Generando resumen técnico y extrayendo issues con IA...
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Extrayendo decisiones clave, identificando tareas técnicas y redactando prompts optimizados para agentes de código. En reuniones largas o modelos de razonamiento (como DeepSeek Flash), el análisis profundo puede tomar entre 2 y 3 minutos.
              </Typography>
            </Box>
          </Box>
        </Paper>
      )}

      {/* Acordeón de Configuración Manual del Contexto y Proveedor */}
      <Accordion
        expanded={isConfigExpanded}
        onChange={(_, expanded) => setIsConfigExpanded(expanded)}
        sx={{ mb: 3, borderRadius: 2, border: "1px solid", borderColor: "divider", "&:before": { display: "none" } }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <TuneIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" fontWeight={600}>
              Configuración Manual del Contexto y del Modelo de IA
            </Typography>
          </Box>
        </AccordionSummary>

        <AccordionDetails>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Personaliza el stack tecnológico, convenciones o proveedor de IA específicamente para esta reunión:
          </Typography>

          <TextField
            fullWidth
            multiline
            rows={5}
            variant="outlined"
            label="Contexto Técnico del Proyecto (Stack, Arquitectura, Módulos)"
            value={projectContext}
            onChange={(e) => setProjectContext(e.target.value)}
            placeholder="Ej. Monorepo con React + Vite en frontend, Express + Prisma en backend..."
            sx={{ mb: 2 }}
          />

          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
            <FormControl size="small" sx={{ minWidth: 280, flex: 1 }}>
              <InputLabel id="provider-select-label">Proveedor de IA</InputLabel>
              <Select
                labelId="provider-select-label"
                label="Proveedor de IA"
                value={provider}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__add_new__") {
                    setIsCustomModalOpen(true);
                  } else {
                    setProvider(val);
                    const matched = customProviders.find((cp) => cp.id === val);
                    if (matched) {
                      setCustomModel(matched.defaultModel);
                    }
                  }
                }}
              >
                <MenuItem value="google-account">
                  ⭐ Cuenta de Google (Gemini Pro - Sin API Key)
                </MenuItem>
                <MenuItem value="gemini">Google Gemini API</MenuItem>
                <MenuItem value="openai">OpenAI (ChatGPT / GPT-4o)</MenuItem>
                <MenuItem value="groq">Groq Cloud (Llama 3.3 70B)</MenuItem>
                <Divider sx={{ my: 1 }} />
                {customProviders.map((cp) => (
                  <MenuItem key={cp.id} value={cp.id}>
                    🤖 {cp.name} ({cp.defaultModel})
                  </MenuItem>
                ))}
                <MenuItem value="__add_new__" sx={{ color: "primary.main", fontWeight: 600 }}>
                  <AddIcon fontSize="small" sx={{ mr: 1 }} /> + Agregar nuevo proveedor (Ollama, DeepSeek...)
                </MenuItem>
              </Select>
            </FormControl>

            {provider === "google-account" && (
              <Chip
                color="success"
                variant="outlined"
                icon={<CheckCircleOutlineIcon />}
                label="Conectado con tu Cuenta de Google. Sin costo ni API Key requerida."
              />
            )}

            {provider !== "google-account" && (
              <TextField
                size="small"
                type="password"
                label="API Key temporal (opcional)"
                placeholder="Usa la de Ajustes si se omite"
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                sx={{ flex: 1, minWidth: 220 }}
              />
            )}

            <Box sx={{ minWidth: 260, flex: 1 }}>
              <LlmModelSelector
                provider={provider}
                value={customModel}
                onChange={setCustomModel}
                apiKey={customApiKey}
                baseUrl={customProviders.find((cp) => cp.id === provider)?.baseUrl}
                label="Modelo de IA"
                placeholder="Selecciona o escribe el modelo"
              />
            </Box>

            <Button
              size="small"
              variant="text"
              onClick={() => setProjectContext(DEFAULT_PROJECT_CONTEXT)}
            >
              Restablecer plantilla
            </Button>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Resultados: Resumen e Issues */}
      {analysis && (
        <>
          {/* Card de Resumen Ejecutivo */}
          <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <AssignmentTurnedInIcon color="primary" /> Resumen Ejecutivo de la Reunión
            </Typography>
            <Typography variant="body1" sx={{ whiteSpace: "pre-line", mb: 3, lineHeight: 1.7 }}>
              {analysis.summary}
            </Typography>

            {analysis.topicsDiscussed.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom color="text.secondary">
                  Temas Tratados:
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8 }}>
                  {analysis.topicsDiscussed.map((topic, idx) => (
                    <Chip key={idx} label={topic} size="small" variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}

            {analysis.keyDecisions.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom color="text.secondary">
                  Decisiones Clave Tomadas:
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {analysis.keyDecisions.map((decision, idx) => (
                    <Box key={idx} sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                      <CheckCircleOutlineIcon color="success" fontSize="small" sx={{ mt: "3px" }} />
                      <Typography variant="body2">{decision}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Paper>

          {/* 2. Ya Resuelto / Cerrado */}
          {analysis.alreadyResolved && analysis.alreadyResolved.length > 0 && (
            <Paper
              sx={{
                p: 3,
                mb: 3,
                borderRadius: 3,
                bgcolor: "success.50",
                border: "1px solid",
                borderColor: "success.200"
              }}
            >
              <Typography
                variant="h6"
                fontWeight={700}
                gutterBottom
                sx={{ display: "flex", alignItems: "center", gap: 1, color: "success.900" }}
              >
                <ResolvedIcon color="success" /> Ya Resuelto / Cerrado en la Reunión
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Puntos tratados que se cerraron o ya están completados según la transcripción. No requieren crear nuevas issues.
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {analysis.alreadyResolved.map((item, idx) => (
                  <Box key={idx} sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                    <CheckCircleOutlineIcon color="success" fontSize="small" sx={{ mt: "3px" }} />
                    <Typography variant="body2" fontWeight={500}>
                      {item}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          )}

          {/* 3. En Curso (Asignado / Sin Duplicar) */}
          {analysis.inProgress && analysis.inProgress.length > 0 && (
            <Paper
              sx={{
                p: 3,
                mb: 3,
                borderRadius: 3,
                bgcolor: "info.50",
                border: "1px solid",
                borderColor: "info.200"
              }}
            >
              <Typography
                variant="h6"
                fontWeight={700}
                gutterBottom
                sx={{ display: "flex", alignItems: "center", gap: 1, color: "info.900" }}
              >
                <InProgressIcon color="info" /> En Curso (Asignado a un Miembro del Equipo)
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Requerimientos que alguien ya está trabajando. Solo se crearon tareas de integración o partes faltantes.
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {analysis.inProgress.map((item, idx) => (
                  <Box key={idx} sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                    <Chip
                      label="En Progreso"
                      size="small"
                      color="info"
                      variant="outlined"
                      sx={{ fontSize: "0.7rem", height: 22 }}
                    />
                    <Typography variant="body2">{item}</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          )}

          {/* 5. Preguntas Abiertas Globales y Ambigüedades */}
          {analysis.globalOpenQuestions && analysis.globalOpenQuestions.length > 0 && (
            <Paper
              sx={{
                p: 3,
                mb: 3,
                borderRadius: 3,
                bgcolor: "warning.50",
                border: "1px solid",
                borderColor: "warning.200"
              }}
            >
              <Typography
                variant="h6"
                fontWeight={700}
                gutterBottom
                sx={{ display: "flex", alignItems: "center", gap: 1, color: "warning.900" }}
              >
                <QuestionIcon color="warning" /> Preguntas Abiertas y Términos por Confirmar
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Ambigüedades, fragmentos de audio dudosos o decisiones de negocio pendientes de confirmar antes de implementar.
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {analysis.globalOpenQuestions.map((q, idx) => (
                  <Box key={idx} sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                    <WarningIcon color="warning" fontSize="small" sx={{ mt: "3px" }} />
                    <Typography variant="body2">{q}</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          )}

          {/* 6. Totales de Horas por Repositorio */}
          {analysis.repoHoursTotals && (
            <Paper sx={{ p: 2.5, mb: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <TimeIcon color="primary" />
                <Typography variant="subtitle1" fontWeight={700}>
                  Totales de Horas por Repositorio (Verificación Aritmética)
                </Typography>
              </Box>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
                  gap: 2
                }}
              >
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: "primary.50", textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    BACKEND
                  </Typography>
                  <Typography variant="h5" fontWeight={800} color="primary.main">
                    {analysis.repoHoursTotals.backend}h
                  </Typography>
                </Box>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: "secondary.50", textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    PANEL ADMIN
                  </Typography>
                  <Typography variant="h5" fontWeight={800} color="secondary.main">
                    {analysis.repoHoursTotals.panel}h
                  </Typography>
                </Box>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: "info.50", textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    APP MÓVIL
                  </Typography>
                  <Typography variant="h5" fontWeight={800} color="info.main">
                    {analysis.repoHoursTotals.app}h
                  </Typography>
                </Box>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: "action.hover", textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    TOTAL GENERAL
                  </Typography>
                  <Typography variant="h5" fontWeight={800} color="text.primary">
                    {analysis.repoHoursTotals.total}h
                  </Typography>
                </Box>
              </Box>
            </Paper>
          )}

          {/* Barra de Herramientas de Issues */}
          <Paper sx={{ p: 2, mb: 3, borderRadius: 3 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 2
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <CodeIcon color="primary" />
                <Typography variant="h6" fontWeight={700}>
                  Issues para Programación ({filteredIssues.length} de {analysis.issues.length})
                </Typography>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                {/* Filtro por Repositorio */}
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel id="filter-repo-label">Repositorio</InputLabel>
                  <Select
                    labelId="filter-repo-label"
                    label="Repositorio"
                    value={filterRepo}
                    onChange={(e) => setFilterRepo(e.target.value)}
                  >
                    <MenuItem value="all">Todos los repos</MenuItem>
                    <MenuItem value="backend">Backend</MenuItem>
                    <MenuItem value="panel">Panel Admin</MenuItem>
                    <MenuItem value="app">App Móvil</MenuItem>
                  </Select>
                </FormControl>

                {/* Filtro por Tipo */}
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel id="filter-type-label">Tipo</InputLabel>
                  <Select
                    labelId="filter-type-label"
                    label="Tipo"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                  >
                    <MenuItem value="all">Todos los tipos</MenuItem>
                    <MenuItem value="feature">Feature</MenuItem>
                    <MenuItem value="bug">Bug</MenuItem>
                    <MenuItem value="refactor">Refactor</MenuItem>
                    <MenuItem value="chore">Chore</MenuItem>
                    <MenuItem value="spike">Spike</MenuItem>
                  </Select>
                </FormControl>

                {/* Filtro por Prioridad */}
                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <InputLabel id="filter-priority-label">Prioridad</InputLabel>
                  <Select
                    labelId="filter-priority-label"
                    label="Prioridad"
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                  >
                    <MenuItem value="all">Todas</MenuItem>
                    <MenuItem value="high">Alta</MenuItem>
                    <MenuItem value="medium">Media</MenuItem>
                    <MenuItem value="low">Baja</MenuItem>
                  </Select>
                </FormControl>

                {/* Botón Copiar Documento Completo */}
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={copiedId === "all-issues" ? <CheckIcon /> : <ContentCopyIcon />}
                  onClick={handleCopyAllIssues}
                  color={copiedId === "all-issues" ? "success" : "primary"}
                >
                  Copiar Todo (Markdown)
                </Button>

                {/* Botón Descargar */}
                <Tooltip title="Descargar documento completo estructurado en Markdown">
                  <IconButton size="small" onClick={handleDownloadMarkdown}>
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>

                <Tooltip title="Descargar JSON para integraciones">
                  <Button size="small" variant="text" onClick={handleDownloadJson}>
                    JSON
                  </Button>
                </Tooltip>
              </Box>
            </Box>
          </Paper>

          {/* Listado de Tarjetas de Issues */}
          {filteredIssues.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              No hay issues que coincidan con los filtros seleccionados.
            </Alert>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {filteredIssues.map((issue) => (
                <Card
                  key={issue.id}
                  variant="outlined"
                  sx={{
                    borderRadius: 3,
                    border: "1px solid",
                    borderColor: "divider",
                    transition: "box-shadow 0.2s",
                    "&:hover": {
                      boxShadow: 2
                    }
                  }}
                >
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1, mb: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                        <Typography variant="subtitle1" fontWeight={700} color="primary">
                          {issue.id}
                        </Typography>
                        <Chip
                          label={getRepoLabel(issue.repo)}
                          size="small"
                          color={getRepoChipColor(issue.repo)}
                          sx={{ fontWeight: 700, fontSize: "0.75rem" }}
                        />
                        <Chip
                          label={issue.type.toUpperCase()}
                          size="small"
                          color={getTypeChipColor(issue.type)}
                          sx={{ fontWeight: 600, fontSize: "0.7rem" }}
                        />
                        <Chip
                          label={`Prioridad: ${issue.priority}`}
                          size="small"
                          color={getPriorityChipColor(issue.priority)}
                          variant="outlined"
                          sx={{ fontSize: "0.7rem" }}
                        />
                        <Chip
                          label={issue.component}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: "0.7rem" }}
                        />
                        {issue.estimation && (
                          <Chip
                            icon={<TimeIcon sx={{ fontSize: "14px !important" }} />}
                            label={issue.estimation.text || `Total: ${issue.estimation.totalHours}h`}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: "0.72rem", fontWeight: 600 }}
                          />
                        )}
                      </Box>
                    </Box>

                    <Typography variant="h6" fontWeight={600} gutterBottom sx={{ mt: 1 }}>
                      {issue.title}
                    </Typography>

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, whiteSpace: "pre-line" }}>
                      {issue.description}
                    </Typography>

                    {/* Preguntas Abiertas del Issue */}
                    {issue.openQuestions &&
                      issue.openQuestions.length > 0 &&
                      issue.openQuestions[0] !== "Ninguna" && (
                        <Alert severity="warning" sx={{ mb: 2, py: 0.5, px: 2, borderRadius: 2 }}>
                          <Typography variant="caption" fontWeight={700} display="block">
                            Preguntas abiertas para este issue:
                          </Typography>
                          {issue.openQuestions.map((q, qIdx) => (
                            <Typography key={qIdx} variant="caption" display="block">
                              • {q}
                            </Typography>
                          ))}
                        </Alert>
                      )}

                    {/* Dependencias entre PRs / Funcionales */}
                    {issue.dependencies &&
                      issue.dependencies.length > 0 &&
                      issue.dependencies[0] !== "Ninguna" && (
                        <Box sx={{ mb: 1.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                          <Typography variant="caption" fontWeight={600} color="text.secondary">
                            Dependencias:
                          </Typography>
                          {issue.dependencies.map((dep, dIdx) => (
                            <Chip key={dIdx} label={dep} size="small" variant="outlined" color="primary" sx={{ fontSize: "0.7rem" }} />
                          ))}
                        </Box>
                      )}

                    {/* Flujo de PR */}
                    {issue.prWorkflow && (
                      <Box sx={{ mb: 1.5 }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          <strong>Flujo de PR:</strong> {issue.prWorkflow}
                        </Typography>
                      </Box>
                    )}

                    {/* Archivos sugeridos (verificar en repo) */}
                    {issue.expectedFiles && issue.expectedFiles.length > 0 && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" fontWeight={600} color="text.secondary" display="block">
                          Archivos sugeridos (verificar en el repo):
                        </Typography>
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                          {issue.expectedFiles.map((file, fIdx) => (
                            <Chip
                              key={fIdx}
                              label={file}
                              size="small"
                              sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}

                    {issue.acceptanceCriteria.length > 0 && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" fontWeight={600} color="text.secondary" display="block">
                          Criterios de Aceptación:
                        </Typography>
                        <Box sx={{ mt: 0.5, pl: 1 }}>
                          {issue.acceptanceCriteria.map((crit, cIdx) => (
                            <Box key={cIdx} sx={{ display: "flex", alignItems: "center", gap: 0.8, my: 0.3 }}>
                              <CheckCircleOutlineIcon color="action" sx={{ fontSize: 16 }} />
                              <Typography variant="body2">
                                {crit.includes("[Supuesto]") ? (
                                  <>
                                    <Chip label="Supuesto" size="small" color="warning" variant="outlined" sx={{ mr: 0.8, height: 18, fontSize: "0.65rem" }} />
                                    {crit.replace("[Supuesto]", "").trim()}
                                  </>
                                ) : (
                                  crit
                                )}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    )}

                    {/* Acordeón con el Prompt para el Agente */}
                    <Accordion
                      variant="outlined"
                      sx={{
                        borderRadius: "8px !important",
                        bgcolor: "background.default",
                        mt: 1.5,
                        "&:before": { display: "none" }
                      }}
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <SmartToyIcon color="primary" sx={{ fontSize: 20 }} />
                          <Typography variant="subtitle2" fontWeight={600}>
                            Prompt Optimizado para Agente de IA ({issue.repo ? `Repo: ${getRepoLabel(issue.repo)}` : "Cursor / Claude Code / Antigravity"})
                          </Typography>
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 0 }}>
                        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={copiedId === issue.id ? <CheckIcon /> : <ContentCopyIcon />}
                            onClick={() =>
                              copyToClipboard(
                                issue.agentPrompt,
                                issue.id,
                                `¡Prompt de ${issue.id} copiado al portapapeles!`
                              )
                            }
                            color={copiedId === issue.id ? "success" : "primary"}
                          >
                            {copiedId === issue.id ? "Copiado" : "Copiar Prompt"}
                          </Button>
                        </Box>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 2,
                            bgcolor: "action.hover",
                            borderRadius: 2,
                            overflowX: "auto"
                          }}
                        >
                          <Typography
                            component="pre"
                            sx={{
                              fontFamily: "monospace",
                              fontSize: "0.8rem",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              margin: 0
                            }}
                          >
                            {issue.agentPrompt}
                          </Typography>
                        </Paper>
                      </AccordionDetails>
                    </Accordion>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          {/* 7. Backlog */}
          {analysis.backlog && analysis.backlog.length > 0 && (
            <Paper
              sx={{
                p: 3,
                mt: 3,
                borderRadius: 3,
                bgcolor: "grey.50",
                border: "1px solid",
                borderColor: "divider"
              }}
            >
              <Typography
                variant="h6"
                fontWeight={700}
                gutterBottom
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <BacklogIcon color="action" /> Backlog de la Reunión (No Bloqueante / Próximas Etapas)
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Puntos acordados como mejoras a futuro o requerimientos diferidos sin prompt de implementación.
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {analysis.backlog.map((item, idx) => (
                  <Box key={idx} sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                    <Chip
                      label="Backlog"
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: "0.7rem", height: 22 }}
                    />
                    <Typography variant="body2">{item}</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          )}
        </>
      )}

      {/* Modal para agregar proveedor personalizado */}
      <CustomProviderModal
        open={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onSaved={(created) => {
          setCustomProviders((prev) => [...prev, created]);
          setProvider(created.id);
          setSnackMessage(`Proveedor ${created.name} agregado y seleccionado.`);
        }}
      />

      {/* Snackbar para feedback de acciones */}
      <Snackbar
        open={!!snackMessage}
        autoHideDuration={4000}
        onClose={() => setSnackMessage(null)}
        message={snackMessage}
      />
    </Box>
  );
};
