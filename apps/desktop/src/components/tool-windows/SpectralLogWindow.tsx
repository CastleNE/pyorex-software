/**
 * Spectral Log — depth-track view integrating spectral results with
 * drillhole intervals. Always reads current (is_current=true) interpretations
 * fresh, so editing an interpretation is reflected automatically.
 */
import { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { DARK_BG, FONT_COLOR, GRID_COLOR } from "@/components/analysis-results/shared";
import { getSpectralLogData, type SpectralSample, type SpectrumInterpretation } from "@/lib/spectrometry-api";
import { useSpectrometryStore } from "@/stores/spectrometry-store";

const MINERAL_COLORS: Record<string, string> = {};
const PALETTE = ["#60a5fa", "#34d399", "#facc15", "#f87171", "#a78bfa", "#fb923c", "#22d3ee"];
function colorFor(label: string): string {
  if (!MINERAL_COLORS[label]) {
    MINERAL_COLORS[label] = PALETTE[Object.keys(MINERAL_COLORS).length % PALETTE.length];
  }
  return MINERAL_COLORS[label];
}

export default function SpectralLogWindow() {
  const { activeProject } = useSpectrometryStore();
  const [samples, setSamples] = useState<SpectralSample[]>([]);
  const [interpretations, setInterpretations] = useState<SpectrumInterpretation[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    if (!activeProject) return;
    setLoading(true);
    getSpectralLogData(activeProject.id).then((r) => {
      setSamples(r.samples.filter((s) => s.from_m != null && s.to_m != null));
      setInterpretations(r.interpretations);
      setLoading(false);
    });
  }

  useEffect(load, [activeProject]);

  if (!activeProject) return null;
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }
  if (samples.length === 0) {
    return <div className="p-4 text-xs text-zinc-600">No samples with From/To depth intervals yet.</div>;
  }

  const interpByample = new Map(interpretations.map((it) => [it.sample_id, it]));
  const sorted = [...samples].sort((a, b) => (a.from_m ?? 0) - (b.from_m ?? 0));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-900 text-xs">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-700 px-2 py-1.5">
        <p className="text-zinc-500">{sorted.length} interval(s)</p>
        <button onClick={load} className="text-blue-400 hover:underline">Refresh</button>
      </div>
      <div className="flex-1 overflow-hidden p-2">
        <Plot
          data={sorted.map((s) => {
            const it = interpByample.get(s.sample_id);
            const label = it?.primary_mineral ?? "Unclassified";
            return {
              type: "bar" as const,
              orientation: "h" as const,
              name: label,
              y: [((s.from_m ?? 0) + (s.to_m ?? 0)) / 2],
              x: [(s.to_m ?? 0) - (s.from_m ?? 0)],
              base: [s.from_m ?? 0],
              marker: { color: colorFor(label) },
              hovertext: `${s.sample_id}: ${label}`,
              showlegend: false,
              width: [(s.to_m ?? 0) - (s.from_m ?? 0)],
            };
          })}
          layout={{
            paper_bgcolor: DARK_BG, plot_bgcolor: DARK_BG, font: { color: FONT_COLOR, size: 10 },
            margin: { t: 10, r: 10, b: 40, l: 60 }, barmode: "overlay",
            xaxis: { title: { text: "Primary mineral (bar length arbitrary)" }, gridcolor: GRID_COLOR },
            yaxis: { title: { text: "Depth (m)" }, gridcolor: GRID_COLOR, autorange: "reversed" },
          }}
          config={{ responsive: true, displaylogo: false }}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </div>
    </div>
  );
}
