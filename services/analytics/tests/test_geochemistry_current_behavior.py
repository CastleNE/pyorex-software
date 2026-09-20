"""CURRENT BEHAVIOR — characterization only.

Every test in this file freezes something the engine does TODAY that is odd, surprising or possibly wrong.
None of them is a statement that the behaviour is desirable, and none may be "fixed" during the Tool Registry
migration without an explicit, separate decision (then the test and the golden files are updated together).

Quirks living in the frontend renderer are frozen in
``apps/desktop/src/lib/build-geo-chart.characterization.test.ts``.
"""
import polars as pl
import pytest

from analysis.geochemistry.engine import calculate
from tests.geochem_characterization import DATASETS

OX_SHAND = {'Al2O3': 'Al2O3', 'CaO': 'CaO', 'Na2O': 'Na2O', 'K2O': 'K2O'}


def run(tool, dataset, columns, **options):
    return calculate(DATASETS[dataset](), {'tool': tool, 'columns': columns, **options})


def by_id(result):
    return {row['sample_id']: row for row in result['rows']}


# CURRENT BEHAVIOR — characterization only: assay-* treat FD/LD duplicates as QAQC controls and drop them.
@pytest.mark.parametrize('tool', ['assay-compare', 'assay-difference'])
def test_assay_tools_exclude_duplicates_unless_include_qaqc(tool):
    default = run(tool, 'paired', {'X': 'X', 'Y': 'Y'})
    assert default['quality'] == {'total': 8, 'used': 4, 'invalid': 1, 'excluded_qaqc': 3}
    assert [by_id(default)[s]['status'] for s in ('PR06', 'PR07', 'PR08')] == ['excluded'] * 3
    included = run(tool, 'paired', {'X': 'X', 'Y': 'Y'}, include_qaqc=True)
    assert included['quality'] == {'total': 8, 'used': 7, 'invalid': 1, 'excluded_qaqc': 0}


# CURRENT BEHAVIOR — characterization only: the X axis of ratio/anomaly tools is the table row number,
# counted over ALL rows (including excluded and invalid ones), not the rank among plotted samples.
@pytest.mark.parametrize('tool,columns', [
    ('fertility-sr-y', {'Sr': 'Sr', 'Y': 'Y'}),
    ('fertility-la-yb', {'La': 'La', 'Yb': 'Yb'}),
    ('fertility-dy-yb', {'Dy': 'Dy', 'Yb': 'Yb'}),
    ('element-ratios', {'numerator': 'Sr', 'denominator': 'Y'}),
])
def test_ratio_tools_use_row_index_plus_one_as_x(tool, columns):
    result = run(tool, 'ratios', columns)
    assert result['plot']['x_label'] == 'Orden de muestra'
    for row in result['rows']:
        if row['status'] == 'valid':
            assert row['x'] == row['row_index'] + 1
    valid = [r for r in result['rows'] if r['status'] == 'valid']
    assert by_id(result)['RT04']['status'] == 'excluded'                   # the QAQC control still consumes x = 4
    assert [r['x'] for r in valid] != list(range(1, len(valid) + 1))      # x is NOT the rank among plotted samples


def test_eu_ce_and_shand_family_use_row_index_plus_one_as_x_where_they_plot_against_order():
    eu = run('fertility-eu-eu', 'ree', {'Sm': 'Sm', 'Eu': 'Eu', 'Gd': 'Gd'})
    assert [r['x'] for r in eu['rows'] if r['status'] == 'valid'] == [1, 2, 3, 4, 6, 7, 10, 11]
    for tool, columns in (('a-cnk', OX_SHAND), ('a-nk', {'Al2O3': 'Al2O3', 'Na2O': 'Na2O', 'K2O': 'K2O'})):
        result = run(tool, 'oxides', columns)
        assert all(r['x'] == r['row_index'] + 1 for r in result['rows'] if r['status'] == 'valid')
        assert result['plot']['x_label'] == 'Orden de muestra'


# CURRENT BEHAVIOR — characterization only: 'a-cnk' also evaluates A/NK, so a row whose Na2O + K2O is zero is
# invalid for A/CNK even though A/CNK (CaO in the denominator) is computable. Found while writing Phase 1A.
def test_a_cnk_is_invalidated_by_a_zero_a_nk_denominator():
    row = by_id(run('a-cnk', 'oxides', OX_SHAND))['OX05']  # Na2O = K2O = 0, CaO = 8
    assert row['status'] == 'invalid' and row['reason'] == 'Denominador no positivo'
    shand = by_id(run('shand-index', 'oxides', OX_SHAND))['OX05']
    assert shand['status'] == 'invalid'  # the combined diagram genuinely needs both


