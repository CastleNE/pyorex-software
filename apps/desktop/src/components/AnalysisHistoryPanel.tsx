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
        <p className="text-zinc-600">No analyses run yet this session.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-zinc-900 p-2 text-xs">
      {entries.map((e) => (
        <div key={e.id} className="mb-2 rounded-md border border-zinc-700 p-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="font-semibold text-zinc-200">{e.toolLabel}</p>
            <p className="text-zinc-600">{new Date(e.timestamp).toLocaleTimeString()}</p>
          </div>
          <p className="text-zinc-500">
            {e.datasetName} · {e.variables.length} var(s) · {e.resultSummary}
          </p>
          <div className="mt-1.5 flex gap-3">
            <button onClick={() => onReopenTool(e.toolId)} className="text-blue-400 hover:underline">
              Rerun
            </button>
            <button onClick={() => duplicateEntry(e.id)} className="text-zinc-400 hover:underline">
              Duplicate
            </button>
            <button onClick={() => removeEntry(e.id)} className="text-red-400 hover:underline">
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
