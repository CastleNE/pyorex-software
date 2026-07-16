/**
 * Typed helpers for the spectrometry.* RPC methods (see
 * services/analytics/app/routers/spectrometry_rpc.py and
 * packages/ipc-contracts/spectrometry/*.v1.json).
 */
import { callRpc } from "./rpc";

// ── Project ───────────────────────────────────────────────────────────────────

export interface SpectralProjectMeta {
  id: string;
  name: string;
  workflow_type: "native" | "processed_table" | "mixed";
  created_at: string;
  sample_count: number;
  spectra_count: number;
  instrument_summary: Record<string, unknown>;
  custom_feature_presets: Record<string, FeaturePreset>;
  custom_index_presets: Record<string, IndexPreset>;
  pipeline_presets: Record<string, PreprocessingOp[]>;
}

export function createProject(name: string, workflowType: "native" | "processed_table" | "mixed" = "native"): Promise<{ project: SpectralProjectMeta }> {
  return callRpc("spectrometry.project.create", { name, workflow_type: workflowType });
}
export function listProjects(): Promise<{ projects: SpectralProjectMeta[] }> {
  return callRpc("spectrometry.project.list", {});
}
export function getProject(projectId: string): Promise<{ project: SpectralProjectMeta }> {
  return callRpc("spectrometry.project.get", { project_id: projectId });
}
export function deleteProject(projectId: string): Promise<{ deleted: boolean }> {
  return callRpc("spectrometry.project.delete", { project_id: projectId });
}

// ── Import ────────────────────────────────────────────────────────────────────

export interface RawSpectrumDto {
  filename: string;
  original_path: string;
  format: string;
  instrument: string | null;
  wavelength: number[];
  reflectance: number[];
  acquisition_date: string | null;
  metadata: Record<string, unknown>;
  warnings: string[];
}

export function previewSpectralFile(filePath: string): Promise<{ available: boolean; reason?: string; spectrum?: RawSpectrumDto }> {
  return callRpc("spectrometry.import.preview_file", { file_path: filePath });
}

export interface ImportedSpectrumSummary {
  filename: string;
  spectrum_id: string;
  sample_id: string;
  warnings: string[];
}
export interface ImportFailure {
  path: string;
  reason: string;
}
export function importNativeSpectra(
  projectId: string,
  paths: string[],
  recursive = true,
  sampleIdMap?: Record<string, string>
): Promise<{ imported: ImportedSpectrumSummary[]; failures: ImportFailure[]; n_imported: number; n_failed: number }> {
  return callRpc("spectrometry.import.native_spectra", { project_id: projectId, paths, recursive, sample_id_map: sampleIdMap ?? {} });
}

export function previewProcessedTable(filePath: string): Promise<{ columns: { name: string; sample_values: string[] }[]; preview_rows: Record<string, unknown>[]; total_rows: number }> {
  return callRpc("spectrometry.import.processed_table_preview", { file_path: filePath });
}

export const PROCESSED_TABLE_FIELDS = [
  "Sample ID", "Drillhole ID", "Project", "Prospect", "Date", "Instrument",
  "Easting", "Northing", "Elevation", "Longitude", "Latitude",
  "From", "To", "Depth", "Sample Length",
  "Primary Mineral", "Secondary Mineral", "Mineral Group", "White Mica Type", "Chlorite Type", "Clay Type", "Mineral Assemblage",
  "Absorption Wavelength", "Absorption Depth", "Absorption Width", "Absorption Area",
  "Al-OH", "Mg-OH", "Fe-OH", "H2O", "OH", "Quality Score", "Match Score",
] as const;
export type ProcessedTableField = (typeof PROCESSED_TABLE_FIELDS)[number];

export function importProcessedTable(
  projectId: string,
  filePath: string,
  columnMapping: Partial<Record<ProcessedTableField, string>>
): Promise<{ n_samples: number; n_interpretations: number; n_indices: number }> {
  return callRpc("spectrometry.import.processed_table", { project_id: projectId, file_path: filePath, column_mapping: columnMapping });
}

export function listMappingPresets(): Promise<{ presets: Record<string, Partial<Record<ProcessedTableField, string>>> }> {
  return callRpc("spectrometry.import.mapping_presets.list", {});
}
export function upsertMappingPreset(name: string, mapping: Partial<Record<ProcessedTableField, string>>) {
  return callRpc("spectrometry.import.mapping_presets.upsert", { name, mapping });
}

// ── Browsing ──────────────────────────────────────────────────────────────────

