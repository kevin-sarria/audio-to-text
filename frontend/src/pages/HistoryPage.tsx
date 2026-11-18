import React from "react";
import { Box, Typography } from "@mui/material";
import { HistoryList } from "../features/history/HistoryList.js";

interface HistoryPageProps {
  onSelectSession: (sessionId: string) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ onSelectSession }) => {
  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Historial de Transcripciones
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Accede a tus transcripciones procesadas, edita nombres de hablantes o descarga en diversos formatos.
        </Typography>
      </Box>

      <HistoryList onSelectSession={onSelectSession} />
    </Box>
  );
};
