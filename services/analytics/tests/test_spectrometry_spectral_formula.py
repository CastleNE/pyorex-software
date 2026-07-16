import numpy as np
import pytest

from analysis.data.formula import FormulaError
from analysis.spectrometry.spectral_formula import evaluate_spectral_formula


def _spectrum():
    wl = np.arange(2100, 2400, 1.0)
    refl = 0.3 + 0.0001 * (wl - 2200)
    return wl, refl


def test_reflectance_ratio_formula():
    wl, refl = _spectrum()
    value = evaluate_spectral_formula("REFLECTANCE(2200) / REFLECTANCE(2100)", wl, refl)
    assert value == pytest.approx(refl[100] / refl[0], abs=1e-6)


def test_depth_lookup_formula():
    wl, refl = _spectrum()
    value = evaluate_spectral_formula('DEPTH("AlOH_2200")', wl, refl, {"AlOH_2200": 0.15})
    assert value == pytest.approx(0.15)


def test_depth_on_unextracted_feature_raises():
    wl, refl = _spectrum()
    with pytest.raises(FormulaError):
        evaluate_spectral_formula('DEPTH("NeverExtracted")', wl, refl, {})


def test_reflectance_non_numeric_argument_rejected():
    wl, refl = _spectrum()
    with pytest.raises(FormulaError):
        evaluate_spectral_formula('REFLECTANCE("not_a_number")', wl, refl)


@pytest.mark.parametrize("adversarial", [
    '__import__("os").system("echo pwned")',
    'exec("1")',
    "().__class__",
    "[x for x in range(3)]",
    'open("f")',
])
def test_adversarial_formulas_rejected(adversarial):
    wl, refl = _spectrum()
    with pytest.raises(FormulaError):
        evaluate_spectral_formula(adversarial, wl, refl)


def test_bare_name_reference_rejected_unlike_tabular_formula():
    """Unlike the DATA-screen tabular formula engine, spectral formulas have
    no 'columns' — a bare Name that isn't REFLECTANCE/DEPTH/a math function
    is always invalid here."""
    wl, refl = _spectrum()
    with pytest.raises(FormulaError):
        evaluate_spectral_formula("Au_ppm * 2", wl, refl)


def test_extra_allowed_funcs_does_not_change_default_data_formula_behavior():
    """Regression: formula.py's own default (DATA-screen calculated columns)
    must still reject REFLECTANCE/DEPTH when extra_allowed_funcs isn't passed."""
    from analysis.data.formula import parse_and_validate

    with pytest.raises(FormulaError):
        parse_and_validate("REFLECTANCE(2200)")
