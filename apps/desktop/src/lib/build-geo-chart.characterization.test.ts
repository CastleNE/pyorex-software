/**
 * CURRENT BEHAVIOR — characterization only (Phase 1A).
 *
 * Freezes the Plotly structure `buildGeoChart` produces for every renderer kind today, so the Tool Registry
 * migration can prove the renderers did not change. Nothing here says the behaviour is desirable. Items marked
 * "CURRENT BEHAVIOR" are quirks (ordering done in the renderer, statistics done by Plotly, exclusion of rows...).
 * No pixel snapshots: only trace types, axes, overlays, reference lines, shapes, ordering and log flags.
 *
 * Renderers covered: scatter, line, qq, probability, ecdf, assay, difference, downhole, histogram, box,
 * ternary (also AFM), qapf, TAS (scatter + polygons) and spider.
 */
import { describe,expect,it } from 'vitest';
import { buildGeoChart } from './build-geo-chart';
import { DEFAULT_PRESENTATION } from './chart-presentation';
import { plotRows,type GeoResult,type GeoRow } from './geochemistry-api';

type Loose=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const row=(i:number,over:Partial<GeoRow>={}):GeoRow=>({row_index:i,sample_id:`S${i}`,group:'G',status:'valid',reason:null,x:null,y:null,z:null,values:null,classification:null,size_value:null,color_value:null,...over});
const make=(tool:string,kind:string,rows:GeoRow[],plot:Partial<GeoResult['plot']>={},pipeline:Record<string,unknown>={}):GeoResult=>({
  tool,title:tool,rows,quality:{total:rows.length,used:rows.filter(r=>r.status==='valid').length,invalid:0,excluded_qaqc:0},
  plot:{kind,x_label:'X',y_label:'Y',z_label:'',log_x:false,log_y:false,fields:[],...plot},warnings:[],formula:'',reference:'',pipeline,created_at:'2026-01-01T00:00:00Z'});
const style={pointSize:7,symbol:'circle',showLabels:false,attributes:{},presentation:{...DEFAULT_PRESENTATION}};
const trace=(result:GeoResult,index=0,s=style)=>buildGeoChart(result,s).data[index] as Loose;
const layout=(result:GeoResult,s=style)=>buildGeoChart(result,s).layout as Loose;
const points=(pairs:[number,number][],extra:(i:number)=>Partial<GeoRow>=()=>({}))=>pairs.map(([x,y],i)=>row(i,{x,y,...extra(i)}));

describe('scatter-family renderer (scatter, harker, mali, ratios, ... all share kind "scatter")',()=>{
  const result=make('scatter','scatter',points([[1,10],[2,20],[3,30]]),{x_label:'Zn',y_label:'Pb'});
  it('draws one markers trace per group with x/y taken from the rows',()=>{
    expect(trace(result)).toMatchObject({type:'scatter',mode:'markers',name:'G',x:[1,2,3],y:[10,20,30],connectgaps:false});
    expect(trace(result).marker).toMatchObject({symbol:'circle',opacity:.85});
  });
  it('titles the axes with the plot labels and keeps linear scales by default',()=>{
    expect(layout(result)).toMatchObject({xaxis:{title:{text:'Zn'},type:'linear'},yaxis:{title:{text:'Pb'},type:'linear'},barmode:'overlay'});
  });
  it('turns on labels as text mode and honours log flags coming from the engine or the presentation',()=>{
    expect(trace(result,0,{...style,showLabels:true}).mode).toBe('markers+text');
    expect(layout(make('scatter','scatter',points([[1,1]]),{log_x:true,log_y:true}))).toMatchObject({xaxis:{type:'log'},yaxis:{type:'log'}});
    expect(layout(result,{...style,presentation:{...DEFAULT_PRESENTATION,logX:true}}).xaxis.type).toBe('log');
  });
  it('creates one trace per valid group in order of first appearance and skips groups hidden by attributes',()=>{
    const rows=[row(0,{x:1,y:1,group:'B'}),row(1,{x:2,y:2,group:'A'}),row(2,{x:3,y:3,group:'B'})];
    expect(buildGeoChart(make('scatter','scatter',rows),style).data.map(d=>(d as Loose).name)).toEqual(['B','A']);
    const key=JSON.stringify([null,'A']);
    expect(buildGeoChart(make('scatter','scatter',rows),{...style,attributes:{[key]:{visible:false}}}).data.map(d=>(d as Loose).name)).toEqual(['B']);
  });
});

