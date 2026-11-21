import React from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Chip,
  TextField,
  Button
} from "@mui/material";
import {
  Close as CloseIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  AddCircleOutline as AddIcon,
  RestartAlt as ResetIcon
} from "@mui/icons-material";
import type {
  CustomAiProviderDto,
  ProjectProfileSummaryDto,
  ProjectFolderDto
} from "@audio-to-text/shared";
import { LlmModelSelector } from "../../customAi/LlmModelSelector.js";

interface GenerationSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  hasAnalysis: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  provider: string;
  onProviderChange: (val: string) => void;
  customApiKey: string;
  onCustomApiKeyChange: (val: string) => void;
  customModel: string;
  onCustomModelChange: (val: string) => void;
  customProviders: CustomAiProviderDto[];
  onOpenCustomModal: () => void;
  profileId: string;
  onProfileIdChange: (val: string) => void;
  projectProfiles: ProjectProfileSummaryDto[];
  profilesError: boolean;
  projectContext: string;
  onProjectContextChange: (val: string) => void;
  linkedFolder: ProjectFolderDto | null;
  onResetProjectContext: () => void;
}

export const GenerationSettingsDrawer: React.FC<GenerationSettingsDrawerProps> = ({
  open,
  onClose,
  hasAnalysis,
  isGenerating,
  onGenerate,
  provider,
  onProviderChange,
  customApiKey,
  onCustomApiKeyChange,
  customModel,
  onCustomModelChange,
  customProviders,
  onOpenCustomModal,
  profileId,
  onProfileIdChange,
  projectProfiles,
  profilesError,
  projectContext,
  onProjectContextChange,
  linkedFolder,
  onResetProjectContext
}) => {
  const currentCustom = customProviders.find((cp) => cp.id === provider);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 480 },
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box"
        }
      }}
    >
      {/* Cabecera del Drawer */}
      <Box
        sx={{
          p: 2.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Typography variant="h6" fontWeight={700}>
          Configuración de generación
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="cerrar configuración">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Contenido scrolleable */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "flex", flexDirection: "column", gap: 3 }}>
        {/* Sección 1: Modelo de IA */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography variant="subtitle2" fontWeight={700} color="text.primary">
            1. Modelo de IA
          </Typography>

          <FormControl size="small" fullWidth>
            <InputLabel id="drawer-provider-select-label">Proveedor de IA</InputLabel>
            <Select
              labelId="drawer-provider-select-label"
              label="Proveedor de IA"
              value={provider}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "__add_new__") {
                  onOpenCustomModal();
                } else {
                  onProviderChange(val);
                }
              }}
            >
              <MenuItem value="google-account">
                Cuenta de Google (Gemini Pro - Sin API Key)
              </MenuItem>
              <MenuItem value="gemini">Google Gemini API</MenuItem>
              <MenuItem value="openai">OpenAI (ChatGPT / GPT-4o)</MenuItem>
              <MenuItem value="groq">Groq Cloud (Llama 3.3 70B)</MenuItem>
              {customProviders.length > 0 && <Divider sx={{ my: 1 }} />}
              {customProviders.map((cp) => (
                <MenuItem key={cp.id} value={cp.id}>
                  {cp.name} ({cp.defaultModel})
                </MenuItem>
              ))}
              <Divider sx={{ my: 1 }} />
              <MenuItem value="__add_new__" sx={{ color: "primary.main", fontWeight: 600 }}>
                <AddIcon fontSize="small" sx={{ mr: 1 }} /> + Agregar nuevo proveedor (Ollama, DeepSeek...)
              </MenuItem>
            </Select>
          </FormControl>

          {provider === "google-account" && (
            <Chip
              color="success"
              variant="outlined"
              icon={<CheckCircleOutlineIcon />}
              label="Conectado con Cuenta de Google. Sin costo ni API Key requerida."
              sx={{ py: 1.5, height: "auto", "& .MuiChip-label": { whiteSpace: "normal" } }}
            />
          )}

          {provider !== "google-account" && (
            <TextField
              size="small"
              fullWidth
              type="password"
              label="API Key temporal (opcional)"
              placeholder="Usa la de Ajustes si se omite"
              value={customApiKey}
              onChange={(e) => onCustomApiKeyChange(e.target.value)}
              helperText="Si no introduces una aquí, se utilizará la clave configurada en Ajustes."
            />
          )}

          <LlmModelSelector
            provider={provider}
            value={customModel}
            onChange={onCustomModelChange}
            apiKey={customApiKey}
            baseUrl={currentCustom?.baseUrl}
            label="Modelo de IA"
            placeholder="Selecciona o escribe el modelo"
          />
        </Box>

        <Divider />

        {/* Sección 2: Perfil de reglas del proyecto */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography variant="subtitle2" fontWeight={700} color="text.primary">
            2. Perfil de reglas del proyecto
          </Typography>

          <FormControl size="small" fullWidth>
            <InputLabel id="drawer-profile-select-label">Perfil de reglas</InputLabel>
            <Select
              labelId="drawer-profile-select-label"
              label="Perfil de reglas"
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
            <Typography variant="caption" color="text.secondary">
              No se pudo cargar la lista de perfiles
            </Typography>
          )}

          <Typography variant="caption" color="text.secondary">
            Define glosario, documentos, horas y reglas de negocio que se aplican además de las reglas generales.
          </Typography>
        </Box>

        <Divider />

        {/* Sección 3: Contexto técnico */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="subtitle2" fontWeight={700} color="text.primary">
              3. Contexto técnico
            </Typography>
            <Button
              size="small"
              variant="text"
              startIcon={<ResetIcon />}
              onClick={onResetProjectContext}
              sx={{ textTransform: "none", fontSize: "0.8rem", p: 0.5 }}
            >
              Restablecer
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary">
            {linkedFolder
              ? `Tomado de la carpeta ${linkedFolder.name}. Los cambios aplican solo a esta reunión.`
              : "Sin carpeta: contexto libre."}
          </Typography>

          <TextField
            fullWidth
            multiline
            minRows={10}
            maxRows={20}
            variant="outlined"
            placeholder="Monorepo TypeScript: Express en backend, React en frontend..."
            value={projectContext}
            onChange={(e) => onProjectContextChange(e.target.value)}
            sx={{
              "& .MuiInputBase-root": {
                fontSize: "0.85rem",
                fontFamily: "monospace"
              }
            }}
          />
        </Box>

        {/* Sección 4: Aviso de consumo de tokens visible */}
        <Box sx={{ pt: 1 }}>
          <Typography variant="caption" color="text.secondary" display="block">
            Cada generación consume tokens del proveedor elegido; en APIs de pago tiene costo.
          </Typography>
        </Box>
      </Box>

      {/* Pie fijo */}
      <Box
        sx={{
          p: 2,
          borderTop: "1px solid",
          borderColor: "divider",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 1.5,
          bgcolor: "background.paper"
        }}
      >
        <Button variant="text" onClick={onClose} sx={{ textTransform: "none" }}>
          Cerrar
        </Button>
        <Button
          variant="contained"
          color="primary"
          disabled={isGenerating}
          onClick={() => {
            onGenerate();
            onClose();
          }}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          {hasAnalysis ? "Regenerar con esta configuración" : "Generar con esta configuración"}
        </Button>
      </Box>
    </Drawer>
  );
};
