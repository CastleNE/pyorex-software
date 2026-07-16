import polars as pl

from analysis.qaqc.common import get_sample_type_column, infer_sample_id_column


def test_prefers_metadata_role_over_name_heuristic():
    df = pl.DataFrame({"weird_col_name": ["A", "B"], "id": ["should-not-win", "x"]})
    result = infer_sample_id_column(df, column_roles={"weird_col_name": "sample_identifier", "id": "text_attribute"})
    assert result == "weird_col_name"


def test_falls_back_to_name_heuristic_without_roles():
    df = pl.DataFrame({"muestra": ["A", "B"], "other": [1, 2]})
    assert infer_sample_id_column(df) == "muestra"


def test_falls_back_to_internal_feature_id():
    df = pl.DataFrame({"internal_feature_id": ["ROW-000001"], "value": [1.0]})
    assert infer_sample_id_column(df) == "internal_feature_id"


def test_falls_back_to_first_column_as_last_resort():
    df = pl.DataFrame({"foo": [1], "bar": [2]})
    assert infer_sample_id_column(df) == "foo"


def test_get_sample_type_column_present():
    df = pl.DataFrame({"__sample_type__": ["S"]})
    assert get_sample_type_column(df) == "__sample_type__"


def test_get_sample_type_column_absent():
    df = pl.DataFrame({"other": ["S"]})
    assert get_sample_type_column(df) is None
