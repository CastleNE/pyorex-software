// Categorized catalog for the "Lithogeochemistry" ribbon group — same
// status:"active"|"planned" convention as analysis-tools-registry.ts.
// List lifted directly from the product spec's Lithogeochemistry section;
// TAS is the first real tool (analysis/lithogeochemistry/tas.py), the rest
// stay "planned" until built.

export type LithoCategory = "Classification Diagrams" | "Petrogenetic Indices" | "Discrimination & Trace Elements";

export const LITHO_CATEGORIES: LithoCategory[] = [
  "Classification Diagrams",
  "Petrogenetic Indices",
  "Discrimination & Trace Elements",
];

export interface LithoTool {
  id: string;
  label: string;
  category: LithoCategory;
  status: "active" | "planned";
  description?: string;
}

export const LITHO_TOOLS: LithoTool[] = [
  // ── Classification Diagrams ──────────────────────────────────────────────
  {
    id: "tas",
    label: "TAS Diagram",
    category: "Classification Diagrams",
    status: "active",
    description: "SiO2 series classification (Ultrabasic/Basic/Intermediate/Acid) — approximate, see tool for scope.",
  },
  { id: "qapf", label: "QAPF / Normative Classification", category: "Classification Diagrams", status: "planned" },
  { id: "afm", label: "AFM", category: "Classification Diagrams", status: "planned" },
  { id: "k2o-sio2", label: "K2O–SiO2", category: "Classification Diagrams", status: "planned" },
  { id: "mali", label: "MALI", category: "Classification Diagrams", status: "planned" },

  // ── Petrogenetic Indices ─────────────────────────────────────────────────
  { id: "fe-index", label: "Fe-Index", category: "Petrogenetic Indices", status: "planned" },
  { id: "shand-index", label: "Shand Index", category: "Petrogenetic Indices", status: "planned" },
  { id: "a-cnk", label: "A/CNK", category: "Petrogenetic Indices", status: "planned" },
  { id: "a-nk", label: "A/NK", category: "Petrogenetic Indices", status: "planned" },

  // ── Discrimination & Trace Elements ──────────────────────────────────────
  { id: "pearce", label: "Pearce Discrimination Diagrams", category: "Discrimination & Trace Elements", status: "planned" },
  { id: "winchester-floyd", label: "Winchester & Floyd", category: "Discrimination & Trace Elements", status: "planned" },
  { id: "muller", label: "Müller Diagrams", category: "Discrimination & Trace Elements", status: "planned" },
  { id: "ree-normalization", label: "REE Normalization", category: "Discrimination & Trace Elements", status: "planned" },
  { id: "primitive-mantle", label: "Primitive Mantle Normalization", category: "Discrimination & Trace Elements", status: "planned" },
  { id: "element-ratios", label: "Element Ratios", category: "Discrimination & Trace Elements", status: "planned" },
  { id: "fertility-sr-y", label: "Sr/Y", category: "Discrimination & Trace Elements", status: "planned" },
  { id: "fertility-la-yb", label: "La/Yb", category: "Discrimination & Trace Elements", status: "planned" },
  { id: "fertility-dy-yb", label: "Dy/Yb", category: "Discrimination & Trace Elements", status: "planned" },
  { id: "fertility-eu-eu", label: "Eu/Eu*", category: "Discrimination & Trace Elements", status: "planned" },
  { id: "fertility-ce-ce", label: "Ce/Ce*", category: "Discrimination & Trace Elements", status: "planned" },
];

export function lithoToolsByCategory(category: LithoCategory): LithoTool[] {
  return LITHO_TOOLS.filter((t) => t.category === category);
}
