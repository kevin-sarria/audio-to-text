import { useState, useEffect, useRef, useCallback } from "react";
import type { MeetingAnalysisDto, MeetingAnalysisJobDto, MeetingAnalysisProvider } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { useAppStore } from "../../store/index.js";
import { followAnalysisJob } from "./followAnalysisJob.js";

interface UseMeetingAnalysisParams {
  sessionId: string;
}

export interface GeneratePayload {
  title?: string;
  projectContext?: string;
  provider: MeetingAnalysisProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  profileId?: string;
}

export function useMeetingAnalysis({ sessionId }: UseMeetingAnalysisParams) {
  const { guestToken, currentSession, updateSessionProjectFolder } = useAppStore();

  const [analysis, setAnalysis] = useState<MeetingAnalysisDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);

  // Título editable
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editableTitle, setEditableTitle] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // Temporizador de segundos transcurridos durante generación
  const [generationSeconds, setGenerationSeconds] = useState(0);
  const [generationProgress, setGenerationProgress] = useState("");
  const timerRef = useRef<any>(null);
  const generationStartRef = useRef<number>(0);
  // true cuando se sale de la página o cambia la sesión: deja de consultar el trabajo
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (isGenerating) {
      const tick = () =>
        setGenerationSeconds(Math.max(0, Math.floor((Date.now() - generationStartRef.current) / 1000)));
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isGenerating]);

  const fetchAnalysis = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = guestToken ? { "x-guest-token": guestToken } : {};
      const res = await api.get<{ success: boolean; data: MeetingAnalysisDto | null }>(
        `/sessions/${sessionId}/meeting-analysis`,
        { headers }
      );
      if (res.success && res.data) {
        setAnalysis(res.data);
        setEditableTitle(res.data.title || `Análisis: ${currentSession?.originalFileName || "Reunión"}`);
      } else {
        setAnalysis(null);
        setEditableTitle(`Análisis: ${currentSession?.originalFileName || "Reunión"}`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al cargar el análisis de la reunión.");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, guestToken, currentSession?.originalFileName]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  /** Sigue un trabajo de análisis en segundo plano; true si terminó con un análisis nuevo. */
  const followJob = async (jobId: string): Promise<boolean> => {
    const headers: Record<string, string> = guestToken ? { "x-guest-token": guestToken } : {};
    try {
      const result = await followAnalysisJob({
        jobId,
        fetchJob: async (id) => {
          const check = await api.get<{ success: boolean; data?: MeetingAnalysisJobDto; error?: string }>(
            `/sessions/${sessionId}/meeting-analysis/job/${id}`,
            { headers }
          );
          if (!check || !check.success || !check.data) {
            throw new Error(check?.error || "Error al consultar el estado del análisis.");
          }
          return check.data;
        },
        onProgress: (job) => {
          if (!cancelledRef.current && job.progress) setGenerationProgress(job.progress);
        },
        isCancelled: () => cancelledRef.current
      });

      if (cancelledRef.current) return false;
      setAnalysis(result);
      setEditableTitle(result.title || `Análisis: ${currentSession?.originalFileName || "Reunión"}`);
      setSnackMessage("¡Resumen e issues generadas exitosamente!");
      return true;
    } catch (err: any) {
      if (cancelledRef.current) return false;
      setErrorMsg(err.message || "Error al generar el análisis con IA.");
      return false;
    }
  };

  // Al abrir la sesión, si hay un análisis corriendo en segundo plano se retoma su seguimiento
  useEffect(() => {
    let active = true;
    const headers: Record<string, string> = guestToken ? { "x-guest-token": guestToken } : {};
    (async () => {
      try {
        const res = await api.get<{ success: boolean; data: MeetingAnalysisJobDto | null }>(
          `/sessions/${sessionId}/meeting-analysis/job`,
          { headers }
        );
        const job = res?.data;
        if (!active || cancelledRef.current || !res.success || !job || job.status !== "running") return;

        generationStartRef.current = new Date(job.startedAt).getTime();
        setGenerationProgress(job.progress);
        setErrorMsg(null);
        setIsGenerating(true);
        await followJob(job.jobId);
      } catch {
        // Sin trabajo activo o sin conexión: no es un error que mostrar
      } finally {
        if (active) setIsGenerating(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, guestToken]);

  const handleGenerate = async (payload: GeneratePayload): Promise<boolean> => {
    generationStartRef.current = Date.now();
    setGenerationProgress("");
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = guestToken ? { "x-guest-token": guestToken } : {};
      const body = {
        title: (payload.title ?? editableTitle).trim() || undefined,
        projectContext: payload.projectContext?.trim() || undefined,
        provider: payload.provider,
        apiKey: payload.apiKey?.trim() || undefined,
        model: payload.model?.trim() || undefined,
        baseUrl: payload.baseUrl,
        profileId: payload.profileId?.trim() || undefined
      };

      const res = await api.post<{ success: boolean; data?: { jobId: string } }>(
        `/sessions/${sessionId}/meeting-analysis`,
        body,
        { headers }
      );

      if (!res.success || !res.data?.jobId) return false;
      return await followJob(res.data.jobId);
    } catch (err: any) {
      if (cancelledRef.current) return false;
      setErrorMsg(err.message || "Error al generar el análisis con IA.");
      return false;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveTitle = async () => {
    if (!editableTitle.trim()) return;
    setIsSavingTitle(true);
    try {
      const headers: Record<string, string> = guestToken ? { "x-guest-token": guestToken } : {};
      const res = await api.patch<{ success: boolean; data: any }>(
        `/sessions/${sessionId}/meeting-analysis/title`,
        { title: editableTitle.trim() },
        { headers }
      );

      if (res.success) {
        setAnalysis((prev) => (prev ? { ...prev, title: editableTitle.trim() } : null));
        setIsEditingTitle(false);
        setSnackMessage("Título actualizado correctamente en el historial.");
      }
    } catch (err: any) {
      setSnackMessage(`Error al actualizar título: ${err.message}`);
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleLinkFolder = async (folderId: string) => {
    try {
      const headers: Record<string, string> = guestToken ? { "x-guest-token": guestToken } : {};
      const res = await api.patch<{ success: boolean; data: any }>(
        `/sessions/${sessionId}/project`,
        { projectFolderId: folderId || null },
        { headers }
      );
      if (res.success) {
        updateSessionProjectFolder(folderId || null);
        setSnackMessage(folderId ? "Sesión vinculada a la carpeta de proyecto." : "Sesión desvinculada.");
      }
    } catch (err: any) {
      setSnackMessage(`Error al vincular carpeta: ${err.message}`);
    }
  };

  return {
    analysis,
    setAnalysis,
    isLoading,
    isGenerating,
    errorMsg,
    setErrorMsg,
    snackMessage,
    setSnackMessage,
    isEditingTitle,
    setIsEditingTitle,
    editableTitle,
    setEditableTitle,
    isSavingTitle,
    generationSeconds,
    generationProgress,
    fetchAnalysis,
    handleGenerate,
    handleSaveTitle,
    handleLinkFolder
  };
}
