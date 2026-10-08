/**
 * DataGrid — TanStack Table–based grid replacing the hand-rolled DataTable.
 * Sorting/filtering/pagination are server-side (manualSorting/manualFiltering)
 * against the full effective dataset (see overlay.py); column resizing is
 * client-side via TanStack's column-sizing state.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { getCoreRowModel, useReactTable, type ColumnDef, type ColumnSizingState } from "@tanstack/react-table";
import ColumnFilterMenu from "@/components/ColumnFilterMenu";
import ColumnQuickChartWindow, { type QuickChartKind } from "@/components/tool-windows/ColumnQuickChartWindow";
import type { WorkspaceAreaHandle } from "@/components/window-manager/types";
import { getRows, type RowFilter } from "@/lib/data-api";
import { useDataOpsStore } from "@/stores/data-ops-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { useGeoWindows } from "@/stores/geo-windows-store";
import { useGridView } from "@/stores/grid-view-store";
import { useL, useT } from "@/lib/i18n";
import { censoredLabel, isInternalColumn } from "@/lib/column-profile";

const PAGE_SIZE = 200;
type Row = Record<string, unknown>;

interface Props {
  /** When provided, right-clicking a column header offers "pin chart to canvas". */
  workspaceRef?: RefObject<WorkspaceAreaHandle | null>;
}

