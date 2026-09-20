import polars as pl

from analysis.lithogeochemistry.tas import classify_dataframe, classify_series, counts_by_series


def test_series_boundaries():
    assert classify_series(44.9) == "Ultrabasic"
    assert classify_series(45.0) == "Basic"
    assert classify_series(51.9) == "Basic"
    assert classify_series(52.0) == "Intermediate"
    assert classify_series(62.9) == "Intermediate"
    assert classify_series(63.0) == "Acid"
    assert classify_series(75.0) == "Acid"


def test_series_invalid_inputs():
    assert classify_series(None) == "Invalid"
    assert classify_series(-1.0) == "Invalid"
    assert classify_series(101.0) == "Invalid"


def _df() -> pl.DataFrame:
    return pl.DataFrame({
        "sample_id": ["S1", "S2", "S3", "S4"],
        "SiO2": [50.0, 75.0, None, -5.0],
        "Na2O": [2.0, 4.0, 1.0, 1.0],
        "K2O": [1.0, 4.0, 1.0, 1.0],
    })


def test_classify_dataframe_series_and_total_alkali():
    samples = classify_dataframe(_df(), "SiO2", "Na2O", "K2O")
    assert [s.series for s in samples] == ["Basic", "Acid", "Invalid", "Invalid"]
    assert samples[0].total_alkali == 3.0
    assert samples[1].total_alkali == 8.0


def test_classify_dataframe_negative_alkali_is_invalid():
    df = pl.DataFrame({
        "sample_id": ["S1"],
        "SiO2": [50.0],
        "Na2O": [-1.0],
        "K2O": [1.0],
    })
    samples = classify_dataframe(df, "SiO2", "Na2O", "K2O")
    assert samples[0].series == "Invalid"
    assert samples[0].total_alkali is None


def test_classify_dataframe_unknown_column_rejected():
    import pytest
    with pytest.raises(ValueError):
        classify_dataframe(_df(), "does_not_exist", "Na2O", "K2O")


def test_counts_by_series():
    samples = classify_dataframe(_df(), "SiO2", "Na2O", "K2O")
    counts = counts_by_series(samples)
    assert counts["Basic"] == 1
    assert counts["Acid"] == 1
    assert counts["Invalid"] == 2
    assert counts["Ultrabasic"] == 0
