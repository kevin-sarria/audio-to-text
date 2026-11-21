import React from "react";
import {
  Paper,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
  FormControl,
  Select,
  MenuItem,
  Chip
} from "@mui/material";
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Close as CloseIcon,
  AutoAwesome as AutoAwesomeIcon,
  Settings as SettingsIcon,
  Folder as FolderIcon,
  SmartToy as SmartToyIcon,
  Tune as TuneIcon,
  CheckCircle as CheckCircleIcon,
  WarningAmber as WarningIcon,
  ErrorOutline as ErrorIcon
} from "@mui/icons-material";
import type {
  AnalysisGenerationMetaDto,
  ProjectFolderDto
} from "@audio-to-text/shared";
import { formatGenerationMeta } from "../generationSelection.js";

export interface AnalysisHeaderBarProps {
  title: string;
  isEditingTitle: boolean;
  editableTitle: string;
  isSavingTitle: boolean;
  isGenerating: boolean;
  hasAnalysis: boolean;
  analysisUpdatedAt?: string;
  generationMeta?: AnalysisGenerationMetaDto | null;
  onStartEditingTitle: () => void;
  onCancelEditingTitle: () => void;
  onChangeTitle: (title: string) => void;
  onSaveTitle: () => void;
  onGenerate: () => void;
  onOpenSettings: () => void;
  folders: ProjectFolderDto[];
  currentFolderId: string | null;
  onLinkFolder: (folderId: string) => void;
  selectedProviderLabel: string;
  selectedModel: string;
  selectedProfileName: string;
}

