import polars as pl
import pytest

from analysis.data.query import QueryError, apply_filters, apply_sort


def _df() -> pl.DataFrame:
    return pl.DataFrame({
        "Cu_ppm": [10.0, 20.0, None, 5.0],
        "name": ["alpha", "beta", "gamma", "beta2"],
    })


def test_numeric_gt_filter():
    out = apply_filters(_df(), [{"column": "Cu_ppm", "op": "gt", "value": 8}])
    assert out.height == 2


def test_numeric_between_filter():
    out = apply_filters(_df(), [{"column": "Cu_ppm", "op": "between", "value": 4, "value2": 15}])
    assert sorted(out["Cu_ppm"].drop_nulls().to_list()) == [5.0, 10.0]


def test_numeric_is_null_filter():
    out = apply_filters(_df(), [{"column": "Cu_ppm", "op": "is_null"}])
    assert out.height == 1


def test_text_contains_filter():
    out = apply_filters(_df(), [{"column": "name", "op": "contains", "value": "beta"}])
    assert out.height == 2


def test_text_starts_with_filter():
    out = apply_filters(_df(), [{"column": "name", "op": "starts_with", "value": "al"}])
    assert out.height == 1


def test_multiple_filters_are_conjunctive():
    out = apply_filters(_df(), [
        {"column": "Cu_ppm", "op": "gt", "value": 0},
        {"column": "name", "op": "starts_with", "value": "b"},
    ])
    assert out.height == 2


def test_multiple_filters_or_combinator():
    out = apply_filters(
        _df(),
        [
            {"column": "Cu_ppm", "op": "gt", "value": 15},
            {"column": "name", "op": "starts_with", "value": "al"},
        ],
        combinator="or",
    )
    assert sorted(out["name"].to_list()) == ["alpha", "beta"]


def test_invalid_operator_for_dtype_rejected():
    with pytest.raises(QueryError):
        apply_filters(_df(), [{"column": "name", "op": "gt", "value": 1}])


def test_unknown_column_rejected():
    with pytest.raises(QueryError):
        apply_filters(_df(), [{"column": "does_not_exist", "op": "eq", "value": 1}])


def test_sort_ascending():
    out = apply_sort(_df(), {"column": "Cu_ppm", "direction": "asc"})
    assert out["Cu_ppm"].drop_nulls().to_list() == [5.0, 10.0, 20.0]


def test_sort_descending():
    out = apply_sort(_df(), {"column": "Cu_ppm", "direction": "desc"})
    assert out["Cu_ppm"].drop_nulls().to_list() == [20.0, 10.0, 5.0]


def test_no_filters_or_sort_is_noop():
    df = _df()
    assert apply_filters(df, None).height == df.height
    assert apply_sort(df, None).height == df.height
