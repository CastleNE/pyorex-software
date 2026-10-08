/**
 * "Filter" tool — visual multi-condition builder for the DATA grid, replacing
 * one-condition-at-a-time editing via the column header menu. Conditions
 * combine with a single global AND/OR (see data-ops-store's
 * `filterCombinator` — query.py only supports a flat combinator, not nested
 * groups, so this UI doesn't offer nesting either).
 */
import { useEffect, useState } from "react";
import type { FilterCombinator, FilterOp, RowFilter } from "@/lib/data-api";
import { getRows } from "@/lib/data-api";
import { needsValue, needsValue2, opsForDtype } from "@/lib/filter-ops";
import { useDataOpsStore } from "@/stores/data-ops-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { useL } from "@/lib/i18n";

interface Props {
  datasetId: string;
}

// Local draft row — value/value2 stay as strings while editing so an empty
// numeric input doesn't force a premature `0`; coerced to number on Apply.
interface DraftCondition {
  key: number;
  column: string;
  op: FilterOp;
  value: string;
  value2: string;
}

let nextKey = 1;

export default function FilterBuilderWindow({ datasetId }: Props) {
  const L = useL();
  const dataset = useDatasetStore((s) => s.dataset);
  const view = useDataOpsStore((s) => s.getView(datasetId));
  const setFilters = useDataOpsStore((s) => s.setFilters);
  const setFilterCombinator = useDataOpsStore((s) => s.setFilterCombinator);

  const [combinator, setCombinator] = useState<FilterCombinator>(view.filterCombinator);
  const [draft, setDraft] = useState<DraftCondition[]>(() =>
    view.filters.length > 0
      ? view.filters.map((f) => ({
          key: nextKey++,
          column: f.column,
          op: f.op,
          value: f.value != null ? String(f.value) : "",
          value2: f.value2 != null ? String(f.value2) : "",
        }))
      : []
  );
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  const columns = dataset?.columns ?? [];

  function dtypeOf(column: string) {
    return columns.find((c) => c.name === column)?.dataType ?? "text";
  }

  function toRowFilters(): RowFilter[] {
    return draft
      .filter((d) => d.column)
      .map((d) => {
        const isNumeric = dtypeOf(d.column) === "numeric";
        if (!needsValue(d.op)) return { column: d.column, op: d.op };
        return {
          column: d.column,
          op: d.op,
          value: isNumeric ? Number(d.value) : d.value,
          value2: needsValue2(d.op) ? (isNumeric ? Number(d.value2) : d.value2) : undefined,
        };
      });
  }

  // Live match count against the draft — debounced, cheap (limit:1, we only
  // read total_rows from the response).
  useEffect(() => {
    const filters = toRowFilters();
    if (filters.length === 0) {
      setMatchCount(dataset?.rowCount ?? null);
      return;
    }
    setCounting(true);
    const handle = setTimeout(() => {
      getRows(datasetId, { limit: 1, filters, combinator })
        .then((r) => setMatchCount(r.total_rows))
        .catch(() => setMatchCount(null))
        .finally(() => setCounting(false));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, combinator]);

  function addCondition() {
    const firstCol = columns[0]?.name ?? "";
    setDraft((prev) => [
      ...prev,
      { key: nextKey++, column: firstCol, op: opsForDtype(dtypeOf(firstCol))[0].value, value: "", value2: "" },
    ]);
  }

  function updateCondition(key: number, patch: Partial<DraftCondition>) {
    setDraft((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function removeCondition(key: number) {
    setDraft((prev) => prev.filter((d) => d.key !== key));
  }

  function apply() {
    setFilterCombinator(datasetId, combinator);
    setFilters(datasetId, toRowFilters());
  }

  function clearAll() {
    setDraft([]);
    setCombinator("and");
    setFilterCombinator(datasetId, "and");
    setFilters(datasetId, []);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app text-xs">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <span className="text-subtle">{L({ es: "Coincidir", en: "Match" })}</span>
        <SegmentedToggle
          value={combinator}
          onChange={setCombinator}
          options={[
            { value: "and", label: L({ es: "TODAS (AND)", en: "ALL (AND)" }) },
            { value: "or", label: L({ es: "ALGUNA (OR)", en: "ANY (OR)" }) },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {draft.length === 0 && (
          <p className="py-4 text-center text-subtle">
            {L({ es: "Aún no hay condiciones: agrega una abajo.", en: "No conditions yet — add one below." })}
          </p>
        )}
        <div className="flex flex-col gap-2">
          {draft.map((d) => {
            const dtype = dtypeOf(d.column);
            const ops = opsForDtype(dtype);
            const isNumeric = dtype === "numeric";
            return (
              <div key={d.key} className="flex items-center gap-1.5 rounded border border-line bg-panel p-1.5">
                <select
                  value={d.column}
                  onChange={(e) => {
                    const col = e.target.value;
                    updateCondition(d.key, { column: col, op: opsForDtype(dtypeOf(col))[0].value, value: "", value2: "" });
                  }}
                  className="w-32 rounded border border-line bg-raised px-1.5 py-1 text-fg"
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={d.op}
                  onChange={(e) => updateCondition(d.key, { op: e.target.value as FilterOp })}
                  className="w-32 rounded border border-line bg-raised px-1.5 py-1 text-fg"
                >
                  {ops.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {needsValue(d.op) && (
                  <input
                    type={isNumeric ? "number" : "text"}
                    value={d.value}
                    onChange={(e) => updateCondition(d.key, { value: e.target.value })}
                    placeholder={L({ es: "valor", en: "value" })}
                    className="w-24 rounded border border-line bg-raised px-1.5 py-1 text-fg"
                  />
                )}
                {needsValue2(d.op) && (
                  <input
                    type={isNumeric ? "number" : "text"}
                    value={d.value2}
                    onChange={(e) => updateCondition(d.key, { value2: e.target.value })}
                    placeholder={L({ es: "valor 2", en: "value 2" })}
                    className="w-24 rounded border border-line bg-raised px-1.5 py-1 text-fg"
                  />
                )}
                <button
                  onClick={() => removeCondition(d.key)}
                  title={L({ es: "Quitar condición", en: "Remove condition" })}
                  className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded text-subtle hover:bg-hover hover:text-danger"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        <button
          onClick={addCondition}
          disabled={columns.length === 0}
          className="mt-2 w-full rounded border border-dashed border-line py-1.5 text-muted hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          {L({ es: "+ Agregar condición", en: "+ Add condition" })}
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2">
        <span className="text-subtle">
          {counting
            ? L({ es: "Contando…", en: "Counting…" })
            : matchCount !== null
              ? L({
                  es: `${matchCount.toLocaleString()} filas coinciden`,
                  en: `${matchCount.toLocaleString()} rows match`,
                })
              : ""}
        </span>
        <div className="ml-auto flex gap-1.5">
          <button onClick={clearAll} className="rounded border border-line px-2.5 py-1 text-muted hover:bg-hover">
            {L({ es: "Limpiar todo", en: "Clear all" })}
          </button>
          <button onClick={apply} className="rounded bg-accent-strong px-3 py-1 font-medium text-white hover:bg-accent-hover">
            {L({ es: "Aplicar", en: "Apply" })}
          </button>
        </div>
      </div>
    </div>
  );
}

function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex overflow-hidden rounded border border-line">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
            value === o.value ? "bg-accent-strong text-white" : "bg-raised text-muted hover:bg-hover"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
