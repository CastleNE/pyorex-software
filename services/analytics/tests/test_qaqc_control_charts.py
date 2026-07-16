import pytest

from analysis.qaqc.control_charts import build_shewhart_chart


def test_less_than_two_points_raises():
    with pytest.raises(ValueError):
        build_shewhart_chart([("S-1", 100.0)])


def test_two_identical_points_zero_sigma_no_crash():
    chart = build_shewhart_chart([("S-1", 100.0), ("S-2", 100.0)])
    assert chart.sigma == 0.0
    assert chart.westgard_violations == []  # sigma=0 guard prevents ZeroDivisionError, no spurious violations


def _tight_cluster(n=20):
    return [(f"S-{i}", 100.0 + (i % 3) * 0.05) for i in range(n)]


def test_1_3s_violation_fires_on_single_outlier_point():
    series = _tight_cluster() + [("OUT", 110.0)]
    chart = build_shewhart_chart(series)
    rules = {v.rule for v in chart.westgard_violations}
    assert "1_3s" in rules


def test_2_2s_violation_on_two_consecutive_points_same_side():
    series = _tight_cluster() + [("OUT1", 101.5), ("OUT2", 101.6)]
    chart = build_shewhart_chart(series)
    rules = {v.rule for v in chart.westgard_violations}
    assert "2_2s" in rules


def test_10x_rule_requires_exactly_ten_consecutive_same_side_points():
    # 9 consecutive increasing points + 1 low anchor at the end -> only 9 in
    # a row on the same side of the mean -> rule must NOT fire.
    nine_then_anchor = [(f"S-{i}", 100.0 + i * 0.01) for i in range(9)] + [("S-9", 50.0)]
    chart_nine = build_shewhart_chart(nine_then_anchor)
    assert "10x" not in {v.rule for v in chart_nine.westgard_violations}

    # 10 consecutive increasing points + 1 low anchor -> exactly 10 in a row -> fires.
    ten_then_anchor = [(f"S-{i}", 100.0 + i * 0.01) for i in range(10)] + [("S-10", 50.0)]
    chart_ten = build_shewhart_chart(ten_then_anchor)
    assert "10x" in {v.rule for v in chart_ten.westgard_violations}


def test_drift_rule_on_last_five_points():
    series = [("S-1", 100.0), ("S-2", 100.0), ("S-3", 101.0), ("S-4", 102.0), ("S-5", 103.0), ("S-6", 104.0), ("S-7", 105.0)]
    chart = build_shewhart_chart(series)
    rules = {v.rule for v in chart.westgard_violations}
    assert "drift" in rules
