import { useRef,useState } from 'react';
import { parseSession } from '../../lib/geochemistry-session';
import { runSave,saveFile,type SaveNotice } from '../../lib/save-file';
import { useGeochemistryStore } from '../../stores/geochemistry-store';

const button='rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:border-zinc-400';
export default function SessionControls() {
  const notice=useGeochemistryStore(s=>s.notice);
  const [saveNotice,setSaveNotice]=useState<SaveNotice|null>(null);
  const [importError,setImportError]=useState<string|null>(null);
  const input=useRef<HTMLInputElement>(null);
  const exportSession=async()=>{
    const doc=useGeochemistryStore.getState().exportSession();if(!doc)return;
    setSaveNotice(await runSave(()=>saveFile(`pyorex-sesion-geoquimica-${doc.dataset.name||doc.dataset.id}.json`.replace(/[\/:*?"<>|\s]+/g,'_'),JSON.stringify(doc,null,2),'application/json')));
  };
  const importSession=async(file:File|undefined)=>{
    if(!file)return;
    try{setImportError(null);useGeochemistryStore.getState().importSession(parseSession(await file.text()));}
    catch(error){setImportError(error instanceof Error?error.message:String(error));}
    if(input.current)input.current.value='';
  };
  return <details className="space-y-2 border-t border-zinc-700 pt-3"><summary className="cursor-pointer text-xs text-sky-300">Sesión y configuración guardada</summary>
    <p className="text-xs leading-relaxed text-zinc-500">La configuración y la presentación se guardan automáticamente por dataset y herramienta en este equipo. El documento de sesión contiene solo configuración, no datos ni resultados.</p>
    <div className="flex flex-wrap gap-2">
      <button className={button} onClick={()=>void exportSession()}>Guardar sesión (JSON)</button>
      <button className={button} onClick={()=>input.current?.click()}>Abrir sesión…</button>
      <button className={button} onClick={()=>useGeochemistryStore.getState().resetWorkspace()}>Restablecer herramienta</button>
      <input ref={input} type="file" accept=".json,application/json" aria-label="Abrir sesión de Geoquímica" className="hidden" onChange={e=>void importSession(e.target.files?.[0])}/>
    </div>
    {notice&&<p role="status" className="select-text text-xs text-amber-300">{notice}</p>}
    {saveNotice&&<p role={saveNotice.tone==='error'?'alert':'status'} className={`select-text text-xs ${saveNotice.tone==='error'?'text-red-300':'text-emerald-300'}`}>{saveNotice.text}</p>}
    {importError&&<p role="alert" className="select-text text-xs text-red-300">{importError}</p>}
  </details>;
}
