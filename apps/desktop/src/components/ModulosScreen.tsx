import { useMemo } from "react";
import { useDatasetStore } from "@/stores/dataset-store";
import { useAppStore } from "@/stores/app-store";
import DatasetPanel from "@/components/DatasetPanel";
import VizWorkspace, { PlaceholderPanel } from "@/components/VizWorkspace";
import DataAnalysisScreen from "@/components/DataAnalysisScreen";
import QaqcScreen from "@/components/QaqcScreen";
import SpectrometryScreen from "@/components/SpectrometryScreen";
import { MODULE_GROUPS, type ModuleTool } from "@/lib/modules-registry";

interface Props {
  onOpenData: () => void;
}

// Pantalla "Módulos": árbol de datasets + grupos de módulos (Geochemistry,
// Espectrometría, Petrofísica, ...) + workspace de la herramienta elegida.
// Los grupos vienen de modules-registry.ts — agregar un módulo nuevo no
// requiere tocar este componente.
//
// La herramienta seleccionada vive en app-store (activeModuleId) en vez de
// useState local, para que otras pantallas (ej. el botón "Open in
// Visualization" de un resultado de análisis) puedan seleccionarla desde
// afuera de este árbol de render.
export default function ModulosScreen({ onOpenData }: Props) {
  const { hasData } = useDatasetStore();
  const { activeModuleId, setActiveModuleId } = useAppStore();
  const selected = useMemo<ModuleTool | null>(() => {
    for (const group of MODULE_GROUPS) {
      const found = group.tools.find((t) => t.id === activeModuleId);
      if (found) return found;
    }
    return null;
  }, [activeModuleId]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: dataset tree + module groups */}
      <aside className="flex flex-col w-72 min-w-56 border-r border-zinc-700 bg-zinc-900 shrink-0 overflow-hidden">
        <div className="h-64 shrink-0 overflow-hidden flex flex-col border-b border-zinc-700">
          <DatasetPanel onOpenData={onOpenData} />
        </div>

        <div className="flex-1 overflow-y-auto">
          {MODULE_GROUPS.map((group) => (
            <div key={group.id} className="border-b border-zinc-800/60">
              <p className="px-4 pt-3 pb-1 text-xs font-semibold text-zinc-400">{group.label}</p>
              {group.tools.map((tool) => {
                const isSelected = selected?.id === tool.id;
                return (
                  <button
                    key={tool.id}
                    onClick={() => setActiveModuleId(tool.id)}
                    className={`w-full flex items-center justify-between px-4 py-1.5 text-xs text-left transition-colors ${
                      isSelected ? "bg-blue-900/30 text-blue-300" : "hover:bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    <span className="truncate">{tool.label}</span>
                    {tool.status === "planned" && (
                      <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-zinc-600">
                        Próx.
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* Right: workspace */}
      {!selected && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-zinc-900">
          <div className="text-4xl opacity-20">🧩</div>
          <p className="text-sm text-zinc-600">Elige un módulo a la izquierda para empezar</p>
        </div>
      )}
      {selected?.id === "visualization" && <VizWorkspace hasData={hasData} onOpenData={onOpenData} />}
      {selected?.id === "data-analysis" && <DataAnalysisScreen onOpenData={onOpenData} />}
      {selected?.id === "qaqc" && <QaqcScreen onOpenData={onOpenData} />}
      {selected?.id === "spectrometry" && <SpectrometryScreen />}
      {selected && !["visualization", "data-analysis", "qaqc", "spectrometry"].includes(selected.id) && (
        <div className="flex flex-1 bg-zinc-900">
          <PlaceholderPanel label={`${selected.label} — Próximamente`} />
        </div>
      )}
    </div>
  );
}
