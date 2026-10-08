/**
 * Spectral Log — depth-track view integrating spectral results with
 * drillhole intervals. Always reads current (is_current=true) interpretations
 * fresh, so editing an interpretation is reflected automatically.
 */
import { useEffect, useState } from "react";
import Plot from "@/components/ThemedPlot";
import { mineralColor } from "@/lib/mineral-colors";
import { GRID_COLOR } from "@/components/analysis-results/shared";
import { getSpectralLogData, type SpectralSample, type SpectrumInterpretation } from "@/lib/spectrometry-api";
import { useSpectrometryStore } from "@/stores/spectrometry-store";

// Fixed alteration-mineral colours (design system `min-*`), stable across windows.
const colorFor = (label: string) => mineralColor(label);

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

  // One trace per mineral so the legend doubles as the mineral key.
  const byMineral = new Map<string, SpectralSample[]>();
  for (const s of sorted) {
    const label = interpByample.get(s.sample_id)?.primary_mineral ?? "Unclassified";
    byMineral.set(label, [...(byMineral.get(label) ?? []), s]);
  }
  const stripTraces = [...byMineral.entries()].map(([label, rows]) => ({
    type: "bar" as const,
    orientation: "h" as const,
    name: label,
    y: rows.map((s) => ((s.from_m ?? 0) + (s.to_m ?? 0)) / 2),
    x: rows.map(() => 1),
    base: rows.map(() => 0),
    width: rows.map((s) => (s.to_m ?? 0) - (s.from_m ?? 0)),
    marker: { color: colorFor(label), line: { width: 0 } },
    hovertext: rows.map((s) => `${s.sample_id} · ${s.from_m}–${s.to_m} m · ${label}`),
    hoverinfo: "text" as const,
  }));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-900 text-xs">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-700 px-2 py-1.5">
        <p className="text-muted"><span className="tabular font-mono">{sorted.length}</span> intervalos · color = mineral principal</p>
        <button onClick={load} className="text-accent-fg hover:underline">Actualizar</button>
      </div>
      <div className="flex-1 overflow-hidden p-2">
        <Plot
          data={stripTraces}
          layout={{
            margin: { t: 10, r: 10, b: 10, l: 60 },
            barmode: "overlay",
            bargap: 0,
            showlegend: true,
            legend: { orientation: "v", x: 1.02, y: 1, font: { size: 11 } },
            hovermode: "closest",
            // A strip log: one column, colour = primary mineral (design-system min-* palette).
            xaxis: { visible: false, range: [0, 1], fixedrange: true },
            yaxis: { title: { text: "Profundidad (m)" }, gridcolor: GRID_COLOR, autorange: "reversed", zeroline: false },
          }}
          config={{ responsive: true, displaylogo: false }}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </div>
    </div>
  );
}
