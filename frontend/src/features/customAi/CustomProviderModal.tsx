import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  Box,
  Typography,
  CircularProgress,
  InputAdornment,
  IconButton
} from "@mui/material";
import {
  Extension as ExtensionIcon,
  PlayArrow as TestIcon,
  Visibility,
  VisibilityOff
} from "@mui/icons-material";
import { CustomAiProviderDto } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";

interface CustomProviderModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (provider: CustomAiProviderDto) => void;
}

export const CustomProviderModal: React.FC<CustomProviderModalProps> = ({
  open,
  onClose,
  onSaved
}) => {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [defaultModel, setDefaultModel] = useState("");

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTest = async () => {
    if (!baseUrl.trim()) {
      setErrorMsg("Debes ingresar la URL base para probar la conexión.");
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    setErrorMsg(null);

    try {
      const res = await api.post<{ success: boolean; ok: boolean; message: string }>(
        "/desktop/settings/custom-providers/test",
        {
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          defaultModel: defaultModel.trim()
        }
      );
      if (res && res.success) {
        setTestResult({ ok: res.ok, msg: res.message });
      } else {
        setTestResult({ ok: false, msg: "No se recibió respuesta válida del servidor local." });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: `Error al probar conexión: ${err.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("El nombre del proveedor es obligatorio.");
      return;
    }
    if (!baseUrl.trim()) {
      setErrorMsg("La URL base del proveedor es obligatoria.");
      return;
    }
    if (!defaultModel.trim()) {
      setErrorMsg("El nombre del modelo por defecto es obligatorio.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const id = "custom-" + name.trim().toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Date.now().toString().slice(-4);
      const newProvider: CustomAiProviderDto = {
        id,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        defaultModel: defaultModel.trim()
      };

      // Obtener settings actuales y agregar el nuevo proveedor
      const settingsRes = await api.get<any>("/desktop/settings");
      if (settingsRes.success && settingsRes.data?.settings) {
        const existingProviders: CustomAiProviderDto[] = settingsRes.data.settings.customProviders || [];
        const updatedProviders = [...existingProviders, newProvider];

        await api.put("/desktop/settings", {
          customProviders: updatedProviders
        });

        if (apiKey.trim()) {
          await api.put(`/desktop/settings/keys/${id}`, { apiKey: apiKey.trim() }).catch(() => {});
        }

        onSaved(newProvider);
        onClose();
      } else {
        throw new Error("No se pudo guardar en la configuración del sistema.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al registrar el proveedor de IA.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSave}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ExtensionIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>
            Agregar Proveedor de IA Personalizado
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          {errorMsg && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMsg}
            </Alert>
          )}

          {testResult && (
            <Alert severity={testResult.ok ? "success" : "error"} sx={{ mb: 2 }}>
              {testResult.msg}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Integra cualquier servidor de lenguaje compatible con la API de OpenAI (DeepSeek, Ollama local, LM Studio, OpenRouter, vLLM, etc.) sin limitaciones.
          </Typography>

          <TextField
            fullWidth
            label="Nombre del Proveedor"
            placeholder="ej. DeepSeek, Ollama Local, OpenRouter"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="URL Base de la API (Base URL)"
            placeholder="ej. https://api.deepseek.com/v1 o http://localhost:11434/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            required
            helperText="Debe incluir el protocolo y sufijo de versión de la API (ej. /v1)"
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="Modelo por Defecto"
            placeholder="ej. deepseek-chat, llama3.3:latest, qwen2.5-coder"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            required
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            type={showPassword ? "text" : "password"}
            label="Clave de API / Bearer Token"
            placeholder="sk-... (requerido para DeepSeek/OpenAI; opcional si es Ollama local)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="mostrar u ocultar clave de API"
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              )
            }}
            sx={{ mb: 2 }}
          />

          <Button
            size="small"
            variant="outlined"
            startIcon={isTesting ? <CircularProgress size={16} /> : <TestIcon />}
            onClick={handleTest}
            disabled={isTesting || !baseUrl.trim()}
          >
            {isTesting ? "Probando..." : "Probar Conexión"}
          </Button>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Guardar Proveedor"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
