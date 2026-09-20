/**
 * "Data Analysis" module — categorized tool catalog (replaces the old
 * AnalyticsWorkspace, which jumped straight to a flat variable checklist).
 * The catalog itself is the WorkspaceArea's empty state; picking a tool opens
 * a floating window over it, same window-manager as the DATA screen.
 */
import { useRef } from "react";
import { useDatasetStore } from "@/stores/dataset-store";
import { useAppStore } from "@/stores/app-store";
import WorkspaceArea from "@/components/window-manager/WorkspaceArea";
import type { WorkspaceAreaHandle } from "@/components/window-manager/types";
import { PlaceholderPanel } from "@/components/VizWorkspace";
import AnalysisToolWindow from "@/components/tool-windows/AnalysisToolWindow";
import AnalysisHistoryPanel from "@/components/AnalysisHistoryPanel";
import { ANALYSIS_CATEGORIES, ANALYSIS_TOOLS, toolsByCategory, type AnalysisTool } from "@/lib/analysis-tools-registry";

interface Props {
  onOpenData: () => void;
}

const ACTIVE_ANALYSIS_TOOL_IDS = new Set(["descriptive-statistics", "correlation-analysis", "principal-component-analysis"]);

export default function DataAnalysisScreen({ onOpenData }: Props) {
  const { dataset, hasData } = useDatasetStore();
  const setActiveModuleId = useAppStore((s) => s.setActiveModuleId);
  const workspaceRef = useRef<WorkspaceAreaHandle>(null);

  function openTool(tool: AnalysisTool) {
    if (tool.id === "analysis-history") {
      workspaceRef.current?.openWindow({
        id: "analysis-history",
        title: "Analysis History",
        icon: "🕒",
        defaultPos: { x: 60, y: 40, width: 480, height: 420 },
        render: () => <AnalysisHistoryPanel onReopenTool={openToolById} />,
      });
      return;
    }
    if (tool.status === "active" && ACTIVE_ANALYSIS_TOOL_IDS.has(tool.id)) {
      workspaceRef.current?.openWindow({
        id: tool.id,
        title: tool.label,
        icon: "📊",
        defaultPos: { x: 40, y: 20, width: 780, height: 520 },
        render: () => (
          <AnalysisToolWindow
            toolId={tool.id as "descriptive-statistics" | "correlation-analysis" | "principal-component-analysis"}
            toolLabel={tool.label}
            onOpenVisualization={() => setActiveModuleId("visualization")}
          />
        ),
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

  function openToolById(toolId: string) {
    const tool = ANALYSIS_TOOLS.find((t) => t.id === toolId);
    if (tool) openTool(tool);
  }

  if (!hasData || !dataset) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-900">
        <div className="text-4xl opacity-20">📊</div>
        <p className="text-sm text-zinc-600">Cargá un dataset para analizar</p>
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
      <WorkspaceArea ref={workspaceRef} emptyState={<AnalysisCatalog onOpenTool={openTool} />} />
    </div>
  );
}

function AnalysisCatalog({ onOpenTool }: { onOpenTool: (tool: AnalysisTool) => void }) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        {ANALYSIS_CATEGORIES.filter(category => toolsByCategory(category).some(tool => ACTIVE_ANALYSIS_TOOL_IDS.has(tool.id) || tool.id === "analysis-history")).map((category) => (
          <div key={category} className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{category}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {toolsByCategory(category).filter(tool => ACTIVE_ANALYSIS_TOOL_IDS.has(tool.id) || tool.id === "analysis-history").map((tool) => (
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
