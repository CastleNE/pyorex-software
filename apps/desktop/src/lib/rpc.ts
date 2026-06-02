/**
 * Typed wrapper around the Tauri `call_analytics` command.
 * All communication with the Python service goes through here.
 */
import { invoke } from "@tauri-apps/api/core";

export async function callRpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  return invoke<T>("call_analytics", { method, params });
}
