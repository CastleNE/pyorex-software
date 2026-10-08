/**
 * "Import Processed Spectral Results" — CSV/Excel already interpreted by
 * TSG/EZ-ID. Power-Query-style column mapping onto internal fields grouped
 * per spec §5 (Identification/Location/Intervals/Mineralogy/Spectral
 * Parameters). No fixed/required source column names.
 */
import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  importProcessedTable,
  listMappingPresets,
  previewProcessedTable,
  upsertMappingPreset,
  type ProcessedTableField,
} from "@/lib/spectrometry-api";
import { useSpectrometryStore } from "@/stores/spectrometry-store";
import RecentProjectsPanel from "@/components/tool-windows/RecentProjectsPanel";

const FIELD_GROUPS: { title: string; fields: ProcessedTableField[] }[] = [
  { title: "Identification", fields: ["Sample ID", "Drillhole ID", "Project", "Prospect", "Date", "Instrument"] },
  { title: "Location", fields: ["Easting", "Northing", "Elevation", "Longitude", "Latitude"] },
  { title: "Intervals", fields: ["From", "To", "Depth", "Sample Length"] },
  { title: "Mineralogy", fields: ["Primary Mineral", "Secondary Mineral", "Mineral Group", "White Mica Type", "Chlorite Type", "Clay Type", "Mineral Assemblage"] },
  { title: "Spectral Parameters", fields: ["Absorption Wavelength", "Absorption Depth", "Absorption Width", "Absorption Area", "Al-OH", "Mg-OH", "Fe-OH", "H2O", "OH", "Quality Score", "Match Score"] },
];

interface Props {
  onImported: () => void;
}

export default function ImportProcessedResultsWizard({ onImported }: Props) {
  const { activeProject } = useSpectrometryStore();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<ProcessedTableField, string>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ n_samples: number; n_interpretations: number; n_indices: number } | null>(null);
  const [presetName, setPresetName] = useState("");
  const [savedPresets, setSavedPresets] = useState<string[]>([]);

  async function pickFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Tables", extensions: ["csv", "xlsx", "xls", "txt"] }],
    });
    if (typeof selected !== "string") return;
    setFilePath(selected);
    setError(null);
    try {
      const preview = await previewProcessedTable(selected);
      setColumns(preview.columns.map((c) => c.name));
    } catch (e) {
      setError(String(e));
    }
  }

  function setField(field: ProcessedTableField, column: string) {
    setMapping((prev) => ({ ...prev, [field]: column || undefined }));
  }

  async function refreshPresets() {
    const { presets } = await listMappingPresets();
    setSavedPresets(Object.keys(presets));
    return presets;
  }

  async function handleSavePreset() {
    if (!presetName.trim()) return;
    await upsertMappingPreset(presetName.trim(), mapping);
    await refreshPresets();
  }

  async function handleLoadPreset(name: string) {
    if (!name) return;
    const presets = await refreshPresets();
    if (presets[name]) setMapping(presets[name]);
  }

  async function handleImport() {
    if (!activeProject || !filePath || !mapping["Sample ID"]) return;
    setLoading(true);
    setError(null);
    try {
      const res = await importProcessedTable(activeProject.id, filePath, mapping);
      setResult(res);
      onImported();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshPresets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!activeProject) {
    // No project yet: create or open one right here, then the wizard continues (File → Import data lands here).
    return <div className="flex h-full flex-col"><p className="px-4 pt-3 text-xs text-muted">Crea o abre un proyecto espectral para importar · Create or open a spectral project to import.</p><div className="min-h-0 flex-1"><RecentProjectsPanel /></div></div>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-900 text-xs">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-700 p-2">
        <button onClick={pickFile} className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800">
          Select File…
        </button>
        {filePath && <span className="truncate text-zinc-500">{filePath.split(/[\\/]/).pop()}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          {savedPresets.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => handleLoadPreset(e.target.value)}
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200"
            >
              <option value="">Load preset…</option>
              {savedPresets.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Preset name"
            className="w-32 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200"
          />
          <button onClick={handleSavePreset} className="rounded border border-zinc-700 px-2 py-1 text-zinc-400 hover:bg-zinc-800">
            Save mapping
          </button>
        </div>
      </div>

      {columns.length > 0 && (
        <div className="flex-1 overflow-y-auto p-3">
          {FIELD_GROUPS.map((group) => (
            <div key={group.title} className="mb-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{group.title}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {group.fields.map((field) => (
                  <div key={field} className="flex items-center gap-2">
                    <span className="w-36 shrink-0 truncate text-zinc-400">{field}</span>
                    <select
                      value={mapping[field] ?? ""}
                      onChange={(e) => setField(field, e.target.value)}
                      className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-1 text-zinc-200"
                    >
                      <option value="">— none —</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-700 p-2">
        {error && <span className="mr-auto text-red-400">{error}</span>}
        {result && (
          <span className="mr-auto text-zinc-400">
            {result.n_samples} samples, {result.n_interpretations} interpretations, {result.n_indices} indices imported.
          </span>
        )}
        <button
          onClick={handleImport}
          disabled={!filePath || !mapping["Sample ID"] || loading}
          className="rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Importing…" : "Import"}
        </button>
      </div>
    </div>
  );
}