export interface SpectralSample {
  sample_id: string;
  drillhole_id: string | null;
  from_m: number | null;
  to_m: number | null;
  easting: number | null;
  northing: number | null;
  lithology: string | null;
  alteration: string | null;
  spectra_count: number;
}
export function listSamples(projectId: string): Promise<{ samples: SpectralSample[]; total: number }> {
  return callRpc("spectrometry.samples.list", { project_id: projectId });
}

export interface SpectrumFeature {
  feature_id: string;
  spectrum_id: string;
  preset_name: string;
  center: number | null;
  depth: number | null;
  width_fwhm: number | null;
  area: number | null;
  asymmetry: number | null;
  quality_indicator: string;
}
export interface SpectrumInterpretation {
  interpretation_id: string;
  sample_id: string;
  spectrum_id: string | null;
  primary_mineral: string | null;
  secondary_mineral: string | null;
  mineral_group: string | null;
  state: "suggested" | "interpreted" | "confirmed";
  method: string;
  confidence: number | null;
  comment: string | null;
  created_by: string;
  created_at: string;
}
export interface SpectrumDetail {
  available: boolean;
  reason?: string;
  spectrum_id?: string;
  sample_id?: string;
  instrument?: string | null;
  format?: string;
  original_filename?: string;
  raw_wavelength?: number[];
  raw_reflectance?: number[];
  processed_wavelength?: number[];
  processed_reflectance?: number[];
  applied_processing_steps?: string[];
  quality_status?: string;
  quality_score?: number | null;
  import_warnings?: string[];
  features?: SpectrumFeature[];
  interpretations?: SpectrumInterpretation[];
}
export function getSpectrum(projectId: string, spectrumId: string): Promise<SpectrumDetail> {
  return callRpc("spectrometry.spectra.get", { project_id: projectId, spectrum_id: spectrumId });
}
export function listSpectraForSample(projectId: string, sampleId: string): Promise<{ spectra: Record<string, unknown>[] }> {
  return callRpc("spectrometry.spectra.list_for_sample", { project_id: projectId, sample_id: sampleId });
}

// ── Preprocessing ─────────────────────────────────────────────────────────────

export type PreprocessingOpType =
  | "remove_invalid_values" | "select_range" | "remove_bands" | "interpolate_gaps" | "smooth" | "normalize"
  | "baseline_correct" | "continuum_remove" | "reflectance_to_absorbance" | "absorbance_to_reflectance"
  | "derivative" | "correct_splice" | "resample";

export interface PreprocessingOp {
  type: PreprocessingOpType;
  params: Record<string, unknown>;
}
export type PreprocessingScope = { all: true } | { spectrum_ids: string[] };

export interface OverlayEntry {
  id: string;
  type: PreprocessingOpType;
  params: Record<string, unknown>;
  scope: PreprocessingScope;
  applied_at: string;
}
export interface SpectralOverlayState {
  project_id: string;
  ops: OverlayEntry[];
  redo_stack: OverlayEntry[];
  history: { op_id: string; action: string; at: string }[];
}

export function previewPreprocessing(projectId: string, spectrumId: string, opType: PreprocessingOpType, params: Record<string, unknown>) {
  return callRpc("spectrometry.preprocessing.preview", { project_id: projectId, spectrum_id: spectrumId, op_type: opType, params }) as Promise<{
    available: boolean; reason?: string; wavelength?: number[]; reflectance?: number[];
  }>;
}
export function applyPreprocessingOp(projectId: string, opType: PreprocessingOpType, params: Record<string, unknown>, scope: PreprocessingScope): Promise<SpectralOverlayState> {
  return callRpc("spectrometry.preprocessing.apply_operation", { project_id: projectId, op_type: opType, params, scope });
}
export function undoPreprocessing(projectId: string): Promise<SpectralOverlayState> {
  return callRpc("spectrometry.preprocessing.undo_operation", { project_id: projectId });
}
export function redoPreprocessing(projectId: string): Promise<SpectralOverlayState> {
  return callRpc("spectrometry.preprocessing.redo_operation", { project_id: projectId });
}
export function getPreprocessingOps(projectId: string): Promise<SpectralOverlayState> {
  return callRpc("spectrometry.preprocessing.get_operations", { project_id: projectId });
}

// ── Quality ───────────────────────────────────────────────────────────────────

