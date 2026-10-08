"""Diagram Builder (Phase 4): user diagrams with free axis expressions, evaluated safely in Python."""
import asyncio
import json
from pathlib import Path

import polars as pl
import pytest
from pydantic import ValidationError

from analysis.data.formula import FormulaError
from analysis.geochemistry.custom_diagram import calculate_custom, evaluate, parse_expression, preview
from analysis.geochemistry.engine import calculate

ROOT = Path(__file__).resolve().parents[3]
DF = pl.DataFrame({
    'Sample': ['a', 'b', 'c', 'd', 'e'],
    'Sr': [400.0, 800.0, 0.0, None, 600.0],
    'Y': [10.0, 20.0, 0.0, 5.0, 30.0],
    'Cu ppm': [50, 100, 150, 200, 250],
    'La': [20.0, 30.0, 40.0, 50.0, 60.0],
    'Yb': [2.0, 1.0, 0.5, 0.0, 3.0],
    'Lith': ['x', 'y', 'x', 'y', 'x'],
    '_nulltype_La': [None, None, None, None, 'BELOW_LOD'],
})


def diagram(**over):
    return {'id': 'd1', 'name': 'Sr/Y vs Y', 'x': 'Y', 'y': 'Sr/Y', **over}


def test_expressions_resolve_columns_including_bracketed_names():
    assert parse_expression('Sr/Y').columns == ['Sr', 'Y']
    assert parse_expression('[Cu ppm]/10000 + log10(La)').columns == ['Cu ppm', 'La']
    assert evaluate(DF, parse_expression('[Cu ppm] / 50'))[0] == [1.0, 2.0, 3.0, 4.0, 5.0]


@pytest.mark.parametrize('bad, message', [
    ('Sr.__class__', 'Expresión no permitida'), ('__import__("os")', 'Función no permitida'), ('open("x")', 'Función no permitida'),
    ('Sr/', 'Sintaxis inválida'), ('[Cu ppm', 'Sintaxis inválida'), ('Nope/Y', 'Columna desconocida: Nope'), ('2+3', 'no usa ninguna columna'),
    ('', 'vacía'),
])
def test_unsafe_or_wrong_expressions_are_rejected_with_a_spanish_reason(bad, message):
    with pytest.raises(FormulaError, match=message):
        parse_expression(bad, list(DF.columns))


def test_missing_censored_and_non_finite_values_are_reported_not_imputed():
    values, reasons = evaluate(DF, parse_expression('La/Yb'))
    assert values[:3] == [10.0, 30.0, 80.0]
    assert values[3] is None and 'no finito' in reasons[3]          # La / 0
    assert values[4] is None and 'censurado' in reasons[4]          # La below LOD
    with pytest.raises(FormulaError, match='no es numérica'):
        evaluate(DF, parse_expression('Lith*2'))


def test_xy_diagram_classifies_with_user_fields_and_keeps_the_engine_contract():
    fields = [{'id': 'A', 'name': 'Adakítico', 'points': [[0, 20], [20, 20], [20, 200], [0, 200]]}]
    r = calculate(DF, {'tool': 'custom-diagram', 'columns': {}, 'label_column': 'Sample', 'diagram': diagram(fields=fields, reference='Ejemplo')})
    assert [(x['sample_id'], x['status'], x['classification']) for x in r['rows']] == [
        ('a', 'valid', 'Adakítico'), ('b', 'valid', 'Límite: Adakítico'), ('c', 'invalid', None), ('d', 'invalid', None), ('e', 'valid', 'Fuera de los campos')]
    assert r['quality'] == {'total': 5, 'used': 3, 'invalid': 2, 'excluded_qaqc': 0}
    assert r['plot']['kind'] == 'scatter' and r['plot']['x_label'] == 'Y' and r['plot']['fields'][0] == {'id': 'Adakítico', 'name': 'Adakítico', 'points': [[0.0, 20.0], [20.0, 20.0], [20.0, 200.0], [0.0, 200.0]]}
    assert r['pipeline']['diagram']['x'] == 'Y' and r['pipeline']['expression_columns'] == ['Sr', 'Y']
    assert set(r) == {'tool', 'title', 'rows', 'plot', 'quality', 'warnings', 'formula', 'reference', 'pipeline', 'created_at'}
    json.dumps(r, allow_nan=False)


def test_ternary_normalises_to_100_and_log_axes_need_positive_values():
    t = calculate(DF, {'tool': 'custom-diagram', 'columns': {}, 'diagram': diagram(kind='ternary', x='La', y='Yb*10', z='Y')})
    first = t['rows'][0]
    assert t['plot']['kind'] == 'ternary' and abs(first['x'] + first['y'] + first['z'] - 100) < 1e-9
    with pytest.raises(ValueError, match='tres expresiones'):
        calculate(DF, {'tool': 'custom-diagram', 'columns': {}, 'diagram': diagram(kind='ternary')})
    r = calculate(DF, {'tool': 'custom-diagram', 'columns': {}, 'log_y': True, 'diagram': diagram(y='Sr - 500')})
    assert [x['status'] for x in r['rows']] == ['invalid', 'valid', 'invalid', 'invalid', 'valid']