export default function DataGrid({ workspaceRef }: Props) {
  const { dataset, selectedColumn, setSelectedColumn } = useDatasetStore();
  const datasetId = dataset?.id;
  const view = useDataOpsStore((s) => (datasetId ? s.getView(datasetId) : { filters: [], filterCombinator: "and" as const, sort: null, heatmap: false }));
  const version = useDataOpsStore((s) => (datasetId ? s.getVersion(datasetId) : 0));
  const setSort = useDataOpsStore((s) => s.setSort);
  const setFilters = useDataOpsStore((s) => s.setFilters);
  const openFilterCol = useDataOpsStore((s) => s.openFilterColumn);
  const openFilterColumnFor = useDataOpsStore((s) => s.openFilterColumnFor);

  const [columns, setColumns] = useState<string[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [ctxMenu, setCtxMenu] = useState<{ col: string; x: number; y: number } | null>(null);
  const offsetRef = useRef(0);
  const chartCascade = useRef(0);
  // Linked selection: the same row_index set the chart windows use (only for the dataset those windows belong to).
  const t = useT();
  const L = useL();
  const [rowIndices, setRowIndices] = useState<number[]>([]);
  const onlySelection = useGridView((s) => s.onlySelection), setOnlySelection = useGridView((s) => s.setOnlySelection);
  const scrollRef = useRef<HTMLDivElement>(null);
  const linked = useGeoWindows((s) => s.datasetId === datasetId);
  const selection = useGeoWindows((s) => s.selection);
  const selected = linked ? selection : new Set<number>();
  const onlyRows = onlySelection && selected.size ? [...selected] : null;
  const onlyKey = onlyRows ? onlyRows.length + ":" + onlyRows.slice(0, 50).join(",") : "";

  const loadPage = useCallback(
    async (reset: boolean) => {
      if (!datasetId) return;
      if (loading) return;
      const offset = reset ? 0 : offsetRef.current;
      if (!reset && offset >= totalRows && totalRows > 0) return;
      setLoading(true);
      setError(null);
      try {
        const result = await getRows(datasetId, {
          offset,
          limit: PAGE_SIZE,
          filters: view.filters,
          combinator: view.filterCombinator,
          sort: view.sort,
          onlyRows,
        });
        if (reset) {
          setColumns(result.columns);
          setHiddenColumns(result.hidden_columns);
          setRows(result.rows);
          setRowIndices(result.row_indices ?? []);
          setTotalRows(result.total_rows);
          offsetRef.current = result.rows.length;
        } else {
          setRows((prev) => [...prev, ...result.rows]);
          setRowIndices((prev) => [...prev, ...(result.row_indices ?? [])]);
          offsetRef.current = offset + result.rows.length;
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datasetId, loading, totalRows, view.filters, view.filterCombinator, view.sort, onlyKey]
  );

  useEffect(() => {
    if (datasetId) {
      offsetRef.current = 0;
      loadPage(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, view.filters, view.filterCombinator, view.sort, version, onlyKey]);
  useEffect(() => { if (!selected.size) setOnlySelection(false); }, [selected.size, setOnlySelection]);
  // A column picked elsewhere (the column profile) is brought into view.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || !selectedColumn) return;
    const th = box.querySelector<HTMLElement>(`th[data-col="${CSS.escape(selectedColumn)}"]`);
    if (!th) return;
    const left = th.offsetLeft - 48, right = th.offsetLeft + th.offsetWidth;
    if (left < box.scrollLeft || right > box.scrollLeft + box.clientWidth) box.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [selectedColumn, columns]);
  // The grid may be the first view of a dataset: bind the shared selection (and windows) to it.
  useEffect(() => { if (datasetId && useGeoWindows.getState().datasetId !== datasetId) useGeoWindows.getState().setDataset(datasetId); }, [datasetId]);
  const pick = (index: number | undefined, e: React.MouseEvent) => {
    if (index === undefined || !linked) return;
    useGeoWindows.getState().select([index], e.shiftKey || e.ctrlKey || e.metaKey ? "toggle" : "replace");
  };

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
    if (nearBottom && !loading && offsetRef.current < totalRows) {
      loadPage(false);
    }
  }

  const columnDefs = useMemo<ColumnDef<Row>[]>(
    () =>
      columns.filter((col) => !isInternalColumn(col)).map((col) => ({
        id: col,
        accessorFn: (row) => row[col],
        header: col,
        size: 160,
        minSize: 60,
      })),
    [columns]
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
  });

  // Conditional-formatting heatmap: min/max per numeric column, scaled to the
  // rows loaded so far (not the full dataset — recomputes as more rows load).
  const numericRanges = useMemo(() => {
    if (!view.heatmap) return new Map<string, { min: number; max: number }>();
    const ranges = new Map<string, { min: number; max: number }>();
    const numericCols = new Set(dataset?.columns.filter((c) => c.dataType === "numeric").map((c) => c.name));
    for (const col of columns) {
      if (!numericCols.has(col)) continue;
      let min = Infinity;
      let max = -Infinity;
      for (const row of rows) {
        const v = row[col];
        if (v == null || v === "") continue;
        const n = Number(v);
        if (isNaN(n)) continue;
        if (n < min) min = n;
        if (n > max) max = n;
      }
      if (min <= max) ranges.set(col, { min, max });
    }
    return ranges;
  }, [view.heatmap, columns, rows, dataset]);

  function toggleSort(col: string) {
    if (!datasetId) return;
    if (!view.sort || view.sort.column !== col) setSort(datasetId, { column: col, direction: "asc" });
    else if (view.sort.direction === "asc") setSort(datasetId, { column: col, direction: "desc" });
    else setSort(datasetId, null);
  }

  function applyFilter(col: string, filter: RowFilter | null) {
    if (!datasetId) return;
    const rest = view.filters.filter((f) => f.column !== col);
    setFilters(datasetId, filter ? [...rest, filter] : rest);
    openFilterColumnFor(null);
  }

  function pinChart(col: string, kind: QuickChartKind) {
    if (!datasetId || !workspaceRef?.current) return;
    chartCascade.current += 1;
    workspaceRef.current.openWindow({
      id: `chart-${kind}-${col}`,
      title: `${kind === "histogram" ? L({ es: "Histograma", en: "Histogram" }) : kind === "box" ? L({ es: "Diagrama de caja", en: "Box plot" }) : L({ es: "Valores más frecuentes", en: "Top values" })} — ${col}`,
      icon: "📊",
      defaultPos: { x: 60 + chartCascade.current * 24, y: 60 + chartCascade.current * 24, width: 420, height: 320 },
      render: () => <ColumnQuickChartWindow datasetId={datasetId} column={col} kind={kind} />,
    });
    setCtxMenu(null);
  }

  if (!dataset) return null;

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4">
        <p className="text-xs text-danger">{L({ es: "No se pudieron cargar los datos", en: "Failed to load data" })}</p>
        <p className="font-mono text-xs text-subtle">{error}</p>
        <button onClick={() => loadPage(true)} className="text-xs text-accent-fg hover:underline">
          {L({ es: "Reintentar", en: "Retry" })}
        </button>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto text-xs" onScroll={handleScroll}>
      {selected.size > 0 && (
        <div className="sticky left-0 top-0 z-30 flex items-center gap-3 border-b border-accent bg-accent-soft px-3 py-1 text-[11.5px] text-accent-fg">
          <span><b className="tabular font-mono">{selected.size}</b> {t("gridSelected")}</span>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={onlySelection} onChange={(e) => setOnlySelection(e.target.checked)} />{t("onlySelection")}</label>
          <button onClick={() => useGeoWindows.getState().clearSelection()} className="underline hover:text-fg">{t("gridClearSelection")}</button>
          <span className="text-muted">{t("gridSelectionHint")}</span>
        </div>
      )}
      <table className="border-collapse" style={{ width: table.getTotalSize() + 40 }}>
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="sticky left-0 z-20 w-10 shrink-0 border-b border-r border-line bg-raised px-2 py-1.5 text-right font-mono text-subtle">
              #
            </th>
            {table.getFlatHeaders().map((header) => {
              const col = header.column.id;
              const meta = dataset.columns.find((c) => c.name === col);
              const isSorted = view.sort?.column === col ? view.sort.direction : null;
              const hasFilter = view.filters.some((f) => f.column === col);
              return (
                <th
                  key={header.id}
                  data-col={col}
                  style={{ width: header.getSize() }}
                  onContextMenu={(e) => {
                    if (!workspaceRef) return;
                    e.preventDefault();
                    setSelectedColumn(col);
                    setCtxMenu({ col, x: e.clientX, y: e.clientY });
                  }}
                  className={`relative border-b border-r border-line bg-raised px-2 py-1.5 text-left font-medium whitespace-nowrap ${
                    col === selectedColumn ? "bg-hover text-accent-fg" : "text-fg"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedColumn(col)}
                      title={col}
                      className="flex-1 truncate text-left hover:text-fg"
                    >
                      {col}
                    </button>
                    <button onClick={() => toggleSort(col)} title={L({ es: "Ordenar", en: "Sort" })} className="text-subtle hover:text-fg">
                      {isSorted === "asc" ? "▲" : isSorted === "desc" ? "▼" : "⇅"}
                    </button>
                    <button
                      onClick={() => openFilterColumnFor(openFilterCol === col ? null : col)}
                      title={L({ es: "Filtrar", en: "Filter" })}
                      className={`hover:text-fg ${hasFilter ? "text-accent-fg" : "text-subtle"}`}
                    >
                      ▾
                    </button>
                  </div>
                  {openFilterCol === col && (
                    <ColumnFilterMenu
                      column={col}
                      dtype={meta?.dataType ?? "text"}
                      current={view.filters.find((f) => f.column === col) ?? null}
                      onApply={(f) => applyFilter(col, f)}
                      onClose={() => openFilterColumnFor(null)}
                    />
                  )}
                  <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-accent-hover/60"
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, ri) => {
            const index = rowIndices[ri];
            const isSel = index !== undefined && selected.has(index);
            const stripe = isSel ? "bg-accent-soft" : ri % 2 === 0 ? "bg-app" : "bg-panel";
            return (
              <tr key={row.id} onClick={(e) => pick(index, e)} aria-selected={isSel || undefined} className={`border-b border-line/60 ${stripe} transition-colors hover:bg-raised ${linked ? "cursor-pointer" : ""}`}>
                <td title={index !== undefined ? `#${index + 1}` : undefined} className={`sticky left-0 z-[5] border-r border-line px-2 py-1 text-right font-mono ${isSel ? "text-accent-fg shadow-[inset_2px_0_0_var(--color-accent)]" : "text-subtle"} ${stripe}`}>
                  {index !== undefined ? index + 1 : ri + 1}
                </td>
                {row.getVisibleCells().map((cell) => {
                  const val = cell.getValue();
                  const isNull = val === null || val === undefined;
                  const censored = isNull ? censoredLabel(cell.row.original[`_nulltype_${cell.column.id}`]) : null;
                  const range = numericRanges.get(cell.column.id);
                  const heatBg =
                    range && !isNull && !isNaN(Number(val))
                      ? heatmapColor((Number(val) - range.min) / (range.max - range.min || 1))
                      : undefined;
                  return (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize(), backgroundColor: heatBg }}
                      className={`whitespace-nowrap border-r border-line/40 px-2 py-1 ${
                        !heatBg && cell.column.id === selectedColumn ? "bg-selected/20" : ""
                      } ${isNull ? "italic text-subtle" : heatBg ? "text-fg" : "text-fg"}`}
                    >
                      {censored ? <span className={`not-italic ${censored.es === "<LD" ? "text-warning" : "text-subtle"}`} title={censored.es === "<LD" ? L({ es: "Bajo el límite de detección", en: "Below detection limit" }) : L({ es: "No analizado", en: "Not analysed" })}>{L(censored)}</span> : isNull ? "—" : String(val)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && !loading && (
        <div className="flex h-40 flex-col items-center justify-center gap-2">
          <p className="text-xs text-subtle">{L({ es: "Ninguna fila coincide con los filtros actuales.", en: "No rows match the current filters." })}</p>
        </div>
      )}
      {loading && (
        <div className="flex justify-center py-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}
      {!loading && offsetRef.current >= totalRows && totalRows > 0 && (
        <div className="py-3 text-center text-xs text-subtle">
          {hiddenColumns.length > 0 && (
            <span className="mr-2 text-subtle">{L({ es: `(${hiddenColumns.length} columnas ocultas)`, en: `(${hiddenColumns.length} hidden columns)` })}</span>
          )}
          {L({ es: `${totalRows.toLocaleString()} filas cargadas (todas)`, en: `All ${totalRows.toLocaleString()} rows loaded` })}
        </div>
      )}
      {ctxMenu && (
        <ColumnContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          dtype={dataset.columns.find((c) => c.name === ctxMenu.col)?.dataType ?? "text"}
          onPick={(kind) => pinChart(ctxMenu.col, kind)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

// Sequential ramp, one hue light→dark (blue-500 base), for the numeric heatmap.
function heatmapColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const alpha = 0.1 + clamped * 0.55;
  return `rgba(59, 130, 246, ${alpha})`;
}

function ColumnContextMenu({
  x,
  y,
  dtype,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  dtype: "numeric" | "categorical" | "datetime" | "text";
  onPick: (kind: QuickChartKind) => void;
  onClose: () => void;
}) {
  const L = useL();
  const options: { kind: QuickChartKind; icon: string; label: string }[] =
    dtype === "numeric"
      ? [
          { kind: "histogram", icon: "📊", label: L({ es: "Histograma", en: "Histogram" }) },
          { kind: "box", icon: "📦", label: L({ es: "Box plot", en: "Box plot" }) },
        ]
      : [{ kind: "bar", icon: "📊", label: L({ es: "Top valores (barras)", en: "Top values (bars)" }) }];

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        style={{ position: "fixed", left: x, top: y }}
        className="z-50 w-52 overflow-hidden rounded-md border border-line bg-panel py-1 text-xs shadow-2xl"
      >
        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">{L({ es: "Clavar al canvas", en: "Pin to canvas" })}</p>
        {options.map((o) => (
          <button
            key={o.kind}
            onClick={() => onPick(o.kind)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-fg hover:bg-hover hover:text-fg"
          >
            <span>{o.icon}</span>
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}
