import { create } from "zustand";

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
}

interface DatasetState {
  dataset: DatasetInfo | null;
  selectedColumn: string | null;
  hasData: boolean;
  isLoading: boolean;
  error: string | null;
  setDataset: (dataset: DatasetInfo) => void;
  setSelectedColumn: (column: string) => void;
  clearDataset: () => void;
}

export const useDatasetStore = create<DatasetState>((set) => ({
  dataset: null,
  selectedColumn: null,
  hasData: false,
  isLoading: false,
  error: null,
  setDataset: (dataset) =>
    set({ dataset, hasData: true, error: null }),
  setSelectedColumn: (column) => set({ selectedColumn: column }),
  clearDataset: () =>
    set({ dataset: null, selectedColumn: null, hasData: false }),
}));
