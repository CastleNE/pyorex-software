/**
 * Typed helpers for the data.* RPC methods (import, preview, rows, list, export_kml).
 */
import { callRpc } from "./rpc";

// ── Spatial types ─────────────────────────────────────────────────────────────

/** Detected coordinate pair from column name analysis — used by preview only. */
export interface SpatialRef {
  x_col: string;
  y_col: string;
  crs: string;         // e.g. "EPSG:4326", "EPSG:20351"
  crs_label: string;   // e.g. "WGS84 (geographic)"
  is_geographic: boolean;
}

export interface CoordPairDetection extends SpatialRef {}

export interface SpatialDetection {
  pairs: CoordPairDetection[];
  iogas_display_cols: string[];
}

/**
 * Active geometry chosen by the user (GIS rule).
 * geometry_source determines which coordinate columns are used for plotting.
 */
export type GeometrySource = "projected_xy" | "wgs84_lonlat" | "local_grid" | "none";

export interface SpatialConfig {
  geometry_source: GeometrySource;

  // Projected East/North
  east_col?: string | null;
  north_col?: string | null;
  projected_epsg?: string | null;      // e.g. "EPSG:32718"
  projected_crs_label?: string | null;

  // Geographic WGS84
  lon_col?: string | null;
  lat_col?: string | null;
}

// ── Column role types ─────────────────────────────────────────────────────────

export type ColumnRole =
  | "sample_identifier"
  | "coordinate_x" | "coordinate_y" | "coordinate_z"
  | "longitude_wgs84" | "latitude_wgs84"
  | "datetime"
  | "sample_type_qaqc"
  | "assay_element" | "assay_oxide" | "assay_compound"
  | "calculated_numeric" | "ratio_numeric" | "index_numeric" | "physical_numeric"
  | "text_attribute" | "date_attribute" | "qaqc_attribute"
  | "metadata" | "ignored" | "unknown";

// ── Import flag and unit types ────────────────────────────────────────────────

export type ImportFlag = "yes" | "no_import";
export type Unit = "ppm" | "ppb" | "pct";

// ── Column profile (returned by preview) ─────────────────────────────────────

export interface ImportedColumnProfile {
  original_name: string;
  clean_name: string;
  role: ColumnRole;
  data_type: "numeric" | "text" | "date" | "mixed" | "empty";
  semantic_type?: string | null;
  analyte?: string | null;
  unit?: string | null;
  raw_unit_token?: string | null;
  needs_manual_unit?: boolean;
  formula?: string | null;
  is_measured: boolean;
  is_calculated: boolean;
  validation_rule: string;
  missing_count: number;
  valid_count: number;
  warning_count: number;
  error_count: number;
  import_flag?: ImportFlag;
  alias?: string | null;
}

// ── Column mapping (sent during import) ──────────────────────────────────────

export interface ColumnMapping {
  original_name: string;
  import_flag: ImportFlag;
  role_override?: ColumnRole | null;
  analyte_override?: string | null;
  unit_override?: Unit | null;
  alias?: string | null;
}

export interface ModuleAvailability {
  table: boolean;
  charts: boolean;
  map: boolean;
  qaqc: boolean;
  three_d: boolean;
}

// ── Column / dataset types ────────────────────────────────────────────────────

export interface ColumnPreview {
  name: string;
  dtype: "numeric" | "text" | "boolean" | "datetime";
  null_count: number;
  null_pct: number;
  sample_values: string[];
  is_iogas_display: boolean;
  column_role: ColumnRole;
}

export interface PreviewResult {
  columns: ColumnPreview[];
  preview_rows: Record<string, unknown>[];
  total_rows: number;
  file_size_kb: number;
  spatial_detection: SpatialDetection;
  column_profiles: ImportedColumnProfile[];
}

export interface NullMappingInput {
  column: string;
  sentinel_value: string;
  null_type: "BELOW_LOD" | "NOT_ANALYZED" | "MISSING";
  lod_value?: number;
}

export interface SampleTypeMappingInput {
  column: string;
  value_map: Record<string, string>;
}

