import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./rpc',()=>({callRpc:vi.fn()}));
import registryFixture from './fixtures/geochemistry-registry.json?raw';
import catalogGolden from '../../../../services/analytics/tests/golden/geochemistry_catalog.json?raw';
import registrySource from './geochemistry-registry.ts?raw';
import navSource from '../components/geochemistry/DiagramsNav.tsx?raw';
import storeSource from '../stores/geochemistry-registry-store.ts?raw';
import { isValidElement,type ReactElement,type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { callRpc } from './rpc';
import type { GeoRegistry,GeoRegistryTool,GeoTool } from './geochemistry-api';
import { assertRegistry,diagramFamilies,familyLabel,familyOf,missingFromCatalog,offersCapability,toolForFamily } from './geochemistry-registry';
import { DiagramsNavView,type DiagramsNavProps } from '../components/geochemistry/DiagramsNav';
import { useGeoRegistryStore } from '../stores/geochemistry-registry-store';
import { useGeochemistryStore } from '../stores/geochemistry-store';

const call=vi.mocked(callRpc);
// Real backend output (contract-tested in services/analytics/tests/test_geochemistry_registry_rpc.py) and the real legacy catalog golden.
const REGISTRY=JSON.parse(registryFixture) as GeoRegistry;
const CATALOG_TOOLS=JSON.parse(catalogGolden) as GeoTool[];
const COLUMNS=[{name:'SiO2',numeric:true},{name:'TiO2',numeric:true},{name:'Al2O3',numeric:true},{name:'Hole',numeric:false},{name:'From',numeric:true}];
const REMOVED=['assay-compare','assay-difference','downhole-compare','harker','tas','qapf','afm','k2o-sio2','mali','fe-index','shand-index','a-cnk','a-nk','ree-normalization','primitive-mantle','element-ratios','fertility-sr-y','fertility-la-yb','fertility-dy-yb','fertility-eu-eu','fertility-ce-ce','alteration'];
const ids=(tools:GeoRegistryTool[])=>tools.map(t=>t.id);

function findAll(node:ReactNode,test:(element:ReactElement<Record<string,unknown>>)=>boolean,found:ReactElement<Record<string,unknown>>[]=[]) {
  if(Array.isArray(node))node.forEach(child=>findAll(child,test,found));
  else if(isValidElement<Record<string,unknown>>(node)){if(test(node))found.push(node);findAll(node.props.children as ReactNode,test,found);}
  return found;
}
const selectNamed=(props:DiagramsNavProps,name:string)=>findAll(DiagramsNavView(props),e=>e.type==='select'&&e.props['aria-label']===name)[0];
const optionValues=(select:ReactElement<Record<string,unknown>>)=>findAll(select.props.children as ReactNode,e=>e.type==='option'&&!e.props.disabled).map(e=>e.props.value as string);
const change=(select:ReactElement<Record<string,unknown>>,value:string)=>(select.props.onChange as (e:{target:{value:string}})=>void)({target:{value}});

function ready(over:Partial<Extract<DiagramsNavProps,{status:'ready'}>>={}):Extract<DiagramsNavProps,{status:'ready'}> {
  return {status:'ready',families:diagramFamilies(REGISTRY),selectedTool:'scatter',disabled:false,missing:[],onSelect:vi.fn(),...over};
}
function answerRpc(){
  call.mockImplementation(async(method:string)=>{
    if(method==='geochemistry.registry')return REGISTRY;
    if(method==='geochemistry.catalog')return {tools:CATALOG_TOOLS,columns:COLUMNS,dataset_id:'ds',dataset_name:'Demo'};
    if(method==='geochemistry.compute')return {tool:'x',rows:[],quality:{total:0,used:0,invalid:0,excluded_qaqc:0}};
    if(method==='geochemistry.column_roles')return {dataset_id:'ds',columns:[]};
    throw new Error(`unexpected ${method}`);
  });
}
beforeEach(()=>{
  call.mockReset();
  useGeoRegistryStore.setState({registry:null,loading:false,error:null});
  useGeochemistryStore.setState({datasetId:null,tools:[],columns:[],selectedTool:null,config:null,result:null,loading:false,running:false,error:null,requestVersion:0});
});

describe('registry received from the backend',()=>{
  it('loads geochemistry.registry once, without dataset parameters',async()=>{
    answerRpc();
    await useGeoRegistryStore.getState().load();
    await useGeoRegistryStore.getState().load();
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith('geochemistry.registry',{});
    const {registry,error}=useGeoRegistryStore.getState();
    expect(error).toBeNull();
    expect(registry?.tools).toHaveLength(31);
    expect(new Set(ids(registry!.tools)).size).toBe(31);
  });
  it('keeps the failure visible, does not fall back to the legacy catalog and can be retried',async()=>{
    call.mockRejectedValueOnce(new Error('boom'));
    await useGeoRegistryStore.getState().load();
    expect(useGeoRegistryStore.getState()).toMatchObject({registry:null,error:'boom',loading:false});
    expect(call.mock.calls.map(c=>c[0])).toEqual(['geochemistry.registry']);
    answerRpc();
    await useGeoRegistryStore.getState().load(true);
    expect(useGeoRegistryStore.getState().error).toBeNull();
    expect(useGeoRegistryStore.getState().registry?.tools).toHaveLength(31);
  });
  it('rejects a response it does not understand instead of guessing',async()=>{
    call.mockResolvedValueOnce({schema_version:2,tools:[]});
    await useGeoRegistryStore.getState().load();
    expect(useGeoRegistryStore.getState().error).toMatch(/no reconocida/);
    expect(()=>assertRegistry(null)).toThrow();
    expect(()=>assertRegistry({schema_version:1})).toThrow();
  });
});

describe('DIAGRAMS navigation built from the registry',()=>{
  const families=diagramFamilies(REGISTRY);
  it('keeps only module=diagrams and status=implemented',()=>{
    const all=families.flatMap(f=>f.tools);
    expect(all).toHaveLength(9);
    expect(all.every(t=>t.module==='diagrams'&&t.status==='implemented')).toBe(true);
    const tweaked:GeoRegistry={...REGISTRY,tools:REGISTRY.tools.map(t=>t.id==='ternary'?{...t,status:'planned'}:t.id==='harker'?{...t,module:'diagrams',family:'xy'}:t)};
    expect(ids(diagramFamilies(tweaked).flatMap(f=>f.tools))).toContain('harker');      // ownership comes from the registry, not from the UI
    expect(ids(diagramFamilies(tweaked).flatMap(f=>f.tools))).not.toContain('ternary'); // planned tools are never listed
  });
  it('produces exactly the four families in the agreed order and sizes',()=>{
    expect(families.map(f=>[f.id,f.tools.length])).toEqual([['distribution',5],['xy',2],['compositional',1],['profiles',1]]);
    expect(families.map(f=>f.label)).toEqual(['Distribución','XY','Composicional','Perfiles']);
    expect(ids(families[0].tools)).toEqual(['histogram','boxplot','qq-normal','probability','ecdf']);
    expect(ids(families[1].tools)).toEqual(['scatter','line']);
    expect(ids(families[2].tools)).toEqual(['ternary']);
    expect(ids(families[3].tools)).toEqual(['downhole']);
  });
  it('translates family labels for presentation only',()=>{
    expect(['distribution','xy','compositional','profiles'].map(familyLabel)).toEqual(['Distribución','XY','Composicional','Perfiles']);
    expect(familyLabel('something_new')).toBe('something_new');
    expect(families.map(f=>f.id)).toEqual(['distribution','xy','compositional','profiles']);   // canonical ids untouched
  });
  it('does not list tools owned by other modules',()=>{
    const visible=families.flatMap(f=>ids(f.tools));
    for(const id of ['harker','assay-compare','tas','fertility-sr-y'])expect(visible).not.toContain(id);
    for(const id of REMOVED)expect(visible).not.toContain(id);
    expect(REMOVED.every(id=>REGISTRY.tools.some(t=>t.id===id))).toBe(true);           // they still exist in the registry, just elsewhere
  });
  it('places scatter in XY',()=>{
    expect(familyOf(families,'scatter')?.id).toBe('xy');
    expect(familyOf(families,'histogram')?.id).toBe('distribution');
    expect(familyOf(families,'harker')).toBeNull();
  });
  it('every DIAGRAMS tool exists in the legacy catalog that computes it',()=>{
    expect(missingFromCatalog(families,CATALOG_TOOLS.map(t=>t.id))).toEqual([]);
    expect(missingFromCatalog(families,['scatter'])).toContain('ternary');
  });
  it('picks a valid tool when the family changes',()=>{
    expect(toolForFamily(families,'distribution','scatter')).toBe('histogram');   // current tool is not in the family: first one
    expect(toolForFamily(families,'distribution','ecdf')).toBe('ecdf');          // already inside: unchanged
    expect(toolForFamily(families,'compositional','scatter')).toBe('ternary');
    expect(toolForFamily(families,'profiles','ternary')).toBe('downhole');
    expect(toolForFamily(families,'nope','scatter')).toBeNull();
  });
  it('has no hardcoded tool list in the navigation sources',()=>{
    const source=[registrySource,navSource,storeSource].join('\n');
    for(const id of REGISTRY.tools.map(t=>t.id))expect(source).not.toMatch(new RegExp('[\'"`]'+id+'[\'"`]'));   // no quoted tool id anywhere
    for(const label of ['Histograma','Dispersión XY','Ternario ABC'])expect(source).not.toContain(label);
  });
});

describe('rendered navigation',()=>{
  it('shows Familia and Herramienta selects for the default scatter selection, and no chip row',()=>{
    const html=renderToStaticMarkup(DiagramsNavView(ready()) as ReactElement);
    expect(html).toContain('Familia');
    expect(html).toContain('Herramienta');
    expect(html).toMatch(/<option value="xy" selected="">XY<\/option>/);
    expect(html).toMatch(/<option value="scatter" selected="">Dispersión XY<\/option>/);
    expect(html).toContain('Líneas XY');
    expect(html).not.toContain('<button');                                 // the long chip row is gone
    expect(html).not.toContain('Harker');
    expect(html).not.toContain('value="tas"');
  });
  it('lists the tools of the selected family only',()=>{
    const html=renderToStaticMarkup(DiagramsNavView(ready({selectedTool:'histogram'})) as ReactElement);
    for(const label of ['Histograma','Tukey · cajas y bigotes','Q–Q normal','Probabilidad normal','Probabilidad acumulada (ECDF)'])expect(html).toContain(label);
    expect(html).not.toContain('Dispersión XY');
    expect(html).toMatch(/<option value="distribution" selected="">Distribución<\/option>/);
  });
  it('offers the four families, and no others',()=>{
    expect(optionValues(selectNamed(ready(),'Familia de diagrama'))).toEqual(['distribution','xy','compositional','profiles']);
  });
  it('shows a clear alert with a retry when the registry failed, and no tool controls',()=>{
    const onRetry=vi.fn();
    const html=renderToStaticMarkup(DiagramsNavView({status:'error',message:'sin servicio',retrying:false,onRetry}) as ReactElement);
    expect(html).toContain('role="alert"');
    expect(html).toContain('geochemistry.registry');
    expect(html).toContain('sin servicio');
    expect(html).toContain('Reintentar');
    expect(html).not.toContain('<select');
    expect(findAll(DiagramsNavView({status:'error',message:'x',retrying:false,onRetry}),e=>e.type==='button')[0].props.onClick).toBe(onRetry);
  });
  it('shows a status while the registry is loading',()=>{
    const html=renderToStaticMarkup(DiagramsNavView({status:'loading'}) as ReactElement);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('<select');
  });
  it('reports registry tools that the calculation catalog cannot serve',()=>{
    const html=renderToStaticMarkup(DiagramsNavView(ready({missing:['ternary']})) as ReactElement);
    expect(html).toContain('role="alert"');
    expect(html).toContain('ternary');
  });
});

describe('selection reaches the existing Workbench as the same toolId',()=>{
  async function open(){
    answerRpc();
    await useGeoRegistryStore.getState().load();
    await useGeochemistryStore.getState().load('ds','diagrams');
  }
  const props=()=>ready({selectedTool:useGeochemistryStore.getState().selectedTool,onSelect:useGeochemistryStore.getState().select});

  it('starts on scatter, in family XY',async()=>{
    await open();
    expect(useGeochemistryStore.getState().selectedTool).toBe('scatter');
    expect(useGeochemistryStore.getState().config?.tool).toBe('scatter');
    expect(familyOf(diagramFamilies(useGeoRegistryStore.getState().registry!),'scatter')?.id).toBe('xy');
    expect(renderToStaticMarkup(DiagramsNavView(props()) as ReactElement)).toMatch(/<option value="scatter" selected="">/);
  });
  it('changing family to Distribution updates the tools and activates a valid one',async()=>{
    await open();
    change(selectNamed(props(),'Familia de diagrama'),'distribution');
    expect(useGeochemistryStore.getState().selectedTool).toBe('histogram');
    expect(optionValues(selectNamed(props(),'Herramienta geoquímica'))).toEqual(['histogram','boxplot','qq-normal','probability','ecdf']);
  });
  it('selecting histogram sends toolId "histogram" to the Workbench store and to geochemistry.compute',async()=>{
    await open();
    change(selectNamed(props(),'Familia de diagrama'),'distribution');
    change(selectNamed(props(),'Herramienta geoquímica'),'histogram');
    const {selectedTool,config}=useGeochemistryStore.getState();
    expect(selectedTool).toBe('histogram');
    expect(config?.tool).toBe('histogram');
    useGeochemistryStore.setState({config:{...config!,columns:{X:'SiO2'}}});
    await useGeochemistryStore.getState().run();
    const compute=call.mock.calls.filter(c=>c[0]==='geochemistry.compute').at(-1)!;
    expect(compute[1]).toMatchObject({dataset_id:'ds',tool:'histogram'});
  });
  it('selecting ternary sends toolId "ternary"',async()=>{
    await open();
    change(selectNamed(props(),'Familia de diagrama'),'compositional');
    expect(useGeochemistryStore.getState().selectedTool).toBe('ternary');
    expect(useGeochemistryStore.getState().config?.tool).toBe('ternary');
    expect(optionValues(selectNamed(props(),'Herramienta geoquímica'))).toEqual(['ternary']);
  });
  it('moving inside a family keeps the same ids the workbench used before (qq-normal, line, downhole)',async()=>{
    await open();
    for(const [family,tool] of [['distribution','qq-normal'],['xy','line'],['profiles','downhole']] as const){
      change(selectNamed(props(),'Familia de diagrama'),family);
      change(selectNamed(props(),'Herramienta geoquímica'),tool);
      expect(useGeochemistryStore.getState().selectedTool).toBe(tool);
      expect(useGeochemistryStore.getState().config?.tool).toBe(tool);
    }
  });
  it('persistence stays keyed by dataset and tool (no per-family state was added)',async()=>{
    await open();
    change(selectNamed(props(),'Familia de diagrama'),'distribution');
    const keys=Object.keys(useGeochemistryStore.getState().saved.workspaces);
    expect(keys.every(k=>/^[^:]+::[a-z-]+$/.test(k))).toBe(true);
  });
});

describe('capabilities gate only the chart options they describe',()=>{
  const spec=(id:string)=>REGISTRY.tools.find(t=>t.id===id);
  it('hides log/reverse options the registry does not declare for the diagrams tool',()=>{
    expect(offersCapability(spec('scatter'),'log_x')).toBe(true);
    expect(offersCapability(spec('scatter'),'reverse_y')).toBe(true);
    expect(offersCapability(spec('histogram'),'log_x')).toBe(false);
    expect(offersCapability(spec('histogram'),'log_y')).toBe(false);
    expect(offersCapability(spec('histogram'),'reverse_y')).toBe(false);
    expect(offersCapability(spec('boxplot'),'reverse_y')).toBe(true);
    expect(offersCapability(spec('ecdf'),'log_x')).toBe(true);
    expect(offersCapability(spec('qq-normal'),'log_x')).toBe(false);
    expect(offersCapability(spec('probability'),'log_y')).toBe(false);
  });
  it('does not gate tools owned by other modules, nor unknown tools',()=>{
    expect(offersCapability(spec('tas'),'anything')).toBe(true);
    expect(offersCapability(undefined,'log_x')).toBe(true);
  });
});
