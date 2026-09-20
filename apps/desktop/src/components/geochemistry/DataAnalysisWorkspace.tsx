import { useState } from 'react';
import DataScreen from '../DataScreen';
import AnalysisToolWindow from '../tool-windows/AnalysisToolWindow';
import AnalysisHistoryPanel from '../AnalysisHistoryPanel';
import { useAppStore } from '../../stores/app-store';
import { useDatasetStore } from '../../stores/dataset-store';

const actions=[
  {id:'prepare',label:'Preparar muestras',detail:'Tabla · filtros · fórmulas · QAQC'},
  {id:'descriptive-statistics',label:'Resumen estadístico',detail:'Distribución · dispersión · extremos'},
  {id:'correlation-analysis',label:'Correlaciones',detail:'Asociaciones entre elementos'},
  {id:'principal-component-analysis',label:'PCA',detail:'Componentes · scores · cargas'},
  {id:'history',label:'Historial',detail:'Revisar análisis anteriores'},
] as const;
type Action=typeof actions[number]['id'];

export default function DataAnalysisWorkspace({onOpenData}:{onOpenData:()=>void}) {
  const [action,setAction]=useState<Action>('prepare');
  const dataset=useDatasetStore(s=>s.dataset);
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 flex-wrap gap-2 border-b border-zinc-700 p-3">{actions.map(a=><button key={a.id} onClick={()=>setAction(a.id)} className={`rounded-lg border px-3 py-2 text-left ${action===a.id?'border-sky-500 bg-sky-950/40 text-sky-200':'border-zinc-700 text-zinc-300'}`}><span className="block text-xs font-semibold">{a.label}</span><span className="text-xs text-zinc-500">{a.detail}</span></button>)}</div>
    {action==='prepare'?<DataScreen onOpenData={onOpenData}/>:!dataset?<div className="m-auto text-sm text-zinc-400">Importa un dataset para analizarlo.</div>:action==='history'?<div className="min-h-0 flex-1 overflow-auto"><AnalysisHistoryPanel onReopenTool={id=>{if(actions.some(a=>a.id===id))setAction(id as Action);}}/></div>:<div className="min-h-0 flex-1 overflow-auto"><AnalysisToolWindow key={`${dataset.id}:${action}`} toolId={action} toolLabel={actions.find(a=>a.id===action)!.label} onOpenVisualization={()=>useAppStore.getState().setActiveModuleId('diagrams')}/></div>}
  </div>;
}