def test_definition_is_required_only_for_custom_diagrams_and_is_validated():
    with pytest.raises(ValueError, match='Falta la definición'):
        calculate(DF, {'tool': 'custom-diagram', 'columns': {}})
    with pytest.raises(ValueError, match='solo aplica'):
        calculate(DF, {'tool': 'scatter', 'columns': {'X': 'Sr', 'Y': 'Y'}, 'diagram': diagram()})
    with pytest.raises(ValidationError):
        calculate(DF, {'tool': 'custom-diagram', 'columns': {}, 'diagram': diagram(fields=[{'id': 'A', 'name': 'A', 'points': [[0, 0], [1, 1]]}])})
    with pytest.raises(ValidationError):
        calculate(DF, {'tool': 'custom-diagram', 'columns': {}, 'diagram': {**diagram(), 'code': 'x'}})


def test_preview_reports_each_axis():
    out = preview(DF, {'x': 'Sr/Y', 'y': 'La/Yb', 'z': 'nope'})
    assert out['axes']['x'] == {'ok': True, 'error': None, 'columns': ['Sr', 'Y'], 'n_valid': 3, 'n_invalid': 2, 'min': 20.0, 'max': 40.0, 'sample': [40.0, 40.0, 20.0]}
    assert out['axes']['z']['ok'] is False and 'nope' in out['axes']['z']['error']


def test_preview_rpc_is_registered_allowlisted_and_matches_its_contract(monkeypatch):
    from app.routers import geochemistry_rpc
    from app.routers.rpc import METHOD_REGISTRY
    monkeypatch.setattr(geochemistry_rpc.overlay, 'get_effective_dataframe', lambda _id: (DF, ['Lith']))
    out = asyncio.run(geochemistry_rpc.diagram_preview_rpc({'dataset_id': 'ds', 'expressions': {'x': 'Sr/Y', 'y': 'Lith'}}))
    contract = json.loads((ROOT / 'packages/ipc-contracts/geochemistry/diagram_preview.v1.json').read_text(encoding='utf-8'))
    assert set(out) == set(contract['response']['required'])
    assert set(out['axes']['x']) == set(contract['response']['properties']['axes']['additionalProperties']['required'])
    assert out['axes']['y']['ok'] is False   # hidden columns are not available to expressions
    assert METHOD_REGISTRY['geochemistry.diagram_preview'] is geochemistry_rpc.diagram_preview_rpc
    assert '"geochemistry.diagram_preview"' in (ROOT / 'apps/desktop/src-tauri/src/analytics_bridge.rs').read_text(encoding='utf-8')
    with pytest.raises(ValueError):
        asyncio.run(geochemistry_rpc.diagram_preview_rpc({'dataset_id': 'ds', 'expressions': {'w': 'Sr'}}))


def test_ternary_fields_classify_in_the_triangle_and_are_returned_normalised():
    # A-apex field: every sample with A > 50 %
    field = {'id': 'hiA', 'name': 'A alto', 'points': [[50, 50, 0], [100, 0, 0], [50, 0, 50]]}
    df = pl.DataFrame({'A': [80.0, 10.0], 'B': [10.0, 45.0], 'C': [10.0, 45.0]})
    r = calculate(df, {'tool': 'custom-diagram', 'columns': {}, 'diagram': diagram(kind='ternary', x='A', y='B', z='C', fields=[field])})
    assert [x['classification'] for x in r['rows']] == ['A alto', 'Fuera de los campos']
    assert r['plot']['fields'][0]['points'][1] == [100.0, 0.0, 0.0]
    with pytest.raises(ValueError, match='A, B y C'):
        calculate(df, {'tool': 'custom-diagram', 'columns': {}, 'diagram': diagram(kind='ternary', x='A', y='B', z='C', fields=[{'id': 'f', 'name': 'f', 'points': [[0, 0], [1, 0], [1, 1]]}])})


def test_on_log_axes_field_edges_are_straight_in_log_space():
    # Field (1,1)-(100,1)-(1,100): its diagonal is x + y = 101 on linear axes but log x + log y = 2 on log axes.
    # The sample (50, 40) is inside the first triangle and outside the second.
    field = {'id': 'f', 'name': 'Bajo', 'points': [[1, 1], [100, 1], [1, 100]]}
    df = pl.DataFrame({'X': [50.0], 'Y': [40.0]})
    lin = calculate(df, {'tool': 'custom-diagram', 'columns': {}, 'diagram': diagram(x='X', y='Y', fields=[field])})
    log = calculate(df, {'tool': 'custom-diagram', 'columns': {}, 'log_x': True, 'log_y': True, 'diagram': diagram(x='X', y='Y', fields=[field])})
    assert lin['rows'][0]['classification'] == 'Bajo'
    assert log['rows'][0]['classification'] == 'Fuera de los campos'
    with pytest.raises(ValueError, match='mayores que 0'):
        calculate(df, {'tool': 'custom-diagram', 'columns': {}, 'log_x': True, 'diagram': diagram(x='X', y='Y', fields=[{'id': 'g', 'name': 'g', 'points': [[0, 1], [1, 1], [1, 2]]}])})
