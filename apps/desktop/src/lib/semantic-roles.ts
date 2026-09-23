/**
 * Semantic Variable System (v1) — the reusable layer between column classification (backend
 * `geochemistry.column_roles`) and a Tool Registry input's `allowed_roles`: it filters which columns an Editor may
 * offer for one field. Pure and tool-registry-shaped only (GeoRegistryTool/GeoColumnRole), so any module whose
 * tools come from the same Registry contract (DIAGRAMS today; Litogeoquímica, Exploración, Espectrometría,
 * Petrofísica later) can reuse it without its own copy of these rules — no column-name heuristics live here or in
 * any React component; those live once, in the backend classifier (analysis/geochemistry/semantics.py).
 */
import type { GeoColumn, GeoColumnRole, GeoRegistryTool } from './geochemistry-api';

export type ColumnRoleMap = Record<string, GeoColumnRole>;

export const roleMapFrom = (columns: GeoColumnRole[]): ColumnRoleMap => Object.fromEntries(columns.map(c => [c.column, c]));

const roleOf = (roles: ColumnRoleMap, name: string) => roles[name]?.semantic_role;
// 'high' only: a role-restricted input must never auto-fill from a heuristic or catalog-enriched guess (medium) —
// only from a direct, unambiguous name/unit match. 'low'/'medium' columns stay selectable, just not auto-picked.
const isConfident = (roles: ColumnRoleMap, name: string) => roles[name]?.confidence === 'high';

/**
 * Columns an input may offer. `allowedRoles` empty/undefined = no restriction declared for that input (CURRENT
 * BEHAVIOR, unchanged): any numeric column, exactly as before this system existed. Declared roles additionally
 * require the column to be numeric — every input using this system today is a numeric calculation input.
 */
export function compatibleInputColumns(columns: GeoColumn[], roles: ColumnRoleMap, allowedRoles: string[] | undefined): GeoColumn[] {
  const numeric = columns.filter(c => c.numeric);
  if (!allowedRoles?.length) return numeric;
  return numeric.filter(c => allowedRoles.includes(roleOf(roles, c.name) ?? 'unknown'));
}

/**
 * Columns the generic group/hole selector may offer. `allowedRoles` empty/undefined = no restriction (CURRENT
 * BEHAVIOR: every column, including text ones — a group is very often a hole id, which is rarely numeric).
 */
export function compatibleGroupColumns(columns: GeoColumn[], roles: ColumnRoleMap, allowedRoles: string[] | undefined): GeoColumn[] {
  if (!allowedRoles?.length) return columns;
  return columns.filter(c => allowedRoles.includes(roleOf(roles, c.name) ?? 'unknown'));
}

/** The `allowed_roles` a registry tool declares for one input key; undefined when the tool/key isn't known. */
export const allowedRolesFor = (tool: GeoRegistryTool | undefined, key: string): string[] | undefined =>
  tool?.inputs.find(i => i.key === key)?.allowed_roles;

/** First column that is both role-compatible and classified with enough confidence to auto-fill, not just show. */
export function confidentColumn(columns: GeoColumn[], roles: ColumnRoleMap, allowedRoles: string[] | undefined): GeoColumn | undefined {
  const candidates = compatibleInputColumns(columns, roles, allowedRoles);
  return allowedRoles?.length ? candidates.find(c => isConfident(roles, c.name)) : candidates[0];
}
