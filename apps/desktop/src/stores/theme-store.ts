import { create } from "zustand";
import { persist } from "zustand/middleware";

/** UI theme. Dark is the product default (ADR-0007); light is opt-in. */
export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "pyorex-theme";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      // The attribute is applied synchronously (not in an effect) so charts that
      // re-read CSS tokens during the same render already see the new theme.
      setTheme: (theme) => {
        applyThemeToDocument(theme);
        set({ theme });
      },
      toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
    }),
    { name: THEME_STORAGE_KEY }
  )
);

/** Reflects the theme on <html data-theme>. Dark = no attribute (CSS default). */
export function applyThemeToDocument(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
}

/** Reads the persisted theme synchronously (before React mounts) to avoid a flash. */
export function readPersistedTheme(storage: Pick<Storage, "getItem"> | undefined): Theme {
  try {
    const raw = storage?.getItem(THEME_STORAGE_KEY);
    const theme = raw ? (JSON.parse(raw) as { state?: { theme?: unknown } }).state?.theme : undefined;
    return theme === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
