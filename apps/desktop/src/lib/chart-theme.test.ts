import { expect, it } from "vitest";
import { DARK_CHART_THEME, spliceShapes, themeData, themeLayout, type ChartTheme } from "./chart-theme";

const LIGHT: ChartTheme = { ...DARK_CHART_THEME, bg: "#ffffff", grid: "#e1e5ea", font: "#36404b", legend: "#f5f7f9", neutral: "#5f6b77", field: "#9aa7b4" };

it("remaps the legacy zinc palette used by existing chart builders", () => {
  const out = themeLayout(
    { paper_bgcolor: "#18181b", plot_bgcolor: "#18181b", font: { color: "#d4d4d8", size: 11 }, xaxis: { gridcolor: "#3f3f46" }, ternary: { bgcolor: "#18181b" } },
    LIGHT
  ) as Record<string, any>;
  expect(out.paper_bgcolor).toBe("#ffffff");
  expect(out.xaxis.gridcolor).toBe("#e1e5ea");
  expect(out.font).toEqual({ color: "#36404b", size: 11, family: DARK_CHART_THEME.fontFamily });
  expect(out.ternary.bgcolor).toBe("#ffffff");
});
it("fills base colours when a layout sets none and keeps explicit non-legacy colours", () => {
  const out = themeLayout({ annotations: [{ font: { color: "#e69f00" } }] }, LIGHT) as Record<string, any>;
  expect(out.paper_bgcolor).toBe("#ffffff");
  expect(out.annotations[0].font.color).toBe("#e69f00");
});
it("remaps neutral greys in trace data only", () => {
  const data = themeData([{ line: { color: "#a1a1aa" }, marker: { color: "#0072b2" } }], LIGHT);
  expect(data[0].line.color).toBe("#5f6b77");
  expect(data[0].marker.color).toBe("#0072b2");
});
it("only returns splice shapes inside the plotted range", () => {
  expect(spliceShapes(1300, 2500, LIGHT).map((s) => s.x0)).toEqual([1800]);
  expect(spliceShapes(350, 2500, LIGHT)).toHaveLength(2);
  expect(spliceShapes(2000, 2500, LIGHT)).toHaveLength(0);
});
it("maps legacy classification-field lines to the field colour", () => {
  expect(themeData([{ line: { color: "#52525b" } }], LIGHT)[0].line.color).toBe("#9aa7b4");
});
