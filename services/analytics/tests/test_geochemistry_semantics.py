"""Semantic Variable System (v1): deterministic column classification, in isolation from the Tool Registry and the
RPC layer. classify_column reads only a column's name and whether Polars reports it numeric — never a value."""
import re

import pytest

from analysis.geochemistry.semantics import (
    MAJOR_OXIDES, REE_ELEMENTS, TRACE_ELEMENT_SYMBOLS, ColumnClassification, Confidence,
    SemanticRole, classify_column, classify_column_with_hint, classification_to_dict,
)


# ── The exact cases from the task spec ────────────────────────────────────────────────────────
@pytest.mark.parametrize('name,role,analyte,unit', [
    ('Cu_ppm', SemanticRole.TRACE_ELEMENT, 'Cu', 'ppm'),
    ('SiO2_pct', SemanticRole.MAJOR_OXIDE, 'SiO2', 'wt%'),
    ('East_AMG84_z51', SemanticRole.EASTING, None, None),
    ('North_AMG84_z51', SemanticRole.NORTHING, None, None),
    ('Depth', SemanticRole.DEPTH, None, None),
    ('From_m', SemanticRole.DEPTH_FROM, None, None),
    ('To_m', SemanticRole.DEPTH_TO, None, None),
    ('DHID', SemanticRole.HOLE_ID, None, None),
    ('Sample_ID', SemanticRole.SAMPLE_ID, None, None),
    ('[Order]', SemanticRole.ROW_INDEX, None, None),
    ('Long_WGS84', SemanticRole.LONGITUDE, None, None),
    ('Lat_WGS84', SemanticRole.LATITUDE, None, None),
    ('Au_ppb', SemanticRole.TRACE_ELEMENT, 'Au', 'ppb'),
    ('La_ppm', SemanticRole.REE, 'La', 'ppm'),
    ('Ce_ppm', SemanticRole.REE, 'Ce', 'ppm'),
])
def test_the_spec_examples_classify_exactly_as_specified(name, role, analyte, unit):
    result = classify_column(name, numeric=True)
    assert (result.semantic_role, result.analyte, result.unit) == (role, analyte, unit)
    assert result.confidence is Confidence.HIGH
    assert result.column == name


def test_original_column_names_are_never_altered_or_read_as_values():
    result = classify_column('Cu_ppm', numeric=True)
    assert result.column == 'Cu_ppm'                    # not renamed, not lowercased, not unit-stripped


# ── Ambiguity: no aggressive guessing ──────────────────────────────────────────────────────────
def test_an_unrecognized_numeric_column_is_numeric_generic_not_a_specific_role():
    result = classify_column('Value1', numeric=True)
    assert result.semantic_role is SemanticRole.NUMERIC_GENERIC
    assert result.confidence is Confidence.LOW


def test_an_unrecognized_non_numeric_column_is_unknown():
    result = classify_column('Notes', numeric=False)
    assert result.semantic_role is SemanticRole.UNKNOWN
    assert result.confidence is Confidence.LOW


@pytest.mark.parametrize('name', ['Sr_Y', 'Au_gt', 'Comments', 'pH', 'Batch'])
def test_no_role_is_invented_for_genuinely_ambiguous_names(name):
    result = classify_column(name, numeric=True)
    assert result.semantic_role in (SemanticRole.NUMERIC_GENERIC, SemanticRole.UNKNOWN)


# ── Coordinates, depth family, identifiers: name-only, no analyte/unit ─────────────────────────
@pytest.mark.parametrize('name,role', [
    ('Elevation_m', SemanticRole.ELEVATION), ('RL', SemanticRole.ELEVATION), ('Z', SemanticRole.ELEVATION),
    ('Profundidad', SemanticRole.DEPTH), ('Desde', SemanticRole.DEPTH_FROM), ('Hasta', SemanticRole.DEPTH_TO),
    ('Hole', SemanticRole.HOLE_ID), ('Sondaje', SemanticRole.HOLE_ID), ('BHID', SemanticRole.HOLE_ID),
    ('Sample', SemanticRole.SAMPLE_ID), ('Muestra_ID', SemanticRole.SAMPLE_ID),
    ('Lon_WGS84', SemanticRole.LONGITUDE), ('Longitude', SemanticRole.LONGITUDE), ('Lon', SemanticRole.LONGITUDE),
    ('Longitude_WGS84', SemanticRole.LONGITUDE),
    ('Latitude', SemanticRole.LATITUDE), ('Lat', SemanticRole.LATITUDE), ('Latitude_WGS84', SemanticRole.LATITUDE),
])
def test_additional_coordinate_depth_and_identifier_names(name, role):
    assert classify_column(name, numeric=True).semantic_role is role


