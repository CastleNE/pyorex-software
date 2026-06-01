"""
QAQC - CRM (Certified Reference Material) Analysis
Measures analytical accuracy via %Recovery.
"""
from __future__ import annotations
import polars as pl
from dataclasses import dataclass


@dataclass
class CRMResult:
    sample_id: str
    crm_name: str
    recovery_by_variable: dict[str, float]
    warning_variables: list[str]
    failed_variables: list[str]
    status: str  # "pass" | "warning" | "fail"


def calculate_recovery(measured: float, certified: float) -> float | None:
    """%Recovery = (measured / certified) * 100"""
    if certified == 0:
        return None
    return (measured / certified) * 100.0


def analyze_crm(
    df: pl.DataFrame,
    sample_type_col: str,
    variables: list[str],
    crm_values: dict[str, dict[str, float]],
    warning_threshold_pct: float = 15.0,
    failure_threshold_pct: float = 25.0,
) -> list[CRMResult]:
    """
    Analyze CRM samples and calculate %Recovery per variable (RF-10.4).

    crm_values: { "CRM_NAME": { "C1": 85.3, "C2": 12.1, ... } }
    warning_threshold_pct: Recovery outside [100-x, 100+x]% = warning
    failure_threshold_pct: Recovery outside [100-x, 100+x]% = failure
    """
    results: list[CRMResult] = []
    sample_id_col = _infer_sample_id_column(df)
    crm_name_col = _infer_crm_name_column(df)

    crm_mask = df[sample_type_col] == "CRM"
    crm_df = df.filter(crm_mask)

    if len(crm_df) == 0:
        return results

    for row in crm_df.iter_rows(named=True):
        sample_id = str(row.get(sample_id_col, ""))

        # Find CRM name from the data
        crm_name = None
        if crm_name_col:
            raw_name = str(row.get(crm_name_col, "")).strip()
            # Match against known CRM names
            for known_name in crm_values:
                if known_name.lower() in raw_name.lower() or raw_name.lower() in known_name.lower():
                    crm_name = known_name
                    break
        if crm_name is None and len(crm_values) == 1:
            crm_name = list(crm_values.keys())[0]
        if crm_name is None:
            continue

        certified = crm_values[crm_name]
        recovery_by_var: dict[str, float] = {}
        warnings: list[str] = []
        failures: list[str] = []

        for var in variables:
            if var not in certified:
                continue
            measured = row.get(var)
            if measured is None:
                continue
            recovery = calculate_recovery(float(measured), certified[var])
            if recovery is None:
                continue

            recovery_by_var[var] = round(recovery, 2)
            deviation = abs(recovery - 100.0)

            if deviation > failure_threshold_pct:
                failures.append(var)
            elif deviation > warning_threshold_pct:
                warnings.append(var)

        status = "pass"
        if failures:
            status = "fail"
        elif warnings:
            status = "warning"

        results.append(
            CRMResult(
                sample_id=sample_id,
                crm_name=crm_name,
                recovery_by_variable=recovery_by_var,
                warning_variables=warnings,
                failed_variables=failures,
                status=status,
            )
        )

    return results


def _infer_sample_id_column(df: pl.DataFrame) -> str:
    candidates = ["sample_id", "sampleid", "id", "sample", "muestra", "codigo"]
    lower_cols = {c.lower(): c for c in df.columns}
    for c in candidates:
        if c in lower_cols:
            return lower_cols[c]
    return df.columns[0]


def _infer_crm_name_column(df: pl.DataFrame) -> str | None:
    candidates = ["crm_name", "crm", "standard", "reference", "ref_material"]
    lower_cols = {c.lower(): c for c in df.columns}
    for c in candidates:
        if c in lower_cols:
            return lower_cols[c]
    return None
