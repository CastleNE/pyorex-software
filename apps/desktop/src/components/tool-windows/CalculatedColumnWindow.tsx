/**
 * "Add calculated column" tool — formula input (restricted asteval on the
 * backend, see services/analytics/analysis/data/formula.py), live preview
 * over a small sample, then commit as a NEW column (originals untouched).
 */
import { useMemo, useState } from "react";
import { previewFormula, type FormulaPreviewResult } from "@/lib/data-api";
import { useDataOpsStore } from "@/stores/data-ops-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { classifyColumns, VARIABLE_CATEGORIES } from "@/lib/variable-classification";

interface Props {
  datasetId: string;
  onClose: () => void;
}

export default function CalculatedColumnWindow({ datasetId, onClose }: Props) {
  const dataset = useDatasetStore((s) => s.dataset);
  const applyOp = useDataOpsStore((s) => s.applyOp);

  const [formula, setFormula] = useState("");
  const [name, setName] = useState("");
  const [dtype, setDtype] = useState<"numeric" | "text">("numeric");
  const [preview, setPreview] = useState<FormulaPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(() => (dataset ? classifyColumns(dataset.columns) : null), [dataset]);

  function insertVariable(varName: string) {
    setFormula((prev) => (prev.length > 0 && !prev.endsWith(" ") ? `${prev} ${varName}` : `${prev}${varName}`));
  }

  async function handlePreview() {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const result = await previewFormula(datasetId, formula);
      setPreview(result);
      setDtype(result.inferred_dtype);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!name.trim() || !formula.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await applyOp(datasetId, { type: "add_calculated_column", params: { name: name.trim(), formula, dtype } });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-zinc-900 text-xs">
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-40 shrink-0 overflow-y-auto border-r border-zinc-700 p-2">
          {grouped &&
            VARIABLE_CATEGORIES.map(
              (cat) =>
                grouped[cat].length > 0 && (
                  <div key={cat} className="mb-2">
                    <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{cat}</p>
                    {grouped[cat].map((col) => (
                      <button
                        key={col.name}
                        onClick={() => insertVariable(col.name)}
                        title={`Insert ${col.name}`}
                        className="block w-full truncate rounded px-1.5 py-0.5 text-left text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                      >
                        {col.name}
                      </button>
                    ))}
                  </div>
                )
            )}
        </aside>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
          <div>
            <label className="mb-1 block text-zinc-400">Formula</label>
            <textarea
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="e.g. Cu_ppm / Zn_ppm, log10(As_ppm), IF(Au_ppm > 0.5, 1, 0)"
              rows={3}
              className="w-full resize-none rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-zinc-200 outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-zinc-400">New column name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cu_Zn_ratio"
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-zinc-200 outline-none focus:border-blue-500"
              />
            </div>
            <div className="w-28">
              <label className="mb-1 block text-zinc-400">Type</label>
              <select
                value={dtype}
                onChange={(e) => setDtype(e.target.value as "numeric" | "text")}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-zinc-200"
              >
                <option value="numeric">Numeric</option>
                <option value="text">Text</option>
              </select>
            </div>
          </div>

          <button
            onClick={handlePreview}
            disabled={!formula.trim() || loading}
            className="self-start rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Evaluating…" : "Preview"}
          </button>

          {error && (
            <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-red-300">{error}</div>
          )}

          {preview && (
            <div className="rounded-md border border-zinc-700">
              <table className="min-w-full">
                <thead className="bg-zinc-850 text-zinc-400">
                  <tr>
                    <th className="px-2 py-1 text-left font-semibold">#</th>
                    <th className="px-2 py-1 text-left font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.values.map((v, i) => (
                    <tr key={i} className="border-t border-zinc-800">
                      <td className="px-2 py-1 text-zinc-600">{i + 1}</td>
                      <td className={`px-2 py-1 ${preview.errors[i] ? "text-red-400" : "text-zinc-200"}`}>
                        {preview.errors[i] ?? String(v ?? "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.n_errors > 0 && (
                <p className="border-t border-zinc-800 px-2 py-1 text-amber-400">
                  {preview.n_errors} of {preview.n_sampled} sampled rows failed to evaluate.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-700 px-3 py-2">
        <button onClick={onClose} className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-400 hover:bg-zinc-800">
          Cancel
        </button>
        <button
          onClick={handleAdd}
          disabled={!name.trim() || !formula.trim() || saving}
          className="rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Adding…" : "Add column"}
        </button>
      </div>
    </div>
  );
}
