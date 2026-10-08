/** Dataset variables: user correction of semantic roles and coordinate/CRS assignment (metadata only). */
import { callRpc } from './rpc';
import type { GeoColumnRoles } from './geochemistry-api';
import type { ImportedDatasetMeta, SpatialConfig } from './data-api';

export const variablesApi = {
  /** `semanticRole: null` removes the correction (back to the automatic classification). */
  setColumnRole: (datasetId: string, column: string, semanticRole: string | null, analyte: string | null = null) =>
    callRpc<GeoColumnRoles>('geochemistry.set_column_role', { dataset_id: datasetId, column, semantic_role: semanticRole, analyte }),
  setSpatialConfig: (datasetId: string, config: SpatialConfig) =>
    callRpc<{ dataset: ImportedDatasetMeta }>('data.set_spatial_config', { dataset_id: datasetId, ...config }),
};

/** CRS most used for Peruvian projects (the backend validates any EPSG code with pyproj). */
export const COMMON_CRS = [
  { epsg: 'EPSG:32717', label: 'WGS 84 / UTM 17S' },
  { epsg: 'EPSG:32718', label: 'WGS 84 / UTM 18S' },
  { epsg: 'EPSG:32719', label: 'WGS 84 / UTM 19S' },
  { epsg: 'EPSG:24877', label: 'PSAD56 / UTM 17S' },
  { epsg: 'EPSG:24878', label: 'PSAD56 / UTM 18S' },
  { epsg: 'EPSG:24879', label: 'PSAD56 / UTM 19S' },
] as const;
