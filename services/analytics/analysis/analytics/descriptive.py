"""
Descriptive statistics + normality + correlation for a set of numeric variables.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import polars as pl
from scipy import stats as scipy_stats

from analysis.analytics.preprocessing import prepare_matrix


@dataclass
class VariableStats:
    variable: str
    n: int
    n_nulls: int
    mean: float
    median: float
    std: float
    min: float
    max: float
    skewness: float
    shapiro_p: float | None
    normal: bool


@dataclass
class DescriptiveResult:
    stats: list[VariableStats]
    correlation: dict
    n_samples_used: int
    warnings: list[str] = field(default_factory=list)
    n_excluded_qaqc: int = 0


def run_descriptive(
    df: pl.DataFrame, variables: list[str], include_qaqc_flagged: bool = False
) -> DescriptiveResult:
    if not variables:
        raise ValueError("Seleccioná al menos una variable.")

    prepared = prepare_matrix(df, variables, scale=False, include_qaqc_flagged=include_qaqc_flagged)
    X = prepared.X

    stats_list: list[VariableStats] = []
    for i, var in enumerate(variables):
        col = X[:, i]
        n = len(col)
        shapiro_p: float | None = None
        if 3 <= n <= 5000:
            try:
                _, shapiro_p = scipy_stats.shapiro(col)
                shapiro_p = float(shapiro_p)
            except Exception:
                shapiro_p = None

        stats_list.append(
            VariableStats(
                variable=var,
                n=n,
                n_nulls=int(df.get_column(var).null_count()),
                mean=float(np.mean(col)) if n else 0.0,
                median=float(np.median(col)) if n else 0.0,
                std=float(np.std(col, ddof=1)) if n > 1 else 0.0,
                min=float(np.min(col)) if n else 0.0,
                max=float(np.max(col)) if n else 0.0,
                skewness=float(scipy_stats.skew(col)) if n > 2 else 0.0,
                shapiro_p=shapiro_p,
                normal=bool(shapiro_p is not None and shapiro_p >= 0.05),
            )
        )

    correlation: dict = {"variables": variables, "matrix": []}
    if len(variables) >= 2 and X.shape[0] > 2:
        matrix = []
        for i in range(len(variables)):
            row = []
            for j in range(len(variables)):
                if i == j:
                    row.append(1.0)
                else:
                    r, _ = scipy_stats.spearmanr(X[:, i], X[:, j])
                    row.append(float(r) if not np.isnan(r) else 0.0)
            matrix.append(row)
        correlation["matrix"] = matrix

    return DescriptiveResult(
        stats=stats_list,
        correlation=correlation,
        n_samples_used=X.shape[0],
        warnings=prepared.warnings,
        n_excluded_qaqc=prepared.n_excluded_qaqc,
    )
