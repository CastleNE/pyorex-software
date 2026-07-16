"""
Spectral index formula engine — REUSES analysis/data/formula.py's AST
whitelist validator (parse_and_validate, ALLOWED_FUNCS, IF_FUNC, FormulaError)
via its additive `extra_allowed_funcs` parameter, instead of re-implementing
the security-critical validation logic. This is a THIRD execution mode
alongside formula.py's existing two (row-sample preview, dataframe-vectorized
apply): it evaluates a formula once per spectrum using that spectrum's own
wavelength/reflectance arrays and already-extracted features — never a
dataframe column.
"""
from __future__ import annotations

import numpy as np
from asteval import Interpreter

from analysis.data.formula import ALLOWED_FUNCS, IF_FUNC, FormulaError, parse_and_validate

SPECTRAL_EXTRA_FUNCS = frozenset({"REFLECTANCE", "DEPTH"})


def _make_spectral_interpreter(wavelength: np.ndarray, reflectance: np.ndarray, features_for_spectrum: dict[str, float]) -> Interpreter:
    interp = Interpreter(minimal=True, use_numpy=False)
    interp.symtable["log10"] = __import__("math").log10
    interp.symtable["sqrt"] = __import__("math").sqrt
    interp.symtable["abs"] = abs
    interp.symtable["log"] = __import__("math").log
    interp.symtable["exp"] = __import__("math").exp
    interp.symtable[IF_FUNC] = lambda cond, a, b: a if cond else b

    def _reflectance(wl):
        if not isinstance(wl, (int, float)):
            raise TypeError(f"REFLECTANCE() expects a numeric wavelength, got {type(wl).__name__}")
        return float(np.interp(float(wl), wavelength, reflectance))

    def _depth(feature_name):
        if feature_name not in features_for_spectrum:
            raise FormulaError(f"Feature {feature_name!r} has not been extracted for this spectrum yet")
        return float(features_for_spectrum[feature_name])

    interp.symtable["REFLECTANCE"] = _reflectance
    interp.symtable["DEPTH"] = _depth
    return interp


def evaluate_spectral_formula(
    formula: str,
    wavelength: np.ndarray,
    reflectance: np.ndarray,
    features_for_spectrum: dict[str, float] | None = None,
) -> float:
    """Validates `formula` against ALLOWED_FUNCS + REFLECTANCE/DEPTH, then
    evaluates it once against this spectrum's arrays/features. Raises
    FormulaError on anything unsafe or on a reference to a never-extracted
    feature (enforcing the spec's required extraction-before-indices order)."""
    parsed = parse_and_validate(formula, extra_allowed_funcs=SPECTRAL_EXTRA_FUNCS)
    if parsed.column_refs:
        # Any bare Name that isn't a whitelisted function is not a valid
        # reference in a spectral formula (unlike the DATA-screen tabular
        # formula, there are no "columns" here — only REFLECTANCE()/DEPTH()).
        raise FormulaError(f"Unknown reference(s) in spectral formula: {', '.join(sorted(parsed.column_refs))}")

    interp = _make_spectral_interpreter(wavelength, reflectance, features_for_spectrum or {})
    interp.error = []
    result = interp(formula)
    if interp.error:
        raise FormulaError(str(interp.error[0].get_error()))
    if not isinstance(result, (int, float)):
        raise FormulaError(f"Spectral formula did not evaluate to a number (got {type(result).__name__})")
    return float(result)
