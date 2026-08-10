import type { RefObject } from "react";
import { useDatasetStore } from "@/stores/dataset-store";
import type { ExportEntry } from "@/stores/export-store";
import ActionButton from "@/components/ActionButton";
import DatasetPanel from "@/components/DatasetPanel";
import ExportHistory from "@/components/ExportHistory";
import VizWorkspace from "@/components/VizWorkspace";

interface Props {
  onOpenData: () => void;
  onExportKml: () => void;
  exportEntries: ExportEntry[];
  showExportHistory: boolean;
  setShowExportHistory: (v: boolean | ((prev: boolean) => boolean)) => void;
  exportBtnRef: RefObject<HTMLButtonElement | null>;
}

// Workspace de datos: barra de acciones + split view (datasets/columnas a la
// izquierda, visualización a la derecha). Es el split-view que existía antes
// de separar las pantallas Data y los grupos de módulos — se mueve aquí sin cambios de
// comportamiento porque semánticamente es "ver y trabajar el dataset activo".
export default function ViewScreen({
  onOpenData,
  onExportKml,
  exportEntries,
  showExportHistory,
  setShowExportHistory,
  exportBtnRef,
}: Props) {
  const { dataset, hasData, selectedColumn } = useDatasetStore();
  const selectedColMeta = dataset?.columns.find((c) => c.name === selectedColumn);

  return (
    <>
      {/* ── Action Bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-850 border-b border-zinc-700 shrink-0">
        <ActionButton label="Open Data" icon="📂" onClick={onOpenData} />
        <ActionButton label="Save Dataset" icon="💾" disabled={!hasData} />
        <ActionButton label="Reset to Saved" icon="↩" disabled={!hasData} />
        <ActionButton label="Random Subsample" icon="🎲" disabled={!hasData} />
        <ActionButton label="Add Data" icon="+" />
        <ActionButton
          label="Export KML"
          icon="🌍"
          disabled={!hasData || !dataset?.spatialConfig || dataset.spatialConfig.geometry_source === "none"}
          onClick={onExportKml}
          title={(!dataset?.spatialConfig || dataset.spatialConfig.geometry_source === "none") ? "No spatial reference — re-import with coordinates" : "Export samples to Google Earth KML"}
        />
        <div className="flex-1" />
        {/* Export History */}
        <div className="relative mr-2">
          <button
            ref={exportBtnRef}
            onClick={() => setShowExportHistory((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors ${
              showExportHistory
                ? "bg-zinc-700 border-zinc-500 text-zinc-200"
                : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
            title="Export history"
          >
            <span>📥</span>
            Downloads
            {exportEntries.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-xs font-semibold leading-none">
                {exportEntries.length}
              </span>
            )}
          </button>
          {showExportHistory && (
            <ExportHistory onClose={() => setShowExportHistory(false)} anchorRef={exportBtnRef} />
          )}
        </div>
        {hasData && (
          <span className="text-xs text-zinc-500 mr-2">
            {dataset!.name} — {dataset!.rowCount.toLocaleString()} rows × {dataset!.columnCount} cols
          </span>
        )}
        <button className="px-4 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white transition-colors">
          Geochemical Suite
        </button>
      </div>

      {/* ── Main Content: Split View ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Dataset Manager */}
        <aside className="flex flex-col w-72 min-w-56 border-r border-zinc-700 bg-zinc-900 shrink-0">
          <DatasetPanel onOpenData={onOpenData} />
          <div className="px-4 py-3 border-t border-zinc-700 bg-zinc-850 shrink-0">
            <p className="text-xs font-semibold text-zinc-400 mb-1">
              {selectedColumn ? `Column: ${selectedColumn}` : "Quick Stats"}
            </p>
            {hasData && selectedColMeta ? (
              <div className="text-xs text-zinc-400 space-y-0.5">
                <p>Type: {selectedColMeta.dataType}</p>
                <p>Nulls: {selectedColMeta.nullCount}</p>
              </div>
            ) : (
              <p className="text-xs text-zinc-600">— Select a column —</p>
            )}
          </div>
        </aside>

        {/* Right Panel: Visualization */}
        <VizWorkspace hasData={hasData} onOpenData={onOpenData} />
      </div>
    </>
  );
}
