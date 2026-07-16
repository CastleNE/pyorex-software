/**
 * Recent Spectral Projects — list, open, or create a spectral project.
 */
import { useEffect, useState } from "react";
import { createProject, listProjects, type SpectralProjectMeta } from "@/lib/spectrometry-api";
import { useSpectrometryStore } from "@/stores/spectrometry-store";

export default function RecentProjectsPanel() {
  const { setActiveProject } = useSpectrometryStore();
  const [projects, setProjects] = useState<SpectralProjectMeta[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    listProjects().then((r) => {
      setProjects(r.projects);
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    const { project } = await createProject(newName.trim());
    setActiveProject(project);
    setNewName("");
    load();
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto bg-zinc-900 p-3 text-xs">
      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New project name"
          className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200"
        />
        <button onClick={handleCreate} disabled={!newName.trim()} className="rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-40">
          + New Project
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : projects.length === 0 ? (
        <p className="text-zinc-600">No spectral projects yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveProject(p)}
              className="flex items-center justify-between rounded-md border border-zinc-700 px-3 py-2 text-left hover:bg-zinc-800"
            >
              <span className="text-zinc-200">{p.name}</span>
              <span className="text-zinc-500">{p.sample_count} samples · {p.spectra_count} spectra</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
