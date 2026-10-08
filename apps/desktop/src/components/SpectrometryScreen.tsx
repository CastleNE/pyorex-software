/**
 * Spectrometry module — landing screen (spec §22: logo + Import buttons +
 * recent projects + compatible formats, shown when no project is active) →
 * categorized tool catalog (spec §3, once a project is active) → floating
 * tool windows, same WorkspaceArea/react-rnd pattern as Data Analysis/QAQC.
 */
import { useEffect, useRef } from "react";
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
import PxIcon, { type PxIconName } from "@/components/PxIcon";
import {
  SPECTROMETRY_CATEGORIES,
  toolsByCategory,
  type SpectrometryCategory,
  type SpectrometryTarget,
  type SpectrometryTool,
} from "@/lib/spectrometry-tools-registry";
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

  // File → Import data (unified import) asks for a spectral import from anywhere in the app.
  const pendingImport = useSpectrometryStore((s) => s.pendingImport);
  useEffect(() => {
    if (!pendingImport) return;
    useSpectrometryStore.getState().requestImport(null);
    openTool(pendingImport === "native"
      ? { id: "import-native-spectra", label: "Import Native Spectra", category: "Import", status: "active", target: "import-native" }
      : { id: "import-processed-results", label: "Import Processed Results", category: "Import", status: "active", target: "import-processed" });
  }, [pendingImport]);

  function openTool(tool: SpectrometryTool) {
    if (tool.status === "planned") {
      workspaceRef.current?.openWindow({
        id: tool.id, title: tool.label, icon: "more",
        defaultPos: { x: 60, y: 40, width: 380, height: 200 },
        render: () => <PlaceholderPanel label={`${tool.label} — Coming soon${tool.description ? `\n${tool.description}` : ""}`} />,
      });
      return;
    }

    const commonPos = { x: 30 + Object.keys({}).length * 0, y: 20, width: 860, height: 560 };
    switch (tool.target) {
      case "import-native":
        workspaceRef.current?.openWindow({
          id: "import-native", title: "Import Native Spectra", icon: "import", defaultPos: { x: 40, y: 20, width: 560, height: 480 },
          render: () => <ImportNativeSpectraWizard onImported={refreshProject} />,
        });
        return;
      case "import-processed":
        workspaceRef.current?.openWindow({
          id: "import-processed", title: "Import Processed Spectral Results", icon: "import", defaultPos: { x: 40, y: 20, width: 720, height: 560 },
          render: () => <ImportProcessedResultsWizard onImported={refreshProject} />,
        });
        return;
      case "recent-projects":
        workspaceRef.current?.openWindow({
          id: "recent-projects", title: "Recent Spectral Projects", icon: "history", defaultPos: { x: 40, y: 20, width: 480, height: 420 },
          render: () => <RecentProjectsPanel />,
        });
        return;
      case "viewer":
        workspaceRef.current?.openWindow({ id: "spectral-viewer", title: "Spectral Viewer", icon: "spectrum", defaultPos: commonPos, render: () => <SpectralViewerWindow /> });
        return;
      case "preprocessing":
        workspaceRef.current?.openWindow({ id: "preprocessing", title: "Spectral Preprocessing", icon: "hull", defaultPos: commonPos, render: () => <PreprocessingWindow /> });
        return;
      case "feature-extraction":
        workspaceRef.current?.openWindow({ id: "feature-extraction", title: "Feature Extraction", icon: "feature", defaultPos: commonPos, render: () => <FeatureExtractionWindow /> });
        return;
      case "indices":
        workspaceRef.current?.openWindow({
          id: tool.targetParams?.filter ? "hydration-parameters" : "spectral-indices",
          title: tool.label, icon: "norm", defaultPos: commonPos,
          render: () => <SpectralIndicesWindow filter={tool.targetParams?.filter} />,
        });
        return;
      case "interpretation":
        workspaceRef.current?.openWindow({
          id: tool.targetParams?.tab === "library" ? "library-matching" : "mineral-interpretation",
          title: tool.label, icon: "mineral", defaultPos: commonPos,
          render: () => <MineralInterpretationWindow initialTab={tool.targetParams?.tab as "manual" | "rules" | "library" | undefined} />,
        });
        return;
      case "white-mica":
        workspaceRef.current?.openWindow({ id: "white-mica", title: "White Mica Analysis", icon: "mineral", defaultPos: commonPos, render: () => <MineralPopulationAnalysisWindow analysisId="white-mica" /> });
        return;
      case "chlorite":
        workspaceRef.current?.openWindow({ id: "chlorite", title: "Chlorite Analysis", icon: "mineral", defaultPos: commonPos, render: () => <MineralPopulationAnalysisWindow analysisId="chlorite" /> });
        return;
      case "spectral-log":
        workspaceRef.current?.openWindow({ id: "spectral-log", title: "Spectral Log", icon: "drill", defaultPos: commonPos, render: () => <SpectralLogWindow /> });
        return;
      case "quality":
        workspaceRef.current?.openWindow({
          id: tool.targetParams?.tab ? `quality-${tool.targetParams.tab}` : "spectrum-quality",
          title: tool.label, icon: "filter", defaultPos: commonPos,
          render: () => <SpectrumQualityWindow initialTab={tool.targetParams?.tab} />,
        });
        return;
      case "interpretation-table":
        workspaceRef.current?.openWindow({ id: "interpretation-table", title: "Interpretation Table", icon: "table", defaultPos: commonPos, render: () => <InterpretationTableWindow /> });
        return;
      case "export":
        workspaceRef.current?.openWindow({ id: "export-results", title: "Export Results", icon: "export", defaultPos: { x: 40, y: 20, width: 520, height: 480 }, render: () => <SpectralExportWizard /> });
        return;
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <WorkspaceArea
        ref={workspaceRef}
        banner={hasProject ? <SpectrometryRibbon onOpenTool={openTool} /> : undefined}
        emptyState={hasProject ? <SpectrometryCatalog onOpenTool={openTool} /> : <SpectrometryLandingEmptyState onOpenTool={openTool} />}
      />
    </div>
  );
}

