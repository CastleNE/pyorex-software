import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Icon, { type PxIconName } from './Icon';
import { useApp, type AreaId, type Fly, type ModuleId, type Win, type WinType, type Layers } from './store';
import { WindowBody } from './Windows';
import Editor from './Editor';
import { HistoryPanel, Inspector, LayersPanel, ProjectPanel, WIN_ICON, WinTitle } from './Panels';
import { DDH, MINERALS, SAMPLES, tasName } from './data';
import { useResolved } from './resolve';
import { useL, useT, type TKey, type Txt } from './i18n';
import { AREA_RIBBON, PLOT_TYPES, TOOLS, availability, type RibbonItem } from './tools';
import { REFS } from './refs';
import { Backstage, ImportWizard } from './Backstage';
import { crsLabel } from './MapLayers';
import { TEMPLATES } from './Builder';
import { DEF_SEC } from './Section';
import { CATALOG, GROUP_NAME, entryAvail, runEntry, type CatEntry } from './catalog';
const VAR_EXPR: Record<string, string> = { alk: 'Na2O + K2O', sry: 'Sr / Y', layb: 'N(La) / N(Yb)', dyyb: 'N(Dy) / N(Yb)', ai: '100 * (MgO + K2O) / (MgO + K2O + CaO + Na2O)', ccpi: '100 * (MgO + FeOT) / (MgO + FeOT + Na2O + K2O)', mali: 'Na2O + K2O - CaO', feidx: 'FeOT / (FeOT + MgO)' };

/* ---------------- workspace per module / area ---------------- */
const cache: Record<string, { windows: Win[]; activeId: string | null }> = {};
const wsKey = () => { const s = useApp.getState(); return s.module === 'geo' ? `geo:${s.area}` : s.module; };
function canvasSize() { const el = document.querySelector('.px-canvas'); return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 1200, h: 640 }; }
function seed(key: string) {
  const { open, set } = useApp.getState(); set({ windows: [], activeId: null });
  const { w, h } = canvasSize(); const g = 12, L = Math.round(w * 0.56), R = w - L - 3 * g, top = Math.round(h * 0.56);
  const tt = (es: string, en: string): Txt => ({ es, en });
  const first = () => { const ws = useApp.getState().windows; if (ws[0]) useApp.getState().focus(ws[0].id); };
  if (key === 'geo:litho') {
    open('tas', { ref: 'tas', tt: tt('TAS plutónico', 'Plutonic TAS') }, 'TAS plutónico', { x: g, y: g, w: L, h: h - 2 * g });
    open('spider', { ref: 'ree', tt: tt('Spider REE · condrito', 'REE spider · chondrite') }, 'Spider REE', { x: L + 2 * g, y: g, w: R, h: top - g });
    open('table', { tt: tt('Tabla', 'Table') }, 'Tabla', { x: L + 2 * g, y: top + g, w: R, h: h - top - 2 * g }); first();
  } else if (key === 'geo:data') {
    open('table', { tt: tt('Tabla', 'Table') }, 'Tabla', { x: g, y: g, w: L, h: h - 2 * g });
    open('stats', { var: 'Cu', tt: tt('Estadística descriptiva', 'Descriptive statistics') }, 'Estadística', { x: L + 2 * g, y: g, w: R, h: top - g });
    open('hist', { var: 'Cu', tt: tt('Histograma · Cu', 'Histogram · Cu') }, 'Histograma', { x: L + 2 * g, y: top + g, w: R, h: h - top - 2 * g }); first();
  } else if (key === 'geo:explo') {
    open('xy', { x: 'Y', y: 'sry', ref: 'sry', tt: tt('Sr/Y vs Y', 'Sr/Y vs Y') }, 'Sr/Y vs Y', { x: g, y: g, w: L, h: top - g });
    open('xy', { x: 'ai', y: 'ccpi', ref: 'alt', tt: tt('Alteración · AI vs CCPI', 'Alteration · AI vs CCPI') }, 'AI vs CCPI', { x: g, y: top + g, w: L, h: h - top - 2 * g });
    open('models', { tt: tt('Modelos de depósito', 'Deposit models') }, 'Modelos', { x: L + 2 * g, y: g, w: R, h: h - 2 * g }); first();
  } else if (key === 'geo:maps') {
    const mw = Math.round(w * 0.4), sw = w - mw - 3 * g, sh = Math.round(h * 0.6);
    open('map', { surface: true, contours: true, outlines: false, ref: 'idw', view: { x: [447000, 465000], y: [8821000, 8837000] }, tt: tt('Mapa · Cu interpolado · Oxapampa', 'Map · interpolated Cu · Oxapampa') }, 'Mapa', { x: g, y: g, w: mw, h: h - 2 * g });
    open('section', { tt: tt('Sección A–A′', 'Section A–A′') }, 'Sección A–A′', { x: mw + 2 * g, y: g, w: sw, h: sh });
    open('hist', { var: 'Cu', log: true, tt: tt('Histograma · Cu', 'Histogram · Cu') }, 'Histograma', { x: mw + 2 * g, y: sh + 2 * g, w: sw, h: h - sh - 3 * g });
    useApp.getState().focus(useApp.getState().windows.find(x => x.type === 'section')!.id);
  } else if (key === 'spec') {
    open('speclog', {}, undefined, { x: g, y: g, w: 330, h: h - 2 * g });
    open('spectrum', { range: 'swir' }, undefined, { x: 330 + 2 * g, y: g, w: w - 330 - 3 * g, h: top - g });
    const half = Math.round((w - 330 - 4 * g) / 2);
    open('match', {}, undefined, { x: 330 + 2 * g, y: top + g, w: half, h: h - top - 2 * g });
    open('vector', {}, undefined, { x: 330 + 3 * g + half, y: top + g, w: half, h: h - top - 2 * g });
  } else if (key === 'petro') {
    open('petro', {}, undefined, { x: g, y: g, w: 360, h: h - 2 * g });
    open('speclog', {}, undefined, { x: 360 + 2 * g, y: g, w: 330, h: h - 2 * g });
    open('xy', { x: 'Rb', y: 'Sr', logX: true, logY: true }, 'Rb vs Sr', { x: 690 + 3 * g, y: g, w: Math.max(360, w - 690 - 4 * g), h: h - 2 * g });
  }
}
function switchTo(p: { module?: ModuleId; area?: AreaId }) {
  const s = useApp.getState(); const before = wsKey();
  if ((p.module ?? s.module) === s.module && (p.area ?? s.area) === s.area) return;
  cache[before] = { windows: s.windows, activeId: s.activeId };
  s.set({ ...p, ribbonTab: 'area', refTool: null, fly: s.flyPin ? s.fly : null });
  const key = wsKey(); const c = cache[key];
  if (c) s.set({ windows: c.windows, activeId: c.activeId }); else setTimeout(() => seed(key), 0);
}
function tile() {
  const s = useApp.getState(); const ws = s.windows.filter(w => !w.min); if (!ws.length) return;
  const { w, h } = canvasSize(); const g = 10; const cols = Math.ceil(Math.sqrt(ws.length)), rows = Math.ceil(ws.length / cols);
  const cw = (w - g * (cols + 1)) / cols, ch = (h - g * (rows + 1)) / rows;
  s.set({ windows: s.windows.map(x => { const k = ws.indexOf(x); if (k < 0) return x; return { ...x, x: g + (k % cols) * (cw + g), y: g + Math.floor(k / cols) * (ch + g), w: cw, h: ch, opts: { ...x.opts, view: undefined } }; }) });
}
function toggleLayer(p: (l: Layers) => Partial<Layers>) {
  const s = useApp.getState(); const w = s.windows.find(x => x.id === s.activeId); if (!w) { s.notify(s.lang === 'es' ? 'Activa un gráfico primero.' : 'Activate a chart first.'); return; } s.setLayers(w.id, p(w.layers));
}
function toggleOpt(k: string) { const s = useApp.getState(); const w = s.windows.find(x => x.id === s.activeId); if (!w) return; if (w.type === 'section') { const sc = { ...DEF_SEC, ...(w.opts.sc ?? {}) } as any; s.patchWin(w.id, { opts: { ...w.opts, sc: { ...sc, [k]: !sc[k] } } }); } else s.patchWin(w.id, { opts: { ...w.opts, [k]: !w.opts[k] } }); }
const optOn = (w: Win | undefined, k: string) => (!w ? false : w.type === 'section' ? !!({ ...DEF_SEC, ...(w.opts.sc ?? {}) } as any)[k] : !!w.opts[k]);

