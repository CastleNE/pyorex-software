import { useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import DatasetPanel from "@/components/DatasetPanel";
import { PlaceholderPanel } from "@/components/VizWorkspace";
import SpectrometryScreen from "@/components/SpectrometryScreen";
import type { ModuleGroup, ModuleTool } from "@/lib/modules-registry";

interface Props {
  group: ModuleGroup;
  onOpenData: () => void;
}

// Pantalla de un grupo de módulos — Espectrometría y Petrofísica (Geochemistry
// tiene su propia pantalla dedicada, GeochemistryScreen.tsx, desde que ganó
// ribbon+Editor propios). Árbol lateral con las herramientas de ESE grupo +
// workspace de la herramienta elegida.
export default function ModuleGroupScreen({ group, onOpenData }: Props) {
  const { activeModuleId, setActiveModuleId } = useAppStore();
  const selected = useMemo<ModuleTool | null>(
    () => group.tools.find((t) => t.id === activeModuleId) ?? null,
    [group, activeModuleId]
  );

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: dataset tree + this group's tools */}
      <aside className="flex flex-col w-72 min-w-56 border-r border-zinc-700 bg-zinc-900 shrink-0 overflow-hidden">
        <div className="h-64 shrink-0 overflow-hidden flex flex-col border-b border-zinc-700">
          <DatasetPanel onOpenData={onOpenData} />
        </div>

        <div className="flex-1 overflow-y-auto">
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
      </aside>

      {/* Right: workspace */}
      {!selected && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-zinc-900">
          <div className="text-4xl opacity-20">🧩</div>
          <p className="text-sm text-zinc-600">Elige un módulo a la izquierda para empezar</p>
        </div>
      )}
      {selected?.id === "spectrometry" && <SpectrometryScreen />}
      {selected && selected.id !== "spectrometry" && (
        <div className="flex flex-1 bg-zinc-900">
          <PlaceholderPanel label={`${selected.label} — Próximamente`} />
        </div>
      )}
    </div>
  );
}
