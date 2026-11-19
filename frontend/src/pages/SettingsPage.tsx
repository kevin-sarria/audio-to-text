import React, { useState, useEffect, useCallback } from "react";
import { Box, Typography, Button, Snackbar } from "@mui/material";
import { FolderOpen as FolderIcon } from "@mui/icons-material";
import { ProjectFolderDto } from "@audio-to-text/shared";
import { api } from "../lib/api.js";
import { ProjectFolderModal } from "../features/projectFolders/ProjectFolderModal.js";
import { CustomProviderModal } from "../features/customAi/CustomProviderModal.js";
import { useProjectFolders } from "../features/projectFolders/useProjectFolders.js";

import {
  DesktopSettings,
  KeysInfo,
  ModelItem,
  Recommendation
} from "./settings/components/SettingsTypes.js";
import { TranscriptionEngineSection } from "./settings/components/TranscriptionEngineSection.js";
import { WhisperModelsSection } from "./settings/components/WhisperModelsSection.js";
import { ApiKeysSection } from "./settings/components/ApiKeysSection.js";
import { AiIssuesSettingsSection } from "./settings/components/AiIssuesSettingsSection.js";
import { ProjectFoldersSection } from "./settings/components/ProjectFoldersSection.js";
import { RecommendedProvidersSection } from "./settings/components/RecommendedProvidersSection.js";

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<DesktopSettings>({
    engine: "whisper-local",
    language: "es",
    whisperModel: "small",
    whisperThreads: 4,
    useGpu: true,
    retentionHours: 48,
    groqModel: "whisper-large-v3-turbo",
    geminiModel: "gemini-2.5-flash",
    issuesDefaultProvider: "google-account",
    issuesDefaultModel: "gemini-2.5-pro",
    autoGenerateIssues: true,
    customProviders: []
  });

  const [keys, setKeys] = useState<KeysInfo>({
    groq: { hasKey: false, last4: "" },
    gemini: { hasKey: false, last4: "" },
    openai: { hasKey: false, last4: "" }
  });

  const [groqKeyInput, setGroqKeyInput] = useState("");
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [models, setModels] = useState<ModelItem[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recDisclaimer, setRecDisclaimer] = useState("");

  const { folders, refreshFolders, deleteFolder: deleteProjectFolder } = useProjectFolders();
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ProjectFolderDto | null>(null);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ provider: string; ok: boolean; msg: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get<any>("/desktop/settings");
      if (res.success && res.data) {
        setSettings({
          ...res.data.settings,
          issuesDefaultProvider: res.data.settings.issuesDefaultProvider || "google-account",
          issuesDefaultModel: res.data.settings.issuesDefaultModel || "gemini-2.5-pro",
          autoGenerateIssues: res.data.settings.autoGenerateIssues !== false,
          customProviders: res.data.settings.customProviders || []
        });
        setKeys(res.data.keys || {});
      }
    } catch {
      // Ignorar en entorno de test o desconectado
    }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const res = await api.get<any>("/desktop/models");
      if (res.success && res.data) {
        setModels(res.data);
      }
    } catch {}
  }, []);

  const fetchRecommendations = useCallback(async () => {
    try {
      const res = await api.get<any>("/desktop/recommendations");
      if (res.success && res.data) {
        setRecommendations(res.data.providers || []);
        setRecDisclaimer(res.data.disclaimer || "");
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchModels();
    fetchRecommendations();
  }, [fetchSettings, fetchModels, fetchRecommendations]);

  useEffect(() => {
    const isDownloadingAny = models.some((m) => m.isDownloading);
    if (!isDownloadingAny) return;

    const interval = setInterval(async () => {
      await fetchModels();
    }, 1500);

    return () => clearInterval(interval);
  }, [models, fetchModels]);

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      const res = await api.put<any>("/desktop/settings", settings);
      if (res.success) {
        setSnackMessage("Configuración guardada correctamente");
      }
    } catch (err: any) {
      setSnackMessage(`Error al guardar configuración: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKey = async (provider: string) => {
    let key = "";
    if (provider === "groq") key = groqKeyInput;
    else if (provider === "gemini") key = geminiKeyInput;
    else if (provider === "openai") key = openaiKeyInput;

    if (!key.trim()) return;

    try {
      const res = await api.put<any>(`/desktop/settings/keys/${provider}`, { apiKey: key.trim() });
      if (res.success) {
        setSnackMessage(`Clave de ${provider} guardada.`);
        if (provider === "groq") setGroqKeyInput("");
        if (provider === "gemini") setGeminiKeyInput("");
        if (provider === "openai") setOpenaiKeyInput("");
        await fetchSettings();
      }
    } catch (err: any) {
      setSnackMessage(`Error guardando clave: ${err.message}`);
    }
  };

  const handleDeleteKey = async (provider: string) => {
    try {
      const res = await api.delete<any>(`/desktop/settings/keys/${provider}`);
      if (res.success) {
        setSnackMessage(`Clave de ${provider} eliminada.`);
        await fetchSettings();
      }
    } catch (err: any) {
      setSnackMessage(`Error al eliminar clave: ${err.message}`);
    }
  };

  const handleTestKey = async (provider: string) => {
    try {
      const res = await api.post<any>(`/desktop/settings/keys/${provider}/test`);
      if (res.success) {
        setTestResult({
          provider,
          ok: res.ok,
          msg: res.message
        });
      }
    } catch (err: any) {
      setTestResult({
        provider,
        ok: false,
        msg: err.message
      });
    }
  };

  const handleDeleteCustomProvider = async (providerId: string) => {
    if (!window.confirm("¿Seguro que deseas eliminar este proveedor personalizado?")) return;
    try {
      const updated = (settings.customProviders || []).filter((p) => p.id !== providerId);
      await api.put("/desktop/settings", { customProviders: updated });
      await api.delete(`/desktop/settings/keys/${providerId}`).catch(() => {});
      setSettings((prev) => ({ ...prev, customProviders: updated }));
      setSnackMessage("Proveedor personalizado eliminado.");
    } catch (err: any) {
      setSnackMessage(`Error al eliminar: ${err.message}`);
    }
  };

  const handleDownloadModel = async (name: string) => {
    try {
      await api.post(`/desktop/models/${name}/download`);
      setSnackMessage(`Iniciando descarga de ${name}...`);
      await fetchModels();
    } catch (err: any) {
      setSnackMessage(`Error al descargar: ${err.message}`);
    }
  };

  const handleCancelDownload = async (name: string) => {
    try {
      await api.post(`/desktop/models/${name}/cancel`);
      setSnackMessage(`Descarga cancelada para ${name}.`);
      await fetchModels();
    } catch (err: any) {
      setSnackMessage(`Error al cancelar: ${err.message}`);
    }
  };

  const handleDeleteModel = async (name: string) => {
    try {
      await api.delete(`/desktop/models/${name}`);
      setSnackMessage(`Modelo ${name} eliminado.`);
      await fetchModels();
    } catch (err: any) {
      setSnackMessage(`Error al eliminar modelo: ${err.message}`);
    }
  };

  const handleOpenDataFolder = () => {
    if (window.desktop?.openDataFolder) {
      window.desktop.openDataFolder().catch(() => {});
    }
  };

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", pb: 6 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Configuración
        </Typography>
        {window.desktop && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<FolderIcon />}
            onClick={handleOpenDataFolder}
          >
            Abrir Carpeta de Datos
          </Button>
        )}
      </Box>

      <TranscriptionEngineSection
        settings={settings}
        onChangeSettings={setSettings}
        onSave={handleSaveSettings}
        loading={loading}
      />

      <WhisperModelsSection
        models={models}
        onDownloadModel={handleDownloadModel}
        onCancelDownload={handleCancelDownload}
        onDeleteModel={handleDeleteModel}
      />

      <ApiKeysSection
        keys={keys}
        groqKeyInput={groqKeyInput}
        onGroqKeyInputChange={setGroqKeyInput}
        geminiKeyInput={geminiKeyInput}
        onGeminiKeyInputChange={setGeminiKeyInput}
        openaiKeyInput={openaiKeyInput}
        onOpenaiKeyInputChange={setOpenaiKeyInput}
        onSaveKey={handleSaveKey}
        onTestKey={handleTestKey}
        onDeleteKey={handleDeleteKey}
        customProviders={settings.customProviders || []}
        onOpenCustomModal={() => setIsCustomModalOpen(true)}
        onDeleteCustomProvider={handleDeleteCustomProvider}
        testResult={testResult}
        onCloseTestResult={() => setTestResult(null)}
      />

      <AiIssuesSettingsSection
        settings={settings}
        onChangeSettings={setSettings}
        onSave={handleSaveSettings}
        loading={loading}
      />

      <ProjectFoldersSection
        folders={folders}
        onNewFolder={() => {
          setEditingFolder(null);
          setIsFolderModalOpen(true);
        }}
        onEditFolder={(f) => {
          setEditingFolder(f);
          setIsFolderModalOpen(true);
        }}
        onDeleteFolder={async (f) => {
          if (window.confirm(`¿Eliminar la carpeta '${f.name}'?`)) {
            await deleteProjectFolder(f.id);
            setSnackMessage("Carpeta eliminada.");
          }
        }}
      />

      <RecommendedProvidersSection
        recommendations={recommendations}
        disclaimer={recDisclaimer}
      />

      <ProjectFolderModal
        open={isFolderModalOpen}
        folder={editingFolder}
        onClose={() => {
          setIsFolderModalOpen(false);
          setEditingFolder(null);
        }}
        onSaved={() => {
          refreshFolders();
          setSnackMessage(editingFolder ? "Carpeta actualizada." : "Carpeta creada exitosamente.");
        }}
      />

      <CustomProviderModal
        open={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onSaved={(newProvider) => {
          setSettings((prev) => ({
            ...prev,
            customProviders: [...(prev.customProviders || []), newProvider]
          }));
          setSnackMessage(`Proveedor ${newProvider.name} agregado exitosamente.`);
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
