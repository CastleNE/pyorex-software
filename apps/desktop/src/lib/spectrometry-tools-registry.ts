// Categorized catalog for the "Spectrometry" module — same status:"active"|
// "planned" convention as analysis-tools-registry.ts. Several cards are
// deliberate ALIASES into the same underlying window (not 26 bespoke tools):
// Instrument Metadata/Duplicate Samples/Invalid Spectra/Processing History
// are tabs of Spectrum Quality; Hydration Parameters is a filtered view of
// Spectral Indices; Library Matching is a tab of Mineral Interpretation;
// Import Spectral Table/Import Folder are modes of the Import Native Spectra
// wizard. `target` identifies which window/tool actually opens.

export type SpectrometryCategory =
  | "Import"
  | "Spectral Analysis"
  | "Geological Interpretation"
  | "Quality Control"
  | "Results";

export const SPECTROMETRY_CATEGORIES: SpectrometryCategory[] = [
  "Import",
  "Spectral Analysis",
  "Geological Interpretation",
  "Quality Control",
  "Results",
];

export type SpectrometryTarget =
  | "import-native" | "import-processed" | "recent-projects"
  | "viewer" | "preprocessing" | "feature-extraction" | "indices" | "interpretation"
  | "white-mica" | "chlorite" | "spectral-log"
  | "quality" | "interpretation-table" | "export";

export interface SpectrometryTool {
  id: string;
  label: string;
  category: SpectrometryCategory;
  status: "active" | "planned";
  target: SpectrometryTarget;
  description?: string;
  /** Extra param passed to the target window (e.g. a Quality tab name, an Indices preset filter). */
  targetParams?: Record<string, string>;
}

export const SPECTROMETRY_TOOLS: SpectrometryTool[] = [
  // ── Import ──────────────────────────────────────────────────────────────
  { id: "import-native-spectra", label: "Import Native Spectra", category: "Import", status: "active", target: "import-native", description: "ASD (experimental) / SED (experimental) / ASCII / TXT / CSV — single file, multiple files, or a whole folder." },
  { id: "import-spectral-table", label: "Import Spectral Table", category: "Import", status: "active", target: "import-native", targetParams: { mode: "table" }, description: "Wide CSV/TXT table: one wavelength column + many spectrum columns." },
  { id: "import-processed-results", label: "Import Processed Results", category: "Import", status: "active", target: "import-processed", description: "CSV/Excel already interpreted by TSG/EZ-ID — column mapping wizard." },
  { id: "import-folder", label: "Import Folder", category: "Import", status: "active", target: "import-native", targetParams: { mode: "folder" }, description: "Recursive folder import of native spectra." },
  { id: "recent-spectral-projects", label: "Recent Spectral Projects", category: "Import", status: "active", target: "recent-projects" },

  // ── Spectral Analysis ───────────────────────────────────────────────────
  { id: "spectral-viewer", label: "Spectral Viewer", category: "Spectral Analysis", status: "active", target: "viewer", description: "Wavelength vs reflectance — overlay, stack, original vs processed." },
  { id: "spectral-preprocessing", label: "Spectral Preprocessing", category: "Spectral Analysis", status: "active", target: "preprocessing", description: "Non-destructive ops: range/bands/smoothing/continuum removal/derivatives/resampling." },
  { id: "feature-extraction", label: "Feature Extraction", category: "Spectral Analysis", status: "active", target: "feature-extraction" },
  { id: "spectral-indices", label: "Spectral Indices", category: "Spectral Analysis", status: "active", target: "indices", description: "Al-OH/Mg-OH/Fe-OH/H2O/OH + custom formula editor." },
  { id: "mineral-interpretation", label: "Mineral Interpretation", category: "Spectral Analysis", status: "active", target: "interpretation" },
  { id: "library-matching", label: "Library Matching", category: "Spectral Analysis", status: "active", target: "interpretation", targetParams: { tab: "library" }, description: "Spectral Angle Mapper comparison against project reference spectra." },

  // ── Geological Interpretation ──────────────────────────────────────────
  { id: "mineral-assemblages", label: "Mineral Assemblages", category: "Geological Interpretation", status: "planned", target: "interpretation-table", description: "Free-form mineral/index/lithology combination builder — Coming soon. (assemblage_name already exists as a free-text field on interpretations, so manual tagging works today even without a dedicated builder.)" },
  { id: "white-mica-analysis", label: "White Mica Analysis", category: "Geological Interpretation", status: "active", target: "white-mica" },
  { id: "chlorite-analysis", label: "Chlorite Analysis", category: "Geological Interpretation", status: "active", target: "chlorite" },
  { id: "clay-mineral-analysis", label: "Clay Mineral Analysis", category: "Geological Interpretation", status: "planned", target: "interpretation-table", description: "Needs multi-doublet discrimination (e.g. kaolinite's 2160/2180 nm pair) — Coming soon." },
  { id: "hydration-parameters", label: "Hydration Parameters", category: "Geological Interpretation", status: "active", target: "indices", targetParams: { filter: "hydration" } },
  { id: "spectral-logging", label: "Spectral Logging", category: "Geological Interpretation", status: "active", target: "spectral-log" },

  // ── Quality Control ─────────────────────────────────────────────────────
  { id: "spectrum-quality", label: "Spectrum Quality", category: "Quality Control", status: "active", target: "quality" },
  { id: "instrument-metadata", label: "Instrument Metadata", category: "Quality Control", status: "active", target: "quality", targetParams: { tab: "metadata" } },
  { id: "duplicate-samples", label: "Duplicate Samples", category: "Quality Control", status: "active", target: "quality", targetParams: { tab: "duplicates" } },
  { id: "invalid-spectra", label: "Invalid Spectra", category: "Quality Control", status: "active", target: "quality", targetParams: { tab: "invalid" } },
  { id: "processing-history", label: "Processing History", category: "Quality Control", status: "active", target: "preprocessing", targetParams: { tab: "history" } },

  // ── Results ─────────────────────────────────────────────────────────────
  { id: "interpretation-table", label: "Interpretation Table", category: "Results", status: "active", target: "interpretation-table" },
  { id: "spectral-logs", label: "Spectral Logs", category: "Results", status: "active", target: "spectral-log" },
  { id: "saved-analyses", label: "Saved Analyses", category: "Results", status: "planned", target: "interpretation-table", description: "Needs a persistence layer beyond this pass's scope — Coming soon." },
  { id: "export-results", label: "Export Results", category: "Results", status: "active", target: "export" },
];

export function toolsByCategory(category: SpectrometryCategory): SpectrometryTool[] {
  return SPECTROMETRY_TOOLS.filter((t) => t.category === category);
}
