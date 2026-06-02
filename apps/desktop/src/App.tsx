import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { downloadDir } from "@tauri-apps/api/path";
import { useAppStore } from "@/stores/app-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { useExportStore } from "@/stores/export-store";
import type { ImportedDatasetMeta } from "@/lib/data-api";
import { listDatasets, exportKml } from "@/lib/data-api";
import ImportWizard from "@/components/ImportWizard";
import DataTable from "@/components/DataTable";
import ScatterPlot from "@/components/ScatterPlot";
import DatasetPanel from "@/components/DatasetPanel";
import ExportHistory from "@/components/ExportHistory";

// ── Types ──────────────────────────────────────────────────────────────────────

type AppModule =
  | "home"
  | "data"
  | "calculation"
  | "analysis"
  | "graph"
  | "map"
  | "structure"
  | "diagram"
  | "spider"
  | "help";

type VizTab = "scatter" | "table" | "spider" | "map";

const APP_MODULES: { id: AppModule; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "data", label: "Data" },
  { id: "calculation", label: "Calculation" },
  { id: "analysis", label: "Analysis" },
  { id: "graph", label: "Graph" },
  { id: "map", label: "Map" },
  { id: "structure", label: "Structure" },
  { id: "diagram", label: "Diagram" },
  { id: "spider", label: "Spider" },
  { id: "help", label: "Help" },
];

// ── App Shell ─────────────────────────────────────────────────────────────────

