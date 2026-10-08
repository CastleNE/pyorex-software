import { expect, it } from "vitest";
import { MINERAL_COLORS, mineralColor, mineralKey } from "./mineral-colors";

it("maps common TSG / EZ-ID names and Spanish names to mineral families", () => {
  expect(mineralKey("Illite")).toBe("illite");
  expect(mineralKey("Sericita")).toBe("illite");
  expect(mineralKey("Illite-Smectite")).toBe("illite");
  expect(mineralKey("Muscovite")).toBe("muscovite");
  expect(mineralKey("Kaolinite-WX")).toBe("kaolinite");
  expect(mineralKey("Montmorillonite")).toBe("montmorillonite");
  expect(mineralKey("Clorita")).toBe("chlorite");
  expect(mineralKey("FeMgChlorite")).toBe("chlorite");
  expect(mineralKey("Epidote")).toBe("epidote");
  expect(mineralKey("Ankerite")).toBe("carbonate");
  expect(mineralKey("Pirofilita")).toBe("pyrophyllite");
  expect(mineralKey("Unclassified")).toBe("none");
  expect(mineralKey(null)).toBe("none");
});
it("returns fixed colours for known minerals", () => {
  expect(mineralColor("Chlorite")).toBe(MINERAL_COLORS.chlorite);
  expect(mineralColor("Illite")).toBe(MINERAL_COLORS.illite);
});
it("gives unknown labels a stable fallback colour", () => {
  const map = new Map<string, string>();
  const a = mineralColor("Tourmaline", map);
  expect(mineralColor("Tourmaline", map)).toBe(a);
  expect(mineralColor("Jarosite", map)).not.toBe(a);
});
