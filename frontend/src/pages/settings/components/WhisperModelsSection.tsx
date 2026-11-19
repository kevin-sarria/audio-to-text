import React from "react";
import {
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Box,
  Chip,
  LinearProgress,
  Button
} from "@mui/material";
import {
  Download as DownloadIcon,
  Close as CancelIcon,
  Delete as DeleteIcon
} from "@mui/icons-material";
import { ModelItem } from "./SettingsTypes.js";

interface WhisperModelsSectionProps {
  models: ModelItem[];
  onDownloadModel: (name: string) => void;
  onCancelDownload: (name: string) => void;
  onDeleteModel: (name: string) => void;
}

export const WhisperModelsSection: React.FC<WhisperModelsSectionProps> = ({
  models,
  onDownloadModel,
  onCancelDownload,
  onDeleteModel
}) => {
  return (
    <Paper sx={{ p: 3, mb: 4 }}>
      <Typography variant="h6" fontWeight={600} gutterBottom>
        Modelos de Whisper en Disco
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Descarga los modelos requeridos para transcribir sin conexión a internet directamente en tu equipo.
      </Typography>

      <Grid container spacing={2}>
        {models.map((m) => (
          <Grid item xs={12} sm={6} key={m.name}>
            <Card variant="outlined">
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    ggml-{m.name}.bin
                  </Typography>
                  <Chip
                    size="small"
                    label={m.installed ? "Instalado" : "No Instalado"}
                    color={m.installed ? "success" : "default"}
                  />
                </Box>

                <Typography variant="caption" color="text.secondary" display="block">
                  Tamaño aproximado: {(m.sizeBytes / (1024 * 1024)).toFixed(0)} MB
                </Typography>

                {m.isDownloading && (
                  <Box sx={{ mt: 2 }} aria-live="polite">
                    <Typography variant="caption" color="primary">
                      Descargando: {m.progress?.percent ?? 0}%
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={m.progress?.percent ?? 0}
                      sx={{ mt: 0.5 }}
                    />
                  </Box>
                )}
              </CardContent>

              <CardActions sx={{ justifyContent: "flex-end", px: 2, pb: 2 }}>
                {m.isDownloading ? (
                  <Button
                    size="small"
                    color="error"
                    startIcon={<CancelIcon />}
                    onClick={() => onCancelDownload(m.name)}
                  >
                    Cancelar
                  </Button>
                ) : m.installed ? (
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => onDeleteModel(m.name)}
                  >
                    Eliminar
                  </Button>
                ) : (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={() => onDownloadModel(m.name)}
                  >
                    Descargar
                  </Button>
                )}
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
};
