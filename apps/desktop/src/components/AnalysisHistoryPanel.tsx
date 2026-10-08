import { useAnalysisHistoryStore } from "@/stores/analysis-history-store";

interface Props {
  onReopenTool: (toolId: string) => void;
}

export default function AnalysisHistoryPanel({ onReopenTool }: Props) {
  const entries = useAnalysisHistoryStore((s) => s.entries);
  const removeEntry = useAnalysisHistoryStore((s) => s.removeEntry);
  const duplicateEntry = useAnalysisHistoryStore((s) => s.duplicateEntry);

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-xs">
        <p className="text-subtle">No analyses run yet this session.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-app p-2 text-xs">
      {entries.map((e) => (
        <div key={e.id} className="mb-2 rounded-md border border-line p-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="font-semibold text-fg">{e.toolLabel}</p>
            <p className="text-subtle">{new Date(e.timestamp).toLocaleTimeString()}</p>
          </div>
          <p className="text-subtle">
            {e.datasetName} · {e.variables.length} var(s) · {e.resultSummary}
          </p>
          <div className="mt-1.5 flex gap-3">
            <button onClick={() => onReopenTool(e.toolId)} className="text-accent-fg hover:underline">
              Rerun
            </button>
            <button onClick={() => duplicateEntry(e.id)} className="text-muted hover:underline">
              Duplicate
            </button>
            <button onClick={() => removeEntry(e.id)} className="text-danger hover:underline">
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
