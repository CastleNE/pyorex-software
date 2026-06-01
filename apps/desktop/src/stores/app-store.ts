import { create } from "zustand";

type AppModule =
  | "home"
  | "data"
  | "calculation"
  | "analysis"
  | "graph"
  | "map"
  | "structure"
  | "diagram"
  | "spider"
  | "help";

interface AppState {
  activeModule: AppModule;
  analyticsServiceStatus: "unknown" | "online" | "offline";
  setActiveModule: (module: AppModule) => void;
  setAnalyticsServiceStatus: (status: "unknown" | "online" | "offline") => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: "home",
  analyticsServiceStatus: "unknown",
  setActiveModule: (module) => set({ activeModule: module }),
  setAnalyticsServiceStatus: (status) =>
    set({ analyticsServiceStatus: status }),
}));
