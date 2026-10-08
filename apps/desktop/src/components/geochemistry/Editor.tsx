import AttributeEditor from './AttributeEditor';
import SessionControls from './SessionControls';
import PxIcon from '../PxIcon';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import { useGeoRegistryStore } from '../../stores/geochemistry-registry-store';
import { inferUnit, type GeoUnit } from '../../lib/geochemistry-api';
import { AUTO_SYMBOL } from '../../lib/geochemistry-attributes';
import { compatibleInputColumns, inputConstraintFor } from '../../lib/semantic-roles';
import { useL } from '../../lib/i18n';
import type { ReactNode } from 'react';

const control='h-7 rounded border border-line-strong bg-raised px-2 text-xs text-fg focus:border-accent';
const selectClass=`${control} w-full`;
const fieldLabel='block space-y-1 text-xs text-muted';

/** Collapsible editor section with the design-system overline heading. */
function Section({title,hint,open=true,children}:{title:string;hint?:string;open?:boolean;children:ReactNode}) {
  return <details open={open} className="group border-b border-line px-3 py-3 last:border-b-0">
    <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted marker:hidden">
      <span className="text-[9px] transition-transform group-open:rotate-90">▶</span>{title}{hint&&<span className="ml-auto font-normal normal-case tracking-normal text-subtle">{hint}</span>}
    </summary>
    <div className="mt-3 space-y-3">{children}</div>
  </details>;
}

