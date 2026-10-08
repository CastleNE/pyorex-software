// Simulated data for the prototype (deterministic). Nothing here is real.
export const REE = ['La', 'Ce', 'Pr', 'Nd', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu'] as const;
// Chondrite, Sun & McDonough (1989)
export const CHONDRITE: Record<string, number> = { La: 0.237, Ce: 0.613, Pr: 0.0928, Nd: 0.457, Sm: 0.148, Eu: 0.0563, Gd: 0.199, Tb: 0.0361, Dy: 0.246, Ho: 0.0546, Er: 0.16, Tm: 0.0247, Yb: 0.161, Lu: 0.0246 };

export interface Sample {
  i: number; id: string; sector: string; east: number; north: number;
  SiO2: number; TiO2: number; Al2O3: number; FeOT: number; MgO: number; CaO: number; Na2O: number; K2O: number;
  Cu: number; Mo: number; Rb: number; Sr: number; Y: number; Ta: number | null; Zr: number; Nb: number; Ba: number; Th: number; Hf: number; P2O5: number; MnO: number;
  ree: Record<string, number>; total: number;
}

let seed = 11;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

export const SECTORS = ['Tingo María', 'Oxapampa', 'Codo de Pozuzo'] as const;
const SPEC: Record<string, { n: number; si: [number, number]; alk: (s: number) => number; ree: [number, number, number]; c: [number, number]; pre: string }> = {
  'Tingo María': { n: 70, si: [48.5, 57.5], alk: s => 1.2 + 0.38 * (s - 48), ree: [38, 8, 0.92], c: [395000, 8968000], pre: 'TM' },
  'Oxapampa': { n: 95, si: [63.5, 73.5], alk: s => 6.0 + 0.12 * (s - 63), ree: [115, 5, 0.9], c: [452000, 8834000], pre: 'OX' },
  'Codo de Pozuzo': { n: 55, si: [55, 62], alk: s => 6.4 + 0.35 * (s - 55), ree: [190, 7, 0.85], c: [421000, 8902000], pre: 'CP' },
};

export const SAMPLES: Sample[] = [];
for (const sector of SECTORS) {
  const p = SPEC[sector];
  for (let k = 0; k < p.n; k++) {
    const si = p.si[0] + (p.si[1] - p.si[0]) * rnd();
    const alk = p.alk(si) + gauss() * 0.6;
    const k2o = alk * (0.36 + 0.18 * rnd());
    const sc = 0.75 + 0.5 * rnd();
    const ree: Record<string, number> = {};
    REE.forEach((e, j) => { const t = j / 13; let v = Math.exp(Math.log(p.ree[0]) * (1 - t) + Math.log(p.ree[1]) * t) * sc; if (e === 'Eu') v *= p.ree[2]; ree[e] = +(v * CHONDRITE[e]).toFixed(3); });
    const east = Math.round(p.c[0] + gauss() * 13000), north = Math.round(p.c[1] + gauss() * 16000);
    // porphyry-style Cu–Mo anomaly centred in Oxapampa (simulated)
    const dA = Math.hypot(east - 455500, north - 8829000) / 4200;
    const cuBoost = (sector === 'Oxapampa' ? 0.7 : sector === 'Codo de Pozuzo' ? 0.6 : 0) + 2.1 * Math.exp(-dA * dA);
    const s: Sample = {
      i: SAMPLES.length, id: `${p.pre}-${String(k + 1).padStart(3, '0')}`, sector,
      east, north,
      SiO2: +si.toFixed(2), TiO2: +(1.7 - 0.022 * si + rnd() * 0.12).toFixed(2), Al2O3: +(18.6 - 0.05 * si + gauss() * 0.6).toFixed(2),
      FeOT: +Math.max(0.8, 16.5 - 0.19 * si + gauss() * 0.7).toFixed(2), MgO: +Math.max(0.2, 11.5 - 0.16 * si + gauss() * 0.5).toFixed(2),
      CaO: +Math.max(0.4, 15.5 - 0.2 * si + gauss() * 0.5).toFixed(2), Na2O: +(alk - k2o).toFixed(2), K2O: +k2o.toFixed(2),
      Cu: Math.round(Math.exp(Math.log(25) + cuBoost + 0.7 * gauss() + 0.6)), Mo: +(Math.exp(0.6 + cuBoost * 0.8 + gauss())).toFixed(1),
      Rb: Math.round(35 + 2.6 * (si - 48) + gauss() * 15), Sr: Math.round(720 - 9 * (si - 48) + (sector === 'Oxapampa' ? 300 : 0) + gauss() * 60), Y: +(ree.Ho * 27.5 * (0.9 + 0.2 * rnd())).toFixed(1),
      Ta: rnd() < 0.15 ? null : +(0.2 + 0.03 * (si - 48) + rnd() * 0.4).toFixed(2), ree, total: 0, Zr: 0, Nb: 0, Ba: 0, Th: 0, Hf: 0, P2O5: 0, MnO: 0,
    };
    { const zb = sector === 'Codo de Pozuzo' ? 260 : sector === 'Oxapampa' ? 150 : 105; s.Zr = Math.round(zb + 1.5 * (si - 55) + gauss() * 25); s.Hf = +(s.Zr / 38).toFixed(1);
      s.Nb = +((sector === 'Codo de Pozuzo' ? 22 : sector === 'Oxapampa' ? 7 : 4.5) + gauss() * 1.6).toFixed(1); s.Ba = Math.round((sector === 'Codo de Pozuzo' ? 950 : 380 + 14 * (si - 48)) + gauss() * 90);
      s.Th = +Math.max(0.5, (sector === 'Codo de Pozuzo' ? 11 : 1.5 + 0.45 * (si - 48)) + gauss() * 1.2).toFixed(1); s.P2O5 = +Math.max(0.05, 0.42 - 0.013 * (si - 48) + gauss() * 0.04).toFixed(2); s.MnO = +Math.max(0.02, 0.19 - 0.0045 * (si - 48) + gauss() * 0.015).toFixed(3); }
    s.total = +(s.SiO2 + s.TiO2 + s.Al2O3 + s.FeOT + s.MgO + s.CaO + s.Na2O + s.K2O + 0.2 + 0.9 * rnd()).toFixed(2);
    SAMPLES.push(s);
  }
}

export interface NumVar { key: string; label: string; unit: string; get: (s: Sample) => number | null; }
export const NUM_VARS: NumVar[] = [
  ...(['SiO2', 'TiO2', 'Al2O3', 'FeOT', 'MgO', 'CaO', 'Na2O', 'K2O'] as const).map(k => ({ key: k, label: sub(k), unit: 'wt%', get: (s: Sample) => s[k] })),
  { key: 'alk', label: 'Na₂O+K₂O', unit: 'wt%', get: s => +(s.Na2O + s.K2O).toFixed(2) },
  { key: 'Cu', label: 'Cu', unit: 'ppm', get: s => s.Cu },
  { key: 'Mo', label: 'Mo', unit: 'ppm', get: s => s.Mo },
  { key: 'Rb', label: 'Rb', unit: 'ppm', get: s => s.Rb },
  { key: 'Sr', label: 'Sr', unit: 'ppm', get: s => s.Sr },
  { key: 'Y', label: 'Y', unit: 'ppm', get: s => s.Y },
  { key: 'Zr', label: 'Zr', unit: 'ppm', get: s => s.Zr }, { key: 'Nb', label: 'Nb', unit: 'ppm', get: s => s.Nb }, { key: 'Ba', label: 'Ba', unit: 'ppm', get: s => s.Ba },
  { key: 'Th', label: 'Th', unit: 'ppm', get: s => s.Th }, { key: 'Hf', label: 'Hf', unit: 'ppm', get: s => s.Hf }, { key: 'P2O5', label: 'P₂O₅', unit: 'wt%', get: s => s.P2O5 }, { key: 'MnO', label: 'MnO', unit: 'wt%', get: s => s.MnO },
  { key: 'Ta', label: 'Ta', unit: 'ppm', get: s => s.Ta },
  { key: 'sry', label: 'Sr/Y', unit: '', get: s => +(s.Sr / s.Y).toFixed(1) },
  { key: 'dyyb', label: '(Dy/Yb)N', unit: '', get: s => +((s.ree.Dy / CHONDRITE.Dy) / (s.ree.Yb / CHONDRITE.Yb)).toFixed(2) },
  { key: 'ai', label: 'AI (Ishikawa)', unit: '', get: s => +(100 * (s.MgO + s.K2O) / (s.MgO + s.K2O + s.CaO + s.Na2O)).toFixed(1) },
  { key: 'ccpi', label: 'CCPI', unit: '', get: s => +(100 * (s.MgO + s.FeOT) / (s.MgO + s.FeOT + s.Na2O + s.K2O)).toFixed(1) },
  { key: 'mali', label: 'MALI', unit: 'wt%', get: s => +(s.Na2O + s.K2O - s.CaO).toFixed(2) },
  { key: 'feidx', label: 'Fe-index', unit: '', get: s => +(s.FeOT / (s.FeOT + s.MgO)).toFixed(3) },
  { key: 'ce', label: 'Ce/Ce*', unit: '', get: s => +((s.ree.Ce / CHONDRITE.Ce) / Math.sqrt((s.ree.La / CHONDRITE.La) * (s.ree.Pr / CHONDRITE.Pr))).toFixed(2) },
  { key: 'acnk', label: 'A/CNK', unit: 'molar', get: s => asi(s) },
  { key: 'ank', label: 'A/NK', unit: 'molar', get: s => +((s.Al2O3 / 101.96) / (s.Na2O / 61.98 + s.K2O / 94.2)).toFixed(2) },
  { key: 'mg', label: 'Mg#', unit: '', get: s => mgNumber(s) },
  { key: 'eu', label: 'Eu/Eu*', unit: '', get: s => euAnomaly(s) },
  { key: 'layb', label: '(La/Yb)N', unit: '', get: s => +((s.ree.La / CHONDRITE.La) / (s.ree.Yb / CHONDRITE.Yb)).toFixed(1) },
];
export const numVar = (key: string) => NUM_VARS.find(v => v.key === key)!;

export function sub(f: string) { return f.replace(/(\d)/g, d => '₀₁₂₃₄₅₆₇₈₉'[+d]); }
export function mgNumber(s: Sample) { const mg = s.MgO / 40.3, fe = s.FeOT / 71.85; return +(100 * mg / (mg + fe)).toFixed(1); }
export function euAnomaly(s: Sample) { const n = (e: string) => s.ree[e] / CHONDRITE[e]; return +(n('Eu') / Math.sqrt(n('Sm') * n('Gd'))).toFixed(2); }
export function asi(s: Sample) { const al = s.Al2O3 / 101.96, ca = s.CaO / 56.08, na = s.Na2O / 61.98, k = s.K2O / 94.2; return +(al / (ca + na + k)).toFixed(2); }

// TAS plutónico (Middlemost, 1994) — simplified field geometry for the prototype
export const TAS_FIELDS: { name: string; poly: [number, number][]; label: [number, number] }[] = [
  { name: 'Gabro', poly: [[45, 0], [45, 5], [52, 5], [52, 0]], label: [47.6, 4.2] },
  { name: 'Gabrodiorita', poly: [[52, 0], [52, 5], [57, 5.9], [57, 0]], label: [54.5, 1.4] },
  { name: 'Diorita', poly: [[57, 0], [57, 5.9], [63, 7], [63, 0]], label: [60, 1.4] },
  { name: 'Granodiorita', poly: [[63, 0], [63, 7], [69, 8], [77.3, 0]], label: [66.5, 3] },
  { name: 'Granito', poly: [[69, 8], [69, 14.5], [80, 14.5], [80, 0], [77.3, 0]], label: [75, 10.5] },
  { name: 'Monzogabro', poly: [[45, 5], [49.4, 7.3], [52, 5]], label: [49, 5.8] },
  { name: 'Monzodiorita', poly: [[52, 5], [49.4, 7.3], [53, 9.3], [57, 5.9]], label: [53, 7.1] },
  { name: 'Monzonita', poly: [[57, 5.9], [53, 9.3], [57.6, 11.7], [63, 7]], label: [58, 9] },
  { name: 'Sienita', poly: [[63, 7], [57.6, 11.7], [61, 13.5], [69, 14.5], [69, 8]], label: [64.5, 11] },
  { name: 'Foidgabro', poly: [[41, 3], [41, 7], [45, 9.4], [49.4, 7.3], [45, 5], [45, 3]], label: [44, 6.3] },
  { name: 'Foidmonzodiorita', poly: [[45, 9.4], [48.4, 11.5], [53, 9.3], [49.4, 7.3]], label: [49, 9.6] },
  { name: 'Foidmonzosienita', poly: [[48.4, 11.5], [52.5, 14], [57.6, 11.7], [53, 9.3]], label: [52.8, 11.8] },
];
export function inPoly(x: number, y: number, p: [number, number][]) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function tasName(s: Sample) { const a = s.Na2O + s.K2O; return TAS_FIELDS.find(f => inPoly(s.SiO2, a, f.poly))?.name ?? 'Fuera de campos'; }

// ── Spectrometry: drillhole DDH-04 ────────────────────────────────────────
export const MINERALS: Record<string, { label: string; color: string }> = {
  kaolinite: { label: 'Caolinita', color: '#56b4e9' }, montmorillonite: { label: 'Montmorillonita', color: '#9ad0ec' },
  illite: { label: 'Illita', color: '#e69f00' }, muscovite: { label: 'Muscovita', color: '#b35a00' },
  chlorite: { label: 'Clorita', color: '#009e73' }, epidote: { label: 'Epidota', color: '#0b5d45' },
};
export interface Interval { i: number; from: number; to: number; mineral: string; score: number | null; aloh: number | null; cryst: number | null; cu: number; saturated: boolean }
seed = 41;
export const DDH: Interval[] = [];
for (let d = 0; d < 320; d += 4) {
  let m: string;
  if (d < 36) m = rnd() < 0.6 ? 'kaolinite' : 'montmorillonite';
  else if (d < 96) m = rnd() < 0.45 ? 'montmorillonite' : 'illite';
  else if (d < 250) m = rnd() < 0.78 ? 'illite' : d > 170 ? 'muscovite' : 'illite';
  else if (d < 276) m = rnd() < 0.6 ? 'chlorite' : 'illite';
  else m = rnd() < 0.7 ? 'chlorite' : 'epidote';
  const white = ['illite', 'muscovite', 'montmorillonite', 'kaolinite'].includes(m);
  const sat = rnd() < 0.03;
  DDH.push({
    i: DDH.length, from: d, to: d + 4, mineral: m, saturated: sat, score: sat ? null : +(0.7 + 0.28 * rnd()).toFixed(2),
    aloh: white ? +(2209 - 0.06 * Math.max(0, d - 60) + gauss() * 1.2).toFixed(1) : null,
    cryst: ['illite', 'muscovite'].includes(m) ? +(0.8 + 0.012 * Math.max(0, d - 60) + gauss() * 0.15).toFixed(2) : null,
    cu: Math.round(Math.exp(Math.log(80) + 2.4 * Math.exp(-(((d - 200) / 55) ** 2)) + gauss() * 0.25)),
  });
}
const g = (x: number, c: number, d: number, w: number) => d * Math.exp(-(((x - c) / w) ** 2));
const FEATURES: Record<string, [number, number, number][]> = {
  illite: [[1412, .10, 14], [1912, .20, 30], [2202, .24, 17], [2350, .08, 18], [2440, .06, 18]],
  muscovite: [[1410, .09, 12], [1912, .12, 30], [2198, .28, 15], [2350, .10, 16]],
  chlorite: [[1395, .05, 14], [1910, .08, 30], [2250, .13, 18], [2335, .20, 22]],
  epidote: [[1550, .05, 20], [1910, .06, 30], [2255, .10, 15], [2340, .18, 18]],
  kaolinite: [[1395, .10, 8], [1412, .12, 8], [1912, .06, 30], [2165, .14, 10], [2207, .20, 12]],
  montmorillonite: [[1412, .10, 16], [1912, .30, 32], [2208, .13, 20]],
};
export const WL: number[] = []; for (let x = 350; x <= 2500; x += 5) WL.push(x);
const continuum = (x: number) => 0.18 + 0.36 * (1 - Math.exp(-(x - 350) / 380)) - 0.04 * ((x - 1300) / 1200) ** 2 - g(x, 920, 0.06, 140);
export function spectrum(mineral: string, sd: number, hull: boolean, noise = 0.0012) {
  let s = sd * 97 + 13; const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 - 0.5; };
  return WL.map(x => { let q = 1; for (const [c, d, w] of FEATURES[mineral]) q *= 1 - g(x, c, d, w); const v = continuum(x) * q + r() * noise; return hull ? v / continuum(x) : v; });
}
export const LIBRARY = [
  { mineral: 'illite', source: 'USGS splib07 · IMt-1' }, { mineral: 'muscovite', source: 'USGS · GDS108' },
  { mineral: 'montmorillonite', source: 'USGS · SWy-1' }, { mineral: 'kaolinite', source: 'USGS · KGa-1' },
  { mineral: 'chlorite', source: 'USGS · SMR-13' }, { mineral: 'epidote', source: 'USGS · GDS26' },
];
export function matchScores(iv: Interval) {
  return LIBRARY.map((l, k) => ({ ...l, score: l.mineral === iv.mineral ? (iv.score ?? 0.6) : +Math.max(0.3, (iv.score ?? 0.6) - 0.06 - k * 0.07 - (l.mineral === 'muscovite' && iv.mineral === 'illite' ? -0.02 : 0.05)).toFixed(2) }))
    .sort((a, b) => b.score - a.score).slice(0, 5);
}
// Petrophysics (same hole)
export const PETRO = DDH.map(iv => ({ depth: (iv.from + iv.to) / 2, density: +(2.62 + 0.0004 * iv.from + (iv.mineral === 'chlorite' || iv.mineral === 'epidote' ? 0.08 : 0) + gauss() * 0.03).toFixed(3), magsus: +Math.max(0.05, (iv.mineral === 'illite' || iv.mineral === 'muscovite' ? 0.3 : 6) + gauss() * (iv.mineral === 'illite' ? 0.2 : 2)).toFixed(2) }));