export interface ImportedDatasetMeta {
  id: string;
  name: string;
  row_count: number;
  column_count: number;
  columns: { name: string; dtype: string; null_count: number }[];
  imported_at: string;
  source_path: string;
  spatial_config: SpatialConfig | null;
  iogas_display_cols: string[];
  module_availability?: ModuleAvailability;
  qaqc_status?: string;
  spatial_status?: string;
}

export interface DatasetRowsResult {
  columns: string[];
  rows: Record<string, unknown>[];
  total_rows: number;
  offset: number;
}

// ── API ───────────────────────────────────────────────────────────────────────

export function previewFile(filePath: string, nRows = 50, separator = ","): Promise<PreviewResult> {
  return callRpc("data.preview", { file_path: filePath, n_rows: nRows, separator });
}

export function importFile(opts: {
  filePath: string;
  datasetName: string;
  separator?: string;
  nullMappings?: NullMappingInput[];
  sampleTypeMapping?: SampleTypeMappingInput;
  sheetName?: string | number;
  spatialConfig?: SpatialConfig | null;
  iogasDisplayCols?: string[];
  columnRoleOverrides?: Record<string, ColumnRole>;
  columnMappings?: ColumnMapping[];
}): Promise<{ success: boolean; dataset: ImportedDatasetMeta }> {
  return callRpc("data.import", {
    file_path: opts.filePath,
    dataset_name: opts.datasetName,
    separator: opts.separator ?? ",",
    null_mappings: opts.nullMappings ?? [],
    sample_type_mapping: opts.sampleTypeMapping ?? null,
    sheet_name: opts.sheetName ?? 0,
    spatial_config: opts.spatialConfig ?? null,
    iogas_display_cols: opts.iogasDisplayCols ?? [],
    column_role_overrides: opts.columnRoleOverrides ?? {},
    column_mappings: opts.columnMappings ?? [],
  });
}

export function listDatasets(): Promise<{ datasets: ImportedDatasetMeta[] }> {
  return callRpc("data.list");
}

export function deleteDataset(datasetId: string): Promise<{ deleted: boolean }> {
  return callRpc("data.delete", { dataset_id: datasetId });
}

export function getRows(
  datasetId: string,
  offset = 0,
  limit = 200
): Promise<DatasetRowsResult> {
  return callRpc("data.rows", { dataset_id: datasetId, offset, limit });
}

// ── Analytics (descriptive + PCA, RF-04) ─────────────────────────────────────

export interface VariableStats {
  variable: string;
  n: number;
  n_nulls: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  skewness: number;
  shapiro_p: number | null;
  normal: boolean;
}

export interface CorrelationMatrix {
  variables: string[];
  matrix: number[][];
}

export interface DescriptiveResult {
  stats: VariableStats[];
  correlation: CorrelationMatrix;
  n_samples_used: number;
  warnings: string[];
}

export function runDescriptive(datasetId: string, variables: string[]): Promise<DescriptiveResult> {
  return callRpc("analytics.descriptive", { dataset_id: datasetId, variables });
}

export interface PcaResult {
  job_id: string;
  n_components: number;
  explained_variance_ratio: number[];
  cumulative_variance: number[];
  loadings: number[][]; // variables x components
  scores: number[][];   // samples x components
  eigenvalues: number[];
  variables_used: string[];
  n_samples: number;
  sample_ids: string[];
  sample_types: string[];
  components_for_70pct: number;
  components_for_80pct: number;
  components_for_90pct: number;
  kmo_global: number;
  bartlett_p_value: number;
  vif: Record<string, number>;
  warnings: string[];
  pipeline: Record<string, unknown>;
}

export function runPca(datasetId: string, variables: string[], nComponents?: number): Promise<PcaResult> {
  return callRpc("analytics.pca", { dataset_id: datasetId, variables, n_components: nComponents ?? null });
}

export function exportKml(opts: {
  datasetId: string;
  latCol?: string;
  lonCol?: string;
  nameCol?: string;
  colorCol?: string;
}): Promise<{ kml_path: string }> {
  return callRpc("data.export_kml", {
    dataset_id: opts.datasetId,
    lat_col: opts.latCol,
    lon_col: opts.lonCol,
    name_col: opts.nameCol,
    color_col: opts.colorCol,
  });
}