/* ---------------- header ---------------- */
function Logo() { return <svg viewBox="0 0 24 24" aria-hidden><path d="M12 2.5 20.2 7.2v9.6L12 21.5 3.8 16.8V7.2Z" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle className="dot" cx="12" cy="12" r="3.2" /><circle className="dot2" cx="16.5" cy="8.5" r="1.4" /><circle className="dot2" cx="7.5" cy="15.5" r="1.1" /></svg>; }
function Header() {
  const module = useApp(s => s.module), theme = useApp(s => s.theme), set = useApp(s => s.set), lang = useApp(s => s.lang), name = useApp(s => s.projectName), dirty = useApp(s => s.dirty); const t = useT();
  return <header className="px-header">
    <div className="px-brand"><Logo />PyOreX</div>
    <nav className="px-mtabs" role="tablist">
      <button className="px-mtab px-mtab--file" onClick={() => set({ backstage: true, backPage: 'open' })}>{t('file')}</button>
      {(['geo', 'spec', 'petro'] as ModuleId[]).map(id => <button key={id} role="tab" className="px-mtab" aria-selected={module === id} onClick={() => switchTo({ module: id })}>{t(id as TKey)}</button>)}
    </nav>
    <div className="px-hcenter"><b>{name}.orex</b><span>· {dirty ? t('unsaved') : t('saved')}</span></div>
    <button className="px-search" onClick={() => set({ palette: true })}><Icon name="search" size={15} /><span>{t('search')}</span><span className="px-kbd">Ctrl K</span></button>
    <div className="hd-lang" role="group" aria-label="Idioma / Language"><button aria-pressed={lang === 'es'} onClick={() => set({ lang: 'es' })}>ES</button><button aria-pressed={lang === 'en'} onClick={() => set({ lang: 'en' })}>EN</button></div>
    <button className="hd-btn" title={theme === 'light' ? t('dark') : t('light')} onClick={() => set({ theme: theme === 'light' ? 'dark' : 'light' })}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} /></button>
    <span className="px-avatar">BS</span>
  </header>;
}

/* ---------------- ribbon ---------------- */
const Group = ({ name, children, cat }: { name: string; children: ReactNode; cat?: string }) => {
  const gal = useApp(s => s.gallery), set = useApp(s => s.set); const n = cat ? CATALOG.filter(e => e.g === cat).length : 0;
  return <div className="px-rgroup"><div className="px-rgroup__items">{children}</div><div className="px-rgroup__name">{name}{cat && <button className={`rg-launch ${gal?.cat === cat ? 'on' : ''}`} title={`${name} · ${n}`} onClick={e => { const r = (e.currentTarget.closest('.px-rgroup') as HTMLElement).getBoundingClientRect(); set({ gallery: gal?.cat === cat ? null : { cat, x: r.left } }); }}><Icon name="down" size={10} /><span>{n}</span></button>}</div></div>;
};
const Stack = ({ children }: { children: ReactNode }) => <div className="px-rstack">{children}</div>;
type Btn = { icon: PxIconName; label: string; on?: boolean; run: () => void; tip?: string };
const Big = (b: Btn) => <button className="px-rbig" aria-pressed={!!b.on} title={b.tip} onClick={b.run}><Icon name={b.icon} size={26} /><span>{b.label}</span></button>;
const Small = (b: Btn) => <button className="px-rsmall" aria-pressed={!!b.on} title={b.tip} onClick={b.run}><Icon name={b.icon} size={15} />{b.label}</button>;

function ToolBtn({ id, big }: { id: string; big?: boolean }) {
  const cols = useApp(s => s.columns), lang = useApp(s => s.lang), notify = useApp(s => s.notify); const L = useL(), t = useT();
  const tool = TOOLS[id]; const a = availability(tool, cols);
  const tip = [L(tool.label), a.state === 'ok' ? t('available') : a.state === 'partial' ? t('partial') : t('unavailable'), a.missing.length ? `${t('missing')}: ${a.missing.join(', ')}` : '', a.reason ? L(a.reason) : '', tool.ref ? `ⓘ ${t('reference')}` : ''].filter(Boolean).join(' · ');
  const run = () => { if (a.state === 'off') { notify(a.missing.length ? `${L(tool.label)} · ${t('missing')}: ${a.missing.join(', ')}. ${lang === 'es' ? 'Importa o mapea esas columnas en Archivo → Importar datos.' : 'Import or map those columns in File → Import data.'}` : `${L(tool.label)} · ${L(a.reason!)}`); return; } tool.run(); };
  const cls = big ? 'px-rbig' : 'px-rsmall';
  return <button className={`${cls} tb`} data-st={a.state} title={tip} onClick={run}><Icon name={tool.icon} size={big ? 26 : 15} />{big ? <span>{L(tool.label)}</span> : L(tool.label)}{a.state !== 'ok' && <i className="tb-dot" />}</button>;
}
const Items = ({ items }: { items: RibbonItem[] }) => <>{items.map((it, k) => typeof it === 'string' ? (it.startsWith('gal:') ? <GalBtn key={k} cat={it.slice(4)} /> : <ToolBtn key={k} id={it} big />) : <Stack key={k}>{it.map(id => <ToolBtn key={id} id={id} />)}</Stack>)}</>;

