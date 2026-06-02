import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ExportType = "kml" | "csv" | "pdf" | "png";

export interface ExportEntry {
  id: string;
  type: ExportType;
  datasetName: string;
  filename: string;
  path: string;         // absolute path to the file
  folder: string;       // directory containing the file
  createdAt: string;    // ISO timestamp
}

interface ExportState {
  entries: ExportEntry[];
  addEntry: (entry: Omit<ExportEntry, "id">) => void;
  removeEntry: (id: string) => void;
  clearAll: () => void;
}

export const useExportStore = create<ExportState>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (entry) =>
        set((s) => ({
          entries: [
            { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
            ...s.entries,
          ].slice(0, 100), // keep at most 100 entries
        })),

      removeEntry: (id) =>
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),

      clearAll: () => set({ entries: [] }),
    }),
    {
      name: "pyorex-export-history",
    }
  )
);
