"""Tool Registry (Phase 1B): structure, classification, and equivalence with the frozen legacy catalog.

The legacy catalog contract itself is guarded by ``test_geochemistry_catalog_contract.py`` (not modified). Here we
check that the Registry describes the 31 tools correctly and that its compatibility projection reproduces that
contract. The expected classification below is typed by hand from the approved Phase 0/1B decisions.
"""
import dataclasses
import inspect
import json
import re
from pathlib import Path

import polars as pl
import pytest

from analysis.geochemistry import catalog, engine, registry
from analysis.geochemistry.registry import (
    CURRENT_CAPABILITIES, LEGACY_TOOL_IDS, REGISTRY, Capability, CalculationKind, Family, InputRule, InputRuleKind,
    InputType, LegacyGroup, Module, ReferenceKind, RegistryError, RendererId, Status, UnitKind, all_tools, get_tool,
    legacy_catalog, legacy_projection, reference_debt, strict_reference_problems, tools_for_family, tools_for_module,
    validate_registry,
)

FROZEN = json.loads((Path(__file__).with_name('golden') / 'geochemistry_catalog.json').read_text(encoding='utf-8'))
M, F = Module, Family

# id -> (module, family): the approved classification, typed here (not derived from the registry).
EXPECTED_CLASSIFICATION = {
    'assay-compare': (M.DATA_ANALYSIS, F.QAQC), 'assay-difference': (M.DATA_ANALYSIS, F.QAQC),
    'downhole-compare': (M.DATA_ANALYSIS, F.QAQC), 'element-ratios': (M.DATA_ANALYSIS, F.GEOCHEMISTRY),
    'histogram': (M.DIAGRAMS, F.DISTRIBUTION), 'boxplot': (M.DIAGRAMS, F.DISTRIBUTION),
    'qq-normal': (M.DIAGRAMS, F.DISTRIBUTION), 'probability': (M.DIAGRAMS, F.DISTRIBUTION),
    'ecdf': (M.DIAGRAMS, F.DISTRIBUTION), 'scatter': (M.DIAGRAMS, F.XY), 'line': (M.DIAGRAMS, F.XY),
    'ternary': (M.DIAGRAMS, F.COMPOSITIONAL), 'downhole': (M.DIAGRAMS, F.PROFILES),
    'tas': (M.LITHOGEOCHEMISTRY, F.CLASSIFICATION), 'qapf': (M.LITHOGEOCHEMISTRY, F.CLASSIFICATION),
    'afm': (M.LITHOGEOCHEMISTRY, F.MAGMATIC_SERIES), 'k2o-sio2': (M.LITHOGEOCHEMISTRY, F.MAGMATIC_SERIES),
    'mali': (M.LITHOGEOCHEMISTRY, F.MAGMATIC_SERIES), 'fe-index': (M.LITHOGEOCHEMISTRY, F.MAGMATIC_SERIES),
    'harker': (M.LITHOGEOCHEMISTRY, F.VARIATION),
    'ree-normalization': (M.LITHOGEOCHEMISTRY, F.NORMALIZATION), 'primitive-mantle': (M.LITHOGEOCHEMISTRY, F.NORMALIZATION),
    'fertility-eu-eu': (M.LITHOGEOCHEMISTRY, F.NORMALIZATION), 'fertility-ce-ce': (M.LITHOGEOCHEMISTRY, F.NORMALIZATION),
    'shand-index': (M.LITHOGEOCHEMISTRY, F.CALCULATIONS), 'a-cnk': (M.LITHOGEOCHEMISTRY, F.CALCULATIONS),
    'a-nk': (M.LITHOGEOCHEMISTRY, F.CALCULATIONS),
    'fertility-sr-y': (M.EXPLORATION, F.FERTILITY), 'fertility-la-yb': (M.EXPLORATION, F.FERTILITY),
    'fertility-dy-yb': (M.EXPLORATION, F.FERTILITY), 'alteration': (M.EXPLORATION, F.ALTERATION),
}
CANONICAL_IDS = [t['id'] for t in FROZEN]


def by_id():
    return {s.id: s for s in REGISTRY}


