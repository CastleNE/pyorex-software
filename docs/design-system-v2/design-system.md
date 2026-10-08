# Sistema de Diseño — PyOrex

> Patrones UI/UX aprobados para el equipo de desarrollo.
> Actualizar solo cuando desktop-engineer y chief-architect aprueben un nuevo patrón.
> Decisión vigente: **ADR-0007** (sistema de diseño PyOrex v2: tokens, temas, IBM Plex).
> Referencia visual completa (tokens, componentes, módulo Spectrometry): artefacto "PyOrex" de Claude (sistema de diseño), privado del usuario.

## Estado Actual (oct 2026)

- **Tokens** en `apps/desktop/src/styles/globals.css` (`@theme` de Tailwind 4).
- **Temas**: oscuro por defecto; claro opcional con el botón sol/luna de la cabecera (`stores/theme-store.ts`, persistido en `localStorage` como `pyorex-theme`, aplicado en `<html data-theme="light">` antes del primer render).
- **Tipografía**: IBM Plex Sans (UI) + IBM Plex Mono (números, tablas), empaquetadas en `src/assets/fonts` (offline, licencia OFL).
- **Módulo Espectrometría** migrado completo al sistema (landing, catálogo, cinta, ventanas, log espectral).
- **Módulo Geoquímica** migrado (5 oct 2026): barra de grupos, Editor por secciones, símbolo por categoría, leyenda con histograma, DATA ANALYSIS en tokens.
- **Resto** (Petrofísica, pantallas antiguas Hub/View/File, ImportWizard): heredan el look vía *alias transicionales*; migrar al tocarlos.

## Tokens — usar SIEMPRE los semánticos en código nuevo

| Rol | Clase Tailwind | Uso |
|-----|----------------|-----|
| Lienzo | `bg-app` (+ `.px-canvas` para la retícula de puntos) | Fondo de pantalla y del área de ventanas |
| Panel | `bg-panel` | Docks, cinta, cuerpo de ventanas, tarjetas |
| Elevado | `bg-raised` | Barras de título, campos, botones secundarios |
| Hundido | `bg-sunken` | Pistas de controles segmentados, consola |
| Hover / selección | `bg-hover` / `bg-selected` | Filas y botones |
| Bordes | `border-line` / `border-line-strong` | 1 px entre zonas / controles interactivos |
| Texto | `text-fg` / `text-muted` / `text-subtle` | Principal / etiquetas y unidades / pistas |
| Cabecera | `bg-header`, `text-header-fg`, `text-header-muted` | Barra superior de módulos |
| Marca | `text-brand` (azul pizarra del logo, solo tema claro; en oscuro usar `dark:text-muted`) | Íconos |
| Acento | `bg-accent` (indicadores), `bg-accent-strong` + `text-on-accent` (botón primario), `text-accent-fg` (texto/enlaces), `bg-accent-soft` (chips) | Teal de la marca |
| Estado | `text-success`, `text-warning`, `text-danger`, `text-info` | Siempre acompañado de texto |
| Sombras | `shadow-window` / `shadow-window-active` | Ventana en reposo / ventana al frente |

**Datos** (nunca colores de interfaz para datos):
- `cat-1…cat-8` — Okabe–Ito, seguro para daltonismo, siempre con forma de símbolo distinta.
- `min-illite`, `min-muscovite`, `min-kaolinite`, `min-montmorillonite`, `min-pyrophyllite`, `min-alunite`, `min-chlorite`, `min-epidote`, `min-carbonate`, `min-gypsum`, `min-none` — minerales de alteración; en TS: `lib/mineral-colors.ts` (`mineralColor(label)`, reconoce nombres TSG/EZ-ID y en español).

