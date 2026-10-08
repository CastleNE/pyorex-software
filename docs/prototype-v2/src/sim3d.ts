/* Simulated 3D context for the Oxapampa prospect: a DEM, a porphyry stock and drillholes with assay intervals.
 * Everything here is synthetic and labelled as such in the UI. */
let seed = 7; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

export const CENTER: [number, number] = [455500, 8829000];
/** Elevation (m a.s.l.) — stand-in for Copernicus GLO-30 / SRTM. */
export function dem(e: number, n: number) {
  const dx = e - 458000, dy = n - 8833000;
  return 1780 + 620 * Math.exp(-(dx * dx + dy * dy) / (2 * 9000 ** 2)) + 140 * Math.sin(e / 3800) + 110 * Math.cos(n / 5200) + 45 * Math.sin((e + n) / 1300) + 75 * Math.sin(e / 1100 + n / 1700) + 35 * Math.cos(e / 600 - n / 900);
}
export const STOCK_TOP = 2150;
/** Porphyry stock: widens downward from its cupola. */
export function inStock(e: number, n: number, z: number) {
  if (z > STOCK_TOP) return false; const r = Math.hypot(e - CENTER[0], n - CENTER[1]); return r < 520 + 0.75 * (STOCK_TOP - z);
}
/** Cu (ppm) of the simulated system: a shell centred ~250 m below the cupola. */
export function cuModel(e: number, n: number, z: number) {
  const r = Math.hypot(e - CENTER[0], n - CENTER[1]); const zc = STOCK_TOP - 260;
  const g = Math.exp(-(r * r) / (2 * 1150 ** 2) - ((z - zc) ** 2) / (2 * 360 ** 2));
  return 35 + 2600 * g * (inStock(e, n, z) ? 1 : 0.6);
}

export interface Interval { from: number; to: number; cu: number; mo: number; lith: 'stock' | 'host'; e: number; n: number; z: number; vars: Record<string, number> }
export interface Hole { id: string; e: number; n: number; z: number; az: number; dip: number; len: number; iv: Interval[] }
export function along(h: Hole, t: number): [number, number, number] {
  const d = (h.dip * Math.PI) / 180, a = (h.az * Math.PI) / 180;
  return [h.e + t * Math.cos(d) * Math.sin(a), h.n + t * Math.cos(d) * Math.cos(a), h.z + t * Math.sin(d)];
}
// holes along the default A–A′ line every ~500 m (alternating azimuth), plus three off-line holes
const LA: [number, number] = [452600, 8831400], LB: [number, number] = [458400, 8826600];
const LU = [(LB[0] - LA[0]) / 7529, (LB[1] - LA[1]) / 7529];
const COLLARS: [string, number, number, number, number, number][] = [
  ...Array.from({ length: 12 }, (_, k): [string, number, number, number, number, number] => { const s = 900 + k * 520, off = (k % 2 ? 1 : -1) * (40 + (k * 37) % 90); return [`DDH-${String(k + 1).padStart(2, '0')}`, Math.round(LA[0] + LU[0] * s - LU[1] * off), Math.round(LA[1] + LU[1] * s + LU[0] * off), k % 2 ? 130 : 310, -(68 + (k * 7) % 20), 460 + ((k * 83) % 280)]; }),
  ['DDH-13', 455700, 8830200, 180, -60, 560], ['DDH-14', 456400, 8829600, 220, -65, 600], ['DDH-15', 454400, 8828300, 40, -70, 500],
];
export const HOLES: Hole[] = COLLARS.map(([id, e, n, az, dip, len]) => {
  const h: Hole = { id, e, n, z: Math.round(dem(e, n)), az, dip, len, iv: [] };
  for (let t = 0; t < len; t += 10) {
    const [pe, pn, pz] = along(h, t + 5); const base = cuModel(pe, pn, pz);
    const r = Math.hypot(pe - CENTER[0], pn - CENTER[1]), g = (base - 35) / 2600, ln = (x: number) => x * Math.exp(0.3 * gauss());
    const cu = Math.round(ln(base)), mo = +ln(base / 28 * (1 + 0.6 * Math.exp(-(((pz - (STOCK_TOP - 450)) / 200) ** 2)))).toFixed(1);
    const vars: Record<string, number> = { Cu: cu, Mo: mo, Au: +ln(base / 3600).toFixed(3), Ag: +ln(0.5 + base / 900).toFixed(2),
      Zn: Math.round(ln(60 + 900 * Math.exp(-((r - 2100) ** 2) / (2 * 520 ** 2)))), Pb: Math.round(ln(14 + 420 * Math.exp(-((r - 2300) ** 2) / (2 * 520 ** 2)))), As: Math.round(ln(5 + 220 * Math.exp(-((r - 2500) ** 2) / (2 * 620 ** 2)))),
      K2O: +(2.1 + 3.4 * g + 0.3 * gauss()).toFixed(2), Na2O: +Math.max(0.2, 3.9 - 3.1 * g + 0.3 * gauss()).toFixed(2), S: +ln(0.25 + 2.8 * Math.exp(-((r - 950) ** 2) / (2 * 620 ** 2))).toFixed(2) };
    h.iv.push({ from: t, to: Math.min(len, t + 10), cu, mo, lith: inStock(pe, pn, pz) ? 'stock' : 'host', e: pe, n: pn, z: pz, vars });
  }
  return h;
});
export const N_INTERVALS = HOLES.reduce((a, h) => a + h.iv.length, 0);

export interface SectionLine { a: [number, number]; b: [number, number]; buffer: number }
export const DEFAULT_SECTION: SectionLine = { a: [452600, 8831400], b: [458400, 8826600], buffer: 500 };
export function frame(L: SectionLine) {
  const dx = L.b[0] - L.a[0], dy = L.b[1] - L.a[1], len = Math.hypot(dx, dy); const u = [dx / len, dy / len], nrm = [-u[1], u[0]];
  const proj = (e: number, n: number) => { const px = e - L.a[0], py = n - L.a[1]; return { s: px * u[0] + py * u[1], d: px * nrm[0] + py * nrm[1] }; };
  const at = (s: number): [number, number] => [L.a[0] + u[0] * s, L.a[1] + u[1] * s];
  return { len, u, nrm, proj, at };
}
