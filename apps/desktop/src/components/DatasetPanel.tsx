/**
 * DatasetPanel — left sidebar showing all loaded datasets and the column list
 * of the active one.
 *
 * Layout:
 *   [Datasets section]
 *     ├─ dataset card (active = blue highlight)  [×]
 *     └─ dataset card                             [×]
 *   [─── separator ───]
 *   [Columns of active dataset]
 */
import { useState } from "react";
import { useDatasetStore } from "@/stores/dataset-store";
import { deleteDataset } from "@/lib/data-api";

interface Props {
  onOpenData: () => void;
}

export default function DatasetPanel({ onOpenData }: Props) {
  const {
    allDatasets,
    dataset: active,
    selectedColumn,
    setActiveDataset,
    removeDataset,
    setSelectedColumn,
  } = useDatasetStore();

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteDataset(id);
      removeDataset(id);
    } finally {
      setDeletingId(null);
    }
  }

  const activeColumns = active?.columns.filter((c) => !c.name.startsWith("_")) ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Datasets list ── */}
      <div className="shrink-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700">
          <span className="text-xs font-semibold text-zinc-300">Datasets</span>
          <button
            onClick={onOpenData}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
            title="Import new dataset"
          >
            <span className="text-base leading-none">+</span> Open
          </button>
        </div>

        <div className="overflow-y-auto max-h-48">
          {allDatasets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 px-4 gap-2">
              <div className="text-2xl opacity-20">📊</div>
              <p className="text-xs text-zinc-600 text-center">
                No datasets loaded
              </p>
              <button
                onClick={onOpenData}
                className="mt-1 px-3 py-1.5 text-xs rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700"
              >
                Open Data…
              </button>
            </div>
          ) : (
            allDatasets.map((ds) => {
              const isActive = ds.id === active?.id;
              const isDeleting = deletingId === ds.id;
              return (
                <button
                  key={ds.id}
                  onClick={() => setActiveDataset(ds.id)}
                  disabled={isDeleting}
                  className={`group w-full flex items-center gap-2 px-3 py-2 text-left border-b border-zinc-800/60 transition-colors ${
                    isActive
                      ? "bg-blue-900/30 border-l-2 border-l-blue-500"
                      : "hover:bg-zinc-800 border-l-2 border-l-transparent"
                  } ${isDeleting ? "opacity-50" : ""}`}
                >
                  {/* Icon */}
                  <span className="text-sm shrink-0">
                    {isActive ? "📊" : "📁"}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-medium truncate ${
                        isActive ? "text-blue-300" : "text-zinc-300"
                      }`}
                    >
                      {ds.name}
                    </p>
                    <p className="text-xs text-zinc-600">
                      {ds.rowCount.toLocaleString()} rows · {ds.columnCount} cols
                    </p>
                  </div>

                  {/* Delete button — visible on hover */}
                  <button
                    onClick={(e) => handleDelete(ds.id, e)}
                    disabled={isDeleting}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all px-1 text-sm leading-none"
                    title="Remove dataset"
                  >
                    {isDeleting ? "…" : "×"}
                  </button>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Columns of active dataset ── */}
      {active && (
        <>
          <div className="flex items-center justify-between px-4 py-1.5 border-t border-b border-zinc-700 shrink-0">
            <span className="text-xs font-semibold text-zinc-400">Columns</span>
            <span className="text-xs text-zinc-600">{activeColumns.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeColumns.map((col) => (
              <button
                key={col.name}
                onClick={() => setSelectedColumn(col.name)}
                className={`w-full flex items-center justify-between px-4 py-1.5 text-xs text-left transition-colors ${
                  col.name === selectedColumn
                    ? "bg-blue-900/30 text-blue-300"
                    : "hover:bg-zinc-800 text-zinc-300"
                }`}
              >
                <span className="truncate font-mono">{col.name}</span>
                <TypeTag type={col.dataType} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function TypeTag({ type }: { type: string }) {
  const map: Record<string, string> = {
    numeric: "text-blue-400",
    text: "text-emerald-400",
    boolean: "text-purple-400",
    datetime: "text-amber-400",
  };
  const abbr: Record<string, string> = {
    numeric: "N",
    text: "T",
    boolean: "B",
    datetime: "D",
  };
  return (
    <span className={`ml-2 shrink-0 text-xs font-semibold ${map[type] ?? "text-zinc-500"}`}>
      {abbr[type] ?? "?"}
    </span>
  );
}
