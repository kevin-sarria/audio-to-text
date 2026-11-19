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
  WarningAmber as WarningIcon
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

interface MeetingAnalysisPanelProps {
  sessionId: string;
}

const DEFAULT_PROJECT_CONTEXT = `Monorepo TypeScript:
- Backend: Express, Prisma ORM, BullMQ, Clean Architecture (domain, application, infrastructure, interfaces).
- Frontend: React 18, Vite, Material UI (MUI v5), Zustand.
- Base de datos: MySQL 8.0 (Web) / SQLite (Desktop).
- Convenciones: Código en TypeScript estricto, separación en casos de uso, DTOs compartidos en packages/shared.`;

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

  const handleCopyAllIssues = () => {
    if (!analysis || !analysis.issues.length) return;

    let md = `# ${editableTitle || "Issues de Desarrollo"}\n\n`;
    md += `**Fecha**: ${new Date(analysis.createdAt).toLocaleDateString()}\n\n`;
    md += `## Resumen Ejecutivo de la Reunión\n${analysis.summary}\n\n`;

    if (analysis.keyDecisions.length > 0) {
      md += `### Decisiones Clave\n`;
      analysis.keyDecisions.forEach((d) => {
        md += `- ${d}\n`;
      });
      md += `\n`;
    }

    md += `## Lista de Issues (${analysis.issues.length})\n\n`;

    analysis.issues.forEach((issue) => {
      md += `### [${issue.id}] ${issue.title}\n`;
      md += `- **Tipo**: \`${issue.type}\` | **Prioridad**: \`${issue.priority}\` | **Componente**: \`${issue.component}\`\n`;
      md += `- **Descripción**: ${issue.description}\n`;
      if (issue.expectedFiles && issue.expectedFiles.length > 0) {
        md += `- **Archivos esperados**: ${issue.expectedFiles.map((f) => `\`${f}\``).join(", ")}\n`;
      }
      md += `- **Criterios de Aceptación**:\n`;
      issue.acceptanceCriteria.forEach((crit) => {
        md += `  - [ ] ${crit}\n`;
      });
      md += `\n<details><summary>Prompt para Agente de IA</summary>\n\n\`\`\`markdown\n${issue.agentPrompt}\n\`\`\`\n</details>\n\n---\n\n`;
    });

    copyToClipboard(md, "all-issues", "¡Todas las issues copiadas en formato Markdown!");
  };

  const handleDownloadMarkdown = () => {
    if (!analysis) return;
    let md = `# ${editableTitle || "Resumen de Reunión e Issues Técnicas"}\n`;
    md += `**Fecha**: ${new Date(analysis.createdAt).toLocaleString()}\n\n`;
    md += `## Resumen Ejecutivo\n${analysis.summary}\n\n`;

    if (analysis.keyDecisions.length > 0) {
      md += `## Decisiones Clave\n`;
      analysis.keyDecisions.forEach((d) => (md += `- ${d}\n`));
      md += `\n`;
    }

    if (analysis.topicsDiscussed.length > 0) {
      md += `## Temas Discutidos\n`;
      analysis.topicsDiscussed.forEach((t) => (md += `- ${t}\n`));
      md += `\n`;
    }

    md += `## Issues de Programación para Agentes de IA\n\n`;
    analysis.issues.forEach((issue) => {
      md += `### ${issue.id}: ${issue.title}\n`;
      md += `- **Tipo**: ${issue.type} | **Prioridad**: ${issue.priority} | **Componente**: ${issue.component}\n`;
      md += `- **Descripción**: ${issue.description}\n`;
      if (issue.expectedFiles?.length) {
        md += `- **Archivos sugeridos**: ${issue.expectedFiles.join(", ")}\n`;
      }
      md += `\n**Criterios de Aceptación:**\n`;
      issue.acceptanceCriteria.forEach((crit) => (md += `- [ ] ${crit}\n`));
      md += `\n**Prompt para Agente de IA:**\n\n\`\`\`markdown\n${issue.agentPrompt}\n\`\`\`\n\n---\n\n`;
    });

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
      return matchType && matchPriority;
    });
  }, [analysis, filterType, filterPriority]);

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

      {/* Alerta si falla la llamada o si no hay configuración */}
      {errorMsg && (
        <Alert
          severity="warning"
          icon={<WarningIcon fontSize="inherit" />}
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                color="inherit"
                size="small"
                variant="outlined"
                onClick={() => {
                  setProvider("google-account");
                  setErrorMsg(null);
                  handleGenerate();
                }}
              >
                Usar Cuenta de Google Pro (Sin API Key)
              </Button>
              <Button
                color="inherit"
                size="small"
                onClick={() => setIsConfigExpanded(true)}
              >
                Ajustar Contexto
              </Button>
            </Box>
          }
        >
          {errorMsg}
        </Alert>
      )}

      {isGenerating && (
        <Paper sx={{ p: 3, mb: 3, borderRadius: 2, bgcolor: "action.hover" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <CircularProgress size={28} />
            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                Generando resumen técnico y extrayendo issues con IA...
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Extrayendo decisiones clave, identificando tareas técnicas y redactando prompts optimizados para agentes de código.
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

            <TextField
              size="small"
              label="Modelo (opcional)"
              placeholder="ej. gemini-2.5-pro, gpt-4o, deepseek-chat"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              sx={{ width: 200 }}
            />

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

          {/* Barra de Herramientas de Issues */}
          <Paper sx={{ p: 2, mb: 3, borderRadius: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <CodeIcon color="primary" />
                <Typography variant="h6" fontWeight={700}>
                  Issues para Programación ({filteredIssues.length} de {analysis.issues.length})
                </Typography>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
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

                {/* Botón Copiar Todas */}
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={copiedId === "all-issues" ? <CheckIcon /> : <ContentCopyIcon />}
                  onClick={handleCopyAllIssues}
                  color={copiedId === "all-issues" ? "success" : "primary"}
                >
                  Copiar Todas (Markdown)
                </Button>

                {/* Botón Descargar */}
                <Tooltip title="Descargar como archivo Markdown">
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
                      </Box>
                    </Box>

                    <Typography variant="h6" fontWeight={600} gutterBottom sx={{ mt: 1 }}>
                      {issue.title}
                    </Typography>

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, whiteSpace: "pre-line" }}>
                      {issue.description}
                    </Typography>

                    {issue.expectedFiles && issue.expectedFiles.length > 0 && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" fontWeight={600} color="text.secondary" display="block">
                          Archivos / Módulos esperados:
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
                              <Typography variant="body2">{crit}</Typography>
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
                            Prompt Optimizado para Agente de IA (Cursor / Claude Code / Antigravity)
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
