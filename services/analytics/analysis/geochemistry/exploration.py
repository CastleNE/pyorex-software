"""Exploration calculations. Read-only data, explicit preprocessing and row provenance."""
from datetime import datetime, timezone
from typing import Literal

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pyproj import CRS
from scipy.spatial import Delaunay, QhullError, cKDTree
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

from analysis.geochemistry.engine import QAQC, _number
from analysis.qaqc.common import infer_sample_id_column


class ExplorationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    tool: Literal['anomalies', 'kmeans', 'isovalues']
    variables: list[str] = Field(min_length=1, max_length=30)
    include_qaqc: bool = False
    label_column: str | None = None
    method: Literal['manual', 'percentile'] = 'manual'
    breaks: list[float] = Field(default_factory=lambda: [1., 2., 3.], min_length=1, max_length=9)
    labels: list[str] = Field(default_factory=lambda: ['Fondo', 'Baja', 'Media', 'Alta'])
    k: int = Field(default=3, ge=2, le=20)
    seed: int = Field(default=42, ge=0, le=2147483647)
    transform: Literal['none', 'log10'] = 'none'
    east: str | None = None
    north: str | None = None
    epsg: int | None = None
    resolution: int = Field(default=60, ge=11, le=200)
    power: float = Field(default=2., ge=.5, le=5.)
    neighbors: int = Field(default=12, ge=3, le=64)
    radius: float | None = Field(default=None, gt=0)

    @model_validator(mode='after')
    def validate_parameters(self):
        if len(set(self.variables)) != len(self.variables):
            raise ValueError('Selecciona variables distintas')
        if self.tool != 'kmeans' and len(self.variables) != 1:
            raise ValueError('Selecciona un elemento')
        if self.tool == 'kmeans' and len(self.variables) < 2:
            raise ValueError('K-means requiere al menos dos variables')
        if self.tool == 'anomalies':
            if any(b <= a for a,b in zip(self.breaks,self.breaks[1:])):
                raise ValueError('Los cortes deben ser estrictamente crecientes')
            if self.method == 'percentile' and not all(0 < b < 100 for b in self.breaks):
                raise ValueError('Los percentiles deben estar entre 0 y 100')
            if len(self.labels) != len(self.breaks)+1 or len(set(self.labels)) != len(self.labels) or any(not x.strip() for x in self.labels):
                raise ValueError('Cada intervalo requiere un nombre único no vacío')
        if bool(self.east) != bool(self.north):
            raise ValueError('Selecciona ambas coordenadas o ninguna')
        if self.east and (self.east == self.north or self.east in self.variables or self.north in self.variables):
            raise ValueError('Coordenadas y elementos deben ser columnas distintas')
        if self.tool == 'isovalues' and not (self.east and self.north and self.epsg):
            raise ValueError('Isovalores requiere Este, Norte y EPSG proyectado')
        return self


class ExplorationDatasetRequest(ExplorationRequest):
    dataset_id: str


def _prepare(df, config, roles):
    if df.height > 100_000:
        raise ValueError('Máximo 100 000 muestras por cálculo; crea un subconjunto explícito')
    required = config.variables + ([config.east,config.north] if config.east else [])
    for column in required + ([config.label_column] if config.label_column else []):
        if column not in df.columns:
            raise ValueError(f'Columna desconocida: {column}')
    sample_column = config.label_column or infer_sample_id_column(df,roles or {})
    rows, values, positions, kept = [], [], [], []
    quality = dict(total=df.height, used=0, invalid=0, excluded_qaqc=0)
    for index,raw in enumerate(df.iter_rows(named=True)):
        row = dict(sample_id=str(raw.get(sample_column) or f'row-{index+1}'),row_index=index,
                   group='Muestras',status='valid',reason=None,x=None,y=None,z=None,values=None,classification=None)
        if not config.include_qaqc and str(raw.get('__sample_type__','')).upper() in QAQC:
            row.update(status='excluded',reason='Control QAQC')
            quality['excluded_qaqc'] += 1
        else:
            numbers = [_number(raw.get(c)) if raw.get(f'_nulltype_{c}') not in {'BELOW_LOD','NOT_ANALYZED','MISSING'} else None for c in required]
            analytical = numbers if config.tool == 'isovalues' else numbers[:len(config.variables)]
            invalid = any(x is None for x in analytical)
            if not invalid and config.tool == 'kmeans' and config.transform == 'log10':
                invalid = any(x <= 0 for x in numbers[:len(config.variables)])
            if invalid:
                row.update(status='invalid',reason='Dato faltante/censurado/no finito o no positivo para log10')
                quality['invalid'] += 1
            else:
                kept.append(index)
                values.append(numbers[:len(config.variables)])
                coordinates = numbers[-2:] if config.east else [index+1,numbers[0]]
                positions.append(coordinates if all(x is not None for x in coordinates) else [None,None])
                row.update(x=positions[-1][0],y=positions[-1][1],values=values[-1])
                quality['used'] += 1
        rows.append(row)
    if not values:
        raise ValueError('No hay muestras válidas después de excluir datos faltantes y controles')
    return rows,np.asarray(values),np.asarray(positions,dtype=float),kept,quality


