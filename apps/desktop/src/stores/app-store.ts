import { create } from "zustand";

// Each module group (see modules-registry.ts) is its own top-level nav tab —
// "geochemistry" | "espectrometria" | "petrofisica" — alongside file/data/view.
// Extend this union when a new module group ships.
export type AppNav = "hub" | "file" | "data" | "geochemistry" | "espectrometria" | "petrofisica" | "view";

interface AppState {
  activeNav: AppNav;
  analyticsServiceStatus: "unknown" | "online" | "offline";
  /** Selected tool id within the active module-group tab (see modules-registry.ts)
   * — lifted out of ModuleGroupScreen's local state so other screens (e.g. an
   * analysis result's "Open in Visualization" button) can deep-link into it. */
  activeModuleId: string | null;
  setActiveNav: (nav: AppNav) => void;
  setAnalyticsServiceStatus: (status: "unknown" | "online" | "offline") => void;
  setActiveModuleId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeNav: "geochemistry",
  analyticsServiceStatus: "unknown",
  activeModuleId: null,
  setActiveNav: (nav) => set(nav === "data" || nav === "file"
    ? { activeNav: "geochemistry", activeModuleId: "data" }
    : nav === "hub" || nav === "view"
      ? { activeNav: "geochemistry", activeModuleId: "diagrams" }
      : { activeNav: nav }),
  setAnalyticsServiceStatus: (status) =>
    set({ analyticsServiceStatus: status }),
  setActiveModuleId: (id) => set({ activeModuleId: id }),
}));
