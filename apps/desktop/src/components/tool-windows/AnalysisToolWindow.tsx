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

type ActiveAnalysisToolId = "descriptive-statistics" | "correlation-analysis" | "principal-component-analysis";

interface Props {
  toolId: ActiveAnalysisToolId;
  toolLabel: string;
  onOpenVisualization: () => void;
}

export default function AnalysisToolWindow({ toolId, toolLabel, onOpenVisualization }: Props) {
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
      setError("PCA requiere al menos 2 variables.");
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
          resultSummary: `${result.n_components} components, KMO ${result.kmo_global.toFixed(2)}`,
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
      <aside className="w-56 shrink-0 border-r border-zinc-700">
        <VariablePicker
          columns={dataset.columns}
          selected={selectedVars}
          onChange={setSelectedVars}
          recommendedCategories={["Numeric", "Calculated"]}
        />
      </aside>

      <div className="flex w-40 shrink-0 flex-col gap-2 border-r border-zinc-700 p-2.5">
        <p className="font-semibold text-zinc-400">{toolLabel}</p>
        <p className="text-zinc-600">{selectedVars.length} variable(s) selected.</p>
        {isPca && selectedVars.length > 0 && selectedVars.length < 2 && (
          <p className="text-amber-400">PCA needs ≥ 2 variables.</p>
        )}
        <label className="flex items-start gap-1.5 text-zinc-500">
          <input
            type="checkbox"
            checked={includeQaqcFlagged}
            onChange={(e) => setIncludeQaqcFlagged(e.target.checked)}
            className="mt-0.5 accent-blue-500"
          />
          <span>Include QAQC-flagged samples (not recommended)</span>
        </label>
        <button
          onClick={handleRun}
          disabled={loading || selectedVars.length === 0}
          className="mt-auto w-full rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Running…" : "Run Analysis"}
        </button>
      </div>

      <main className="flex-1 overflow-y-auto bg-zinc-900 p-3">
        {error && (
          <div className="mb-3 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-red-300">{error}</div>
        )}
        {!isPca && descriptive && <DescriptiveResults result={descriptive} onOpenInVisualization={onOpenVisualization} />}
        {isPca && pca && <PcaResults result={pca} onOpenInVisualization={onOpenVisualization} />}
        {!error && !hasResult && (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <p className="text-zinc-600">Select variables and click Run Analysis.</p>
          </div>
        )}
      </main>
    </div>
  );
}
