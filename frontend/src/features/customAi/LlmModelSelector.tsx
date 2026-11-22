import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  TextField,
  MenuItem,
  CircularProgress,
  IconButton,
  Tooltip,
  Box,
  Typography,
  SxProps,
  Theme
} from "@mui/material";
import { Refresh as RefreshIcon, CloudDone as LiveIcon } from "@mui/icons-material";
import { AvailableModelItem, AvailableLlmModelsDto } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { shouldAutoSelectModel } from "./modelAutoSelect.js";
import { buildModelOptions, ModelOption } from "./modelOptions.js";

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
 * - El selector es una lista desplegable (Select) no editable por texto.
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
  placeholder = "Selecciona un modelo",
  helperText,
  sx,
  purpose = "analysis"
}) => {
  const [models, setModels] = useState<AvailableModelItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isLive, setIsLive] = useState(false);

  // Ref con el último value para evitar problemas de stale closure
  const valueRef = useRef(value);
  valueRef.current = value;

  // Ref con el último onChange
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Contador de peticiones para descartar respuestas que lleguen tarde
  const requestIdRef = useRef(0);

  const fetchModels = useCallback(
    async (prov: string, key?: string, url?: string) => {
      if (!prov) return;
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setLoadError(false);

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
          setLoadError(false);

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
        } else {
          setLoadError(true);
        }
      } catch (err) {
        console.warn("[LlmModelSelector] No se pudieron cargar modelos vía API:", err);
        if (requestId === requestIdRef.current) {
          setLoadError(true);
        }
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

  const options = React.useMemo((): ModelOption[] => {
    const built = buildModelOptions(models, normalizedValue);
    // Sin lista (cargando o falló) no se puede afirmar que el modelo «no está en la lista»:
    // se muestra el valor guardado tal cual.
    return models.length === 0 ? built.map((o) => ({ id: o.id, label: o.id })) : built;
  }, [models, normalizedValue]);

  const isInitialLoading = isLoading && models.length === 0;
  const isFailedEmpty = loadError && models.length === 0;
  const isSelectDisabled = disabled || isInitialLoading || isFailedEmpty;

  let effectiveHelperText = helperText;
  if (isFailedEmpty) {
    effectiveHelperText = "No se pudo cargar la lista de modelos. Pulsa actualizar.";
  } else if (!effectiveHelperText) {
    if (isLive) {
      effectiveHelperText = "✨ Modelos descubiertos en vivo desde la API pública del proveedor";
    }
  }

  return (
    <Box sx={{ width: "100%", ...sx }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <TextField
          select
          fullWidth
          size={size}
          disabled={isSelectDisabled}
          label={label}
          value={isInitialLoading && !normalizedValue ? "" : normalizedValue}
          onChange={(e) => onChange(e.target.value)}
          helperText={effectiveHelperText}
          error={isFailedEmpty}
          SelectProps={{
            displayEmpty: true,
            renderValue: (selected) => {
              if (isInitialLoading && !selected) {
                return (
                  <Typography variant="body2" color="text.secondary">
                    Cargando modelos…
                  </Typography>
                );
              }
              if (!selected) {
                return (
                  <Typography variant="body2" color="text.secondary">
                    {placeholder}
                  </Typography>
                );
              }
              const match = options.find((o) => o.id === selected);
              if (!match) return String(selected);
              return (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, overflow: "hidden" }}>
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{
                      fontWeight: match.missing ? 400 : 500,
                      fontStyle: match.missing ? "italic" : "normal"
                    }}
                  >
                    {match.label}
                  </Typography>
                  {match.secondary && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      ({match.secondary})
                    </Typography>
                  )}
                </Box>
              );
            }
          }}
        >
          {isInitialLoading && (
            <MenuItem value="" disabled>
              Cargando modelos…
            </MenuItem>
          )}
          {options.length === 0 && !isInitialLoading && (
            <MenuItem value="" disabled>
              Sin modelos disponibles
            </MenuItem>
          )}
          {options.map((opt) => (
            <MenuItem key={opt.id} value={opt.id}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 1 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: opt.missing ? 400 : 600,
                    fontStyle: opt.missing ? "italic" : "normal"
                  }}
                >
                  {opt.label}
                </Typography>
                {opt.secondary && (
                  <Typography variant="caption" color="text.secondary">
                    {opt.secondary}
                  </Typography>
                )}
              </Box>
            </MenuItem>
          ))}
        </TextField>

        <Box sx={{ display: "flex", alignItems: "center", mt: size === "small" ? 0.5 : 1 }}>
          {isLoading ? (
            <CircularProgress color="inherit" size={20} sx={{ m: 1 }} />
          ) : (
            <Tooltip title={isLive ? "API en vivo conectada. Clic para refrescar lista." : "Consultar modelos disponibles en la API"}>
              <span>
                <IconButton
                  size="small"
                  onClick={handleRefreshClick}
                  disabled={disabled}
                  sx={{ p: 1 }}
                >
                  {isLive ? <LiveIcon color="primary" fontSize="small" /> : <RefreshIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Box>
  );
};
