import { create } from "zustand";
import type { ColumnOperation, ImportedDatasetMeta, OverlayState, RowFilter, RowSort } from "@/lib/data-api";
import { applyOperation, getOperations, redoOperation, saveChanges, undoOperation } from "@/lib/data-api";

interface ViewState {
  filters: RowFilter[];
  sort: RowSort | null;
}

const EMPTY_VIEW: ViewState = { filters: [], sort: null };

interface DataOpsState {
  viewByDataset: Record<string, ViewState>;
  overlayByDataset: Record<string, OverlayState>;
  /** Bumped after apply/undo/redo/save so DataGrid's fetch effect re-runs and
   * picks up the latest column list / hidden columns from data.rows. */
  versionByDataset: Record<string, number>;
  /** Column the toolbar's "Filter" button wants the grid to open a menu for. */
  openFilterColumn: string | null;

  getView: (datasetId: string) => ViewState;
  getOverlay: (datasetId: string) => OverlayState | undefined;
  getVersion: (datasetId: string) => number;

  setFilters: (datasetId: string, filters: RowFilter[]) => void;
  setSort: (datasetId: string, sort: RowSort | null) => void;
  clearFilters: (datasetId: string) => void;
  openFilterColumnFor: (column: string | null) => void;

  loadOverlay: (datasetId: string) => Promise<void>;
  applyOp: (datasetId: string, operation: ColumnOperation) => Promise<void>;
  undo: (datasetId: string) => Promise<void>;
  redo: (datasetId: string) => Promise<void>;
  save: (datasetId: string) => Promise<ImportedDatasetMeta>;
  refresh: (datasetId: string) => void;
}

function bump(state: DataOpsState, datasetId: string) {
  return { versionByDataset: { ...state.versionByDataset, [datasetId]: (state.versionByDataset[datasetId] ?? 0) + 1 } };
}

export const useDataOpsStore = create<DataOpsState>((set, get) => ({
  viewByDataset: {},
  overlayByDataset: {},
  versionByDataset: {},
  openFilterColumn: null,

  getView: (datasetId) => get().viewByDataset[datasetId] ?? EMPTY_VIEW,
  getOverlay: (datasetId) => get().overlayByDataset[datasetId],
  getVersion: (datasetId) => get().versionByDataset[datasetId] ?? 0,

  setFilters: (datasetId, filters) =>
    set((s) => ({ viewByDataset: { ...s.viewByDataset, [datasetId]: { ...(s.viewByDataset[datasetId] ?? EMPTY_VIEW), filters } } })),

  setSort: (datasetId, sort) =>
    set((s) => ({ viewByDataset: { ...s.viewByDataset, [datasetId]: { ...(s.viewByDataset[datasetId] ?? EMPTY_VIEW), sort } } })),

  clearFilters: (datasetId) =>
    set((s) => ({ viewByDataset: { ...s.viewByDataset, [datasetId]: { ...(s.viewByDataset[datasetId] ?? EMPTY_VIEW), filters: [] } } })),

  openFilterColumnFor: (column) => set({ openFilterColumn: column }),

  loadOverlay: async (datasetId) => {
    const overlay = await getOperations(datasetId);
    set((s) => ({ overlayByDataset: { ...s.overlayByDataset, [datasetId]: overlay } }));
  },

  applyOp: async (datasetId, operation) => {
    const overlay = await applyOperation(datasetId, operation);
    set((s) => ({ overlayByDataset: { ...s.overlayByDataset, [datasetId]: overlay }, ...bump(s, datasetId) }));
  },

  undo: async (datasetId) => {
    const overlay = await undoOperation(datasetId);
    set((s) => ({ overlayByDataset: { ...s.overlayByDataset, [datasetId]: overlay }, ...bump(s, datasetId) }));
  },

  redo: async (datasetId) => {
    const overlay = await redoOperation(datasetId);
    set((s) => ({ overlayByDataset: { ...s.overlayByDataset, [datasetId]: overlay }, ...bump(s, datasetId) }));
  },

  save: async (datasetId) => {
    const { dataset } = await saveChanges(datasetId);
    set((s) => {
      const { [datasetId]: _overlay, ...restOverlay } = s.overlayByDataset;
      const { [datasetId]: _view, ...restView } = s.viewByDataset;
      return { overlayByDataset: restOverlay, viewByDataset: restView };
    });
    return dataset;
  },

  refresh: (datasetId) => set((s) => bump(s, datasetId)),
}));
