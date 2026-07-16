import Plot from "react-plotly.js";
import type { DescriptiveResult } from "@/lib/data-api";
import { DARK_BG, FONT_COLOR, WarningsBanner, fmt } from "@/components/analysis-results/shared";

interface Props {
  result: DescriptiveResult;
  onOpenInVisualization?: () => void;
}

export default function DescriptiveResults({ result, onOpenInVisualization }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <WarningsBanner warnings={result.warnings} />
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">n = {result.n_samples_used.toLocaleString()} muestras usadas</p>
        {onOpenInVisualization && (
          <button onClick={onOpenInVisualization} className="text-xs text-blue-400 hover:underline">
            Open in Visualization →
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-zinc-700">
        <table className="min-w-full text-xs">
          <thead className="bg-zinc-850 text-zinc-400">
            <tr>
              {["Variable", "N", "Nulls", "Mean", "Median", "Std", "Min", "Max", "Skewness", "Normal (Shapiro p)"].map(
                (h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {result.stats.map((s) => (
              <tr key={s.variable} className="border-t border-zinc-800 text-zinc-300">
                <td className="px-3 py-1.5 font-medium">{s.variable}</td>
                <td className="px-3 py-1.5">{s.n}</td>
                <td className="px-3 py-1.5">{s.n_nulls}</td>
                <td className="px-3 py-1.5">{fmt(s.mean)}</td>
                <td className="px-3 py-1.5">{fmt(s.median)}</td>
                <td className="px-3 py-1.5">{fmt(s.std)}</td>
                <td className="px-3 py-1.5">{fmt(s.min)}</td>
                <td className="px-3 py-1.5">{fmt(s.max)}</td>
                <td className="px-3 py-1.5">{fmt(s.skewness)}</td>
                <td className="px-3 py-1.5">
                  {s.shapiro_p == null ? (
                    <span className="text-zinc-600">—</span>
                  ) : (
                    <span className={s.normal ? "text-emerald-400" : "text-amber-400"}>
                      {s.normal ? "Sí" : "No"} (p={fmt(s.shapiro_p)})
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.correlation.variables.length >= 2 && (
        <div className="rounded-md border border-zinc-700 p-2">
          <p className="text-xs font-semibold text-zinc-400 mb-1 px-1">Correlación (Spearman)</p>
          <Plot
            data={[
              {
                type: "heatmap",
                z: result.correlation.matrix,
                x: result.correlation.variables,
                y: result.correlation.variables,
                zmin: -1,
                zmax: 1,
                colorscale: "RdBu",
                reversescale: true,
              },
            ]}
            layout={{
              paper_bgcolor: DARK_BG,
              plot_bgcolor: DARK_BG,
              font: { color: FONT_COLOR, size: 10 },
              margin: { t: 10, r: 10, b: 60, l: 80 },
              height: 320,
            }}
            config={{ responsive: true, displaylogo: false }}
            style={{ width: "100%" }}
          />
        </div>
      )}
    </div>
  );
}
