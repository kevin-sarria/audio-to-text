import React, { useState } from "react";
import {
  Box,
  Typography,
  ButtonGroup,
  Button,
  CircularProgress,
  Alert
} from "@mui/material";
import { Download as DownloadIcon } from "@mui/icons-material";
import { ExportFormat } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { useAppStore } from "../../store/index.js";

interface ExportPanelProps {
  sessionId: string;
}

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: ExportFormat.SRT, label: "SRT" },
  { format: ExportFormat.VTT, label: "VTT" },
  { format: ExportFormat.TXT, label: "TXT" },
  { format: ExportFormat.MD, label: "Markdown" },
  { format: ExportFormat.DOCX, label: "Word (.docx)" },
  { format: ExportFormat.PDF, label: "PDF" },
  { format: ExportFormat.XLSX, label: "Excel (.xlsx)" }
];

export const ExportPanel: React.FC<ExportPanelProps> = ({ sessionId }) => {
  const [downloadingFormat, setDownloadingFormat] = useState<ExportFormat | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const guestToken = useAppStore((s) => s.guestToken);

  const handleDownload = async (format: ExportFormat) => {
    setDownloadingFormat(format);
    setErrorMsg(null);

    try {
      const headers: Record<string, string> = {};
      if (guestToken) {
        headers["x-guest-token"] = guestToken;
      }

      const blob = await api.get<Blob>(`/sessions/${sessionId}/export`, {
        params: { format },
        headers
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transcripcion-${sessionId}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setErrorMsg(err.message || `Error al exportar en formato ${format}.`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <Box sx={{ my: 2 }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <DownloadIcon fontSize="small" /> Exportar Transcripción
      </Typography>

      {errorMsg && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {errorMsg}
        </Alert>
      )}

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {FORMATS.map(({ format, label }) => {
          const isLoading = downloadingFormat === format;
          return (
            <Button
              key={format}
              variant="outlined"
              size="small"
              onClick={() => handleDownload(format)}
              disabled={downloadingFormat !== null}
              startIcon={isLoading ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              {label}
            </Button>
          );
        })}
      </Box>
    </Box>
  );
};
