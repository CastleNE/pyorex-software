/**
 * Spectral Viewer — left: sample list/search; center: wavelength vs
 * reflectance plot (raw vs processed, overlay multiple); right: metadata,
 * features, interpretations, quality, processing history.
 */
import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { DARK_BG, FONT_COLOR, GRID_COLOR } from "@/components/analysis-results/shared";
import { getSpectrum, listSamples, listSpectraForSample, type SpectralSample, type SpectrumDetail } from "@/lib/spectrometry-api";
import { useSpectrometryStore } from "@/stores/spectrometry-store";

const TRACE_COLORS = ["#60a5fa", "#34d399", "#facc15", "#f87171", "#a78bfa", "#fb923c"];

export default function SpectralViewerWindow() {
  const { activeProject } = useSpectrometryStore();
  const [samples, setSamples] = useState<SpectralSample[]>([]);
  const [search, setSearch] = useState("");
  const [selectedSpectrumIds, setSelectedSpectrumIds] = useState<string[]>([]);
  const [spectraDetail, setSpectraDetail] = useState<Record<string, SpectrumDetail>>({});
  const [showProcessed, setShowProcessed] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProject) return;
    listSamples(activeProject.id).then((r) => {
      setSamples(r.samples);
      setLoading(false);
    });
  }, [activeProject]);

  async function selectSample(sampleId: string) {
    if (!activeProject) return;
    const { spectra } = await listSpectraForSample(activeProject.id, sampleId);
    const ids = spectra.map((s) => s.spectrum_id as string);
    setSelectedSpectrumIds(ids);
    for (const id of ids) {
      if (!spectraDetail[id]) {
        const detail = await getSpectrum(activeProject.id, id);
        setSpectraDetail((prev) => ({ ...prev, [id]: detail }));
      }
    }
  }

  const filteredSamples = useMemo(
    () => samples.filter((s) => !search || s.sample_id.toLowerCase().includes(search.toLowerCase())),
    [samples, search]
  );

  if (!activeProject) return null;
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const activeDetails = selectedSpectrumIds.map((id) => spectraDetail[id]).filter((d): d is SpectrumDetail => !!d && d.available);
  const primary = activeDetails[0];

  return (
    <div className="flex h-full overflow-hidden text-xs">
      <aside className="flex w-48 shrink-0 flex-col border-r border-zinc-700">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search samples…"
          className="m-2 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200"
        />
        <div className="flex-1 overflow-y-auto">
          {filteredSamples.map((s) => (
            <button
              key={s.sample_id}
              onClick={() => selectSample(s.sample_id)}
              className={`flex w-full items-center justify-between px-2 py-1 text-left ${
                selectedSpectrumIds.some((id) => spectraDetail[id]?.sample_id === s.sample_id)
                  ? "bg-blue-900/30 text-blue-300"
                  : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              <span className="truncate">{s.sample_id}</span>
              <span className="shrink-0 text-zinc-600">{s.spectra_count}</span>
            </button>
          ))}
          {filteredSamples.length === 0 && <p className="p-2 text-zinc-600">No samples found.</p>}
        </div>
      </aside>

      <main className="flex-1 overflow-hidden bg-zinc-900">
        {activeDetails.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-600">Select a sample to view its spectra.</div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 border-b border-zinc-700 px-2 py-1.5">
              <label className="flex items-center gap-1.5 text-zinc-400">
                <input type="checkbox" checked={showProcessed} onChange={(e) => setShowProcessed(e.target.checked)} className="accent-blue-500" />
                Show processed
              </label>
              <span className="text-zinc-600">{activeDetails.length} spectrum/spectra</span>
            </div>
            <div className="flex-1 overflow-hidden p-2">
              <Plot
                data={activeDetails.map((d, i) => ({
                  type: "scatter" as const,
                  mode: "lines" as const,
                  name: `${d.spectrum_id?.slice(0, 10)} ${showProcessed ? "(processed)" : "(raw)"}`,
                  x: showProcessed ? d.processed_wavelength : d.raw_wavelength,
                  y: showProcessed ? d.processed_reflectance : d.raw_reflectance,
                  line: { color: TRACE_COLORS[i % TRACE_COLORS.length] },
                }))}
                layout={{
                  paper_bgcolor: DARK_BG, plot_bgcolor: DARK_BG, font: { color: FONT_COLOR, size: 10 },
                  margin: { t: 10, r: 10, b: 40, l: 50 }, showlegend: true,
                  xaxis: { title: { text: "Wavelength (nm)" }, gridcolor: GRID_COLOR },
                  yaxis: { title: { text: "Reflectance" }, gridcolor: GRID_COLOR },
                }}
                config={{ responsive: true, displaylogo: false }}
                style={{ width: "100%", height: "100%" }}
                useResizeHandler
              />
            </div>
          </div>
        )}
      </main>

      {primary && (
        <aside className="w-56 shrink-0 overflow-y-auto border-l border-zinc-700 p-2">
          <p className="mb-1 font-semibold text-zinc-300">{primary.original_filename}</p>
          <p className="mb-2 text-zinc-500">
            {primary.instrument ?? "Unknown instrument"} · {primary.format}
          </p>
          <p className="mb-1 text-zinc-400">
            Quality: <span className="text-zinc-200">{primary.quality_status}</span>
          </p>
          {primary.applied_processing_steps && primary.applied_processing_steps.length > 0 && (
            <div className="mb-2">
              <p className="text-zinc-500">Processing:</p>
              <p className="text-zinc-400">{primary.applied_processing_steps.join(" → ")}</p>
            </div>
          )}
          {primary.features && primary.features.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 text-zinc-500">Features:</p>
              {primary.features.map((f) => (
                <p key={f.feature_id} className="text-zinc-400">
                  {f.preset_name}: {f.center?.toFixed(1)}nm (depth {f.depth?.toFixed(3)})
                </p>
              ))}
            </div>
          )}
          {primary.interpretations && primary.interpretations.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 text-zinc-500">Interpretations:</p>
              {primary.interpretations.map((it) => (
                <p key={it.interpretation_id} className="text-zinc-400">
                  {it.primary_mineral} <span className="text-zinc-600">({it.state})</span>
                </p>
              ))}
            </div>
          )}
          {primary.import_warnings && primary.import_warnings.length > 0 && (
            <div className="rounded-md border border-amber-800/60 bg-amber-950/40 p-1.5 text-amber-300">
              {primary.import_warnings.map((w, i) => (
                <p key={i}>⚠ {w}</p>
              ))}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
