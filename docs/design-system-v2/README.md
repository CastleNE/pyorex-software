# Sistema de diseño v2 — archivos para `.claude/memory`

Claude no puede escribir dentro de `.claude/` desde la sesión remota, así que estos archivos quedan aquí para copiarlos a mano:

| Archivo | Copiar a |
|---|---|
| `ADR-0007-sistema-diseno-v2.md` | `.claude/memory/adrs/ADR-0007-sistema-diseno-v2.md` |
| `design-system.md` | `.claude/memory/design-system.md` (reemplaza; conserva los principios y componentes de calidad de datos) |

Y añadir esta línea en `.claude/memory/project-state.md`, debajo de la entrada del 21 sep 2026:

> 5 oct 2026: sistema de diseño v2 (ADR-0007): tokens + tema claro/oscuro (oscuro por defecto, botón en cabecera), IBM Plex local, PxIcon, ThemedPlot en todos los gráficos; Espectrometría migrada completa (landing, catálogo, cinta fija, log espectral como columna de mineral, empalmes sombreados en el visor). Fix: FloatingWindow ahora llena la ventana (react-rnd forzaba inline-block). Validado typecheck, vitest y vite:build en entorno web con RPC simulado; SIN verificar en ventana Tauri ni con el servicio Python real.
>
> 5 oct 2026 (2): Geoquímica migrada al sistema v2 — barra de grupos con íconos, Editor por secciones, símbolo «Uno por categoría» por defecto, leyenda de color con histograma (`lib/color-legend.ts`), resultados con chips de calidad; DATA ANALYSIS y sus ventanas en tokens semánticos. Ver sección en `docs/GEOCHEMISTRY_HANDOFF.md`. Sin verificar con Python real ni en Tauri.

Después de copiarlos, esta carpeta se puede borrar.
