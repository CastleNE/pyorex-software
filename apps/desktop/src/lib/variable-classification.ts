import type { ColumnMeta } from "@/stores/dataset-store";
import type { ColumnRole } from "@/lib/data-api";

export type VariableCategory =
  | "Identifiers"
  | "Coordinates"
  | "Dates"
  | "Calculated"
  | "Numeric"
  | "Categorical"
  | "Other";

export const VARIABLE_CATEGORIES: VariableCategory[] = [
  "Identifiers",
  "Coordinates",
  "Dates",
  "Calculated",
  "Numeric",
  "Categorical",
  "Other",
];

const ROLE_TO_CATEGORY: Record<ColumnRole, VariableCategory> = {
  sample_identifier: "Identifiers",

  coordinate_x: "Coordinates",
  coordinate_y: "Coordinates",
  coordinate_z: "Coordinates",
  longitude_wgs84: "Coordinates",
  latitude_wgs84: "Coordinates",

  datetime: "Dates",
  date_attribute: "Dates",

  calculated_numeric: "Calculated",
  ratio_numeric: "Calculated",
  index_numeric: "Calculated",

  assay_element: "Numeric",
  assay_oxide: "Numeric",
  assay_compound: "Numeric",
  physical_numeric: "Numeric",

  sample_type_qaqc: "Categorical",
  text_attribute: "Categorical",
  qaqc_attribute: "Categorical",

  metadata: "Other",
  ignored: "Other",
  unknown: "Other",
};

/** Groups columns by their backend-derived ColumnRole into the 6 picker
 * categories used across DATA and Data Analysis. Never silently drops a
 * column — anything without a clear bucket lands in "Other". */
export function classifyColumns(columns: ColumnMeta[]): Record<VariableCategory, ColumnMeta[]> {
  const result: Record<VariableCategory, ColumnMeta[]> = {
    Identifiers: [],
    Coordinates: [],
    Dates: [],
    Calculated: [],
    Numeric: [],
    Categorical: [],
    Other: [],
  };
  for (const col of columns) {
    const category = ROLE_TO_CATEGORY[col.role] ?? "Other";
    result[category].push(col);
  }
  return result;
}
