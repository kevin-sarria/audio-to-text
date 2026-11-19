import React from "react";
import {
  Paper,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  IconButton,
  Tooltip,
  Alert
} from "@mui/material";
import {
  Code as CodeIcon,
  ContentCopy as ContentCopyIcon,
  Check as CheckIcon,
  Download as DownloadIcon
} from "@mui/icons-material";
import { DevIssueDto } from "@audio-to-text/shared";
import { DevIssueCard } from "./DevIssueCard.js";

interface DevIssuesSectionProps {
  issues: DevIssueDto[];
  totalIssuesCount: number;
  filterRepo: string;
  onFilterRepoChange: (repo: string) => void;
  filterType: string;
  onFilterTypeChange: (type: string) => void;
  filterPriority: string;
  onFilterPriorityChange: (priority: string) => void;
  copiedId: string | null;
  onCopyAllIssues: () => void;
  onDownloadMarkdown: () => void;
  onDownloadJson: () => void;
  onCopyPrompt: (prompt: string, id: string) => void;
}

export const DevIssuesSection: React.FC<DevIssuesSectionProps> = ({
  issues,
  totalIssuesCount,
  filterRepo,
  onFilterRepoChange,
  filterType,
  onFilterTypeChange,
  filterPriority,
  onFilterPriorityChange,
  copiedId,
  onCopyAllIssues,
  onDownloadMarkdown,
  onDownloadJson,
  onCopyPrompt
}) => {
  return (
    <>
      <Paper sx={{ p: 2, mb: 3, borderRadius: 3 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 2
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CodeIcon color="primary" />
            <Typography variant="h6" fontWeight={700}>
              Issues para Programación ({issues.length} de {totalIssuesCount})
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            {/* Filtro por Repositorio */}
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="filter-repo-label">Repositorio</InputLabel>
              <Select
                labelId="filter-repo-label"
                label="Repositorio"
                value={filterRepo}
                onChange={(e) => onFilterRepoChange(e.target.value)}
              >
                <MenuItem value="all">Todos los repos</MenuItem>
                <MenuItem value="backend">Backend</MenuItem>
                <MenuItem value="panel">Panel Admin</MenuItem>
                <MenuItem value="app">App Móvil</MenuItem>
              </Select>
            </FormControl>

            {/* Filtro por Tipo */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel id="filter-type-label">Tipo</InputLabel>
              <Select
                labelId="filter-type-label"
                label="Tipo"
                value={filterType}
                onChange={(e) => onFilterTypeChange(e.target.value)}
              >
                <MenuItem value="all">Todos los tipos</MenuItem>
                <MenuItem value="feature">Feature</MenuItem>
                <MenuItem value="bug">Bug</MenuItem>
                <MenuItem value="refactor">Refactor</MenuItem>
                <MenuItem value="chore">Chore</MenuItem>
                <MenuItem value="spike">Spike</MenuItem>
              </Select>
            </FormControl>

            {/* Filtro por Prioridad */}
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel id="filter-priority-label">Prioridad</InputLabel>
              <Select
                labelId="filter-priority-label"
                label="Prioridad"
                value={filterPriority}
                onChange={(e) => onFilterPriorityChange(e.target.value)}
              >
                <MenuItem value="all">Todas</MenuItem>
                <MenuItem value="high">Alta</MenuItem>
                <MenuItem value="medium">Media</MenuItem>
                <MenuItem value="low">Baja</MenuItem>
              </Select>
            </FormControl>

            {/* Botón Copiar Documento Completo */}
            <Button
              variant="outlined"
              size="small"
              startIcon={copiedId === "all-issues" ? <CheckIcon /> : <ContentCopyIcon />}
              onClick={onCopyAllIssues}
              color={copiedId === "all-issues" ? "success" : "primary"}
            >
              Copiar Todo (Markdown)
            </Button>

            {/* Botón Descargar */}
            <Tooltip title="Descargar documento completo estructurado en Markdown">
              <IconButton size="small" onClick={onDownloadMarkdown}>
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Descargar JSON para integraciones">
              <Button size="small" variant="text" onClick={onDownloadJson}>
                JSON
              </Button>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      {/* Listado de Tarjetas de Issues */}
      {issues.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          No hay issues que coincidan con los filtros seleccionados.
        </Alert>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {issues.map((issue) => (
            <DevIssueCard
              key={issue.id}
              issue={issue}
              isCopied={copiedId === issue.id}
              onCopyPrompt={onCopyPrompt}
            />
          ))}
        </Box>
      )}
    </>
  );
};