export interface SpectralQualityReport {
  project_id: string;
  checks: Record<string, Record<string, unknown>[]>;
  per_spectrum: { spectrum_id: string; status: string; score: number; reasons: string[] }[];
}
export function getSpectralQualityReport(projectId: string): Promise<SpectralQualityReport> {
  return callRpc("spectrometry.quality.report", { project_id: projectId });
}
export function setSpectrumQualityStatus(projectId: string, spectrumId: string, status: string, reason: string) {
  return callRpc("spectrometry.quality.set_status", { project_id: projectId, spectrum_id: spectrumId, status, reason });
}

// ── Features ──────────────────────────────────────────────────────────────────

export interface FeaturePreset {
  window: [number, number];
  continuum_method: "convex_hull" | "linear";
  label: string;
}
export function listFeaturePresets(projectId: string): Promise<{ presets: Record<string, FeaturePreset> }> {
  return callRpc("spectrometry.features.presets.list", { project_id: projectId });
}
export function extractFeatures(
  projectId: string,
  spectrumIds: string[],
  opts: { presetName?: string; window?: [number, number]; continuumMethod?: "convex_hull" | "linear" }
): Promise<{ results: SpectrumFeature[]; failures: { spectrum_id: string; reason: string }[] }> {
  return callRpc("spectrometry.features.extract", {
    project_id: projectId, spectrum_ids: spectrumIds,
    preset_name: opts.presetName, window: opts.window, continuum_method: opts.continuumMethod ?? "convex_hull",
  });
}
export function listFeatures(projectId: string, spectrumId?: string): Promise<{ features: SpectrumFeature[] }> {
  return callRpc("spectrometry.features.list", { project_id: projectId, spectrum_id: spectrumId });
}

// ── Indices ───────────────────────────────────────────────────────────────────

export interface IndexPreset {
  formula: string;
  unit?: string;
  reference?: string;
}
export function listIndexPresets(projectId: string): Promise<{ presets: Record<string, IndexPreset> }> {
  return callRpc("spectrometry.indices.presets.list", { project_id: projectId });
}
export function previewIndexFormula(projectId: string, spectrumId: string, formula: string): Promise<{ available: boolean; value: number }> {
  return callRpc("spectrometry.indices.preview_formula", { project_id: projectId, spectrum_id: spectrumId, formula });
}
export interface SpectralIndexResult {
  index_id: string;
  spectrum_id: string;
  sample_id: string;
  index_name: string;
  formula: string | null;
  result: number;
  unit: string | null;
  reference: string | null;
  quality_indicator: string;
}
export function computeIndices(
  projectId: string,
  spectrumIds: string[],
  opts: { indexName?: string; formula?: string; unit?: string; reference?: string }
): Promise<{ results: SpectralIndexResult[]; failures: { spectrum_id: string; reason: string }[] }> {
  return callRpc("spectrometry.indices.compute", {
    project_id: projectId, spectrum_ids: spectrumIds,
    index_name: opts.indexName, formula: opts.formula, unit: opts.unit, reference: opts.reference,
  });
}
export function saveIndexPreset(projectId: string, name: string, formula: string, unit?: string, reference?: string) {
  return callRpc("spectrometry.indices.presets.save", { project_id: projectId, name, formula, unit, reference });
}
export function listIndices(projectId: string, spectrumId?: string): Promise<{ indices: SpectralIndexResult[] }> {
  return callRpc("spectrometry.indices.list", { project_id: projectId, spectrum_id: spectrumId });
}

// ── Interpretation ────────────────────────────────────────────────────────────

export function createManualInterpretation(
  projectId: string,
  sampleId: string,
  opts: {
    spectrumId?: string; primaryMineral?: string; secondaryMineral?: string; mineralGroup?: string;
    assemblageName?: string; confidence?: number; comment?: string; state?: "suggested" | "interpreted" | "confirmed";
  }
): Promise<{ interpretation_id: string }> {
  return callRpc("spectrometry.interpretation.create_manual", {
    project_id: projectId, sample_id: sampleId, spectrum_id: opts.spectrumId,
    primary_mineral: opts.primaryMineral, secondary_mineral: opts.secondaryMineral, mineral_group: opts.mineralGroup,
    assemblage_name: opts.assemblageName, confidence: opts.confidence, comment: opts.comment, state: opts.state ?? "interpreted",
  });
}

export interface InterpretationRule {
  id: string;
  mineral: string;
  mineral_group?: string;
  conditions: { feature_preset: string; param: string; op: string; value: unknown }[];
  match_all: boolean;
}
export function listRules(projectId: string): Promise<{ rules: InterpretationRule[] }> {
  return callRpc("spectrometry.interpretation.rules.list", { project_id: projectId });
}
export function upsertRule(projectId: string, rule: InterpretationRule): Promise<{ rule: InterpretationRule }> {
  return callRpc("spectrometry.interpretation.rules.upsert", { project_id: projectId, rule });
}
export function applyRules(projectId: string, spectrumId: string): Promise<{ matched_rules: InterpretationRule[]; interpretation_ids: string[] }> {
  return callRpc("spectrometry.interpretation.apply_rules", { project_id: projectId, spectrum_id: spectrumId });
}

