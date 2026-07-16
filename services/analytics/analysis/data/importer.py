"""
Data importer: CSV and Excel → Polars DataFrame with null-value handling.
RF-02, RF-04-CUA: BELOW_LOD, NOT_ANALYZED, MISSING support.
Includes spatial column auto-detection and column role classification (Addendum V3).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import polars as pl


# ── Spatial models ────────────────────────────────────────────────────────────

@dataclass
class SpatialRef:
    """Detected coordinate pair — used by detect_spatial_columns() only."""
    x_col: str
    y_col: str
    crs: str
    crs_label: str
    is_geographic: bool


@dataclass
class SpatialDetection:
    pairs: list[SpatialRef]
    iogas_display_cols: list[str]


@dataclass
class SpatialConfig:
    """
    Active geometry configuration chosen by the user (GIS rule).

    geometry_source controls which coordinate set is used for plotting:
      "projected_xy"  — East/North columns + projected CRS
      "wgs84_lonlat"  — Longitude/Latitude columns, EPSG:4326
      "local_grid"    — East/North with no georef CRS
      "none"          — no active geometry
    """
    geometry_source: str

    # Projected coordinates (East/North)
    east_col: str | None = None
    north_col: str | None = None
    projected_epsg: str | None = None      # e.g. "EPSG:32718"
    projected_crs_label: str | None = None

    # Geographic coordinates (WGS84 Lon/Lat)
    lon_col: str | None = None
    lat_col: str | None = None

    @property
    def plot_x_col(self) -> str | None:
        if self.geometry_source == "projected_xy":
            return self.east_col
        if self.geometry_source == "wgs84_lonlat":
            return self.lon_col
        return None

    @property
    def plot_y_col(self) -> str | None:
        if self.geometry_source == "projected_xy":
            return self.north_col
        if self.geometry_source == "wgs84_lonlat":
            return self.lat_col
        return None

    @property
    def plot_epsg(self) -> str | None:
        if self.geometry_source == "projected_xy":
            return self.projected_epsg
        if self.geometry_source == "wgs84_lonlat":
            return "EPSG:4326"
        return None

    @property
    def plot_crs_label(self) -> str | None:
        if self.geometry_source == "projected_xy":
            return self.projected_crs_label
        if self.geometry_source == "wgs84_lonlat":
            return "WGS84 geographic"
        return None

    @property
    def is_geographic(self) -> bool:
        return self.geometry_source == "wgs84_lonlat"

    def to_dict(self) -> dict:
        return {
            "geometry_source": self.geometry_source,
            "east_col": self.east_col,
            "north_col": self.north_col,
            "projected_epsg": self.projected_epsg,
            "projected_crs_label": self.projected_crs_label,
            "lon_col": self.lon_col,
            "lat_col": self.lat_col,
        }


# ── CRS catalogue ─────────────────────────────────────────────────────────────

_CRS_CATALOGUE: dict[str, tuple[str, str, bool]] = {
    "WGS84":     ("EPSG:4326",  "WGS84 (geographic)",    True),
    "GDA94":     ("EPSG:4283",  "GDA94 (geographic)",    True),
    "GDA2020":   ("EPSG:7844",  "GDA2020 (geographic)",  True),
    "PSAD56":    ("EPSG:4248",  "PSAD56 (South America)", True),
}

for _z in range(1, 61):
    _CRS_CATALOGUE[f"UTM_{_z}N"] = (f"EPSG:{32600 + _z}", f"WGS84 / UTM Zone {_z}N", False)
    _CRS_CATALOGUE[f"UTM_{_z}S"] = (f"EPSG:{32700 + _z}", f"WGS84 / UTM Zone {_z}S", False)

for _z in range(48, 59):
    _CRS_CATALOGUE[f"AMG84_z{_z}"] = (f"EPSG:{20200 + _z}", f"GDA94 / AMG Zone {_z}", False)

for _z in range(17, 23):
    _CRS_CATALOGUE[f"PSAD56_UTM_{_z}S"] = (f"EPSG:{24860 + _z}", f"PSAD56 / UTM Zone {_z}S", False)


def _extract_crs_token(col_lower: str) -> str | None:
    if "wgs84" in col_lower:
        return "WGS84"
    if "gda2020" in col_lower:
        return "GDA2020"
    if "gda94" in col_lower:
        return "GDA94"
    m = re.search(r"amg84_?z?_?(\d+)", col_lower)
    if m:
        return f"AMG84_z{m.group(1)}"
    m = re.search(r"utm_?(\d+)(n|s)", col_lower)
    if m:
        return f"UTM_{m.group(1)}{m.group(2).upper()}"
    m = re.search(r"psad56.*utm.*?(\d+)(n|s)", col_lower)
    if m:
        return f"PSAD56_UTM_{m.group(1)}{m.group(2).upper()}"
    if "psad56" in col_lower:
        return "PSAD56"
    return None


def detect_spatial_columns(columns: list[str]) -> SpatialDetection:
    iogas_display_cols = [c for c in columns if c.startswith("[") and c.endswith("]")]

    x_candidates: list[tuple[str, str | None]] = []
    y_candidates: list[tuple[str, str | None]] = []

    _X_PREFIXES = re.compile(r"^(east|easting|long|lon|longitude|x)[\W_]|^(x|long|lon)$", re.I)
    _Y_PREFIXES = re.compile(r"^(north|northing|lat|latitude|y)[\W_]|^(y|lat)$", re.I)

    for col in columns:
        if col in iogas_display_cols:
            continue
        norm = col.strip()
        crs_token = _extract_crs_token(norm.lower())

        if _X_PREFIXES.match(norm):
            x_candidates.append((col, crs_token))
        if _Y_PREFIXES.match(norm):
            y_candidates.append((col, crs_token))

    pairs: list[SpatialRef] = []
    matched_y: set[str] = set()

    for x_col, x_crs in x_candidates:
        for y_col, y_crs in y_candidates:
            if x_col == y_col or y_col in matched_y:
                continue
            shared_crs = x_crs if x_crs == y_crs else (x_crs or y_crs)
            if shared_crs or (x_col.lower().strip() in ("x",) and y_col.lower().strip() in ("y",)):
                epsg, label, is_geo = _CRS_CATALOGUE.get(
                    shared_crs or "", ("EPSG:4326", "WGS84 (geographic)", True)
                )
                pairs.append(SpatialRef(
                    x_col=x_col, y_col=y_col,
                    crs=epsg, crs_label=label, is_geographic=is_geo,
                ))
                matched_y.add(y_col)
                break

    return SpatialDetection(pairs=pairs, iogas_display_cols=iogas_display_cols)


# ── Column role classification (Addendum V3) ──────────────────────────────────

# Periodic table elements (symbol, 1-3 chars)
_ELEMENTS = re.compile(
    r"\b(Ag|Al|As|Au|Ba|Be|Bi|Ca|Cd|Ce|Co|Cr|Cs|Cu|Dy|Er|Eu|Fe|Ga|Gd|Ge|Hf|"
    r"Hg|Ho|In|Ir|La|Li|Lu|Mg|Mn|Mo|Na|Nb|Nd|Ni|Os|Pb|Pd|Pr|Pt|Rb|Re|"
    r"Rh|Ru|Sb|Sc|Se|Si|Sm|Sn|Sr|Ta|Tb|Te|Th|Ti|Tl|Tm|Yb|Zn|Zr|"
    r"B|C|F|I|K|N|P|S|U|V|W|Y)\b",
    re.I,
)

# Anchored-at-start version: matches element when column name begins with it
# (handles Cu_ppm, Au_ppb, Ag_g/t, Fe_%, etc. — underscore is \w so \b fails there)
_ELEMENTS_PREFIX = re.compile(
    r"^(Ag|Al|As|Au|Ba|Be|Bi|Ca|Cd|Ce|Co|Cr|Cs|Cu|Dy|Er|Eu|Fe|Ga|Gd|Ge|Hf|"
    r"Hg|Ho|In|Ir|La|Li|Lu|Mg|Mn|Mo|Na|Nb|Nd|Ni|Os|Pb|Pd|Pr|Pt|Rb|Re|"
    r"Rh|Ru|Sb|Sc|Se|Si|Sm|Sn|Sr|Ta|Tb|Te|Th|Ti|Tl|Tm|Yb|Zn|Zr|"
    r"B|C|F|I|K|N|P|S|U|V|W|Y)"
    r"(?=[_\s(\[/]|$)",
    re.I,
)

_OXIDES = re.compile(
    r"\b(SiO2|Al2O3|Fe2O3|FeO|MgO|CaO|Na2O|K2O|TiO2|P2O5|MnO|Cr2O3|BaO|SrO|ZrO2)\b",
    re.I,
)

# Anchored oxide match for names like Al2O3_pct, Fe2O3_pct (underscore breaks \b)
_OXIDES_PREFIX = re.compile(
    r"^(SiO2|Al2O3|Fe2O3\*?|FeO\*?|MgO|CaO|Na2O|K2O|TiO2|P2O5|MnO|Mn3O4|Cr2O3|"
    r"BaO|SrO|ZrO2|NiO|CoO|CuO|ZnO|PbO|U3O8|Nb2O5|Ta2O5|SnO2|Sc2O3|Y2O3|"
    r"La2O3|Ce2O3|CeO2|Pr2O3|Pr6O11|Nd2O3|Sm2O3|Eu2O3|Gd2O3|Tb2O3|Tb4O7|"
    r"Dy2O3|Ho2O3|Er2O3|Tm2O3|Yb2O3|Lu2O3|Rb2O|Cs2O|Li2O|B2O3|As2O3|V2O5|"
    r"SO2|SO3|CO2|BO3|SO4|CO3|As2O3|Ta2O5|Ga2O3|GeO2|In2O3|Tl2O3|SnO|PbO|"
    r"Bi2O3|ThO2|UO3|UO2|ReO3|OsO4|WO3|MoO3|VO2|VO|TiO|MnO2|FeO3|Cr2O|"
    r"Cu2O|Ag2O|HgO|CdO|ZnO|NiO|CoO|FeO|Fe3O4)"
    r"(?=[_\s(\[/]|$)",
    re.I,
)

_UNIT_SUFFIXES = re.compile(
    r"[_\s](ppm|ppb|g[_/]?t|wt[_%]?|pct|%|mgkg|ug[_/]?g|ng[_/]?g|mg[_/]?kg)$",
    re.I,
)

_SAMPLE_ID_NAMES = re.compile(
    r"^(sample[_\s]?id|sampleid|sample[_\s]?no|hole[_\s]?id|bhid|drillhole|"
    r"sample[_\s]?number|muestra[_\s]?id|id[_\s]?muestra)$",
    re.I,
)

_COORD_X_NAMES = re.compile(
    r"^(east|easting|long|lon|longitude|x|x_coord|x_utm)$", re.I
)
_COORD_Y_NAMES = re.compile(
    r"^(north|northing|lat|latitude|y|y_coord|y_utm)$", re.I
)
_COORD_Z_NAMES = re.compile(
    r"^(z|elev|elevation|rl|depth|from|to|z_coord|altitude)$", re.I
)

_QAQC_NAMES = re.compile(
    r"^(sample[_\s]?type|tipo[_\s]?muestra|qaqc[_\s]?type|standard[_\s]?name|"
    r"crm[_\s]?name|oreas[_\s]?id|blank[_\s]?type|duplicate[_\s]?of|"
    r"parent[_\s]?sample|batch[_\s]?id|lab[_\s]?job|dispatch[_\s]?id|"
    r"lab[_\s]?certificate)$",
    re.I,
)

_RATIO_PATTERN = re.compile(r"[/_]ratio|ratio[_/]|[/_]", re.I)

_INDEX_NAMES = re.compile(
    r"^(ai|ccpi|cia|cai|alteration[_\s]?index|loi|rqd|recovery|magsusc|"
    r"magnetic[_\s]?susceptibility|density[_\s]?index|enrichment[_\s]?factor)$",
    re.I,
)

_PHYSICAL_NAMES = re.compile(
    r"^(density|sg|specific[_\s]?gravity|porosity|rqd|recovery|"
    r"magnetic[_\s]?susceptibility|magsusc|moisture|water[_\s]?content)$",
    re.I,
)

_TEXT_ATTRIBUTE_NAMES = re.compile(
    r"^(litolog[ií]a|lithology|litho|rock[_\s]?type|alteraci[oó]n|alteration|"
    r"mineralizaci[oó]n|mineralization|veta|vein|zona|zone|proyecto|project|"
    r"campa[ñn]a|campaign|prospect|ge[oó]logo|geologist|comments?|"
    r"observaci[oó]n|observation|notas?|notes?|descripci[oó]n|description|"
    r"structure|estructura|domain[io]?|facies|unit[ae]?[ds]?)$",
    re.I,
)

_DATE_NAMES = re.compile(r"(date|fecha|timestamp|time)", re.I)


def classify_column_role(
    name: str,
    dtype: str,
    sample_values: list[str],
) -> dict[str, Any]:
    """
    Classify a column into a ColumnRole and return metadata.
    Returns dict with keys: role, semantic_type, analyte, unit, formula,
    is_measured, is_calculated, validation_rule.
    """
    n = name.strip()
    nl = n.lower()
    is_numeric = dtype == "numeric"
    is_text = dtype in ("text", "boolean")
    is_date = dtype == "datetime"

    # 1. sample_identifier
    if _SAMPLE_ID_NAMES.match(n):
        return _role("sample_identifier", semantic_type="sample_id", validation_rule="non_empty_string")

    # 2. coordinate_x
    if _COORD_X_NAMES.match(n):
        return _role("coordinate_x", semantic_type="easting_or_longitude", validation_rule="finite_number")

    # 3. coordinate_y
    if _COORD_Y_NAMES.match(n):
        return _role("coordinate_y", semantic_type="northing_or_latitude", validation_rule="finite_number")

    # 4. coordinate_z
    if _COORD_Z_NAMES.match(n):
        return _role("coordinate_z", semantic_type="elevation_or_depth", validation_rule="finite_number")

    # 5. qaqc_attribute
    if _QAQC_NAMES.match(n):
        return _role("qaqc_attribute", semantic_type=nl, validation_rule="text_or_code")

    # 6. ratio_numeric — slash indicates ratio (La/Yb, Cu/Zn) unless it's a unit token (Ag_g/t)
    if is_numeric and "/" in n and not _parse_raw_unit_token(n):
        return _role(
            "ratio_numeric",
            formula=n,
            is_measured=False,
            is_calculated=True,
            validation_rule="finite_number_allow_large",
        )

    # 7. index_numeric
    if is_numeric and _INDEX_NAMES.match(n):
        return _role(
            "index_numeric",
            semantic_type="geochemical_index",
            is_measured=False,
            is_calculated=True,
            validation_rule="finite_number_allow_large",
        )

    # 8. physical_numeric
    if is_numeric and _PHYSICAL_NAMES.match(n):
        return _role("physical_numeric", semantic_type="physical_property", validation_rule="finite_number")

    # 9. assay_oxide — check prefix first (handles Al2O3_pct), fallback to search for plain "SiO2"
    oxide_match = _OXIDES_PREFIX.match(n) or _OXIDES.search(n)
    if is_numeric and oxide_match:
        analyte = n[:oxide_match.end(1)] if hasattr(oxide_match, 'end') else oxide_match.group(1)
        unit = _parse_unit(n) or "pct"
        return _role("assay_oxide", analyte=analyte, unit=unit, is_measured=True, validation_rule="range_0_100_pct")

    # 10. assay_element — numeric + element symbol at start of name (Cu_ppm, Au_ppb, Ag_g/t, Cu)
    elem_prefix = _ELEMENTS_PREFIX.match(n)
    if is_numeric and elem_prefix:
        analyte = n[:elem_prefix.end(1)]  # preserve original case
        unit = _parse_unit(n)
        raw_unit_token = _parse_raw_unit_token(n) if unit is None else None
        needs_manual = raw_unit_token is not None
        # standalone element (e.g. "Cu") defaults to ppm; ambiguous unit needs manual review
        effective_unit = unit or (None if needs_manual else ("ppm" if _has_element_only_name(n) else None))
        if unit or raw_unit_token or _has_element_only_name(n):
            return _role(
                "assay_element",
                analyte=analyte,
                unit=effective_unit,
                raw_unit_token=raw_unit_token,
                needs_manual_unit=needs_manual,
                is_measured=True,
                validation_rule="range_geochemical",
            )

    # 11. text_attribute
    if is_text and _TEXT_ATTRIBUTE_NAMES.match(n):
        semantic = _infer_text_semantic(nl)
        return _role("text_attribute", semantic_type=semantic, validation_rule="valid_text")

    # 12. date_attribute
    if is_date or _DATE_NAMES.search(nl):
        return _role("date_attribute", semantic_type="date", validation_rule="valid_date")

    # 13. fallback for pure numeric with no other classification
    if is_numeric:
        return _role("calculated_numeric", is_calculated=True, validation_rule="finite_number_allow_large")

    # 14. pure text with no specific match
    if is_text:
        return _role("text_attribute", validation_rule="valid_text")

    return _role("unknown", validation_rule="none")


def _role(
    role: str,
    semantic_type: str | None = None,
    analyte: str | None = None,
    unit: str | None = None,
    raw_unit_token: str | None = None,
    needs_manual_unit: bool = False,
    formula: str | None = None,
    is_measured: bool = False,
    is_calculated: bool = False,
    validation_rule: str = "none",
) -> dict[str, Any]:
    return {
        "role": role,
        "semantic_type": semantic_type,
        "analyte": analyte,
        "unit": unit,
        "raw_unit_token": raw_unit_token,
        "needs_manual_unit": needs_manual_unit,
        "formula": formula,
        "is_measured": is_measured,
        "is_calculated": is_calculated,
        "validation_rule": validation_rule,
    }


_IGNORABLE_COLUMNS = re.compile(
    r"^(comments?|remarks?|visible|order|shape|size|colour|color|style|symbol|label)$",
    re.I,
)

_AMBIGUOUS_UNIT_TOKENS = re.compile(
    r"(?:^|[_\s(])(g[/_]?t|gpt|g\/t|mg[/_]?kg|ug[/_]?g|µg[/_]?g|ng[/_]?g|mg[/_]?l)(?:[_)\s]|$)",
    re.I,
)


def _parse_unit(name: str) -> str | None:
    """Return normalized unit: ppm, ppb, or pct only. None if ambiguous or not detected."""
    nl = name.lower()
    if re.search(r"(?:^|[_\s(])ppm(?:[_)\s]|$)", nl) or nl.endswith("_ppm"):
        return "ppm"
    if re.search(r"(?:^|[_\s(])ppb(?:[_)\s]|$)", nl) or nl.endswith("_ppb"):
        return "ppb"
    if (
        re.search(r"(?:^|[_\s(])(?:pct|wt%)(?:[_)\s]|$)", nl)
        or nl.endswith("_pct")
        or nl.endswith("_%")
        or nl.endswith(" %")
        or nl.endswith("(%)")
        or name.endswith("%")
    ):
        return "pct"
    return None


def _parse_raw_unit_token(name: str) -> str | None:
    """Return raw token for ambiguous units (g/t, mg/kg, etc.) that need manual review."""
    m = _AMBIGUOUS_UNIT_TOKENS.search(name)
    return m.group(1).lower() if m else None


def _is_ignorable_column(name: str) -> bool:
    return bool(_IGNORABLE_COLUMNS.match(name.strip()))


def _has_element_only_name(name: str) -> bool:
    """True if the column name IS just an element symbol (e.g. 'Cu', 'Au', 'Zn')."""
    return bool(_ELEMENTS.fullmatch(name.strip()))


def _infer_text_semantic(nl: str) -> str:
    if any(k in nl for k in ("lito", "litho", "rock")):
        return "lithology"
    if any(k in nl for k in ("alter",)):
        return "alteration"
    if any(k in nl for k in ("miner",)):
        return "mineralization"
    if any(k in nl for k in ("veta", "vein")):
        return "vein"
    if any(k in nl for k in ("zona", "zone", "domain")):
        return "zone"
    if any(k in nl for k in ("project", "proyecto")):
        return "project"
    return "attribute"


def detect_column_profiles(df: pl.DataFrame, columns_meta: list[dict]) -> list[dict]:
    """Build a ColumnProfile dict for each column, merging dtype stats with role classification."""
    profiles = []
    for col_meta in columns_meta:
        name = col_meta["name"]
        dtype = col_meta["dtype"]
        sample_values = col_meta.get("sample_values", [])
        null_count = col_meta.get("null_count", 0)
        total = df.height

        role_info = classify_column_role(name, dtype, sample_values)
        valid_count = total - null_count

        profiles.append({
            "original_name": name,
            "clean_name": name,
            "role": role_info["role"],
            "data_type": dtype,
            "semantic_type": role_info["semantic_type"],
            "analyte": role_info["analyte"],
            "unit": role_info["unit"],
            "raw_unit_token": role_info.get("raw_unit_token"),
            "needs_manual_unit": role_info.get("needs_manual_unit", False),
            "formula": role_info["formula"],
            "is_measured": role_info["is_measured"],
            "is_calculated": role_info["is_calculated"],
            "validation_rule": role_info["validation_rule"],
            "missing_count": null_count,
            "valid_count": valid_count,
            "warning_count": 0,
            "error_count": 0,
            "import_flag": "no_import" if _is_ignorable_column(name) else "yes",
            "alias": name,
        })
    return profiles


def assess_module_availability(
    df: pl.DataFrame,
    spatial_config: SpatialConfig | None,
    profiles: list[dict],
) -> dict[str, bool]:
    """Determine which modules are available given the import data."""
    roles = {p["role"] for p in profiles}
    has_numeric = bool(roles & {"assay_element", "assay_oxide", "assay_compound",
                                "ratio_numeric", "index_numeric", "physical_numeric",
                                "calculated_numeric"})
    has_sample_id = "sample_identifier" in roles
    has_qaqc = bool(roles & {"qaqc_attribute", "sample_type_qaqc"})
    has_z = "coordinate_z" in roles
    has_map = (
        spatial_config is not None
        and spatial_config.geometry_source not in ("none", "local_grid")
        and spatial_config.plot_x_col is not None
        and spatial_config.plot_y_col is not None
    )

    return {
        "table": True,
        "charts": has_numeric,
        "map": has_map,
        "qaqc": has_sample_id and has_qaqc,
        "three_d": has_map and has_z,
    }


# ── Main models ───────────────────────────────────────────────────────────────

@dataclass
class NullMapping:
    column: str
    sentinel_value: str | float | int
    null_type: str  # "BELOW_LOD" | "NOT_ANALYZED" | "MISSING"
    lod_value: float | None = None


@dataclass
class SampleTypeMapping:
    column: str
    value_map: dict[str, str]


@dataclass
class ColumnMapping:
    original_name: str
    import_flag: str = "yes"   # "yes" | "no_import"
    role_override: str | None = None
    analyte_override: str | None = None
    unit_override: str | None = None   # "ppm" | "ppb" | "pct"
    alias: str | None = None


@dataclass
class ImportConfig:
    null_mappings: list[NullMapping] = field(default_factory=list)
    sample_type_mapping: SampleTypeMapping | None = None
    sheet_name: str | int = 0
    separator: str = ","
    spatial_config: SpatialConfig | None = None
    column_role_overrides: dict[str, str] = field(default_factory=dict)
    column_mappings: list[ColumnMapping] = field(default_factory=list)


@dataclass
class PreviewResult:
    columns: list[dict]
    preview_rows: list[dict]
    total_rows: int
    file_size_kb: float
    encoding_detected: str
    spatial_detection: dict
    column_profiles: list[dict]  # Addendum V3


# ── Preview ───────────────────────────────────────────────────────────────────

MAX_FILE_SIZE_MB = 500


def preview_file(path: str, n_rows: int = 50, separator: str = ",") -> PreviewResult:
    p = Path(path)
    size_mb = p.stat().st_size / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise ValueError(f"File too large: {size_mb:.1f} MB (maximum: {MAX_FILE_SIZE_MB} MB)")
    file_size_kb = round(size_mb * 1024, 1)
    ext = p.suffix.lower()

    if ext == ".csv":
        df_full = _read_csv_polars(path, separator=separator)
    elif ext in (".xlsx", ".xls", ".xlsm"):
        df_full = _read_excel_polars(path)
    else:
        raise ValueError(f"Unsupported file type: {ext}. Supported: .csv, .xlsx, .xls")

    total_rows = df_full.height
    df = df_full.head(n_rows)
    detection = detect_spatial_columns(df_full.columns)

    columns = []
    for col in df.columns:
        series = df_full[col]
        sample_vals = (
            series.drop_nulls().unique().head(5).cast(pl.String).to_list()
        )
        dtype_str = _friendly_dtype(series.dtype)
        role_info = classify_column_role(col, dtype_str, sample_vals)
        columns.append({
            "name": col,
            "dtype": dtype_str,
            "null_count": int(series.null_count()),
            "null_pct": round(series.null_count() / max(series.len(), 1) * 100, 1),
            "sample_values": sample_vals,
            "is_iogas_display": col in detection.iogas_display_cols,
            "column_role": role_info["role"],
        })

    column_profiles = detect_column_profiles(df_full, columns)

    return PreviewResult(
        columns=columns,
        preview_rows=df.to_dicts(),
        total_rows=total_rows,
        file_size_kb=file_size_kb,
        encoding_detected="utf-8",
        spatial_detection={
            "pairs": [
                {"x_col": p.x_col, "y_col": p.y_col, "crs": p.crs,
                 "crs_label": p.crs_label, "is_geographic": p.is_geographic}
                for p in detection.pairs
            ],
            "iogas_display_cols": detection.iogas_display_cols,
        },
        column_profiles=column_profiles,
    )


# ── Import ────────────────────────────────────────────────────────────────────

def import_file(path: str, config: ImportConfig) -> tuple[pl.DataFrame, dict]:
    """
    Full import: read → apply null mappings → apply sample type mapping.
    Returns (dataframe, import_meta) where import_meta includes module_availability
    and status fields.
    """
    p = Path(path)
    size_mb = p.stat().st_size / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise ValueError(f"File too large: {size_mb:.1f} MB (maximum: {MAX_FILE_SIZE_MB} MB)")
    ext = p.suffix.lower()

    if ext == ".csv":
        df = _read_csv_polars(path, separator=config.separator)
    elif ext in (".xlsx", ".xls", ".xlsm"):
        df = _read_excel_polars(path, sheet=config.sheet_name)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    # Apply null mappings
    for mapping in config.null_mappings:
        if mapping.column not in df.columns:
            continue
        sentinel = mapping.sentinel_value
        df = df.with_columns(
            pl.when(pl.col(mapping.column).cast(pl.String) == str(sentinel))
            .then(None)
            .otherwise(pl.col(mapping.column))
            .alias(mapping.column)
        )
        null_type_col = f"_nulltype_{mapping.column}"
        df = df.with_columns(
            pl.when(pl.col(mapping.column).is_null())
            .then(pl.lit(mapping.null_type))
            .otherwise(pl.lit(None))
            .alias(null_type_col)
        )

    # Apply sample type mapping — __sample_type__ always exists post-import,
    # regardless of whether the wizard mapped a column, so downstream QAQC
    # consumers never have to special-case "column missing".
    if config.sample_type_mapping and config.sample_type_mapping.column in df.columns:
        stm = config.sample_type_mapping
        expr = pl.lit("S")  # unmapped raw values default cleanly to "S" (Regular)
        for raw_val, standard_type in stm.value_map.items():
            expr = (
                pl.when(pl.col(stm.column).cast(pl.String) == raw_val)
                .then(pl.lit(standard_type))
                .otherwise(expr)
            )
        df = df.with_columns(expr.alias("__sample_type__"))
    else:
        df = df.with_columns(pl.lit("S").alias("__sample_type__"))

    # Generate internal_feature_id for every row (Addendum V3)
    df = df.with_columns(
        pl.Series("internal_feature_id", [f"ROW-{i + 1:06d}" for i in range(df.height)])
    )

    # Build column profiles for module availability assessment
    col_metas = []
    for col in df.columns:
        series = df[col]
        col_metas.append({
            "name": col,
            "dtype": _friendly_dtype(series.dtype),
            "null_count": int(series.null_count()),
            "sample_values": [],
        })

    # Apply column_mappings: drop no_import columns, merge role overrides
    if config.column_mappings:
        mapping_by_col = {m.original_name: m for m in config.column_mappings}
        no_import_cols = [
            m.original_name for m in config.column_mappings
            if m.import_flag == "no_import" and m.original_name in df.columns
        ]
        if no_import_cols:
            df = df.drop(no_import_cols)
        # Rebuild col_metas after possible column drops
        col_metas = []
        for col in df.columns:
            series = df[col]
            col_metas.append({
                "name": col,
                "dtype": _friendly_dtype(series.dtype),
                "null_count": int(series.null_count()),
                "sample_values": [],
            })
    else:
        mapping_by_col = {}

    # Apply role overrides from user (column_mappings take precedence over column_role_overrides)
    profiles = detect_column_profiles(df, col_metas)
    for profile in profiles:
        col_name = profile["original_name"]
        m = mapping_by_col.get(col_name)
        if m:
            if m.role_override:
                profile["role"] = m.role_override
            if m.analyte_override is not None:
                profile["analyte"] = m.analyte_override
            if m.unit_override is not None:
                profile["unit"] = m.unit_override
                profile["needs_manual_unit"] = False
            if m.alias is not None:
                profile["alias"] = m.alias
        override = config.column_role_overrides.get(col_name)
        if override and not (m and m.role_override):
            profile["role"] = override

    # Assess which modules are available
    module_availability = assess_module_availability(df, config.spatial_config, profiles)

    # Determine per-domain statuses
    roles = {p["role"] for p in profiles}
    has_assay = bool(roles & {"assay_element", "assay_oxide", "assay_compound"})
    has_sample_id = "sample_identifier" in roles
    has_qaqc = bool(roles & {"qaqc_attribute", "sample_type_qaqc"})
    sc = config.spatial_config
    spatial_ok = (
        sc is not None
        and sc.geometry_source not in ("none", "local_grid")
        and sc.plot_x_col is not None
        and sc.plot_y_col is not None
    )

    import_meta = {
        "import_status": "ok",
        "chemical_status": "ok" if has_assay else "no_chemistry",
        "spatial_status": "ok" if spatial_ok else "no_coordinates",
        "plot_status": "ok" if spatial_ok else "no_coordinates",
        "qaqc_status": "ok" if (has_sample_id and has_qaqc) else "disabled_missing_sample_id",
        "module_availability": module_availability,
        "column_profiles": profiles,
    }

    return df, import_meta


# ── Internal helpers ──────────────────────────────────────────────────────────

_FORMULA_PREFIXES = frozenset({"=", "+", "-", "@", "\t", "\r"})


def _sanitize_formula_injection(df: pl.DataFrame) -> pl.DataFrame:
    string_cols = [col for col in df.columns if df[col].dtype == pl.String]
    if not string_cols:
        return df
    return df.with_columns([
        pl.when(pl.col(col).str.slice(0, 1).is_in(list(_FORMULA_PREFIXES)))
        .then(pl.lit("'") + pl.col(col))
        .otherwise(pl.col(col))
        .alias(col)
        for col in string_cols
    ])


def _read_csv_polars(path: str, separator: str = ",") -> pl.DataFrame:
    sep = separator if len(separator) == 1 else ","
    try:
        df = pl.read_csv(
            path, separator=sep, infer_schema_length=2000,
            null_values=["", "NA", "N/A", "n/a", "#N/A"],
            try_parse_dates=False, ignore_errors=False,
        )
    except Exception:
        df = pl.read_csv(path, separator=sep, infer_schema=False, null_values=["", "NA", "N/A"])
    return _sanitize_formula_injection(df)


def _read_excel_polars(path: str, sheet: str | int = 0) -> pl.DataFrame:
    try:
        df = pl.read_excel(path, sheet_name=sheet, infer_schema_length=2000)
    except Exception as e:
        detail = str(e) or repr(e)
        raise ValueError(
            "No se pudo leer correctamente el archivo XLSX. "
            "Revise si el archivo tiene hojas vacías, celdas combinadas, fórmulas o encabezados no tabulares. "
            f"Detalle técnico: {detail}"
        ) from e
    return _sanitize_formula_injection(df)


def _friendly_dtype(dtype: pl.DataType) -> str:
    s = str(dtype)
    if "Float" in s or "Int" in s:
        return "numeric"
    if "Boolean" in s:
        return "boolean"
    if "Date" in s or "Time" in s:
        return "datetime"
    return "text"