export default function App() {
  const { activeModule, setActiveModule } = useAppStore();
  const { dataset, hasData, selectedColumn, setDataset, setAllDatasets } = useDatasetStore();
  const { entries: exportEntries, addEntry: addExportEntry } = useExportStore();
  const [vizTab, setVizTab] = useState<VizTab>("scatter");
  const [showExportHistory, setShowExportHistory] = useState(false);
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  // Load existing datasets from disk on startup
  useEffect(() => {
    listDatasets()
      .then(({ datasets }) => {
        if (datasets.length === 0) return;
        setAllDatasets(
          datasets.map((d) => ({
            id: d.id,
            name: d.name,
            rowCount: d.row_count,
            columnCount: d.column_count,
            columns: d.columns.map((c) => ({
              name: c.name,
              dataType:
                c.dtype.includes("Float") || c.dtype.includes("Int")
                  ? ("numeric" as const)
                  : ("text" as const),
              nullCount: c.null_count,
            })),
            importedAt: d.imported_at,
          }))
        );
      })
      .catch(() => {
        // Service not yet running — ignore silently
      });
  }, [setAllDatasets]);

  // Import wizard state
  const [importFilePath, setImportFilePath] = useState<string | null>(null);

  async function handleOpenData() {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "Geochemical data", extensions: ["csv", "xlsx", "xls", "xlsm"] },
        { name: "CSV", extensions: ["csv"] },
        { name: "Excel", extensions: ["xlsx", "xls", "xlsm"] },
      ],
    });
    if (typeof selected === "string") {
      setImportFilePath(selected);
    }
  }

  function handleImported(meta: ImportedDatasetMeta) {
    setImportFilePath(null);
    setDataset({
      id: meta.id,
      name: meta.name,
      rowCount: meta.row_count,
      columnCount: meta.column_count,
      columns: meta.columns.map((c) => ({
        name: c.name,
        dataType: c.dtype.includes("Float") || c.dtype.includes("Int") ? "numeric" : "text",
        nullCount: c.null_count,
      })),
      importedAt: meta.imported_at,
      spatialRef: meta.spatial_ref,
      iogasDisplayCols: meta.iogas_display_cols,
    });
  }

  async function handleExportKml() {
    if (!dataset) return;
    try {
      const outputDir = await downloadDir();
      const numericCols = dataset.columns.filter((c) => c.dataType === "numeric");
      const colorCol = numericCols[0]?.name;
      const result = await exportKml({
        datasetId: dataset.id,
        colorCol,
        outputDir,
      });
      // Parse filename and folder from the returned path
      const sep = result.kml_path.includes("\\") ? "\\" : "/";
      const parts = result.kml_path.split(sep);
      const filename = parts.pop() ?? result.kml_path;
      const folder = parts.join(sep) || outputDir;
      addExportEntry({
        type: "kml",
        datasetName: dataset.name,
        filename,
        path: result.kml_path,
        folder,
        createdAt: new Date().toISOString(),
      });
      setShowExportHistory(true);
    } catch (e) {
      console.error("KML export failed:", e);
    }
  }

  // Quick stats for selected column
  const selectedColMeta = dataset?.columns.find((c) => c.name === selectedColumn);

  return (
    <div className="flex flex-col h-screen bg-zinc-900 text-zinc-100 overflow-hidden">
      {/* ── Top Navigation ── */}
      <nav
        className="flex items-center bg-zinc-900 border-b border-zinc-700 px-2 shrink-0"
        data-tauri-drag-region
      >
        {APP_MODULES.map((mod) => (
          <button
            key={mod.id}
            onClick={() => setActiveModule(mod.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              activeModule === mod.id
                ? "text-white border-blue-500"
                : "text-zinc-400 border-transparent hover:text-zinc-200 hover:border-zinc-600"
            }`}
          >
            {mod.label}
          </button>
        ))}
      </nav>

      {/* ── Action Bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-850 border-b border-zinc-700 shrink-0">
        <ActionButton label="Open Data (CSV)" icon="📂" onClick={handleOpenData} />
        <ActionButton label="Save Dataset" icon="💾" disabled={!hasData} />
        <ActionButton label="Reset to Saved" icon="↩" disabled={!hasData} />
        <ActionButton label="Random Subsample" icon="🎲" disabled={!hasData} />
        <ActionButton label="Add Data" icon="+" />
        <ActionButton
          label="Export KML"
          icon="🌍"
          disabled={!hasData || !dataset?.spatialRef}
          onClick={handleExportKml}
          title={!dataset?.spatialRef ? "No spatial reference — re-import with coordinates" : "Export samples to Google Earth KML"}
        />
        <div className="flex-1" />
        {/* Export History button */}
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
            <ExportHistory
              onClose={() => setShowExportHistory(false)}
              anchorRef={exportBtnRef}
            />
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
        {/* ── Left Panel: Dataset Manager ── */}
        <aside className="flex flex-col w-72 min-w-56 border-r border-zinc-700 bg-zinc-900 shrink-0">
          <DatasetPanel onOpenData={handleOpenData} />

          {/* Quick Stats footer */}
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

        {/* ── Right Panel: Data Table + Visualization ── */}
        <main className="flex flex-col flex-1 bg-zinc-900 overflow-hidden">
          {/* Viz tab bar */}
          <div className="flex items-center border-b border-zinc-700 px-4 shrink-0">
            <VizTabButton
              label="Scatter"
              id="scatter"
              active={vizTab === "scatter"}
              onClick={() => setVizTab("scatter")}
            />
            <VizTabButton
              label="Data Table"
              id="table"
              active={vizTab === "table"}
              onClick={() => setVizTab("table")}
            />
            <VizTabButton
              label="Spider / Radar"
              id="spider"
              active={vizTab === "spider"}
              onClick={() => setVizTab("spider")}
            />
            <VizTabButton
              label="Sample Map"
              id="map"
              active={vizTab === "map"}
              onClick={() => setVizTab("map")}
            />
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {vizTab === "scatter" && (
              hasData ? <ScatterPlot /> : <EmptyVizState onOpen={handleOpenData} />
            )}
            {vizTab === "table" && (
              hasData ? <DataTable /> : <EmptyVizState onOpen={handleOpenData} />
            )}
            {vizTab === "spider" && (
              <PlaceholderPanel label="Spider / REE diagrams — Fase 2" />
            )}
            {vizTab === "map" && (
              <PlaceholderPanel label="Sample Map — Fase 3" />
            )}
          </div>
        </main>
      </div>

      {/* ── Import Wizard Modal ── */}
      {importFilePath && (
        <ImportWizard
          filePath={importFilePath}
          onImported={handleImported}
          onCancel={() => setImportFilePath(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ActionButton({
  label,
  icon,
  disabled = false,
  onClick,
  title,
}: {
  label: string;
  icon: string;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-zinc-800 border border-zinc-700 transition-colors
        enabled:hover:bg-zinc-700 enabled:hover:border-zinc-600 enabled:text-zinc-300
        disabled:opacity-40 disabled:cursor-not-allowed disabled:text-zinc-500"
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}

function VizTabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  id: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
        active
          ? "text-blue-400 border-blue-500"
          : "text-zinc-400 border-transparent hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyVizState({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="text-4xl opacity-20">📈</div>
      <p className="text-sm text-zinc-600">Load data to start visualizing</p>
      <button
        onClick={onOpen}
        className="px-4 py-1.5 text-xs rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700"
      >
        Open Data…
      </button>
    </div>
  );
}

function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <p className="text-xs text-zinc-600">{label}</p>
    </div>
  );
}
