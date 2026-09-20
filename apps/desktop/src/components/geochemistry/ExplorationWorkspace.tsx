import { useEffect, useRef, useState } from 'react';
import { useDatasetStore } from '../../stores/dataset-store';
import { useAppStore } from '../../stores/app-store';
import { geoApi, type GeoColumn } from '../../lib/geochemistry-api';
import { explore, parseBreaks, type ExplorationConfig, type ExplorationResult, type ExplorationTool } from '../../lib/exploration-api';
import AnalysisToolWindow from '../tool-windows/AnalysisToolWindow';
import ExplorationResults from './ExplorationResults';
import Workbench from './Workbench';

const input='w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 py-2 text-sm text-zinc-100 focus:border-sky-400';
const TOOLS=[
  {id:'anomalies',label:'Anomalías',detail:'Umbrales libres · Au, Cu y otros'},
  {id:'kmeans',label:'K-means',detail:'Asociaciones multielementales'},
  {id:'isovalues',label:'Isovalores',detail:'Superficie y curvas IDW'},
  {id:'pca',label:'PCA',detail:'Scores · cargas · varianza'},
  {id:'alteration',label:'Alteración',detail:'Diagrama AI–CCPI'},
] as const;
type Tool=typeof TOOLS[number]['id'];

export default function ExplorationWorkspace({onOpenData}:{onOpenData:()=>void}) {
  const dataset=useDatasetStore(s=>s.dataset);
  const [tool,setTool]=useState<Tool>('anomalies');
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-zinc-700 bg-zinc-900 p-3 xl:grid-cols-5">{TOOLS.map(t=><button key={t.id} onClick={()=>setTool(t.id)} className={`rounded-lg border px-3 py-2 text-left ${tool===t.id?'border-sky-500 bg-sky-950/50 text-sky-200':'border-zinc-700 bg-zinc-800/40 text-zinc-300 hover:border-zinc-500'}`}><span className="block text-sm font-semibold">{t.label}</span><span className="text-xs text-zinc-400">{t.detail}</span></button>)}</div>
    {!dataset?<div className="m-auto text-center"><p className="mb-3 text-zinc-400">Importa muestras para explorar su geoquímica.</p><button onClick={onOpenData} className="rounded bg-sky-600 px-4 py-2">Importar datos</button></div>:
      tool==='pca'?<div key={dataset.id} className="min-h-0 flex-1 overflow-auto"><AnalysisToolWindow toolId="principal-component-analysis" toolLabel="PCA" onOpenVisualization={()=>useAppStore.getState().setActiveModuleId('diagrams')}/></div>:
      tool==='alteration'?<Workbench group="mineral-exploration" onOpenData={onOpenData}/>:
      <ExplorationForm key={`${dataset.id}:${tool}`} tool={tool} datasetId={dataset.id}/>}
  </div>;
}

