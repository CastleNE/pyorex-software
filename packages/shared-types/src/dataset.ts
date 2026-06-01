// Dataset and data model types

export type NullType = "BELOW_LOD" | "NOT_ANALYZED" | "MISSING";
export type DataType = "numeric" | "categorical" | "datetime" | "text";
export type GeoType = "ratio" | "concentration" | "isotope" | "index" | "computed";

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
