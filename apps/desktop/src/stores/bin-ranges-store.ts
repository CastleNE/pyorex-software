import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { breaksProblem, percentilesProblem } from '../lib/size-classes';

/**
 * Named class limits the user can reuse across charts and variables (like ioGAS "bin ranges"): either percentiles of
 * the data (reusable for any variable) or values in a unit (e.g. Cu thresholds in ppm). Built-in ranges are fixed;
 * the user's own are kept on this computer (localStorage). Presentation only.
 */
export type BinRangeType = 'percentile' | 'value';
export interface BinRange { id: string; name: string; type: BinRangeType; breaks: number[]; unit?: string; builtin?: boolean }

export const BUILTIN_BIN_RANGES: BinRange[] = [
  { id: 'b:deciles', name: '10 rangos iguales (deciles)', type: 'percentile', breaks: [10, 20, 30, 40, 50, 60, 70, 80, 90], builtin: true },
  { id: 'b:quintiles', name: 'Quintiles', type: 'percentile', breaks: [20, 40, 60, 80], builtin: true },
  { id: 'b:quartiles', name: 'Cuartiles', type: 'percentile', breaks: [25, 50, 75], builtin: true },
  { id: 'b:anomaly', name: 'Percentiles 50-75-90-95-98', type: 'percentile', breaks: [50, 75, 90, 95, 98], builtin: true },
  { id: 'b:tails', name: 'Colas 2-10-25-50-75-90-98', type: 'percentile', breaks: [2, 10, 25, 50, 75, 90, 98], builtin: true },
];

export const BIN_RANGES_STORAGE_KEY = 'pyorex-bin-ranges';

interface BinRangesState {
  ranges: BinRange[];
  /** Saves (or replaces, same name and type) a user range. Returns its id, or null when the limits are not usable. */
  save: (name: string, type: BinRangeType, breaks: number[], unit?: string) => string | null;
  remove: (id: string) => void;
}

export const validBinRange = (type: BinRangeType, breaks: number[]) => (type === 'percentile' ? !percentilesProblem(breaks) : !breaksProblem(breaks, false));

export const useBinRangesStore = create<BinRangesState>()(
  persist(
    (set, get) => ({
      ranges: [],
      save: (name, type, breaks, unit) => {
        const clean = name.trim();
        if (!clean || !validBinRange(type, breaks)) return null;
        const existing = get().ranges.find(r => r.name.toLowerCase() === clean.toLowerCase() && r.type === type);
        const id = existing?.id ?? `u:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const range: BinRange = { id, name: clean, type, breaks: [...breaks], ...(unit ? { unit } : {}) };
        set(s => ({ ranges: existing ? s.ranges.map(r => (r.id === id ? range : r)) : [...s.ranges, range] }));
        return id;
      },
      remove: id => set(s => ({ ranges: s.ranges.filter(r => r.id !== id) })),
    }),
    {
      name: BIN_RANGES_STORAGE_KEY,
      // Drop anything malformed that may be in storage.
      merge: (persisted, current) => {
        const raw = (persisted as { ranges?: unknown })?.ranges;
        const ranges = Array.isArray(raw) ? (raw as BinRange[]).filter(r => r && typeof r.id === 'string' && typeof r.name === 'string' && (r.type === 'percentile' || r.type === 'value') && Array.isArray(r.breaks) && r.breaks.every(b => typeof b === 'number') && validBinRange(r.type, r.breaks)) : [];
        return { ...current, ranges };
      },
    },
  ),
);

export const allBinRanges = (user: BinRange[]) => [...BUILTIN_BIN_RANGES, ...user];
