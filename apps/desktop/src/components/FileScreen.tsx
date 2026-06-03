import { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecentProject {
  id: string;
  name: string;
  path: string;
  openedAt: string; // ISO
  type: "project" | "data"; // .orex vs imported dataset
}

const STORAGE_KEY = "pyorex:recent-projects";
const MAX_RECENT = 10;

export function addRecentProject(project: Omit<RecentProject, "id">): void {
  const existing = loadRecentProjects();
  const next: RecentProject[] = [
    { ...project, id: project.path },
    ...existing.filter((p) => p.path !== project.path),
  ].slice(0, MAX_RECENT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function loadRecentProjects(): RecentProject[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function removeRecentProject(path: string): void {
  const existing = loadRecentProjects();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(existing.filter((p) => p.path !== path))
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── File Screen ───────────────────────────────────────────────────────────────

interface FileScreenProps {
  onOpenProject: () => void; // opens .orex file
  onImportData: () => void;  // opens CSV / Excel
}

export default function FileScreen({ onOpenProject, onImportData }: FileScreenProps) {
  const [recents, setRecents] = useState<RecentProject[]>([]);

  useEffect(() => {
    setRecents(loadRecentProjects().filter((p) => p.type === "project"));
  }, []);

  function handleRemove(path: string) {
    removeRecentProject(path);
    setRecents(loadRecentProjects());
  }

  return (
    <div className="flex h-full">
      {/* ── Sidebar ── */}
      <aside className="w-60 shrink-0 bg-zinc-800 border-r border-zinc-700 flex flex-col py-6 px-3 gap-1">
        {/* Project actions */}
        <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">
          Project
        </p>
        <FileAction
          icon={<IconNew />}
          label="New Project"
          shortcut="Ctrl+N"
          onClick={() => {}}
        />
        <FileAction
          icon={<IconOpen />}
          label="Open Project…"
          shortcut="Ctrl+O"
          onClick={onOpenProject}
          primary
          hint=".orex"
        />
        <div className="h-px bg-zinc-700 my-2" />
        <FileAction icon={<IconSave />} label="Save" shortcut="Ctrl+S" onClick={() => {}} disabled />
        <FileAction icon={<IconSaveAs />} label="Save As…" shortcut="Ctrl+Shift+S" onClick={() => {}} disabled />

        {/* Data actions */}
        <div className="h-px bg-zinc-700 my-2" />
        <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">
          Data
        </p>
        <FileAction
          icon={<IconImport />}
          label="Import Data…"
          onClick={onImportData}
          hint="CSV · Excel"
        />
        <FileAction icon={<IconExport />} label="Export…" onClick={() => {}} disabled />

        {/* App actions */}
        <div className="h-px bg-zinc-700 my-2" />
        <FileAction icon={<IconSettings />} label="Settings" onClick={() => {}} />
        <FileAction icon={<IconHelp />} label="Help" onClick={() => {}} />
        <FileAction icon={<IconAbout />} label="About PyOreX" onClick={() => {}} />
        <div className="flex-1" />
        <FileAction icon={<IconExit />} label="Exit" onClick={() => {}} />
      </aside>

      {/* ── Recent Projects Panel ── */}
      <main className="flex-1 overflow-hidden flex flex-col p-8">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-zinc-100">Recent</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Previously opened projects and datasets
          </p>
        </div>

        {recents.length === 0 ? (
          <EmptyRecents onOpenProject={onOpenProject} onImportData={onImportData} />
        ) : (
          <div className="flex flex-col gap-1 overflow-y-auto">
            {recents.map((project) => (
              <RecentItem
                key={project.id}
                project={project}
                onOpen={project.type === "project" ? onOpenProject : onImportData}
                onRemove={() => handleRemove(project.path)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FileAction({
  icon,
  label,
  shortcut,
  hint,
  onClick,
  primary = false,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  hint?: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-left w-full
        ${primary
          ? "bg-blue-600 hover:bg-blue-500 text-white font-medium"
          : "text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
        }
        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
    >
      <span className="w-4 h-4 shrink-0 flex items-center justify-center opacity-70">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-xs text-zinc-500 font-mono">{shortcut}</span>
      )}
      {hint && !shortcut && (
        <span className="text-[10px] text-zinc-500 font-mono bg-zinc-700 px-1.5 py-0.5 rounded">
          {hint}
        </span>
      )}
    </button>
  );
}

function RecentItem({
  project,
  onOpen,
  onRemove,
}: {
  project: RecentProject;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const filename = project.name || project.path.split(/[\\/]/).pop() || project.path;
  const dir = project.path.split(/[\\/]/).slice(0, -1).join("\\") || project.path;
  const isPorx = project.type === "project";

  return (
    <div
      className="group flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
    >
      {/* Icon */}
      <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
        isPorx ? "bg-blue-900/60" : "bg-zinc-700"
      }`}>
        {isPorx ? (
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-zinc-200 truncate">{filename}</p>
          <span className={`text-[10px] font-mono px-1 py-0.5 rounded shrink-0 ${
            isPorx
              ? "bg-blue-900/60 text-blue-300"
              : "bg-zinc-700 text-zinc-400"
          }`}>
            {isPorx ? ".orex" : "dataset"}
          </span>
        </div>
        <p className="text-xs text-zinc-500 truncate mt-0.5">{dir}</p>
      </div>

      {/* Time + remove */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-zinc-600">{relativeTime(project.openedAt)}</span>
        {hovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700"
            title="Remove from list"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyRecents({
  onOpenProject,
  onImportData,
}: {
  onOpenProject: () => void;
  onImportData: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-5">
      <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center">
        <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-400">No recent projects</p>
        <p className="text-xs text-zinc-600 mt-1">
          Open an existing project or import a data file to get started
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onOpenProject}
          className="px-4 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          Open Project (.orex)
        </button>
        <button
          onClick={onImportData}
          className="px-4 py-2 text-sm rounded-md bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium transition-colors"
        >
          Import Data…
        </button>
      </div>
    </div>
  );
}

// ── Icon Components ───────────────────────────────────────────────────────────

function IconNew() {
  return (
    <svg fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v10M3 8h10" />
    </svg>
  );
}

function IconOpen() {
  return (
    <svg fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 10V6a1 1 0 011-1h3l2-2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1z" />
    </svg>
  );
}

function IconSave() {
  return (
    <svg fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 2v4h6V2M5 14v-4h6v4" />
    </svg>
  );
}

function IconSaveAs() {
  return (
    <svg fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <rect x="2" y="2" width="10" height="12" rx="1" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 2v4h5V2M4 14v-3h5v3M12 9l2 2-2 2" />
    </svg>
  );
}

function IconImport() {
  return (
    <svg fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10V2M5 7l3 3 3-3M2 13h12" />
    </svg>
  );
}

function IconExport() {
  return (
    <svg fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v8M5 5l3-3 3 3M2 13h12" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <circle cx="8" cy="8" r="2.5" />
      <path strokeLinecap="round" d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <circle cx="8" cy="8" r="6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.5C6 5.4 6.9 4.5 8 4.5s2 .9 2 2c0 1-.6 1.5-1.3 2-.5.4-.7.7-.7 1.2" />
      <circle cx="8" cy="11.5" r=".5" fill="currentColor" />
    </svg>
  );
}

function IconAbout() {
  return (
    <svg fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <circle cx="8" cy="8" r="6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v4M8 5.5v.5" />
    </svg>
  );
}

function IconExit() {
  return (
    <svg fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 11l3-3-3-3M13 8H6M7 3H3v10h4" />
    </svg>
  );
}
