"""
Shared preprocessing for analytics (descriptive, PCA): variable selection +
RF-04-CUA missing-value handling + optional standardization.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import polars as pl
from sklearn.preprocessing import StandardScaler


@dataclass
class PreparedMatrix:
    variables: list[str]
    sample_ids: list[str]
    kept_row_indices: list[int]
    X: np.ndarray
    X_scaled: np.ndarray | None
    warnings: list[str] = field(default_factory=list)
    n_excluded_not_analyzed: int = 0
    imputation_summary: dict = field(default_factory=dict)


def prepare_matrix(df: pl.DataFrame, variables: list[str], scale: bool = True) -> PreparedMatrix:
    """
    RF-04-CUA: NOT_ANALYZED excludes the sample; MISSING imputes with the median;
    BELOW_LOD imputes with half the observed minimum (the real LOD isn't persisted
    by the importer yet — see ADR for Data Analysis feature).
    """
    missing_cols = [v for v in variables if v not in df.columns]
    if missing_cols:
        raise ValueError(f"Variables no encontradas en el dataset: {missing_cols}")

    n_rows = df.height
    warnings: list[str] = []
    imputation_summary: dict = {}

    exclude_mask = np.zeros(n_rows, dtype=bool)
    nulltype_by_var: dict[str, np.ndarray] = {}
    for var in variables:
        nt_col = f"_nulltype_{var}"
        if nt_col in df.columns:
            nt_values = df.get_column(nt_col).to_numpy()
            nulltype_by_var[var] = nt_values
            exclude_mask |= nt_values == "NOT_ANALYZED"
        else:
            nulltype_by_var[var] = np.array([None] * n_rows)

    n_excluded = int(exclude_mask.sum())
    keep_indices = np.where(~exclude_mask)[0]

    X_columns: list[np.ndarray] = []
    for var in variables:
        vals = df.get_column(var).cast(pl.Float64, strict=False).to_numpy()[keep_indices].copy()
        ntypes = nulltype_by_var[var][keep_indices]
        observed_mask = ~np.isnan(vals)  # truly measured, before any imputation

        null_pct = float(np.isnan(vals).mean()) if len(vals) else 0.0
        if null_pct > 0.4:
            warnings.append(
                f"Variable '{var}' tiene {null_pct * 100:.0f}% de valores nulos — resultado poco confiable."
            )

        below_lod_mask = (ntypes == "BELOW_LOD") & np.isnan(vals)
        n_below_lod = int(below_lod_mask.sum())
        if n_below_lod > 0:
            non_null = vals[~np.isnan(vals)]
            fallback = float(np.min(non_null) / 2) if len(non_null) else 0.0
            vals[below_lod_mask] = fallback
            warnings.append(
                f"'{var}': {n_below_lod} valor(es) BELOW_LOD imputados con LOD/2 aproximado "
                f"({fallback:.4g}, mitad del mínimo observado — LOD real no registrado en el import)."
            )

        missing_mask = np.isnan(vals)
        n_missing = int(missing_mask.sum())
        if n_missing > 0:
            non_null = vals[observed_mask]
            median_val = float(np.median(non_null)) if len(non_null) else 0.0
            vals[missing_mask] = median_val

        imputation_summary[var] = {"below_lod_imputed": n_below_lod, "missing_imputed": n_missing}
        X_columns.append(vals)

    X = np.column_stack(X_columns) if X_columns else np.empty((len(keep_indices), 0))

    if "internal_feature_id" in df.columns:
        sample_ids = df.get_column("internal_feature_id").to_numpy()[keep_indices].tolist()
    else:
        sample_ids = [str(i) for i in keep_indices]

    X_scaled = StandardScaler().fit_transform(X) if scale else None

    return PreparedMatrix(
        variables=variables,
        sample_ids=sample_ids,
        kept_row_indices=keep_indices.tolist(),
        X=X,
        X_scaled=X_scaled,
        warnings=warnings,
        n_excluded_not_analyzed=n_excluded,
        imputation_summary=imputation_summary,
    )
