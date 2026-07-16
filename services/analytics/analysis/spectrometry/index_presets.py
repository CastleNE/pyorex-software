"""
Default spectral index formulas — plain defaults, never hardcoded into
spectral_formula.py's engine. User-defined indices persist per-project.
"""

INDEX_PRESETS: dict[str, dict] = {
    "AlOH": {"formula": "REFLECTANCE(2160) / REFLECTANCE(2190)", "unit": "ratio", "reference": "Al-OH band ratio (kaolinite/muscovite proxy)"},
    "MgOH": {"formula": "REFLECTANCE(2380) / REFLECTANCE(2330)", "unit": "ratio", "reference": "Mg-OH band ratio (chlorite/carbonate proxy)"},
    "FeOH": {"formula": "REFLECTANCE(2290) / REFLECTANCE(2250)", "unit": "ratio", "reference": "Fe-OH band ratio"},
    "H2O": {"formula": "1 - REFLECTANCE(1900)", "unit": "dimensionless", "reference": "H2O absorption proxy at ~1900 nm"},
    "OH": {"formula": "1 - REFLECTANCE(1400)", "unit": "dimensionless", "reference": "OH absorption proxy at ~1400 nm"},
}


def resolve_index_preset(name: str, custom_presets: dict | None = None) -> dict:
    if custom_presets and name in custom_presets:
        return custom_presets[name]
    if name in INDEX_PRESETS:
        return INDEX_PRESETS[name]
    raise ValueError(f"Unknown index preset: {name}")
