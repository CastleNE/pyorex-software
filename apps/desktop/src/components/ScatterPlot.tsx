/**
 * ScatterPlot — interactive geochemical scatter chart powered by Plotly.js.
 *
 * Features:
 * - X / Y axis selectors (numeric columns only)
 * - Color-by selector (any column; __sample_type__ gets geochemical color coding)
 * - Log scale toggles for both axes
 * - Dark theme matching the app shell
 * - Lazy-loads all dataset rows on mount
 */
import { useEffect, useMemo, useState } from "react";
import Plot from "@/components/ThemedPlot";
import type { Layout } from "plotly.js";
import { useDatasetStore } from "@/stores/dataset-store";
import { getRows } from "@/lib/data-api";

// ── Sample type colour palette (geochemical convention) ───────────────────────
const SAMPLE_TYPE_COLORS: Record<string, string> = {
  S:   "#71717a", // zinc-500   — regular sample
  FB:  "#60a5fa", // blue-400   — field blank
  QB:  "#a78bfa", // violet-400 — quality blank
  FD:  "#fb923c", // orange-400 — field duplicate
  QD:  "#facc15", // yellow-400 — quality duplicate
  CRM: "#34d399", // emerald-400— certified reference material
  STD: "#34d399",
};
const DEFAULT_COLOR = "#71717a";
function sampleTypeColor(val: unknown): string {
  if (val == null) return DEFAULT_COLOR;
  return SAMPLE_TYPE_COLORS[String(val).toUpperCase()] ?? DEFAULT_COLOR;
}

