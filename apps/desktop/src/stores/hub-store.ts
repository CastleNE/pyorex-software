import { create } from 'zustand';
import { hubApi, type HubEntry, type HubSection, type EntrySection, type MarketsResult } from '../lib/hub-api';

interface HubState {
  section: HubSection; query: string; archiveFilter: EntrySection | 'all';
  catalog: HubEntry[]; archive: HubEntry[]; markets: MarketsResult | null;
  loading: boolean; refreshing: boolean; saving: boolean; error: string | null;
  select: (section: HubSection) => void;
  setQuery: (query: string) => void;
  setArchiveFilter: (filter: EntrySection | 'all') => void;
  load: () => Promise<void>; refreshMarkets: () => Promise<void>;
  save: (id: string) => Promise<void>; remove: (id: string) => Promise<void>;
}

export const useHubStore = create<HubState>((set, get) => ({
  section: 'today', query: '', archiveFilter: 'all', catalog: [], archive: [], markets: null,
  loading: false, refreshing: false, saving: false, error: null,
  select: section => {
    set({ section, query: '' });
    if (typeof window !== 'undefined' && window.location.hash !== `#/hub/${section}`)
      window.location.hash = `/hub/${section}`;
  },
  setQuery: query => set({ query }),
  setArchiveFilter: archiveFilter => set({ archiveFilter }),
  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    const results = await Promise.allSettled([hubApi.catalog(), hubApi.archive(), hubApi.markets()]);
    const [catalog, archive, markets] = results;
    if (catalog.status === 'fulfilled') set({ catalog: catalog.value.items });
    if (archive.status === 'fulfilled') set({ archive: archive.value.items });
    if (markets.status === 'fulfilled') set({ markets: markets.value });
    set({ loading: false, error: results.some(r => r.status === 'rejected')
      ? 'No se pudo cargar todo el Hub. Comprueba que el servicio de PyOrex esté iniciado y vuelve a intentar.' : null });
  },
  refreshMarkets: async () => {
    if (get().refreshing || get().loading) return;
    set({ refreshing: true, error: null });
    try { set({ markets: await hubApi.markets(true) }); }
    catch { set({ error: 'No se pudo contactar con el servicio. Conservamos los datos visibles; vuelve a intentar.' }); }
    finally { set({ refreshing: false }); }
  },
  save: async id => {
    if (get().saving) return;
    set({ saving: true, error: null });
    try { set({ archive: (await hubApi.save(id)).items }); }
    catch { set({ error: 'No se pudo guardar la entrada. Vuelve a intentar.' }); }
    finally { set({ saving: false }); }
  },
  remove: async id => {
    if (get().saving) return;
    set({ saving: true, error: null });
    try { set({ archive: (await hubApi.remove(id)).items }); }
    catch { set({ error: 'No se pudo retirar la entrada. Vuelve a intentar.' }); }
    finally { set({ saving: false }); }
  },
}));
