import { StateCreator } from "zustand";

export interface UiSlice {
  isSidebarOpen: boolean;
  notification: {
    message: string;
    type: "success" | "error" | "info" | "warning";
  } | null;
  toggleSidebar: () => void;
  showNotification: (
    message: string,
    type?: "success" | "error" | "info" | "warning"
  ) => void;
  clearNotification: () => void;
}

export const createUiSlice: StateCreator<UiSlice> = (set) => ({
  isSidebarOpen: false,
  notification: null,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  showNotification: (message, type = "info") =>
    set({ notification: { message, type } }),
  clearNotification: () => set({ notification: null })
});
