import polars as pl
import pytest

from analysis.data.formula import FormulaError, apply_formula_to_dataframe, evaluate_preview, parse_and_validate


def _df() -> pl.DataFrame:
    return pl.DataFrame({"Cu_ppm": [10.0, 20.0, 0.0], "Au_ppm": [1.0, 2.0, 0.0]})


@pytest.mark.parametrize(
    "formula,expected",
    [
        ("Cu_ppm * 1000", [10000.0, 20000.0, 0.0]),
        ("Cu_ppm + Au_ppm", [11.0, 22.0, 0.0]),
        ("IF(Au_ppm > 0.5, 1, 0)", [1, 1, 0]),
    ],
)
def test_apply_formula_valid(formula, expected):
    result = apply_formula_to_dataframe(formula, _df()).to_list()
    assert result == expected


def test_apply_formula_log10():
    result = apply_formula_to_dataframe("log10(Cu_ppm)", _df()).to_list()
    assert result[0] == pytest.approx(1.0)
    assert result[2] == float("-inf")


def test_preview_and_apply_agree_on_valid_formula():
    df = _df()
    preview = evaluate_preview("Cu_ppm / Au_ppm", df, ["Cu_ppm", "Au_ppm"], sample_size=10)
    applied = apply_formula_to_dataframe("Cu_ppm / Au_ppm", df).to_list()
    # Row 0: 10/1=10, row1: 20/2=10, row2: 0/0 -> error in preview, null/inf in polars
    assert preview["values"][0] == pytest.approx(10.0)
    assert preview["values"][1] == pytest.approx(10.0)
    assert applied[0] == pytest.approx(10.0)
    assert applied[1] == pytest.approx(10.0)


def test_unknown_column_rejected():
    with pytest.raises(FormulaError):
        apply_formula_to_dataframe("Nonexistent_col * 2", _df())


@pytest.mark.parametrize(
    "adversarial",
    [
        '__import__("os").system("echo pwned")',
        'exec("1")',
        "().__class__",
        "[x for x in range(3)]",
        'open("f")',
        "lambda x: x",
        "Cu_ppm.__class__",
    ],
)
def test_adversarial_formulas_rejected(adversarial):
    with pytest.raises(FormulaError):
        parse_and_validate(adversarial)


def test_preview_and_commit_agree_on_adversarial_rejection():
    """Preview (asteval-gate) and full apply (pl.Expr translator) share ONE
    validation pass — they must never disagree on what's rejected."""
    bad = '__import__("os").system("echo pwned")'
    df = _df()
    with pytest.raises(FormulaError):
        evaluate_preview(bad, df, [])
    with pytest.raises(FormulaError):
        apply_formula_to_dataframe(bad, df)


def test_empty_formula_rejected():
    with pytest.raises(FormulaError):
        parse_and_validate("")


def test_if_requires_three_args():
    with pytest.raises(FormulaError):
        parse_and_validate("IF(Cu_ppm > 1, 1)")
