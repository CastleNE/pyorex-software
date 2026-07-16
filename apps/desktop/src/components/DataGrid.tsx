/**
 * DataGrid — TanStack Table–based grid replacing the hand-rolled DataTable.
 * Sorting/filtering/pagination are server-side (manualSorting/manualFiltering)
 * against the full effective dataset (see overlay.py); column resizing is
 * client-side via TanStack's column-sizing state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCoreRowModel, useReactTable, type ColumnDef, type ColumnSizingState } from "@tanstack/react-table";
import ColumnFilterMenu from "@/components/ColumnFilterMenu";
import { getRows, type RowFilter } from "@/lib/data-api";
import { useDataOpsStore } from "@/stores/data-ops-store";
import { useDatasetStore } from "@/stores/dataset-store";

const PAGE_SIZE = 200;
type Row = Record<string, unknown>;

export default function DataGrid() {
  const { dataset, selectedColumn, setSelectedColumn } = useDatasetStore();
  const datasetId = dataset?.id;
  const view = useDataOpsStore((s) => (datasetId ? s.getView(datasetId) : { filters: [], sort: null }));
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
  const offsetRef = useRef(0);

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
          sort: view.sort,
        });
        if (reset) {
          setColumns(result.columns);
          setHiddenColumns(result.hidden_columns);
          setRows(result.rows);
          setTotalRows(result.total_rows);
          offsetRef.current = result.rows.length;
        } else {
          setRows((prev) => [...prev, ...result.rows]);
          offsetRef.current = offset + result.rows.length;
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [datasetId, loading, totalRows, view.filters, view.sort]
  );

  useEffect(() => {
    if (datasetId) {
      offsetRef.current = 0;
      loadPage(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, view.filters, view.sort, version]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
    if (nearBottom && !loading && offsetRef.current < totalRows) {
      loadPage(false);
    }
  }

  const columnDefs = useMemo<ColumnDef<Row>[]>(
    () =>
      columns.map((col) => ({
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

  if (!dataset) return null;

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4">
        <p className="text-xs text-red-400">Failed to load data</p>
        <p className="font-mono text-xs text-zinc-600">{error}</p>
        <button onClick={() => loadPage(true)} className="text-xs text-blue-400 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto text-xs" onScroll={handleScroll}>
      <table className="border-collapse" style={{ width: table.getTotalSize() + 40 }}>
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="sticky left-0 z-20 w-10 shrink-0 border-b border-r border-zinc-700 bg-zinc-800 px-2 py-1.5 text-right font-mono text-zinc-500">
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
                  style={{ width: header.getSize() }}
                  className={`relative border-b border-r border-zinc-700 bg-zinc-800 px-2 py-1.5 text-left font-medium whitespace-nowrap ${
                    col === selectedColumn ? "bg-zinc-700 text-blue-400" : "text-zinc-300"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedColumn(col)}
                      title={col}
                      className="flex-1 truncate text-left hover:text-zinc-100"
                    >
                      {col}
                    </button>
                    <button onClick={() => toggleSort(col)} title="Sort" className="text-zinc-500 hover:text-zinc-200">
                      {isSorted === "asc" ? "▲" : isSorted === "desc" ? "▼" : "⇅"}
                    </button>
                    <button
                      onClick={() => openFilterColumnFor(openFilterCol === col ? null : col)}
                      title="Filter"
                      className={`hover:text-zinc-200 ${hasFilter ? "text-blue-400" : "text-zinc-500"}`}
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
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-blue-500/60"
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, ri) => {
            const stripe = ri % 2 === 0 ? "bg-zinc-900" : "bg-zinc-850";
            return (
              <tr key={row.id} className={`border-b border-zinc-800/60 ${stripe} transition-colors hover:bg-zinc-800`}>
                <td className={`sticky left-0 z-[5] border-r border-zinc-800 px-2 py-1 text-right font-mono text-zinc-600 ${stripe}`}>
                  {ri + 1}
                </td>
                {row.getVisibleCells().map((cell) => {
                  const val = cell.getValue();
                  const isNull = val === null || val === undefined;
                  return (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className={`whitespace-nowrap border-r border-zinc-800/40 px-2 py-1 ${
                        cell.column.id === selectedColumn ? "bg-blue-900/20" : ""
                      } ${isNull ? "italic text-zinc-600" : "text-zinc-200"}`}
                    >
                      {isNull ? "—" : String(val)}
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
          <p className="text-xs text-zinc-600">No rows match the current filters.</p>
        </div>
      )}
      {loading && (
        <div className="flex justify-center py-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      )}
      {!loading && offsetRef.current >= totalRows && totalRows > 0 && (
        <div className="py-3 text-center text-xs text-zinc-600">
          {hiddenColumns.length > 0 && (
            <span className="mr-2 text-zinc-700">({hiddenColumns.length} hidden columns)</span>
          )}
          All {totalRows.toLocaleString()} rows loaded
        </div>
      )}
    </div>
  );
}