def test_coordinate_and_identifier_roles_carry_no_analyte_or_unit():
    for name in ('East_AMG84_z51', 'North_AMG84_z51', 'Depth', 'DHID', 'Sample_ID', 'Long_WGS84', 'Lat_WGS84'):
        result = classify_column(name, numeric=True)
        assert result.analyte is None and result.unit is None


def test_a_stray_space_around_the_unit_or_coordinate_token_does_not_break_detection():
    assert classify_column('North_ AMG84_z51', numeric=True).semantic_role is SemanticRole.NORTHING


# ── Row index: an internal position, never a geochemical or spatial variable ────────────────────
@pytest.mark.parametrize('name', ['[Order]', 'Order', 'Row', 'Row_ID', 'RowID', 'Index', 'FID', 'OBJECTID'])
def test_row_index_aliases_classify_as_row_index_with_high_confidence(name):
    result = classify_column(name, numeric=True)
    assert result.semantic_role is SemanticRole.ROW_INDEX
    assert result.confidence is Confidence.HIGH and result.source == 'name'
    assert result.analyte is None and result.unit is None


@pytest.mark.parametrize('name', ['Indexed_Value', 'Reordered', 'Rowan', 'Fiducial'])
def test_row_index_matching_is_conservative_not_a_substring_check(name):
    """'row'/'index'/'fid' inside a longer, unrelated name must not trigger row_index."""
    assert classify_column(name, numeric=True).semantic_role is not SemanticRole.ROW_INDEX


# ── Analytes: REE > major oxide > identified trace element (incl. Au/Ag) — unit/assay-keyword never override it ──
@pytest.mark.parametrize('name,role,analyte', [
    ('TiO2_pct', SemanticRole.MAJOR_OXIDE, 'TiO2'), ('Al2O3_pct', SemanticRole.MAJOR_OXIDE, 'Al2O3'),
    ('K2O_pct', SemanticRole.MAJOR_OXIDE, 'K2O'),
    ('La_ppm', SemanticRole.REE, 'La'), ('Yb_ppm', SemanticRole.REE, 'Yb'), ('Ce_ppm', SemanticRole.REE, 'Ce'),
    ('Zn_ppm', SemanticRole.TRACE_ELEMENT, 'Zn'), ('As_ppm', SemanticRole.TRACE_ELEMENT, 'As'),
    ('Cu_ppm', SemanticRole.TRACE_ELEMENT, 'Cu'),
    ('Au_ppb', SemanticRole.TRACE_ELEMENT, 'Au'), ('Ag_ppm', SemanticRole.TRACE_ELEMENT, 'Ag'),
])
def test_analyte_roles_and_the_extracted_analyte_symbol(name, role, analyte):
    result = classify_column(name, numeric=True)
    assert (result.semantic_role, result.analyte) == (role, analyte)
    assert result.confidence is Confidence.HIGH


def test_being_a_precious_metal_assay_does_not_change_the_geochemical_role_a_specific_analyte_is_identified_first():
    """Au/Ag are economically assayed, but which element they are outranks that — see the module docstring."""
    for name in ('Au_ppm', 'Au_ppb', 'Au', 'Ag_ppm'):
        assert classify_column(name, numeric=True).semantic_role is SemanticRole.TRACE_ELEMENT


def test_bare_element_name_without_a_unit_suffix_still_classifies_but_without_a_unit():
    result = classify_column('Cu', numeric=True)
    assert result.semantic_role is SemanticRole.TRACE_ELEMENT and result.analyte == 'Cu' and result.unit is None


def test_ree_and_trace_vocabularies_do_not_overlap_and_precious_metals_live_only_in_trace():
    assert not (set(REE_ELEMENTS) & set(TRACE_ELEMENT_SYMBOLS))
    assert not (set(MAJOR_OXIDES) & (set(REE_ELEMENTS) | set(TRACE_ELEMENT_SYMBOLS)))
    assert {'Au', 'Ag'} <= set(TRACE_ELEMENT_SYMBOLS)


