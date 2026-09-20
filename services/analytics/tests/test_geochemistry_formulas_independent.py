"""Independent validation of the geochemistry formulas (Phase 1A).

The golden files characterize what the engine does. THESE tests validate the mathematics: every expected
value is computed here from the raw fixture rows with formulas written separately from ``engine.py``
(different operation order, no ``MOLAR``/``reference_values`` imports; reference constants are read straight
from the CSV files). If a golden and one of these disagree, the golden is frozen behaviour and this file is
the reference for what the formula should give.

Validity rules mirrored here (they are the rules the catalog and the existing tests describe):
  * QAQC control types are excluded unless ``include_qaqc``;
  * missing, NaN/inf and censored (``_nulltype_<col>``) values make a row invalid, never imputed;
  * concentration tools reject negative inputs; raw-unit tools accept them;
  * a ratio needs a strictly positive denominator (zero numerators are allowed).
"""
import csv
import math
from pathlib import Path
from statistics import NormalDist

import pytest

from analysis.geochemistry.engine import calculate
from tests.geochem_characterization import CHONDRITE, DATASETS

REFERENCES = Path(__file__).resolve().parents[1] / 'analysis' / 'geochemistry' / 'references'
QAQC = {'FB', 'LB', 'QB', 'FD', 'LD', 'QD', 'CRM', 'STD'}
CENSORED = {'BELOW_LOD', 'MISSING', 'NOT_ANALYZED'}
FE2O3_TO_FEO = 0.8998
# Molar masses (g/mol) of the oxides in the A/CNK and A/NK indices, typed here on purpose.
M_AL2O3, M_CAO, M_NA2O, M_K2O = 101.9613, 56.0774, 61.9789, 94.196
TO_WT = {'pct': 1., 'ppm': 1e-4, 'ppb': 1e-7}
TO_PPM = {'pct': 1e4, 'ppm': 1., 'ppb': 1e-3}


def read_reference(name):
    with (REFERENCES / f'{name}.csv').open(encoding='utf-8-sig') as source:
        return {r['var']: float(r['value']) for r in csv.DictReader(source) if r['units'] == 'ppm' and r['value']}


def div(numerator, denominator):
    if denominator <= 0:
        raise ValueError('non-positive denominator')
    return numerator / denominator


def _finite(value):
    return None if value is None or not math.isfinite(value) else float(value)


def _prepare(row, columns, units, target, nonneg, include_qaqc):
    """('excluded'|'invalid'|'ok', {input_key: value in target units})."""
    if not include_qaqc and str(row.get('__sample_type__') or '').upper() in QAQC:
        return 'excluded', None
    values = {}
    for key, column in columns.items():
        raw = _finite(row[column])
        if raw is None or row.get(f'_nulltype_{column}') in CENSORED:
            return 'invalid', None
        if target != 'raw':
            raw *= (TO_WT if target == 'wt' else TO_PPM)[units.get(key, 'pct' if target == 'wt' else 'ppm')]
        if nonneg and raw < 0:
            return 'invalid', None
        values[key] = raw
    return 'ok', values


def check(tool, dataset, columns, formula, *, target='wt', nonneg=True, options=None):
    """Compare every engine row with ``formula(values, row_index) -> {'x':..,'y':..,'z':..}`` computed here."""
    options = options or {}
    df = DATASETS[dataset]()
    result = calculate(df, {'tool': tool, 'columns': columns, **options})
    valid = 0
    for index, (row, out) in enumerate(zip(df.iter_rows(named=True), result['rows'])):
        state, values = _prepare(row, columns, options.get('units', {}), target, nonneg, options.get('include_qaqc', False))
        expected = None
        if state == 'ok':
            try:
                expected = formula(values, index)
            except ValueError:
                state = 'invalid'
        label = f"{tool}:{row['sample_id']}"
        if state == 'excluded':
            assert out['status'] == 'excluded', label
        elif state == 'invalid':
            assert out['status'] == 'invalid', label
        else:
            assert out['status'] == 'valid', label
            for axis, value in expected.items():
                assert out[axis] == pytest.approx(value, rel=1e-9, abs=1e-12), f'{label}.{axis}'
            valid += 1
    assert valid > 0, f'{tool}: fixture produced no valid rows'
    return valid


