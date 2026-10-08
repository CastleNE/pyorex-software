import { useEffect, useState } from 'react';
import { useDatasetStore } from '../../stores/dataset-store';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import type { GeoGroup } from '../../lib/geochemistry-api';
import Results from './Results';
import Editor from './Editor';
import DiagramsNav from './DiagramsNav';
import LithogeochemistryNav from './LithogeochemistryNav';
import PxIcon from '../PxIcon';
import { useShellStore } from '../../stores/shell-store';
import GeoCanvas from './GeoCanvas';
import type { AreaId, GeoView } from '../../lib/geochem-areas';
import { useL } from '../../lib/i18n';
import { toolLabel } from '../../lib/tool-labels';

/**
 * `ribbon` (+ `area`, `request`): driven by the Geoquímica ribbon. Results open in floating windows (GeoCanvas), the
 * ribbon replaces the Familia/Herramienta selects and the rail owns the editor's visibility. Without `ribbon` the
 * Workbench behaves exactly as before (one result, inline selects).
 */
export default function Workbench({group,onOpenData,ribbon=false,area,request}:{group:GeoGroup;onOpenData:()=>void;ribbon?:boolean;area?:AreaId;request?:GeoView}) {
  const L=useL();
  const [localEditor,setLocalEditor]=useState(true);
  const shellEditor=useShellStore(s=>s.editorOpen),setShellEditor=useShellStore(s=>s.setEditorOpen);
  const editorOpen=ribbon?shellEditor:localEditor,setEditorOpen=ribbon?setShellEditor:setLocalEditor;
  const dataset=useDatasetStore(s=>s.dataset);
  const state=useGeochemistryStore();
  // In ribbon mode the catalog is loaded once per dataset: windows pick their tool, the group only seeds a default.
  useEffect(()=>{if(dataset)void useGeochemistryStore.getState().load(dataset.id,group);},[dataset?.id,ribbon?'ribbon':group]);
  const autoRun=ribbon?state.tools.find(t=>t.id===state.selectedTool)?.group==='diagrams':group==='diagrams';
  useEffect(()=>{
    // Never recompute a configuration that already has its result or error (e.g. when a window is re-focused).
    if(state.loading||!state.config||!autoRun||state.result||state.error||state.running)return;
    const tool=state.tools.find(t=>t.id===state.selectedTool);
    if(!tool||!tool.inputs.every(key=>state.config?.columns[key])||(tool.id.startsWith('downhole')&&!state.config.group_column))return;
    const timer=setTimeout(()=>void useGeochemistryStore.getState().run(),250);
    return ()=>clearTimeout(timer);
  },[state.config,state.loading,autoRun,state.selectedTool,state.tools]);
  if(!dataset)return <div className="px-canvas flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"><PxIcon name={group==='lithogeochemistry'?'tas':'scatter'} className="h-10 w-10 text-subtle"/><div><h2 className="text-lg font-semibold text-fg">{L({es:'Carga un dataset para trabajar en Geoquímica',en:'Load a dataset to work in Geochemistry'})}</h2><p className="mt-1 text-[13px] text-muted">{L({es:'CSV o Excel con óxidos (wt%) y trazas (ppm). Los datos originales no se modifican.',en:'CSV or Excel with oxides (wt%) and trace elements (ppm). The original data are never modified.'})}</p></div><button onClick={onOpenData} className="flex items-center gap-2 rounded-md bg-accent-strong px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"><PxIcon name="import" className="h-4 w-4"/>{L({es:'Importar datos',en:'Import data'})}</button></div>;
  const tool=state.tools.find(t=>t.id===state.selectedTool);
  if(ribbon&&area)return <div className="flex min-h-0 min-w-0 flex-1">{editorOpen&&<Editor/>}<div className="relative flex min-w-0 flex-1 flex-col">
    {state.loading&&<div role="status" aria-label={L({es:'Cargando herramientas y columnas…',en:'Loading tools and columns…'})} className="absolute inset-x-0 top-0 z-40 h-0.5 overflow-hidden bg-accent-soft"><div className="h-full w-1/3 animate-pulse bg-accent"/></div>}
    {state.error&&!state.config&&<p role="alert" className="select-text border-b border-danger-line bg-danger-soft px-4 py-2 text-xs text-danger">{state.error}</p>}
    <GeoCanvas area={area} request={request}/>
  </div></div>;
  return <div className="flex min-h-0 min-w-0 flex-1">{editorOpen&&<Editor/>}<div className="flex min-w-0 flex-1 flex-col">
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-panel px-3 py-2">{!ribbon&&<button onClick={()=>setEditorOpen(!editorOpen)} aria-pressed={editorOpen} title={editorOpen?L({es:'Ocultar editor',en:'Hide editor'}):L({es:'Mostrar editor',en:'Show editor'})} className={`flex h-7 items-center gap-1.5 rounded border px-2 text-xs ${editorOpen?'border-accent bg-accent-soft text-accent-fg':'border-line-strong text-muted hover:bg-hover'}`}><PxIcon name="sliders" className="h-4 w-4"/>{editorOpen?L({es:'Ocultar editor',en:'Hide editor'}):L({es:'Mostrar editor',en:'Show editor'})}</button>}{ribbon?<span className="truncate text-[13px] font-semibold text-fg">{tool?L(toolLabel(tool)):''}</span>:group==='diagrams'?<DiagramsNav/>:group==='lithogeochemistry'?<LithogeochemistryNav/>:<label className="text-xs text-muted">{L({es:'Herramienta',en:'Tool'})} <select aria-label={L({es:'Herramienta geoquímica',en:'Geochemical tool'})} value={state.selectedTool??''} onChange={e=>state.select(e.target.value)} disabled={state.loading} className="ml-2 max-w-96 rounded border border-line-strong bg-app px-3 py-2 text-sm text-fg">{state.tools.filter(t=>t.group===group).map(t=><option key={t.id} value={t.id}>{L(toolLabel(t))}</option>)}</select></label>}<span className="ml-auto truncate text-xs text-subtle">{dataset.name} · <span className="tabular font-mono">{dataset.rowCount.toLocaleString()}</span> {L({es:'muestras',en:'samples'})}</span><button onClick={()=>void state.load(dataset.id,group)} disabled={state.loading} className="flex items-center gap-1 text-xs text-accent-fg hover:underline disabled:opacity-50"><PxIcon name="history" className="h-3.5 w-3.5"/>{L({es:'Actualizar columnas',en:'Refresh columns'})}</button></div>
    {state.error&&<p role="alert" className="select-text border-b border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">{state.error}</p>}
    {state.loading?<p role="status" className="flex items-center gap-2 p-6 text-sm text-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"/>{L({es:'Cargando herramientas y columnas…',en:'Loading tools and columns…'})}</p>:state.result?<Results key={state.result.created_at} result={state.result}/>:<div className="px-canvas flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"><PxIcon name={tool?.kind==='spider'?'spider':group==='lithogeochemistry'?'tas':'scatter'} className="h-9 w-9 text-subtle"/><h2 className="text-lg font-semibold text-fg">{tool?L(toolLabel(tool)):L({es:'Geoquímica',en:'Geochemistry'})}</h2>{tool?.formula&&<p className="max-w-xl select-text font-mono text-[12px] leading-relaxed text-muted">{tool.formula}</p>}{tool?.reference&&<p className="max-w-xl select-text text-xs text-subtle">{tool.reference}</p>}<p className="mt-3 flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-[12.5px] text-accent-fg">{state.running?L({es:'Calculando…',en:'Computing…'}):L({es:'Revisa el mapeo y las unidades en el editor. Luego pulsa Calcular.',en:'Check the mapping and units in the editor, then press Run.'})}</p></div>}
  </div></div>;
}
