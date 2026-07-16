"""
SED (Spectral Evolution / OreXpress) reader — **EXPERIMENTAL**, no real
instrument files available to validate against. Assumed structure: an INI-like
"Key: Value" header block, followed by a whitespace/tab-separated data table
whose header row contains a wavelength column ("Wvl"/"Wavelength") and a
reflectance column (name containing "reflect", case-insensitive; falls back
to the last column — a documented, disclosed assumption, not silently
guessed). Missing mandatory structure -> SedFormatError, never a partial read.
"""
from __future__ import annotations

from pathlib import Path

from analysis.spectrometry.readers.common import RawSpectrum, SedFormatError


def _read_lines(path: str) -> list[str]:
    with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
        return [ln.rstrip("\n\r") for ln in f.readlines()]


def _looks_like_column_header(line: str) -> bool:
    lower = line.lower()
    return ("wvl" in lower or "wavelength" in lower) and not line.strip().startswith("#")


def read_sed_spectrum(path: str) -> RawSpectrum:
    p = Path(path)
    lines = _read_lines(path)
    if len(lines) < 10:
        raise SedFormatError(f"File too short to be a SED spectrum: {p.name}")

    metadata: dict[str, str] = {}
    header_row_idx: int | None = None
    for i, line in enumerate(lines):
        if _looks_like_column_header(line):
            header_row_idx = i
            break
        if ":" in line:
            key, _, value = line.partition(":")
            metadata[key.strip()] = value.strip()

    if header_row_idx is None:
        raise SedFormatError(f"Could not find a wavelength column header row in {p.name} — not a recognized SED layout")

    header_tokens = lines[header_row_idx].split()
    wl_idx = next((i for i, t in enumerate(header_tokens) if "wvl" in t.lower() or "wavelength" in t.lower()), None)
    if wl_idx is None:
        raise SedFormatError(f"Header row found but no wavelength column detected in {p.name}")

    refl_idx = next((i for i, t in enumerate(header_tokens) if "reflect" in t.lower()), None)
    used_fallback_reflectance_col = refl_idx is None
    if refl_idx is None:
        refl_idx = len(header_tokens) - 1

    data_rows: list[tuple[float, float]] = []
    for line in lines[header_row_idx + 1 :]:
        tokens = line.split()
        if len(tokens) <= max(wl_idx, refl_idx):
            continue
        try:
            wl = float(tokens[wl_idx])
            refl = float(tokens[refl_idx])
        except ValueError:
            continue
        data_rows.append((wl, refl))

    if len(data_rows) < 5:
        raise SedFormatError(f"Not enough numeric data rows found in {p.name} under the detected column layout")

    data_rows.sort(key=lambda r: r[0])
    wavelength = [r[0] for r in data_rows]
    reflectance = [r[1] for r in data_rows]

    warnings: list[str] = ["SED reader is experimental (no verified official format spec, no real instrument files tested against)."]
    if used_fallback_reflectance_col:
        warnings.append("No column header contained 'reflect' — assumed the last data column is reflectance.")
    if reflectance and max(reflectance) > 1.5:
        reflectance = [v / 100.0 for v in reflectance]
        warnings.append("Reflectance values appeared to be in percent (>1.5) — divided by 100.")

    return RawSpectrum(
        filename=p.name,
        original_path=str(p),
        format="sed",
        instrument=metadata.get("Instrument") or metadata.get("instrument"),
        wavelength=wavelength,
        reflectance=reflectance,
        acquisition_date=metadata.get("Time") or metadata.get("Date") or metadata.get("time"),
        metadata=metadata,
        warnings=warnings,
    )
