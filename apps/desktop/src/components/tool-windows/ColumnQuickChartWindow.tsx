/**
 * Quick chart "pinned to canvas" from a DataGrid column header (right-click →
 * Add to canvas). Self-contained: fetches its own column data and stays open
 * as a regular floating window, so a user can build up a lightweight
 * dashboard just by exploring the grid — no trip to Data Analysis needed.
 */
import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import type { Data, Layout } from "plotly.js";
import { getRows } from "@/lib/data-api";

const DARK_BG = "#18181b";
const GRID_COLOR = "#3f3f46";
const FONT_COLOR = "#d4d4d8";

export type QuickChartKind = "histogram" | "box" | "bar";

interface Props {
  datasetId: string;
  column: string;
  kind: QuickChartKind;
}

export default function ColumnQuickChartWindow({ datasetId, column, kind }: Props) {
  const [values, setValues] = useState<unknown[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setValues(null);
    setError(null);
    getRows(datasetId, { offset: 0, limit: 50_000 })
      .then((r) => {
        if (cancelled) return;
        setValues(r.rows.map((row) => row[column]));
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [datasetId, column]);

  const { data, layout, n } = useMemo(() => {
    if (!values) return { data: [] as Data[], layout: {} as Partial<Layout>, n: 0 };

    const baseLayout: Partial<Layout> = {
      paper_bgcolor: DARK_BG,
      plot_bgcolor: DARK_BG,
      font: { color: FONT_COLOR, family: "Inter, system-ui, sans-serif", size: 10 },
      margin: { t: 10, r: 15, b: 40, l: 45 },
      showlegend: false,
    };

    if (kind === "bar") {
      const counts = new Map<string, number>();
      for (const v of values) {
        if (v == null) continue;
        const k = String(v);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const top = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);
      return {
        data: [
          {
            type: "bar" as const,
            x: top.map(([, c]) => c),
            y: top.map(([k]) => k),
            orientation: "h" as const,
            marker: { color: "#60a5fa" },
          },
        ],
        layout: {
          ...baseLayout,
          margin: { ...baseLayout.margin, l: 100 },
          xaxis: { gridcolor: GRID_COLOR, zerolinecolor: GRID_COLOR, title: { text: "count" } },
          yaxis: { gridcolor: GRID_COLOR, automargin: true },
        },
        n: values.filter((v) => v != null).length,
      };
    }

    const nums = values.map((v) => (v == null || v === "" ? null : Number(v))).filter((v): v is number => v != null && !isNaN(v));

    if (kind === "box") {
      return {
        data: [
          {
            type: "box" as const,
            y: nums,
            name: column,
            marker: { color: "#34d399" },
            boxpoints: "outliers" as const,
          },
        ],
        layout: {
          ...baseLayout,
          yaxis: { gridcolor: GRID_COLOR, zerolinecolor: GRID_COLOR, automargin: true },
          xaxis: { showticklabels: false },
        },
        n: nums.length,
      };
    }

    // histogram
    return {
      data: [
        {
          type: "histogram" as const,
          x: nums,
          marker: { color: "#60a5fa" },
          nbinsx: 30,
        },
      ],
      layout: {
        ...baseLayout,
        xaxis: { gridcolor: GRID_COLOR, zerolinecolor: GRID_COLOR, title: { text: column }, automargin: true },
        yaxis: { gridcolor: GRID_COLOR, zerolinecolor: GRID_COLOR, title: { text: "count" } },
      },
      n: nums.length,
    };
  }, [values, kind, column]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-red-400">
        Failed to load: {error}
      </div>
    );
  }

  if (!values) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-900">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-2.5 py-1 text-[10px] text-zinc-600">
        <span>n = {n.toLocaleString()}</span>
        <span className="capitalize">{kind === "bar" ? "top values" : kind}</span>
      </div>
      <div className="min-h-0 flex-1">
        <Plot data={data} layout={layout} config={{ responsive: true, displaylogo: false }} style={{ width: "100%", height: "100%" }} useResizeHandler />
      </div>
    </div>
  );
}
