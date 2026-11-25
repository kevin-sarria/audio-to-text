import React, { useState, useEffect } from "react";
import {
  Paper,
  Box,
  Typography,
  Grid,
  TextField,
  FormControlLabel,
  Switch,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Avatar,
  Chip,
  Alert,
  Divider,
  CircularProgress
} from "@mui/material";
import {
  SmartToy as BotIcon,
  Save as SaveIcon,
  OpenInNew as OpenInNewIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  LinkOff as LinkOffIcon,
  Language as BrowserIcon,
  Description as DocxIcon,
  TableChart as ExcelIcon
} from "@mui/icons-material";
import { MeetingBotConfigDto, MeetingBotStatusDto } from "@audio-to-text/shared";
import { api } from "../../../lib/api.js";

const PRESET_AVATARS = [
  { id: "algo", label: "Algorithm AI", url: "https://api.dicebear.com/7.x/bottts/svg?seed=AlgorithmBot" },
  { id: "cyber", label: "Cyber Sentinel", url: "https://api.dicebear.com/7.x/bottts/svg?seed=CyberSentinel" },
  { id: "exec", label: "Executive AI", url: "https://api.dicebear.com/7.x/bottts/svg?seed=ExecutiveAI" },
  { id: "nova", label: "Nova Assistant", url: "https://api.dicebear.com/7.x/bottts/svg?seed=NovaAssistant" },
  { id: "apex", label: "Apex Agent", url: "https://api.dicebear.com/7.x/bottts/svg?seed=ApexAgent" },
  { id: "quantum", label: "Quantum Mind", url: "https://api.dicebear.com/7.x/bottts/svg?seed=QuantumMind" }
];

