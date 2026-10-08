"""Section (Secciones y mapas → Sección): samples and drill holes projected onto a vertical plane along a line A–A'.

- The line goes from ``start`` to ``end`` (map coordinates of the dataset, projected or local grid in metres); every
  sample whose position falls within ``width / 2`` of the line, between A and A', is projected perpendicularly onto it:
  ``distance`` from A along the line, ``offset`` to the side (+ right of A→A').
- Elevation of a surface sample: its elevation column, or the DEM sampled at its position, or none (then only the value
  profile is drawn).
- Drill holes (optional): each interval is placed at its mid depth along a straight hole from the collar (the row's
  coordinates and elevation) with the hole's azimuth and dip (columns, or vertical by default). Curved surveys are not
  modelled; the response says so. Hole traces are returned projected onto the section.
- Topography: the DEM along the line when there is one, otherwise the elevations of the surface samples / collars
  inside the band, in order.
Values follow the map rules: column or expression, censored/missing never imputed (drawn without value).
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field, model_validator

from analysis.geochemistry.custom_diagram import evaluate, parse_expression
from analysis.geochemistry.engine import QAQC
from analysis.maps.dem import load_dem
from analysis.maps.sample_map import coordinate_setup
from analysis.qaqc.common import infer_sample_id_column

MAX_TOPO_POINTS = 600


class DrillOptions(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    hole_column: str
    from_column: str | None = None
    to_column: str | None = None
    depth_column: str | None = None
    azimuth_column: str | None = None
    dip_column: str | None = None
    azimuth: float = Field(default=0.0, ge=0, le=360)
    dip: float = Field(default=-90.0, ge=-90, le=90)

    @model_validator(mode='after')
    def _depths(self):
        if not self.depth_column and not (self.from_column and self.to_column):
            raise ValueError('Sondajes: indica Desde y Hasta, o una columna de profundidad')
        return self


class SectionRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    start: tuple[float, float]
    end: tuple[float, float]
    width: float = Field(default=200.0, gt=0)
    value: str | None = Field(default=None, max_length=500)
    category_column: str | None = None
    label_column: str | None = None
    include_qaqc: bool = False
    elevation_column: str | None = None
    dem_path: str | None = Field(default=None, max_length=1024)
    drill: DrillOptions | None = None


class SectionDatasetRequest(SectionRequest):
    dataset_id: str


def _num(raw) -> float | None:
    if raw is None or isinstance(raw, bool):
        return None
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def section(df: pl.DataFrame, request: dict, spatial: dict | None, roles: dict | None = None) -> dict:
    config = SectionRequest.model_validate(request)
    setup = coordinate_setup(spatial)
    if setup['geographic']:
        raise ValueError('La sección requiere coordenadas proyectadas en metros; con longitud/latitud no se puede medir distancias')
    (ax, ay), (bx, by) = config.start, config.end
    length = math.hypot(bx - ax, by - ay)
    if length <= 0:
        raise ValueError('La línea de sección necesita dos puntos distintos')
    ux, uy = (bx - ax) / length, (by - ay) / length
    azimuth = (math.degrees(math.atan2(ux, uy)) + 360) % 360
    half = config.width / 2
    drill = config.drill
    for column in (config.category_column, config.label_column, config.elevation_column,
                   *((drill.hole_column, drill.from_column, drill.to_column, drill.depth_column, drill.azimuth_column, drill.dip_column) if drill else ())):
        if column and column not in df.columns:
            raise ValueError(f'Columna desconocida: {column}')

    dem = None
    warnings: list[str] = []
    if config.dem_path:
        dem = load_dem(config.dem_path)
        if dem.epsg and setup['epsg'] and dem.epsg != setup['epsg']:
            raise ValueError(f'El DEM está en EPSG:{dem.epsg} y el dataset en EPSG:{setup["epsg"]}; PyOreX no reproyecta. Usa un DEM en el mismo sistema.')
        if dem.epsg is None:
            warnings.append(f'El DEM «{dem.name}» no declara sistema de referencia; se asume el del dataset.')

    values: list[float | None] = [None] * df.height
    value_label = None
    if config.value and config.value.strip():
        parsed = parse_expression(config.value.strip(), [c for c in df.columns if not c.startswith('_')])
        values, _ = evaluate(df, parsed)
        value_label = config.value.strip()

    sample_column = config.label_column or infer_sample_id_column(df, roles or {})
    col = lambda name: df[name].to_list() if name else [None] * df.height  # noqa: E731
    ids, cats, xs, ys = col(sample_column if sample_column in df.columns else None), col(config.category_column), col(setup['x']), col(setup['y'])
    elev = col(config.elevation_column)
    qaqc = [str(v or '').upper() in QAQC for v in df['__sample_type__'].to_list()] if not config.include_qaqc and '__sample_type__' in df.columns else [False] * df.height

    def project(x: float, y: float) -> tuple[float, float]:
        dx, dy = x - ax, y - ay
        return dx * ux + dy * uy, dx * uy - dy * ux        # along A→A', to the right of it

    holes: dict[str, dict] = {}
    if drill:
        hole_ids, frm, to, dep = col(drill.hole_column), col(drill.from_column), col(drill.to_column), col(drill.depth_column)
        azs, dips = col(drill.azimuth_column), col(drill.dip_column)

    points: list[dict] = []
    surface: list[tuple[float, float]] = []
    quality = dict(total=df.height, in_section=0, outside=0, no_coordinates=0, no_elevation=0, no_value=0, excluded_qaqc=0)
    for i in range(df.height):
        if qaqc[i]:
            quality['excluded_qaqc'] += 1
            continue
        x, y = _num(xs[i]), _num(ys[i])
        if x is None or y is None:
            quality['no_coordinates'] += 1
            continue
        z = _num(elev[i])
        if z is None and dem is not None:
            zz = float(dem.sample(np.array([x]), np.array([y]))[0])
            z = zz if math.isfinite(zz) else None
        hole = depth = None
        px, py, pz = x, y, z
        if drill:
            hole = str(hole_ids[i]) if hole_ids[i] is not None else None
            depth = _num(dep[i]) if drill.depth_column else (
                (_num(frm[i]) + _num(to[i])) / 2 if _num(frm[i]) is not None and _num(to[i]) is not None else None)
            if hole is not None and depth is not None:
                az = _num(azs[i]) if drill.azimuth_column else drill.azimuth
                dip = _num(dips[i]) if drill.dip_column else drill.dip
                az = drill.azimuth if az is None else az
                dip = -abs(drill.dip if dip is None else dip)     # downward whatever the sign convention
                h, v = math.cos(math.radians(dip)), math.sin(math.radians(dip))
                px, py = x + depth * h * math.sin(math.radians(az)), y + depth * h * math.cos(math.radians(az))
                pz = z + depth * v if z is not None else None
                info = holes.setdefault(hole, dict(hole=hole, collar=(x, y, z), az=az, dip=dip, max_depth=0.0, in_band=False))
                info['max_depth'] = max(info['max_depth'], _num(to[i]) if drill.to_column and _num(to[i]) is not None else depth)
        t, off = project(px, py)
        if not (-1e-9 <= t <= length + 1e-9 and abs(off) <= half):
            quality['outside'] += 1
            continue
        quality['in_section'] += 1
        if hole is not None and hole in holes:
            holes[hole]['in_band'] = True
        if pz is None:
            quality['no_elevation'] += 1
        value = values[i] if value_label else None
        if value_label and value is None:
            quality['no_value'] += 1
        category = None
        if config.category_column:
            raw = cats[i]
            category = 'Sin dato' if raw is None or str(raw).strip() == '' else str(raw)
        points.append(dict(row_index=i, sample_id=str(ids[i]) if ids[i] is not None else f'Fila {i + 1}', distance=t, offset=off,
                           z=pz, value=value, category=category, hole=hole, depth=depth))
        if hole is None and pz is not None:
            surface.append((t, pz))

    traces = []
    for info in holes.values():
        if not info['in_band']:
            continue
        cx, cy, cz = info['collar']
        h, v = math.cos(math.radians(info['dip'])), math.sin(math.radians(info['dip']))
        end = (cx + info['max_depth'] * h * math.sin(math.radians(info['az'])), cy + info['max_depth'] * h * math.cos(math.radians(info['az'])))
        (t0, o0), (t1, o1) = project(cx, cy), project(*end)
        traces.append(dict(hole=info['hole'], collar_distance=t0, collar_offset=o0, collar_z=cz,
                           end_distance=t1, end_z=cz + info['max_depth'] * v if cz is not None else None,
                           max_depth=info['max_depth'], azimuth=info['az'], dip=info['dip']))
        if cz is not None:
            surface.append((t0, cz))

    topography, topo_source = None, None
    if dem is not None:
        n = min(MAX_TOPO_POINTS, max(2, int(length / max(min(dem.dx, dem.dy), length / MAX_TOPO_POINTS)) + 1))
        ts = np.linspace(0, length, n)
        zs = dem.sample(ax + ts * ux, ay + ts * uy)
        topography = [[float(t), float(z) if math.isfinite(z) else None] for t, z in zip(ts, zs)]
        topo_source = 'dem'
        if np.isnan(zs).all():
            warnings.append('La línea de sección cae fuera del DEM.')
    elif len(surface) >= 2:
        topography = [[t, z] for t, z in sorted(surface)]
        topo_source = 'samples'

    if not points:
        warnings.append('Ninguna muestra cae dentro de la banda de la sección; aumenta el ancho o mueve la línea.')
    if quality['no_value']:
        warnings.append(f"{quality['no_value']} muestras sin valor (faltante, censurado o no finito) se dibujan sin color; no se imputan.")
    if quality['no_elevation'] and quality['in_section']:
        warnings.append(f"{quality['no_elevation']} muestras sin cota: solo aparecen en el perfil de valores. Asigna una columna de cota o un DEM.")
    if drill:
        warnings.append('Sondajes rectos desde el collar con un azimut e inclinación por fila; no se modelan desviaciones (survey).')
    warnings.append(f'Muestras proyectadas perpendicularmente a la línea desde ±{half:g} m.')

    return dict(
        line=dict(start=list(config.start), end=list(config.end), length=length, azimuth=azimuth, width=config.width),
        crs=dict(epsg=setup['epsg'], label=setup['label'], source=setup['source'], x_column=setup['x'], y_column=setup['y']),
        value_label=value_label, category_column=config.category_column, points=points, holes=traces,
        topography=topography, topography_source=topo_source, dem=dict(name=dem.name, epsg=dem.epsg) if dem else None,
        quality=quality, warnings=warnings, created_at=datetime.now(timezone.utc).isoformat(),
    )
