/**
 * Spectral Preprocessing — non-destructive ops-log overlay (see
 * services/analytics/analysis/spectrometry/preprocessing_overlay.py). Every
 * operation preserves the original, is undoable, and can apply to a single
 * spectrum or the whole project. Params are entered as JSON (power-user
 * friendly, avoids 13 bespoke forms for 13 different operations).
 */
import { useEffect, useState } from "react";
import Plot from "@/components/ThemedPlot";
import { DARK_BG, FONT_COLOR, GRID_COLOR } from "@/components/analysis-results/shared";
import {
  applyPreprocessingOp,
  getPreprocessingOps,
  getSpectrum,
  listSamples,
  listSpectraForSample,
  previewPreprocessing,
  redoPreprocessing,
  undoPreprocessing,
  type OverlayEntry,
  type PreprocessingOpType,
  type SpectralSample,
} from "@/lib/spectrometry-api";
import { useSpectrometryStore } from "@/stores/spectrometry-store";

const OP_TYPES: PreprocessingOpType[] = [
  "remove_invalid_values", "select_range", "remove_bands", "interpolate_gaps", "smooth", "normalize",
  "baseline_correct", "continuum_remove", "reflectance_to_absorbance", "absorbance_to_reflectance",
  "derivative", "correct_splice", "resample",
];

const OP_PARAM_HINTS: Record<PreprocessingOpType, string> = {
  remove_invalid_values: "{}",
  select_range: '{"wl_min": 2100, "wl_max": 2400}',
  remove_bands: '{"ranges": [[1350,1450]]}',
  interpolate_gaps: "{}",
  smooth: '{"window_length": 11, "polyorder": 2}',
  normalize: '{"method": "minmax"}',
  baseline_correct: "{}",
  continuum_remove: '{"method": "convex_hull"}',
  reflectance_to_absorbance: "{}",
  absorbance_to_reflectance: "{}",
  derivative: '{"order": 1}',
  correct_splice: '{"splice_wavelengths": [1000, 1830]}',
  resample: '{"target_wl": [2100,2110,2120]}',
};

