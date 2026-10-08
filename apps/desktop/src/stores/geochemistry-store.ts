import { DEFAULT_PRESENTATION,type ChartPresentation } from '../lib/chart-presentation';
import { AUTO_SYMBOL,type AttributeStyle } from '../lib/geochemistry-attributes';
import { create } from 'zustand';
import { geoApi,initialConfig,type GeoColumn,type GeoConfig,type GeoGroup,type GeoResult,type GeoTool } from '../lib/geochemistry-api';
import { buildSession,loadSaved,persistSaved,restoreWorkspace,sanitizeAttributes,workspaceKey,type SavedState,type SessionDocument,type Workspace } from '../lib/geochemistry-session';
import { roleMapFrom,type ColumnRoleMap } from '../lib/semantic-roles';
import { useGeoRegistryStore } from './geochemistry-registry-store';
import { CUSTOM_TOOL } from '../lib/custom-diagrams';

interface GeoState {
  datasetId:string|null;datasetName:string;tools:GeoTool[];columns:GeoColumn[];columnRoles:ColumnRoleMap;selectedTool:string|null;config:GeoConfig|null;result:GeoResult|null;
  loading:boolean;running:boolean;error:string|null;requestVersion:number;
  presentation:ChartPresentation;
  attributes:Record<string,AttributeStyle>;
  saved:SavedState;notice:string|null;
  pointSize:number;symbol:string;showLabels:boolean;
  load:(datasetId:string,group:GeoGroup)=>Promise<void>;select:(id:string)=>void;configure:(patch:Partial<GeoConfig>)=>void;run:()=>Promise<void>;
  resetWorkspace:()=>void;exportSession:()=>SessionDocument|null;importSession:(doc:SessionDocument)=>void;
}

type Applied=Pick<GeoState,'config'|'presentation'|'pointSize'|'symbol'|'showLabels'|'notice'>;
/**
 * Config guardada si es válida para el catálogo actual; si no, valores por defecto. Nunca reasigna columnas ausentes.
 * `columnRoles` viene de `geochemistry.column_roles`; el Tool Registry (si ya cargó) acota el automapping de nuevas
 * configuraciones por rol semántico — ver lib/semantic-roles.ts. Sin Registry para esta herramienta, el automapping
 * es exactamente el de siempre (columna numérica sin usar).
 */
