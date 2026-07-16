import { useState } from "react";
import type { FilterOp, RowFilter } from "@/lib/data-api";
import type { ColumnMeta } from "@/stores/dataset-store";

const NUMERIC_OPS: { value: FilterOp; label: string }[] = [
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

const TEXT_OPS: { value: FilterOp; label: string }[] = [
  { value: "contains", label: "contiene" },
  { value: "not_contains", label: "no contiene" },
  { value: "starts_with", label: "comienza con" },
  { value: "ends_with", label: "termina con" },
  { value: "is_null", label: "valores nulos" },
  { value: "not_null", label: "valores no nulos" },
];

const DATE_OPS: { value: FilterOp; label: string }[] = [
  { value: "before", label: "antes de" },
  { value: "after", label: "después de" },
  { value: "between", label: "entre fechas" },
  { value: "year", label: "año" },
  { value: "month", label: "mes" },
  { value: "is_null", label: "valores nulos" },
  { value: "not_null", label: "valores no nulos" },
];

interface Props {
  column: string;
  dtype: ColumnMeta["dataType"];
  current: RowFilter | null;
  onApply: (filter: RowFilter | null) => void;
  onClose: () => void;
}

export default function ColumnFilterMenu({ column, dtype, current, onApply, onClose }: Props) {
  const isNumeric = dtype === "numeric";
  const ops = isNumeric ? NUMERIC_OPS : dtype === "datetime" ? DATE_OPS : TEXT_OPS;
  const [op, setOp] = useState<FilterOp>(current?.op ?? ops[0].value);
  const [value, setValue] = useState<string>(current?.value != null ? String(current.value) : "");
  const [value2, setValue2] = useState<string>(current?.value2 != null ? String(current.value2) : "");

  const needsValue = op !== "is_null" && op !== "not_null";
  const needsValue2 = op === "between";

  function handleApply() {
    if (!needsValue) {
      onApply({ column, op });
      return;
    }
    onApply({
      column,
      op,
      value: isNumeric ? Number(value) : value,
      value2: needsValue2 ? (isNumeric ? Number(value2) : value2) : undefined,
    });
  }

  return (
    <div
      className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-zinc-700 bg-zinc-850 p-2.5 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={op}
        onChange={(e) => setOp(e.target.value as FilterOp)}
        className="mb-2 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
      >
        {ops.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {needsValue && (
        <input
          type={isNumeric ? "number" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="valor"
          className="mb-2 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
        />
      )}
      {needsValue2 && (
        <input
          type={isNumeric ? "number" : "text"}
          value={value2}
          onChange={(e) => setValue2(e.target.value)}
          placeholder="valor 2"
          className="mb-2 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
        />
      )}
      <div className="flex gap-1.5">
        <button
          onClick={handleApply}
          className="flex-1 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
        >
          Apply
        </button>
        <button
          onClick={() => onApply(null)}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700"
        >
          Clear
        </button>
        <button
          onClick={onClose}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
