import { StateCreator } from "zustand";

export interface PlayerSlice {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  activeSegmentId: string | null;
  seekTargetMs: number | null;
  audioBlobUrl: string | null;
  setCurrentTimeMs: (ms: number) => void;
  setDurationMs: (ms: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setActiveSegmentId: (id: string | null) => void;
  seekTo: (ms: number) => void;
  clearSeekTarget: () => void;
  setAudioBlobUrl: (url: string | null) => void;
}

export const createPlayerSlice: StateCreator<PlayerSlice> = (set) => ({
  currentTimeMs: 0,
  durationMs: 0,
  isPlaying: false,
  activeSegmentId: null,
  seekTargetMs: null,
  audioBlobUrl: null,
  setCurrentTimeMs: (currentTimeMs) => set({ currentTimeMs }),
  setDurationMs: (durationMs) => set({ durationMs }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setActiveSegmentId: (activeSegmentId) => set({ activeSegmentId }),
  seekTo: (seekTargetMs) => set({ seekTargetMs, currentTimeMs: seekTargetMs }),
  clearSeekTarget: () => set({ seekTargetMs: null }),
  setAudioBlobUrl: (audioBlobUrl) => set({ audioBlobUrl })
});
