import polars as pl
import pytest


def run(tool,data,**options):
    from analysis.geochemistry.engine import calculate
    from analysis.geochemistry.catalog import BY_ID
    return calculate(pl.DataFrame(data),{'tool':tool,'columns':{key:key for key in BY_ID[tool]['inputs']},**options})


def test_qq_normal_is_sorted_and_symmetric():
    r=run('qq-normal',{'X':[3.,1.,2.]})
    rows=sorted(r['rows'],key=lambda r:r['x'])
    assert [r['y'] for r in rows]==[1.,2.,3.]
    assert rows[1]['x']==pytest.approx(0)
    assert rows[0]['x']==pytest.approx(-rows[2]['x'])


def test_ecdf_ties_have_same_cumulative_probability():
    r=run('ecdf',{'X':[2.,1.,2.,4.]})
    assert [row['y'] for row in r['rows']]==[75.,25.,75.,100.]


def test_normal_probability_plot_uses_normal_scores_and_percent_labels():
    r=run('probability',{'X':[1.,2.,3.]})
    assert r['rows'][1]['y']==pytest.approx(0)
    assert r['plot']['kind']=='probability'


def test_paired_assay_difference_preserves_sample_pairing():
    r=run('assay-difference',{'X':[10.,20.],'Y':[12.,18.]})
    assert [(x['x'],x['y']) for x in r['rows']]==[(11.,2.),(19.,-2.)]


def test_downhole_requires_hole_and_rejects_negative_depth():
    from analysis.geochemistry.engine import calculate
    with pytest.raises(ValueError):
        run('downhole',{'Depth':[1.,2.],'Value':[10.,20.]})
    r=run('downhole-compare',{'Depth':[2.,1.,-1.],'Assay1':[3.,4.,5.],'Assay2':[6.,7.,8.],'Hole':['A','A','B']},group_column='Hole')
    assert r['quality']['invalid']==1
    assert r['rows'][0]['x']==3 and r['rows'][0]['y']==2 and r['rows'][0]['z']==6


def test_size_and_color_values_are_carried_without_discarding_assays():
    r=run('scatter',{'X':[1.,2.],'Y':[2.,3.],'Au':[100.,None]},size_column='Au',color_column='Au')
    assert r['quality']['used']==2
    assert r['rows'][0]['size_value']==100
    assert r['rows'][1]['size_value'] is None


def test_downhole_rejects_unknown_holes_and_preserves_depth_for_gaps():
    r=run('downhole',{'Depth':[1.,2.,3.,4.],'Value':[10.,None,30.,40.],'Hole':['A','A',None,'']},group_column='Hole')
    assert r['quality']['used']==1
    assert r['quality']['invalid']==3
    assert r['rows'][1]['y']==2 and r['rows'][1]['x'] is None
    assert 'sondaje' in r['rows'][2]['reason']
