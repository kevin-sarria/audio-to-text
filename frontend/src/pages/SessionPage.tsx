import React, { useEffect, useRef, useState } from "react";
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
  Tab,
  Button
} from "@mui/material";
import {
  Description as TranscriptIcon,
  AutoAwesome as AiIcon,
  Refresh as RefreshIcon,
  Summarize as SummaryIcon
} from "@mui/icons-material";
import { SessionStatus } from "@audio-to-text/shared";
import { api } from "../lib/api.js";
import { connectSessionSse } from "../lib/sse.js";
import { useAppStore } from "../store/index.js";
import { MeetingSummaryTab } from "../features/library/MeetingSummaryTab.js";
import { useMeetingSummary } from "../features/library/useMeetingSummary.js";
import { effectiveTab, findSegmentIdAtSeconds, findSegmentIdByQuote, type SessionTab } from "../features/library/summaryHelpers.js";
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
  const [activeTab, setActiveTab] = useState<SessionTab>("transcript");

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
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = {};
      if (guestToken) {
        headers["x-guest-token"] = guestToken;
      }
      const res = await api.post<any>(`/sessions/${sessionId}/retry`, {}, { headers });
      if (res.success) {
        updateSessionStatus(SessionStatus.PENDING);
        await fetchSessionDetails();
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al reintentar la transcripción.");
    } finally {
      setIsRetrying(false);
    }
  };

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

  const isBotSession = currentSession?.fileFormat === "bot";
  const { summary, toggleActionItem, pendingItemIds, toggleError, clearToggleError } = useMeetingSummary(sessionId, Boolean(isBotSession));

  // El usuario eligió pestaña a mano en esta sesión: no se le fuerza la de resumen
  const userChoseTab = useRef(false);
  useEffect(() => {
    userChoseTab.current = false;
    setActiveTab("transcript");
  }, [sessionId]);

  // Cuando llega el resumen de una reunión del bot, esa pestaña pasa a ser la primera vista
  useEffect(() => {
    if (summary && !userChoseTab.current) setActiveTab("summary");
  }, [summary?.sessionId]);

  const shownTab = effectiveTab(activeTab, Boolean(summary));

  const jumpToSegment = (segmentId: string | null) => {
    if (!segmentId) return;
    userChoseTab.current = true;
    setActiveTab("transcript");
    setTimeout(() => {
      document.getElementById(`segment-${segmentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

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
          <Alert
            severity="error"
            sx={{ mt: 2 }}
            action={
              <Button
                color="inherit"
                size="small"
                variant="outlined"
                disabled={isRetrying}
                onClick={handleRetry}
                startIcon={<RefreshIcon />}
                sx={{ textTransform: "none", fontWeight: 600 }}
              >
                {isRetrying ? "Reintentando..." : "Reintentar Transcripción"}
              </Button>
            }
          >
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Ocurrió un error al procesar este audio:
            </Typography>
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary", wordBreak: "break-word" }}>
              {currentSession.errorMessage || "Error no especificado durante el procesamiento. Puedes reintentar sin necesidad de volver a subir el archivo."}
            </Typography>
          </Alert>
        )}
      </Paper>

      {currentSession.status === SessionStatus.COMPLETED && (
        <Box sx={{ mt: 3 }}>
          <Paper sx={{ mb: 3, borderRadius: 2 }}>
            <Tabs
              value={shownTab}
              onChange={(_, newValue) => {
                userChoseTab.current = true;
                setActiveTab(newValue);
              }}
              indicatorColor="primary"
              textColor="primary"
              variant="fullWidth"
              sx={{ borderBottom: 1, borderColor: "divider" }}
            >
              {summary && (
                <Tab
                  value="summary"
                  icon={<SummaryIcon />}
                  iconPosition="start"
                  label="Resumen de reunión"
                />
              )}
              <Tab
                value="transcript"
                icon={<TranscriptIcon />}
                iconPosition="start"
                label={`Transcripción (${currentSession.segments.length})`}
              />
              <Tab
                value="analysis"
                icon={<AiIcon />}
                iconPosition="start"
                label="Resumen & Issues IA"
              />
            </Tabs>
          </Paper>

          {shownTab === "summary" && summary && (
            <MeetingSummaryTab
              summary={summary}
              pendingItemIds={pendingItemIds}
              toggleError={toggleError}
              onDismissError={clearToggleError}
              onToggleItem={toggleActionItem}
              onOpenQuote={(quote) => jumpToSegment(findSegmentIdByQuote(currentSession.segments, quote))}
              onOpenChapter={(startSec) => jumpToSegment(findSegmentIdAtSeconds(currentSession.segments, startSec))}
            />
          )}

          {shownTab === "transcript" && (
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
              {currentSession.fileFormat !== "bot" && <AudioPlayer />}
            </>
          )}

          {shownTab === "analysis" && (
            <MeetingAnalysisPanel sessionId={sessionId} />
          )}
        </Box>
      )}
    </Box>
  );
};