# CURRENT BEHAVIOR — characterization only: QAPF is a projection of MODAL proportions, but the tool keeps the
# concentration-unit machinery (default 'pct'). A different concentration unit is accepted and, because the
# projection is scale invariant, changes nothing; 'raw' is rejected.
def test_qapf_keeps_concentration_unit_semantics():
    columns = {k: k for k in 'QAPF'}
    default = run('qapf', 'qapf', columns)
    assert default['pipeline']['units'] == {k: 'pct' for k in 'QAPF'}
    ppm = run('qapf', 'qapf', columns, units={k: 'ppm' for k in 'QAPF'})
    for a, b in zip(default['rows'], ppm['rows']):
        assert (a['status'], a['reason']) == (b['status'], b['reason'])
        assert b['x'] == (pytest.approx(a['x']) if a['x'] is not None else None)
        assert b['y'] == (pytest.approx(a['y']) if a['y'] is not None else None)
    with pytest.raises(ValueError, match='unidades de concentración'):
        run('qapf', 'qapf', columns, units={k: 'raw' for k in 'QAPF'})


# CURRENT BEHAVIOR — characterization only: the engine does not sort 'line' data; the ordering is a
# renderer responsibility (frozen in the frontend characterization tests).
def test_line_rows_keep_table_order_in_the_engine():
    df = pl.DataFrame({'X': [3., 1., 2.], 'Y': [30., 10., 20.]})
    result = calculate(df, {'tool': 'line', 'columns': {'X': 'X', 'Y': 'Y'}})
    assert [r['x'] for r in result['rows']] == [3., 1., 2.]
    assert result['plot']['kind'] == 'line'


# CURRENT BEHAVIOR — characterization only: histogram and boxplot do no statistics in Python. The engine
# echoes the value as both x and y; bins, quartiles and whiskers are computed later by Plotly.
@pytest.mark.parametrize('tool,kind', [('histogram', 'histogram'), ('boxplot', 'box')])
def test_histogram_and_boxplot_are_value_echoes_without_python_statistics(tool, kind):
    result = calculate(pl.DataFrame({'X': [1., 2., 4., 8.]}), {'tool': tool, 'columns': {'X': 'X'}})
    assert result['plot']['kind'] == kind
    assert [(r['x'], r['y']) for r in result['rows']] == [(1., 1.), (2., 2.), (4., 4.), (8., 8.)]
    assert not ({'bins', 'nbins', 'quartiles', 'whiskers', 'outliers'} & set(result['plot']))
    assert not ({'bins', 'quartiles', 'outliers'} & set(result['pipeline']))


# CURRENT BEHAVIOR — characterization only: tied values are ordered by table position when assigning normal scores.
def test_qq_ties_receive_different_quantiles_in_table_order():
    rows = by_id(run('qq-normal', 'distribution', {'X': 'X'}, group_column='G'))
    assert rows['DS03']['y'] == rows['DS04']['y'] == 2.
    assert rows['DS03']['x'] < rows['DS04']['x']


# CURRENT BEHAVIOR — characterization only: downhole rows that are not plotted (excluded control, missing hole id)
# still carry their measured depth in ``y``, and a missing hole id becomes the group labels 'None' / ''.
def test_downhole_unplotted_rows_keep_their_depth_and_odd_group_labels():
    rows = by_id(run('downhole', 'downhole', {'Depth': 'Depth', 'Value': 'Value'}, group_column='Hole'))
    assert (rows['DH10']['status'], rows['DH10']['y']) == ('excluded', 8.)
    assert (rows['DH07']['status'], rows['DH07']['y'], rows['DH07']['group']) == ('invalid', 6., 'None')
    assert (rows['DH08']['group'], rows['DH08']['y']) == ('', 7.)
    assert (rows['DH06']['y'], rows['DH09']['y']) == (None, None)  # negative / missing depth is dropped
    assert rows['DH03']['y'] == 2. and rows['DH03']['x'] is None   # a known depth with a missing assay stays


# CURRENT BEHAVIOR — characterization only: zeros. A zero numerator is a legitimate 0.0; a zero (or negative)
# denominator invalidates the row with 'Denominador no positivo'; anomaly denominators are products of square roots.
def test_zero_numerator_is_valid_and_zero_denominator_is_invalid():
    sr_y = by_id(run('fertility-sr-y', 'ratios', {'Sr': 'Sr', 'Y': 'Y'}))
    assert (sr_y['RT03']['status'], sr_y['RT03']['y']) == ('valid', 0.)
    assert (sr_y['RT02']['status'], sr_y['RT02']['reason']) == ('invalid', 'Denominador no positivo')
    eu = by_id(run('fertility-eu-eu', 'ree', {'Sm': 'Sm', 'Eu': 'Eu', 'Gd': 'Gd'}))
    assert (eu['RE06']['status'], eu['RE06']['y']) == ('valid', 0.)                       # Eu = 0
    assert (eu['RE05']['status'], eu['RE05']['reason']) == ('invalid', 'Denominador no positivo')  # Sm = 0
    ce = by_id(run('fertility-ce-ce', 'ree', {'La': 'La', 'Ce': 'Ce', 'Pr': 'Pr'}))
    assert (ce['RE11']['status'], ce['RE11']['reason']) == ('invalid', 'Denominador no positivo')  # Pr = 0


