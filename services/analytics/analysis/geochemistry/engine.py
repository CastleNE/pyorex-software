"""Numerical work stays on the server; originals and overlays are read-only."""
import csv
import json
import math
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

import polars as pl
from scipy.stats import norm, rankdata

from analysis.geochemistry.catalog import BY_ID
from analysis.geochemistry.core.indices import (
    MOLAR_MASSES, calculate_a_cnk, calculate_a_nk, calculate_alteration_indices, calculate_fe_index, calculate_mali,
    calculate_shand_indices, convert_fe2o3t_to_feot,
)
from analysis.geochemistry.core.ratios import calculate_ratio
from analysis.geochemistry.custom_diagram import CUSTOM_TOOL_ID, calculate_custom
from analysis.geochemistry.models import ComputeRequest
from analysis.qaqc.common import infer_sample_id_column

REFERENCES = Path(__file__).with_name('references')
QAQC = {'FB','LB','QB','FD','LD','QD','CRM','STD'}
# Compatibility alias: the molar-mass table now lives in core.indices (single source); this is the same object.
MOLAR = MOLAR_MASSES


@lru_cache
def reference_values(name):
    if name not in {'chondrite','primitive_mantle'}:
        raise ValueError('Unknown reference')
    with (REFERENCES / f'{name}.csv').open(encoding='utf-8-sig') as source:
        return {row['var']: float(row['value']) for row in csv.DictReader(source)
                if row['units'] == 'ppm' and row['value']}


@lru_cache
def tas_fields():
    data = json.loads((REFERENCES / 'tas.json').read_text())
    fields = []
    for code, field in data['fields'].items():
        if not field['poly']:
            continue
        name = field['name'][0].replace('-\n','').replace('\n',' ')
        if code == 'U1':
            name = 'Tephrite / Basanite'
        fields.append({'id':code,'name':name,'points':field['poly']})
    return fields


def in_polygon(x, y, polygon):
    """Returns interior/boundary/outside; shared boundaries remain ambiguous."""
    inside = False
    for (ax, ay), (bx, by) in zip(polygon, polygon[1:] + polygon[:1]):
        cross = (x-ax)*(by-ay) - (y-ay)*(bx-ax)
        if abs(cross) < 1e-9 and min(ax,bx)-1e-9 <= x <= max(ax,bx)+1e-9 and min(ay,by)-1e-9 <= y <= max(ay,by)+1e-9:
            return 'boundary'
        if (ay > y) != (by > y) and x < (bx-ax)*(y-ay)/(by-ay)+ax:
            inside = not inside
    return 'interior' if inside else 'outside'


def _number(raw):
    if raw is None or isinstance(raw, bool):
        return None
    try:
        value = float(raw)
        return value if math.isfinite(value) else None
    except (ValueError, TypeError):
        return None


# Legacy name kept for the branches not migrated yet (ternary, qapf, Eu/Eu*, Ce/Ce*): the same function as the core's.
_divide = calculate_ratio


