import { useState, type RefObject } from "react";
import type { WorkspaceAreaHandle } from "@/components/window-manager/types";
import CalculatedColumnWindow from "@/components/tool-windows/CalculatedColumnWindow";
import DataQualityWindow from "@/components/tool-windows/DataQualityWindow";
import { useDataOpsStore } from "@/stores/data-ops-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { toDatasetInfo } from "@/lib/dataset-mapping";

interface Props {
  workspaceRef: RefObject<WorkspaceAreaHandle | null>;
  onOpenGrid: () => void;
}

type Popover = "rename" | "dtype" | null;

export default function DataToolbar({ workspaceRef, onOpenGrid }: Props) {
  const { dataset, selectedColumn, setDataset } = useDatasetStore();
  const view = useDataOpsStore((s) => (dataset ? s.getView(dataset.id) : { filters: [], sort: null, heatmap: false }));
  const overlay = useDataOpsStore((s) => (dataset ? s.getOverlay(dataset.id) : undefined));
  const setSort = useDataOpsStore((s) => s.setSort);
  const clearFilters = useDataOpsStore((s) => s.clearFilters);
  const openFilterColumnFor = useDataOpsStore((s) => s.openFilterColumnFor);
  const toggleHeatmap = useDataOpsStore((s) => s.toggleHeatmap);
  const applyOp = useDataOpsStore((s) => s.applyOp);
  const undo = useDataOpsStore((s) => s.undo);
  const redo = useDataOpsStore((s) => s.redo);
  const save = useDataOpsStore((s) => s.save);
  const refresh = useDataOpsStore((s) => s.refresh);

  const [popover, setPopover] = useState<Popover>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dtypeValue, setDtypeValue] = useState<"numeric" | "text" | "datetime">("numeric");
  const [saving, setSaving] = useState(false);

  if (!dataset) return null;
  const datasetId = dataset.id;
  const hasColumn = Boolean(selectedColumn);
  const canUndo = (overlay?.ops.length ?? 0) > 0;
  const canRedo = (overlay?.redo_stack.length ?? 0) > 0;

  function openCalculatedColumn() {
    workspaceRef.current?.openWindow({
      id: "calculated-column",
      title: "Add Calculated Column",
      icon: "🧮",
      defaultPos: { x: 40, y: 20, width: 560, height: 420 },
      render: () => (
        <CalculatedColumnWindow datasetId={datasetId} onClose={() => workspaceRef.current?.closeWindow("calculated-column")} />
      ),
    });
  }

  function openDataQuality() {
    workspaceRef.current?.openWindow({
      id: "data-quality",
      title: "Data Quality",
      icon: "🩺",
      defaultPos: { x: 60, y: 40, width: 640, height: 460 },
      render: () => <DataQualityWindow datasetId={datasetId} />,
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const meta = await save(datasetId);
      setDataset(toDatasetInfo(meta));
    } catch (e) {
      console.error("Save changes failed:", e);
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    if (!selectedColumn || !renameValue.trim()) return;
    await applyOp(datasetId, { type: "rename_column", params: { column: selectedColumn, new_name: renameValue.trim() } });
    setPopover(null);
    setRenameValue("");
  }

  async function handleChangeDtype() {
    if (!selectedColumn) return;
    await applyOp(datasetId, { type: "change_dtype", params: { column: selectedColumn, new_dtype: dtypeValue, on_error: "null" } });
    setPopover(null);
  }

  async function handleHide() {
    if (!selectedColumn) return;
    await applyOp(datasetId, { type: "hide_column", params: { column: selectedColumn } });
  }

  async function handleDrop() {
    if (!selectedColumn) return;
    if (!window.confirm(`Drop column "${selectedColumn}"? This can be undone before Save changes.`)) return;
    await applyOp(datasetId, { type: "drop_column", params: { column: selectedColumn } });
  }

  return (
    <div className="relative flex items-center gap-0.5 border-b border-zinc-700 bg-zinc-850 px-2 py-1 shrink-0">
      <IconButton icon="↶" title="Undo" disabled={!canUndo} onClick={() => undo(datasetId)} />
      <IconButton icon="↷" title="Redo" disabled={!canRedo} onClick={() => redo(datasetId)} />
      <IconButton icon="💾" title="Save changes" disabled={!canUndo || saving} onClick={handleSave} />
      <IconButton icon="⟳" title="Refresh data" onClick={() => refresh(datasetId)} />
      <Divider />
      <IconButton icon="📋" title="Show Data Grid" onClick={onOpenGrid} />
      <Divider />
      <IconButton
        icon="▲"
        title="Sort ascending"
        disabled={!hasColumn}
        onClick={() => selectedColumn && setSort(datasetId, { column: selectedColumn, direction: "asc" })}
      />
      <IconButton
        icon="▼"
        title="Sort descending"
        disabled={!hasColumn}
        onClick={() => selectedColumn && setSort(datasetId, { column: selectedColumn, direction: "desc" })}
      />
      <IconButton icon="⏷" title="Filter" disabled={!hasColumn} onClick={() => selectedColumn && openFilterColumnFor(selectedColumn)} />
      <IconButton icon="⨯" title="Clear filters" disabled={view.filters.length === 0} onClick={() => clearFilters(datasetId)} />
      <Divider />
      <div className="relative">
        <IconButton icon="✎" title="Rename column" disabled={!hasColumn} onClick={() => setPopover(popover === "rename" ? null : "rename")} />
        {popover === "rename" && selectedColumn && (
          <Popover onClose={() => setPopover(null)}>
            <p className="mb-1 text-zinc-500">Rename "{selectedColumn}"</p>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="New name"
              className="mb-2 w-44 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
            />
            <button onClick={handleRename} className="w-full rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500">
              Rename
            </button>
          </Popover>
        )}
      </div>
      <div className="relative">
        <IconButton icon="⇄" title="Change data type" disabled={!hasColumn} onClick={() => setPopover(popover === "dtype" ? null : "dtype")} />
        {popover === "dtype" && selectedColumn && (
          <Popover onClose={() => setPopover(null)}>
            <p className="mb-1 text-zinc-500">Change type of "{selectedColumn}"</p>
            <select
              value={dtypeValue}
              onChange={(e) => setDtypeValue(e.target.value as typeof dtypeValue)}
              className="mb-2 w-44 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
            >
              <option value="numeric">Numeric</option>
              <option value="text">Text</option>
              <option value="datetime">Date</option>
            </select>
            <button onClick={handleChangeDtype} className="w-full rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500">
              Apply
            </button>
          </Popover>
        )}
      </div>
      <IconButton icon="∑" title="Add calculated column" onClick={openCalculatedColumn} />
      <IconButton icon="🩺" title="Data Quality" onClick={openDataQuality} />
      <IconButton icon="🙈" title="Hide column" disabled={!hasColumn} onClick={handleHide} />
      <IconButton icon="🗑" title="Drop column" disabled={!hasColumn} onClick={handleDrop} />
      <Divider />
      <IconButton icon="🔎" title="Find and replace — Coming soon" disabled />
      <IconButton icon="≡" title="Remove duplicates — Coming soon" disabled />
      <IconButton
        icon="🎨"
        title={view.heatmap ? "Conditional formatting: on (loaded rows)" : "Conditional formatting — heatmap on numeric columns"}
        active={view.heatmap}
        onClick={() => toggleHeatmap(datasetId)}
      />
      <IconButton icon="⊞" title="Group by — Coming soon" disabled />
      <IconButton icon="Σ+" title="Aggregate — Coming soon" disabled />
      <IconButton icon="⇩" title="Export data — Coming soon" disabled />
    </div>
  );
}

function IconButton({
  icon,
  title,
  disabled,
  active,
  onClick,
}: {
  icon: string;
  title: string;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded text-sm transition-colors enabled:hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? "bg-blue-500/20 text-blue-400" : "text-zinc-300"
      }`}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-zinc-700" />;
}

function Popover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute left-0 top-full z-40 mt-1 rounded-md border border-zinc-700 bg-zinc-850 p-2.5 text-xs shadow-2xl">
        {children}
      </div>
    </>
  );
}
