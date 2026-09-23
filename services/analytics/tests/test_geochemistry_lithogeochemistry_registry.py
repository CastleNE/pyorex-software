"""Lithogeochemistry vertical slice: Familia -> Herramienta navigation (module=lithogeochemistry, status=implemented)
and the Semantic Variable System's allowed_roles/allowed_analytes for tas, k2o-sio2, mali, fe-index, shand-index,
a-cnk, a-nk and harker. No calculation, renderer or legacy_group changed — see test_geochemistry_registry_rpc.py and
test_geochemistry_column_roles_rpc.py for the DIAGRAMS-side coverage this mirrors.
"""
import pytest

from analysis.geochemistry.registry import REGISTRY, get_tool
from analysis.geochemistry.registry_view import registry_view
from analysis.geochemistry.semantics import SemanticRole

MAJOR_OXIDE_TOOLS = ('tas', 'k2o-sio2', 'mali', 'fe-index', 'shand-index', 'a-cnk', 'a-nk', 'harker')
EXPECTED_NAVIGATION = {
    'classification': ['tas', 'qapf'],
    'magmatic_series': ['afm', 'k2o-sio2', 'mali', 'fe-index'],
    'variation': ['harker'],
    'normalization': ['ree-normalization', 'primitive-mantle', 'fertility-eu-eu', 'fertility-ce-ce'],
    'calculations': ['shand-index', 'a-cnk', 'a-nk'],
}


@pytest.fixture(scope='module')
def litho_tools():
    view = registry_view()
    return [t for t in view['tools'] if t['module'] == 'lithogeochemistry' and t['status'] == 'implemented']


def allowed(tool_id, key):
    return next(i for i in get_tool(tool_id).inputs if i.key == key)


# ── Navigation: 14 tools, 5 families, exact order — built from module/family/status, never legacy_group ──────────
def test_lithogeochemistry_has_exactly_14_implemented_tools(litho_tools):
    assert len(litho_tools) == 14
    assert len({t['id'] for t in litho_tools}) == 14


def test_lithogeochemistry_navigation_matches_the_five_families_in_order(litho_tools):
    grouped = {}
    for tool in litho_tools:
        grouped.setdefault(tool['family'], []).append(tool['id'])
    assert grouped == EXPECTED_NAVIGATION
    assert list(grouped) == list(EXPECTED_NAVIGATION)   # families arrive in the exact requested order


def test_navigation_does_not_depend_on_legacy_group():
    """Every migrated tool still carries its legacy_group (for the untouched legacy catalog), but the navigation
    query above only ever reads module/family/status — legacy_group is irrelevant to it."""
    for spec in REGISTRY:
        if spec.id in {t for ids in EXPECTED_NAVIGATION.values() for t in ids}:
            assert spec.legacy_group is not None   # unchanged, still present — just not what builds the nav


# ── TAS: the first per-key analyte case ───────────────────────────────────────────────────────
def test_tas_constrains_each_input_to_its_exact_oxide():
    assert set(allowed('tas', 'SiO2').allowed_roles) == {SemanticRole.MAJOR_OXIDE}
    assert allowed('tas', 'SiO2').allowed_analytes == ('SiO2',)
    assert allowed('tas', 'Na2O').allowed_analytes == ('Na2O',)
    assert allowed('tas', 'K2O').allowed_analytes == ('K2O',)


# ── K2O-SiO2, MALI, Fe-index, Shand, A/CNK, A/NK, Harker ─────────────────────────────────────────
def test_k2o_sio2_constrains_each_input_to_its_exact_oxide():
    assert allowed('k2o-sio2', 'SiO2').allowed_analytes == ('SiO2',)
    assert allowed('k2o-sio2', 'K2O').allowed_analytes == ('K2O',)


def test_mali_constrains_each_of_its_four_inputs():
    for key, analyte in (('SiO2', 'SiO2'), ('Na2O', 'Na2O'), ('K2O', 'K2O'), ('CaO', 'CaO')):
        spec = allowed('mali', key)
        assert set(spec.allowed_roles) == {SemanticRole.MAJOR_OXIDE}
        assert spec.allowed_analytes == (analyte,)


def test_fe_index_iron_total_accepts_every_iron_form_the_engine_recognizes():
    """iron_basis (existing, untouched) tells the engine which of these forms the mapped column represents —
    see engine.py's convert_fe2o3t_to_feot; the constraint here only says which columns are iron at all."""
    assert allowed('fe-index', 'SiO2').allowed_analytes == ('SiO2',)
    assert allowed('fe-index', 'MgO').allowed_analytes == ('MgO',)
    fe_total = allowed('fe-index', 'FeTotal')
    assert set(fe_total.allowed_roles) == {SemanticRole.MAJOR_OXIDE}
    assert set(fe_total.allowed_analytes) == {'Fe2O3', 'Fe2O3T', 'FeO', 'FeOT'}


@pytest.mark.parametrize('tool_id,keys', [
    ('shand-index', ('Al2O3', 'CaO', 'Na2O', 'K2O')),
    ('a-cnk', ('Al2O3', 'CaO', 'Na2O', 'K2O')),
    ('a-nk', ('Al2O3', 'Na2O', 'K2O')),
])
def test_shand_family_constrains_each_input_to_its_exact_oxide(tool_id, keys):
    for key in keys:
        spec = allowed(tool_id, key)
        assert set(spec.allowed_roles) == {SemanticRole.MAJOR_OXIDE}
        assert spec.allowed_analytes == (key,)
    assert {i.key for i in get_tool(tool_id).inputs} == set(keys)


def test_a_cnk_current_behavior_and_formulas_are_unaffected_by_the_new_constraints():
    """The Semantic Variable System only narrows which columns the Editor offers; it must not touch what a-cnk
    computes or how (see test_geochemistry_current_behavior.py for the frozen A/NK-evaluated-first quirk)."""
    spec = get_tool('a-cnk')
    assert spec.calculation.handler_id == 'analysis.geochemistry.core.indices.calculate_a_cnk'
    assert spec.formula == '(Al2O3/101.9613) / (CaO/56.0774 + Na2O/61.9789 + K2O/94.196).'


def test_harker_lets_the_second_oxide_be_any_major_oxide_but_pins_sio2():
    sio2 = allowed('harker', 'SiO2')
    oxide = allowed('harker', 'Oxide')
    assert set(sio2.allowed_roles) == {SemanticRole.MAJOR_OXIDE} and sio2.allowed_analytes == ('SiO2',)
    assert set(oxide.allowed_roles) == {SemanticRole.MAJOR_OXIDE} and oxide.allowed_analytes == ()


# ── Everything explicitly left alone (section 11): backward-compatible, unrestricted ─────────────
@pytest.mark.parametrize('tool_id', ['qapf', 'afm', 'ree-normalization', 'primitive-mantle', 'fertility-eu-eu',
                                     'fertility-ce-ce'])
def test_tools_deliberately_not_migrated_yet_keep_empty_constraints(tool_id):
    spec = get_tool(tool_id)
    assert all(i.allowed_roles == () and i.allowed_analytes == () for i in spec.inputs)
    assert spec.group_allowed_roles == ()


def test_all_eight_migrated_lithogeochemistry_tools_use_only_the_major_oxide_role():
    for tool_id in MAJOR_OXIDE_TOOLS:
        for input_spec in get_tool(tool_id).inputs:
            assert set(input_spec.allowed_roles) == {SemanticRole.MAJOR_OXIDE}, (tool_id, input_spec.key)
