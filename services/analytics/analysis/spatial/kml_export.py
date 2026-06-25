"""
KML export for geochemical sample datasets.

Generates KML 2.2 with one Placemark per sample row, colour-coded
by a selected variable using a 5-class quantile scheme.

Reprojection from projected CRS → WGS84 is performed with pyproj when
the dataset's spatial_ref is not already geographic (EPSG:4326).
"""
from __future__ import annotations

import math
import xml.etree.ElementTree as ET
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from analysis.data.storage import load_dataset, load_metadata, validate_dataset_id, DATA_DIR

EXPORTS_DIR = DATA_DIR / "exports"

# 5-class sequential amber→red palette (KML uses aabbggrr hex)
_QUANTILE_COLORS = [
    "ff00aaff",  # amber-light  (KML: aabbggrr)
    "ff00aaff",  # amber
    "ff0066ff",  # orange
    "ff0033cc",  # orange-red
    "ff0000aa",  # deep red
]

# More readable palette: blue → green → yellow → orange → red
_COLOR_RAMP = [
    "ffff8800",  # blue-green
    "ff00dd88",  # green
    "ff00dddd",  # yellow
    "ff0088ff",  # orange
    "ff0000cc",  # red
]


def export_kml(
    dataset_id: str,
    lat_col: str | None = None,
    lon_col: str | None = None,
    name_col: str | None = None,
    color_col: str | None = None,
) -> str:
    """
    Generate a KML file for the given dataset and return its absolute path.

    Parameters
    ----------
    dataset_id  : ID of the dataset in storage
    lat_col     : column with latitude / northing (overrides spatial_ref if given)
    lon_col     : column with longitude / easting (overrides spatial_ref if given)
    name_col    : column to use as Placemark name (default: first text column)
    color_col   : numeric column to colour-code placemarks (default: no colour)

    Returns
    -------
    Absolute path to the generated .kml file.
    """
    validate_dataset_id(dataset_id)
    meta = load_metadata(dataset_id)
    df = load_dataset(dataset_id)

    # Resolve coordinate columns
    spatial_ref = meta.get("spatial_ref")
    if not lat_col or not lon_col:
        if spatial_ref:
            lon_col = spatial_ref["x_col"]
            lat_col = spatial_ref["y_col"]
        else:
            raise ValueError(
                "No coordinate columns specified and no spatial_ref in dataset metadata. "
                "Re-import the dataset with spatial reference selected."
            )

    if lon_col not in df.columns or lat_col not in df.columns:
        raise ValueError(
            f"Coordinate columns '{lon_col}' / '{lat_col}' not found in dataset."
        )

    is_geographic = spatial_ref.get("is_geographic", True) if spatial_ref else True
    crs_epsg = spatial_ref.get("crs", "EPSG:4326") if spatial_ref else "EPSG:4326"

    # Reproject if needed
    lon_values, lat_values = _get_lonlat(df, lon_col, lat_col, crs_epsg, is_geographic)

    # Resolve name column (first text column that isn't a coordinate or ioGAS display)
    if not name_col:
        iogas_cols = set(meta.get("iogas_display_cols", []))
        coord_cols = {lon_col, lat_col}
        for col_meta in meta.get("columns", []):
            if (
                col_meta["name"] not in iogas_cols
                and col_meta["name"] not in coord_cols
                and "String" in col_meta.get("dtype", "")
            ):
                name_col = col_meta["name"]
                break
        name_col = name_col or "Sample"

    # Compute colour bins
    color_bins: list[str] | None = None
    if color_col and color_col in df.columns:
        color_bins = _quantile_colors(df[color_col].to_list(), _COLOR_RAMP)

    # Build KML tree
    kml = ET.Element("kml", xmlns="http://www.opengis.net/kml/2.2")
    doc = ET.SubElement(kml, "Document")
    ET.SubElement(doc, "name").text = meta.get("name", dataset_id)
    ET.SubElement(doc, "description").text = (
        f"PyOrex export — {meta.get('row_count', 0)} samples\n"
        f"Exported: {datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')}"
    )

    # Add colour styles
    for i, color in enumerate(_COLOR_RAMP):
        style = ET.SubElement(doc, "Style", id=f"s{i}")
        icon_style = ET.SubElement(style, "IconStyle")
        ET.SubElement(icon_style, "color").text = color
        ET.SubElement(icon_style, "scale").text = "0.8"
        icon = ET.SubElement(icon_style, "Icon")
        ET.SubElement(icon, "href").text = (
            "http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png"
        )

    # Default style (no colour variable)
    style_default = ET.SubElement(doc, "Style", id="s_default")
    icon_style_d = ET.SubElement(style_default, "IconStyle")
    ET.SubElement(icon_style_d, "color").text = "ff00aaff"
    ET.SubElement(icon_style_d, "scale").text = "0.8"
    icon_d = ET.SubElement(icon_style_d, "Icon")
    ET.SubElement(icon_d, "href").text = (
        "http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png"
    )

    rows = df.to_dicts()
    num_cols = [
        c["name"] for c in meta.get("columns", [])
        if "Float" in c.get("dtype", "") or "Int" in c.get("dtype", "")
    ]

    for i, row in enumerate(rows):
        lon = lon_values[i]
        lat = lat_values[i]
        if lon is None or lat is None or math.isnan(lon) or math.isnan(lat):
            continue

        pm = ET.SubElement(doc, "Placemark")

        name_val = row.get(name_col, "") if name_col != "Sample" else str(i + 1)
        ET.SubElement(pm, "name").text = str(name_val) if name_val is not None else str(i + 1)

        style_id = color_bins[i] if color_bins else "s_default"
        ET.SubElement(pm, "styleUrl").text = f"#{style_id}"

        # Description: compact HTML table of numeric values
        desc_lines = [f"<b>{name_val}</b><br/><table>"]
        for col in num_cols[:20]:  # cap at 20 columns to keep KML readable
            val = row.get(col)
            if val is not None:
                desc_lines.append(f"<tr><td>{col}</td><td>{val}</td></tr>")
        desc_lines.append("</table>")
        ET.SubElement(pm, "description").text = "".join(desc_lines)

        # ExtendedData
        ext_data = ET.SubElement(pm, "ExtendedData")
        for col in num_cols:
            val = row.get(col)
            if val is not None:
                data_el = ET.SubElement(ext_data, "Data", name=col)
                ET.SubElement(data_el, "value").text = str(val)

        pt = ET.SubElement(pm, "Point")
        ET.SubElement(pt, "coordinates").text = f"{lon:.6f},{lat:.6f},0"

    # Write to file — always use the managed exports directory (no client-provided paths)
    dest_dir = EXPORTS_DIR
    dest_dir.mkdir(parents=True, exist_ok=True)
    dataset_name_safe = re.sub(r"[^\w\-]", "_", meta.get("name", dataset_id))[:40]
    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
    out_path = dest_dir / f"{dataset_name_safe}_{ts}.kml"

    tree = ET.ElementTree(kml)
    ET.indent(tree, space="  ")
    tree.write(str(out_path), encoding="unicode", xml_declaration=True)

    return str(out_path.resolve())


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_lonlat(
    df: Any,
    x_col: str,
    y_col: str,
    crs_epsg: str,
    is_geographic: bool,
) -> tuple[list[float | None], list[float | None]]:
    """Return (lon_list, lat_list) in WGS84 degrees."""
    import polars as pl

    x_vals = df[x_col].cast(pl.Float64, strict=False).to_list()
    y_vals = df[y_col].cast(pl.Float64, strict=False).to_list()

    if is_geographic:
        return x_vals, y_vals

    # Reproject with pyproj
    try:
        from pyproj import Transformer
        transformer = Transformer.from_crs(crs_epsg, "EPSG:4326", always_xy=True)
        lons, lats = [], []
        for x, y in zip(x_vals, y_vals):
            if x is None or y is None:
                lons.append(None)
                lats.append(None)
            else:
                lon, lat = transformer.transform(x, y)
                lons.append(lon)
                lats.append(lat)
        return lons, lats
    except ImportError:
        raise RuntimeError(
            "pyproj is required to reproject non-geographic coordinates. "
            "Run: pip install pyproj"
        )


def _quantile_colors(values: list[Any], palette: list[str]) -> list[str]:
    """Assign a palette style ID to each value using quantile bins."""
    n_bins = len(palette)
    numeric = [(i, v) for i, v in enumerate(values) if v is not None and not math.isnan(float(v))]
    if not numeric:
        return [f"s_default"] * len(values)

    sorted_vals = sorted(v for _, v in numeric)
    n = len(sorted_vals)
    thresholds = [sorted_vals[int(n * k / n_bins)] for k in range(1, n_bins)]

    result = [f"s_default"] * len(values)
    for i, v in numeric:
        if v is None:
            continue
        bin_idx = sum(1 for t in thresholds if float(v) >= float(t))
        bin_idx = min(bin_idx, n_bins - 1)
        result[i] = f"s{bin_idx}"
    return result
