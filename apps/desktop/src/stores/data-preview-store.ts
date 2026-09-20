import { create } from "zustand";

// Dock-panel lifecycle for the DATA screen's "Data Preview" grid — see
// DataPreviewPanel.tsx. In-memory/session-scoped only (consistent with
// data-ops-store.ts and app-store.ts); only export-store.ts persists to
// localStorage today. Add `persist` here later if cross-restart memory of
// the panel's size/position is wanted.

export type PreviewStatus = "docked" | "floating" | "minimized" | "closed";

export interface FloatingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_DOCKED_HEIGHT = 160;
export const MIN_FLOATING_WIDTH = 360;
export const MIN_FLOATING_HEIGHT = 200;
export const DOCK_ZONE_PX = 60;
export const TITLE_BAR_HEIGHT = 34;

const DEFAULT_DOCKED_HEIGHT = 360;
const DEFAULT_FLOATING_RECT: FloatingRect = { x: 60, y: 60, width: 720, height: 460 };

interface DataPreviewState {
  status: PreviewStatus;
  previousStatus: "docked" | "floating";
  dockedHeight: number;
  floatingRect: FloatingRect;

  open: () => void;
  close: () => void;
  minimize: () => void;
  restore: () => void;
  dock: (heightHint?: number) => void;
  undock: (rect: FloatingRect) => void;
  setDockedHeight: (h: number) => void;
  setFloatingRect: (r: FloatingRect) => void;
  resetForNewDataset: () => void;
}

export const useDataPreviewStore = create<DataPreviewState>((set, get) => ({
  status: "docked",
  previousStatus: "docked",
  dockedHeight: DEFAULT_DOCKED_HEIGHT,
  floatingRect: DEFAULT_FLOATING_RECT,

  open: () => {
    const { status, previousStatus } = get();
    if (status === "closed") set({ status: "docked" });
    else if (status === "minimized") set({ status: previousStatus });
    // else already visible (docked/floating) — no-op, it's already on screen
  },

  close: () => set({ status: "closed" }),

  minimize: () => {
    const { status } = get();
    if (status !== "docked" && status !== "floating") return;
    set({ status: "minimized", previousStatus: status });
  },

  restore: () => set((s) => ({ status: s.previousStatus })),

  dock: (heightHint) =>
    set((s) => ({
      status: "docked",
      previousStatus: "docked",
      dockedHeight:
        heightHint !== undefined ? Math.max(MIN_DOCKED_HEIGHT, heightHint) : s.dockedHeight,
    })),

  undock: (rect) =>
    set({
      status: "floating",
      previousStatus: "floating",
      floatingRect: rect,
    }),

  setDockedHeight: (h) => set({ dockedHeight: Math.max(MIN_DOCKED_HEIGHT, h) }),
  setFloatingRect: (r) => set({ floatingRect: r }),

  resetForNewDataset: () => set({ status: "docked" }),
}));
