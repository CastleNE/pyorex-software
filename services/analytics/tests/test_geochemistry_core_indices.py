"""Direct tests of core/indices.py (Phase 2A): MALI, Fe-index, A/CNK, A/NK, Shand pair, AI, CCPI and iron conversion.

Expected values are worked out by hand here (constants typed independently of the module under test). The pipeline-level
behaviour of these tools is protected by the golden files and the CURRENT BEHAVIOR tests, which are not modified.
"""
import inspect
import re
from pathlib import Path

import polars as pl
import pytest

from analysis.geochemistry import engine
from analysis.geochemistry.core import indices
from analysis.geochemistry.core.indices import (
    FE2O3T_TO_FEOT, MOLAR_MASSES, calculate_a_cnk, calculate_a_nk, calculate_ai, calculate_alteration_indices, calculate_ccpi,
    calculate_fe_index, calculate_mali, calculate_shand_indices, convert_fe2o3t_to_feot,
)

ANALYSIS = Path(__file__).resolve().parents[1] / 'analysis'
M_AL, M_CA, M_NA, M_K = 101.9613, 56.0774, 61.9789, 94.196   # typed independently on purpose


# ── MALI ─────────────────────────────────────────────────────────────────────────────────────
def test_mali_known_values():
    assert calculate_mali(3., 4., 5.) == 2.
    assert calculate_mali(0., 0., 8.) == -8.        # a negative MALI is a legitimate result
    assert calculate_mali(2., 1., 0.) == 3.


# ── Fe-index and iron conversion ─────────────────────────────────────────────────────────────
def test_fe_index_known_values():
    assert calculate_fe_index(10., 5.) == pytest.approx(2 / 3)
    assert calculate_fe_index(0., 5.) == 0.0
    assert calculate_fe_index(5., 0.) == 1.0


def test_fe_index_rejects_a_zero_denominator():
    with pytest.raises(ValueError, match='Denominador no positivo'):
        calculate_fe_index(0., 0.)


def test_iron_factor_is_the_historical_0_8998_and_converts_fe2o3t_to_feot():
    assert FE2O3T_TO_FEOT == 0.8998
    assert convert_fe2o3t_to_feot(10.) == 10. * 0.8998 == pytest.approx(8.998)
    assert convert_fe2o3t_to_feot(0.) == 0.
    assert calculate_fe_index(convert_fe2o3t_to_feot(10.), 5.) == pytest.approx(8.998 / (8.998 + 5.))   # existing suite value


def test_feot_needs_no_conversion():
    assert calculate_fe_index(10., 5.) == pytest.approx(10 / 15)


# ── A/NK, A/CNK and the Shand pair ───────────────────────────────────────────────────────────
def test_molar_masses_are_the_documented_ones():
    assert MOLAR_MASSES == {'Al2O3': M_AL, 'CaO': M_CA, 'Na2O': M_NA, 'K2O': M_K}


def test_a_nk_and_a_cnk_analytic_values():
    # one mole of each oxide: A/NK = 1 / (1 + 1) and A/CNK = 1 / (1 + 1 + 1)
    assert calculate_a_nk(M_AL, M_NA, M_K) == pytest.approx(1 / 2)
    assert calculate_a_cnk(M_AL, M_CA, M_NA, M_K) == pytest.approx(1 / 3)
    # another hand-computed point: Al2O3 = 2 mol, Na2O = 1 mol, K2O = 0
    assert calculate_a_nk(2 * M_AL, M_NA, 0.) == pytest.approx(2.)
    assert calculate_a_cnk(2 * M_AL, 0., M_NA, 0.) == pytest.approx(2.)


def test_a_nk_and_a_cnk_reject_zero_denominators():
    with pytest.raises(ValueError, match='Denominador no positivo'):
        calculate_a_nk(10., 0., 0.)
    with pytest.raises(ValueError, match='Denominador no positivo'):
        calculate_a_cnk(10., 0., 0., 0.)


def test_a_cnk_in_isolation_is_computable_when_only_cao_is_present():
    """The pure function is mathematically independent of A/NK, unlike the legacy engine branch (below)."""
    assert calculate_a_cnk(10., 5., 0., 0.) == pytest.approx((10 / M_AL) / (5 / M_CA))


def test_shand_pair_returns_a_cnk_then_a_nk():
    a_cnk, a_nk = calculate_shand_indices(M_AL, M_CA, M_NA, M_K)
    assert (a_cnk, a_nk) == (pytest.approx(1 / 3), pytest.approx(1 / 2))


