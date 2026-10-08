import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sanitizeDef, type DiagramDef } from '../lib/custom-diagrams';
import type { AreaId } from '../lib/geochem-areas';

/**
 * The user's diagram library (Diagram Builder, phase 4). Kept on this computer (localStorage) and saved inside .orex
 * projects (lib/project-state.ts) so a project opened elsewhere brings its diagrams. Also holds which builder/library
 * dialog is open.
 */
export const DIAGRAMS_STORAGE_KEY = 'pyorex.diagrams.v1';

export type DiagramDialog = { mode: 'closed' } | { mode: 'builder'; area: AreaId; editing: DiagramDef | null } | { mode: 'library' };

interface DiagramLibraryState {
  diagrams: DiagramDef[];
  dialog: DiagramDialog;
  /** Window where the user is drawing a new classification field with the lasso (null: not drawing). */
  drawing: string | null;
  setDrawing: (windowId: string | null) => void;
  /** Adds or replaces (same spec id) a diagram; returns the stored version. */
  save: (def: DiagramDef) => DiagramDef;
  remove: (id: string) => void;
  /** Adds diagrams from a file or a project; same id replaces. Returns how many were added and replaced. */
  merge: (defs: DiagramDef[]) => { added: number; replaced: number };
  openBuilder: (area: AreaId, editing?: DiagramDef | null) => void;
  openLibrary: () => void;
  closeDialog: () => void;
}

export const useDiagramLibrary = create<DiagramLibraryState>()(
  persist(
    (set, get) => ({
      diagrams: [],
      dialog: { mode: 'closed' },
      drawing: null,
      setDrawing: windowId => set({ drawing: windowId }),
      save: def => {
        const stored = { ...def, updated: new Date().toISOString() };
        set(s => ({ diagrams: s.diagrams.some(d => d.spec.id === def.spec.id) ? s.diagrams.map(d => (d.spec.id === def.spec.id ? stored : d)) : [...s.diagrams, stored] }));
        return stored;
      },
      remove: id => set(s => ({ diagrams: s.diagrams.filter(d => d.spec.id !== id) })),
      merge: defs => {
        let added = 0, replaced = 0;
        const next = [...get().diagrams];
        for (const def of defs) {
          const k = next.findIndex(d => d.spec.id === def.spec.id);
          if (k < 0) { next.push(def); added++; } else if (JSON.stringify(next[k]) !== JSON.stringify(def)) { next[k] = def; replaced++; }
        }
        set({ diagrams: next });
        return { added, replaced };
      },
      openBuilder: (area, editing = null) => set({ dialog: { mode: 'builder', area, editing } }),
      openLibrary: () => set({ dialog: { mode: 'library' } }),
      closeDialog: () => set({ dialog: { mode: 'closed' } }),
    }),
    {
      name: DIAGRAMS_STORAGE_KEY,
      partialize: s => ({ diagrams: s.diagrams }),
      merge: (persisted, current) => {
        const raw = (persisted as { diagrams?: unknown })?.diagrams;
        return { ...current, diagrams: Array.isArray(raw) ? raw.map(sanitizeDef).filter((d): d is DiagramDef => !!d) : [] };
      },
    },
  ),
);
