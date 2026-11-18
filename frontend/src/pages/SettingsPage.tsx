import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  LinearProgress,
  Alert,
  Chip,
  Card,
  CardContent,
  CardActions,
  Divider,
  Snackbar,
  IconButton,
  Switch,
  FormControlLabel,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell
} from "@mui/material";
import {
  Save as SaveIcon,
  PlayArrow as TestIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Close as CancelIcon,
  FolderOpen as FolderIcon,
  Add as AddIcon,
  Edit as EditIcon,
  AutoAwesome as AutoAwesomeIcon,
  Folder as ProjectFolderIcon,
  Extension as ExtensionIcon,
  CheckCircleOutline as CheckCircleOutlineIcon
} from "@mui/icons-material";
import { CustomAiProviderDto, ProjectFolderDto } from "@audio-to-text/shared";
import { api } from "../lib/api.js";
import { ProjectFolderModal } from "../features/projectFolders/ProjectFolderModal.js";
import { CustomProviderModal } from "../features/customAi/CustomProviderModal.js";
import { useProjectFolders } from "../features/projectFolders/useProjectFolders.js";

interface DesktopSettings {
  engine: "whisper-local" | "groq" | "gemini";
  language: string;
  whisperModel: WhisperModelName;
  whisperThreads: number;
  useGpu: boolean;
  retentionHours: number;
  groqModel: string;
  geminiModel: string;
  issuesDefaultProvider?: string;
  issuesDefaultModel?: string;
  autoGenerateIssues?: boolean;
  customProviders?: CustomAiProviderDto[];
}

type KeysInfo = Record<string, { hasKey: boolean; last4: string }>;

interface ModelItem {
  name: WhisperModelName;
  installed: boolean;
  sizeBytes: number;
  isDownloading: boolean;
  progress?: {
    bytes: number;
    total: number;
    percent: number;
  };
}

type WhisperModelName = "base" | "base-q5_1" | "small" | "small-q5_1" | "large-v3-turbo-q5_0";

interface SpeedByCase {
  fiveMin: string;
  oneHour: string;
  tenHours: string;
}

interface Recommendation {
  id: string;
  name: string;
  kind: "local" | "api";
  /** free = sin costo; freemium = capa gratuita con límites y luego de pago; paid = solo de pago */
  pricing: "free" | "freemium" | "paid";
  approxCostPerHourUsd: number;
  freeTier?: string;
  /** Si la app ya puede usarlo como motor. Si es false, es solo información ("próximamente"). */
  supported: boolean;
  quality: string;
  speedByCase: SpeedByCase;
  /** medido = en este equipo; publicado = cifra del proveedor; estimado = aproximación */
  speedBasis: "medido" | "publicado" | "estimado";
  diarization: boolean;
  privacy: string;
  notes: string;
  signupUrl?: string;
}

const PRICING_LABEL: Record<Recommendation["pricing"], string> = {
  free: "Gratis",
  freemium: "Gratis con límites",
  paid: "De pago"
};
const PRICING_COLOR: Record<Recommendation["pricing"], "success" | "warning" | "default"> = {
  free: "success",
  freemium: "warning",
  paid: "default"
};

