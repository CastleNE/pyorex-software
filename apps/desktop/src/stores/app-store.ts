import { create } from "zustand";

export type AppNav = "file" | "data" | "modulos" | "view";

interface AppState {
  activeNav: AppNav;
  analyticsServiceStatus: "unknown" | "online" | "offline";
  setActiveNav: (nav: AppNav) => void;
  setAnalyticsServiceStatus: (status: "unknown" | "online" | "offline") => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeNav: "file",
  analyticsServiceStatus: "unknown",
  setActiveNav: (nav) => set({ activeNav: nav }),
  setAnalyticsServiceStatus: (status) =>
    set({ analyticsServiceStatus: status }),
}));