# CURRENT BEHAVIOR — characterization only: the validity of a row depends on WHICH inputs are mapped; an
# unmapped column is never inspected (e.g. a negative K2O does not invalidate the Fe-index).
def test_only_mapped_columns_decide_validity():
    fe = by_id(run('fe-index', 'oxides', {'SiO2': 'SiO2', 'MgO': 'MgO', 'FeTotal': 'FeT'}))
    assert fe['OX07']['status'] == 'valid'   # K2O = -1 is invisible to this tool
    assert fe['OX08']['status'] == 'invalid'  # SiO2 is mapped and missing


# CURRENT BEHAVIOR — characterization only: the spider tool forces a logarithmic Y scale in its plot metadata,
# and several kinds reject the log flags outright.
def test_log_flag_rules_by_kind():
    spider = run('ree-normalization', 'ree', {el: el for el in ('La', 'Ce', 'Yb')})
    assert spider['plot']['log_y'] is True and spider['pipeline']['log_y'] is False
    for tool, dataset, columns in (('ternary', 'ternary', {'A': 'A', 'B': 'B', 'C': 'C'}),
                                   ('qapf', 'qapf', {k: k for k in 'QAPF'}),
                                   ('histogram', 'distribution', {'X': 'X'}),
                                   ('boxplot', 'distribution', {'X': 'X'})):
        with pytest.raises(ValueError, match='define su propia escala'):
            run(tool, dataset, columns, log_x=True)


# CURRENT BEHAVIOR — characterization only: for four tools the catalog reference is also pushed into warnings.
@pytest.mark.parametrize('tool,dataset,columns', [
    ('tas', 'oxides', {'SiO2': 'SiO2', 'Na2O': 'Na2O', 'K2O': 'K2O'}),
    ('qapf', 'qapf', {k: k for k in 'QAPF'}),
    ('afm', 'oxides', {'Na2O': 'Na2O', 'K2O': 'K2O', 'MgO': 'MgO', 'FeTotal': 'FeT'}),
    ('k2o-sio2', 'oxides', {'SiO2': 'SiO2', 'K2O': 'K2O'}),
])
def test_reference_text_is_repeated_as_first_warning(tool, dataset, columns):
    result = run(tool, dataset, columns)
    assert result['warnings'][0] == result['reference']


# Limits enforced by the engine before any row is computed.
def test_size_limits_are_rejected_with_frozen_messages():
    too_many_groups = pl.DataFrame({'X': [float(i) for i in range(51)], 'G': [str(i) for i in range(51)]})
    with pytest.raises(ValueError, match='hasta 50 grupos'):
        calculate(too_many_groups, {'tool': 'histogram', 'columns': {'X': 'X'}, 'group_column': 'G'})
    fifty = too_many_groups.head(50)
    assert calculate(fifty, {'tool': 'histogram', 'columns': {'X': 'X'}, 'group_column': 'G'})['quality']['used'] == 50
    too_many_rows = pl.DataFrame({'X': [0.] * 100_001})
    with pytest.raises(ValueError, match='hasta 100 000 muestras'):
        calculate(too_many_rows, {'tool': 'histogram', 'columns': {'X': 'X'}})


def test_request_validation_messages():
    df = DATASETS['oxides']()
    for request, message in [
        ({'tool': 'nope', 'columns': {}}, 'Herramienta no disponible'),
        ({'tool': 'mali', 'columns': {'SiO2': 'SiO2'}}, 'Mapea todas las entradas'),
        ({'tool': 'mali', 'columns': {'SiO2': 'SiO2', 'Na2O': 'Na2O', 'K2O': 'K2O', 'CaO': 'Missing'}}, 'Columna desconocida'),
        ({'tool': 'mali', 'columns': {'SiO2': 'SiO2', 'Na2O': 'SiO2', 'K2O': 'K2O', 'CaO': 'CaO'}}, 'columna distinta'),
        ({'tool': 'ree-normalization', 'columns': {'La': 'SiO2'}}, 'al menos dos elementos'),
    ]:
        with pytest.raises(ValueError, match=message):
            calculate(df, request)


# CURRENT BEHAVIOR — characterization only: 'ternary' is a raw-unit tool, and raw tools normally accept negative
# values, but the engine special-cases the ternary (by tool id) and rejects negative components.
def test_ternary_rejects_negative_components_although_its_unit_is_raw():
    row = by_id(run('ternary', 'ternary', {'A': 'A', 'B': 'B', 'C': 'C'}))['TN04']  # A = -1
    assert (row['status'], row['reason']) == ('invalid', 'Concentración o componente negativo')
    scatter = calculate(pl.DataFrame({'X': [-1.], 'Y': [-2.]}), {'tool': 'scatter', 'columns': {'X': 'X', 'Y': 'Y'}})
    assert scatter['rows'][0]['status'] == 'valid'  # the generic raw tool accepts negatives
