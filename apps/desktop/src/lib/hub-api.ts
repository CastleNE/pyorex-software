import { callRpc } from './rpc';

export const HUB_SECTIONS = [
  { id: 'today', label: 'Today', detail: 'Tu punto de partida' },
  { id: 'markets', label: 'Markets', detail: 'Metales · BCRPData' },
  { id: 'discoveries', label: 'Discoveries', detail: 'Seguimiento de hallazgos' },
  { id: 'peru', label: 'Peru Intelligence', detail: 'Contexto local' },
  { id: 'methods', label: 'Methods', detail: 'Biblioteca de exploración' },
  { id: 'archive', label: 'Archive', detail: 'Tus referencias guardadas' },
] as const;
export type HubSection = typeof HUB_SECTIONS[number]['id'];
export type EntrySection = 'markets' | 'discoveries' | 'peru' | 'methods';
export interface HubEntry {
  id: string; section: EntrySection; title: string; summary: string;
  source: string; url: string; tags: string[]; published_at: string | null;
  kind: string; saved_at?: string;
}
export interface MarketQuote {
  id: string; series: string; metal: string; value: number; unit: string;
  observed_at: string; previous_at: string | null; change_pct: number | null;
  source: string; url: string; history: { date: string; value: number }[];
}
export interface MarketsResult {
  quotes: MarketQuote[]; fetched_at: string | null;
  status: 'updated' | 'cached' | 'empty' | 'unavailable'; warning: string | null;
}
export const hubApi = {
  catalog: () => callRpc<{ items: HubEntry[] }>('hub.catalog'),
  markets: (refresh = false) => callRpc<MarketsResult>('hub.markets', { refresh }),
  archive: () => callRpc<{ items: HubEntry[] }>('hub.archive.list'),
  save: (id: string) => callRpc<{ items: HubEntry[] }>('hub.archive.save', { item_id: id }),
  remove: (id: string) => callRpc<{ items: HubEntry[] }>('hub.archive.remove', { item_id: id }),
};

export function sectionFromHash(hash: string): HubSection | null {
  if (hash === '#/hub' || hash === '#/hub/') return 'today';
  return HUB_SECTIONS.find(s => hash === `#/hub/${s.id}`)?.id ?? null;
}
const folded = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function filterEntries(entries: HubEntry[], query: string, section: EntrySection | 'all') {
  const term = folded(query.trim());
  return entries.filter(e => (section === 'all' || e.section === section) &&
    folded([e.title, e.summary, e.source, ...e.tags].join(' ')).includes(term));
}
