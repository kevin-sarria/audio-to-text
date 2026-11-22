import React from "react";
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField
} from "@mui/material";
import type { CustomAiProviderDto, ProjectProfileSummaryDto } from "@audio-to-text/shared";
import { LlmModelSelector } from "../../customAi/LlmModelSelector.js";

export interface AiConfigSectionProps {
  profileId: string;
  onProfileIdChange: (val: string) => void;
  projectProfiles: ProjectProfileSummaryDto[];
  profilesError: boolean;
  defaultProvider: string;
  onProviderChange: (val: string) => void;
  defaultModel: string;
  onModelChange: (val: string) => void;
  customApiKey: string;
  onCustomApiKeyChange: (val: string) => void;
  customProviders: CustomAiProviderDto[];
  savedApiKey?: boolean;
}

export const AiConfigSection: React.FC<AiConfigSectionProps> = ({
  profileId,
  onProfileIdChange,
  projectProfiles,
  profilesError,
  defaultProvider,
  onProviderChange,
  defaultModel,
  onModelChange,
  customApiKey,
  onCustomApiKeyChange,
  customProviders,
  savedApiKey = false
}) => {
  return (
    <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Typography variant="body2" color="text.secondary">
        Estos valores aplican solo a esta carpeta y tienen prioridad sobre los de Ajustes al generar issues y al escanear.
      </Typography>

      <Box>
        <FormControl fullWidth size="small">
          <InputLabel id="folder-profile-select">Perfil de reglas del proyecto</InputLabel>
          <Select
            labelId="folder-profile-select"
            label="Perfil de reglas del proyecto"
            value={profileId}
            onChange={(e) => onProfileIdChange(e.target.value)}
          >
            {projectProfiles.length > 0 ? (
              projectProfiles.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))
            ) : (
              <MenuItem value="generic">Genérico (sin reglas de negocio)</MenuItem>
            )}
          </Select>
        </FormControl>
        {profilesError && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            No se pudo cargar la lista de perfiles
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <FormControl sx={{ minWidth: 260, flex: 1 }}>
          <InputLabel id="folder-provider-select">Proveedor de IA</InputLabel>
          <Select
            labelId="folder-provider-select"
            label="Proveedor de IA"
            value={defaultProvider}
            onChange={(e) => onProviderChange(e.target.value)}
          >
            <MenuItem value="google-account">Cuenta de Google (Gemini Pro - Sin API Key)</MenuItem>
            <MenuItem value="gemini">Google Gemini API</MenuItem>
            <MenuItem value="openai">OpenAI (ChatGPT)</MenuItem>
            <MenuItem value="groq">Groq Cloud</MenuItem>
            {customProviders.map((cp) => (
              <MenuItem key={cp.id} value={cp.id}>
                {cp.name} (Personalizado)
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ flex: 1, minWidth: 200 }}>
          <LlmModelSelector
            provider={defaultProvider}
            value={defaultModel}
            onChange={onModelChange}
            apiKey={customApiKey}
            baseUrl={customProviders.find((cp) => cp.id === defaultProvider)?.baseUrl}
            label="Modelo preferido"
            placeholder="Selecciona o escribe el modelo"
          />
        </Box>
      </Box>

      {defaultProvider !== "google-account" && (
        <TextField
          fullWidth
          type="password"
          label="API Key específica para este proyecto (opcional)"
          placeholder={savedApiKey ? "•••• (Guardada)" : "Dejar en blanco para usar la global de Configuración"}
          value={customApiKey}
          onChange={(e) => onCustomApiKeyChange(e.target.value)}
          helperText="Si no introduces una aquí, se utilizará la clave configurada globalmente en Ajustes."
        />
      )}
    </Box>
  );
};
