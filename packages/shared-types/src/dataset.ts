// Dataset and data model types

export type NullType = "BELOW_LOD" | "NOT_ANALYZED" | "MISSING";
export type DataType = "numeric" | "categorical" | "datetime" | "text";
export type GeoType = "ratio" | "concentration" | "isotope" | "index" | "computed";

// Addendum V3 — Column role classification
export type ColumnRole =
  | "sample_identifier"
  | "coordinate_x"
  | "coordinate_y"
  | "coordinate_z"
  | "assay_element"
  | "assay_oxide"
  | "assay_compound"
  | "calculated_numeric"
  | "ratio_numeric"
  | "index_numeric"
  | "physical_numeric"
  | "text_attribute"
  | "date_attribute"
  | "qaqc_attribute"
  | "metadata"
  | "ignored"
  | "unknown";

export interface ImportedColumnProfile {
  originalName: string;
  cleanName: string;
  role: ColumnRole;
  dataType: "numeric" | "text" | "date" | "mixed" | "empty";
  semanticType?: string;
  analyte?: string;
  unit?: string;
  formula?: string;
  isMeasured: boolean;
  isCalculated: boolean;
  validationRule: string;
  missingCount: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
}

export interface ModuleAvailability {
  table: boolean;
  charts: boolean;
  map: boolean;
  qaqc: boolean;
  three_d: boolean;
}

export interface ColumnSchema {
  name: string;
  dataType: DataType;
  unit?: string;
  geoType?: GeoType;
  nullCount: number;
  nullType?: NullType;
  lod?: number;
}

export interface DatasetMeta {
  id: string;
  name: string;
  source: "file" | "pi_system" | "odbc" | "opc";
  rowCount: number;
  columnCount: number;
  columns: ColumnSchema[];
  importedAt: string;
  projectId: string;
}

export interface ImportConfig {
  nullValueMappings: NullValueMapping[];
  columnMappings: ColumnMapping[];
}

export interface NullValueMapping {
  column: string;
  sentinelValue: string | number;
  nullType: NullType;
  lodValue?: number;
}

export interface ColumnMapping {
  sourceColumn: string;
  targetColumn: string;
  dataType: DataType;
  unit?: string;
}
