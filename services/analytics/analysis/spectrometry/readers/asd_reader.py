"""
ASD (Analytical Spectral Devices / TerraSpec) binary spectrum reader.

**EXPERIMENTAL** — ASD's binary format has no complete official public
specification; this reader is built only from details that are consistently
corroborated across multiple independent open-source ASD parsers (not a
single unverified source), and is explicit in `RawSpectrum.warnings` about
every assumption it makes instead of reading from the file:

- Comment field: first 157 bytes (ASCII/latin-1, null-stripped).
- File version byte immediately after the comment, at offset 157. Only
  versions 1-7 are supported — version 8 introduces variable-length trailing
  sections (reference file header, classifier data) this reader does not
  attempt to parse; any other byte value is rejected outright.
- Fixed 484-byte header (versions 1-7) — widely and consistently cited across
  independent ASD parsers as the pre-v8 header length.
- Channel (band) count is DERIVED from file size (`(size - 484) / 4`,
  assuming a trailing float32 spectrum array) rather than read from a
  header field whose exact offset is not confidently known — cross-checked
  against the plausible ASD band-count range (350-2151) and rejected if
  outside it.
- Wavelength axis is ASSUMED to be 350-2500 nm at 1 nm steps (the standard,
  overwhelmingly common ASD FieldSpec/TerraSpec convention) starting at
  350 nm — NOT read from the file. This is disclosed as a warning, not
  presented as read metadata.

This reader never returns a partial/best-guess spectrum silently — any file
that doesn't satisfy the checks above raises `AsdFormatError`.
"""
from __future__ import annotations

import struct
from pathlib import Path

from analysis.spectrometry.readers.common import AsdFormatError, RawSpectrum

HEADER_LEN = 484
COMMENT_LEN = 157
SUPPORTED_VERSIONS = {1, 2, 3, 4, 5, 6, 7}
MIN_CHANNELS = 350
MAX_CHANNELS = 2151
ASSUMED_WAVELENGTH_START_NM = 350
ASSUMED_WAVELENGTH_STEP_NM = 1


def read_asd_spectrum(path: str) -> RawSpectrum:
    p = Path(path)
    raw = p.read_bytes()

    if len(raw) < HEADER_LEN + MIN_CHANNELS * 4:
        raise AsdFormatError(f"File too small to be a valid ASD spectrum: {p.name} ({len(raw)} bytes)")

    comment = raw[:COMMENT_LEN].split(b"\x00", 1)[0].decode("latin-1", errors="replace").strip()
    version = raw[COMMENT_LEN]
    if version not in SUPPORTED_VERSIONS:
        raise AsdFormatError(
            f"Unrecognized or unsupported ASD version byte ({version}) in {p.name} — "
            f"only versions {sorted(SUPPORTED_VERSIONS)} are supported (v8's variable-length "
            f"trailing sections are not implemented)."
        )

    payload = raw[HEADER_LEN:]
    if len(payload) % 4 != 0:
        raise AsdFormatError(f"Spectrum payload size is not a multiple of 4 bytes in {p.name} — file may be corrupt/truncated")

    n_channels = len(payload) // 4
    if not (MIN_CHANNELS <= n_channels <= MAX_CHANNELS):
        raise AsdFormatError(
            f"Derived channel count ({n_channels}) outside the plausible ASD range "
            f"[{MIN_CHANNELS}, {MAX_CHANNELS}] for {p.name} — refusing to guess a spectrum shape."
        )

    try:
        values = struct.unpack(f"<{n_channels}f", payload)
    except struct.error as exc:
        raise AsdFormatError(f"Failed to unpack float32 spectrum data in {p.name}: {exc}") from exc

    wavelength = [float(ASSUMED_WAVELENGTH_START_NM + i * ASSUMED_WAVELENGTH_STEP_NM) for i in range(n_channels)]
    reflectance = [float(v) for v in values]

    warnings = [
        f"Wavelength axis assumed as {ASSUMED_WAVELENGTH_START_NM}-"
        f"{ASSUMED_WAVELENGTH_START_NM + n_channels - 1} nm at {ASSUMED_WAVELENGTH_STEP_NM} nm steps "
        f"(not read from the file header) — verify against instrument settings.",
        "Channel count derived from file size, not read from a header field — verify if results look wrong.",
        "ASD reader is experimental (no verified official format spec, no real instrument files tested against).",
    ]

    return RawSpectrum(
        filename=p.name,
        original_path=str(p),
        format="asd",
        instrument="ASD (assumed — not confidently parsed from header)",
        wavelength=wavelength,
        reflectance=reflectance,
        acquisition_date=None,
        metadata={"comment": comment, "asd_version": int(version), "header_len": HEADER_LEN},
        warnings=warnings,
    )
