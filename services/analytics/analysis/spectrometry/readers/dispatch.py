"""Extension-based reader dispatch with a magic-byte sniff fallback."""
from __future__ import annotations

from pathlib import Path

from analysis.spectrometry.readers.ascii_reader import read_ascii_spectrum
from analysis.spectrometry.readers.asd_reader import read_asd_spectrum
from analysis.spectrometry.readers.common import RawSpectrum, ReadError
from analysis.spectrometry.readers.sed_reader import read_sed_spectrum

_EXT_DISPATCH = {
    ".asd": read_asd_spectrum,
    ".sed": read_sed_spectrum,
    ".csv": read_ascii_spectrum,
    ".txt": read_ascii_spectrum,
    ".asc": read_ascii_spectrum,
}


def read_any(path: str) -> RawSpectrum:
    p = Path(path)
    ext = p.suffix.lower()
    reader = _EXT_DISPATCH.get(ext)
    if reader is not None:
        return reader(path)

    # Fallback: sniff magic bytes for the two binary/text formats we know.
    with open(path, "rb") as f:
        head = f.read(512)
    if len(head) >= 158 and head[157] in range(0, 9):
        return read_asd_spectrum(path)
    try:
        head_text = head.decode("utf-8", errors="strict")
        if "wvl" in head_text.lower() or "wavelength" in head_text.lower():
            return read_sed_spectrum(path)
    except UnicodeDecodeError:
        pass

    raise ReadError(f"Unrecognized spectral file format: {p.name} (extension {ext!r} not supported)")
