import { useMemo, useState } from 'react';
import Icon from './Icon';
import PlotXY from './PlotXY';
import { SAMPLES, TAS_FIELDS, inPoly } from './data';
import { useApp, type Win } from './store';
import { compile } from './expr';
import { CATEGORICAL } from './viz';

export interface BField { id: string; name: string; color: string; poly: [number, number][] }
export interface BRule { id: string; name: string; cond: string; color: string }
export interface BDef { name: string; version: number; base?: string; status?: string; x: string; y: string; logX: boolean; logY: boolean; domain?: { x: [number, number]; y: [number, number] }; fields: BField[]; rules: BRule[] }

const PAL = [...CATEGORICAL['Okabe–Ito'], ...CATEGORICAL['Tableau 10']];
let uid = 0; const nid = () => `f${Date.now().toString(36)}${uid++}`;
export const TEMPLATES: Record<string, () => BDef> = {
  blank: () => ({ name: 'Diagrama nuevo', version: 1, x: 'SiO2', y: 'K2O', logX: false, logY: false, fields: [], rules: [] }),
  tas: () => ({ name: 'TAS · mi versión', version: 1, base: 'TAS plutónico · Middlemost (1994)', x: 'SiO2', y: 'Na2O + K2O', logX: false, logY: false, domain: { x: [40, 80], y: [0, 16] }, fields: TAS_FIELDS.map((f, k) => ({ id: nid(), name: f.name, color: PAL[k % PAL.length], poly: f.poly.map(p => [p[0], p[1]] as [number, number]) })), rules: [] }),
  k2o: () => ({ name: 'K₂O–SiO₂ · ejemplo ilustrativo', version: 1, base: 'Límites de ejemplo: ajústalos a la fuente que uses', x: 'SiO2', y: 'K2O', logX: false, logY: false, domain: { x: [45, 78], y: [0, 7] },
    fields: [['Low-K', [[45, 0], [78, 0], [78, 1.6], [45, 0.35]]], ['Medium-K', [[45, 0.35], [78, 1.6], [78, 3.4], [45, 0.9]]], ['High-K', [[45, 0.9], [78, 3.4], [78, 5.6], [45, 1.7]]], ['Shoshonitic', [[45, 1.7], [78, 5.6], [78, 7], [45, 7]]]].map(([n, p], k) => ({ id: nid(), name: n as string, color: ['#56b4e9', '#009e73', '#e69f00', '#d55e00'][k], poly: p as [number, number][] })),
    rules: [{ id: nid(), name: 'High-K evolucionado', cond: 'campo = "High-K" AND MgO < 4', color: '#cc79a7' }] }),
  adakite: () => ({ name: 'Sr/Y vs Y · prueba de hipótesis', version: 1, x: 'Y', y: 'Sr / Y', logX: false, logY: false, fields: [], rules: [{ id: nid(), name: 'Firma Sr/Y alta', cond: 'Sr / Y > 40 AND MgO < 4', color: '#d55e00' }, { id: nid(), name: 'Resto', cond: 'Sr / Y <= 40', color: '#8c96a0' }] }),
};

/** Evaluate a definition on every sample: axis values, field membership and rule class. */
export function evaluate(d: BDef) {
  const cx = compile(d.x), cy = compile(d.y); const rules = d.rules.map(r => ({ r, c: compile(r.cond) }));
  const out: { i: number; x: number | null; y: number | null; field: string | null; cls: string | null }[] = [];
  for (const s of SAMPLES) {
    const xv = cx.ok ? cx.run({ s }) : null, yv = cy.ok ? cy.run({ s }) : null;
    const x = typeof xv === 'number' && (!d.logX || xv > 0) ? xv : null, y = typeof yv === 'number' && (!d.logY || yv > 0) ? yv : null;
    const field = x != null && y != null ? d.fields.find(f => f.poly.length > 2 && inPoly(x, y, f.poly))?.name ?? null : null;
    const rule = rules.find(({ c }) => c.ok && c.run({ s, field }) === true)?.r.name ?? null;
    out.push({ i: s.i, x, y, field, cls: rule ?? field });
  }
  return { rows: out, errX: cx.ok ? null : cx.error, errY: cy.ok ? null : cy.error, ruleErr: Object.fromEntries(rules.map(({ r, c }) => [r.id, c.ok ? null : c.error])) };
}

