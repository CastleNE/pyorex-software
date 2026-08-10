import { useRef } from "react";
import ScatterPlot from "@/components/ScatterPlot";
import DataGrid from "@/components/DataGrid";
import WorkspaceArea from "@/components/window-manager/WorkspaceArea";
import type { WorkspaceAreaHandle } from "@/components/window-manager/types";

interface Props {
  hasData: boolean;
  onOpenData: () => void;
}

const CHART_TYPES = [
  { kind: "scatter", icon: "📈", label: "Scatter Plot" },
  { kind: "table", icon: "📋", label: "Data Table" },
  { kind: "spider", icon: "🕸", label: "Spider / Radar", note: "Fase 2" },
  { kind: "map", icon: "🗺", label: "Sample Map", note: "Fase 3" },
] as const;

type ChartKind = (typeof CHART_TYPES)[number]["kind"];
const BUILT: ChartKind[] = ["scatter", "table"];

// Workspace de visualización compartido entre ViewScreen y el tool
// "Visualization" del grupo Geochemistry en ModuleGroupScreen. Cada tipo de
// gráfico se "clava" al canvas como su propia ventana flotante (drag/resize/
// minimize) — se pueden tener varios Scatter Plots abiertos a la vez para
// comparar pares de variables, en vez de una sola vista fija a la vez.
export default function VizWorkspace({ hasData, onOpenData }: Props) {
  const workspaceRef = useRef<WorkspaceAreaHandle>(null);
  const counters = useRef<Partial<Record<ChartKind, number>>>({});

  function openChart(kind: ChartKind) {
    if (!BUILT.includes(kind)) return;
    const def = CHART_TYPES.find((c) => c.kind === kind)!;
    const n = (counters.current[kind] ?? 0) + 1;
    counters.current[kind] = n;
    workspaceRef.current?.openWindow({
      id: `${kind}-${n}`,
      title: n > 1 ? `${def.label} ${n}` : def.label,
      icon: def.icon,
      defaultPos: { x: 40 + n * 20, y: 40 + n * 20, width: 640, height: 460 },
      render: () => (kind === "scatter" ? <ScatterPlot /> : <DataGrid />),
    });
  }

  if (!hasData) {
    return <EmptyVizState onOpen={onOpenData} />;
  }

  return (
    <div className="flex flex-col flex-1 bg-zinc-900 overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-zinc-700 bg-zinc-850 px-3 py-2">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Add to canvas</span>
        {CHART_TYPES.map((c) => (
          <button
            key={c.kind}
            onClick={() => openChart(c.kind)}
            disabled={!BUILT.includes(c.kind)}
            title={!BUILT.includes(c.kind) ? `${c.label} — ${"note" in c ? c.note : "próximamente"}` : `Add ${c.label}`}
            className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 transition-colors enabled:hover:border-zinc-600 enabled:hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span>{c.icon}</span>
            {c.label}
            {"note" in c && <span className="text-[9px] text-zinc-600">{c.note}</span>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <WorkspaceArea ref={workspaceRef} emptyState={<VizCanvasEmptyState onPick={openChart} />} />
      </div>
    </div>
  );
}

function VizCanvasEmptyState({ onPick }: { onPick: (kind: ChartKind) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5">
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-400">Canvas vacío</p>
        <p className="mt-1 text-xs text-zinc-600">Elegí un tipo de gráfico para empezar a construir tu tablero</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {CHART_TYPES.map((c) => (
          <button
            key={c.kind}
            onClick={() => onPick(c.kind)}
            disabled={!BUILT.includes(c.kind)}
            className="flex w-40 flex-col items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-5 text-center transition-colors enabled:hover:border-blue-500/50 enabled:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-2xl">{c.icon}</span>
            <span className="text-xs font-medium text-zinc-300">{c.label}</span>
            {"note" in c && <span className="text-[10px] text-zinc-600">{c.note}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EmptyVizState({ onOpen }: { onOpen: () => void }) {
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

export function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <p className="text-xs text-zinc-600">{label}</p>
    </div>
  );
}
