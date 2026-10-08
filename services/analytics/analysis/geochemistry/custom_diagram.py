"""Diagram Builder (Phase 4): diagrams defined by the user, with every axis a free expression over the dataset
columns (e.g. ``Sr/Y``, ``La/Yb``, ``log10(Cu_ppm)``, ``(Na2O+K2O)/Al2O3``) and optional classification fields
(polygons in data coordinates). Ternary diagrams take three expressions (A, B, C) normalised to 100.

Science stays here, in Python: expressions are parsed and whitelisted by ``analysis.data.formula`` (no attribute
access, no imports, only log10/sqrt/abs/log/exp/IF), translated to vectorised Polars expressions and evaluated per row.
Nothing is imputed: a row with a missing, censored (below LOD, not analysed) or non-finite value is reported invalid
with its reason, exactly like the built-in tools. Results have the same shape as ``engine.calculate`` so the frontend
renders them with the same chart, layers, classes and exports.

Column names that are not Python identifiers (``Cu ppm``, ``La/Yb``, ``Fe2O3(T)``) are written between square
brackets: ``[Cu ppm] / 10000``.
"""
from __future__ import annotations

import ast
import math
import re
from datetime import datetime, timezone
from typing import Literal

import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from analysis.data.formula import FormulaError, _translate_to_expr, parse_and_validate
from analysis.qaqc.common import infer_sample_id_column

CUSTOM_TOOL_ID = 'custom-diagram'
QAQC = {'FB', 'LB', 'QB', 'FD', 'LD', 'QD', 'CRM', 'STD'}
CENSORED = {'BELOW_LOD', 'NOT_ANALYZED', 'MISSING'}
MAX_EXPRESSION = 500
_BRACKETED = re.compile(r'\[([^\[\]]+)\]')


class DiagramField(BaseModel):
    """A classification field: closed polygon. XY: vertices [x, y] in data units; ternary: vertices [A, B, C]
    (normalised to 100 like the samples). Edges are straight in the scale of the axes (log10 on a log axis)."""
    model_config = ConfigDict(extra='forbid', strict=True)
    id: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    points: list[list[float]] = Field(min_length=3, max_length=200)