def test_shand_pair_needs_na2o_plus_k2o_positive_even_when_a_cnk_alone_would_work():
    assert calculate_a_cnk(10., 5., 0., 0.) > 0
    with pytest.raises(ValueError, match='Denominador no positivo'):
        calculate_shand_indices(10., 5., 0., 0.)


def test_shand_pair_evaluates_a_nk_before_a_cnk(monkeypatch):
    calls = []
    monkeypatch.setattr(indices, 'calculate_a_nk', lambda *a: calls.append('a_nk') or 1.0)
    monkeypatch.setattr(indices, 'calculate_a_cnk', lambda *a: calls.append('a_cnk') or 2.0)
    assert calculate_shand_indices(1., 1., 1., 1.) == (2.0, 1.0)
    assert calls == ['a_nk', 'a_cnk']


# ── Alteration indices ───────────────────────────────────────────────────────────────────────
def test_ai_known_values():
    assert calculate_ai(1., 1., 1., 1.) == 50.
    assert calculate_ai(2., 1., 1., 0.) == 75.
    assert calculate_ai(0., 0., 1., 4.) == 0.0      # zero numerator with a positive denominator


def test_ccpi_known_values():
    assert calculate_ccpi(1., 1., 1., 1.) == 50.
    assert calculate_ccpi(2., 1., 1., 0.) == 75.
    assert calculate_ccpi(0., 0., 3., 3.) == 0.0


@pytest.mark.parametrize('function,args', [(calculate_ai, (0., 0., 0., 0.)), (calculate_ccpi, (0., 0., 0., 0.))])
def test_alteration_indices_reject_zero_denominators(function, args):
    with pytest.raises(ValueError, match='Denominador no positivo'):
        function(*args)


def test_alteration_pair_is_ai_then_ccpi_and_feot_is_used_as_given():
    ai, ccpi = calculate_alteration_indices(mgo=2., k2o=1., na2o=1., cao=0., feot=3.)
    assert ai == 75.                                    # 100 * (2 + 1) / (2 + 1 + 1 + 0)
    assert ccpi == pytest.approx(100 * (2 + 3) / (2 + 3 + 1 + 1))
    # a Fe2O3T user converts BEFORE calling: the core never applies an iron basis itself
    _, ccpi_converted = calculate_alteration_indices(2., 1., 1., 0., convert_fe2o3t_to_feot(3.))
    assert ccpi_converted == pytest.approx(100 * (2 + 3 * 0.8998) / (2 + 3 * 0.8998 + 1 + 1))


# ── Same operation order as the legacy expressions (bit-identical results) ───────────────────
@pytest.mark.parametrize('args', [(1.37, 0.42, 2.9, 3.1), (0.1, 0.2, 0.3, 0.4), (12.5, 7.7, 1.1, 0.03)])
def test_expressions_keep_the_legacy_operation_order(args):
    mgo, k2o, na2o, cao = args
    assert calculate_ai(mgo, k2o, na2o, cao) == 100 * (mgo + k2o) / (mgo + k2o + na2o + cao)
    assert calculate_ccpi(mgo, cao, na2o, k2o) == 100 * (mgo + cao) / (mgo + cao + na2o + k2o)
    assert calculate_mali(na2o, k2o, cao) == na2o + k2o - cao
    assert calculate_a_cnk(mgo, cao, na2o, k2o) == (mgo / M_AL) / (cao / M_CA + na2o / M_NA + k2o / M_K)
    assert calculate_a_nk(mgo, na2o, k2o) == (mgo / M_AL) / (na2o / M_NA + k2o / M_K)


# ── Single source and isolation ──────────────────────────────────────────────────────────────
def test_molar_table_and_iron_factor_have_a_single_definition():
    sources = {p: p.read_text(encoding='utf-8') for p in ANALYSIS.rglob('*.py')}
    molar = [p.name for p, t in sources.items() if re.search(r"'Al2O3'\s*:\s*101\.9613", t)]
    iron = [p.name for p, t in sources.items() if re.search(r'^\s*FE2O3T_TO_FEOT\s*=\s*0?\.8998', t, re.M)]
    assert molar == ['indices.py'] and iron == ['indices.py']
    assert '.8998' not in inspect.getsource(engine)
    assert engine.MOLAR is MOLAR_MASSES                # legacy alias, same object


