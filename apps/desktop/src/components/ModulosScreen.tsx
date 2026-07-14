import { useState } from "react";
import { useDatasetStore } from "@/stores/dataset-store";
import DatasetPanel from "@/components/DatasetPanel";
import VizWorkspace, { PlaceholderPanel } from "@/components/VizWorkspace";
import { MODULE_GROUPS, type ModuleTool } from "@/lib/modules-registry";

interface Props {
  onOpenData: () => void;
}

// Pantalla "Módulos": árbol de datasets + grupos de módulos (Geochemistry,
// Espectrometría, Petrofísica, ...) + workspace de la herramienta elegida.
// Los grupos vienen de modules-registry.ts — agregar un módulo nuevo no
// requiere tocar este componente.
export default function ModulosScreen({ onOpenData }: Props) {
  const { hasData } = useDatasetStore();
  const [selected, setSelected] = useState<ModuleTool | null>(null);

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
                    onClick={() => setSelected(tool)}
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
      {selected && selected.id !== "visualization" && (
        <div className="flex flex-1 bg-zinc-900">
          <PlaceholderPanel label={`${selected.label} — Próximamente`} />
        </div>
      )}
    </div>
  );
}
