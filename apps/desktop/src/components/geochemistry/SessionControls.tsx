import { useRef,useState } from 'react';
import { parseSession } from '../../lib/geochemistry-session';
import { runSave,saveFile,type SaveNotice } from '../../lib/save-file';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import { useL } from '../../lib/i18n';

const button='h-7 rounded border border-line-strong bg-raised px-2 text-xs text-fg hover:bg-hover';

/** Saves the active tool's session document (configuration only). Shared by the Editor and the ribbon's Tool tab. */
export async function saveSessionFile():Promise<SaveNotice|null> {
  const doc=useGeochemistryStore.getState().exportSession();if(!doc)return null;
  return runSave(()=>saveFile(`pyorex-sesion-geoquimica-${doc.dataset.name||doc.dataset.id}.json`.replace(/[\/:*?"<>|\s]+/g,'_'),JSON.stringify(doc,null,2),'application/json'));
}
/** Opens a session document; returns an error message, or null when it was applied. */
export async function openSessionFile(file:File):Promise<string|null> {
  try{useGeochemistryStore.getState().importSession(parseSession(await file.text()));return null;}
  catch(error){return error instanceof Error?error.message:String(error);}
}

export default function SessionControls() {
  const L=useL();
  const notice=useGeochemistryStore(s=>s.notice);
  const [saveNotice,setSaveNotice]=useState<SaveNotice|null>(null);
  const [importError,setImportError]=useState<string|null>(null);
  const input=useRef<HTMLInputElement>(null);
  const exportSession=async()=>{const notice=await saveSessionFile();if(notice)setSaveNotice(notice);};
  const importSession=async(file:File|undefined)=>{
    if(!file)return;
    setImportError(await openSessionFile(file));
    if(input.current)input.current.value='';
  };
  return <section className="space-y-2" aria-label={L({es:'Sesión y configuración guardada',en:'Session and saved configuration'})}>
    <p className="text-xs leading-relaxed text-subtle">{L({es:'La configuración y la presentación se guardan automáticamente por dataset y herramienta en este equipo. El documento de sesión contiene solo configuración, no datos ni resultados.',en:'Configuration and presentation are saved automatically per dataset and tool on this computer. The session document holds configuration only, no data or results.'})}</p>
    <div className="flex flex-wrap gap-2">
      <button className={button} onClick={()=>void exportSession()}>{L({es:'Guardar sesión (JSON)',en:'Save session (JSON)'})}</button>
      <button className={button} onClick={()=>input.current?.click()}>{L({es:'Abrir sesión…',en:'Open session…'})}</button>
      <button className={button} onClick={()=>useGeochemistryStore.getState().resetWorkspace()}>{L({es:'Restablecer herramienta',en:'Reset tool'})}</button>
      <input ref={input} type="file" accept=".json,application/json" aria-label={L({es:'Abrir sesión de Geoquímica',en:'Open Geochemistry session'})} className="hidden" onChange={e=>void importSession(e.target.files?.[0])}/>
    </div>
    {notice&&<p role="status" className="select-text text-xs text-warning">{notice}</p>}
    {saveNotice&&<p role={saveNotice.tone==='error'?'alert':'status'} className={`select-text text-xs ${saveNotice.tone==='error'?'text-danger':'text-success'}`}>{saveNotice.text}</p>}
    {importError&&<p role="alert" className="select-text text-xs text-danger">{importError}</p>}
  </section>;
}
