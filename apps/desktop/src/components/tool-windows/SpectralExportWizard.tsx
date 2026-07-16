/**
 * Export Results — per-table CSV/JSON export, plus "Export to DATA" which
 * builds a new DATA-module dataset (join by Sample ID) via the existing
 * storage.save_dataset(), not a live/bidirectional join.
 */
import { useState } from "react";
import { exportSpectralTable, exportToDataset } from "@/lib/spectrometry-api";
import { useAppStore } from "@/stores/app-store";
import { useSpectrometryStore } from "@/stores/spectrometry-store";

const TABLES = ["samples", "features", "indices", "interpretations", "reference_spectra"];

export default function SpectralExportWizard() {
  const { activeProject } = useSpectrometryStore();
  const setActiveNav = useAppStore((s) => s.setActiveNav);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastPath, setLastPath] = useState<string | null>(null);
  const [datasetMsg, setDatasetMsg] = useState<string | null>(null);

  async function handleExportTable(table: string, format: "csv" | "json") {
    if (!activeProject) return;
    setBusy(`${table}-${format}`);
    try {
      const { path } = await exportSpectralTable(activeProject.id, table, format);
      setLastPath(path);
    } finally {
      setBusy(null);
    }
  }

  async function handleExportToDataset() {
    if (!activeProject) return;
    setBusy("to-dataset");
    try {
      const { dataset_id } = await exportToDataset(activeProject.id);
      setDatasetMsg(`Created dataset ${dataset_id.slice(0, 8)}… — switch to the Data screen to view it.`);
    } finally {
      setBusy(null);
    }
  }

  if (!activeProject) return null;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto bg-zinc-900 p-3 text-xs">
      <div className="rounded-md border border-zinc-700 p-2">
        <p className="mb-2 font-semibold text-zinc-300">Export to DATA module</p>
        <p className="mb-2 text-zinc-500">Creates a NEW dataset (samples joined with interpretations + indices by Sample ID).</p>
        <button
          onClick={handleExportToDataset}
          disabled={busy === "to-dataset"}
          className="rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {busy === "to-dataset" ? "Exporting…" : "Export to Dataset"}
        </button>
        {datasetMsg && (
          <p className="mt-2 text-emerald-400">
            {datasetMsg}{" "}
            <button onClick={() => setActiveNav("data")} className="underline">Go to Data →</button>
          </p>
        )}
      </div>

      <div className="rounded-md border border-zinc-700 p-2">
        <p className="mb-2 font-semibold text-zinc-300">Export individual tables</p>
        {TABLES.map((table) => (
          <div key={table} className="mb-1.5 flex items-center gap-2">
            <span className="w-32 shrink-0 text-zinc-400">{table}</span>
            <button onClick={() => handleExportTable(table, "csv")} disabled={busy === `${table}-csv`} className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40">
              CSV
            </button>
            <button onClick={() => handleExportTable(table, "json")} disabled={busy === `${table}-json`} className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40">
              JSON
            </button>
          </div>
        ))}
        {lastPath && <p className="mt-1 text-zinc-500">Saved to: {lastPath}</p>}
      </div>

      <p className="text-zinc-700">
        Spectrum images (PNG/SVG): use the Spectral Viewer's Plotly toolbar export — no backend round-trip needed. PDF export: coming soon (blocked on a PDF engine decision).
      </p>
    </div>
  );
}
