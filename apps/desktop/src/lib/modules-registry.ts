// Registro estático de grupos de módulos para la pantalla "Módulos".
// Seam de migración: cuando el Plugin Core (Fase 0 pendiente) exista, este
// array se reemplaza por grupos derivados de PluginManifest[] sin tocar
// ModulosScreen.tsx.

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
      { id: "litogeochemistry", label: "Litogeochemistry", status: "planned" },
      { id: "mineral-exploration", label: "Mineral Exploration", status: "planned" },
    ],
  },
  {
    // Herramientas más allá de import/visualization aún sin definir con
    // product-manager — agregar aquí cuando se especifiquen, no antes.
    id: "espectrometria",
    label: "Espectrometría",
    tools: [
      { id: "tsg-import", label: "Import TSG data", status: "planned" },
      { id: "spectral-visualization", label: "Visualization", status: "planned" },
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
