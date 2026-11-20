import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  TextField,
  Snackbar,
  IconButton,
  Tooltip,
  Tabs,
  Tab
} from "@mui/material";
import {
  AutoAwesome as AutoAwesomeIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Code as CodeIcon,
  AssignmentTurnedIn as SummaryIcon,
  CheckCircle as StatusIcon,
  HelpOutline as QuestionIcon
} from "@mui/icons-material";
import {
  MeetingAnalysisDto,
  MeetingAnalysisProvider,
  CustomAiProviderDto
} from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { useAppStore } from "../../store/index.js";
import { useProjectFolders } from "../projectFolders/useProjectFolders.js";
import { CustomProviderModal } from "../customAi/CustomProviderModal.js";

import {
  DEFAULT_PROJECT_CONTEXT,
  buildStructuredMarkdown
} from "./components/MeetingAnalysisMarkdown.js";
import { AnalysisErrorAlert } from "./components/AnalysisErrorAlert.js";
import { ProjectFolderLinkBar } from "./components/ProjectFolderLinkBar.js";
import { ProjectContextAccordion } from "./components/ProjectContextAccordion.js";
import { AnalysisTitleHeader } from "./components/AnalysisTitleHeader.js";
import { MeetingSummaryCard } from "./components/MeetingSummaryCard.js";
import { MeetingClassifiedSection } from "./components/MeetingClassifiedSection.js";
import { HoursTotalsCard } from "./components/HoursTotalsCard.js";
import { DevIssuesSection } from "./components/DevIssuesSection.js";

interface MeetingAnalysisPanelProps {
  sessionId: string;
}

