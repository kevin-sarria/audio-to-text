import { StateCreator } from "zustand";
import { ExportFormat } from "@audio-to-text/shared";

export interface ExportSlice {
  selectedFormat: ExportFormat;
  isExporting: boolean;
  exportError: string | null;
  setSelectedFormat: (format: ExportFormat) => void;
  setIsExporting: (isExporting: boolean) => void;
  setExportError: (error: string | null) => void;
}

export const createExportSlice: StateCreator<ExportSlice> = (set) => ({
  selectedFormat: ExportFormat.SRT,
  isExporting: false,
  exportError: null,
  setSelectedFormat: (selectedFormat) => set({ selectedFormat }),
  setIsExporting: (isExporting) => set({ isExporting }),
  setExportError: (exportError) => set({ exportError })
});
