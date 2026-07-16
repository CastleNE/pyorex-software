import { create } from "zustand";
import type { SpectralProjectMeta } from "@/lib/spectrometry-api";

interface SpectrometryState {
  activeProject: SpectralProjectMeta | null;
  hasProject: boolean;
  selectedSampleId: string | null;
  selectedSpectrumId: string | null;

  setActiveProject: (project: SpectralProjectMeta) => void;
  clearActiveProject: () => void;
  setSelectedSample: (sampleId: string | null) => void;
  setSelectedSpectrum: (spectrumId: string | null) => void;
}

/** Spectrometry is its OWN project concept, independent of dataset-store.ts's
 * tabular "active dataset" — a spectral project is a relational unit
 * (Samples/Spectra/Features/Interpretations), not a single dataframe. */
export const useSpectrometryStore = create<SpectrometryState>((set) => ({
  activeProject: null,
  hasProject: false,
  selectedSampleId: null,
  selectedSpectrumId: null,

  setActiveProject: (project) => set({ activeProject: project, hasProject: true }),
  clearActiveProject: () => set({ activeProject: null, hasProject: false, selectedSampleId: null, selectedSpectrumId: null }),
  setSelectedSample: (sampleId) => set({ selectedSampleId: sampleId }),
  setSelectedSpectrum: (spectrumId) => set({ selectedSpectrumId: spectrumId }),
}));