def fe_oxide(fe_total, basis):
    return fe_total * (FE2O3_TO_FEO if basis == 'Fe2O3T' else 1.)


OX_TAS = {'SiO2': 'SiO2', 'Na2O': 'Na2O', 'K2O': 'K2O'}
OX_SHAND = {'Al2O3': 'Al2O3', 'CaO': 'CaO', 'Na2O': 'Na2O', 'K2O': 'K2O'}
OX_FE = {'SiO2': 'SiO2', 'MgO': 'MgO', 'FeTotal': 'FeT'}
OX_ALT = {'MgO': 'MgO', 'K2O': 'K2O', 'Na2O': 'Na2O', 'CaO': 'CaO', 'FeTotal': 'FeT'}
OX_AFM = {'Na2O': 'Na2O', 'K2O': 'K2O', 'MgO': 'MgO', 'FeTotal': 'FeT'}
MIXED = {'units': {'Na2O': 'ppm', 'K2O': 'ppb'}}


# ── oxide indices ────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize('dataset,options', [('oxides', {}), ('oxides_mixed_units', MIXED)])
def test_mali_is_na2o_plus_k2o_minus_cao(dataset, options):
    check('mali', dataset, {'SiO2': 'SiO2', 'Na2O': 'Na2O', 'K2O': 'K2O', 'CaO': 'CaO'},
          lambda v, i: {'x': v['SiO2'], 'y': v['Na2O'] + v['K2O'] - v['CaO']}, options=options)


@pytest.mark.parametrize('basis', ['FeOT', 'Fe2O3T'])
def test_fe_index_is_feot_over_feot_plus_mgo(basis):
    check('fe-index', 'oxides', OX_FE,
          lambda v, i: {'x': v['SiO2'], 'y': div(fe_oxide(v['FeTotal'], basis), fe_oxide(v['FeTotal'], basis) + v['MgO'])},
          options={'iron_basis': basis})


def _acnk(v):
    return div(v['Al2O3'] / M_AL2O3, v['CaO'] / M_CAO + v['Na2O'] / M_NA2O + v['K2O'] / M_K2O)


def _ank(v):
    return div(v['Al2O3'] / M_AL2O3, v['Na2O'] / M_NA2O + v['K2O'] / M_K2O)


@pytest.mark.parametrize('dataset,options', [('oxides', {}), ('oxides_mixed_units', MIXED)])
def test_shand_index_is_molar_acnk_versus_ank(dataset, options):
    check('shand-index', dataset, OX_SHAND, lambda v, i: {'x': _acnk(v), 'y': _ank(v)}, options=options)


def test_a_cnk_and_a_nk_molar_formulas():
    """x = row_index + 1 is CURRENT BEHAVIOR (see test_geochemistry_current_behavior.py).

    CURRENT BEHAVIOR — characterization only: the engine evaluates A/NK as well as A/CNK for the A/CNK tool, so a
    row with Na2O + K2O = 0 is rejected even though A/CNK alone is computable. The expectation below mirrors that
    coupling on purpose (``_ank`` is evaluated first); it is not a statement that the coupling is desirable."""
    check('a-cnk', 'oxides', OX_SHAND, lambda v, i: {'x': i + 1, 'y': (_ank(v), _acnk(v))[1]})
    check('a-nk', 'oxides', {'Al2O3': 'Al2O3', 'Na2O': 'Na2O', 'K2O': 'K2O'}, lambda v, i: {'x': i + 1, 'y': _ank(v)})


def test_shand_reference_point_from_molar_masses():
    """One mole of each oxide gives A/CNK = 1/3 and A/NK = 1/2 (also asserted in the existing suite)."""
    assert _acnk({'Al2O3': M_AL2O3, 'CaO': M_CAO, 'Na2O': M_NA2O, 'K2O': M_K2O}) == pytest.approx(1 / 3)
    assert _ank({'Al2O3': M_AL2O3, 'Na2O': M_NA2O, 'K2O': M_K2O}) == pytest.approx(1 / 2)


@pytest.mark.parametrize('basis', ['FeOT', 'Fe2O3T'])
def test_alteration_index_and_ccpi(basis):
    def formula(v, i):
        fe = fe_oxide(v['FeTotal'], basis)
        return {'x': 100 * div(v['MgO'] + v['K2O'], v['MgO'] + v['K2O'] + v['Na2O'] + v['CaO']),
                'y': 100 * div(v['MgO'] + fe, v['MgO'] + fe + v['Na2O'] + v['K2O'])}
    check('alteration', 'oxides', OX_ALT, formula, options={'iron_basis': basis})