export const MeetingBotSettingsSection: React.FC = () => {
  const [config, setConfig] = useState<MeetingBotConfigDto>({
    botDisplayName: "Algorithm Assistant Bot",
    botAvatarUrl: PRESET_AVATARS[0]!.url,
    botPreferredBrowser: "auto",
    botGoogleAccountEmail: "",
    botAutoRecord: true,
    botMuteOnJoin: true,
    botGenerateDocx: true,
    botGenerateExcel: true,
    botDefaultPlatform: "AUTO",
    botLanguage: "es",
    botOutputDir: ""
  });

  const [status, setStatus] = useState<MeetingBotStatusDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);

  const fetchBotStatus = async () => {
    setLoading(true);
    try {
      const res = await api.get<any>("/bot/status");
      if (res.success && res.data) {
        setStatus(res.data);
        if (res.data.config) {
          setConfig(res.data.config);
        }
      }
    } catch {
      // Ignorar en desarrollo inicial
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBotStatus();
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.put<any>("/bot/config", config);
      if (res.success) {
        setFeedback({ type: "success", msg: "¡Configuración del bot guardada exitosamente!" });
        await fetchBotStatus();
      }
    } catch (err: any) {
      setFeedback({ type: "error", msg: `Error al guardar: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleLaunchGoogleLogin = async () => {
    setLoginLoading(true);
    setFeedback(null);
    try {
      const res = await api.post<any>("/bot/login");
      if (res.success) {
        setFeedback({
          type: "info",
          msg: res.message || "Se ha abierto el navegador para iniciar sesión con tu cuenta de Google."
        });
        setTimeout(fetchBotStatus, 4000);
      }
    } catch (err: any) {
      setFeedback({ type: "error", msg: `Error al abrir navegador: ${err.message}` });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    if (!window.confirm("¿Seguro que deseas desvincular la cuenta de Google del bot?")) return;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.post<any>("/bot/unlink");
      if (res.success) {
        setFeedback({ type: "success", msg: "Cuenta de Google desvinculada del bot." });
        await fetchBotStatus();
      }
    } catch (err: any) {
      setFeedback({ type: "error", msg: `Error al desvincular: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      {feedback && (
        <Alert severity={feedback.type} sx={{ mb: 3 }} onClose={() => setFeedback(null)}>
          {feedback.msg}
        </Alert>
      )}

      {/* 1. Tarjeta de Vista Previa y Datos de Identidad */}
      <Paper sx={{ p: 3, mb: 4, borderRadius: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
          <BotIcon color="primary" sx={{ fontSize: 28 }} />
          <Typography variant="h6" fontWeight={700}>
            Identidad del Bot Asistente
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Personaliza el nombre, avatar y presentación que verán los demás participantes en las salas de Google Meet y Microsoft Teams.
        </Typography>

        <Grid container spacing={3} alignItems="center">
          {/* Vista previa viva */}
          <Grid item xs={12} md={4} sx={{ textAlign: "center" }}>
            <Box
              sx={{
                p: 3,
                border: "1px dashed",
                borderColor: "primary.main",
                borderRadius: 3,
                bgcolor: "background.default",
                display: "flex",
                flexDirection: "column",
                alignItems: "center"
              }}
            >
              <Avatar
                src={config.botAvatarUrl}
                alt={config.botDisplayName}
                sx={{ width: 84, height: 84, mb: 2, boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}
              />
              <Typography variant="subtitle1" fontWeight={700}>
                {config.botDisplayName || "Nombre no asignado"}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5 }}>
                Asistente de Diarización en Vivo
              </Typography>
              <Chip
                size="small"
                icon={<CheckCircleIcon sx={{ fontSize: "14px !important" }} />}
                label="Listo para Meet & Teams"
                color="primary"
                variant="outlined"
              />
            </Box>
          </Grid>

          {/* Formulario de nombre y avatar */}
          <Grid item xs={12} md={8}>
            <TextField
              fullWidth
              label="Nombre del Bot en la Llamada"
              value={config.botDisplayName}
              onChange={(e) => setConfig({ ...config, botDisplayName: e.target.value })}
              helperText="Este es el nombre con el que aparecerá en la lista de personas de Google Meet y Teams."
              sx={{ mb: 3 }}
            />

            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Selecciona una Imagen de Perfil (Avatar):
            </Typography>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
              {PRESET_AVATARS.map((av) => (
                <Box
                  key={av.id}
                  onClick={() => setConfig({ ...config, botAvatarUrl: av.url })}
                  sx={{
                    cursor: "pointer",
                    p: 0.5,
                    border: "2px solid",
                    borderColor: config.botAvatarUrl === av.url ? "primary.main" : "transparent",
                    borderRadius: "50%",
                    transition: "all 0.2s"
                  }}
                >
                  <Avatar src={av.url} alt={av.label} sx={{ width: 44, height: 44 }} />
                </Box>
              ))}
            </Box>

            <TextField
              fullWidth
              size="small"
              label="O pega una URL personalizada de imagen de perfil"
              value={config.botAvatarUrl}
              onChange={(e) => setConfig({ ...config, botAvatarUrl: e.target.value })}
              placeholder="https://ejemplo.com/mi-avatar.png"
            />
            <TextField
              fullWidth
              size="small"
              sx={{ mt: 3 }}
              label="Carpeta donde el bot deja las reuniones"
              value={config.botOutputDir ?? ""}
              onChange={(e) => setConfig({ ...config, botOutputDir: e.target.value })}
              placeholder="Vacío = la carpeta output del bot"
              helperText="La app importa de esta carpeta las reuniones nuevas (archivos reunion_*.json)."
            />
          </Grid>
        </Grid>
      </Paper>

      {/* 2. Tarjeta de Vinculación con Google y Navegador */}
      <Paper sx={{ p: 3, mb: 4, borderRadius: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
          <BrowserIcon color="primary" sx={{ fontSize: 26 }} />
          <Typography variant="h6" fontWeight={700}>
            Conectividad & Cuenta de Google
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Google Meet exige tener una cuenta de Google iniciada para acceder a reuniones creadas desde cuentas personales (@gmail.com).
        </Typography>

        <Grid container spacing={3}>
          {/* Estado de cuenta Google */}
          <Grid item xs={12} md={6}>
            <Box
              sx={{
                p: 2.5,
                border: "1px solid",
                borderColor: status?.isGoogleAccountLinked ? "success.light" : "warning.light",
                borderRadius: 2,
                bgcolor: status?.isGoogleAccountLinked ? "rgba(46, 125, 50, 0.04)" : "rgba(237, 108, 2, 0.04)"
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  Cuenta de Google del Bot
                </Typography>
                <Chip
                  size="small"
                  label={status?.isGoogleAccountLinked ? "Vinculada" : "Sin Vincular"}
                  color={status?.isGoogleAccountLinked ? "success" : "warning"}
                  icon={status?.isGoogleAccountLinked ? <CheckCircleIcon /> : <WarningIcon />}
                />
              </Box>

              <Typography variant="body2" sx={{ mb: 2 }}>
                {status?.linkedGoogleEmail ? (
                  <>
                    Correo actual: <strong>{status.linkedGoogleEmail}</strong>
                  </>
                ) : (
                  "Aún no hay una sesión de Google activa en el perfil del bot."
                )}
              </Typography>

              <Box sx={{ display: "flex", gap: 1.5 }}>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={loginLoading ? <CircularProgress size={16} color="inherit" /> : <OpenInNewIcon />}
                  onClick={handleLaunchGoogleLogin}
                  disabled={loginLoading}
                >
                  {status?.isGoogleAccountLinked ? "Cambiar Cuenta en Navegador" : "Vincular con Brave / Navegador"}
                </Button>
                {status?.isGoogleAccountLinked && (
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<LinkOffIcon />}
                    onClick={handleUnlinkGoogle}
                    disabled={loading}
                  >
                    Desvincular
                  </Button>
                )}
              </Box>
            </Box>
          </Grid>

          {/* Navegador Seleccionado */}
          <Grid item xs={12} md={6}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="browser-label">Navegador para Acceso a Salas</InputLabel>
              <Select
                labelId="browser-label"
                label="Navegador para Acceso a Salas"
                value={config.botPreferredBrowser}
                onChange={(e) =>
                  setConfig({ ...config, botPreferredBrowser: e.target.value as any })
                }
              >
                <MenuItem value="auto">
                  Predeterminado del Sistema ({status?.detectedBrowserName || "Brave"}) [Recomendado]
                </MenuItem>
                <MenuItem value="brave">Brave Browser</MenuItem>
                <MenuItem value="chrome">Google Chrome</MenuItem>
                <MenuItem value="msedge">Microsoft Edge</MenuItem>
              </Select>
            </FormControl>

            <Typography variant="caption" color="text.secondary">
              Ejecutable detectado en Windows: <code>{status?.detectedBrowserPath || "Buscando..."}</code>
            </Typography>

            <TextField
              fullWidth
              size="small"
              sx={{ mt: 2 }}
              label="Correo de referencia (opcional)"
              placeholder="mi.correo.reuniones@gmail.com"
              value={config.botGoogleAccountEmail}
              onChange={(e) => setConfig({ ...config, botGoogleAccountEmail: e.target.value })}
              helperText="Puedes anotar el correo para referencia visual en el panel."
            />
          </Grid>
        </Grid>
      </Paper>

      {/* 3. Tarjeta de Automatizaciones en Llamadas */}
      <Paper sx={{ p: 3, mb: 4, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
          Comportamiento y Entregables Automáticos
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Configura qué acciones debe ejecutar el bot autónomamente al unirse y al retirarse de la llamada.
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={config.botMuteOnJoin}
                  onChange={(e) => setConfig({ ...config, botMuteOnJoin: e.target.checked })}
                />
              }
              label="Silenciar micrófono y cámara automáticamente al unirse"
            />
            <Typography variant="caption" color="text.secondary" display="block">
              Evita ruidos o interrupciones en la llamada apagando medios de inmediato.
            </Typography>
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={config.botAutoRecord}
                  onChange={(e) => setConfig({ ...config, botAutoRecord: e.target.checked })}
                />
              }
              label="Diarización y captura continua en vivo"
            />
            <Typography variant="caption" color="text.secondary" display="block">
              Reconoce los nombres de las personas y oradores en tiempo real.
            </Typography>
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={config.botGenerateDocx}
                  onChange={(e) => setConfig({ ...config, botGenerateDocx: e.target.checked })}
                />
              }
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <DocxIcon color="primary" fontSize="small" />
                  <span>Generar documento Word (.docx) al terminar</span>
                </Box>
              }
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={config.botGenerateExcel}
                  onChange={(e) => setConfig({ ...config, botGenerateExcel: e.target.checked })}
                />
              }
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <ExcelIcon color="success" fontSize="small" />
                  <span>Generar matriz de issues en Excel (.xlsx) al terminar</span>
                </Box>
              }
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Botón de Guardado */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
        <Button
          variant="contained"
          size="large"
          startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
          onClick={handleSaveConfig}
          disabled={saving}
          sx={{ px: 4, py: 1.2, fontWeight: 700, borderRadius: 2 }}
        >
          {saving ? "Guardando..." : "Guardar Configuración del Bot"}
        </Button>
      </Box>
    </Box>
  );
};
