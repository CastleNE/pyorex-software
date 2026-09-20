/**
 * "Quick Tools" ribbon — replaces the old flat DataToolbar icon strip.
 * Persistent quick-access row (Undo/Redo/Save/Refresh/Preview Data/heatmap/
 * Calculated Column) + tabbed groups (Selection/Clean/Transform/Summarize/
 * Explore/Compare/Export) matching the Quick Tools spec. Calculate has no
 * tab of its own — it's a single tool today, so it lives in the quick-access
 * row instead of a near-empty tab (revisit once Calculate grows more tools).
 * Deliberately does NOT duplicate GEOCHEMISTRY → Data Analysis (no stats/
 * PCA/clustering here) — see the Quick Tools Phase 1 plan for what's real
 * vs. "Coming soon" in this first pass.
 */
import { useState, type ReactNode, type RefObject } from "react";
import type { WorkspaceAreaHandle } from "@/components/window-manager/types";
import CalculatedColumnWindow from "@/components/tool-windows/CalculatedColumnWindow";
import DataQualityWindow from "@/components/tool-windows/DataQualityWindow";
import FilterBuilderWindow from "@/components/tool-windows/FilterBuilderWindow";
import AppliedStepsWindow from "@/components/tool-windows/AppliedStepsWindow";
import QaqcPanel from "@/components/tool-windows/QaqcPanel";
import { useDataOpsStore } from "@/stores/data-ops-store";
import { useDataPreviewStore } from "@/stores/data-preview-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { toDatasetInfo } from "@/lib/dataset-mapping";

interface Props {
  workspaceRef: RefObject<WorkspaceAreaHandle | null>;
}

type Popover = "rename" | "dtype" | null;
type GroupId = "selection" | "clean" | "transform" | "summarize" | "explore" | "compare" | "export";

const GROUPS: { id: GroupId; label: string }[] = [
  { id: "selection", label: "Selection" },
  { id: "clean", label: "Clean" },
  { id: "explore", label: "Explore" },
];

