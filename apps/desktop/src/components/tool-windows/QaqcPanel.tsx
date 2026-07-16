/**
 * QAQC dataset summary panel (RF-10.6.1/10.6.2) — stat cards + one table per
 * QAQC type (Blanks/Duplicates/CRM), pass/warning/fail colored. CRM rows open
 * a Shewhart control chart in a separate floating window.
 */
import { useEffect, useMemo, useState, type RefObject } from "react";
import { StatCard } from "@/components/analysis-results/shared";
import CrmLibraryWindow from "@/components/tool-windows/CrmLibraryWindow";
import QaqcControlChartWindow from "@/components/tool-windows/QaqcControlChartWindow";
import type { WorkspaceAreaHandle } from "@/components/window-manager/types";
import { classifyColumns } from "@/lib/variable-classification";
import { qaqcCalculate, type QaqcCalculateResult } from "@/lib/data-api";
import { useDatasetStore } from "@/stores/dataset-store";

interface Props {
  datasetId: string;
  workspaceRef: RefObject<WorkspaceAreaHandle | null>;
}

const STATUS_BADGE: Record<string, string> = {
  pass: "text-emerald-400",
  warning: "text-amber-400",
  fail: "text-red-400",
  critical: "text-red-400",
};

export default function QaqcPanel({ datasetId, workspaceRef }: Props) {
  const dataset = useDatasetStore((s) => s.dataset);
  const [result, setResult] = useState<QaqcCalculateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const variables = useMemo(() => {
    if (!dataset) return [];
    const grouped = classifyColumns(dataset.columns);
    return [...grouped.Numeric, ...grouped.Calculated].map((c) => c.name);
  }, [dataset]);

  function load() {
    setLoading(true);
    setError(null);
    qaqcCalculate(datasetId, variables)
      .then(setResult)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (variables.length > 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, variables.length]);

  function openControlChart(crmName: string, variable: string) {
    const id = `qaqc-chart-${crmName}-${variable}`;
    workspaceRef.current?.openWindow({
      id,
      title: `Control Chart — ${crmName} / ${variable}`,
      icon: "📈",
      defaultPos: { x: 80, y: 60, width: 520, height: 420 },
      render: () => <QaqcControlChartWindow datasetId={datasetId} crmName={crmName} variable={variable} />,
    });
  }

  function openCrmLibrary() {
    workspaceRef.current?.openWindow({
      id: "crm-library",
      title: "CRM Library",
      icon: "🧪",
      defaultPos: { x: 40, y: 30, width: 560, height: 420 },
      render: () => <CrmLibraryWindow />,
    });
  }

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
        <p className="text-red-400">Failed to load QAQC data</p>
        <p className="font-mono text-zinc-600">{error}</p>
        <button onClick={load} className="text-blue-400 hover:underline">Retry</button>
      </div>
    );
  }
  if (!result?.available) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs">
        <div className="text-3xl opacity-20">🧪</div>
        <p className="text-zinc-500">{result?.reason ?? "QAQC no disponible para este dataset."}</p>
        <p className="text-zinc-700">Reimportá el dataset asignando la columna "Sample Type / QAQC" en el wizard.</p>
      </div>
    );
  }

  const summary = result.summary!;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-zinc-900 p-3 text-xs">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-zinc-500">Generated {new Date(result.generated_at!).toLocaleString()}</p>
        <button onClick={openCrmLibrary} className="text-blue-400 hover:underline">
          Manage CRM Library
        </button>
      </div>

      {result.warnings && result.warnings.length > 0 && (
        <div className="mb-3 space-y-1 rounded-md border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-amber-300">
          {result.warnings.map((w, i) => (
            <p key={i}>⚠ {w}</p>
          ))}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(summary.n_samples_by_type).map(([type, n]) => (
          <StatCard key={type} label={type} value={String(n)} />
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(summary.n_flags_by_severity).map(([severity, n]) => (
          <StatCard key={severity} label={severity} value={String(n)} />
        ))}
      </div>

      <QaqcSection title={`Blanks (${result.blank_flags?.length ?? 0})`}>
        {(result.blank_flags ?? []).length === 0 ? (
          <EmptyRow />
        ) : (
          <Table headers={["Sample", "Type", "Variable", "Value", "Threshold", "Severity", ""]}>
            {result.blank_flags!.map((f, i) => (
              <tr key={i} className="border-t border-zinc-800">
                <td className="px-2 py-1">{f.sample_id}</td>
                <td className="px-2 py-1">{f.sample_type}</td>
                <td className="px-2 py-1">{f.variable}</td>
                <td className="px-2 py-1">{f.measured_value}</td>
                <td className="px-2 py-1">{f.threshold.toFixed(3)}</td>
                <td className={`px-2 py-1 font-medium ${STATUS_BADGE[f.severity]}`}>{f.severity}</td>
                <td className="px-2 py-1">
                  <button disabled title="Manual override + audit trail — coming soon" className="text-zinc-700">
                    Override
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </QaqcSection>

      <QaqcSection title={`Duplicates (${result.duplicate_pairs?.length ?? 0})`}>
        {(result.duplicate_pairs ?? []).length === 0 ? (
          <EmptyRow />
        ) : (
          <Table headers={["Original", "Duplicate", "Type", "Failed vars", "Status"]}>
            {result.duplicate_pairs!.map((p, i) => (
              <tr key={i} className="border-t border-zinc-800">
                <td className="px-2 py-1">{p.original_id}</td>
                <td className="px-2 py-1">{p.duplicate_id}</td>
                <td className="px-2 py-1">{p.dup_type}</td>
                <td className="px-2 py-1">{p.failed_variables.join(", ") || "—"}</td>
                <td className={`px-2 py-1 font-medium ${STATUS_BADGE[p.status]}`}>{p.status}</td>
              </tr>
            ))}
          </Table>
        )}
      </QaqcSection>

      <QaqcSection title={`CRM (${result.crm_results?.length ?? 0})`}>
        {(result.crm_results ?? []).length === 0 ? (
          <EmptyRow />
        ) : (
          <Table headers={["Sample", "CRM", "Failed vars", "Status", ""]}>
            {result.crm_results!.map((r, i) => (
              <tr key={i} className="border-t border-zinc-800">
                <td className="px-2 py-1">{r.sample_id}</td>
                <td className="px-2 py-1">{r.crm_name}</td>
                <td className="px-2 py-1">{r.failed_variables.join(", ") || "—"}</td>
                <td className={`px-2 py-1 font-medium ${STATUS_BADGE[r.status]}`}>{r.status}</td>
                <td className="px-2 py-1">
                  {Object.keys(r.recovery_by_variable).map((v) => (
                    <button
                      key={v}
                      onClick={() => openControlChart(r.crm_name, v)}
                      className="mr-2 text-blue-400 hover:underline"
                    >
                      {v} chart
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </QaqcSection>

      <div className="mt-2 flex gap-3 text-zinc-700">
        <button disabled title="PDF export — blocked on PDF engine ADR">Export PDF</button>
      </div>
    </div>
  );
}

function QaqcSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-1 font-semibold text-zinc-300">{title}</p>
      {children}
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-700">
      <table className="min-w-full">
        <thead className="bg-zinc-850 text-zinc-400">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function EmptyRow() {
  return <p className="text-zinc-600">No hay registros.</p>;
}