function ctxTabs(active: Win | undefined): ('style' | 'diagram' | 'map')[] {
  if (!active) return []; const out: ('style' | 'diagram' | 'map')[] = [];
  if (PLOT_TYPES.includes(active.type)) out.push('style');
  if (active.type === 'tas' || active.type === 'xy' || active.type === 'builder') out.push('diagram');
  if (active.type === 'map' || active.type === 'section') out.push('map');
  return out;
}
function Ribbon() {
  const module = useApp(s => s.module), area = useApp(s => s.area), tab = useApp(s => s.ribbonTab), set = useApp(s => s.set), open = useApp(s => s.open), notify = useApp(s => s.notify), fly = useApp(s => s.fly);
  const active = useApp(s => s.windows.find(w => w.id === s.activeId)); const L = active?.layers; const t = useT(), Lx = useL(); const lang = useApp(s => s.lang);
  const sel = useApp(s => s.selection.length), isolate = useApp(s => s.isolate), createClass = useApp(s => s.createClass), setStyle = useApp(s => s.setStyle), log = useApp(s => s.log);
  const ctx = ctxTabs(active); const shown = tab !== 'area' && ctx.includes(tab as any) ? tab : 'area';
  const es = lang === 'es'; const O = (ty: WinType, opts: Record<string, any> = {}, title?: string, geom?: Partial<Win>) => () => open(ty, opts, title, geom);
  let body: ReactNode;
  if (shown === 'style') body = <>
    <Group name={es ? 'Simbología' : 'Symbology'}><Big icon="sliders" label={es ? 'Editor de estilo' : 'Style editor'} on={fly === 'style'} run={() => set({ fly: fly === 'style' ? null : 'style' })} />
      <Stack><Small icon="density" label={es ? 'Densidad' : 'Density'} on={!!L && L.density !== 'off'} run={() => toggleLayer(l => ({ density: l.density === 'off' ? 'filled' : 'off' }))} /><Small icon="ellipse" label={es ? 'Elipses 95 %' : '95 % ellipses'} on={!!L && L.ellipse !== 'off'} run={() => toggleLayer(l => ({ ellipse: l.ellipse === 'off' ? '95' : 'off' }))} /><Small icon="hull" label={es ? 'Envolventes' : 'Hulls'} on={!!L?.hull} run={() => toggleLayer(l => ({ hull: !l.hull }))} /></Stack>
      <Stack><Small icon="regression" label={es ? 'Regresión' : 'Regression'} on={!!L && L.regression !== 'off'} run={() => toggleLayer(l => ({ regression: l.regression === 'off' ? 'group' : 'off' }))} /><Small icon="marginal" label={es ? 'Marginales' : 'Marginals'} on={!!L && L.marginals !== 'off'} run={() => toggleLayer(l => ({ marginals: l.marginals === 'off' ? 'hist' : 'off' }))} /><Small icon="layers" label={es ? 'Todas las capas…' : 'All layers…'} on={fly === 'layers'} run={() => set({ fly: 'layers' })} /></Stack></Group>
    <Group name={es ? 'Selección' : 'Selection'}><Big icon="classify" label={t('createClass')} run={() => (sel ? createClass() : notify(es ? 'Selecciona muestras con el lazo primero.' : 'Select samples with the lasso first.'))} />
      <Stack><Small icon="filter" label={isolate ? t('showAll') : t('isolate')} on={isolate} run={() => sel && set({ isolate: !isolate })} /><Small icon="close" label={t('clear')} run={() => set({ selection: [], isolate: false })} /><Small icon="search" label={es ? 'Buscar muestra' : 'Find sample'} run={() => set({ palette: true })} /></Stack></Group>
    <Group name={es ? 'Vista' : 'View'}><Stack><Small icon="dock" label={es ? 'Mosaico' : 'Tile'} run={tile} /><Small icon="code" label={t('exportScript')} run={O('pipeline', {}, undefined, { w: 600, h: 440 })} /><Small icon="history" label={t('history')} run={() => set({ histOpen: true })} /></Stack></Group>
  </>;
  else if (shown === 'diagram') body = <>
    <Group name={es ? 'Clasificación' : 'Classification'}><Big icon="classify" label={es ? 'Clasificar → columna' : 'Classify → column'} run={() => { if (active?.type !== 'tas') { notify(es ? 'Disponible para diagramas con campos (TAS hoy; los propios con el Builder).' : 'Available for diagrams with fields (TAS today; your own with the Builder).'); return; } setStyle(st => ({ ...st, color: { ...st.color, mode: 'category', catVar: 'tas' } })); log({ icon: 'classify', title: 'Clasificar TAS plutónico', detail: 'Litologia_TAS', code: 'df["Litologia_TAS"] = px.classify.tas(df, kind="plutonic")' }); notify(es ? 'Clasificación escrita en «Litología (TAS)».' : 'Classification written to “Lithology (TAS)”.'); }} />
      <Big icon="sliders" label={es ? 'Duplicar para editar' : 'Duplicate to edit'} run={() => { if (!active) return; if (active.type === 'builder') { const b = active.opts.b; if (b) open('builder', { n: Date.now(), b: { ...b, name: `${b.name} (copia)`, version: 1 }, edit: true, tool: 'pan', tt: { es: `Builder · ${b.name} (copia)`, en: `Builder · ${b.name} (copy)` } }, 'Builder', { w: 900, h: 560 }); return; }
        const b = active.type === 'tas' ? TEMPLATES.tas() : { ...TEMPLATES.blank(), name: `${active.opts.tt?.es ?? active.title} · mi versión`, x: VAR_EXPR[active.opts.x] ?? active.opts.x ?? 'SiO2', y: VAR_EXPR[active.opts.y] ?? active.opts.y ?? 'K2O', logX: !!active.opts.logX, logY: !!active.opts.logY };
        open('builder', { n: Date.now(), b, edit: true, tool: 'pan', tt: { es: `Builder · ${b.name}`, en: `Builder · ${b.name}` } }, 'Builder', { w: 900, h: 560 }); notify(es ? 'Copia editable creada. El diagrama de referencia no cambia.' : 'Editable copy created. The reference diagram is unchanged.'); }} /></Group>
    <Group name={t('reference')}><Big icon="library" label={t('reference')} on={!!useApp.getState().refTool} run={() => active?.opts.ref && set({ refTool: active.opts.ref, refWin: active.id })} /></Group>
  </>;
  else if (shown === 'map') body = <>
    <Group name={es ? 'Superficie' : 'Surface'}><Big icon="density" label={es ? 'Superficie' : 'Surface'} on={optOn(active, 'surface')} run={() => toggleOpt('surface')} /><Stack><Small icon="sliders" label={es ? 'Variable y método…' : 'Variable & method…'} run={() => set({ fly: 'layers' })} /><Small icon="palette" label={es ? 'Color y rango…' : 'Colour & range…'} run={() => set({ fly: 'layers' })} /><Small icon="library" label={t('reference')} run={() => active && set({ refTool: 'idw', refWin: active.id })} /></Stack></Group>
    <Group name={es ? 'Contornos' : 'Contours'}><Big icon="hull" label={es ? 'Contornos' : 'Contours'} on={optOn(active, 'contours')} run={() => toggleOpt('contours')} /></Group>
    <Group name="Outlines"><Big icon="anomaly" label="Outlines" on={optOn(active, 'outlines')} run={() => toggleOpt('outlines')} /></Group>
    <Group name={es ? 'Muestras' : 'Samples'}><Stack><Small icon="label" label={es ? 'Etiquetas' : 'Labels'} on={!!L && L.labels !== 'off'} run={() => toggleLayer(l => ({ labels: l.labels === 'off' ? 'id' : 'off' }))} /><Small icon="legend" label={es ? 'Leyenda' : 'Legend'} on={!!L?.legend} run={() => toggleLayer(l => ({ legend: !l.legend }))} /><Small icon="sliders" label={es ? 'Estilo…' : 'Style…'} run={() => set({ fly: 'style' })} /></Stack></Group>
  </>;
  else if (module === 'geo') body = <>{AREA_RIBBON[area].map((g, k) => <Group key={k} name={Lx(g.name)} cat={g.cat}><Items items={g.items} /></Group>)}</>;
  else if (module === 'spec') body = <>
    <Group name={es ? 'Datos' : 'Data'}><Big icon="import" label={es ? 'Importar' : 'Import'} run={() => set({ wizard: 0 })} /></Group>
    <Group name={es ? 'Espectros' : 'Spectra'}><Big icon="spectrum" label={es ? 'Espectro' : 'Spectrum'} run={O('spectrum', { range: 'swir' })} /><Big icon="log" label={es ? 'Log espectral' : 'Spectral log'} run={O('speclog', {}, undefined, { w: 340, h: 540 })} /><Stack><Small icon="splice" label={es ? 'Empalme VNIR/SWIR' : 'VNIR/SWIR splice'} run={O('spectrum', { range: 'full' }, 'Espectro completo')} /><Small icon="norm" label={es ? 'Remoción de continuo' : 'Continuum removal'} run={() => notify(es ? 'Remoción de continuo aplicada (vista previa en Espectro).' : 'Continuum removal applied (preview in Spectrum).')} /><Small icon="clean" label={es ? 'Suavizado S-G' : 'S-G smoothing'} run={() => notify('Savitzky–Golay 11 pts.')} /></Stack></Group>
    <Group name={es ? 'Identificación' : 'Identification'}><Big icon="library" label={es ? 'Biblioteca' : 'Library'} run={O('match', {}, undefined, { w: 420, h: 300 })} /><Stack><Small icon="feature" label={es ? 'Rasgos de absorción' : 'Absorption features'} run={O('spectrum', { range: 'swir' })} /><Small icon="mineral" label={es ? 'Mapa mineral' : 'Mineral map'} run={O('speclog', {}, undefined, { w: 340, h: 540 })} /></Stack></Group>
    <Group name={es ? 'Vectores' : 'Vectors'}><Big icon="scatter" label="Al-OH vs crist." run={O('vector')} /></Group>
    <Group name={es ? 'Ventanas' : 'Windows'}><Stack><Small icon="dock" label={es ? 'Mosaico' : 'Tile'} run={tile} /><Small icon="history" label={t('history')} run={() => set({ histOpen: true })} /></Stack></Group>
  </>;
  else body = <>
    <Group name={es ? 'Datos' : 'Data'}><Big icon="import" label="KT-10" run={() => set({ wizard: 0 })} /></Group>
    <Group name={es ? 'Registros' : 'Logs'}><Big icon="magnet" label={es ? 'Petrofísica' : 'Petrophysics'} run={O('petro', {}, undefined, { w: 360, h: 540 })} /><Big icon="log" label={es ? 'Log espectral' : 'Spectral log'} run={O('speclog', {}, undefined, { w: 340, h: 540 })} /></Group>
    <Group name={es ? 'Gráficos' : 'Charts'}><Big icon="scatter" label={es ? 'Dispersión' : 'Scatter'} run={O('xy', { x: 'SiO2', y: 'K2O' })} /></Group>
  </>;
  const areaTabs: [string, string][] = module === 'geo' ? (['data', 'litho', 'explo', 'maps'] as AreaId[]).map(a => [a, t(`area.${a}` as TKey)]) : [[module, t(module as TKey)]];
  return <div className="rb">
    <div className="rb-tabs" role="tablist">
      {areaTabs.map(([id, l]) => <button key={id} role="tab" className="rb-tab" aria-selected={shown === 'area' && (module !== 'geo' || area === id)} onClick={() => { if (module === 'geo') switchTo({ area: id as AreaId }); set({ ribbonTab: 'area' }); }}>{l}</button>)}
      {ctx.length > 0 && <span className="rb-sep" />}
      {ctx.map(c => <button key={c} role="tab" className="rb-tab rb-tab--ctx" aria-selected={shown === c} onClick={() => set({ ribbonTab: c })}>{t(`ctx.${c}` as TKey)}</button>)}
      <span style={{ flex: 1 }} />
      <span className="rb-legend"><i className="tb-dot" data-st="partial" />{t('partial')}<i className="tb-dot" data-st="off" />{t('unavailable')}</span>
    </div>
    <div className="px-ribbon">{body}</div>
  </div>;
}

