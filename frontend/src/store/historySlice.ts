import { StateCreator } from "zustand";
import { TranscriptionSessionDto } from "@audio-to-text/shared";

export interface HistorySlice {
  sessions: TranscriptionSessionDto[];
  total: number;
  page: number;
  limit: number;
  isLoading: boolean;
  setSessions: (sessions: TranscriptionSessionDto[], total: number) => void;
  setPage: (page: number) => void;
  setIsLoading: (isLoading: boolean) => void;
  removeSession: (id: string) => void;
}

export const createHistorySlice: StateCreator<HistorySlice> = (set) => ({
  sessions: [],
  total: 0,
  page: 1,
  limit: 20,
  isLoading: false,
  setSessions: (sessions, total) => set({ sessions, total }),
  setPage: (page) => set({ page }),
  setIsLoading: (isLoading) => set({ isLoading }),
  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      total: Math.max(0, state.total - 1)
    }))
});
