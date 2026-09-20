"""Backend contract of the five pass-through tools (Phase 1A): scatter, line, assay-compare, histogram, boxplot.

The engine performs no numerical transformation for these tools beyond validation; the visual behaviour lives
in the renderer (see ``build-geo-chart.characterization.test.ts``). These tests check the pass-through and the
shared validation contract only. They do not assert any binning or quartile statistic: there is none in Python.
"""
import math

import polars as pl
import pytest

from analysis.geochemistry.engine import calculate


def frame(**columns):
    return pl.DataFrame({k: pl.Series(k, v, dtype=pl.Float64) for k, v in columns.items()})


XY = frame(X=[1., 0., -2.5, 4., None, math.nan, 7.], Y=[10., 20., -30., 0., 5., 6., math.inf])


@pytest.mark.parametrize('tool,kind', [('scatter', 'scatter'), ('line', 'line'), ('assay-compare', 'assay')])
def test_xy_passthrough_tools_return_x_and_y_unchanged(tool, kind):
    result = calculate(XY, {'tool': tool, 'columns': {'X': 'X', 'Y': 'Y'}})
    assert result['plot']['kind'] == kind
    assert [(r['status'], r['x'], r['y']) for r in result['rows']] == [
        ('valid', 1., 10.), ('valid', 0., 20.), ('valid', -2.5, -30.), ('valid', 4., 0.),
        ('invalid', None, None), ('invalid', None, None), ('invalid', None, None)]
    assert result['quality'] == {'total': 7, 'used': 4, 'invalid': 3, 'excluded_qaqc': 0}
    assert (result['plot']['x_label'], result['plot']['y_label']) == ('X', 'Y')
    assert result['pipeline']['units'] == {'X': 'raw', 'Y': 'raw'}  # raw: no unit conversion is applied


def test_axis_labels_follow_the_mapped_columns():
    df = frame(a=[1., 2.], b=[3., 4.])
    for tool in ('scatter', 'line', 'assay-compare'):
        plot = calculate(df, {'tool': tool, 'columns': {'X': 'a', 'Y': 'b'}})['plot']
        assert (plot['x_label'], plot['y_label']) == ('a', 'b')


@pytest.mark.parametrize('tool', ['scatter', 'line', 'assay-compare'])
def test_log_axes_invalidate_non_positive_values(tool):
    result = calculate(XY, {'tool': tool, 'columns': {'X': 'X', 'Y': 'Y'}, 'log_x': True})
    assert [r['status'] for r in result['rows']][:4] == ['valid', 'invalid', 'invalid', 'valid']
    assert result['rows'][1]['reason'] == 'Escala logarítmica requiere valores positivos'
    assert result['plot']['log_x'] is True and result['plot']['log_y'] is False


@pytest.mark.parametrize('tool,kind', [('histogram', 'histogram'), ('boxplot', 'box')])
def test_univariate_tools_return_the_value_and_a_frequency_label(tool, kind):
    df = frame(X=[3., None, -1., 2.5])
    result = calculate(df, {'tool': tool, 'columns': {'X': 'X'}})
    assert result['plot']['kind'] == kind
    assert result['plot']['y_label'] == 'Frecuencia'  # label only: no frequency is computed here
    assert [(r['status'], r['x']) for r in result['rows']] == [('valid', 3.), ('invalid', None), ('valid', -1.), ('valid', 2.5)]


def test_groups_sizes_and_colors_are_carried_without_changing_x_y():
    df = frame(X=[1., 2.], Y=[3., 4.], S=[10., None], C=[5., 6.]).with_columns(pl.Series('G', ['a', 'b']))
    result = calculate(df, {'tool': 'scatter', 'columns': {'X': 'X', 'Y': 'Y'}, 'group_column': 'G',
                            'size_column': 'S', 'color_column': 'C', 'label_column': 'G'})
    assert [(r['group'], r['sample_id'], r['x'], r['y'], r['size_value'], r['color_value']) for r in result['rows']] == [
        ('a', 'a', 1., 3., 10., 5.), ('b', 'b', 2., 4., None, 6.)]


@pytest.mark.parametrize('tool', ['scatter', 'line', 'assay-compare', 'histogram', 'boxplot'])
def test_qaqc_controls_are_excluded_by_default_and_included_on_request(tool):
    columns = {'X': 'X', 'Y': 'Y'} if tool in ('scatter', 'line', 'assay-compare') else {'X': 'X'}
    df = frame(X=[1., 2., 3.], Y=[1., 2., 3.]).with_columns(pl.Series('__sample_type__', ['S', 'CRM', 'FD']))
    default = calculate(df, {'tool': tool, 'columns': columns})
    assert default['quality'] == {'total': 3, 'used': 1, 'invalid': 0, 'excluded_qaqc': 2}
    included = calculate(df, {'tool': tool, 'columns': columns, 'include_qaqc': True})
    assert included['quality']['used'] == 3
    assert 'Controles QAQC incluidos por solicitud explícita.' in included['warnings']