export interface ReferenceSpectrumSummary {
  reference_id: string;
  name: string;
  mineral_label: string;
  source: string;
  added_at: string;
}
export function listReferenceLibrary(projectId: string): Promise<{ references: ReferenceSpectrumSummary[] }> {
  return callRpc("spectrometry.interpretation.library.list", { project_id: projectId });
}
export function upsertReferenceSpectrum(projectId: string, name: string, mineralLabel: string, wavelength: number[], reflectance: number[], source = "imported") {
  return callRpc("spectrometry.interpretation.library.upsert", { project_id: projectId, name, mineral_label: mineralLabel, wavelength, reflectance, source });
}

export interface LibraryMatchResult {
  reference_id: string;
  name: string;
  mineral_label: string;
  angle_radians: number;
  match_score: number;
}
export function libraryMatch(projectId: string, spectrumId: string, region?: [number, number]): Promise<{ available: boolean; reason?: string; matches?: LibraryMatchResult[] }> {
  return callRpc("spectrometry.interpretation.library_match", { project_id: projectId, spectrum_id: spectrumId, region });
}
export function acceptLibraryMatch(projectId: string, spectrumId: string, match: LibraryMatchResult, region: [number, number]): Promise<{ interpretation_id: string }> {
  return callRpc("spectrometry.interpretation.accept_match", { project_id: projectId, spectrum_id: spectrumId, match, region });
}

export function confirmInterpretation(
  projectId: string,
  interpretationId: string,
  newState: "suggested" | "interpreted" | "confirmed",
  opts: { fieldOverrides?: Record<string, unknown>; editedBy?: string; reason?: string } = {}
): Promise<{ interpretation_id: string }> {
  return callRpc("spectrometry.interpretation.confirm", {
    project_id: projectId, interpretation_id: interpretationId, new_state: newState,
    field_overrides: opts.fieldOverrides, edited_by: opts.editedBy ?? "user", reason: opts.reason,
  });
}
export function listCurrentInterpretations(projectId: string, sampleId?: string): Promise<{ interpretations: SpectrumInterpretation[] }> {
  return callRpc("spectrometry.interpretation.list", { project_id: projectId, sample_id: sampleId });
}
export function getInterpretationHistory(projectId: string, sampleId: string): Promise<{ history: SpectrumInterpretation[] }> {
  return callRpc("spectrometry.interpretation.history", { project_id: projectId, sample_id: sampleId });
}

// ── Specialized: White Mica / Chlorite ───────────────────────────────────────

export interface PopulationResult {
  sample_id: string;
  drillhole_id: string | null;
  from_m: number | null;
  to_m: number | null;
  spectrum_id: string;
  diagnostic_position: number | null;
  spectral_class: string | null;
  depth: number | null;
  quality_indicator: string;
}
export function analyzeWhiteMica(projectId: string, presetName = "AlOH_2200"): Promise<{ results: PopulationResult[] }> {
  return callRpc("spectrometry.white_mica.analyze", { project_id: projectId, preset_name: presetName });
}
export function analyzeChlorite(projectId: string, presetName = "MgOH_2320"): Promise<{ results: PopulationResult[] }> {
  return callRpc("spectrometry.chlorite.analyze", { project_id: projectId, preset_name: presetName });
}

// ── Spectral Log ──────────────────────────────────────────────────────────────

export function getSpectralLogData(projectId: string, drillholeIds?: string[]) {
  return callRpc("spectrometry.log.data", { project_id: projectId, drillhole_ids: drillholeIds }) as Promise<{
    samples: SpectralSample[]; interpretations: SpectrumInterpretation[]; indices: SpectralIndexResult[];
    quality: { sample_id: string; quality_status: string; quality_score: number | null }[];
  }>;
}

// ── Export ────────────────────────────────────────────────────────────────────

export function exportSpectralTable(projectId: string, tableName: string, format: "csv" | "json" = "csv"): Promise<{ path: string }> {
  return callRpc("spectrometry.export.table", { project_id: projectId, table_name: tableName, format });
}
export function exportToDataset(projectId: string): Promise<{ dataset_id: string }> {
  return callRpc("spectrometry.export.to_dataset", { project_id: projectId });
}
