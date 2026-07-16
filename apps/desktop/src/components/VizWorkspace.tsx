import { useState } from "react";
import ScatterPlot from "@/components/ScatterPlot";
import DataGrid from "@/components/DataGrid";

type VizTab = "scatter" | "table" | "spider" | "map";

interface Props {
  hasData: boolean;
  onOpenData: () => void;
}

// Workspace de visualización compartido entre ViewScreen y el tool
// "Visualization" del grupo Geochemistry en ModulosScreen.
export default function VizWorkspace({ hasData, onOpenData }: Props) {
  const [vizTab, setVizTab] = useState<VizTab>("scatter");

  return (
    <div className="flex flex-col flex-1 bg-zinc-900 overflow-hidden">
      <div className="flex items-center border-b border-zinc-700 px-4 shrink-0">
        <VizTabButton label="Scatter" active={vizTab === "scatter"} onClick={() => setVizTab("scatter")} />
        <VizTabButton label="Data Table" active={vizTab === "table"} onClick={() => setVizTab("table")} />
        <VizTabButton label="Spider / Radar" active={vizTab === "spider"} onClick={() => setVizTab("spider")} />
        <VizTabButton label="Sample Map" active={vizTab === "map"} onClick={() => setVizTab("map")} />
      </div>
      <div className="flex-1 overflow-hidden">
        {vizTab === "scatter" && (hasData ? <ScatterPlot /> : <EmptyVizState onOpen={onOpenData} />)}
        {vizTab === "table" && (hasData ? <DataGrid /> : <EmptyVizState onOpen={onOpenData} />)}
        {vizTab === "spider" && <PlaceholderPanel label="Spider / REE diagrams — Fase 2" />}
        {vizTab === "map" && <PlaceholderPanel label="Sample Map — Fase 3" />}
      </div>
    </div>
  );
}

export function VizTabButton({
  label,
  active,
  onClick,
}: {
  label: string;
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
