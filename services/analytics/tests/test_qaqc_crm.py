import pytest
import polars as pl

from analysis.qaqc.crm import analyze_crm, calculate_recovery


def test_empty_crm_library_with_crm_rows_present_returns_empty_list():
    df = pl.DataFrame({
        "sample_id": ["CRM-1"],
        "__sample_type__": ["CRM"],
        "Au": [85.0],
    })
    assert analyze_crm(df, "__sample_type__", ["Au"], crm_values={}) == []


def test_certified_zero_returns_none_recovery():
    assert calculate_recovery(10.0, 0.0) is None


def test_single_crm_no_name_column_uses_only_defined_crm():
    df = pl.DataFrame({
        "sample_id": ["CRM-1"],
        "__sample_type__": ["CRM"],
        "Au": [84.0],  # deviation = 16, just over the 15% warning threshold
    })
    results = analyze_crm(df, "__sample_type__", ["Au"], crm_values={"OREAS-262": {"Au": 100.0}})
    assert len(results) == 1
    assert results[0].crm_name == "OREAS-262"
    assert results[0].recovery_by_variable["Au"] == pytest.approx(84.0)
    assert results[0].status == "warning"


def test_recovery_exactly_at_warning_boundary_not_flagged():
    df = pl.DataFrame({
        "sample_id": ["CRM-1"],
        "__sample_type__": ["CRM"],
        "Au": [85.0],  # deviation = exactly 15.0
    })
    results = analyze_crm(
        df, "__sample_type__", ["Au"], crm_values={"OREAS-262": {"Au": 100.0}}, warning_threshold_pct=15.0
    )
    assert results[0].status == "pass"  # strict '>' — exactly at boundary does not flag


def test_multiple_crms_unmatched_name_is_skipped_not_crashed():
    df = pl.DataFrame({
        "sample_id": ["CRM-1"],
        "__sample_type__": ["CRM"],
        "crm_name": ["totally-unrelated-label"],
        "Au": [85.0],
    })
    results = analyze_crm(
        df, "__sample_type__", ["Au"], crm_values={"OREAS-262": {"Au": 100.0}, "OREAS-263": {"Au": 50.0}}
    )
    assert results == []


def test_recovery_beyond_failure_threshold_is_fail():
    df = pl.DataFrame({
        "sample_id": ["CRM-1"],
        "__sample_type__": ["CRM"],
        "Au": [50.0],  # deviation = 50, way beyond failure threshold
    })
    results = analyze_crm(df, "__sample_type__", ["Au"], crm_values={"OREAS-262": {"Au": 100.0}})
    assert results[0].status == "fail"
    assert "Au" in results[0].failed_variables