def _idw(xy, values, config):
    crs = CRS.from_epsg(config.epsg)
    if not crs.is_projected:
        raise ValueError('IDW requiere coordenadas proyectadas; longitud/latitud en grados no es válida')
    points,inverse = np.unique(xy,axis=0,return_inverse=True)
    counts = np.bincount(inverse)
    z = np.bincount(inverse,weights=values)/counts
    if len(points) < 3 or np.linalg.matrix_rank(points-points.mean(axis=0)) < 2:
        raise ValueError('Se requieren al menos tres ubicaciones distintas no colineales')
    try:
        hull = Delaunay(points)
    except QhullError as exc:
        raise ValueError('Geometría degenerada para interpolación 2D') from exc
    gx = np.linspace(points[:,0].min(),points[:,0].max(),config.resolution)
    gy = np.linspace(points[:,1].min(),points[:,1].max(),config.resolution)
    xx,yy = np.meshgrid(gx,gy)
    targets = np.column_stack([xx.ravel(),yy.ravel()])
    distance,indices = cKDTree(points).query(targets,k=min(config.neighbors,len(points)))
    # Relative distances keep weights bounded even for large projected coordinates.
    exact = distance[:,0] == 0
    safe = np.maximum(distance,np.finfo(float).tiny)
    weights = (safe[:,[0]]/safe)**config.power
    if config.radius is not None:
        weights[distance > config.radius] = 0
    support = weights.sum(axis=1)
    predicted = np.divide((weights*z[indices]).sum(axis=1),support,out=np.full(len(targets),np.nan),where=support>0)
    predicted[exact] = z[indices[exact,0]]
    predicted[hull.find_simplex(targets) < 0] = np.nan
    grid = predicted.reshape(len(gy),len(gx))
    return dict(x=gx.tolist(),y=gy.tolist(),z=[[float(v) if np.isfinite(v) else None for v in line] for line in grid],
                epsg=config.epsg,coordinate_unit=crs.axis_info[0].unit_name), dict(
                unique_locations=len(points),duplicate_locations=len(xy)-len(points),
                supported_cells=int(np.isfinite(grid).sum()),total_cells=int(grid.size))


