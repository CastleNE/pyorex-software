import { PALETTES } from '../../lib/chart-presentation';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import { attributeKey, resolveAttribute, type AttributeStyle } from '../../lib/geochemistry-attributes';

export default function AttributeEditor() {
  const state=useGeochemistryStore();
  const column=state.config?.group_column??null;
  const groups=[...new Set(state.result?.rows.filter(r=>r.status==='valid').map(r=>r.group)??[])];
  const update=(group:string,patch:AttributeStyle)=>{
    const key=attributeKey(column,group);
    useGeochemistryStore.setState(s=>({attributes:{...s.attributes,[key]:{...s.attributes[key],...patch}}}));
  };
  return <section className="space-y-2" aria-label="Atributos por categoría">
    <div className="flex items-center justify-between"><h3 className="text-xs font-medium text-zinc-300">Atributos por categoría</h3><button className="text-xs text-blue-300" onClick={()=>useGeochemistryStore.setState({attributes:{},pointSize:7,symbol:'circle',showLabels:false})}>Restablecer</button></div>
    {!groups.length?<p className="text-xs text-zinc-500">Genera el gráfico para editar sus categorías.</p>:<div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-zinc-400"><tr><th>Ver</th><th className="text-left">Categoría</th><th>Color</th><th>Forma</th><th>Tamaño</th></tr></thead><tbody>{groups.map((group,index)=>{
      const style=resolveAttribute(state.attributes,column,group,index,state.pointSize,state.symbol,PALETTES[state.presentation.palette]);
      return <tr key={group} className="border-t border-zinc-800"><td><input aria-label={`Mostrar ${group}`} type="checkbox" checked={style.visible} onChange={e=>update(group,{visible:e.target.checked})}/></td><td className="max-w-24 truncate py-2" title={group}>{group}</td><td><input aria-label={`Color de ${group}`} type="color" value={style.color} onChange={e=>update(group,{color:e.target.value})} className="h-6 w-7 cursor-pointer bg-transparent"/></td><td><select aria-label={`Forma de ${group}`} value={style.symbol} onChange={e=>update(group,{symbol:e.target.value})} className="w-14 rounded bg-zinc-800 p-1"><option value="circle">●</option><option value="square">■</option><option value="diamond">◆</option><option value="triangle-up">▲</option></select></td><td><input aria-label={`Tamaño de ${group}`} type="number" min="3" max="20" value={style.size} onChange={e=>{const n=Number(e.target.value);if(n>=3&&n<=20)update(group,{size:n});}} className="w-12 rounded bg-zinc-800 p-1"/></td></tr>;
    })}</tbody></table></div>}
    <p className="text-xs text-zinc-500">Ocultar afecta solo al gráfico. La tabla y las exportaciones conservan todas las muestras.</p>
  </section>;
}
