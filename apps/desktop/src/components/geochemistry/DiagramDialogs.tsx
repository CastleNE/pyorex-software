/**
 * Diagram Builder and the user's diagram library (phase 4). The builder edits a DiagramDef (lib/custom-diagrams.ts):
 * name, where it appears (area + folder), XY or ternary, one free expression per axis checked live against the active
 * dataset by the Python service (`geochemistry.diagram_preview`), axis titles, log axes and classification fields
 * typed as vertices. Diagrams are drawn by the same engine pipeline as the built-in tools (tool 'custom-diagram').
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import PxIcon from '../PxIcon';
import { Modal } from '../ProjectDialogs';
import { useDiagramLibrary } from '../../stores/diagram-library-store';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import { useDatasetStore } from '../../stores/dataset-store';
import { useGeoWindows } from '../../stores/geo-windows-store';
import { useShellStore } from '../../stores/shell-store';
import { geoApi, type DiagramAxisPreview } from '../../lib/geochemistry-api';
import {
  DIAGRAM_AREAS, EXPRESSION_FUNCTIONS, TEMPLATES, adaptTemplate, blankDef, columnRef, formatVertices, libraryFile, newDiagramId, parseLibraryFile,
  parseVertices, type DiagramDef, type DiagramField,
} from '../../lib/custom-diagrams';
import { saveFile } from '../../lib/save-file';
import type { AreaId } from '../../lib/geochem-areas';
import { useT, type TKey } from '../../lib/i18n';

const field = 'h-8 rounded-md border border-line-strong bg-raised px-2.5 text-[12.5px] text-fg focus:border-accent focus:outline-none';
const btn = 'h-8 rounded-md px-3 text-[12.5px] font-medium disabled:opacity-40';
const label = 'flex flex-col gap-1 text-[11.5px] text-muted';
type Axis = 'x' | 'y' | 'z';

/** Opens a library diagram in its area (switching to that area). */
export function openLibraryDiagram(def: DiagramDef) {
  useShellStore.getState().setArea(def.area);
  useGeoWindows.getState().openDiagram(def.area, def);
}

export default function DiagramDialogs() {
  const dialog = useDiagramLibrary(s => s.dialog);
  if (dialog.mode === 'builder') return <Builder key={dialog.editing?.spec.id ?? 'new'} area={dialog.area} editing={dialog.editing} />;
  if (dialog.mode === 'library') return <Library />;
  return null;
}

interface FieldDraft { id: string; name: string; text: string }

