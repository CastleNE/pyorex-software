"""Simple, molecular and alteration geochemical indices (Phase 2A).

Every function takes oxide values already expressed in wt% (as the pipeline delivers them) and reproduces the
formulas that ``engine._coordinates`` used, with the SAME order of floating-point operations, so results are
bit-identical to the previous implementation. Divisions go through ``calculate_ratio``.

The molar-mass table and the Fe2O3T -> FeOT factor live here and nowhere else.
"""
from analysis.geochemistry.core.ratios import calculate_ratio

# Molar masses (g/mol) of the oxides used by the Shand indices. Single source of truth.
MOLAR_MASSES = {'Al2O3': 101.9613, 'CaO': 56.0774, 'Na2O': 61.9789, 'K2O': 94.196}

# Total iron given as Fe2O3T is converted to FeOT with this factor. Kept exactly as historically used.
FE2O3T_TO_FEOT = 0.8998


def convert_fe2o3t_to_feot(fe2o3_total: float) -> float:
    """FeOT = Fe2O3T x 0.8998 (the historical factor; not refined on purpose)."""
    return fe2o3_total * FE2O3T_TO_FEOT


def calculate_mali(na2o: float, k2o: float, cao: float) -> float:
    """Modified alkali-lime index: Na2O + K2O - CaO (wt%)."""
    return na2o + k2o - cao


def calculate_fe_index(feot: float, mgo: float) -> float:
    """Fe-index: FeOT / (FeOT + MgO)."""
    return calculate_ratio(feot, feot + mgo)


def calculate_a_nk(al2o3: float, na2o: float, k2o: float) -> float:
    """A/NK (molar): Al2O3 / (Na2O + K2O), each oxide divided by its molar mass."""
    return calculate_ratio(al2o3 / MOLAR_MASSES['Al2O3'], na2o / MOLAR_MASSES['Na2O'] + k2o / MOLAR_MASSES['K2O'])


def calculate_a_cnk(al2o3: float, cao: float, na2o: float, k2o: float) -> float:
    """A/CNK (molar): Al2O3 / (CaO + Na2O + K2O), each oxide divided by its molar mass."""
    return calculate_ratio(
        al2o3 / MOLAR_MASSES['Al2O3'],
        cao / MOLAR_MASSES['CaO'] + na2o / MOLAR_MASSES['Na2O'] + k2o / MOLAR_MASSES['K2O'])


def calculate_shand_indices(al2o3: float, cao: float, na2o: float, k2o: float) -> tuple[float, float]:
    """The Shand pair ``(A/CNK, A/NK)``.

    A/NK is evaluated FIRST, exactly as the legacy engine did, so a zero ``Na2O + K2O`` raises before A/CNK is
    computed. Callers that need the legacy behaviour of the A/CNK tool (which also evaluates A/NK) rely on this order.
    """
    a_nk = calculate_a_nk(al2o3, na2o, k2o)
    a_cnk = calculate_a_cnk(al2o3, cao, na2o, k2o)
    return a_cnk, a_nk


def calculate_ai(mgo: float, k2o: float, na2o: float, cao: float) -> float:
    """Alteration index: 100 (MgO + K2O) / (MgO + K2O + Na2O + CaO)."""
    return calculate_ratio(100 * (mgo + k2o), mgo + k2o + na2o + cao)


def calculate_ccpi(mgo: float, feot: float, na2o: float, k2o: float) -> float:
    """Chlorite-carbonate-pyrite index: 100 (MgO + FeOT) / (MgO + FeOT + Na2O + K2O)."""
    return calculate_ratio(100 * (mgo + feot), mgo + feot + na2o + k2o)


def calculate_alteration_indices(mgo: float, k2o: float, na2o: float, cao: float, feot: float) -> tuple[float, float]:
    """The alteration pair ``(AI, CCPI)``; ``feot`` must already respect the iron basis."""
    return calculate_ai(mgo, k2o, na2o, cao), calculate_ccpi(mgo, feot, na2o, k2o)