describe('line renderer',()=>{
  // CURRENT BEHAVIOR — characterization only: the engine keeps table order; this renderer sorts by x.
  const result=make('line','line',[row(0,{x:3,y:30}),row(1,{x:1,y:10}),row(2,{x:2,y:20})]);
  it('sorts each group by x before drawing lines with markers',()=>{
    expect(trace(result)).toMatchObject({type:'scatter',mode:'lines+markers',x:[1,2,3],y:[10,20,30]});
    expect(trace(result).line).toMatchObject({shape:'linear'});
  });
  it('does not mutate the result rows while sorting',()=>{
    const before=JSON.stringify(result.rows);
    buildGeoChart(result,style);
    expect(JSON.stringify(result.rows)).toBe(before);
  });
});

describe('distribution renderers',()=>{
  const unsorted=[row(0,{x:5,y:.5}),row(1,{x:1,y:-.5}),row(2,{x:3,y:0})];
  it('qq: markers only, sorted by x',()=>{
    const t=trace(make('qq-normal','qq',unsorted,{x_label:'Cuantil normal teórico',y_label:'X'}));
    expect(t).toMatchObject({type:'scatter',mode:'markers',x:[1,3,5],y:[-.5,0,.5]});
  });
  it('probability: sorted by x and the y axis is relabeled with cumulative percentages',()=>{
    const result=make('probability','probability',unsorted,{y_label:'Probabilidad acumulada (%)'});
    expect(trace(result)).toMatchObject({mode:'markers',x:[1,3,5]});
    const yaxis=layout(result).yaxis;
    expect(yaxis).toMatchObject({type:'linear',autorange:true});
    expect(yaxis.tickvals).toHaveLength(9);
    expect(yaxis.tickvals[4]).toBe(0);
    expect(yaxis.ticktext).toEqual(['1','5','10','25','50','75','90','95','99']);
  });
  it('ecdf: sorted by x, drawn as a step (hv) line with markers',()=>{
    const t=trace(make('ecdf','ecdf',[row(0,{x:2,y:100}),row(1,{x:1,y:50})]));
    expect(t).toMatchObject({mode:'lines+markers',x:[1,2],y:[50,100]});
    expect(t.line).toMatchObject({shape:'hv'});
  });
});

describe('histogram and box renderers',()=>{
  // CURRENT BEHAVIOR — characterization only: bins (histogram) and quartiles/whiskers (box) are computed by Plotly,
  // not in Python and not here: the trace only carries the raw values and a few display options.
  const values=[row(0,{x:1,y:1}),row(1,{x:2,y:2}),row(2,{x:4,y:4})];
  it('histogram: a plain histogram trace over the x values with overlay bars and no bin settings',()=>{
    const t=trace(make('histogram','histogram',values));
    expect(t).toMatchObject({type:'histogram',name:'G',x:[1,2,4],opacity:.85});
    expect(Object.keys(t)).not.toEqual(expect.arrayContaining(['xbins','nbinsx','autobinx','histnorm']));
    expect(layout(make('histogram','histogram',values)).barmode).toBe('overlay');
  });
  it('boxplot: Tukey configuration is Plotly linear quartiles with all points jittered over the box',()=>{
    const result=make('boxplot','box',values,{x_label:'Au ppm'});
    expect(trace(result)).toMatchObject({type:'box',name:'G',y:[1,2,4],quartilemethod:'linear',boxpoints:'all',jitter:.3,pointpos:0});
    expect(trace(result)).not.toHaveProperty('whiskerwidth');
    expect(trace(result)).not.toHaveProperty('boxmean');
    const l=layout(result);
    expect(l.xaxis).toMatchObject({type:'category',title:{text:'Grupo'},autorange:true});
    expect(l.yaxis.title.text).toBe('Au ppm');
  });
});

