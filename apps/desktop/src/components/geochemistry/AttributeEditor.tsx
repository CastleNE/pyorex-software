import { PALETTES } from '../../lib/chart-presentation';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import { AUTO_SYMBOL, attributeKey, resolveAttribute, type AttributeStyle } from '../../lib/geochemistry-attributes';
import { useGeoRegistryStore } from '../../stores/geochemistry-registry-store';
import { categoryOptions } from '../../lib/category-columns';
import { useL } from '../../lib/i18n';

export default function AttributeEditor() {
  const L=useL();
  const state=useGeochemistryStore();
  const column=state.config?.group_column??null;
  const valid=state.result?.rows.filter(r=>r.status==='valid')??[];
  const groups=[...new Set(valid.map(r=>r.group))];
  const counts=new Map<string,number>();for(const r of valid)counts.set(r.group,(counts.get(r.group)??0)+1);
  const update=(group:string,patch:AttributeStyle)=>{
    const key=attributeKey(column,group);
    useGeochemistryStore.setState(s=>({attributes:{...s.attributes,[key]:{...s.attributes[key],...patch}}}));
  };
  const cell='h-7 rounded border border-line-strong bg-raised px-1 text-xs text-fg';
  // «Clasificar por»: any category column of the dataset (LITOL, ALTERACION, CAMPAÑA, AÑO…); choosing one recomputes.
  const allowedRoles=useGeoRegistryStore(s=>s.registry?.tools.find(t=>t.id===state.selectedTool)?.group_allowed_roles);
  const options=categoryOptions(state.columns,state.columnRoles,allowedRoles);
  const downhole=!!state.selectedTool?.startsWith('downhole');
  const classify=(name:string|null)=>{if(!state.config||name===column)return;state.configure({group_column:name});if(state.datasetId)void useGeochemistryStore.getState().run();};
  const listed=[...options.text,...options.numeric];
  return <section className="space-y-2" aria-label={L({es:'Atributos por categoría',en:'Attributes by category'})}>
    <label className="flex flex-col gap-1 text-xs text-muted"><span>{downhole?L({es:'Sondaje (agrupa cada traza)',en:'Drill hole (groups each trace)'}):L({es:'Clasificar por',en:'Classify by'})}</span>
      <select aria-label={L({es:'Clasificar por',en:'Classify by'})} value={column??''} onChange={e=>classify(e.target.value||null)} className="h-7 w-full rounded border border-line-strong bg-raised px-2 text-xs text-fg focus:border-accent">
        <option value="">{downhole?L({es:'Selecciona el ID del sondaje',en:'Select the hole ID'}):L({es:'Sin categoría (todas las muestras iguales)',en:'No category (all samples alike)'})}</option>
        {options.text.length>0&&<optgroup label={options.restricted?L({es:'Compatibles',en:'Compatible'}):L({es:'Columnas de texto',en:'Text columns'})}>{options.text.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>}
        {options.numeric.length>0&&<optgroup label={options.restricted?L({es:'Compatibles (numéricas)',en:'Compatible (numeric)'}):L({es:'Columnas numéricas (año, campaña, código…)',en:'Numeric columns (year, campaign, code…)'})}>{options.numeric.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>}
        {column&&!listed.some(c=>c.name===column)&&<option value={column}>{column}</option>}
      </select></label>
    {listed.length===0&&<p className="text-xs text-warning">{options.restricted?L({es:'No hay columnas compatibles con esta herramienta.',en:'No columns are compatible with this tool.'}):L({es:'El dataset no tiene columnas de categoría (texto o códigos).',en:'The dataset has no category columns (text or codes).'})}</p>}
    <div className="flex items-center justify-between"><h3 className="text-xs text-muted">{L({es:'Atributos por categoría',en:'Attributes by category'})}{column&&<> · <span className="text-fg">{column}</span></>}</h3><button className="text-xs text-accent-fg hover:underline" onClick={()=>useGeochemistryStore.setState({attributes:{},pointSize:7,symbol:AUTO_SYMBOL,showLabels:false})}>{L({es:'Restablecer',en:'Reset'})}</button></div>
    {!groups.length?<p className="rounded border border-dashed border-line px-3 py-3 text-center text-xs text-subtle">{state.running?L({es:'Calculando…',en:'Computing…'}):L({es:'Genera el gráfico para editar sus categorías.',en:'Generate the chart to edit its categories.'})}</p>:<div className="overflow-hidden rounded-md border border-line bg-raised"><table className="w-full text-xs"><thead className="bg-panel text-[10.5px] uppercase tracking-wide text-subtle"><tr><th className="w-7 py-1.5" aria-label={L({es:'Ver',en:'Show'})}/><th className="py-1.5 text-left font-semibold">{L({es:'Categoría',en:'Category'})}</th><th className="font-semibold">n</th><th className="font-semibold">{L({es:'Color',en:'Color'})}</th><th className="font-semibold">{L({es:'Forma',en:'Shape'})}</th><th className="pr-2 font-semibold">{L({es:'Tam.',en:'Size'})}</th></tr></thead><tbody>{groups.map((group,index)=>{
      const style=resolveAttribute(state.attributes,column,group,index,state.pointSize,state.symbol,PALETTES[state.presentation.palette]);
      return <tr key={group} className={`border-t border-line ${style.visible?'':'opacity-50'}`}><td className="text-center"><input aria-label={L({es:`Mostrar ${group}`,en:`Show ${group}`})} type="checkbox" checked={style.visible} onChange={e=>update(group,{visible:e.target.checked})} className="accent-accent"/></td><td className="max-w-24 truncate py-1.5 text-fg" title={group}>{!column&&group==='Muestras'?L({es:'Muestras',en:'Samples'}):group}</td><td className="tabular text-center font-mono text-subtle">{counts.get(group)??0}</td><td className="text-center"><input aria-label={L({es:`Color de ${group}`,en:`${group} color`})} type="color" value={style.color} onChange={e=>update(group,{color:e.target.value})} className="h-6 w-7 cursor-pointer rounded border border-line bg-transparent"/></td><td className="text-center"><select aria-label={L({es:`Forma de ${group}`,en:`${group} shape`})} value={style.symbol} onChange={e=>update(group,{symbol:e.target.value})} className={`${cell} w-12`}><option value="circle">●</option><option value="square">■</option><option value="diamond">◆</option><option value="triangle-up">▲</option><option value="triangle-down">▼</option><option value="cross">✚</option><option value="x">✖</option><option value="star">★</option></select></td><td className="pr-2 text-center"><input aria-label={L({es:`Tamaño de ${group}`,en:`${group} size`})} type="number" min="3" max="20" value={style.size} onChange={e=>{const n=Number(e.target.value);if(n>=3&&n<=20)update(group,{size:n});}} className={`${cell} w-11 font-mono`}/></td></tr>;
    })}</tbody></table></div>}
    <p className="text-[11.5px] text-subtle">{L({es:'Ocultar afecta solo al gráfico. La tabla y las exportaciones conservan todas las muestras.',en:'Hiding affects the chart only. The table and exports keep every sample.'})}</p>
  </section>;
}