def _coordinates(tool, v, ordinal):
    if tool in {'downhole','downhole-compare'}:
        if v['Depth'] < 0:
            raise ValueError('Profundidad negativa')
        return {'x':v.get('Value',v.get('Assay1')),'y':v['Depth'],'z':v.get('Assay2')}
    if tool == 'assay-difference':
        return {'x':v['X']/2+v['Y']/2,'y':v['Y']-v['X']}
    if tool in {'qq-normal','probability','ecdf'}:
        return {'x':v['X'],'y':v['X']}
    if tool in {'line','assay-compare'}:
        return {'x':v['X'],'y':v['Y']}
    if tool in {'scatter','harker','k2o-sio2'}:
        keys = BY_ID[tool]['inputs']
        return {'x':v[keys[0]],'y':v[keys[1]]}
    if tool in {'histogram','boxplot'}:
        return {'x':v['X'],'y':v['X']}
    if tool in {'ternary','afm'}:
        a,b,c = (v['A'],v['B'],v['C']) if tool == 'ternary' else (v['Na2O']+v['K2O'],v['FeTotal'],v['MgO'])
        total = a+b+c
        return {'x':_divide(a*100,total),'y':_divide(b*100,total),'z':_divide(c*100,total)}
    if tool == 'qapf':
        q,a,p,f = [v[k] for k in ['Q','A','P','F']]
        if q > 0 and f > 0:
            raise ValueError('Q y F no pueden coexistir en esta proyección modal')
        total = q+a+p+f
        return {'x':_divide(p+.5*(q+f),total),'y':_divide(math.sqrt(3)/2*(q-f),total)}
    if tool == 'tas':
        x,y = v['SiO2'],v['Na2O']+v['K2O']
        if x+y > 100:
            raise ValueError('SiO2 + álcalis supera 100 wt%')
        found = [(field['name'],in_polygon(x,y,field['points'])) for field in tas_fields()]
        boundary = [name for name,where in found if where == 'boundary']
        interior = [name for name,where in found if where == 'interior']
        name = 'Boundary: ' + ' / '.join(boundary) if boundary else ' / '.join(interior) or 'Outside reference fields'
        return {'x':x,'y':y,'classification':name}
    if tool == 'mali':
        return {'x':v['SiO2'],'y':calculate_mali(v['Na2O'],v['K2O'],v['CaO'])}
    if tool == 'fe-index':
        return {'x':v['SiO2'],'y':calculate_fe_index(v['FeTotal'],v['MgO'])}
    if tool in {'shand-index','a-cnk','a-nk'}:
        if tool == 'a-nk':
            return {'x':ordinal,'y':calculate_a_nk(v['Al2O3'],v['Na2O'],v['K2O'])}
        if tool == 'a-cnk':
            # CURRENT BEHAVIOR — characterization only: the legacy branch also evaluates A/NK for the A/CNK tool, so a
            # zero Na2O + K2O invalidates the row even though A/CNK alone is computable. Reproduced on purpose.
            calculate_a_nk(v['Al2O3'],v['Na2O'],v['K2O'])
            return {'x':ordinal,'y':calculate_a_cnk(v['Al2O3'],v['CaO'],v['Na2O'],v['K2O'])}
        acnk,ank = calculate_shand_indices(v['Al2O3'],v['CaO'],v['Na2O'],v['K2O'])
        return {'x':acnk,'y':ank}
    if tool in {'fertility-eu-eu','fertility-ce-ce'}:
        a,b,c = ('Sm','Eu','Gd') if tool == 'fertility-eu-eu' else ('La','Ce','Pr')
        ref = reference_values('chondrite')
        return {'x':ordinal, 'y':_divide(v[b]/ref[b],math.sqrt(v[a]/ref[a])*math.sqrt(v[c]/ref[c]))}
    if tool == 'alteration':
        ai,ccpi = calculate_alteration_indices(v['MgO'],v['K2O'],v['Na2O'],v['CaO'],v['FeTotal'])
        return {'x':ai,'y':ccpi}
    keys = BY_ID[tool]['inputs']
    return {'x':ordinal,'y':calculate_ratio(v[keys[0]],v[keys[1]])}


