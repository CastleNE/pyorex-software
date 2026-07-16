import polars as pl

from analysis.data.quality import (
    check_constant_columns,
    check_duplicate_column_names,
    check_duplicate_rows,
    check_mixed_type_columns,
    check_non_numeric_in_numeric,
    check_nulls,
    check_outliers_iqr,
)


def test_check_nulls():
    df = pl.DataFrame({"a": [1, None, 3], "b": [1, 2, 3]})
    result = check_nulls(df)
    assert result == [{"column": "a", "null_count": 1, "null_pct": 33.33}]


def test_check_duplicate_rows():
    df = pl.DataFrame({"a": [1, 1, 2], "b": ["x", "x", "y"]})
    result = check_duplicate_rows(df)
    assert result["count"] == 2


def test_check_duplicate_rows_ignores_synthetic_internal_feature_id():
    """Regression: internal_feature_id is unique per row by construction
    (importer.py assigns ROW-000001, ROW-000002, ...) — including it in the
    duplicate-row comparison would make every row look unique and duplicate
    detection would never fire on any real imported dataset."""
    df = pl.DataFrame({
        "internal_feature_id": ["ROW-000001", "ROW-000002", "ROW-000003"],
        "a": [1, 1, 2],
        "b": ["x", "x", "y"],
    })
    result = check_duplicate_rows(df)
    assert result["count"] == 2


def test_check_duplicate_column_names():
    assert check_duplicate_column_names(["a", "b", "a", "c", "c"]) == ["a", "c"]
    assert check_duplicate_column_names(["a", "b"]) == []


def test_check_constant_columns():
    df = pl.DataFrame({"const": [5, 5, 5], "varies": [1, 2, 3]})
    result = check_constant_columns(df)
    assert len(result) == 1
    assert result[0]["column"] == "const"


def test_check_mixed_type_columns():
    df = pl.DataFrame({"mixed": ["1", "2", "abc"], "clean": ["a", "b", "c"]})
    result = check_mixed_type_columns(df)
    assert len(result) == 1
    assert result[0]["column"] == "mixed"


def test_check_non_numeric_in_numeric():
    df = pl.DataFrame({"Au_ppm": ["1.5", "n/a", "2.0"]})
    result = check_non_numeric_in_numeric(df, ["Au_ppm"])
    assert len(result) == 1
    assert result[0]["invalid_values"] == ["n/a"]


def test_check_outliers_iqr():
    df = pl.DataFrame({"v": [1.0, 2.0, 3.0, 4.0, 5.0, 100.0]})
    result = check_outliers_iqr(df, ["v"])
    assert len(result) == 1
    assert result[0]["outlier_count"] == 1


def test_check_outliers_iqr_no_outliers():
    df = pl.DataFrame({"v": [1.0, 2.0, 3.0, 4.0, 5.0]})
    result = check_outliers_iqr(df, ["v"])
    assert result == []
