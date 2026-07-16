"""
QAQC report aggregator — combines blanks/duplicates/CRM into one payload.
No PDF/rendering here (RF-10.6.4's PDF export is blocked on a separate,
not-yet-decided PDF-engine ADR) — this is the structured data a future
PDF/HTML renderer would consume.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

import polars as pl

from analysis.qaqc.blanks import BlankFlag, analyze_blanks
from analysis.qaqc.crm import CRMResult, analyze_crm
from analysis.qaqc.duplicates import DuplicatePair, analyze_duplicates


@dataclass
class QaqcSummary:
    n_samples_by_type: dict[str, int] = field(default_factory=dict)
    n_flags_by_severity: dict[str, int] = field(default_factory=dict)
    n_blank_flags: int = 0
    n_duplicate_pairs: int = 0
    n_duplicate_failures: int = 0
    n_crm_results: int = 0
    n_crm_failures: int = 0


@dataclass
class QaqcReport:
    dataset_id: str
    generated_at: str
    summary: QaqcSummary
    blank_flags: list[BlankFlag]
    duplicate_pairs: list[DuplicatePair]
    crm_results: list[CRMResult]
    warnings: list[str] = field(default_factory=list)


def build_qaqc_report(
    df: pl.DataFrame,
    dataset_id: str,
    sample_type_col: str,
    variables: list[str],
    crm_values: dict[str, dict[str, float]],
    blank_factor: float = 0.20,
    lod_values: dict[str, float] | None = None,
    fd_threshold: float = 20.0,
    ld_threshold: float = 15.0,
    crm_warning_pct: float = 15.0,
    crm_failure_pct: float = 25.0,
) -> QaqcReport:
    warnings: list[str] = []

    n_samples_by_type: dict[str, int] = {}
    for row in df.get_column(sample_type_col).value_counts().iter_rows(named=True):
        n_samples_by_type[str(row[sample_type_col])] = int(row["count"])

    blank_flags = analyze_blanks(df, sample_type_col, variables, blank_factor, lod_values)

    duplicate_pairs = analyze_duplicates(df, sample_type_col, variables, None, fd_threshold, ld_threshold)

    if not crm_values:
        warnings.append("La biblioteca de CRM está vacía — el análisis de CRM fue omitido.")
        crm_results: list[CRMResult] = []
    else:
        crm_results = analyze_crm(df, sample_type_col, variables, crm_values, crm_warning_pct, crm_failure_pct)

    n_flags_by_severity = {"critical": 0, "warning": 0, "fail": 0, "pass": 0}
    for flag in blank_flags:
        n_flags_by_severity[flag.severity] = n_flags_by_severity.get(flag.severity, 0) + 1
    for pair in duplicate_pairs:
        n_flags_by_severity[pair.status] = n_flags_by_severity.get(pair.status, 0) + 1
    for result in crm_results:
        n_flags_by_severity[result.status] = n_flags_by_severity.get(result.status, 0) + 1

    if not blank_flags and n_samples_by_type.get("FB", 0) == 0 and n_samples_by_type.get("LB", 0) == 0:
        warnings.append("No se encontraron muestras de blanco (FB/LB) en el dataset.")
    if not duplicate_pairs and n_samples_by_type.get("FD", 0) == 0 and n_samples_by_type.get("LD", 0) == 0:
        warnings.append("No se encontraron muestras duplicadas (FD/LD) en el dataset.")

    summary = QaqcSummary(
        n_samples_by_type=n_samples_by_type,
        n_flags_by_severity=n_flags_by_severity,
        n_blank_flags=len(blank_flags),
        n_duplicate_pairs=len(duplicate_pairs),
        n_duplicate_failures=sum(1 for p in duplicate_pairs if p.status == "fail"),
        n_crm_results=len(crm_results),
        n_crm_failures=sum(1 for r in crm_results if r.status == "fail"),
    )

    return QaqcReport(
        dataset_id=dataset_id,
        generated_at=datetime.now(timezone.utc).isoformat(),
        summary=summary,
        blank_flags=blank_flags,
        duplicate_pairs=duplicate_pairs,
        crm_results=crm_results,
        warnings=warnings,
    )
