import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/app-store";
import type { AppNav } from "@/stores/app-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { useExportStore } from "@/stores/export-store";
import type { ImportedDatasetMeta } from "@/lib/data-api";
import { listDatasets, exportKml } from "@/lib/data-api";
import ImportWizard from "@/components/ImportWizard";
import FileScreen from "@/components/FileScreen";
import DataScreen from "@/components/DataScreen";
import ModulosScreen from "@/components/ModulosScreen";
import ViewScreen from "@/components/ViewScreen";

// ── Nav config ─────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: AppNav; label: string }[] = [
  { id: "file", label: "File" },
  { id: "data", label: "Data" },
  { id: "modulos", label: "Módulos" },
  { id: "view", label: "View" },
];

// ── App Shell ─────────────────────────────────────────────────────────────────

export default function App() {
  const { activeNav, setActiveNav } = useAppStore();
  const { dataset, setDataset, setAllDatasets } = useDatasetStore();
  const { entries: exportEntries, addEntry: addExportEntry } = useExportStore();
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
    const ds = {
      id: meta.id,
      name: meta.name,
      rowCount: meta.row_count,
      columnCount: meta.column_count,
      columns: meta.columns.map((c) => ({
        name: c.name,
        dataType: c.dtype.includes("Float") || c.dtype.includes("Int") ? "numeric" as const : "text" as const,
        nullCount: c.null_count,
      })),
      importedAt: meta.imported_at,
      spatialConfig: meta.spatial_config,
      iogasDisplayCols: meta.iogas_display_cols,
    };
    setDataset(ds);
    // Navigate to Data after importing
    setActiveNav("data");
  }

  async function handleExportKml() {
    if (!dataset) return;
    try {
      const numericCols = dataset.columns.filter((c) => c.dataType === "numeric");
      const colorCol = numericCols[0]?.name;
      const result = await exportKml({
        datasetId: dataset.id,
        colorCol,
      });
      const sep = result.kml_path.includes("\\") ? "\\" : "/";
      const parts = result.kml_path.split(sep);
      const filename = parts.pop() ?? result.kml_path;
      const folder = parts.join(sep) || result.kml_path;
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

  return (
    <div className="flex flex-col h-screen bg-zinc-900 text-zinc-100 overflow-hidden">
      {/* ── Top Navigation ── */}
      <nav
        className="flex items-center bg-zinc-900 border-b border-zinc-700 px-3 shrink-0 gap-1"
        data-tauri-drag-region
      >
        {/* Logo */}
        <div className="flex items-center gap-2 pr-4 mr-2 border-r border-zinc-700 shrink-0">
          <PyOrexLogo />
        </div>

        {/* Nav items */}
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveNav(item.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              activeNav === item.id
                ? "text-white border-blue-500"
                : "text-zinc-400 border-transparent hover:text-zinc-200 hover:border-zinc-600"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* ── Screen Router ── */}
      {activeNav === "file" && (
        <div className="flex-1 overflow-hidden">
          <FileScreen onOpenProject={handleOpenData} onImportData={handleOpenData} />
        </div>
      )}
      {activeNav === "data" && <DataScreen onOpenData={handleOpenData} />}
      {activeNav === "modulos" && <ModulosScreen onOpenData={handleOpenData} />}
      {activeNav === "view" && (
        <ViewScreen
          onOpenData={handleOpenData}
          onExportKml={handleExportKml}
          exportEntries={exportEntries}
          showExportHistory={showExportHistory}
          setShowExportHistory={setShowExportHistory}
          exportBtnRef={exportBtnRef}
        />
      )}

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

// ── Logo ───────────────────────────────────────────────────────────────────────

function PyOrexLogo() {
  return (
    <div className="flex items-center gap-2 py-2">
      {/* Network graph icon — recreado del logo oficial */}
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Connections */}
        <line x1="14" y1="4"  x2="9"  y2="10" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="14" y1="4"  x2="19" y2="10" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="9"  y1="10" x2="14" y2="14" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="19" y1="10" x2="14" y2="14" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="9"  y1="10" x2="5"  y2="16" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="19" y1="10" x2="23" y2="16" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="14" y1="14" x2="9"  y2="18" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="14" y1="14" x2="19" y2="18" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="5"  y1="16" x2="9"  y2="18" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="23" y1="16" x2="19" y2="18" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="9"  y1="18" x2="14" y2="24" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="19" y1="18" x2="14" y2="24" stroke="#60a5fa" strokeWidth="1.2" />
        {/* Nodes */}
        <circle cx="14" cy="4"  r="2.2" fill="#3b82f6" />
        <circle cx="9"  cy="10" r="2.2" fill="#3b82f6" />
        <circle cx="19" cy="10" r="2.2" fill="#3b82f6" />
        <circle cx="5"  cy="16" r="2.2" fill="#3b82f6" />
        <circle cx="14" cy="14" r="2.2" fill="#60a5fa" />
        <circle cx="23" cy="16" r="2.2" fill="#3b82f6" />
        <circle cx="9"  cy="18" r="2.2" fill="#3b82f6" />
        <circle cx="19" cy="18" r="2.2" fill="#3b82f6" />
        <circle cx="14" cy="24" r="2.2" fill="#3b82f6" />
      </svg>

      {/* Divider */}
      <div className="w-px h-5 bg-zinc-600" />

      {/* Wordmark */}
      <span className="text-sm font-bold tracking-wide text-zinc-100">
        PyOre<span className="text-blue-400">X</span>
      </span>
    </div>
  );
}

