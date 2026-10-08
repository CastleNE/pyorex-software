/**
 * TAS Diagram — SiO2 series classification (see analysis/lithogeochemistry/
 * tas.py for the reduced-scope rationale: Le Maitre SiO2 boundaries only,
 * not yet the full Le Bas et al. 1986 15-field polygon diagram, which needs
 * verified reference coordinates before it can be implemented responsibly).
 */
import { useEffect, useMemo, useState } from "react";
import Plot from "@/components/ThemedPlot";
import type { Data, Layout } from "plotly.js";
import { tasClassify, type TasClassifyResult, type TasSeries } from "@/lib/lithogeochemistry-api";
import { useDatasetStore } from "@/stores/dataset-store";

interface Props {
  datasetId: string;
}

const DARK_BG = "#18181b";
const GRID_COLOR = "#3f3f46";
const FONT_COLOR = "#d4d4d8";

const SERIES_COLORS: Record<TasSeries, string> = {
  Ultrabasic: "#34d399",
  Basic: "#60a5fa",
  Intermediate: "#fbbf24",
  Acid: "#f87171",
  Invalid: "#71717a",
};

function guessColumn(names: string[], pattern: RegExp): string {
  return names.find((n) => pattern.test(n)) ?? names[0] ?? "";
}

export default function TasDiagramWindow({ datasetId }: Props) {
  const dataset = useDatasetStore((s) => s.dataset);
  const numericColumns = useMemo(
    () => (dataset?.columns ?? []).filter((c) => c.dataType === "numeric").map((c) => c.name),
    [dataset]
  );

  const [sio2Col, setSio2Col] = useState(() => guessColumn(numericColumns, /SiO2/i));
  const [na2oCol, setNa2oCol] = useState(() => guessColumn(numericColumns, /Na2O/i));
  const [k2oCol, setK2oCol] = useState(() => guessColumn(numericColumns, /K2O/i));
  const [result, setResult] = useState<TasClassifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSio2Col((c) => c || guessColumn(numericColumns, /SiO2/i));
    setNa2oCol((c) => c || guessColumn(numericColumns, /Na2O/i));
    setK2oCol((c) => c || guessColumn(numericColumns, /K2O/i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericColumns.length]);

  function classify() {
    if (!sio2Col || !na2oCol || !k2oCol) return;
    setLoading(true);
    setError(null);
    tasClassify(datasetId, sio2Col, na2oCol, k2oCol)
      .then(setResult)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  const { data, layout } = useMemo<{ data: Data[]; layout: Partial<Layout> }>(() => {
    if (!result) return { data: [], layout: {} };
    const seriesOrder: TasSeries[] = ["Ultrabasic", "Basic", "Intermediate", "Acid", "Invalid"];
    const traces = seriesOrder
      .map((series): Data | null => {
        const pts = result.samples.filter((s) => s.series === series && s.sio2 != null && s.total_alkali != null);
        if (pts.length === 0) return null;
        return {
          type: "scatter",
          mode: "markers",
          name: `${series} (${pts.length})`,
          x: pts.map((p) => p.sio2),
          y: pts.map((p) => p.total_alkali),
          text: pts.map((p) => p.sample_id),
          marker: { color: SERIES_COLORS[series], size: 6 },
        };
      })
      .filter((t): t is Data => t !== null);

    const shapes = result.series_boundaries.map((x) => ({
      type: "line" as const,
      x0: x,
      x1: x,
      y0: 0,
      y1: 1,
      yref: "paper" as const,
      line: { color: GRID_COLOR, dash: "dash" as const, width: 1 },
    }));

    return {
      data: traces,
      layout: {
        paper_bgcolor: DARK_BG,
        plot_bgcolor: DARK_BG,
        font: { color: FONT_COLOR, family: "Inter, system-ui, sans-serif", size: 11 },
        margin: { t: 20, r: 15, b: 45, l: 50 },
        legend: { orientation: "h", y: -0.2 },
        shapes,
        xaxis: { title: { text: "SiO2 (wt%)" }, gridcolor: GRID_COLOR, zerolinecolor: GRID_COLOR },
        yaxis: { title: { text: "Na2O + K2O (wt%)" }, gridcolor: GRID_COLOR, zerolinecolor: GRID_COLOR },
      },
    };
  }, [result]);

  if (!dataset) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-900 text-xs">
      <div className="shrink-0 border-b border-zinc-800 bg-amber-900/20 px-3 py-1.5 text-[10px] text-amber-300">
        Approximate — SiO2 series classification (Le Maitre bounds). Full IUGS field diagram (Le Bas et al. 1986)
        pending verified reference data.
      </div>

      <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-zinc-800 px-3 py-2">
        <ColumnPicker label="SiO2" value={sio2Col} options={numericColumns} onChange={setSio2Col} />
        <ColumnPicker label="Na2O" value={na2oCol} options={numericColumns} onChange={setNa2oCol} />
        <ColumnPicker label="K2O" value={k2oCol} options={numericColumns} onChange={setK2oCol} />
        <button
          onClick={classify}
          disabled={!sio2Col || !na2oCol || !k2oCol || loading}
          className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Classifying…" : "Classify"}
        </button>
      </div>

      {error && <p className="px-3 py-2 text-red-400">{error}</p>}

      {!result && !error && (
        <div className="flex flex-1 items-center justify-center text-zinc-600">
          Pick SiO2/Na2O/K2O columns and click Classify.
        </div>
      )}

      {result && (
        <div className="min-h-0 flex-1">
          <Plot data={data} layout={layout} config={{ responsive: true, displaylogo: false }} style={{ width: "100%", height: "100%" }} useResizeHandler />
        </div>
      )}
    </div>
  );
}

function ColumnPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-36 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-1 text-zinc-200"
      >
        {options.length === 0 && <option value="">No numeric columns</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