def test_harker_and_k2o_sio2_pass_oxide_values_in_weight_percent():
    check('harker', 'oxides', {'SiO2': 'SiO2', 'Oxide': 'MgO'}, lambda v, i: {'x': v['SiO2'], 'y': v['Oxide']})
    check('harker', 'oxides_mixed_units', {'SiO2': 'SiO2', 'Oxide': 'K2O'}, lambda v, i: {'x': v['SiO2'], 'y': v['Oxide']},
          options={'units': {'Oxide': 'ppb'}})
    check('k2o-sio2', 'oxides', {'SiO2': 'SiO2', 'K2O': 'K2O'}, lambda v, i: {'x': v['SiO2'], 'y': v['K2O']})


def test_tas_coordinates_and_unambiguous_classifications():
    def formula(v, i):
        if v['SiO2'] + v['Na2O'] + v['K2O'] > 100:
            raise ValueError
        return {'x': v['SiO2'], 'y': v['Na2O'] + v['K2O']}
    check('tas', 'oxides', OX_TAS, formula)
    check('tas', 'oxides_mixed_units', OX_TAS, formula, options=MIXED)
    rows = {r['sample_id']: r for r in calculate(DATASETS['oxides'](), {'tool': 'tas', 'columns': OX_TAS})['rows']}
    # Same three classes the existing suite asserts (Le Maitre TAS fields): basalt, andesite, rhyolite.
    assert [rows[s]['classification'] for s in ('OX01', 'OX02', 'OX03')] == ['Basalt', 'Andesite', 'Rhyolite']
    assert rows['OX04']['classification'].startswith('Boundary:')


# ── compositional projections ────────────────────────────────────────────────────────────────
def test_ternary_closure_to_100():
    check('ternary', 'ternary', {'A': 'A', 'B': 'B', 'C': 'C'}, lambda v, i: {
        'x': 100 * div(v['A'], v['A'] + v['B'] + v['C']), 'y': 100 * div(v['B'], v['A'] + v['B'] + v['C']),
        'z': 100 * div(v['C'], v['A'] + v['B'] + v['C'])}, target='raw', nonneg=True)  # the ternary rejects negatives even in raw units


@pytest.mark.parametrize('basis', ['FeOT', 'Fe2O3T'])
def test_afm_closure_of_alkalis_iron_and_magnesium(basis):
    def formula(v, i):
        a, f, m = v['Na2O'] + v['K2O'], fe_oxide(v['FeTotal'], basis), v['MgO']
        return {'x': 100 * div(a, a + f + m), 'y': 100 * div(f, a + f + m), 'z': 100 * div(m, a + f + m)}
    check('afm', 'oxides', OX_AFM, formula, options={'iron_basis': basis})


def test_qapf_projection_geometry():
    def formula(v, i):
        q, a, p, f = v['Q'], v['A'], v['P'], v['F']
        if q > 0 and f > 0:
            raise ValueError
        total = q + a + p + f
        return {'x': div(p + .5 * (q + f), total), 'y': div(math.sqrt(3) / 2 * (q - f), total)}
    columns = {k: k for k in 'QAPF'}
    check('qapf', 'qapf', columns, formula)
    check('qapf', 'qapf', columns, formula, options={'units': {k: 'ppm' for k in 'QAPF'}})


# ── ratios and anomalies ─────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize('tool,num,den', [('fertility-sr-y', 'Sr', 'Y'), ('fertility-la-yb', 'La', 'Yb'), ('fertility-dy-yb', 'Dy', 'Yb')])
def test_fertility_ratios_are_numerator_over_denominator(tool, num, den):
    """x = row_index + 1 is CURRENT BEHAVIOR (see test_geochemistry_current_behavior.py)."""
    check(tool, 'ratios', {num: num, den: den}, lambda v, i: {'x': i + 1, 'y': div(v[num], v[den])}, target='ppm')