# ── Identity, order and lookup ───────────────────────────────────────────────────────────────
def test_registry_has_exactly_31_tools_in_canonical_order():
    assert len(REGISTRY) == len(all_tools()) == 31
    assert [s.id for s in REGISTRY] == CANONICAL_IDS == list(LEGACY_TOOL_IDS)
    assert len({s.id for s in REGISTRY}) == 31


def test_lookup_by_id_and_unknown_ids():
    assert get_tool('scatter') is by_id()['scatter']
    for unknown in ('sr-y', 'eu-eu', 'nope', ''):
        with pytest.raises(KeyError):
            get_tool(unknown)


def test_module_and_family_of_all_31_tools():
    assert {s.id: (s.module, s.family) for s in REGISTRY} == EXPECTED_CLASSIFICATION
    assert len(EXPECTED_CLASSIFICATION) == 31


def test_module_and_family_queries():
    assert [len(tools_for_module(m)) for m in Module] == [4, 9, 14, 4]
    assert [s.id for s in tools_for_family(M.DIAGRAMS, F.DISTRIBUTION)] == ['qq-normal', 'probability', 'ecdf', 'histogram', 'boxplot']
    assert [s.id for s in tools_for_family(M.EXPLORATION, F.FERTILITY)] == ['fertility-sr-y', 'fertility-la-yb', 'fertility-dy-yb']
    assert tools_for_family(M.DIAGRAMS, F.COMPARISON) == ()  # families without implemented tools stay empty


def test_every_tool_is_implemented_and_nothing_is_planned_yet():
    assert {s.status for s in REGISTRY} == {Status.IMPLEMENTED}
    assert {s.name for s in Status} == {'IMPLEMENTED', 'PLANNED', 'EXPERIMENTAL', 'DEPRECATED'}


def test_legacy_group_is_preserved_even_when_the_future_module_differs():
    frozen = {t['id']: t['group'] for t in FROZEN}
    assert {s.id: s.legacy_group.value for s in REGISTRY} == frozen
    assert all(isinstance(s.legacy_group, LegacyGroup) for s in REGISTRY)
    moved = {s.id for s in REGISTRY if s.module.value != s.legacy_group.value}
    assert 'assay-compare' in moved and 'harker' in moved and 'element-ratios' in moved


# ── Inputs ───────────────────────────────────────────────────────────────────────────────────
def test_input_keys_units_and_rules_are_the_frozen_ones():
    for spec, frozen in zip(REGISTRY, FROZEN):
        assert [i.key for i in spec.inputs] == frozen['inputs'], spec.id
        assert spec.unit_kind.value == frozen['unit'], spec.id
        assert {i.unit_kind for i in spec.inputs} == {spec.unit_kind}, spec.id
        assert (spec.input_rule.kind is InputRuleKind.AT_LEAST) == frozen['optional_inputs'], spec.id


def test_input_types_follow_the_approved_decisions():
    types = {s.id: {i.type for i in s.inputs} for s in REGISTRY}
    assert types['element-ratios'] == {InputType.NUMERIC}       # numerator / denominator are NOT elements
    assert types['qapf'] == {InputType.MODAL}
    for tool in ('fertility-sr-y', 'fertility-la-yb', 'fertility-dy-yb'):
        assert types[tool] == {InputType.ELEMENT}
    assert types['tas'] == types['alteration'] == types['harker'] == {InputType.OXIDE}
    assert types['ree-normalization'] == types['primitive-mantle'] == {InputType.ELEMENT}
    assert {i.key: i.type for i in get_tool('downhole').inputs} == {'Depth': InputType.DEPTH, 'Value': InputType.NUMERIC}
    assert {t for s in REGISTRY for i in s.inputs for t in [i.type]} <= set(InputType)


def test_spider_tools_need_at_least_two_of_their_inputs():
    for tool in ('ree-normalization', 'primitive-mantle'):
        assert get_tool(tool).input_rule == InputRule(InputRuleKind.AT_LEAST, 2)
    assert [s.id for s in REGISTRY if s.input_rule.kind is InputRuleKind.AT_LEAST] == ['ree-normalization', 'primitive-mantle']