const CATEGORY_META: Record<SpectrometryCategory, { icon: PxIconName; label: string; hint: string }> = {
  Import: { icon: "import", label: "Importar", hint: "Espectros nativos, tablas y resultados TSG / EZ-ID" },
  "Spectral Analysis": { icon: "spectrum", label: "Análisis espectral", hint: "Visor, preprocesado, rasgos, índices e identificación" },
  "Geological Interpretation": { icon: "mineral", label: "Interpretación geológica", hint: "Micas blancas, cloritas, log espectral" },
  "Quality Control": { icon: "filter", label: "Control de calidad", hint: "SNR, saturación, duplicados, metadatos" },
  Results: { icon: "table", label: "Resultados", hint: "Tabla de interpretación y exportación" },
};

const TOOL_ICON: Record<SpectrometryTarget, PxIconName> = {
  "import-native": "import",
  "import-processed": "import",
  "recent-projects": "history",
  viewer: "spectrum",
  preprocessing: "hull",
  "feature-extraction": "feature",
  indices: "norm",
  interpretation: "mineral",
  "white-mica": "mineral",
  chlorite: "mineral",
  "spectral-log": "drill",
  quality: "filter",
  "interpretation-table": "table",
  export: "export",
};

function SpectrometryLandingEmptyState({ onOpenTool }: { onOpenTool: (tool: SpectrometryTool) => void }) {
  const importNative = { id: "import-native-spectra", label: "Import Native Spectra", category: "Import" as const, status: "active" as const, target: "import-native" as const };
  const importProcessed = { id: "import-processed-results", label: "Import Processed Results", category: "Import" as const, status: "active" as const, target: "import-processed" as const };
  const recent = { id: "recent-spectral-projects", label: "Recent Spectral Projects", category: "Import" as const, status: "active" as const, target: "recent-projects" as const };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex w-full max-w-xl flex-col items-center gap-5 text-center">
        <PyOrexLogo size={44} wordmark={false} className="text-brand dark:text-muted" />
        <div>
          <h2 className="text-lg font-semibold text-fg">Espectrometría VNIR–SWIR</h2>
          <p className="mt-1 text-[13px] text-muted">
            Importa espectros para identificar minerales de alteración, medir rasgos de absorción y construir el log espectral del sondaje.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2.5 text-left">
          <button
            onClick={() => onOpenTool(importNative)}
            className="flex items-start gap-3 rounded-lg border border-accent bg-panel p-3 text-left shadow-[0_0_0_1px_var(--color-accent)] transition-colors hover:bg-hover"
          >
            <PxIcon name="spectrum" className="mt-0.5 h-5 w-5 text-accent-fg" />
            <span>
              <span className="block text-[13px] font-semibold text-fg">Importar espectros…</span>
              <span className="block text-[11.5px] text-muted">ASD, SED, ASCII, TXT, CSV · archivo, lote o carpeta</span>
            </span>
          </button>
          <button
            onClick={() => onOpenTool(importProcessed)}
            className="flex items-start gap-3 rounded-lg border border-line bg-panel p-3 text-left transition-colors hover:bg-hover"
          >
            <PxIcon name="table" className="mt-0.5 h-5 w-5 text-muted" />
            <span>
              <span className="block text-[13px] font-semibold text-fg">Importar resultados procesados…</span>
              <span className="block text-[11.5px] text-muted">CSV / Excel interpretado en TSG o EZ-ID</span>
            </span>
          </button>
        </div>
        <button onClick={() => onOpenTool(recent)} className="flex items-center gap-1.5 text-[12.5px] text-accent-fg hover:underline">
          <PxIcon name="history" className="h-4 w-4" />
          Proyectos espectrales recientes
        </button>
        <p className="max-w-md text-[11.5px] text-subtle">
          ASD y SED en modo experimental. Los empalmes entre detectores (~1000 y ~1830 nm) se sombrean en el visor para no confundirlos con rasgos.
        </p>
      </div>
    </div>
  );
}

