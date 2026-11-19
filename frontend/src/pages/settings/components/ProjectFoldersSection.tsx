import React from "react";
import {
  Paper,
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  CardActions
} from "@mui/material";
import {
  Folder as ProjectFolderIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon
} from "@mui/icons-material";
import { ProjectFolderDto } from "@audio-to-text/shared";

interface ProjectFoldersSectionProps {
  folders: ProjectFolderDto[];
  onNewFolder: () => void;
  onEditFolder: (folder: ProjectFolderDto) => void;
  onDeleteFolder: (folder: ProjectFolderDto) => void;
}

export const ProjectFoldersSection: React.FC<ProjectFoldersSectionProps> = ({
  folders,
  onNewFolder,
  onEditFolder,
  onDeleteFolder
}) => {
  return (
    <Paper sx={{ p: 3, mb: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ProjectFolderIcon color="primary" />
          <Box>
            <Typography variant="h6" fontWeight={600}>
              Carpetas de Proyecto (Harnesses de Contexto)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Define el stack tecnológico, módulos y convenciones de cada uno de tus repositorios una sola vez. Al transcribir una reunión, asígnala a la carpeta correspondiente para que las issues se generen con contexto perfecto.
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={onNewFolder}
        >
          Nueva Carpeta
        </Button>
      </Box>

      {folders.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic", py: 2 }}>
          Aún no has creado carpetas de proyecto. Crea una (ej. "Proyecto Diamante", "Backend E-Commerce") para precargar el contexto y las credenciales automáticamente en tus reuniones.
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {folders.map((f) => (
            <Grid item xs={12} sm={6} key={f.id}>
              <Card variant="outlined" sx={{ borderRadius: 2, height: "100%", display: "flex", flexDirection: "column" }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700}>
                      📁 {f.name}
                    </Typography>
                    {f.defaultProvider && (
                      <Chip size="small" label={f.defaultProvider} color="primary" variant="outlined" />
                    )}
                  </Box>
                  {f.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {f.description}
                    </Typography>
                  )}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      fontFamily: "monospace",
                      bgcolor: "action.hover",
                      p: 1,
                      borderRadius: 1
                    }}
                  >
                    {f.technicalContext}
                  </Typography>
                </CardContent>
                <CardActions sx={{ justifyContent: "flex-end", px: 2, pb: 1.5 }}>
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => onEditFolder(f)}
                  >
                    Editar
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => onDeleteFolder(f)}
                  >
                    Eliminar
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Paper>
  );
};
