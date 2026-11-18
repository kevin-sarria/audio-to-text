import React from "react";
import { Box, LinearProgress, Typography } from "@mui/material";

interface UploadProgressProps {
  progress: number | null;
  isUploading: boolean;
  statusText?: string;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({
  progress,
  isUploading,
  statusText = "Subiendo archivo de audio..."
}) => {
  if (!isUploading && progress === null) return null;

  return (
    <Box
      sx={{ width: "100%", mt: 2 }}
      role="region"
      aria-live="polite"
      aria-label="Progreso de subida de audio"
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          {statusText}
        </Typography>
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          {progress !== null ? `${progress}%` : "Iniciando..."}
        </Typography>
      </Box>
      <LinearProgress
        variant={progress !== null ? "determinate" : "indeterminate"}
        value={progress || 0}
        sx={{ height: 8, borderRadius: 4 }}
      />
    </Box>
  );
};
