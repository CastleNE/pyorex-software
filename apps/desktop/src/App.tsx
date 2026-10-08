import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/app-store";
import type { AppNav } from "@/stores/app-store";
import { useDatasetStore } from "@/stores/dataset-store";
import type { ImportedDatasetMeta } from "@/lib/data-api";
import { listDatasets } from "@/lib/data-api";
import { toDatasetInfo } from "@/lib/dataset-mapping";
import ImportWizard from "@/components/ImportWizard";
import ModuleGroupScreen from "@/components/ModuleGroupScreen";
import GeochemistryScreen from "@/components/GeochemistryScreen";
import PyOrexLogo from "@/components/PyOrexLogo";
import { MODULE_GROUPS } from "@/lib/modules-registry";
import { useThemeStore } from "@/stores/theme-store";
import { useLangStore, useT, type Lang, type TKey } from "@/lib/i18n";
import PxIcon from "@/components/PxIcon";
import { ImportHub, ProjectDialogs, type ImportKind } from "@/components/ProjectDialogs";
import { useProject } from "@/stores/project-store";
import { fileOf, folderOf } from "@/lib/recent-projects";
import { useSpectrometryStore } from "@/stores/spectrometry-store";
import { hasFeature, hasModule, usePlanAllows, usePlanStore } from "@/stores/plan-store";

// ── Nav config ─────────────────────────────────────────────────────────────────
// Module groups (Geochemistry / Espectrometría / Petrofísica / …) are top-level
// tabs, sandwiched between Data and View — new groups added to
// modules-registry.ts show up here automatically.

const NAV_ITEMS: { id: AppNav; label: TKey }[] = [
  { id: "geochemistry", label: "geochemistry" },
  { id: "espectrometria", label: "spectrometry" },
  { id: "petrofisica", label: "petrophysics" },
];

// ── App Shell ─────────────────────────────────────────────────────────────────

export default function App() {

  const { activeNav, setActiveNav } = useAppStore();
  const { theme, toggleTheme } = useThemeStore();
  const { setDataset, setAllDatasets } = useDatasetStore();
  const t = useT();
  const { lang, setLang } = useLangStore();
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  // Edition enforced by the engine (demo web, Pro, Completo…): the interface only reflects it.
  useEffect(() => { void usePlanStore.getState().load(); }, []);
  const plan = usePlanStore((s) => s.plan);

  // Load existing datasets from disk on startup
  useEffect(() => {
    listDatasets()
      .then(({ datasets }) => {
        if (datasets.length === 0) return;
        setAllDatasets(datasets.map(toDatasetInfo));
      })
      .catch(() => {
        // Service not yet running — ignore silently
      });
  }, [setAllDatasets]);

  // Import wizard state
  const [importFilePath, setImportFilePath] = useState<string | null>(null);
  const [importHub, setImportHub] = useState(false);

  // Project shortcuts: Ctrl+S save, Ctrl+Shift+S save as, Ctrl+O open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); void useProject.getState().save(e.shiftKey); }
      else if (k === "o" && !e.shiftKey) { e.preventDefault(); void useProject.getState().open(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleImportKind(kind: ImportKind) {
    if (kind === "geo") void handleOpenData();
    else if (kind === "project") void useProject.getState().open();
    else { useSpectrometryStore.getState().requestImport(kind); setActiveNav("espectrometria"); useAppStore.getState().setActiveModuleId("spectrometry"); }
  }

  async function handleOpenData() {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "Geochemical data", extensions: ["csv", "xlsx", "xls", "xlsm"] },
        { name: "CSV", extensions: ["csv"] },
        { name: "Excel", extensions: ["xlsx", "xls", "xlsm"] },
      ],
    });
    if (typeof selected === "string") {
      setImportFilePath(selected);
    }
  }

  function handleImported(meta: ImportedDatasetMeta) {
    setImportFilePath(null);
    setDataset(toDatasetInfo(meta));
    useProject.getState().include(meta.id);
    // Navigate to Data after importing
    setActiveNav("data");
  }

  return (
    <div className="flex flex-col h-screen bg-app text-fg overflow-hidden">
      {/* ── Header: brand · module tabs · theme ── */}
      <nav
        className="flex h-10 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-white/5 bg-header pr-2 text-header-muted"
        data-tauri-drag-region
      >
        <div className="flex shrink-0 items-center pl-3 pr-4 text-header-fg">
          <PyOrexLogo size={20} />
        </div>

        <FileMenu onImport={() => setImportHub(true)} />

        {NAV_ITEMS.map((item) => {
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              aria-current={active ? "page" : undefined}
              className={`relative px-4 text-[13px] font-medium tracking-wide transition-colors ${
                active ? "text-header-fg" : "text-header-muted hover:text-header-fg"
              }`}
            >
              {t(item.label).toUpperCase()}
              {active && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-accent" />}
            </button>
          );
        })}

        {hasFeature(plan, "projects") && <ProjectTitle />}

        <LangToggle lang={lang} setLang={setLang} label={t("language")} />

        <button
          onClick={toggleTheme}
          title={theme === "dark" ? t("themeToLight") : t("themeToDark")}
          aria-label={theme === "dark" ? t("themeToLight") : t("themeToDark")}
          className="my-auto flex h-7 w-7 items-center justify-center rounded text-header-muted transition-colors hover:bg-white/10 hover:text-header-fg"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </nav>

      {/* ── Screen Router ── */}
      {activeNav === "geochemistry" && <GeochemistryScreen onOpenData={handleOpenData} />}
      {MODULE_GROUPS.filter((group) => group.id !== "geochemistry").map(
        (group) =>
          activeNav === group.id && (group.id === "espectrometria" && !hasModule(plan, "spectrometry")
            ? <LockedModule key={group.id} label={plan?.label ?? ""} />
            : <ModuleGroupScreen key={group.id} group={group} onOpenData={handleOpenData} />)
      )}

      {importHub && <ImportHub onPick={handleImportKind} onClose={() => setImportHub(false)} />}
      <ProjectDialogs />

      {/* ── Import Wizard Modal ── */}
      {importFilePath && (
        <ImportWizard
          filePath={importFilePath}
          onImported={handleImported}
          onCancel={() => setImportFilePath(null)}
        />
      )}
    </div>
  );
}

