import pytest
import polars as pl

from analysis.qaqc.duplicates import analyze_duplicates, calculate_rpd


def test_no_duplicates_in_dataset_returns_empty_list():
    df = pl.DataFrame({
        "sample_id": ["S-1", "S-2"],
        "__sample_type__": ["S", "S"],
        "Au": [10.0, 20.0],
    })
    assert analyze_duplicates(df, "__sample_type__", ["Au"]) == []


def test_duplicate_as_first_row_with_no_preceding_original_is_skipped():
    df = pl.DataFrame({
        "sample_id": ["FD-1", "S-1"],
        "__sample_type__": ["FD", "S"],
        "Au": [10.0, 12.0],
    })
    pairs = analyze_duplicates(df, "__sample_type__", ["Au"])
    assert pairs == []


def test_both_below_lod_average_zero_rpd_is_none():
    assert calculate_rpd(0.0, 0.0) is None


def test_positional_pairing_computes_rpd_and_status():
    df = pl.DataFrame({
        "sample_id": ["S-1", "FD-1"],
        "__sample_type__": ["S", "FD"],
        "Au": [10.0, 12.0],  # RPD = |10-12|/11*100 = 18.18%
    })
    pairs = analyze_duplicates(df, "__sample_type__", ["Au"], fd_threshold=20.0)
    assert len(pairs) == 1
    assert pairs[0].rpd_by_variable["Au"] == pytest.approx(18.18, abs=0.01)
    assert pairs[0].status == "pass"  # under FD threshold of 20%


def test_same_rpd_passes_fd_but_fails_ld_threshold():
    # RPD ~18.18%: passes FD (threshold 20%) but fails LD (threshold 15%)
    df_fd = pl.DataFrame({
        "sample_id": ["S-1", "FD-1"],
        "__sample_type__": ["S", "FD"],
        "Au": [10.0, 12.0],
    })
    df_ld = pl.DataFrame({
        "sample_id": ["S-1", "LD-1"],
        "__sample_type__": ["S", "LD"],
        "Au": [10.0, 12.0],
    })
    fd_pairs = analyze_duplicates(df_fd, "__sample_type__", ["Au"], fd_threshold=20.0, ld_threshold=15.0)
    ld_pairs = analyze_duplicates(df_ld, "__sample_type__", ["Au"], fd_threshold=20.0, ld_threshold=15.0)

    assert fd_pairs[0].status == "pass"
    assert ld_pairs[0].status in ("warning", "fail")
    assert "Au" in ld_pairs[0].failed_variables


def test_explicit_original_id_column_and_positional_fallback_agree():
    df = pl.DataFrame({
        "sample_id": ["S-1", "FD-1"],
        "original_id": [None, "S-1"],
        "__sample_type__": ["S", "FD"],
        "Au": [10.0, 12.0],
    })
    explicit = analyze_duplicates(df, "__sample_type__", ["Au"], original_id_col="original_id")
    positional = analyze_duplicates(df, "__sample_type__", ["Au"])

    assert len(explicit) == 1 and len(positional) == 1
    assert explicit[0].rpd_by_variable == positional[0].rpd_by_variable
