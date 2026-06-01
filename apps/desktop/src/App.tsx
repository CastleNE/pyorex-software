import { useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { useDatasetStore } from "@/stores/dataset-store";

// ─── Types ──────────────────────────────────────────────────────────────────

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

type VizTab = "scatter" | "spider" | "map";

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

// ─── App Shell ───────────────────────────────────────────────────────────────

export default function App() {
  const { activeModule, setActiveModule } = useAppStore();
  const { dataset, hasData } = useDatasetStore();
  const [vizTab, setVizTab] = useState<VizTab>("scatter");

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
        <ActionButton label="Open Data (CSV)" icon="📂" />
        <ActionButton label="Save Dataset" icon="💾" disabled={!hasData} />
        <ActionButton label="Reset to Saved" icon="↩" disabled={!hasData} />
        <ActionButton label="Random Subsample" icon="🎲" disabled={!hasData} />
        <ActionButton label="Add Data" icon="+" />
        <div className="flex-1" />
        <button className="px-4 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white transition-colors">
          Geochemical Suite
        </button>
      </div>

      {/* ── Main Content: Split View ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Panel: Data Workspace ── */}
        <aside className="flex flex-col w-80 min-w-64 border-r border-zinc-700 bg-zinc-900 shrink-0">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700 shrink-0">
            <span className="text-xs font-semibold text-zinc-300">
              Data Workspace
            </span>
            <span className="text-xs text-zinc-500">
              {hasData
                ? `${dataset!.rowCount} samples × ${dataset!.columnCount} elements`
                : "No data"}
            </span>
          </div>

          {/* Data table */}
          <div className="flex-1 overflow-auto">
            {hasData ? (
              <DataTable />
            ) : (
              <EmptyDataState />
            )}
          </div>

          {/* Quick Stats footer */}
          <div className="px-4 py-3 border-t border-zinc-700 bg-zinc-850 shrink-0">
            <p className="text-xs font-semibold text-zinc-400 mb-1">
              Quick Stats (selected column)
            </p>
            {hasData ? (
              <QuickStats />
            ) : (
              <p className="text-xs text-zinc-600">— Load data to see stats —</p>
            )}
          </div>
        </aside>

        {/* ── Right Panel: Visualization ── */}
        <main className="flex flex-col flex-1 bg-zinc-900 overflow-hidden">
          {/* Viz tab bar */}
          <div className="flex items-center border-b border-zinc-700 px-4 shrink-0">
            <VizTabButton
              label="Graph (Scatter)"
              id="scatter"
              active={vizTab === "scatter"}
              onClick={() => setVizTab("scatter")}
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

          {/* Visualization content */}
          <div className="flex-1 overflow-hidden">
            {hasData ? (
              <VizPanel tab={vizTab} />
            ) : (
              <EmptyVizState />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ActionButton({
  label,
  icon,
  disabled = false,
}: {
  label: string;
  icon: string;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
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

function EmptyDataState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
      <div className="text-3xl opacity-30">📊</div>
      <p className="text-xs text-zinc-500">
        Open a CSV or Excel file to load your geochemical data
      </p>
    </div>
  );
}

function EmptyVizState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="text-4xl opacity-20">📈</div>
      <p className="text-sm text-zinc-600">Load data to start visualizing</p>
      <p className="text-xs text-zinc-700">
        Scatter plots, Spider/REE, Sample maps and more
      </p>
    </div>
  );
}

function DataTable() {
  return (
    <div className="text-xs">
      <p className="px-4 py-2 text-zinc-500 italic">
        Dataset loaded — table coming in Fase 1
      </p>
    </div>
  );
}

function QuickStats() {
  return (
    <p className="text-xs text-zinc-400">
      Mean: — | Min: — | Max: — | StdDev: —
    </p>
  );
}

function VizPanel({ tab }: { tab: VizTab }) {
  if (tab === "scatter") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-xs text-zinc-500">Scatter plot — Fase 1</p>
      </div>
    );
  }
  if (tab === "spider") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-xs text-zinc-500">Spider / Radar — Fase 2</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <p className="text-xs text-zinc-500">Sample Map — Fase 3</p>
    </div>
  );
}