/** Header centre: current project name and whether it has unsaved changes. */
function ProjectTitle() {
  const t = useT();
  const name = useProject((s) => s.name), path = useProject((s) => s.path), dirty = useProject((s) => s.dirty);
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-3 text-[12px] text-header-muted" data-tauri-drag-region title={path ?? undefined}>
      <b className="truncate font-semibold text-header-fg" data-tauri-drag-region>{name ? `${name}.orex` : t("untitled")}</b>
      {(dirty || name) && <span className="shrink-0" data-tauri-drag-region>· {dirty ? t("unsaved") : t("savedState")}</span>}
      {dirty && <i className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden />}
    </div>
  );
}

/** Archivo: project (.orex), unified import, language and theme. */
function FileMenu({ onImport }: { onImport: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const { lang, setLang } = useLangStore();
  const { theme, toggleTheme } = useThemeStore();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", close); };
  }, [open]);
  const item = "flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-[12.5px] text-fg hover:bg-hover";
  const projects = usePlanAllows("feature", "projects");
  const recent = useProject((s) => s.recent);
  return (
    <div ref={ref} className="relative flex">
      <button
        onClick={(e) => { setLeft(e.currentTarget.getBoundingClientRect().left); setOpen(!open); }}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`my-1.5 rounded px-3 text-[13px] font-semibold transition-colors ${open ? "bg-accent text-on-accent" : "bg-white/10 text-header-fg hover:bg-white/15"}`}
      >
        {t("file")}
      </button>
      {open && (
        // Fixed: the header scrolls horizontally, which would clip an absolutely positioned menu.
        <div role="menu" style={{ left }} className="fixed top-10 z-50 mt-1 w-72 rounded-md border border-line-strong bg-panel p-1 shadow-2xl">
          <button role="menuitem" className={item} onClick={() => { setOpen(false); void useProject.getState().newProject(); }}>
            <PxIcon name="plus" className="h-4 w-4 text-muted" /><span className="flex-1">{t("newProject")}</span>
          </button>
          <button role="menuitem" disabled={!projects} title={projects ? undefined : t("planNoProjects")} className={`${item} disabled:opacity-40`} onClick={() => { setOpen(false); void useProject.getState().open(); }}>
            <PxIcon name="project" className="h-4 w-4 text-muted" /><span className="flex-1">{t("openProject")}</span><kbd className="text-[11px] text-subtle">Ctrl O</kbd>
          </button>
          {projects && recent.length > 0 && <div className="mb-1 mt-0.5">
            <p className="px-2.5 pb-0.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-subtle">{t("recentProjects")}</p>
            {recent.map((r) => (
              <div key={r.path} className="group flex items-center rounded hover:bg-hover">
                <button role="menuitem" title={r.path} className="flex min-w-0 flex-1 flex-col px-2.5 py-1 pl-[2.1rem] text-left" onClick={() => { setOpen(false); void useProject.getState().open(r.path); }}>
                  <span className="truncate text-[12.5px] text-fg">{fileOf(r.path)}</span>
                  <span className="truncate text-[11px] text-subtle">{folderOf(r.path)}</span>
                </button>
                <button aria-label={`${t("forgetRecent")}: ${fileOf(r.path)}`} title={t("forgetRecent")} onClick={() => useProject.getState().forgetRecent(r.path)} className="mr-1 hidden rounded p-1 text-subtle hover:bg-raised hover:text-fg group-hover:block focus:block">
                  <PxIcon name="close" className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>}
          <button role="menuitem" disabled={!projects} title={projects ? undefined : t("planNoProjects")} className={`${item} disabled:opacity-40`} onClick={() => { setOpen(false); void useProject.getState().save(); }}>
            <PxIcon name="export" className="h-4 w-4 text-muted" /><span className="flex-1">{t("saveProject")}</span><kbd className="text-[11px] text-subtle">Ctrl S</kbd>
          </button>
          <button role="menuitem" disabled={!projects} title={projects ? undefined : t("planNoProjects")} className={`${item} disabled:opacity-40`} onClick={() => { setOpen(false); void useProject.getState().save(true); }}>
            <PxIcon name="copy" className="h-4 w-4 text-muted" /><span className="flex-1">{t("saveProjectAs")}</span>
          </button>
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" className={item} onClick={() => { setOpen(false); onImport(); }}>
            <PxIcon name="import" className="h-4 w-4 text-muted" />{t("importData")}
          </button>
          <div className="my-1 h-px bg-line" />
          <div className="flex items-center gap-2.5 px-2.5 py-1.5 text-[12.5px] text-fg">
            <span className="flex-1">{t("language")}</span>
            {(["es", "en"] as Lang[]).map((l) => (
              <button key={l} role="menuitemradio" aria-checked={lang === l} onClick={() => setLang(l)}
                className={`rounded px-2 py-0.5 text-[11.5px] font-semibold ${lang === l ? "bg-accent-soft text-accent-fg" : "text-muted hover:bg-hover"}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button role="menuitem" className={item} onClick={toggleTheme}>
            <span className="flex h-4 w-4 items-center justify-center text-muted">{theme === "dark" ? <SunIcon /> : <MoonIcon />}</span>
            <span className="flex-1">{t("theme")}</span>
            <span className="text-[11.5px] text-subtle">{theme === "dark" ? t("dark") : t("light")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function LangToggle({ lang, setLang, label }: { lang: Lang; setLang: (l: Lang) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="my-auto mr-1 flex overflow-hidden rounded border border-white/15">
      {(["es", "en"] as Lang[]).map((l) => (
        <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}
          className={`px-2 py-0.5 text-[11px] font-semibold transition-colors ${lang === l ? "bg-white/15 text-header-fg" : "text-header-muted hover:text-header-fg"}`}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden="true">
      <path d="M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5z" />
    </svg>
  );
}

/** A module the active edition does not include: say so plainly instead of hiding it or failing later. */
function LockedModule({ label }: { label: string }) {
  const t = useT();
  return <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
    <PxIcon name="spectrum" className="h-9 w-9 text-subtle" />
    <p className="text-[14px] font-semibold text-fg">{t("planLockedTitle")}</p>
    <p className="max-w-md text-[12.5px] text-muted">{t("planLockedBody").replace("{plan}", label)}</p>
  </div>;
}
