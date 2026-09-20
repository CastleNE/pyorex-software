import { isTauri } from '@tauri-apps/api/core';

export type SaveOutcome = { status: 'saved'; path: string } | { status: 'cancelled' };

const MIME_EXT: Record<string, string> = { png: 'png', jpeg: 'jpg', jpg: 'jpg', svg: 'svg', csv: 'csv', json: 'json' };
const FILTER_LABEL: Record<string, string> = { png: 'Imagen PNG', jpg: 'Imagen JPG', svg: 'Imagen SVG', csv: 'CSV', json: 'JSON' };

export const extensionFor = (format: string): string => MIME_EXT[format] ?? format;

/** Decodifica un data URL (base64 o percent-encoded, como el SVG de Plotly) a bytes. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) throw new Error('Data URL de imagen inválido');
  const header = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  if (header.endsWith(';base64')) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

/**
 * Guarda un archivo. En Tauri abre el diálogo nativo «Guardar como» y escribe con plugin-fs,
 * devolviendo la ruta real; nunca hay éxito silencioso. En navegador usa descarga por enlace.
 */
export async function saveFile(defaultName: string, content: Uint8Array | string, mime: string): Promise<SaveOutcome> {
  const ext = defaultName.split('.').pop() ?? '';
  if (isTauri()) {
    const [{ save }, { writeFile, writeTextFile }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
    const path = await save({ defaultPath: defaultName, filters: [{ name: FILTER_LABEL[ext] ?? ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return { status: 'cancelled' };
    if (typeof content === 'string') await writeTextFile(path, content);
    else await writeFile(path, content);
    return { status: 'saved', path };
  }
  const url = URL.createObjectURL(new Blob([content as BlobPart], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = defaultName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { status: 'saved', path: defaultName };
}

export type SaveNotice = { tone: 'ok' | 'error'; text: string };

/** Ejecuta un guardado y lo convierte en un aviso visible para la UI (éxito con ruta, cancelación o error). */
export async function runSave(action: () => Promise<SaveOutcome>): Promise<SaveNotice> {
  try {
    const outcome = await action();
    return outcome.status === 'saved' ? { tone: 'ok', text: `Guardado en ${outcome.path}` } : { tone: 'ok', text: 'Guardado cancelado' };
  } catch (error) {
    return { tone: 'error', text: `No se pudo guardar: ${error instanceof Error ? error.message : String(error)}` };
  }
}
