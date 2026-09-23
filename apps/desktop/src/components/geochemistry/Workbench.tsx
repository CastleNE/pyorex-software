import { useEffect, useState } from 'react';
import { useDatasetStore } from '../../stores/dataset-store';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import type { GeoGroup } from '../../lib/geochemistry-api';
import Results from './Results';
import Editor from './Editor';
import DiagramsNav from './DiagramsNav';
import LithogeochemistryNav from './LithogeochemistryNav';

export default function Workbench({group,onOpenData}:{group:GeoGroup;onOpenData:()=>void}) {
  const [editorOpen,setEditorOpen]=useState(true);
  const dataset=useDatasetStore(s=>s.dataset);
  const state=useGeochemistryStore();
  useEffect(()=>{if(dataset)void useGeochemistryStore.getState().load(dataset.id,group);},[dataset?.id,group]);
  useEffect(()=>{
    if(state.loading||!state.config||group!=='diagrams')return;
    const tool=state.tools.find(t=>t.id===state.selectedTool);
    if(!tool||!tool.inputs.every(key=>state.config?.columns[key])||(tool.id.startsWith('downhole')&&!state.config.group_column))return;
    const timer=setTimeout(()=>void useGeochemistryStore.getState().run(),250);
    return ()=>clearTimeout(timer);
  },[state.config,state.loading,group,state.selectedTool,state.tools]);
  if(!dataset)return <div className="flex flex-1 flex-col items-center justify-center gap-4"><p className="text-sm text-zinc-400">Carga un dataset para trabajar en Geoquímica.</p><button onClick={onOpenData} className="rounded border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm">Open Data</button></div>;
  const tool=state.tools.find(t=>t.id===state.selectedTool);
  return <div className="flex min-h-0 min-w-0 flex-1">{editorOpen&&<Editor/>}<div className="flex min-w-0 flex-1 flex-col">
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-zinc-700 bg-zinc-800/50 px-4 py-3"><button onClick={()=>setEditorOpen(!editorOpen)} className="rounded border border-zinc-600 px-2 py-1 text-xs">{editorOpen?"Ocultar editor":"Mostrar editor"}</button>{group==='diagrams'?<DiagramsNav/>:group==='lithogeochemistry'?<LithogeochemistryNav/>:<label className="text-xs text-zinc-400">Herramienta <select aria-label="Herramienta geoquímica" value={state.selectedTool??''} onChange={e=>state.select(e.target.value)} disabled={state.loading} className="ml-2 max-w-96 rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">{state.tools.filter(t=>t.group===group).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}<span className="ml-auto truncate text-xs text-zinc-500">{dataset.name} · {dataset.rowCount.toLocaleString()} muestras</span><button onClick={()=>void state.load(dataset.id,group)} disabled={state.loading} className="text-xs text-blue-300">Actualizar columnas</button></div>
    {state.error&&<p role="alert" className="select-text border-b border-red-900 bg-red-900/10 p-4 text-sm text-red-300">{state.error}</p>}
    {state.loading?<p role="status" className="p-6 text-sm text-zinc-400">Cargando herramientas y columnas…</p>:state.result?<Results key={state.result.created_at} result={state.result}/>:<div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center"><h2 className="text-lg font-medium text-zinc-300">{tool?.label??'Geoquímica'}</h2><p className="max-w-xl text-sm leading-relaxed text-zinc-500">{tool?.formula}</p><p className="max-w-xl text-xs text-zinc-500">{tool?.reference}</p><p className="mt-4 text-sm text-blue-300">{state.running?'Calculando…':'Revisa el mapeo y las unidades en el editor. Luego pulsa Calcular.'}</p></div>}
  </div></div>;
}
