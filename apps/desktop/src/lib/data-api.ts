/**
 * Typed helpers for the data.* RPC methods (import, preview, rows, list, export_kml).
 */
import { callRpc } from "./rpc";

// ── Spatial types ─────────────────────────────────────────────────────────────

export interface SpatialRef {
  x_col: string;
  y_col: string;
  crs: string;         // e.g. "EPSG:4326", "EPSG:20351"
  crs_label: string;   // e.g. "WGS84 (geographic)"
  is_geographic: boolean;
}

export interface CoordPairDetection extends SpatialRef {
  // same shape as SpatialRef — backend returns detected pairs with same fields
}

export interface SpatialDetection {
  pairs: CoordPairDetection[];
  iogas_display_cols: string[];
}

// ── Column / dataset types ────────────────────────────────────────────────────

export interface ColumnPreview {
  name: string;
  dtype: "numeric" | "text" | "boolean" | "datetime";
  null_count: number;
  null_pct: number;
  sample_values: string[];
  is_iogas_display: boolean;
}

export interface PreviewResult {
  columns: ColumnPreview[];
  preview_rows: Record<string, unknown>[];
  total_rows: number;
  file_size_kb: number;
  spatial_detection: SpatialDetection;
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
  spatial_ref: SpatialRef | null;
  iogas_display_cols: string[];
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
  spatialRef?: SpatialRef | null;
  iogasDisplayCols?: string[];
}): Promise<{ success: boolean; dataset: ImportedDatasetMeta }> {
  return callRpc("data.import", {
    file_path: opts.filePath,
    dataset_name: opts.datasetName,
    separator: opts.separator ?? ",",
    null_mappings: opts.nullMappings ?? [],
    sample_type_mapping: opts.sampleTypeMapping ?? null,
    sheet_name: opts.sheetName ?? 0,
    spatial_ref: opts.spatialRef ?? null,
    iogas_display_cols: opts.iogasDisplayCols ?? [],
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
