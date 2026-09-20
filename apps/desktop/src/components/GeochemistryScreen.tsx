/** Geochemistry owns its data preparation, statistics, diagrams and exploration. */
import { useDatasetStore } from "@/stores/dataset-store";
import { useAppStore } from "@/stores/app-store";

import DataAnalysisWorkspace from "@/components/geochemistry/DataAnalysisWorkspace";
import Workbench from "@/components/geochemistry/Workbench";
import ExplorationWorkspace from "@/components/geochemistry/ExplorationWorkspace";

const GROUPS = [
  { id: "data", label: "DATA ANALYSIS" },
  { id: "diagrams", label: "DIAGRAMS" },
  { id: "litogeochemistry", label: "Litogeoquímica" },
  { id: "mineral-exploration", label: "Exploración" },
];

export default function GeochemistryScreen({onOpenData}:{onOpenData:()=>void}) {
  const {dataset,allDatasets,setActiveDataset}=useDatasetStore();
  const {activeModuleId,setActiveModuleId}=useAppStore();
  const group=activeModuleId==='data-analysis'?'data':GROUPS.some(g=>g.id===activeModuleId)?activeModuleId:'diagrams';
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-700 bg-zinc-800/30 px-3 py-2">
      {GROUPS.map(g=><button key={g.id} onClick={()=>setActiveModuleId(g.id)} className={`rounded-md border px-3 py-2 text-xs font-medium ${group===g.id?'border-sky-500 bg-sky-950/40 text-sky-200':'border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}>{g.label}</button>)}
      <div className="ml-auto flex items-center gap-2">
        {allDatasets.length>0&&<select aria-label="Dataset activo" value={dataset?.id??''} onChange={e=>setActiveDataset(e.target.value)} className="max-w-64 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300">{allDatasets.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>}
        <button onClick={onOpenData} className="rounded border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:border-sky-500">Importar datos</button>
      </div>
    </div>
    <div key={dataset?.id??'no-dataset'} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {group==='data'&&<DataAnalysisWorkspace onOpenData={onOpenData}/>}
      {group==='diagrams'&&<Workbench group="diagrams" onOpenData={onOpenData}/>}
      {group==='litogeochemistry'&&<Workbench group="lithogeochemistry" onOpenData={onOpenData}/>}
      {group==='mineral-exploration'&&<ExplorationWorkspace onOpenData={onOpenData}/>}
    </div>
  </div>;
}
