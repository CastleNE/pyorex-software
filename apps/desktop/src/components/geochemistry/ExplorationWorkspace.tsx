import { useEffect, useRef, useState } from 'react';
import { useDatasetStore } from '../../stores/dataset-store';
import { useAppStore } from '../../stores/app-store';
import { geoApi, type GeoColumn } from '../../lib/geochemistry-api';
import { explore, parseBreaks, type ExplorationConfig, type ExplorationResult, type ExplorationTool } from '../../lib/exploration-api';
import AnalysisToolWindow from '../tool-windows/AnalysisToolWindow';
import ExplorationResults from './ExplorationResults';
import Workbench from './Workbench';
import { useL } from '../../lib/i18n';

const input='w-full rounded-md border border-line-strong bg-app px-2 py-2 text-sm text-fg focus:border-accent';
const TOOLS=[
  {id:'anomalies',label:{es:'Anomalías',en:'Anomalies'},detail:{es:'Umbrales libres · Au, Cu y otros',en:'Custom thresholds · Au, Cu and others'}},
  {id:'kmeans',label:{es:'K-means',en:'K-means'},detail:{es:'Asociaciones multielementales',en:'Multi-element associations'}},
  {id:'isovalues',label:{es:'Isovalores',en:'Contours'},detail:{es:'Superficie y curvas IDW',en:'IDW surface and contours'}},
  {id:'pca',label:{es:'PCA',en:'PCA'},detail:{es:'Scores · cargas · varianza',en:'Scores · loadings · variance'}},
  {id:'alteration',label:{es:'Alteración',en:'Alteration'},detail:{es:'Diagrama AI–CCPI',en:'AI–CCPI diagram'}},
] as const;
export type Tool=typeof TOOLS[number]['id'];

/** `active` (from the Geoquímica ribbon) controls the tool and hides the internal tool grid. */
export default function ExplorationWorkspace({onOpenData,active}:{onOpenData:()=>void;active?:Tool}) {
  const L=useL();
  const dataset=useDatasetStore(s=>s.dataset);
  const [localTool,setTool]=useState<Tool>('anomalies');const tool=active??localTool;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {!active&&<div className="grid shrink-0 grid-cols-3 gap-2 border-b border-line bg-app p-3 xl:grid-cols-5">{TOOLS.map(t=><button key={t.id} onClick={()=>setTool(t.id)} className={`rounded-lg border px-3 py-2 text-left ${tool===t.id?'border-accent bg-accent-soft/50 text-accent-fg':'border-line bg-raised/40 text-fg hover:border-line-strong'}`}><span className="block text-sm font-semibold">{L(t.label)}</span><span className="text-xs text-muted">{L(t.detail)}</span></button>)}</div>}
    {!dataset?<div className="m-auto text-center"><p className="mb-3 text-muted">{L({es:'Importa muestras para explorar su geoquímica.',en:'Import samples to explore their geochemistry.'})}</p><button onClick={onOpenData} className="rounded bg-accent-strong px-4 py-2">{L({es:'Importar datos',en:'Import data'})}</button></div>:
      tool==='pca'?<div key={dataset.id} className="min-h-0 flex-1 overflow-auto"><AnalysisToolWindow toolId="principal-component-analysis" toolLabel="PCA" onOpenVisualization={()=>useAppStore.getState().setActiveModuleId('diagrams')}/></div>:
      tool==='alteration'?<Workbench group="mineral-exploration" onOpenData={onOpenData}/>:
      <ExplorationForm key={`${dataset.id}:${tool}`} tool={tool} datasetId={dataset.id}/>}
  </div>;
}

