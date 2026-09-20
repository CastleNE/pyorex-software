"""Canonical ratio arithmetic (Phase 2A)."""


def calculate_ratio(numerator: float, denominator: float) -> float:
    """``numerator / denominator``; the single division used by every ratio-like calculation.

    Reproduces the historical ``engine._divide`` exactly:
      * ``denominator <= 0`` raises ``ValueError('Denominador no positivo')``;
      * a zero numerator is valid and gives ``0.0``.

    The inputs are expected to be already validated, unit-normalized values: this function converts no units and
    does not validate the numerator (negative concentrations are rejected earlier by the pipeline).
    """
    if denominator <= 0:
        raise ValueError('Denominador no positivo')
    return numerator / denominator
