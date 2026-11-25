import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Snackbar
} from "@mui/material";
import type { MeetingAnalysisProvider } from "@audio-to-text/shared";
import { useAppStore } from "../../store/index.js";
import { useProjectFolders } from "../projectFolders/useProjectFolders.js";
import { CustomProviderModal } from "../customAi/CustomProviderModal.js";

import { buildStructuredMarkdown } from "./components/MeetingAnalysisMarkdown.js";
import { AnalysisHeaderBar } from "./components/AnalysisHeaderBar.js";
import { GenerationSettingsDrawer } from "./components/GenerationSettingsDrawer.js";
import { ValidationNotices } from "./components/ValidationNotices.js";
import { AnalysisErrorAlert } from "./components/AnalysisErrorAlert.js";
import { AnalysisTabsNav } from "./components/AnalysisTabsNav.js";
import { HoursTotalsCard } from "./components/HoursTotalsCard.js";
import { DevIssuesSection } from "./components/DevIssuesSection.js";
import { MeetingSummaryCard } from "./components/MeetingSummaryCard.js";
import { MeetingClassifiedSection } from "./components/MeetingClassifiedSection.js";

import { useMeetingAnalysis } from "./useMeetingAnalysis.js";
import { useGenerationSettings } from "./useGenerationSettings.js";

interface MeetingAnalysisPanelProps {
  sessionId: string;
}

