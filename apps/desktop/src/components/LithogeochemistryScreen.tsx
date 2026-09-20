/**
 * "Lithogeochemistry" ribbon group content — categorized tool catalog, same
 * shape as DataAnalysisScreen.tsx. TAS is the first real tool; the rest of
 * lithogeochemistry-tools-registry.ts stays "Coming soon" until built.
 */
import { useRef } from "react";
import { useDatasetStore } from "@/stores/dataset-store";
import WorkspaceArea from "@/components/window-manager/WorkspaceArea";
import type { WorkspaceAreaHandle } from "@/components/window-manager/types";
import { PlaceholderPanel } from "@/components/VizWorkspace";
import TasDiagramWindow from "@/components/tool-windows/TasDiagramWindow";
import { LITHO_CATEGORIES, lithoToolsByCategory, type LithoTool } from "@/lib/lithogeochemistry-tools-registry";

interface Props {
  onOpenData: () => void;
}

export default function LithogeochemistryScreen({ onOpenData }: Props) {
  const { dataset, hasData } = useDatasetStore();
  const workspaceRef = useRef<WorkspaceAreaHandle>(null);

  function openTool(tool: LithoTool) {
    if (tool.status === "active" && tool.id === "tas" && dataset) {
      workspaceRef.current?.openWindow({
        id: "tas",
        title: "TAS Diagram",
        icon: "🧭",
        defaultPos: { x: 40, y: 20, width: 760, height: 540 },
        render: () => <TasDiagramWindow datasetId={dataset.id} />,
      });
      return;
    }
    workspaceRef.current?.openWindow({
      id: tool.id,
      title: tool.label,
      icon: "🚧",
      defaultPos: { x: 60, y: 40, width: 360, height: 200 },
      render: () => <PlaceholderPanel label={`${tool.label} — Coming soon`} />,
    });
  }

  if (!hasData || !dataset) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-900">
        <div className="text-4xl opacity-20">🧭</div>
        <p className="text-sm text-zinc-600">Cargá un dataset para clasificar</p>
        <button
          onClick={onOpenData}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-4 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
        >
          Open Data…
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <WorkspaceArea ref={workspaceRef} emptyState={<LithoCatalog onOpenTool={openTool} />} />
    </div>
  );
}

function LithoCatalog({ onOpenTool }: { onOpenTool: (tool: LithoTool) => void }) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        {LITHO_CATEGORIES.map((category) => (
          <div key={category} className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{category}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {lithoToolsByCategory(category).map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => onOpenTool(tool)}
                  title={tool.description}
                  className={`rounded-md border px-3 py-2.5 text-left text-xs transition-colors ${
                    tool.status === "active"
                      ? "border-zinc-700 bg-zinc-850 text-zinc-200 hover:border-blue-500 hover:bg-zinc-800"
                      : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                  }`}
                >
                  <span className="block truncate font-medium">{tool.label}</span>
                  <span className={`text-[10px] uppercase tracking-wide ${tool.status === "active" ? "text-emerald-400" : "text-zinc-700"}`}>
                    {tool.status === "active" ? "Available" : "Coming soon"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

