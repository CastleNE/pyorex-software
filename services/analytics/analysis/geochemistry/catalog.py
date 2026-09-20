"""Only implemented and explicitly scoped tools appear in this catalog.

Since Phase 1B this module is a backward-compatible VIEW of the Tool Registry (``registry.py``), which is the
source of truth for tool metadata. ``TOOLS`` and ``BY_ID`` keep their historical shape (a list of plain dicts with
exactly ``id, label, group, inputs, kind, unit, formula, reference, optional_inputs``) so existing consumers
(``engine.py``, ``geochemistry_rpc.py`` and the tests) are unchanged. New registry fields are not exposed here.
"""
from analysis.geochemistry.registry import FROST, REE, SM89, TRACE, legacy_catalog  # noqa: F401  (re-exported)


def tool(id, label, group, inputs, kind='scatter', unit='pct', formula='', reference='', optional=False):
    """Legacy constructor of a catalog entry; kept for API compatibility. Nothing in the catalog is built with it."""
    return dict(id=id, label=label, group=group, inputs=inputs, kind=kind,
                unit=unit, formula=formula, reference=reference or formula, optional_inputs=optional)


TOOLS = legacy_catalog()
BY_ID = {item['id']: item for item in TOOLS}
