/**
 * One-row toolbar of «Tabla y preparación»: what is on screen (rows shown, columns, quality warnings) on the left,
 * the preparation actions on the right. Column actions work on the column selected in the profile or the grid.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import PxIcon, { type PxIconName } from "@/components/PxIcon";
import type { WorkspaceAreaHandle } from "@/components/window-manager/types";
import CalculatedColumnWindow from "@/components/tool-windows/CalculatedColumnWindow";
import DataQualityWindow from "@/components/tool-windows/DataQualityWindow";
import FilterBuilderWindow from "@/components/tool-windows/FilterBuilderWindow";
import AppliedStepsWindow from "@/components/tool-windows/AppliedStepsWindow";
import QaqcPanel from "@/components/tool-windows/QaqcPanel";
import { getQualityReport, type DataProfile } from "@/lib/data-api";
import { toDatasetInfo } from "@/lib/dataset-mapping";
import { tx, useL } from "@/lib/i18n";
import { useDataOpsStore } from "@/stores/data-ops-store";
import { useDatasetStore } from "@/stores/dataset-store";

interface Props {
  workspaceRef: RefObject<WorkspaceAreaHandle | null>;
  profile: DataProfile | null;
  onlySelection: boolean;
}

/** Number of data-quality findings for the whole dataset (same count the Data Quality window lists). */
function useQualityCount(datasetId: string, version: number) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    setCount(null);
    if (!datasetId) return;
    getQualityReport(datasetId).then((r) => {
      if (!live) return;
      const c = r.checks;
      setCount(c.nulls.length + (c.duplicate_rows.count > 0 ? 1 : 0) + c.duplicate_column_names.length + c.constant_columns.length +
        c.mixed_type_columns.length + c.non_numeric_in_numeric.length + c.below_lod.length + c.outliers_iqr.length +
        (c.invalid_coordinates.checked && c.invalid_coordinates.invalid_count > 0 ? 1 : 0));
    }).catch(() => { if (live) setCount(null); });
    return () => { live = false; };
  }, [datasetId, version]);
  return count;
}