def calculate(df: pl.DataFrame, request: dict, roles=None):
    config = ComputeRequest.model_validate(request)
    if config.tool == CUSTOM_TOOL_ID:
        if config.diagram is None:
            raise ValueError('Falta la definición del diagrama propio')
        return calculate_custom(df, config.model_dump(), roles)
    if config.diagram is not None:
        raise ValueError('La definición de diagrama solo aplica a diagramas propios')
    spec = BY_ID.get(config.tool)
    if not spec:
        raise ValueError('Herramienta no disponible')
    columns = config.columns
    if config.tool.startswith('downhole') and not config.group_column:
        raise ValueError('Selecciona la columna ID del sondaje en Grupo / sondaje')
    if set(columns) - set(spec['inputs']):
        raise ValueError('Entradas desconocidas')
    if spec['optional_inputs']:
        if len(columns) < 2:
            raise ValueError('Selecciona al menos dos elementos')
    elif set(columns) != set(spec['inputs']):
        raise ValueError('Mapea todas las entradas requeridas')
    if len(set(columns.values())) != len(columns):
        raise ValueError('Cada entrada requiere una columna distinta')
    if set(config.units) - set(columns):
        raise ValueError('Unidades para entradas no seleccionadas')
    for column in [*columns.values(),config.group_column,config.label_column,config.size_column,config.color_column]:
        if column is not None and column not in df.columns:
            raise ValueError(f'Columna desconocida: {column}')
    if df.height > 100_000:
        raise ValueError('Esta versión admite hasta 100 000 muestras por cálculo; crea un subconjunto explícito.')
    if config.group_column and df[config.group_column].n_unique() > 50:
        raise ValueError('El color categórico admite hasta 50 grupos; elige otra columna.')
    units = {key:config.units.get(key,spec['unit']) for key in columns}
    if spec['unit'] != 'raw' and 'raw' in units.values():
        raise ValueError('Especifica unidades de concentración para esta herramienta')
    if config.tool == 'ternary' and len(set(units.values())) != 1:
        raise ValueError('El ternario requiere una misma unidad en sus tres componentes')
    kind = spec['kind']
    if kind in {'ternary','qapf','box','spider','histogram'} and (config.log_x or config.log_y):
        raise ValueError('Esta herramienta define su propia escala; desactiva Log X/Log Y')
    sample_column = config.label_column or infer_sample_id_column(df,roles)
    labels = spec['inputs']
    plot = {'kind':kind,'x_label':columns.get(labels[0],labels[0]),'y_label':columns.get(labels[1],labels[1]) if len(labels)>1 else 'Frecuencia',
            'z_label':labels[2] if len(labels)>2 else '', 'log_x':config.log_x,'log_y':config.log_y,'fields':[]}
    axes = {'tas':('SiO2 (wt%)','Na2O + K2O (wt%)'),'mali':('SiO2 (wt%)','MALI (wt%)'),
            'fe-index':('SiO2 (wt%)','FeOT / (FeOT + MgO)'), 'shand-index':('A/CNK (molar)','A/NK (molar)'),
            'qapf':('A ← proporción modal → P','F ← componente modal → Q'),
            'alteration':('AI','CCPI'),'harker':('SiO2 (wt%)',f"{columns.get('Oxide','Oxide')} (wt%)"),
            'k2o-sio2':('SiO2 (wt%)','K2O (wt%)')}
    if config.tool in axes:
        plot['x_label'],plot['y_label'] = axes[config.tool]
    if config.tool == 'afm':
        plot.update(x_label='A: Na2O + K2O',y_label='F: FeOT',z_label='M: MgO')
    if config.tool in {'a-cnk','a-nk','element-ratios'} or config.tool.startswith('fertility-'):
        plot.update(x_label='Orden de muestra',y_label=spec['label'])
    if config.tool == 'tas':
        plot['fields'] = tas_fields()
    if kind == 'downhole':
        plot.update(x_label=columns.get('Value',columns.get('Assay1')),y_label=f"Profundidad: {columns['Depth']}")
    if kind == 'qq':
        plot.update(x_label='Cuantil normal teórico',y_label=columns['X'])
    if kind in {'probability','ecdf'}:
        plot.update(x_label=columns['X'],y_label='Probabilidad acumulada (%)')
    if kind == 'difference':
        plot.update(x_label=f"Media de {columns['X']} y {columns['Y']}",y_label=f"{columns['Y']} − {columns['X']}")
    selected_elements = [key for key in spec['inputs'] if key in columns]
    if kind == 'spider':
        plot.update(elements=selected_elements,log_y=True,y_label='Muestra / referencia',x_label='Elemento')
    rows = []
    quality = {'total':df.height,'used':0,'invalid':0,'excluded_qaqc':0}
    warnings = []
    if config.tool in {'tas','qapf','afm','k2o-sio2'}:
        warnings.append(spec['reference'])
    if config.tool == 'tas':
        warnings.append('Usa óxidos en base anhidra. No se renormaliza automáticamente ni se corrige alteración.')
    if config.tool == 'qapf':
        warnings.append('Verifica M < 90%; este formulario no mide minerales máficos ni calcula norma CIPW.')
    for index, raw in enumerate(df.iter_rows(named=True)):
        sample_id = str(raw.get(sample_column) or f'row-{index+1}')
        row = {'sample_id':sample_id,'row_index':index,'group':str(raw.get(config.group_column,'Sin grupo')) if config.group_column else 'Muestras',
               'status':'valid','reason':None,'x':None,'y':None,'z':None,'values':None,'classification':None}
        depth = _number(raw.get(columns.get('Depth'))) if kind == 'downhole' else None
        if depth is not None and depth >= 0:
            row['y'] = depth
        for attr,column in [('size_value',config.size_column),('color_value',config.color_column)]:
            row[attr] = _number(raw.get(column)) if column and raw.get(f'_nulltype_{column}') not in {'BELOW_LOD','MISSING','NOT_ANALYZED'} else None
        if not config.include_qaqc and str(raw.get('__sample_type__','')).upper() in QAQC:
            quality['excluded_qaqc'] += 1
            rows.append({**row,'status':'excluded','reason':'Muestra de control QAQC'})
            continue
        try:
            if kind == "downhole" and (raw.get(config.group_column) is None or not str(raw.get(config.group_column)).strip()):
                raise ValueError("Falta identificador de sondaje")
            values = {}
            for key,column in columns.items():
                number = _number(raw[column])
                if raw.get(f'_nulltype_{column}') in {'BELOW_LOD','NOT_ANALYZED','MISSING'}:
                    number = None
                if number is not None and spec['unit'] != 'raw':
                    ppm_factor = {'pct':10_000,'ppm':1,'ppb':.001}[units[key]]
                    number *= ppm_factor / (10_000 if spec['unit'] == 'pct' else 1)
                values[key] = number
            if kind == 'spider':
                ref = reference_values('chondrite' if config.tool == 'ree-normalization' else 'primitive_mantle')
                normalized = [values[key]/ref[key] if values[key] is not None and values[key]>0 else None for key in selected_elements]
                if sum(n is not None and math.isfinite(n) for n in normalized) < 2:
                    raise ValueError('Menos de dos elementos positivos válidos')
                row['values'] = [n if n is not None and math.isfinite(n) else None for n in normalized]
            else:
                if any(v is None for v in values.values()):
                    raise ValueError('Dato faltante, censurado o no finito')
                if (spec['unit'] != 'raw' or config.tool == 'ternary') and any(v<0 for v in values.values()):
                    raise ValueError('Concentración o componente negativo')
                if 'FeTotal' in values and config.iron_basis == 'Fe2O3T':
                    values['FeTotal'] = convert_fe2o3t_to_feot(values['FeTotal'])
                row.update(_coordinates(config.tool,values,index+1))
                if any(row[k] is not None and not math.isfinite(row[k]) for k in ['x','y','z']):
                    raise ValueError('Resultado no finito')
                if (config.log_x and row['x'] <= 0) or (config.log_y and row['y'] <= 0):
                    raise ValueError('Escala logarítmica requiere valores positivos')
            quality['used'] += 1
        except (ValueError,ZeroDivisionError,OverflowError) as exc:
            row.update(status='invalid',reason=str(exc),x=None,y=depth if depth is not None and depth >= 0 else None,z=None,values=None)
            quality['invalid'] += 1
        rows.append(row)
    if kind in {'qq','probability','ecdf'}:
        for group in {r['group'] for r in rows if r['status']=='valid'}:
            ordered = sorted([r for r in rows if r['status']=='valid' and r['group']==group],key=lambda r:r['x'])
            observed = [r['x'] for r in ordered]
            ranks = rankdata(observed,method='max')
            for i,row in enumerate(ordered):
                quantile = float(norm.ppf((i+.5)/len(ordered)))
                if kind == 'qq':
                    row.update(x=quantile,y=observed[i])
                else:
                    row['y'] = float(ranks[i]/len(ordered)*100) if kind=='ecdf' else quantile
    if kind == 'downhole':
        warnings.append('Profundidad medida 1D; no representa coordenadas 3D ni corrige desviaciones del sondaje. Verifica unidades y correspondencia de intervalos.')
    if kind in {'assay','difference'}:
        warnings.append('Emparejamiento por fila: verifica ID de muestra, intervalo y unidades antes de interpretar diferencias entre ensayes.')
    if quality['invalid']:
        warnings.append(f"{quality['invalid']} muestra(s) no graficables; motivos en tabla. No se imputaron valores.")
    if config.include_qaqc:
        warnings.append('Controles QAQC incluidos por solicitud explícita.')
    return {'tool':config.tool,'title':spec['label'],'rows':rows,'plot':plot,'quality':quality,'warnings':warnings,
            'formula':spec['formula'],'reference':spec['reference'],
            'pipeline':{**config.model_dump(exclude={'diagram'}),'units':units,'missing_policy':'exclude_without_imputation',
                        'reference_version':'pyrolite@ab651b448ecd2ce1bc22d752b80a977a1f4dd1ca','engine_version':'1.0.0'},
            'created_at':datetime.now(timezone.utc).isoformat()}
