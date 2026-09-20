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
  columns: { name: string; dtype: string; null_count: number; role?: ColumnRole }[];
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
  total_rows_unfiltered: number;
  offset: number;
  hidden_columns: string[];
}

// ── Filters / sort (DATA grid header menus) ──────────────────────────────────

export type FilterOp =
  | "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "between" | "is_null" | "not_null"
  | "contains" | "not_contains" | "starts_with" | "ends_with" | "in"
  | "before" | "after" | "year" | "month";

export interface RowFilter {
  column: string;
  op: FilterOp;
  value?: unknown;
  value2?: unknown;
}

/** How multiple RowFilters combine — a single global setting for the whole
 * list (not nested groups), see data-preview Quick Tools plan. */
export type FilterCombinator = "and" | "or";

export interface RowSort {
  column: string;
  direction: "asc" | "desc";
}

// ── Non-destructive edit overlay (DATA toolbar) ──────────────────────────────

export type OperationType =
  | "rename_column" | "hide_column" | "unhide_column" | "drop_column"
  | "change_dtype" | "add_calculated_column";

export interface ColumnOperation {
  type: OperationType;
  params: Record<string, unknown>;
}

export interface OverlayOpEntry {
  id: string;
  type: OperationType;
  params: Record<string, unknown>;
  applied_at: string;
}

export interface OverlayHistoryEntry {
  op_id: string;
  action: "applied" | "undone" | "redone";
  at: string;
}

export interface OverlayState {
  dataset_id: string;
  ops: OverlayOpEntry[];
  redo_stack: OverlayOpEntry[];
  history: OverlayHistoryEntry[];
}

export interface FormulaPreviewResult {
  values: (number | string | boolean | null)[];
  errors: (string | null)[];
  inferred_dtype: "numeric" | "text";
  n_sampled: number;
  n_errors: number;
}

export interface QualityCheckResult {
  dataset_id: string;
  row_count: number;
  hidden_columns: string[];
  checks: {
    nulls: { column: string; null_count: number; null_pct: number }[];
    duplicate_rows: { count: number; sample_row_indices: number[] };
    duplicate_column_names: string[];
    constant_columns: { column: string; value: unknown }[];
    mixed_type_columns: { column: string; examples: unknown[] }[];
    non_numeric_in_numeric: { column: string; invalid_values: unknown[]; count: number }[];
    below_lod: { column: string; count: number }[];
    outliers_iqr: { column: string; outlier_count: number; lower_bound: number; upper_bound: number }[];
    invalid_coordinates: { checked: boolean; invalid_count: number; reason?: string };
  };
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
  opts: {
    offset?: number;
    limit?: number;
    filters?: RowFilter[];
    combinator?: FilterCombinator;
    sort?: RowSort | null;
    includeHidden?: boolean;
  } = {}
): Promise<DatasetRowsResult> {
  return callRpc("data.rows", {
    dataset_id: datasetId,
    offset: opts.offset ?? 0,
    limit: opts.limit ?? 200,
    filters: opts.filters ?? [],
    filter_combinator: opts.combinator ?? "and",
    sort: opts.sort ?? null,
    include_hidden: opts.includeHidden ?? false,
  });
}

// ── Data Quality ──────────────────────────────────────────────────────────────

export function getQualityReport(datasetId: string): Promise<QualityCheckResult> {
  return callRpc("data.quality_report", { dataset_id: datasetId });
}

// ── Calculated column formula engine ─────────────────────────────────────────

export function previewFormula(
  datasetId: string,
  formula: string,
  variables: string[] = [],
  sampleSize = 20
): Promise<FormulaPreviewResult> {
  return callRpc("data.preview_formula", {
    dataset_id: datasetId,
    formula,
    variables,
    sample_size: sampleSize,
  });
}

// ── Non-destructive edit overlay (Undo/Redo/Save) ────────────────────────────

export function applyOperation(datasetId: string, operation: ColumnOperation): Promise<OverlayState> {
  return callRpc("data.apply_operation", { dataset_id: datasetId, operation });
}

export function undoOperation(datasetId: string): Promise<OverlayState> {
  return callRpc("data.undo_operation", { dataset_id: datasetId });
}

export function redoOperation(datasetId: string): Promise<OverlayState> {
  return callRpc("data.redo_operation", { dataset_id: datasetId });
}

export function getOperations(datasetId: string): Promise<OverlayState> {
  return callRpc("data.get_operations", { dataset_id: datasetId });
}

export function saveChanges(datasetId: string): Promise<{ success: boolean; dataset: ImportedDatasetMeta }> {
  return callRpc("data.save_changes", { dataset_id: datasetId });
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
  n_excluded_qaqc: number;
}

export function runDescriptive(
  datasetId: string,
  variables: string[],
  includeQaqcFlagged = false
): Promise<DescriptiveResult> {
  return callRpc("analytics.descriptive", {
    dataset_id: datasetId,
    variables,
    include_qaqc_flagged: includeQaqcFlagged,
  });
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
  n_excluded_qaqc: number;
}

