import { useState, useEffect, useRef, useCallback } from "react";
import type { MeetingAnalysisDto, MeetingAnalysisProvider } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { useAppStore } from "../../store/index.js";

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
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isGenerating) {
      setGenerationSeconds(0);
      timerRef.current = setInterval(() => {
        setGenerationSeconds((prev) => prev + 1);
      }, 1000);
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

  const handleGenerate = async (payload: GeneratePayload): Promise<boolean> => {
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

      const res = await api.post<{ success: boolean; data: MeetingAnalysisDto }>(
        `/sessions/${sessionId}/meeting-analysis`,
        body,
        { headers }
      );

      if (res.success && res.data) {
        setAnalysis(res.data);
        setEditableTitle(res.data.title || `Análisis: ${currentSession?.originalFileName || "Reunión"}`);
        setSnackMessage("¡Resumen e issues generadas exitosamente!");
        return true;
      }
      return false;
    } catch (err: any) {
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
    fetchAnalysis,
    handleGenerate,
    handleSaveTitle,
    handleLinkFolder
  };
}