export default function DataToolbar({ workspaceRef, profile, onlySelection }: Props) {
  const L = useL();
  const { dataset, selectedColumn, setDataset } = useDatasetStore();
  const datasetId = dataset?.id ?? "";
  const view = useDataOpsStore((s) => s.getView(datasetId));
  const version = useDataOpsStore((s) => s.getVersion(datasetId));
  const overlay = useDataOpsStore((s) => s.getOverlay(datasetId));
  const ops = useDataOpsStore.getState();
  const quality = useQualityCount(datasetId, version);
  const [saving, setSaving] = useState(false);
  if (!dataset) return null;

  const pending = overlay?.ops.length ?? 0;
  const canRedo = (overlay?.redo_stack.length ?? 0) > 0;
  const total = profile?.total_rows ?? dataset.rowCount;
  const shown = profile?.rows ?? total;
  const open = (id: string, title: string, pos: { x: number; y: number; width: number; height: number }, render: () => ReactNode) =>
    workspaceRef.current?.openWindow({ id, title, icon: "", defaultPos: pos, render });

  const openQuality = () => open("data-quality", L({ es: "Calidad de datos", en: "Data quality" }), { x: 60, y: 24, width: 640, height: 460 }, () => <DataQualityWindow datasetId={datasetId} />);
  async function saveChanges() {
    setSaving(true);
    try { setDataset(toDatasetInfo(await ops.save(datasetId))); }
    catch (e) { console.error("Save changes failed:", e); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <div className="flex min-w-0 items-center gap-2">
        <PxIcon name="table" className="h-4 w-4 shrink-0 text-accent-fg" />
        <b className="truncate text-[13px] font-semibold text-fg" title={dataset.name}>{dataset.name}</b>
        <Chip>
          {shown === total
            ? <><b className="tabular font-mono text-fg">{total.toLocaleString()}</b> {L({ es: "filas", en: "rows" })}</>
            : <><b className="tabular font-mono text-accent-fg">{shown.toLocaleString()}</b> {L({ es: "de", en: "of" })} <span className="tabular font-mono">{total.toLocaleString()}</span> {onlySelection ? L({ es: "· selección", en: "· selection" }) : L({ es: "· filtradas", en: "· filtered" })}</>}
        </Chip>
        <Chip><b className="tabular font-mono text-fg">{profile?.columns.length ?? dataset.columnCount}</b> {L({ es: "columnas", en: "columns" })}</Chip>
        <button onClick={openQuality} title={L({ es: "Abrir el informe de calidad de datos", en: "Open the data quality report" })}
          className={`flex h-6 items-center gap-1 rounded-full border px-2 text-[11.5px] ${quality ? "border-warning/40 bg-warning/10 text-warning hover:bg-warning/20" : "border-line text-muted hover:bg-hover"}`}>
          <PxIcon name={quality ? "warn" : "check"} className="h-3.5 w-3.5" />
          {quality === null ? L({ es: "Calidad…", en: "Quality…" }) : quality ? L({ es: `${quality} avisos de calidad`, en: `${quality} quality warnings` }) : L({ es: "Sin avisos", en: "No warnings" })}
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Btn icon="filter" label={L({ es: "Filtro", en: "Filter" })} badge={view.filters.length || undefined}
          onClick={() => open("filter-builder", L({ es: "Filtro", en: "Filter" }), { x: 60, y: 24, width: 500, height: 420 }, () => <FilterBuilderWindow datasetId={datasetId} />)} />
        {view.filters.length > 0 && <IconBtn title={L({ es: "Quitar filtros", en: "Clear filters" })} onClick={() => ops.clearFilters(datasetId)}><PxIcon name="close" className="h-3.5 w-3.5" /></IconBtn>}
        <ColumnMenu datasetId={datasetId} column={selectedColumn} />
        <Btn icon="code" label={L({ es: "Columna calculada", en: "Calculated column" })}
          onClick={() => open("calculated-column", L({ es: "Columna calculada", en: "Calculated column" }), { x: 40, y: 20, width: 560, height: 420 },
            () => <CalculatedColumnWindow datasetId={datasetId} onClose={() => workspaceRef.current?.closeWindow("calculated-column")} />)} />
        <Btn icon="palette" label={L({ es: "Mapa de calor", en: "Heatmap" })} pressed={view.heatmap} onClick={() => ops.toggleHeatmap(datasetId)}
          title={L({ es: "Colorea las celdas numéricas según su valor en cada columna", en: "Colours numeric cells by their value within each column" })} />
        <Btn icon="check" label="QAQC" onClick={() => open("qaqc-panel", L({ es: "Resumen QAQC", en: "QAQC summary" }), { x: 20, y: 20, width: 820, height: 560 }, () => <QaqcPanel datasetId={datasetId} workspaceRef={workspaceRef} />)} />
        <span className="mx-1 h-5 w-px bg-line" />
        <IconBtn title={L({ es: "Deshacer", en: "Undo" })} disabled={!pending} onClick={() => ops.undo(datasetId)}>↶</IconBtn>
        <IconBtn title={L({ es: "Rehacer", en: "Redo" })} disabled={!canRedo} onClick={() => ops.redo(datasetId)}>↷</IconBtn>
        <IconBtn title={L({ es: "Pasos aplicados", en: "Applied steps" })}
          onClick={() => open("applied-steps", L({ es: "Pasos aplicados", en: "Applied steps" }), { x: 80, y: 40, width: 420, height: 460 }, () => <AppliedStepsWindow datasetId={datasetId} />)}>
          <PxIcon name="history" className="h-4 w-4" />
        </IconBtn>
        <IconBtn title={L({ es: "Volver a leer los datos", en: "Reload the data" })} onClick={() => ops.refresh(datasetId)}>⟳</IconBtn>
        <button disabled={!pending || saving} onClick={() => void saveChanges()}
          title={pending ? L({ es: `Guardar ${pending} cambio(s) en el dataset`, en: `Save ${pending} change(s) to the dataset` }) : L({ es: "No hay cambios por guardar", en: "No changes to save" })}
          className="ml-1 flex h-7 items-center gap-1.5 rounded-md bg-accent-strong px-2.5 text-[12px] font-semibold text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-raised disabled:font-normal disabled:text-subtle">
          <PxIcon name="export" className="h-3.5 w-3.5" />
          {saving ? L({ es: "Guardando…", en: "Saving…" }) : L({ es: "Guardar cambios", en: "Save changes" })}
          {pending > 0 && !saving && <span className="tabular rounded-full bg-on-accent/20 px-1.5 font-mono text-[10.5px]">{pending}</span>}
        </button>
      </div>
    </div>
  );
}

/** Actions on the selected column: sort, rename, convert type, hide, drop. */
function ColumnMenu({ datasetId, column }: { datasetId: string; column: string | null }) {
  const L = useL();
  const [mode, setMode] = useState<"closed" | "menu" | "rename" | "dtype">("closed");
  const [name, setName] = useState("");
  const [dtype, setDtype] = useState<"numeric" | "text" | "datetime">("numeric");
  const ref = useRef<HTMLDivElement>(null);
  const ops = useDataOpsStore.getState();
  useEffect(() => {
    if (mode === "closed") return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setMode("closed");
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", close); };
  }, [mode]);
  useEffect(() => setMode("closed"), [column]);
  const act = async (fn: () => unknown) => { await fn(); setMode("closed"); };
  const item = "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px] text-fg hover:bg-hover";
  const field = "h-7 w-full rounded border border-line-strong bg-raised px-2 text-xs text-fg focus:border-accent";
  return (
    <div ref={ref} className="relative">
      <Btn icon="sliders" label={column ? <>{L({ es: "Columna", en: "Column" })} <span className="max-w-28 truncate font-mono text-accent-fg">{column}</span></> : L({ es: "Columna", en: "Column" })}
        disabled={!column} caret pressed={mode !== "closed"} onClick={() => { setName(column ?? ""); setMode(mode === "closed" ? "menu" : "closed"); }}
        title={column ? undefined : L({ es: "Elige una columna en el perfil o en la tabla", en: "Pick a column in the profile or the table" })} />
      {mode !== "closed" && column && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-60 rounded-md border border-line-strong bg-panel p-1 shadow-2xl">
          {mode === "menu" && <>
            <button role="menuitem" className={item} onClick={() => act(() => ops.setSort(datasetId, { column, direction: "asc" }))}>▲ {L({ es: "Ordenar de menor a mayor", en: "Sort ascending" })}</button>
            <button role="menuitem" className={item} onClick={() => act(() => ops.setSort(datasetId, { column, direction: "desc" }))}>▼ {L({ es: "Ordenar de mayor a menor", en: "Sort descending" })}</button>
            <div className="my-1 h-px bg-line" />
            <button role="menuitem" className={item} onClick={() => setMode("rename")}>✎ {L({ es: "Renombrar…", en: "Rename…" })}</button>
            <button role="menuitem" className={item} onClick={() => setMode("dtype")}>⇄ {L({ es: "Convertir tipo…", en: "Convert type…" })}</button>
            <button role="menuitem" className={item} onClick={() => act(() => ops.applyOp(datasetId, { type: "hide_column", params: { column } }))}><PxIcon name="eye" className="h-3.5 w-3.5 text-muted" />{L({ es: "Ocultar", en: "Hide" })}</button>
            <button role="menuitem" className={`${item} text-danger`} onClick={() => {
              if (!window.confirm(tx({ es: `¿Eliminar la columna "${column}"? Se puede deshacer antes de Guardar cambios.`, en: `Drop column "${column}"? This can be undone before Save changes.` }))) return;
              void act(() => ops.applyOp(datasetId, { type: "drop_column", params: { column } }));
            }}><PxIcon name="close" className="h-3.5 w-3.5" />{L({ es: "Eliminar…", en: "Drop…" })}</button>
          </>}
          {mode === "rename" && <form className="space-y-2 p-2" onSubmit={(e) => { e.preventDefault(); if (name.trim() && name.trim() !== column) void act(() => ops.applyOp(datasetId, { type: "rename_column", params: { column, new_name: name.trim() } })); }}>
            <p className="text-[11.5px] text-muted">{L({ es: "Nuevo nombre de", en: "New name for" })} <span className="font-mono text-fg">{column}</span></p>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label={L({ es: "Nuevo nombre", en: "New name" })} className={field} />
            <button type="submit" className="h-7 w-full rounded bg-accent-strong text-xs font-semibold text-on-accent hover:bg-accent-hover">{L({ es: "Renombrar", en: "Rename" })}</button>
          </form>}
          {mode === "dtype" && <form className="space-y-2 p-2" onSubmit={(e) => { e.preventDefault(); void act(() => ops.applyOp(datasetId, { type: "change_dtype", params: { column, new_dtype: dtype, on_error: "null" } })); }}>
            <p className="text-[11.5px] text-muted">{L({ es: "Tipo de", en: "Type of" })} <span className="font-mono text-fg">{column}</span></p>
            <select value={dtype} onChange={(e) => setDtype(e.target.value as typeof dtype)} aria-label={L({ es: "Tipo de dato", en: "Data type" })} className={field}>
              <option value="numeric">{L({ es: "Numérico", en: "Numeric" })}</option>
              <option value="text">{L({ es: "Texto", en: "Text" })}</option>
              <option value="datetime">{L({ es: "Fecha", en: "Date" })}</option>
            </select>
            <p className="text-[11px] text-subtle">{L({ es: "Los valores que no se puedan convertir quedan vacíos.", en: "Values that cannot be converted become empty." })}</p>
            <button type="submit" className="h-7 w-full rounded bg-accent-strong text-xs font-semibold text-on-accent hover:bg-accent-hover">{L({ es: "Aplicar", en: "Apply" })}</button>
          </form>}
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-sunken px-2 text-[11.5px] text-muted">{children}</span>;
}

function Btn({ icon, label, onClick, disabled, pressed, badge, caret, title }: {
  icon: PxIconName; label: ReactNode; onClick: () => void; disabled?: boolean; pressed?: boolean; badge?: number; caret?: boolean; title?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={pressed} title={title}
      className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${pressed ? "bg-accent-soft text-accent-fg" : "text-fg enabled:hover:bg-hover"}`}>
      <PxIcon name={icon} className="h-3.5 w-3.5 shrink-0 text-muted" />
      <span className="flex items-center gap-1 whitespace-nowrap">{label}</span>
      {badge !== undefined && <span className="tabular rounded-full bg-accent px-1.5 font-mono text-[10px] text-on-accent">{badge}</span>}
      {caret && <span className="text-[9px] text-subtle">▾</span>}
    </button>
  );
}

function IconBtn({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded-md text-[14px] text-fg transition-colors enabled:hover:bg-hover disabled:cursor-not-allowed disabled:opacity-30">
      {children}
    </button>
  );
}