function Builder({ area, editing }: { area: AreaId; editing: DiagramDef | null }) {
  const t = useT();
  const lib = useDiagramLibrary.getState();
  const close = () => lib.closeDialog();
  const dataset = useDatasetStore(s => s.dataset);
  const columns = useGeochemistryStore(s => s.columns);
  const numeric = columns.filter(c => c.numeric);
  const [def, setDef] = useState<DiagramDef>(() => editing ?? blankDef(area));
  const [fields, setFields] = useState<FieldDraft[]>(() => (editing?.spec.fields ?? []).map(f => ({ id: f.id, name: f.name, text: formatVertices(f.points) })));
  const [focus, setFocus] = useState<Axis>('x');
  const [preview, setPreview] = useState<Record<string, DiagramAxisPreview> | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const inputs = { x: useRef<HTMLInputElement>(null), y: useRef<HTMLInputElement>(null), z: useRef<HTMLInputElement>(null) };
  const spec = def.spec, ternary = spec.kind === 'ternary';
  const axes: Axis[] = ternary ? ['x', 'y', 'z'] : ['x', 'y'];
  const setSpec = (patch: Partial<DiagramDef['spec']>) => setDef(d => ({ ...d, spec: { ...d.spec, ...patch } }));
  const exprOf = (a: Axis) => (a === 'z' ? spec.z ?? '' : spec[a]);

  // Live check of the expressions against the active dataset (debounced).
  const key = axes.map(exprOf).join('\u0001');
  useEffect(() => {
    if (!dataset) { setPreview(null); return; }
    const expressions = Object.fromEntries(axes.map(a => [a, exprOf(a)]).filter(([, e]) => e.trim()));
    if (!Object.keys(expressions).length) { setPreview(null); return; }
    let live = true;
    const id = setTimeout(() => {
      geoApi.diagramPreview(dataset.id, expressions).then(r => { if (live) { setPreview(r.axes); setPreviewError(null); } })
        .catch(e => { if (live) setPreviewError(e instanceof Error ? e.message : String(e)); });
    }, 350);
    return () => { live = false; clearTimeout(id); };
  }, [key, dataset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const insert = (text: string) => {
    const el = inputs[focus].current, cur = exprOf(focus);
    const at = el?.selectionStart ?? cur.length, end = el?.selectionEnd ?? at;
    const next = cur.slice(0, at) + text + cur.slice(end);
    setSpec(focus === 'z' ? { z: next } : { [focus]: next });
    requestAnimationFrame(() => { el?.focus(); const p = at + text.length - (text.endsWith('()') ? 1 : 0); el?.setSelectionRange(p, p); });
  };
  const applyTemplate = (id: string) => {
    const tp = TEMPLATES.find(x => x.id === id); if (!tp) return;
    setDef(d => ({ ...d, area: tp.area, folder: d.folder || tp.folder, logX: !!tp.logX, logY: !!tp.logY,
      spec: { ...d.spec, name: d.spec.name || tp.name, kind: tp.kind, x: adaptTemplate(tp.x, columns), y: adaptTemplate(tp.y, columns), z: tp.z ? adaptTemplate(tp.z, columns) : null } }));
  };

  /** Fields typed as vertices → spec fields, or the first problem found. */
  const parsedFields = useMemo(() => {
    const out: DiagramField[] = [];
    for (const [k, f] of fields.entries()) {
      if (!f.name.trim() && !f.text.trim()) continue;
      const r = parseVertices(f.text, ternary ? 3 : 2);
      if ('badLine' in r) return { error: t('dg.err.vertexLine').replace('{field}', f.name || String(k + 1)).replace('{line}', String(r.badLine)) };
      if (r.points.length < 3) return { error: t('dg.err.vertices').replace('{field}', f.name || String(k + 1)) };
      if (!f.name.trim()) return { error: t('dg.err.fieldName').replace('{n}', String(k + 1)) };
      out.push({ id: f.id, name: f.name.trim(), points: r.points });
    }
    return { fields: out };
  }, [fields, t, ternary]);

  const build = (): DiagramDef | null => {
    if (!spec.name.trim()) { setProblem(t('dg.err.name')); return null; }
    if (axes.some(a => !exprOf(a).trim())) { setProblem(t(ternary ? 'dg.err.exprs3' : 'dg.err.exprs')); return null; }
    if ('error' in parsedFields) { setProblem(parsedFields.error ?? null); return null; }
    setProblem(null);
    return { ...def, logX: !ternary && def.logX, logY: !ternary && def.logY, folder: def.folder.trim(),
      spec: { ...spec, name: spec.name.trim(), x: spec.x.trim(), y: spec.y.trim(), z: ternary ? (spec.z ?? '').trim() : null, fields: parsedFields.fields ?? [],
        x_label: spec.x_label?.trim() || null, y_label: spec.y_label?.trim() || null, z_label: ternary ? spec.z_label?.trim() || null : null } };
  };
  const save = (open: boolean) => {
    const d = build(); if (!d) return;
    const stored = lib.save(d);
    useGeoWindows.getState().syncDiagram(stored);
    close();
    if (open) openLibraryDiagram(stored);
  };
  const axisName = (a: Axis) => (ternary ? t(`dg.axis.${a}3` as TKey) : t(`dg.axis.${a}` as TKey));
  const status = (a: Axis) => {
    const p = preview?.[a]; if (!exprOf(a).trim()) return null;
    if (!p) return <span className="text-subtle">…</span>;
    if (!p.ok) return <span role="alert" className="text-danger">{p.error}</span>;
    return <span className="text-success">{t('dg.valid').replace('{n}', String(p.n_valid)).replace('{min}', fmt(p.min)).replace('{max}', fmt(p.max))}{p.n_invalid ? <span className="text-warning"> · {t('dg.invalidN').replace('{n}', String(p.n_invalid))}</span> : null}</span>;
  };

  return <Modal title={editing ? t('dg.edit') : t('dg.new')} icon="code" onClose={close} width="w-[920px]">
    <div className="grid max-h-[72vh] grid-cols-[1.15fr_1fr] gap-5 overflow-auto pr-1">
      <div className="flex flex-col gap-3">
        {!editing && <label className={label}>{t('dg.template')}
          <select aria-label={t('dg.template')} className={field} value="" onChange={e => applyTemplate(e.target.value)}>
            <option value="">{t('dg.blank')}</option>
            {TEMPLATES.map(tp => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
          </select></label>}
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <label className={label}>{t('dg.name')}<input autoFocus aria-label={t('dg.name')} className={field} value={spec.name} onChange={e => setSpec({ name: e.target.value })} placeholder="Sr/Y vs Y" /></label>
          <div className={label}>{t('dg.type')}
            <div className="flex h-8 rounded-md bg-sunken p-0.5" role="group" aria-label={t('dg.type')}>{(['xy', 'ternary'] as const).map(k =>
              <button key={k} aria-pressed={spec.kind === k} onClick={() => setSpec({ kind: k, z: k === 'ternary' ? spec.z ?? '' : null })}
                className={`rounded px-3 text-[12px] ${spec.kind === k ? 'bg-raised font-semibold text-fg shadow-window' : 'text-muted hover:text-fg'}`}>{t(`dg.kind.${k}` as TKey)}</button>)}</div></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>{t('dg.area')}<select aria-label={t('dg.area')} className={field} value={def.area} onChange={e => setDef(d => ({ ...d, area: e.target.value as AreaId }))}>
            {DIAGRAM_AREAS.map(a => <option key={a} value={a}>{t(`area.${a}` as TKey)}</option>)}</select></label>
          <label className={label}>{t('dg.folder')}<input aria-label={t('dg.folder')} className={field} value={def.folder} onChange={e => setDef(d => ({ ...d, folder: e.target.value }))} placeholder={t('dg.folderHint')} /></label>
        </div>

        <div className="rounded-md border border-line p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
            <span>{t('dg.insertIn').replace('{axis}', axisName(focus))}</span>
            <select aria-label={t('dg.insertColumn')} className={`${field} h-7 max-w-[180px]`} value="" onChange={e => { if (e.target.value) insert(columnRef(e.target.value)); }}>
              <option value="">{t('dg.insertColumn')}</option>{numeric.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select>
            {EXPRESSION_FUNCTIONS.map(f => <button key={f} onClick={() => insert(`${f}()`)} className="h-7 rounded border border-line-strong px-2 font-mono text-[11.5px] text-fg hover:bg-hover">{f}( )</button>)}
            {['+', '−', '×', '/', '^'].map(o => <button key={o} onClick={() => insert({ '−': '-', '×': '*', '^': '**' }[o] ?? o)} className="h-7 w-7 rounded border border-line-strong font-mono text-[12px] text-fg hover:bg-hover">{o}</button>)}
          </div>
          {axes.map(a => <div key={a} className="mb-2.5 last:mb-0">
            <div className="grid grid-cols-[1.4fr_1fr] gap-2">
              <label className={label}>{axisName(a)}<input ref={inputs[a]} aria-label={`${t('dg.expr')} ${axisName(a)}`} spellCheck={false} onFocus={() => setFocus(a)}
                className={`${field} font-mono ${focus === a ? 'border-accent' : ''}`} value={exprOf(a)} placeholder={a === 'x' ? 'Y_ppm' : a === 'y' ? 'Sr_ppm / Y_ppm' : 'MgO_pct'}
                onChange={e => setSpec(a === 'z' ? { z: e.target.value } : { [a]: e.target.value })} /></label>
              <label className={label}>{t('dg.axisTitle')}<input aria-label={`${t('dg.axisTitle')} ${axisName(a)}`} className={field} value={(a === 'x' ? spec.x_label : a === 'y' ? spec.y_label : spec.z_label) ?? ''}
                placeholder={exprOf(a) || '—'} onChange={e => setSpec({ [`${a}_label`]: e.target.value || null })} /></label>
            </div>
            <p className="mt-1 min-h-[16px] text-[11px]">{status(a)}</p>
          </div>)}
          {!ternary && <div className="flex gap-4 text-[12px] text-muted">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={def.logX} onChange={e => setDef(d => ({ ...d, logX: e.target.checked }))} />{t('dg.logX')}</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={def.logY} onChange={e => setDef(d => ({ ...d, logY: e.target.checked }))} />{t('dg.logY')}</label>
          </div>}
          {ternary && <p className="text-[11.5px] text-subtle">{t('dg.ternaryHint')}</p>}
          <p className="mt-2 text-[11px] leading-snug text-subtle">{t('dg.exprHint')}</p>
          {!dataset && <p className="mt-1 text-[11.5px] text-warning">{t('dg.noDataset')}</p>}
          {previewError && <p className="mt-1 text-[11.5px] text-danger">{previewError}</p>}
        </div>
        <label className={label}>{t('dg.reference')}<input aria-label={t('dg.reference')} className={field} value={spec.reference} onChange={e => setSpec({ reference: e.target.value })} placeholder={t('dg.referenceHint')} /></label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between"><b className="text-[12.5px] text-fg">{t('dg.fields')}</b>
          <button onClick={() => setFields(f => [...f, { id: newDiagramId().slice(-8), name: '', text: '' }])} className="h-7 rounded border border-dashed border-line-strong px-2 text-[12px] text-muted hover:text-fg disabled:opacity-40">+ {t('dg.addField')}</button></div>
        <>
          <p className="text-[11.5px] leading-snug text-subtle">{t(ternary ? 'dg.fieldsHint3' : 'dg.fieldsHint')} {t('dg.drawHint')}</p>
          <FieldsPreview fields={'fields' in parsedFields ? parsedFields.fields ?? [] : []} logX={!ternary && def.logX} logY={!ternary && def.logY} ternary={ternary} />
          {fields.map((f, k) => <div key={f.id} className="rounded-md border border-line p-2">
            <div className="flex items-center gap-1.5">
              <input aria-label={`${t('dg.fieldName')} ${k + 1}`} className={`${field} h-7 flex-1`} value={f.name} placeholder={t('dg.fieldName')} onChange={e => setFields(fs => fs.map((x, i) => (i === k ? { ...x, name: e.target.value } : x)))} />
              <button aria-label={`${t('dg.removeField')} ${k + 1}`} title={t('dg.removeField')} onClick={() => setFields(fs => fs.filter((_, i) => i !== k))} className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-hover hover:text-fg">×</button>
            </div>
            <textarea aria-label={`${t('dg.vertices')} ${k + 1}`} spellCheck={false} rows={4} className="mt-1.5 w-full rounded-md border border-line-strong bg-raised p-2 font-mono text-[11.5px] text-fg focus:border-accent focus:outline-none"
              value={f.text} placeholder={ternary ? '50, 50, 0\n100, 0, 0\n50, 0, 50' : '0, 20\n20, 20\n20, 200\n0, 200'} onChange={e => setFields(fs => fs.map((x, i) => (i === k ? { ...x, text: e.target.value } : x)))} />
          </div>)}
        </>
      </div>
    </div>
    {problem && <p role="alert" className="mt-3 text-[12px] text-danger">{problem}</p>}
    <div className="mt-4 flex items-center justify-end gap-2 border-t border-line pt-3">
      <span className="mr-auto text-[11.5px] text-subtle">{t('dg.savedWhere')}</span>
      <button onClick={close} className={`${btn} border border-line-strong text-fg hover:bg-hover`}>{t('cancel')}</button>
      <button onClick={() => save(false)} className={`${btn} border border-line-strong text-fg hover:bg-hover`}>{t('dg.save')}</button>
      <button onClick={() => save(true)} disabled={!dataset} className={`${btn} bg-accent-strong text-on-accent hover:bg-accent-hover`}>{t('dg.saveOpen')}</button>
    </div>
  </Modal>;
}

const fmt = (v: number | null) => (v == null || !Number.isFinite(v) ? '—' : Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2) : String(+v.toPrecision(4)));

/** Outline of the classification fields, to check the vertices typed. */
function FieldsPreview({ fields: raw, logX, logY, ternary = false }: { fields: DiagramField[]; logX: boolean; logY: boolean; ternary?: boolean }) {
  // Ternary vertices [A, B, C] are drawn in the triangle (A top, B bottom-left, C bottom-right).
  const tri = (p: number[]) => { const s = p[0] + p[1] + p[2] || 1, a = p[0] / s, c = p[2] / s; return [c + a / 2, (a * Math.sqrt(3)) / 2]; };
  const fields = ternary ? [{ id: '__tri', name: '', points: [[0, 0], [1, 0], [0.5, Math.sqrt(3) / 2]] }, ...raw.map(f => ({ ...f, points: f.points.map(tri) }))] : raw;
  const pts = fields.flatMap(f => f.points).filter(p => (!logX || p[0] > 0) && (!logY || p[1] > 0));
  if (!pts.length) return null;
  const tx = (v: number) => (logX ? Math.log10(v) : v), ty = (v: number) => (logY ? Math.log10(v) : v);
  const xs = pts.map(p => tx(p[0])), ys = pts.map(p => ty(p[1]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = 300, H = ternary ? 260 : 170, pad = 10, sx = (v: number) => pad + ((tx(v) - x0) / (x1 - x0 || 1)) * (W - 2 * pad), sy = (v: number) => H - pad - ((ty(v) - y0) / (y1 - y0 || 1)) * (H - 2 * pad);
  const colors = ['var(--color-accent)', '#e69f00', '#56b4e9', '#cc79a7', '#009e73', '#d55e00'];
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md bg-sunken" role="img" aria-label="Vista de los campos">
    {fields.map((f, k) => {
      const ok = f.points.filter(p => (!logX || p[0] > 0) && (!logY || p[1] > 0));
      const cx = ok.reduce((a, p) => a + sx(p[0]), 0) / ok.length, cy = ok.reduce((a, p) => a + sy(p[1]), 0) / ok.length;
      if (f.id === '__tri') return <polygon key={f.id} points={ok.map(p => `${sx(p[0])},${sy(p[1])}`).join(' ')} fill="none" stroke="var(--color-line-strong)" strokeWidth={1} />;
      return <g key={f.id}><polygon points={ok.map(p => `${sx(p[0])},${sy(p[1])}`).join(' ')} fill={colors[k % colors.length]} fillOpacity={0.12} stroke={colors[k % colors.length]} strokeWidth={1.2} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="var(--color-fg)">{f.name}</text></g>;
    })}
  </svg>;
}

function Library() {
  const t = useT();
  const diagrams = useDiagramLibrary(s => s.diagrams);
  const lib = useDiagramLibrary.getState();
  const dataset = useDatasetStore(s => s.dataset);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const groups = DIAGRAM_AREAS.map(area => ({ area, items: diagrams.filter(d => d.area === area).sort((a, b) => (a.folder || '~').localeCompare(b.folder || '~') || a.spec.name.localeCompare(b.spec.name)) })).filter(g => g.items.length);
  const exportAll = async (items: DiagramDef[], name: string) => {
    const out = await saveFile(name, JSON.stringify(libraryFile(items), null, 2), 'application/json');
    if (out.status === 'saved') setNotice({ tone: 'ok', text: t('dg.exported').replace('{n}', String(items.length)) });
  };
  const importFile = async (f: File) => {
    try {
      const defs = parseLibraryFile(await f.text());
      const { added, replaced } = lib.merge(defs);
      for (const d of defs) useGeoWindows.getState().syncDiagram(d);
      setNotice({ tone: 'ok', text: t('dg.imported').replace('{a}', String(added)).replace('{r}', String(replaced)) });
    } catch (e) { setNotice({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); }
  };
  const duplicate = (d: DiagramDef) => lib.save({ ...d, spec: { ...d.spec, id: newDiagramId(), name: `${d.spec.name} (${t('dg.copy')})` } });
  const small = 'h-7 rounded px-2 text-[12px] text-muted hover:bg-hover hover:text-fg disabled:opacity-40';
  return <Modal title={t('dg.library')} icon="library" onClose={() => lib.closeDialog()} width="w-[720px]">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button onClick={() => lib.openBuilder(useShellStore.getState().area === 'maps' ? 'litho' : useShellStore.getState().area)} className={`${btn} bg-accent-strong text-on-accent hover:bg-accent-hover`}>+ {t('dg.new')}</button>
      <button onClick={() => file.current?.click()} className={`${btn} border border-line-strong text-fg hover:bg-hover`}>{t('dg.import')}</button>
      <button disabled={!diagrams.length} onClick={() => void exportAll(diagrams, 'diagramas-pyorex.json')} className={`${btn} border border-line-strong text-fg hover:bg-hover`}>{t('dg.exportAll')}</button>
      <input ref={file} type="file" accept=".json,application/json" className="hidden" aria-label={t('dg.import')} onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
    </div>
    {notice && <p role="status" className={`mb-2 text-[12px] ${notice.tone === 'ok' ? 'text-success' : 'text-danger'}`}>{notice.text}</p>}
    {!diagrams.length ? <p className="py-8 text-center text-[12.5px] text-muted">{t('dg.empty')}</p> :
      <div className="max-h-[56vh] space-y-3 overflow-auto">{groups.map(g => <section key={g.area}>
        <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-subtle">{t(`area.${g.area}` as TKey)}</h3>
        <ul className="divide-y divide-line rounded-md border border-line">{g.items.map(d => <li key={d.spec.id} className="flex items-center gap-2 px-2.5 py-1.5">
          <PxIcon name={d.spec.kind === 'ternary' ? 'ternary' : 'scatter'} className="h-4 w-4 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] text-fg">{d.spec.name}{d.folder && <span className="text-subtle"> · {d.folder}</span>}</div>
            <div className="truncate font-mono text-[11px] text-subtle">{d.spec.kind === 'ternary' ? `${d.spec.x} : ${d.spec.y} : ${d.spec.z}` : `X = ${d.spec.x} · Y = ${d.spec.y}`}{d.spec.fields.length ? ` · ${t('dg.nFields').replace('{n}', String(d.spec.fields.length))}` : ''}</div>
          </div>
          {confirm === d.spec.id ? <>
            <span className="text-[12px] text-warning">{t('dg.confirmDelete')}</span>
            <button className={small} onClick={() => { lib.remove(d.spec.id); setConfirm(null); }}>{t('dg.delete')}</button>
            <button className={small} onClick={() => setConfirm(null)}>{t('cancel')}</button>
          </> : <>
            <button className={small} disabled={!dataset} onClick={() => { lib.closeDialog(); openLibraryDiagram(d); }}>{t('dg.open')}</button>
            <button className={small} onClick={() => lib.openBuilder(d.area, d)}>{t('dg.editShort')}</button>
            <button className={small} onClick={() => duplicate(d)}>{t('dg.duplicate')}</button>
            <button className={small} onClick={() => void exportAll([d], `${d.spec.name.replace(/[^\w.-]+/g, '_') || 'diagrama'}.json`)}>{t('dg.export')}</button>
            <button className={small} aria-label={`${t('dg.delete')} ${d.spec.name}`} onClick={() => setConfirm(d.spec.id)}>×</button>
          </>}
        </li>)}</ul>
      </section>)}</div>}
    <p className="mt-3 text-[11.5px] text-subtle">{t('dg.libraryHint')}</p>
  </Modal>;
}