def test_core_modules_do_not_import_the_pipeline_the_catalog_or_the_registry():
    for module in (indices,):
        source = inspect.getsource(module)
        assert not re.search(r'^\s*(from|import)\s+analysis\.geochemistry\.(engine|catalog|registry|models)', source, re.M)
        assert 'polars' not in source
    assert re.findall(r'^\s*from\s+(\S+)\s+import', inspect.getsource(indices), re.M) == ['analysis.geochemistry.core.ratios']


# ── The engine really delegates (mock the core function, the tool result follows) ────────────
def _frame(*keys):
    return pl.DataFrame({k: [5., 10.] for k in keys})


def _run(tool, keys, **options):
    return engine.calculate(_frame(*keys), {'tool': tool, 'columns': {k: k for k in keys}, **options})['rows']


def test_mali_and_fe_index_delegate(monkeypatch):
    real_mali = _run('mali', ['SiO2', 'Na2O', 'K2O', 'CaO'])
    assert [r['y'] for r in real_mali] == [5., 10.]
    monkeypatch.setattr(engine, 'calculate_mali', lambda *a: 42.0)
    monkeypatch.setattr(engine, 'calculate_fe_index', lambda *a: 43.0)
    assert [r['y'] for r in _run('mali', ['SiO2', 'Na2O', 'K2O', 'CaO'])] == [42.0, 42.0]
    assert [r['y'] for r in _run('fe-index', ['SiO2', 'FeTotal', 'MgO'])] == [43.0, 43.0]


def test_shand_family_delegates(monkeypatch):
    keys = ['Al2O3', 'CaO', 'Na2O', 'K2O']
    monkeypatch.setattr(engine, 'calculate_shand_indices', lambda *a: (7.0, 42.0))
    rows = _run('shand-index', keys)
    assert [(r['x'], r['y']) for r in rows] == [(7.0, 42.0)] * 2
    monkeypatch.setattr(engine, 'calculate_a_cnk', lambda *a: 44.0)
    monkeypatch.setattr(engine, 'calculate_a_nk', lambda *a: 45.0)
    assert [r['y'] for r in _run('a-cnk', keys)] == [44.0, 44.0]
    assert [r['y'] for r in _run('a-nk', ['Al2O3', 'Na2O', 'K2O'])] == [45.0, 45.0]


def test_alteration_delegates_and_iron_conversion_goes_through_the_core(monkeypatch):
    keys = ['MgO', 'K2O', 'Na2O', 'CaO', 'FeTotal']
    monkeypatch.setattr(engine, 'calculate_alteration_indices', lambda *a: (11.0, 42.0))
    assert [(r['x'], r['y']) for r in _run('alteration', keys)] == [(11.0, 42.0)] * 2
    monkeypatch.undo()
    seen = []
    monkeypatch.setattr(engine, 'convert_fe2o3t_to_feot', lambda v: seen.append(v) or v * 2)
    _run('fe-index', ['SiO2', 'FeTotal', 'MgO'], iron_basis='Fe2O3T')
    assert seen == [5., 10.]                             # applied to FeTotal only when the basis is Fe2O3T
    seen.clear()
    _run('fe-index', ['SiO2', 'FeTotal', 'MgO'], iron_basis='FeOT')
    assert seen == []


# ── CURRENT BEHAVIOR — characterization only: the a-cnk tool still evaluates A/NK first ──────
def test_engine_a_cnk_branch_still_reproduces_the_legacy_a_nk_coupling(monkeypatch):
    df = pl.DataFrame({'Al2O3': [10.], 'CaO': [5.], 'Na2O': [0.], 'K2O': [0.]})
    request = {'tool': 'a-cnk', 'columns': {k: k for k in df.columns}}
    row = engine.calculate(df, request)['rows'][0]
    assert (row['status'], row['reason']) == ('invalid', 'Denominador no positivo')   # although A/CNK alone is computable
    assert calculate_a_cnk(10., 5., 0., 0.) > 0                                        # ... as the pure function shows
    order = []
    good = pl.DataFrame({'Al2O3': [10.], 'CaO': [5.], 'Na2O': [1.], 'K2O': [1.]})
    monkeypatch.setattr(engine, 'calculate_a_nk', lambda *a: order.append('a_nk') or 1.0)
    monkeypatch.setattr(engine, 'calculate_a_cnk', lambda *a: order.append('a_cnk') or 2.0)
    engine.calculate(good, request)
    assert order == ['a_nk', 'a_cnk']
