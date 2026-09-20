import { beforeEach,expect,it,vi } from 'vitest';
vi.mock('./rpc',()=>({callRpc:vi.fn()}));
import { callRpc } from './rpc';
import { DEFAULT_PRESENTATION } from './chart-presentation';
import type { GeoColumn,GeoTool } from './geochemistry-api';
import { buildSession,parseSession,restoreWorkspace,sanitizePresentation,workspaceKey,EMPTY_SAVED } from './geochemistry-session';
import { useGeochemistryStore } from '../stores/geochemistry-store';

const call=vi.mocked(callRpc);
const tas:GeoTool={id:'tas',label:'TAS',group:'lithogeochemistry',inputs:['SiO2','K2O'],kind:'scatter',unit:'pct',formula:'f',reference:'r',optional_inputs:false};
const scatter:GeoTool={id:'scatter',label:'XY',group:'diagrams',inputs:['X','Y'],kind:'scatter',unit:'raw',formula:'f',reference:'r',optional_inputs:false};
const cols:GeoColumn[]=[{name:'SiO2',numeric:true},{name:'K2O',numeric:true},{name:'Litho',numeric:false}];
const catalog=(columns=cols)=>({tools:[tas,scatter],columns,dataset_id:'d1',dataset_name:'Demo'});
const reset=()=>useGeochemistryStore.setState({datasetId:null,datasetName:'',tools:[],columns:[],selectedTool:null,config:null,result:null,loading:false,running:false,error:null,requestVersion:0,presentation:{...DEFAULT_PRESENTATION},attributes:{},saved:{...EMPTY_SAVED},notice:null,pointSize:7,symbol:'circle',showLabels:false});
beforeEach(()=>{call.mockReset();reset();});

it('restores mapping, presentation and attributes after switching tools and datasets',async()=>{
  call.mockResolvedValue(catalog());
  const store=useGeochemistryStore;
  await store.getState().load('d1','lithogeochemistry');
  store.getState().configure({group_column:'Litho'});
  store.setState({presentation:{...DEFAULT_PRESENTATION,palette:'Viridis',logX:true},pointSize:12,attributes:{k:{color:'#111111'}}});
  store.getState().select('scatter');
  expect(store.getState().presentation.palette).toBe('Accessible');
  store.getState().select('tas');
  expect(store.getState().config?.group_column).toBe('Litho');
  expect(store.getState().presentation).toMatchObject({palette:'Viridis',logX:true});
  expect(store.getState().pointSize).toBe(12);
  await store.getState().load('d2','lithogeochemistry');
  expect(store.getState().attributes).toEqual({});
  await store.getState().load('d1','lithogeochemistry');
  expect(store.getState().attributes).toEqual({k:{color:'#111111'}});
  expect(store.getState().config?.group_column).toBe('Litho');
});

it('drops mapped columns that no longer exist instead of remapping silently',()=>{
  const raw={config:{tool:'tas',columns:{SiO2:'SiO2',K2O:'K2O_old'},units:{SiO2:'pct',K2O:'ppm'},group_column:'Gone',iron_basis:'FeOT',include_qaqc:false,log_x:false,log_y:false,label_column:null}};
  const restored=restoreWorkspace(raw,tas,cols)!;
  expect(restored.workspace.config.columns).toEqual({SiO2:'SiO2'});
  expect(restored.workspace.config.group_column).toBeNull();
  expect(restored.dropped).toEqual(['K2O → K2O_old','group_column → Gone']);
});

it('rejects a workspace saved for another tool and sanitizes corrupt presentation values',()=>{
  expect(restoreWorkspace({config:{tool:'afm'}},tas,cols)).toBeNull();
  const p=sanitizePresentation({palette:'Nope',opacity:9,sizeMode:'weird',logX:'yes'});
  expect(p).toMatchObject({palette:'Accessible',opacity:1,sizeMode:'constant',logX:false});
});

it('exports only the current dataset configuration and round-trips through parseSession',()=>{
  const ws={config:{tool:'tas'},presentation:DEFAULT_PRESENTATION,pointSize:7,symbol:'circle',showLabels:false} as never;
  const saved={workspaces:{[workspaceKey('d1','tas')]:ws,[workspaceKey('d2','tas')]:ws},attributes:{d1:{k:{color:'#fff'}},d2:{z:{}}}};
  const doc=buildSession({id:'d1',name:'Demo'},saved,new Date('2026-09-20T00:00:00Z'));
  expect(Object.keys(doc.workspaces)).toEqual(['tas']);
  expect(doc.attributes).toEqual({k:{color:'#fff'}});
  expect(JSON.stringify(doc)).not.toContain('rows');
  expect(parseSession(JSON.stringify(doc)).dataset.id).toBe('d1');
});

it('rejects files that are not geochemistry sessions or come from a newer version',()=>{
  expect(()=>parseSession('not json')).toThrow('JSON válido');
  expect(()=>parseSession('{"format":"other"}')).toThrow('documento de sesión');
  expect(()=>parseSession('{"format":"pyorex.geochemistry.session","version":99,"dataset":{"id":"x"}}')).toThrow('no soportada');
});

it('imports a session for the active tool, reporting discarded columns and foreign datasets',async()=>{
  call.mockResolvedValue(catalog());
  const store=useGeochemistryStore;
  await store.getState().load('d1','lithogeochemistry');
  const doc=parseSession(JSON.stringify({format:'pyorex.geochemistry.session',version:1,dataset:{id:'other',name:'Otro'},workspaces:{tas:{config:{tool:'tas',columns:{SiO2:'SiO2',K2O:'Missing'},units:{}},presentation:{palette:'Earth'},pointSize:10}},attributes:{a:{visible:false}}}));
  store.getState().importSession(doc);
  const s=store.getState();
  expect(s.config?.columns).toEqual({SiO2:'SiO2'});
  expect(s.presentation.palette).toBe('Earth');
  expect(s.attributes).toEqual({a:{visible:false}});
  expect(s.notice).toContain('K2O → Missing');
  expect(s.notice).toContain('otro dataset');
  expect(s.result).toBeNull();
});

it('resetWorkspace restores defaults for the active tool',async()=>{
  call.mockResolvedValue(catalog());
  const store=useGeochemistryStore;
  await store.getState().load('d1','lithogeochemistry');
  store.setState({presentation:{...DEFAULT_PRESENTATION,palette:'Earth'}});
  store.getState().resetWorkspace();
  expect(store.getState().presentation.palette).toBe('Accessible');
  expect(store.getState().config?.columns).toEqual({SiO2:'SiO2',K2O:'K2O'});
});
