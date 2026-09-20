import { useGeochemistryStore } from '../../stores/geochemistry-store';
import { PALETTES,DEFAULT_PRESENTATION,axisRange,type ChartPresentation,type PaletteName } from '../../lib/chart-presentation';

const field='rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-200';
export default function ChartControls() {
  const p=useGeochemistryStore(s=>s.presentation);
  const update=(patch:Partial<ChartPresentation>)=>useGeochemistryStore.setState(s=>({presentation:{...s.presentation,...patch}}));
  return <details className="shrink-0 border-b border-zinc-700 px-4 py-2 text-xs text-zinc-400"><summary className="cursor-pointer text-sky-300">Ejes, paleta y tamaño · actualización inmediata</summary>
    <div className="mt-3 flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1">Paleta<select aria-label="Paleta" className={field} value={p.palette} onChange={e=>update({palette:e.target.value as PaletteName})}>{Object.keys(PALETTES).map(name=><option key={name}>{name}</option>)}</select></label>
      <span className="flex gap-1 pb-1">{PALETTES[p.palette].map(c=><span key={c} className="h-4 w-4 rounded" style={{background:c}}/>)}</span>
      <label className="flex flex-col gap-1">Tamaño automático<select aria-label="Tamaño automático" className={field} value={p.sizeMode} onChange={e=>update({sizeMode:e.target.value as ChartPresentation['sizeMode']})}><option value="constant">Constante / manual</option><option value="linear">Proporcional al valor</option><option value="quantile">Tres clases por terciles</option></select></label>
      <label className="flex flex-col gap-1">Tamaño según<select aria-label="Tamaño según" className={field} value={p.sizeSource} onChange={e=>update({sizeSource:e.target.value as ChartPresentation['sizeSource']})}><option value="x">Valor X</option><option value="y">Valor Y</option><option value="column">Columna del editor</option></select></label>
      <label className="flex flex-col gap-1">Opacidad<input aria-label="Opacidad" type="range" min="0.1" max="1" step="0.05" value={p.opacity} onChange={e=>update({opacity:Number(e.target.value)})}/></label>
      <label><input type="checkbox" checked={p.grid} onChange={e=>update({grid:e.target.checked})}/> Cuadrícula</label>
      <button className="text-sky-300" onClick={()=>update({...DEFAULT_PRESENTATION})}>Restablecer vista</button>
    </div>
    <div className="mt-3 flex flex-wrap gap-4">{(['X','Y'] as const).map(axis=>{
      const isX=axis==='X',log=isX?p.logX:p.logY,min=isX?p.xMin:p.yMin,max=isX?p.xMax:p.yMax;
      const bad=(!!min||!!max)&&!axisRange(min,max,log);
      return <fieldset key={axis} className="flex flex-wrap items-center gap-2"><legend className="mb-1">Eje {axis}</legend><label><input type="checkbox" checked={log} onChange={e=>update(isX?{logX:e.target.checked}:{logY:e.target.checked})}/> Log10</label><input aria-label={`Mínimo ${axis}`} placeholder="Mínimo auto" className={`${field} w-28`} value={min} onChange={e=>update(isX?{xMin:e.target.value}:{yMin:e.target.value})}/><input aria-label={`Máximo ${axis}`} placeholder="Máximo auto" className={`${field} w-28`} value={max} onChange={e=>update(isX?{xMax:e.target.value}:{yMax:e.target.value})}/>{bad&&<span className="text-amber-300">Introduce ambos límites crecientes{log?' y positivos':''}.</span>}</fieldset>;
    })}<label className="self-end"><input type="checkbox" checked={p.reverseY} onChange={e=>update({reverseY:e.target.checked})}/> Invertir Y</label></div>
    <p className="mt-2 text-zinc-500">Log10 no muestra valores ≤0. Probabilidad normal y downhole conservan sus convenciones de eje. Los atributos de puntos no alteran el cálculo estadístico.</p>
  </details>;
}
