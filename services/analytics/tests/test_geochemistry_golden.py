"""Golden characterization of the 26 numerically-transforming geochemistry tools (Phase 1A).

These tests do NOT say the frozen behaviour is right; they say it must not change silently while the
engine is refactored into a Tool Registry. Correctness of the formulas is asserted independently in
``test_geochemistry_formulas_independent.py``. Quirks are listed in ``test_geochemistry_current_behavior.py``.

Floats are compared with an explicit tolerance (rel 1e-9, abs 1e-12). Everything else must match exactly,
including the Spanish ``reason`` strings, warnings, formula and reference text and the ``plot`` metadata.
"""
import json

import pytest

from tests.geochem_characterization import (
    GOLDEN_DIR, GOLDEN_TOOLS, ROW_FIELDS, SCENARIOS, load_golden, run_scenario,
)

# The 26 tools approved for numeric golden coverage (Phase 0, list I). Typed here, not derived, so a tool
# silently dropped from the fixtures cannot shrink the coverage.
EXPECTED_TOOLS = sorted([
    'qq-normal', 'probability', 'ecdf', 'assay-difference', 'downhole', 'downhole-compare', 'ternary', 'afm',
    'qapf', 'tas', 'harker', 'k2o-sio2', 'mali', 'fe-index', 'shand-index', 'a-cnk', 'a-nk', 'ree-normalization',
    'primitive-mantle', 'element-ratios', 'fertility-sr-y', 'fertility-la-yb', 'fertility-dy-yb',
    'fertility-eu-eu', 'fertility-ce-ce', 'alteration',
])
REL, ABS = 1e-9, 1e-12


def assert_matches(actual, expected, path='$'):
    if expected is None or actual is None:
        assert actual is expected, f'{path}: {actual!r} != {expected!r}'
    elif isinstance(expected, bool) or isinstance(actual, bool):
        assert actual is expected, f'{path}: {actual!r} != {expected!r}'
    elif isinstance(expected, (int, float)) and isinstance(actual, (int, float)):
        assert actual == pytest.approx(expected, rel=REL, abs=ABS), f'{path}: {actual!r} != {expected!r}'
    elif isinstance(expected, dict):
        assert isinstance(actual, dict) and set(actual) == set(expected), f'{path}: keys {sorted(actual)} != {sorted(expected)}'
        for key in expected:
            assert_matches(actual[key], expected[key], f'{path}.{key}')
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(actual) == len(expected), f'{path}: length differs'
        for i, (a, e) in enumerate(zip(actual, expected)):
            assert_matches(a, e, f'{path}[{i}]')
    else:
        assert actual == expected, f'{path}: {actual!r} != {expected!r}'


def test_golden_covers_exactly_the_26_approved_tools():
    assert GOLDEN_TOOLS == EXPECTED_TOOLS
    assert len(EXPECTED_TOOLS) == 26
    assert sorted(p.stem for p in GOLDEN_DIR.glob('*.json')) == EXPECTED_TOOLS


def test_golden_files_and_scenarios_are_in_sync():
    declared = {}
    for scenario in SCENARIOS:
        declared.setdefault(scenario.tool, set()).add(scenario.name)
    for tool in EXPECTED_TOOLS:
        assert set(load_golden(tool)) == declared[tool], f'stale or missing golden scenarios for {tool}'


@pytest.mark.parametrize('scenario', SCENARIOS, ids=lambda s: s.id)
def test_engine_output_matches_frozen_golden(scenario):
    assert_matches(run_scenario(scenario), load_golden(scenario.tool)[scenario.name])


@pytest.mark.parametrize('scenario', SCENARIOS, ids=lambda s: s.id)
def test_scenarios_are_deterministic(scenario):
    assert run_scenario(scenario) == run_scenario(scenario)


def test_projection_excludes_accidental_fields():
    frozen = load_golden('mali')['default']
    assert 'created_at' not in json.dumps(frozen)
    assert set(frozen['rows'][0]) == set(ROW_FIELDS)
    assert set(frozen) == {'tool', 'title', 'rows', 'quality', 'warnings', 'formula', 'reference', 'plot', 'pipeline'}


def test_every_golden_scenario_exercises_more_than_one_outcome():
    """A golden made only of valid rows would not protect the invalid-row rules.

    The only single-outcome scenarios are the deliberate unit-conversion checks (all rows valid, ppb input)."""
    single_outcome = []
    rejected = []
    for scenario in SCENARIOS:
        frozen = load_golden(scenario.tool)[scenario.name]
        if 'error' in frozen:
            rejected.append(scenario.id)
        elif len({row['status'] for row in frozen['rows']}) <= 1:
            single_outcome.append(scenario.id)
    assert single_outcome == ['ree-normalization::all_ppb', 'fertility-eu-eu::all_ppb', 'fertility-ce-ce::all_ppb']
    assert rejected == ['downhole::without_hole_id_column', 'ternary::units_mismatch', 'qapf::units_raw']
