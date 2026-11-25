import React, { useState } from "react";
import { Alert, Button, CircularProgress, Snackbar } from "@mui/material";
import { SmartToy as BotIcon } from "@mui/icons-material";
import type { ImportBotMeetingsResultDto } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { describeImportResult, type ImportMessage } from "./importResult.js";

interface ImportBotMeetingsButtonProps {
  onImported: () => void;
}

export const ImportBotMeetingsButton: React.FC<ImportBotMeetingsButtonProps> = ({ onImported }) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<ImportMessage | null>(null);

  const handleImport = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ success: boolean; data?: ImportBotMeetingsResultDto }>("/desktop/library/import");
      if (res.success && res.data) {
        setMessage(describeImportResult(res.data));
        if (res.data.imported > 0) {
          window.dispatchEvent(new Event("library:changed"));
          onImported();
        }
      }
    } catch (err: any) {
      setMessage({ severity: "warning", message: err.message || "No se pudieron importar las reuniones del bot." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={loading ? <CircularProgress size={16} /> : <BotIcon />}
        onClick={handleImport}
        disabled={loading}
      >
        Importar reuniones del bot
      </Button>
      <Snackbar open={Boolean(message)} autoHideDuration={8000} onClose={() => setMessage(null)}>
        {message ? (
          <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ width: "100%" }}>
            {message.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
};
