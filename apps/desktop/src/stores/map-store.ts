/**
 * Settings of the sample map (Secciones y mapas → Mapa de muestras), remembered on this computer and saved per
 * dataset: what is mapped (value, category, labels), how it is classified and coloured, and the IDW surface.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ColorClassSettings } from '../lib/color-classes';
import type { DrillRequest, MapIdwOptions } from '../lib/maps-api';

/** Section A–A' drawn on the map (Secciones y mapas → Sección). */
export interface SectionSettings {
  start: [number, number]; end: [number, number];
  /** Total band width (m): samples within width/2 of the line are projected. */
  width: number;
  /** Vertical exaggeration of the elevation panel. */
  exaggeration: number;
  elevationColumn: string | null;
  demPath: string | null;
  drill: DrillRequest | null;
  open: boolean;
}

export interface MapSettings extends ColorClassSettings {
  /** Column or expression (Diagram Builder syntax); null = samples only. */
  value: string | null;
  category: string | null;
  label: string | null;
  showLabels: boolean;
  pointSize: number;
  includeQaqc: boolean;
  surface: boolean;
  contours: boolean;
  surfaceOpacity: number;
  idw: MapIdwOptions;
  section: SectionSettings | null;
}

export const DEFAULT_MAP: MapSettings = {
  value: null, category: null, label: null, showLabels: false, pointSize: 9, includeQaqc: false,
  surface: false, contours: true, surfaceOpacity: 0.7,
  idw: { resolution: 80, power: 2, neighbors: 12, radius: null, log: false },
  section: null,
  colorClasses: 5, colorMethod: 'quantile', colorBreaks: null, colorPercentiles: null, colorLog: false, colorBoundary: 'up',
  colorRamp: 'rainbow', colorReverse: false, colorCustom: null,
};

interface MapState {
  byDataset: Record<string, MapSettings>;
  get: (datasetId: string) => MapSettings;
  update: (datasetId: string, patch: Partial<MapSettings>) => void;
}

export const useMapStore = create<MapState>()(persist((set, get) => ({
  byDataset: {},
  get: id => ({ ...DEFAULT_MAP, ...get().byDataset[id], idw: { ...DEFAULT_MAP.idw, ...get().byDataset[id]?.idw } }),
  update: (id, patch) => set(s => ({ byDataset: { ...s.byDataset, [id]: { ...get().get(id), ...patch } } })),
}), { name: 'pyorex.map.v1', partialize: s => ({ byDataset: s.byDataset }) }));
