/**
 * «Perfil de columnas»: one card per column of the rows the grid shows (same filters and selection), with its
 * distribution, completeness and data issues — the first thing a geochemist checks before plotting. The numbers
 * come from the Python engine (data.profile); this component only draws them. Clicking a card selects that column
 * in the grid (sort, rename, convert… act on it).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import PxIcon from "@/components/PxIcon";
import { getProfile, type ColumnProfile, type DataProfile } from "@/lib/data-api";
import { useL, type Txt } from "@/lib/i18n";
import { useDataOpsStore } from "@/stores/data-ops-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { useGeoWindows } from "@/stores/geo-windows-store";
import { useGridView } from "@/stores/grid-view-store";
import { useColumnRoles, useDatasetRoles } from "@/stores/column-roles-store";
import { columnIssues, fmtNum, hasIssues, histogramMarker, roleChip, unitLabel } from "@/lib/column-profile";

type Kind = "all" | "numeric" | "text" | "issues";
const KINDS: { id: Kind; label: Txt }[] = [
  { id: "all", label: { es: "Todas", en: "All" } },
  { id: "numeric", label: { es: "Numéricas", en: "Numeric" } },
  { id: "text", label: { es: "Texto", en: "Text" } },
  { id: "issues", label: { es: "Con avisos", en: "With issues" } },
];

/** Loads the profile of the rows the grid currently shows; stale answers are dropped. */
export function useColumnProfile(datasetId: string | undefined) {
  const view = useDataOpsStore((s) => (datasetId ? s.getView(datasetId) : null));
  const version = useDataOpsStore((s) => (datasetId ? s.getVersion(datasetId) : 0));
  const onlySelection = useGridView((s) => s.onlySelection);
  const linked = useGeoWindows((s) => s.datasetId === datasetId);
  const selection = useGeoWindows((s) => s.selection);
  const onlyRows = onlySelection && linked && selection.size ? [...selection] : null;
  const onlyKey = onlyRows ? `${onlyRows.length}:${onlyRows.slice(0, 64).join(",")}` : "";
  const [profile, setProfile] = useState<DataProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    if (!datasetId || !view) return;
    const id = ++request.current;
    setLoading(true);
    const timer = setTimeout(() => {
      getProfile(datasetId, { filters: view.filters, combinator: view.filterCombinator, onlyRows })
        .then((p) => { if (id === request.current) { setProfile(p); setError(null); } })
        .catch((e) => { if (id === request.current) setError(e instanceof Error ? e.message : String(e)); })
        .finally(() => { if (id === request.current) setLoading(false); });
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, view?.filters, view?.filterCombinator, version, onlyKey]);
  useEffect(() => { setProfile(null); }, [datasetId]);
  return { profile, error, loading, onlySelection: !!onlyRows };
}

