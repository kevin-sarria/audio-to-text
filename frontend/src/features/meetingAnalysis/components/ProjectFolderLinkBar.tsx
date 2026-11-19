import React from "react";
import {
  Paper,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button
} from "@mui/material";
import {
  Folder as FolderIcon,
  Tune as TuneIcon
} from "@mui/icons-material";
import { ProjectFolderDto } from "@audio-to-text/shared";

interface ProjectFolderLinkBarProps {
  linkedFolder: ProjectFolderDto | null;
  folders: ProjectFolderDto[];
  currentFolderId: string | null;
  onLinkFolder: (folderId: string) => void;
  isConfigExpanded: boolean;
  onToggleConfig: () => void;
}

export const ProjectFolderLinkBar: React.FC<ProjectFolderLinkBarProps> = ({
  linkedFolder,
  folders,
  currentFolderId,
  onLinkFolder,
  isConfigExpanded,
  onToggleConfig
}) => {
  return (
    <Paper
      sx={{
        p: 2,
        mb: 2.5,
        borderRadius: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 1.5,
        bgcolor: linkedFolder ? "action.hover" : "background.paper",
        border: "1px solid",
        borderColor: linkedFolder ? "primary.main" : "divider"
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <FolderIcon color={linkedFolder ? "primary" : "action"} />
        {linkedFolder ? (
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>
              Carpeta vinculada: {linkedFolder.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Contexto técnico y credenciales optimizadas para este proyecto.
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Esta sesión no está vinculada a ninguna carpeta de proyecto.
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="link-folder-select">Vincular a Carpeta</InputLabel>
          <Select
            labelId="link-folder-select"
            label="Vincular a Carpeta"
            value={currentFolderId || ""}
            onChange={(e) => onLinkFolder(e.target.value)}
          >
            <MenuItem value="">
              <em>Ninguna (Contexto libre)</em>
            </MenuItem>
            {folders.map((f) => (
              <MenuItem key={f.id} value={f.id}>
                📁 {f.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          size="small"
          variant="outlined"
          startIcon={<TuneIcon />}
          onClick={onToggleConfig}
        >
          {isConfigExpanded ? "Ocultar contexto manual" : "Configurar manualmente el contexto"}
        </Button>
      </Box>
    </Paper>
  );
};