/* ---------------- floating window ---------------- */
function FloatingWindow({ win, active }: { win: Win; active: boolean }) {
  const patch = useApp(s => s.patchWin), focus = useApp(s => s.focus), close = useApp(s => s.close), set = useApp(s => s.set), refTool = useApp(s => s.refTool); const t = useT();
  const prev = useRef<Partial<Win> | null>(null);
  const drag = (e: React.PointerEvent, kind: 'move' | 'resize') => {
    if ((e.target as HTMLElement).closest('button') && kind === 'move') return;
    e.preventDefault(); focus(win.id);
    const sx = e.clientX, sy = e.clientY, { x, y, w, h } = win; const { w: cw, h: ch } = canvasSize();
    const mv = (ev: PointerEvent) => { const dx = ev.clientX - sx, dy = ev.clientY - sy; if (kind === 'move') patch(win.id, { x: Math.max(-w + 80, Math.min(cw - 80, x + dx)), y: Math.max(0, Math.min(ch - 32, y + dy)) }); else patch(win.id, { w: Math.max(260, w + dx), h: Math.max(180, h + dy) }); };
    const upf = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', upf); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', upf);
  };
  const max = () => { if (prev.current) { patch(win.id, prev.current); prev.current = null; return; } prev.current = { x: win.x, y: win.y, w: win.w, h: win.h }; const { w, h } = canvasSize(); patch(win.id, { x: 8, y: 8, w: w - 16, h: h - 16 }); };
  if (win.min) return null;
  const refWin = useApp(s => s.refWin); const refOn = !!refTool && refWin === win.id;
  return <section className={`px-win ${active ? 'px-win--active' : ''}`} style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }} onPointerDownCapture={() => focus(win.id)}>
    <div className="px-win__bar" onPointerDown={e => drag(e, 'move')} onDoubleClick={max}>
      <Icon name={WIN_ICON[win.type]} size={15} className="px-win__ico" />
      <div className="px-win__title"><WinTitle win={win} /></div>
      {win.opts.ref && REFS[win.opts.ref] && <button className={`px-win__ctl ref-btn ${refOn ? 'on' : ''}`} title={t('reference')} onClick={() => set(refOn ? { refTool: null } : { refTool: win.opts.ref, refWin: win.id })}>ⓘ</button>}
      <button className="px-win__ctl" title="Minimizar" onClick={() => patch(win.id, { min: true })}><Icon name="min" size={14} /></button>
      <button className="px-win__ctl" title="Maximizar" onClick={max}><Icon name="max" size={14} /></button>
      <button className="px-win__ctl" title={t('close')} onClick={() => close(win.id)}><Icon name="close" size={14} /></button>
    </div>
    <div className="px-win__body"><WindowBody win={win} /></div>
    <div className="px-win__rs" onPointerDown={e => drag(e, 'resize')} />
  </section>;
}

