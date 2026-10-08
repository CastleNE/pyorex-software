/**
 * App-level dialogs for projects and imports: unified "Import data" chooser, unsaved-changes prompt, the path prompt
 * used in browser development mode (the desktop app uses native dialogs) and the project notice.
 */
import { useEffect, useState, type ReactNode } from 'react';
import PxIcon, { type PxIconName } from './PxIcon';
import { useProject } from '../stores/project-store';
import { useT, type TKey } from '../lib/i18n';

export function Modal({ title, icon, onClose, children, width = 'w-[460px]' }: { title: string; icon: PxIconName; onClose: () => void; children: ReactNode; width?: string }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={title} className={`${width} max-w-full rounded-lg border border-line-strong bg-panel shadow-2xl`}>
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <PxIcon name={icon} className="h-4 w-4 text-accent-fg" /><b className="flex-1 text-[13.5px] text-fg">{title}</b>
        <button onClick={onClose} aria-label="×" className="rounded p-1 text-muted hover:bg-hover"><PxIcon name="close" className="h-4 w-4" /></button>
      </header>
      <div className="p-4">{children}</div>
    </div>
  </div>;
}

export type ImportKind = 'geo' | 'native' | 'processed' | 'project';
const KINDS: { id: ImportKind; icon: PxIconName }[] = [
  { id: 'geo', icon: 'table' }, { id: 'native', icon: 'spectrum' }, { id: 'processed', icon: 'mineral' }, { id: 'project', icon: 'project' },
];

/** File → Import data: one entry point for every supported kind of data. */
export function ImportHub({ onPick, onClose }: { onPick: (k: ImportKind) => void; onClose: () => void }) {
  const t = useT();
  return <Modal title={t('importTitle')} icon="import" onClose={onClose} width="w-[560px]">
    <p className="mb-3 text-[12.5px] text-muted">{t('importIntro')}</p>
    <div className="grid grid-cols-2 gap-2.5">
      {KINDS.map((k, i) => <button key={k.id} autoFocus={i === 0} onClick={() => { onClose(); onPick(k.id); }}
        className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-hover focus:outline-none focus:ring-2 focus:ring-focus ${i === 0 ? 'border-accent shadow-[0_0_0_1px_var(--color-accent)]' : 'border-line'}`}>
        <PxIcon name={k.icon} className={`mt-0.5 h-5 w-5 ${i === 0 ? 'text-accent-fg' : 'text-muted'}`} />
        <span><span className="block text-[13px] font-semibold text-fg">{t(`imp.${k.id}` as TKey)}</span><span className="block text-[11.5px] leading-snug text-muted">{t(`imp.${k.id}Hint` as TKey)}</span></span>
      </button>)}
    </div>
  </Modal>;
}

export function ProjectDialogs() {
  const t = useT();
  const pathRequest = useProject(s => s.pathRequest), confirmRequest = useProject(s => s.confirmRequest);
  const notice = useProject(s => s.notice), busy = useProject(s => s.busy);
  const [path, setPath] = useState('');
  useEffect(() => { setPath(pathRequest?.suggested ?? ''); }, [pathRequest]);
  useEffect(() => { if (notice?.tone !== 'ok') return; const id = setTimeout(() => useProject.getState().dismissNotice(), 6000); return () => clearTimeout(id); }, [notice]);
  const button = 'h-8 rounded-md px-3 text-[12.5px] font-medium';
  return <>
    {pathRequest && <Modal title={t(pathRequest.mode === 'open' ? 'pathOpen' : 'pathSave')} icon="project" onClose={() => pathRequest.resolve(null)}>
      <form onSubmit={e => { e.preventDefault(); if (path.trim()) pathRequest.resolve(path.trim()); }}>
        <input autoFocus value={path} onChange={e => setPath(e.target.value)} placeholder="/ruta/al/proyecto.orex" aria-label={t(pathRequest.mode === 'open' ? 'pathOpen' : 'pathSave')}
          className="h-9 w-full rounded-md border border-line-strong bg-raised px-3 font-mono text-[12.5px] text-fg focus:border-accent focus:outline-none" />
        <p className="mt-2 text-[11.5px] text-subtle">{t('pathHint')}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => pathRequest.resolve(null)} className={`${button} border border-line-strong text-fg hover:bg-hover`}>{t('cancel')}</button>
          <button type="submit" className={`${button} bg-accent-strong text-on-accent hover:bg-accent-hover`}>{t('accept')}</button>
        </div>
      </form>
    </Modal>}
    {confirmRequest && <Modal title={t('unsavedTitle')} icon="warn" onClose={() => confirmRequest.resolve('cancel')}>
      <p className="text-[13px] text-fg">{t('unsavedBody')}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={() => confirmRequest.resolve('cancel')} className={`${button} border border-line-strong text-fg hover:bg-hover`}>{t('cancel')}</button>
        <button onClick={() => confirmRequest.resolve('discard')} className={`${button} border border-line-strong text-danger hover:bg-hover`}>{t('discard')}</button>
        <button autoFocus onClick={() => confirmRequest.resolve('save')} className={`${button} bg-accent-strong text-on-accent hover:bg-accent-hover`}>{t('save')}</button>
      </div>
    </Modal>}
    {(notice || busy) && <div role={notice?.tone === 'error' ? 'alert' : 'status'} className={`fixed bottom-9 left-1/2 z-[90] flex max-w-[640px] -translate-x-1/2 items-start gap-2 rounded-md border px-3 py-2 text-[12px] shadow-xl ${notice?.tone === 'error' ? 'border-danger-line bg-danger-soft text-danger' : 'border-line-strong bg-panel text-fg'}`}>
      {busy && <span className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />}
      <span className="select-text break-all">{busy ? `${busy === 'saving' ? t('saveProject') : t('openProject')}…` : notice?.text}</span>
      {notice && !busy && <button onClick={() => useProject.getState().dismissNotice()} aria-label={t('close')} className="shrink-0 rounded p-0.5 hover:bg-hover"><PxIcon name="close" className="h-3.5 w-3.5" /></button>}
    </div>}
  </>;
}
