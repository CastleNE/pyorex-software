/**
 * Spectral Indices — formula editor (REFLECTANCE(wl), DEPTH(feature_preset))
 * templated on CalculatedColumnWindow.tsx's preview+commit UX. Also serves
 * as "Hydration Parameters" (filtered to H2O/OH presets).
 */
import { useEffect, useState } from "react";
import {
  computeIndices,
  listIndexPresets,
  listSamples,
  listSpectraForSample,
  previewIndexFormula,
  saveIndexPreset,
  type IndexPreset,
  type SpectralIndexResult,
  type SpectralSample,
} from "@/lib/spectrometry-api";
import { useSpectrometryStore } from "@/stores/spectrometry-store";

const HYDRATION_PRESET_NAMES = new Set(["H2O", "OH"]);

interface Props {
  filter?: string; // "hydration" to only show H2O/OH presets
}

export default function SpectralIndicesWindow({ filter }: Props) {
  const { activeProject } = useSpectrometryStore();
  const [samples, setSamples] = useState<SpectralSample[]>([]);
  const [presets, setPresets] = useState<Record<string, IndexPreset>>({});
  const [selectedSpectrumIds, setSelectedSpectrumIds] = useState<string[]>([]);
  const [indexName, setIndexName] = useState("");
  const [formula, setFormula] = useState("");
  const [saveAsName, setSaveAsName] = useState("");
  const [previewSpectrumId, setPreviewSpectrumId] = useState<string | null>(null);
  const [previewValue, setPreviewValue] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SpectralIndexResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeProject) return;
    listSamples(activeProject.id).then((r) => setSamples(r.samples));
    listIndexPresets(activeProject.id).then((r) => setPresets(r.presets));
  }, [activeProject]);

  const visiblePresets = filter === "hydration"
    ? Object.fromEntries(Object.entries(presets).filter(([name]) => HYDRATION_PRESET_NAMES.has(name)))
    : presets;

  async function toggleSample(sampleId: string) {
    if (!activeProject) return;
    const { spectra } = await listSpectraForSample(activeProject.id, sampleId);
    const ids = spectra.map((s) => s.spectrum_id as string);
    setSelectedSpectrumIds((prev) => {
      const allIncluded = ids.every((id) => prev.includes(id));
      const next = allIncluded ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]));
      if (!previewSpectrumId && next.length > 0) setPreviewSpectrumId(next[0]);
      return next;
    });
  }

  function selectPreset(name: string) {
    setIndexName(name);
    setFormula(presets[name]?.formula ?? "");
  }

  async function handlePreview() {
    if (!activeProject || !previewSpectrumId || !formula.trim()) return;
    setError(null);
    try {
      const result = await previewIndexFormula(activeProject.id, previewSpectrumId, formula);
      setPreviewValue(result.value);
    } catch (e) {
      setError(String(e));
      setPreviewValue(null);
    }
  }

  async function handleSavePreset() {
    if (!activeProject || !saveAsName.trim() || !formula.trim()) return;
    await saveIndexPreset(activeProject.id, saveAsName.trim(), formula);
    const r = await listIndexPresets(activeProject.id);
    setPresets(r.presets);
    setSaveAsName("");
  }

  async function handleCompute() {
    if (!activeProject || selectedSpectrumIds.length === 0 || !formula.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await computeIndices(activeProject.id, selectedSpectrumIds, { indexName: indexName || "custom", formula });
      setResults(res.results);
      if (res.failures.length > 0) setError(`${res.failures.length} spectrum/spectra failed.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!activeProject) return null;

  return (
    <div className="flex h-full overflow-hidden text-xs">
      <aside className="w-44 shrink-0 overflow-y-auto border-r border-zinc-700 p-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Presets</p>
        {Object.entries(visiblePresets).map(([name, p]) => (
          <button key={name} onClick={() => selectPreset(name)} className="mb-2 block w-full rounded border border-zinc-700 px-2 py-1 text-left text-zinc-300 hover:bg-zinc-800">
            <span className="block font-medium">{name}</span>
            <span className="block truncate font-mono text-[10px] text-zinc-500">{p.formula}</span>
          </button>
        ))}
        <p className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Samples</p>
        {samples.map((s) => (
          <label key={s.sample_id} className="flex items-center gap-1.5 py-0.5 text-zinc-300">
            <input type="checkbox" onChange={() => toggleSample(s.sample_id)} className="accent-blue-500" />
            <span className="truncate">{s.sample_id}</span>
          </label>
        ))}
      </aside>

      <div className="flex w-72 shrink-0 flex-col gap-2 border-r border-zinc-700 p-2.5">
        <label className="text-zinc-400">Index name</label>
        <input value={indexName} onChange={(e) => setIndexName(e.target.value)} className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200" />
        <label className="text-zinc-400">Formula</label>
        <textarea
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          rows={3}
          placeholder="REFLECTANCE(2160) / REFLECTANCE(2190)"
          className="resize-none rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-zinc-200"
        />
        <div className="flex gap-2">
          <button onClick={handlePreview} disabled={!previewSpectrumId} className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40">
            Preview
          </button>
          <span className="self-center text-zinc-500">{previewValue != null ? `= ${previewValue.toFixed(4)}` : ""}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <input value={saveAsName} onChange={(e) => setSaveAsName(e.target.value)} placeholder="Save as preset…" className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200" />
          <button onClick={handleSavePreset} className="rounded border border-zinc-700 px-2 py-1 text-zinc-400 hover:bg-zinc-800">Save</button>
        </div>
        <button
          onClick={handleCompute}
          disabled={loading || selectedSpectrumIds.length === 0 || !formula.trim()}
          className="mt-auto rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {loading ? "Computing…" : `Compute for ${selectedSpectrumIds.length} spectrum/spectra`}
        </button>
        {error && <p className="text-amber-400">{error}</p>}
      </div>

      <main className="flex-1 overflow-y-auto bg-zinc-900 p-2">
        {results.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-600">Select spectra, enter/pick a formula, and compute.</div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-zinc-700">
            <table className="min-w-full">
              <thead className="bg-zinc-850 text-zinc-400">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">Spectrum</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Index</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.index_id} className="border-t border-zinc-800">
                    <td className="px-2 py-1 font-mono">{r.spectrum_id.slice(0, 14)}</td>
                    <td className="px-2 py-1">{r.index_name}</td>
                    <td className="px-2 py-1">{r.result.toFixed(4)}</td>
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
