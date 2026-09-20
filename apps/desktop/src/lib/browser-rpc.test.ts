import { afterEach, expect, it, vi } from 'vitest';
import { browserRpc } from './browser-rpc';
afterEach(() => vi.unstubAllGlobals());
it('passes results through the development proxy', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: JSON.parse(options.body).id, result: { pong: true } }) })));
  expect(await browserRpc('health.ping', {})).toEqual({ pong: true });
});
it('reports RPC errors rather than treating them as results', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: JSON.parse(options.body).id, error: { code: -32601, message: 'Missing method' } }) })));
  await expect(browserRpc('missing', {})).rejects.toThrow('Missing method');
});
it('rejects HTTP errors', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 })));
  await expect(browserRpc('health.ping', {})).rejects.toThrow('502');
});
