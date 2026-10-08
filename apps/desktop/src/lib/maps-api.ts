/** Secciones y mapas (phase 5): RPC client. Everything is computed by the Python engine (analysis/maps). */
import { callRpc } from './rpc';

export interface MapIdwOptions { resolution: number; power: number; neighbors: number; radius: number | null; log: boolean }
export interface MapRequest {
  dataset_id: string; value: string | null; category_column: string | null; label_column: string | null;
  include_qaqc: boolean; idw: MapIdwOptions | null;
}
export interface MapPoint { row_index: number; sample_id: string; x: number; y: number; value: number | null; reason: string | null; category: string | null }
export interface MapGrid { x: number[]; y: number[]; z: (number | null)[][]; epsg: number | null; coordinate_unit: string | null; log: boolean }
export interface MapCrs { source: 'projected_xy' | 'local_grid' | 'wgs84_lonlat'; epsg: number | null; label: string | null; geographic: boolean; unit: string; x_column: string; y_column: string; interpolable: boolean }
export interface MapResult {
  dataset_id: string; crs: MapCrs; value_label: string | null; value_columns: string[]; category_column: string | null;
  points: MapPoint[];
  quality: { total: number; mapped: number; no_coordinates: number; no_value: number; excluded_qaqc: number };
  grid: MapGrid | null; grid_metrics: { unique_locations: number; duplicate_locations: number; supported_cells: number; total_cells: number } | null;
  warnings: string[]; idw: MapIdwOptions | null; created_at: string;
}

export interface DrillRequest {
  hole_column: string; from_column: string | null; to_column: string | null; depth_column: string | null;
  azimuth_column: string | null; dip_column: string | null; azimuth: number; dip: number;
}
export interface SectionRequest {
  dataset_id: string; start: [number, number]; end: [number, number]; width: number; value: string | null;
  category_column: string | null; label_column: string | null; include_qaqc: boolean;
  elevation_column: string | null; dem_path: string | null; drill: DrillRequest | null;
}
export interface SectionPoint { row_index: number; sample_id: string; distance: number; offset: number; z: number | null; value: number | null; category: string | null; hole: string | null; depth: number | null }
export interface SectionHole { hole: string; collar_distance: number; collar_offset: number; collar_z: number | null; end_distance: number; end_z: number | null; max_depth: number; azimuth: number; dip: number }
export interface SectionResult {
  dataset_id: string;
  line: { start: [number, number]; end: [number, number]; length: number; azimuth: number; width: number };
  crs: { epsg: number | null; label: string | null; source: string; x_column: string; y_column: string };
  value_label: string | null; category_column: string | null;
  points: SectionPoint[]; holes: SectionHole[];
  topography: [number, number | null][] | null; topography_source: 'dem' | 'samples' | null; dem: { name: string; epsg: number | null } | null;
  quality: { total: number; in_section: number; outside: number; no_coordinates: number; no_elevation: number; no_value: number; excluded_qaqc: number };
  warnings: string[]; created_at: string;
}

export const mapsApi = {
  sampleMap: (req: MapRequest) => callRpc<MapResult>('maps.sample_map', req as unknown as Record<string, unknown>),
  section: (req: SectionRequest) => callRpc<SectionResult>('maps.section', req as unknown as Record<string, unknown>),
};
