/**
 * 3-pane shell for the 2 real analysis tools (descriptive-statistics /
 * correlation-analysis both call analytics.descriptive; principal-component-
 * analysis calls analytics.pca) — left: VariablePicker, center: params + Run,
 * right: results (DescriptiveResults / PcaResults, extracted from the old
 * AnalyticsWorkspace.tsx).
 */
import { useState } from "react";
import VariablePicker from "@/components/VariablePicker";
import DescriptiveResults from "@/components/analysis-results/DescriptiveResults";
import PcaResults from "@/components/analysis-results/PcaResults";
import { runDescriptive, runPca, type DescriptiveResult, type PcaResult } from "@/lib/data-api";
import { useDatasetStore } from "@/stores/dataset-store";
import { useAnalysisHistoryStore } from "@/stores/analysis-history-store";
import { useL } from "@/lib/i18n";

type ActiveAnalysisToolId = "descriptive-statistics" | "correlation-analysis" | "principal-component-analysis";

interface Props {
  toolId: ActiveAnalysisToolId;
  toolLabel: string;
  onOpenVisualization: () => void;
}

export default function AnalysisToolWindow({ toolId, toolLabel, onOpenVisualization }: Props) {
  const L = useL();
  const dataset = useDatasetStore((s) => s.dataset);
  const addHistoryEntry = useAnalysisHistoryStore((s) => s.addEntry);

  const [selectedVars, setSelectedVars] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descriptive, setDescriptive] = useState<DescriptiveResult | null>(null);
  const [pca, setPca] = useState<PcaResult | null>(null);
  const [includeQaqcFlagged, setIncludeQaqcFlagged] = useState(false);

  const isPca = toolId === "principal-component-analysis";

  if (!dataset) return null;

  async function handleRun() {
    if (selectedVars.length === 0) return;
    if (isPca && selectedVars.length < 2) {
      setError(L({ es: "PCA requiere al menos 2 variables.", en: "PCA requires at least 2 variables." }));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isPca) {
        const result = await runPca(dataset!.id, selectedVars, undefined, includeQaqcFlagged);
        setPca(result);
        addHistoryEntry({
          toolId,
          toolLabel,
          datasetId: dataset!.id,
          datasetName: dataset!.name,
          variables: selectedVars,
          params: {},
          resultSummary: L({
            es: `${result.n_components} componentes, KMO ${result.kmo_global.toFixed(2)}`,
            en: `${result.n_components} components, KMO ${result.kmo_global.toFixed(2)}`,
          }),
        });
      } else {
        const result = await runDescriptive(dataset!.id, selectedVars, includeQaqcFlagged);
        setDescriptive(result);
        addHistoryEntry({
          toolId,
          toolLabel,
          datasetId: dataset!.id,
          datasetName: dataset!.name,
          variables: selectedVars,
          params: {},
          resultSummary: `n=${result.n_samples_used}`,
        });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const hasResult = isPca ? pca !== null : descriptive !== null;

  return (
    <div className="flex h-full overflow-hidden text-xs">
      <aside className="w-56 shrink-0 border-r border-line">
        <VariablePicker
          columns={dataset.columns}
          selected={selectedVars}
          onChange={setSelectedVars}
          recommendedCategories={["Numeric", "Calculated"]}
        />
      </aside>

      <div className="flex w-40 shrink-0 flex-col gap-2 border-r border-line p-2.5">
        <p className="font-semibold text-muted">{toolLabel}</p>
        <p className="text-subtle">
          {L({
            es: `${selectedVars.length} variable(s) seleccionada(s).`,
            en: `${selectedVars.length} variable(s) selected.`,
          })}
        </p>
        {isPca && selectedVars.length > 0 && selectedVars.length < 2 && (
          <p className="text-warning">{L({ es: "PCA necesita ≥ 2 variables.", en: "PCA needs ≥ 2 variables." })}</p>
        )}
        <label className="flex items-start gap-1.5 text-subtle">
          <input
            type="checkbox"
            checked={includeQaqcFlagged}
            onChange={(e) => setIncludeQaqcFlagged(e.target.checked)}
            className="mt-0.5 accent-accent"
          />
          <span>
            {L({
              es: "Incluir muestras marcadas por QAQC (no recomendado)",
              en: "Include QAQC-flagged samples (not recommended)",
            })}
          </span>
        </label>
        <button
          onClick={handleRun}
          disabled={loading || selectedVars.length === 0}
          className="mt-auto w-full rounded-md bg-accent-strong px-3 py-1.5 font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? L({ es: "Calculando…", en: "Running…" }) : L({ es: "Ejecutar análisis", en: "Run Analysis" })}
        </button>
      </div>

      <main className="flex-1 overflow-y-auto bg-app p-3">
        {error && (
          <div className="mb-3 rounded-md border border-danger-line bg-danger-soft/50 px-3 py-2 text-danger">{error}</div>
        )}
        {!isPca && descriptive && <DescriptiveResults result={descriptive} onOpenInVisualization={onOpenVisualization} />}
        {isPca && pca && <PcaResults result={pca} onOpenInVisualization={onOpenVisualization} />}
        {!error && !hasResult && (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <p className="text-subtle">
              {L({
                es: "Selecciona variables y pulsa Ejecutar análisis.",
                en: "Select variables and click Run Analysis.",
              })}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