def test_iron_basis_parameter_exists_exactly_where_total_iron_is_an_input():
    with_iron = [s.id for s in REGISTRY if any(i.key == 'FeTotal' for i in s.inputs)]
    assert with_iron == ['afm', 'fe-index', 'alteration']
    assert [s.id for s in REGISTRY if s.parameters] == with_iron
    assert get_tool('afm').parameters[0].choices == ('FeOT', 'Fe2O3T') and get_tool('afm').parameters[0].default == 'FeOT'


# ── Renderer and calculation metadata ────────────────────────────────────────────────────────
def test_renderer_is_the_current_plot_kind():
    assert {s.id: s.renderer.value for s in REGISTRY} == {t['id']: t['kind'] for t in FROZEN}
    assert {s.renderer for s in REGISTRY} == set(RendererId)  # every current plot.kind is consumed by some tool
    assert len(RendererId) == 13


EXPECTED_HANDLERS = {
    'legacy.coordinates.xy': ['line', 'assay-compare'],
    'legacy.post.qq': ['qq-normal'], 'legacy.post.probability': ['probability'], 'legacy.post.ecdf': ['ecdf'],
    'legacy.coordinates.assay_difference': ['assay-difference'],
    'legacy.coordinates.downhole': ['downhole', 'downhole-compare'],
    'legacy.coordinates.scatter': ['scatter', 'harker', 'k2o-sio2'],
    'legacy.coordinates.univariate': ['histogram', 'boxplot'],
    'legacy.coordinates.ternary': ['ternary', 'afm'],
    'legacy.coordinates.tas': ['tas'], 'legacy.coordinates.qapf': ['qapf'], 'legacy.coordinates.mali': ['mali'],
    'legacy.coordinates.fe_index': ['fe-index'], 'legacy.coordinates.shand': ['shand-index', 'a-cnk', 'a-nk'],
    'legacy.coordinates.anomaly': ['fertility-eu-eu', 'fertility-ce-ce'],
    'legacy.coordinates.alteration': ['alteration'],
    'legacy.coordinates.ratio': ['element-ratios', 'fertility-sr-y', 'fertility-la-yb', 'fertility-dy-yb'],
    'legacy.spider.normalization': ['ree-normalization', 'primitive-mantle'],
}


def test_calculation_handlers_describe_the_current_engine_branches():
    grouped = {}
    for s in REGISTRY:
        grouped.setdefault(s.calculation.handler_id, []).append(s.id)
    assert grouped == EXPECTED_HANDLERS
    assert all(h.startswith('legacy.') for h in grouped)
    kinds = {}
    for s in REGISTRY:
        kinds.setdefault(s.calculation.kind, []).append(s.id)
    assert kinds[CalculationKind.GROUP_POST] == ['qq-normal', 'probability', 'ecdf']
    assert kinds[CalculationKind.SPIDER] == ['ree-normalization', 'primitive-mantle']
    assert set(kinds[CalculationKind.PASSTHROUGH]) == {
        'line', 'assay-compare', 'downhole', 'downhole-compare', 'scatter', 'histogram', 'boxplot', 'harker', 'k2o-sio2'}


def test_handler_metadata_matches_how_engine_coordinates_groups_the_tools():
    """Read-only check against engine._coordinates: tools sharing a handler share one branch (or the fallthrough)."""
    source = inspect.getsource(engine._coordinates)
    for handler, tools in EXPECTED_HANDLERS.items():
        if handler.startswith('legacy.post.') or handler == 'legacy.spider.normalization' or handler.endswith('.ratio'):
            continue
        quoted = [f"'{t}'" for t in tools]
        assert any(all(q in line for q in quoted) for line in source.splitlines()), handler
    for ratio_tool in EXPECTED_HANDLERS['legacy.coordinates.ratio']:
        assert f"'{ratio_tool}'" not in source  # the ratio branch is the fallthrough at the end of _coordinates


def test_registry_does_not_drive_or_import_the_engine():
    assert not re.search(r'^\s*(from|import)\s+analysis\.geochemistry\.(engine|catalog)', inspect.getsource(registry), re.M)
    engine_source = inspect.getsource(engine)
    assert 'registry' not in engine_source           # engine calculation is untouched and does not use the registry
    assert engine.BY_ID is catalog.BY_ID              # engine still receives its metadata through the legacy catalog


