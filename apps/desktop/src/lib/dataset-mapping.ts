import type { ImportedDatasetMeta } from "@/lib/data-api";
import type { ColumnMeta, DatasetInfo } from "@/stores/dataset-store";

/** Single place that maps the backend's ImportedDatasetMeta shape into the
 * frontend's DatasetInfo — reused by App.tsx (import/startup) and by the
 * DATA toolbar's "Save changes" (which mints a new dataset id/version). */
export function toDatasetInfo(meta: ImportedDatasetMeta): DatasetInfo {
  return {
    id: meta.id,
    name: meta.name,
    rowCount: meta.row_count,
    columnCount: meta.column_count,
    columns: meta.columns.map(
      (c): ColumnMeta => ({
        name: c.name,
        dataType: c.dtype.includes("Float") || c.dtype.includes("Int") ? "numeric" : "text",
        role: c.role ?? "unknown",
        nullCount: c.null_count,
      })
    ),
    importedAt: meta.imported_at,
    spatialConfig: meta.spatial_config,
    iogasDisplayCols: meta.iogas_display_cols,
  };
}
