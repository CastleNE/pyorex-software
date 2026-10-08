/**
 * Which dataset columns feed a section: the elevation of surface samples and the drill-hole fields (hole id, from/to
 * or depth, azimuth, dip). Guessed from the semantic roles and usual names (Spanish and English); the user can change
 * every choice in the section panel.
 */
import type { DrillRequest } from './maps-api';
import type { ColumnRoleMap } from './semantic-roles';

interface Col { name: string; numeric: boolean }

const by = (cols: Col[], roles: ColumnRoleMap, role: string, name: RegExp, numeric = true) =>
  cols.find(c => roles[c.name]?.semantic_role === role && (!numeric || c.numeric))?.name
  ?? cols.find(c => name.test(c.name) && (!numeric || c.numeric))?.name ?? null;

export const AZIMUTH_NAME = /^(az|azi|azim|azimut|azimuth|rumbo_sondaje)(\b|_|$)/i;
export const DIP_NAME = /^(dip|incl|inclin|inclinaci[oó]n|inclination|buz|buzamiento)(\b|_|$)/i;

export function guessElevation(cols: Col[], roles: ColumnRoleMap): string | null {
  return by(cols, roles, 'elevation', /^(z|rl|cota|elev|elevation|altitud|altura|msnm)(\b|_|$)/i);
}

/** Drill-hole columns, or null when the dataset has no hole id with depths. */
export function guessDrill(cols: Col[], roles: ColumnRoleMap): DrillRequest | null {
  const hole = by(cols, roles, 'hole_id', /^(hole|hole_?id|bhid|sondaje|ddh|pozo|taladro|drillhole)(\b|_|$)/i, false);
  const from = by(cols, roles, 'depth_from', /^(from|desde|de|prof_?desde)(\b|_|$)/i);
  const to = by(cols, roles, 'depth_to', /^(to|hasta|a|prof_?hasta)(\b|_|$)/i);
  const depth = by(cols, roles, 'depth', /^(depth|prof|profundidad|at)(\b|_|$)/i);
  if (!hole || !((from && to) || depth)) return null;
  return {
    hole_column: hole, from_column: from && to ? from : null, to_column: from && to ? to : null, depth_column: from && to ? null : depth,
    azimuth_column: cols.find(c => c.numeric && AZIMUTH_NAME.test(c.name))?.name ?? null,
    dip_column: cols.find(c => c.numeric && DIP_NAME.test(c.name))?.name ?? null,
    azimuth: 0, dip: -90,
  };
}

/** Default band width: a tenth of the line length, rounded to 1-2-5 × 10ⁿ m (at least 10 m). */
export function defaultWidth(length: number): number {
  const target = Math.max(10, length / 10), pow = 10 ** Math.floor(Math.log10(target)), f = target / pow;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * pow;
}
