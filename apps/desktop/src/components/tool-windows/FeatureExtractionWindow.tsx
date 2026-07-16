/**
 * Feature Extraction — generic continuum-removed band-feature extraction
 * (center/depth/width/area/asymmetry) over a preset or custom window, batch
 * across selected spectra.
 */
import { useEffect, useState } from "react";
import {
  extractFeatures,
  listFeaturePresets,
  listSamples,
  listSpectraForSample,
  type FeaturePreset,
  type SpectralSample,
  type SpectrumFeature,
} from "@/lib/spectrometry-api";
import { useSpectrometryStore } from "@/stores/spectrometry-store";

export default function FeatureExtractionWindow() {
  const { activeProject } = useSpectrometryStore();
  const [samples, setSamples] = useState<SpectralSample[]>([]);
  const [presets, setPresets] = useState<Record<string, FeaturePreset>>({});
  const [selectedSpectrumIds, setSelectedSpectrumIds] = useState<string[]>([]);
  const [presetName, setPresetName] = useState("");
  const [customMin, setCustomMin] = useState("2150");
  const [customMax, setCustomMax] = useState("2230");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SpectrumFeature[]>([]);

  useEffect(() => {
    if (!activeProject) return;
    listSamples(activeProject.id).then((r) => setSamples(r.samples));
    listFeaturePresets(activeProject.id).then((r) => {
      setPresets(r.presets);
      setPresetName(Object.keys(r.presets)[0] ?? "");
    });
  }, [activeProject]);

  async function toggleSample(sampleId: string) {
    if (!activeProject) return;
    const { spectra } = await listSpectraForSample(activeProject.id, sampleId);
    const ids = spectra.map((s) => s.spectrum_id as string);
    setSelectedSpectrumIds((prev) => {
      const allIncluded = ids.every((id) => prev.includes(id));
      return allIncluded ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]));
    });
  }

  async function handleExtract() {
    if (!activeProject || selectedSpectrumIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const opts = presetName
        ? { presetName }
        : { window: [Number(customMin), Number(customMax)] as [number, number] };
      const res = await extractFeatures(activeProject.id, selectedSpectrumIds, opts);
      setResults(res.results);
      if (res.failures.length > 0) setError(`${res.failures.length} spectrum/spectra failed extraction.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!activeProject) return null;

  return (
    <div className="flex h-full overflow-hidden text-xs">
      <aside className="w-48 shrink-0 overflow-y-auto border-r border-zinc-700 p-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Samples</p>
        {samples.map((s) => (
          <label key={s.sample_id} className="flex items-center gap-1.5 py-0.5 text-zinc-300">
            <input type="checkbox" onChange={() => toggleSample(s.sample_id)} className="accent-blue-500" />
            <span className="truncate">{s.sample_id}</span>
          </label>
        ))}
      </aside>

      <div className="flex w-56 shrink-0 flex-col gap-2 border-r border-zinc-700 p-2.5">
        <p className="text-zinc-500">{selectedSpectrumIds.length} spectrum/spectra selected</p>
        <label className="text-zinc-400">Preset</label>
        <select value={presetName} onChange={(e) => setPresetName(e.target.value)} className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200">
          <option value="">— custom window —</option>
          {Object.entries(presets).map(([id, p]) => (
            <option key={id} value={id}>{p.label}</option>
          ))}
        </select>
        {!presetName && (
          <div className="flex gap-2">
            <input value={customMin} onChange={(e) => setCustomMin(e.target.value)} className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200" placeholder="min nm" />
            <input value={customMax} onChange={(e) => setCustomMax(e.target.value)} className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200" placeholder="max nm" />
          </div>
        )}
        <button
          onClick={handleExtract}
          disabled={loading || selectedSpectrumIds.length === 0}
          className="mt-auto rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {loading ? "Extracting…" : "Run Extraction"}
        </button>
        {error && <p className="text-amber-400">{error}</p>}
      </div>

      <main className="flex-1 overflow-y-auto bg-zinc-900 p-2">
        {results.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-600">Select samples and run extraction.</div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-zinc-700">
            <table className="min-w-full">
              <thead className="bg-zinc-850 text-zinc-400">
                <tr>
                  {["Spectrum", "Center (nm)", "Depth", "FWHM", "Area", "Asymmetry", "Quality"].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.feature_id} className="border-t border-zinc-800">
                    <td className="px-2 py-1 font-mono">{r.spectrum_id.slice(0, 14)}</td>
                    <td className="px-2 py-1">{r.center?.toFixed(2) ?? "—"}</td>
                    <td className="px-2 py-1">{r.depth?.toFixed(4) ?? "—"}</td>
                    <td className="px-2 py-1">{r.width_fwhm?.toFixed(2) ?? "—"}</td>
                    <td className="px-2 py-1">{r.area?.toFixed(4) ?? "—"}</td>
                    <td className="px-2 py-1">{r.asymmetry?.toFixed(3) ?? "—"}</td>
                    <td className={`px-2 py-1 ${r.quality_indicator === "ok" ? "text-emerald-400" : "text-amber-400"}`}>{r.quality_indicator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