**Regla de contraste**: `teal #21baa0` no lleva texto blanco (2.4:1); para botones usar `bg-accent-strong` (#0f7a68, 5.2:1).

### Alias transicionales (deuda controlada)

Las escalas `zinc`, `blue`, `sky`, `red`, `amber`, `emerald` de Tailwind están **remapeadas** a la paleta PyOrex y siguen el tema (zinc → neutros, blue/sky → acento teal, red/amber/emerald → estados). Gracias a eso las ~1 500 clases existentes ya se ven con el nuevo sistema y funcionan en tema claro.
- ❌ No añadir nuevas clases `zinc-*`, `blue-*`, `sky-*`… en código nuevo.
- ✅ Al tocar una pantalla, migrar sus clases a tokens semánticos.
- Cuando no queden usos, borrar los alias del `@theme`.

## Gráficos (Plotly)

- Importar `Plot` desde `@/components/ThemedPlot`, **nunca** desde `react-plotly.js`. ThemedPlot resuelve fondo, rejilla, fuente y leyenda desde los tokens y reescribe la paleta oscura antigua (`#18181b`, `#3f3f46`, `#d4d4d8`…) que aún usan builders como `build-geo-chart.ts`.
- `useChartTheme()` da los colores resueltos para shapes/anotaciones propias.
- Espectros: `spliceShapes()` sombrea los empalmes de detector (~1000 y ~1830 nm).
- Series: `SERIES` (líneas) y `CATEGORICAL` de `lib/mineral-colors.ts`.

## Iconografía

`components/PxIcon.tsx` — íconos de línea 1.5 px en retícula de 20 px, una tinta (`currentColor`), mismos que el sistema de diseño. Las ventanas flotantes aceptan `icon: "spectrum"` (nombre PxIcon); los emoji siguen funcionando pero no se usan en código nuevo.

## Ventanas flotantes (window-manager)

- La ventana al frente lleva `shadow-window-active` y una línea superior de 2 px en `accent`.
- Lienzo con retícula de puntos (`.px-canvas`).
- Fix oct 2026: react-rnd inyectaba `display:inline-block` y anulaba `flex flex-col`; el cuerpo no llenaba la ventana y los gráficos Plotly quedaban en 0 px o desbordaban. Ahora `FloatingWindow` fuerza `display:flex` inline.

## Geoquímica

- Barra de grupos (DATA ANALYSIS · DIAGRAMS · Litogeoquímica · Exploración) como pestañas con ícono + descripción corta; dataset activo e importación a la derecha.
- Editor: secciones plegables con rótulo `overline`; cada entrada muestra un punto `accent` cuando está mapeada y su unidad al lado. «Calcular» es el único botón primario.
- Símbolo por defecto «Uno por categoría» (`AUTO_SYMBOL`): color + forma por categoría.
- Leyenda de color por valor: histograma coloreado por las 5 clases + n por clase (`lib/color-legend.ts`).
- Resultados: chips de calidad, conmutador Gráfico/Tabla, estados de fila como píldoras (`success`/`warning`).

## Espectrometría — patrón de módulo de referencia

- Sin proyecto: landing con dos acciones primarias y recientes.
- Con proyecto: **cinta fija** (`banner` de WorkspaceArea) con todas las herramientas activas agrupadas por categoría + chip del proyecto; el catálogo queda como estado vacío del lienzo.
- Log espectral = columna de mineral (un trace por mineral → la leyenda es la clave de colores).

## Principios de UX (PyOrex-specific)

1. **Datos primero** — la UI muestra datos con mínima fricción visual
2. **Contexto científico siempre visible** — unidades, n muestras, % nulos, advertencias estadísticas
3. **Advertencias no bloqueantes** — alertar sin interrumpir el workflow (excepción: KMO < 0.5)
4. **Reproducibilidad visible** — mostrar el pipeline aplicado a los datos en el header
5. **Outliers son del usuario** — el sistema reporta, el usuario decide — nunca eliminar automáticamente

## Stack de UI

| Herramienta | Uso | Notas |
|------------|-----|-------|
| TailwindCSS 4.x | Todos los estilos | Tokens semánticos de `globals.css`; NO CSS arbitrario ni inline styles (excepción documentada: `display:flex` de FloatingWindow) |
| Plotly.js | Gráficos interactivos | vía `@/components/ThemedPlot` |
| D3.js | Diagramas especializados | Piper, Stiff, ternario, dendrograma |
| Zustand stores | Estado global | NO useState para estado compartido |

## Layout Principal

```
AppShell
├── NavigationSidebar    [paneles registrados por plugins]
├── TabBar               [proyectos abiertos — max 5 tabs visibles]
├── MainContent
│   ├── DataQualityBanner    [⚠ alertas de calidad del dataset — siempre visible]
│   ├── PanelContent         [renderizado por el plugin activo]
│   └── StatusBar            [estado del análisis en progreso]
└── NotificationToast    [alerts del sistema — esquina inferior derecha]
```

## Componentes de Calidad de Datos (obligatorios en UI de análisis)

**DataQualityBadge** — mostrar en el header de cada análisis:
```
Variables: 10 | Muestras: 850 | Nulos: 3.2% | Normalidad: ⚠️ | KMO: 0.82
```

**PreAnalysisReport** — panel que aparece ANTES de ejecutar cualquier análisis multivariante:
```
┌─ Reporte de Calidad del Dataset ─────────────────────────────┐
│  Variable   | Nulos  | Tipo nulos   | Distribución | Recom.  │
│  C1         | 0%     | —            | Log-normal   | Log     │
│  C2         | 2.3%   | BELOW_LOD    | Log-normal   | Log     │
│  H2S        | 45%    | NOT_ANALYZED | —            | ⚠ Alto  │
└──────────────────────────────────────────────────────────────┘
[Continuar →]  [Ajustar variables]
```

**AnalysisConfigPanel** — patrón estándar para configurar análisis:
```
Variables ───────── [selector múltiple con búsqueda]
Pipeline ───────── [dropdown: (ninguno) | pipeline guardado | nuevo]
Parámetros ─────── [específicos del algoritmo — colapsables]
                   [Ejecutar Análisis] ← deshabilitado si faltan variables
```

**QualityMetricsHeader** — en todos los resultados:
```
KMO: 0.82  |  Bartlett p: <0.001  |  Varianza: 87%  |  ⚠ VIF > 10 en C1, C2
```

## Convenciones de Código UI

```typescript
// ✅ Correcto — componente puro, estado en Zustand
const AnalysisPanel: React.FC<{ datasetId: string }> = ({ datasetId }) => {
  const { runAnalysis, results, isLoading } = useAnalysisStore(datasetId)
  return (
    <div className="flex flex-col gap-4 p-4 bg-background">
      {isLoading && <ProgressBar />}
      {results && <QualityMetricsHeader metrics={results.quality} />}
      {results && <ResultsGrid data={results.data} />}
      <Button onClick={runAnalysis} disabled={isLoading} variant="primary">
        Ejecutar Análisis
      </Button>
    </div>
  )
}

// ❌ Incorrecto — lógica de negocio en el componente
const BadPanel: React.FC = () => {
  const [data, setData] = useState([])
  const filtered = data.filter(d => d.kmo > 0.5)  // NO: lógica de negocio
  const normalized = filtered.map(d => d.value / max)  // NO: transformación de datos
  ...
}
```

## Historial

- Jun 2026: referencia inicial ioGAS + captura dark-theme (zinc, acento azul, split view). Sustituida por ADR-0007.
