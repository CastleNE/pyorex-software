import { useEffect } from 'react';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import { useGeoRegistryStore } from '../../stores/geochemistry-registry-store';
import { familiesForModule,familyOf,missingFromCatalog,toolForFamily,type ToolFamily } from '../../lib/geochemistry-registry';
import { tx,useL,type Txt } from '../../lib/i18n';
import { toolLabel } from '../../lib/tool-labels';

const label='flex items-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted';
const selectClass='ml-2 h-7 rounded border border-line-strong bg-raised px-2 text-[13px] font-normal normal-case tracking-normal text-fg disabled:opacity-50';

/** aria-labels for the two selects; every module using this navigation names its own (e.g. "Familia de diagrama" vs. "Familia de litogeoquímica") so screen readers and tests can tell them apart. */
export interface ToolFamilyNavLabels { family:string|Txt; tool:string|Txt }

export type ToolFamilyNavProps =
  |{status:'loading'}
  |{status:'error';message:string;retrying:boolean;onRetry:()=>void}
  |{status:'ready';families:ToolFamily[];selectedTool:string|null;disabled:boolean;missing:string[];onSelect:(toolId:string)=>void;labels:ToolFamilyNavLabels};

/** Presentational (no hooks): what the user sees for each state of the Registry, for any module. */
export function ToolFamilyNavView(props:ToolFamilyNavProps) {
  if(props.status==='error')return <div role="alert" className="flex items-center gap-3 text-xs text-danger"><span className="select-text">{tx({es:'No se pudo cargar el Registry de herramientas (geochemistry.registry): ',en:'Could not load the tool Registry (geochemistry.registry): '})}{props.message}</span><button onClick={props.onRetry} disabled={props.retrying} className="rounded border border-danger-line px-2 py-1 text-danger hover:border-danger">Reintentar</button></div>;
  if(props.status==='loading')return <span role="status" className={label}>{tx({es:'Cargando herramientas…',en:'Loading tools…'})}</span>;
  const {families,selectedTool,disabled,missing,onSelect,labels}=props;
  const family=familyOf(families,selectedTool);
  return <>
    <label className={label}>{tx({es:'Familia',en:'Family'})}<select aria-label={tx(labels.family)} value={family?.id??''} onChange={e=>{const next=toolForFamily(families,e.target.value,selectedTool);if(next)onSelect(next);}} disabled={disabled||families.length===0} className={`${selectClass} w-44`}>{!family&&<option value="" disabled>—</option>}{families.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
    <label className={label}>{tx({es:'Herramienta',en:'Tool'})}<select aria-label={tx(labels.tool)} value={family?selectedTool??'':''} onChange={e=>onSelect(e.target.value)} disabled={disabled||!family} className={`${selectClass} max-w-72`}>{!family&&<option value="" disabled>—</option>}{family?.tools.map(t=><option key={t.id} value={t.id}>{tx(toolLabel(t))}</option>)}</select></label>
    {missing.length>0&&<span role="alert" className="select-text text-xs text-danger">{tx({es:'El Registry declara herramientas que el catálogo de cálculo no ofrece: ',en:'The Registry declares tools that the calculation catalog does not provide: '})}{missing.join(', ')}.</span>}
  </>;
}

/**
 * Reusable Familia -> Herramienta navigation, built once from the Tool Registry and shared by every module that
 * uses it (DIAGRAMS today; Litogeoquímica now; Exploración/Espectrometría/Petrofísica later can reuse it the same
 * way) — it only ever chooses the toolId the existing Workbench/Editor/geochemistry.compute pipeline already
 * understands, nothing about the calculation or the renderer.
 */
export default function ToolFamilyNav({module,familyLabel,labels}:{module:string;familyLabel:(id:string)=>string;labels:ToolFamilyNavLabels}) {
  const L=useL();   // subscribes to the language so the hook-free view re-renders on a switch
  const {registry,loading:registryLoading,error,load}=useGeoRegistryStore();
  const {tools,selectedTool,loading,select}=useGeochemistryStore();
  useEffect(()=>{void load();},[load]);
  if(error)return <ToolFamilyNavView status="error" message={error} retrying={registryLoading} onRetry={()=>void load(true)}/>;
  if(!registry)return <ToolFamilyNavView status="loading"/>;
  const families=familiesForModule(registry,module,familyLabel);
  const missing=loading||tools.length===0?[]:missingFromCatalog(families,tools.map(t=>t.id));   // only judged once the catalog has answered
  return <ToolFamilyNavView status="ready" families={families} selectedTool={selectedTool} disabled={loading} missing={missing} onSelect={select} labels={{family:L(labels.family),tool:L(labels.tool)}}/>;
}