export default function ColumnProfileStrip({ profile, error, loading }: { profile: DataProfile | null; error: string | null; loading: boolean }) {
  const L = useL();
  const dataset = useDatasetStore((s) => s.dataset);
  const selectedColumn = useDatasetStore((s) => s.selectedColumn);
  const setSelectedColumn = useDatasetStore((s) => s.setSelectedColumn);
  const roles = useDatasetRoles(dataset?.id);
  const open = useGridView((s) => s.profileOpen), setOpen = useGridView((s) => s.setProfileOpen);
  const [kind, setKind] = useState<Kind>("all");
  const [query, setQuery] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { if (dataset?.id) void useColumnRoles.getState().load(dataset.id); }, [dataset?.id]);

  const columns = profile?.columns ?? [];
  const issueCount = useMemo(() => columns.filter(hasIssues).length, [columns]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return columns.filter((c) =>
      (!q || c.name.toLowerCase().includes(q)) &&
      (kind === "all" || (kind === "numeric" ? c.kind === "numeric" : kind === "text" ? c.kind !== "numeric" : hasIssues(c))));
  }, [columns, kind, query]);

  // The selected column's card is kept in view (it may have been picked in the grid).
  useEffect(() => {
    const box = scroller.current;
    if (!box || !selectedColumn) return;
    const card = box.querySelector<HTMLElement>(`[data-col="${CSS.escape(selectedColumn)}"]`);
    if (card && (card.offsetLeft < box.scrollLeft || card.offsetLeft + card.offsetWidth > box.scrollLeft + box.clientWidth)) {
      box.scrollTo({ left: Math.max(0, card.offsetLeft - 12), behavior: "smooth" });
    }
  }, [selectedColumn, shown]);

  if (!dataset) return null;
  return (
    <section className="shrink-0 border-b border-line bg-panel" aria-label={L({ es: "Perfil de columnas", en: "Column profile" })}>
      <header className="flex h-9 items-center gap-3 px-3">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted hover:text-fg">
          <span className={`text-[9px] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
          {L({ es: "Perfil de columnas", en: "Column profile" })}
        </button>
        <span className="text-[11.5px] text-subtle">
          <span className="tabular font-mono text-muted">{shown.length}</span>{shown.length !== columns.length && <> {L({ es: "de", en: "of" })} <span className="tabular font-mono">{columns.length}</span></>} {L({ es: "columnas", en: "columns" })}
          {loading && <span className="ml-2 inline-block h-2.5 w-2.5 animate-spin rounded-full border border-accent border-t-transparent align-middle" aria-label={L({ es: "Calculando", en: "Computing" })} />}
        </span>
        {open && <>
          <div className="ml-auto flex items-center rounded-md border border-line bg-app p-0.5" role="radiogroup" aria-label={L({ es: "Tipo de columna", en: "Column type" })}>
            {KINDS.map((k) => (
              <button key={k.id} role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}
                className={`rounded px-2 py-0.5 text-[11.5px] ${kind === k.id ? "bg-accent-soft font-medium text-accent-fg" : "text-muted hover:text-fg"}`}>
                {L(k.label)}{k.id === "issues" && issueCount > 0 && <span className="ml-1 tabular font-mono text-warning">{issueCount}</span>}
              </button>
            ))}
          </div>
          <label className="flex h-7 w-48 items-center gap-1.5 rounded-md border border-line bg-app px-2 text-subtle focus-within:border-accent">
            <PxIcon name="search" className="h-3.5 w-3.5 shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L({ es: "Buscar columna", en: "Find column" })}
              aria-label={L({ es: "Buscar columna", en: "Find column" })} className="min-w-0 flex-1 bg-transparent text-[12px] text-fg outline-none placeholder:text-subtle" />
          </label>
        </>}
      </header>
      {open && (
        <div ref={scroller} className="flex gap-2 overflow-x-auto px-3 pb-3 pt-0.5"
          onWheel={(e) => { if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
          {error && <p role="alert" className="py-6 text-xs text-danger">{L({ es: "No se pudo calcular el perfil", en: "Could not compute the profile" })}: <span className="select-text font-mono">{error}</span></p>}
          {!error && !profile && Array.from({ length: 8 }, (_, i) => <div key={i} className="h-[138px] w-[184px] shrink-0 animate-pulse rounded-lg border border-line bg-raised/50" />)}
          {!error && profile && shown.length === 0 && <p className="py-6 text-xs text-subtle">{L({ es: "Ninguna columna coincide.", en: "No column matches." })}</p>}
          {!error && profile && shown.map((c) => (
            <ProfileCard key={c.name} col={c} rows={profile.rows} chip={roleChip(roles?.[c.name]?.semantic_role, c.kind)} unit={unitLabel(roles?.[c.name]?.unit)}
              selected={c.name === selectedColumn} onSelect={() => setSelectedColumn(c.name)} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProfileCard({ col, rows, chip, unit, selected, onSelect }: { col: ColumnProfile; rows: number; chip: Txt; unit: string | null; selected: boolean; onSelect: () => void }) {
  const L = useL();
  const issues = columnIssues(col);
  const n = col.numeric;
  const tip = [
    col.name,
    `${L({ es: "Válidos", en: "Valid" })}: ${col.valid} / ${rows}`,
    ...(n ? [`${L({ es: "Mín", en: "Min" })} ${fmtNum(n.min)} · Q1 ${fmtNum(n.q1)} · ${L({ es: "Mediana", en: "Median" })} ${fmtNum(n.median)} · Q3 ${fmtNum(n.q3)} · ${L({ es: "Máx", en: "Max" })} ${fmtNum(n.max)}`,
      `${L({ es: "Media", en: "Mean" })} ${fmtNum(n.mean)} · σ ${fmtNum(n.std)}`] : []),
    `${L({ es: "Valores distintos", en: "Distinct values" })}: ${col.distinct}`,
    ...(n?.histogram.scale === "log10" ? [L({ es: "Histograma en escala log10", en: "Histogram on log10 scale" })] : []),
  ].join("\n");
  return (
    <button data-col={col.name} onClick={onSelect} title={tip} aria-pressed={selected}
      className={`flex h-[138px] w-[184px] shrink-0 flex-col rounded-lg border px-2.5 pb-2 pt-1.5 text-left transition-colors ${selected ? "border-accent bg-accent-soft/40" : "border-line bg-raised/60 hover:border-line-strong hover:bg-raised"}`}>
      <span className="flex w-full items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-fg">{col.name}</span>
        <span className="shrink-0 rounded bg-sunken px-1.5 py-px text-[10px] font-medium text-muted">{L(chip)}{unit && <span className="text-subtle"> · {unit}</span>}</span>
      </span>
      {n ? <NumericBody col={col} /> : <TextBody col={col} />}
      <Completeness col={col} rows={rows} />
      <span className="mt-1 flex h-4 w-full items-center gap-1 overflow-hidden">
        {issues.length === 0
          ? <span className="text-[10.5px] text-subtle">{col.valid === rows ? L({ es: "Completa", en: "Complete" }) : `${col.valid}/${rows}`}</span>
          : issues.map((i) => <span key={i.id} className={`shrink-0 rounded px-1 text-[10px] font-medium ${i.tone === "warn" ? "bg-warning/15 text-warning" : "bg-sunken text-muted"}`}>{L(i.label)}</span>)}
      </span>
    </button>
  );
}

function NumericBody({ col }: { col: ColumnProfile }) {
  const L = useL();
  const n = col.numeric!;
  const h = n.histogram;
  const max = Math.max(1, ...h.counts);
  const marker = histogramMarker(h, n.median);
  return (
    <>
      <span className="relative mt-1.5 block h-[38px] w-full">
        <svg viewBox={`0 0 ${h.counts.length} 1`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
          {h.counts.map((c, i) => c > 0 && <rect key={i} x={i + 0.08} width={0.84} y={1 - c / max} height={c / max} className="fill-accent" opacity={0.85} />)}
        </svg>
        {marker !== null && <span className="absolute -bottom-1 h-[46px] w-px bg-fg/70" style={{ left: `${marker * 100}%` }} aria-hidden />}
        {h.scale === "log10" && <span className="absolute right-0 top-0 rounded bg-panel/80 px-1 text-[9px] font-semibold uppercase text-subtle">log</span>}
      </span>
      <span className="mt-1 flex w-full items-baseline justify-between font-mono text-[10.5px] text-subtle">
        <span className="tabular">{fmtNum(n.min)}</span>
        <span className="tabular text-fg" title={L({ es: "Mediana", en: "Median" })}>{L({ es: "med", en: "med" })} {fmtNum(n.median)}</span>
        <span className="tabular">{fmtNum(n.max)}</span>
      </span>
    </>
  );
}

function TextBody({ col }: { col: ColumnProfile }) {
  const L = useL();
  const top = (col.top ?? []).slice(0, 3);
  const max = Math.max(1, ...top.map((t) => t.count));
  const rest = col.distinct - top.length;
  // Identifiers: every value is different, so the most frequent ones say nothing.
  if (col.valid > 3 && col.distinct === col.valid) return (
    <span className="mt-1.5 flex h-[53px] w-full flex-col justify-center gap-0.5">
      <span className="text-[12px] text-fg"><b className="tabular font-mono">{col.distinct}</b> {L({ es: "valores distintos", en: "distinct values" })}</span>
      <span className="truncate font-mono text-[10.5px] text-subtle">{top.map((t) => t.value).join(" · ")} …</span>
    </span>
  );
  return (
    <span className="mt-1.5 flex h-[53px] w-full flex-col justify-start gap-0.5">
      {top.length === 0 && <span className="text-[11px] text-subtle">{L({ es: "Sin valores", en: "No values" })}</span>}
      {top.map((t) => (
        <span key={t.value} className="flex items-center gap-1.5 text-[10.5px]">
          <span className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-sm bg-sunken">
            <span className="absolute inset-y-0 left-0 bg-accent/35" style={{ width: `${(t.count / max) * 100}%` }} />
            <span className="relative truncate px-1 text-fg">{t.value}</span>
          </span>
          <span className="tabular w-6 text-right font-mono text-subtle">{t.count}</span>
        </span>
      ))}
      {rest > 0 && <span className="text-[10px] text-subtle">+{rest} {L({ es: "valores más", en: "more values" })}</span>}
    </span>
  );
}

function Completeness({ col, rows }: { col: ColumnProfile; rows: number }) {
  const L = useL();
  const total = Math.max(1, rows);
  const parts = [
    { n: col.valid, cls: "bg-accent", label: L({ es: "válidos", en: "valid" }) },
    { n: col.below_lod, cls: "bg-warning", label: L({ es: "bajo el límite de detección", en: "below detection limit" }) },
    { n: col.not_analyzed, cls: "bg-line-strong", label: L({ es: "no analizados", en: "not analysed" }) },
    { n: col.missing, cls: "bg-danger", label: L({ es: "faltantes", en: "missing" }) },
  ].filter((p) => p.n > 0);
  return (
    <span className="mt-auto flex h-1.5 w-full overflow-hidden rounded-full bg-sunken" role="img"
      aria-label={parts.map((p) => `${p.n} ${p.label}`).join(", ")}>
      {parts.map((p) => <span key={p.cls} className={p.cls} style={{ width: `${(p.n / total) * 100}%` }} />)}
    </span>
  );
}