export const MeetingAnalysisPanel: React.FC<MeetingAnalysisPanelProps> = ({ sessionId }) => {
  const { guestToken, currentSession, updateSessionProjectFolder } = useAppStore();
  const { folders } = useProjectFolders();

  const [analysis, setAnalysis] = useState<MeetingAnalysisDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);

  // Pestaña activa del análisis
  const [activeAnalysisTab, setActiveAnalysisTab] = useState(0);

  // Título editable del análisis
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editableTitle, setEditableTitle] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // Opciones de configuración
  const [projectContext, setProjectContext] = useState(DEFAULT_PROJECT_CONTEXT);
  const [provider, setProvider] = useState<string>("google-account");
  const [customApiKey, setCustomApiKey] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);

  // Proveedores personalizados registrados
  const [customProviders, setCustomProviders] = useState<CustomAiProviderDto[]>([]);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

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

  const fetchSettingsAndProviders = async () => {
    try {
      const res = await api.get<any>("/desktop/settings");
      if (res.success && res.data) {
        if (res.data.settings?.customProviders) {
          setCustomProviders(res.data.settings.customProviders);
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
      const headers: Record<string, string> = guestToken ? { "x-guest-token": guestToken } : {};
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

  const handleGenerate = async (overrideProvider?: string) => {
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = guestToken ? { "x-guest-token": guestToken } : {};
      const chosenProvider = overrideProvider || provider;
      const matchedCustom = customProviders.find((cp) => cp.id === chosenProvider);
      const effectiveBaseUrl = matchedCustom ? matchedCustom.baseUrl : undefined;
      const effectiveModel = customModel.trim() || matchedCustom?.defaultModel || undefined;
      const effectiveApiKey = customApiKey.trim() || undefined;
      const effectiveProvider = (matchedCustom ? matchedCustom.id : chosenProvider) as MeetingAnalysisProvider;

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
        setActiveAnalysisTab(0);
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
      const headers: Record<string, string> = guestToken ? { "x-guest-token": guestToken } : {};
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
      const headers: Record<string, string> = guestToken ? { "x-guest-token": guestToken } : {};
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

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      <ProjectFolderLinkBar
        linkedFolder={linkedFolder}
        folders={folders}
        currentFolderId={currentSession?.projectFolderId || null}
        onLinkFolder={handleLinkFolder}
        isConfigExpanded={isConfigExpanded}
        onToggleConfig={() => setIsConfigExpanded(!isConfigExpanded)}
      />

      <AnalysisTitleHeader
        title={analysis?.title || editableTitle}
        isEditingTitle={isEditingTitle}
        editableTitle={editableTitle}
        isSavingTitle={isSavingTitle}
        isGenerating={isGenerating}
        hasAnalysis={!!analysis}
        onStartEditing={() => setIsEditingTitle(true)}
        onCancelEditing={() => setIsEditingTitle(false)}
        onChangeTitle={setEditableTitle}
        onSaveTitle={handleSaveTitle}
        onGenerate={() => handleGenerate()}
      />

      {errorMsg && (
        <AnalysisErrorAlert
          errorMsg={errorMsg}
          onRetryWithGoogle={() => {
            setProvider("google-account");
            setErrorMsg(null);
            handleGenerate("google-account");
          }}
          onOpenConfig={() => setIsConfigExpanded(true)}
        />
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

      <ProjectContextAccordion
        isExpanded={isConfigExpanded}
        onToggleExpanded={setIsConfigExpanded}
        projectContext={projectContext}
        onProjectContextChange={setProjectContext}
        provider={provider}
        onProviderChange={(val) => {
          setProvider(val);
          const matched = customProviders.find((cp) => cp.id === val);
          if (matched) setCustomModel(matched.defaultModel);
        }}
        customApiKey={customApiKey}
        onCustomApiKeyChange={setCustomApiKey}
        customModel={customModel}
        onCustomModelChange={setCustomModel}
        customProviders={customProviders}
        onOpenCustomModal={() => setIsCustomModalOpen(true)}
      />

      {analysis && (
        <>
          {/* Navegación por pestañas limpias que reduce el ruido de cajas apiladas */}
          <Box
            sx={{
              mb: 3,
              p: 0.5,
              borderRadius: "12px",
              border: 1,
              borderColor: "divider",
              backgroundColor: (theme) =>
                theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"
            }}
          >
            <Tabs
              value={activeAnalysisTab}
              onChange={(_, val) => setActiveAnalysisTab(val)}
              variant="scrollable"
              scrollButtons="auto"
              TabIndicatorProps={{ sx: { display: "none" } }}
              sx={{ minHeight: 40, "& .MuiTabs-flexContainer": { gap: 0.5 } }}
            >
              <Tab
                disableRipple
                icon={<CodeIcon fontSize="small" />}
                iconPosition="start"
                label={`Issues (${analysis.issues.length})`}
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  borderRadius: "8px",
                  minHeight: 40,
                  "&.Mui-selected": {
                    backgroundColor: "background.paper",
                    color: "primary.main",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.06)"
                  }
                }}
              />
              <Tab
                disableRipple
                icon={<SummaryIcon fontSize="small" />}
                iconPosition="start"
                label="Resumen Ejecutivo"
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  borderRadius: "8px",
                  minHeight: 40,
                  "&.Mui-selected": {
                    backgroundColor: "background.paper",
                    color: "primary.main",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.06)"
                  }
                }}
              />
              <Tab
                disableRipple
                icon={<StatusIcon fontSize="small" />}
                iconPosition="start"
                label="Estado de Reunión"
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  borderRadius: "8px",
                  minHeight: 40,
                  "&.Mui-selected": {
                    backgroundColor: "background.paper",
                    color: "primary.main",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.06)"
                  }
                }}
              />
              <Tab
                disableRipple
                icon={<QuestionIcon fontSize="small" />}
                iconPosition="start"
                label={
                  analysis.globalOpenQuestions?.length
                    ? `Preguntas (${analysis.globalOpenQuestions.length})`
                    : "Preguntas"
                }
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  borderRadius: "8px",
                  minHeight: 40,
                  "&.Mui-selected": {
                    backgroundColor: "background.paper",
                    color: "primary.main",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.06)"
                  }
                }}
              />
            </Tabs>
          </Box>

          {/* Pestaña 0: Issues de Programación y Totales */}
          {activeAnalysisTab === 0 && (
            <>
              {analysis.repoHoursTotals && <HoursTotalsCard totals={analysis.repoHoursTotals} />}
              <DevIssuesSection
                issues={filteredIssues}
                totalIssuesCount={analysis.issues.length}
                filterRepo={filterRepo}
                onFilterRepoChange={setFilterRepo}
                filterType={filterType}
                onFilterTypeChange={setFilterType}
                filterPriority={filterPriority}
                onFilterPriorityChange={setFilterPriority}
                copiedId={copiedId}
                onCopyAllIssues={handleCopyAllIssues}
                onDownloadMarkdown={handleDownloadMarkdown}
                onDownloadJson={handleDownloadJson}
                onCopyPrompt={(prompt, id) =>
                  copyToClipboard(prompt, id, `¡Prompt de ${id} copiado al portapapeles!`)
                }
              />
            </>
          )}

          {/* Pestaña 1: Resumen y Decisiones Clave */}
          {activeAnalysisTab === 1 && (
            <MeetingSummaryCard analysis={analysis} />
          )}

          {/* Pestaña 2: Ya Resuelto, En Curso y Backlog */}
          {activeAnalysisTab === 2 && (
            <MeetingClassifiedSection analysis={analysis} section="status" />
          )}

          {/* Pestaña 3: Preguntas Abiertas y Ambigüedades */}
          {activeAnalysisTab === 3 && (
            <MeetingClassifiedSection analysis={analysis} section="questions" />
          )}
        </>
      )}

      <CustomProviderModal
        open={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onSaved={(created) => {
          setCustomProviders((prev) => [...prev, created]);
          setProvider(created.id);
          setSnackMessage(`Proveedor ${created.name} agregado y seleccionado.`);
        }}
      />

      <Snackbar
        open={!!snackMessage}
        autoHideDuration={4000}
        onClose={() => setSnackMessage(null)}
        message={snackMessage}
      />
    </Box>
  );
};