function formatUsd(value: number): string {
  if (value === 0) return "$0";
  return value < 0.1 ? `$${value.toFixed(3)}` : `$${value.toFixed(2)}`;
}

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

  // Modales de Carpetas de Proyecto y Proveedores Custom
  const { folders, refreshFolders, deleteFolder: deleteProjectFolder } = useProjectFolders();
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ProjectFolderDto | null>(null);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ provider: string; ok: boolean; msg: string } | null>(
    null
  );

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

  // Polling para actualizar progreso de descarga si hay un modelo descargando
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

      {/* SECCIÓN 1: MOTOR DE TRANSCRIPCIÓN */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Motor de Transcripción
        </Typography>
        <Grid container spacing={3} sx={{ mt: 0.5 }}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small">
              <InputLabel id="engine-select-label">Motor Principal</InputLabel>
              <Select
                labelId="engine-select-label"
                value={settings.engine}
                label="Motor Principal"
                onChange={(e) =>
                  setSettings({ ...settings, engine: e.target.value as any })
                }
              >
                <MenuItem value="whisper-local">Whisper Local (whisper.cpp - Privado & Offline)</MenuItem>
                <MenuItem value="groq">Groq Cloud (Ultrarrápido por API)</MenuItem>
                <MenuItem value="gemini">Google Gemini (Diarización Multimodal por API)</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label="Idioma de Transcripción"
              value={settings.language}
              onChange={(e) => setSettings({ ...settings, language: e.target.value })}
              helperText="Código ISO (ej. 'es', 'en', 'fr')"
            />
          </Grid>

          {/* Opciones de Whisper Local */}
          {settings.engine === "whisper-local" && (
            <>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="model-select-label">Modelo Local</InputLabel>
                  <Select
                    labelId="model-select-label"
                    value={settings.whisperModel}
                    label="Modelo Local"
                    onChange={(e) =>
                      setSettings({ ...settings, whisperModel: e.target.value as any })
                    }
                  >
                    <MenuItem value="base-q5_1">base cuantizado (~57 MB · el más rápido, calidad básica)</MenuItem>
                    <MenuItem value="base">base (~141 MB · rápido, calidad básica)</MenuItem>
                    <MenuItem value="small-q5_1">small cuantizado (~181 MB · rápido, buena calidad)</MenuItem>
                    <MenuItem value="small">small (~465 MB · buena calidad)</MenuItem>
                    <MenuItem value="large-v3-turbo-q5_0">large-v3-turbo cuantizado (~547 MB · mejor calidad, más lento)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Hilos de CPU (Threads)"
                  inputProps={{ min: 1, max: 32 }}
                  value={settings.whisperThreads}
                  onChange={(e) =>
                    setSettings({ ...settings, whisperThreads: parseInt(e.target.value, 10) || 1 })
                  }
                  helperText="Recomendado: cantidad de núcleos físicos de tu CPU"
                />
              </Grid>

              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.useGpu}
                      onChange={(e) => setSettings({ ...settings, useGpu: e.target.checked })}
                    />
                  }
                  label="Usar la tarjeta de video (GPU)"
                />
                <Typography variant="caption" color="text.secondary" display="block">
                  Si tu equipo tiene una tarjeta compatible con Vulkan (AMD, NVIDIA o Intel), Whisper la usa y
                  transcribe varias veces más rápido con los modelos grandes. Si falla, la app reintenta sola con
                  el procesador. Desactívalo si notas errores o el equipo se pone lento.
                </Typography>
              </Grid>
            </>
          )}

          {/* Opciones de Groq */}
          {settings.engine === "groq" && (
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Nombre del Modelo Groq"
                value={settings.groqModel}
                onChange={(e) => setSettings({ ...settings, groqModel: e.target.value })}
                helperText="Predeterminado: whisper-large-v3-turbo"
              />
            </Grid>
          )}

          {/* Opciones de Gemini */}
          {settings.engine === "gemini" && (
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Nombre del Modelo Gemini"
                value={settings.geminiModel}
                onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })}
                helperText="Predeterminado: gemini-2.5-flash"
              />
            </Grid>
          )}

          {/* Retención */}
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Retención de Audio (Horas)"
              inputProps={{ min: 0, max: 8760 }}
              value={settings.retentionHours}
              onChange={(e) =>
                setSettings({ ...settings, retentionHours: parseInt(e.target.value, 10) || 0 })
              }
              helperText="0 = conservar el audio indefinidamente. Por defecto 48h."
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSaveSettings}
            disabled={loading}
          >
            Guardar Configuración
          </Button>
        </Box>
      </Paper>

      {/* SECCIÓN 2: GESTOR DE MODELOS LOCALES */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Modelos de Whisper en Disco
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Descarga los modelos requeridos para transcribir sin conexión a internet directamente en tu equipo.
        </Typography>

        <Grid container spacing={2}>
          {models.map((m) => (
            <Grid item xs={12} sm={6} key={m.name}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700}>
                      ggml-{m.name}.bin
                    </Typography>
                    <Chip
                      size="small"
                      label={m.installed ? "Instalado" : "No Instalado"}
                      color={m.installed ? "success" : "default"}
                    />
                  </Box>

                  <Typography variant="caption" color="text.secondary" display="block">
                    Tamaño aproximado: {(m.sizeBytes / (1024 * 1024)).toFixed(0)} MB
                  </Typography>

                  {m.isDownloading && (
                    <Box sx={{ mt: 2 }} aria-live="polite">
                      <Typography variant="caption" color="primary">
                        Descargando: {m.progress?.percent ?? 0}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={m.progress?.percent ?? 0}
                        sx={{ mt: 0.5 }}
                      />
                    </Box>
                  )}
                </CardContent>

                <CardActions sx={{ justifyContent: "flex-end", px: 2, pb: 2 }}>
                  {m.isDownloading ? (
                    <Button
                      size="small"
                      color="error"
                      startIcon={<CancelIcon />}
                      onClick={() => handleCancelDownload(m.name)}
                    >
                      Cancelar
                    </Button>
                  ) : m.installed ? (
                    <Button
                      size="small"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => handleDeleteModel(m.name)}
                    >
                      Eliminar
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      onClick={() => handleDownloadModel(m.name)}
                    >
                      Descargar
                    </Button>
                  )}
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* SECCIÓN 3: CLAVES DE API DE PROVEEDORES */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Claves de API (Almacén Cifrado)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Tus claves se guardan cifradas con el almacén seguro nativo de tu sistema operativo. La aplicación nunca expone el valor completo.
        </Typography>

        {testResult && (
          <Alert
            severity={testResult.ok ? "success" : "error"}
            sx={{ mb: 3 }}
            onClose={() => setTestResult(null)}
          >
            [{testResult.provider.toUpperCase()}] {testResult.msg}
          </Alert>
        )}

        {/* Proveedor: Groq */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              Groq Cloud
            </Typography>
            {keys.groq?.hasKey && (
              <Chip
                size="small"
                label={`Guardada (••••${keys.groq?.last4})`}
                color="success"
                variant="outlined"
              />
            )}
          </Box>
          <Grid container spacing={1} alignItems="center">
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                type="password"
                placeholder={keys.groq?.hasKey ? "Reemplazar clave..." : "gsk_..."}
                value={groqKeyInput}
                onChange={(e) => setGroqKeyInput(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleSaveKey("groq")}
                  disabled={!groqKeyInput.trim()}
                >
                  Guardar
                </Button>
                {keys.groq?.hasKey && (
                  <>
                    <Button
                      size="small"
                      color="secondary"
                      startIcon={<TestIcon />}
                      onClick={() => handleTestKey("groq")}
                    >
                      Probar
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleDeleteKey("groq")}
                    >
                      Quitar
                    </Button>
                  </>
                )}
              </Box>
            </Grid>
          </Grid>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Proveedor: Google Gemini */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              Google Gemini API (AI Studio)
            </Typography>
            {keys.gemini?.hasKey && (
              <Chip
                size="small"
                label={`Guardada (••••${keys.gemini.last4})`}
                color="success"
                variant="outlined"
              />
            )}
          </Box>
          <Grid container spacing={1} alignItems="center">
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                type="password"
                placeholder={keys.gemini?.hasKey ? "Reemplazar clave..." : "AIzaSy..."}
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleSaveKey("gemini")}
                  disabled={!geminiKeyInput.trim()}
                >
                  Guardar
                </Button>
                {keys.gemini?.hasKey && (
                  <>
                    <Button
                      size="small"
                      color="secondary"
                      startIcon={<TestIcon />}
                      onClick={() => handleTestKey("gemini")}
                    >
                      Probar
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleDeleteKey("gemini")}
                    >
                      Quitar
                    </Button>
                  </>
                )}
              </Box>
            </Grid>
          </Grid>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Proveedor: OpenAI (ChatGPT) */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              OpenAI (ChatGPT / GPT-4o)
            </Typography>
            {keys.openai?.hasKey && (
              <Chip
                size="small"
                label={`Guardada (••••${keys.openai.last4})`}
                color="success"
                variant="outlined"
              />
            )}
          </Box>
          <Grid container spacing={1} alignItems="center">
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                type="password"
                placeholder={keys.openai?.hasKey ? "Reemplazar clave..." : "sk-..."}
                value={openaiKeyInput}
                onChange={(e) => setOpenaiKeyInput(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleSaveKey("openai")}
                  disabled={!openaiKeyInput.trim()}
                >
                  Guardar
                </Button>
                {keys.openai?.hasKey && (
                  <>
                    <Button
                      size="small"
                      color="secondary"
                      startIcon={<TestIcon />}
                      onClick={() => handleTestKey("openai")}
                    >
                      Probar
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleDeleteKey("openai")}
                    >
                      Quitar
                    </Button>
                  </>
                )}
              </Box>
            </Grid>
          </Grid>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Proveedores Personalizados (Ollama, DeepSeek, etc.) */}
        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Proveedores de IA Personalizados (Ollama, DeepSeek, OpenRouter...)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Agrega cualquier LLM nuevo o local compatible con la especificación de API de OpenAI.
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setIsCustomModalOpen(true)}
            >
              Agregar Proveedor
            </Button>
          </Box>

          {(settings.customProviders || []).length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
              No has registrado ningún proveedor personalizado todavía. Puedes agregar endpoints locales como Ollama o APIs como DeepSeek con el botón superior.
            </Typography>
          ) : (
            <Grid container spacing={2}>
              {settings.customProviders?.map((cp) => (
                <Grid item xs={12} sm={6} key={cp.id}>
                  <Card variant="outlined" sx={{ borderRadius: 2 }}>
                    <CardContent sx={{ pb: 1 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                        <Typography variant="subtitle2" fontWeight={700}>
                          {cp.name}
                        </Typography>
                        <Chip size="small" label={cp.defaultModel} color="primary" variant="outlined" />
                      </Box>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                        {cp.baseUrl}
                      </Typography>
                    </CardContent>
                    <CardActions sx={{ justifyContent: "flex-end", px: 2, pb: 1.5 }}>
                      <Button
                        size="small"
                        color="secondary"
                        startIcon={<TestIcon />}
                        onClick={() => handleTestKey(cp.id)}
                      >
                        Probar
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={() => handleDeleteCustomProvider(cp.id)}
                      >
                        Eliminar
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      </Paper>

      {/* SECCIÓN 4: CONFIGURACIÓN DE RESÚMENES E ISSUES CON IA */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <AutoAwesomeIcon color="primary" />
          <Typography variant="h6" fontWeight={600}>
            Resúmenes e Issues con IA para Agentes de Código
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Configura cómo y con qué modelo la aplicación extrae resúmenes estructurados y tareas técnicas optimizadas para agentes como Cursor, Antigravity o Claude Code.
        </Typography>

        <Grid container spacing={3}>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.autoGenerateIssues !== false}
                  onChange={(e) =>
                    setSettings({ ...settings, autoGenerateIssues: e.target.checked })
                  }
                />
              }
              label="Generar automáticamente resumen e issues al terminar la transcripción del audio"
            />
            <Typography variant="caption" color="text.secondary" display="block">
              Si está activado, en cuanto la transcripción finalice se ejecutará el análisis en segundo plano utilizando el proveedor configurado o la carpeta de proyecto asignada.
            </Typography>
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small">
              <InputLabel id="default-issues-provider-label">Proveedor por Defecto para Issues</InputLabel>
              <Select
                labelId="default-issues-provider-label"
                value={settings.issuesDefaultProvider || "google-account"}
                label="Proveedor por Defecto para Issues"
                onChange={(e) =>
                  setSettings({ ...settings, issuesDefaultProvider: e.target.value })
                }
              >
                <MenuItem value="google-account">Cuenta de Google (Gemini Pro - Sin API Key)</MenuItem>
                <MenuItem value="gemini">Google Gemini API</MenuItem>
                <MenuItem value="openai">OpenAI (ChatGPT)</MenuItem>
                <MenuItem value="groq">Groq Cloud (Llama 3.3 70B)</MenuItem>
                {settings.customProviders?.map((cp) => (
                  <MenuItem key={cp.id} value={cp.id}>
                    {cp.name} ({cp.defaultModel})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label="Modelo de IA por Defecto"
              value={settings.issuesDefaultModel || "gemini-2.5-pro"}
              onChange={(e) => setSettings({ ...settings, issuesDefaultModel: e.target.value })}
              helperText="ej. gemini-2.5-pro, gpt-4o, llama-3.3-70b-versatile, deepseek-chat"
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSaveSettings}
            disabled={loading}
          >
            Guardar Configuración de IA
          </Button>
        </Box>
      </Paper>

      {/* SECCIÓN 5: CARPETAS DE PROYECTO (HARNESSES DE CONTEXTO TÉCNICO) */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <ProjectFolderIcon color="primary" />
            <Box>
              <Typography variant="h6" fontWeight={600}>
                Carpetas de Proyecto (Harnesses de Contexto)
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Define el stack tecnológico, módulos y convenciones de cada uno de tus repositorios una sola vez. Al transcribir una reunión, asígnala a la carpeta correspondiente para que las issues se generen con contexto perfecto.
              </Typography>
            </Box>
          </Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditingFolder(null);
              setIsFolderModalOpen(true);
            }}
          >
            Nueva Carpeta
          </Button>
        </Box>

        {folders.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic", py: 2 }}>
            Aún no has creado carpetas de proyecto. Crea una (ej. "Proyecto Diamante", "Backend E-Commerce") para precargar el contexto y las credenciales automáticamente en tus reuniones.
          </Typography>
        ) : (
          <Grid container spacing={2}>
            {folders.map((f) => (
              <Grid item xs={12} sm={6} key={f.id}>
                <Card variant="outlined" sx={{ borderRadius: 2, height: "100%", display: "flex", flexDirection: "column" }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        📁 {f.name}
                      </Typography>
                      {f.defaultProvider && (
                        <Chip size="small" label={f.defaultProvider} color="primary" variant="outlined" />
                      )}
                    </Box>
                    {f.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {f.description}
                      </Typography>
                    )}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        fontFamily: "monospace",
                        bgcolor: "action.hover",
                        p: 1,
                        borderRadius: 1
                      }}
                    >
                      {f.technicalContext}
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ justifyContent: "flex-end", px: 2, pb: 1.5 }}>
                    <Button
                      size="small"
                      startIcon={<EditIcon />}
                      onClick={() => {
                        setEditingFolder(f);
                        setIsFolderModalOpen(true);
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={async () => {
                        if (window.confirm(`¿Eliminar la carpeta '${f.name}'?`)) {
                          await deleteProjectFolder(f.id);
                          setSnackMessage("Carpeta eliminada.");
                        }
                      }}
                    >
                      Eliminar
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Paper>

      {/* SECCIÓN 4: PROVEEDORES RECOMENDADOS */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Proveedores Recomendados
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Compara opciones locales y en la nube para elegir el mejor equilibrio entre privacidad, costo y velocidad.
        </Typography>

        <Grid container spacing={2}>
          {recommendations.map((rec) => (
            <Grid item xs={12} sm={6} key={rec.id}>
              <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    {rec.name}
                  </Typography>

                  <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
                    <Chip size="small" label={PRICING_LABEL[rec.pricing]} color={PRICING_COLOR[rec.pricing]} />
                    <Chip
                      size="small"
                      label={rec.kind === "local" ? "100% Local" : "API Cloud"}
                      color={rec.kind === "local" ? "primary" : "secondary"}
                      variant="outlined"
                    />
                    <Chip
                      size="small"
                      label={rec.diarization ? "Separa hablantes" : "Sin separar hablantes"}
                      color={rec.diarization ? "info" : "default"}
                      variant="outlined"
                    />
                    {!rec.supported && <Chip size="small" label="Próximamente" variant="outlined" />}
                  </Box>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    <strong>Calidad:</strong> {rec.quality}
                  </Typography>
                  {rec.freeTier && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      <strong>Capa gratuita:</strong> {rec.freeTier}
                    </Typography>
                  )}

                  <Table size="small" aria-label={`Tiempo y costo estimados de ${rec.name}`} sx={{ mb: 1.5 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ px: 0.5 }}>Caso</TableCell>
                        <TableCell sx={{ px: 0.5 }}>Tiempo ({rec.speedBasis})</TableCell>
                        <TableCell sx={{ px: 0.5 }} align="right">Costo</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {([
                        ["Clip de 5 min", rec.speedByCase.fiveMin, rec.approxCostPerHourUsd / 12],
                        ["Reunión de 1 h", rec.speedByCase.oneHour, rec.approxCostPerHourUsd],
                        ["Archivo de 10 h", rec.speedByCase.tenHours, rec.approxCostPerHourUsd * 10]
                      ] as [string, string, number][]).map(([label, time, cost]) => (
                        <TableRow key={label}>
                          <TableCell sx={{ px: 0.5 }}>{label}</TableCell>
                          <TableCell sx={{ px: 0.5 }}>{time}</TableCell>
                          <TableCell sx={{ px: 0.5 }} align="right">{formatUsd(cost)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    <strong>Privacidad:</strong> {rec.privacy}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {rec.notes}
                  </Typography>
                </CardContent>

                {rec.signupUrl && (
                  <CardActions sx={{ px: 2, pb: 2 }}>
                    <Button
                      size="small"
                      href={rec.signupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Crear Cuenta / Obtener Clave
                    </Button>
                  </CardActions>
                )}
              </Card>
            </Grid>
          ))}
        </Grid>

        {recDisclaimer && (
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mt: 3, fontStyle: "italic", textAlign: "center" }}
          >
            {recDisclaimer}
          </Typography>
        )}
      </Paper>

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