export const MeetingAnalysisPanel: React.FC<MeetingAnalysisPanelProps> = ({ sessionId }) => {
  const { currentSession } = useAppStore();
  const { folders } = useProjectFolders();

  const {
    analysis,
    isLoading,
    isGenerating,
    errorMsg,
    setErrorMsg,
    snackMessage,
    setSnackMessage,
    isEditingTitle,
    setIsEditingTitle,
    editableTitle,
    setEditableTitle,
    isSavingTitle,
    generationSeconds,
    generationProgress,
    handleGenerate,
    handleSaveTitle,
    handleLinkFolder
  } = useMeetingAnalysis({ sessionId });

  const linkedFolder = useMemo(() => {
    if (!currentSession?.projectFolderId) return null;
    return folders.find((f) => f.id === currentSession.projectFolderId) || null;
  }, [currentSession?.projectFolderId, folders]);

  const {
    provider,
    setProvider,
    customApiKey,
    setCustomApiKey,
    customModel,
    setCustomModel,
    profileId,
    setProfileId,
    projectContext,
    setProjectContext,
    resetProjectContext,
    customProviders,
    setCustomProviders,
    projectProfiles,
    profilesError,
    selectedProviderLabel,
    selectedProfileName
  } = useGenerationSettings({
    analysis,
    linkedFolder
  });

  // Drawer de configuración y modal de nuevo proveedor
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

  // Pestañas y filtros
  const [activeAnalysisTab, setActiveAnalysisTab] = useState(0);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterRepo, setFilterRepo] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const triggerGenerate = async (overrideProvider?: string) => {
    const chosenProvider = overrideProvider || provider;
    const matchedCustom = customProviders.find((cp) => cp.id === chosenProvider);
    const effectiveBaseUrl = matchedCustom ? matchedCustom.baseUrl : undefined;
    const effectiveModel = customModel.trim() || matchedCustom?.defaultModel || undefined;
    const effectiveApiKey = customApiKey.trim() || undefined;
    const effectiveProvider = (matchedCustom ? matchedCustom.id : chosenProvider) as MeetingAnalysisProvider;

    const success = await handleGenerate({
      title: editableTitle,
      projectContext,
      provider: effectiveProvider,
      apiKey: effectiveApiKey,
      model: effectiveModel,
      baseUrl: effectiveBaseUrl,
      profileId
    });

    if (success) {
      setActiveAnalysisTab(0);
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

  const statusCount = useMemo(() => {
    if (!analysis) return 0;
    return (
      (analysis.alreadyResolved?.length || 0) +
      (analysis.inProgress?.length || 0) +
      (analysis.backlog?.length || 0)
    );
  }, [analysis]);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const progressMinutes = Math.floor(generationSeconds / 60);
  const progressSecs = (generationSeconds % 60).toString().padStart(2, "0");
  const progressTimeStr = `${progressMinutes}:${progressSecs}`;
  const modelTextForProgress = customModel.trim() || "modelo predeterminado";

  return (
    <Box sx={{ mt: 2 }}>
      {/* Cabecera unificada y responsiva */}
      <AnalysisHeaderBar
        title={analysis?.title || editableTitle}
        isEditingTitle={isEditingTitle}
        editableTitle={editableTitle}
        isSavingTitle={isSavingTitle}
        isGenerating={isGenerating}
        hasAnalysis={!!analysis}
        analysisUpdatedAt={analysis?.updatedAt}
        generationMeta={analysis?.generationMeta}
        onStartEditingTitle={() => setIsEditingTitle(true)}
        onCancelEditingTitle={() => setIsEditingTitle(false)}
        onChangeTitle={setEditableTitle}
        onSaveTitle={handleSaveTitle}
        onGenerate={() => triggerGenerate()}
        onOpenSettings={() => setIsDrawerOpen(true)}
        folders={folders}
        currentFolderId={currentSession?.projectFolderId || null}
        onLinkFolder={handleLinkFolder}
        selectedProviderLabel={selectedProviderLabel}
        selectedModel={customModel}
        selectedProfileName={selectedProfileName}
      />

      {/* Avisos de validación o análisis parcial del backend */}
      {analysis?.generationMeta && <ValidationNotices meta={analysis.generationMeta} />}

      {/* Alerta de error con acción directa para reintentar o abrir configuración */}
      {errorMsg && (
        <AnalysisErrorAlert
          errorMsg={errorMsg}
          onRetryWithGoogle={() => {
            setProvider("google-account");
            setErrorMsg(null);
            triggerGenerate("google-account");
          }}
          onOpenConfig={() => setIsDrawerOpen(true)}
        />
      )}

      {/* Indicador visual de progreso con contador en tiempo real */}
      {isGenerating && (
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            mb: 3,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "action.hover"
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <CircularProgress size={26} />
            <Box>
              <Typography variant="subtitle2" fontWeight={700}>
                Generando con {selectedProviderLabel} · {modelTextForProgress}… {progressTimeStr}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {generationProgress || "Preparando el análisis"}. En reuniones largas puede tardar más de 10 minutos; puedes salir de esta página y volver, el análisis sigue en curso.
              </Typography>
            </Box>
          </Box>
        </Paper>
      )}

      {/* Pestañas de resultados */}
      {analysis && (
        <>
          <AnalysisTabsNav
            activeTab={activeAnalysisTab}
            onChangeTab={setActiveAnalysisTab}
            issuesCount={analysis.issues.length}
            statusCount={statusCount}
            questionsCount={analysis.globalOpenQuestions?.length || 0}
          />

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

          {/* Pestaña 1: Resumen Ejecutivo */}
          {activeAnalysisTab === 1 && <MeetingSummaryCard analysis={analysis} />}

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

      {/* Panel lateral de configuración (Drawer) */}
      <GenerationSettingsDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        hasAnalysis={!!analysis}
        isGenerating={isGenerating}
        onGenerate={() => triggerGenerate()}
        provider={provider}
        onProviderChange={setProvider}
        customApiKey={customApiKey}
        onCustomApiKeyChange={setCustomApiKey}
        customModel={customModel}
        onCustomModelChange={setCustomModel}
        customProviders={customProviders}
        onOpenCustomModal={() => setIsCustomModalOpen(true)}
        profileId={profileId}
        onProfileIdChange={setProfileId}
        projectProfiles={projectProfiles}
        profilesError={profilesError}
        projectContext={projectContext}
        onProjectContextChange={setProjectContext}
        linkedFolder={linkedFolder}
        onResetProjectContext={resetProjectContext}
      />

      {/* Modal para registrar un proveedor personalizado nuevo */}
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
