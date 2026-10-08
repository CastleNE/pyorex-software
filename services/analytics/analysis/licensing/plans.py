"""Product plans (what each edition of PyOreX may do), enforced by the engine — never only by the interface.

Editions (product decision of 6 Oct 2026):
    demo      web demo: geochemistry only, datasets of at most 500 samples, no .orex project files
    geochem   desktop «Geoquímica Pro»: geochemistry without sample limit, projects
    full      desktop «Completo»: geochemistry + spectrometry, projects
    academic  same capabilities as «Completo», for students and universities

The active plan comes from the ``PYOREX_PLAN`` environment variable, set by whoever launches the engine: the web demo
server sets ``demo``. Until signed licences exist (see docs/CONTINUAR_PYOREX.md), the desktop engine defaults to
``full``. An unknown value falls back to ``demo`` — a misconfigured server must never grant more than the demo.

Enforcement points (all in the engine):
    * ``enforce_rpc`` — called by the JSON-RPC dispatcher for every method: modules (``spectrometry.*``), features
      (``project.*``) and the sample limit of any dataset the call works on (``dataset_id``).
    * ``check_rows`` — before a dataset is created (``data.import``, saved edits, spectral exports) or restored from a
      project, so an over-limit dataset never exists.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

ENV_VAR = 'PYOREX_PLAN'
DEFAULT_PLAN = 'full'
PLAN_LIMIT_CODE = -32010   # JSON-RPC error code for "not included in your plan"


@dataclass(frozen=True)
class Plan:
    id: str
    label: str
    modules: frozenset[str]
    features: frozenset[str] = field(default_factory=frozenset)
    max_rows: int | None = None

    def to_dict(self) -> dict:
        return {'plan': self.id, 'label': self.label, 'modules': sorted(self.modules), 'features': sorted(self.features), 'max_rows': self.max_rows}


PLANS: dict[str, Plan] = {
    'demo': Plan('demo', 'PyOreX Demo', frozenset({'geochemistry'}), frozenset(), 500),
    'geochem': Plan('geochem', 'PyOreX Geoquímica Pro', frozenset({'geochemistry'}), frozenset({'projects'})),
    'full': Plan('full', 'PyOreX Completo', frozenset({'geochemistry', 'spectrometry'}), frozenset({'projects'})),
    'academic': Plan('academic', 'PyOreX Académico', frozenset({'geochemistry', 'spectrometry'}), frozenset({'projects'})),
}
MODULE_LABEL = {'geochemistry': 'Geoquímica', 'spectrometry': 'Espectrometría'}
FEATURE_LABEL = {'projects': 'los proyectos .orex'}
# Which module or feature each RPC namespace needs. Everything else (data, QA/QC, statistics, geochemistry, hub,
# health) belongs to geochemistry, which every plan includes.
METHOD_MODULES = {'spectrometry.': 'spectrometry'}
METHOD_FEATURES = {'project.': 'projects'}


class PlanLimitError(Exception):
    """The request needs something the active plan does not include. The message is shown to the user as is."""
    code = PLAN_LIMIT_CODE


def active_plan() -> Plan:
    raw = os.environ.get(ENV_VAR, '').strip().lower()
    if not raw:
        return PLANS[DEFAULT_PLAN]
    return PLANS.get(raw, PLANS['demo'])


def check_rows(n: int, plan: Plan | None = None) -> None:
    plan = plan or active_plan()
    if plan.max_rows is not None and n > plan.max_rows:
        raise PlanLimitError(f'{plan.label} admite hasta {plan.max_rows} muestras por dataset y este tiene {n}. '
                             f'Usa un archivo más pequeño o la versión de escritorio de PyOreX.')


def enforce_rpc(method: str, params: dict | None, plan: Plan | None = None, row_count=None) -> None:
    """Raise PlanLimitError when ``method`` is not available in the plan. ``row_count(dataset_id)`` returns the size of
    an existing dataset (or None when it does not exist); it is injected so this module never reads storage itself."""
    plan = plan or active_plan()
    for prefix, module in METHOD_MODULES.items():
        if method.startswith(prefix) and module not in plan.modules:
            raise PlanLimitError(f'{MODULE_LABEL.get(module, module)} no está incluida en {plan.label}. Disponible en PyOreX Completo.')
    for prefix, feature in METHOD_FEATURES.items():
        if method.startswith(prefix) and feature not in plan.features:
            raise PlanLimitError(f'{plan.label} no incluye {FEATURE_LABEL.get(feature, feature)}. Disponible en la versión de escritorio.')
    dataset_id = (params or {}).get('dataset_id') if isinstance(params, dict) else None
    if plan.max_rows is not None and isinstance(dataset_id, str) and row_count is not None:
        n = row_count(dataset_id)
        if n is not None:
            check_rows(n, plan)
