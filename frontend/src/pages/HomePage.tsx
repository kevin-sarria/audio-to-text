import React, { useState, useEffect } from "react";
import { Box, Typography, Paper, Grid, Alert, AlertTitle, Button } from "@mui/material";
import { AudioDropzone } from "../features/upload/AudioDropzone.js";
import { RecordVoiceOver, Speed, Security, Settings as SettingsIcon } from "@mui/icons-material";
import { isDesktopApp } from "../lib/runtime.js";
import { api } from "../lib/api.js";

interface HomePageProps {
  onSessionCreated: (sessionId: string) => void;
  onNavigateSettings?: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onSessionCreated, onNavigateSettings }) => {
  const isDesktop = isDesktopApp();
  const [statusProblems, setStatusProblems] = useState<string[]>([]);
  const [readyToTranscribe, setReadyToTranscribe] = useState(true);

  useEffect(() => {
    if (!isDesktop) return;

    api
      .get<any>("/desktop/status")
      .then((res) => {
        if (res.success && res.data) {
          setReadyToTranscribe(res.data.readyToTranscribe);
          setStatusProblems(res.data.problems || []);
        }
      })
      .catch(() => {});
  }, [isDesktop]);

  return (
    <Box>
      <Box sx={{ textAlign: "center", mb: 4, mt: 2 }}>
        <Typography variant="h4" component="h1" fontWeight={800} gutterBottom>
          Transcripción y Diarización de Audio
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 600, mx: "auto" }}>
          Convierte tus grabaciones, entrevistas y reuniones en texto estructurado con identificación automática de hablantes.
        </Typography>
      </Box>

      {/* Alerta de estado en modo escritorio si faltan requisitos */}
      {isDesktop && !readyToTranscribe && (
        <Alert
          severity="warning"
          sx={{ mb: 4 }}
          action={
            onNavigateSettings && (
              <Button
                color="inherit"
                size="small"
                startIcon={<SettingsIcon />}
                onClick={onNavigateSettings}
              >
                Ir a Configuración
              </Button>
            )
          }
        >
          <AlertTitle>Se requiere configuración para transcribir</AlertTitle>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {statusProblems.map((prob, idx) => (
              <li key={idx}>{prob}</li>
            ))}
          </ul>
        </Alert>
      )}

      <AudioDropzone onUploadSuccess={(sessionId) => onSessionCreated(sessionId)} />

      <Box sx={{ mt: 6 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2.5, textAlign: "center", height: "100%" }}>
              <RecordVoiceOver color="primary" sx={{ fontSize: 40, mb: 1 }} />
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Diarización Inteligente
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Distingue automáticamente entre múltiples participantes y permite renombrarlos en tiempo real.
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2.5, textAlign: "center", height: "100%" }}>
              <Speed color="primary" sx={{ fontSize: 40, mb: 1 }} />
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Alta Precisión
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Impulsado por modelos Whisper para una transcripción exacta y sincronizada milisegundo a milisegundo.
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2.5, textAlign: "center", height: "100%" }}>
              <Security color="primary" sx={{ fontSize: 40, mb: 1 }} />
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Privacidad Garantizada
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Purga automática de archivos de audio expirados a las 48 horas preservando tus transcripciones.
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};
