"""Direct tests of core/ratios.py (Phase 2A): the canonical division, in isolation from the engine.

Golden and characterization tests already cover hundreds of pipeline rows; these only prove that the pure
function behaves as the historical ``engine._divide`` did and that the engine really delegates to it.
"""
import inspect
import re
from pathlib import Path

import polars as pl
import pytest

from analysis.geochemistry import engine
from analysis.geochemistry.core import ratios
from analysis.geochemistry.core.ratios import calculate_ratio

ANALYSIS = Path(__file__).resolve().parents[1] / 'analysis'


def test_normal_ratio():
    assert calculate_ratio(10., 4.) == 2.5
    assert calculate_ratio(1, 3) == pytest.approx(1 / 3)
    assert calculate_ratio(500., 10.) == 50.
    assert calculate_ratio(1e-9, 1e-3) == pytest.approx(1e-6)


def test_zero_numerator_is_a_valid_zero():
    result = calculate_ratio(0., 5.)
    assert result == 0.0 and isinstance(result, float)
    assert calculate_ratio(0, 5) == 0.0


@pytest.mark.parametrize('denominator', [0, 0., -0., -1., -1e-12, -500.])
def test_non_positive_denominator_is_rejected_with_the_legacy_message(denominator):
    with pytest.raises(ValueError, match='^Denominador no positivo$'):
        calculate_ratio(10., denominator)


def test_zero_over_zero_is_rejected_because_the_denominator_check_comes_first():
    with pytest.raises(ValueError, match='Denominador no positivo'):
        calculate_ratio(0., 0.)


def test_tiny_positive_denominator_is_accepted():
    assert calculate_ratio(1., 1e-300) == pytest.approx(1e300)


def test_the_function_is_pure_math_it_converts_no_units_and_does_not_validate_the_numerator():
    # Unit conversion (pct/ppm/ppb) and negative-concentration checks belong to the engine pipeline, not to the core.
    assert calculate_ratio(1000., 2.) == 500.
    assert calculate_ratio(-1., 2.) == -0.5
    assert list(inspect.signature(calculate_ratio).parameters) == ['numerator', 'denominator']


def test_the_engine_legacy_name_is_the_same_function():
    assert engine._divide is calculate_ratio


def test_core_ratios_is_self_contained():
    source = inspect.getsource(ratios)
    assert not re.search(r'^\s*(from|import)\s', source, re.M)   # no imports at all: nothing to cycle with


@pytest.mark.parametrize('tool,columns', [
    ('element-ratios', {'numerator': 'a', 'denominator': 'b'}),
    ('fertility-sr-y', {'Sr': 'a', 'Y': 'b'}),
    ('fertility-la-yb', {'La': 'a', 'Yb': 'b'}),
    ('fertility-dy-yb', {'Dy': 'a', 'Yb': 'b'}),
])
def test_engine_ratio_tools_delegate_the_division_to_the_core(tool, columns, monkeypatch):
    df = pl.DataFrame({'a': [10., 20.], 'b': [4., 5.]})
    real = engine.calculate(df, {'tool': tool, 'columns': columns})
    assert [r['y'] for r in real['rows']] == [2.5, 4.0]
    monkeypatch.setattr(engine, 'calculate_ratio', lambda numerator, denominator: 42.0)
    patched = engine.calculate(df, {'tool': tool, 'columns': columns})
    assert [r['y'] for r in patched['rows']] == [42.0, 42.0]


def test_engine_still_reports_the_legacy_row_error_for_a_zero_denominator():
    df = pl.DataFrame({'a': [10., 5.], 'b': [0., 2.]})
    rows = engine.calculate(df, {'tool': 'element-ratios', 'columns': {'numerator': 'a', 'denominator': 'b'}})['rows']
    assert (rows[0]['status'], rows[0]['reason']) == ('invalid', 'Denominador no positivo')
    assert (rows[1]['status'], rows[1]['y']) == ('valid', 2.5)
    assert [r['x'] for r in rows if r['status'] == 'valid'] == [2]  # CURRENT BEHAVIOR: x = row_index + 1
