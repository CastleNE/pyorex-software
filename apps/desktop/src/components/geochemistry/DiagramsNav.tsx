import { useEffect } from 'react';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import { useGeoRegistryStore } from '../../stores/geochemistry-registry-store';
import { diagramFamilies,familyOf,missingFromCatalog,toolForFamily,type DiagramFamily } from '../../lib/geochemistry-registry';

const label='text-xs text-zinc-400';
const selectClass='ml-2 rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50';

export type DiagramsNavProps =
  |{status:'loading'}
  |{status:'error';message:string;retrying:boolean;onRetry:()=>void}
  |{status:'ready';families:DiagramFamily[];selectedTool:string|null;disabled:boolean;missing:string[];onSelect:(toolId:string)=>void};

/** Presentational (no hooks): what the user sees for each state of the Registry. */
export function DiagramsNavView(props:DiagramsNavProps) {
  if(props.status==='error')return <div role="alert" className="flex items-center gap-3 text-xs text-red-300"><span className="select-text">No se pudo cargar el Registry de herramientas (geochemistry.registry): {props.message}</span><button onClick={props.onRetry} disabled={props.retrying} className="rounded border border-red-800 px-2 py-1 text-red-200 hover:border-red-500">Reintentar</button></div>;
  if(props.status==='loading')return <span role="status" className={label}>Cargando herramientas…</span>;
  const {families,selectedTool,disabled,missing,onSelect}=props;
  const family=familyOf(families,selectedTool);
  return <>
    <label className={label}>Familia<select aria-label="Familia de diagrama" value={family?.id??''} onChange={e=>{const next=toolForFamily(families,e.target.value,selectedTool);if(next)onSelect(next);}} disabled={disabled||families.length===0} className={`${selectClass} w-40`}>{!family&&<option value="" disabled>—</option>}{families.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
    <label className={label}>Herramienta<select aria-label="Herramienta geoquímica" value={family?selectedTool??'':''} onChange={e=>onSelect(e.target.value)} disabled={disabled||!family} className={`${selectClass} max-w-72`}>{!family&&<option value="" disabled>—</option>}{family?.tools.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
    {missing.length>0&&<span role="alert" className="select-text text-xs text-red-300">El Registry declara herramientas que el catálogo de cálculo no ofrece: {missing.join(', ')}.</span>}
  </>;
}

/** DIAGRAMS navigation: Familia → Herramienta, built from the Tool Registry. It only chooses the toolId the Workbench already understands. */
export default function DiagramsNav() {
  const {registry,loading:registryLoading,error,load}=useGeoRegistryStore();
  const {tools,selectedTool,loading,select}=useGeochemistryStore();
  useEffect(()=>{void load();},[load]);
  if(error)return <DiagramsNavView status="error" message={error} retrying={registryLoading} onRetry={()=>void load(true)}/>;
  if(!registry)return <DiagramsNavView status="loading"/>;
  const families=diagramFamilies(registry);
  const missing=loading||tools.length===0?[]:missingFromCatalog(families,tools.map(t=>t.id));   // only judged once the catalog has answered
  return <DiagramsNavView status="ready" families={families} selectedTool={selectedTool} disabled={loading} missing={missing} onSelect={select}/>;
}
