/**
 * Which dataset columns can classify the samples into categories (Editor → Categorías → «Clasificar por»): text
 * columns such as LITOL, ALTERACION, CAMPAÑA, SECTOR or the hole id, and numeric columns that are labels rather than
 * measurements (AÑO, campaign number, codes). Coordinates, depths, sample ids and analytes are left out: they are not
 * categories and would exceed the 50-category limit of the engine. A tool that declares the roles its group must have
 * (e.g. down-hole profiles need the hole id) keeps that restriction.
 */
import type { GeoColumn } from './geochemistry-api';
import type { ColumnRoleMap } from './semantic-roles';

const NEVER = new Set(['sample_id', 'row_index', 'easting', 'northing', 'elevation', 'longitude', 'latitude', 'depth', 'depth_from', 'depth_to']);
const MEASURED = new Set(['major_oxide', 'trace_element', 'ree', 'assay', 'ratio']);
/** Names that read as labels even when the values are numbers (year, campaign, phase, code…). */
const LABEL_NAME = /^(a[nñ]o|anio|year|yr|fecha|date|campa[nñ]a|campaign|fase|phase|etapa|programa|program|c[oó]digo|code|cod|tipo|type|clase|class|grupo|group|zona|zone|unidad|unit|nivel|level)(\b|_|$)/i;

export interface CategoryOptions { restricted: boolean; text: GeoColumn[]; numeric: GeoColumn[] }

export function categoryOptions(columns: GeoColumn[], roles: ColumnRoleMap, allowedRoles?: string[]): CategoryOptions {
  const role = (c: GeoColumn) => roles[c.name]?.semantic_role ?? 'unknown';
  if (allowedRoles?.length) {
    const allowed = columns.filter(c => allowedRoles.includes(role(c)));
    return { restricted: true, text: allowed.filter(c => !c.numeric), numeric: allowed.filter(c => c.numeric) };
  }
  const usable = columns.filter(c => !NEVER.has(role(c)) && !c.name.startsWith('_'));
  const text = usable.filter(c => !c.numeric);
  const numeric = usable.filter(c => c.numeric && !MEASURED.has(role(c)) && (role(c) === 'categorical' || LABEL_NAME.test(c.name) || role(c) === 'numeric_generic' || role(c) === 'unknown'));
  return { restricted: false, text, numeric };
}
