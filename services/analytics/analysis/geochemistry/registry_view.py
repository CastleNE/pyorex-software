"""Read-only, UI-oriented projection of the Tool Registry served by ``geochemistry.registry``.

Only what a navigation UI needs: identity, ownership (module/family), status, the capabilities the editor may offer and
the renderer. No calculation specs, references or python objects. The legacy ``geochemistry.catalog`` is unaffected.

Ordering contract: ``tools`` come in canonical navigation order — module, then family (declaration order of ``Family``),
then ``_TOOL_NAV_ORDER`` (tools not listed there keep registry order after the listed ones). Clients group by
first appearance and never need their own hardcoded ordering.
"""
from analysis.geochemistry.registry import REGISTRY, Capability, Family, Module, ToolSpec

SCHEMA_VERSION = 1

# Presentation order inside a family (registry order is the frozen legacy order and cannot express this).
_TOOL_NAV_ORDER = ('histogram', 'boxplot', 'qq-normal', 'probability', 'ecdf', 'scatter', 'line', 'ternary', 'downhole')

_MODULE_INDEX = {m: i for i, m in enumerate(Module)}
_FAMILY_INDEX = {f: i for i, f in enumerate(Family)}
_CAPABILITY_INDEX = {c: i for i, c in enumerate(Capability)}


def _tool_position(spec: ToolSpec, registry_position: int) -> tuple[int, int, int, int]:
    nav = _TOOL_NAV_ORDER.index(spec.id) if spec.id in _TOOL_NAV_ORDER else len(_TOOL_NAV_ORDER)
    return _MODULE_INDEX[spec.module], _FAMILY_INDEX[spec.family], nav, registry_position


def project_tool(spec: ToolSpec) -> dict:
    return {
        'id': spec.id,
        'label': spec.label,
        'module': spec.module.value,
        'family': spec.family.value,
        'status': spec.status.value,
        'capabilities': [c.value for c in sorted(spec.capabilities, key=_CAPABILITY_INDEX.__getitem__)],
        'renderer': spec.renderer.value,
        # Semantic Variable System (v1): per-input role constraints (empty allowed_roles = no restriction declared,
        # CURRENT BEHAVIOR). group_allowed_roles is the generic group/hole selector, not one of ``inputs``.
        'inputs': [{'key': i.key, 'allowed_roles': [r.value for r in i.allowed_roles]} for i in spec.inputs],
        'group_allowed_roles': [r.value for r in spec.group_allowed_roles],
    }


def registry_view() -> dict:
    ordered = sorted(enumerate(REGISTRY), key=lambda item: _tool_position(item[1], item[0]))
    return {'schema_version': SCHEMA_VERSION, 'tools': [project_tool(spec) for _, spec in ordered]}