/* ---------------- reference card ---------------- */
function RefCardView() {
  const id = useApp(s => s.refTool), win = useApp(s => s.windows.find(w => w.id === s.refWin)), set = useApp(s => s.set); const L = useL(), t = useT();
  if (!id || !REFS[id]) return null; const r = REFS[id];
  const { w: cw } = canvasSize(); const W = 360; let left = win ? win.x + win.w + 10 : cw - W - 16; if (left + W > cw - 8) left = win ? Math.max(8, win.x + win.w - W - 10) : cw - W - 16; const top = win ? Math.max(8, win.y + 40) : 16;
  return <aside className="refc" style={{ left, top, zIndex: 9400 }}>
    <div className="refc-h"><Icon name="library" size={16} /><b>{L(r.title)}</b><button className="px-win__ctl" onClick={() => set({ refTool: null })}><Icon name="close" size={13} /></button></div>
    <div className="refc-b">
      <div className="refc-s">{t('whatItMeasures')}</div><p>{L(r.what)}</p>{r.formula && <div className="px-code refc-f">{r.formula}</div>}
      <div className="refc-s">{t('interpretation')}</div><p>{L(r.interp)}</p>
      {r.cases && <><div className="refc-s">{t('cases')}</div><ul>{r.cases.map((c, k) => <li key={k}>{L(c)}</li>)}</ul></>}
      <div className="refc-s">{t('caveats')}</div><p className="refc-warn"><Icon name="warn" size={13} />{L(r.caveats)}</p>
      <div className="refc-s">{t('references')}</div><ol className="refc-refs">{r.refs.map((x, k) => <li key={k}>{x}</li>)}</ol>
      <a className="px-btn px-btn--sm" href={`https://scholar.google.com/scholar?q=${encodeURIComponent(r.refs[0].slice(0, 140))}`} target="_blank" rel="noreferrer"><Icon name="search" size={13} />{t('openRef')}</a>
      <p className="refc-draft">{t('draft')}</p>
    </div>
  </aside>;
}

