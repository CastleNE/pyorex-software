"""
PCA with mandatory KMO/Bartlett/VIF validation (RF-04.2, RF-04.2a, RF-04.2b).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field

import numpy as np
import polars as pl
from factor_analyzer.factor_analyzer import calculate_bartlett_sphericity, calculate_kmo
from sklearn.decomposition import PCA
from statsmodels.stats.outliers_influence import variance_inflation_factor

from analysis.analytics.preprocessing import prepare_matrix


class PCAValidationError(Exception):
    """Raised when PCA cannot run safely — e.g. KMO too low or too few samples."""


@dataclass
class PCAResultInternal:
    job_id: str
    n_components: int
    explained_variance_ratio: list[float]
    cumulative_variance: list[float]
    loadings: list[list[float]]  # variables x components
    scores: list[list[float]]  # samples x components
    eigenvalues: list[float]
    variables_used: list[str]
    n_samples: int
    sample_ids: list[str]
    sample_types: list[str]
    components_for_70pct: int
    components_for_80pct: int
    components_for_90pct: int
    kmo_global: float
    bartlett_p_value: float
    vif: dict[str, float]
    warnings: list[str] = field(default_factory=list)
    pipeline: dict = field(default_factory=dict)


def run_pca(df: pl.DataFrame, variables: list[str], n_components: int | None = None) -> PCAResultInternal:
    if len(variables) < 2:
        raise PCAValidationError("PCA requiere al menos 2 variables.")

    prepared = prepare_matrix(df, variables, scale=True)
    X = prepared.X_scaled
    n_samples, n_vars = X.shape

    if n_samples < n_vars + 2:
        raise PCAValidationError(
            f"Muestras insuficientes para PCA: {n_samples} muestras y {n_vars} variables "
            f"(se recomiendan al menos {n_vars + 2})."
        )

    warnings = list(prepared.warnings)

    _, kmo_model = calculate_kmo(X)
    kmo_global = float(kmo_model)
    if kmo_global < 0.5:
        raise PCAValidationError(
            f"KMO = {kmo_global:.2f} — correlaciones insuficientes entre las variables "
            f"seleccionadas para un PCA confiable (mínimo 0.5). Probá con otras variables."
        )
    if kmo_global < 0.6:
        warnings.append(f"KMO = {kmo_global:.2f} — adecuación muestral débil (0.5–0.6).")

    _, bartlett_p = calculate_bartlett_sphericity(X)
    bartlett_p = float(bartlett_p)
    if bartlett_p >= 0.05:
        warnings.append(
            f"Test de Bartlett no significativo (p={bartlett_p:.3f}) — las variables podrían "
            f"no estar suficientemente correlacionadas para PCA."
        )

    vif: dict[str, float] = {}
    for i, var in enumerate(variables):
        try:
            v = float(variance_inflation_factor(X, i))
        except Exception:
            v = float("nan")
        vif[var] = v
        if v > 10:
            warnings.append(f"VIF alto en '{var}' ({v:.1f}) — multicolinealidad severa.")

    max_components = min(n_samples, n_vars)
    k = max(1, min(n_components or max_components, max_components))

    pca = PCA(n_components=k, random_state=42)
    scores = pca.fit_transform(X)

    explained = pca.explained_variance_ratio_.tolist()
    cumulative = np.cumsum(explained).tolist()

    def components_for(threshold: float) -> int:
        for idx, cum in enumerate(cumulative):
            if cum >= threshold:
                return idx + 1
        return k

    sample_type_col = "__sample_type__"
    if sample_type_col in df.columns:
        all_types = df.get_column(sample_type_col).to_list()
        sample_types = [all_types[i] for i in prepared.kept_row_indices]
    else:
        sample_types = ["S"] * n_samples

    return PCAResultInternal(
        job_id=str(uuid.uuid4()),
        n_components=k,
        explained_variance_ratio=explained,
        cumulative_variance=cumulative,
        loadings=pca.components_.T.tolist(),
        scores=scores.tolist(),
        eigenvalues=pca.explained_variance_.tolist(),
        variables_used=variables,
        n_samples=n_samples,
        sample_ids=prepared.sample_ids,
        sample_types=sample_types,
        components_for_70pct=components_for(0.70),
        components_for_80pct=components_for(0.80),
        components_for_90pct=components_for(0.90),
        kmo_global=kmo_global,
        bartlett_p_value=bartlett_p,
        vif=vif,
        warnings=warnings,
        pipeline={
            "variables": variables,
            "standardized": True,
            "imputation": prepared.imputation_summary,
            "n_excluded_not_analyzed": prepared.n_excluded_not_analyzed,
        },
    )