# ── Capabilities ─────────────────────────────────────────────────────────────────────────────
def test_capabilities_are_valid_and_current_only():
    assert all(isinstance(s.capabilities, frozenset) for s in REGISTRY)
    assert all(s.capabilities <= CURRENT_CAPABILITIES for s in REGISTRY)
    used = set().union(*(s.capabilities for s in REGISTRY))
    assert not used & {Capability.REGRESSION, Capability.BINS, Capability.KDE, Capability.FROM_TO}
    assert Capability.REVERSE_X not in used                      # nothing implements it today
    assert {c.name for c in Capability} & {'EXPORT_TABLE', 'EXPORT_PLOT', 'QAQC_FILTER', 'UNITS', 'AXIS_LIMITS'} == set()
    assert all(Capability.GROUP in s.capabilities for s in REGISTRY)


def test_specific_capabilities():
    caps = {s.id: s.capabilities for s in REGISTRY}
    assert [i for i, c in caps.items() if Capability.DEPTH in c] == ['downhole', 'downhole-compare']
    assert [i for i, c in caps.items() if Capability.REFERENCE_LINES in c] == ['assay-compare', 'assay-difference', 'tas', 'qapf']
    for tool in ('histogram', 'boxplot'):
        assert not caps[tool] & {Capability.COLOR, Capability.SIZE, Capability.SYMBOL, Capability.LABELS}
    assert Capability.LABELS not in caps['ree-normalization']
    assert caps['scatter'] == {Capability.GROUP, Capability.COLOR, Capability.SYMBOL, Capability.SIZE, Capability.LABELS,
                               Capability.LOG_X, Capability.LOG_Y, Capability.REVERSE_Y}


def test_qq_normal_does_not_offer_a_log_x_axis():
    """Its x axis is the theoretical normal quantile (zero or negative). The legacy engine accepting log_x is a quirk
    frozen in test_geochemistry_current_behavior.py and the golden files, not a capability to promote to the UI."""
    qq = get_tool('qq-normal').capabilities
    assert Capability.LOG_X not in qq
    assert Capability.LOG_Y in qq          # y is the observed value, a legitimate log axis
    assert qq == get_tool('scatter').capabilities - {Capability.LOG_X}
    engine.calculate(pl.DataFrame({'X': [1., 2., 3.]}), {'tool': 'qq-normal', 'columns': {'X': 'X'}, 'log_x': True})  # legacy still accepts


# LOG_X is offered only where x is a real quantitative variable. Eight tools plot against sample order (x = row_index + 1):
# CURRENT BEHAVIOR — characterization only: the legacy engine still accepts log_x for them, but it is not a capability.
ORDINAL_X_TOOLS = ['a-cnk', 'a-nk', 'element-ratios', 'fertility-sr-y', 'fertility-la-yb', 'fertility-dy-yb',
                   'fertility-eu-eu', 'fertility-ce-ce']
# Tools whose x axis is a genuine variable AND for which a log scale is appropriate today (typed by hand).
REAL_X_WITH_LOG = ['line', 'probability', 'ecdf', 'assay-compare', 'assay-difference', 'downhole', 'downhole-compare',
                   'scatter', 'harker', 'tas', 'k2o-sio2', 'mali', 'fe-index', 'shand-index', 'alteration']


@pytest.mark.parametrize('tool', ORDINAL_X_TOOLS)
def test_tools_plotted_against_sample_order_do_not_offer_log_x(tool):
    assert Capability.LOG_X not in get_tool(tool).capabilities
    df = pl.DataFrame({k: [5., 10., 15.] for k in [i.key for i in get_tool(tool).inputs]})
    columns = {i.key: i.key for i in get_tool(tool).inputs}
    result = engine.calculate(df, {'tool': tool, 'columns': columns})
    assert all(r['x'] == r['row_index'] + 1 for r in result['rows'] if r['status'] == 'valid')  # x really is the row order
    engine.calculate(df, {'tool': tool, 'columns': columns, 'log_x': True})                      # legacy engine still accepts it


