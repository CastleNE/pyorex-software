import json

import numpy as np
import polars as pl
import pytest


def compute(data, **options):
    from analysis.geochemistry.exploration import explore
    return explore(pl.DataFrame(data), options)


def test_manual_anomalies_edges_and_exclusions():
    r = compute({'Au': [0., 1., 2., 3., 8., None], '__sample_type__': ['S']*4+['CRM','S']},
                tool='anomalies', variables=['Au'], breaks=[1.,2.,3.])
    assert [x['group'] for x in r['rows'][:4]] == ['Fondo','Baja','Media','Alta']
    assert r['quality'] == {'total':6,'used':4,'invalid':1,'excluded_qaqc':1}
    assert r['metrics']['counts'] == {'Fondo':1,'Baja':1,'Media':1,'Alta':1}
    json.dumps(r, allow_nan=False)


def test_percentiles_and_custom_labels():
    r = compute({'Cu':list(range(101))},tool='anomalies',variables=['Cu'],method='percentile',
                breaks=[50.,90.,98.],labels=['Background','Weak','Moderate','Strong'])
    assert r['metrics']['thresholds'] == [50.,90.,98.]
    assert r['rows'][98]['group'] == 'Strong'


def test_rejects_bad_thresholds_and_censored_numeric_values():
    with pytest.raises(ValueError):
        compute({'Au':[1.,2.]},tool='anomalies',variables=['Au'],breaks=[2.,1.,3.])
    r=compute({'Au':[1.,2.], '_nulltype_Au':['BELOW_LOD',None]},tool='anomalies',variables=['Au'],breaks=[1.,2.,3.])
    assert r['quality']['used'] == 1


def test_kmeans_reproducible_and_original_centroid_units():
    data={'Cu':[1.,2.,1.,101.,102.,101.], 'Zn':[10.,11.,12.,90.,91.,92.]}
    r=compute(data,tool='kmeans',variables=['Cu','Zn'],k=2)
    again=compute(data,tool='kmeans',variables=['Cu','Zn'],k=2)
    labels=[row['group'] for row in r['rows']]
    assert labels == [row['group'] for row in again['rows']]
    assert len(set(labels[:3])) == len(set(labels[3:])) == 1
    assert labels[0] != labels[3]
    assert r['metrics']['silhouette'] > .9
    assert sorted(c['values']['Cu'] for c in r['metrics']['centroids']) == pytest.approx([4/3,304/3])
    assert r['pipeline']['standardized'] is True


def test_kmeans_rejects_constant_and_too_few_distinct_samples():
    with pytest.raises(ValueError):
        compute({'Cu':[1.,1.,1.],'Au':[1.,2.,3.]},tool='kmeans',variables=['Cu','Au'],k=2)
    with pytest.raises(ValueError):
        compute({'Cu':[1.,1.,2.],'Au':[1.,1.,2.]},tool='kmeans',variables=['Cu','Au'],k=3)


def test_idw_exact_corners_center_and_convex_hull_mask():
    r=compute({'E':[0.,100.,0.],'N':[0.,0.,100.],'Au':[10.,20.,30.]},
              tool='isovalues',variables=['Au'],east='E',north='N',epsg=32718,resolution=11,neighbors=3)
    grid=r['grid']['z']
    assert grid[0][0] == 10
    assert grid[0][-1] == 20
    assert grid[-1][0] == 30
    assert grid[-1][-1] is None
    assert 10 <= grid[5][5] <= 30
    json.dumps(r,allow_nan=False)


def test_idw_requires_projected_crs_and_noncollinear_points():
    for epsg in [4326,32718]:
        with pytest.raises(ValueError):
            compute({'E':[0.,1.,2.],'N':[0.,1.,2.],'Au':[1.,2.,3.]},
                    tool='isovalues',variables=['Au'],east='E',north='N',epsg=epsg)


def test_idw_duplicate_locations_averaged_and_radius_masks():
    r=compute({'E':[0.,0.,100.,0.],'N':[0.,0.,0.,100.],'Au':[10.,30.,20.,30.]},
              tool='isovalues',variables=['Au'],east='E',north='N',epsg=32718,resolution=11,radius=1.)
    assert r['grid']['z'][0][0] == 20
    assert r['grid']['z'][1][1] is None
    assert r['metrics']['duplicate_locations'] == 1


def test_log_kmeans_excludes_zero_without_imputation():
    r=compute({'Cu':[0.,1.,2.,100.,200.],'Zn':[1.,1.,2.,100.,200.]},
              tool='kmeans',variables=['Cu','Zn'],k=2,transform='log10')
    assert r['quality']['invalid'] == 1
    assert r['rows'][0]['status'] == 'invalid'


def test_rpc_exploration_preserves_source_and_exports_classes(tmp_path,monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from analysis.data import storage,overlay
    monkeypatch.setattr(storage,'DATASETS_DIR',tmp_path)
    monkeypatch.setattr(overlay,'DATASETS_DIR',tmp_path)
    dataset_id=storage.save_dataset(pl.DataFrame({'sample_id':['A','B','C'],'Au':[0.,2.,5.]}),'Test',{})
    before=(tmp_path/f'{dataset_id}.parquet').read_bytes()
    with TestClient(app,base_url='http://localhost') as client:
        response=client.post('/rpc',json={'jsonrpc':'2.0','id':'exp','method':'geochemistry.explore',
                             'params':{'dataset_id':dataset_id,'tool':'anomalies','variables':['Au'],'breaks':[1.,2.,3.]}}).json()
    assert not response.get('error')
    assert response['result']['rows'][2]['classification']=='Alta'
    assert response['result']['pipeline']['dataset_id']==dataset_id
    assert (tmp_path/f'{dataset_id}.parquet').read_bytes()==before


def test_optional_map_does_not_change_anomaly_population():
    data={'Au':[1.,2.,100.],'E':[0.,1.,None],'N':[0.,1.,None]}
    r=compute(data,tool='anomalies',variables=['Au'],method='percentile',breaks=[50.,90.,99.],east='E',north='N')
    plain=compute(data,tool='anomalies',variables=['Au'],method='percentile',breaks=[50.,90.,99.])
    assert r['quality']==plain['quality']
    assert r['metrics']['thresholds']==plain['metrics']['thresholds']
    assert r['rows'][2]['x'] is None
    assert r['rows'][2]['group']=='Alta'


def test_numeric_column_named_group_does_not_collide_with_centroid_label():
    r=compute({'group':[1.,2.,10.,11.],'Cu':[1.,2.,10.,11.]},tool='kmeans',variables=['group','Cu'],k=2)
    assert all('group' in c['values'] for c in r['metrics']['centroids'])
