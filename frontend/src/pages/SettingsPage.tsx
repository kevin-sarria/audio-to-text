import React, { useState, useEffect, useCallback } from "react";
import { Box, Typography, Button, Snackbar, Tabs, Tab, Paper } from "@mui/material";
import {
  FolderOpen as FolderIcon,
  Mic as MicIcon,
  VpnKey as KeyIcon,
  FolderSpecial as FolderSpecialIcon,
  AutoAwesome as AutoAwesomeIcon
} from "@mui/icons-material";
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
import { RecommendedProvidersModal } from "./settings/components/RecommendedProvidersModal.js";

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);

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
  const [isRecModalOpen, setIsRecModalOpen] = useState(false);

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
      {/* Encabezado con acciones rápidas */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2.5, flexWrap: "wrap", gap: 1 }}>
        <Typography variant="h4" fontWeight={700}>
          Configuración
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AutoAwesomeIcon />}
            onClick={() => setIsRecModalOpen(true)}
          >
            Proveedores Recomendados
          </Button>
          {window.desktop && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<FolderIcon />}
              onClick={handleOpenDataFolder}
            >
              Carpeta de Datos
            </Button>
          )}
        </Box>
      </Box>

      {/* Pestañas modernas tipo Segmented Control (sin barras azules desbordadas) */}
      <Box
        sx={{
          mb: 3.5,
          p: 0.6,
          borderRadius: "14px",
          border: 1,
          borderColor: "divider",
          backgroundColor: (theme) =>
            theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
          display: "flex"
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          variant="fullWidth"
          TabIndicatorProps={{ sx: { display: "none" } }}
          sx={{
            width: "100%",
            minHeight: 44,
            "& .MuiTabs-flexContainer": {
              gap: 0.75
            }
          }}
        >
          <Tab
            disableRipple
            icon={<MicIcon fontSize="small" />}
            iconPosition="start"
            label="Transcripción & Modelos"
            sx={{
              textTransform: "none",
              fontSize: "0.9rem",
              fontWeight: 600,
              minHeight: 44,
              borderRadius: "10px",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              color: "text.secondary",
              "&.Mui-selected": {
                backgroundColor: "background.paper",
                color: "primary.main",
                fontWeight: 700,
                boxShadow: "0 2px 8px rgba(0,0,0,0.07)"
              },
              "&:hover:not(.Mui-selected)": {
                backgroundColor: "rgba(0,0,0,0.03)",
                color: "text.primary"
              }
            }}
          />
          <Tab
            disableRipple
            icon={<KeyIcon fontSize="small" />}
            iconPosition="start"
            label="IA & Claves de API"
            sx={{
              textTransform: "none",
              fontSize: "0.9rem",
              fontWeight: 600,
              minHeight: 44,
              borderRadius: "10px",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              color: "text.secondary",
              "&.Mui-selected": {
                backgroundColor: "background.paper",
                color: "primary.main",
                fontWeight: 700,
                boxShadow: "0 2px 8px rgba(0,0,0,0.07)"
              },
              "&:hover:not(.Mui-selected)": {
                backgroundColor: "rgba(0,0,0,0.03)",
                color: "text.primary"
              }
            }}
          />
          <Tab
            disableRipple
            icon={<FolderSpecialIcon fontSize="small" />}
            iconPosition="start"
            label="Carpetas de Proyecto"
            sx={{
              textTransform: "none",
              fontSize: "0.9rem",
              fontWeight: 600,
              minHeight: 44,
              borderRadius: "10px",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              color: "text.secondary",
              "&.Mui-selected": {
                backgroundColor: "background.paper",
                color: "primary.main",
                fontWeight: 700,
                boxShadow: "0 2px 8px rgba(0,0,0,0.07)"
              },
              "&:hover:not(.Mui-selected)": {
                backgroundColor: "rgba(0,0,0,0.03)",
                color: "text.primary"
              }
            }}
          />
        </Tabs>
      </Box>

      {/* Pestaña 0: Transcripción y Modelos en Disco */}
      {activeTab === 0 && (
        <>
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
        </>
      )}

      {/* Pestaña 1: Claves de API y Configuración de Issues */}
      {activeTab === 1 && (
        <>
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
        </>
      )}

      {/* Pestaña 2: Carpetas de Proyecto (Harnesses) */}
      {activeTab === 2 && (
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
      )}

      {/* Modal elegante de Proveedores Recomendados (sin saturar la pantalla principal) */}
      <RecommendedProvidersModal
        open={isRecModalOpen}
        onClose={() => setIsRecModalOpen(false)}
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