def test_log_x_is_offered_exactly_where_x_is_a_real_variable():
    assert [s.id for s in REGISTRY if Capability.LOG_X in s.capabilities] == REAL_X_WITH_LOG
    without = [s.id for s in REGISTRY if Capability.LOG_X not in s.capabilities]
    assert sorted(without) == sorted(ORDINAL_X_TOOLS + ['qq-normal', 'histogram', 'boxplot', 'ternary', 'qapf', 'afm',
                                                        'ree-normalization', 'primitive-mantle'])
    assert not set(ORDINAL_X_TOOLS) & set(REAL_X_WITH_LOG)
    assert 'qq-normal' not in REAL_X_WITH_LOG and Capability.LOG_X not in get_tool('qq-normal').capabilities


def test_log_y_is_untouched_by_the_ordinal_x_adjustment():
    for tool in ORDINAL_X_TOOLS:
        assert Capability.LOG_Y in get_tool(tool).capabilities


# REVERSE_Y is the global "Invertir Y" checkbox of ChartControls (shown for every tool) and build-geo-chart.ts applies it to
# every kind except probability and downhole (see build-geo-chart.reverse-y.test.ts). Whether it is a CAPABILITY depends on
# whether reversing y is sensible for the tool.
REVERSE_Y_DECISIONS = {
    'histogram': False,          # y is a count: reversing hangs the bars from the top, no analytical use
    'boxplot': True,             # y is the data variable (may be depth-like); reversing is a legitimate view
    'qapf': False,               # fixed-orientation projection (Q up / F down by convention) with a reference frame
    'ree-normalization': False,  # y is a sample/reference ratio on a forced log scale (spider convention)
    'primitive-mantle': False,
}


@pytest.mark.parametrize('tool,expected', REVERSE_Y_DECISIONS.items())
def test_reverse_y_decision(tool, expected):
    assert (Capability.REVERSE_Y in get_tool(tool).capabilities) is expected


def test_reverse_y_is_not_offered_on_tools_with_reference_overlays_or_forced_axes():
    """Same reasoning as qapf, applied to the rest of the group: TAS polygons and the 1:1 / zero lines assume the standard
    orientation; probability and downhole force their own y axis."""
    for spec in REGISTRY:
        if Capability.REFERENCE_LINES in spec.capabilities or spec.renderer in (RendererId.PROBABILITY, RendererId.DOWNHOLE):
            assert Capability.REVERSE_Y not in spec.capabilities, spec.id


def _generic_frame(spec):
    data = {i.key: [5., 10., 15.] for i in spec.inputs}
    options = {}
    if 'F' in data:
        data['F'] = [0., 0., 0.]
    if spec.id.startswith('downhole'):
        data['Hole'] = ['A', 'A', 'A']
        options['group_column'] = 'Hole'
    return pl.DataFrame(data), {i.key: i.key for i in spec.inputs}, options


@pytest.mark.parametrize('spec', REGISTRY, ids=lambda s: s.id)
def test_log_capabilities_match_what_the_engine_accepts(spec):
    df, columns, options = _generic_frame(spec)
    for flag, capability in (('log_x', Capability.LOG_X), ('log_y', Capability.LOG_Y)):
        try:
            engine.calculate(df, {'tool': spec.id, 'columns': columns, **options, flag: True})
            accepted = True
        except ValueError as exc:
            assert 'define su propia escala' in str(exc), spec.id
            accepted = False
        if capability in spec.capabilities:
            assert accepted, f'{spec.id} declares {capability} but the engine rejects it'
        if not accepted:
            assert capability not in spec.capabilities


# ── Outputs and axis roles versus the real engine ────────────────────────────────────────────
# CURRENT BEHAVIOR — characterization only: histogram and boxplot also echo y = x (declared outputs list only x).
ECHOED_OUTPUTS = {'histogram': {'y'}, 'boxplot': {'y'}}


