import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('./rpc',()=>({callRpc:vi.fn()}));
import { callRpc } from './rpc';
import { guessMapping, initialConfig, inferUnit, plotRows, colorIndex, toCsv, type GeoTool, type GeoRow } from './geochemistry-api';
import { useGeochemistryStore } from '../stores/geochemistry-store';
const call=vi.mocked(callRpc);
const tool:GeoTool={id:'tas',label:'TAS',group:'lithogeochemistry',inputs:['SiO2','Na2O','K2O'],kind:'scatter',unit:'pct',formula:'alkalis',reference:'verified',optional_inputs:false};
beforeEach(()=>{call.mockReset();useGeochemistryStore.setState({datasetId:null,tools:[],columns:[],selectedTool:null,config:null,result:null,loading:false,running:false,error:null,requestVersion:0});});
it('matches complete analytes and does not reuse unrelated first column',()=>{
  expect(guessMapping(tool,[{name:'SiO2_pct',numeric:true},{name:'K2O',numeric:true},{name:'Na_ppm',numeric:true}])).toEqual({SiO2:'SiO2_pct',K2O:'K2O'});
});
it('keeps spreadsheet formula text inert in CSV output',()=>{
  const csv=toCsv([{sample_id:'=1+1',x:2,reason:'a,"b"'}]);
  expect(csv).toContain("'=1+1");expect(csv).toContain('"a,""b"""');
});
it('does not apply a late response to a different dataset',async()=>{
  let finish!:(value:unknown)=>void;
  call.mockReturnValueOnce(new Promise(r=>{finish=r;}));
  const old=useGeochemistryStore.getState().load('old','lithogeochemistry');
  call.mockResolvedValueOnce({tools:[tool],columns:[],dataset_id:'new',dataset_name:'New'});
  await useGeochemistryStore.getState().load('new','lithogeochemistry');
  finish({tools:[tool],columns:[{name:'old',numeric:true}],dataset_id:'old',dataset_name:'Old'});
  await old;
  expect(useGeochemistryStore.getState().datasetId).toBe('new');
  expect(useGeochemistryStore.getState().columns).toEqual([]);
});
it('clears stale results when inputs change',()=>{
  useGeochemistryStore.setState({config:{tool:'tas',columns:{},units:{},iron_basis:'FeOT',include_qaqc:false,log_x:false,log_y:false,group_column:null,label_column:null},result:{title:'old'} as never});
  useGeochemistryStore.getState().configure({columns:{SiO2:'SiO2'}});
  expect(useGeochemistryStore.getState().result).toBeNull();
});
it('uses explicit source unit suffixes rather than the target unit',()=>{
  const ree={...tool,id:'ree-normalization',inputs:['La','Ce'],unit:'ppm' as const};
  expect(initialConfig(ree,[{name:'La_ppb',numeric:true},{name:'Ce_ppb',numeric:true}]).units).toEqual({La:'ppb',Ce:'ppb'});
  expect(inferUnit('Sr (wt%)','ppm')).toBe('pct');
});
it('preserves every observation for distribution statistics',()=>{
  const rows=Array.from({length:10001},(_,i)=>({status:'valid',x:i<5000?0:100} as GeoRow));
  expect(plotRows(rows,'histogram')).toHaveLength(10001);
  expect(plotRows(rows,'box')).toHaveLength(10001);
  expect(plotRows(rows,'scatter')).toHaveLength(5000);
});
it('uses a consistent group color for normalized curves',()=>{
  const groups=['A','B'];
  expect(colorIndex('A',0,groups,true)).toBe(colorIndex('A',2,groups,true));
  expect(colorIndex('A',0,groups,true)).not.toBe(colorIndex('B',1,groups,true));
});
