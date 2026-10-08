"""Sample map (Secciones y mapas → Mapa): every sample at its real coordinates with the value of a column or of an
expression, an optional category, and optionally an IDW surface of that value.

Coordinates come from the dataset's spatial configuration (Variables → Coordenadas); values are never reprojected.
Censored, missing or non-finite values are never imputed: the sample is still placed on the map (grey) but takes no
part in the surface. The IDW surface reuses the exploration interpolator (``exploration._idw``): inside the convex hull
only, no extrapolation. With ``log`` the interpolation runs on log10 values and the grid is returned back-transformed
(geometric weighting, the usual choice for trace elements).
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Literal

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from analysis.geochemistry.custom_diagram import evaluate, parse_expression
from analysis.geochemistry.engine import QAQC
from analysis.geochemistry.exploration import _idw
from analysis.qaqc.common import infer_sample_id_column

MAX_SAMPLES = 200_000


class IdwOptions(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    resolution: int = Field(default=80, ge=11, le=250)
    power: float = Field(default=2.0, ge=0.5, le=5.0)
    neighbors: int = Field(default=12, ge=3, le=64)
    radius: float | None = Field(default=None, gt=0)
    log: bool = False


class MapRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    value: str | None = Field(default=None, max_length=500)
    category_column: str | None = None
    label_column: str | None = None
    include_qaqc: bool = False
    idw: IdwOptions | None = None


class MapDatasetRequest(MapRequest):
    dataset_id: str


def _epsg_code(raw) -> int | None:
    if raw is None or raw == '':
        return None
    text = str(raw).upper().replace('EPSG:', '').strip()
    return int(text) if text.isdigit() else None


def coordinate_setup(spatial: dict | None) -> dict:
    """Which columns hold the map coordinates and in which reference system, from the dataset's spatial config."""
    s = spatial or {}
    source = s.get('geometry_source')
    if source in ('projected_xy', 'local_grid') and s.get('east_col') and s.get('north_col'):
        epsg = _epsg_code(s.get('projected_epsg')) if source == 'projected_xy' else None
        return dict(source=source, x=s['east_col'], y=s['north_col'], epsg=epsg, label=s.get('projected_crs_label'),
                    geographic=False, interpolable=source == 'local_grid' or epsg is not None)
    if source == 'wgs84_lonlat' and s.get('lon_col') and s.get('lat_col'):
        return dict(source=source, x=s['lon_col'], y=s['lat_col'], epsg=4326, label='WGS 84 (longitud/latitud)',
                    geographic=True, interpolable=False)
    raise ValueError('El dataset no tiene coordenadas asignadas. Asígnalas en Proyecto → Variables → Coordenadas.')


