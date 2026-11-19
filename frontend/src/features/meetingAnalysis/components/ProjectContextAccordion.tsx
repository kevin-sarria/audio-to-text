import React from "react";
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Chip,
  Button
} from "@mui/material";
import {
  Tune as TuneIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  AddCircleOutline as AddIcon
} from "@mui/icons-material";
import { CustomAiProviderDto } from "@audio-to-text/shared";
import { LlmModelSelector } from "../../customAi/LlmModelSelector.js";
import { DEFAULT_PROJECT_CONTEXT } from "./MeetingAnalysisMarkdown.js";

interface ProjectContextAccordionProps {
  isExpanded: boolean;
  onToggleExpanded: (expanded: boolean) => void;
  projectContext: string;
  onProjectContextChange: (val: string) => void;
  provider: string;
  onProviderChange: (val: string) => void;
  customApiKey: string;
  onCustomApiKeyChange: (val: string) => void;
  customModel: string;
  onCustomModelChange: (val: string) => void;
  customProviders: CustomAiProviderDto[];
  onOpenCustomModal: () => void;
}

export const ProjectContextAccordion: React.FC<ProjectContextAccordionProps> = ({
  isExpanded,
  onToggleExpanded,
  projectContext,
  onProjectContextChange,
  provider,
  onProviderChange,
  customApiKey,
  onCustomApiKeyChange,
  customModel,
  onCustomModelChange,
  customProviders,
  onOpenCustomModal
}) => {
  return (
    <Accordion
      expanded={isExpanded}
      onChange={(_, expanded) => onToggleExpanded(expanded)}
      sx={{ mb: 3, borderRadius: 2, border: "1px solid", borderColor: "divider", "&:before": { display: "none" } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <TuneIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" fontWeight={600}>
            Configuración Manual del Contexto y del Modelo de IA
          </Typography>
        </Box>
      </AccordionSummary>

      <AccordionDetails>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Personaliza el stack tecnológico, convenciones o proveedor de IA específicamente para esta reunión:
        </Typography>

        <TextField
          fullWidth
          multiline
          rows={5}
          variant="outlined"
          label="Contexto Técnico del Proyecto (Stack, Arquitectura, Módulos)"
          value={projectContext}
          onChange={(e) => onProjectContextChange(e.target.value)}
          placeholder="Ej. Monorepo con React + Vite en frontend, Express + Prisma en backend..."
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <FormControl size="small" sx={{ minWidth: 280, flex: 1 }}>
            <InputLabel id="provider-select-label">Proveedor de IA</InputLabel>
            <Select
              labelId="provider-select-label"
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
                ⭐ Cuenta de Google (Gemini Pro - Sin API Key)
              </MenuItem>
              <MenuItem value="gemini">Google Gemini API</MenuItem>
              <MenuItem value="openai">OpenAI (ChatGPT / GPT-4o)</MenuItem>
              <MenuItem value="groq">Groq Cloud (Llama 3.3 70B)</MenuItem>
              <Divider sx={{ my: 1 }} />
              {customProviders.map((cp) => (
                <MenuItem key={cp.id} value={cp.id}>
                  🤖 {cp.name} ({cp.defaultModel})
                </MenuItem>
              ))}
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
              label="Conectado con tu Cuenta de Google. Sin costo ni API Key requerida."
            />
          )}

          {provider !== "google-account" && (
            <TextField
              size="small"
              type="password"
              label="API Key temporal (opcional)"
              placeholder="Usa la de Ajustes si se omite"
              value={customApiKey}
              onChange={(e) => onCustomApiKeyChange(e.target.value)}
              sx={{ flex: 1, minWidth: 220 }}
            />
          )}

          <Box sx={{ minWidth: 260, flex: 1 }}>
            <LlmModelSelector
              provider={provider}
              value={customModel}
              onChange={onCustomModelChange}
              apiKey={customApiKey}
              baseUrl={customProviders.find((cp) => cp.id === provider)?.baseUrl}
              label="Modelo de IA"
              placeholder="Selecciona o escribe el modelo"
            />
          </Box>

          <Button
            size="small"
            variant="text"
            onClick={() => onProjectContextChange(DEFAULT_PROJECT_CONTEXT)}
          >
            Restablecer plantilla
          </Button>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};