# ── SemanticRole.ASSAY: reserved for generic ensayo columns with no resolvable analyte ───────────
@pytest.mark.parametrize('name', ['Assay1', 'Assay2', 'Original_Assay', 'Check_Assay', 'Ensaye', 'Ensayo_Original'])
def test_generic_assay_columns_with_no_identifiable_analyte_use_the_assay_role(name):
    result = classify_column(name, numeric=True)
    assert result.semantic_role is SemanticRole.ASSAY
    assert result.analyte is None
    assert result.confidence is Confidence.MEDIUM   # a name heuristic, not a resolved analyte


def test_numeric_generic_still_works_for_a_genuinely_unknown_numeric_variable():
    assert classify_column('Value1', numeric=True).semantic_role is SemanticRole.NUMERIC_GENERIC
    assert classify_column('pH', numeric=True).semantic_role is SemanticRole.NUMERIC_GENERIC


@pytest.mark.parametrize('unit_token,presentation', [('ppm', 'ppm'), ('ppb', 'ppb'), ('pct', 'wt%'), ('%', 'wt%')])
def test_unit_suffix_is_translated_to_the_presentation_form(unit_token, presentation):
    assert classify_column(f'Cu_{unit_token}', numeric=True).unit == presentation


def test_ratio_looking_names_are_medium_confidence_not_high():
    result = classify_column('La/Yb', numeric=True)
    assert result.semantic_role is SemanticRole.RATIO
    assert result.confidence is Confidence.MEDIUM


def test_categorical_name_hints_are_medium_confidence():
    result = classify_column('Lithology', numeric=False)
    assert result.semantic_role is SemanticRole.CATEGORICAL
    assert result.confidence is Confidence.MEDIUM


# ── classify_column_with_hint: the existing (coarser) importer ColumnRole enriches ambiguity only ──
def test_a_confident_name_based_result_ignores_a_contradicting_catalog_hint():
    result = classify_column_with_hint('Cu_ppm', True, existing_role='calculated_numeric')
    assert result.semantic_role is SemanticRole.TRACE_ELEMENT and result.source == 'unit'   # unaffected


def test_an_ambiguous_column_is_enriched_by_the_existing_column_role():
    result = classify_column_with_hint('Grade', True, existing_role='assay_oxide', existing_analyte='SiO2', existing_unit='pct')
    assert result.semantic_role is SemanticRole.MAJOR_OXIDE
    assert (result.analyte, result.unit, result.source, result.confidence) == ('SiO2', 'wt%', 'catalog', Confidence.MEDIUM)


def test_a_hint_the_classifier_has_no_mapping_for_leaves_the_ambiguous_result_untouched():
    result = classify_column_with_hint('Weird', True, existing_role='unknown')
    assert result.semantic_role is SemanticRole.NUMERIC_GENERIC


def test_no_hint_is_consulted_when_none_is_given():
    assert classify_column_with_hint('Value1', True, existing_role=None).semantic_role is SemanticRole.NUMERIC_GENERIC


def test_row_index_is_high_confidence_so_a_catalog_hint_never_reaches_it():
    result = classify_column_with_hint('[Order]', True, existing_role='calculated_numeric')
    assert result.semantic_role is SemanticRole.ROW_INDEX and result.source == 'name'


# ── Serialization ────────────────────────────────────────────────────────────────────────────
def test_classification_to_dict_is_plain_json_safe_data():
    import json
    payload = classification_to_dict(classify_column('Cu_ppm', True))
    assert payload == {'column': 'Cu_ppm', 'semantic_role': 'trace_element', 'analyte': 'Cu', 'unit': 'ppm',
                       'confidence': 'high', 'source': 'unit'}
    assert json.loads(json.dumps(payload)) == payload


def test_semantic_role_has_exactly_the_specified_vocabulary():
    assert {r.value for r in SemanticRole} == {
        'sample_id', 'hole_id', 'row_index', 'depth', 'depth_from', 'depth_to', 'easting', 'northing', 'elevation',
        'longitude', 'latitude', 'major_oxide', 'trace_element', 'ree', 'assay', 'ratio', 'categorical',
        'numeric_generic', 'unknown',
    }


def test_column_classification_is_frozen():
    result = classify_column('Cu_ppm', True)
    with pytest.raises((AttributeError, Exception)):
        result.semantic_role = SemanticRole.UNKNOWN
