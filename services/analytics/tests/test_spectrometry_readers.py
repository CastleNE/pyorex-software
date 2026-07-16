import os
import struct
import tempfile

import numpy as np
import pytest

from analysis.spectrometry.readers.ascii_reader import read_ascii_spectrum, read_ascii_table
from analysis.spectrometry.readers.asd_reader import read_asd_spectrum
from analysis.spectrometry.readers.common import AsciiFormatError, AsdFormatError, SedFormatError
from analysis.spectrometry.readers.folder_scanner import scan_paths
from analysis.spectrometry.readers.sed_reader import read_sed_spectrum


@pytest.fixture
def tmpdir_path(tmp_path):
    return str(tmp_path)


def _write(path: str, content: str) -> str:
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return path


def test_ascii_spectrum_comma_delimited(tmpdir_path):
    path = _write(os.path.join(tmpdir_path, "s.csv"), "Wavelength,Reflectance\n" + "\n".join(f"{wl},{0.1+0.001*wl}" for wl in range(350, 400)))
    spec = read_ascii_spectrum(path)
    assert spec.format == "ascii_csv"
    assert len(spec.wavelength) == 50
    assert spec.wavelength[0] == 350.0


def test_ascii_spectrum_decimal_comma(tmpdir_path):
    lines = ["Wavelength;Reflectance"] + [f"{wl};0,{100+wl}" for wl in range(350, 360)]
    path = _write(os.path.join(tmpdir_path, "s.txt"), "\n".join(lines))
    spec = read_ascii_spectrum(path)
    assert len(spec.wavelength) == 10
    assert spec.reflectance[0] == pytest.approx(0.450, abs=0.01)


def test_ascii_spectrum_too_short_raises(tmpdir_path):
    path = _write(os.path.join(tmpdir_path, "s.csv"), "1,2\n3,4")
    with pytest.raises(AsciiFormatError):
        read_ascii_spectrum(path)


def test_ascii_table_wide_format_autodetects_wavelength_column(tmpdir_path):
    header = "Wavelength,SampleA,SampleB"
    rows = [f"{wl},{0.1+0.001*wl},{0.2+0.001*wl}" for wl in range(350, 400)]
    path = _write(os.path.join(tmpdir_path, "table.csv"), "\n".join([header] + rows))
    spectra = read_ascii_table(path)
    assert len(spectra) == 2
    assert spectra[0].metadata["column_name"] == "SampleA"
    assert spectra[1].metadata["column_name"] == "SampleB"


def test_ascii_table_non_monotonic_first_column_rejected(tmpdir_path):
    header = "NotWavelength,SampleA"
    rows = [f"{v},{0.1}" for v in [5, 3, 9, 1, 2, 8]]
    path = _write(os.path.join(tmpdir_path, "table.csv"), "\n".join([header] + rows))
    with pytest.raises(AsciiFormatError):
        read_ascii_table(path)


def _make_asd_bytes(version: int, n_channels: int, comment: bytes = b"test") -> bytes:
    header = comment.ljust(157, b"\x00") + bytes([version]) + b"\x00" * (484 - 158)
    payload = struct.pack(f"<{n_channels}f", *([0.3] * n_channels))
    return header + payload


def test_asd_valid_file(tmpdir_path):
    path = os.path.join(tmpdir_path, "t.asd")
    with open(path, "wb") as f:
        f.write(_make_asd_bytes(7, 400))
    spec = read_asd_spectrum(path)
    assert spec.format == "asd"
    assert len(spec.wavelength) == 400
    assert spec.wavelength[0] == 350.0
    assert any("assumed" in w.lower() for w in spec.warnings)


def test_asd_unrecognized_version_raises(tmpdir_path):
    path = os.path.join(tmpdir_path, "bad.asd")
    with open(path, "wb") as f:
        f.write(_make_asd_bytes(42, 400))
    with pytest.raises(AsdFormatError):
        read_asd_spectrum(path)


def test_asd_truncated_file_raises(tmpdir_path):
    path = os.path.join(tmpdir_path, "trunc.asd")
    with open(path, "wb") as f:
        f.write(b"\x00" * 100)
    with pytest.raises(AsdFormatError):
        read_asd_spectrum(path)


def test_asd_implausible_channel_count_raises(tmpdir_path):
    path = os.path.join(tmpdir_path, "weird.asd")
    with open(path, "wb") as f:
        f.write(_make_asd_bytes(7, 3))  # far below MIN_CHANNELS
    with pytest.raises(AsdFormatError):
        read_asd_spectrum(path)


def test_sed_valid_file(tmpdir_path):
    lines = ["Instrument: OreXpress", "Time: 2026-01-01", "Wvl\tReflect."] + [f"{wl}\t50.0" for wl in range(350, 400)]
    path = _write(os.path.join(tmpdir_path, "t.sed"), "\n".join(lines))
    spec = read_sed_spectrum(path)
    assert spec.format == "sed"
    assert len(spec.wavelength) == 50
    assert spec.reflectance[0] == pytest.approx(0.5)  # divided by 100 (percent heuristic)
    assert spec.instrument == "OreXpress"


def test_sed_missing_wavelength_header_raises(tmpdir_path):
    path = _write(os.path.join(tmpdir_path, "bad.sed"), "Instrument: X\n" + "\n".join(f"{i} {i}" for i in range(20)))
    with pytest.raises(SedFormatError):
        read_sed_spectrum(path)


def test_folder_scan_isolates_bad_file(tmpdir_path):
    good = os.path.join(tmpdir_path, "good.csv")
    _write(good, "Wavelength,Reflectance\n" + "\n".join(f"{wl},{0.1+0.001*wl}" for wl in range(350, 400)))
    bad = os.path.join(tmpdir_path, "bad.txt")
    _write(bad, "not a spectrum\njust some text\n")

    result = scan_paths([tmpdir_path], recursive=False)
    assert len(result.spectra) == 1
    assert len(result.failures) == 1
    assert result.failures[0].path == bad
