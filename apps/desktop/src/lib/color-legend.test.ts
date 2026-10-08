import { expect, it } from "vitest";
import { classOf, colorLegendStats } from "./color-legend";

it("uses five equal intervals with the maximum in the top class (same rule as the chart)", () => {
  expect(classOf(0, 0, 10)).toBe(0);
  expect(classOf(1.99, 0, 10)).toBe(0);
  expect(classOf(2, 0, 10)).toBe(1);
  expect(classOf(10, 0, 10)).toBe(4);
  expect(classOf(5, 5, 5)).toBe(2);
});
it("counts values per class and per bin and reports missing values", () => {
  const stats = colorLegendStats([0, 1, 2, 3, 9, 10, null, Number.NaN], 10)!;
  expect(stats.classCounts).toEqual([2, 2, 0, 0, 2]);
  expect(stats.missing).toBe(2);
  expect(stats.bins.reduce((n, b) => n + b.count, 0)).toBe(6);
  expect(stats.bins[9].count).toBe(2); // 9 and 10 (top edge inclusive)
});
it("returns null without finite values and one bin for a constant column", () => {
  expect(colorLegendStats([null, undefined])).toBeNull();
  expect(colorLegendStats([4, 4, 4])!.bins).toHaveLength(1);
});
