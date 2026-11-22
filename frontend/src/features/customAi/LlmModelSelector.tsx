import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { shouldAutoSelectModel } from "./modelAutoSelect.js";

/**
 * Contrato de selección de modelos de IA (LlmModelSelector):
 * - El selector solo rellena el modelo predeterminado del proveedor cuando el valor actual está vacío.
 *   Nunca reemplaza un valor no vacío, ni al montarse, ni al cambiar de proveedor, ni al refrescar.
 * - Quien cambia de proveedor (acción del usuario) es responsable de vaciar el modelo
 *   (`onChange("")` / `setModel("")`) para que el selector rellene el predeterminado del nuevo proveedor.
 * - Se usa un `ref` con el último `value` (`valueRef.current = value` en cada render) para decidir
 *   al llegar la respuesta asíncrona, no el `value` capturado en el closure.
 * - Se ignoran respuestas viejas mediante un contador de petición (`requestIdRef`); si al llegar
 *   la respuesta ya hay una petición más nueva, no se tocan `models` ni el valor.
 * - La lógica pura de auto-selección reside en `shouldAutoSelectModel`.
 * - El botón de refrescar sigue refrescando la lista sin cambiar el valor existente.
 * - La normalización («Nombre (id)» → id) se mantiene.
 */

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
  purpose?: "transcription" | "analysis";
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
  sx,
  purpose = "analysis"
}) => {
  const [models, setModels] = useState<AvailableModelItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);

  // Ref con el último value para evitar problemas de stale closure
  const valueRef = useRef(value);
  valueRef.current = value;

  // Ref con el último onChange: los padres suelen pasar una función nueva en cada render,
  // y si fetchModels dependiera de ella el efecto de abajo pediría la lista en cada render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Contador de peticiones para descartar respuestas que lleguen tarde
  const requestIdRef = useRef(0);

  const fetchModels = useCallback(
    async (prov: string, key?: string, url?: string) => {
      if (!prov) return;
      const requestId = ++requestIdRef.current;
      setIsLoading(true);

      try {
        const res = await api.post<{ success: boolean; data: AvailableLlmModelsDto }>(
          "/desktop/settings/llm-models",
          {
            provider: prov,
            apiKey: key,
            baseUrl: url,
            purpose
          }
        );

        // Si ya hay una petición más reciente en curso, ignorar esta respuesta
        if (requestId !== requestIdRef.current) return;

        if (res.success && res.data) {
          setModels(res.data.models || []);
          setIsLive(!!res.data.isLiveDiscovered);

          // Solo auto-seleccionar si la petición sigue vigente y el valor actual está vacío
          if (
            shouldAutoSelectModel({
              latestValue: valueRef.current,
              requestId,
              currentRequestId: requestIdRef.current
            })
          ) {
            const defaultChoice = res.data.defaultModel || (res.data.models[0]?.id ?? "");
            if (defaultChoice) {
              onChangeRef.current(defaultChoice);
            }
          }
        }
      } catch (err) {
        console.warn("[LlmModelSelector] No se pudieron cargar modelos vía API:", err);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [purpose]
  );

  // Al cambiar de proveedor, refrescar la lista de modelos (solo el proveedor dispara la carga).
  useEffect(() => {
    fetchModels(provider, apiKey, baseUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, fetchModels]);

  const handleRefreshClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    fetchModels(provider, apiKey, baseUrl);
  };

  // Normalizar el valor eliminando decoraciones de etiqueta "Nombre (id)"
  const normalizedValue = React.useMemo(() => {
    if (!value) return "";
    const trimmed = value.trim();
    const matchByName = models.find((m) => m.name.toLowerCase() === trimmed.toLowerCase());
    if (matchByName) return matchByName.id;
    const matchById = models.find((m) => m.id.toLowerCase() === trimmed.toLowerCase());
    if (matchById) return matchById.id;

    const parenMatch = trimmed.match(/\(([^)]+)\)/);
    if (parenMatch && parenMatch[1]) {
      const inside = parenMatch[1].trim();
      const matchInside = models.find((m) => m.id.toLowerCase() === inside.toLowerCase());
      if (matchInside) return matchInside.id;
      return inside;
    }
    return trimmed;
  }, [value, models]);

  // Si normalizedValue difiere de value (ej. venía con texto descriptivo guardado), sincronizar hacia el padre
  useEffect(() => {
    if (normalizedValue && normalizedValue !== value) {
      onChange(normalizedValue);
    }
  }, [normalizedValue, value, onChange]);

  return (
    <Box sx={{ width: "100%", ...sx }}>
      <Autocomplete
        freeSolo
        size={size}
        disabled={disabled}
        options={models.map((m) => m.id)}
        value={normalizedValue}
        onInputChange={(_event, newInputValue, reason) => {
          if (reason === "input") {
            const match = models.find((m) => m.name.toLowerCase() === newInputValue.trim().toLowerCase());
            onChange(match ? match.id : newInputValue);
          } else if (reason === "clear") {
            onChange("");
          }
          // Ignorar 'reset' para evitar que la etiqueta descriptiva sobreescriba el ID técnico
        }}
        onChange={(_event, newValue) => {
          if (typeof newValue === "string") {
            const match = models.find((m) => m.name.toLowerCase() === newValue.trim().toLowerCase());
            onChange(match ? match.id : newValue);
          } else {
            onChange("");
          }
        }}
        getOptionLabel={(option) => {
          const match = models.find((m) => m.id === option);
          return match ? match.name : option;
        }}
        isOptionEqualToValue={(option, val) => option === val || option === normalizedValue}
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
