import React from "react";
import {
  Paper,
  Box,
  Typography,
  Grid,
  FormControlLabel,
  Switch,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button
} from "@mui/material";
import {
  AutoAwesome as AutoAwesomeIcon,
  Save as SaveIcon
} from "@mui/icons-material";
import { LlmModelSelector } from "../../../features/customAi/LlmModelSelector.js";
import { DesktopSettings } from "./SettingsTypes.js";

interface AiIssuesSettingsSectionProps {
  settings: DesktopSettings;
  onChangeSettings: (settings: DesktopSettings) => void;
  onSave: () => void;
  loading: boolean;
}

export const AiIssuesSettingsSection: React.FC<AiIssuesSettingsSectionProps> = ({
  settings,
  onChangeSettings,
  onSave,
  loading
}) => {
  return (
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
                  onChangeSettings({ ...settings, autoGenerateIssues: e.target.checked })
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
              onChange={(e) => {
                const newProvider = e.target.value;
                const matched = settings.customProviders?.find((cp) => cp.id === newProvider);
                const suggestedModel = matched
                  ? matched.defaultModel
                  : newProvider === "google-account"
                  ? ""
                  : newProvider === "openai"
                  ? "gpt-4o-mini"
                  : newProvider === "groq"
                  ? "llama-3.3-70b-versatile"
                  : "gemini-2.5-flash";
                onChangeSettings({
                  ...settings,
                  issuesDefaultProvider: newProvider,
                  issuesDefaultModel: suggestedModel
                });
              }}
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
          <LlmModelSelector
            provider={settings.issuesDefaultProvider || "google-account"}
            value={settings.issuesDefaultModel || ""}
            onChange={(newModel) => onChangeSettings({ ...settings, issuesDefaultModel: newModel })}
            baseUrl={settings.customProviders?.find((p) => p.id === settings.issuesDefaultProvider)?.baseUrl}
            label="Modelo de IA por Defecto"
            placeholder="Selecciona o escribe el modelo"
          />
        </Grid>
      </Grid>

      <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={onSave}
          disabled={loading}
        >
          Guardar Configuración de IA
        </Button>
      </Box>
    </Paper>
  );
};
