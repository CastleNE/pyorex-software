/**
 * Semantic Variable System (v1) — the reusable layer between column classification (backend
 * `geochemistry.column_roles`) and a Tool Registry input's `allowed_roles`/`allowed_analytes`: it filters which
 * columns an Editor may offer for one field, and which of those are confident enough to auto-fill. Pure and
 * tool-registry-shaped only (GeoRegistryTool/GeoColumnRole), so any module whose tools come from the same Registry
 * contract (DIAGRAMS and Litogeoquímica today; Exploración, Espectrometría, Petrofísica later) can reuse it without
 * its own copy of these rules — no column-name heuristics live here or in any React component; those live once, in
 * the backend classifier (analysis/geochemistry/semantics.py). Editor.tsx never hardcodes a tool id or an analyte:
 * it only reads InputSpec (`GeoRegistryInput`) through `inputConstraintFor`.
 */
import type { GeoColumn, GeoColumnRole, GeoRegistryTool } from './geochemistry-api';

export type ColumnRoleMap = Record<string, GeoColumnRole>;

export const roleMapFrom = (columns: GeoColumnRole[]): ColumnRoleMap => Object.fromEntries(columns.map(c => [c.column, c]));

const roleOf = (roles: ColumnRoleMap, name: string) => roles[name]?.semantic_role;
const analyteOf = (roles: ColumnRoleMap, name: string) => roles[name]?.analyte;
// 'high' only: a role-restricted input must never auto-fill from a heuristic or catalog-enriched guess (medium) —
// only from a direct, unambiguous name/unit match. 'low'/'medium' columns stay selectable, just not auto-picked.
const isConfident = (roles: ColumnRoleMap, name: string) => roles[name]?.confidence === 'high';

/** One input's role/analyte constraint, exactly as `geochemistry.registry` declares it for that key. */
export type InputConstraint = { allowed_roles: string[]; allowed_analytes: string[] };

/** The constraint a registry tool declares for one input key; undefined when the tool/key isn't known (backward
 * compatible: every function below treats "undefined" the same as "no restriction declared"). */
export function inputConstraintFor(tool: GeoRegistryTool | undefined, key: string): InputConstraint | undefined {
  const input = tool?.inputs.find(i => i.key === key);
  return input && { allowed_roles: input.allowed_roles, allowed_analytes: input.allowed_analytes };
}

const isRestricted = (constraint: InputConstraint | undefined): boolean =>
  !!constraint && (constraint.allowed_roles.length > 0 || constraint.allowed_analytes.length > 0);

/**
 * Compatibility rule: if allowed_roles is non-empty, the column's role must be in it; if allowed_analytes is
 * non-empty, the column's analyte must be in it too (both narrow the same column, independently — see TAS: role
 * major_oxide AND analyte SiO2). A column with no classification at all never matches a declared constraint.
 */
function matchesConstraint(roles: ColumnRoleMap, name: string, constraint: InputConstraint): boolean {
  if (constraint.allowed_roles.length && !constraint.allowed_roles.includes(roleOf(roles, name) ?? 'unknown')) return false;
  if (constraint.allowed_analytes.length) {
    const analyte = analyteOf(roles, name);
    if (!analyte || !constraint.allowed_analytes.includes(analyte)) return false;
  }
  return true;
}

/**
 * Columns an input may offer. No constraint declared (undefined, or both lists empty) = CURRENT BEHAVIOR,
 * unchanged: any numeric column. A declared constraint additionally requires the column to be numeric — every
 * input using this system today is a numeric calculation input.
 */
export function compatibleInputColumns(columns: GeoColumn[], roles: ColumnRoleMap, constraint: InputConstraint | undefined): GeoColumn[] {
  const numeric = columns.filter(c => c.numeric);
  if (!isRestricted(constraint)) return numeric;
  return numeric.filter(c => matchesConstraint(roles, c.name, constraint!));
}

/**
 * Columns the generic group/hole selector may offer. `allowedRoles` empty/undefined = no restriction (CURRENT
 * BEHAVIOR: every column, including text ones — a group is very often a hole id, which is rarely numeric). Group
 * has no analyte concept (hole_id carries none), so this stays role-only.
 */
export function compatibleGroupColumns(columns: GeoColumn[], roles: ColumnRoleMap, allowedRoles: string[] | undefined): GeoColumn[] {
  if (!allowedRoles?.length) return columns;
  return columns.filter(c => allowedRoles.includes(roleOf(roles, c.name) ?? 'unknown'));
}

/** First column that is both constraint-compatible and classified with enough confidence to auto-fill, not just show. */
export function confidentColumn(columns: GeoColumn[], roles: ColumnRoleMap, constraint: InputConstraint | undefined): GeoColumn | undefined {
  const candidates = compatibleInputColumns(columns, roles, constraint);
  return isRestricted(constraint) ? candidates.find(c => isConfident(roles, c.name)) : candidates[0];
}