export default function PreprocessingWindow() {
  const { activeProject } = useSpectrometryStore();
  const [samples, setSamples] = useState<SpectralSample[]>([]);
  const [spectrumId, setSpectrumId] = useState<string | null>(null);
  const [opType, setOpType] = useState<PreprocessingOpType>("continuum_remove");
  const [paramsText, setParamsText] = useState(OP_PARAM_HINTS[opType]);
  const [applyToAll, setApplyToAll] = useState(false);
  const [preview, setPreview] = useState<{ wavelength: number[]; reflectance: number[] } | null>(null);
  const [rawPreview, setRawPreview] = useState<{ wavelength: number[]; reflectance: number[] } | null>(null);
  const [overlay, setOverlay] = useState<{ ops: OverlayEntry[]; redo_stack: OverlayEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProject) return;
    listSamples(activeProject.id).then((r) => setSamples(r.samples));
    refreshOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject]);

  function refreshOverlay() {
    if (!activeProject) return;
    getPreprocessingOps(activeProject.id).then(setOverlay);
  }

  async function selectSpectrum(sampleId: string) {
    if (!activeProject) return;
    const { spectra } = await listSpectraForSample(activeProject.id, sampleId);
    const id = spectra[0]?.spectrum_id as string | undefined;
    if (!id) return;
    setSpectrumId(id);
    const detail = await getSpectrum(activeProject.id, id);
    if (detail.available) setRawPreview({ wavelength: detail.processed_wavelength!, reflectance: detail.processed_reflectance! });
  }

  async function handlePreview() {
    if (!activeProject || !spectrumId) return;
    setError(null);
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(paramsText);
    } catch {
      setError("Params must be valid JSON");
      return;
    }
    const result = await previewPreprocessing(activeProject.id, spectrumId, opType, params);
    if (!result.available) {
      setError(result.reason ?? "Preview failed");
      return;
    }
    setPreview({ wavelength: result.wavelength!, reflectance: result.reflectance! });
  }

  async function handleApply() {
    if (!activeProject || !spectrumId) return;
    setError(null);
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(paramsText);
    } catch {
      setError("Params must be valid JSON");
      return;
    }
    try {
      await applyPreprocessingOp(activeProject.id, opType, params, applyToAll ? { all: true } : { spectrum_ids: [spectrumId] });
      refreshOverlay();
      const detail = await getSpectrum(activeProject.id, spectrumId);
      if (detail.available) setRawPreview({ wavelength: detail.processed_wavelength!, reflectance: detail.processed_reflectance! });
      setPreview(null);
    } catch (e) {
      setError(String(e));
    }
  }

  if (!activeProject) return null;

  return (
    <div className="flex h-full overflow-hidden text-xs">
      <aside className="w-40 shrink-0 overflow-y-auto border-r border-zinc-700 p-2">
        {samples.map((s) => (
          <button
            key={s.sample_id}
            onClick={() => selectSpectrum(s.sample_id)}
            className="block w-full truncate rounded px-1.5 py-0.5 text-left text-zinc-300 hover:bg-zinc-800"
          >
            {s.sample_id}
          </button>
        ))}
      </aside>

      <div className="flex w-64 shrink-0 flex-col gap-2 border-r border-zinc-700 p-2.5">
        <label className="text-zinc-400">Operation</label>
        <select
          value={opType}
          onChange={(e) => {
            const t = e.target.value as PreprocessingOpType;
            setOpType(t);
            setParamsText(OP_PARAM_HINTS[t]);
          }}
          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200"
        >
          {OP_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="text-zinc-400">Params (JSON)</label>
        <textarea
          value={paramsText}
          onChange={(e) => setParamsText(e.target.value)}
          rows={4}
          className="resize-none rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-zinc-200"
        />
        <label className="flex items-center gap-1.5 text-zinc-400">
          <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} className="accent-blue-500" />
          Apply to entire project (batch)
        </label>
        <div className="flex gap-2">
          <button onClick={handlePreview} disabled={!spectrumId} className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40">
            Preview
          </button>
          <button onClick={handleApply} disabled={!spectrumId} className="rounded bg-blue-600 px-2 py-1 font-medium text-white hover:bg-blue-500 disabled:opacity-40">
            Apply
          </button>
        </div>
        {error && <p className="text-red-400">{error}</p>}

        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => activeProject && undoPreprocessing(activeProject.id).then(() => refreshOverlay())} disabled={!overlay?.ops.length} className="rounded border border-zinc-700 px-2 py-1 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">
            ↶ Undo
          </button>
          <button onClick={() => activeProject && redoPreprocessing(activeProject.id).then(() => refreshOverlay())} disabled={!overlay?.redo_stack.length} className="rounded border border-zinc-700 px-2 py-1 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">
            ↷ Redo
          </button>
        </div>
        {overlay && overlay.ops.length > 0 && (
          <div className="mt-1 rounded border border-zinc-700 p-1.5">
            <p className="mb-1 text-zinc-500">History ({overlay.ops.length} op(s)):</p>
            {overlay.ops.map((op) => (
              <p key={op.id} className="truncate text-zinc-400">{op.type}</p>
            ))}
          </div>
        )}
      </div>

      <main className="flex-1 overflow-hidden bg-zinc-900 p-2">
        {!rawPreview ? (
          <div className="flex h-full items-center justify-center text-zinc-600">Select a sample to preview.</div>
        ) : (
          <Plot
            data={[
              { type: "scatter", mode: "lines", name: "Current", x: rawPreview.wavelength, y: rawPreview.reflectance, line: { color: "#71717a" } },
              ...(preview ? [{ type: "scatter" as const, mode: "lines" as const, name: "Preview", x: preview.wavelength, y: preview.reflectance, line: { color: "#e69f00" } }] : []),
            ]}
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
        )}
      </main>
    </div>
  );
}
