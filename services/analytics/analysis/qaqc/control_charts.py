"""
QAQC - Shewhart Control Charts + Westgard Rules
Tracks analytical performance over time using CRM recovery data.
"""
from __future__ import annotations
import numpy as np
from dataclasses import dataclass, field


@dataclass
class WestgardViolation:
    rule: str          # "1_3s" | "2_2s" | "10x" | "drift"
    description: str
    affected_indices: list[int]
    severity: str      # "warning" | "reject"


@dataclass
class ControlChartResult:
    points: list[dict]          # [{index, sample_id, recovery_pct, status}]
    mean: float
    sigma: float
    ucl_1s: float
    ucl_2s: float
    ucl_3s: float
    lcl_1s: float
    lcl_2s: float
    lcl_3s: float
    westgard_violations: list[WestgardViolation]
    n_points: int


def build_shewhart_chart(
    recovery_series: list[tuple[str, float]],  # [(sample_id, recovery_pct), ...]
    warning_pct: float = 15.0,
    failure_pct: float = 25.0,
) -> ControlChartResult:
    """
    Build Shewhart control chart for CRM recovery data (RF-10.5).

    Uses historical mean and sigma from the series itself.
    Applies Westgard rules to detect systematic errors.
    """
    if len(recovery_series) < 2:
        raise ValueError("Need at least 2 CRM points for control chart")

    sample_ids = [s[0] for s in recovery_series]
    values = np.array([s[1] for s in recovery_series], dtype=float)

    mean = float(np.mean(values))
    sigma = float(np.std(values, ddof=1))

    ucl_1s = mean + 1 * sigma
    ucl_2s = mean + 2 * sigma
    ucl_3s = mean + 3 * sigma
    lcl_1s = mean - 1 * sigma
    lcl_2s = mean - 2 * sigma
    lcl_3s = mean - 3 * sigma

    # Classify each point
    points = []
    for i, (sid, val) in enumerate(recovery_series):
        deviation = abs(val - 100.0)
        if deviation > failure_pct or abs(val - mean) > 3 * sigma:
            status = "fail"
        elif deviation > warning_pct or abs(val - mean) > 2 * sigma:
            status = "warning"
        else:
            status = "pass"
        points.append({"index": i, "sample_id": sid, "recovery_pct": round(val, 2), "status": status})

    violations = _apply_westgard_rules(values, mean, sigma)

    return ControlChartResult(
        points=points,
        mean=round(mean, 2),
        sigma=round(sigma, 3),
        ucl_1s=round(ucl_1s, 2),
        ucl_2s=round(ucl_2s, 2),
        ucl_3s=round(ucl_3s, 2),
        lcl_1s=round(lcl_1s, 2),
        lcl_2s=round(lcl_2s, 2),
        lcl_3s=round(lcl_3s, 2),
        westgard_violations=violations,
        n_points=len(values),
    )


def _apply_westgard_rules(
    values: np.ndarray,
    mean: float,
    sigma: float,
) -> list[WestgardViolation]:
    """Apply Westgard multi-rule QC to the recovery series."""
    violations: list[WestgardViolation] = []
    n = len(values)
    z_scores = (values - mean) / (sigma if sigma > 0 else 1.0)

    # 1_3s: Any single point beyond ±3σ → reject
    for i, z in enumerate(z_scores):
        if abs(z) > 3.0:
            violations.append(WestgardViolation(
                rule="1_3s",
                description=f"Point {i} is beyond 3σ (recovery={values[i]:.1f}%)",
                affected_indices=[i],
                severity="reject",
            ))

    # 2_2s: Two consecutive points beyond the same ±2σ limit → reject
    for i in range(1, n):
        if z_scores[i] > 2.0 and z_scores[i - 1] > 2.0:
            violations.append(WestgardViolation(
                rule="2_2s",
                description=f"Points {i-1} and {i} both beyond +2σ",
                affected_indices=[i - 1, i],
                severity="reject",
            ))
        elif z_scores[i] < -2.0 and z_scores[i - 1] < -2.0:
            violations.append(WestgardViolation(
                rule="2_2s",
                description=f"Points {i-1} and {i} both beyond -2σ",
                affected_indices=[i - 1, i],
                severity="reject",
            ))

    # 10x: 10 consecutive points on the same side of the mean → systematic bias
    if n >= 10:
        for start in range(n - 9):
            window = z_scores[start:start + 10]
            if all(z > 0 for z in window) or all(z < 0 for z in window):
                violations.append(WestgardViolation(
                    rule="10x",
                    description=f"10 consecutive points on same side of mean (indices {start}-{start+9})",
                    affected_indices=list(range(start, start + 10)),
                    severity="warning",
                ))
                break  # Report first occurrence only

    # Drift: significant linear trend in last 5+ points
    if n >= 5:
        last = values[-min(5, n):]
        x = np.arange(len(last), dtype=float)
        if np.std(last) > 0:
            corr = float(np.corrcoef(x, last)[0, 1])
            if abs(corr) > 0.9:
                violations.append(WestgardViolation(
                    rule="drift",
                    description=f"Linear drift detected in last {len(last)} points (r={corr:.2f})",
                    affected_indices=list(range(n - len(last), n)),
                    severity="warning",
                ))

    return violations
