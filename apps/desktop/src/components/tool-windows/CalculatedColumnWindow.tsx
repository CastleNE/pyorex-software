/**
 * "Add calculated column" tool — formula input (restricted asteval on the
 * backend, see services/analytics/analysis/data/formula.py), live preview
 * over a small sample, then commit as a NEW column (originals untouched).
 */
import { useMemo, useState } from "react";
import { previewFormula, type FormulaPreviewResult } from "@/lib/data-api";
import { useDataOpsStore } from "@/stores/data-ops-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { classifyColumns, VARIABLE_CATEGORIES, type VariableCategory } from "@/lib/variable-classification";
import { useL, type Txt } from "@/lib/i18n";

const CATEGORY_LABEL: Record<VariableCategory, Txt> = {
  Identifiers: { es: "Identificadores", en: "Identifiers" },
  Coordinates: { es: "Coordenadas", en: "Coordinates" },
  Dates: { es: "Fechas", en: "Dates" },
  Calculated: { es: "Calculadas", en: "Calculated" },
  Numeric: { es: "Numéricas", en: "Numeric" },
  Categorical: { es: "Categóricas", en: "Categorical" },
  Other: { es: "Otras", en: "Other" },
};

interface Props {
  datasetId: string;
  onClose: () => void;
}

export default function CalculatedColumnWindow({ datasetId, onClose }: Props) {
  const L = useL();
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
    <div className="flex h-full flex-col bg-app text-xs">
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-40 shrink-0 overflow-y-auto border-r border-line p-2">
          {grouped &&
            VARIABLE_CATEGORIES.map(
              (cat) =>
                grouped[cat].length > 0 && (
                  <div key={cat} className="mb-2">
                    <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">{L(CATEGORY_LABEL[cat])}</p>
                    {grouped[cat].map((col) => (
                      <button
                        key={col.name}
                        onClick={() => insertVariable(col.name)}
                        title={L({ es: `Insertar ${col.name}`, en: `Insert ${col.name}` })}
                        className="block w-full truncate rounded px-1.5 py-0.5 text-left text-fg hover:bg-raised hover:text-fg"
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
            <label className="mb-1 block text-muted">{L({ es: "Fórmula", en: "Formula" })}</label>
            <textarea
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder={L({
                es: "p. ej. Cu_ppm / Zn_ppm, log10(As_ppm), IF(Au_ppm > 0.5, 1, 0)",
                en: "e.g. Cu_ppm / Zn_ppm, log10(As_ppm), IF(Au_ppm > 0.5, 1, 0)",
              })}
              rows={3}
              className="w-full resize-none rounded border border-line bg-raised px-2 py-1.5 font-mono text-fg outline-none focus:border-accent"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-muted">{L({ es: "Nombre de la nueva columna", en: "New column name" })}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={L({ es: "p. ej. Cu_Zn_ratio", en: "e.g. Cu_Zn_ratio" })}
                className="w-full rounded border border-line bg-raised px-2 py-1.5 text-fg outline-none focus:border-accent"
              />
            </div>
            <div className="w-28">
              <label className="mb-1 block text-muted">{L({ es: "Tipo", en: "Type" })}</label>
              <select
                value={dtype}
                onChange={(e) => setDtype(e.target.value as "numeric" | "text")}
                className="w-full rounded border border-line bg-raised px-2 py-1.5 text-fg"
              >
                <option value="numeric">{L({ es: "Numérico", en: "Numeric" })}</option>
                <option value="text">{L({ es: "Texto", en: "Text" })}</option>
              </select>
            </div>
          </div>

          <button
            onClick={handlePreview}
            disabled={!formula.trim() || loading}
            className="self-start rounded-md border border-line px-3 py-1.5 text-fg hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? L({ es: "Evaluando…", en: "Evaluating…" }) : L({ es: "Vista previa", en: "Preview" })}
          </button>

          {error && (
            <div className="rounded-md border border-danger-line bg-danger-soft/50 px-3 py-2 text-danger">{error}</div>
          )}

          {preview && (
            <div className="rounded-md border border-line">
              <table className="min-w-full">
                <thead className="bg-panel text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left font-semibold">#</th>
                    <th className="px-2 py-1 text-left font-semibold">{L({ es: "Resultado", en: "Result" })}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.values.map((v, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-2 py-1 text-subtle">{i + 1}</td>
                      <td className={`px-2 py-1 ${preview.errors[i] ? "text-danger" : "text-fg"}`}>
                        {preview.errors[i] ?? String(v ?? "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.n_errors > 0 && (
                <p className="border-t border-line px-2 py-1 text-warning">
                  {L({
                    es: `${preview.n_errors} de ${preview.n_sampled} filas de muestra no se pudieron evaluar.`,
                    en: `${preview.n_errors} of ${preview.n_sampled} sampled rows failed to evaluate.`,
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-line px-3 py-2">
        <button onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-muted hover:bg-raised">
          {L({ es: "Cancelar", en: "Cancel" })}
        </button>
        <button
          onClick={handleAdd}
          disabled={!name.trim() || !formula.trim() || saving}
          className="rounded-md bg-accent-strong px-3 py-1.5 font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? L({ es: "Agregando…", en: "Adding…" }) : L({ es: "Agregar columna", en: "Add column" })}
        </button>
      </div>
    </div>
  );
}
