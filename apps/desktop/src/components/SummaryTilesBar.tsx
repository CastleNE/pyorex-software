/**
 * Power BI–style KPI strip pinned above the DATA canvas — always visible
 * (independent of which tool windows are open) so the workspace isn't a
 * blank logo the moment a dataset loads. Purely derived from data already
 * in dataset-store + one quality_report fetch; no new backend surface.
 */
import { useEffect, useState } from "react";
import type { DatasetInfo } from "@/stores/dataset-store";
import { getQualityReport } from "@/lib/data-api";

interface Props {
  dataset: DatasetInfo;
  onOpenQuality: () => void;
  onOpenGrid: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  numeric: "bg-blue-400",
  text: "bg-emerald-400",
  categorical: "bg-purple-400",
  datetime: "bg-amber-400",
};

const TYPE_LABELS: Record<string, string> = {
  numeric: "Numeric",
  text: "Text",
  categorical: "Categorical",
  datetime: "Date/Time",
};

export default function SummaryTilesBar({ dataset, onOpenQuality, onOpenGrid }: Props) {
  const [issueCount, setIssueCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIssueCount(null);
    getQualityReport(dataset.id)
      .then((r) => {
        if (cancelled) return;
        const c = r.checks;
        const n =
          c.nulls.length +
          (c.duplicate_rows.count > 0 ? 1 : 0) +
          c.duplicate_column_names.length +
          c.constant_columns.length +
          c.mixed_type_columns.length +
          c.non_numeric_in_numeric.length +
          c.below_lod.length +
          c.outliers_iqr.length +
          (c.invalid_coordinates.checked && c.invalid_coordinates.invalid_count > 0 ? 1 : 0);
        setIssueCount(n);
      })
      .catch(() => setIssueCount(null));
    return () => {
      cancelled = true;
    };
  }, [dataset.id]);

  const totalCells = dataset.rowCount * dataset.columnCount;
  const nullCells = dataset.columns.reduce((sum, c) => sum + c.nullCount, 0);
  const completeness = totalCells > 0 ? Math.max(0, 1 - nullCells / totalCells) : 1;

  const typeCounts = new Map<string, number>();
  dataset.columns.forEach((c) => typeCounts.set(c.dataType, (typeCounts.get(c.dataType) ?? 0) + 1));
  const typeEntries = ["numeric", "text", "categorical", "datetime"]
    .filter((t) => typeCounts.has(t))
    .map((t) => ({ type: t, count: typeCounts.get(t)! }));

  return (
    <div className="flex shrink-0 items-stretch gap-2 overflow-x-auto border-b border-zinc-700 bg-zinc-850 px-3 py-2.5">
      <Tile label="Filas × Columnas" onClick={onOpenGrid} hint="Abrir grilla de datos">
        <p className="font-mono text-base font-semibold text-zinc-100">
          {dataset.rowCount.toLocaleString()} <span className="text-zinc-600">×</span> {dataset.columnCount}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-zinc-500">{dataset.name}</p>
      </Tile>

      <Tile label="Completitud">
        <div className="flex items-baseline gap-1.5">
          <p className={`font-mono text-base font-semibold ${completeness >= 0.98 ? "text-emerald-400" : completeness >= 0.9 ? "text-amber-400" : "text-red-400"}`}>
            {(completeness * 100).toFixed(1)}%
          </p>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-900">
          <div
            className={`h-full rounded-full ${completeness >= 0.98 ? "bg-emerald-400" : completeness >= 0.9 ? "bg-amber-400" : "bg-red-400"}`}
            style={{ width: `${completeness * 100}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-zinc-500">{nullCells.toLocaleString()} celdas vacías</p>
      </Tile>

      <Tile label="Tipos de columna">
        <div className="flex h-3 w-32 overflow-hidden rounded-full bg-zinc-900">
          {typeEntries.map(({ type, count }, i) => (
            <div
              key={type}
              className={`h-full ${TYPE_COLORS[type] ?? "bg-zinc-500"} ${i > 0 ? "border-l border-zinc-900" : ""}`}
              style={{ width: `${(count / dataset.columnCount) * 100}%` }}
              title={`${TYPE_LABELS[type] ?? type}: ${count}`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {typeEntries.map(({ type, count }) => (
            <span key={type} className="flex items-center gap-1 text-[10px] text-zinc-500">
              <span className={`h-1.5 w-1.5 rounded-full ${TYPE_COLORS[type] ?? "bg-zinc-500"}`} />
              {count} {TYPE_LABELS[type] ?? type}
            </span>
          ))}
        </div>
      </Tile>

      <Tile label="Calidad de datos" onClick={onOpenQuality} hint="Ver reporte completo">
        {issueCount === null ? (
          <p className="font-mono text-base text-zinc-600">…</p>
        ) : issueCount === 0 ? (
          <p className="font-mono text-base font-semibold text-emerald-400">✓ Sin hallazgos</p>
        ) : (
          <p className="font-mono text-base font-semibold text-amber-400">⚠ {issueCount} hallazgos</p>
        )}
        <p className="mt-0.5 text-[10px] text-zinc-500">nulls, duplicados, outliers…</p>
      </Tile>
    </div>
  );
}

function Tile({
  label,
  hint,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      title={hint}
      className={`flex min-w-[150px] flex-col justify-center rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-left transition-colors ${
        onClick ? "cursor-pointer hover:border-zinc-600 hover:bg-zinc-800" : ""
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="mt-1">{children}</div>
    </Comp>
  );
}
