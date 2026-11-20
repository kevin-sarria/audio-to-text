import React from "react";
import {
  Paper,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  FormControlLabel,
  Switch,
  Box,
  Button
} from "@mui/material";
import { Save as SaveIcon } from "@mui/icons-material";
import { DesktopSettings, WhisperModelName } from "./SettingsTypes.js";
import { LlmModelSelector } from "../../../features/customAi/LlmModelSelector.js";

interface TranscriptionEngineSectionProps {
  settings: DesktopSettings;
  onChangeSettings: (settings: DesktopSettings) => void;
  onSave: () => void;
  loading: boolean;
}

export const TranscriptionEngineSection: React.FC<TranscriptionEngineSectionProps> = ({
  settings,
  onChangeSettings,
  onSave,
  loading
}) => {
  return (
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
                onChangeSettings({ ...settings, engine: e.target.value as any })
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
            onChange={(e) => onChangeSettings({ ...settings, language: e.target.value })}
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
                    onChangeSettings({ ...settings, whisperModel: e.target.value as WhisperModelName })
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
                  onChangeSettings({ ...settings, whisperThreads: parseInt(e.target.value, 10) || 1 })
                }
                helperText="Recomendado: cantidad de núcleos físicos de tu CPU"
              />
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.useGpu}
                    onChange={(e) => onChangeSettings({ ...settings, useGpu: e.target.checked })}
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
            <LlmModelSelector
              provider="groq"
              purpose="transcription"
              value={settings.groqModel || "whisper-large-v3-turbo"}
              onChange={(model) => onChangeSettings({ ...settings, groqModel: model })}
              label="Modelo de Transcripción Groq"
              placeholder="Selecciona o escribe el modelo"
              helperText="Modelos optimizados para transcripción de audio (Whisper)"
            />
          </Grid>
        )}

        {/* Opciones de Gemini */}
        {settings.engine === "gemini" && (
          <Grid item xs={12} sm={6}>
            <LlmModelSelector
              provider="gemini"
              purpose="transcription"
              value={settings.geminiModel || "gemini-3.8-flash"}
              onChange={(model) => onChangeSettings({ ...settings, geminiModel: model })}
              label="Modelo de Transcripción Gemini"
              placeholder="Selecciona o escribe el modelo"
              helperText="Modelos multimodales con soporte nativo de audio"
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
              onChangeSettings({ ...settings, retentionHours: parseInt(e.target.value, 10) || 0 })
            }
            helperText="0 = conservar el audio indefinidamente. Por defecto 48h."
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
          Guardar Configuración
        </Button>
      </Box>
    </Paper>
  );
};
