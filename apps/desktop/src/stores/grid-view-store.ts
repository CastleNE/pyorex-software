import { create } from 'zustand';

/**
 * View options of «Tabla y preparación» shared by the grid, the column profile and the toolbar (the profile shows
 * the same rows as the grid).
 */
interface GridViewState {
  /** Show only the rows selected in the chart windows. */
  onlySelection: boolean;
  setOnlySelection: (on: boolean) => void;
  /** Column profile strip expanded (remembered on this computer). */
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;
}

const KEY = 'pyorex.grid.profileOpen';
const initialOpen = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };

export const useGridView = create<GridViewState>(set => ({
  onlySelection: false,
  setOnlySelection: on => set({ onlySelection: on }),
  profileOpen: initialOpen(),
  setProfileOpen: open => { try { localStorage.setItem(KEY, open ? '1' : '0'); } catch { /* storage unavailable */ } set({ profileOpen: open }); },
}));
