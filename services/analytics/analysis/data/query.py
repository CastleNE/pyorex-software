"""
Server-side filter/sort for the DATA grid's column-header menus. Pure Polars
functions — run against the FULL effective dataframe (see overlay.py), never
just the currently-loaded page, so filtering behaves correctly with pagination.
"""
from __future__ import annotations

import polars as pl

NUMERIC_OPS = {"eq", "neq", "gt", "lt", "gte", "lte", "between", "is_null", "not_null"}
TEXT_OPS = {"contains", "not_contains", "starts_with", "ends_with", "in", "is_null", "not_null"}
DATE_OPS = {"before", "after", "between", "year", "month", "is_null", "not_null"}


class QueryError(ValueError):
    pass


def _dtype_family(dtype: pl.DataType) -> str:
    if dtype.is_numeric():
        return "numeric"
    if dtype in (pl.Date, pl.Datetime) or isinstance(dtype, (pl.Date, pl.Datetime)):
        return "date"
    return "text"


def _validate_op(column: str, op: str, family: str) -> None:
    allowed = {"numeric": NUMERIC_OPS, "text": TEXT_OPS, "date": DATE_OPS}[family]
    if op not in allowed:
        raise QueryError(f"Operator '{op}' is not valid for column '{column}' ({family})")


def _filter_expr(df: pl.DataFrame, f: dict) -> pl.Expr:
    column, op = f["column"], f["op"]
    if column not in df.columns:
        raise QueryError(f"Unknown column: {column}")
    family = _dtype_family(df.schema[column])
    _validate_op(column, op, family)
    col = pl.col(column)
    value = f.get("value")
    value2 = f.get("value2")

    if op == "is_null":
        return col.is_null()
    if op == "not_null":
        return col.is_not_null()

    if family == "numeric":
        if op == "eq":
            return col == value
        if op == "neq":
            return col != value
        if op == "gt":
            return col > value
        if op == "lt":
            return col < value
        if op == "gte":
            return col >= value
        if op == "lte":
            return col <= value
        if op == "between":
            return col.is_between(value, value2)

    if family == "text":
        if op == "contains":
            return col.cast(pl.Utf8).str.contains(value, literal=True)
        if op == "not_contains":
            return ~col.cast(pl.Utf8).str.contains(value, literal=True)
        if op == "starts_with":
            return col.cast(pl.Utf8).str.starts_with(value)
        if op == "ends_with":
            return col.cast(pl.Utf8).str.ends_with(value)
        if op == "in":
            return col.cast(pl.Utf8).is_in(value or [])

    if family == "date":
        if op == "before":
            return col < value
        if op == "after":
            return col > value
        if op == "between":
            return col.is_between(value, value2)
        if op == "year":
            return col.dt.year() == value
        if op == "month":
            return col.dt.month() == value

    raise QueryError(f"Unsupported operator '{op}' for column family '{family}'")


def apply_filters(df: pl.DataFrame, filters: list[dict] | None) -> pl.DataFrame:
    if not filters:
        return df
    expr = None
    for f in filters:
        e = _filter_expr(df, f)
        expr = e if expr is None else (expr & e)
    return df.filter(expr) if expr is not None else df


def apply_sort(df: pl.DataFrame, sort: dict | None) -> pl.DataFrame:
    if not sort:
        return df
    column = sort["column"]
    if column not in df.columns:
        raise QueryError(f"Unknown column: {column}")
    descending = sort.get("direction", "asc") == "desc"
    return df.sort(column, descending=descending, nulls_last=True)