def _coordinate(raw) -> float | None:
    if raw is None or isinstance(raw, bool):
        return None
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def sample_map(df: pl.DataFrame, request: dict, spatial: dict | None, roles: dict | None = None) -> dict:
    config = MapRequest.model_validate(request)
    if df.height > MAX_SAMPLES:
        raise ValueError(f'Máximo {MAX_SAMPLES:,} muestras por mapa'.replace(',', ' '))
    setup = coordinate_setup(spatial)
    for column in (setup['x'], setup['y'], config.category_column, config.label_column):
        if column and column not in df.columns:
            raise ValueError(f'Columna desconocida: {column}')

    is_qaqc = [False] * df.height
    if not config.include_qaqc and '__sample_type__' in df.columns:
        is_qaqc = [str(v or '').upper() in QAQC for v in df['__sample_type__'].to_list()]

    values: list[float | None] = [None] * df.height
    reasons: list[str | None] = [None] * df.height
    columns_used: list[str] = []
    value_label = None
    if config.value and config.value.strip():
        available = [c for c in df.columns if not c.startswith('_')]
        parsed = parse_expression(config.value.strip(), available)
        values, reasons = evaluate(df, parsed)
        columns_used = parsed.columns
        value_label = config.value.strip()

    sample_column = config.label_column or infer_sample_id_column(df, roles or {})
    ids = df[sample_column].to_list() if sample_column and sample_column in df.columns else [None] * df.height
    cats = df[config.category_column].to_list() if config.category_column else [None] * df.height
    xs, ys = df[setup['x']].to_list(), df[setup['y']].to_list()

    points: list[dict] = []
    quality = dict(total=df.height, mapped=0, no_coordinates=0, no_value=0, excluded_qaqc=0)
    for i in range(df.height):
        if is_qaqc[i]:
            quality['excluded_qaqc'] += 1
            continue
        x, y = _coordinate(xs[i]), _coordinate(ys[i])
        if x is None or y is None or (setup['geographic'] and not (-180 <= x <= 180 and -90 <= y <= 90)):
            quality['no_coordinates'] += 1
            continue
        quality['mapped'] += 1
        value = values[i] if value_label else None
        if value_label and value is None:
            quality['no_value'] += 1
        category = None
        if config.category_column:
            raw = cats[i]
            category = 'Sin dato' if raw is None or str(raw).strip() == '' else str(raw)
        points.append(dict(row_index=i, sample_id=str(ids[i]) if ids[i] is not None else f'Fila {i + 1}', x=x, y=y,
                           value=value, reason=reasons[i] if value_label and value is None else None, category=category))

    if not points:
        raise ValueError('Ninguna muestra tiene coordenadas válidas para dibujar el mapa')

    warnings: list[str] = []
    if quality['no_coordinates']:
        warnings.append(f"{quality['no_coordinates']} muestras sin coordenadas válidas no se dibujan.")
    if quality['no_value']:
        warnings.append(f"{quality['no_value']} muestras sin valor (faltante, censurado o no finito) se dibujan en gris y no entran en la superficie; no se imputan.")
    if quality['excluded_qaqc']:
        warnings.append(f"{quality['excluded_qaqc']} controles QAQC excluidos.")

    grid, grid_metrics = None, None
    if config.idw is not None:
        if not value_label:
            raise ValueError('Elige un valor (columna o expresión) para interpolar la superficie')
        if not setup['interpolable']:
            raise ValueError('La superficie IDW requiere coordenadas proyectadas (metros); con longitud/latitud en grados no es válida')
        usable = [p for p in points if p['value'] is not None and (not config.idw.log or p['value'] > 0)]
        if config.idw.log and len(usable) < sum(p['value'] is not None for p in points):
            warnings.append('Valores ≤ 0 no entran en la superficie en escala log10.')
        if len(usable) < 3:
            raise ValueError('Se requieren al menos tres muestras con valor para interpolar')
        xy = np.array([[p['x'], p['y']] for p in usable], dtype=float)
        z = np.array([p['value'] for p in usable], dtype=float)
        options = SimpleNamespace(epsg=setup['epsg'], resolution=config.idw.resolution, neighbors=config.idw.neighbors,
                                  power=config.idw.power, radius=config.idw.radius)
        grid, grid_metrics = _idw(xy, np.log10(z) if config.idw.log else z, options)
        if config.idw.log:
            grid['z'] = [[(10 ** v if v is not None else None) for v in line] for line in grid['z']]
        grid['log'] = config.idw.log
        warnings.append('Superficie IDW 2D dentro de la envolvente convexa de las muestras, sin extrapolación. '
                        'No es kriging ni estimación de recursos; no mezclar profundidades de sondaje en un mapa superficial.')

    unit = 'grados' if setup['geographic'] else 'unidades locales' if setup['source'] == 'local_grid' else 'm'
    return dict(
        crs=dict(source=setup['source'], epsg=setup['epsg'], label=setup['label'], geographic=setup['geographic'],
                 unit=unit, x_column=setup['x'], y_column=setup['y'], interpolable=setup['interpolable']),
        value_label=value_label, value_columns=columns_used, category_column=config.category_column,
        points=points, quality=quality, grid=grid, grid_metrics=grid_metrics, warnings=warnings,
        idw=config.idw.model_dump() if config.idw else None,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