type SX = (v: number) => number;
const inv = (sx: SX, log: boolean) => { const a = log ? sx(1) : sx(0), b = log ? sx(10) : sx(1); return (px: number) => { const t = (px - a) / (b - a); return log ? 10 ** t : t; }; };

export function BuilderWin({ win }: { win: Win }) {
  const patch = useApp(s => s.patchWin), set = useApp(s => s.set), notify = useApp(s => s.notify), log = useApp(s => s.log), setStyle = useApp(s => s.setStyle), lang = useApp(s => s.lang);
  const es = lang === 'es';
  const o = win.opts; const d: BDef | undefined = o.b; const edit = !!o.edit; const btool: 'select' | 'draw' = o.btool ?? 'select';
  const P = (p: Record<string, any>) => patch(win.id, { opts: { ...useApp.getState().windows.find(w => w.id === win.id)!.opts, ...p } });
  const D = (p: Partial<BDef>) => { const cur = useApp.getState().windows.find(w => w.id === win.id)!.opts.b as BDef; P({ b: { ...cur, ...p } }); };
  const [tab, setTab] = useState<'fields' | 'rules'>('fields');
  const ev = useMemo(() => (d ? evaluate(d) : null), [d]);

  if (!d || !ev) return <div className="bd-pick"><Icon name="sliders" size={30} /><h3>{es ? 'Nuevo diagrama' : 'New diagram'}</h3><p className="muted">{es ? 'Empieza en blanco o parte de un diagrama existente. Los de referencia nunca se modifican: se duplican.' : 'Start blank or from an existing diagram. Reference diagrams are never modified: they are duplicated.'}</p>
    <div className="bd-tpls">{([['blank', 'scatter', es ? 'En blanco' : 'Blank', 'X = SiO2 · Y = K2O'], ['tas', 'tas', es ? 'Duplicar TAS' : 'Duplicate TAS', 'Middlemost (1994) · 12 campos'], ['k2o', 'scatter', es ? 'K₂O–SiO₂ de ejemplo' : 'Example K₂O–SiO₂', es ? '4 campos + 1 regla' : '4 fields + 1 rule'], ['adakite', 'anomaly', es ? 'Hipótesis Sr/Y' : 'Sr/Y hypothesis', es ? 'solo reglas' : 'rules only']] as const).map(([k, ic, t, s]) => <button key={k} className="ss-card" onClick={() => P({ b: TEMPLATES[k](), edit: true, btool: 'select', tool: 'pan', tt: { es: `Builder · ${TEMPLATES[k]().name}`, en: `Builder · ${TEMPLATES[k]().name}` } })}><Icon name={ic} size={24} /><b>{t}</b><small>{s}</small></button>)}</div></div>;

  const pts = ev.rows.filter(r => r.x != null && r.y != null).map(r => ({ i: r.i, x: r.x!, y: r.y! }));
  const dropped = SAMPLES.length - pts.length; const sel: string | null = o.sel ?? null; const drawing: [number, number][] | null = o.drawing ?? null;
  const counts = new Map<string, number>(); for (const r of ev.rows) if (r.cls) counts.set(r.cls, (counts.get(r.cls) ?? 0) + 1);
  const fieldCount = (n: string) => ev.rows.filter(r => r.field === n).length;

  const startDrag = (e: React.PointerEvent, fid: string, k: number, sx: SX, sy: SX) => {
    e.stopPropagation(); e.preventDefault(); const svg = (e.target as Element).closest('svg')!; const rect = svg.getBoundingClientRect(); const ix = inv(sx, d.logX), iy = inv(sy, d.logY);
    // shared vertices: every field vertex at the same position moves together, so boundaries stay closed
    let last = d.fields.find(f => f.id === fid)!.poly[k]; const same = (p: [number, number]) => Math.abs(p[0] - last[0]) < 1e-6 && Math.abs(p[1] - last[1]) < 1e-6;
    const mv = (ev2: PointerEvent) => { const x = +ix(ev2.clientX - rect.left).toFixed(2), y = +iy(ev2.clientY - rect.top).toFixed(2); const cur = useApp.getState().windows.find(w => w.id === win.id)!.opts.b as BDef;
      const shared = !ev2.altKey; D({ fields: cur.fields.map(f => ({ ...f, poly: f.poly.map((p, j) => ((f.id === fid && j === k) || (shared && same(p)) ? [x, y] as [number, number] : p)) })) }); last = [x, y]; };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const addPoint = (e: React.PointerEvent, sx: SX, sy: SX) => {
    e.stopPropagation(); const svg = (e.target as Element).closest('svg')!; const rect = svg.getBoundingClientRect(); const x = +inv(sx, d.logX)(e.clientX - rect.left).toFixed(2), y = +inv(sy, d.logY)(e.clientY - rect.top).toFixed(2);
    const cur = drawing ?? [];
    if (cur.length >= 3) { const [fx, fy] = cur[0]; if (Math.hypot(sx(fx) - (e.clientX - rect.left), sy(fy) - (e.clientY - rect.top)) < 10) { closeDraw(cur); return; } }
    P({ drawing: [...cur, [x, y]] });
  };
  const closeDraw = (poly: [number, number][]) => { const f: BField = { id: nid(), name: `${es ? 'Campo' : 'Field'} ${d.fields.length + 1}`, color: PAL[d.fields.length % PAL.length], poly }; P({ drawing: null, btool: 'select', sel: f.id, b: { ...d, fields: [...d.fields, f] } }); setTab('fields'); };
  const addVertex = (fid: string) => D({ fields: d.fields.map(f => { if (f.id !== fid) return f; const p = f.poly; let best = 0, bl = -1; for (let k = 0; k < p.length; k++) { const a = p[k], b = p[(k + 1) % p.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; best = k; } } const a = p[best], b = p[(best + 1) % p.length]; const np = [...p]; np.splice(best + 1, 0, [+((a[0] + b[0]) / 2).toFixed(2), +((a[1] + b[1]) / 2).toFixed(2)]); return { ...f, poly: np }; }) });

  const classify = () => {
    const name = d.name; const uc: Record<number, string> = {}; let n = 0; for (const r of ev.rows) if (r.cls) { uc[r.i] = r.cls; n++; }
    const ov: Record<string, string> = {}; for (const f of d.fields) ov[`user:${f.name}`] = f.color; for (const r of d.rules) ov[`user:${r.name}`] = r.color;
    set({ userClasses: uc }); setStyle(s => ({ ...s, color: { ...s.color, mode: 'category', catVar: 'user', overrides: { ...s.color.overrides, ...ov } }, shape: { ...s.shape, catVar: 'user' } }));
    log({ icon: 'classify', title: `${es ? 'Clasificar con' : 'Classify with'} «${name}» v${d.version}`, detail: `${n} ${es ? 'muestras clasificadas' : 'samples classified'}`, code: `df["${name.replace(/[^\w]+/g, '_')}"] = px.diagram("${name}", version=${d.version}).classify(df)` });
    notify(es ? `${n} muestras clasificadas con «${name}». Todas las vistas usan ahora estas clases.` : `${n} samples classified with “${name}”. All views now use these classes.`);
  };
  const save = () => { const s = useApp.getState(); set({ diagrams: [...s.diagrams.filter(x => !(x.name === d.name && x.version === d.version)), { name: d.name, version: d.version, def: d }], dirty: true }); log({ icon: 'export', title: `${es ? 'Guardar' : 'Save'} «${d.name}» v${d.version}`, detail: `${d.fields.length} ${es ? 'campos' : 'fields'} · ${d.rules.length} ${es ? 'reglas' : 'rules'}`, code: `px.diagram.save("${d.name}", version=${d.version})  # diagrams/${d.name.replace(/[^\w]+/g, '_')}_v${d.version}.json` }); notify(es ? `«${d.name}» v${d.version} guardado en Mis diagramas. Sigues editando la v${d.version + 1}.` : `“${d.name}” v${d.version} saved to My diagrams. You keep editing v${d.version + 1}.`); D({ version: d.version + 1 }); };

  const under = (sx: SX, sy: SX) => <g>{d.fields.map(f => { const cx = f.poly.reduce((a, p) => a + p[0], 0) / f.poly.length, cy = f.poly.reduce((a, p) => a + p[1], 0) / f.poly.length; const on = edit && sel === f.id;
    return <g key={f.id} style={{ cursor: edit ? 'pointer' : undefined }} onPointerDown={edit && btool === 'select' ? e => { e.stopPropagation(); P({ sel: f.id }); setTab('fields'); } : undefined}>
      <path d={'M' + f.poly.map(([a, b]) => `${sx(a)},${sy(b)}`).join('L') + 'Z'} fill={f.color} fillOpacity={on ? 0.24 : 0.12} stroke={f.color} strokeWidth={on ? 2.4 : 1.2} strokeLinejoin="round" />
      <text x={sx(cx)} y={sy(cy)} textAnchor="middle" className="fname" style={{ fill: 'var(--text)', fontWeight: on ? 600 : 400, fontStyle: 'normal' }}>{f.name}</text></g>; })}</g>;
  const over = (sx: SX, sy: SX) => <g>
    {edit && btool === 'draw' && <rect x={-5000} y={-5000} width={10000} height={10000} fill="transparent" style={{ cursor: 'crosshair' }} onPointerDown={e => addPoint(e, sx, sy)} onDoubleClick={() => drawing && drawing.length >= 3 && closeDraw(drawing)} />}
    {drawing && <><path d={'M' + drawing.map(([a, b]) => `${sx(a)},${sy(b)}`).join('L')} fill="none" stroke="var(--accent-strong)" strokeWidth={2} strokeDasharray="5 3" pointerEvents="none" />{drawing.map(([a, b], k) => <circle key={k} cx={sx(a)} cy={sy(b)} r={k === 0 ? 6 : 4} fill={k === 0 ? 'var(--accent)' : 'var(--bg-raised)'} stroke="var(--accent-strong)" strokeWidth={1.5} pointerEvents="none" />)}</>}
    {edit && btool === 'select' && d.fields.filter(f => f.id === sel).map(f => f.poly.map(([a, b], k) => <rect key={k} x={sx(a) - 5} y={sy(b) - 5} width={10} height={10} rx={2} fill="var(--accent)" stroke="var(--text)" strokeWidth={1} style={{ cursor: 'move' }} onPointerDown={e => startDrag(e, f.id, k, sx, sy)} onDoubleClick={e => { e.stopPropagation(); if (f.poly.length > 3) D({ fields: d.fields.map(g => (g.id === f.id ? { ...g, poly: g.poly.filter((_, j) => j !== k) } : g)) }); }} />))}
  </g>;

  return <><div className="px-win__tools bd-tools">
    <div className="px-seg" style={{ width: 132, flex: 'none' }}><button aria-pressed={!edit} onClick={() => P({ edit: false, drawing: null, tool: 'lasso' })}>{es ? 'Ver' : 'View'}</button><button aria-pressed={edit} onClick={() => P({ edit: true, tool: 'pan' })}>{es ? 'Editar' : 'Edit'}</button></div>
    {edit && <><span className="px-sep" /><button className="px-tool" aria-pressed={btool === 'select'} title={es ? 'Seleccionar campo y mover vértices. Los vértices compartidos se mueven juntos (Alt para separarlos). Doble clic en un vértice lo borra.' : 'Select field and move vertices. Shared vertices move together (Alt to detach). Double-click a vertex removes it.'} onClick={() => P({ btool: 'select', drawing: null })}><Icon name="pointer" size={16} /></button><button className="px-tool" aria-pressed={btool === 'draw'} title={es ? 'Dibujar campo: clic por vértice, clic en el primero o doble clic para cerrar' : 'Draw field: click per vertex, click the first or double-click to close'} onClick={() => P({ btool: 'draw', drawing: [] })}><Icon name="hull" size={16} /></button><button className="px-tool" title={es ? 'Añadir vértice al campo seleccionado' : 'Add vertex to selected field'} disabled={!sel} onClick={() => sel && addVertex(sel)}><Icon name="plus" size={16} /></button></>}
    <span className="px-sep" />
    <label className={`bd-ax ${ev.errX ? 'err' : ''}`}><span>X</span><input value={d.x} onChange={e => D({ x: e.target.value })} spellCheck={false} /><button className="px-tool" aria-pressed={d.logX} title="log X" onClick={() => D({ logX: !d.logX, domain: undefined })}><Icon name="log" size={14} /></button></label>
    <label className={`bd-ax ${ev.errY ? 'err' : ''}`}><span>Y</span><input value={d.y} onChange={e => D({ y: e.target.value })} spellCheck={false} /><button className="px-tool" aria-pressed={d.logY} title="log Y" onClick={() => D({ logY: !d.logY, domain: undefined })}><Icon name="log" size={14} /></button></label>
    <span className="bd-valid">{ev.errX || ev.errY ? <span className="bd-e"><Icon name="warn" size={13} />{ev.errX ?? ev.errY}</span> : <><b className="mono">{pts.length}</b> {es ? 'válidas' : 'valid'} · <span className="mono">{dropped}</span> {es ? 'descartadas' : 'dropped'}</>}</span>
  </div>
    {(d.status === 'prop' || d.status === 'plan') && d.fields.length === 0 && d.rules.length === 0 && <div className="bd-banner"><Icon name="warn" size={14} /><span>{es ? <>Diagrama <b>{d.status === 'plan' ? 'planificado' : 'propuesto'}</b>: los ejes ya se calculan con tus datos; los campos de clasificación aún no están digitalizados desde <b>{d.base}</b>. Pulsa Editar para dibujarlos y luego publícalo en la comunidad.</> : <>This diagram is <b>{d.status === 'plan' ? 'planned' : 'proposed'}</b>: axes are computed on your data; classification fields are not yet digitised from <b>{d.base}</b>. Press Edit to draw them, then publish to the community.</>}</span></div>}
    <div className="bd-main">
      <div className="px-win__plot" style={{ minWidth: 0 }}>{pts.length > 1 ? <PlotXY win={win} points={pts} xLabel={d.x} yLabel={d.y} logX={d.logX} logY={d.logY} domain={d.domain} under={under} over={over} /> : <div className="bd-empty muted">{es ? 'Sin datos válidos para estos ejes' : 'No valid data for these axes'}</div>}</div>
      <aside className="bd-side">
        <div className="bd-name"><input value={d.name} onChange={e => D({ name: e.target.value })} /><span className="px-chip mono">v{d.version}</span></div>
        {d.base && <small className="muted bd-base">{es ? 'Basado en' : 'Based on'}: {d.base}</small>}
        <div className="px-seg" style={{ margin: '6px 0' }}><button aria-pressed={tab === 'fields'} onClick={() => setTab('fields')}>{es ? 'Campos' : 'Fields'} · {d.fields.length}</button><button aria-pressed={tab === 'rules'} onClick={() => setTab('rules')}>{es ? 'Reglas' : 'Rules'} · {d.rules.length}</button></div>
        {tab === 'fields' ? <div className="bd-list">
          {d.fields.length === 0 && <p className="ed-hint">{es ? 'Sin campos. Pasa a Editar y usa «Dibujar campo».' : 'No fields. Switch to Edit and use “Draw field”.'}</p>}
          {d.fields.map((f, k) => <div key={f.id} className={`bd-row ${sel === f.id ? 'on' : ''}`} onClick={() => P({ sel: f.id })}>
            <input type="color" value={f.color} onChange={e => D({ fields: d.fields.map(g => (g.id === f.id ? { ...g, color: e.target.value } : g)) })} />
            <input className="bd-in" value={f.name} onChange={e => D({ fields: d.fields.map(g => (g.id === f.id ? { ...g, name: e.target.value } : g)) })} />
            <span className="px-num">{fieldCount(f.name)}</span>
            {edit && <span className="bd-ord"><button disabled={k === 0} title={es ? 'Prioridad mayor' : 'Higher priority'} onClick={e => { e.stopPropagation(); const fs = [...d.fields]; [fs[k - 1], fs[k]] = [fs[k], fs[k - 1]]; D({ fields: fs }); }}><Icon name="up" size={11} /></button><button title={es ? 'Borrar campo' : 'Delete field'} onClick={e => { e.stopPropagation(); D({ fields: d.fields.filter(g => g.id !== f.id) }); }}><Icon name="close" size={11} /></button></span>}
          </div>)}
        </div> : <div className="bd-list">
          <p className="ed-hint">{es ? 'Gana la primera regla que se cumple. Usa variables, ratios, AND / OR y campo = "nombre".' : 'The first matching rule wins. Use variables, ratios, AND / OR and field = "name".'}</p>
          {d.rules.map((r, k) => <div key={r.id} className={`bd-rule ${ev.ruleErr[r.id] ? 'err' : ''}`}>
            <div className="px-row" style={{ gap: 6 }}><span className="mono muted">{k + 1}</span><input type="color" value={r.color} onChange={e => D({ rules: d.rules.map(g => (g.id === r.id ? { ...g, color: e.target.value } : g)) })} /><input className="bd-in" value={r.name} onChange={e => D({ rules: d.rules.map(g => (g.id === r.id ? { ...g, name: e.target.value } : g)) })} /><span className="px-num">{counts.get(r.name) ?? 0}</span><button className="ol-b" onClick={() => D({ rules: d.rules.filter(g => g.id !== r.id) })}><Icon name="close" size={12} /></button></div>
            <input className="bd-cond mono" value={r.cond} spellCheck={false} onChange={e => D({ rules: d.rules.map(g => (g.id === r.id ? { ...g, cond: e.target.value } : g)) })} />
            {ev.ruleErr[r.id] && <small className="bd-e"><Icon name="warn" size={12} />{ev.ruleErr[r.id]}</small>}
          </div>)}
          <button className="px-btn px-btn--sm" onClick={() => D({ rules: [...d.rules, { id: nid(), name: `${es ? 'Regla' : 'Rule'} ${d.rules.length + 1}`, cond: 'SiO2 > 63 AND K2O > 3', color: PAL[(d.rules.length + 5) % PAL.length] }] })}><Icon name="plus" size={13} />{es ? 'Regla' : 'Rule'}</button>
        </div>}
      </aside>
    </div>
    <div className="px-win__foot"><span>{[...counts].length ? [...counts].slice(0, 4).map(([k, v]) => `${k} ${v}`).join(' · ') : (es ? 'Sin clases todavía' : 'No classes yet')}</span><span style={{ flex: 1 }} />
      <button className="px-btn px-btn--sm" onClick={save}><Icon name="export" size={13} />{es ? 'Guardar versión' : 'Save version'}</button>
      <button className="px-btn px-btn--sm px-btn--primary" disabled={!counts.size} onClick={classify}><Icon name="classify" size={13} />{es ? 'Clasificar → columna' : 'Classify → column'}</button></div></>;
}
