import React from "react";
import { Box, TextField, Typography, Button } from "@mui/material";
import { AutoFixHigh as AutoFixIcon } from "@mui/icons-material";

export interface BasicSectionProps {
  name: string;
  onNameChange: (val: string) => void;
  description: string;
  onDescriptionChange: (val: string) => void;
  technicalContext: string;
  onTechnicalContextChange: (val: string) => void;
  onResetTemplate: () => void;
}

export const BasicSection: React.FC<BasicSectionProps> = ({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  technicalContext,
  onTechnicalContextChange,
  onResetTemplate
}) => {
  return (
    <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        Configura el contexto técnico y las generalidades de este proyecto. Todas las grabaciones y audios asignados a esta carpeta usarán automáticamente estas pautas para generar issues optimizadas para agentes de IA.
      </Typography>

      <TextField
        fullWidth
        label="Nombre del Proyecto / Carpeta *"
        placeholder="ej. Proyecto DIAMANTE (Limpieza Inteligente)"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        required
      />

      <TextField
        fullWidth
        label="Descripción breve (opcional)"
        placeholder="ej. Sistema de gestión de servicios y facturación"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
      />

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          Contexto Técnico del Proyecto (Stack, Arquitectura, Módulos, Convenciones) *
        </Typography>
        <Button
          size="small"
          startIcon={<AutoFixIcon />}
          onClick={onResetTemplate}
        >
          Restablecer Plantilla
        </Button>
      </Box>

      <TextField
        fullWidth
        multiline
        rows={14}
        value={technicalContext}
        onChange={(e) => onTechnicalContextChange(e.target.value)}
        placeholder="Describe aquí las tecnologías, arquitectura y convenciones de este proyecto..."
        helperText={`${technicalContext.length} / 40000 caracteres`}
      />
    </Box>
  );
};
