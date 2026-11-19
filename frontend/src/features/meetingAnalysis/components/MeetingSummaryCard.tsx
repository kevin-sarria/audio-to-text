import React from "react";
import { Paper, Typography, Box, Chip } from "@mui/material";
import {
  AssignmentTurnedIn as AssignmentTurnedInIcon,
  CheckCircleOutline as CheckCircleOutlineIcon
} from "@mui/icons-material";
import { MeetingAnalysisDto } from "@audio-to-text/shared";

interface MeetingSummaryCardProps {
  analysis: MeetingAnalysisDto;
}

export const MeetingSummaryCard: React.FC<MeetingSummaryCardProps> = ({ analysis }) => {
  return (
    <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <AssignmentTurnedInIcon color="primary" /> Resumen Ejecutivo de la Reunión
      </Typography>
      <Typography variant="body1" sx={{ whiteSpace: "pre-line", mb: 3, lineHeight: 1.7 }}>
        {analysis.summary}
      </Typography>

      {analysis.topicsDiscussed.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom color="text.secondary">
            Temas Tratados:
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8 }}>
            {analysis.topicsDiscussed.map((topic, idx) => (
              <Chip key={idx} label={topic} size="small" variant="outlined" />
            ))}
          </Box>
        </Box>
      )}

      {analysis.keyDecisions.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom color="text.secondary">
            Decisiones Clave Tomadas:
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {analysis.keyDecisions.map((decision, idx) => (
              <Box key={idx} sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                <CheckCircleOutlineIcon color="success" fontSize="small" sx={{ mt: "3px" }} />
                <Typography variant="body2">{decision}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Paper>
  );
};
