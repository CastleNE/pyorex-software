import { create } from "zustand";
import type { SpatialConfig } from "@/lib/data-api";

export interface ColumnMeta {
  name: string;
  dataType: "numeric" | "categorical" | "datetime" | "text";
  unit?: string;
  nullCount: number;
  nullType?: "BELOW_LOD" | "NOT_ANALYZED" | "MISSING";
}

export interface DatasetInfo {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnMeta[];
  importedAt: string;
  spatialConfig?: SpatialConfig | null;
  iogasDisplayCols?: string[];
}

interface DatasetState {
  // Active dataset
  dataset: DatasetInfo | null;
  selectedColumn: string | null;
  hasData: boolean;
  isLoading: boolean;
  error: string | null;

  // All datasets in this session / on disk
  allDatasets: DatasetInfo[];

  // Actions
  setDataset: (dataset: DatasetInfo) => void;
  setActiveDataset: (id: string) => void;
  addDataset: (dataset: DatasetInfo) => void;
  removeDataset: (id: string) => void;
  setAllDatasets: (datasets: DatasetInfo[]) => void;
  setSelectedColumn: (column: string) => void;
  clearDataset: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useDatasetStore = create<DatasetState>((set, get) => ({
  dataset: null,
  selectedColumn: null,
  hasData: false,
  isLoading: false,
  error: null,
  allDatasets: [],

  // Import a new dataset and make it active
  setDataset: (dataset) =>
    set((s) => ({
      dataset,
      hasData: true,
      error: null,
      isLoading: false,
      selectedColumn: null,
      allDatasets: s.allDatasets.some((d) => d.id === dataset.id)
        ? s.allDatasets.map((d) => (d.id === dataset.id ? dataset : d))
        : [dataset, ...s.allDatasets],
    })),

  // Switch to an already-loaded dataset by id
  setActiveDataset: (id) => {
    const found = get().allDatasets.find((d) => d.id === id);
    if (found) set({ dataset: found, hasData: true, selectedColumn: null, error: null });
  },

  // Add to list without making active (used when loading from disk)
  addDataset: (dataset) =>
    set((s) => ({
      allDatasets: s.allDatasets.some((d) => d.id === dataset.id)
        ? s.allDatasets
        : [...s.allDatasets, dataset],
    })),

  // Remove from list; if it was active, activate the next one
  removeDataset: (id) =>
    set((s) => {
      const remaining = s.allDatasets.filter((d) => d.id !== id);
      const wasActive = s.dataset?.id === id;
      const next = wasActive ? (remaining[0] ?? null) : s.dataset;
      return {
        allDatasets: remaining,
        dataset: next,
        hasData: next !== null,
        selectedColumn: wasActive ? null : s.selectedColumn,
      };
    }),

  setAllDatasets: (datasets) =>
    set((s) => {
      // Merge: keep active dataset pointer if still present
      const active = s.dataset && datasets.some((d) => d.id === s.dataset!.id)
        ? s.dataset
        : (datasets[0] ?? null);
      return {
        allDatasets: datasets,
        dataset: active,
        hasData: active !== null,
      };
    }),

  setSelectedColumn: (column) => set({ selectedColumn: column }),

  clearDataset: () =>
    set({ dataset: null, selectedColumn: null, hasData: false, allDatasets: [] }),

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
}));
