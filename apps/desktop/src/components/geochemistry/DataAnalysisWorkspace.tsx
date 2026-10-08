import { useState } from 'react';
import DataScreen from '../DataScreen';
import AnalysisToolWindow from '../tool-windows/AnalysisToolWindow';
import AnalysisHistoryPanel from '../AnalysisHistoryPanel';
import { useAppStore } from '../../stores/app-store';
import { useDatasetStore } from '../../stores/dataset-store';
import { useL } from '../../lib/i18n';

const actions=[
  {id:'prepare',label:{es:'Preparar muestras',en:'Prepare samples'},detail:{es:'Tabla · filtros · fórmulas · QAQC',en:'Table · filters · formulas · QAQC'}},
  {id:'descriptive-statistics',label:{es:'Resumen estadístico',en:'Summary statistics'},detail:{es:'Distribución · dispersión · extremos',en:'Distribution · spread · extremes'}},
  {id:'correlation-analysis',label:{es:'Correlaciones',en:'Correlations'},detail:{es:'Asociaciones entre elementos',en:'Element associations'}},
  {id:'principal-component-analysis',label:{es:'PCA',en:'PCA'},detail:{es:'Componentes · scores · cargas',en:'Components · scores · loadings'}},
  {id:'history',label:{es:'Historial',en:'History'},detail:{es:'Revisar análisis anteriores',en:'Review previous analyses'}},
] as const;
export type Action=typeof actions[number]['id'];

/** `active` (from the Geoquímica ribbon) controls the action and hides the internal action bar. */
export default function DataAnalysisWorkspace({onOpenData,active,onSelect}:{onOpenData:()=>void;active?:Action;onSelect?:(a:Action)=>void}) {
  const L=useL();
  const [localAction,setLocalAction]=useState<Action>('prepare');
  const action=active??localAction,setAction=(a:Action)=>{if(onSelect)onSelect(a);else setLocalAction(a);};
  const dataset=useDatasetStore(s=>s.dataset);
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {!active&&<div className="flex shrink-0 flex-wrap gap-2 border-b border-line p-3">{actions.map(a=><button key={a.id} onClick={()=>setAction(a.id)} className={`rounded-lg border px-3 py-2 text-left ${action===a.id?'border-accent bg-accent-soft/40 text-accent-fg':'border-line text-fg'}`}><span className="block text-xs font-semibold">{L(a.label)}</span><span className="text-xs text-subtle">{L(a.detail)}</span></button>)}</div>}
    {action==='prepare'?<DataScreen onOpenData={onOpenData}/>:!dataset?<div className="m-auto text-sm text-muted">{L({es:'Importa un dataset para analizarlo.',en:'Import a dataset to analyse it.'})}</div>:action==='history'?<div className="min-h-0 flex-1 overflow-auto"><AnalysisHistoryPanel onReopenTool={id=>{if(actions.some(a=>a.id===id))setAction(id as Action);}}/></div>:<div className="min-h-0 flex-1 overflow-auto"><AnalysisToolWindow key={`${dataset.id}:${action}`} toolId={action} toolLabel={L(actions.find(a=>a.id===action)!.label)} onOpenVisualization={()=>useAppStore.getState().setActiveModuleId('diagrams')}/></div>}
  </div>;
}
