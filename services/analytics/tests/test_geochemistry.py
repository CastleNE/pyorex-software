import json

import polars as pl
import pytest


def run(tool, values, **options):
    from analysis.geochemistry.engine import calculate
    columns = {key: key for key in values if key != '__sample_type__'}
    return calculate(pl.DataFrame(values), {'tool': tool, 'columns': columns, **options})


def test_oxide_indices_and_molar_shand():
    result = run('mali', {'SiO2': [60.], 'Na2O': [3.], 'K2O': [4.], 'CaO': [5.]})
    assert result['rows'][0]['y'] == 2
    result = run('shand-index', {'Al2O3': [101.9613], 'CaO': [56.0774], 'Na2O': [61.9789], 'K2O': [94.196]})
    assert result['rows'][0]['x'] == pytest.approx(1/3)
    assert result['rows'][0]['y'] == pytest.approx(1/2)


def test_units_iron_conversion_and_zero_denominator():
    result = run('fe-index', {'SiO2': [60., 60.], 'FeTotal': [10., 0.], 'MgO': [5., 0.]}, iron_basis='Fe2O3T')
    assert result['rows'][0]['y'] == pytest.approx(8.998/(8.998+5))
    assert result['rows'][1]['status'] == 'invalid'
    result = run('element-ratios', {'numerator': [1000.], 'denominator': [2.]}, units={'numerator':'ppb','denominator':'ppm'})
    assert result['rows'][0]['y'] == .5


def test_ternary_closure_and_qapf_constraints():
    result = run('ternary', {'A': [2., 0.], 'B': [3., 0.], 'C': [5., 0.]})
    assert [result['rows'][0][k] for k in ['x','y','z']] == [20.,30.,50.]
    assert result['quality']['invalid'] == 1
    result = run('qapf', {'Q': [20., 20.], 'A': [30.,30.], 'P': [50.,50.], 'F': [0.,1.]})
    assert result['rows'][0]['status'] == 'valid'
    assert result['rows'][1]['status'] == 'invalid'


def test_tas_fields_boundary_and_bad_data():
    result = run('tas', {'SiO2':[50.,60.,75.,52.,float('nan')], 'Na2O':[2.,2.,3.,2.,2.], 'K2O':[1.,2.,5.,1.,1.]})
    rows = result['rows']
    assert rows[0]['classification'] == 'Basalt'
    assert rows[1]['classification'] == 'Andesite'
    assert rows[2]['classification'] == 'Rhyolite'
    assert rows[3]['classification'].startswith('Boundary:')
    assert rows[4]['status'] == 'invalid'
    json.dumps(result, allow_nan=False)


def test_reference_normalization_and_anomalies():
    from analysis.geochemistry.engine import reference_values
    ref = reference_values('chondrite')
    result = run('ree-normalization', {el:[ref[el]] for el in ['La','Ce','Pr','Nd','Sm','Eu','Gd','Yb','Lu']})
    assert all(v == pytest.approx(1) for v in result['rows'][0]['values'] if v is not None)
    eu = run('fertility-eu-eu', {el:[ref[el]] for el in ['Sm','Eu','Gd']})
    assert eu['rows'][0]['y'] == pytest.approx(1)
    ce = run('fertility-ce-ce', {el:[ref[el]] for el in ['La','Ce','Pr']})
    assert ce['rows'][0]['y'] == pytest.approx(1)


def test_qaqc_exclusion_and_pipeline():
    result = run('scatter', {'X':[1.,2.,3.], 'Y':[4.,5.,6.], '__sample_type__':['S','CRM','S']})
    assert result['quality']['used'] == 2
    assert result['quality']['excluded_qaqc'] == 1
    assert result['pipeline']['tool'] == 'scatter'
    assert result['pipeline']['missing_policy'] == 'exclude_without_imputation'


def test_log_nonpositive_values_not_plotted_or_counted():
    result = run('scatter', {'X':[1.,0.,-1.], 'Y':[2.,3.,4.]}, log_x=True)
    assert result['quality']['used'] == 1
    assert result['quality']['invalid'] == 2


