"""Digital elevation models for sections: ESRI ASCII grids (.asc) and GeoTIFF (.tif/.tiff, north-up, no rotation).

Only reading and bilinear sampling: the DEM is never resampled or reprojected. Its reference system, when the file
declares one (GeoTIFF GeoKeys), must match the dataset's; an ESRI ASCII grid carries none and is assumed to share it.
"""
from __future__ import annotations

import math
import os
from dataclasses import dataclass
from functools import lru_cache

import numpy as np

MAX_CELLS = 60_000_000


@dataclass(frozen=True)
class Dem:
    x0: float          # x of the centre of the first column
    y0: float          # y of the centre of the first (top) row
    dx: float          # cell size along x (> 0)
    dy: float          # cell size along y (> 0, rows go south)
    z: np.ndarray      # float64, NaN where there is no data
    epsg: int | None
    name: str

    @property
    def extent(self) -> tuple[float, float, float, float]:
        rows, cols = self.z.shape
        return (self.x0, self.x0 + (cols - 1) * self.dx, self.y0 - (rows - 1) * self.dy, self.y0)

    def sample(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        """Bilinear elevation at (x, y); NaN outside the grid or next to no-data cells."""
        x, y = np.asarray(x, float), np.asarray(y, float)
        rows, cols = self.z.shape
        c, r = (x - self.x0) / self.dx, (self.y0 - y) / self.dy
        inside = (c >= 0) & (c <= cols - 1) & (r >= 0) & (r <= rows - 1)
        out = np.full(x.shape, np.nan)
        if not inside.any():
            return out
        ci, ri = c[inside], r[inside]
        c0, r0 = np.clip(np.floor(ci).astype(int), 0, max(cols - 2, 0)), np.clip(np.floor(ri).astype(int), 0, max(rows - 2, 0))
        c1, r1 = np.minimum(c0 + 1, cols - 1), np.minimum(r0 + 1, rows - 1)
        fc, fr = ci - c0, ri - r0
        z = self.z
        out[inside] = (z[r0, c0] * (1 - fc) * (1 - fr) + z[r0, c1] * fc * (1 - fr) + z[r1, c0] * (1 - fc) * fr + z[r1, c1] * fc * fr)
        return out


def _read_asc(path: str) -> Dem:
    header: dict[str, float] = {}
    with open(path, encoding='utf-8', errors='replace') as fh:
        while len(header) < 6:
            pos = fh.tell()
            line = fh.readline()
            if not line:
                break
            parts = line.split()
            if len(parts) == 2 and parts[0][0].isalpha():
                header[parts[0].lower()] = float(parts[1])
            else:
                fh.seek(pos)
                break
        for key in ('ncols', 'nrows', 'cellsize'):
            if key not in header:
                raise ValueError(f'Grilla ESRI ASCII sin «{key}» en la cabecera')
        cols, rows, size = int(header['ncols']), int(header['nrows']), header['cellsize']
        if cols * rows > MAX_CELLS:
            raise ValueError('El DEM es demasiado grande; recórtalo a la zona de trabajo')
        data = np.loadtxt(fh, dtype=float, ndmin=2)
    if data.shape != (rows, cols):
        raise ValueError(f'La grilla ESRI ASCII declara {rows}×{cols} celdas pero contiene {data.shape[0]}×{data.shape[1]}')
    if 'xllcenter' in header:
        x0, ybottom = header['xllcenter'], header['yllcenter']
    else:
        x0, ybottom = header['xllcorner'] + size / 2, header['yllcorner'] + size / 2
    nodata = header.get('nodata_value')
    if nodata is not None:
        data[data == nodata] = np.nan
    return Dem(x0=x0, y0=ybottom + (rows - 1) * size, dx=size, dy=size, z=data, epsg=None, name=os.path.basename(path))


def _read_tiff(path: str) -> Dem:
    import tifffile
    with tifffile.TiffFile(path) as tif:
        page = tif.pages[0]
        tags = page.tags
        scale = tags.get('ModelPixelScaleTag')
        tie = tags.get('ModelTiepointTag')
        if scale is None or tie is None:
            raise ValueError('El GeoTIFF no tiene georreferencia (ModelPixelScale/ModelTiepoint)')
        if tags.get('ModelTransformationTag') is not None:
            raise ValueError('GeoTIFF rotado no soportado; expórtalo orientado al norte')
        if page.shape[0] * page.shape[1] > MAX_CELLS:
            raise ValueError('El DEM es demasiado grande; recórtalo a la zona de trabajo')
        data = page.asarray().astype(float)
        if data.ndim == 3:
            data = data[..., 0] if data.shape[-1] <= 4 else data[0]
        sx, sy = float(scale.value[0]), float(scale.value[1])
        i, j, _k, x, y, _z = (float(v) for v in tie.value[:6])
        pixel_is_point = False
        epsg = None
        geokeys = tags.get('GeoKeyDirectoryTag')
        if geokeys is not None:
            keys = list(geokeys.value)
            for n in range(4, len(keys), 4):
                key, loc, _count, value = keys[n:n + 4]
                if loc == 0 and key == 3072 and 1024 <= value < 32767:      # ProjectedCSTypeGeoKey wins
                    epsg = int(value)
                elif loc == 0 and key == 2048 and 1024 <= value < 32767 and epsg is None:   # GeographicTypeGeoKey
                    epsg = int(value)
                if key == 1025 and loc == 0:
                    pixel_is_point = value == 2
        nodata_tag = tags.get('GDAL_NODATA')
        if nodata_tag is not None:
            try:
                data[data == float(str(nodata_tag.value).strip().strip('\x00'))] = np.nan
            except ValueError:
                pass
    half = 0.0 if pixel_is_point else 0.5
    x0 = x + (half - i) * sx
    y0 = y - (half - j) * sy
    return Dem(x0=x0, y0=y0, dx=sx, dy=sy, z=data, epsg=epsg, name=os.path.basename(path))


@lru_cache(maxsize=4)
def _load(path: str, mtime: float) -> Dem:
    ext = os.path.splitext(path)[1].lower()
    if ext == '.asc':
        dem = _read_asc(path)
    elif ext in ('.tif', '.tiff'):
        dem = _read_tiff(path)
    else:
        raise ValueError('Formato de DEM no soportado: usa GeoTIFF (.tif) o ESRI ASCII (.asc)')
    if not (dem.dx > 0 and dem.dy > 0 and math.isfinite(dem.x0) and math.isfinite(dem.y0)):
        raise ValueError('Georreferencia del DEM no válida')
    return dem


def load_dem(path: str) -> Dem:
    if not path or not os.path.isabs(path):
        raise ValueError('Indica la ruta completa del archivo DEM')
    if not os.path.isfile(path):
        raise ValueError(f'No existe el archivo DEM: {path}')
    return _load(path, os.path.getmtime(path))
