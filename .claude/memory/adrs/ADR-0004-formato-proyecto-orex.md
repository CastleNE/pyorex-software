---
adr: "0004"
title: Formato de proyecto nativo — extensión .orex
status: Aceptado
date: 2026-06-03
deciders: [orchestrator, chief-architect, product-manager]
---

# ADR-0004: Formato de proyecto nativo — extensión `.orex`

## Contexto

PyOreX necesita un formato de archivo de proyecto que permita guardar y reabrir
un workspace completo: datasets importados, visualizaciones configuradas, y estado
de la sesión. El modelo de referencia es PowerBI (`.pbix`) y sus ventajas:
apertura instantánea de un workspace completo sin re-importar datos.

## Decisión

El archivo de proyecto nativo de PyOreX tendrá extensión **`.orex`**.

### Estructura interna (ZIP)

```
mi-proyecto.orex/           ← ZIP archive
├── manifest.json           ← versión, nombre, created_at, pyorex_version
├── workspace.json          ← estado UI (dataset activo, columnas seleccionadas, viz activa)
├── datasets/
│   ├── {dataset_id}.parquet   ← datos embebidos (ya usamos Parquet internamente)
│   └── {dataset_id}.meta.json ← metadata: CRS, col types, imported_at, null-mapping
└── visualizations/
    ├── {viz_id}.json          ← config de cada gráfico guardado (tipo, ejes, colores, filtros)
    └── thumbnails/
        └── {viz_id}.png       ← preview para la pantalla File → Recent Projects
```

### Analogía con PowerBI

| PowerBI `.pbix`        | PyOreX `.orex`              |
|------------------------|------------------------------|
| Data model (columnar)  | `datasets/*.parquet`         |
| Report pages           | `visualizations/*.json`      |
| Report settings        | `workspace.json`             |
| Version metadata       | `manifest.json`              |

### Flujo UX (pantalla File)

- **New Project** → crea proyecto vacío en memoria, pide nombre/ubicación al guardar
- **Open Project** → dialog filtrado a `*.orex` → carga datasets + vizs → navega a Data
- **Import Data** → dialog CSV/Excel → ImportWizard → añade dataset al proyecto actual
- **Save / Save As** → serializa el estado actual como `.orex`
- Proyectos recientes → muestra `.orex` files con thumbnail del último gráfico

## Consecuencias

**Positivas:**
- Experiencia "abrir y trabajar" sin re-importar datos — igual que PowerBI
- Parquet ya es nuestro formato de almacenamiento interno → trivial embeber
- ZIP es estándar → proyectos son inspeccionables y versionables con git-lfs
- Thumbnails en el archivo → previews ricos en la pantalla de recientes

**Negativas / Trade-offs:**
- Proyectos grandes (muchos datos) → archivos .orex grandes
- Mitigación: en Fase 4 añadir compresión zstd + opción "guardar referencia externa"

## Implementación por fases

| Fase | Alcance |
|------|---------|
| A (actual) | UX en FileScreen distingue Open Project vs Import Data; dialogs con filtros correctos |
| 2 | `Save Project` / `Open Project` funcional — Rust/Tauri escribe/lee ZIP |
| 3 | Visualizaciones guardadas embebidas en `.orex` |
| 4 | Thumbnails, compresión zstd, proyectos de referencia externa |
