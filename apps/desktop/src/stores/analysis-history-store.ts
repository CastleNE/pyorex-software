import { create } from "zustand";

/** Session-only analysis log — nothing persists server-side yet (documented
 * limitation: a future Results backend would replace this). Only ever
 * populated for the tools that actually run (descriptive-statistics,
 * correlation-analysis, principal-component-analysis). */
export interface AnalysisHistoryEntry {
  id: string;
  toolId: string;
  toolLabel: string;
  datasetId: string;
  datasetName: string;
  variables: string[];
  params: Record<string, unknown>;
  timestamp: string;
  resultSummary: string;
}

interface AnalysisHistoryState {
  entries: AnalysisHistoryEntry[];
  addEntry: (entry: Omit<AnalysisHistoryEntry, "id" | "timestamp">) => AnalysisHistoryEntry;
  removeEntry: (id: string) => void;
  duplicateEntry: (id: string) => AnalysisHistoryEntry | null;
}

export const useAnalysisHistoryStore = create<AnalysisHistoryState>((set, get) => ({
  entries: [],

  addEntry: (entry) => {
    const full: AnalysisHistoryEntry = { ...entry, id: crypto.randomUUID(), timestamp: new Date().toISOString() };
    set((s) => ({ entries: [full, ...s.entries] }));
    return full;
  },

  removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),

  duplicateEntry: (id) => {
    const original = get().entries.find((e) => e.id === id);
    if (!original) return null;
    const copy: AnalysisHistoryEntry = { ...original, id: crypto.randomUUID(), timestamp: new Date().toISOString() };
    set((s) => ({ entries: [copy, ...s.entries] }));
    return copy;
  },
}));
