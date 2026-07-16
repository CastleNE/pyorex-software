import polars as pl

from analysis.qaqc.report import build_qaqc_report


def _full_dataset() -> pl.DataFrame:
    return pl.DataFrame({
        "sample_id": ["S-1", "S-2", "FB-1", "FD-1", "CRM-1"],
        "__sample_type__": ["S", "S", "FB", "FD", "CRM"],
        "Au": [10.0, 20.0, 0.1, 10.5, 84.0],
    })


def test_full_pipeline_one_of_each_type():
    df = _full_dataset()
    report = build_qaqc_report(df, "ds-1", "__sample_type__", ["Au"], crm_values={"OREAS-262": {"Au": 100.0}})

    assert report.dataset_id == "ds-1"
    assert report.summary.n_samples_by_type == {"S": 2, "FB": 1, "FD": 1, "CRM": 1}
    assert report.summary.n_blank_flags >= 0
    assert report.summary.n_duplicate_pairs == 1
    assert report.summary.n_crm_results == 1


def test_dataset_with_zero_qaqc_samples():
    df = pl.DataFrame({
        "sample_id": ["S-1", "S-2"],
        "__sample_type__": ["S", "S"],
        "Au": [10.0, 20.0],
    })
    report = build_qaqc_report(df, "ds-2", "__sample_type__", ["Au"], crm_values={})

    assert report.summary.n_blank_flags == 0
    assert report.summary.n_duplicate_pairs == 0
    assert report.summary.n_crm_results == 0
    assert all(v == 0 for k, v in report.summary.n_flags_by_severity.items())
    assert any("blanco" in w.lower() for w in report.warnings)
    assert any("duplicad" in w.lower() for w in report.warnings)


def test_empty_crm_library_produces_explanatory_warning():
    df = _full_dataset()
    report = build_qaqc_report(df, "ds-3", "__sample_type__", ["Au"], crm_values={})

    assert report.crm_results == []
    assert any("biblioteca de crm" in w.lower() for w in report.warnings)
