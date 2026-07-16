/**
 * "Data Quality" tool — read-only findings (nulls, duplicates, constant
 * columns, mixed types, below-LOD, IQR outliers, invalid coordinates,
 * duplicate column names). Never auto-removes anything — outliers and
 * duplicates in geochemical data must always be reviewed by the user.
 */
import { useEffect, useState } from "react";
import { getQualityReport, type QualityCheckResult } from "@/lib/data-api";

interface Props {
  datasetId: string;
}

export default function DataQualityWindow({ datasetId }: Props) {
  const [report, setReport] = useState<QualityCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getQualityReport(datasetId)
      .then(setReport)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, [datasetId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-xs">
        <p className="text-red-400">Failed to load quality report</p>
        <p className="font-mono text-zinc-600">{error}</p>
        <button onClick={load} className="text-blue-400 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  if (!report) return null;
  const c = report.checks;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-zinc-900 p-3 text-xs">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-zinc-500">
          {report.row_count.toLocaleString()} rows
          {report.hidden_columns.length > 0 && ` · ${report.hidden_columns.length} hidden columns`}
        </p>
        <button onClick={load} className="text-blue-400 hover:underline">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Card title="Null values" empty={c.nulls.length === 0}>
          {c.nulls.map((n) => (
            <Row key={n.column} label={n.column} value={`${n.null_count} (${n.null_pct}%)`} />
          ))}
        </Card>

        <Card title="Duplicate rows" empty={c.duplicate_rows.count === 0}>
          <Row label="count" value={String(c.duplicate_rows.count)} />
        </Card>

        <Card title="Duplicate column names" empty={c.duplicate_column_names.length === 0}>
          {c.duplicate_column_names.map((n) => (
            <Row key={n} label={n} value="duplicated" />
          ))}
        </Card>

        <Card title="Constant columns" empty={c.constant_columns.length === 0}>
          {c.constant_columns.map((cc) => (
            <Row key={cc.column} label={cc.column} value={String(cc.value)} />
          ))}
        </Card>

        <Card title="Mixed-type columns" empty={c.mixed_type_columns.length === 0}>
          {c.mixed_type_columns.map((m) => (
            <Row key={m.column} label={m.column} value={m.examples.join(", ")} />
          ))}
        </Card>

        <Card title="Non-numeric in numeric columns" empty={c.non_numeric_in_numeric.length === 0}>
          {c.non_numeric_in_numeric.map((m) => (
            <Row key={m.column} label={m.column} value={`${m.count} invalid`} />
          ))}
        </Card>

        <Card title="Below detection limit" empty={c.below_lod.length === 0}>
          {c.below_lod.map((m) => (
            <Row key={m.column} label={m.column} value={String(m.count)} />
          ))}
        </Card>

        <Card title="Outliers (IQR)" empty={c.outliers_iqr.length === 0}>
          {c.outliers_iqr.map((o) => (
            <Row key={o.column} label={o.column} value={`${o.outlier_count} outliers`} />
          ))}
        </Card>

        <Card title="Coordinates" empty={!c.invalid_coordinates.checked}>
          <Row
            label="invalid"
            value={c.invalid_coordinates.checked ? String(c.invalid_coordinates.invalid_count) : (c.invalid_coordinates.reason ?? "not checked")}
          />
        </Card>
      </div>
    </div>
  );
}

function Card({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-zinc-700 p-2">
      <p className="mb-1 flex items-center gap-1.5 font-semibold text-zinc-300">
        {title}
        {empty ? (
          <span className="text-emerald-400">✓</span>
        ) : (
          <span className="text-amber-400">⚠</span>
        )}
      </p>
      {empty ? <p className="text-zinc-600">No issues found.</p> : <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-zinc-400">
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-zinc-300">{value}</span>
    </div>
  );
}
