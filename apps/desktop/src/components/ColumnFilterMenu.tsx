import { useState } from "react";
import type { FilterOp, RowFilter } from "@/lib/data-api";
import { needsValue as opNeedsValue, needsValue2 as opNeedsValue2, opsForDtype } from "@/lib/filter-ops";
import type { ColumnMeta } from "@/stores/dataset-store";

interface Props {
  column: string;
  dtype: ColumnMeta["dataType"];
  current: RowFilter | null;
  onApply: (filter: RowFilter | null) => void;
  onClose: () => void;
}

export default function ColumnFilterMenu({ column, dtype, current, onApply, onClose }: Props) {
  const isNumeric = dtype === "numeric";
  const ops = opsForDtype(dtype);
  const [op, setOp] = useState<FilterOp>(current?.op ?? ops[0].value);
  const [value, setValue] = useState<string>(current?.value != null ? String(current.value) : "");
  const [value2, setValue2] = useState<string>(current?.value2 != null ? String(current.value2) : "");

  const needsValue = opNeedsValue(op);
  const needsValue2 = opNeedsValue2(op);

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
