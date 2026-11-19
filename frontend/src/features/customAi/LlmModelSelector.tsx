import React, { useState, useEffect, useCallback } from "react";
import {
  Autocomplete,
  TextField,
  CircularProgress,
  IconButton,
  Tooltip,
  Box,
  Typography,
  Chip,
  SxProps,
  Theme
} from "@mui/material";
import { Refresh as RefreshIcon, CloudDone as LiveIcon } from "@mui/icons-material";
import { AvailableModelItem, AvailableLlmModelsDto } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";

export interface LlmModelSelectorProps {
  provider: string;
  value: string;
  onChange: (model: string) => void;
  apiKey?: string;
  baseUrl?: string;
  size?: "small" | "medium";
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  helperText?: string;
  sx?: SxProps<Theme>;
}

export const LlmModelSelector: React.FC<LlmModelSelectorProps> = ({
  provider,
  value,
  onChange,
  apiKey,
  baseUrl,
  size = "small",
  disabled = false,
  label = "Modelo de IA",
  placeholder = "Selecciona o escribe el modelo",
  helperText,
  sx
}) => {
  const [models, setModels] = useState<AvailableModelItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);

  const fetchModels = useCallback(
    async (prov: string, key?: string, url?: string, autoSelectDefault: boolean = false) => {
      if (!prov) return;
      setIsLoading(true);
      try {
        const res = await api.post<{ success: boolean; data: AvailableLlmModelsDto }>(
          "/desktop/settings/llm-models",
          {
            provider: prov,
            apiKey: key,
            baseUrl: url
          }
        );

        if (res.success && res.data) {
          setModels(res.data.models || []);
          setIsLive(!!res.data.isLiveDiscovered);

          // Si el valor actual está vacío o no pertenece a este proveedor, asignar el default del proveedor
          if (autoSelectDefault || !value.trim()) {
            onChange(res.data.defaultModel || (res.data.models[0]?.id ?? ""));
          }
        }
      } catch (err) {
        console.warn("[LlmModelSelector] No se pudieron cargar modelos vía API:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [value, onChange]
  );

  // Al cambiar de proveedor, refrescar la lista y actualizar el modelo sugerido
  useEffect(() => {
    fetchModels(provider, apiKey, baseUrl, true);
  }, [provider]);

  const handleRefreshClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    fetchModels(provider, apiKey, baseUrl, false);
  };

  // Encontrar el objeto de modelo actual para tooltip o visualización
  const currentModelObj = models.find((m) => m.id === value);

  return (
    <Box sx={{ width: "100%", ...sx }}>
      <Autocomplete
        freeSolo
        size={size}
        disabled={disabled}
        options={models.map((m) => m.id)}
        value={value}
        onInputChange={(_event, newInputValue) => {
          onChange(newInputValue);
        }}
        onChange={(_event, newValue) => {
          onChange(newValue || "");
        }}
        getOptionLabel={(option) => {
          const match = models.find((m) => m.id === option);
          return match ? match.name : option;
        }}
        renderOption={(props, option) => {
          const match = models.find((m) => m.id === option);
          return (
            <li {...props} key={option}>
              <Box sx={{ display: "flex", flexDirection: "column", width: "100%", py: 0.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Typography variant="body2" fontWeight={600}>
                    {match ? match.name : option}
                  </Typography>
                  {match?.contextWindow && (
                    <Chip
                      size="small"
                      label={`${Math.round(match.contextWindow / 1024)}k tokens`}
                      variant="outlined"
                      sx={{ fontSize: "0.7rem", height: 20 }}
                    />
                  )}
                </Box>
                {match && match.name !== match.id && (
                  <Typography variant="caption" color="text.secondary">
                    ID técnico: <code>{match.id}</code>
                  </Typography>
                )}
                {match?.description && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.2 }}>
                    {match.description}
                  </Typography>
                )}
              </Box>
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={placeholder}
            helperText={
              helperText ||
              (isLive
                ? "✨ Modelos descubiertos en vivo desde la API pública del proveedor"
                : "Lista de modelos optimizados. Puedes elegir uno o escribir cualquier modelo nuevo.")
            }
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <React.Fragment>
                  {isLoading ? (
                    <CircularProgress color="inherit" size={18} sx={{ mr: 1 }} />
                  ) : (
                    <Tooltip title={isLive ? "API en vivo conectada. Clic para refrescar lista." : "Consultar modelos disponibles en la API"}>
                      <IconButton
                        size="small"
                        onClick={handleRefreshClick}
                        edge="end"
                        sx={{ mr: 0.5 }}
                      >
                        {isLive ? <LiveIcon color="primary" fontSize="small" /> : <RefreshIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  )}
                  {params.InputProps.endAdornment}
                </React.Fragment>
              )
            }}
          />
        )}
      />
    </Box>
  );
};
