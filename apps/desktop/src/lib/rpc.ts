/**
 * Typed wrapper around the Tauri `call_analytics` command.
 * All communication with the Python service goes through here.
 */
import { browserRpc } from "./browser-rpc";
import { invoke, isTauri } from "@tauri-apps/api/core";

export async function callRpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  if (import.meta.env.DEV && !isTauri()) {
    return browserRpc<T>(method, params);
  }
  return invoke<T>("call_analytics", { method, params });
}
