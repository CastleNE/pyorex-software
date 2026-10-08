import { expect, it } from "vitest";
import { readPersistedTheme, THEME_STORAGE_KEY } from "./theme-store";

const storage = (value: string | null) => ({ getItem: (k: string) => (k === THEME_STORAGE_KEY ? value : null) });

it("defaults to dark when nothing is stored", () => {
  expect(readPersistedTheme(storage(null))).toBe("dark");
  expect(readPersistedTheme(undefined)).toBe("dark");
});
it("reads the persisted light theme", () => {
  expect(readPersistedTheme(storage(JSON.stringify({ state: { theme: "light" }, version: 0 })))).toBe("light");
});
it("falls back to dark on corrupt or unknown values", () => {
  expect(readPersistedTheme(storage("{not json"))).toBe("dark");
  expect(readPersistedTheme(storage(JSON.stringify({ state: { theme: "sepia" } })))).toBe("dark");
});
