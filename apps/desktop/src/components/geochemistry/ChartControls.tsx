import { useGeochemistryStore } from '../../stores/geochemistry-store';
import { useGeoRegistryStore } from '../../stores/geochemistry-registry-store';
import { offersCapability } from '../../lib/geochemistry-registry';
import { PALETTES,DEFAULT_PRESENTATION,axisRange,type ChartPresentation,type PaletteName } from '../../lib/chart-presentation';
import { useShellStore } from '../../stores/shell-store';
import { useL } from '../../lib/i18n';

const field='h-7 rounded border border-line-strong bg-raised px-2 text-xs text-fg';
export default function ChartControls() {
  const L=useL();
  const p=useGeochemistryStore(s=>s.presentation);
  const toolId=useGeochemistryStore(s=>s.selectedTool);
  const spec=useGeoRegistryStore(s=>s.registry?.tools.find(t=>t.id===toolId));
  // Capabilities from the Tool Registry hide options the tool does not support; a control that is already switched on stays visible so it can be switched off.
  const offers=(capability:string,active:boolean)=>active||offersCapability(spec,capability);
  const update=(patch:Partial<ChartPresentation>)=>useGeochemistryStore.setState(s=>({presentation:{...s.presentation,...patch}}));
  const open=useShellStore(s=>s.chartControlsOpen);
  return <details open={open} onToggle={e=>{const o=(e.currentTarget as HTMLDetailsElement).open;if(o!==useShellStore.getState().chartControlsOpen)useShellStore.getState().setChartControlsOpen(o);}} className="group shrink-0 border-b border-line bg-panel px-4 py-2 text-xs text-muted"><summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted"><span className="text-[9px] transition-transform group-open:rotate-90">▶</span>{L({es:'Ejes, paleta y tamaño',en:'Axes, palette and size'})}<span className="font-normal normal-case tracking-normal text-subtle">{L({es:'· actualización inmediata',en:'· instant update'})}</span></summary>
    <div className="mt-3 flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1">{L({es:'Paleta',en:'Palette'})}<select aria-label={L({es:'Paleta',en:'Palette'})} className={field} value={p.palette} onChange={e=>update({palette:e.target.value as PaletteName})}>{Object.keys(PALETTES).map(name=><option key={name}>{name}</option>)}</select></label>
      <span className="flex gap-1 pb-1">{PALETTES[p.palette].map(c=><span key={c} className="h-4 w-4 rounded-sm border border-line" style={{background:c}}/>)}</span>
      <label className="flex flex-col gap-1">{L({es:'Tamaño automático',en:'Automatic size'})}<select aria-label={L({es:'Tamaño automático',en:'Automatic size'})} className={field} value={p.sizeMode} onChange={e=>{const mode=e.target.value as ChartPresentation['sizeMode'];update({sizeMode:mode,...(mode==='classes'&&useGeochemistryStore.getState().config?.size_column?{sizeSource:'column' as const}:{})});}}><option value="constant">{L({es:'Constante / manual',en:'Constant / manual'})}</option><option value="linear">{L({es:'Proporcional al valor',en:'Proportional to value'})}</option><option value="quantile">{L({es:'Tres clases por terciles',en:'Three classes by terciles'})}</option><option value="classes">{L({es:'Por clases (2–20, límites propios)',en:'By classes (2–20, custom limits)'})}</option></select></label>
      {p.sizeMode!=='classes'&&<label className="flex flex-col gap-1">{L({es:'Tamaño según',en:'Size by'})}<select aria-label={L({es:'Tamaño según',en:'Size by'})} className={field} value={p.sizeSource} onChange={e=>update({sizeSource:e.target.value as ChartPresentation['sizeSource']})}><option value="x">{L({es:'Valor X',en:'X value'})}</option><option value="y">{L({es:'Valor Y',en:'Y value'})}</option><option value="column">{L({es:'Columna del editor',en:'Editor column'})}</option></select></label>}
      <label className="flex flex-col gap-1">{L({es:'Opacidad',en:'Opacity'})}<input aria-label={L({es:'Opacidad',en:'Opacity'})} type="range" min="0.1" max="1" step="0.05" value={p.opacity} onChange={e=>update({opacity:Number(e.target.value)})}/></label>
      <label><input type="checkbox" checked={p.grid} onChange={e=>update({grid:e.target.checked})}/> {L({es:'Cuadrícula',en:'Grid'})}</label>
      <button className="text-accent-fg hover:underline" onClick={()=>update({...DEFAULT_PRESENTATION})}>{L({es:'Restablecer vista',en:'Reset view'})}</button>
    </div>
    {p.sizeMode==='classes'&&<p className="mt-2"><button className="text-accent-fg hover:underline" onClick={()=>useShellStore.getState().setFly('style')}>{L({es:'Editar clases y límites en el panel Estilo →',en:'Edit classes and limits in the Style panel →'})}</button></p>}
    <div className="mt-3 flex flex-wrap gap-4">{(['X','Y'] as const).map(axis=>{
      const isX=axis==='X',log=isX?p.logX:p.logY,min=isX?p.xMin:p.yMin,max=isX?p.xMax:p.yMax;
      const bad=(!!min||!!max)&&!axisRange(min,max,log);
      return <fieldset key={axis} className="flex flex-wrap items-center gap-2"><legend className="mb-1">{L({es:`Eje ${axis}`,en:`${axis} axis`})}</legend>{offers(isX?'log_x':'log_y',log)&&<label><input type="checkbox" checked={log} onChange={e=>update(isX?{logX:e.target.checked}:{logY:e.target.checked})}/> Log10</label>}<input aria-label={L({es:`Mínimo ${axis}`,en:`${axis} minimum`})} placeholder={L({es:'Mínimo auto',en:'Auto minimum'})} className={`${field} w-28`} value={min} onChange={e=>update(isX?{xMin:e.target.value}:{yMin:e.target.value})}/><input aria-label={L({es:`Máximo ${axis}`,en:`${axis} maximum`})} placeholder={L({es:'Máximo auto',en:'Auto maximum'})} className={`${field} w-28`} value={max} onChange={e=>update(isX?{xMax:e.target.value}:{yMax:e.target.value})}/>{bad&&<span className="text-warning">{log?L({es:'Introduce ambos límites crecientes y positivos.',en:'Enter both limits, increasing and positive.'}):L({es:'Introduce ambos límites crecientes.',en:'Enter both limits in increasing order.'})}</span>}</fieldset>;
    })}{offers('reverse_y',p.reverseY)&&<label className="self-end"><input type="checkbox" checked={p.reverseY} onChange={e=>update({reverseY:e.target.checked})}/> {L({es:'Invertir Y',en:'Reverse Y'})}</label>}</div>
    <p className="mt-2 text-subtle">{L({es:'Log10 no muestra valores ≤0. Probabilidad normal y downhole conservan sus convenciones de eje. Los atributos de puntos no alteran el cálculo estadístico.',en:'Log10 does not show values ≤0. Normal probability and downhole plots keep their own axis conventions. Point attributes do not change the statistical calculation.'})}</p>
  </details>;
}
