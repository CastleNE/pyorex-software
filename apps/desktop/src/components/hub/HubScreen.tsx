import { useEffect, useState } from 'react';
import { HUB_SECTIONS, filterEntries, type HubEntry, type EntrySection } from '../../lib/hub-api';
import { useHubStore } from '../../stores/hub-store';

const button = 'rounded border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-40 disabled:cursor-wait';
const dateText = (value: string | null) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleString('es-PE', value.length === 10 ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin consulta todavía';

function Source({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return <div className="flex flex-wrap items-center gap-3 text-xs">
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline underline-offset-4 hover:text-blue-200">{label} ↗</a>
    <button className="text-zinc-400 hover:text-zinc-200" onClick={() => {
      navigator.clipboard.writeText(url).then(() => { setCopied(true); setFailed(false); }).catch(() => setFailed(true));
    }}>{copied ? 'Enlace copiado' : 'Copiar enlace'}</button>
    {failed && <span className="select-text text-amber-300">{url}</span>}
  </div>;
}

function EntryCard({ entry, archived = false }: { entry: HubEntry; archived?: boolean }) {
  const { archive, saving, save, remove } = useHubStore();
  const saved = archive.some(e => e.id === entry.id);
  return <article className="flex flex-col gap-3 rounded-lg border border-zinc-700 bg-zinc-800/60 p-5">
    <div className="flex items-start justify-between gap-3"><span className="text-xs text-blue-300">{entry.kind}</span>
      <button className={button} disabled={saving || (!archived && saved)} onClick={() => void (archived ? remove(entry.id) : save(entry.id))}>{archived ? 'Retirar de Archive' : saved ? 'Guardado' : 'Guardar'}</button></div>
    <h3 className="font-semibold text-zinc-100">{entry.title}</h3>
    <p className="text-sm leading-relaxed text-zinc-400">{entry.summary}</p>
    <div className="flex flex-wrap gap-2">{entry.tags.map(tag => <span key={tag} className="rounded bg-zinc-700/60 px-2 py-1 text-xs text-zinc-300">{tag}</span>)}</div>
    <div className="mt-auto space-y-3 pt-2"><p className="text-xs text-zinc-500">{entry.published_at ? `Dato: ${dateText(entry.published_at)}` : 'Referencia · sin fecha de publicación indicada'}{entry.saved_at && ` · Guardado: ${dateText(entry.saved_at)}`}</p>
    <Source url={entry.url} label={entry.source} /></div>
  </article>;
}

function Markets({ compact = false }: { compact?: boolean }) {
  const { markets, refreshing, loading, refreshMarkets, archive, save, saving, select } = useHubStore();
  const quotes = markets?.quotes ?? [];
  return <section className="space-y-4" aria-label="Cotizaciones de metales">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Metales · observaciones diarias</h2>
      <p className="mt-1 text-xs text-zinc-400">BCRPData · no son precios en tiempo real · unidades originales</p></div>
      <button className={`${button} border-blue-500 bg-blue-600/20`} disabled={refreshing || loading} onClick={() => void refreshMarkets()}>{refreshing ? 'Consultando BCRP…' : 'Actualizar Markets'}</button></div>
    <p className="text-xs text-zinc-400" role="status">{markets?.status === 'updated' ? 'Consulta completada' : quotes.length ? 'Datos guardados localmente' : 'Sin datos descargados'} · Última consulta: {dateText(markets?.fetched_at ?? null)}</p>
    {markets?.warning && <p role="alert" className="rounded border border-amber-600/40 bg-amber-500/10 p-3 text-sm text-amber-200">{markets.warning} {quotes.length > 0 && 'Se muestran las últimas observaciones guardadas.'}</p>}
    {quotes.length === 0 ? <div className="rounded-lg border border-dashed border-zinc-600 p-8 text-center text-sm text-zinc-400">{loading || refreshing ? 'Cargando observaciones…' : 'Pulsa Actualizar Markets para consultar cobre, plata, zinc y oro. Después estarán disponibles sin conexión.'}</div> :
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{quotes.map(q => <article key={q.series} className="rounded-lg border border-zinc-700 bg-zinc-800/70 p-4">
        <div className="flex items-center justify-between"><h3 className="font-medium">{q.metal}</h3><span className="text-xs text-zinc-500">{q.series}</span></div>
        <p className="mt-4 text-2xl font-semibold tabular-nums">{q.value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        <p className="mt-1 text-xs text-zinc-400">{q.unit}</p>
        <p className={`mt-3 text-sm tabular-nums ${q.change_pct === null ? 'text-zinc-400' : q.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{q.change_pct === null ? 'Sin variación calculable' : `${q.change_pct >= 0 ? '+' : ''}${q.change_pct.toFixed(2)}%`}</p>
        <p className="mt-1 text-xs text-zinc-500">{q.previous_at ? `vs. ${dateText(q.previous_at)}` : 'Sin observación anterior'}</p>
        <p className="my-4 text-xs text-zinc-300">Dato: {dateText(q.observed_at)}</p>
        {!compact && <div className="space-y-3 border-t border-zinc-700 pt-3"><Source url={q.url} label="Ver serie BCRP" /><button className={button} disabled={saving || archive.some(e => e.id === q.id)} onClick={() => void save(q.id)}>{archive.some(e => e.id === q.id) ? 'Guardado' : 'Guardar observación'}</button></div>}
      </article>)}</div>}
    {compact && <button className="text-sm text-blue-300 hover:underline" onClick={() => select('markets')}>Abrir Markets →</button>}
    {!compact && quotes.length > 0 && <details className="rounded-lg border border-zinc-700 p-4"><summary className="cursor-pointer text-sm text-zinc-300">Historial reciente · hasta 30 observaciones por metal</summary><div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">{quotes.map(q => <div key={q.series}><h3 className="mb-2 text-sm font-medium">{q.metal} · {q.unit}</h3><div className="max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead className="text-zinc-400"><tr><th className="py-2">Fecha</th><th className="text-right">Valor</th></tr></thead><tbody>{[...q.history].reverse().map(p => <tr key={p.date} className="border-t border-zinc-700"><td className="py-2">{dateText(p.date)}</td><td className="text-right tabular-nums">{p.value.toFixed(2)}</td></tr>)}</tbody></table></div></div>)}</div></details>}
  </section>;
}

export default function HubScreen() {
  const state = useHubStore();
  useEffect(() => { void useHubStore.getState().load(); }, []);
  const selected = HUB_SECTIONS.find(s => s.id === state.section)!;
  const isArchive = state.section === 'archive';
  const entries = filterEntries(isArchive ? state.archive : state.catalog, state.query,
    isArchive ? state.archiveFilter : ['peru', 'methods', 'discoveries'].includes(state.section) ? state.section as EntrySection : 'all');
  return <div className="flex min-h-0 flex-1" data-testid="andean-hub">
    <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-700 bg-zinc-900 p-3">
      <div className="px-3 pb-5 pt-4"><p className="text-xs font-semibold uppercase tracking-widest text-blue-400">PyOrex / Intelligence</p><p className="mt-2 text-lg font-semibold leading-tight">Andean<br />Exploration Hub</p><span className="mt-2 inline-block text-xs text-zinc-500">v0.1 · Exploración andina</span></div>
      <nav aria-label="Secciones del Hub" className="space-y-1">{HUB_SECTIONS.map(s => <button key={s.id} onClick={() => state.select(s.id)} aria-current={s.id === state.section ? 'page' : undefined} className={`w-full rounded-md border-l-2 px-3 py-3 text-left focus-visible:outline-blue-400 ${s.id === state.section ? 'border-blue-400 bg-blue-500/10 text-blue-200' : 'border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}><span className="block text-sm font-medium">{s.label}{s.id === 'archive' && state.archive.length > 0 ? ` (${state.archive.length})` : ''}</span><span className="mt-1 block text-xs opacity-60">{s.detail}</span></button>)}</nav>
      <div className="mt-auto px-3 pt-6 text-xs leading-relaxed text-zinc-500">Fuentes identificadas.<br />Referencias guardadas en este equipo.</div>
    </aside>
    <main className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-700 pb-5"><div><p className="text-xs uppercase tracking-widest text-zinc-500">Andean Exploration Hub</p><h1 className="mt-2 text-2xl font-semibold">{selected.label}</h1><p className="mt-1 text-sm text-zinc-400">{selected.detail}</p></div><span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">Perú · Andes</span></header>
      {state.error && <div role="alert" className="mb-5 flex items-center justify-between gap-4 rounded border border-amber-600/40 bg-amber-500/10 p-4 text-sm text-amber-200"><p>{state.error}</p><button className={button} disabled={state.loading} onClick={() => void state.load()}>Reintentar</button></div>}
      {state.loading && <p role="status" className="mb-4 text-sm text-zinc-400">Cargando Hub…</p>}
      {state.section === 'today' ? <div className="space-y-8"><div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-5"><h2 className="text-lg font-medium">Contexto para tu próxima decisión de exploración</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">Consulta metales, encuentra referencias para Perú y guarda lo que necesitas para volver a ello. Cada entrada distingue su fuente y la fecha disponible.</p></div><Markets compact /><section><h2 className="mb-4 text-lg font-semibold">Referencias disponibles</h2><div className="grid gap-4 lg:grid-cols-2">{state.catalog.map(e => <EntryCard key={e.id} entry={e} />)}</div></section><p className="text-xs text-zinc-500">Discoveries aún no tiene noticias verificadas. Las referencias de esta edición no constituyen un boletín de actualidad.</p></div> : state.section === 'markets' ? <Markets /> : <section className="space-y-5">
        <div className="flex flex-wrap gap-3"><input type="search" aria-label="Buscar en el Hub" placeholder="Buscar por tema, fuente o palabra clave…" value={state.query} onChange={e => state.setQuery(e.target.value)} className="min-w-64 flex-1 rounded border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm outline-none focus:border-blue-400" />
          {isArchive && <select aria-label="Filtrar Archive por sección" value={state.archiveFilter} onChange={e => state.setArchiveFilter(e.target.value as EntrySection | 'all')} className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm"><option value="all">Todas las secciones</option><option value="markets">Markets</option><option value="discoveries">Discoveries</option><option value="peru">Peru Intelligence</option><option value="methods">Methods</option></select>}</div>
        <p className="text-xs text-zinc-500">{entries.length} {entries.length === 1 ? 'entrada' : 'entradas'}{isArchive ? ' guardadas en este equipo' : ' · referencias con fuente identificada'}</p>
        {entries.length ? <div className="grid gap-4 lg:grid-cols-2">{entries.map(e => <EntryCard key={e.id} entry={e} archived={isArchive} />)}</div> : <div className="rounded-lg border border-dashed border-zinc-600 p-10 text-center"><h2 className="font-medium">{state.query ? 'Sin coincidencias' : isArchive ? 'Tu archivo está listo' : state.section === 'discoveries' ? 'Sin descubrimientos verificados todavía' : 'Sin referencias disponibles'}</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-zinc-400">{state.query ? 'Prueba otra palabra o cambia el filtro.' : isArchive ? 'Guarda observaciones de Markets o referencias desde las otras secciones. Permanecerán disponibles al reiniciar.' : state.section === 'discoveries' ? 'Esta sección está preparada para entradas verificadas. El primer feed conectado de v0.1 es Markets; aquí no mostramos noticias de ejemplo como si fueran actuales.' : 'Reintenta la carga si el servicio de PyOrex acaba de iniciarse.'}</p></div>}
      </section>}
    </main>
  </div>;
}
