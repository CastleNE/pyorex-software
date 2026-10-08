/**
 * Changes a project saves that do not live in the desktop's localStorage (dataset metadata and edit overlays on the
 * Python side: role corrections, coordinates/CRS, column operations). Modules report them here; the project store
 * counts them as unsaved changes. A tiny event bus keeps those modules free of a dependency on the project store.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
export function onProjectDataChanged(fn: Listener) { listeners.add(fn); return () => listeners.delete(fn); }
export function markProjectDataChanged() { for (const fn of listeners) fn(); }