export default function Editor() {
  const L=useL();
  const state=useGeochemistryStore();const config=state.config;const tool=state.tools.find(t=>t.id===state.selectedTool);
  const registryTool=useGeoRegistryStore(s=>s.registry?.tools.find(t=>t.id===state.selectedTool));
  if(!config||!tool)return <aside className="flex w-80 shrink-0 flex-col items-center justify-center gap-2 border-r border-line bg-panel p-4 text-center text-xs text-subtle"><PxIcon name="sliders" className="h-6 w-6"/>{L({es:'Editor · selecciona una herramienta',en:'Editor · select a tool'})}</aside>;
  const numeric=state.columns.filter(c=>c.numeric);const selected=Object.keys(config.columns).length;const ready=tool.optional_inputs?selected>=2:selected===tool.inputs.length;
  const map=(key:string,value:string)=>{const columns={...config.columns};const units={...config.units};if(value){columns[key]=value;units[key]=inferUnit(value,tool.unit);}else{delete columns[key];delete units[key];}state.configure({columns,units});};
  const mapped=tool.inputs.filter(key=>config.columns[key]).length;
  return <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-panel" aria-label={L({es:'Editor de atributos',en:'Attribute editor'})}>
    <header className="border-b border-line px-4 py-3">
      <div className="flex items-center gap-2"><PxIcon name="sliders" className="h-4 w-4 text-accent-fg"/><h2 className="text-[13px] font-semibold text-fg">{L({es:'Editor de atributos',en:'Attribute editor'})}</h2>
        {!config.diagram&&<span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${ready?'bg-accent-soft text-accent-fg':'bg-sunken text-muted'}`}><span className="tabular font-mono">{mapped}/{tool.inputs.length}</span> {L({es:'mapeadas',en:'mapped'})}</span>}</div>
      <p className="mt-1 text-xs text-subtle">{config.diagram?L({es:'Diagrama propio: los ejes son expresiones',en:'Custom diagram: the axes are expressions'}):tool.optional_inputs?L({es:'Elige al menos dos elementos',en:'Choose at least two elements'}):L({es:'Mapea todas las entradas',en:'Map all inputs'})}</p>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {config.diagram&&<Section title={L({es:'Diagrama propio',en:'Custom diagram'})}><dl className="space-y-1 font-mono text-[11.5px] text-fg">{(config.diagram.kind==='ternary'?[['A',config.diagram.x],['B',config.diagram.y],['C',config.diagram.z??'']]:[['X',config.diagram.x],['Y',config.diagram.y]]).map(([k,v])=><div key={k} className="flex gap-2"><dt className="w-4 shrink-0 text-subtle">{k}</dt><dd className="min-w-0 select-text break-all">{v}</dd></div>)}</dl><p className="mt-1.5 text-xs text-subtle">{L({es:'Edita las expresiones y los campos con «Editar diagrama» en la pestaña Herramienta.',en:'Edit the expressions and fields with “Edit diagram” in the Tool tab.'})}</p></Section>}
      {!config.diagram&&<Section title={L({es:'Variables y unidades',en:'Variables and units'})}>
      {tool.inputs.map(key=>{
        const candidates=compatibleInputColumns(state.columns,state.columnRoles,inputConstraintFor(registryTool,key));
        return <div key={key} className="space-y-1"><label className="flex items-center gap-1.5 text-xs text-muted" htmlFor={`geo-${key}`}><span className={`h-1.5 w-1.5 rounded-full ${config.columns[key]?'bg-accent':'bg-line-strong'}`}/>{key==='FeTotal'?L({es:'Hierro total',en:'Total iron'}):key==='Oxide'?L({es:'Óxido',en:'Oxide'}):key}</label><div className="flex gap-1.5"><select id={`geo-${key}`} value={config.columns[key]??''} onChange={e=>map(key,e.target.value)} className={`${control} min-w-0 flex-1`}><option value="">{tool.optional_inputs?L({es:'No incluir',en:'Do not include'}):L({es:'Seleccionar columna…',en:'Select column…'})}</option>{candidates.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select>{config.columns[key]&&tool.unit!=='raw'&&<select aria-label={L({es:`Unidad de ${key}`,en:`${key} unit`})} value={config.units[key]??tool.unit} onChange={e=>state.configure({units:{...config.units,[key]:e.target.value as GeoUnit}})} className={`${control} w-[4.5rem] shrink-0`}><option value="pct">wt%</option><option value="ppm">ppm</option><option value="ppb">ppb</option></select>}</div>{candidates.length===0&&<p className="text-xs text-warning">{L({es:'No se detectaron columnas compatibles con este campo.',en:'No columns compatible with this field were detected.'})}</p>}</div>;
      })}
      {tool.inputs.includes('FeTotal')&&<label className={fieldLabel}><span>{L({es:'Forma del hierro total',en:'Total iron form'})}</span><select aria-label={L({es:'Forma del hierro total',en:'Total iron form'})} value={config.iron_basis} onChange={e=>state.configure({iron_basis:e.target.value as 'FeOT'|'Fe2O3T'})} className={selectClass}><option value="FeOT">{L({es:'FeOT (todo el Fe como FeO)',en:'FeOT (all Fe as FeO)'})}</option><option value="Fe2O3T">{L({es:'Fe2O3T (convertir × 0.8998)',en:'Fe2O3T (convert × 0.8998)'})}</option></select></label>}
      </Section>}
      <Section title={L({es:'Apariencia',en:'Appearance'})} hint={L({es:'no recalcula',en:'no recalculation'})}>
        <label className={fieldLabel}><span>{L({es:'Identificador / etiqueta',en:'Identifier / label'})}</span><select aria-label={L({es:'Identificador de muestra',en:'Sample identifier'})} value={config.label_column??''} onChange={e=>state.configure({label_column:e.target.value||null})} className={selectClass}><option value="">{L({es:'Automático según dataset',en:'Automatic from dataset'})}</option>{state.columns.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className={fieldLabel}><span>{L({es:'Símbolo',en:'Symbol'})}</span><select aria-label={L({es:'Símbolo',en:'Symbol'})} value={state.symbol} onChange={e=>useGeochemistryStore.setState({symbol:e.target.value})} className={selectClass}><option value={AUTO_SYMBOL}>{L({es:'Uno por categoría',en:'One per category'})}</option><option value="circle">{L({es:'● Círculo',en:'● Circle'})}</option><option value="square">{L({es:'■ Cuadrado',en:'■ Square'})}</option><option value="diamond">{L({es:'◆ Diamante',en:'◆ Diamond'})}</option><option value="triangle-up">{L({es:'▲ Triángulo',en:'▲ Triangle'})}</option></select></label>
          <label className={fieldLabel}><span className="flex justify-between">{L({es:'Tamaño',en:'Size'})} <span className="tabular font-mono text-subtle">{state.pointSize}</span></span><input aria-label={L({es:'Tamaño de puntos',en:'Point size'})} type="range" min="3" max="16" value={state.pointSize} onChange={e=>useGeochemistryStore.setState({pointSize:Number(e.target.value)})} className="h-7 w-full accent-accent"/></label>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={state.showLabels} onChange={e=>useGeochemistryStore.setState({showLabels:e.target.checked})} className="accent-accent"/>{L({es:'Mostrar etiquetas',en:'Show labels'})}</label>
        {state.symbol===AUTO_SYMBOL&&<p className="text-[11.5px] leading-relaxed text-subtle">{L({es:'Cada categoría recibe color ',en:'Each category gets its own color '})}<em>{L({es:'y',en:'and'})}</em>{L({es:' forma propios: se distinguen impresas en gris y con daltonismo.',en:' shape: they stay distinguishable in grayscale print and for color-blind readers.'})}</p>}
      </Section>
      <Section title={L({es:'Color y tamaño por valor',en:'Color and size by value'})} open={!!(config.size_column||config.color_column)}>
      {(['size_column','color_column'] as const).map(key=><label key={key} className={fieldLabel}><span>{key==='size_column'?L({es:'Columna para tamaño automático',en:'Column for automatic size'}):L({es:'Color por valor (clases en Estilo)',en:'Color by value (classes in Style)'})}</span><select aria-label={key==='size_column'?L({es:'Columna de tamaño',en:'Size column'}):L({es:'Columna de color',en:'Color column'})} className={selectClass} value={config[key]??''} onChange={e=>state.configure({[key]:e.target.value||null})}><option value="">{L({es:'Sin asignar',en:'Unassigned'})}</option>{numeric.map(c=><option key={c.name}>{c.name}</option>)}</select></label>)}
      <p className="text-[11.5px] leading-relaxed text-subtle">{L({es:'Activa tamaño automático y elige «Columna del editor» en los controles del gráfico. Color numérico usa cinco intervalos iguales del rango observado; la leyenda del gráfico muestra su histograma.',en:'Turn on automatic size and choose “Editor column” in the chart controls. Numeric color uses five equal intervals of the observed range; the chart legend shows its histogram.'})}</p></Section>
      <Section title={L({es:'Categorías',en:'Categories'})} open><AttributeEditor/></Section>
      <Section title={L({es:'Sesión',en:'Session'})} open={false}><SessionControls/></Section>
      <div className="space-y-2 px-3 py-3">
        <label className="flex items-start gap-2 text-xs text-muted"><input type="checkbox" checked={config.include_qaqc} onChange={e=>state.configure({include_qaqc:e.target.checked})} className="mt-0.5 accent-accent"/>{L({es:'Incluir controles QAQC (excluidos por defecto)',en:'Include QA/QC controls (excluded by default)'})}</label>
        <p className="text-[11.5px] leading-relaxed text-subtle">{L({es:'Confirma las unidades de origen. Los datos originales no se modifican. Valores censurados o no válidos se reportan en la tabla.',en:'Confirm the source units. The original data are never modified. Censored or invalid values are reported in the table.'})}</p>
      </div>
    </div>
    <footer className="border-t border-line p-3"><button disabled={!ready||state.loading||state.running} onClick={()=>void state.run()} className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-accent-strong px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"><PxIcon name="play" className="h-4 w-4"/>{state.running?L({es:'Calculando…',en:'Computing…'}):L({es:'Calcular',en:'Run'})}</button></footer>
  </aside>;
}
