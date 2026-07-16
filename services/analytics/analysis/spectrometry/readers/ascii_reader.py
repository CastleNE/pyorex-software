"""
Generic delimited/whitespace spectral file reader — CSV/TXT/ASCII with a
wavelength column and one (single-spectrum) or many (wide-table) reflectance
columns. Auto-detects delimiter and decimal separator; never assumes a fixed
file structure (spec: don't require specific column names).
"""
from __future__ import annotations

import re
from pathlib import Path

from analysis.spectrometry.readers.common import AsciiFormatError, RawSpectrum

_DELIMITERS = [",", "\t", ";"]
_MIN_POINTS = 5


def _sniff_delimiter(lines: list[str]) -> str | None:
    for delim in _DELIMITERS:
        counts = {len(line.split(delim)) for line in lines if line.strip()}
        if len(counts) == 1 and next(iter(counts)) >= 2:
            return delim
    return None


def _to_float(token: str) -> float | None:
    token = token.strip()
    if not token:
        return None
    try:
        return float(token)
    except ValueError:
        pass
    # Try decimal-comma locale (e.g. "1234,56")
    if token.count(",") == 1 and token.count(".") == 0:
        try:
            return float(token.replace(",", "."))
        except ValueError:
            return None
    return None


def _split_line(line: str, delimiter: str | None) -> list[str]:
    if delimiter is None:
        return re.split(r"\s+", line.strip())
    return line.split(delimiter)


def _read_lines(path: str) -> list[str]:
    with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
        return [ln.rstrip("\n\r") for ln in f.readlines()]


def read_ascii_spectrum(path: str) -> RawSpectrum:
    """Single 2-column (wavelength, reflectance) spectrum file."""
    p = Path(path)
    lines = [ln for ln in _read_lines(path) if ln.strip() != ""]
    if len(lines) < _MIN_POINTS:
        raise AsciiFormatError(f"File too short to be a spectrum: {p.name}")

    delimiter = _sniff_delimiter(lines)

    data_rows: list[tuple[float, float]] = []
    metadata: dict[str, str] = {}
    header_done = False
    for line in lines:
        tokens = _split_line(line, delimiter)
        if len(tokens) < 2:
            continue
        wl = _to_float(tokens[0])
        refl = _to_float(tokens[1])
        if wl is None or refl is None:
            if not header_done and ":" in line:
                key, _, value = line.partition(":")
                metadata[key.strip()] = value.strip()
            continue
        header_done = True
        data_rows.append((wl, refl))

    if len(data_rows) < _MIN_POINTS:
        raise AsciiFormatError(f"Could not find enough numeric (wavelength, reflectance) rows in {p.name}")

    data_rows.sort(key=lambda r: r[0])
    wavelength = [r[0] for r in data_rows]
    reflectance = [r[1] for r in data_rows]

    warnings: list[str] = []
    if wavelength != sorted(set(wavelength)):
        warnings.append("Duplicate wavelength values found — kept as-is, sorted by wavelength.")

    fmt = "ascii_csv" if p.suffix.lower() == ".csv" else "ascii_txt"
    return RawSpectrum(
        filename=p.name,
        original_path=str(p),
        format=fmt,
        instrument=metadata.get("Instrument") or metadata.get("instrument"),
        wavelength=wavelength,
        reflectance=reflectance,
        acquisition_date=metadata.get("Date") or metadata.get("date"),
        metadata=metadata,
        warnings=warnings,
    )


def read_ascii_table(path: str) -> list[RawSpectrum]:
    """Wide table: column 1 = monotonic-increasing wavelength axis, every
    other column = one spectrum (column header = spectrum/sample name).
    Detected by monotonicity of column 1, not by filename."""
    p = Path(path)
    lines = [ln for ln in _read_lines(path) if ln.strip() != ""]
    if len(lines) < _MIN_POINTS + 1:
        raise AsciiFormatError(f"File too short to be a spectral table: {p.name}")

    delimiter = _sniff_delimiter(lines) or ","
    header = _split_line(lines[0], delimiter)
    if len(header) < 2:
        raise AsciiFormatError(f"Could not detect a delimited table header in {p.name}")

    rows: list[list[str]] = [_split_line(ln, delimiter) for ln in lines[1:]]
    rows = [r for r in rows if len(r) == len(header)]
    if len(rows) < _MIN_POINTS:
        raise AsciiFormatError(f"Not enough consistent data rows in {p.name}")

    wl_col = [_to_float(r[0]) for r in rows]
    if any(v is None for v in wl_col):
        raise AsciiFormatError(f"First column is not fully numeric in {p.name} — expected a wavelength axis")
    if wl_col != sorted(wl_col):
        raise AsciiFormatError(f"First column is not monotonic increasing in {p.name} — not a valid wavelength axis")

    spectra: list[RawSpectrum] = []
    for col_idx in range(1, len(header)):
        refl_col = [_to_float(r[col_idx]) for r in rows]
        if sum(1 for v in refl_col if v is not None) < _MIN_POINTS:
            continue  # not a numeric spectrum column, skip silently (e.g. a comment column)
        paired = [(w, r) for w, r in zip(wl_col, refl_col) if r is not None]
        spectra.append(
            RawSpectrum(
                filename=f"{p.name}#{header[col_idx].strip()}",
                original_path=str(p),
                format="ascii_csv" if p.suffix.lower() == ".csv" else "ascii_txt",
                instrument=None,
                wavelength=[w for w, _ in paired],
                reflectance=[r for _, r in paired],
                acquisition_date=None,
                metadata={"column_name": header[col_idx].strip(), "source_file": p.name},
                warnings=[],
            )
        )

    if not spectra:
        raise AsciiFormatError(f"No numeric spectrum columns found in {p.name}")
    return spectra
