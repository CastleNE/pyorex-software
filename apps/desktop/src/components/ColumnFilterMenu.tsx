import { useState } from "react";
import type { FilterOp, RowFilter } from "@/lib/data-api";
import { needsValue as opNeedsValue, needsValue2 as opNeedsValue2, opsForDtype } from "@/lib/filter-ops";
import type { ColumnMeta } from "@/stores/dataset-store";
import { useL } from "@/lib/i18n";

interface Props {
  column: string;
  dtype: ColumnMeta["dataType"];
  current: RowFilter | null;
  onApply: (filter: RowFilter | null) => void;
  onClose: () => void;
}

export default function ColumnFilterMenu({ column, dtype, current, onApply, onClose }: Props) {
  const L = useL();
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
      className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-line bg-panel p-2.5 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={op}
        onChange={(e) => setOp(e.target.value as FilterOp)}
        className="mb-2 w-full rounded border border-line bg-raised px-2 py-1 text-xs text-fg"
      >
        {ops.map((o) => (
          <option key={o.value} value={o.value}>
            {L(o.label)}
          </option>
        ))}
      </select>
      {needsValue && (
        <input
          type={isNumeric ? "number" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={L({ es: "valor", en: "value" })}
          className="mb-2 w-full rounded border border-line bg-raised px-2 py-1 text-xs text-fg"
        />
      )}
      {needsValue2 && (
        <input
          type={isNumeric ? "number" : "text"}
          value={value2}
          onChange={(e) => setValue2(e.target.value)}
          placeholder={L({ es: "valor 2", en: "value 2" })}
          className="mb-2 w-full rounded border border-line bg-raised px-2 py-1 text-xs text-fg"
        />
      )}
      <div className="flex gap-1.5">
        <button
          onClick={handleApply}
          className="flex-1 rounded bg-accent-strong px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover"
        >
          {L({ es: "Aplicar", en: "Apply" })}
        </button>
        <button
          onClick={() => onApply(null)}
          className="rounded border border-line px-2 py-1 text-xs text-muted hover:bg-hover"
        >
          {L({ es: "Limpiar", en: "Clear" })}
        </button>
        <button
          onClick={onClose}
          className="rounded border border-line px-2 py-1 text-xs text-muted hover:bg-hover"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
