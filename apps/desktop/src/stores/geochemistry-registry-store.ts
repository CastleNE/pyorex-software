import { create } from 'zustand';
import { geoApi,type GeoRegistry } from '../lib/geochemistry-api';
import { assertRegistry } from '../lib/geochemistry-registry';

interface RegistryState { registry:GeoRegistry|null; loading:boolean; error:string|null; load:(force?:boolean)=>Promise<void> }

/** Tool Registry served by the backend. Dataset independent, so it is fetched once and kept; failures are never cached. */
export const useGeoRegistryStore=create<RegistryState>((set,get)=>({
  registry:null,loading:false,error:null,
  load:async(force=false)=>{
    const {registry,loading}=get();
    if(loading||(registry&&!force))return;
    set({loading:true,error:null});
    try{set({registry:assertRegistry(await geoApi.registry())});}
    catch(e){set({registry:null,error:e instanceof Error?e.message:String(e)});}
    finally{set({loading:false});}
  },
}));
