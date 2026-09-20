import { buildGeoChart } from '../../lib/build-geo-chart';
import ChartControls from './ChartControls';
import Plotly from 'plotly.js-dist-min';
import { useMemo,useState,useRef } from 'react';
import Plot from 'react-plotly.js';
import { downloadResult,type GeoResult } from '../../lib/geochemistry-api';
import { dataUrlToBytes,extensionFor,runSave,saveFile,type SaveNotice } from '../../lib/save-file';
import { useGeochemistryStore } from '../../stores/geochemistry-store';

const printable=(value:unknown):string=>value==null?'—':typeof value==='number'?value.toLocaleString('es-PE',{maximumSignificantDigits:6}):Array.isArray(value)?value.map(printable).join(' · '):String(value);

export default function Results({result}:{result:GeoResult}) {
  const {pointSize,symbol,showLabels,attributes,presentation}=useGeochemistryStore();
  const [view,setView]=useState<'chart'|'table'>('chart');
  const [page,setPage]=useState(0);
  const chart=useRef<HTMLElement|null>(null);
  const [notice,setNotice]=useState<SaveNotice|null>(null);
  const exportImage=async(format:'png'|'jpeg'|'svg')=>{
    if(!chart.current)return;
    const target=chart.current;
    setNotice(await runSave(async()=>{
      const dataUrl=await Plotly.toImage(target,{format,width:1400,height:900});
      return saveFile(`pyorex-${result.tool}.${extensionFor(format)}`,dataUrlToBytes(dataUrl),format==='svg'?'image/svg+xml':`image/${format}`);
    }));
  };
  const exportData=async(format:'csv'|'json')=>setNotice(await runSave(()=>downloadResult(result,format)));
  const {data,layout,displayCount,colorLegend}=useMemo(()=>buildGeoChart(result,{pointSize,symbol,showLabels,attributes,presentation}),[result,pointSize,symbol,showLabels,attributes,presentation]);
  const quality=result.quality;
  return <section className="flex min-h-0 flex-1 flex-col overflow-auto">
    <div className="flex flex-wrap items-center gap-3 border-b border-zinc-700 px-4 py-2 text-xs"><strong>{result.title}</strong><span className="text-zinc-400">Total: {quality.total} · Válidas: {quality.used} · No válidas: {quality.invalid} · QAQC excluidas: {quality.excluded_qaqc}</span><div className="ml-auto flex gap-2"><button onClick={()=>setView('chart')} className="rounded border border-zinc-600 px-2 py-1">Gráfico</button><button onClick={()=>setView('table')} className="rounded border border-zinc-600 px-2 py-1">Tabla</button><button onClick={()=>void exportData('csv')} className="rounded border border-zinc-600 px-2 py-1">Exportar CSV</button><button onClick={()=>void exportData('json')} className="rounded border border-zinc-600 px-2 py-1">Guardar resultado JSON</button></div></div>
    {view==='chart'&&<div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-4 py-1.5 text-xs"><span className="text-zinc-500">Exportar gráfico</span>{(['png','jpeg','svg'] as const).map(format=><button key={format} onClick={()=>void exportImage(format)} className="rounded border border-zinc-700 px-2 py-1 text-sky-300">{format==='jpeg'?'JPG':format.toUpperCase()}</button>)}</div>}
    {notice&&<p role={notice.tone==='error'?'alert':'status'} className={`shrink-0 px-4 py-1.5 text-xs select-text ${notice.tone==='error'?'bg-red-900/20 text-red-300':'bg-emerald-900/20 text-emerald-300'}`}>{notice.text}</p>}
    <ChartControls/>
    {colorLegend.length>0&&<div className="flex flex-wrap gap-3 px-4 py-2 text-xs text-zinc-300"><strong>{String(result.pipeline.color_column)}</strong>{colorLegend.map((entry,i)=><span key={i} className="flex items-center gap-1"><i className="h-3 w-3 rounded" style={{background:entry.color}}/>{entry.min.toPrecision(4)} ≤ valor {i===4?'≤':'<'} {entry.max.toPrecision(4)}</span>)}<span>Gris: sin dato</span></div>}
    <details className="shrink-0 border-b border-zinc-800 px-4 py-2 text-xs text-zinc-400"><summary className="cursor-pointer">Fórmula, referencia y advertencias ({result.warnings.length})</summary><p className="mt-2 select-text">{result.formula}</p><p className="mt-1 select-text">{result.reference}</p>{result.warnings.map((warning,i)=><p key={i} className="mt-1 text-amber-300">{warning}</p>)}<p className="mt-2">El JSON incluye configuración, unidades, dataset y operaciones aplicadas.</p></details>
    {displayCount<quality.used&&<p role="status" className="bg-amber-900/20 px-4 py-2 text-xs text-amber-300">Gráfico limitado a las primeras {displayCount} muestras válidas. Tabla y exportación incluyen las {quality.total} filas.</p>}
    {quality.used===0&&<p role="alert" className="p-4 text-sm text-amber-300">No hay muestras válidas para graficar. Revisa los motivos en la tabla y el mapeo de columnas.</p>}
    {view==='chart'?<div className="min-h-80 flex-1"><Plot onInitialized={(_figure,element)=>{chart.current=element;}} onUpdate={(_figure,element)=>{chart.current=element;}} onPurge={()=>{chart.current=null;}} data={data} layout={layout} useResizeHandler style={{width:'100%',height:'100%'}} config={{responsive:true,displaylogo:false,toImageButtonOptions:{format:'png',filename:`pyorex-${result.tool}`,scale:2,height:800,width:1200}}}/></div>:<div className="min-h-0 flex-1 overflow-auto p-4"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-zinc-900 text-zinc-400"><tr>{['Muestra','Grupo','Estado','X','Y','Z',result.plot.kind==='spider'?'Valores normalizados':'Valores originales','Clasificación / motivo'].map(h=><th key={h} className="px-2 py-3">{h}</th>)}</tr></thead><tbody>{result.rows.slice(page*100,page*100+100).map(row=><tr key={row.row_index} className="border-t border-zinc-800"><td className="px-2 py-2">{row.sample_id}</td><td>{row.group}</td><td className={row.status==='valid'?'text-emerald-400':'text-amber-400'}>{row.status}</td>{[row.x,row.y,row.z,row.values].map((v,i)=><td key={i} className="px-2 tabular-nums">{printable(v)}</td>)}<td>{row.classification??row.reason??'—'}</td></tr>)}</tbody></table><div className="mt-4 flex items-center gap-4 text-xs"><button disabled={page===0} onClick={()=>setPage(page-1)} className="disabled:opacity-30">← Anterior</button><span>Página {page+1} / {Math.max(1,Math.ceil(result.rows.length/100))}</span><button disabled={(page+1)*100>=result.rows.length} onClick={()=>setPage(page+1)} className="disabled:opacity-30">Siguiente →</button></div></div>}
  </section>;
}