export default function QuickToolsRibbon({ workspaceRef }: Props) {
  const { dataset, selectedColumn, setDataset } = useDatasetStore();
  const view = useDataOpsStore((s) =>
    dataset ? s.getView(dataset.id) : { filters: [], filterCombinator: "and" as const, sort: null, heatmap: false }
  );
  const overlay = useDataOpsStore((s) => (dataset ? s.getOverlay(dataset.id) : undefined));
  const setSort = useDataOpsStore((s) => s.setSort);
  const clearFilters = useDataOpsStore((s) => s.clearFilters);
  const toggleHeatmap = useDataOpsStore((s) => s.toggleHeatmap);
  const applyOp = useDataOpsStore((s) => s.applyOp);
  const undo = useDataOpsStore((s) => s.undo);
  const redo = useDataOpsStore((s) => s.redo);
  const save = useDataOpsStore((s) => s.save);
  const refresh = useDataOpsStore((s) => s.refresh);
  const openPreview = useDataPreviewStore((s) => s.open);

  const [activeGroup, setActiveGroup] = useState<GroupId>("selection");
  const [popover, setPopover] = useState<Popover>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dtypeValue, setDtypeValue] = useState<"numeric" | "text" | "datetime">("numeric");
  const [saving, setSaving] = useState(false);

  if (!dataset) return null;
  const datasetId = dataset.id;
  const hasColumn = Boolean(selectedColumn);
  const canUndo = (overlay?.ops.length ?? 0) > 0;
  const canRedo = (overlay?.redo_stack.length ?? 0) > 0;

  function openToolWindow(
    id: string,
    title: string,
    icon: string,
    pos: { x: number; y: number; width: number; height: number },
    render: () => ReactNode
  ) {
    workspaceRef.current?.openWindow({ id, title, icon, defaultPos: pos, render });
  }

  const openFilterBuilder = () =>
    openToolWindow("filter-builder", "Filter", "⏷", { x: 60, y: 30, width: 500, height: 420 }, () => (
      <FilterBuilderWindow datasetId={datasetId} />
    ));

  const openAppliedSteps = () =>
    openToolWindow("applied-steps", "Applied Steps", "📜", { x: 80, y: 50, width: 420, height: 460 }, () => (
      <AppliedStepsWindow datasetId={datasetId} />
    ));

  const openCalculatedColumn = () =>
    openToolWindow("calculated-column", "Add Calculated Column", "🧮", { x: 40, y: 20, width: 560, height: 420 }, () => (
      <CalculatedColumnWindow datasetId={datasetId} onClose={() => workspaceRef.current?.closeWindow("calculated-column")} />
    ));

  const openDataQuality = () =>
    openToolWindow("data-quality", "Data Quality", "🩺", { x: 60, y: 40, width: 640, height: 460 }, () => (
      <DataQualityWindow datasetId={datasetId} />
    ));

  const openQaqcPanel = () =>
    openToolWindow("qaqc-panel", "QAQC Summary", "🧪", { x: 20, y: 20, width: 820, height: 560 }, () => (
      <QaqcPanel datasetId={datasetId} workspaceRef={workspaceRef} />
    ));

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
    <div className="flex shrink-0 flex-col border-b border-zinc-700 bg-zinc-850">
      {/* Quick access — global actions, not tied to any one group */}
      <div className="flex items-center gap-0.5 border-b border-zinc-800 px-2 py-1">
        <IconButton icon="↶" title="Undo" disabled={!canUndo} onClick={() => undo(datasetId)} />
        <IconButton icon="↷" title="Redo" disabled={!canRedo} onClick={() => redo(datasetId)} />
        <IconButton icon="💾" title="Save changes" disabled={!canUndo || saving} onClick={handleSave} />
        <IconButton icon="⟳" title="Refresh data" onClick={() => refresh(datasetId)} />
        <Divider />
        <IconButton icon="📋" title="Preview Data" onClick={openPreview} />
        <IconButton
          icon="🎨"
          title={view.heatmap ? "Conditional formatting: on (loaded rows)" : "Conditional formatting — heatmap on numeric columns"}
          active={view.heatmap}
          onClick={() => toggleHeatmap(datasetId)}
        />
        <Divider />
        <IconButton icon="🧮" title="Add Calculated Column" onClick={openCalculatedColumn} />
      </div>

      {/* Group tabs */}
      <div className="flex items-center gap-0.5 px-2 pt-1.5">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            onClick={() => setActiveGroup(g.id)}
            className={`rounded-t px-3 py-1 text-[11px] font-medium border-b-2 transition-colors ${
              activeGroup === g.id
                ? "border-blue-500 bg-zinc-900 text-blue-300"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Active group's tools */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-800 bg-zinc-900 px-3 py-2">
        {activeGroup === "selection" && (
          <>
            <ToolButton icon="⏷" label="Filter" onClick={openFilterBuilder} />
            <ToolButton
              icon="▲"
              label="Sort ↑"
              disabled={!hasColumn}
              onClick={() => selectedColumn && setSort(datasetId, { column: selectedColumn, direction: "asc" })}
            />
            <ToolButton
              icon="▼"
              label="Sort ↓"
              disabled={!hasColumn}
              onClick={() => selectedColumn && setSort(datasetId, { column: selectedColumn, direction: "desc" })}
            />
            <ToolButton icon="⨯" label="Clear filters" disabled={view.filters.length === 0} onClick={() => clearFilters(datasetId)} />
          </>
        )}

        {activeGroup === "clean" && (
          <>
            <div className="relative">
              <ToolButton icon="✎" label="Rename" disabled={!hasColumn} onClick={() => setPopover(popover === "rename" ? null : "rename")} />
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
              <ToolButton icon="⇄" label="Convert Type" disabled={!hasColumn} onClick={() => setPopover(popover === "dtype" ? null : "dtype")} />
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
            <ToolButton icon="🙈" label="Hide" disabled={!hasColumn} onClick={handleHide} />
            <ToolButton icon="🗑" label="Drop" disabled={!hasColumn} onClick={handleDrop} />
          </>
        )}

        {activeGroup === "transform" && (
          <>
          </>
        )}

        {activeGroup === "summarize" && (
          <>
          </>
        )}

        {activeGroup === "explore" && (
          <>
            <ToolButton icon="🩺" label="Data Quality" onClick={openDataQuality} />
            <ToolButton icon="🧪" label="QAQC" onClick={openQaqcPanel} />
            <ToolButton icon="📜" label="Applied Steps" onClick={openAppliedSteps} />
          </>
        )}

        {activeGroup === "compare" && (
          <>
          </>
        )}

        {activeGroup === "export" && (
          <>
          </>
        )}
      </div>
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

function ToolButton({
  icon,
  label,
  title,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 rounded border border-zinc-800 px-2.5 py-1.5 text-center transition-colors enabled:hover:border-zinc-600 enabled:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="text-sm">{icon}</span>
      <span className="whitespace-nowrap text-[10px] text-zinc-300">{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-zinc-700" />;
}

function Popover({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute left-0 top-full z-40 mt-1 w-56 rounded-md border border-zinc-700 bg-zinc-850 p-2.5 text-xs shadow-2xl">
        {children}
      </div>
    </>
  );
}