def explore(df: pl.DataFrame, request: dict, roles=None):
    config = ExplorationRequest.model_validate(request)
    rows,values,xy,kept,quality = _prepare(df,config,roles)
    warnings = ['Valores y umbrales en las unidades originales de las columnas seleccionadas.']
    missing_coordinates = sum(rows[i]['x'] is None for i in kept) if config.east else 0
    if missing_coordinates:
        warnings.append(f'{missing_coordinates} muestras participan en el análisis pero no se dibujan en el mapa por falta de coordenadas.')
    plot = dict(kind='scatter',x_label=config.east or 'Orden de muestra',y_label=config.north or config.variables[0],
                z_label='',log_x=False,log_y=False,fields=[])
    pipeline = {**config.model_dump(), 'missing_policy':'exclude_without_imputation','engine_version':'1.0.0'}
    metrics,grid = {},None
    if config.tool == 'anomalies':
        thresholds = np.percentile(values[:,0],config.breaks).tolist() if config.method == 'percentile' else config.breaks
        groups = np.searchsorted(thresholds,values[:,0],side='right')
        for i,(index,group) in enumerate(zip(kept,groups)):
            rows[index].update(group=config.labels[group],classification=config.labels[group],z=float(values[i,0]))
        metrics = dict(thresholds=thresholds,counts={label:int(np.sum(groups==i)) for i,label in enumerate(config.labels)},
                       interval_rule='lower_inclusive_upper_exclusive')
        if len(set(thresholds)) < len(thresholds):
            warnings.append('Percentiles coincidentes: algunos intervalos quedan vacíos por valores repetidos.')
        warnings.append('Las clases son umbrales exploratorios; no implican mineralización económica ni un fondo geológico validado.')
        title,formula,reference = 'Anomalías por elemento','Intervalos [corte inferior, corte superior); igualdad pertenece a la clase superior.','Umbrales definidos por el usuario o percentiles empíricos (interpolación lineal).'
    elif config.tool == 'kmeans':
        transformed = np.log10(values) if config.transform == 'log10' else values
        if np.any(np.std(transformed,axis=0) == 0):
            raise ValueError('Quita las variables constantes antes de agrupar')
        scaled = StandardScaler().fit_transform(transformed)
        if len(scaled) <= config.k or len(np.unique(scaled,axis=0)) < config.k:
            raise ValueError('K debe ser menor al número de muestras y no superar las composiciones distintas')
        with threadpool_limits(limits=1):
            model = KMeans(n_clusters=config.k,random_state=config.seed,n_init=10,max_iter=300).fit(scaled)
            labels = model.labels_
            if len(np.unique(labels)) < config.k:
                raise ValueError('No se obtuvieron K grupos distintos; reduce K o revisa las variables')
            silhouette = None
            if len(scaled) <= 5000:
                silhouette = float(silhouette_score(scaled,labels))
        for i,(index,group) in enumerate(zip(kept,labels)):
            rows[index].update(group=f'Grupo {group+1}',classification=f'Grupo {group+1}')
            if not config.east:
                rows[index].update(x=float(values[i,0]),y=float(values[i,1]))
        if not config.east:
            plot.update(x_label=config.variables[0],y_label=config.variables[1])
        metrics = dict(inertia=float(model.inertia_),silhouette=silhouette,iterations=int(model.n_iter_),
                       counts={f'Grupo {i+1}':int(np.sum(labels==i)) for i in range(config.k)},
                       centroids=[dict(group=f'Grupo {i+1}',values={v:float(values[labels==i,j].mean()) for j,v in enumerate(config.variables)}) for i in range(config.k)])
        pipeline.update(standardized=True,n_init=10,max_iter=300)
        if silhouette is None:
            warnings.append('Silhouette no calculada para más de 5000 muestras; agrupamiento usa todas las válidas.')
        warnings.append('Grupos calculados sobre todas las variables estandarizadas; el XY muestra solo dos. Centroides: medias en unidades originales. Los grupos no son dominios geológicos validados.')
        title,formula,reference = 'K-means multielemental','K-means++ con 10 inicializaciones; z-score por variable después de la transformación seleccionada.','https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html'
    else:
        grid,metrics = _idw(xy,values[:,0],config)
        for i,index in enumerate(kept):
            rows[index]['z'] = float(values[i,0])
        plot['kind'] = 'contour'
        warnings.extend(['IDW 2D dentro de la envolvente convexa, sin extrapolación exterior. No es kriging ni estimación de recursos.',
                         'Ubicaciones duplicadas se promedian para la superficie. No mezclar profundidades de sondaje en un mapa superficial.',
                         'Revisa el radio de búsqueda: la envolvente convexa puede incluir zonas sin muestreo. No se calcula incertidumbre.'])
        title,formula,reference = 'Isovalores IDW', 'z(x)=Σ[zᵢ/dᵢᵖ] / Σ[1/dᵢᵖ], vecinos y radio configurables.', 'https://pro.arcgis.com/en/pro-app/latest/help/analysis/geostatistical-analyst/how-inverse-distance-weighted-interpolation-works.htm'
    if quality['invalid']:
        warnings.append(f"{quality['invalid']} filas no válidas, excluidas sin imputación; motivos conservados en la tabla.")
    if config.include_qaqc:
        warnings.append('Controles QAQC incluidos por solicitud explícita.')
    return dict(tool=config.tool,title=title,rows=rows,quality=quality,plot=plot,warnings=warnings,
                formula=formula,reference=reference,pipeline=pipeline,metrics=metrics,grid=grid,
                created_at=datetime.now(timezone.utc).isoformat())
