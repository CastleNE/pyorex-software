"""Tool Registry: canonical, immutable metadata for the geochemistry tools (Phase 1B).

WHAT THIS IS
    The single source of truth for *what each tool is*: its module and family, inputs, capabilities,
    outputs, renderer, reference and (temporarily) which legacy code path calculates it. ``catalog.py`` is now a
    backward-compatible projection of this registry; nothing else changed.

WHAT THIS IS NOT (yet)
    * It does not calculate anything. ``CalculationSpec.handler_id`` names the CURRENT legacy branch of
      ``engine._coordinates`` / ``engine.calculate`` that computes the tool. Nothing dispatches through it.
    * It does not drive the UI, the RPC or the persisted state. Tool ids and ``InputSpec.key`` values are
      unchanged because they are stored in browser storage and in session files.
    * It does not "fix" quirks. See ``tests/test_geochemistry_current_behavior.py``.

REFERENCES ARE HONEST, THE LEGACY CATALOG IS NOT (on purpose, for now)
    ``ReferenceSpec`` says what is really known about a tool's bibliography. The legacy catalog contract exposes
    ``reference`` = a citation text when one exists and, otherwise, a copy of ``formula``. That fallback is
    CURRENT BEHAVIOR — characterization only: ``ReferenceSpec.legacy_text`` stores the citation text the legacy
    contract shows; ``None`` means "no explicit reference", and the projection then reproduces the fallback.
    Incomplete bibliographic data is kept as-is and reported by ``reference_debt()``; it is never invented.

CONVENTIONS
    * ``Module`` values are the future UI modules (canonical internal spelling: ``lithogeochemistry``).
      ``LegacyGroup`` values are the historical catalog groups (``diagrams``, ``lithogeochemistry``,
      ``mineral-exploration``) and are kept for the 31 migrated tools. They are different enums; one spelling
      happens to coincide, so never compare a ``Module`` with a ``LegacyGroup`` by string.
    * A capability means "behaviour explicitly supported AND appropriate for the UI to offer the user for that
      tool". It does NOT mean "the engine or Plotly does not reject it": DynamicEditor will be built from these sets.
      Universal behaviours (export, QAQC inclusion, unit conversion, axis limits, palette...) are NOT capabilities.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum
from types import MappingProxyType

from analysis.geochemistry.semantics import SemanticRole

REE = ['La', 'Ce', 'Pr', 'Nd', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu']
TRACE = ['Cs', 'Rb', 'Ba', 'Th', 'U', 'Nb', 'Ta', 'La', 'Ce', 'Pb', 'Pr', 'Sr', 'Nd', 'Zr', 'Hf', 'Sm', 'Eu', 'Gd',
         'Tb', 'Dy', 'Y', 'Ho', 'Er', 'Tm', 'Yb', 'Lu']
FROST = 'Frost et al. (2001), doi:10.1093/petrology/42.11.2033. Índices; sin campos discriminantes automáticos.'
SM89 = 'Sun & McDonough (1989), doi:10.1144/GSL.SP.1989.042.01.19. Referencias ppm incluidas mediante pyrolite.'
_PYROLITE = 'pyrolite@ab651b448ecd2ce1bc22d752b80a977a1f4dd1ca'  # commit recorded in references/README.md


# ── Vocabularies ─────────────────────────────────────────────────────────────────────────────
class Module(StrEnum):
    DATA_ANALYSIS = 'data_analysis'
    DIAGRAMS = 'diagrams'
    LITHOGEOCHEMISTRY = 'lithogeochemistry'
    EXPLORATION = 'exploration'


class Family(StrEnum):
    # DATA ANALYSIS
    DATA = 'data'
    EXPLORE = 'explore'
    RELATIONSHIPS = 'relationships'
    MULTIVARIATE = 'multivariate'
    GEOCHEMISTRY = 'geochemistry'
    QAQC = 'qaqc'
    # DIAGRAMS
    DISTRIBUTION = 'distribution'
    XY = 'xy'
    COMPARISON = 'comparison'
    MULTIVARIABLE = 'multivariable'
    COMPOSITIONAL = 'compositional'
    PROFILES = 'profiles'
    # LITHOGEOCHEMISTRY (UI name: LITOGEOQUÍMICA)
    CLASSIFICATION = 'classification'
    MAGMATIC_SERIES = 'magmatic_series'
    VARIATION = 'variation'
    NORMALIZATION = 'normalization'
    TECTONIC_SETTING = 'tectonic_setting'
    PETROGENESIS = 'petrogenesis'
    CALCULATIONS = 'calculations'
    # EXPLORATION (UI name: EXPLORACIÓN)
    ALTERATION = 'alteration'
    FERTILITY = 'fertility'
    MINERAL_SYSTEMS = 'mineral_systems'
    VECTORING = 'vectoring'
    PATHFINDERS = 'pathfinders'
    ANOMALIES = 'anomalies'
    PROSPECTIVITY = 'prospectivity'


MODULE_FAMILIES = MappingProxyType({
    Module.DATA_ANALYSIS: frozenset({Family.DATA, Family.EXPLORE, Family.RELATIONSHIPS, Family.MULTIVARIATE,
                                     Family.GEOCHEMISTRY, Family.QAQC}),
    Module.DIAGRAMS: frozenset({Family.DISTRIBUTION, Family.XY, Family.COMPARISON, Family.MULTIVARIABLE,
                                Family.COMPOSITIONAL, Family.PROFILES}),
    Module.LITHOGEOCHEMISTRY: frozenset({Family.CLASSIFICATION, Family.MAGMATIC_SERIES, Family.VARIATION,
                                        Family.NORMALIZATION, Family.TECTONIC_SETTING, Family.PETROGENESIS,
                                        Family.CALCULATIONS}),
    Module.EXPLORATION: frozenset({Family.ALTERATION, Family.FERTILITY, Family.MINERAL_SYSTEMS, Family.VECTORING,
                                   Family.PATHFINDERS, Family.ANOMALIES, Family.PROSPECTIVITY}),
})


class Status(StrEnum):
    IMPLEMENTED = 'implemented'
    PLANNED = 'planned'
    EXPERIMENTAL = 'experimental'
    DEPRECATED = 'deprecated'


class InputType(StrEnum):
    NUMERIC = 'numeric'
    OXIDE = 'oxide'
    ELEMENT = 'element'
    MODAL = 'modal'
    DEPTH = 'depth'
    CATEGORICAL = 'categorical'
    IDENTIFIER = 'identifier'
    COORDINATE = 'coordinate'


class AxisRole(StrEnum):
    """Role of an input in the result when the engine passes it through unchanged (ternary a/b/c: closure)."""
    X = 'x'
    Y = 'y'
    Z = 'z'
    A = 'a'
    B = 'b'
    C = 'c'


class UnitKind(StrEnum):
    PCT = 'pct'
    PPM = 'ppm'
    PPB = 'ppb'
    RAW = 'raw'


class Capability(StrEnum):
    GROUP = 'group'
    COLOR = 'color'
    SYMBOL = 'symbol'
    SIZE = 'size'
    LABELS = 'labels'
    LOG_X = 'log_x'
    LOG_Y = 'log_y'
    REVERSE_X = 'reverse_x'
    REVERSE_Y = 'reverse_y'
    REFERENCE_LINES = 'reference_lines'
    DEPTH = 'depth'
    # Reserved for future tools; no tool may declare them yet.
    REGRESSION = 'regression'
    BINS = 'bins'
    KDE = 'kde'
    FROM_TO = 'from_to'


CURRENT_CAPABILITIES = frozenset({
    Capability.GROUP, Capability.COLOR, Capability.SYMBOL, Capability.SIZE, Capability.LABELS, Capability.LOG_X,
    Capability.LOG_Y, Capability.REVERSE_X, Capability.REVERSE_Y, Capability.REFERENCE_LINES, Capability.DEPTH,
})


class ReferenceKind(StrEnum):
    GENERIC = 'generic'
    PUBLISHED_METHOD = 'published_method'
    DERIVED_METHOD = 'derived_method'


class CalculationKind(StrEnum):
    PASSTHROUGH = 'passthrough'   # x/y/z are the mapped inputs, unchanged
    PER_ROW = 'per_row'           # each row is transformed independently
    GROUP_POST = 'group_post'     # ranks/quantiles assigned per group after the row loop
    SPIDER = 'spider'             # per-row vector normalized by a reference composition


class RendererId(StrEnum):
    """Current ``plot.kind`` values consumed by ``build-geo-chart.ts``."""
    SCATTER = 'scatter'
    LINE = 'line'
    QQ = 'qq'
    PROBABILITY = 'probability'
    ECDF = 'ecdf'
    ASSAY = 'assay'
    DIFFERENCE = 'difference'
    DOWNHOLE = 'downhole'
    HISTOGRAM = 'histogram'
    BOX = 'box'
    TERNARY = 'ternary'
    QAPF = 'qapf'
    SPIDER = 'spider'


class LegacyGroup(StrEnum):
    DIAGRAMS = 'diagrams'
    LITHOGEOCHEMISTRY = 'lithogeochemistry'
    MINERAL_EXPLORATION = 'mineral-exploration'


class InputRuleKind(StrEnum):
    ALL_REQUIRED = 'all_required'
    AT_LEAST = 'at_least'


OUTPUT_FIELDS = frozenset({'x', 'y', 'z', 'values', 'classification'})


# ── Specs ────────────────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True, slots=True)
class InputSpec:
    key: str                       # IMMUTABLE: persisted in configs/sessions ('SiO2', 'numerator', 'X'...)
    type: InputType
    unit_kind: UnitKind
    axis: AxisRole | None = None
    label: str | None = None
    required: bool = True
    # Semantic Variable System (v1): which column roles (analysis.geochemistry.semantics.SemanticRole) the Editor
    # may offer for this input. Empty = no restriction declared yet (CURRENT BEHAVIOR: any column of this input's
    # unit_kind, exactly as before this system existed) — backward compatible for every tool that doesn't opt in.
    allowed_roles: tuple[SemanticRole, ...] = ()


@dataclass(frozen=True, slots=True)
class InputRule:
    kind: InputRuleKind = InputRuleKind.ALL_REQUIRED
    minimum: int | None = None     # for AT_LEAST: how many of the listed inputs must be mapped


@dataclass(frozen=True, slots=True)
class OutputSpec:
    field: str                     # one of OUTPUT_FIELDS: the result field the tool populates
    label: str
    description: str = ''


@dataclass(frozen=True, slots=True)
class ReferenceSpec:
    kind: ReferenceKind
    authors: tuple[str, ...] = ()
    year: int | None = None
    title: str | None = None
    citation: str | None = None
    doi: str | None = None         # optional
    url: str | None = None         # optional
    equations: tuple[str, ...] = ()
    applicability: str = ''
    limitations: str = ''
    reference_data: str | None = None
    # Legacy catalog compatibility only.
    # Remove when the legacy catalog projection is retired.
    # The modern fields above (kind, authors, year, title, citation, ...) do not depend on it.
    # It holds the exact text the legacy catalog exposes as ``reference``; None means "no explicit reference"
    # (the legacy contract then repeats ``formula``). CURRENT BEHAVIOR — characterization only.
    legacy_text: str | None = None


@dataclass(frozen=True, slots=True)
class CalculationSpec:
    # Dotted path of the core function that calculates the tool (Phase 2A: ratios, simple/molecular and alteration
    # indices) or a ``legacy.*`` label for tools still computed inline by ``engine._coordinates``.
    # Metadata only: the engine does not resolve or dispatch through it.
    handler_id: str
    kind: CalculationKind


@dataclass(frozen=True, slots=True)
class ParamSpec:
    name: str
    choices: tuple[str, ...]
    default: str
    description: str = ''


@dataclass(frozen=True, slots=True, kw_only=True)
class ToolSpec:
    id: str
    label: str
    module: Module
    family: Family
    status: Status
    inputs: tuple[InputSpec, ...]
    input_rule: InputRule
    capabilities: frozenset[Capability]
    outputs: tuple[OutputSpec, ...]
    calculation: CalculationSpec
    renderer: RendererId
    reference: ReferenceSpec
    formula: str
    legacy_group: LegacyGroup | None
    parameters: tuple[ParamSpec, ...] = ()
    rpc_method: str = 'geochemistry.compute'
    warnings: tuple[str, ...] = ()   # reserved: engine warnings are not migrated yet
    aliases: tuple[str, ...] = ()
    # Semantic Variable System (v1): allowed roles for the *generic* group/hole selector (GeoConfig.group_column),
    # which is not one of ``inputs`` — it applies uniformly across tools and isn't part of the calculation. Empty =
    # no restriction declared (CURRENT BEHAVIOR: any column, as before this system existed).
    group_allowed_roles: tuple[SemanticRole, ...] = ()

    @property
    def unit_kind(self) -> UnitKind:
        return self.inputs[0].unit_kind


# ── Registry table (order = legacy catalog order; ids and input keys are frozen) ─────────────
_M, _F, _S, _T = Module, Family, Status, InputType
_C, _K, _R, _U = Capability, CalculationKind, RendererId, UnitKind
_ALL = InputRule()
_IRON = ParamSpec('iron_basis', ('FeOT', 'Fe2O3T'), 'FeOT', 'Fe2O3T total iron is multiplied by 0.8998 to FeOT')

# Capability profiles. Rule: declared only where the UI should offer the option for that tool (see module docstring).
# REVERSE_Y (the global "Invertir Y" checkbox) is offered where the y axis is a free data variable (it can be depth-like);
# it is NOT declared where y is a frequency (histogram), a normalized ratio (spider), a fixed-orientation projection or
# a classification/reference overlay (qapf, tas, assay identity/zero lines). The legacy renderer still applies the
# checkbox to all of them: that is CURRENT BEHAVIOR, not a capability.
_XY = frozenset({_C.GROUP, _C.COLOR, _C.SYMBOL, _C.SIZE, _C.LABELS, _C.LOG_X, _C.LOG_Y, _C.REVERSE_Y})
_XY_LINES = (_XY - {_C.REVERSE_Y}) | {_C.REFERENCE_LINES}          # tas, assay-compare, assay-difference
_QQ = _XY - {_C.LOG_X}      # x is the theoretical normal quantile (can be <= 0): a log x axis is a legacy quirk, not offered
_ORDINAL_X = _XY - {_C.LOG_X}   # x = row_index + 1 (sample order), not a geochemical variable: no log x axis offered
_PROBABILITY = frozenset({_C.GROUP, _C.COLOR, _C.SYMBOL, _C.SIZE, _C.LABELS, _C.LOG_X})  # y axis is forced linear
_PROFILE = frozenset({_C.GROUP, _C.COLOR, _C.SYMBOL, _C.SIZE, _C.LABELS, _C.LOG_X, _C.DEPTH})  # y = depth, forced
_HISTOGRAM = frozenset({_C.GROUP})                                  # y is a count; engine rejects log flags
_BOX = frozenset({_C.GROUP, _C.REVERSE_Y})                          # y is the data variable; engine rejects log flags
_TERNARY = frozenset({_C.GROUP, _C.COLOR, _C.SYMBOL, _C.SIZE, _C.LABELS})
_QAPF = frozenset({_C.GROUP, _C.COLOR, _C.SYMBOL, _C.SIZE, _C.LABELS, _C.REFERENCE_LINES})
_SPIDER = frozenset({_C.GROUP, _C.COLOR, _C.SYMBOL, _C.SIZE})

_GENERIC = ReferenceSpec(kind=ReferenceKind.GENERIC)
_DERIVED = ReferenceSpec(kind=ReferenceKind.DERIVED_METHOD)

# Semantic Variable System (v1) — role profiles declared for the first four tools (see semantics.py for the
# vocabulary). Every other tool keeps allowed_roles=() (no restriction declared yet: CURRENT BEHAVIOR).
_SR = SemanticRole
# scatter / histogram: any geochemically-numeric column, including coordinates and depth (a generic XY/distribution
# tool may legitimately need them) — but never row_index (an internal row/order/object id, not a variable), bare
# identifiers, free text or a categorical/unknown fallback.
_ROLES_NUMERIC_PERMISSIVE = (_SR.MAJOR_OXIDE, _SR.TRACE_ELEMENT, _SR.REE, _SR.ASSAY, _SR.RATIO, _SR.DEPTH,
                            _SR.DEPTH_FROM, _SR.DEPTH_TO, _SR.EASTING, _SR.NORTHING, _SR.ELEVATION,
                            _SR.LONGITUDE, _SR.LATITUDE, _SR.NUMERIC_GENERIC)
# ternary A/B/C: only compositional/geochemical quantities — explicitly not order, ids, coordinates or depth.
_ROLES_COMPOSITIONAL = (_SR.MAJOR_OXIDE, _SR.TRACE_ELEMENT, _SR.REE, _SR.ASSAY, _SR.RATIO)
_ROLES_DEPTH = (_SR.DEPTH, _SR.DEPTH_FROM, _SR.DEPTH_TO)
_ROLES_DOWNHOLE_VALUE = (_SR.ASSAY, _SR.TRACE_ELEMENT, _SR.REE, _SR.MAJOR_OXIDE, _SR.RATIO, _SR.NUMERIC_GENERIC)
_ROLES_HOLE_ID = (_SR.HOLE_ID,)


def _inputs(keys, type_, unit, axes=None, allowed_roles=()):
    axes = axes or {}
    return tuple(InputSpec(key=k, type=type_, unit_kind=unit, axis=axes.get(k), allowed_roles=allowed_roles)
                for k in keys)


def _out(**fields):
    return tuple(OutputSpec(field=f, label=label) for f, label in fields.items())


def _sm89(dataset, file):
    return ReferenceSpec(
        kind=ReferenceKind.PUBLISHED_METHOD, authors=('Sun', 'McDonough'), year=1989,
        citation='Sun & McDonough (1989), doi:10.1144/GSL.SP.1989.042.01.19', doi='10.1144/GSL.SP.1989.042.01.19',
        limitations='Sin Pm en condrito; referencias en ppm.',
        reference_data=f'{dataset}: {_PYROLITE} pyrolite/data/geochem/refcomp/{file}', legacy_text=SM89)


def _anomaly_reference():
    return ReferenceSpec(kind=ReferenceKind.DERIVED_METHOD, reference_data=f'Sun & McDonough (1989) chondrite: {_PYROLITE} '
                         'pyrolite/data/geochem/refcomp/CH_SunMcDonough1989.csv', legacy_text=SM89)


def _frost():
    return ReferenceSpec(kind=ReferenceKind.PUBLISHED_METHOD, authors=('Frost et al.',), year=2001,
                         citation='Frost et al. (2001), doi:10.1093/petrology/42.11.2033',
                         doi='10.1093/petrology/42.11.2033', limitations='Índices; sin campos discriminantes automáticos.',
                         legacy_text=FROST)


def _tool(**kw):
    kw.setdefault('status', _S.IMPLEMENTED)
    kw.setdefault('input_rule', _ALL)
    return ToolSpec(**kw)


REGISTRY: tuple[ToolSpec, ...] = (
    # ── legacy group: diagrams ───────────────────────────────────────────────────────────────
    _tool(id='line', label='Líneas XY', module=_M.DIAGRAMS, family=_F.XY,
          inputs=_inputs(['X', 'Y'], _T.NUMERIC, _U.RAW, {'X': AxisRole.X, 'Y': AxisRole.Y}),
          capabilities=_XY, outputs=_out(x='X', y='Y'),
          calculation=CalculationSpec('legacy.coordinates.xy', _K.PASSTHROUGH), renderer=_R.LINE, reference=_GENERIC,
          formula='Observaciones ordenadas por X dentro de cada grupo; no se conectan grupos distintos.',
          legacy_group=LegacyGroup.DIAGRAMS),
    _tool(id='qq-normal', label='Q–Q normal', module=_M.DIAGRAMS, family=_F.DISTRIBUTION,
          inputs=_inputs(['X'], _T.NUMERIC, _U.RAW, {'X': AxisRole.Y}),
          capabilities=_QQ,
          outputs=_out(x='Cuantil normal teórico', y='Valor observado ordenado'),
          calculation=CalculationSpec('legacy.post.qq', _K.GROUP_POST), renderer=_R.QQ, reference=_GENERIC,
          formula='Valores ordenados frente a Φ⁻¹((i−0.5)/n), por grupo. No constituye por sí solo una prueba de normalidad.',
          legacy_group=LegacyGroup.DIAGRAMS),
    _tool(id='probability', label='Probabilidad normal', module=_M.DIAGRAMS, family=_F.DISTRIBUTION,
          inputs=_inputs(['X'], _T.NUMERIC, _U.RAW, {'X': AxisRole.X}),
          capabilities=_PROBABILITY, outputs=_out(x='Valor observado', y='Puntaje normal (z)'),
          calculation=CalculationSpec('legacy.post.probability', _K.GROUP_POST), renderer=_R.PROBABILITY,
          reference=_GENERIC,
          formula='Valor observado frente al cuantil normal de (i−0.5)/n; eje de probabilidad no lineal.',
          legacy_group=LegacyGroup.DIAGRAMS),
    _tool(id='ecdf', label='Probabilidad acumulada (ECDF)', module=_M.DIAGRAMS, family=_F.DISTRIBUTION,
          inputs=_inputs(['X'], _T.NUMERIC, _U.RAW, {'X': AxisRole.X}),
          capabilities=_XY, outputs=_out(x='Valor observado', y='Probabilidad acumulada (%)'),
          calculation=CalculationSpec('legacy.post.ecdf', _K.GROUP_POST), renderer=_R.ECDF, reference=_GENERIC,
          formula='F(x)=número de observaciones ≤x / n; los empates comparten probabilidad.',
          legacy_group=LegacyGroup.DIAGRAMS),
    _tool(id='assay-compare', label='Comparación de ensayes XY', module=_M.DATA_ANALYSIS, family=_F.QAQC,
          inputs=_inputs(['X', 'Y'], _T.NUMERIC, _U.RAW, {'X': AxisRole.X, 'Y': AxisRole.Y}),
          capabilities=_XY_LINES, outputs=_out(x='X', y='Y'),
          calculation=CalculationSpec('legacy.coordinates.xy', _K.PASSTHROUGH), renderer=_R.ASSAY, reference=_GENERIC,
          formula='Pares de ensayes de la misma muestra e intervalo, en la misma unidad; línea de identidad 1:1.',
          legacy_group=LegacyGroup.DIAGRAMS),
    _tool(id='assay-difference', label='Diferencias de ensayes', module=_M.DATA_ANALYSIS, family=_F.QAQC,
          inputs=_inputs(['X', 'Y'], _T.NUMERIC, _U.RAW),
          capabilities=_XY_LINES, outputs=_out(x='Media (X+Y)/2', y='Diferencia Y−X'),
          calculation=CalculationSpec('legacy.coordinates.assay_difference', _K.PER_ROW), renderer=_R.DIFFERENCE,
          reference=_GENERIC,
          formula='Diferencia Y−X frente a media (X+Y)/2. Cada fila debe representar la misma muestra e intervalo.',
          legacy_group=LegacyGroup.DIAGRAMS),
    _tool(id='downhole', label='Downhole · perfil por sondaje', module=_M.DIAGRAMS, family=_F.PROFILES,
          inputs=(InputSpec(key='Depth', type=_T.DEPTH, unit_kind=_U.RAW, axis=AxisRole.Y,
                            allowed_roles=_ROLES_DEPTH),
                  InputSpec(key='Value', type=_T.NUMERIC, unit_kind=_U.RAW, axis=AxisRole.X,
                            allowed_roles=_ROLES_DOWNHOLE_VALUE)),
          capabilities=_PROFILE, outputs=_out(x='Value', y='Profundidad medida'),
          calculation=CalculationSpec('legacy.coordinates.downhole', _K.PASSTHROUGH), renderer=_R.DOWNHOLE,
          reference=_GENERIC,
          formula='Valor frente a profundidad medida, creciente hacia abajo. Selecciona el ID del sondaje como grupo. No desurvey ni compositado.',
          legacy_group=LegacyGroup.DIAGRAMS, group_allowed_roles=_ROLES_HOLE_ID),
    _tool(id='downhole-compare', label='Downhole · comparar ensayes', module=_M.DATA_ANALYSIS, family=_F.QAQC,
          inputs=(InputSpec(key='Depth', type=_T.DEPTH, unit_kind=_U.RAW, axis=AxisRole.Y),
                  InputSpec(key='Assay1', type=_T.NUMERIC, unit_kind=_U.RAW, axis=AxisRole.X),
                  InputSpec(key='Assay2', type=_T.NUMERIC, unit_kind=_U.RAW, axis=AxisRole.Z)),
          capabilities=_PROFILE, outputs=_out(x='Assay1', y='Profundidad medida', z='Assay2'),
          calculation=CalculationSpec('legacy.coordinates.downhole', _K.PASSTHROUGH), renderer=_R.DOWNHOLE,
          reference=_GENERIC,
          formula='Dos ensayes por fila a la misma profundidad; perfiles separados por sondaje. Confirmar unidades comparables.',
          legacy_group=LegacyGroup.DIAGRAMS),
    _tool(id='scatter', label='Dispersión XY', module=_M.DIAGRAMS, family=_F.XY,
          inputs=_inputs(['X', 'Y'], _T.NUMERIC, _U.RAW, {'X': AxisRole.X, 'Y': AxisRole.Y},
                        allowed_roles=_ROLES_NUMERIC_PERMISSIVE),
          capabilities=_XY, outputs=_out(x='X', y='Y'),
          calculation=CalculationSpec('legacy.coordinates.scatter', _K.PASSTHROUGH), renderer=_R.SCATTER,
          reference=_GENERIC, formula='Pares de observaciones X e Y; sin imputación.',
          legacy_group=LegacyGroup.DIAGRAMS),
    _tool(id='histogram', label='Histograma', module=_M.DIAGRAMS, family=_F.DISTRIBUTION,
          inputs=_inputs(['X'], _T.NUMERIC, _U.RAW, {'X': AxisRole.X}, allowed_roles=_ROLES_NUMERIC_PERMISSIVE),
          capabilities=_HISTOGRAM, outputs=_out(x='Valor'),  # CURRENT: the engine also echoes y = x
          calculation=CalculationSpec('legacy.coordinates.univariate', _K.PASSTHROUGH), renderer=_R.HISTOGRAM,
          reference=_GENERIC, formula='Frecuencias de observaciones válidas; intervalos calculados por Plotly.',
          legacy_group=LegacyGroup.DIAGRAMS),
    _tool(id='boxplot', label='Tukey · cajas y bigotes', module=_M.DIAGRAMS, family=_F.DISTRIBUTION,
          inputs=_inputs(['X'], _T.NUMERIC, _U.RAW, {'X': AxisRole.X}),
          capabilities=_BOX, outputs=_out(x='Valor'),  # CURRENT: the engine also echoes y = x
          calculation=CalculationSpec('legacy.coordinates.univariate', _K.PASSTHROUGH), renderer=_R.BOX,
          reference=_GENERIC,
          formula='Cuartiles lineales; bigotes hasta 1.5 IQR, mediana y puntos originales. Los valores extremos no se eliminanan.',
          legacy_group=LegacyGroup.DIAGRAMS),
    _tool(id='ternary', label='Ternario ABC', module=_M.DIAGRAMS, family=_F.COMPOSITIONAL,
          inputs=_inputs(['A', 'B', 'C'], _T.NUMERIC, _U.RAW, {'A': AxisRole.A, 'B': AxisRole.B, 'C': AxisRole.C},
                        allowed_roles=_ROLES_COMPOSITIONAL),
          capabilities=_TERNARY, outputs=_out(x='% A', y='% B', z='% C'),
          calculation=CalculationSpec('legacy.coordinates.ternary', _K.PER_ROW), renderer=_R.TERNARY,
          reference=_GENERIC, formula='100 × componente / (A+B+C). Componentes no negativos y de la misma unidad.',
          legacy_group=LegacyGroup.DIAGRAMS),
    _tool(id='harker', label='Harker · SiO2 vs óxido', module=_M.LITHOGEOCHEMISTRY, family=_F.VARIATION,
          inputs=_inputs(['SiO2', 'Oxide'], _T.OXIDE, _U.PCT, {'SiO2': AxisRole.X, 'Oxide': AxisRole.Y}),
          capabilities=_XY, outputs=_out(x='SiO2 (wt%)', y='Óxido (wt%)'),
          calculation=CalculationSpec('legacy.coordinates.scatter', _K.PASSTHROUGH), renderer=_R.SCATTER,
          reference=_DERIVED, formula='Óxido mayor (wt%) frente a SiO2 (wt%).', legacy_group=LegacyGroup.DIAGRAMS),
    # ── legacy group: lithogeochemistry ──────────────────────────────────────────────────────
    _tool(id='tas', label='TAS · clasificación volcánica', module=_M.LITHOGEOCHEMISTRY, family=_F.CLASSIFICATION,
          inputs=_inputs(['SiO2', 'Na2O', 'K2O'], _T.OXIDE, _U.PCT, {'SiO2': AxisRole.X}),
          capabilities=_XY_LINES, outputs=_out(x='SiO2 (wt%)', y='Na2O + K2O (wt%)', classification='Campo TAS'),
          calculation=CalculationSpec('legacy.coordinates.tas', _K.PER_ROW), renderer=_R.SCATTER,
          reference=ReferenceSpec(
              kind=ReferenceKind.PUBLISHED_METHOD, authors=('Le Maitre',), year=2002,
              citation='Le Maitre (2002), doi:10.1017/CBO9780511535581', doi='10.1017/CBO9780511535581',
              applicability='Óxidos en base anhidra (wt%).',
              limitations='Polígonos combinados pyrolite; T1/T2 y tefrita/basanita requieren criterios adicionales.',
              reference_data=f'{_PYROLITE} pyrolite/data/models/TAS/config_lemaitre_combined.json',
              legacy_text='Le Maitre (2002), doi:10.1017/CBO9780511535581. Polígonos combinados pyrolite; T1/T2 y tefrita/basanita requieren criterios adicionales.'),
          formula='Na2O + K2O frente a SiO2 (wt% anhidro).', legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='qapf', label='QAPF · proyección modal', module=_M.LITHOGEOCHEMISTRY, family=_F.CLASSIFICATION,
          inputs=_inputs(['Q', 'A', 'P', 'F'], _T.MODAL, _U.PCT),
          capabilities=_QAPF, outputs=_out(x='A ← proporción modal → P', y='F ← componente modal → Q'),
          calculation=CalculationSpec('legacy.coordinates.qapf', _K.PER_ROW), renderer=_R.QAPF,
          reference=ReferenceSpec(
              kind=ReferenceKind.PUBLISHED_METHOD, authors=('Streckeisen',), year=1974,
              citation='Streckeisen (1974), doi:10.1007/BF01820841', doi='10.1007/BF01820841',
              applicability='Proyección modal, aplicable solo con M < 90%; verificar petrográficamente.',
              limitations='Proyección, no clasificación completa: NO calcula norma CIPW ni asigna nombres de roca.',
              legacy_text='Streckeisen (1974), doi:10.1007/BF01820841. Proyección modal, aplicable solo con M < 90%; verificar petrográficamente.'),
          formula='Normalización de Q-A-P o F-A-P al 100%. Proporciones modales; NO calcula norma CIPW ni asigna nombres de roca.',
          legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='afm', label='AFM · proyección', module=_M.LITHOGEOCHEMISTRY, family=_F.MAGMATIC_SERIES,
          inputs=_inputs(['Na2O', 'K2O', 'FeTotal', 'MgO'], _T.OXIDE, _U.PCT),
          capabilities=_TERNARY, outputs=_out(x='A: Na2O + K2O', y='F: FeOT', z='M: MgO'), parameters=(_IRON,),
          calculation=CalculationSpec('legacy.coordinates.ternary', _K.PER_ROW), renderer=_R.TERNARY,
          reference=_DERIVED, formula='A=Na2O+K2O, F=FeO total, M=MgO; cierre al 100%. Sin frontera tectónica.',
          legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='k2o-sio2', label='K2O–SiO2', module=_M.LITHOGEOCHEMISTRY, family=_F.MAGMATIC_SERIES,
          inputs=_inputs(['SiO2', 'K2O'], _T.OXIDE, _U.PCT, {'SiO2': AxisRole.X, 'K2O': AxisRole.Y}),
          capabilities=_XY, outputs=_out(x='SiO2 (wt%)', y='K2O (wt%)'),
          calculation=CalculationSpec('legacy.coordinates.scatter', _K.PASSTHROUGH), renderer=_R.SCATTER,
          reference=_DERIVED, formula='K2O vs SiO2 (wt%); sin clasificación de series potásicas.',
          legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='mali', label='MALI', module=_M.LITHOGEOCHEMISTRY, family=_F.MAGMATIC_SERIES,
          inputs=_inputs(['SiO2', 'Na2O', 'K2O', 'CaO'], _T.OXIDE, _U.PCT, {'SiO2': AxisRole.X}),
          capabilities=_XY, outputs=_out(x='SiO2 (wt%)', y='MALI (wt%)'),
          calculation=CalculationSpec('analysis.geochemistry.core.indices.calculate_mali', _K.PER_ROW), renderer=_R.SCATTER,
          reference=_frost(), formula='Na2O + K2O − CaO (wt%) vs SiO2.', legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='fe-index', label='Fe-index', module=_M.LITHOGEOCHEMISTRY, family=_F.MAGMATIC_SERIES,
          inputs=_inputs(['SiO2', 'FeTotal', 'MgO'], _T.OXIDE, _U.PCT, {'SiO2': AxisRole.X}),
          capabilities=_XY, outputs=_out(x='SiO2 (wt%)', y='FeOT / (FeOT + MgO)'), parameters=(_IRON,),
          calculation=CalculationSpec('analysis.geochemistry.core.indices.calculate_fe_index', _K.PER_ROW), renderer=_R.SCATTER,
          reference=_frost(), formula='FeOT / (FeOT + MgO) vs SiO2. Fe2O3T → FeOT: × 0.8998.',
          legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='shand-index', label='Shand · A/CNK vs A/NK', module=_M.LITHOGEOCHEMISTRY, family=_F.CALCULATIONS,
          inputs=_inputs(['Al2O3', 'CaO', 'Na2O', 'K2O'], _T.OXIDE, _U.PCT),
          capabilities=_XY, outputs=_out(x='A/CNK (molar)', y='A/NK (molar)'),
          calculation=CalculationSpec('analysis.geochemistry.core.indices.calculate_shand_indices', _K.PER_ROW), renderer=_R.SCATTER,
          reference=ReferenceSpec(
              kind=ReferenceKind.PUBLISHED_METHOD, authors=('Shand',),  # year / citation / title absent in the repo
              limitations='Sin corrección de apatita; no equivale al ASI corregido por P.',
              legacy_text='Shand: Al2O3/(CaO+Na2O+K2O) y Al2O3/(Na2O+K2O), en moles de óxido; no equivale al ASI corregido por P.'),
          formula='Cocientes molares de óxidos A/CNK y A/NK; sin corrección de apatita.',
          legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='a-cnk', label='A/CNK', module=_M.LITHOGEOCHEMISTRY, family=_F.CALCULATIONS,
          inputs=_inputs(['Al2O3', 'CaO', 'Na2O', 'K2O'], _T.OXIDE, _U.PCT),
          capabilities=_ORDINAL_X, outputs=_out(x='Orden de muestra', y='A/CNK'),
          calculation=CalculationSpec('analysis.geochemistry.core.indices.calculate_a_cnk', _K.PER_ROW), renderer=_R.SCATTER,
          reference=_DERIVED, formula='(Al2O3/101.9613) / (CaO/56.0774 + Na2O/61.9789 + K2O/94.196).',
          legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='a-nk', label='A/NK', module=_M.LITHOGEOCHEMISTRY, family=_F.CALCULATIONS,
          inputs=_inputs(['Al2O3', 'Na2O', 'K2O'], _T.OXIDE, _U.PCT),
          capabilities=_ORDINAL_X, outputs=_out(x='Orden de muestra', y='A/NK'),
          calculation=CalculationSpec('analysis.geochemistry.core.indices.calculate_a_nk', _K.PER_ROW), renderer=_R.SCATTER,
          reference=_DERIVED, formula='(Al2O3/101.9613) / (Na2O/61.9789 + K2O/94.196).',
          legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='ree-normalization', label='REE · condrito SM89', module=_M.LITHOGEOCHEMISTRY, family=_F.NORMALIZATION,
          inputs=_inputs(REE, _T.ELEMENT, _U.PPM), input_rule=InputRule(InputRuleKind.AT_LEAST, 2),
          capabilities=_SPIDER, outputs=_out(values='Muestra / condrito'),
          calculation=CalculationSpec('legacy.spider.normalization', _K.SPIDER), renderer=_R.SPIDER,
          reference=_sm89('condrito', 'CH_SunMcDonough1989.csv'),
          formula='Concentración / condrito SM89. Sin Pm; al menos dos elementos.',
          legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='primitive-mantle', label='Multielementos · manto primitivo SM89', module=_M.LITHOGEOCHEMISTRY,
          family=_F.NORMALIZATION, inputs=_inputs(TRACE, _T.ELEMENT, _U.PPM),
          input_rule=InputRule(InputRuleKind.AT_LEAST, 2), capabilities=_SPIDER,
          outputs=_out(values='Muestra / manto primitivo'),
          calculation=CalculationSpec('legacy.spider.normalization', _K.SPIDER), renderer=_R.SPIDER,
          reference=_sm89('manto primitivo', 'PM_SunMcDonough1989.csv'),
          formula='Concentración / manto primitivo SM89. Al menos dos elementos.',
          legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='element-ratios', label='Razón elemental', module=_M.DATA_ANALYSIS, family=_F.GEOCHEMISTRY,
          inputs=_inputs(['numerator', 'denominator'], _T.NUMERIC, _U.PPM),
          capabilities=_ORDINAL_X, outputs=_out(x='Orden de muestra', y='Razón elemental'),
          calculation=CalculationSpec('analysis.geochemistry.core.ratios.calculate_ratio', _K.PER_ROW), renderer=_R.SCATTER,
          reference=_GENERIC, formula='Numerador / denominador, tras convertir ambos a ppm.',
          legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='fertility-sr-y', label='Sr/Y', module=_M.EXPLORATION, family=_F.FERTILITY,
          inputs=_inputs(['Sr', 'Y'], _T.ELEMENT, _U.PPM), capabilities=_ORDINAL_X, outputs=_out(x='Orden de muestra', y='Sr/Y'),
          calculation=CalculationSpec('analysis.geochemistry.core.ratios.calculate_ratio', _K.PER_ROW), renderer=_R.SCATTER, reference=_DERIVED,
          formula='Sr/Y. Cociente bruto; no diagnostica fertilidad por sí solo.', legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='fertility-la-yb', label='La/Yb', module=_M.EXPLORATION, family=_F.FERTILITY,
          inputs=_inputs(['La', 'Yb'], _T.ELEMENT, _U.PPM), capabilities=_ORDINAL_X, outputs=_out(x='Orden de muestra', y='La/Yb'),
          calculation=CalculationSpec('analysis.geochemistry.core.ratios.calculate_ratio', _K.PER_ROW), renderer=_R.SCATTER, reference=_DERIVED,
          formula='La/Yb. Cociente bruto; no normalizado.', legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='fertility-dy-yb', label='Dy/Yb', module=_M.EXPLORATION, family=_F.FERTILITY,
          inputs=_inputs(['Dy', 'Yb'], _T.ELEMENT, _U.PPM), capabilities=_ORDINAL_X, outputs=_out(x='Orden de muestra', y='Dy/Yb'),
          calculation=CalculationSpec('analysis.geochemistry.core.ratios.calculate_ratio', _K.PER_ROW), renderer=_R.SCATTER, reference=_DERIVED,
          formula='Dy/Yb. Cociente bruto; no normalizado.', legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='fertility-eu-eu', label='Eu/Eu*', module=_M.LITHOGEOCHEMISTRY, family=_F.NORMALIZATION,
          inputs=_inputs(['Sm', 'Eu', 'Gd'], _T.ELEMENT, _U.PPM), capabilities=_ORDINAL_X,
          outputs=_out(x='Orden de muestra', y='Eu/Eu*'),
          calculation=CalculationSpec('legacy.coordinates.anomaly', _K.PER_ROW), renderer=_R.SCATTER,
          reference=_anomaly_reference(), formula='Eu_N / √(Sm_N × Gd_N), N = condrito SM89.',
          legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    _tool(id='fertility-ce-ce', label='Ce/Ce*', module=_M.LITHOGEOCHEMISTRY, family=_F.NORMALIZATION,
          inputs=_inputs(['La', 'Ce', 'Pr'], _T.ELEMENT, _U.PPM), capabilities=_ORDINAL_X,
          outputs=_out(x='Orden de muestra', y='Ce/Ce*'),
          calculation=CalculationSpec('legacy.coordinates.anomaly', _K.PER_ROW), renderer=_R.SCATTER,
          reference=_anomaly_reference(),
          formula='Ce_N / √(La_N × Pr_N), N = condrito SM89. Interpolación geométrica explícita.',
          legacy_group=LegacyGroup.LITHOGEOCHEMISTRY),
    # ── legacy group: mineral-exploration ────────────────────────────────────────────────────
    _tool(id='alteration', label='Alteración · AI–CCPI', module=_M.EXPLORATION, family=_F.ALTERATION,
          inputs=_inputs(['MgO', 'K2O', 'Na2O', 'CaO', 'FeTotal'], _T.OXIDE, _U.PCT),
          capabilities=_XY, outputs=_out(x='AI', y='CCPI'), parameters=(_IRON,),
          calculation=CalculationSpec('analysis.geochemistry.core.indices.calculate_alteration_indices', _K.PER_ROW), renderer=_R.SCATTER,
          reference=ReferenceSpec(
              kind=ReferenceKind.PUBLISHED_METHOD, authors=('Large et al.',), year=2001,
              citation='Large et al. (2001), doi:10.2113/gsecongeo.96.5.957', doi='10.2113/gsecongeo.96.5.957',
              limitations='Índices; sin diagnóstico automático ni campos minerales.',
              legacy_text='Large et al. (2001), doi:10.2113/gsecongeo.96.5.957. Índices; sin diagnóstico automático ni campos minerales.'),
          formula='AI=100(MgO+K2O)/(MgO+K2O+Na2O+CaO); CCPI=100(MgO+FeOT)/(MgO+FeOT+Na2O+K2O).',
          legacy_group=LegacyGroup.MINERAL_EXPLORATION),
)

# The 31 tools that existed in the legacy catalog, in canonical order.
LEGACY_TOOL_IDS: tuple[str, ...] = (
    'line', 'qq-normal', 'probability', 'ecdf', 'assay-compare', 'assay-difference', 'downhole', 'downhole-compare',
    'scatter', 'histogram', 'boxplot', 'ternary', 'harker',
    'tas', 'qapf', 'afm', 'k2o-sio2', 'mali', 'fe-index', 'shand-index', 'a-cnk', 'a-nk', 'ree-normalization',
    'primitive-mantle', 'element-ratios', 'fertility-sr-y', 'fertility-la-yb', 'fertility-dy-yb', 'fertility-eu-eu',
    'fertility-ce-ce',
    'alteration',
)


# ── Validation ───────────────────────────────────────────────────────────────────────────────
class RegistryError(ValueError):
    """The registry violates a structural invariant."""


_ID = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')


def validate_registry(specs: tuple[ToolSpec, ...]) -> None:
    """Structural validation only. Bibliographic completeness is reported by ``reference_debt``, not enforced."""
    ids = [s.id for s in specs]
    if len(set(ids)) != len(ids):
        raise RegistryError(f'duplicate tool ids: {sorted({i for i in ids if ids.count(i) > 1})}')
    legacy = [s.id for s in specs if s.legacy_group is not None]
    if legacy != list(LEGACY_TOOL_IDS):
        raise RegistryError('the migrated legacy tools are missing, renamed or reordered')
    for s in specs:
        where = f'tool {s.id!r}'
        if not s.id or not _ID.match(s.id):
            raise RegistryError(f'{where}: id must be non-empty kebab-case')
        if not s.label:
            raise RegistryError(f'{where}: empty label')
        if not isinstance(s.module, Module) or not isinstance(s.family, Family) or s.family not in MODULE_FAMILIES[s.module]:
            raise RegistryError(f'{where}: family {s.family!r} is not valid for module {s.module!r}')
        if not isinstance(s.status, Status):
            raise RegistryError(f'{where}: invalid status')
        if not isinstance(s.renderer, RendererId):
            raise RegistryError(f'{where}: invalid renderer')
        if not isinstance(s.reference.kind, ReferenceKind):
            raise RegistryError(f'{where}: invalid reference kind')
        if not isinstance(s.calculation.kind, CalculationKind) or not s.calculation.handler_id:
            raise RegistryError(f'{where}: invalid calculation spec')
        if not s.inputs:
            raise RegistryError(f'{where}: no inputs')
        keys = [i.key for i in s.inputs]
        if any(not k for k in keys) or len(set(keys)) != len(keys):
            raise RegistryError(f'{where}: input keys must be non-empty and unique')
        if any(not isinstance(i.type, InputType) or not isinstance(i.unit_kind, UnitKind) for i in s.inputs):
            raise RegistryError(f'{where}: invalid input type or unit kind')
        if any(not isinstance(r, SemanticRole) for i in s.inputs for r in i.allowed_roles):
            raise RegistryError(f'{where}: allowed_roles must be SemanticRole values')
        if any(not isinstance(r, SemanticRole) for r in s.group_allowed_roles):
            raise RegistryError(f'{where}: group_allowed_roles must be SemanticRole values')
        if len({i.unit_kind for i in s.inputs}) != 1:
            raise RegistryError(f'{where}: the legacy contract has a single unit per tool')
        if s.input_rule.kind is InputRuleKind.AT_LEAST and not (s.input_rule.minimum and 1 <= s.input_rule.minimum <= len(keys)):
            raise RegistryError(f'{where}: invalid AT_LEAST minimum')
        if not isinstance(s.capabilities, frozenset) or not s.capabilities <= CURRENT_CAPABILITIES:
            raise RegistryError(f'{where}: capabilities outside the ones that exist today: '
                                f'{sorted(s.capabilities - CURRENT_CAPABILITIES)}')
        if Capability.DEPTH in s.capabilities and Capability.GROUP not in s.capabilities:
            raise RegistryError(f'{where}: depth profiles need the group capability (one line per hole)')
        if not s.outputs or any(o.field not in OUTPUT_FIELDS for o in s.outputs):
            raise RegistryError(f'{where}: outputs must use fields from {sorted(OUTPUT_FIELDS)}')
        if len({p.name for p in s.parameters}) != len(s.parameters):
            raise RegistryError(f'{where}: duplicate parameter names')
        if s.status is Status.IMPLEMENTED and (s.renderer is None or s.calculation is None):
            raise RegistryError(f'{where}: an implemented tool needs a renderer and a calculation')
        if s.id in LEGACY_TOOL_IDS and (s.legacy_group is None or s.status is not Status.IMPLEMENTED):
            raise RegistryError(f'{where}: migrated tools must be implemented and keep their legacy_group')


def strict_reference_problems(spec: ToolSpec) -> list[str]:
    """What a published method still lacks under the (not yet enforced) strict rule: authors, year, citation|title."""
    ref = spec.reference
    if ref.kind is not ReferenceKind.PUBLISHED_METHOD:
        return []
    problems = []
    if not ref.authors:
        problems.append('authors')
    if ref.year is None:
        problems.append('year')
    if not (ref.citation or ref.title):
        problems.append('citation_or_title')
    return problems


def reference_debt() -> dict[str, list[str]]:
    """Bibliographic gaps kept visible instead of blocking the migration. Nothing here is invented or inferred."""
    published = [s for s in REGISTRY if s.reference.kind is ReferenceKind.PUBLISHED_METHOD]
    return {
        'published_failing_strict_rule': [s.id for s in published if strict_reference_problems(s)],
        'published_without_title': [s.id for s in published if not s.reference.title],
        'published_with_incomplete_author_list': [
            s.id for s in published if any(a.endswith('et al.') for a in s.reference.authors)],
        'derived_without_any_citation': [
            s.id for s in REGISTRY if s.reference.kind is ReferenceKind.DERIVED_METHOD
            and not s.reference.citation and not s.reference.reference_data],
        'derived_citing_only_reference_data': [
            s.id for s in REGISTRY if s.reference.kind is ReferenceKind.DERIVED_METHOD
            and not s.reference.citation and s.reference.reference_data],
        # The only entry about the legacy contract itself (the one place besides the projection that reads legacy_text).
        'legacy_reference_falls_back_to_formula': [s.id for s in REGISTRY if not s.reference.legacy_text],
    }


validate_registry(REGISTRY)
_BY_ID = MappingProxyType({s.id: s for s in REGISTRY})


# ── Small deterministic API ──────────────────────────────────────────────────────────────────
def all_tools() -> tuple[ToolSpec, ...]:
    return REGISTRY


def get_tool(tool_id: str) -> ToolSpec:
    try:
        return _BY_ID[tool_id]
    except KeyError:
        raise KeyError(tool_id) from None


def tools_for_module(module: Module) -> tuple[ToolSpec, ...]:
    return tuple(s for s in REGISTRY if s.module is module)


def tools_for_family(module: Module, family: Family) -> tuple[ToolSpec, ...]:
    return tuple(s for s in REGISTRY if s.module is module and s.family is family)


def legacy_projection(spec: ToolSpec) -> dict:
    """The historical catalog entry (id, label, group, inputs, kind, unit, formula, reference, optional_inputs).

    Reproduces the legacy contract exactly, including ``reference`` = ``formula`` when the tool has no explicit
    reference (CURRENT BEHAVIOR — characterization only). New registry fields never appear here.
    """
    if spec.legacy_group is None:
        raise ValueError(f'{spec.id!r} has no legacy catalog entry')
    return {
        'id': spec.id, 'label': spec.label, 'group': spec.legacy_group.value,
        'inputs': [i.key for i in spec.inputs], 'kind': spec.renderer.value, 'unit': spec.unit_kind.value,
        'formula': spec.formula, 'reference': spec.reference.legacy_text or spec.formula,
        'optional_inputs': spec.input_rule.kind is InputRuleKind.AT_LEAST,
    }


def legacy_catalog() -> list[dict]:
    return [legacy_projection(s) for s in REGISTRY if s.legacy_group is not None and s.status is Status.IMPLEMENTED]
