import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/app-store";
import type { AppNav } from "@/stores/app-store";
import { useDatasetStore } from "@/stores/dataset-store";
import type { ImportedDatasetMeta } from "@/lib/data-api";
import { listDatasets } from "@/lib/data-api";
import { toDatasetInfo } from "@/lib/dataset-mapping";
import ImportWizard from "@/components/ImportWizard";
import ModuleGroupScreen from "@/components/ModuleGroupScreen";
import GeochemistryScreen from "@/components/GeochemistryScreen";
import PyOrexLogo from "@/components/PyOrexLogo";
import { MODULE_GROUPS } from "@/lib/modules-registry";

// ── Nav config ─────────────────────────────────────────────────────────────────
// Module groups (Geochemistry / Espectrometría / Petrofísica / …) are top-level
// tabs, sandwiched between Data and View — new groups added to
// modules-registry.ts show up here automatically.

const NAV_ITEMS: { id: AppNav; label: string }[] = [
  { id: "geochemistry", label: "GEOQUÍMICA" },
  { id: "espectrometria", label: "ESPECTROMETRÍA" },
  { id: "petrofisica", label: "PETROFÍSICA" },
];

// ── App Shell ─────────────────────────────────────────────────────────────────

export default function App() {

  const { activeNav, setActiveNav } = useAppStore();
  const { setDataset, setAllDatasets } = useDatasetStore();

  // Load existing datasets from disk on startup
  useEffect(() => {
    listDatasets()
      .then(({ datasets }) => {
        if (datasets.length === 0) return;
        setAllDatasets(datasets.map(toDatasetInfo));
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
    setDataset(toDatasetInfo(meta));
    // Navigate to Data after importing
    setActiveNav("data");
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-900 text-zinc-100 overflow-hidden">
      {/* ── Top Navigation ── */}
      <nav
        className="flex items-center overflow-x-auto bg-zinc-900 border-b border-zinc-700 px-3 shrink-0 gap-1"
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
      {activeNav === "geochemistry" && <GeochemistryScreen onOpenData={handleOpenData} />}
      {MODULE_GROUPS.filter((group) => group.id !== "geochemistry").map(
        (group) =>
          activeNav === group.id && <ModuleGroupScreen key={group.id} group={group} onOpenData={handleOpenData} />
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

