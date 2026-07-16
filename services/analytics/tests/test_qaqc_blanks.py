import polars as pl

from analysis.qaqc.blanks import analyze_blanks, calculate_blank_thresholds


def _regular_rows(n=10, value=10.0):
    return {"sample_id": [f"S-{i}" for i in range(n)], "__sample_type__": ["S"] * n, "Au": [value] * n}


def test_blank_exactly_at_threshold_not_flagged():
    regs = _regular_rows()
    df = pl.DataFrame({
        "sample_id": regs["sample_id"] + ["FB-1"],
        "__sample_type__": regs["__sample_type__"] + ["FB"],
        "Au": regs["Au"] + [2.0],  # p10 of regulars(10.0) * 0.2 = 2.0 exactly
    })
    thresholds = calculate_blank_thresholds(df.filter(pl.col("__sample_type__") == "S"), ["Au"])
    assert thresholds["Au"] == 2.0

    flags = analyze_blanks(df, "__sample_type__", ["Au"])
    assert flags == []  # strict '>' comparison — exactly-at-threshold does not flag


def test_blank_one_variable_over_threshold_is_warning():
    regs = _regular_rows()
    df = pl.DataFrame({
        "sample_id": regs["sample_id"] + ["FB-1"],
        "__sample_type__": regs["__sample_type__"] + ["FB"],
        "Au": regs["Au"] + [999.0],
    })
    flags = analyze_blanks(df, "__sample_type__", ["Au"])
    assert len(flags) == 1
    assert flags[0].severity == "warning"


def test_blank_with_two_contaminated_variables_is_warning():
    regs = _regular_rows()
    df = pl.DataFrame({
        "sample_id": regs["sample_id"] + ["FB-1"],
        "__sample_type__": regs["__sample_type__"] + ["FB"],
        "Au": regs["Au"] + [999.0],
        "Cu": [10.0] * 10 + [999.0],
    })
    flags = analyze_blanks(df, "__sample_type__", ["Au", "Cu"])
    assert len(flags) == 2
    assert all(f.severity == "warning" for f in flags)


def test_blank_with_three_contaminated_variables_is_critical():
    regs = _regular_rows()
    df = pl.DataFrame({
        "sample_id": regs["sample_id"] + ["FB-1"],
        "__sample_type__": regs["__sample_type__"] + ["FB"],
        "Au": regs["Au"] + [999.0],
        "Cu": [10.0] * 10 + [999.0],
        "Zn": [10.0] * 10 + [999.0],
    })
    flags = analyze_blanks(df, "__sample_type__", ["Au", "Cu", "Zn"])
    assert len(flags) == 3
    assert all(f.severity == "critical" for f in flags)


def test_no_blanks_in_dataset_returns_empty_list():
    df = pl.DataFrame(_regular_rows())
    flags = analyze_blanks(df, "__sample_type__", ["Au"])
    assert flags == []


def test_lod_override_raises_threshold():
    regs = _regular_rows(value=1.0)  # p10 * 0.2 would be ~0.2 without LOD override
    df = pl.DataFrame({
        "sample_id": regs["sample_id"] + ["FB-1"],
        "__sample_type__": regs["__sample_type__"] + ["FB"],
        "Au": regs["Au"] + [0.5],
    })
    thresholds = calculate_blank_thresholds(
        df.filter(pl.col("__sample_type__") == "S"), ["Au"], lod_values={"Au": 5.0}
    )
    assert thresholds["Au"] == 5.0
    flags = analyze_blanks(df, "__sample_type__", ["Au"], lod_values={"Au": 5.0})
    assert flags == []  # 0.5 < LOD-derived threshold of 5.0
