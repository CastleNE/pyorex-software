/**
 * ExportHistory — dropdown panel showing all file exports.
 * Each entry has a "go to folder" button that opens Explorer at the file location.
 */
import { useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useExportStore } from "@/stores/export-store";
import type { ExportEntry, ExportType } from "@/stores/export-store";

interface Props {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

export default function ExportHistory({ onClose, anchorRef }: Props) {
  const { entries, removeEntry, clearAll } = useExportStore();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !anchorRef.current?.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose, anchorRef]);

  async function openFolder(folder: string) {
    try {
      await invoke("open_in_explorer", { path: folder });
    } catch (e) {
      console.error("Could not open folder:", folder, e);
    }
  }

  return (
    <div
      ref={panelRef}
      className="absolute top-full left-0 mt-1 z-50 w-[420px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
        <span className="text-xs font-semibold text-zinc-200">Export History</span>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-base leading-none px-0.5"
          >
            ✕
          </button>
        </div>
      </div>

      {/* List */}
      <div className="max-h-80 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <span className="text-2xl opacity-20">📭</span>
            <p className="text-xs text-zinc-600">No exports yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {entries.map((entry) => (
              <ExportRow
                key={entry.id}
                entry={entry}
                onOpenFolder={() => openFolder(entry.folder)}
                onRemove={() => removeEntry(entry.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function ExportRow({
  entry,
  onOpenFolder,
  onRemove,
}: {
  entry: ExportEntry;
  onOpenFolder: () => void;
  onRemove: () => void;
}) {
  const age = formatAge(entry.createdAt);

  return (
    <li className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 group transition-colors">
      {/* Type icon */}
      <span className="text-lg shrink-0 opacity-70">{typeIcon(entry.type)}</span>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-medium text-zinc-200 truncate"
          title={entry.path}
        >
          {entry.filename}
        </p>
        <p className="text-xs text-zinc-500 truncate">
          {entry.datasetName} · {age}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onOpenFolder}
          title={`Open folder: ${entry.folder}`}
          className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <FolderIcon />
        </button>
        <button
          onClick={onRemove}
          title="Remove from history"
          className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors"
        >
          <TrashIcon />
        </button>
      </div>

      {/* Type badge — always visible */}
      <TypeBadge type={entry.type} />
    </li>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeIcon(type: ExportType): string {
  const icons: Record<ExportType, string> = {
    kml: "🌍",
    csv: "📄",
    pdf: "📑",
    png: "🖼",
  };
  return icons[type] ?? "📁";
}

function TypeBadge({ type }: { type: ExportType }) {
  const styles: Record<ExportType, string> = {
    kml: "text-emerald-400 bg-emerald-400/10",
    csv: "text-blue-400 bg-blue-400/10",
    pdf: "text-red-400 bg-red-400/10",
    png: "text-purple-400 bg-purple-400/10",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-xs font-mono uppercase shrink-0 ${styles[type] ?? "text-zinc-400"}`}
    >
      {type}
    </span>
  );
}

function formatAge(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(isoString).toLocaleDateString();
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.086a1.5 1.5 0 0 1 1.06.44l.598.598A1.5 1.5 0 0 0 8.303 3.5H13.5A1.5 1.5 0 0 1 15 5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12V3.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
      <path
        fillRule="evenodd"
        d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
      />
    </svg>
  );
}
