import { useState } from 'react';
import Plot from 'react-plotly.js';
import type { ExplorationResult } from '../../lib/exploration-api';
import { toCsv } from '../../lib/geochemistry-api';
import { runSave,saveFile,type SaveNotice } from '../../lib/save-file';
import Results from './Results';

export default function ExplorationResults({result}:{result:ExplorationResult}) {
  const [distribution,setDistribution]=useState(false);
  const [notice,setNotice]=useState<SaveNotice|null>(null);
  const saveCsv=async(name:string,rows:Record<string,unknown>[])=>setNotice(await runSave(()=>saveFile(name,toCsv(rows),'text/csv;charset=utf-8')));
  const m=result.metrics;
  const profiles:Record<string,string|number>[]|undefined=m.centroids?.map(c=>({Grupo:c.group,...Object.fromEntries(Object.entries(c.values).map(([key,value])=>[`Elemento: ${key}`,value]))}));
  const valid=result.rows.filter(r=>r.status==='valid');
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex flex-wrap items-center gap-3 border-b border-zinc-700 bg-zinc-800/40 px-4 py-2 text-xs">
      {m.counts&&Object.entries(m.counts).map(([label,count])=><span key={label} className="rounded bg-zinc-800 px-2 py-1"><strong>{label}</strong> · {count}</span>)}
      {m.thresholds&&<span>Cortes: {m.thresholds.map(n=>n.toPrecision(4)).join(' / ')}</span>}
      {m.silhouette!=null&&<span>Silhouette: {m.silhouette.toFixed(3)}</span>}
      {m.inertia!=null&&<span>Inercia: {m.inertia.toFixed(2)}</span>}
      {m.unique_locations!=null&&<span>{m.unique_locations} ubicaciones · {m.supported_cells}/{m.total_cells} nodos con soporte · EPSG:{result.grid?.epsg}</span>}
      {result.tool==='anomalies'&&<button className="text-blue-300" onClick={()=>setDistribution(!distribution)}>{distribution?'Cerrar distribución':'Ver histograma y cortes'}</button>}
      {result.grid&&<button className="text-blue-300" onClick={()=>void saveCsv('pyorex-idw-grid.csv',result.grid!.y.flatMap((y,j)=>result.grid!.x.map((x,i)=>({east:x,north:y,value:result.grid!.z[j][i],epsg:result.grid!.epsg}))))}>Exportar malla CSV</button>}
    </div>
    {notice&&<p role={notice.tone==='error'?'alert':'status'} className={`shrink-0 px-4 py-1.5 text-xs select-text ${notice.tone==='error'?'bg-red-900/20 text-red-300':'bg-emerald-900/20 text-emerald-300'}`}>{notice.text}</p>}
    {distribution&&<div className="h-56 shrink-0"><Plot data={[{type:'histogram',x:valid.map(r=>r.values?.[0]??null),marker:{color:'#38bdf8'}}]} layout={{autosize:true,paper_bgcolor:'#18181b',plot_bgcolor:'#18181b',font:{color:'#d4d4d8'},margin:{t:20,b:45,l:50,r:20},xaxis:{title:{text:(result.pipeline.variables as string[])[0]}},yaxis:{title:{text:'Frecuencia'}},shapes:m.thresholds?.map(x=>({type:'line',x0:x,x1:x,y0:0,y1:1,yref:'paper',line:{color:'#fb923c',dash:'dash'}}))}} useResizeHandler style={{width:'100%',height:'100%'}} config={{displaylogo:false,responsive:true}}/></div>}
    {profiles&&<details className="shrink-0 border-b border-zinc-800 px-4 py-2 text-xs"><summary className="cursor-pointer text-blue-300">Perfil de grupos · medias de elementos en unidades originales</summary><div className="max-h-40 overflow-auto"><table className="mt-2 w-full text-left"><thead><tr>{Object.keys(profiles[0]??{}).map(k=><th key={k} className="p-2">{k}</th>)}</tr></thead><tbody>{profiles.map((row,i)=><tr key={i}>{Object.values(row).map((v,j)=><td key={j} className="p-2">{typeof v==='number'?v.toPrecision(5):v}</td>)}</tr>)}</tbody></table></div><button onClick={()=>saveCsv('pyorex-kmeans-centroids.csv',profiles!)} className="py-2 text-blue-300">Exportar perfiles CSV</button></details>}
    <Results result={result}/>
  </div>;
}
