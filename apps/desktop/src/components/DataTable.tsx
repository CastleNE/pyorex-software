/**
 * DataTable — scrollable grid showing the active dataset.
 * Loads rows from the Python service in pages and shows column quick-stats.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { getRows } from "@/lib/data-api";
import { useDatasetStore } from "@/stores/dataset-store";

const PAGE_SIZE = 200;

export default function DataTable() {
  const { dataset, selectedColumn, setSelectedColumn } = useDatasetStore();
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(
    async (reset: boolean) => {
      if (!dataset) return;
      if (loading) return;
      const offset = reset ? 0 : offsetRef.current;
      if (!reset && offset >= totalRows && totalRows > 0) return;

      setLoading(true);
      setError(null);
      try {
        const result = await getRows(dataset.id, offset, PAGE_SIZE);
        if (reset) {
          setColumns(result.columns);
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
    [dataset, loading, totalRows]
  );

  // Load first page when dataset changes
  useEffect(() => {
    if (dataset) {
      offsetRef.current = 0;
      loadPage(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.id]);

  // Infinite scroll
  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
    if (nearBottom && !loading && offsetRef.current < totalRows) {
      loadPage(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 gap-2">
        <p className="text-xs text-red-400">Failed to load data</p>
        <p className="text-xs text-zinc-600 font-mono">{error}</p>
        <button
          onClick={() => loadPage(true)}
          className="text-xs text-blue-400 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (rows.length === 0 && loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto text-xs"
      onScroll={handleScroll}
    >
      <table className="min-w-full border-collapse">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="px-2 py-1.5 bg-zinc-800 border-b border-r border-zinc-700 text-zinc-500 font-mono text-right w-10 shrink-0">
              #
            </th>
            {columns.map((col) => (
              <th
                key={col}
                onClick={() => setSelectedColumn(col)}
                className={`px-3 py-1.5 bg-zinc-800 border-b border-r border-zinc-700 font-medium text-left cursor-pointer whitespace-nowrap transition-colors ${
                  col === selectedColumn
                    ? "text-blue-400 bg-zinc-700"
                    : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-750"
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={`border-b border-zinc-800/60 ${ri % 2 === 0 ? "bg-zinc-900" : "bg-zinc-850"} hover:bg-zinc-800 transition-colors`}
            >
              <td className="px-2 py-1 text-right text-zinc-600 border-r border-zinc-800 font-mono">
                {ri + 1}
              </td>
              {columns.map((col) => {
                const val = row[col];
                const isNull = val === null || val === undefined;
                return (
                  <td
                    key={col}
                    className={`px-3 py-1 border-r border-zinc-800/40 whitespace-nowrap ${
                      col === selectedColumn ? "bg-blue-900/20" : ""
                    } ${isNull ? "text-zinc-600 italic" : "text-zinc-200"}`}
                  >
                    {isNull ? "—" : String(val)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {loading && rows.length > 0 && (
        <div className="flex justify-center py-3">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {!loading && offsetRef.current >= totalRows && totalRows > 0 && (
        <div className="text-center py-3 text-xs text-zinc-600">
          All {totalRows.toLocaleString()} rows loaded
        </div>
      )}
    </div>
  );
}
