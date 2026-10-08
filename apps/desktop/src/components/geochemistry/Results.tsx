import { buildGeoChart } from '../../lib/build-geo-chart';
import ChartControls from './ChartControls';
import Plotly from 'plotly.js-dist-min';
import { useMemo,useState,useRef } from 'react';
import Plot from '@/components/ThemedPlot';
import { downloadResult,type GeoResult } from '../../lib/geochemistry-api';
import { dataUrlToBytes,extensionFor,runSave,saveFile,type SaveNotice } from '../../lib/save-file';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import PxIcon from '../PxIcon';
import { classIndex, classRange, type SizeClassLegend } from '../../lib/size-classes';
import type { ColorClassLegend } from '../../lib/color-classes';
import { useL } from '../../lib/i18n';
import { toolLabel } from '../../lib/tool-labels';
import { CUSTOM_TOOL_ID } from '../../lib/custom-diagrams';

export const printable=(value:unknown):string=>value==null?'—':typeof value==='number'?value.toLocaleString('es-PE',{maximumSignificantDigits:6}):Array.isArray(value)?value.map(printable).join(' · '):String(value);

export default function Results({result}:{result:GeoResult}) {
  const L=useL();
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
  const {data,layout,displayCount,colorLegend,sizeLegend}=useMemo(()=>buildGeoChart(result,{pointSize,symbol,showLabels,attributes,presentation}),[result,pointSize,symbol,showLabels,attributes,presentation]);
  const quality=result.quality;
  return <section className="flex min-h-0 flex-1 flex-col overflow-auto">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2 text-xs">
      <strong className="mr-1 text-[13px] text-fg">{result.tool===CUSTOM_TOOL_ID?result.title:L(toolLabel({id:result.tool,label:result.title}))}</strong>
      <span className="rounded-full bg-sunken px-2 py-0.5 text-muted">Total <b className="tabular font-mono font-medium text-fg">{quality.total}</b></span>
      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent-fg">{L({es:'Válidas',en:'Valid'})} <b className="tabular font-mono font-medium">{quality.used}</b></span>
      {quality.invalid>0&&<span className="rounded-full bg-warning-soft px-2 py-0.5 text-warning">{L({es:'No válidas',en:'Invalid'})} <b className="tabular font-mono font-medium">{quality.invalid}</b></span>}
      {quality.excluded_qaqc>0&&<span className="rounded-full bg-sunken px-2 py-0.5 text-muted">{L({es:'QAQC excluidas',en:'QA/QC excluded'})} <b className="tabular font-mono font-medium">{quality.excluded_qaqc}</b></span>}
      <div className="ml-auto flex items-center gap-2">
        <div className="flex rounded bg-sunken p-0.5" role="group" aria-label={L({es:'Vista',en:'View'})}>{(['chart','table'] as const).map(v=><button key={v} onClick={()=>setView(v)} aria-pressed={view===v} className={`flex h-6 items-center gap-1 rounded px-2 font-medium ${view===v?'bg-raised text-fg shadow-window':'text-muted hover:text-fg'}`}><PxIcon name={v==='chart'?'scatter':'table'} className="h-3.5 w-3.5"/>{v==='chart'?L({es:'Gráfico',en:'Chart'}):L({es:'Tabla',en:'Table'})}</button>)}</div>
        {view==='chart'&&<div className="flex items-center gap-1" role="group" aria-label={L({es:'Exportar gráfico',en:'Export chart'})}><span className="text-subtle">{L({es:'Figura',en:'Figure'})}</span>{(['png','jpeg','svg'] as const).map(format=><button key={format} onClick={()=>void exportImage(format)} className="h-6 rounded border border-line-strong bg-raised px-2 font-mono text-[11px] text-fg hover:bg-hover">{format==='jpeg'?'JPG':format.toUpperCase()}</button>)}</div>}
        <button onClick={()=>void exportData('csv')} className="flex h-6 items-center gap-1 rounded border border-line-strong bg-raised px-2 text-fg hover:bg-hover"><PxIcon name="export" className="h-3.5 w-3.5"/>{L({es:'Exportar CSV',en:'Export CSV'})}</button>
        <button onClick={()=>void exportData('json')} className="flex h-6 items-center gap-1 rounded border border-line-strong bg-raised px-2 text-fg hover:bg-hover"><PxIcon name="code" className="h-3.5 w-3.5"/>{L({es:'Guardar resultado JSON',en:'Save result JSON'})}</button>
      </div>
    </div>
    {notice&&<p role={notice.tone==='error'?'alert':'status'} className={`shrink-0 px-4 py-1.5 text-xs select-text ${notice.tone==='error'?'bg-danger-soft text-danger':'bg-success-soft text-success'}`}>{notice.text}</p>}
    <ChartControls/>
    {sizeLegend&&<SizeLegend legend={sizeLegend} title={L({es:'Tamaño',en:'Size'})} noData={L({es:'sin dato',en:'no data'})}/>}
    {colorLegend&&<ColorLegend legend={colorLegend} title={L({es:'Color',en:'Color'})} noData={L({es:'sin dato',en:'no data'})} values={result.rows.filter(r=>r.status==='valid').map(r=>r.color_value)}/>}
    <details className="shrink-0 border-b border-line px-4 py-2 text-xs text-muted"><summary className="cursor-pointer">{L({es:'Fórmula, referencia y advertencias',en:'Formula, reference and warnings'})} ({result.warnings.length})</summary><p className="mt-2 select-text">{result.formula}</p><p className="mt-1 select-text">{result.reference}</p>{result.warnings.map((warning,i)=><p key={i} className="mt-1 text-warning">{warning}</p>)}<p className="mt-2">{L({es:'El JSON incluye configuración, unidades, dataset y operaciones aplicadas.',en:'The JSON includes configuration, units, dataset and applied operations.'})}</p></details>
    {displayCount<quality.used&&<p role="status" className="border-b border-warning-line bg-warning-soft px-4 py-2 text-xs text-warning">{L({es:`Gráfico limitado a las primeras ${displayCount} muestras válidas. Tabla y exportación incluyen las ${quality.total} filas.`,en:`Chart limited to the first ${displayCount} valid samples. Table and export include all ${quality.total} rows.`})}</p>}
    {quality.used===0&&<p role="alert" className="p-4 text-sm text-warning">{L({es:'No hay muestras válidas para graficar. Revisa los motivos en la tabla y el mapeo de columnas.',en:'No valid samples to plot. Check the reasons in the table and the column mapping.'})}</p>}
    {view==='chart'?<div className="min-h-80 flex-1"><Plot onInitialized={(_figure,element)=>{chart.current=element;}} onUpdate={(_figure,element)=>{chart.current=element;}} onPurge={()=>{chart.current=null;}} data={data} layout={layout} useResizeHandler style={{width:'100%',height:'100%'}} config={{responsive:true,displaylogo:false,toImageButtonOptions:{format:'png',filename:`pyorex-${result.tool}`,scale:2,height:800,width:1200}}}/></div>:<div className="min-h-0 flex-1 overflow-auto p-4"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-panel text-[11px] uppercase tracking-wide text-subtle"><tr>{[L({es:'Muestra',en:'Sample'}),L({es:'Grupo',en:'Group'}),L({es:'Estado',en:'Status'}),'X','Y','Z',result.plot.kind==='spider'?L({es:'Valores normalizados',en:'Normalized values'}):L({es:'Valores originales',en:'Original values'}),L({es:'Clasificación / motivo',en:'Classification / reason'})].map(h=><th key={h} className="border-b border-line px-2 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>{result.rows.slice(page*100,page*100+100).map(row=><tr key={row.row_index} className="border-t border-line hover:bg-hover"><td className="px-2 py-1.5 font-mono text-fg">{row.sample_id}</td><td className="px-2">{row.group}</td><td className="px-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${row.status==='valid'?'bg-success-soft text-success':'bg-warning-soft text-warning'}`}>{row.status}</span></td>{[row.x,row.y,row.z,row.values].map((v,i)=><td key={i} className="px-2 font-mono tabular-nums">{printable(v)}</td>)}<td className="px-2">{row.classification??row.reason??'—'}</td></tr>)}</tbody></table><div className="mt-4 flex items-center gap-4 text-xs"><button disabled={page===0} onClick={()=>setPage(page-1)} className="disabled:opacity-30">← {L({es:'Anterior',en:'Previous'})}</button><span>{L({es:'Página',en:'Page'})} {page+1} / {Math.max(1,Math.ceil(result.rows.length/100))}</span><button disabled={(page+1)*100>=result.rows.length} onClick={()=>setPage(page+1)} className="disabled:opacity-30">{L({es:'Siguiente',en:'Next'})} →</button></div></div>}
  </section>;
}


/** Legend for "Color por valor": histogram of the column coloured by class, and one swatch per class with its range and n (lib/color-classes.ts). */
export function ColorLegend({legend,values,title,noData}:{legend:ColorClassLegend&{label:string};values:(number|null|undefined)[];title:string;noData:string}) {
  const usable=values.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)&&(!legend.log||v>0));
  if(!usable.length)return null;
  const T=(x:number)=>legend.log?Math.log10(x):x,TI=(x:number)=>legend.log?10**x:x,B=24;
  const lo=T(usable.reduce((a,b)=>Math.min(a,b))),hi=T(usable.reduce((a,b)=>Math.max(a,b))),span=hi-lo||1;
  const bins=new Array(B).fill(0) as number[];
  for(const v of usable)bins[Math.min(B-1,Math.floor((T(v)-lo)/span*B))]++;
  const peak=Math.max(1,...bins);
  return <div className="flex shrink-0 flex-wrap items-end gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-xs">
    <div className="flex flex-col gap-1"><span className="text-[11px] text-muted"><b className="font-semibold uppercase tracking-[0.06em]">{title}</b> · <span className="font-mono text-fg">{legend.label}</span>{legend.log?' · log':''}</span>
      <svg viewBox={`0 0 ${B*8} 40`} className="h-10 w-48 rounded bg-sunken" preserveAspectRatio="none" role="img" aria-label={`${title} · ${legend.label}`}>
        {bins.map((n,i)=><rect key={i} x={i*8+1} y={38-36*n/peak} width={6} height={36*n/peak} rx={1} fill={legend.colors[classIndex(TI(lo+(i+.5)/B*span),legend.breaks,legend.boundary)]}/>)}
      </svg>
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1">{legend.colors.map((c,k)=><span key={k} className="flex items-center gap-1.5 text-fg"><i className="h-3 w-3 rounded-sm" style={{background:c}}/><span className="tabular font-mono">{classRange(legend,k)}</span><span className="tabular font-mono text-subtle">n={legend.counts[k]}</span></span>)}
      {legend.missing>0&&<span className="flex items-center gap-1.5 text-muted"><i className="h-3 w-3 rounded-sm bg-subtle"/>{noData} <span className="tabular font-mono">n={legend.missing}</span></span>}</div>
  </div>;
}

/** Legend for "Tamaño por clases": one symbol per class with its range and sample count (lib/size-classes.ts). */
export function SizeLegend({legend,title,noData}:{legend:SizeClassLegend&{label:string};title:string;noData:string}) {
  if(!legend.sizes.length||legend.max===null)return null;
  return <div className="flex shrink-0 flex-wrap items-end gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-xs">
    <span className="self-center text-[11px] text-muted"><b className="font-semibold uppercase tracking-[0.06em]">{title}</b> · <span className="font-mono text-fg">{legend.label}</span>{legend.log?' · log':''}</span>
    {legend.sizes.map((d,k)=><span key={k} className="flex items-center gap-1.5 text-fg"><svg width={d+2} height={d+2} className="shrink-0"><circle cx={d/2+1} cy={d/2+1} r={d/2} fill="none" stroke="currentColor" strokeWidth={1.2}/></svg><span className="tabular font-mono">{classRange(legend,k)}</span><span className="tabular font-mono text-subtle">n={legend.counts[k]}</span></span>)}
    {legend.missing>0&&<span className="text-muted">{noData} <span className="tabular font-mono">n={legend.missing}</span></span>}
  </div>;
}
