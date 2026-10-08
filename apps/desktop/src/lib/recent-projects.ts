/**
 * Recently opened or saved .orex projects (File → Open recent). Kept on this computer only; a path that no longer
 * exists is dropped when the user tries to open it.
 */
export interface RecentProject { path: string; name: string; at: string }

export const RECENT_KEY = 'pyorex.recentProjects.v1';
export const RECENT_MAX = 8;

/** Windows paths are case-insensitive and may use either slash. */
const same = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();

/** Puts a project first (replacing any earlier entry for the same file) and keeps the newest RECENT_MAX. */
export function addRecent(list: RecentProject[], path: string, name: string, at = new Date().toISOString()): RecentProject[] {
  return [{ path, name, at }, ...list.filter(r => !same(r.path, path))].slice(0, RECENT_MAX);
}

export const removeRecent = (list: RecentProject[], path: string): RecentProject[] => list.filter(r => !same(r.path, path));

export function sanitizeRecent(raw: unknown): RecentProject[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is RecentProject => !!r && typeof r === 'object' && typeof r.path === 'string' && !!r.path && typeof r.name === 'string' && typeof r.at === 'string')
    .slice(0, RECENT_MAX);
}

export function loadRecent(storage: Storage | undefined = globalThis.localStorage): RecentProject[] {
  try { return sanitizeRecent(JSON.parse(storage?.getItem(RECENT_KEY) ?? '[]')); } catch { return []; }
}

export function saveRecent(list: RecentProject[], storage: Storage | undefined = globalThis.localStorage): void {
  try { storage?.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

/** File name of a path (two copies of a project can share the name stored inside). */
export const fileOf = (path: string) => path.split(/[\\/]/).pop() || path;

/** Folder part of a path, for the second line of a menu entry. */
export const folderOf = (path: string) => path.replace(/[\\/][^\\/]*$/, '') || path;