describe('assay comparison renderers',()=>{
  it('assay: prepends a dashed 1:1 identity line spanning the min and max of all x and y values',()=>{
    const result=make('assay-compare','assay',points([[2,3],[10,8],[6,12]]),{x_label:'Lab A',y_label:'Lab B'});
    const data=buildGeoChart(result,style).data as Loose[];
    expect(data[0]).toMatchObject({type:'scatter',mode:'lines',name:'Identidad 1:1',x:[2,12],y:[2,12]});
    expect(data[0].line).toMatchObject({dash:'dash'});
    expect(data[1]).toMatchObject({mode:'markers',x:[2,10,6],y:[3,8,12]});
  });
  it('assay: no identity line when there is nothing to plot',()=>{
    expect(buildGeoChart(make('assay-compare','assay',[]),style).data).toEqual([]);
  });
  it('difference: adds a dashed horizontal zero line in paper coordinates',()=>{
    const shapes=layout(make('assay-difference','difference',points([[11,2],[19,-2]]))).shapes;
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({type:'line',xref:'paper',x0:0,x1:1,y0:0,y1:0});
    expect(shapes[0].line).toMatchObject({dash:'dash'});
  });
});

describe('downhole renderer',()=>{
  it('draws lines sorted by depth on a reversed depth axis, breaking the line at a missing assay',()=>{
    const rows=[row(0,{x:30,y:3}),row(1,{x:10,y:1}),row(2,{x:null,y:2,status:'invalid'})];
    const result=make('downhole','downhole',rows,{y_label:'Profundidad: Depth'});
    expect(trace(result)).toMatchObject({mode:'lines+markers',x:[10,null,30],y:[1,2,3],connectgaps:false});
    expect(layout(result).yaxis).toMatchObject({type:'linear',autorange:'reversed'});
  });
  // CURRENT BEHAVIOR — characterization only: rows the engine did not plot (excluded QAQC controls, rows with an
  // unknown hole id) still reach the renderer when they carry a depth, and appear as extra gap points.
  it('lets an excluded row with a depth become a gap point in its group',()=>{
    const rows=[row(0,{x:10,y:1}),row(1,{x:null,y:8,status:'excluded',reason:'Muestra de control QAQC'})];
    expect(trace(make('downhole','downhole',rows))).toMatchObject({x:[10,null],y:[1,8]});
  });
  it('downhole-compare: adds a dashed diamond series for the second assay named after the pipeline column',()=>{
    const rows=[row(0,{x:10,y:1,z:11}),row(1,{x:20,y:2,z:21})];
    const data=buildGeoChart(make('downhole-compare','downhole',rows,{},{columns:{Depth:'Depth',Assay1:'Au',Assay2:'Au_check'}}),style).data as Loose[];
    expect(data).toHaveLength(2);
    expect(data[1]).toMatchObject({name:'G · Au_check',mode:'lines+markers',x:[11,21],y:[1,2]});
    expect(data[1].line).toMatchObject({dash:'dash'});
    expect(data[1].marker.symbol).toBe('diamond');
  });
});

describe('ternary renderer (ternary and AFM)',()=>{
  const rows=[row(0,{x:20,y:30,z:50}),row(1,{x:100,y:0,z:0})];
  it('draws scatterternary traces with a=x, b=y, c=z and a 100-sum ternary layout',()=>{
    const result=make('ternary','ternary',rows,{x_label:'A',y_label:'B',z_label:'C'});
    expect(trace(result)).toMatchObject({type:'scatterternary',mode:'markers',a:[20,100],b:[30,0],c:[50,0]});
    expect(layout(result).ternary).toMatchObject({sum:100,aaxis:{title:{text:'A'}},baxis:{title:{text:'B'}},caxis:{title:{text:'C'}}});
  });
  it('AFM uses the same renderer with its own vertex titles',()=>{
    const result=make('afm','ternary',rows,{x_label:'A: Na2O + K2O',y_label:'F: FeOT',z_label:'M: MgO'});
    expect(trace(result).type).toBe('scatterternary');
    const t=layout(result).ternary;
    expect([t.aaxis.title.text,t.baxis.title.text,t.caxis.title.text]).toEqual(['A: Na2O + K2O','F: FeOT','M: MgO']);
  });
  it('ternary point labels use text mode',()=>{
    expect(trace(make('ternary','ternary',rows),0,{...style,showLabels:true}).mode).toBe('markers+text');
  });
});

