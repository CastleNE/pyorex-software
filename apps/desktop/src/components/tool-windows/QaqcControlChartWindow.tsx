/**
 * Shewhart control chart for one CRM×variable pair (RF-10.5). Mean/±1σ/±2σ/±3σ
 * are computed from the historical recovery series itself, not certified
 * values — see analysis/qaqc/control_charts.py::build_shewhart_chart.
 */
import { useEffect, useState } from "react";
import Plot from "@/components/ThemedPlot";
import { qaqcControlChart, type ControlChartResult } from "@/lib/data-api";
import { DARK_BG, FONT_COLOR, GRID_COLOR } from "@/components/analysis-results/shared";
import { useL } from "@/lib/i18n";

interface Props {
  datasetId: string;
  crmName: string;
  variable: string;
}

const STATUS_COLOR: Record<string, string> = { pass: "#34d399", warning: "#facc15", fail: "#f87171" };

export default function QaqcControlChartWindow({ datasetId, crmName, variable }: Props) {
  const L = useL();
  const [chart, setChart] = useState<ControlChartResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    qaqcControlChart(datasetId, crmName, variable)
      .then(setChart)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [datasetId, crmName, variable]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }
  if (error) {
    return <div className="p-4 text-xs text-danger">{error}</div>;
  }
  if (!chart || !chart.available) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-xs">
        <p className="text-subtle">{chart?.reason ?? L({ es: "No hay datos suficientes.", en: "Not enough data." })}</p>
      </div>
    );
  }

  const points = chart.points ?? [];
  const x = points.map((p) => p.index);
  const y = points.map((p) => p.recovery_pct);
  const colors = points.map((p) => STATUS_COLOR[p.status] ?? "#a1a1aa");
  const text = points.map((p) => p.sample_id);

  const hlines = [
    { y: chart.mean, color: "#a1a1aa", dash: "solid" },
    { y: chart.ucl_1s, color: "#71717a", dash: "dot" },
    { y: chart.lcl_1s, color: "#71717a", dash: "dot" },
    { y: chart.ucl_2s, color: "#facc15", dash: "dash" },
    { y: chart.lcl_2s, color: "#facc15", dash: "dash" },
    { y: chart.ucl_3s, color: "#f87171", dash: "dash" },
    { y: chart.lcl_3s, color: "#f87171", dash: "dash" },
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-app p-3 text-xs">
      <p className="mb-2 text-muted">
        {crmName} — {variable} · {chart.n_points ?? points.length} {L({ es: "puntos", en: "points" })}
      </p>
      <Plot
        data={[
          {
            type: "scatter",
            mode: "lines+markers",
            x,
            y,
            text,
            marker: { color: colors, size: 8 },
            line: { color: "#3f3f46", width: 1 },
          },
        ]}
        layout={{
          paper_bgcolor: DARK_BG,
          plot_bgcolor: DARK_BG,
          font: { color: FONT_COLOR, size: 10 },
          margin: { t: 10, r: 10, b: 40, l: 50 },
          height: 320,
          xaxis: { title: { text: L({ es: "Orden cronológico", en: "Chronological order" }) }, gridcolor: GRID_COLOR, zerolinecolor: GRID_COLOR },
          yaxis: { title: { text: L({ es: "% Recuperación", en: "%Recovery" }) }, gridcolor: GRID_COLOR, zerolinecolor: GRID_COLOR },
          shapes: hlines.map((h) => ({
            type: "line",
            x0: 0,
            x1: 1,
            xref: "paper",
            y0: h.y,
            y1: h.y,
            line: { color: h.color, width: 1, dash: h.dash as "solid" | "dot" | "dash" },
          })),
        }}
        config={{ responsive: true, displaylogo: false }}
        style={{ width: "100%" }}
      />
      {chart.westgard_violations && chart.westgard_violations.length > 0 && (
        <div className="mt-2 space-y-1 rounded-md border border-warning-line/60 bg-warning-soft/40 px-3 py-2 text-warning">
          {chart.westgard_violations.map((v, i) => (
            <p key={i}>
              ⚠ [{v.rule}] {v.description}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
