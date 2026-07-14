---
adr: "0005"
title: Separar pantallas Data / Módulos / View + registro extensible de grupos de módulos
status: Aceptado
date: 2026-07-14
deciders: [orchestrator, chief-architect, desktop-engineer]
---

# ADR-0005: Separar pantallas Data / Módulos / View + registro extensible de grupos de módulos

## Contexto

`App.tsx` definía cuatro tabs de navegación (`file | data | modulos | view`) pero solo
"file" tenía pantalla propia. Las otras tres renderizaban exactamente el mismo split-view
(barra de acciones + `DatasetPanel` + tabs Scatter/Table/Spider/Map). Esto no calzaba con
el UX planificado (`UX_PyOrex_06.26.pptx`, auditado en sesión previa — ver
`.claude/memory/design-system.md` y el hallazgo de la auditoría visual):

- **Data** debía ser una pantalla de carga (Load Files / Cloud repository / Online server
  + preview), no el workspace de visualización.
- **Módulos** debía mostrar un árbol de datasets + una lista de módulos agrupados por
  categoría, no el mismo split-view que Data.

Adicionalmente, el dueño del producto confirmó que el alcance crece más allá de
geoquímica: módulos **Espectrometría** (import estilo TSG — The Spectral Geologist) y
**Petrofísica** (susceptibilidad/conductividad estilo KT-10) — ver
`.claude/memory/domain/` y auto-memoria de la sesión. Wireframes adicionales compartidos
por el usuario confirmaron que estos dos módulos son **hermanos** de Geochemistry en el
sidebar de Módulos, cada uno con su propia lista de herramientas (incluyendo una
"Visualization" propia) — no sub-items de Geochemistry.

## Decisión

1. **Cuatro pantallas físicamente distintas**, una por tab de nav:
   - `FileScreen.tsx` — sin cambios.
   - `DataScreen.tsx` (nuevo) — 3 fuentes de carga (Load Files habilitado; Cloud
     repository / Online server deshabilitados, `title="Próximamente"`) + preview
     (`DataTable`).
   - `ModulosScreen.tsx` (nuevo) — árbol de datasets (reutiliza `DatasetPanel`) + lista
     de grupos de módulos + workspace de la herramienta activa.
   - `ViewScreen.tsx` (nuevo, extracción 1:1) — el split-view que existía antes se mueve
     aquí sin cambios de comportamiento: es semánticamente "ver y trabajar el dataset
     activo" (scatter/table/spider/map, export KML, export history, action bar completa).
2. **Registro estático de grupos de módulos** — `apps/desktop/src/lib/modules-registry.ts`:
   un array `ModuleGroup[]` con `{id, label, tools: ModuleTool[]}`, cada tool con
   `status: "active" | "planned"`. Grupos actuales: `geochemistry` (4 tools),
   `espectrometria` (2 tools: import + visualization), `petrofisica` (2 tools: import +
   "Down-hole Log"). Todo excepto `geochemistry.visualization` está `planned` — sin
   funcionalidad real aún, solo el slot de navegación reservado.
3. **`VizWorkspace.tsx`** (nuevo, extraído de la lógica de tabs Scatter/Table/Spider/Map)
   se comparte entre `ViewScreen` y el tool `visualization` de `ModulosScreen`, para no
   duplicar esa UI en dos lugares.
4. **`App.tsx`** se reduce a un router delgado: handlers (`handleOpenData`,
   `handleImported`, `handleExportKml`) y stores se quedan ahí; el JSX de presentación
   vive en los 4 componentes de pantalla.

### Por qué un registro estático y no el Plugin Core real

El Plugin Core (registry/lifecycle/event bus, `PluginManifest` en
`packages/shared-types/src/plugin.ts`) sigue pendiente de Fase 0 — construirlo ahora
habría expandido este cambio de "arreglar navegación" a "construir el sistema de
plugins", fuera del alcance pedido. `modules-registry.ts` es el seam de migración
explícito: cuando el Plugin Core exista, este array se reemplaza por grupos derivados de
`PluginManifest[]` sin tocar `ModulosScreen.tsx`.

## Consecuencias

**Positivas:**
- Cada pantalla ahora corresponde 1:1 con su wireframe — próximas features (PCA,
  Litogeochemistry, import TSG/KT-10) tienen dónde vivir sin reabrir la discusión de nav.
- Cero regresión: `DataTable`, `ScatterPlot`, `DatasetPanel`, `ImportWizard`,
  `ExportHistory`, stores y backend Python quedan intactos — typecheck en 0 errores
  antes y después.
- Agregar un módulo nuevo (grupo o tool) es un cambio de datos en
  `modules-registry.ts`, no de componentes.

**Negativas / Trade-offs:**
- El registro estático no aplica `capabilities` ni aislamiento — cualquier tool
  `"active"` puede montar cualquier componente. Aceptable mientras no haya plugins de
  terceros; revisar este ADR cuando el Plugin Core entre en construcción.
- Los formatos de import de TSG y KT-10 siguen sin investigar — `DataScreen.tsx` y el
  importador Python solo soportan CSV/Excel hoy. Bloqueante para implementar los tools
  `tsg-import` / `kt10-import` de verdad.

## Pendientes abiertos

- [ ] `product-manager` define las herramientas restantes de Espectrometría (hoy solo
  tiene import + visualization genérica).
- [ ] `python-engineer` investiga formatos de archivo TSG y KT-10 antes de extender
  `services/analytics/analysis/data/importer.py`.
- [ ] Migrar `modules-registry.ts` a `PluginManifest[]` cuando el Plugin Core (Fase 0)
  se construya.