/**
 * Ribbon pinned above the canvas once a project is open: every tool stays one
 * click away even while windows cover the catalog.
 */
function SpectrometryRibbon({ onOpenTool }: { onOpenTool: (tool: SpectrometryTool) => void }) {
  const { activeProject, clearActiveProject } = useSpectrometryStore();
  return (
    <div className="flex shrink-0 items-stretch gap-0 overflow-x-auto border-b border-line bg-panel px-2 pt-1.5" role="toolbar" aria-label="Espectrometría">
      {activeProject && (
        <div className="mb-1.5 mr-1 flex min-w-40 max-w-56 flex-col justify-center border-r border-line pr-3">
          <span className="truncate text-[12.5px] font-semibold text-fg" title={activeProject.name}>{activeProject.name}</span>
          <span className="text-[11px] text-muted">
            <span className="tabular font-mono">{activeProject.spectra_count.toLocaleString()}</span> espectros ·{" "}
            <button onClick={clearActiveProject} className="text-accent-fg hover:underline">cambiar</button>
          </span>
        </div>
      )}
      {SPECTROMETRY_CATEGORIES.map((category) => {
        const tools = toolsByCategory(category).filter((t) => t.status === "active");
        if (tools.length === 0) return null;
        return (
          <div key={category} className="flex flex-col border-r border-line px-2 last:border-r-0">
            <div className="grid grid-flow-col grid-rows-2 gap-x-1">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => onOpenTool(tool)}
                  title={tool.description ?? tool.label}
                  className="flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded px-1.5 text-[12px] text-fg hover:bg-hover"
                >
                  <PxIcon name={TOOL_ICON[tool.target]} className="h-[15px] w-[15px] text-brand dark:text-muted" />
                  {tool.label}
                </button>
              ))}
            </div>
            <span className="py-1 text-center text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">
              {CATEGORY_META[category].label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SpectrometryCatalog({ onOpenTool }: { onOpenTool: (tool: SpectrometryTool) => void }) {
  const { activeProject } = useSpectrometryStore();
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl">
        {activeProject && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3">
            <PxIcon name="project" className="h-5 w-5 text-accent-fg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-fg">{activeProject.name}</p>
              <p className="text-[12px] text-muted">
                <span className="tabular font-mono">{activeProject.sample_count.toLocaleString()}</span> muestras ·{" "}
                <span className="tabular font-mono">{activeProject.spectra_count.toLocaleString()}</span> espectros
              </p>
            </div>
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11.5px] font-medium text-accent-fg">
              {activeProject.workflow_type === "native" ? "Espectros nativos" : activeProject.workflow_type === "processed_table" ? "Resultados procesados" : "Mixto"}
            </span>
          </div>
        )}
        {SPECTROMETRY_CATEGORIES.map((category) => {
          const meta = CATEGORY_META[category];
          return (
            <section key={category} className="mb-6">
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{meta.label}</h3>
                <span className="text-[11.5px] text-subtle">{meta.hint}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {toolsByCategory(category).map((tool) => {
                  const active = tool.status === "active";
                  return (
                    <button
                      key={tool.id}
                      onClick={() => onOpenTool(tool)}
                      title={tool.description}
                      className={`group flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? "border-line bg-panel hover:border-accent hover:bg-hover"
                          : "border-dashed border-line bg-transparent hover:bg-panel"
                      }`}
                    >
                      <PxIcon name={TOOL_ICON[tool.target]} className={`mt-0.5 h-4 w-4 ${active ? "text-brand dark:text-muted group-hover:text-accent-fg" : "text-subtle"}`} />
                      <span className="min-w-0">
                        <span className={`block truncate text-[12.5px] font-medium ${active ? "text-fg" : "text-subtle"}`}>{tool.label}</span>
                        <span className={`text-[10.5px] font-semibold uppercase tracking-wide ${active ? "text-success" : "text-subtle"}`}>
                          {active ? "Disponible" : "Próximamente"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
