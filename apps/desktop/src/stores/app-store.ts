import { create } from "zustand";

export type AppNav = "file" | "data" | "modulos" | "view";

interface AppState {
  activeNav: AppNav;
  analyticsServiceStatus: "unknown" | "online" | "offline";
  /** Selected tool id within "Módulos" (see modules-registry.ts) — lifted out
   * of ModulosScreen's local state so other screens (e.g. an analysis result's
   * "Open in Visualization" button) can deep-link into it. */
  activeModuleId: string | null;
  setActiveNav: (nav: AppNav) => void;
  setAnalyticsServiceStatus: (status: "unknown" | "online" | "offline") => void;
  setActiveModuleId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeNav: "file",
  analyticsServiceStatus: "unknown",
  activeModuleId: null,
  setActiveNav: (nav) => set({ activeNav: nav }),
  setAnalyticsServiceStatus: (status) =>
    set({ analyticsServiceStatus: status }),
  setActiveModuleId: (id) => set({ activeModuleId: id }),
}));
