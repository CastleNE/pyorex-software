import { useRef, useState, type ReactNode } from 'react';
import Icon, { type PxIconName } from './Icon';
import { NUM_VARS, SAMPLES, numVar } from './data';
import { useApp, DEFAULT_STYLE, type CatVar, type Style } from './store';
import { CAT_LABEL, useResolved } from './resolve';
import { CATEGORICAL, RAMPS, SHAPES, SHAPE_LABEL, fmt, histogram, rampCss, symbolPath, type ClassMethod, type Shape } from './viz';

const Sec = ({ title, right, children, open = true }: { title: string; right?: ReactNode; children: ReactNode; open?: boolean }) =>
  <details open={open} className="ed-sec"><summary><span className="ed-caret">▶</span>{title}{right && <span style={{ marginLeft: 'auto' }} onClick={e => e.preventDefault()}>{right}</span>}</summary><div className="ed-body">{children}</div></details>;
const Seg = <T extends string>({ value, options, onChange }: { value: T; options: [T, string, PxIconName?][]; onChange: (v: T) => void }) =>
  <div className="px-seg">{options.map(([v, l, ic]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{ic && <Icon name={ic} size={13} />}{l}</button>)}</div>;
const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="px-field"><span className="px-label">{label}</span>{children}</label>;
const VarSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <select className="px-select2" value={value} onChange={e => onChange(e.target.value)}>{NUM_VARS.map(v => <option key={v.key} value={v.key}>{v.label}{v.unit ? ` (${v.unit})` : ''}</option>)}</select>;
const Sym = ({ shape, color, size = 14, hollow }: { shape: Shape; color: string; size?: number; hollow?: boolean }) => <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}><path d={symbolPath(shape, size * 0.72)} fill={hollow ? 'none' : color} stroke={hollow ? color : 'rgba(0,0,0,.25)'} strokeWidth={hollow ? 1.5 : 0.6} /></svg>;

function Popover({ anchor, onClose, children }: { anchor: DOMRect; onClose: () => void; children: ReactNode }) {
  return <><div style={{ position: 'fixed', inset: 0, zIndex: 900 }} onClick={onClose} /><div className="px-pop" style={{ left: Math.min(anchor.left, window.innerWidth - 236), top: Math.min(anchor.bottom + 4, window.innerHeight - 240) }}>{children}</div></>;
}

