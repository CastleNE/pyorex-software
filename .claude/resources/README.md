# Recursos Visuales — PyOrex

Este directorio almacena imágenes, mockups y referencias visuales para guiar
el desarrollo. Los agentes de Claude leen imágenes directamente (Claude es multimodal).

## Estructura

```
.claude/resources/
├── README.md                ← Este archivo
├── ui-mockups/              ← Pantallas, wireframes y capturas de diseño
│   └── [screen-nombre].png
├── design-tokens/           ← Paleta de colores, tipografía, tokens de diseño
│   └── tokens.md
├── architecture/            ← Diagramas de arquitectura del sistema
│   └── [diagram-nombre].png
└── ux-patterns/             ← Flujos de usuario y patrones de navegación
    └── [flow-nombre].png
```

## Cómo los Agentes Usan los Recursos

Los agentes con acceso al tool `Read` pueden leer imágenes directamente:

```
# El agente desktop-engineer lee un mockup antes de implementar
Read(".claude/resources/ui-mockups/screen-pca-analysis.png")
→ Claude analiza la imagen y la usa como referencia exacta de implementación
```

**desktop-engineer**: antes de cualquier componente nuevo, revisa `ui-mockups/`.
**orchestrator**: cuando el usuario comparta imágenes en una sesión, guardarlas aquí.

## Cómo Añadir un Recurso

1. Guardar en el subdirectorio apropiado con nombre descriptivo
2. Agregar una fila en la tabla de inventario abajo
3. Si el recurso define un diseño aprobado, actualizar `project-state.md`

## Convenciones de Naming

| Prefijo | Uso |
|---------|-----|
| `screen-` | Captura o mockup de pantalla completa |
| `component-` | Detalle de un componente específico |
| `flow-` | Flujo de usuario entre pantallas |
| `diagram-` | Diagrama de arquitectura o sistema |
| `token-` | Referencias de tokens de diseño |

## Inventario

| Archivo | Tipo | Descripción | Estado |
|---------|------|-------------|--------|
| `Home.png` | Referencia | ioGAS v7.3 — pantalla Home vacía con ribbon UI | Referencia competencia |
| `File.png` | Referencia | ioGAS v7.3 — tab File: fuentes de datos (CSV, ODBC, PI, ALS, acQuire) | Referencia competencia |
| `data.png` | Referencia | ioGAS v7.3 — tab Data: gestión de columnas, missings, validación | Referencia competencia |
| `Analysis.png` | Referencia | ioGAS v7.3 — tab Analysis: Stats, Correlación, PCA, SOM, Clustering, t-SNE | Referencia competencia |
| `calculations.png` | Referencia | ioGAS v7.3 — tab Calculation: índices hidrotermales, mineralogía normativa, molar ratios, exploration indices | Referencia competencia |
| `Graph.png` | Referencia | ioGAS v7.3 — tab Graph: Scatter, Ternary, Biplot, Box & Whisker, Downhole, Histogram | Referencia competencia |
| `Diagram.png` | Referencia | ioGAS v7.3 — tab Diagram: Rock Classification IUGS, Major Elements, Trace Elements, Water Chemistry | Referencia competencia |
| `Structure.png` | Referencia | ioGAS v7.3 — tab Structure: Stereonet, Rose Plot, Alpha-Beta Conversion | Referencia competencia |
| `map.png` | Referencia | ioGAS v7.3 — tab Map: Variable Map, Attribute Map, Google Earth, MapInfo | Referencia competencia |
| `spider.png` | Referencia | ioGAS v7.3 — tab Spider: diagramas REE normalizados (Crust, Mantle, Chondrite, MORB/OIB) | Referencia competencia |
| `help.png` | Referencia | ioGAS v7.3 — tab Help: soporte, licencias, actualizaciones | Referencia competencia |
| `Captura de pantalla 2026-06-01 150132.png` | **UI Target** | **Versión modernizada dark-theme** — split view: data table izquierda + visualización derecha. Quick Stats en footer. Tab nav superior. Patrón de referencia para PyOrex | **Referencia de diseño** |

---

**Instrucción para el orchestrator**: cuando el usuario proporcione capturas de pantalla
o diseños en la conversación, pregúntale si quiere guardarlos como referencia permanente.
Si dice que sí, guarda una copia aquí con el nombre apropiado y actualiza esta tabla.