/* ---------------- canvas ---------------- */
function SmartStart() {
  const t = useT(); const module = useApp(s => s.module), area = useApp(s => s.area); const L = useL();
  const ids = module === 'geo' ? AREA_RIBBON[area].map(g => g.items.find(i => typeof i === 'string' && !i.startsWith('gal:')) as string).filter(Boolean).slice(0, 4) : [];
  return <div className="ss"><h2>{t('emptyTitle')}</h2><p className="muted">{t('emptySub')}</p><div className="ss-grid">{ids.map(id => <button key={id} className="ss-card" onClick={() => TOOLS[id].run()}><Icon name={TOOLS[id].icon} size={28} /><b>{L(TOOLS[id].label)}</b></button>)}</div><button className="px-btn" onClick={() => seed(wsKey())}>{t('restore')}</button></div>;
}
function SelectionBar() {
  const sel = useApp(s => s.selection), isolate = useApp(s => s.isolate), set = useApp(s => s.set), select = useApp(s => s.select), createClass = useApp(s => s.createClass);
  const R = useResolved(); const module = useApp(s => s.module); const t = useT();
  const hist = useApp(s => s.histOpen);
  if (!sel.length || module === 'spec' || hist) return null;
  const byCat = new Map<string, number>(); for (const i of sel) { const c = R.vis[i].cat; byCat.set(c, (byCat.get(c) ?? 0) + 1); }
  return <div className="px-selbar sb">
    <b>{sel.length} {t('selectedN')}</b>
    <span className="sb-cats">{[...byCat].slice(0, 4).map(([c, n]) => <span key={c} title={c}><i style={{ background: R.cats.find(x => x.name === c)?.color }} />{n}</span>)}</span>
    <button className="pri" onClick={createClass}><Icon name="classify" size={14} />{t('createClass')}</button>
    <button onClick={() => set({ isolate: !isolate })}><Icon name="filter" size={14} />{isolate ? t('showAll') : t('isolate')}</button>
    <button onClick={() => select(SAMPLES.map(s => s.i).filter(i => !sel.includes(i)))}>{t('invert')}</button>
    <button title={t('clear')} onClick={() => set({ selection: [], isolate: false })}><Icon name="close" size={14} /></button>
  </div>;
}
function Canvas() {
  const windows = useApp(s => s.windows), activeId = useApp(s => s.activeId), patch = useApp(s => s.patchWin), focus = useApp(s => s.focus), toast = useApp(s => s.toast);
  const mins = windows.filter(w => w.min);
  return <main className="px-canvas">
    {windows.map(w => <FloatingWindow key={w.id} win={w} active={w.id === activeId} />)}
    {windows.length === 0 && <SmartStart />}
    {mins.length > 0 && <div className="cv-mins">{mins.map(w => <button key={w.id} onClick={() => { patch(w.id, { min: false }); focus(w.id); }}><Icon name={WIN_ICON[w.type]} size={14} /><WinTitle win={w} /></button>)}</div>}
    <RefCardView />
    <SelectionBar />
    <Flyout side="left" /><InspectorFly /><HistoryDrawer />
    {toast && <div className="toast" role="status"><Icon name="check" size={16} />{toast}</div>}
  </main>;
}

/* ---------------- contextual panels ---------------- */
function SpectraList() {
  const f = useApp(s => s.focusInterval), set = useApp(s => s.set); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector('.tr--on')?.scrollIntoView({ block: 'nearest' }); }, [f]);
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const d of DDH) m.set(d.mineral, (m.get(d.mineral) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); }, []);
  return <div className="pp" ref={ref}>
    <div className="pp-h">DDH-04</div>
    <div className="sl-bar">{counts.map(([m, n]) => <i key={m} title={`${MINERALS[m]?.label} · ${n}`} style={{ flex: n, background: MINERALS[m]?.color }} />)}</div>
    {DDH.map((d, k) => <div key={k} className={`tr ${k === f ? 'tr--on' : ''}`} onClick={() => set({ focusInterval: k })}><i className="ins-sw" style={{ background: MINERALS[d.mineral]?.color, width: 10, height: 10 }} /><span className="tr-l mono">{d.from.toFixed(0)}–{d.to.toFixed(0)} m</span><small className="muted">{MINERALS[d.mineral]?.label}</small></div>)}
  </div>;
}
const FLY: [Exclude<Fly, null>, PxIconName, TKey][] = [['project', 'project', 'rail.project'], ['style', 'sliders', 'rail.style'], ['layers', 'layers', 'rail.layers']];
function Rail() {
  const fly = useApp(s => s.fly), set = useApp(s => s.set), hist = useApp(s => s.histOpen), n = useApp(s => s.history.length), ins = useApp(s => s.insOpen); const t = useT();
  return <nav className="rail">
    {FLY.map(([k, ic, l]) => <button key={k} className={fly === k ? 'on' : ''} title={t(l)} onClick={() => set({ fly: fly === k ? null : k })}><Icon name={ic} size={19} /><span>{t(l)}</span></button>)}
    <span style={{ flex: 1 }} />
    <button className={ins ? 'on' : ''} title={t('rail.inspector')} onClick={() => set({ insOpen: !ins })}><Icon name="search" size={18} /><span>{t('rail.inspector')}</span></button>
    <button className={hist ? 'on' : ''} title={t('rail.history')} onClick={() => set({ histOpen: !hist })}><Icon name="history" size={18} /><span>{t('rail.history')}{n ? ` ${n}` : ''}</span></button>
  </nav>;
}
function FlyBody({ which }: { which: Exclude<Fly, null> }) {
  const module = useApp(s => s.module);
  return which === 'project' ? (module === 'spec' ? <SpectraList /> : <ProjectPanel />) : which === 'style' ? <Editor /> : <LayersPanel />;
}
function Flyout({ side, docked }: { side: 'left'; docked?: boolean }) {
  const fly = useApp(s => s.fly), pin = useApp(s => s.flyPin), set = useApp(s => s.set); const t = useT();
  if (!fly || (!!docked !== pin)) return null; void side;
  const title = FLY.find(f => f[0] === fly)!;
  return <aside className={`fly ${docked ? 'fly--docked' : ''}`}>
    <div className="fly-h"><Icon name={title[1]} size={15} /><b>{t(title[2])}</b><span style={{ flex: 1 }} /><button className={`px-win__ctl ${pin ? 'on' : ''}`} title={pin ? t('unpin') : t('pin')} onClick={() => set({ flyPin: !pin })}><Icon name="dock" size={14} /></button><button className="px-win__ctl" title={t('close')} onClick={() => set({ fly: null })}><Icon name="close" size={14} /></button></div>
    <div className="dk-body"><FlyBody which={fly} /></div>
  </aside>;
}
function InspectorFly({ docked }: { docked?: boolean }) {
  const on = useApp(s => s.insOpen), pin = useApp(s => s.insPin), set = useApp(s => s.set); const t = useT();
  if (!on || (!!docked !== pin)) return null;
  return <aside className={`ins-fly ${docked ? 'ins-fly--docked' : ''}`}>
    <div className="fly-h"><Icon name="search" size={15} /><b>{t('rail.inspector')}</b><span style={{ flex: 1 }} /><button className={`px-win__ctl ${pin ? 'on' : ''}`} title={pin ? t('unpin') : t('pin')} onClick={() => set({ insPin: !pin })}><Icon name="dock" size={14} /></button><button className="px-win__ctl" title={t('close')} onClick={() => set({ insOpen: false, insPin: false })}><Icon name="close" size={14} /></button></div>
    <div className="dk-body"><Inspector /></div>
  </aside>;
}
function HistoryDrawer() {
  const on = useApp(s => s.histOpen), set = useApp(s => s.set); const t = useT();
  if (!on) return null;
  return <aside className="hist-drawer"><div className="fly-h"><Icon name="history" size={15} /><b>{t('history')}</b><span style={{ flex: 1 }} /><button className="px-win__ctl" onClick={() => set({ histOpen: false })}><Icon name="close" size={14} /></button></div><div className="dk-body"><HistoryPanel /></div></aside>;
}
function Status() {
  const sel = useApp(s => s.selection.length), windows = useApp(s => s.windows.length), module = useApp(s => s.module), f = useApp(s => s.focusInterval), crs = useApp(s => s.projectCrs), set = useApp(s => s.set), n = useApp(s => s.history.length); const R = useResolved(); const t = useT();
  const vis = R.vis.filter(v => v.visible).length;
  return <footer className="px-status">
    <span className="it"><span className="px-dot" style={{ background: 'var(--success)' }} />{t('engine')}</span>
    {module === 'spec' ? <span className="it">DDH-04 · {DDH[f].from.toFixed(1)} m</span> : <><span className="it">{vis} / {SAMPLES.length} {t('visible')}</span><span className="it">{sel} {t('selectedN')}</span></>}
    <span className="it">{windows} {t('views')}</span><span className="sp" />
    <button className="st-btn" onClick={() => set({ histOpen: true })}><Icon name="history" size={13} />{t('history')} · {n}</button>
    <button className="st-btn" title={t('projectCrs')} onClick={() => set({ backstage: true, backPage: 'options' })}><Icon name="map" size={13} />{crsLabel(crs)}</button>
    <span className="it">wt% · ppm</span><span className="it mono">v2 · prototipo</span>
  </footer>;
}

