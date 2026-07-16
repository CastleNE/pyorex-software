/**
 * Spectrometry module — landing screen (spec §22: logo + Import buttons +
 * recent projects + compatible formats, shown when no project is active) →
 * categorized tool catalog (spec §3, once a project is active) → floating
 * tool windows, same WorkspaceArea/react-rnd pattern as Data Analysis/QAQC.
 */
import { useRef } from "react";
import PyOrexLogo from "@/components/PyOrexLogo";
import { PlaceholderPanel } from "@/components/VizWorkspace";
import WorkspaceArea from "@/components/window-manager/WorkspaceArea";
import type { WorkspaceAreaHandle } from "@/components/window-manager/types";
import ImportNativeSpectraWizard from "@/components/tool-windows/ImportNativeSpectraWizard";
import ImportProcessedResultsWizard from "@/components/tool-windows/ImportProcessedResultsWizard";
import RecentProjectsPanel from "@/components/tool-windows/RecentProjectsPanel";
import SpectralViewerWindow from "@/components/tool-windows/SpectralViewerWindow";
import PreprocessingWindow from "@/components/tool-windows/PreprocessingWindow";
import SpectrumQualityWindow from "@/components/tool-windows/SpectrumQualityWindow";
import FeatureExtractionWindow from "@/components/tool-windows/FeatureExtractionWindow";
import SpectralIndicesWindow from "@/components/tool-windows/SpectralIndicesWindow";
import MineralInterpretationWindow from "@/components/tool-windows/MineralInterpretationWindow";
import MineralPopulationAnalysisWindow from "@/components/tool-windows/MineralPopulationAnalysisWindow";
import SpectralLogWindow from "@/components/tool-windows/SpectralLogWindow";
import InterpretationTableWindow from "@/components/tool-windows/InterpretationTableWindow";
import SpectralExportWizard from "@/components/tool-windows/SpectralExportWizard";
import { SPECTROMETRY_CATEGORIES, toolsByCategory, type SpectrometryTool } from "@/lib/spectrometry-tools-registry";
import { getProject } from "@/lib/spectrometry-api";
import { useSpectrometryStore } from "@/stores/spectrometry-store";

