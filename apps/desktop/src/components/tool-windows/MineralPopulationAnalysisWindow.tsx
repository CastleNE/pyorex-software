/**
 * White Mica / Chlorite Analysis — ONE generic component parametrized by
 * analysisId, backed by the same classify_population() building block on
 * the backend (see mineral_population.py). Results are explicitly spectral
 * proxies, not direct chemical analyses.
 */
import { useEffect, useState } from "react";
import Plot from "@/components/ThemedPlot";
import { SERIES } from "@/lib/mineral-colors";
import { DARK_BG, FONT_COLOR, GRID_COLOR } from "@/components/analysis-results/shared";
import { analyzeChlorite, analyzeWhiteMica, type PopulationResult } from "@/lib/spectrometry-api";
import { useSpectrometryStore } from "@/stores/spectrometry-store";

interface Props {
  analysisId: "white-mica" | "chlorite";
}

const CLASS_COLORS = SERIES;

export default function MineralPopulationAnalysisWindow({ analysisId }: Props) {
  const { activeProject } = useSpectrometryStore();
  const [results, setResults] = useState<PopulationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const title = analysisId === "white-mica" ? "White Mica Analysis" : "Chlorite Analysis";

  useEffect(() => {
    if (!activeProject) return;
    setLoading(true);
    const call = analysisId === "white-mica" ? analyzeWhiteMica : analyzeChlorite;
    call(activeProject.id)
      .then((r) => setResults(r.results))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [activeProject, analysisId]);

  if (!activeProject) return null;
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }
  if (error) return <div className="p-4 text-xs text-red-400">{error}</div>;

  const classes = Array.from(new Set(results.map((r) => r.spectral_class).filter((c): c is string => !!c)));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-900 text-xs">
      <p className="shrink-0 border-b border-zinc-700 px-3 py-2 text-zinc-500">
        {title} — spectral proxy classification, not a direct chemical analysis. {results.length} sample(s).
      </p>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 overflow-hidden p-2">
          <Plot
            data={classes.map((cls, i) => {
              const subset = results.filter((r) => r.spectral_class === cls);
              return {
                type: "scatter" as const,
                mode: "markers" as const,
                name: cls,
                x: subset.map((r) => r.diagnostic_position ?? 0),
                y: subset.map((r) => r.from_m ?? 0),
                marker: { color: CLASS_COLORS[i % CLASS_COLORS.length], size: 8 },
              };
            })}
            layout={{
              paper_bgcolor: DARK_BG, plot_bgcolor: DARK_BG, font: { color: FONT_COLOR, size: 10 },
              margin: { t: 10, r: 10, b: 40, l: 50 }, showlegend: true,
              xaxis: { title: { text: "Diagnostic position (nm)" }, gridcolor: GRID_COLOR },
              yaxis: { title: { text: "Depth (From, m)" }, gridcolor: GRID_COLOR, autorange: "reversed" },
            }}
            config={{ responsive: true, displaylogo: false }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
          />
        </div>

        <div className="w-1/2 overflow-y-auto border-l border-zinc-700 p-2">
          <table className="min-w-full">
            <thead className="bg-zinc-850 text-zinc-400">
              <tr>
                {["Sample", "Drillhole", "From-To", "Position", "Class"].map((h) => (
                  <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.spectrum_id} className="border-t border-zinc-800">
                  <td className="px-2 py-1">{r.sample_id}</td>
                  <td className="px-2 py-1">{r.drillhole_id ?? "—"}</td>
                  <td className="px-2 py-1">{r.from_m ?? "—"}-{r.to_m ?? "—"}</td>
                  <td className="px-2 py-1">{r.diagnostic_position?.toFixed(1) ?? "—"}</td>
                  <td className="px-2 py-1 text-zinc-300">{r.spectral_class ?? "unclassified"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
