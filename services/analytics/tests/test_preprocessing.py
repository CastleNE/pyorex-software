import numpy as np
import polars as pl

from analysis.analytics.preprocessing import prepare_matrix


def _df_with_nulltypes() -> pl.DataFrame:
    # Au: [10, 20, None(BELOW_LOD), 30, None(NOT_ANALYZED), None(MISSING), 40]
    au = [10.0, 20.0, None, 30.0, None, None, 40.0]
    nulltype = [None, None, "BELOW_LOD", None, "NOT_ANALYZED", "MISSING", None]
    return pl.DataFrame(
        {
            "internal_feature_id": [f"ROW-{i:06d}" for i in range(1, 8)],
            "Au": au,
            "_nulltype_Au": nulltype,
        }
    )


def test_not_analyzed_excludes_sample():
    df = _df_with_nulltypes()
    prepared = prepare_matrix(df, ["Au"], scale=False)

    assert prepared.n_excluded_not_analyzed == 1
    assert len(prepared.sample_ids) == 6
    assert "ROW-000005" not in prepared.sample_ids


def test_below_lod_imputed_with_half_observed_min():
    df = _df_with_nulltypes()
    prepared = prepare_matrix(df, ["Au"], scale=False)

    # Observed (non-null, non-excluded) values: 10, 20, 30, 40 -> min = 10 -> half = 5
    idx = prepared.sample_ids.index("ROW-000003")
    assert prepared.X[idx, 0] == 5.0
    assert prepared.imputation_summary["Au"]["below_lod_imputed"] == 1
    assert any("BELOW_LOD" in w for w in prepared.warnings)


def test_missing_imputed_with_median():
    df = _df_with_nulltypes()
    prepared = prepare_matrix(df, ["Au"], scale=False)

    idx = prepared.sample_ids.index("ROW-000006")
    non_null_observed = [10.0, 20.0, 30.0, 40.0]  # excludes the BELOW_LOD/NOT_ANALYZED/MISSING rows
    assert prepared.X[idx, 0] == float(np.median(non_null_observed))
    assert prepared.imputation_summary["Au"]["missing_imputed"] == 1


def test_no_nulltype_column_defaults_to_missing_median():
    df = pl.DataFrame(
        {
            "internal_feature_id": ["ROW-000001", "ROW-000002", "ROW-000003"],
            "Cu": [1.0, None, 3.0],
        }
    )
    prepared = prepare_matrix(df, ["Cu"], scale=False)

    assert prepared.n_excluded_not_analyzed == 0
    assert len(prepared.sample_ids) == 3
    assert prepared.imputation_summary["Cu"]["missing_imputed"] == 1


def _df_with_qaqc_types() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "internal_feature_id": [f"ROW-{i:06d}" for i in range(1, 7)],
            "Au": [10.0, 20.0, 30.0, 40.0, 50.0, 60.0],
            "__sample_type__": ["S", "S", "S", "S", "FD", "CRM"],
        }
    )


def test_qaqc_flagged_samples_excluded_by_default():
    df = _df_with_qaqc_types()
    prepared = prepare_matrix(df, ["Au"], scale=False)

    assert prepared.n_excluded_qaqc == 2
    assert len(prepared.sample_ids) == 4
    assert "ROW-000005" not in prepared.sample_ids
    assert "ROW-000006" not in prepared.sample_ids


def test_qaqc_flagged_samples_included_when_requested():
    df = _df_with_qaqc_types()
    prepared = prepare_matrix(df, ["Au"], scale=False, include_qaqc_flagged=True)

    assert prepared.n_excluded_qaqc == 2  # count still reported...
    assert len(prepared.sample_ids) == 6  # ...but rows are NOT excluded
    assert "ROW-000005" in prepared.sample_ids
    assert "ROW-000006" in prepared.sample_ids
    assert any("incluidas manualmente" in w for w in prepared.warnings)


def test_no_sample_type_column_means_zero_qaqc_exclusions():
    df = pl.DataFrame({
        "internal_feature_id": ["ROW-000001", "ROW-000002"],
        "Cu": [1.0, 2.0],
    })
    prepared = prepare_matrix(df, ["Cu"], scale=False)

    assert prepared.n_excluded_qaqc == 0
    assert len(prepared.sample_ids) == 2


def test_unrecognized_sample_type_value_treated_as_regular():
    df = pl.DataFrame({
        "internal_feature_id": ["ROW-000001", "ROW-000002", "ROW-000003"],
        "Cu": [1.0, 2.0, 3.0],
        "__sample_type__": ["S", "WEIRD_UNKNOWN_CODE", "S"],
    })
    prepared = prepare_matrix(df, ["Cu"], scale=False)

    assert prepared.n_excluded_qaqc == 0
    assert len(prepared.sample_ids) == 3