/* ---------------- command palette ---------------- */
function Palette() {
  const on = useApp(s => s.palette), set = useApp(s => s.set), select = useApp(s => s.select), cols = useApp(s => s.columns); const L = useL(), t = useT();
  const [q, setQ] = useState(''); const [k, setK] = useState(0);
  useEffect(() => { if (on) { setQ(''); setK(0); } }, [on]);
  const items = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const areaOf = (id: string) => (Object.keys(AREA_RIBBON) as AreaId[]).find(a => AREA_RIBBON[a].some(g => g.items.flat().includes(id)))!;
    const tools = Object.values(TOOLS).filter(tl => !ql || L(tl.label).toLowerCase().includes(ql) || tl.id.includes(ql)).map(tl => { const a = availability(tl, cols); const ar = areaOf(tl.id); return { icon: tl.icon, t: L(tl.label), d: `${t(`area.${ar}` as TKey)}${a.state !== 'ok' ? ` · ${a.state === 'partial' ? t('partial') : t('unavailable')}` : ''}`, g: 'tools', run: () => { switchTo({ module: 'geo', area: ar }); setTimeout(() => (a.state === 'off' ? useApp.getState().notify(`${L(tl.label)} · ${a.missing.length ? `${t('missing')}: ${a.missing.join(', ')}` : L(a.reason!)}`) : tl.run()), 30); } }; });
    const samples = ql ? SAMPLES.filter(s => s.id.toLowerCase().includes(ql) || s.sector.toLowerCase().includes(ql)).slice(0, 6).map(s => ({ icon: 'drill' as PxIconName, t: s.id, d: `${s.sector} · ${tasName(s)}`, g: 'samples', run: () => select([s.i]) })) : [];
    const EXPLO_G = ['fert', 'alt', 'path', 'vector', 'models'];
    const cat = ql ? CATALOG.filter(e => `${e.name.es} ${e.name.en} ${e.ref} ${e.axes}`.toLowerCase().includes(ql)).slice(0, 6).map(e => ({ icon: 'library' as PxIconName, t: L(e.name), d: `${L(GROUP_NAME[e.g])} · ${e.ref} · ${L(ST_TXT[e.st])}`, g: 'catalog', run: () => { switchTo({ module: 'geo', area: EXPLO_G.includes(e.g) ? 'explo' : 'litho' }); setTimeout(() => runEntry(e), 30); } })) : [];
    return [...tools.slice(0, 7), ...cat, ...samples];
  }, [q, cols, L, t, select]);
  if (!on) return null;
  const run = (i: number) => { const it = items[i]; if (!it) return; set({ palette: false }); it.run(); };
  let lastG = '';
  return <div className="ov" onClick={() => set({ palette: false })}><div className="px-palette" onClick={e => e.stopPropagation()}>
    <div className="px-palette__in"><Icon name="search" size={18} /><input autoFocus value={q} placeholder="Sr/Y, Harker, IDW, OX-012…" onChange={e => { setQ(e.target.value); setK(0); }}
      onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setK(Math.min(items.length - 1, k + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setK(Math.max(0, k - 1)); } else if (e.key === 'Enter') run(k); else if (e.key === 'Escape') set({ palette: false }); }} /></div>
    <div style={{ maxHeight: 380, overflow: 'auto' }}>{items.map((it, i) => { const h = it.g !== lastG; lastG = it.g; return <div key={it.g + it.t}>{h && <div className="px-palette__grp">{it.g === 'tools' ? (useApp.getState().lang === 'es' ? 'Herramientas' : 'Tools') : it.g === 'catalog' ? (useApp.getState().lang === 'es' ? 'Catálogo de diagramas' : 'Diagram catalog') : (useApp.getState().lang === 'es' ? 'Muestras' : 'Samples')}</div>}<div className={`px-pitem ${i === k ? 'on' : ''}`} onMouseEnter={() => setK(i)} onClick={() => run(i)}><Icon name={it.icon} size={18} /><div className="t"><span>{it.t}</span><small>{it.d}</small></div></div></div>; })}</div>
    <div className="px-palette__foot"><span>↑↓</span><span>↵</span><span>Esc</span></div>
  </div></div>;
}

