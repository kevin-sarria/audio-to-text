import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Chip,
  CircularProgress,
  LinearProgress,
  Alert,
  Paper,
  Divider,
  Tabs,
  Tab
} from "@mui/material";
import {
  Description as TranscriptIcon,
  AutoAwesome as AiIcon
} from "@mui/icons-material";
import { SessionStatus } from "@audio-to-text/shared";
import { api } from "../lib/api.js";
import { connectSessionSse } from "../lib/sse.js";
import { useAppStore } from "../store/index.js";
import { useActiveSegment } from "../features/player/useActiveSegment.js";
import { AudioPlayer } from "../features/player/AudioPlayer.js";
import { SegmentList } from "../features/player/SegmentList.js";
import { ExportPanel } from "../features/export/ExportPanel.js";
import { MeetingAnalysisPanel } from "../features/meetingAnalysis/MeetingAnalysisPanel.js";

interface SessionPageProps {
  sessionId: string;
}

export const SessionPage: React.FC<SessionPageProps> = ({ sessionId }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<number>(0);

  const {
    currentSession,
    setCurrentSession,
    updateSessionStatus,
    currentTimeMs,
    guestToken
  } = useAppStore();

  const fetchSessionDetails = async () => {
    try {
      const headers: Record<string, string> = {};
      if (guestToken) {
        headers["x-guest-token"] = guestToken;
      }

      const response = await api.get<any>(`/sessions/${sessionId}`, { headers });
      if (response.success && response.data) {
        setCurrentSession(response.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al cargar la sesión de transcripción.");
    } finally {
      setIsLoading(false);
    }
  };

  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    fetchSessionDetails();

    // Conectar a SSE para actualizaciones de estado en tiempo real
    const unsubscribeSse = connectSessionSse(sessionId, (event) => {
      if (event.type === "completed") {
        fetchSessionDetails();
      } else if (event.type === "progress" && typeof event.data["percent"] === "number") {
        setProgress(event.data["percent"] as number);
      } else if (event.type === "failed") {
        updateSessionStatus(SessionStatus.FAILED);
      } else if (event.type === "status" && event.data["status"]) {
        updateSessionStatus(event.data["status"] as SessionStatus);
      }
    });

    return () => {
      unsubscribeSse();
    };
  }, [sessionId]);

  const activeSegment = useActiveSegment(
    currentSession?.segments || [],
    currentTimeMs
  );

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (errorMsg || !currentSession) {
    return (
      <Alert severity="error" sx={{ my: 4 }}>
        {errorMsg || "No se encontró la sesión solicitada."}
      </Alert>
    );
  }

  const isProcessing =
    currentSession.status === SessionStatus.PENDING ||
    currentSession.status === SessionStatus.PROCESSING;

  return (
    <Box sx={{ pb: 8 }}>
      <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1 }}>
          <Box>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              {currentSession.originalFileName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Creado el {new Date().toLocaleDateString()} • Duración:{" "}
              {currentSession.durationSeconds ? `${currentSession.durationSeconds}s` : "Procesando..."}
            </Typography>
          </Box>
          <Chip
            label={currentSession.status}
            color={
              currentSession.status === SessionStatus.COMPLETED
                ? "success"
                : currentSession.status === SessionStatus.FAILED
                ? "error"
                : "primary"
            }
          />
        </Box>

        {isProcessing && (
          <Box sx={{ mt: 3, p: 2, bgcolor: "action.hover", borderRadius: 2 }} aria-live="polite">
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              {progress === null && <CircularProgress size={24} />}
              <Typography variant="body2">
                {progress === null
                  ? "En cola o preparando el audio... Esta vista se actualizará automáticamente."
                  : `Transcribiendo... ${progress}%`}
              </Typography>
            </Box>
            {progress !== null && (
              <LinearProgress
                variant="determinate"
                value={progress}
                aria-label="Progreso de transcripción"
                sx={{ mt: 1.5, height: 8, borderRadius: 4 }}
              />
            )}
          </Box>
        )}

        {currentSession.status === SessionStatus.FAILED && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Ocurrió un error al procesar este audio. Por favor intenta subirlo nuevamente.
          </Alert>
        )}
      </Paper>

      {currentSession.status === SessionStatus.COMPLETED && (
        <Box sx={{ mt: 3 }}>
          <Paper sx={{ mb: 3, borderRadius: 2 }}>
            <Tabs
              value={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              indicatorColor="primary"
              textColor="primary"
              variant="fullWidth"
              sx={{ borderBottom: 1, borderColor: "divider" }}
            >
              <Tab
                icon={<TranscriptIcon />}
                iconPosition="start"
                label={`Transcripción (${currentSession.segments.length})`}
              />
              <Tab
                icon={<AiIcon />}
                iconPosition="start"
                label="Resumen & Issues IA"
              />
            </Tabs>
          </Paper>

          {activeTab === 0 && (
            <>
              <ExportPanel sessionId={sessionId} />
              <Divider sx={{ my: 3 }} />
              <Typography variant="h6" fontWeight={700} gutterBottom>
                Segmentos Transcritos ({currentSession.segments.length})
              </Typography>
              <SegmentList
                sessionId={sessionId}
                segments={currentSession.segments}
                speakers={currentSession.speakers}
                activeSegmentId={activeSegment?.id || null}
              />
              <AudioPlayer />
            </>
          )}

          {activeTab === 1 && (
            <MeetingAnalysisPanel sessionId={sessionId} />
          )}
        </Box>
      )}
    </Box>
  );
};
