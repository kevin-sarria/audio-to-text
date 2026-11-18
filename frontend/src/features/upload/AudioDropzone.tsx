import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Box,
  Typography,
  Paper,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button
} from "@mui/material";
import { CloudUpload as UploadIcon, CreateNewFolder as CreateNewFolderIcon } from "@mui/icons-material";
import { UploadProgress } from "./UploadProgress.js";
import { api } from "../../lib/api.js";
import { offlineQueue } from "../../lib/offlineQueue.js";
import { useAppStore } from "../../store/index.js";
import { isDesktopApp } from "../../lib/runtime.js";
import { useProjectFolders } from "../projectFolders/useProjectFolders.js";
import { ProjectFolderModal } from "../projectFolders/ProjectFolderModal.js";

interface AudioDropzoneProps {
  onUploadSuccess?: (sessionId: string, guestToken?: string) => void;
}

export const AudioDropzone: React.FC<AudioDropzoneProps> = ({ onUploadSuccess }) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<boolean>(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);

  const { folders, refreshFolders } = useProjectFolders();

  const {
    uploadProgress,
    isUploading,
    setUploadProgress,
    setIsUploading,
    setGuestToken,
    setAudioBlobUrl
  } = useAppStore();

  const handleFileUpload = async (file: File) => {
    setErrorMsg(null);
    setOfflineNotice(false);

    // Guardar URL local para reproducción inmediata en el cliente
    const localBlobUrl = URL.createObjectURL(file);
    setAudioBlobUrl(localBlobUrl);

    if (!navigator.onLine) {
      await offlineQueue.enqueueUpload(file);
      setOfflineNotice(true);
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("audio", file);
      if (selectedFolderId) {
        formData.append("projectFolderId", selectedFolderId);
      }

      const response = await api.uploadWithProgress<any>(
        "/sessions",
        formData,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      if (response.success && response.data) {
        const { id, guestToken } = response.data;
        if (guestToken) {
          setGuestToken(guestToken);
        }
        onUploadSuccess?.(id, guestToken);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al subir el archivo de audio.");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [selectedFolderId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/*": [".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm"]
    },
    maxFiles: 1,
    disabled: isUploading
  });

  return (
    <Box sx={{ width: "100%", my: 2 }}>
      {errorMsg && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMsg}
        </Alert>
      )}

      {offlineNotice && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Sin conexión: el audio se guardó localmente y se procesará automáticamente cuando vuelvas a tener red.
        </Alert>
      )}

      {/* Selector de Carpeta de Proyecto Pre-Transcripción */}
      <Paper sx={{ p: 2, mb: 2.5, borderRadius: 2, bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 260 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="project-folder-select-label">Carpeta de Proyecto (Contexto IA)</InputLabel>
              <Select
                labelId="project-folder-select-label"
                value={selectedFolderId}
                label="Carpeta de Proyecto (Contexto IA)"
                onChange={(e) => setSelectedFolderId(e.target.value)}
                disabled={isUploading}
              >
                <MenuItem value="">
                  <em>Ninguna (Transcripción general sin contexto específico)</em>
                </MenuItem>
                {folders.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    📁 {f.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Button
            size="small"
            variant="outlined"
            startIcon={<CreateNewFolderIcon />}
            onClick={() => setIsFolderModalOpen(true)}
            disabled={isUploading}
          >
            Nueva Carpeta
          </Button>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Selecciona la carpeta a la que pertenece esta reunión para que las issues y el resumen técnico se adapten automáticamente a su arquitectura y convenciones.
        </Typography>
      </Paper>

      <Paper
        {...getRootProps()}
        role="button"
        tabIndex={0}
        aria-label="Zona de arrastre para subir archivo de audio"
        sx={{
          p: { xs: 3, md: 5 },
          border: "2px dashed",
          borderColor: isDragActive ? "primary.main" : "divider",
          backgroundColor: isDragActive ? "action.hover" : "background.paper",
          borderRadius: 3,
          textAlign: "center",
          cursor: isUploading ? "not-allowed" : "pointer",
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            borderColor: "primary.main",
            backgroundColor: "action.hover"
          },
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.main"
          }
        }}
      >
        <input {...getInputProps()} aria-hidden="true" />
        <UploadIcon sx={{ fontSize: 56, color: "primary.main", mb: 1.5 }} />
        <Typography variant="h6" component="p" gutterBottom>
          {isDragActive
            ? "Suelta el archivo aquí..."
            : "Arrastra y suelta tu archivo de audio, o haz clic para explorar"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Soporta WAV, MP3, M4A, OGG, FLAC y WebM (hasta {isDesktopApp() ? "2 GB" : "200 MB"})
        </Typography>
      </Paper>

      <UploadProgress progress={uploadProgress} isUploading={isUploading} />

      <ProjectFolderModal
        open={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        onSaved={(created) => {
          refreshFolders();
          setSelectedFolderId(created.id);
        }}
      />
    </Box>
  );
};
