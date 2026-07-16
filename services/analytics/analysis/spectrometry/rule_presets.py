"""
Default rule-based mineral interpretation rules, seeded into every new
project's rules.json. TSG-style Al-OH/Mg-OH absorption-position conventions
for phyllosilicates — a starting preset the user is expected to edit/replace,
not ground truth (spec explicitly: rules must be configurable, not rigid).
"""

DEFAULT_RULES: list[dict] = [
    {
        "id": "rule-muscovite-low-al",
        "mineral": "Muscovite (low-Al / phengitic)",
        "mineral_group": "White mica",
        "conditions": [{"feature_preset": "AlOH_2200", "param": "center", "op": "between", "value": [2195, 2200]}],
        "match_all": True,
    },
    {
        "id": "rule-muscovite",
        "mineral": "Muscovite",
        "mineral_group": "White mica",
        "conditions": [{"feature_preset": "AlOH_2200", "param": "center", "op": "between", "value": [2200, 2208]}],
        "match_all": True,
    },
    {
        "id": "rule-paragonite",
        "mineral": "Paragonite / high-Al muscovite",
        "mineral_group": "White mica",
        "conditions": [{"feature_preset": "AlOH_2200", "param": "center", "op": "between", "value": [2208, 2220]}],
        "match_all": True,
    },
    {
        "id": "rule-mg-chlorite",
        "mineral": "Mg-chlorite (clinochlore)",
        "mineral_group": "Chlorite",
        "conditions": [{"feature_preset": "MgOH_2320", "param": "center", "op": "between", "value": [2320, 2335]}],
        "match_all": True,
    },
    {
        "id": "rule-fe-chlorite",
        "mineral": "Fe-chlorite (chamosite)",
        "mineral_group": "Chlorite",
        "conditions": [{"feature_preset": "MgOH_2320", "param": "center", "op": "between", "value": [2335, 2360]}],
        "match_all": True,
    },
    {
        "id": "rule-kaolinite",
        "mineral": "Kaolinite",
        "mineral_group": "Clay",
        "conditions": [{"feature_preset": "AlOH_2200", "param": "center", "op": "between", "value": [2160, 2168]}],
        "match_all": True,
    },
    {
        "id": "rule-alunite",
        "mineral": "Alunite",
        "mineral_group": "Sulfate",
        "conditions": [{"feature_preset": "AlOH_2200", "param": "center", "op": "between", "value": [2168, 2180]}],
        "match_all": True,
    },
]