export const quantile = (sorted: number[], q: number) => { const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo); };
export const median = (v: number[]) => quantile([...v].sort((a, b) => a - b), 0.5);

// ---------------- dataset columns as detected at import (Semantic Variable System) ----------------
export type ColRole = 'id' | 'category' | 'text' | 'qaqc' | 'east' | 'north' | 'elev' | 'depth' | 'major' | 'trace' | 'ree' | 'precious' | 'ratio' | 'ignore';
export interface Column { name: string; role: ColRole; analyte?: string; unit?: string; conf: 'high' | 'medium' | 'low'; note?: string }
export const ROLE_LABEL: Record<ColRole, { es: string; en: string }> = {
  id: { es: 'Identificador', en: 'Identifier' }, category: { es: 'Categoría', en: 'Category' }, text: { es: 'Texto libre', en: 'Free text' },
  qaqc: { es: 'QA/QC', en: 'QA/QC' }, east: { es: 'Este (X)', en: 'Easting (X)' }, north: { es: 'Norte (Y)', en: 'Northing (Y)' },
  elev: { es: 'Cota (Z)', en: 'Elevation (Z)' }, depth: { es: 'Profundidad', en: 'Depth' }, major: { es: 'Óxido mayor', en: 'Major oxide' },
  trace: { es: 'Elemento traza', en: 'Trace element' }, ree: { es: 'REE', en: 'REE' }, precious: { es: 'Metal precioso', en: 'Precious metal' },
  ratio: { es: 'Ratio / índice', en: 'Ratio / index' }, ignore: { es: 'Ignorar', en: 'Ignore' },
};
const ox = (a: string, conf: Column['conf'] = 'high'): Column => ({ name: `${a}_pct`, role: 'major', analyte: a, unit: 'wt%', conf });
const tr = (a: string, conf: Column['conf'] = 'high', note?: string): Column => ({ name: `${a}_ppm`, role: 'trace', analyte: a, unit: 'ppm', conf, note });
export const COLUMNS: Column[] = [
  { name: 'Muestra', role: 'id', conf: 'high', note: '220 valores únicos' },
  { name: 'Sector', role: 'category', conf: 'high', note: '3 valores' },
  { name: 'Litologia_campo', role: 'category', conf: 'medium', note: '7 valores' },
  { name: 'Observaciones', role: 'text', conf: 'medium', note: '198 valores distintos' },
  { name: 'Tipo', role: 'qaqc', conf: 'high', note: 'STD, BLK, DUP' },
  { name: 'Este', role: 'east', unit: 'm', conf: 'high' }, { name: 'Norte', role: 'north', unit: 'm', conf: 'high' },
  ...['SiO2', 'TiO2', 'Al2O3', 'FeOT', 'MnO', 'MgO', 'CaO', 'Na2O', 'K2O', 'P2O5'].map(a => ox(a)), ox('LOI', 'medium'),
  tr('Cu'), tr('Mo'), tr('Rb'), tr('Sr'), tr('Ba'), tr('Y'), tr('Zr'), tr('Hf'), tr('Nb'), tr('Th'), tr('Ta', 'high', '15 % < LD'), { name: 'Ti_ppm', role: 'trace', analyte: 'Ti', unit: 'ppm', conf: 'low', note: '¿duplica TiO2?' },
  ...REE.map(a => ({ name: `${a}_ppm`, role: 'ree' as ColRole, analyte: a, unit: 'ppm', conf: 'high' as const })),
];
