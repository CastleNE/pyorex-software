import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./rpc', () => ({ callRpc: vi.fn() }));
import { callRpc } from './rpc';
import { filterEntries, sectionFromHash } from './hub-api';
import { useHubStore } from '../stores/hub-store';

const call = vi.mocked(callRpc);
const entry = { id: 'peru', section: 'peru' as const, title: 'Geología del Perú', summary: 'Cartografía', source: 'INGEMMET', url: 'https://www.gob.pe/ingemmet', tags: ['Perú'], published_at: null, kind: 'Referencia' };

beforeEach(() => {
  call.mockReset();
  useHubStore.setState({ catalog: [], archive: [], markets: null, loading: false, refreshing: false, saving: false, error: null, section: 'today', query: '', archiveFilter: 'all' });
});

describe('Hub navigation and search', () => {
  it('parses only supported deep links', () => {
    expect(sectionFromHash('#/hub/markets')).toBe('markets');
    expect(sectionFromHash('#/hub')).toBe('today');
    expect(sectionFromHash('#/hub/nope')).toBeNull();
    expect(sectionFromHash('#/data')).toBeNull();
  });
  it('searches accents and filters by section', () => {
    expect(filterEntries([entry], 'geologia', 'all')).toEqual([entry]);
    expect(filterEntries([entry], 'ingemmet', 'peru')).toEqual([entry]);
    expect(filterEntries([entry], '', 'methods')).toEqual([]);
  });
});

describe('Hub lifecycle', () => {
  it('loads persisted archive and cached markets without network refresh', async () => {
    call.mockImplementation(async (method) => method === 'hub.markets' ? { quotes: [], status: 'empty', warning: null, fetched_at: null } : { items: [entry] });
    await useHubStore.getState().load();
    expect(useHubStore.getState().archive).toEqual([entry]);
    expect(call).toHaveBeenCalledWith('hub.markets', { refresh: false });
    expect(useHubStore.getState().loading).toBe(false);
  });
  it('retains previous content on service failure and supports retry', async () => {
    useHubStore.setState({ catalog: [entry] });
    call.mockRejectedValue(new Error('offline'));
    await useHubStore.getState().load();
    expect(useHubStore.getState().catalog).toEqual([entry]);
    expect(useHubStore.getState().error).toBeTruthy();
    expect(useHubStore.getState().loading).toBe(false);
  });
  it('deduplicates refresh while pending', async () => {
    let resolve!: (value: unknown) => void;
    call.mockReturnValue(new Promise(r => { resolve = r; }));
    const first = useHubStore.getState().refreshMarkets();
    await useHubStore.getState().refreshMarkets();
    expect(call).toHaveBeenCalledTimes(1);
    resolve({ quotes: [], status: 'unavailable', warning: 'offline', fetched_at: null });
    await first;
    expect(useHubStore.getState().refreshing).toBe(false);
  });
  it('updates saved state only after successful persistence', async () => {
    call.mockResolvedValue({ items: [entry] });
    await useHubStore.getState().save(entry.id);
    expect(useHubStore.getState().archive).toEqual([entry]);
    call.mockRejectedValue(new Error('disk error'));
    await useHubStore.getState().remove(entry.id);
    expect(useHubStore.getState().archive).toEqual([entry]);
  });
});