@pytest.mark.parametrize('spec', REGISTRY, ids=lambda s: s.id)
def test_declared_outputs_are_the_fields_the_engine_populates(spec):
    df, columns, options = _generic_frame(spec)
    rows = [r for r in engine.calculate(df, {'tool': spec.id, 'columns': columns, **options})['rows'] if r['status'] == 'valid']
    assert rows, spec.id
    observed = {f for f in registry.OUTPUT_FIELDS if any(r[f] is not None for r in rows)}
    declared = {o.field for o in spec.outputs}
    assert declared <= observed
    assert observed - declared == ECHOED_OUTPUTS.get(spec.id, set())


@pytest.mark.parametrize('spec', [s for s in REGISTRY if any(i.axis and i.axis.value in 'xyz' for i in s.inputs)], ids=lambda s: s.id)
def test_axis_roles_are_inputs_the_engine_passes_through_unchanged(spec):
    data = {i.key: [float(n + 1) + row / 10 for row in range(3)] for n, i in enumerate(spec.inputs)}
    options = {}
    if spec.id.startswith('downhole'):
        data['Hole'] = ['A', 'A', 'A']
        options['group_column'] = 'Hole'
    rows = engine.calculate(pl.DataFrame(data), {'tool': spec.id, 'columns': {i.key: i.key for i in spec.inputs}, **options})['rows']
    for inp in spec.inputs:
        if inp.axis and inp.axis.value in 'xyz':
            assert [r[inp.axis.value] for r in rows] == pytest.approx(data[inp.key]), f'{spec.id}.{inp.key}'


def test_ternary_axis_roles_are_the_three_vertices():
    assert [(i.key, i.axis.value) for i in get_tool('ternary').inputs] == [('A', 'a'), ('B', 'b'), ('C', 'c')]


# ── Projection to the legacy catalog ─────────────────────────────────────────────────────────
def test_projection_equals_the_frozen_legacy_catalog_for_all_historical_fields():
    projected = legacy_catalog()
    assert projected == FROZEN
    assert catalog.TOOLS == FROZEN
    assert [legacy_projection(s) for s in REGISTRY] == FROZEN
    assert catalog.BY_ID == {t['id']: t for t in FROZEN}


def test_projection_exposes_only_the_nine_historical_keys_and_plain_json_types():
    for entry in catalog.TOOLS:
        assert list(entry) == ['id', 'label', 'group', 'inputs', 'kind', 'unit', 'formula', 'reference', 'optional_inputs']
        assert type(entry['inputs']) is list and all(type(k) is str for k in entry['inputs'])
        assert type(entry['optional_inputs']) is bool
        assert all(type(entry[k]) is str for k in ('id', 'label', 'group', 'kind', 'unit', 'formula', 'reference'))
    json.dumps(catalog.TOOLS)


def test_catalog_module_keeps_its_public_api():
    assert callable(catalog.tool) and catalog.REE == registry.REE and catalog.TRACE == registry.TRACE
    assert catalog.FROST == registry.FROST and catalog.SM89 == registry.SM89
    legacy = catalog.tool('x', 'X', 'diagrams', ['X'], formula='f')
    assert legacy == {'id': 'x', 'label': 'X', 'group': 'diagrams', 'inputs': ['X'], 'kind': 'scatter', 'unit': 'pct',
                      'formula': 'f', 'reference': 'f', 'optional_inputs': False}


def test_reference_fallback_to_formula_is_reproduced_only_where_no_explicit_reference_exists():
    frozen_fallback = [t['id'] for t in FROZEN if t['reference'] == t['formula']]
    assert reference_debt()['legacy_reference_falls_back_to_formula'] == frozen_fallback
    for spec in REGISTRY:
        projected = legacy_projection(spec)['reference']
        assert projected == (spec.reference.legacy_text if spec.reference.legacy_text else spec.formula)
    assert len(frozen_fallback) == 21


# ── Immutability ─────────────────────────────────────────────────────────────────────────────
def test_specs_are_deeply_immutable():
    spec = get_tool('tas')
    with pytest.raises(dataclasses.FrozenInstanceError):
        spec.label = 'other'
    with pytest.raises(dataclasses.FrozenInstanceError):
        spec.inputs[0].key = 'other'
    with pytest.raises(dataclasses.FrozenInstanceError):
        spec.reference.year = 1999
    with pytest.raises(AttributeError):
        spec.capabilities.add(Capability.KDE)
    assert isinstance(REGISTRY, tuple) and isinstance(spec.inputs, tuple) and isinstance(spec.outputs, tuple)
    with pytest.raises(TypeError):
        registry._BY_ID['x'] = spec


