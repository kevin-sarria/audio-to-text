import { create } from "zustand";
import { AuthSlice, createAuthSlice } from "./authSlice.js";
import { TranscriberSlice, createTranscriberSlice } from "./transcriberSlice.js";
import { HistorySlice, createHistorySlice } from "./historySlice.js";
import { UiSlice, createUiSlice } from "./uiSlice.js";
import { PlayerSlice, createPlayerSlice } from "./playerSlice.js";
import { ExportSlice, createExportSlice } from "./exportSlice.js";

export type AppStore = AuthSlice &
  TranscriberSlice &
  HistorySlice &
  UiSlice &
  PlayerSlice &
  ExportSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createAuthSlice(...a),
  ...createTranscriberSlice(...a),
  ...createHistorySlice(...a),
  ...createUiSlice(...a),
  ...createPlayerSlice(...a),
  ...createExportSlice(...a)
}));
