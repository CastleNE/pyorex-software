import { useState } from 'react';
import Plot from '@/components/ThemedPlot';
import type { ExplorationResult } from '../../lib/exploration-api';
import { toCsv } from '../../lib/geochemistry-api';
import { runSave,saveFile,type SaveNotice } from '../../lib/save-file';
import Results from './Results';
import { useL } from '../../lib/i18n';

export default function ExplorationResults({result}:{result:ExplorationResult}) {
  const L=useL();
  const [distribution,setDistribution]=useState(false);
  const [notice,setNotice]=useState<SaveNotice|null>(null);
  const saveCsv=async(name:string,rows:Record<string,unknown>[])=>setNotice(await runSave(()=>saveFile(name,toCsv(rows),'text/csv;charset=utf-8')));
  const m=result.metrics;
  const profiles:Record<string,string|number>[]|undefined=m.centroids?.map(c=>({Grupo:c.group,...Object.fromEntries(Object.entries(c.values).map(([key,value])=>[`Elemento: ${key}`,value]))}));
  const valid=result.rows.filter(r=>r.status==='valid');
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-raised/40 px-4 py-2 text-xs">
      {m.counts&&Object.entries(m.counts).map(([label,count])=><span key={label} className="rounded bg-raised px-2 py-1"><strong>{label}</strong> · {count}</span>)}
      {m.thresholds&&<span>{L({es:'Cortes',en:'Thresholds'})}: {m.thresholds.map(n=>n.toPrecision(4)).join(' / ')}</span>}
      {m.silhouette!=null&&<span>Silhouette: {m.silhouette.toFixed(3)}</span>}
      {m.inertia!=null&&<span>{L({es:'Inercia',en:'Inertia'})}: {m.inertia.toFixed(2)}</span>}
      {m.unique_locations!=null&&<span>{m.unique_locations} {L({es:'ubicaciones',en:'locations'})} · {m.supported_cells}/{m.total_cells} {L({es:'nodos con soporte',en:'supported nodes'})} · EPSG:{result.grid?.epsg}</span>}
      {result.tool==='anomalies'&&<button className="text-accent-fg" onClick={()=>setDistribution(!distribution)}>{distribution?L({es:'Cerrar distribución',en:'Close distribution'}):L({es:'Ver histograma y cortes',en:'Show histogram and thresholds'})}</button>}
      {result.grid&&<button className="text-accent-fg" onClick={()=>void saveCsv('pyorex-idw-grid.csv',result.grid!.y.flatMap((y,j)=>result.grid!.x.map((x,i)=>({east:x,north:y,value:result.grid!.z[j][i],epsg:result.grid!.epsg}))))}>{L({es:'Exportar malla CSV',en:'Export grid CSV'})}</button>}
    </div>
    {notice&&<p role={notice.tone==='error'?'alert':'status'} className={`shrink-0 px-4 py-1.5 text-xs select-text ${notice.tone==='error'?'bg-danger-soft/20 text-danger':'bg-success-soft/20 text-success'}`}>{notice.text}</p>}
    {distribution&&<div className="h-56 shrink-0"><Plot data={[{type:'histogram',x:valid.map(r=>r.values?.[0]??null),marker:{color:'#38bdf8'}}]} layout={{autosize:true,paper_bgcolor:'#18181b',plot_bgcolor:'#18181b',font:{color:'#d4d4d8'},margin:{t:20,b:45,l:50,r:20},xaxis:{title:{text:(result.pipeline.variables as string[])[0]}},yaxis:{title:{text:L({es:'Frecuencia',en:'Frequency'})}},shapes:m.thresholds?.map(x=>({type:'line',x0:x,x1:x,y0:0,y1:1,yref:'paper',line:{color:'#fb923c',dash:'dash'}}))}} useResizeHandler style={{width:'100%',height:'100%'}} config={{displaylogo:false,responsive:true}}/></div>}
    {profiles&&<details className="shrink-0 border-b border-line px-4 py-2 text-xs"><summary className="cursor-pointer text-accent-fg">{L({es:'Perfil de grupos · medias de elementos en unidades originales',en:'Group profiles · element means in original units'})}</summary><div className="max-h-40 overflow-auto"><table className="mt-2 w-full text-left"><thead><tr>{Object.keys(profiles[0]??{}).map(k=><th key={k} className="p-2">{k}</th>)}</tr></thead><tbody>{profiles.map((row,i)=><tr key={i}>{Object.values(row).map((v,j)=><td key={j} className="p-2">{typeof v==='number'?v.toPrecision(5):v}</td>)}</tr>)}</tbody></table></div><button onClick={()=>saveCsv('pyorex-kmeans-centroids.csv',profiles!)} className="py-2 text-accent-fg">{L({es:'Exportar perfiles CSV',en:'Export profiles CSV'})}</button></details>}
    <Results result={result}/>
  </div>;
}