# ── Validation ───────────────────────────────────────────────────────────────────────────────
def _with(tool_id, **changes):
    return tuple(dataclasses.replace(s, **changes) if s.id == tool_id else s for s in REGISTRY)


def test_valid_registry_passes_validation():
    validate_registry(REGISTRY)


@pytest.mark.parametrize('label,broken,message', [
    ('duplicate id', REGISTRY + (dataclasses.replace(REGISTRY[0]),), 'duplicate tool ids'),
    ('missing legacy tool', REGISTRY[:-1], 'missing, renamed or reordered'),
    ('reordered legacy tools', (REGISTRY[1], REGISTRY[0]) + REGISTRY[2:], 'missing, renamed or reordered'),
    ('empty id', _with('scatter', id=''), 'missing, renamed or reordered'),
    ('family of another module', _with('scatter', family=Family.ALTERATION), 'not valid for module'),
    ('future capability', _with('scatter', capabilities=frozenset({Capability.KDE})), 'capabilities outside'),
    ('depth without group', _with('downhole', capabilities=frozenset({Capability.DEPTH})), 'need the group capability'),
    ('no inputs', _with('scatter', inputs=()), 'no inputs'),
    ('duplicate input keys', _with('scatter', inputs=REGISTRY[8].inputs + REGISTRY[8].inputs[:1]), 'unique'),
    ('mixed units', _with('scatter', inputs=(dataclasses.replace(REGISTRY[8].inputs[0], unit_kind=UnitKind.PPM),) + REGISTRY[8].inputs[1:]), 'single unit'),
    ('bad AT_LEAST', _with('scatter', input_rule=InputRule(InputRuleKind.AT_LEAST, 9)), 'AT_LEAST'),
    ('bad output field', _with('scatter', outputs=(registry.OutputSpec('w', 'W'),)), 'outputs must use'),
    ('not a status', _with('scatter', status='implemented'), 'invalid status'),
    ('legacy tool not implemented', _with('scatter', status=Status.PLANNED), 'must be implemented'),
    ('legacy tool loses its group', _with('scatter', legacy_group=None), 'missing, renamed or reordered'),
])
def test_validation_rejects_broken_registries(label, broken, message):
    with pytest.raises(RegistryError, match=message):
        validate_registry(broken)


