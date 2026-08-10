// Registro estático de grupos de módulos — cada uno es su propia pestaña de
// nivel superior en App.tsx (ver ModuleGroupScreen.tsx).
// Seam de migración: cuando el Plugin Core (Fase 0 pendiente) exista, este
// array se reemplaza por grupos derivados de PluginManifest[] sin tocar
// ModuleGroupScreen.tsx.

export interface ModuleTool {
  id: string;
  label: string;
  status: "active" | "planned";
}

export interface ModuleGroup {
  id: string;
  label: string;
  tools: ModuleTool[];
}

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: "geochemistry",
    label: "Geochemistry",
    tools: [
      { id: "data-analysis", label: "Data Analysis", status: "active" },
      { id: "visualization", label: "Visualization", status: "active" },
      { id: "qaqc", label: "QAQC", status: "active" },
      { id: "litogeochemistry", label: "Litogeochemistry", status: "planned" },
      { id: "mineral-exploration", label: "Mineral Exploration", status: "planned" },
    ],
  },
  {
    // Un solo entry point, como "Data Analysis" — Spectrometry tiene su
    // propio catálogo interno de ~26 herramientas (ver
    // lib/spectrometry-tools-registry.ts) en vez de listarlas acá.
    id: "espectrometria",
    label: "Espectrometría",
    tools: [
      { id: "spectrometry", label: "Spectrometry", status: "active" },
    ],
  },
  {
    id: "petrofisica",
    label: "Petrofísica",
    tools: [
      { id: "kt10-import", label: "Import KT-10 data", status: "planned" },
      { id: "downhole-log", label: "Down-hole Log", status: "planned" },
    ],
  },
];