export function runPca(
  datasetId: string,
  variables: string[],
  nComponents?: number,
  includeQaqcFlagged = false
): Promise<PcaResult> {
  return callRpc("analytics.pca", {
    dataset_id: datasetId,
    variables,
    n_components: nComponents ?? null,
    include_qaqc_flagged: includeQaqcFlagged,
  });
}

// ── QAQC (RF-10): blanks, duplicates, CRM, Shewhart control charts ──────────

export interface QaqcSummary {
  n_samples_by_type: Record<string, number>;
  n_flags_by_severity: Record<string, number>;
  n_blank_flags: number;
  n_duplicate_pairs: number;
  n_duplicate_failures: number;
  n_crm_results: number;
  n_crm_failures: number;
}

export interface BlankFlagDto {
  sample_id: string;
  sample_type: string;
  variable: string;
  measured_value: number;
  threshold: number;
  severity: "critical" | "warning";
}

export interface DuplicatePairDto {
  original_id: string;
  duplicate_id: string;
  dup_type: "FD" | "LD";
  rpd_by_variable: Record<string, number>;
  failed_variables: string[];
  status: "pass" | "warning" | "fail";
}

export interface CrmResultDto {
  sample_id: string;
  crm_name: string;
  recovery_by_variable: Record<string, number>;
  warning_variables: string[];
  failed_variables: string[];
  status: "pass" | "warning" | "fail";
}

export interface QaqcCalculateResult {
  available: boolean;
  reason?: string;
  dataset_id?: string;
  generated_at?: string;
  summary?: QaqcSummary;
  blank_flags?: BlankFlagDto[];
  duplicate_pairs?: DuplicatePairDto[];
  crm_results?: CrmResultDto[];
  warnings?: string[];
}

export interface WestgardViolationDto {
  rule: "1_3s" | "2_2s" | "10x" | "drift";
  description: string;
  affected_indices: number[];
  severity: "warning" | "reject";
}

export interface ControlChartPoint {
  index: number;
  sample_id: string;
  recovery_pct: number;
  status: "pass" | "warning" | "fail";
}

export interface ControlChartResult {
  available: boolean;
  reason?: string;
  n_points?: number;
  points?: ControlChartPoint[];
  mean?: number;
  sigma?: number;
  ucl_1s?: number;
  ucl_2s?: number;
  ucl_3s?: number;
  lcl_1s?: number;
  lcl_2s?: number;
  lcl_3s?: number;
  westgard_violations?: WestgardViolationDto[];
}

export interface CrmDefinition {
  name: string;
  certified_values: Record<string, number>;
  uncertainty: Record<string, number>;
  updated_at: string;
}

export interface QaqcThresholds {
  blankFactor?: number;
  fdThreshold?: number;
  ldThreshold?: number;
  crmWarningPct?: number;
  crmFailurePct?: number;
}

function thresholdParams(opts: QaqcThresholds) {
  return {
    blank_factor: opts.blankFactor ?? 0.20,
    fd_threshold: opts.fdThreshold ?? 20.0,
    ld_threshold: opts.ldThreshold ?? 15.0,
    crm_warning_pct: opts.crmWarningPct ?? 15.0,
    crm_failure_pct: opts.crmFailurePct ?? 25.0,
  };
}

export function qaqcCalculate(
  datasetId: string,
  variables: string[],
  opts: QaqcThresholds = {}
): Promise<QaqcCalculateResult> {
  return callRpc("qaqc.calculate", { dataset_id: datasetId, variables, ...thresholdParams(opts) });
}

export function qaqcReport(
  datasetId: string,
  variables: string[],
  opts: QaqcThresholds = {}
): Promise<QaqcCalculateResult> {
  return callRpc("qaqc.report", { dataset_id: datasetId, variables, ...thresholdParams(opts) });
}

export function qaqcControlChart(
  datasetId: string,
  crmName: string,
  variable: string,
  opts: { crmWarningPct?: number; crmFailurePct?: number } = {}
): Promise<ControlChartResult> {
  return callRpc("qaqc.control_chart", {
    dataset_id: datasetId,
    crm_name: crmName,
    variable,
    crm_warning_pct: opts.crmWarningPct ?? 15.0,
    crm_failure_pct: opts.crmFailurePct ?? 25.0,
  });
}

export function qaqcCrmLibraryList(): Promise<{ crms: CrmDefinition[] }> {
  return callRpc("qaqc.crm_library.list", {});
}

export function qaqcCrmLibraryUpsert(
  name: string,
  certifiedValues: Record<string, number>,
  uncertainty?: Record<string, number>
): Promise<{ crm: CrmDefinition }> {
  return callRpc("qaqc.crm_library.upsert", {
    name,
    certified_values: certifiedValues,
    uncertainty: uncertainty ?? {},
  });
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