def test_invalid_mapping_and_units():
    from analysis.geochemistry.engine import calculate
    df = pl.DataFrame({'a':[1.], 'b':[2.]})
    for request in [
        {'tool':'tas','columns':{'SiO2':'a','Na2O':'a','K2O':'a'}},
        {'tool':'scatter','columns':{'X':'a','Y':'missing'}},
        {'tool':'mali','columns':{'SiO2':'a'}},
        {'tool':'scatter','columns':{'X':'a','Y':'b'}, 'units':{'X':'bananas'}},
    ]:
        with pytest.raises(ValueError):
            calculate(df, request)


def test_all_tools_accept_valid_example_and_finite_output():
    from analysis.geochemistry.catalog import TOOLS
    from analysis.geochemistry.engine import calculate
    for tool in TOOLS:
        columns = {key:key for key in tool['inputs']}
        data = {key:[5.,10.,15.] for key in columns}
        if 'F' in data:
            data['F'] = [0.,0.,0.]
        options = {}
        if tool['id'].startswith('downhole'):
            data['Hole']=['A','A','A']
            options['group_column']='Hole'
        result = calculate(pl.DataFrame(data), {'tool':tool['id'], 'columns':columns, **options})
        assert result['quality']['used'] > 0, tool['id']
        assert result['reference']
        assert result['pipeline']['columns'] == columns
        json.dumps(result, allow_nan=False)


def test_rpc_overlay_is_read_and_original_is_unchanged(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from analysis.data import storage, overlay
    monkeypatch.setattr(storage,'DATASETS_DIR',tmp_path)
    monkeypatch.setattr(overlay,'DATASETS_DIR',tmp_path)
    dataset_id=storage.save_dataset(pl.DataFrame({'sample_id':['S1'],'old':[60.],'Na2O':[3.],'K2O':[2.]}),'Geo test',{})
    original=(tmp_path/f'{dataset_id}.parquet').read_bytes()
    overlay.append_op(dataset_id,'rename_column',{'column':'old','new_name':'SiO2'})
    with TestClient(app,base_url='http://localhost') as client:
        catalog=client.post('/rpc',json={'jsonrpc':'2.0','id':'cat','method':'geochemistry.catalog','params':{'dataset_id':dataset_id}}).json()
        assert any(c['name']=='SiO2' for c in catalog['result']['columns'])
        response=client.post('/rpc',json={'jsonrpc':'2.0','id':'calc','method':'geochemistry.compute','params':{'dataset_id':dataset_id,'tool':'tas','columns':{'SiO2':'SiO2','Na2O':'Na2O','K2O':'K2O'}}}).json()
    assert response['result']['quality']['used']==1
    assert response['result']['pipeline']['operations'][0]['type']=='rename_column'
    assert (tmp_path/f'{dataset_id}.parquet').read_bytes()==original


def test_censored_data_not_silently_used():
    from analysis.geochemistry.engine import calculate
    df=pl.DataFrame({'X':[1.,2.],'Y':[3.,4.],'_nulltype_X':['BELOW_LOD',None]})
    result=calculate(df,{'tool':'scatter','columns':{'X':'X','Y':'Y'}})
    assert result['quality']['used']==1
    assert result['quality']['invalid']==1


def test_normalization_gaps_and_explicit_units():
    result=run('ree-normalization',{'La':[237.,None],'Ce':[612.,0.],'Pr':[None,None]},units={'La':'ppb','Ce':'ppb','Pr':'ppm'})
    assert result['rows'][0]['values']==pytest.approx([1.,1.,None],nan_ok=True)
    assert result['rows'][1]['status']=='invalid'


def test_catalog_has_only_implemented_tools_and_contracts():
    from pathlib import Path
    from analysis.geochemistry.catalog import TOOLS
    from app.routers.geochemistry_rpc import GEOCHEMISTRY_METHODS
    root=Path(__file__).resolve().parents[3]
    bridge=(root/'apps/desktop/src-tauri/src/analytics_bridge.rs').read_text()
    contracts=[json.loads(path.read_text()) for path in (root/'packages/ipc-contracts/geochemistry').glob('*.json')]
    assert {c['method'] for c in contracts}==set(GEOCHEMISTRY_METHODS)
    for method in GEOCHEMISTRY_METHODS:
        assert f'"{method}"' in bridge
    assert len({t['id'] for t in TOOLS})==len(TOOLS)
