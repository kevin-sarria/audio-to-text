import React from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Paper,
  Link
} from "@mui/material";
import {
  AutoAwesome as AutoAwesomeIcon,
  AutoFixHigh as AutoFixIcon,
  FolderOpen as BrowseFolderIcon,
  Tune as TuneIcon
} from "@mui/icons-material";
import type { CustomAiProviderDto, ProjectContextScanReportDto } from "@audio-to-text/shared";
import { ContextScanReport } from "../ContextScanReport.js";
import { providerLabel } from "./folderPayload.js";

export interface ScanSectionProps {
  repoPath: string;
  onRepoPathChange: (val: string) => void;
  onBrowseFolder: () => void;
  isScanning: boolean;
  onScan: () => void;
  scanStatusMsg: { type: "success" | "warning" | "error"; text: string } | null;
  scanSuccessNotice: boolean;
  scanReport: ProjectContextScanReportDto | null;
  defaultProvider: string;
  defaultModel: string;
  customProviders: CustomAiProviderDto[];
  onNavigateToGeneral: () => void;
  onNavigateToAiConfig: () => void;
}

export const ScanSection: React.FC<ScanSectionProps> = ({
  repoPath,
  onRepoPathChange,
  onBrowseFolder,
  isScanning,
  onScan,
  scanStatusMsg,
  scanSuccessNotice,
  scanReport,
  defaultProvider,
  defaultModel,
  customProviders,
  onNavigateToGeneral,
  onNavigateToAiConfig
}) => {
  const currentProviderName = providerLabel(defaultProvider, customProviders);
  const currentModelDisplay = defaultModel.trim() || "modelo predeterminado";

  return (
    <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <Paper
        variant="outlined"
        sx={{
          p: 2.5,
          borderRadius: 2,
          bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)")
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <AutoAwesomeIcon color="primary" fontSize="small" />
          <Typography variant="subtitle2" fontWeight={700}>
            Escanear Repositorio con IA (Auto-generar Contexto Técnico)
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Selecciona la carpeta local de tu proyecto. El escáner ejecuta un inventario determinístico del código, lee la documentación por orden de prioridad resumiendo archivos extensos, y valida cada dato contra las fuentes antes de generar el contexto técnico.
        </Typography>

        <Alert severity="warning" sx={{ mb: 1.5, fontSize: "0.85rem", py: 0.5 }}>
          <strong>Aviso de facturación y consumo de tokens:</strong> Este análisis automático inspecciona la estructura y contenidos clave de tu código. Los documentos largos se resumen por partes y eso hace varias llamadas. Si utilizas un proveedor con API Key de pago (OpenAI, DeepSeek, etc.), esta operación <strong>consumirá tokens adicionales en tu facturación</strong>. Con <em>Cuenta de Google (Gemini Pro - Sin API Key)</em> no genera costos adicionales.
        </Alert>

        <Alert severity="info" sx={{ mb: 1.5, fontSize: "0.85rem", py: 0.5 }}>
          El contenido de los archivos (sin .env, llaves ni secretos detectados) se envía al proveedor elegido:{" "}
          <strong>{currentProviderName}</strong>.
        </Alert>

        {/* Indicador de qué proveedor y modelo se utilizará para el escaneo */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            p: 1.25,
            mb: 2,
            borderRadius: 1.5,
            bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)")
          }}
        >
          <Typography variant="body2" sx={{ fontSize: "0.85rem" }}>
            Se usará: <strong>{currentProviderName}</strong> · <strong>{currentModelDisplay}</strong>
          </Typography>
          <Button
            size="small"
            startIcon={<TuneIcon fontSize="small" />}
            onClick={onNavigateToAiConfig}
            sx={{ textTransform: "none", fontSize: "0.8rem", py: 0.2 }}
          >
            Cambiar en Configuración de IA
          </Button>
        </Box>

        <Box sx={{ display: "flex", gap: 1, mb: 1.5, alignItems: "center" }}>
          <TextField
            fullWidth
            size="small"
            label="Ruta de la carpeta del proyecto / repositorio"
            placeholder="ej. C:\Users\TuUsuario\proyectos\mi-app"
            value={repoPath}
            onChange={(e) => onRepoPathChange(e.target.value)}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<BrowseFolderIcon />}
            onClick={onBrowseFolder}
            sx={{ whiteSpace: "nowrap", height: 40 }}
          >
            Examinar...
          </Button>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Button
            variant="contained"
            color="secondary"
            size="small"
            startIcon={isScanning ? <CircularProgress size={16} color="inherit" /> : <AutoFixIcon />}
            onClick={onScan}
            disabled={isScanning || !repoPath.trim()}
          >
            {isScanning ? "Analizando repositorio con IA..." : "Escanear y Auto-generar Contexto"}
          </Button>
          {isScanning && (
            <Typography variant="caption" color="text.secondary">
              Inspeccionando arquitectura, dependencias y reglas de negocio...
            </Typography>
          )}
        </Box>

        {scanSuccessNotice && (
          <Alert
            severity="success"
            sx={{ mt: 1.5, fontSize: "0.85rem", alignItems: "center" }}
            action={
              <Button color="inherit" size="small" onClick={onNavigateToGeneral}>
                Ver contexto
              </Button>
            }
          >
            Contexto generado y cargado en la pestaña General
          </Alert>
        )}

        {scanStatusMsg && (
          <Alert severity={scanStatusMsg.type} sx={{ mt: 1.5, fontSize: "0.85rem", py: 0.5 }}>
            {scanStatusMsg.text}
          </Alert>
        )}

        {scanReport && <ContextScanReport report={scanReport} />}
      </Paper>
    </Box>
  );
};
