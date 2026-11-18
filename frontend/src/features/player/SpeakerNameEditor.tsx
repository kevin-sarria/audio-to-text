import React, { useState } from "react";
import { Box, TextField, IconButton, Typography, CircularProgress } from "@mui/material";
import { Edit as EditIcon, Check as CheckIcon, Close as CloseIcon } from "@mui/icons-material";
import { api } from "../../lib/api.js";
import { useAppStore } from "../../store/index.js";

interface SpeakerNameEditorProps {
  sessionId: string;
  speakerId: string;
  initialName: string;
  label: string;
}

export const SpeakerNameEditor: React.FC<SpeakerNameEditorProps> = ({
  sessionId,
  speakerId,
  initialName,
  label
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initialName || label);
  const [isSaving, setIsSaving] = useState(false);
  const updateSpeakerName = useAppStore((s) => s.updateSpeakerName);
  const guestToken = useAppStore((s) => s.guestToken);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const headers: Record<string, string> = {};
      if (guestToken) {
        headers["x-guest-token"] = guestToken;
      }

      await api.patch(
        `/sessions/${sessionId}/speakers/${speakerId}`,
        { customName: trimmed },
        { headers }
      );

      updateSpeakerName(speakerId, trimmed);
      setIsEditing(false);
    } catch (err) {
      console.error("Error actualizando nombre de hablante:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setName(initialName || label);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
        <TextField
          size="small"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          disabled={isSaving}
          sx={{ maxWidth: 180 }}
          inputProps={{ "aria-label": "Editar nombre de hablante" }}
        />
        <IconButton size="small" color="primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <CircularProgress size={16} /> : <CheckIcon fontSize="small" />}
        </IconButton>
        <IconButton
          size="small"
          onClick={() => {
            setName(initialName || label);
            setIsEditing(false);
          }}
          disabled={isSaving}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
      <Typography variant="subtitle2" fontWeight={700} color="primary.main">
        {name}
      </Typography>
      <IconButton
        size="small"
        onClick={() => setIsEditing(true)}
        aria-label={`Editar nombre de ${name}`}
        sx={{ opacity: 0.7, "&:hover": { opacity: 1 } }}
      >
        <EditIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  );
};
