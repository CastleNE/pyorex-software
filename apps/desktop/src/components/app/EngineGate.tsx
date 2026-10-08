/**
 * Start-up screen of the installed app: waits until the bundled Python engine answers before showing PyOreX, so no
 * screen opens with failed requests. The engine usually needs a few seconds (first start after installing: longer,
 * Windows scans the new files). In the browser (development) it renders the app at once.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import PyOrexLogo from '@/components/PyOrexLogo';
import { useL } from '@/lib/i18n';

interface EngineInfo { mode: 'bundled' | 'external' | 'missing'; base_url: string; data_dir: string | null; log_file: string | null; error: string | null }
const TIMEOUT_S = 120;

export default function EngineGate({ children }: { children: ReactNode }) {
  const L = useL();
  const [ready, setReady] = useState(!isTauri());
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (ready) return;
    let live = true;
    const started = Date.now();
    const tick = async () => {
      if (!live) return;
      const secs = Math.round((Date.now() - started) / 1000);
      setElapsed(secs);
      try {
        const i = await invoke<EngineInfo>('engine_info');
        setInfo(i);
        if (i.mode === 'missing' && i.error) { setFailed(i.error); return; }
        if (await invoke<boolean>('check_analytics_service')) { setReady(true); return; }
      } catch { /* not up yet */ }
      if (secs >= TIMEOUT_S) {
        setFailed(L({ es: 'El motor de cálculo no respondió a tiempo.', en: 'The calculation engine did not respond in time.' }));
        return;
      }
      setTimeout(tick, 400);
    };
    void tick();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, attempt]);

  if (ready) return <>{children}</>;
  const logDir = info?.log_file ? info.log_file.replace(/[\\/][^\\/]*$/, '') : null;
  return (
    <div className="grid h-screen place-items-center bg-app text-fg">
      <div className="flex w-[420px] max-w-[90vw] flex-col items-center gap-4 text-center">
        <PyOrexLogo size={56} wordmark={false} className="text-fg" />
        <p className="text-xl font-semibold tracking-tight">PyOreX</p>
        {!failed ? <>
          <div className="h-1 w-56 overflow-hidden rounded-full bg-sunken"><div className="h-full w-1/3 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-accent" /></div>
          <p className="text-sm text-muted">{L({ es: 'Iniciando el motor de cálculo…', en: 'Starting the calculation engine…' })}</p>
          {elapsed >= 8 && <p className="text-xs text-subtle">{L({ es: 'La primera vez después de instalar puede tardar un poco más.', en: 'The first start after installing can take a little longer.' })} <span className="tabular font-mono">{elapsed} s</span></p>}
        </> : <>
          <p role="alert" className="text-sm text-danger">{failed}</p>
          {info?.log_file && <p className="select-text break-all text-xs text-subtle">{L({ es: 'Registro', en: 'Log' })}: <span className="font-mono">{info.log_file}</span></p>}
          <div className="flex gap-2">
            <button onClick={() => { setFailed(null); setElapsed(0); setAttempt(a => a + 1); }} className="h-8 rounded-md bg-accent-strong px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover">{L({ es: 'Reintentar', en: 'Retry' })}</button>
            {logDir && <button onClick={() => void invoke('open_in_explorer', { path: logDir })} className="h-8 rounded-md border border-line-strong px-4 text-sm text-fg hover:bg-hover">{L({ es: 'Abrir carpeta del registro', en: 'Open log folder' })}</button>}
          </div>
        </>}
      </div>
    </div>
  );
}
