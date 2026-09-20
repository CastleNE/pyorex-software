import { expect,it } from 'vitest';
import { buildGeoChart } from './build-geo-chart';
import { DEFAULT_PRESENTATION } from './chart-presentation';
import type { GeoResult,GeoRow } from './geochemistry-api';

const row=(i:number,x:number|null,y:number,status:GeoRow['status']='valid'):GeoRow=>({row_index:i,sample_id:String(i),group:'DH1',status,reason:null,x,y,z:null,values:null,classification:null,color_value:i});
const result:GeoResult={tool:'downhole',title:'Test',rows:[row(0,10,1),row(1,null,2,'invalid'),row(2,30,3)],quality:{total:3,used:2,invalid:1,excluded_qaqc:0},plot:{kind:'downhole',x_label:'Au',y_label:'Depth',z_label:'',log_x:false,log_y:false,fields:[]},warnings:[],formula:'',reference:'',pipeline:{group_column:'Hole',color_column:'Cu'},created_at:'test'};
const style={pointSize:7,symbol:'circle',showLabels:false,attributes:{},presentation:{...DEFAULT_PRESENTATION}};

it('breaks downhole lines at known depths with missing assays',()=>{
 const chart=buildGeoChart(result,style);
 expect(chart.data[0]).toMatchObject({x:[10,null,30],y:[1,2,3],connectgaps:false});
 expect(chart.layout.yaxis?.autorange).toBe('reversed');
 expect(chart.displayCount).toBe(2);
});
it('changes displayed limits without modifying computed results',()=>{
 const original=JSON.stringify(result);
 const chart=buildGeoChart(result,{...style,presentation:{...DEFAULT_PRESENTATION,logX:true,xMin:'1',xMax:'100'}});
 expect(chart.layout.xaxis).toMatchObject({type:'log',range:[0,2]});
 expect(JSON.stringify(result)).toBe(original);
});
it('provides concentration intervals for the five numeric colors',()=>{
 const chart=buildGeoChart(result,style);
 expect(chart.colorLegend).toHaveLength(5);
 expect(chart.colorLegend[0].min).toBe(0);
 expect(chart.colorLegend[4].max).toBe(2);
});
it('labels Tukey boxes with their group names on a categorical axis',()=>{
 const chart=buildGeoChart({...result,plot:{...result.plot,kind:'box'}},style);
 expect(chart.layout.xaxis).toMatchObject({type:'category',title:{text:'Grupo'}});
 expect(chart.data[0]).toMatchObject({type:'box',name:'DH1',quartilemethod:'linear'});
});
