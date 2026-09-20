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
    // Tools list unused — Geochemistry has its own dedicated screen
    // (GeochemistryScreen.tsx, ribbon of 4 groups + Editor panel) instead of
    // the generic sidebar-tree ModuleGroupScreen.tsx uses for the other
    // groups below. Kept as an entry (empty tools) only so NAV_ITEMS still
    // generates the "Geochemistry" top-nav tab from this registry.
    id: "geochemistry",
    label: "Geochemistry",
    tools: [],
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