class DiagramSpec(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    kind: Literal['xy', 'ternary'] = 'xy'
    x: str = Field(min_length=1, max_length=MAX_EXPRESSION)
    y: str = Field(min_length=1, max_length=MAX_EXPRESSION)
    z: str | None = Field(default=None, max_length=MAX_EXPRESSION)
    x_label: str | None = Field(default=None, max_length=120)
    y_label: str | None = Field(default=None, max_length=120)
    z_label: str | None = Field(default=None, max_length=120)
    fields: list[DiagramField] = Field(default_factory=list, max_length=60)
    reference: str = Field(default='', max_length=600)


class ParsedExpression:
    """A validated expression with its column references resolved to real dataset column names."""
    def __init__(self, source: str, tree: ast.Expression, columns: list[str]):
        self.source, self.tree, self.columns = source, tree, columns

    def polars(self) -> pl.Expr:
        return _translate_to_expr(self.tree)


def parse_expression(source: str, available: list[str] | None = None) -> ParsedExpression:
    """Parse, whitelist and resolve an axis expression. Raises FormulaError with a user-readable message."""
    if not source or not source.strip():
        raise FormulaError('La expresión está vacía')
    if len(source) > MAX_EXPRESSION:
        raise FormulaError('La expresión es demasiado larga')
    placeholders: dict[str, str] = {}

    def bracket(match: re.Match[str]) -> str:
        name = match.group(1).strip()
        key = f'col_{len(placeholders)}_ref'
        while key in source:   # never collide with text already in the expression
            key = f'x{key}'
        placeholders[key] = name
        return key
    text = _BRACKETED.sub(bracket, source)
    try:
        parsed = parse_and_validate(text)
    except FormulaError as exc:
        raise FormulaError(_spanish(str(exc))) from exc
    columns: list[str] = []
    for node in ast.walk(parsed.tree):
        if isinstance(node, ast.Name) and node.id in parsed.column_refs:
            node.id = placeholders.get(node.id, node.id)
            if node.id not in columns:
                columns.append(node.id)
    if not columns:
        raise FormulaError('La expresión no usa ninguna columna')
    if available is not None:
        missing = [c for c in columns if c not in available]
        if missing:
            raise FormulaError(f"Columna desconocida: {', '.join(missing)}")
    return ParsedExpression(source, parsed.tree, columns)


_MESSAGES = [
    ('Invalid syntax: ', 'Sintaxis inválida ({}). Escribe entre [corchetes] los nombres de columna con espacios o símbolos, p. ej. [Cu ppm].'),
    ('Function not allowed: ', 'Función no permitida: {}. Usa log10, log, sqrt, abs, exp o IF.'),
    ('Expression not allowed: ', 'Expresión no permitida: {}.'),
    ('Only direct function calls', 'Solo se permiten llamadas directas a funciones.'),
    ('Keyword arguments', 'No se permiten argumentos con nombre.'),
    ('Dunder names', 'Nombre no permitido.'),
    ('IF(condition', 'IF(condición, si_verdadero, si_falso) requiere 3 argumentos.'),
    ('Formula is empty', 'La expresión está vacía.'),
]


def _spanish(message: str) -> str:
    for prefix, text in _MESSAGES:
        if message.startswith(prefix):
            return text.format(message[len(prefix):].rstrip('.'))
    return message


def _prepared(df: pl.DataFrame, columns: list[str]) -> pl.DataFrame:
    """Referenced columns as Float64 with censored values (below LOD, not analysed, missing) set to null."""
    exprs = []
    for c in columns:
        if not df.schema[c].is_numeric():
            # Assays imported with "<5"-style sentinels stay text once the sentinels are removed: accept them when
            # every remaining value is a number.
            text = df[c].cast(pl.String).str.strip_chars()
            if df.schema[c] not in (pl.String, pl.Categorical) or text.cast(pl.Float64, strict=False).null_count() != text.null_count():
                raise FormulaError(f'La columna {c!r} no es numérica')
            value = pl.col(c).cast(pl.String).str.strip_chars().cast(pl.Float64, strict=False)
        else:
            value = pl.col(c).cast(pl.Float64, strict=False)
        flag = f'_nulltype_{c}'
        if flag in df.columns:
            value = pl.when(pl.col(flag).is_in(list(CENSORED))).then(None).otherwise(value)
        exprs.append(value.alias(c))
    return df.select(exprs)


def evaluate(df: pl.DataFrame, expr: ParsedExpression) -> tuple[list[float | None], list[str | None]]:
    """Value per row, or None with the reason (missing/censored input, or non-finite result)."""
    data = _prepared(df, expr.columns)
    try:
        values = data.select(expr.polars().cast(pl.Float64, strict=False).alias('_v')).to_series().to_list()
    except pl.exceptions.PolarsError as exc:
        raise FormulaError(f'No se pudo evaluar la expresión: {exc}') from exc
    has_null = data.select(pl.any_horizontal(pl.all().is_null()).alias('_n')).to_series().to_list() if expr.columns else [False] * df.height
    out: list[float | None] = []
    reasons: list[str | None] = []
    for v, missing in zip(values, has_null):
        if missing:
            out.append(None); reasons.append('Dato faltante, censurado o no finito')
        elif v is None or isinstance(v, bool) or not math.isfinite(v):
            out.append(None); reasons.append('Resultado no finito (división por cero o log/raíz de un valor no válido)')
        else:
            out.append(float(v)); reasons.append(None)
    return out, reasons


def preview(df: pl.DataFrame, expressions: dict[str, str], include_qaqc: bool = False) -> dict:
    """Live check for the builder: per axis, whether it parses, the columns it uses and the range it produces."""
    available = [c for c in df.columns if not c.startswith('_')]
    if not include_qaqc and '__sample_type__' in df.columns:
        df = df.filter(~pl.col('__sample_type__').cast(pl.Utf8).str.to_uppercase().is_in(list(QAQC)).fill_null(False))
    axes = {}
    for key, source in expressions.items():
        try:
            parsed = parse_expression(source, available)
            values, _ = evaluate(df, parsed)
            valid = [v for v in values if v is not None]
            axes[key] = {'ok': True, 'error': None, 'columns': parsed.columns, 'n_valid': len(valid), 'n_invalid': len(values) - len(valid),
                         'min': min(valid) if valid else None, 'max': max(valid) if valid else None, 'sample': valid[:5]}
        except FormulaError as exc:
            axes[key] = {'ok': False, 'error': str(exc), 'columns': [], 'n_valid': 0, 'n_invalid': 0, 'min': None, 'max': None, 'sample': []}
    return {'axes': axes}


def _classify(x: float, y: float, polygons: list[tuple[str, list[tuple[float, float]]]]) -> str:
    from analysis.geochemistry.engine import in_polygon   # local import: engine imports this module
    found = [(name, in_polygon(x, y, pts)) for name, pts in polygons]
    boundary = [n for n, w in found if w == 'boundary']
    interior = [n for n, w in found if w == 'interior']
    return 'Límite: ' + ' / '.join(boundary) if boundary else ' / '.join(interior) or 'Fuera de los campos'


SQRT3_2 = math.sqrt(3) / 2


def _normalised(a: float, b: float, c: float) -> tuple[float, float, float]:
    total = a + b + c
    if min(a, b, c) < 0 or total <= 0:
        raise ValueError('componente negativo o suma cero')
    return 100 * a / total, 100 * b / total, 100 * c / total


def _ternary_xy(a: float, b: float, c: float) -> tuple[float, float]:
    """Cartesian position in the triangle (A top, B bottom-left, C bottom-right), from percentages."""
    return c + a / 2, a * SQRT3_2


def _field_polygons(spec: DiagramSpec, log_x: bool, log_y: bool) -> list[tuple[str, list[tuple[float, float]]]]:
    """Fields in the space where they are classified: the triangle for ternaries, log10 on log axes."""
    out = []
    for f in spec.fields:
        dims = {len(p) for p in f.points}
        if spec.kind == 'ternary':
            if dims != {3}:
                raise ValueError(f'Campo «{f.name}»: en un ternario cada vértice lleva A, B y C')
            try:
                out.append((f.name, [_ternary_xy(*_normalised(*p)) for p in f.points]))
            except ValueError as exc:
                raise ValueError(f'Campo «{f.name}»: vértice con {exc}') from exc
        else:
            if dims != {2}:
                raise ValueError(f'Campo «{f.name}»: cada vértice lleva X e Y')
            if (log_x and any(p[0] <= 0 for p in f.points)) or (log_y and any(p[1] <= 0 for p in f.points)):
                raise ValueError(f'Campo «{f.name}»: en un eje logarítmico los vértices deben ser mayores que 0')
            out.append((f.name, [(math.log10(p[0]) if log_x else p[0], math.log10(p[1]) if log_y else p[1]) for p in f.points]))
    return out


def _number(raw):
    if raw is None or isinstance(raw, bool):
        return None
    try:
        v = float(raw)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def calculate_custom(df: pl.DataFrame, config: dict, roles=None) -> dict:
    """Same contract as engine.calculate for tool 'custom-diagram' (config['diagram'] holds the DiagramSpec)."""
    spec = DiagramSpec.model_validate(config['diagram'])
    for column in [config.get('group_column'), config.get('label_column'), config.get('size_column'), config.get('color_column')]:
        if column is not None and column not in df.columns:
            raise ValueError(f'Columna desconocida: {column}')
    if df.height > 100_000:
        raise ValueError('Esta versión admite hasta 100 000 muestras por cálculo; crea un subconjunto explícito.')
    group_column = config.get('group_column')
    if group_column and df[group_column].n_unique() > 50:
        raise ValueError('El color categórico admite hasta 50 grupos; elige otra columna.')
    ternary = spec.kind == 'ternary'
    if ternary and not (spec.z and spec.z.strip()):
        raise ValueError('El diagrama ternario necesita tres expresiones (A, B y C)')
    if ternary and (config.get('log_x') or config.get('log_y')):
        raise ValueError('Esta herramienta define su propia escala; desactiva Log X/Log Y')
    available = [c for c in df.columns if not c.startswith('_')]
    keys = ['x', 'y', 'z'] if ternary else ['x', 'y']
    try:
        parsed = {k: parse_expression(getattr(spec, k), available) for k in keys}
        evaluated = {k: evaluate(df, p) for k, p in parsed.items()}
    except FormulaError as exc:
        raise ValueError(str(exc)) from exc

    sample_column = config.get('label_column') or infer_sample_id_column(df, roles)
    include_qaqc = bool(config.get('include_qaqc'))
    log_x, log_y = bool(config.get('log_x')), bool(config.get('log_y'))
    polygons = _field_polygons(spec, log_x, log_y)
    rows, quality = [], {'total': df.height, 'used': 0, 'invalid': 0, 'excluded_qaqc': 0}
    for index, raw in enumerate(df.iter_rows(named=True)):
        row = {'sample_id': str(raw.get(sample_column) or f'row-{index + 1}'), 'row_index': index,
               'group': str(raw.get(group_column, 'Sin grupo')) if group_column else 'Muestras',
               'status': 'valid', 'reason': None, 'x': None, 'y': None, 'z': None, 'values': None, 'classification': None}
        for attr, column in [('size_value', config.get('size_column')), ('color_value', config.get('color_column'))]:
            row[attr] = _number(raw.get(column)) if column and raw.get(f'_nulltype_{column}') not in CENSORED else None
        if not include_qaqc and str(raw.get('__sample_type__', '')).upper() in QAQC:
            quality['excluded_qaqc'] += 1
            rows.append({**row, 'status': 'excluded', 'reason': 'Muestra de control QAQC'})
            continue
        reason = next((evaluated[k][1][index] for k in keys if evaluated[k][1][index]), None)
        v = {k: evaluated[k][0][index] for k in keys}
        try:
            if reason:
                raise ValueError(reason)
            if ternary:
                a, b, c = v['x'], v['y'], v['z']
                if min(a, b, c) < 0:
                    raise ValueError('Componente negativo en el ternario')
                total = a + b + c
                if total <= 0:
                    raise ValueError('La suma de los tres componentes es cero')
                row.update(x=100 * a / total, y=100 * b / total, z=100 * c / total)
                if polygons:
                    row['classification'] = _classify(*_ternary_xy(row['x'], row['y'], row['z']), polygons)
            else:
                row.update(x=v['x'], y=v['y'])
                if (log_x and row['x'] <= 0) or (log_y and row['y'] <= 0):
                    raise ValueError('Escala logarítmica requiere valores positivos')
                if polygons:
                    row['classification'] = _classify(math.log10(row['x']) if log_x else row['x'], math.log10(row['y']) if log_y else row['y'], polygons)
            quality['used'] += 1
        except ValueError as exc:
            row.update(status='invalid', reason=str(exc), x=None, y=None, z=None, classification=None)
            quality['invalid'] += 1
        rows.append(row)

    labels = {k: (getattr(spec, f'{k}_label') or getattr(spec, k)) for k in ['x', 'y', 'z']}
    plot = {'kind': 'ternary' if ternary else 'scatter', 'x_label': labels['x'], 'y_label': labels['y'], 'z_label': labels['z'] if ternary else '',
            'log_x': log_x, 'log_y': log_y,
            # the chart labels each field with its id: user fields show their name
            'fields': [{'id': f.name, 'name': f.name, 'points': [list(_normalised(*p)) for p in f.points] if ternary else f.points} for f in spec.fields]}
    formula = ('A = {x}; B = {y}; C = {z} (normalizados a 100)' if ternary else 'X = {x}; Y = {y}').format(x=spec.x, y=spec.y, z=spec.z)
    warnings = ['Diagrama propio: las expresiones y los campos los define el usuario; verifica unidades y la fuente de los campos.']
    if spec.fields and not spec.reference.strip():
        warnings.append('Los campos de clasificación no indican referencia bibliográfica.')
    if quality['invalid']:
        warnings.append(f"{quality['invalid']} muestra(s) no graficables; motivos en tabla. No se imputaron valores.")
    if include_qaqc:
        warnings.append('Controles QAQC incluidos por solicitud explícita.')
    pipeline = {k: config.get(k) for k in ['tool', 'columns', 'units', 'iron_basis', 'include_qaqc', 'log_x', 'log_y', 'group_column', 'label_column', 'size_column', 'color_column']}
    pipeline.update(diagram=spec.model_dump(), expression_columns=sorted({c for p in parsed.values() for c in p.columns}),
                    missing_policy='exclude_without_imputation', engine_version='1.0.0')
    return {'tool': CUSTOM_TOOL_ID, 'title': spec.name, 'rows': rows, 'plot': plot, 'quality': quality, 'warnings': warnings,
            'formula': formula, 'reference': spec.reference, 'pipeline': pipeline, 'created_at': datetime.now(timezone.utc).isoformat()}
