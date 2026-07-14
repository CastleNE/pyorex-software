import numpy as np
import polars as pl
import pytest

from analysis.analytics.pca import PCAValidationError, run_pca


def _correlated_dataset(n_samples: int = 80, n_vars: int = 4, seed: int = 42) -> pl.DataFrame:
    """4 variables loading strongly on one latent factor -> should yield high KMO."""
    rng = np.random.default_rng(seed)
    factor = rng.normal(size=n_samples)
    data = {
        "internal_feature_id": [f"ROW-{i:06d}" for i in range(1, n_samples + 1)],
    }
    var_names = [f"V{i}" for i in range(n_vars)]
    for name in var_names:
        noise = rng.normal(scale=0.3, size=n_samples)
        data[name] = (factor * 2.0 + noise).tolist()
    return pl.DataFrame(data), var_names


def _independent_dataset(n_samples: int = 150, n_vars: int = 8, seed: int = 7) -> pl.DataFrame:
    """Independent noise variables -> should yield a low KMO and get blocked."""
    rng = np.random.default_rng(seed)
    data = {
        "internal_feature_id": [f"ROW-{i:06d}" for i in range(1, n_samples + 1)],
    }
    var_names = [f"N{i}" for i in range(n_vars)]
    for name in var_names:
        data[name] = rng.normal(size=n_samples).tolist()
    return pl.DataFrame(data), var_names


def test_pca_runs_on_correlated_variables():
    df, variables = _correlated_dataset()
    result = run_pca(df, variables)

    assert result.kmo_global >= 0.5
    assert result.n_samples == df.height
    assert len(result.explained_variance_ratio) == result.n_components
    assert sum(result.explained_variance_ratio) == pytest.approx(1.0, abs=1e-6)
    assert result.cumulative_variance[-1] == pytest.approx(1.0, abs=1e-6)
    # A dominant single latent factor should explain most of the variance in PC1
    assert result.explained_variance_ratio[0] > 0.7


def test_pca_blocks_on_low_kmo():
    df, variables = _independent_dataset()

    with pytest.raises(PCAValidationError):
        run_pca(df, variables)


def test_pca_requires_at_least_two_variables():
    df, variables = _correlated_dataset()

    with pytest.raises(PCAValidationError):
        run_pca(df, variables[:1])
