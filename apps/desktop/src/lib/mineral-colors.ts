/**
 * Alteration-mineral colours for Spectrometry (design system: `min-*` tokens
 * in styles/globals.css — keep both in sync). Families share related hues so
 * alteration zones read at a glance: white micas ochre, clays blue,
 * propylitic green, advanced-argillic magenta/violet.
 */
export const MINERAL_COLORS = {
  illite: "#e69f00",
  muscovite: "#b35a00",
  kaolinite: "#56b4e9",
  montmorillonite: "#9ad0ec",
  pyrophyllite: "#8e6bbf",
  alunite: "#cc79a7",
  chlorite: "#009e73",
  epidote: "#0b5d45",
  carbonate: "#0072b2",
  gypsum: "#c9d1d9",
  none: "#8c96a0",
} as const;

export type MineralKey = keyof typeof MINERAL_COLORS;

/** Okabe–Ito categorical palette (colour-blind safe) for series without a mineral meaning. */
export const CATEGORICAL = ["#0072b2", "#e69f00", "#009e73", "#cc79a7", "#56b4e9", "#d55e00", "#f0e442", "#8c96a0"] as const;

/** Line/marker series order tuned to read on both the dark and light chart backgrounds. */
export const SERIES = ["#e69f00", "#56b4e9", "#009e73", "#cc79a7", "#d55e00", "#0072b2", "#f0e442"] as const;

// Order matters: more specific names first (e.g. "illite-smectite" → illite).
const ALIASES: [RegExp, MineralKey][] = [
  [/(sericit|illit|phengit|paragonit|white ?mica|mica blanca)/i, "illite"],
  [/muscovit/i, "muscovite"],
  [/(kaolin|caolin|dickit|halloysit|nacrit)/i, "kaolinite"],
  [/(montmorillon|smectit|esmectit|nontronit|saponit|beidellit)/i, "montmorillonite"],
  [/(pyrophyllit|pirofilit)/i, "pyrophyllite"],
  [/alunit/i, "alunite"],
  [/(chlorit|clorit)/i, "chlorite"],
  [/(epidot|zoisit|clinozoisit)/i, "epidote"],
  [/(calcit|dolomit|ankerit|sideri|carbonat|magnesit)/i, "carbonate"],
  [/(gyps|yeso|anhydrit|anhidrit)/i, "gypsum"],
  [/(unclassified|sin clasificar|aspectral|no feature|none|null|—)/i, "none"],
];

export function mineralKey(label: string | null | undefined): MineralKey | null {
  if (!label) return "none";
  for (const [re, key] of ALIASES) if (re.test(label)) return key;
  return null;
}

/**
 * Colour for a mineral label. Known minerals get their fixed colour; unknown
 * labels get a stable categorical colour from `fallback` (shared map so the
 * same label keeps its colour within a session).
 */
export function mineralColor(label: string | null | undefined, fallback: Map<string, string> = SESSION_FALLBACK): string {
  const key = mineralKey(label);
  if (key) return MINERAL_COLORS[key];
  const name = String(label);
  if (!fallback.has(name)) fallback.set(name, CATEGORICAL[fallback.size % (CATEGORICAL.length - 1)]);
  return fallback.get(name)!;
}

const SESSION_FALLBACK = new Map<string, string>();
