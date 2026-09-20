/**
 * Per-dtype filter operator lists, shared by ColumnFilterMenu (single-column
 * popup) and FilterBuilderWindow (multi-condition Quick Tools builder) so
 * both stay in sync with what query.py's apply_filters actually supports.
 */
import type { FilterOp } from "@/lib/data-api";
import type { ColumnMeta } from "@/stores/dataset-store";

export const NUMERIC_OPS: { value: FilterOp; label: string }[] = [
  { value: "eq", label: "igual a" },
  { value: "neq", label: "diferente de" },
  { value: "gt", label: "mayor que" },
  { value: "lt", label: "menor que" },
  { value: "gte", label: "mayor o igual" },
  { value: "lte", label: "menor o igual" },
  { value: "between", label: "entre" },
  { value: "is_null", label: "valores nulos" },
  { value: "not_null", label: "valores no nulos" },
];

export const TEXT_OPS: { value: FilterOp; label: string }[] = [
  { value: "contains", label: "contiene" },
  { value: "not_contains", label: "no contiene" },
  { value: "starts_with", label: "comienza con" },
  { value: "ends_with", label: "termina con" },
  { value: "is_null", label: "valores nulos" },
  { value: "not_null", label: "valores no nulos" },
];

export const DATE_OPS: { value: FilterOp; label: string }[] = [
  { value: "before", label: "antes de" },
  { value: "after", label: "después de" },
  { value: "between", label: "entre fechas" },
  { value: "year", label: "año" },
  { value: "month", label: "mes" },
  { value: "is_null", label: "valores nulos" },
  { value: "not_null", label: "valores no nulos" },
];

export function opsForDtype(dtype: ColumnMeta["dataType"]): { value: FilterOp; label: string }[] {
  return dtype === "numeric" ? NUMERIC_OPS : dtype === "datetime" ? DATE_OPS : TEXT_OPS;
}

export function needsValue(op: FilterOp): boolean {
  return op !== "is_null" && op !== "not_null";
}

export function needsValue2(op: FilterOp): boolean {
  return op === "between";
}
