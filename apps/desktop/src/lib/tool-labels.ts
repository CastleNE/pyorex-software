import type { Txt } from './i18n';

/**
 * English names of the geochemistry tools. The backend registry serves the Spanish names (canonical, used in reports
 * and sessions); the UI shows these when the interface is in English. Unknown ids fall back to the served name.
 */
const EN: Record<string, string> = {
  line: 'XY lines',
  'qq-normal': 'Normal Q–Q',
  probability: 'Normal probability',
  ecdf: 'Cumulative probability (ECDF)',
  'assay-compare': 'Assay comparison XY',
  'assay-difference': 'Assay differences',
  downhole: 'Downhole · profile by hole',
  'downhole-compare': 'Downhole · compare assays',
  scatter: 'XY scatter',
  histogram: 'Histogram',
  boxplot: 'Tukey · box and whiskers',
  ternary: 'ABC ternary',
  harker: 'Harker · SiO2 vs oxide',
  tas: 'TAS · volcanic classification',
  qapf: 'QAPF · modal projection',
  afm: 'AFM · projection',
  'shand-index': 'Shand · A/CNK vs A/NK',
  'ree-normalization': 'REE · chondrite SM89',
  'primitive-mantle': 'Multi-element · primitive mantle SM89',
  'element-ratios': 'Element ratio',
  alteration: 'Alteration · AI–CCPI',
  'custom-diagram': 'Custom diagram',
};

/** Bilingual name of a tool: the served (Spanish) label plus its English name. */
export const toolLabel = (tool: { id: string; label: string }): Txt => ({ es: tool.label, en: EN[tool.id] ?? tool.label });