function ExplorationForm({tool,datasetId}:{tool:ExplorationTool;datasetId:string}) {
  const L=useL();
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
  const pick=(label:string,value:string|null,update:(value:string|null)=>void,choices=columns)=> <label className="block space-y-1 text-xs text-muted"><span>{label}</span><select aria-label={label} className={input} value={value??''} onChange={e=>update(e.target.value||null)}><option value="">{L({es:'Seleccionar…',en:'Select…'})}</option>{choices.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select></label>;
  const number=(label:string,key:'k'|'seed'|'resolution'|'power'|'neighbors',min:number,max:number,step=1)=><label className="block space-y-1 text-xs text-muted"><span>{label}</span><input aria-label={label} className={input} type="number" min={min} max={max} step={step} value={config[key]} onChange={e=>change({[key]:Number(e.target.value)})}/></label>;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2"><button className="text-xs text-accent-fg" onClick={()=>setOpen(!open)}>{open?L({es:'Ocultar parámetros',en:'Hide parameters'}):L({es:'Mostrar parámetros',en:'Show parameters'})}</button><span className="text-xs text-subtle">{L({es:'Datos originales conservados · resultados exportables',en:'Original data preserved · exportable results'})}</span></div>
    <div className="flex min-h-0 min-w-0 flex-1">
      {open&&<aside className="flex w-72 shrink-0 flex-col border-r border-line bg-raised/20">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {tool==='kmeans'?<fieldset><legend className="mb-2 text-sm font-medium">{L({es:'Elementos',en:'Elements'})} ({config.variables.length})</legend><div className="max-h-52 space-y-1 overflow-auto rounded border border-line p-2">{numeric.map(c=><label key={c.name} className="flex gap-2 py-1 text-xs"><input type="checkbox" checked={config.variables.includes(c.name)} onChange={e=>change({variables:e.target.checked?[...config.variables,c.name]:config.variables.filter(v=>v!==c.name)})}/>{c.name}</label>)}</div></fieldset>:pick(L({es:'Elemento',en:'Element'}),config.variables[0]??null,v=>change({variables:v?[v]:[]}),numeric)}
          {tool==='anomalies'&&<>
            <label className="block space-y-1 text-xs text-muted"><span>{L({es:'Definir clases por',en:'Define classes by'})}</span><select className={input} value={config.method} onChange={e=>change({method:e.target.value as 'manual'|'percentile'})}><option value="percentile">{L({es:'Percentiles de mis muestras',en:'Percentiles of my samples'})}</option><option value="manual">{L({es:'Valores que yo defina',en:'User-defined values'})}</option></select></label>
            <label className="block space-y-1 text-xs text-muted"><span>{config.method==='manual'?L({es:'Cortes en unidades de la columna',en:'Breaks in column units'}):L({es:'Percentiles (0–100)',en:'Percentiles (0–100)'})}</span><input aria-label={L({es:'Cortes',en:'Breaks'})} className={input} value={cuts} onChange={e=>{invalidate();setCuts(e.target.value);}}/></label>
            <label className="block space-y-1 text-xs text-muted"><span>{L({es:'Nombres de las clases',en:'Class names'})}</span><input aria-label={L({es:'Nombres de las clases',en:'Class names'})} className={input} value={labels} onChange={e=>{invalidate();setLabels(e.target.value);}}/></label>
            <p className="text-xs leading-relaxed text-subtle">{L({es:'Separa con ;. Puedes definir entre 2 y 10 clases. Cada corte inicia la clase siguiente. Confirma las unidades: Au en ppb y Au en ppm requieren cortes distintos.',en:'Separate with ;. You can define 2 to 10 classes. Each break starts the next class. Check units: Au in ppb and Au in ppm need different breaks.'})}</p>
          </>}
          {tool==='kmeans'&&<><div className="grid grid-cols-2 gap-2">{number(L({es:'Número de grupos K',en:'Number of clusters K'}),'k',2,20)}{number(L({es:'Semilla',en:'Seed'}),'seed',0,2147483647)}</div><label className="block space-y-1 text-xs text-muted"><span>{L({es:'Transformación previa',en:'Pre-transform'})}</span><select className={input} value={config.transform} onChange={e=>change({transform:e.target.value as 'none'|'log10'})}><option value="none">{L({es:'Sin transformación',en:'No transform'})}</option><option value="log10">{L({es:'Log10 (valores positivos)',en:'Log10 (positive values)'})}</option></select></label><p className="text-xs text-subtle">{L({es:'Se estandariza cada variable para evitar que su escala domine la agrupación.',en:'Each variable is standardised so its scale does not dominate the clustering.'})}</p></>}
          <details open={tool==='isovalues'} className="space-y-3 border-t border-line pt-3"><summary className="cursor-pointer text-sm text-fg">{tool==='isovalues'?L({es:'Coordenadas del mapa',en:'Map coordinates'}):L({es:'Mostrar en mapa (opcional)',en:'Show on map (optional)'})}</summary>
            {pick(L({es:'Este / X',en:'Easting / X'}),config.east,v=>change({east:v}),numeric)}{pick(L({es:'Norte / Y',en:'Northing / Y'}),config.north,v=>change({north:v}),numeric)}
            {tool==='isovalues'&&<label className="block space-y-1 text-xs text-muted"><span>{L({es:'EPSG proyectado (ej. 32718)',en:'Projected EPSG (e.g. 32718)'})}</span><input aria-label={L({es:'EPSG proyectado',en:'Projected EPSG'})} className={input} type="number" placeholder={L({es:'Confirma el CRS de tus datos',en:'Confirm the CRS of your data'})} value={config.epsg??''} onChange={e=>change({epsg:e.target.value?Number(e.target.value):null})}/></label>}
            {tool!=='isovalues'&&<button className="text-xs text-accent-fg" onClick={()=>change({east:null,north:null})}>{L({es:'Quitar coordenadas',en:'Remove coordinates'})}</button>}
          </details>
          {tool==='isovalues'&&<><div className="grid grid-cols-2 gap-2">{number(L({es:'Potencia IDW',en:'IDW power'}),'power',.5,5,.5)}{number(L({es:'Vecinos',en:'Neighbours'}),'neighbors',3,64)}{number(L({es:'Nodos por eje',en:'Nodes per axis'}),'resolution',11,200)}</div><label className="block space-y-1 text-xs text-muted"><span>{L({es:'Radio máximo (unidades del CRS)',en:'Maximum radius (CRS units)'})}</span><input aria-label={L({es:'Radio máximo',en:'Maximum radius'})} className={input} type="number" min="0" placeholder={L({es:'Sin límite',en:'No limit'})} value={config.radius??''} onChange={e=>change({radius:e.target.value?Number(e.target.value):null})}/></label><p className="text-xs text-subtle">{L({es:'Usa muestras de una misma superficie. No mezcles intervalos a distintas profundidades.',en:'Use samples from a single surface. Do not mix intervals from different depths.'})}</p></>}
          {pick(L({es:'Identificador de muestra',en:'Sample ID'}),config.label_column,v=>change({label_column:v}))}
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={config.include_qaqc} onChange={e=>change({include_qaqc:e.target.checked})}/>{L({es:'Incluir controles QAQC',en:'Include QAQC controls'})}</label>
        </div>
        <footer className="border-t border-line p-3"><button onClick={()=>void run()} disabled={busy||loading||config.variables.length<(tool==='kmeans'?2:1)} className="w-full rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-40">{busy?L({es:'Calculando…',en:'Computing…'}):tool==='isovalues'?L({es:'Generar isovalores',en:'Generate contours'}):tool==='kmeans'?L({es:'Calcular grupos',en:'Compute clusters'}):L({es:'Clasificar anomalías',en:'Classify anomalies'})}</button></footer>
      </aside>}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {error&&<p role="alert" className="border-b border-danger-line bg-danger-soft/30 p-4 text-sm text-danger">{error}</p>}
        {result?<ExplorationResults key={result.created_at} result={result}/>:<div className="m-auto max-w-lg p-8 text-center"><h2 className="text-2xl font-semibold text-fg">{L(TOOLS.find(t=>t.id===tool)?.label??'')}</h2><p role="status" className="mt-3 text-sm leading-relaxed text-muted">{busy?L({es:'Procesando muestras y verificando resultados…',en:'Processing samples and checking results…'}):loading?L({es:'Cargando columnas…',en:'Loading columns…'}):tool==='anomalies'?L({es:'Elige un elemento y define tus clases. Verás las muestras coloreadas, la distribución y los cortes utilizados.',en:'Choose an element and define your classes. You will see the coloured samples, the distribution and the breaks used.'}):tool==='kmeans'?L({es:'Selecciona los elementos que representan tu problema geológico. Obtendrás grupos, perfiles y una medida de separación.',en:'Select the elements that represent your geological problem. You will get clusters, profiles and a separation measure.'}):L({es:'Selecciona un elemento y sus coordenadas proyectadas para generar una superficie IDW con curvas de igual valor.',en:'Select an element and its projected coordinates to generate an IDW surface with contour lines.'})}</p></div>}
      </main>
    </div>
  </div>;
}
