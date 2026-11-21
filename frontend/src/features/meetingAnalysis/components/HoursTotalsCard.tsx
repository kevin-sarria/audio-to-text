import React from "react";
import { Paper, Box, Typography } from "@mui/material";
import { AccessTime as TimeIcon } from "@mui/icons-material";
import { RepoHoursTotals } from "@audio-to-text/shared";

interface HoursTotalsCardProps {
  totals: RepoHoursTotals;
}

export const HoursTotalsCard: React.FC<HoursTotalsCardProps> = ({ totals }) => {
  const backend = totals.backend ?? 0;
  const panel = totals.panel ?? 0;
  const app = totals.app ?? 0;
  const total = totals.total ?? 0;

  const allZero = backend === 0 && panel === 0 && app === 0;
  const parts: string[] = [];

  if (allZero || backend > 0) parts.push(`Backend ${backend} h`);
  if (allZero || panel > 0) parts.push(`Panel ${panel} h`);
  if (allZero || app > 0) parts.push(`App ${app} h`);

  return (
    <Paper
      variant="outlined"
      sx={{
        px: 2,
        py: 1.25,
        mb: 2.5,
        borderRadius: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 1.5,
        bgcolor: "background.paper"
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <TimeIcon color="primary" fontSize="small" />
        <Typography variant="subtitle1" fontWeight={700}>
          {total} h estimadas
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" fontWeight={500}>
        {parts.join(" · ")}
      </Typography>
    </Paper>
  );
};