export default function Editor() {
  const style = useApp(s => s.style), setStyle = useApp(s => s.setStyle), user = useApp(s => s.userClasses), notify = useApp(s => s.notify), log = useApp(s => s.log);
  const R = useResolved(); const [channel, setChannel] = useState<'color' | 'shape' | 'size'>('color');
  const [pop, setPop] = useState<{ kind: 'color' | 'shape'; key: string; rect: DOMRect } | null>(null);
  const up = (f: (s: Style) => Style) => setStyle(f);
  const C = (p: Partial<Style['color']>) => up(s => ({ ...s, color: { ...s.color, ...p } }));
  const S = (p: Partial<Style['shape']>) => up(s => ({ ...s, shape: { ...s.shape, ...p } }));
  const Z = (p: Partial<Style['size']>) => up(s => ({ ...s, size: { ...s.size, ...p } }));
  const cv = style.color.catVar; const catVars: CatVar[] = Object.keys(user).length ? ['sector', 'tas', 'user'] : ['sector', 'tas'];
  const move = (name: string, d: -1 | 1) => up(s => { const list = R.cats.map(c => c.name); const k = list.indexOf(name), j = k + d; if (j < 0 || j >= list.length) return s; [list[k], list[j]] = [list[j], list[k]]; return { ...s, order: { ...s.order, [cv]: list } }; });
  const linked = style.shape.mode === 'category' && style.shape.catVar === cv;

  const catTable = <div className="px-classes">{R.cats.map((k, idx) => {
    const key = `${cv}:${k.name}`; const hidden = !!style.hidden[key];
    return <div key={k.name} className="px-class ed-cat" style={{ opacity: hidden ? 0.5 : 1 }}>
      <input type="checkbox" checked={!hidden} onChange={() => up(s => ({ ...s, hidden: { ...s.hidden, [key]: !hidden } }))} aria-label={`Mostrar ${k.name}`} />
      <button className="ed-swatch" title="Color" onClick={e => setPop({ kind: 'color', key, rect: e.currentTarget.getBoundingClientRect() })} style={{ background: k.color }} />
      <button className="ed-shape" title="Forma" disabled={!linked} onClick={e => setPop({ kind: 'shape', key: `${style.shape.catVar}:${k.name}`, rect: e.currentTarget.getBoundingClientRect() })}><Sym shape={linked ? k.shape : style.shape.fixed} color={k.color} hollow={style.shape.hollow} /></button>
      <span className="ed-name" title={k.name}>{k.name}</span><span className="px-num">{k.n}</span>
      <span className="ed-order"><button title="Dibujar encima" disabled={idx === 0} onClick={() => move(k.name, -1)}><Icon name="up" size={12} /></button><button title="Dibujar debajo" disabled={idx === R.cats.length - 1} onClick={() => move(k.name, 1)}><Icon name="down" size={12} /></button></span>
    </div>;
  })}</div>;

  return <div className="ed">
    <div className="ed-head">
      <div className="px-row" style={{ gap: 6 }}><Icon name="sliders" size={16} className="acc" /><b>Estilo de muestras</b><span className="px-chip" style={{ marginLeft: 'auto' }}>{SAMPLES.length - R.vis.filter(v => !v.visible).length} / {SAMPLES.length} visibles</span></div>
      <p className="muted" style={{ fontSize: 11.5, margin: '4px 0 0' }}>Se aplica a todos los gráficos abiertos. Color, forma y tamaño son independientes.</p>
      <div className="ed-tabs">{([['color', 'Color', 'palette'], ['shape', 'Forma', 'shapes'], ['size', 'Tamaño', 'size']] as const).map(([k, l, ic]) =>
        <button key={k} aria-pressed={channel === k} onClick={() => setChannel(k)}><Icon name={ic} size={15} /><span>{l}</span><small>{k === 'color' ? ({ fixed: 'fijo', category: CAT_LABEL[cv], value: style.color.valueVar } as any)[style.color.mode] : k === 'shape' ? (style.shape.mode === 'fixed' ? SHAPE_LABEL[style.shape.fixed] : CAT_LABEL[style.shape.catVar]) : style.size.mode === 'fixed' ? `${style.size.fixed} px` : style.size.valueVar}</small></button>)}</div>
    </div>
    <div className="ed-scroll">
      {channel === 'color' && <>
        <Sec title="Color por"><Seg value={style.color.mode} onChange={m => C({ mode: m })} options={[['fixed', 'Fijo'], ['category', 'Categoría'], ['value', 'Valor']]} />
          {style.color.mode === 'fixed' && <div className="ed-palette">{CATEGORICAL['Okabe–Ito'].concat(['#1b2530', '#ffffff']).map(c => <button key={c} style={{ background: c }} aria-pressed={style.color.fixed === c} onClick={() => C({ fixed: c })} />)}<input type="color" value={style.color.fixed} onChange={e => C({ fixed: e.target.value })} /></div>}
          {style.color.mode === 'category' && <>
            <Field label="Variable"><select className="px-select2" value={cv} onChange={e => { const v = e.target.value as CatVar; up(s => ({ ...s, color: { ...s.color, catVar: v }, shape: s.shape.mode === 'category' ? { ...s.shape, catVar: v } : s.shape })); }}>{catVars.map(v => <option key={v} value={v}>{CAT_LABEL[v]}</option>)}</select></Field>
            <Field label="Paleta"><div className="ed-palettes">{Object.entries(CATEGORICAL).map(([name, cols]) => <button key={name} aria-pressed={style.color.palette === name} onClick={() => up(s => ({ ...s, color: { ...s.color, palette: name, overrides: {} } }))} title={name}>{cols.slice(0, 6).map(c => <i key={c} style={{ background: c }} />)}<span>{name}</span></button>)}</div></Field>
          </>}
          {style.color.mode === 'value' && <ValueColor />}
        </Sec>
        {style.color.mode === 'category' && <Sec title={`Categorías · ${CAT_LABEL[cv]}`} right={<button className="ed-link" onClick={() => up(s => ({ ...s, hidden: {}, order: { ...s.order, [cv]: [] }, color: { ...s.color, overrides: {} }, shape: { ...s.shape, overrides: {} } }))}>Restablecer</button>}>
          <p className="ed-hint">Ojo: oculta sin borrar · color y forma por clase · flechas: orden de dibujo (arriba se dibuja encima).</p>
          {catTable}
          <div className="px-row" style={{ gap: 6 }}><button className="px-btn px-btn--sm" onClick={() => up(s => { const h = { ...s.hidden }; R.cats.forEach(c => (h[`${cv}:${c.name}`] = false)); return { ...s, hidden: h }; })}>Mostrar todas</button><button className="px-btn px-btn--sm" onClick={() => up(s => { const h = { ...s.hidden }; R.cats.forEach(c => (h[`${cv}:${c.name}`] = !h[`${cv}:${c.name}`])); return { ...s, hidden: h }; })}>Invertir</button></div>
        </Sec>}
      </>}
      {channel === 'shape' && <>
        <Sec title="Forma por"><Seg value={style.shape.mode} onChange={m => S({ mode: m })} options={[['fixed', 'Fija'], ['category', 'Categoría']]} />
          {style.shape.mode === 'fixed' ? <div className="ed-shapes">{SHAPES.map(sh => <button key={sh} aria-pressed={style.shape.fixed === sh} title={SHAPE_LABEL[sh]} onClick={() => S({ fixed: sh })}><Sym shape={sh} color="var(--brand)" size={18} hollow={style.shape.hollow} /></button>)}</div>
            : <Field label="Variable"><select className="px-select2" value={style.shape.catVar} onChange={e => S({ catVar: e.target.value as CatVar })}>{catVars.map(v => <option key={v} value={v}>{CAT_LABEL[v]}</option>)}</select></Field>}
          <label className="px-inline"><input type="checkbox" checked={style.shape.hollow} onChange={e => S({ hollow: e.target.checked })} />Símbolos huecos (contorno)</label>
          {style.shape.mode === 'category' && style.shape.catVar !== cv && <p className="ed-hint">La forma sigue «{CAT_LABEL[style.shape.catVar]}» y el color «{style.color.mode === 'category' ? CAT_LABEL[cv] : style.color.mode === 'value' ? style.color.valueVar : 'fijo'}»: dos variables en un mismo gráfico.</p>}
        </Sec>
        {style.shape.mode === 'category' && style.shape.catVar === cv && style.color.mode === 'category' && <Sec title="Categorías">{catTable}</Sec>}
      </>}
      {channel === 'size' && <Sec title="Tamaño por"><Seg value={style.size.mode} onChange={m => Z({ mode: m })} options={[['fixed', 'Fijo'], ['value', 'Valor']]} />
        {style.size.mode === 'fixed' ? <Field label={`Tamaño · ${style.size.fixed} px`}><input type="range" min={3} max={22} value={style.size.fixed} onChange={e => Z({ fixed: +e.target.value })} /></Field> : <>
          <Field label="Variable"><VarSelect value={style.size.valueVar} onChange={v => Z({ valueVar: v })} /></Field>
          <div className="px-row" style={{ gap: 10 }}><Field label={`Mín · ${style.size.min}`}><input type="range" min={2} max={12} value={style.size.min} onChange={e => Z({ min: +e.target.value })} /></Field><Field label={`Máx · ${style.size.max}`}><input type="range" min={8} max={34} value={style.size.max} onChange={e => Z({ max: +e.target.value })} /></Field></div>
          <label className="px-inline"><input type="checkbox" checked={style.size.log} onChange={e => Z({ log: e.target.checked })} />Escala logarítmica</label>
          <div className="ed-sizeprev">{[0, 0.25, 0.5, 0.75, 1].map(t => { const s = style.size.min + (style.size.max - style.size.min) * Math.sqrt(t); return <svg key={t} width={s + 2} height={s + 2}><circle cx={s / 2 + 1} cy={s / 2 + 1} r={s / 2} fill="var(--brand)" opacity={0.7} /></svg>; })}</div>
          <p className="ed-hint">Área proporcional al valor (no el diámetro), como recomienda la cartografía.</p></>}
      </Sec>}
      <Sec title="Apariencia general" open={false}>
        <Field label={`Opacidad de relleno · ${Math.round(style.opacity * 100)} %`}><input type="range" min={0.1} max={1} step={0.05} value={style.opacity} onChange={e => up(s => ({ ...s, opacity: +e.target.value }))} /></Field>
        <Field label="Contorno"><Seg value={style.outline} onChange={v => up(s => ({ ...s, outline: v }))} options={[['auto', 'Auto'], ['dark', 'Oscuro'], ['light', 'Claro'], ['none', 'Sin']]} /></Field>
      </Sec>
      <div className="px-row" style={{ gap: 6, padding: '10px 12px' }}>
        <button className="px-btn px-btn--sm" onClick={() => { log({ icon: 'palette', title: 'Guardar estilo', detail: 'tesis.pyxstyle', code: 'style.save("tesis.pyxstyle")' }); notify('Estilo guardado como «tesis.pyxstyle». Se podrá aplicar a cualquier proyecto.'); }}><Icon name="export" size={14} />Guardar estilo</button>
        <button className="px-btn px-btn--sm px-btn--ghost" onClick={() => setStyle(() => DEFAULT_STYLE)}>Restablecer todo</button>
      </div>
    </div>
    {pop && <Popover anchor={pop.rect} onClose={() => setPop(null)}>
      {pop.kind === 'color' ? <><div className="px-label" style={{ marginBottom: 6 }}>Color</div><div className="ed-palette">{[...CATEGORICAL['Okabe–Ito'], ...CATEGORICAL['Tableau 10'], '#1b2530', '#ffffff'].map(c => <button key={c} style={{ background: c }} onClick={() => { C({ overrides: { ...style.color.overrides, [pop.key]: c } }); setPop(null); }} />)}</div>
        <label className="px-inline" style={{ marginTop: 8 }}>Personalizado <input type="color" onChange={e => C({ overrides: { ...style.color.overrides, [pop.key]: e.target.value } })} /></label></>
        : <><div className="px-label" style={{ marginBottom: 6 }}>Forma</div><div className="ed-shapes">{SHAPES.map(sh => <button key={sh} title={SHAPE_LABEL[sh]} onClick={() => { S({ overrides: { ...style.shape.overrides, [pop.key]: sh } }); setPop(null); }}><Sym shape={sh} color="var(--brand)" size={18} /></button>)}</div></>}
    </Popover>}
  </div>;
}