def test_ids_are_kebab_case():
    assert all(re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', s.id) for s in REGISTRY)


# ── References and documented debt ───────────────────────────────────────────────────────────
def test_reference_kinds():
    kinds = {}
    for s in REGISTRY:
        kinds.setdefault(s.reference.kind, []).append(s.id)
    assert [len(kinds[k]) for k in ReferenceKind] == [13, 8, 10]
    assert kinds[ReferenceKind.PUBLISHED_METHOD] == ['tas', 'qapf', 'mali', 'fe-index', 'shand-index', 'ree-normalization', 'primitive-mantle', 'alteration']
    assert kinds[ReferenceKind.DERIVED_METHOD] == ['harker', 'afm', 'k2o-sio2', 'a-cnk', 'a-nk', 'fertility-sr-y', 'fertility-la-yb', 'fertility-dy-yb', 'fertility-eu-eu', 'fertility-ce-ce']


def test_published_reference_data_comes_only_from_the_legacy_text():
    """Nothing invented: every published citation/year/DOI must appear in the legacy reference text."""
    for s in REGISTRY:
        ref = s.reference
        if ref.kind is not ReferenceKind.PUBLISHED_METHOD:
            continue
        text = ref.legacy_text or ''
        if ref.citation:
            assert text.startswith(ref.citation), s.id
        if ref.year:
            assert f'({ref.year})' in text, s.id
        if ref.doi:
            assert f'doi:{ref.doi}' in text, s.id
        assert ref.title is None                     # no title exists anywhere in the repo
        assert all(a.split()[0] in text for a in ref.authors), s.id


def test_reference_debt_is_recorded_not_enforced():
    assert reference_debt() == {
        'published_failing_strict_rule': ['shand-index'],
        'published_without_title': ['tas', 'qapf', 'mali', 'fe-index', 'shand-index', 'ree-normalization', 'primitive-mantle', 'alteration'],
        'published_with_incomplete_author_list': ['mali', 'fe-index', 'alteration'],
        'derived_without_any_citation': ['harker', 'afm', 'k2o-sio2', 'a-cnk', 'a-nk', 'fertility-sr-y', 'fertility-la-yb', 'fertility-dy-yb'],
        'derived_citing_only_reference_data': ['fertility-eu-eu', 'fertility-ce-ce'],
        'legacy_reference_falls_back_to_formula': [t['id'] for t in FROZEN if t['reference'] == t['formula']],
    }
    assert strict_reference_problems(get_tool('shand-index')) == ['year', 'citation_or_title']
    assert all(strict_reference_problems(s) == [] for s in REGISTRY if s.id != 'shand-index')


def test_doi_and_url_are_optional():
    assert all(s.reference.url is None for s in REGISTRY)
    assert get_tool('shand-index').reference.doi is None
    validate_registry(REGISTRY)  # incomplete published metadata does not block the registry


def test_generic_references_never_pretend_to_be_bibliography():
    for s in REGISTRY:
        if s.reference.kind is ReferenceKind.GENERIC:
            assert (s.reference.authors, s.reference.year, s.reference.citation, s.reference.legacy_text) == ((), None, None, None)


def test_formula_and_reference_are_distinct_fields_in_the_registry():
    for s in REGISTRY:
        assert s.reference.legacy_text != s.formula  # the registry never stores the formula as the reference


# ── Adjustments before the checkpoint ────────────────────────────────────────────────────────
def test_module_spelling_is_lithogeochemistry_and_legacy_group_is_unchanged():
    assert Module.LITHOGEOCHEMISTRY.value == 'lithogeochemistry'
    assert not hasattr(Module, 'LITOGEOCHEMISTRY')
    assert [m.value for m in Module] == ['data_analysis', 'diagrams', 'lithogeochemistry', 'exploration']
    assert [g.value for g in LegacyGroup] == ['diagrams', 'lithogeochemistry', 'mineral-exploration']
    assert Module.LITHOGEOCHEMISTRY is not LegacyGroup.LITHOGEOCHEMISTRY  # distinct enums even if a spelling coincides
    assert {s.legacy_group.value for s in REGISTRY} == {'diagrams', 'lithogeochemistry', 'mineral-exploration'}
    assert 'litogeochemistry' not in {m.value for m in Module}


def test_modern_reference_analysis_does_not_depend_on_legacy_text(monkeypatch):
    """legacy_text is legacy-catalog compatibility only: strip it and everything modern must stay the same."""
    stripped = tuple(dataclasses.replace(s, reference=dataclasses.replace(s.reference, legacy_text=None)) for s in REGISTRY)
    original = reference_debt()
    monkeypatch.setattr(registry, 'REGISTRY', stripped)
    after = reference_debt()
    modern = [k for k in original if k != 'legacy_reference_falls_back_to_formula']
    assert {k: after[k] for k in modern} == {k: original[k] for k in modern}
    assert len(after['legacy_reference_falls_back_to_formula']) == 31        # only the legacy entry reacts
    assert all(strict_reference_problems(s) == strict_reference_problems(g) for s, g in zip(stripped, REGISTRY))
    validate_registry(stripped)


def test_legacy_text_is_documented_as_temporary_compatibility_in_the_source():
    source = inspect.getsource(registry.ReferenceSpec)
    assert 'Legacy catalog compatibility only.' in source
    assert 'Remove when the legacy catalog projection is retired.' in source
    assert legacy_projection(get_tool('tas'))['reference'] == get_tool('tas').reference.legacy_text
    assert legacy_projection(get_tool('scatter'))['reference'] == get_tool('scatter').formula   # legacy_text None -> formula
