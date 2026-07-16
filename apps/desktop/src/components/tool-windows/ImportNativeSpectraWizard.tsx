/**
 * "Import Native Spectra" — file/folder picker, format auto-detected
 * server-side, one bad file never blocks the rest of the batch. The original
 * files are never modified (read-only import).
 */
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { importNativeSpectra, type ImportFailure, type ImportedSpectrumSummary } from "@/lib/spectrometry-api";
import { useSpectrometryStore } from "@/stores/spectrometry-store";

interface Props {
  onImported: () => void;
}

export default function ImportNativeSpectraWizard({ onImported }: Props) {
  const { activeProject } = useSpectrometryStore();
  const [paths, setPaths] = useState<string[]>([]);
  const [recursive, setRecursive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: ImportedSpectrumSummary[]; failures: ImportFailure[] } | null>(null);

  async function pickFiles() {
    const selected = await open({
      multiple: true,
      filters: [
        { name: "Spectral files", extensions: ["asd", "sed", "csv", "txt", "asc"] },
      ],
    });
    if (Array.isArray(selected)) setPaths(selected);
    else if (typeof selected === "string") setPaths([selected]);
  }

  async function pickFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setPaths([selected]);
  }

  async function handleImport() {
    if (!activeProject || paths.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await importNativeSpectra(activeProject.id, paths, recursive);
      setResult(res);
      onImported();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!activeProject) {
    return <div className="p-4 text-xs text-zinc-500">Create or open a spectral project first.</div>;
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto bg-zinc-900 p-3 text-xs">
      <p className="text-zinc-500">
        Supports ASD (experimental), SED (experimental), ASCII, TXT, CSV. Original files are never modified.
      </p>

      <div className="flex gap-2">
        <button onClick={pickFiles} className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800">
          Select Files…
        </button>
        <button onClick={pickFolder} className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800">
          Select Folder…
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-zinc-400">
          <input type="checkbox" checked={recursive} onChange={(e) => setRecursive(e.target.checked)} className="accent-blue-500" />
          Search subfolders
        </label>
      </div>

      {paths.length > 0 && (
        <div className="rounded-md border border-zinc-700 p-2">
          <p className="mb-1 text-zinc-400">{paths.length} path(s) selected:</p>
          <ul className="max-h-24 overflow-y-auto font-mono text-[11px] text-zinc-500">
            {paths.map((p) => (
              <li key={p} className="truncate">{p}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={handleImport}
        disabled={paths.length === 0 || loading}
        className="self-start rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? "Importing…" : "Import"}
      </button>

      {error && <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-red-300">{error}</div>}

      {result && (
        <div className="flex flex-col gap-2">
          <p className="text-zinc-400">
            {result.imported.length} imported, {result.failures.length} failed.
          </p>
          {result.failures.length > 0 && (
            <div className="rounded-md border border-amber-800/60 bg-amber-950/40 p-2">
              <p className="mb-1 font-semibold text-amber-300">Failed files</p>
              {result.failures.map((f, i) => (
                <p key={i} className="text-amber-300/80">
                  {f.path.split(/[\\/]/).pop()}: {f.reason}
                </p>
              ))}
            </div>
          )}
          {result.imported.length > 0 && (
            <div className="rounded-md border border-zinc-700 p-2">
              <p className="mb-1 font-semibold text-zinc-300">Imported</p>
              {result.imported.map((s) => (
                <p key={s.spectrum_id} className="text-zinc-400">
                  {s.filename} → sample {s.sample_id}
                  {s.warnings.length > 0 && <span className="text-amber-400"> ({s.warnings.length} warning(s))</span>}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
