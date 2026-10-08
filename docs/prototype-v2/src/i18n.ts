import { useApp, type Lang } from './store';

export type Txt = { es: string; en: string };
const ES = {
  file: 'Archivo', geo: 'Geoquímica', spec: 'Espectrometría', petro: 'Petrofísica',
  search: 'Buscar herramienta o muestra', saved: 'guardado', unsaved: 'cambios sin guardar',
  'area.data': 'Datos y análisis', 'area.litho': 'Litogeoquímica', 'area.explo': 'Exploración mineral', 'area.maps': 'Secciones y mapas',
  'ctx.style': 'Estilo', 'ctx.diagram': 'Diagrama', 'ctx.map': 'Mapa',
  'rail.project': 'Proyecto', 'rail.style': 'Estilo', 'rail.layers': 'Capas', 'rail.history': 'Historial', 'rail.inspector': 'Inspector',
  pin: 'Fijar panel', unpin: 'Soltar panel', close: 'Cerrar',
  engine: 'Motor Python listo', visible: 'muestras visibles', selectedN: 'seleccionadas', views: 'vistas',
  createClass: 'Crear clase', isolate: 'Aislar', showAll: 'Mostrar todo', invert: 'Invertir', clear: 'Limpiar selección',
  'bs.open': 'Abrir proyecto', 'bs.new': 'Nuevo proyecto', 'bs.save': 'Guardar', 'bs.saveAs': 'Guardar como', 'bs.import': 'Importar datos',
  'bs.export': 'Exportar', 'bs.options': 'Opciones', 'bs.help': 'Ayuda', 'bs.about': 'Acerca de', 'bs.exit': 'Salir', back: 'Volver',
  recent: 'Proyectos recientes', browse: 'Examinar…', searchRecent: 'Buscar en recientes',
  available: 'Disponible', partial: 'Parcial', unavailable: 'No disponible', missing: 'Falta',
  reference: 'Referencia', whatItMeasures: 'Qué mide', references: 'Referencias', interpretation: 'Interpretación', cases: 'Casos', caveats: 'Advertencias', openRef: 'Buscar la referencia', draft: 'Contenido de ejemplo · revisar contra la fuente',
  emptyTitle: 'Empieza por una vista', emptySub: 'Todas las vistas comparten selección y simbología.', restore: 'Restaurar espacio de trabajo',
  history: 'Historial', exportScript: 'Exportar como script', steps: 'Pasos reproducibles',
  language: 'Idioma', theme: 'Tema', light: 'Claro', dark: 'Oscuro', projectCrs: 'Sistema de coordenadas del proyecto', autosave: 'Autoguardado',
};
const EN: typeof ES = {
  file: 'File', geo: 'Geochemistry', spec: 'Spectrometry', petro: 'Petrophysics',
  search: 'Search tool or sample', saved: 'saved', unsaved: 'unsaved changes',
  'area.data': 'Data & Analysis', 'area.litho': 'Lithogeochemistry', 'area.explo': 'Mineral Exploration', 'area.maps': 'Sections & Maps',
  'ctx.style': 'Style', 'ctx.diagram': 'Diagram', 'ctx.map': 'Map',
  'rail.project': 'Project', 'rail.style': 'Style', 'rail.layers': 'Layers', 'rail.history': 'History', 'rail.inspector': 'Inspector',
  pin: 'Pin panel', unpin: 'Unpin panel', close: 'Close',
  engine: 'Python engine ready', visible: 'samples visible', selectedN: 'selected', views: 'views',
  createClass: 'Create class', isolate: 'Isolate', showAll: 'Show all', invert: 'Invert', clear: 'Clear selection',
  'bs.open': 'Open project', 'bs.new': 'New project', 'bs.save': 'Save', 'bs.saveAs': 'Save As', 'bs.import': 'Import data',
  'bs.export': 'Export', 'bs.options': 'Settings', 'bs.help': 'Help', 'bs.about': 'About', 'bs.exit': 'Exit', back: 'Back',
  recent: 'Recent projects', browse: 'Browse…', searchRecent: 'Search recent',
  available: 'Available', partial: 'Partial', unavailable: 'Unavailable', missing: 'Missing',
  reference: 'Reference', whatItMeasures: 'What it measures', references: 'References', interpretation: 'Interpretation', cases: 'Case studies', caveats: 'Caveats', openRef: 'Look up the reference', draft: 'Sample content · check against the source',
  emptyTitle: 'Start with a view', emptySub: 'All views share selection and symbology.', restore: 'Restore workspace',
  history: 'History', exportScript: 'Export as script', steps: 'Reproducible steps',
  language: 'Language', theme: 'Theme', light: 'Light', dark: 'Dark', projectCrs: 'Project coordinate system', autosave: 'Autosave',
};
export type TKey = keyof typeof ES;
const DICT: Record<Lang, typeof ES> = { es: ES, en: EN };
export const tr = (lang: Lang, k: TKey) => DICT[lang][k] ?? k;
export function useT() { const lang = useApp(s => s.lang); return (k: TKey) => DICT[lang][k] ?? k; }
export function useL() { const lang = useApp(s => s.lang); return (x: Txt | string) => (typeof x === 'string' ? x : x[lang]); }
