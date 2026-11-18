import { StateCreator } from "zustand";
import { SessionStatus } from "@audio-to-text/shared";

export interface SegmentState {
  id: string;
  sessionId: string;
  speakerId: string;
  startTimeMs: number;
  endTimeMs: number;
  content: string;
  confidenceScore?: number | null;
}

export interface SpeakerState {
  id: string;
  sessionId: string;
  label: string;
  customName?: string | null;
}

export interface SessionDetailState {
  id: string;
  originalFileName: string;
  projectFolderId?: string | null;
  fileFormat: string;
  durationSeconds?: number | null;
  status: SessionStatus;
  audioExpiresAt: string;
  isAudioPurged: boolean;
  speakers: SpeakerState[];
  segments: SegmentState[];
}

export interface TranscriberSlice {
  currentSession: SessionDetailState | null;
  uploadProgress: number | null;
  isUploading: boolean;
  guestToken: string | null;
  setCurrentSession: (session: SessionDetailState | null) => void;
  setUploadProgress: (progress: number | null) => void;
  setIsUploading: (isUploading: boolean) => void;
  setGuestToken: (guestToken: string | null) => void;
  updateSpeakerName: (speakerId: string, customName: string) => void;
  updateSessionStatus: (status: SessionStatus) => void;
  updateSessionProjectFolder: (projectFolderId: string | null) => void;
}

export const createTranscriberSlice: StateCreator<TranscriberSlice> = (set) => ({
  currentSession: null,
  uploadProgress: null,
  isUploading: false,
  guestToken: null,
  setCurrentSession: (currentSession) => set({ currentSession }),
  setUploadProgress: (uploadProgress) => set({ uploadProgress }),
  setIsUploading: (isUploading) => set({ isUploading }),
  setGuestToken: (guestToken) => set({ guestToken }),
  updateSpeakerName: (speakerId, customName) =>
    set((state) => {
      if (!state.currentSession) return state;
      const updatedSpeakers = state.currentSession.speakers.map((sp) =>
        sp.id === speakerId ? { ...sp, customName } : sp
      );
      return {
        currentSession: {
          ...state.currentSession,
          speakers: updatedSpeakers
        }
      };
    }),
  updateSessionStatus: (status) =>
    set((state) => {
      if (!state.currentSession) return state;
      return {
        currentSession: {
          ...state.currentSession,
          status
        }
      };
    }),
  updateSessionProjectFolder: (projectFolderId) =>
    set((state) => {
      if (!state.currentSession) return state;
      return {
        currentSession: {
          ...state.currentSession,
          projectFolderId
        }
      };
    })
});