export default function SpectrometryScreen() {
  const { activeProject, hasProject, setActiveProject } = useSpectrometryStore();
  const workspaceRef = useRef<WorkspaceAreaHandle>(null);

  async function refreshProject() {
    if (!activeProject) return;
    const { project } = await getProject(activeProject.id);
    setActiveProject(project);
  }

  function openTool(tool: SpectrometryTool) {
    if (tool.status === "planned") {
      workspaceRef.current?.openWindow({
        id: tool.id, title: tool.label, icon: "🚧",
        defaultPos: { x: 60, y: 40, width: 380, height: 200 },
        render: () => <PlaceholderPanel label={`${tool.label} — Coming soon${tool.description ? `\n${tool.description}` : ""}`} />,
      });
      return;
    }

    const commonPos = { x: 30 + Object.keys({}).length * 0, y: 20, width: 860, height: 560 };
    switch (tool.target) {
      case "import-native":
        workspaceRef.current?.openWindow({
          id: "import-native", title: "Import Native Spectra", icon: "📥", defaultPos: { x: 40, y: 20, width: 560, height: 480 },
          render: () => <ImportNativeSpectraWizard onImported={refreshProject} />,
        });
        return;
      case "import-processed":
        workspaceRef.current?.openWindow({
          id: "import-processed", title: "Import Processed Spectral Results", icon: "📥", defaultPos: { x: 40, y: 20, width: 720, height: 560 },
          render: () => <ImportProcessedResultsWizard onImported={refreshProject} />,
        });
        return;
      case "recent-projects":
        workspaceRef.current?.openWindow({
          id: "recent-projects", title: "Recent Spectral Projects", icon: "🕒", defaultPos: { x: 40, y: 20, width: 480, height: 420 },
          render: () => <RecentProjectsPanel />,
        });
        return;
      case "viewer":
        workspaceRef.current?.openWindow({ id: "spectral-viewer", title: "Spectral Viewer", icon: "📈", defaultPos: commonPos, render: () => <SpectralViewerWindow /> });
        return;
      case "preprocessing":
        workspaceRef.current?.openWindow({ id: "preprocessing", title: "Spectral Preprocessing", icon: "🧪", defaultPos: commonPos, render: () => <PreprocessingWindow /> });
        return;
      case "feature-extraction":
        workspaceRef.current?.openWindow({ id: "feature-extraction", title: "Feature Extraction", icon: "📐", defaultPos: commonPos, render: () => <FeatureExtractionWindow /> });
        return;
      case "indices":
        workspaceRef.current?.openWindow({
          id: tool.targetParams?.filter ? "hydration-parameters" : "spectral-indices",
          title: tool.label, icon: "∑", defaultPos: commonPos,
          render: () => <SpectralIndicesWindow filter={tool.targetParams?.filter} />,
        });
        return;
      case "interpretation":
        workspaceRef.current?.openWindow({
          id: tool.targetParams?.tab === "library" ? "library-matching" : "mineral-interpretation",
          title: tool.label, icon: "🔬", defaultPos: commonPos,
          render: () => <MineralInterpretationWindow initialTab={tool.targetParams?.tab as "manual" | "rules" | "library" | undefined} />,
        });
        return;
      case "white-mica":
        workspaceRef.current?.openWindow({ id: "white-mica", title: "White Mica Analysis", icon: "⚪", defaultPos: commonPos, render: () => <MineralPopulationAnalysisWindow analysisId="white-mica" /> });
        return;
      case "chlorite":
        workspaceRef.current?.openWindow({ id: "chlorite", title: "Chlorite Analysis", icon: "🟢", defaultPos: commonPos, render: () => <MineralPopulationAnalysisWindow analysisId="chlorite" /> });
        return;
      case "spectral-log":
        workspaceRef.current?.openWindow({ id: "spectral-log", title: "Spectral Log", icon: "📊", defaultPos: commonPos, render: () => <SpectralLogWindow /> });
        return;
      case "quality":
        workspaceRef.current?.openWindow({
          id: tool.targetParams?.tab ? `quality-${tool.targetParams.tab}` : "spectrum-quality",
          title: tool.label, icon: "🩺", defaultPos: commonPos,
          render: () => <SpectrumQualityWindow initialTab={tool.targetParams?.tab} />,
        });
        return;
      case "interpretation-table":
        workspaceRef.current?.openWindow({ id: "interpretation-table", title: "Interpretation Table", icon: "📋", defaultPos: commonPos, render: () => <InterpretationTableWindow /> });
        return;
      case "export":
        workspaceRef.current?.openWindow({ id: "export-results", title: "Export Results", icon: "⇩", defaultPos: { x: 40, y: 20, width: 520, height: 480 }, render: () => <SpectralExportWizard /> });
        return;
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <WorkspaceArea
        ref={workspaceRef}
        emptyState={hasProject ? <SpectrometryCatalog onOpenTool={openTool} /> : <SpectrometryLandingEmptyState onOpenTool={openTool} />}
      />
    </div>
  );
}

function SpectrometryLandingEmptyState({ onOpenTool }: { onOpenTool: (tool: SpectrometryTool) => void }) {
  const importNative = { id: "import-native-spectra", label: "Import Native Spectra", category: "Import" as const, status: "active" as const, target: "import-native" as const };
  const importProcessed = { id: "import-processed-results", label: "Import Processed Results", category: "Import" as const, status: "active" as const, target: "import-processed" as const };
  const recent = { id: "recent-spectral-projects", label: "Recent Spectral Projects", category: "Import" as const, status: "active" as const, target: "recent-projects" as const };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <PyOrexLogo size={40} />
      <p className="mt-1 text-sm font-medium text-zinc-300">Spectrometry</p>
      <div className="mt-2 flex gap-2">
        <button onClick={() => onOpenTool(importNative)} className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500">
          Import Spectra…
        </button>
        <button onClick={() => onOpenTool(importProcessed)} className="rounded-md border border-zinc-700 bg-zinc-800 px-4 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700">
          Import Processed Results…
        </button>
      </div>
      <button onClick={() => onOpenTool(recent)} className="mt-1 text-xs text-blue-400 hover:underline">
        Recent Spectral Projects
      </button>
      <p className="mt-3 max-w-sm text-center text-[11px] text-zinc-700">
        Compatible formats: ASD (experimental), SED (experimental), ASCII, TXT, CSV — plus processed CSV/Excel results from TSG/EZ-ID.
      </p>
    </div>
  );
}

function SpectrometryCatalog({ onOpenTool }: { onOpenTool: (tool: SpectrometryTool) => void }) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        {SPECTROMETRY_CATEGORIES.map((category) => (
          <div key={category} className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{category}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {toolsByCategory(category).map((tool) => (
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
