/** Development-only adapter used through callRpc; packaged app always uses Tauri. */
export async function browserRpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const id = crypto.randomUUID();
  const response = await fetch('/rpc', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`PyOrex service: HTTP ${response.status}`);
  const message = await response.json();
  if (message.jsonrpc !== '2.0' || message.id !== id) throw new Error('Invalid RPC response');
  if (message.error) throw new Error(message.error.message ?? 'RPC error');
  return message.result as T;
}
