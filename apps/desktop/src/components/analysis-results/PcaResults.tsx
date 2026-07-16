import Plot from "react-plotly.js";
import type { PcaResult } from "@/lib/data-api";
import { DARK_BG, FONT_COLOR, GRID_COLOR, StatCard, WarningsBanner, fmt } from "@/components/analysis-results/shared";

const SAMPLE_TYPE_COLORS: Record<string, string> = {
  S: "#71717a",
  FB: "#60a5fa",
  QB: "#a78bfa",
  FD: "#fb923c",
  QD: "#facc15",
  CRM: "#34d399",
  STD: "#34d399",
};
const DEFAULT_COLOR = "#71717a";

interface Props {
  result: PcaResult;
  onOpenInVisualization?: () => void;
}

export default function PcaResults({ result, onOpenInVisualization }: Props) {
  const pc1 = result.scores.map((row) => row[0] ?? null);
  const pc2 = result.scores.map((row) => row[1] ?? null);
  const pctVar = (i: number) => `${(result.explained_variance_ratio[i] * 100).toFixed(1)}%`;

  const groups = new Map<string, { x: number[]; y: number[] }>();
  result.sample_types.forEach((type, i) => {
    const key = type || "S";
    if (!groups.has(key)) groups.set(key, { x: [], y: [] });
    groups.get(key)!.x.push(pc1[i] ?? NaN);
    groups.get(key)!.y.push(pc2[i] ?? NaN);
  });

  return (
    <div className="flex flex-col gap-4">
      <WarningsBanner warnings={result.warnings} />
      {onOpenInVisualization && (
        <div className="flex justify-end">
          <button onClick={onOpenInVisualization} className="text-xs text-blue-400 hover:underline">
            Open in Visualization →
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="KMO global" value={result.kmo_global.toFixed(2)} />
        <StatCard label="Bartlett p-value" value={result.bartlett_p_value.toFixed(3)} />
        <StatCard label="Componentes (≥80%)" value={String(result.components_for_80pct)} />
      </div>

      <div className="rounded-md border border-zinc-700 p-2">
        <p className="text-xs font-semibold text-zinc-400 mb-1 px-1">Varianza explicada</p>
        <Plot
          data={[
            {
              type: "bar",
              name: "Individual",
              x: result.explained_variance_ratio.map((_, i) => `PC${i + 1}`),
              y: result.explained_variance_ratio,
              marker: { color: "#60a5fa" },
            },
            {
              type: "scatter",
              mode: "lines+markers",
              name: "Acumulada",
              x: result.cumulative_variance.map((_, i) => `PC${i + 1}`),
              y: result.cumulative_variance,
              line: { color: "#34d399" },
              yaxis: "y",
            },
          ]}
          layout={{
            paper_bgcolor: DARK_BG,
            plot_bgcolor: DARK_BG,
            font: { color: FONT_COLOR, size: 10 },
            margin: { t: 10, r: 10, b: 40, l: 40 },
            height: 260,
            showlegend: true,
            yaxis: { tickformat: ".0%", gridcolor: GRID_COLOR },
          }}
          config={{ responsive: true, displaylogo: false }}
          style={{ width: "100%" }}
        />
      </div>

      {result.n_components >= 2 && (
        <div className="rounded-md border border-zinc-700 p-2">
          <p className="text-xs font-semibold text-zinc-400 mb-1 px-1">
            Scores — PC1 ({pctVar(0)}) vs PC2 ({pctVar(1)})
          </p>
          <Plot
            data={Array.from(groups.entries()).map(([name, { x, y }]) => ({
              type: "scatter" as const,
              mode: "markers" as const,
              name,
              x,
              y,
              marker: { color: SAMPLE_TYPE_COLORS[name.toUpperCase()] ?? DEFAULT_COLOR, size: 6, opacity: 0.8 },
            }))}
            layout={{
              paper_bgcolor: DARK_BG,
              plot_bgcolor: DARK_BG,
              font: { color: FONT_COLOR, size: 10 },
              margin: { t: 10, r: 10, b: 40, l: 50 },
              height: 340,
              xaxis: { title: { text: `PC1 (${pctVar(0)})` }, gridcolor: GRID_COLOR, zerolinecolor: GRID_COLOR },
              yaxis: { title: { text: `PC2 (${pctVar(1)})` }, gridcolor: GRID_COLOR, zerolinecolor: GRID_COLOR },
            }}
            config={{ responsive: true, displaylogo: false }}
            style={{ width: "100%" }}
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-zinc-700">
        <table className="min-w-full text-xs">
          <thead className="bg-zinc-850 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Variable</th>
              {Array.from({ length: Math.min(result.n_components, 4) }, (_, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold">
                  PC{i + 1} loading
                </th>
              ))}
              <th className="px-3 py-2 text-left font-semibold">VIF</th>
            </tr>
          </thead>
          <tbody>
            {result.variables_used.map((v, i) => (
              <tr key={v} className="border-t border-zinc-800 text-zinc-300">
                <td className="px-3 py-1.5 font-medium">{v}</td>
                {Array.from({ length: Math.min(result.n_components, 4) }, (_, c) => (
                  <td key={c} className="px-3 py-1.5">
                    {fmt(result.loadings[i]?.[c])}
                  </td>
                ))}
                <td className={`px-3 py-1.5 ${result.vif[v] > 10 ? "text-amber-400" : ""}`}>{fmt(result.vif[v])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