describe('QAPF renderer',()=>{
  it('draws the double-triangle frame first (text+lines) and keeps a 1:1 aspect ratio',()=>{
    const result=make('qapf','qapf',points([[.6,.17]]),{x_label:'A ← proporción modal → P',y_label:'F ← componente modal → Q'});
    const data=buildGeoChart(result,style).data as Loose[];
    expect(data[0]).toMatchObject({type:'scatter',mode:'text+lines',text:['A','Q','P','F','',''],showlegend:false,hoverinfo:'skip'});
    expect(data[0].x).toEqual([0,.5,1,.5,0,1]);
    expect(data[0].y[1]).toBeCloseTo(Math.sqrt(3)/2,12);
    expect(data[0].y[3]).toBeCloseTo(-Math.sqrt(3)/2,12);
    expect(data[1]).toMatchObject({mode:'markers',x:[.6],y:[.17]});
    expect(layout(result).yaxis).toMatchObject({scaleanchor:'x',scaleratio:1});
  });
});

describe('TAS renderer (scatter + reference polygons)',()=>{
  const fields=[{id:'B',name:'Basalt',points:[[45,0],[52,0],[52,5],[45,5]]},{id:'R',name:'Rhyolite',points:[[69,0],[77,0],[77,8]]}];
  const result=make('tas','scatter',[row(0,{x:50,y:3,classification:'Basalt'})],{x_label:'SiO2 (wt%)',y_label:'Na2O + K2O (wt%)',fields});
  it('draws one closed grey polygon line per field before the samples',()=>{
    const data=buildGeoChart(result,style).data as Loose[];
    expect(data).toHaveLength(3);
    expect(data[0]).toMatchObject({type:'scatter',mode:'lines',showlegend:false,hoverinfo:'name',name:'Basalt'});
    expect(data[0].x).toEqual([45,52,52,45,45]);          // first vertex repeated to close the polygon
    expect(data[1].x).toEqual([69,77,77,69]);
    expect(data[0].line).toMatchObject({color:'#52525b',width:1});
    expect(data[2]).toMatchObject({mode:'markers',x:[50],y:[3]});
  });
  it('labels every field with its id at the centroid of its vertices',()=>{
    const annotations=layout(result).annotations as Loose[];
    expect(annotations.map(a=>a.text)).toEqual(['B','R']);
    expect(annotations[0]).toMatchObject({x:(45+52+52+45)/4,y:(0+0+5+5)/4,showarrow:false});
  });
  it('carries the classification into the hover text of each sample',()=>{
    const data=buildGeoChart(result,style).data as Loose[];
    expect(data[2].text).toEqual(['S0 · Basalt']);
  });
});

describe('spider renderer (REE / primitive mantle)',()=>{
  const elements=['La','Ce','Nd'];
  const rows=[row(0,{values:[10,null,5]}),row(1,{values:[1,2,3],group:'H'})];
  const result=make('ree-normalization','spider',rows,{x_label:'Elemento',y_label:'Muestra / referencia',elements,log_y:true});
  it('draws one lines+markers trace per sample over the element names, keeping gaps',()=>{
    const data=buildGeoChart(result,style).data as Loose[];
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({type:'scatter',mode:'lines+markers',x:elements,y:[10,null,5],name:'G · S0',connectgaps:false});
    expect(data[1]).toMatchObject({name:'H · S1',y:[1,2,3]});
  });
  it('uses a logarithmic y axis because the engine flags it',()=>{
    expect(layout(result).yaxis.type).toBe('log');
  });
});

describe('display limits by kind (plotRows)',()=>{
  // CURRENT BEHAVIOR — characterization only: generic scatter is capped at 5000 drawn rows, spider at 100;
  // the kinds listed below are never sampled.
  const many=(n:number)=>Array.from({length:n},(_,i)=>row(i,{x:i,y:i}));
  it('caps scatter-like kinds at 5000 and spider at 100',()=>{
    expect(plotRows(many(6000),'scatter')).toHaveLength(5000);
    expect(plotRows(many(6000),'qapf')).toHaveLength(5000);
    expect(plotRows(many(6000),'ternary')).toHaveLength(5000);
    expect(plotRows(many(150),'spider')).toHaveLength(100);
  });
  it('never samples distribution, line and profile kinds',()=>{
    for(const kind of ['histogram','box','qq','probability','ecdf','line','downhole','assay','difference'])
      expect(plotRows(many(6000),kind)).toHaveLength(6000);
  });
  it('reports how many rows were drawn so the UI can warn about truncation',()=>{
    expect(buildGeoChart(make('scatter','scatter',many(6000)),style).displayCount).toBe(5000);
  });
});