function ValueColor() {
  const style = useApp(s => s.style), setStyle = useApp(s => s.setStyle); const R = useResolved(); const c = style.color;
  const C = (p: Partial<Style['color']>) => setStyle(s => ({ ...s, color: { ...s.color, ...p } }));
  const v = numVar(c.valueVar); const vals = SAMPLES.map(s => v.get(s)).filter((x): x is number => x != null && (!c.log || x > 0));
  const T = (x: number) => (c.log ? Math.log10(x) : x), TI = (x: number) => (c.log ? 10 ** x : x);
  const lo = Math.min(...vals.map(T)), hi = Math.max(...vals.map(T)); const nb = 32; const h = histogram(vals.map(T), nb, lo, hi); const mx = Math.max(...h);
  const W = 252, H = 70; const X = (t: number) => ((t - lo) / (hi - lo || 1)) * W;
  const svg = useRef<SVGSVGElement>(null); const [dragK, setDragK] = useState<number | null>(null);
  const onMove = (e: React.PointerEvent) => { if (dragK == null || !svg.current) return; const r = svg.current.getBoundingClientRect(); const t = lo + ((e.clientX - r.left) / r.width) * (hi - lo); const br = [...R.breaks]; br[dragK] = TI(Math.max(lo, Math.min(hi, t))); br.sort((a, b) => a - b); C({ method: 'manual', manual: br }); };
  return <>
    <Field label="Variable"><VarSelect value={c.valueVar} onChange={x => C({ valueVar: x, manual: null, method: c.method === 'manual' ? 'quantile' : c.method })} /></Field>
    <Field label="Rampa"><div className="ed-ramps">{Object.entries(RAMPS).map(([k, r]) => <button key={k} aria-pressed={c.ramp === k} title={r.label} onClick={() => C({ ramp: k })}><i style={{ background: rampCss(k, c.reverse) }} /><span>{r.label}</span></button>)}</div></Field>
    <div className="px-row" style={{ gap: 12 }}><label className="px-inline"><input type="checkbox" checked={c.reverse} onChange={e => C({ reverse: e.target.checked })} />Invertir</label><label className="px-inline"><input type="checkbox" checked={c.log} onChange={e => C({ log: e.target.checked, manual: null })} />Escala log</label></div>
    <Field label="Clasificación"><select className="px-select2" value={c.method} onChange={e => C({ method: e.target.value as ClassMethod, manual: null })}><option value="continuous">Continua (gradiente)</option><option value="quantile">Cuantiles</option><option value="equal">Intervalos iguales</option><option value="jenks">Cortes naturales (Jenks)</option><option value="manual">Manual (arrastra los cortes)</option></select></Field>
    {c.method !== 'continuous' && <Field label={`Clases · ${c.n}`}><input type="range" min={2} max={9} value={c.manual ? c.manual.length + 1 : c.n} onChange={e => C({ n: +e.target.value, manual: null, method: c.method === 'manual' ? 'quantile' : c.method })} /></Field>}
    <div className="ed-hist">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" onPointerMove={onMove} onPointerUp={() => setDragK(null)} onPointerLeave={() => setDragK(null)} style={{ touchAction: 'none' }}>
        {h.map((n, k) => { const mid = TI(lo + ((k + 0.5) / nb) * (hi - lo)); return <rect key={k} x={(k / nb) * W + 0.5} width={W / nb - 1} y={H - 4 - (n / mx) * (H - 10)} height={(n / mx) * (H - 10)} fill={R.valueColor(mid)} rx={1} />; })}
        {c.method !== 'continuous' && R.breaks.map((b, k) => <g key={k} style={{ cursor: 'ew-resize' }} onPointerDown={e => { (e.target as Element).setPointerCapture(e.pointerId); setDragK(k); }}><line x1={X(T(b))} x2={X(T(b))} y1={0} y2={H} stroke="var(--text)" strokeWidth={1.2} strokeDasharray="3 2" /><rect x={X(T(b)) - 5} y={0} width={10} height={H} fill="transparent" /><circle cx={X(T(b))} cy={5} r={4} fill="var(--bg-raised)" stroke="var(--text)" /></g>)}
      </svg>
      <div className="mono muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5 }}><span>{fmt(TI(lo))}</span><span>{v.label} {v.unit}</span><span>{fmt(TI(hi))}</span></div>
    </div>
    {c.method !== 'continuous' && <div className="px-classes">{R.classColors.map((col, k) => { const hid = !!style.hiddenClasses[k]; return <div key={k} className="px-class" style={{ gridTemplateColumns: '14px 14px 1fr auto', opacity: hid ? 0.5 : 1 }}>
      <input type="checkbox" checked={!hid} onChange={() => setStyle(s => ({ ...s, hiddenClasses: { ...s.hiddenClasses, [k]: !hid } }))} /><span style={{ width: 14, height: 14, borderRadius: 3, background: col }} />
      <span className="mono" style={{ fontSize: 11.5 }}>{k === 0 ? `< ${fmt(R.breaks[0])}` : k === R.breaks.length ? `≥ ${fmt(R.breaks[k - 1])}` : `${fmt(R.breaks[k - 1])} – ${fmt(R.breaks[k])}`}</span><span className="px-num">{R.classCounts[k]}</span></div>; })}</div>}
    <p className="ed-hint">Arrastra los cortes sobre el histograma para fijarlos a mano (umbrales de anomalía, límites de laboratorio).</p>
  </>;
}
