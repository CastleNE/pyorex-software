"""
Default absorption-feature window presets — plain defaults consumed by
features.py, never hardcoded into the extraction algorithm itself. Users can
override/add presets, persisted per-project in project.meta.json.
"""

FEATURE_PRESETS: dict[str, dict] = {
    "AlOH_2200": {"window": [2150.0, 2230.0], "continuum_method": "convex_hull", "label": "Al-OH (~2200 nm)"},
    "MgOH_2320": {"window": [2280.0, 2360.0], "continuum_method": "convex_hull", "label": "Mg-OH (~2320 nm)"},
    "FeOH_2260": {"window": [2230.0, 2290.0], "continuum_method": "convex_hull", "label": "Fe-OH (~2260 nm)"},
    "H2O_1900": {"window": [1850.0, 1970.0], "continuum_method": "convex_hull", "label": "H2O (~1900 nm)"},
    "OH_1400": {"window": [1370.0, 1430.0], "continuum_method": "convex_hull", "label": "OH (~1400 nm)"},
}


def resolve_preset(preset_name: str, custom_presets: dict | None = None) -> dict:
    if custom_presets and preset_name in custom_presets:
        return custom_presets[preset_name]
    if preset_name in FEATURE_PRESETS:
        return FEATURE_PRESETS[preset_name]
    raise ValueError(f"Unknown feature preset: {preset_name}")