/* ---------------- diagram galleries (one per ribbon group) ---------------- */
const GAL_ICON: Record<string, PxIconName> = { tect: 'tas', petro: 'stats', models: 'cube' };
function GalBtn({ cat }: { cat: string }) {
  const gal = useApp(s => s.gallery), set = useApp(s => s.set); const L = useL(); const n = CATALOG.filter(e => e.g === cat).length;
  const label = cat === 'tect' ? { es: 'Diagramas tectónicos', en: 'Tectonic diagrams' } : cat === 'petro' ? { es: 'Petrogénesis', en: 'Petrogenesis' } : { es: 'Por depósito', en: 'By deposit' };
  return <button className="px-rbig" aria-pressed={gal?.cat === cat} onClick={e => { const r = (e.currentTarget.closest('.px-rgroup') as HTMLElement).getBoundingClientRect(); set({ gallery: gal?.cat === cat ? null : { cat, x: r.left } }); }}><Icon name={GAL_ICON[cat] ?? 'library'} size={26} /><span>{L(label)} <span className="caret">▾ {n}</span></span></button>;
}
const ST_TXT: Record<string, Txt> = { impl: { es: 'Implementado', en: 'Implemented' }, proto: { es: 'Prototipo', en: 'Prototype' }, plan: { es: 'Planificado', en: 'Planned' }, prop: { es: 'Propuesto', en: 'Proposed' } };
function Gallery() {
  const gal = useApp(s => s.gallery), set = useApp(s => s.set), cols = useApp(s => s.columns), lang = useApp(s => s.lang); const L = useL(), t = useT();
  const [q, setQ] = useState(''); const [only, setOnly] = useState(false);
  useEffect(() => { setQ(''); }, [gal?.cat]);
  if (!gal) return null;
  const all = CATALOG.filter(e => e.g === gal.cat);
  const rows = all.filter(e => { const s = `${e.name.es} ${e.name.en} ${e.axes} ${e.ref}`.toLowerCase(); return (!q || s.includes(q.toLowerCase())) && (!only || entryAvail(e, cols).state !== 'off'); });
  const subs: (Txt | undefined)[] = []; for (const e of rows) if (!subs.some(s => s?.es === e.sub?.es)) subs.push(e.sub);
  const usable = all.filter(e => entryAvail(e, cols).state !== 'off').length;
  const W = 640, left = Math.max(8, Math.min(gal.x, window.innerWidth - W - 12));
  const Row = (e: CatEntry) => { const a = entryAvail(e, cols); return <button key={e.id} className="gl-row" data-st={a.state} onClick={() => { set({ gallery: null }); runEntry(e); }} title={a.missing.length ? `${t('missing')}: ${a.missing.join(', ')}` : a.reason ? L(a.reason) : ''}>
    <span className="gl-main"><b>{L(e.name)}</b><small className="mono">{e.axes}</small><small>{e.ref}{e.note ? ` · ${L(e.note)}` : ''}</small></span>
    <span className={`gl-st gl-st--${e.st}`}>{L(ST_TXT[e.st])}</span>
    <span className={`st st--${a.state}`}>{a.state === 'ok' ? '✓' : a.state === 'partial' ? t('partial') : a.missing.length ? `${t('missing')} ${a.missing.slice(0, 2).join(', ')}${a.missing.length > 2 ? '…' : ''}` : t('unavailable')}</span>
  </button>; };
  return <><div className="gl-veil" onClick={() => set({ gallery: null })} /><div className="gl" style={{ left, width: W }}>
    <div className="gl-h"><Icon name="library" size={16} /><b>{L(GROUP_NAME[gal.cat])}</b><span className="muted">· {all.length} {lang === 'es' ? 'diagramas' : 'diagrams'} · {usable} {lang === 'es' ? 'utilizables con tus datos' : 'usable with your data'}</span><span style={{ flex: 1 }} /><button className="px-win__ctl" onClick={() => set({ gallery: null })}><Icon name="close" size={13} /></button></div>
    <div className="gl-f"><label className="bs-search" style={{ flex: 1 }}><Icon name="search" size={14} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={lang === 'es' ? 'Buscar por nombre, ejes o autor' : 'Search by name, axes or author'} /></label><label className="ly-sw"><input type="checkbox" checked={only} onChange={e => setOnly(e.target.checked)} />{lang === 'es' ? 'Solo compatibles con mis datos' : 'Only compatible with my data'}</label></div>
    <div className="gl-b">{subs.map(sb => <div key={sb?.es ?? '_'}>{sb && <div className="gl-sub">{L(sb)}</div>}{rows.filter(e => e.sub?.es === sb?.es).map(Row)}</div>)}{!rows.length && <p className="muted pp-empty">—</p>}</div>
    <div className="gl-foot"><span><span className="gl-st gl-st--impl">{L(ST_TXT.impl)}</span> {lang === 'es' ? 'en el repo' : 'in the repo'} · <span className="gl-st gl-st--proto">{L(ST_TXT.proto)}</span> {lang === 'es' ? 'navegable' : 'working'} · <span className="gl-st gl-st--prop">{L(ST_TXT.prop)}</span> {lang === 'es' ? 'ejes con tus datos, campos por digitalizar' : 'axes on your data, fields to digitise'}</span><span style={{ flex: 1 }} /><button className="px-btn px-btn--sm" onClick={() => { set({ gallery: null }); useApp.getState().notify(lang === 'es' ? 'PyOreX Hub: diagramas publicados por la comunidad (próxima fase).' : 'PyOreX Hub: community-published diagrams (next phase).'); }}><Icon name="library" size={13} />{lang === 'es' ? 'Explorar comunidad' : 'Browse community'}</button></div>
  </div></>;
}

/* ---------------- app ---------------- */
export default function App() {
  const theme = useApp(s => s.theme), set = useApp(s => s.set), flyPin = useApp(s => s.flyPin), fly = useApp(s => s.fly), insPin = useApp(s => s.insPin), insOpen = useApp(s => s.insOpen), lang = useApp(s => s.lang);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    seed('geo:litho');
    const ox = SAMPLES.filter(s => s.sector === 'Oxapampa' && s.SiO2 > 66).map(s => s.i).slice(0, 18);
    useApp.getState().select(ox); useApp.getState().set({ insOpen: false });
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); set({ palette: !useApp.getState().palette }); }
      else if (e.key === 'Escape') { const s = useApp.getState(); if (s.palette || s.backstage || s.wizard != null) set({ palette: false, backstage: false, wizard: null }); else if (s.refTool) set({ refTool: null }); else if (s.selection.length) set({ selection: [], isolate: false, insOpen: s.insPin }); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [set]);
  const cols = `44px ${flyPin && fly ? '304px ' : ''}minmax(0, 1fr)${insPin && insOpen ? ' 296px' : ''}`;
  return <div className="px app">
    <Header /><Ribbon />
    <div className="app-main" style={{ gridTemplateColumns: cols }}><Rail />{flyPin && fly && <Flyout side="left" docked />}<Canvas />{insPin && insOpen && <InspectorFly docked />}</div>
    <Status /><Palette /><Backstage /><ImportWizard /><Gallery />
  </div>;
}
