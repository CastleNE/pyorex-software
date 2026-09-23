import AttributeEditor from './AttributeEditor';
import SessionControls from './SessionControls';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import { useGeoRegistryStore } from '../../stores/geochemistry-registry-store';
import { inferUnit, type GeoUnit } from '../../lib/geochemistry-api';
import { allowedRolesFor, compatibleGroupColumns, compatibleInputColumns } from '../../lib/semantic-roles';

const selectClass='w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 focus:border-blue-400';
export default function Editor() {
  const state=useGeochemistryStore();const config=state.config;const tool=state.tools.find(t=>t.id===state.selectedTool);
  const registryTool=useGeoRegistryStore(s=>s.registry?.tools.find(t=>t.id===state.selectedTool));
  if(!config||!tool)return <aside className="w-80 shrink-0 border-r border-zinc-700 p-4 text-xs text-zinc-500">Editor · selecciona una herramienta</aside>;
  const numeric=state.columns.filter(c=>c.numeric);const selected=Object.keys(config.columns).length;const ready=tool.optional_inputs?selected>=2:selected===tool.inputs.length;
  const map=(key:string,value:string)=>{const columns={...config.columns};const units={...config.units};if(value){columns[key]=value;units[key]=inferUnit(value,tool.unit);}else{delete columns[key];delete units[key];}state.configure({columns,units});};
  const groupColumns=compatibleGroupColumns(state.columns,state.columnRoles,registryTool?.group_allowed_roles);
  return <aside className="flex w-80 shrink-0 flex-col border-r border-zinc-700 bg-zinc-900"><header className="border-b border-zinc-700 px-4 py-3"><h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Editor de atributos</h2><p className="mt-1 text-xs text-zinc-500">{tool.optional_inputs?'Elige al menos dos elementos':'Mapea todas las entradas'}</p></header>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <details open className="space-y-3"><summary className="cursor-pointer text-sm font-medium text-zinc-200">Variables y unidades</summary>
      {tool.inputs.map(key=>{
        const candidates=compatibleInputColumns(state.columns,state.columnRoles,allowedRolesFor(registryTool,key));
        return <div key={key} className="space-y-1"><label className="block text-xs text-zinc-400" htmlFor={`geo-${key}`}>{key==='FeTotal'?'Hierro total':key}</label><select id={`geo-${key}`} value={config.columns[key]??''} onChange={e=>map(key,e.target.value)} className={selectClass}><option value="">{tool.optional_inputs?'No incluir':'Seleccionar columna…'}</option>{candidates.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select>{candidates.length===0&&<p className="text-xs text-amber-400">No se detectaron columnas compatibles con este campo.</p>}{config.columns[key]&&tool.unit!=='raw'&&<select aria-label={`Unidad de ${key}`} value={config.units[key]??tool.unit} onChange={e=>state.configure({units:{...config.units,[key]:e.target.value as GeoUnit}})} className={selectClass}><option value="pct">wt% / porcentaje</option><option value="ppm">ppm</option><option value="ppb">ppb</option></select>}</div>;
      })}
      {tool.inputs.includes('FeTotal')&&<label className="block space-y-1 text-xs text-zinc-400"><span>Forma del hierro total</span><select aria-label="Forma del hierro total" value={config.iron_basis} onChange={e=>state.configure({iron_basis:e.target.value as 'FeOT'|'Fe2O3T'})} className={selectClass}><option value="FeOT">FeOT (todo el Fe como FeO)</option><option value="Fe2O3T">Fe2O3T (convertir × 0.8998)</option></select></label>}
      </details>
      <div className="space-y-3 border-t border-zinc-700 pt-4"><p className="text-xs font-semibold uppercase text-zinc-500">Apariencia</p>
        <label className="block space-y-1 text-xs text-zinc-400"><span>Grupo / sondaje</span><select aria-label="Grupo / sondaje" value={config.group_column??''} onChange={e=>state.configure({group_column:e.target.value||null})} className={selectClass}><option value="">Sin agrupación</option>{groupColumns.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select>{groupColumns.length===0&&<p className="text-xs text-amber-400">No se detectaron columnas compatibles con este campo.</p>}</label>
        <label className="block space-y-1 text-xs text-zinc-400"><span>Identificador / etiqueta</span><select aria-label="Identificador de muestra" value={config.label_column??''} onChange={e=>state.configure({label_column:e.target.value||null})} className={selectClass}><option value="">Automático según dataset</option>{state.columns.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select></label>
        <label className="flex items-center justify-between gap-2 text-xs text-zinc-400">Tamaño de puntos<input aria-label="Tamaño de puntos" type="range" min="3" max="16" value={state.pointSize} onChange={e=>useGeochemistryStore.setState({pointSize:Number(e.target.value)})} className="w-24"/></label>
        <label className="block space-y-1 text-xs text-zinc-400"><span>Símbolo</span><select aria-label="Símbolo" value={state.symbol} onChange={e=>useGeochemistryStore.setState({symbol:e.target.value})} className={selectClass}><option value="circle">Círculo</option><option value="square">Cuadrado</option><option value="diamond">Diamante</option><option value="triangle-up">Triángulo</option></select></label>
        <label className="flex gap-2 text-xs text-zinc-400"><input type="checkbox" checked={state.showLabels} onChange={e=>useGeochemistryStore.setState({showLabels:e.target.checked})}/>Mostrar etiquetas</label>
      </div>
      <details className="space-y-3 border-t border-zinc-700 pt-3"><summary className="cursor-pointer text-xs text-sky-300">Atributos por valor de otro elemento</summary>
      {(['size_column','color_column'] as const).map(key=><label key={key} className="block space-y-1 text-xs text-zinc-400"><span>{key==='size_column'?'Columna para tamaño automático':'Color por valor (5 clases)'}</span><select aria-label={key==='size_column'?'Columna de tamaño':'Columna de color'} className={selectClass} value={config[key]??''} onChange={e=>state.configure({[key]:e.target.value||null})}><option value="">Sin asignar</option>{numeric.map(c=><option key={c.name}>{c.name}</option>)}</select></label>)}
      <p className="text-xs text-zinc-500">Activa tamaño automático y elige «Columna del editor» en los controles del gráfico. Color numérico usa cinco intervalos iguales del rango observado.</p></details>
      <AttributeEditor/>
      <SessionControls/>
      <label className="flex items-start gap-2 border-t border-zinc-700 pt-4 text-xs text-zinc-400"><input type="checkbox" checked={config.include_qaqc} onChange={e=>state.configure({include_qaqc:e.target.checked})}/>Incluir controles QAQC (excluidos por defecto)</label><p className="text-xs leading-relaxed text-zinc-500">Confirma las unidades de origen. Los datos originales no se modifican. Valores censurados o no válidos se reportan en la tabla.</p>
    </div><footer className="border-t border-zinc-700 p-3"><button disabled={!ready||state.loading||state.running} onClick={()=>void state.run()} className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">{state.running?'Calculando…':'Calcular'}</button></footer>
  </aside>;
}
