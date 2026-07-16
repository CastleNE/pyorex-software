"""
Common shape every spectral file reader converges on. Readers are PURE
reading — no mineral interpretation, no format inference beyond "what
instrument/shape is this file" (spec: reading must be separate from
interpretation).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RawSpectrum:
    filename: str
    original_path: str
    format: str  # "ascii_csv" | "ascii_txt" | "asd" | "sed"
    instrument: str | None
    wavelength: list[float]
    reflectance: list[float]
    acquisition_date: str | None
    metadata: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


class ReadError(Exception):
    """Base class for all spectral-file read failures — callers must report,
    never guess/return a partial spectrum."""


class AsdFormatError(ReadError):
    pass


class SedFormatError(ReadError):
    pass


class AsciiFormatError(ReadError):
    pass
