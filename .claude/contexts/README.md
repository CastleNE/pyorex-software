# Contextos de Trabajo — PyOrex

Archivos de contexto específicos por modo. Cargar al inicio de una sesión
enfocada en un área particular, además de `/context-load`.

## Uso

```
# En la sesión de Claude Code, pedir al agente:
"Lee .claude/contexts/analytics-mode.md antes de empezar"
```

O en el prompt inicial del agente especializado:
```
cat .claude/contexts/analytics-mode.md
```

## Contextos disponibles

| Archivo | Cuándo usarlo |
|---------|--------------|
| `analytics-mode.md` | Plugin Analytics — estadísticas descriptivas, PCA, clustering |
| `qaqc-mode.md` | Plugin QAQC — blancos, duplicados, CRM, cartas Shewhart |

## Pendiente crear
- `visualization-mode.md` — Plotly.js, biplot PCA, scatter geoquímico
- `desktop-mode.md` — Tauri/React, componentes UI, Zustand, patrones del design system
- `reports-mode.md` — Plugin Reports, PDF generation, seaborn/matplotlib standards
