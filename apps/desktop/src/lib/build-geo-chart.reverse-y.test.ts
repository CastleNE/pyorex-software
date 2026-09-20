/**
 * "Invertir Y" (presentation.reverseY) and the Tool Registry capability REVERSE_Y (Phase 1B adjustment).
 *
 * The checkbox is global (ChartControls, shown for every tool) and build-geo-chart.ts applies it to every renderer kind
 * except probability and downhole. That is what the renderer DOES. Whether a tool OFFERS it (capability) is decided in
 * the registry: kept for boxplot, retired for histogram, qapf and the two spider tools, where reversing y has no sense.
 */
import { describe,expect,it } from 'vitest';
import { buildGeoChart } from './build-geo-chart';
import { DEFAULT_PRESENTATION } from './chart-presentation';
import type { GeoResult,GeoRow } from './geochemistry-api';

type Loose=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const row=(i:number,over:Partial<GeoRow>={}):GeoRow=>({row_index:i,sample_id:`S${i}`,group:'G',status:'valid',reason:null,x:null,y:null,z:null,values:null,classification:null,size_value:null,color_value:null,...over});
const make=(tool:string,kind:string,rows:GeoRow[],plot:Partial<GeoResult['plot']>={}):GeoResult=>({tool,title:tool,rows,quality:{total:rows.length,used:rows.length,invalid:0,excluded_qaqc:0},
  plot:{kind,x_label:'X',y_label:'Y',z_label:'',log_x:false,log_y:false,fields:[],...plot},warnings:[],formula:'',reference:'',pipeline:{},created_at:'2026-01-01T00:00:00Z'});
const style=(reverseY:boolean)=>({pointSize:7,symbol:'circle',showLabels:false,attributes:{},presentation:{...DEFAULT_PRESENTATION,reverseY}});
const yaxis=(result:GeoResult,reverseY:boolean)=>(buildGeoChart(result,style(reverseY)).layout as Loose).yaxis;
const xy=[row(0,{x:1,y:2,values:[1,2]}),row(1,{x:2,y:4,values:[3,4]})];

describe('REVERSE_Y kept: boxplot (y is the data variable)',()=>{
  const box=make('boxplot','box',xy);
  it('the renderer reverses the value axis when the checkbox is on, and only then',()=>{
    expect(yaxis(box,true).autorange).toBe('reversed');
    expect(yaxis(box,false).autorange).toBe(true);
  });
});

describe('REVERSE_Y retired from the registry: the renderer still applies the global checkbox',()=>{
  // CURRENT BEHAVIOR — characterization only: these do invert today, but the tools no longer declare the capability.
  const cases:[string,GeoResult][]=[
    ['histogram',make('histogram','histogram',xy)],
    ['qapf',make('qapf','qapf',xy)],
    ['ree-normalization (spider, log y)',make('ree-normalization','spider',xy,{elements:['La','Ce'],log_y:true})],
    ['tas (scatter + polygons)',make('tas','scatter',xy,{fields:[{id:'B',name:'Basalt',points:[[45,0],[52,0],[52,5]]}]})],
    ['assay-compare (1:1 line)',make('assay-compare','assay',xy)],
  ];
  it.each(cases)('%s',(_name,result)=>{
    expect(yaxis(result,true).autorange).toBe('reversed');
    expect(yaxis(result,false).autorange).toBe(true);
  });
});

describe('kinds whose y axis is forced by the renderer ignore the checkbox',()=>{
  it('downhole always shows depth increasing downwards; probability keeps its own axis',()=>{
    expect(yaxis(make('downhole','downhole',xy),false).autorange).toBe('reversed');
    expect(yaxis(make('probability','probability',xy),true).autorange).toBe(true);
  });
});
