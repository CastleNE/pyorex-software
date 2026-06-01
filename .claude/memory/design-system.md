# Sistema de Diseño — PyOrex

> Patrones UI/UX aprobados para el equipo de desarrollo.
> Actualizar solo cuando desktop-engineer y chief-architect aprueben un nuevo patrón.

## Estado Actual

**Estado**: Referencias visuales disponibles — analizar antes de implementar cualquier pantalla.

Dos referencias en `.claude/resources/ui-mockups/`:
1. **ioGAS v7.3 (IMDEX)** — software de competencia con ribbon UI clásico Windows. Valida el feature set completo pero el estilo es lo que PyOrex debe SUPERAR.
2. **`Captura de pantalla 2026-06-01 150132.png`** — versión dark-theme modernizada. **Patrón de referencia de UI para PyOrex.**

## Layout de Referencia (de la captura dark-theme)

```
┌─ Top Nav ────────────────────────────────────────────────────────────────┐
│  Home  Data  Calculation  Analysis  Graph  Map  Structure  Diagram  Spider│
├─ Action Bar ─────────────────────────────────────────────────────────────┤
│  [Open Data CSV]  [Save Dataset]  [Reset]  [Random Subsample]  [Add Data]│
│                                                    [Geochemical Suite ●] │
├─ Left Panel (35%) ─────────────┬─ Right Panel (65%) ────────────────────┤
│  Data Workspace                │  [Graph (Scatter)] [Spider/Radar] [Map] │
│  Samples × Elements            │                                         │
│  ┌──────────────────────────┐  │  X axis: [SiO2 ▼]  Y axis: [Cu ▼]     │
│  │ Sample │SiO2│TiO2│Al2O3 │  │  [Plot]                                 │
│  │  S-01  │48.2│ 1.2│ 16.5 │  │                                         │
│  │  S-02  │52.3│ 0.9│ 15.8 │  │  [scatter plot renderizado]             │
│  │  ...   │ …  │ …  │  …   │  │                                         │
│  └──────────────────────────┘  │                                         │
│                                │  ── Bivariate correlation ready ───── │
│  Quick Stats: [SiO2 ▼]        │                                         │
│  Mean: 55.28 | Min: 47.50     │                                         │
│  Max: 66.40 | StdDev: 6.32    │                                         │
└────────────────────────────────┴─────────────────────────────────────────┘
```

**Elementos clave del diseño:**
- Tema oscuro (`bg-zinc-900` o similar) con texto claro
- Split view obligatorio: tabla de datos izquierda + visualización derecha
- Quick Stats siempre visible en el footer del panel de datos
- Tab bar en el panel derecho para cambiar tipo de vista (Scatter / Spider / Map)
- Botón CTA principal en verde: "Geochemical Suite"
- Top navigation con icono + texto, sin ribbon style

## Principios de UX (PyOrex-specific)

1. **Datos primero** — la UI muestra datos con mínima fricción visual
2. **Contexto científico siempre visible** — unidades, n muestras, % nulos, advertencias estadísticas
3. **Advertencias no bloqueantes** — alertar sin interrumpir el workflow (excepción: KMO < 0.5)
4. **Reproducibilidad visible** — mostrar el pipeline aplicado a los datos en el header
5. **Outliers son del usuario** — el sistema reporta, el usuario decide — nunca eliminar automáticamente

## Stack de UI

| Herramienta | Uso | Notas |
|------------|-----|-------|
| TailwindCSS 4.x | Todos los estilos | NO usar CSS arbitrario ni inline styles |
| Plotly.js | Gráficos interactivos | scatter, PCA biplot, series de tiempo, histogramas |
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

## Paleta de Colores Semánticos (TailwindCSS — pendiente diseño visual final)

| Semántica | Clase Tailwind | Uso |
|-----------|---------------|-----|
| Primary | `bg-primary` | Acciones principales, CTAs |
| Success | `text-green-600` | Análisis completado, validaciones OK |
| Warning | `text-amber-600` | Alertas estadísticas, advertencias de calidad |
| Destructive | `text-red-600` | Bloqueos (KMO < 0.5), errores críticos |
| Muted | `text-muted-foreground` | Metadatos, valores nulos, información secundaria |