export const AnalysisHeaderBar: React.FC<AnalysisHeaderBarProps> = ({
  title,
  isEditingTitle,
  editableTitle,
  isSavingTitle,
  isGenerating,
  hasAnalysis,
  analysisUpdatedAt,
  generationMeta,
  onStartEditingTitle,
  onCancelEditingTitle,
  onChangeTitle,
  onSaveTitle,
  onGenerate,
  onOpenSettings,
  folders,
  currentFolderId,
  onLinkFolder,
  selectedProviderLabel,
  selectedModel,
  selectedProfileName
}) => {
  const metaFormat = formatGenerationMeta(generationMeta);
  const modelDisplayText = selectedModel.trim() || "modelo predeterminado";

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 2.5 },
        mb: 2.5,
        borderRadius: 2.5,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
        gap: 1.75
      }}
    >
      {/* Fila 1: Título editable y Acción principal */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.5
        }}
      >
        {isEditingTitle ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1, minWidth: 260, maxWidth: 640 }}>
            <TextField
              fullWidth
              size="small"
              label="Nombre del análisis"
              value={editableTitle}
              onChange={(e) => onChangeTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSaveTitle()}
              autoFocus
            />
            <Button
              variant="contained"
              size="small"
              startIcon={<SaveIcon />}
              onClick={onSaveTitle}
              disabled={isSavingTitle}
            >
              Guardar
            </Button>
            <IconButton size="small" onClick={onCancelEditingTitle}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            <Typography
              variant="h5"
              fontWeight={700}
              sx={{
                fontSize: { xs: "1.15rem", sm: "1.45rem" },
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {title}
            </Typography>
            <Tooltip title="Renombrar análisis">
              <IconButton size="small" onClick={onStartEditingTitle}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {/* Acciones principales */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            width: { xs: "100%", sm: "auto" }
          }}
        >
          <Button
            variant="contained"
            color="primary"
            disabled={isGenerating}
            onClick={onGenerate}
            startIcon={
              isGenerating ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <AutoAwesomeIcon />
              )
            }
            sx={{
              flex: { xs: 1, sm: "initial" },
              py: 1,
              px: 2.5,
              fontWeight: 600,
              textTransform: "none",
              borderRadius: 2
            }}
          >
            {isGenerating
              ? "Generando…"
              : hasAnalysis
              ? "Regenerar"
              : "Generar resumen e issues"}
          </Button>

          <Tooltip title="Configurar generación">
            <IconButton
              onClick={onOpenSettings}
              aria-label="configurar generación"
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
                p: 1
              }}
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Fila 2: Selector compacto de carpeta + Chips clicables de Modelo y Perfil */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1.25
        }}
      >
        <FormControl size="small" sx={{ minWidth: 150, maxWidth: 220 }}>
          <Select
            value={currentFolderId || ""}
            onChange={(e) => onLinkFolder(e.target.value)}
            displayEmpty
            sx={{
              height: 32,
              fontSize: "0.85rem",
              borderRadius: 1.5,
              "& .MuiSelect-select": {
                py: 0.5,
                display: "flex",
                alignItems: "center",
                gap: 0.75
              }
            }}
          >
            <MenuItem value="">
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <FolderIcon fontSize="small" color="action" />
                <span>Sin carpeta</span>
              </Box>
            </MenuItem>
            {folders.map((f) => (
              <MenuItem key={f.id} value={f.id}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <FolderIcon fontSize="small" color="primary" />
                  <span>{f.name}</span>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Chip
          size="small"
          variant="outlined"
          icon={<SmartToyIcon fontSize="small" />}
          label={`${selectedProviderLabel} · ${modelDisplayText}`}
          onClick={onOpenSettings}
          clickable
          sx={{ borderRadius: 1.5, fontWeight: 500, fontSize: "0.8rem", height: 32 }}
        />

        <Chip
          size="small"
          variant="outlined"
          icon={<TuneIcon fontSize="small" />}
          label={`Perfil ${selectedProfileName}`}
          onClick={onOpenSettings}
          clickable
          sx={{ borderRadius: 1.5, fontWeight: 500, fontSize: "0.8rem", height: 32 }}
        />
      </Box>

      {/* Fila 3: Metadatos del análisis guardado (si existe) */}
      {hasAnalysis && (
        <Box
          sx={{
            pt: 0.75,
            borderTop: "1px dashed",
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1,
            fontSize: "0.82rem",
            color: "text.secondary"
          }}
        >
          {generationMeta ? (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.82rem" }}>
                Generado con {generationMeta.providerLabel} ·{" "}
                {generationMeta.model.trim() || "modelo predeterminado"} · perfil{" "}
                {generationMeta.profileName} · {metaFormat.whenText} · {metaFormat.durationText}
                {generationMeta.usedFallback && " · modo de respaldo"}
              </Typography>
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, ml: 0.5 }}>
                {metaFormat.statusKind === "ok" && (
                  <Chip
                    size="small"
                    icon={<CheckCircleIcon style={{ color: "#2e7d32" }} fontSize="small" />}
                    label={metaFormat.statusText}
                    sx={{
                      height: 22,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#2e7d32",
                      borderColor: "#2e7d32",
                      bgcolor: "rgba(46, 125, 50, 0.08)"
                    }}
                    variant="outlined"
                  />
                )}
                {metaFormat.statusKind === "warnings" && (
                  <Chip
                    size="small"
                    icon={<WarningIcon style={{ color: "#ed6c02" }} fontSize="small" />}
                    label={`⚠ ${generationMeta.validationWarnings.length} avisos`}
                    sx={{
                      height: 22,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#ed6c02",
                      borderColor: "#ed6c02",
                      bgcolor: "rgba(237, 108, 2, 0.08)"
                    }}
                    variant="outlined"
                  />
                )}
                {metaFormat.statusKind === "errors" && (
                  <Chip
                    size="small"
                    icon={<ErrorIcon style={{ color: "#d32f2f" }} fontSize="small" />}
                    label={`✕ ${generationMeta.validationErrors.length} errores sin corregir`}
                    sx={{
                      height: 22,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#d32f2f",
                      borderColor: "#d32f2f",
                      bgcolor: "rgba(211, 47, 47, 0.08)"
                    }}
                    variant="outlined"
                  />
                )}
              </Box>
            </>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.82rem" }}>
              Generado el{" "}
              {analysisUpdatedAt ? new Date(analysisUpdatedAt).toLocaleString() : "fecha no registrada"}{" "}
              · modelo no registrado (análisis anterior a esta versión)
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  );
};