def test_element_ratio_converts_both_terms_to_ppm_first():
    columns = {'numerator': 'Sr', 'denominator': 'Y'}
    check('element-ratios', 'ratios', columns, lambda v, i: {'x': i + 1, 'y': div(v['numerator'], v['denominator'])}, target='ppm')
    check('element-ratios', 'ratios_mixed_units', columns, lambda v, i: {'x': i + 1, 'y': div(v['numerator'], v['denominator'])},
          target='ppm', options={'units': {'numerator': 'ppb', 'denominator': 'ppm'}})


def test_chondrite_fixture_copy_matches_the_csv():
    csv_values = read_reference('chondrite')
    assert {el: csv_values[el] for el in CHONDRITE} == CHONDRITE


def test_eu_and_ce_anomalies_use_geometric_neighbours_of_chondrite_normalized_values():
    ch = read_reference('chondrite')
    n = lambda v, el: v[el] / ch[el]  # noqa: E731
    check('fertility-eu-eu', 'ree', {'Sm': 'Sm', 'Eu': 'Eu', 'Gd': 'Gd'}, target='ppm', formula=lambda v, i: {
        'x': i + 1, 'y': div(n(v, 'Eu'), math.sqrt(n(v, 'Sm') * n(v, 'Gd')))})
    check('fertility-ce-ce', 'ree', {'La': 'La', 'Ce': 'Ce', 'Pr': 'Pr'}, target='ppm', formula=lambda v, i: {
        'x': i + 1, 'y': div(n(v, 'Ce'), math.sqrt(n(v, 'La') * n(v, 'Pr')))})
    # Same anomalies from ppb inputs (units converted before normalization).
    for tool, keys in (('fertility-eu-eu', ('Sm', 'Eu', 'Gd')), ('fertility-ce-ce', ('La', 'Ce', 'Pr'))):
        rows = calculate(DATASETS['ree_ppb'](), {'tool': tool, 'columns': {k: k for k in keys}, 'units': {k: 'ppb' for k in keys}})['rows']
        assert [r['y'] for r in rows] == pytest.approx([1., 1., .5] if tool == 'fertility-eu-eu' else [1., 1., 1.])


def test_known_anomaly_values():
    rows = {r['sample_id']: r for r in calculate(DATASETS['ree'](), {'tool': 'fertility-eu-eu', 'columns': {k: k for k in ('Sm', 'Eu', 'Gd')}})['rows']}
    assert rows['RE01']['y'] == pytest.approx(1.) and rows['RE03']['y'] == pytest.approx(.5)
    ce = {r['sample_id']: r for r in calculate(DATASETS['ree'](), {'tool': 'fertility-ce-ce', 'columns': {k: k for k in ('La', 'Ce', 'Pr')}})['rows']}
    assert ce['RE04']['y'] == pytest.approx(2.)


# ── reference normalization ──────────────────────────────────────────────────────────────────
@pytest.mark.parametrize('tool,dataset,reference,elements', [
    ('ree-normalization', 'ree', 'chondrite', list(CHONDRITE)),
    ('primitive-mantle', 'traces', 'primitive_mantle', None),
])
def test_normalization_divides_by_the_reference_and_drops_non_positive_values(tool, dataset, reference, elements):
    from tests.geochem_characterization import TRACE
    elements = elements or TRACE
    ref = read_reference(reference)
    df = DATASETS[dataset]()
    result = calculate(df, {'tool': tool, 'columns': {el: el for el in elements}})
    assert result['plot']['elements'] == elements
    checked = 0
    for row, out in zip(df.iter_rows(named=True), result['rows']):
        if str(row['__sample_type__']) in QAQC:
            assert out['status'] == 'excluded'
            continue
        normalized = []
        for el in elements:
            v = _finite(row[el])
            censored = row.get(f'_nulltype_{el}') in CENSORED
            normalized.append(None if v is None or censored or v <= 0 else v / ref[el])
        if sum(n is not None for n in normalized) < 2:
            assert out['status'] == 'invalid'
            continue
        assert out['status'] == 'valid'
        assert out['values'] == pytest.approx(normalized, nan_ok=True, rel=1e-9)
        checked += 1
    assert checked >= 2


# ── distributions ────────────────────────────────────────────────────────────────────────────
def _groups(df, grouped):
    groups = {}
    for i, row in enumerate(df.iter_rows(named=True)):
        state, values = _prepare(row, {'X': 'X'}, {}, 'raw', False, False)
        if state == 'ok':
            groups.setdefault(row['G'] if grouped else 'Muestras', []).append((i, values['X']))
    return groups


