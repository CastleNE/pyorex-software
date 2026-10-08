/**
 * Geoquímica shell: area ribbon (Datos y análisis · Litogeoquímica · Exploración mineral · Secciones y mapas), the
 * contextual rail/flyouts and a status bar around the existing workspaces. The workspaces themselves (Workbench,
 * DataAnalysisWorkspace, ExplorationWorkspace) are unchanged in behavior; the ribbon only decides which one is shown.
 */
import { usePlanStore } from "@/stores/plan-store";
import { useEffect } from "react";
import { useDatasetStore } from "@/stores/dataset-store";
import { useAppStore } from "@/stores/app-store";
import { useShellStore, legacyTarget } from "@/stores/shell-store";
import { useGeoRegistryStore } from "@/stores/geochemistry-registry-store";
import { WORKBENCH_GROUP } from "@/lib/geochem-areas";
import { useT, useLangStore } from "@/lib/i18n";
import { useGeoWindows } from "@/stores/geo-windows-store";
import PxIcon from "@/components/PxIcon";
import DataAnalysisWorkspace from "@/components/geochemistry/DataAnalysisWorkspace";
import MapWorkspace from "@/components/maps/MapWorkspace";
import Workbench from "@/components/geochemistry/Workbench";
import ExplorationWorkspace from "@/components/geochemistry/ExplorationWorkspace";
import GeoRibbon from "@/components/geochemistry/GeoRibbon";
import { GeoFlyout, GeoRail } from "@/components/geochemistry/GeoRail";

export default function GeochemistryScreen({ onOpenData }: { onOpenData: () => void }) {
  const dataset = useDatasetStore((s) => s.dataset);
  const activeModuleId = useAppStore((s) => s.activeModuleId);
  const area = useShellStore((s) => s.area), view = useShellStore((s) => s.views[s.area]);
  const fly = useShellStore((s) => s.fly), pinned = useShellStore((s) => s.flyPin);
  const { openView } = useShellStore.getState();

  // Legacy deep links (e.g. "Abrir en visualización", post-import navigation) still arrive as app-store module ids.
  useEffect(() => {
    if (!activeModuleId) return;
    const target = legacyTarget(activeModuleId);
    if (target) openView(target.view, target.area);
    useAppStore.getState().setActiveModuleId(null);
  }, [activeModuleId, openView]);

  // Esc closes a floating (unpinned) flyout.
  useEffect(() => {
    if (!fly || pinned) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") useShellStore.getState().setFly(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fly, pinned]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <GeoRibbon />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <GeoRail />
        {pinned && <GeoFlyout onOpenData={onOpenData} docked />}
        <div key={dataset?.id ?? "no-dataset"} className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {view.kind === "tool" && <Workbench group={WORKBENCH_GROUP[area]} area={area} request={view} ribbon onOpenData={onOpenData} />}
          {view.kind === "data" && (
            <DataAnalysisWorkspace onOpenData={onOpenData} active={view.action} onSelect={(action) => openView({ kind: "data", action })} />
          )}
          {view.kind === "explore" && <ExplorationWorkspace onOpenData={onOpenData} active={view.tool} />}
          {view.kind === "map" && <MapWorkspace />}
          {!pinned && <GeoFlyout onOpenData={onOpenData} docked={false} />}
        </div>
      </div>
      <GeoStatusBar />
    </div>
  );
}

function GeoStatusBar() {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const dataset = useDatasetStore((s) => s.dataset);
  const registry = useGeoRegistryStore((s) => s.registry), error = useGeoRegistryStore((s) => s.error);
  const status = registry ? "online" : error ? "offline" : "unknown";
  const crs = dataset?.spatialConfig?.projected_epsg;
  const plan = usePlanStore((s) => s.plan);
  const fmt = (n: number) => n.toLocaleString(lang === "es" ? "es-CL" : "en-US");
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 text-[11px] text-muted">
      <span className="flex items-center gap-1.5" title={error ?? undefined}>
        <i className={`h-[7px] w-[7px] rounded-full ${status === "online" ? "bg-success" : status === "offline" ? "bg-danger" : "bg-subtle"}`} />
        {t(status === "online" ? "serviceOnline" : status === "offline" ? "serviceOffline" : "serviceUnknown")}
      </span>
      {plan && (plan.plan !== "full" || plan.max_rows) && <span className="font-medium text-accent-fg">{plan.label}{plan.max_rows ? ` · ${t("planRows").replace("{n}", fmt(plan.max_rows))}` : ""}</span>}
      {dataset ? (
        <>
          <span className="truncate text-fg">{dataset.name}</span>
          <span className="tabular font-mono">{fmt(dataset.rowCount)} {t("samples")} · {fmt(dataset.columnCount)} {t("columns")}</span>
          <span className={crs ? "font-mono" : ""}>{crs ?? t("noCrs")}</span>
        </>
      ) : (
        <span>{t("noDataset")}</span>
      )}
      <SelectionChip />
    </footer>
  );
}

function SelectionChip() {
  const t = useT();
  const n = useGeoWindows((s) => s.selection.size), isolate = useGeoWindows((s) => s.isolate);
  if (!n) return null;
  return (
    <span className="ml-auto flex items-center gap-1.5 rounded-full border border-accent px-2 py-px text-accent-fg">
      <i className="h-[7px] w-[7px] rounded-full bg-accent" />
      {t("selectionCount").replace("{n}", String(n))}{isolate ? ` · ${t("isolated")}` : ""}
      <button onClick={() => useGeoWindows.getState().clearSelection()} title={t("clearSel")} aria-label={t("clearSel")} className="rounded hover:text-fg">
        <PxIcon name="close" className="h-3 w-3" />
      </button>
    </span>
  );
}
