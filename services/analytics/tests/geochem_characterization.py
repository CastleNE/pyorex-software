"""Deterministic characterization fixtures and scenarios for ``geochemistry.compute`` (Phase 1A).

PURPOSE
    Freeze what ``analysis.geochemistry.engine.calculate`` returns TODAY so the Tool Registry
    migration can prove numerical equivalence. Nothing here asserts that the behaviour is
    scientifically desirable; quirks are frozen as-is and flagged in
    ``test_geochemistry_current_behavior.py`` ("CURRENT BEHAVIOR — characterization only").

HOW THE GOLDEN FILES ARE PRODUCED
    ``tests/golden/geochemistry/<tool>.json`` holds, per scenario, a projection of the engine output
    (see ``project``). They are generated from the current engine, never edited by hand:

        cd services/analytics && PYTHONPATH=. python tests/geochem_characterization.py --write

    Re-freezing is an intentional act: do it only when a behaviour change has been approved.
    ``created_at`` and other accidental fields are never frozen.

DATASETS
    Small, hand-written and readable. Every dataset has a ``sample_id`` column; ``__sample_type__``
    (QAQC) and ``_nulltype_<col>`` (censoring flags) appear only where a row needs them.
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

import polars as pl

GOLDEN_DIR = Path(__file__).with_name('golden') / 'geochemistry'
NAN = float('nan')

# Sun & McDonough (1989) chondrite, ppm. Literal copy used ONLY to build test data;
# tests/test_geochemistry_formulas_independent.py re-reads the CSV to prove the copy is exact.
CHONDRITE = {'La': .237, 'Ce': .612, 'Pr': .095, 'Nd': .467, 'Sm': .153, 'Eu': .058, 'Gd': .2055,
             'Tb': .0374, 'Dy': .254, 'Ho': .0566, 'Er': .1655, 'Tm': .0255, 'Yb': .17, 'Lu': .0254}
REE = list(CHONDRITE)
TRACE = ['Cs', 'Rb', 'Ba', 'Th', 'U', 'Nb', 'Ta', 'La', 'Ce', 'Pb', 'Pr', 'Sr', 'Nd', 'Zr', 'Hf', 'Sm', 'Eu', 'Gd',
         'Tb', 'Dy', 'Y', 'Ho', 'Er', 'Tm', 'Yb', 'Lu']


def _frame(columns: dict[str, list], strings: tuple[str, ...] = ('sample_id', '__sample_type__')) -> pl.DataFrame:
    out = {}
    for name, values in columns.items():
        is_text = name in strings or name.startswith('_nulltype_') or name in ('Hole', 'G')
        out[name] = pl.Series(name, values, dtype=pl.String if is_text else pl.Float64)
    return pl.DataFrame(out)


# ── Whole-rock oxides (wt%) ──────────────────────────────────────────────────────────────────
# id, SiO2, Na2O, K2O, CaO, MgO, Al2O3, FeT, sample_type, K2O censoring flag, what the row exercises
_OXIDE_ROWS = [
    ('OX01', 50., 2., 1., 10., 8., 15., 9., 'S', None),      # basalt
    ('OX02', 60., 2., 2., 6., 3., 16., 6., 'S', None),       # andesite
    ('OX03', 75., 3., 5., 1., .2, 13., 2., 'S', None),       # rhyolite
    ('OX04', 52., 2., 1., 9., 6., 16., 8., 'S', None),       # SiO2 = 52 sits on a shared TAS boundary
    ('OX05', 55., 0., 0., 8., 5., 15., 7., 'S', None),       # zero alkalis: A/NK denominator = 0
    ('OX06', 70., 3., 3., 2., 0., 14., 0., 'S', None),       # MgO = FeT = 0: Fe-index denominator = 0
    ('OX07', 58., 3., -1., 6., 4., 15., 6., 'S', None),      # negative K2O
    ('OX08', None, 3., 2., 6., 4., 15., 6., 'S', None),      # null SiO2
    ('OX09', 60., NAN, 2., 6., 4., 15., 6., 'S', None),      # NaN Na2O
    ('OX10', 62., 3., 2.5, 5., 3., 16., 5., 'S', 'BELOW_LOD'),  # censored K2O (value present, flagged)
    ('OX11', 61., 3., 2., 5., 3., 16., 5., 'CRM', None),     # QAQC control: excluded by default
    ('OX12', 99., 2., 2., 1., .5, 1., 1., 'S', None),        # SiO2 + alkalis > 100 (TAS rejects)
    ('OX13', 45., 6., 4., 8., 5., 15., 9., 'S', None),       # high alkalis, low silica
    ('OX14', 20., 1., 1., 1., 1., 1., 1., 'S', None),        # far outside the TAS reference fields
]


def oxides() -> pl.DataFrame:
    cols = list(zip(*_OXIDE_ROWS))
    names = ['sample_id', 'SiO2', 'Na2O', 'K2O', 'CaO', 'MgO', 'Al2O3', 'FeT', '__sample_type__', '_nulltype_K2O']
    return _frame(dict(zip(names, (list(c) for c in cols))))


def oxides_mixed_units() -> pl.DataFrame:
    """Same rows as ``oxides`` with Na2O expressed in ppm and K2O in ppb (use units={'Na2O':'ppm','K2O':'ppb'})."""
    df = oxides()
    return df.with_columns((pl.col('Na2O') * 1e4).alias('Na2O'), (pl.col('K2O') * 1e7).alias('K2O'))


# ── Rare-earth elements (ppm) ────────────────────────────────────────────────────────────────
def _ree(scale=1., **overrides):
    row = {el: v * scale for el, v in CHONDRITE.items()}
    row.update(overrides)
    return row


_REE_ROWS = [
    ('RE01', _ree(), 'S', None),                              # exactly chondritic: every ratio is 1
    ('RE02', _ree(10.), 'S', None),                           # 10 x chondrite
    ('RE03', _ree(Eu=CHONDRITE['Eu'] * .5), 'S', None),       # Eu depleted
    ('RE04', _ree(Ce=CHONDRITE['Ce'] * 2), 'S', None),        # Ce enriched
    ('RE05', _ree(Sm=0.), 'S', None),                         # Sm = 0: Eu/Eu* denominator = 0
    ('RE06', _ree(Eu=0.), 'S', None),                         # Eu = 0
    ('RE07', _ree(La=None), 'S', None),                       # La missing
    ('RE08', _ree(Gd=-.2), 'S', None),                        # negative Gd
    ('RE09', _ree(3.), 'CRM', None),                          # QAQC control: excluded
    ('RE10', _ree(5.), 'S', 'BELOW_LOD'),                     # Yb censored
    ('RE11', _ree(Pr=0.), 'S', None),                         # Pr = 0: Ce/Ce* denominator = 0
]


def ree() -> pl.DataFrame:
    data = {'sample_id': [r[0] for r in _REE_ROWS]}
    for el in REE:
        data[el] = [r[1][el] for r in _REE_ROWS]
    data['__sample_type__'] = [r[2] for r in _REE_ROWS]
    data['_nulltype_Yb'] = [r[3] for r in _REE_ROWS]
    return _frame(data)


def ree_ppb() -> pl.DataFrame:
    """Three chondrite-derived rows expressed in ppb (use units='ppb' for every element)."""
    base = ree().head(3)
    return base.with_columns([(pl.col(el) * 1000.).alias(el) for el in REE])


# ── Multi-element traces (ppm) for primitive mantle ───────────────────────────────────────────
def traces() -> pl.DataFrame:
    n = len(TRACE)
    rows = [
        ('TR01', [1.] * n, 'S'),                                    # 1 ppm everywhere
        ('TR02', [float(i + 1) for i in range(n)], 'S'),            # 1, 2, 3 ... ppm
        ('TR03', [None if el == 'Ba' else (0. if el == 'Cs' else 2.) for el in TRACE], 'S'),  # Ba missing, Cs = 0
        ('TR04', [5. if el == 'Rb' else None for el in TRACE], 'S'),  # a single valid element
        ('TR05', [1.] * n, 'CRM'),                                   # QAQC control: excluded
        ('TR06', [None] * n, 'S'),                                   # nothing measured
    ]
    data = {'sample_id': [r[0] for r in rows]}
    for j, el in enumerate(TRACE):
        data[el] = [r[1][j] for r in rows]
    data['__sample_type__'] = [r[2] for r in rows]
    return _frame(data)


# ── Ratios (ppm) ─────────────────────────────────────────────────────────────────────────────
_RATIO_ROWS = [
    # id, Sr, Y, La, Yb, Dy, type, Y censoring flag
    ('RT01', 500., 10., 20., 2., 6., 'S', None),
    ('RT02', 300., 0., 15., 1.5, 4., 'S', None),       # Y = 0: Sr/Y denominator = 0
    ('RT03', 0., 12., 0., 1., 2., 'S', None),          # zero numerators (Sr, La)
    ('RT04', 400., 8., 10., 1., 3., 'CRM', None),      # QAQC control in the middle of the table
    ('RT05', -5., 4., 8., 1., 2., 'S', None),          # negative Sr
    ('RT06', None, 4., 8., 1., 2., 'S', None),         # missing Sr
    ('RT07', 100., 5., 9., 1., 2., 'S', 'BELOW_LOD'),  # Y censored
    ('RT08', 50., 6., 12., 0., 3., 'S', None),         # Yb = 0: La/Yb and Dy/Yb denominators = 0
    ('RT09', 123.4, 5.6, 33.3, 3.3, 7.7, 'S', None),   # fractional values
]


def ratios() -> pl.DataFrame:
    names = ['sample_id', 'Sr', 'Y', 'La', 'Yb', 'Dy', '__sample_type__', '_nulltype_Y']
    return _frame(dict(zip(names, (list(c) for c in zip(*_RATIO_ROWS)))))


def ratios_mixed_units() -> pl.DataFrame:
    """Sr in ppb, everything else in ppm (use units={'numerator':'ppb','denominator':'ppm'})."""
    return ratios().with_columns((pl.col('Sr') * 1000.).alias('Sr'))


# ── Univariate distribution (raw units) ──────────────────────────────────────────────────────
def distribution() -> pl.DataFrame:
    rows = [
        ('DS01', 'A', 3., 'S', None), ('DS02', 'A', 1., 'S', None), ('DS03', 'A', 2., 'S', None),
        ('DS04', 'A', 2., 'S', None),                        # tie with DS03
        ('DS05', 'A', 4., 'S', None), ('DS06', 'B', 10., 'S', None), ('DS07', 'B', 20., 'S', None),
        ('DS08', 'B', 30., 'S', None), ('DS09', 'C', 7., 'S', None),   # a group of one
        ('DS10', 'A', None, 'S', None),                       # missing
        ('DS11', 'A', 5., 'S', 'BELOW_LOD'),                  # censored
        ('DS12', 'A', 99., 'CRM', None),                      # QAQC control: excluded
        ('DS13', 'A', -5., 'S', None),                        # negative is legitimate in raw units
    ]
    names = ['sample_id', 'G', 'X', '__sample_type__', '_nulltype_X']
    return _frame(dict(zip(names, (list(c) for c in zip(*rows)))))


# ── Paired assays (raw units) ────────────────────────────────────────────────────────────────
def paired() -> pl.DataFrame:
    rows = [
        ('PR01', 10., 12., 'S'), ('PR02', 20., 18., 'S'), ('PR03', 0., 0., 'S'), ('PR04', -1., 1., 'S'),
        ('PR05', 5., None, 'S'),                              # missing Y
        ('PR06', 30., 33., 'FD'), ('PR07', 40., 38., 'LD'),   # duplicate pairs (QAQC types)
        ('PR08', 50., 55., 'CRM'),
    ]
    names = ['sample_id', 'X', 'Y', '__sample_type__']
    return _frame(dict(zip(names, (list(c) for c in zip(*rows)))))


# ── Downhole (raw units) ─────────────────────────────────────────────────────────────────────
def downhole() -> pl.DataFrame:
    rows = [
        # id, hole, depth, value, assay1, assay2, type
        ('DH01', 'A', 3., 30., 30., 31., 'S'),        # deliberately unsorted by depth
        ('DH02', 'A', 1., 10., 10., 11., 'S'),
        ('DH03', 'A', 2., None, None, 20., 'S'),      # missing assay at a known depth
        ('DH04', 'A', 4., 40., 40., 41., 'S'),
        ('DH05', 'B', 5., 50., 50., 51., 'S'),
        ('DH06', 'B', -1., 5., 5., 6., 'S'),          # negative depth
        ('DH07', None, 6., 60., 60., 61., 'S'),       # no hole id
        ('DH08', '', 7., 70., 70., 71., 'S'),         # blank hole id
        ('DH09', 'B', None, 80., 80., 81., 'S'),      # depth missing
        ('DH10', 'B', 8., 90., 90., 91., 'CRM'),      # QAQC control: excluded
    ]
    names = ['sample_id', 'Hole', 'Depth', 'Value', 'Assay1', 'Assay2', '__sample_type__']
    return _frame(dict(zip(names, (list(c) for c in zip(*rows)))))


# ── Ternary / QAPF ───────────────────────────────────────────────────────────────────────────
def ternary() -> pl.DataFrame:
    rows = [('TN01', 2., 3., 5.), ('TN02', 0., 0., 0.), ('TN03', 1., 1., 1.), ('TN04', -1., 2., 3.),
            ('TN05', None, 1., 1.), ('TN06', 100., 0., 0.)]
    return _frame(dict(zip(['sample_id', 'A', 'B', 'C'], (list(c) for c in zip(*rows)))))


def qapf() -> pl.DataFrame:
    rows = [('QP01', 20., 30., 50., 0.), ('QP02', 20., 30., 50., 1.),   # Q and F together: rejected
            ('QP03', 0., 30., 70., 0.), ('QP04', 0., 0., 0., 0.), ('QP05', 0., 30., 50., 20.),
            ('QP06', 10., 20., 30., 0.),                                 # does not sum to 100: normalized
            ('QP07', -1., 30., 50., 0.), ('QP08', None, 30., 50., 0.)]
    return _frame(dict(zip(['sample_id', 'Q', 'A', 'P', 'F'], (list(c) for c in zip(*rows)))))


DATASETS = {
    'oxides': oxides, 'oxides_mixed_units': oxides_mixed_units, 'ree': ree, 'ree_ppb': ree_ppb, 'traces': traces,
    'ratios': ratios, 'ratios_mixed_units': ratios_mixed_units, 'distribution': distribution, 'paired': paired,
    'downhole': downhole, 'ternary': ternary, 'qapf': qapf,
}


# ── Scenarios ────────────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Scenario:
    tool: str
    name: str
    dataset: str
    columns: dict
    options: dict = field(default_factory=dict)

    @property
    def id(self) -> str:
        return f'{self.tool}::{self.name}'


def _cols(*keys, **renamed):
    out = {k: k for k in keys}
    out.update(renamed)
    return out


_TAS = _cols('SiO2', 'Na2O', 'K2O')
_MALI = _cols('SiO2', 'Na2O', 'K2O', 'CaO')
_FE = _cols('SiO2', 'MgO', FeTotal='FeT')
_SHAND = _cols('Al2O3', 'CaO', 'Na2O', 'K2O')
_ANK = _cols('Al2O3', 'Na2O', 'K2O')
_ALT = _cols('MgO', 'K2O', 'Na2O', 'CaO', FeTotal='FeT')
_AFM = _cols('Na2O', 'K2O', 'MgO', FeTotal='FeT')
_MIXED = {'units': {'Na2O': 'ppm', 'K2O': 'ppb'}}
_FE2O3 = {'iron_basis': 'Fe2O3T'}
_ALL_PPB = lambda keys: {'units': {k: 'ppb' for k in keys}}  # noqa: E731

SCENARIOS: list[Scenario] = [
    # distribution family
    *[Scenario(t, 'single_group', 'distribution', {'X': 'X'}) for t in ('qq-normal', 'probability', 'ecdf')],
    *[Scenario(t, 'by_group', 'distribution', {'X': 'X'}, {'group_column': 'G'}) for t in ('qq-normal', 'probability', 'ecdf')],
    # paired assays and profiles
    Scenario('assay-difference', 'default', 'paired', _cols('X', 'Y')),
    Scenario('assay-difference', 'include_qaqc', 'paired', _cols('X', 'Y'), {'include_qaqc': True}),
    Scenario('downhole', 'by_hole', 'downhole', _cols('Depth', 'Value'), {'group_column': 'Hole'}),
    Scenario('downhole', 'without_hole_id_column', 'downhole', _cols('Depth', 'Value')),
    Scenario('downhole-compare', 'by_hole', 'downhole', _cols('Depth', 'Assay1', 'Assay2'), {'group_column': 'Hole'}),
    # compositional projections
    Scenario('ternary', 'default', 'ternary', _cols('A', 'B', 'C')),
    Scenario('ternary', 'units_mismatch', 'ternary', _cols('A', 'B', 'C'), {'units': {'A': 'ppm', 'B': 'pct', 'C': 'pct'}}),
    Scenario('ternary', 'units_all_ppm', 'ternary', _cols('A', 'B', 'C'), {'units': {'A': 'ppm', 'B': 'ppm', 'C': 'ppm'}}),
    Scenario('afm', 'default', 'oxides', _AFM),
    Scenario('afm', 'fe2o3t', 'oxides', _AFM, _FE2O3),
    Scenario('qapf', 'default', 'qapf', _cols('Q', 'A', 'P', 'F')),
    Scenario('qapf', 'units_ppm', 'qapf', _cols('Q', 'A', 'P', 'F'), {'units': {k: 'ppm' for k in 'QAPF'}}),
    Scenario('qapf', 'units_raw', 'qapf', _cols('Q', 'A', 'P', 'F'), {'units': {k: 'raw' for k in 'QAPF'}}),
    # oxide indices and classification
    Scenario('tas', 'default', 'oxides', _TAS),
    Scenario('tas', 'mixed_units', 'oxides_mixed_units', _TAS, _MIXED),
    Scenario('harker', 'default', 'oxides', _cols('SiO2', Oxide='MgO')),
    Scenario('harker', 'oxide_in_ppb', 'oxides_mixed_units', _cols('SiO2', Oxide='K2O'), {'units': {'Oxide': 'ppb'}}),
    Scenario('k2o-sio2', 'default', 'oxides', _cols('SiO2', 'K2O')),
    Scenario('k2o-sio2', 'log_y', 'oxides', _cols('SiO2', 'K2O'), {'log_y': True}),
    Scenario('mali', 'default', 'oxides', _MALI),
    Scenario('mali', 'mixed_units', 'oxides_mixed_units', _MALI, _MIXED),
    Scenario('fe-index', 'default', 'oxides', _FE),
    Scenario('fe-index', 'fe2o3t', 'oxides', _FE, _FE2O3),
    Scenario('shand-index', 'default', 'oxides', _SHAND),
    Scenario('shand-index', 'mixed_units', 'oxides_mixed_units', _SHAND, _MIXED),
    Scenario('a-cnk', 'default', 'oxides', _SHAND),
    Scenario('a-nk', 'default', 'oxides', _ANK),
    Scenario('alteration', 'default', 'oxides', _ALT),
    Scenario('alteration', 'fe2o3t', 'oxides', _ALT, _FE2O3),
    # normalization
    Scenario('ree-normalization', 'default', 'ree', {el: el for el in REE}),
    Scenario('ree-normalization', 'subset', 'ree', _cols('La', 'Ce', 'Yb')),
    Scenario('ree-normalization', 'all_ppb', 'ree_ppb', {el: el for el in REE}, _ALL_PPB(REE)),
    Scenario('primitive-mantle', 'default', 'traces', {el: el for el in TRACE}),
    Scenario('fertility-eu-eu', 'default', 'ree', _cols('Sm', 'Eu', 'Gd')),
    Scenario('fertility-eu-eu', 'all_ppb', 'ree_ppb', _cols('Sm', 'Eu', 'Gd'), _ALL_PPB(['Sm', 'Eu', 'Gd'])),
    Scenario('fertility-ce-ce', 'default', 'ree', _cols('La', 'Ce', 'Pr')),
    Scenario('fertility-ce-ce', 'all_ppb', 'ree_ppb', _cols('La', 'Ce', 'Pr'), _ALL_PPB(['La', 'Ce', 'Pr'])),
    # ratios
    Scenario('element-ratios', 'default', 'ratios', {'numerator': 'Sr', 'denominator': 'Y'}),
    Scenario('element-ratios', 'ppb_numerator', 'ratios_mixed_units', {'numerator': 'Sr', 'denominator': 'Y'},
             {'units': {'numerator': 'ppb', 'denominator': 'ppm'}}),
    Scenario('fertility-sr-y', 'default', 'ratios', _cols('Sr', 'Y')),
    Scenario('fertility-la-yb', 'default', 'ratios', _cols('La', 'Yb')),
    Scenario('fertility-dy-yb', 'default', 'ratios', _cols('Dy', 'Yb')),
]

GOLDEN_TOOLS = sorted({s.tool for s in SCENARIOS})


# ── Projection of an engine result onto its deterministic fields ─────────────────────────────
ROW_FIELDS = ('sample_id', 'row_index', 'group', 'status', 'reason', 'x', 'y', 'z', 'values', 'classification')
PIPELINE_FIELDS = ('units', 'iron_basis', 'include_qaqc', 'log_x', 'log_y', 'group_column', 'missing_policy',
                   'reference_version', 'engine_version')


def project(result: dict) -> dict:
    """Deterministic, relevant subset of a ``calculate`` result. Excludes ``created_at`` and free-form extras."""
    plot = result['plot']
    projected = {
        'tool': result['tool'], 'title': result['title'],
        'rows': [{k: r[k] for k in ROW_FIELDS} for r in result['rows']],
        'quality': result['quality'], 'warnings': result['warnings'],
        'formula': result['formula'], 'reference': result['reference'],
        'plot': {k: plot[k] for k in ('kind', 'x_label', 'y_label', 'z_label', 'log_x', 'log_y')},
        'pipeline': {k: result['pipeline'][k] for k in PIPELINE_FIELDS},
    }
    if 'elements' in plot:
        projected['plot']['elements'] = plot['elements']
    projected['plot']['fields'] = [{'id': f['id'], 'name': f['name'], 'points': f['points']} for f in plot['fields']]
    return json.loads(json.dumps(projected, allow_nan=False))  # tuples -> lists; also proves JSON safety


def run_scenario(scenario: Scenario) -> dict:
    from analysis.geochemistry.engine import calculate
    request = {'tool': scenario.tool, 'columns': scenario.columns, **scenario.options}
    try:
        return project(calculate(DATASETS[scenario.dataset](), request))
    except ValueError as exc:  # a rejected request is part of the frozen behaviour
        return {'error': str(exc)}


def build_golden() -> dict[str, dict[str, dict]]:
    golden: dict[str, dict[str, dict]] = {tool: {} for tool in GOLDEN_TOOLS}
    for scenario in SCENARIOS:
        golden[scenario.tool][scenario.name] = run_scenario(scenario)
    return golden


def write_golden(directory: Path = GOLDEN_DIR) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    written = []
    for tool, scenarios in build_golden().items():
        path = directory / f'{tool}.json'
        path.write_text(json.dumps(scenarios, indent=1, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
        written.append(path)
    return written


def load_golden(tool: str) -> dict[str, dict]:
    return json.loads((GOLDEN_DIR / f'{tool}.json').read_text(encoding='utf-8'))


if __name__ == '__main__':
    if '--write' not in sys.argv:
        sys.exit('Refusing to run without --write: this re-freezes the golden files from the CURRENT engine.')
    target = Path(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else GOLDEN_DIR
    for p in write_golden(target):
        print('wrote', p)