@pytest.mark.parametrize('grouped', [False, True])
def test_ecdf_is_rank_max_over_n_in_percent(grouped):
    df = DATASETS['distribution']()
    out = calculate(df, {'tool': 'ecdf', 'columns': {'X': 'X'}, **({'group_column': 'G'} if grouped else {})})['rows']
    for members in _groups(df, grouped).values():
        for i, value in members:
            assert out[i]['y'] == pytest.approx(100 * sum(v <= value for _, v in members) / len(members))
            assert out[i]['x'] == value


@pytest.mark.parametrize('grouped', [False, True])
def test_qq_and_probability_use_normal_quantiles_of_i_minus_half_over_n(grouped):
    df = DATASETS['distribution']()
    options = {'group_column': 'G'} if grouped else {}
    qq = calculate(df, {'tool': 'qq-normal', 'columns': {'X': 'X'}, **options})['rows']
    prob = calculate(df, {'tool': 'probability', 'columns': {'X': 'X'}, **options})['rows']
    for members in _groups(df, grouped).values():
        ordered = sorted(members, key=lambda item: item[1])  # stable: ties keep table order (CURRENT BEHAVIOR)
        for rank, (i, value) in enumerate(ordered, start=1):
            z = NormalDist().inv_cdf((rank - .5) / len(ordered))
            assert (qq[i]['x'], qq[i]['y']) == (pytest.approx(z, abs=1e-7), value)
            assert (prob[i]['x'], prob[i]['y']) == (value, pytest.approx(z, abs=1e-7))


# ── paired assays and profiles ───────────────────────────────────────────────────────────────
@pytest.mark.parametrize('options', [{}, {'include_qaqc': True}])
def test_assay_difference_is_mean_and_y_minus_x(options):
    check('assay-difference', 'paired', {'X': 'X', 'Y': 'Y'},
          lambda v, i: {'x': (v['X'] + v['Y']) / 2, 'y': v['Y'] - v['X']}, target='raw', nonneg=False, options=options)


def test_downhole_maps_value_to_x_and_depth_to_y_and_rejects_bad_depth_or_hole():
    df = DATASETS['downhole']()
    for tool, columns, xkey in (('downhole', {'Depth': 'Depth', 'Value': 'Value'}, 'Value'),
                                ('downhole-compare', {'Depth': 'Depth', 'Assay1': 'Assay1', 'Assay2': 'Assay2'}, 'Assay1')):
        out = calculate(df, {'tool': tool, 'columns': columns, 'group_column': 'Hole'})['rows']
        for row, r in zip(df.iter_rows(named=True), out):
            hole_ok = row['Hole'] is not None and str(row['Hole']).strip() != ''
            depth, xval = _finite(row['Depth']), _finite(row[xkey])
            if row['__sample_type__'] == 'CRM':
                assert r['status'] == 'excluded'
            elif not hole_ok or depth is None or depth < 0 or xval is None:
                assert r['status'] == 'invalid', row['sample_id']
            else:
                assert r['status'] == 'valid' and (r['x'], r['y']) == (xval, depth)
                if tool == 'downhole-compare':
                    assert r['z'] == row['Assay2']


# ── unit equivalence ─────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize('tool,columns,mixed,base', [
    ('tas', OX_TAS, 'oxides_mixed_units', 'oxides'),
    ('mali', {'SiO2': 'SiO2', 'Na2O': 'Na2O', 'K2O': 'K2O', 'CaO': 'CaO'}, 'oxides_mixed_units', 'oxides'),
    ('shand-index', OX_SHAND, 'oxides_mixed_units', 'oxides'),
])
def test_same_rock_in_mixed_units_gives_the_same_result(tool, columns, mixed, base):
    a = calculate(DATASETS[base](), {'tool': tool, 'columns': columns})['rows']
    b = calculate(DATASETS[mixed](), {'tool': tool, 'columns': columns, **MIXED})['rows']
    for ra, rb in zip(a, b):
        assert (ra['status'], ra['classification']) == (rb['status'], rb['classification'])
        for axis in 'xy':
            assert rb[axis] == pytest.approx(ra[axis], rel=1e-9, abs=1e-12) if ra[axis] is not None else rb[axis] is None
