import React from "react";
import {
  Paper,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Tooltip,
  CircularProgress
} from "@mui/material";
import {
  Edit as EditIcon,
  Save as SaveIcon,
  AutoAwesome as AutoAwesomeIcon
} from "@mui/icons-material";

export interface AnalysisTitleHeaderProps {
  title: string;
  isEditingTitle: boolean;
  editableTitle: string;
  isSavingTitle: boolean;
  isGenerating: boolean;
  hasAnalysis: boolean;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onChangeTitle: (title: string) => void;
  onSaveTitle: () => void;
  onGenerate: () => void;
}

export const AnalysisTitleHeader: React.FC<AnalysisTitleHeaderProps> = ({
  title,
  isEditingTitle,
  editableTitle,
  isSavingTitle,
  isGenerating,
  hasAnalysis,
  onStartEditing,
  onCancelEditing,
  onChangeTitle,
  onSaveTitle,
  onGenerate
}) => {
  return (
    <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        {isEditingTitle ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1, maxWidth: 600 }}>
            <TextField
              fullWidth
              size="small"
              label="Nombre personalizado del análisis"
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
            <Button size="small" onClick={onCancelEditing}>
              Cancelar
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="h5" fontWeight={700}>
              {title}
            </Typography>
            <Tooltip title="Renombrar en el historial">
              <IconButton size="small" onClick={onStartEditing}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="contained"
            color="primary"
            disabled={isGenerating}
            startIcon={isGenerating ? <CircularProgress size={18} color="inherit" /> : <AutoAwesomeIcon />}
            onClick={onGenerate}
          >
            {isGenerating
              ? "Procesando con IA..."
              : hasAnalysis
              ? "Regenerar Resumen e Issues"
              : "Generar Resumen e Issues"}
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};
