"""Excel import (.xlsx): first sheet by default, a sheet by name; Polars ≥ 1 sheet_name/sheet_id rules."""
import polars as pl
import pytest

from analysis.data.importer import ImportConfig, import_file, preview_file


def test_xlsx_first_sheet_and_named_sheet(tmp_path):
    xlsxwriter = pytest.importorskip('xlsxwriter')
    path = tmp_path / 'muestras.xlsx'
    with xlsxwriter.Workbook(path) as wb:
        pl.DataFrame({'Sample': ['a', 'b'], 'Cu_ppm': [10.0, 20.0]}).write_excel(wb, worksheet='Geoquimica')
        pl.DataFrame({'Hole': ['DDH1'], 'Depth': [5.0]}).write_excel(wb, worksheet='Sondajes')
    df, _ = import_file(str(path), ImportConfig())
    assert df['Cu_ppm'].to_list() == [10.0, 20.0]
    df2, _ = import_file(str(path), ImportConfig(sheet_name='Sondajes'))
    assert df2['Hole'].to_list() == ['DDH1']
    assert preview_file(str(path)) is not None