function ExplorationForm({tool,datasetId}:{tool:ExplorationTool;datasetId:string}) {
  const spatial=useDatasetStore(s=>s.dataset?.spatialConfig);
  const [columns,setColumns]=useState<GeoColumn[]>([]);
  const [config,setConfig]=useState<ExplorationConfig>({tool,variables:[],include_qaqc:false,label_column:null,
    method:'percentile',breaks:[80,95,99],labels:['Fondo','Baja','Media','Alta'],k:3,seed:42,transform:'none',
    east:tool==='isovalues'?spatial?.east_col??null:null,north:tool==='isovalues'?spatial?.north_col??null:null,
    epsg:spatial?.projected_epsg?Number(spatial.projected_epsg.replace('EPSG:','')):null,
    resolution:60,power:2,neighbors:12,radius:null});
  const [cuts,setCuts]=useState('80; 95; 99');
  const [labels,setLabels]=useState('Fondo; Baja; Media; Alta');
  const [result,setResult]=useState<ExplorationResult|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const version=useRef(0);
  const [open,setOpen]=useState(true);
  useEffect(()=>{let mounted=true;void geoApi.catalog(datasetId).then(c=>{if(mounted)setColumns(c.columns);}).catch(e=>{if(mounted)setError(String(e));}).finally(()=>{if(mounted)setLoading(false);});return()=>{mounted=false;version.current++;};},[datasetId]);
  const invalidate=()=>{version.current++;setResult(null);setError(null);setBusy(false);};
  const change=(patch:Partial<ExplorationConfig>)=>{invalidate();setConfig(c=>({...c,...patch}));};
  async function run(){
    const ticket=++version.current;setBusy(true);setError(null);setResult(null);
    try{
      const request={...config,...(tool==='anomalies'?{breaks:parseBreaks(cuts),labels:labels.split(';').map(x=>x.trim())}:{})};
      const response=await explore(datasetId,request);if(ticket===version.current)setResult(response);
    }catch(e){if(ticket===version.current)setError(String(e));}
    finally{if(ticket===version.current)setBusy(false);}
  }
  const numeric=columns.filter(c=>c.numeric);
  const pick=(label:string,value:string|null,update:(value:string|null)=>void,choices=columns)=> <label className="block space-y-1 text-xs text-zinc-400"><span>{label}</span><select aria-label={label} className={input} value={value??''} onChange={e=>update(e.target.value||null)}><option value="">Seleccionar…</option>{choices.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select></label>;
  const number=(label:string,key:'k'|'seed'|'resolution'|'power'|'neighbors',min:number,max:number,step=1)=><label className="block space-y-1 text-xs text-zinc-400"><span>{label}</span><input aria-label={label} className={input} type="number" min={min} max={max} step={step} value={config[key]} onChange={e=>change({[key]:Number(e.target.value)})}/></label>;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-2"><button className="text-xs text-sky-300" onClick={()=>setOpen(!open)}>{open?'Ocultar parámetros':'Mostrar parámetros'}</button><span className="text-xs text-zinc-500">Datos originales conservados · resultados exportables</span></div>
    <div className="flex min-h-0 min-w-0 flex-1">
      {open&&<aside className="flex w-72 shrink-0 flex-col border-r border-zinc-700 bg-zinc-800/20">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {tool==='kmeans'?<fieldset><legend className="mb-2 text-sm font-medium">Elementos ({config.variables.length})</legend><div className="max-h-52 space-y-1 overflow-auto rounded border border-zinc-700 p-2">{numeric.map(c=><label key={c.name} className="flex gap-2 py-1 text-xs"><input type="checkbox" checked={config.variables.includes(c.name)} onChange={e=>change({variables:e.target.checked?[...config.variables,c.name]:config.variables.filter(v=>v!==c.name)})}/>{c.name}</label>)}</div></fieldset>:pick('Elemento',config.variables[0]??null,v=>change({variables:v?[v]:[]}),numeric)}
          {tool==='anomalies'&&<>
            <label className="block space-y-1 text-xs text-zinc-400"><span>Definir clases por</span><select className={input} value={config.method} onChange={e=>change({method:e.target.value as 'manual'|'percentile'})}><option value="percentile">Percentiles de mis muestras</option><option value="manual">Valores que yo defina</option></select></label>
            <label className="block space-y-1 text-xs text-zinc-400"><span>{config.method==='manual'?'Cortes en unidades de la columna':'Percentiles (0–100)'}</span><input aria-label="Cortes" className={input} value={cuts} onChange={e=>{invalidate();setCuts(e.target.value);}}/></label>
            <label className="block space-y-1 text-xs text-zinc-400"><span>Nombres de las clases</span><input aria-label="Nombres de las clases" className={input} value={labels} onChange={e=>{invalidate();setLabels(e.target.value);}}/></label>
            <p className="text-xs leading-relaxed text-zinc-500">Separa con ;. Puedes definir entre 2 y 10 clases. Cada corte inicia la clase siguiente. Confirma las unidades: Au en ppb y Au en ppm requieren cortes distintos.</p>
          </>}
          {tool==='kmeans'&&<><div className="grid grid-cols-2 gap-2">{number('Número de grupos K','k',2,20)}{number('Semilla','seed',0,2147483647)}</div><label className="block space-y-1 text-xs text-zinc-400"><span>Transformación previa</span><select className={input} value={config.transform} onChange={e=>change({transform:e.target.value as 'none'|'log10'})}><option value="none">Sin transformación</option><option value="log10">Log10 (valores positivos)</option></select></label><p className="text-xs text-zinc-500">Se estandariza cada variable para evitar que su escala domine la agrupación.</p></>}
          <details open={tool==='isovalues'} className="space-y-3 border-t border-zinc-700 pt-3"><summary className="cursor-pointer text-sm text-zinc-300">{tool==='isovalues'?'Coordenadas del mapa':'Mostrar en mapa (opcional)'}</summary>
            {pick('Este / X',config.east,v=>change({east:v}),numeric)}{pick('Norte / Y',config.north,v=>change({north:v}),numeric)}
            {tool==='isovalues'&&<label className="block space-y-1 text-xs text-zinc-400"><span>EPSG proyectado (ej. 32718)</span><input aria-label="EPSG proyectado" className={input} type="number" placeholder="Confirma el CRS de tus datos" value={config.epsg??''} onChange={e=>change({epsg:e.target.value?Number(e.target.value):null})}/></label>}
            {tool!=='isovalues'&&<button className="text-xs text-sky-300" onClick={()=>change({east:null,north:null})}>Quitar coordenadas</button>}
          </details>
          {tool==='isovalues'&&<><div className="grid grid-cols-2 gap-2">{number('Potencia IDW','power',.5,5,.5)}{number('Vecinos','neighbors',3,64)}{number('Nodos por eje','resolution',11,200)}</div><label className="block space-y-1 text-xs text-zinc-400"><span>Radio máximo (unidades del CRS)</span><input aria-label="Radio máximo" className={input} type="number" min="0" placeholder="Sin límite" value={config.radius??''} onChange={e=>change({radius:e.target.value?Number(e.target.value):null})}/></label><p className="text-xs text-zinc-500">Usa muestras de una misma superficie. No mezcles intervalos a distintas profundidades.</p></>}
          {pick('Identificador de muestra',config.label_column,v=>change({label_column:v}))}
          <label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={config.include_qaqc} onChange={e=>change({include_qaqc:e.target.checked})}/>Incluir controles QAQC</label>
        </div>
        <footer className="border-t border-zinc-700 p-3"><button onClick={()=>void run()} disabled={busy||loading||config.variables.length<(tool==='kmeans'?2:1)} className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40">{busy?'Calculando…':tool==='isovalues'?'Generar isovalores':tool==='kmeans'?'Calcular grupos':'Clasificar anomalías'}</button></footer>
      </aside>}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {error&&<p role="alert" className="border-b border-red-900 bg-red-950/30 p-4 text-sm text-red-300">{error}</p>}
        {result?<ExplorationResults key={result.created_at} result={result}/>:<div className="m-auto max-w-lg p-8 text-center"><h2 className="text-2xl font-semibold text-zinc-200">{TOOLS.find(t=>t.id===tool)?.label}</h2><p role="status" className="mt-3 text-sm leading-relaxed text-zinc-400">{busy?'Procesando muestras y verificando resultados…':loading?'Cargando columnas…':tool==='anomalies'?'Elige un elemento y define tus clases. Verás las muestras coloreadas, la distribución y los cortes utilizados.':tool==='kmeans'?'Selecciona los elementos que representan tu problema geológico. Obtendrás grupos, perfiles y una medida de separación.':'Selecciona un elemento y sus coordenadas proyectadas para generar una superficie IDW con curvas de igual valor.'}</p></div>}
      </main>
    </div>
  </div>;
}
