"""Pure geochemical mathematics, independent of the engine pipeline (Phase 2A).

Modules here take plain floats that the pipeline has already validated and converted to the tool's unit (wt% for
oxides, ppm for elements). They know nothing about rows, QAQC, censoring, units or the Tool Registry, and they
must not import ``engine``, ``catalog`` or ``registry``.
"""
