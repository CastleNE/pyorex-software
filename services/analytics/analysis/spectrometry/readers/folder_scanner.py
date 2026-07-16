"""Batch-scan a file/list-of-files/folder for spectra — one bad file never
aborts the batch (spec: proceed with valid files only, report invalid ones)."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from analysis.spectrometry.readers.common import RawSpectrum, ReadError
from analysis.spectrometry.readers.dispatch import read_any

SUPPORTED_EXTENSIONS = {".asd", ".sed", ".csv", ".txt", ".asc"}


@dataclass
class ScanFailure:
    path: str
    reason: str


@dataclass
class ScanResult:
    spectra: list[RawSpectrum] = field(default_factory=list)
    failures: list[ScanFailure] = field(default_factory=list)


def _iter_files(paths: list[str], recursive: bool) -> list[Path]:
    files: list[Path] = []
    for raw in paths:
        p = Path(raw)
        if p.is_dir():
            pattern = "**/*" if recursive else "*"
            files.extend(sorted(f for f in p.glob(pattern) if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS))
        elif p.is_file():
            files.append(p)
    return files


def scan_paths(paths: list[str], recursive: bool = True) -> ScanResult:
    """paths: files and/or folders, mixed formats allowed."""
    result = ScanResult()
    for path in _iter_files(paths, recursive):
        try:
            result.spectra.append(read_any(str(path)))
        except ReadError as exc:
            result.failures.append(ScanFailure(path=str(path), reason=str(exc)))
        except Exception as exc:  # noqa: BLE001 — any unexpected reader bug still shouldn't abort the batch
            result.failures.append(ScanFailure(path=str(path), reason=f"Unexpected error: {exc}"))
    return result
