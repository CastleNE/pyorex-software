/**
 * Drop-in replacement for `react-plotly.js`'s default export that applies the
 * active PyOrex theme (lib/chart-theme.ts) to every chart. Import this instead
 * of `react-plotly.js` in components.
 */
import { useMemo } from "react";
import Plot from "react-plotly.js";
import type { PlotParams } from "react-plotly.js";
import { readChartTheme, themeData, themeLayout } from "@/lib/chart-theme";
import { useThemeStore } from "@/stores/theme-store";

export function useChartTheme() {
  const theme = useThemeStore((s) => s.theme);
  // Re-read the CSS tokens whenever the theme flips.
  return useMemo(() => readChartTheme(), [theme]);
}

export default function ThemedPlot(props: PlotParams) {
  const chart = useChartTheme();
  const layout = useMemo(() => themeLayout(props.layout, chart), [props.layout, chart]);
  const data = useMemo(() => themeData(props.data, chart), [props.data, chart]);
  return <Plot {...props} data={data} layout={layout} />;
}