function workspaceFor(saved:SavedState,datasetId:string,tool:GeoTool,columns:GeoColumn[],columnRoles:ColumnRoleMap,keep:Pick<GeoState,'pointSize'|'symbol'|'showLabels'>):Applied {
  const restored=restoreWorkspace(saved.workspaces[workspaceKey(datasetId,tool.id)],tool,columns);
  if(!restored){
    const registryTool=useGeoRegistryStore.getState().registry?.tools.find(t=>t.id===tool.id);
    return {config:initialConfig(tool,columns,registryTool,columnRoles),presentation:{...DEFAULT_PRESENTATION},pointSize:keep.pointSize,symbol:keep.symbol,showLabels:keep.showLabels,notice:null};
  }
  const {workspace,dropped}=restored;
  return {config:workspace.config,presentation:workspace.presentation,pointSize:workspace.pointSize,symbol:workspace.symbol,showLabels:workspace.showLabels,notice:dropped.length?`Configuración restaurada. Se descartaron columnas que ya no existen: ${dropped.join(', ')}.`:null};
}
export const useGeochemistryStore=create<GeoState>((set,get)=>({
  datasetId:null,datasetName:'',tools:[],columns:[],columnRoles:{},selectedTool:null,config:null,result:null,loading:false,running:false,error:null,requestVersion:0,
  presentation:{...DEFAULT_PRESENTATION},
  attributes:{},saved:loadSaved(),notice:null,
  pointSize:7,symbol:AUTO_SYMBOL,showLabels:false,
  load:async(datasetId,group)=>{
    const version=get().requestVersion+1;
    set({presentation:{...DEFAULT_PRESENTATION},attributes:datasetId===get().datasetId?get().attributes:sanitizeAttributes(get().saved.attributes[datasetId]),notice:null,datasetId,loading:true,running:false,result:null,error:null,config:null,selectedTool:null,requestVersion:version});
    try{
      // The Registry is dataset-independent and cached by its own store; fetching it here (idempotent) means the
      // very first automapping already knows each tool's allowed_roles, not just later tool switches.
      const [catalog,columnRolesResponse]=await Promise.all([
        geoApi.catalog(datasetId),
        geoApi.columnRoles(datasetId),
        useGeoRegistryStore.getState().load(),
      ]);
      if(get().requestVersion!==version)return;
      const columnRoles=roleMapFrom(columnRolesResponse.columns);
      const first=catalog.tools.find(t=>t.group===group&&(group!=='diagrams'||t.id==='scatter'))??catalog.tools.find(t=>t.group===group);
      const {saved,pointSize,symbol,showLabels}=get();
      set({tools:[...catalog.tools,CUSTOM_TOOL],columns:catalog.columns,columnRoles,datasetName:catalog.dataset_name,selectedTool:first?.id??null,...(first?workspaceFor(saved,datasetId,first,catalog.columns,columnRoles,{pointSize,symbol,showLabels}):{config:null})});
    }catch(e){if(get().requestVersion===version)set({error:String(e),tools:[],columns:[],columnRoles:{}});}
    finally{if(get().requestVersion===version)set({loading:false});}
  },
  select:id=>{
    const tool=get().tools.find(t=>t.id===id);if(!tool)return;
    const {datasetId,saved,columns,columnRoles,pointSize,symbol,showLabels}=get();
    set({selectedTool:id,...(datasetId?workspaceFor(saved,datasetId,tool,columns,columnRoles,{pointSize,symbol,showLabels}):{config:initialConfig(tool,columns),presentation:{...DEFAULT_PRESENTATION},notice:null}),result:null,error:null,running:false,requestVersion:get().requestVersion+1});
  },
  configure:patch=>{const config=get().config;if(config)set({config:{...config,...patch},result:null,error:null,running:false,requestVersion:get().requestVersion+1});},
  run:async()=>{
    const {datasetId,config,running}=get();if(!datasetId||!config||running)return;
    const version=get().requestVersion+1;set({running:true,error:null,result:null,requestVersion:version});
    try{const result=await geoApi.compute(datasetId,config);if(get().requestVersion===version)set({result});}
    catch(e){if(get().requestVersion===version)set({error:String(e)});}
    finally{if(get().requestVersion===version)set({running:false});}
  },
  resetWorkspace:()=>{
    const {datasetId,selectedTool,tools,columns,columnRoles,saved}=get();
    const tool=tools.find(t=>t.id===selectedTool);if(!datasetId||!tool)return;
    const {[workspaceKey(datasetId,tool.id)]:_removed,...workspaces}=saved.workspaces;
    const registryTool=useGeoRegistryStore.getState().registry?.tools.find(t=>t.id===tool.id);
    set({saved:{...saved,workspaces},config:initialConfig(tool,columns,registryTool,columnRoles),presentation:{...DEFAULT_PRESENTATION},pointSize:7,symbol:AUTO_SYMBOL,showLabels:false,notice:'Configuración de esta herramienta restablecida.',result:null,error:null,running:false,requestVersion:get().requestVersion+1});
    persistSaved(get().saved);
  },
  exportSession:()=>{
    const {datasetId,datasetName,saved}=get();
    return datasetId?buildSession({id:datasetId,name:datasetName},saved):null;
  },
  importSession:doc=>{
    const {datasetId,tools,columns,columnRoles,saved,selectedTool,pointSize,symbol,showLabels}=get();if(!datasetId)return;
    const workspaces={...saved.workspaces};const dropped:string[]=[];let applied=0;
    for(const [toolId,raw] of Object.entries(doc.workspaces)){
      const tool=tools.find(t=>t.id===toolId);if(!tool)continue;
      const restored=restoreWorkspace(raw,tool,columns);if(!restored)continue;
      workspaces[workspaceKey(datasetId,toolId)]=restored.workspace as Workspace;applied++;
      dropped.push(...restored.dropped.map(d=>`${toolId}: ${d}`));
    }
    const attributes=sanitizeAttributes(doc.attributes);
    const next:SavedState={workspaces,attributes:{...saved.attributes,[datasetId]:{...saved.attributes[datasetId],...attributes}}};
    const tool=tools.find(t=>t.id===selectedTool);
    const foreign=doc.dataset.id!==datasetId?` La sesión se creó con otro dataset («${doc.dataset.name||doc.dataset.id}»); solo se aplicó lo compatible con las columnas actuales.`:'';
    const summary=`Sesión importada: ${applied} herramienta(s).${dropped.length?` Columnas descartadas: ${dropped.join('; ')}.`:''}${foreign}`;
    set({saved:next,attributes:next.attributes[datasetId],...(tool?workspaceFor(next,datasetId,tool,columns,columnRoles,{pointSize,symbol,showLabels}):{}),notice:summary,result:null,error:null,running:false,requestVersion:get().requestVersion+1});
    persistSaved(get().saved);
  },
}));

/** Guarda automáticamente cambios de configuración/presentación por dataset y herramienta. */
useGeochemistryStore.subscribe((s,prev)=>{
  if(s.loading||!s.config||!s.datasetId||s.config.tool!==s.selectedTool)return;
  if(s.config===prev.config&&s.presentation===prev.presentation&&s.attributes===prev.attributes&&s.pointSize===prev.pointSize&&s.symbol===prev.symbol&&s.showLabels===prev.showLabels)return;
  const saved:SavedState={
    workspaces:{...s.saved.workspaces,[workspaceKey(s.datasetId,s.config.tool)]:{config:s.config,presentation:s.presentation,pointSize:s.pointSize,symbol:s.symbol,showLabels:s.showLabels}},
    attributes:{...s.saved.attributes,[s.datasetId]:s.attributes},
  };
  useGeochemistryStore.setState({saved});
  persistSaved(saved);
});
