"""Semantic Variable System (v1): deterministic classification of dataset columns into geological/geochemical
roles — independent of, and finer-grained than, the coarse ``ColumnRole`` computed at import time
(``analysis/data/importer.py::classify_column_role``, e.g. ``coordinate_z`` lumps depth *and* elevation,
``sample_identifier`` lumps sample and hole ids). ``classify_column`` is column-name + dtype only: it never reads
or changes a value.

WHAT THIS IS
    A single, reusable classification layer other modules (Litogeoquímica, Exploración, Espectrometría,
    Petrofísica) can call without duplicating name/unit heuristics. The Tool Registry (``registry.py``) imports
    ``SemanticRole`` to declare, per input, which roles a tool accepts (``InputSpec.allowed_roles`` /
    ``ToolSpec.group_allowed_roles``); the RPC layer (``geochemistry.column_roles``) exposes the actual
    per-dataset classification the frontend intersects against those constraints. This module imports neither.

WHAT THIS IS NOT (yet)
    No machine learning, no aggressive inference. Ambiguous columns fall back to NUMERIC_GENERIC (numeric dtype)
    or UNKNOWN (anything else) rather than guessing — see ``classify_column``.

USER CORRECTION
    A user may correct a column's role (and analyte) from the desktop. Corrections are stored per dataset in its
    metadata (``semantic_overrides``) and applied by ``with_override`` on top of the classifier: they win, carry
    ``source='user'`` and HIGH confidence, and never change a value — only which tools offer the column.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum


class SemanticRole(StrEnum):
    SAMPLE_ID = 'sample_id'
    HOLE_ID = 'hole_id'
    ROW_INDEX = 'row_index'   # internal row/order/object id — never a geochemical or spatial variable
    DEPTH = 'depth'
    DEPTH_FROM = 'depth_from'
    DEPTH_TO = 'depth_to'
    EASTING = 'easting'
    NORTHING = 'northing'
    ELEVATION = 'elevation'
    LONGITUDE = 'longitude'
    LATITUDE = 'latitude'
    MAJOR_OXIDE = 'major_oxide'
    TRACE_ELEMENT = 'trace_element'
    REE = 'ree'
    ASSAY = 'assay'
    RATIO = 'ratio'
    CATEGORICAL = 'categorical'
    NUMERIC_GENERIC = 'numeric_generic'
    UNKNOWN = 'unknown'


class Confidence(StrEnum):
    HIGH = 'high'
    MEDIUM = 'medium'
    LOW = 'low'


@dataclass(frozen=True, slots=True)
class ColumnClassification:
    column: str
    semantic_role: SemanticRole
    analyte: str | None = None
    unit: str | None = None
    confidence: Confidence = Confidence.LOW
    source: str = 'dtype'   # 'name' | 'unit' | 'catalog' | 'dtype'


def classification_to_dict(c: ColumnClassification) -> dict:
    return {'column': c.column, 'semantic_role': c.semantic_role.value, 'analyte': c.analyte, 'unit': c.unit,
            'confidence': c.confidence.value, 'source': c.source}


# ── Vocabularies (classification only — independent of registry.REE/TRACE, which order the SM89 spider panels) ──
# Priority when a unit-stripped name matches more than one list (see classify_column): REE > major oxide >
# identified trace element (this includes Au/Ag: which specific analyte it is outranks "it gets assayed") >
# generic assay keyword with no resolvable analyte > numeric_generic.
REE_ELEMENTS = ('La', 'Ce', 'Pr', 'Nd', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu')
TRACE_ELEMENT_SYMBOLS = (
    'Cu', 'Pb', 'Zn', 'Ni', 'Co', 'Cr', 'V', 'Mn', 'Mo', 'As', 'Sb', 'Bi', 'Cd', 'W', 'Sn', 'Ba', 'Sr', 'Rb', 'Cs',
    'Th', 'U', 'Zr', 'Hf', 'Nb', 'Ta', 'Y', 'Ga', 'Sc', 'Be', 'Li', 'B', 'Ge', 'Se', 'Te', 'Tl', 'In', 'Re', 'Hg',
    'Ir', 'Os', 'Pd', 'Pt', 'Rh', 'Ru', 'F', 'S', 'Au', 'Ag',
)
MAJOR_OXIDES = ('SiO2', 'TiO2', 'Al2O3', 'Fe2O3', 'Fe2O3T', 'FeO', 'FeOT', 'MnO', 'MgO', 'CaO', 'Na2O', 'K2O',
                'P2O5', 'Cr2O3', 'LOI')

_SAMPLE_ID_NAMES = frozenset({'sample_id', 'sampleid', 'sample', 'sampno', 'sample_no', 'sample_num',
                              'sample_number', 'muestra', 'id_muestra', 'codigo_muestra', 'muestra_id'})
_HOLE_ID_NAMES = frozenset({'hole_id', 'holeid', 'dhid', 'hole', 'holeno', 'hole_no', 'sondaje', 'pozo',
                            'drill_hole', 'drillhole', 'bhid', 'dh_id'})
# Internal index/order columns (IoGAS-style [Order], GIS FID/OBJECTID, generic Row/RowID/Index) — never a real
# geochemical or spatial variable. Deliberately conservative: exact names only, not a substring like 'row'/'id'.
_ROW_INDEX_NAMES = frozenset({'order', 'row', 'row_id', 'rowid', 'index', 'fid', 'objectid'})
_DEPTH_FROM_NAMES = frozenset({'from', 'from_m', 'depth_from', 'de', 'desde'})
_DEPTH_TO_NAMES = frozenset({'to', 'to_m', 'depth_to', 'a', 'hasta'})
_DEPTH_NAMES = frozenset({'depth', 'profundidad', 'prof', 'depth_m'})
# Exact names only (see module docstring on conservatism): a bare substring check ('lon'/'lat') would collide with
# too many unrelated column names.
_LONGITUDE_NAMES = frozenset({'longitude', 'long_wgs84', 'lon_wgs84', 'longitude_wgs84', 'lon'})
_LATITUDE_NAMES = frozenset({'latitude', 'lat_wgs84', 'latitude_wgs84', 'lat'})
_CATEGORICAL_HINTS = ('lithology', 'litho', 'rock_type', 'rocktype', 'formation', 'alteration', 'mineral', 'zone',
                      'unit_geo', 'geologia', 'geology', 'regolith', 'domain', 'facies')
_GENERIC_ASSAY_HINTS = ('assay', 'ensaye', 'ensayo')

_UNIT_SUFFIX = re.compile(r'[\s_]*[(\[]?(wt%|wtpct|pct|ppm|ppb|%)[)\]]?$', re.IGNORECASE)
_UNIT_PRESENTATION = {'pct': 'wt%', 'wt%': 'wt%', 'wtpct': 'wt%', '%': 'wt%', 'ppm': 'ppm', 'ppb': 'ppb'}

# Existing coarse ColumnRole (analysis/data/importer.py) -> the closest SemanticRole, used only to enrich an
# otherwise-ambiguous (LOW confidence) result — see classify_column_with_hint. Roles this module can already tell
# apart on its own (coordinate_z: depth vs. elevation; sample_identifier: sample vs. hole id) are deliberately
# absent: a coarse hint must never override a more specific name-based result.
_CATALOG_ROLE_HINTS = {
    'coordinate_x': SemanticRole.EASTING, 'coordinate_y': SemanticRole.NORTHING,
    'assay_oxide': SemanticRole.MAJOR_OXIDE, 'ratio_numeric': SemanticRole.RATIO,
    'text_attribute': SemanticRole.CATEGORICAL, 'qaqc_attribute': SemanticRole.CATEGORICAL,
    'calculated_numeric': SemanticRole.NUMERIC_GENERIC, 'physical_numeric': SemanticRole.NUMERIC_GENERIC,
    'index_numeric': SemanticRole.NUMERIC_GENERIC,
}


def _normalize(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '_', name.strip().lower()).strip('_')


def _split_unit(name: str) -> tuple[str, str | None]:
    """('Cu_ppm', ...) -> ('Cu', 'ppm'). No suffix found -> (name, None)."""
    match = _UNIT_SUFFIX.search(name)
    if not match:
        return name, None
    return name[:match.start()].rstrip('_').rstrip(), _UNIT_PRESENTATION.get(match.group(1).lower())


def _match_exact(candidate: str, canonical: tuple[str, ...]) -> str | None:
    """Case-insensitive equality against a canonical vocabulary; returns the canonical spelling."""
    candidate = candidate.strip('_').lower()
    return next((canon for canon in canonical if candidate == canon.lower()), None)


def _match_analyte(base: str) -> tuple[str, SemanticRole] | None:
    """Unit-stripped column base -> (analyte, role), in priority order: REE > major oxide > identified trace
    element (Au/Ag included — which specific metal it is outranks "it happens to be assayed", see
    SemanticRole.ASSAY below). ``None`` when no analyte is recognized at all.
    """
    if analyte := _match_exact(base, REE_ELEMENTS):
        return analyte, SemanticRole.REE
    if analyte := _match_exact(base, MAJOR_OXIDES):
        return analyte, SemanticRole.MAJOR_OXIDE
    if analyte := _match_exact(base, TRACE_ELEMENT_SYMBOLS):
        return analyte, SemanticRole.TRACE_ELEMENT
    return None


def classify_column(name: str, numeric: bool) -> ColumnClassification:
    """Deterministic: the column's name and whether it is numeric. Priority (first match wins):

    1. exact identifier / row-index / depth-family / longitude-latitude names, 2. coordinate name fragments,
    3. a known analyte (REE > major oxide > trace element) once a trailing unit is stripped, 4. a generic "assay"
    name with no resolvable analyte, 5. a ratio-looking name, 6. a categorical name hint, 7. numeric/unknown
    fallback. Ambiguous cases never guess a specific role — see the module docstring.
    """
    normalized = _normalize(name)

    if normalized in _SAMPLE_ID_NAMES:
        return ColumnClassification(name, SemanticRole.SAMPLE_ID, confidence=Confidence.HIGH, source='name')
    if normalized in _HOLE_ID_NAMES:
        return ColumnClassification(name, SemanticRole.HOLE_ID, confidence=Confidence.HIGH, source='name')
    if normalized in _ROW_INDEX_NAMES:
        return ColumnClassification(name, SemanticRole.ROW_INDEX, confidence=Confidence.HIGH, source='name')
    if normalized in _DEPTH_FROM_NAMES:
        return ColumnClassification(name, SemanticRole.DEPTH_FROM, confidence=Confidence.HIGH, source='name')
    if normalized in _DEPTH_TO_NAMES:
        return ColumnClassification(name, SemanticRole.DEPTH_TO, confidence=Confidence.HIGH, source='name')
    if normalized in _DEPTH_NAMES:
        return ColumnClassification(name, SemanticRole.DEPTH, confidence=Confidence.HIGH, source='name')
    if normalized in _LONGITUDE_NAMES:
        return ColumnClassification(name, SemanticRole.LONGITUDE, confidence=Confidence.HIGH, source='name')
    if normalized in _LATITUDE_NAMES:
        return ColumnClassification(name, SemanticRole.LATITUDE, confidence=Confidence.HIGH, source='name')
    # Spanish field names (Este/Norte, UTM_Este, Norte_PSAD56…) as whole tokens only — never a substring such as
    # 'oeste' or 'nordeste', which name directions, not coordinate columns.
    tokens = set(normalized.split('_'))
    if 'east' in normalized or 'este' in tokens:
        return ColumnClassification(name, SemanticRole.EASTING, confidence=Confidence.HIGH, source='name')
    if 'north' in normalized or 'norte' in tokens:
        return ColumnClassification(name, SemanticRole.NORTHING, confidence=Confidence.HIGH, source='name')
    if any(token in normalized for token in ('elevation', 'elev', 'cota')) or normalized in {'z', 'rl'}:
        return ColumnClassification(name, SemanticRole.ELEVATION, confidence=Confidence.HIGH, source='name')

    base, unit = _split_unit(name)
    matched = _match_analyte(base)
    if matched:
        analyte, role = matched
        # 'Fe2O3T'/'FeOT' say "total" in the name; a bare 'Fe2O3'/'FeO' does not — it may be the whole sample's
        # iron (a common assay-certificate shorthand) or only the ferric/ferrous fraction, with the other one
        # reported in a separate column. The analyte itself is not in doubt (it really is Fe2O3 or FeO); what is
        # ambiguous is whether it stands for "total iron", which is exactly what a tool's FeTotal input needs.
        # MEDIUM keeps it fully selectable (compatibleInputColumns does not look at confidence) while keeping it
        # out of automapping, which only ever acts on HIGH (see lib/semantic-roles.ts's confidentColumn) — no
        # separate "ambiguous total" concept was introduced for this.
        confidence = Confidence.MEDIUM if analyte in ('Fe2O3', 'FeO') else Confidence.HIGH
        return ColumnClassification(name, role, analyte=analyte, unit=unit, confidence=confidence,
                                    source='unit' if unit else 'name')

    # No resolvable analyte: SemanticRole.ASSAY is reserved for this case (generic assay/ensaye columns like
    # "Assay1", "Original_Assay") — never for an identified element, which is classified above by what it is.
    if any(hint in normalized for hint in _GENERIC_ASSAY_HINTS):
        return ColumnClassification(name, SemanticRole.ASSAY, unit=unit, confidence=Confidence.MEDIUM, source='name')

    if '/' in name or re.search(r'\bratio\b', normalized):
        return ColumnClassification(name, SemanticRole.RATIO, unit=unit, confidence=Confidence.MEDIUM, source='name')

    if any(hint in normalized for hint in _CATEGORICAL_HINTS):
        return ColumnClassification(name, SemanticRole.CATEGORICAL, confidence=Confidence.MEDIUM, source='name')

    if numeric:
        return ColumnClassification(name, SemanticRole.NUMERIC_GENERIC, confidence=Confidence.LOW, source='dtype')
    return ColumnClassification(name, SemanticRole.UNKNOWN, confidence=Confidence.LOW, source='dtype')


def classify_column_with_hint(name: str, numeric: bool, existing_role: str | None,
                              existing_analyte: str | None = None, existing_unit: str | None = None,
                              ) -> ColumnClassification:
    """``classify_column`` enriched, only when it landed on LOW confidence, by the coarse ``ColumnRole`` already
    computed at import time (``analysis/data/importer.py``) and stored in the dataset's metadata — "el catálogo
    geoquímico existente" the classifier should defer to when its own name/unit rules found nothing specific.
    A hint never overrides a confident name-based result.
    """
    result = classify_column(name, numeric)
    if result.confidence is not Confidence.LOW or not existing_role:
        return result
    role = _CATALOG_ROLE_HINTS.get(existing_role)
    if role is None:
        return result
    analyte = existing_analyte or result.analyte
    unit = _UNIT_PRESENTATION.get((existing_unit or '').lower(), existing_unit) if existing_unit else result.unit
    return ColumnClassification(name, role, analyte=analyte, unit=unit, confidence=Confidence.MEDIUM, source='catalog')


# ── User corrections (semantic_overrides in dataset metadata) ───────────────────────────────────────
_CHEMICAL_VOCAB = {SemanticRole.MAJOR_OXIDE: MAJOR_OXIDES, SemanticRole.TRACE_ELEMENT: TRACE_ELEMENT_SYMBOLS,
                   SemanticRole.REE: REE_ELEMENTS, SemanticRole.ASSAY: TRACE_ELEMENT_SYMBOLS + MAJOR_OXIDES + REE_ELEMENTS}


def validate_override(semantic_role: str, analyte: str | None) -> tuple[SemanticRole, str | None]:
    """Validated (role, analyte) for a user correction. An analyte is only accepted for chemical roles and must
    belong to that role's vocabulary (e.g. SiO2 for major_oxide, La for ree)."""
    try:
        role = SemanticRole(semantic_role)
    except ValueError as e:
        raise ValueError(f'Rol semántico desconocido: {semantic_role!r}') from e
    if analyte is None:
        return role, None
    vocab = _CHEMICAL_VOCAB.get(role)
    if vocab is None:
        raise ValueError(f'El rol {role.value} no admite analito.')
    if analyte not in vocab:
        raise ValueError(f'{analyte!r} no es un analito válido para {role.value}.')
    return role, analyte


def with_override(result: ColumnClassification, override: dict | None) -> ColumnClassification:
    """Apply a stored user correction to a classifier result. Without an explicit analyte, the classifier's analyte
    is kept only when it is valid for the corrected role."""
    if not override:
        return result
    role, analyte = validate_override(override.get('semantic_role', ''), override.get('analyte'))
    if analyte is None and result.analyte and result.analyte in _CHEMICAL_VOCAB.get(role, ()):
        analyte = result.analyte
    return ColumnClassification(result.column, role, analyte=analyte, unit=result.unit, confidence=Confidence.HIGH, source='user')
