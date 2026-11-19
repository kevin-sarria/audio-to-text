import React from "react";
import { Paper, Box, Typography } from "@mui/material";
import { AccessTime as TimeIcon } from "@mui/icons-material";
import { RepoHoursTotals } from "@audio-to-text/shared";

interface HoursTotalsCardProps {
  totals: RepoHoursTotals;
}

export const HoursTotalsCard: React.FC<HoursTotalsCardProps> = ({ totals }) => {
  return (
    <Paper sx={{ p: 2.5, mb: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <TimeIcon color="primary" />
        <Typography variant="subtitle1" fontWeight={700}>
          Totales de Horas por Repositorio (Verificación Aritmética)
        </Typography>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
          gap: 2
        }}
      >
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: "primary.50", textAlign: "center" }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            BACKEND
          </Typography>
          <Typography variant="h5" fontWeight={800} color="primary.main">
            {totals.backend}h
          </Typography>
        </Box>
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: "secondary.50", textAlign: "center" }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            PANEL ADMIN
          </Typography>
          <Typography variant="h5" fontWeight={800} color="secondary.main">
            {totals.panel}h
          </Typography>
        </Box>
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: "info.50", textAlign: "center" }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            APP MÓVIL
          </Typography>
          <Typography variant="h5" fontWeight={800} color="info.main">
            {totals.app}h
          </Typography>
        </Box>
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: "action.hover", textAlign: "center" }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            TOTAL GENERAL
          </Typography>
          <Typography variant="h5" fontWeight={800} color="text.primary">
            {totals.total}h
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};