// ── Dark layout base ──────────────────────────────────────────────────────────
const DARK_BG   = "#18181b"; // zinc-900
const GRID_COLOR = "#3f3f46"; // zinc-700
const FONT_COLOR = "#d4d4d8"; // zinc-300

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScatterPlot() {
  const { dataset } = useDatasetStore();

  // All rows loaded from Python service
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Chart configuration
  const numericCols = useMemo(
    () => dataset?.columns.filter((c) => c.dataType === "numeric").map((c) => c.name) ?? [],
    [dataset]
  );
  const allCols = useMemo(
    () => dataset?.columns.filter((c) => !c.name.startsWith("_")).map((c) => c.name) ?? [],
    [dataset]
  );

  const [xCol, setXCol] = useState("");
  const [yCol, setYCol] = useState("");
  const [colorCol, setColorCol] = useState("__sample_type__");
  const [logX, setLogX] = useState(false);
  const [logY, setLogY] = useState(false);

  // Set sensible defaults when columns change
  useEffect(() => {
    if (numericCols.length >= 1) setXCol((prev) => prev || numericCols[0]);
    if (numericCols.length >= 2) setYCol((prev) => prev || numericCols[1]);
  }, [numericCols]);

  // Load all rows when dataset changes
  useEffect(() => {
    if (!dataset) return;
    setLoading(true);
    setLoadError(null);
    setRows([]);
    // Fetch up to 50 000 rows — sufficient for typical geochemical assay tables
    getRows(dataset.id, { offset: 0, limit: 50_000 })
      .then((r) => {
        setRows(r.rows);
        setLoading(false);
      })
      .catch((e) => {
        setLoadError(String(e));
        setLoading(false);
      });
  }, [dataset?.id]);

  // ── Build Plotly trace ─────────────────────────────────────────────────────
  const { traces, stats } = useMemo(() => {
    if (!xCol || !yCol || rows.length === 0) return { traces: [], stats: null };

    // Determine color mode
    const hasSampleType =
      colorCol === "__sample_type__" && rows.some((r) => r["__sample_type__"] != null);
    const useColorCol = allCols.includes(colorCol) || hasSampleType;

    if (useColorCol && colorCol) {
      // Group rows by color column value → one Plotly trace per group
      const groups = new Map<string, { x: (number | null)[]; y: (number | null)[] }>();
      for (const row of rows) {
        const xv = toNum(row[xCol]);
        const yv = toNum(row[yCol]);
        const group = String(row[colorCol] ?? "—");
        if (!groups.has(group)) groups.set(group, { x: [], y: [] });
        groups.get(group)!.x.push(xv);
        groups.get(group)!.y.push(yv);
      }
      const t = Array.from(groups.entries()).map(([name, { x, y }]) => ({
        type: "scatter" as const,
        mode: "markers" as const,
        name,
        x,
        y,
        marker: {
          color: colorCol === "__sample_type__" ? sampleTypeColor(name) : undefined,
          size: 6,
          opacity: 0.8,
        },
      }));

      const validPairs = rows.filter(
        (r) => toNum(r[xCol]) != null && toNum(r[yCol]) != null
      ).length;
      return { traces: t, stats: { n: validPairs, groups: groups.size } };
    }

    // Single trace, no color grouping
    const x: (number | null)[] = [];
    const y: (number | null)[] = [];
    for (const row of rows) {
      x.push(toNum(row[xCol]));
      y.push(toNum(row[yCol]));
    }
    const validPairs = x.filter((v, i) => v != null && y[i] != null).length;
    return {
      traces: [
        {
          type: "scatter" as const,
          mode: "markers" as const,
          name: yCol,
          x,
          y,
          marker: { color: "#60a5fa", size: 6, opacity: 0.75 },
        },
      ],
      stats: { n: validPairs, groups: 1 },
    };
  }, [rows, xCol, yCol, colorCol, allCols]);

  const layout = useMemo(
    (): Partial<Layout> => ({
      paper_bgcolor: DARK_BG,
      plot_bgcolor:  DARK_BG,
      font: { color: FONT_COLOR, family: "Inter, system-ui, sans-serif", size: 11 },
      margin: { t: 20, r: 20, b: 50, l: 60 },
      showlegend: true,
      legend: {
        bgcolor: "#27272a",
        bordercolor: GRID_COLOR,
        borderwidth: 1,
        font: { size: 10 },
      },
      xaxis: {
        title: { text: xCol, standoff: 8 },
        type: logX ? "log" : "linear",
        gridcolor: GRID_COLOR,
        zerolinecolor: GRID_COLOR,
        automargin: true,
      },
      yaxis: {
        title: { text: yCol, standoff: 8 },
        type: logY ? "log" : "linear",
        gridcolor: GRID_COLOR,
        zerolinecolor: GRID_COLOR,
        automargin: true,
      },
    }),
    [xCol, yCol, logX, logY]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-zinc-500">Loading {dataset?.rowCount.toLocaleString()} rows…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-xs text-red-400">Failed to load data: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Controls bar ── */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-zinc-700 bg-zinc-900 shrink-0">
        <AxisSelect
          label="X"
          value={xCol}
          options={numericCols}
          onChange={setXCol}
        />
        <AxisSelect
          label="Y"
          value={yCol}
          options={numericCols}
          onChange={setYCol}
        />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500">Color by</span>
          <select
            value={colorCol}
            onChange={(e) => setColorCol(e.target.value)}
            className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">— none —</option>
            {dataset?.columns.some((c) => c.name === "__sample_type__") && (
              <option value="__sample_type__">Sample type</option>
            )}
            {allCols.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 ml-2">
          <LogToggle label="Log X" active={logX} onChange={setLogX} />
          <LogToggle label="Log Y" active={logY} onChange={setLogY} />
        </div>

        {stats && (
          <span className="ml-auto text-xs text-zinc-600">
            n = {stats.n.toLocaleString()}
            {stats.groups > 1 && ` · ${stats.groups} groups`}
          </span>
        )}
      </div>

      {/* ── Plot ── */}
      <div className="flex-1 min-h-0">
        {xCol && yCol ? (
          <Plot
            data={traces}
            layout={layout}
            config={{
              responsive: true,
              displaylogo: false,
              modeBarButtonsToRemove: ["lasso2d", "select2d"],
            }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-zinc-600">Select X and Y columns above to plot</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function AxisSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-semibold text-zinc-400 w-4">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-blue-500 max-w-[160px]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function LogToggle({
  label,
  active,
  onChange,
}: {
  label: string;
  active: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!active)}
      className={`px-2 py-1 text-xs rounded border transition-colors ${
        active
          ? "bg-blue-600 border-blue-500 text-white"
          : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}
