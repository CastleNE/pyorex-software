# Estado del Proyecto — PyOrex

> Última actualización: 2026-06-04
> Actualizar este archivo cuando cambie el estado significativo del proyecto.

## Fase Actual

**FASE 1: DATA IMPORT** — En progreso

### Completado en Fase 0
- [x] CLAUDE.md — constitución del proyecto
- [x] Equipo de 8 agentes con sistema de memoria
- [x] Sistema de ADRs (ADR-0001 stack, ADR-0002 scope)
- [x] Dominio geoquímico documentado (incluye análisis de ioGAS v7.3)
- [x] 5 skills configurados
- [x] Monorepo scaffold: pnpm workspaces + package.json + .gitignore
- [x] App Tauri scaffold: vite.config.ts + tsconfig + index.html
- [x] App shell: dark-theme layout (Nav + Action bar + Split view) — coincide con mockup
- [x] Zustand stores: app-store.ts + dataset-store.ts
- [x] Tauri Rust: Cargo.toml + lib.rs + analytics_bridge.rs (IPC bridge)
- [x] Python service scaffold: FastAPI + JSON-RPC dispatcher (rpc.py) + health endpoint
- [x] Packages: @pyorex/ipc-contracts + @pyorex/shared-types (Plugin, Dataset, Analysis, IPC types)
- [x] scripts/setup.ps1 — instalador automático de todas las dependencias

### Completado en Fase 0 (continuación)
- [x] IPC bridge verificado: health.ping → Python responde `{"pong": true}` ✅
- [x] Tauri app compilada y corriendo: `pyorex.exe` activo ✅
- [x] Herramientas instaladas: Node.js v24, pnpm v11.5, Rust, Python 3.12

### Completado en Fase 1 (2026-06-02)
- [x] `analysis/__init__.py` — paquete Python registrado
- [x] `analysis/data/importer.py` — importador CSV/Excel con null-mapping (RF-02, RF-04-CUA)
- [x] `analysis/data/storage.py` — persistencia Parquet + metadata JSON + get_rows()
- [x] `app/routers/data_routes.py` — endpoints REST /data/preview, /data/import, /data/list
- [x] `app/routers/rpc.py` — métodos RPC: data.preview, data.import, data.list, data.rows
- [x] `app/main.py` — router /data registrado
- [x] `src/lib/rpc.ts` — cliente TypeScript IPC (callRpc wrapper)
- [x] `src/lib/data-api.ts` — helpers tipados: previewFile, importFile, listDatasets, getRows
- [x] `src/components/ImportWizard.tsx` — wizard 3 pasos (preview + sample-type + null-mapping)
- [x] `src/components/DataTable.tsx` — tabla con infinite scroll + column selector
- [x] `src/stores/dataset-store.ts` — actualizado con setLoading/setError
- [x] `src/App.tsx` — "Open Data" → dialog → wizard → DataTable funcional
- [x] `@tauri-apps/plugin-dialog` instalado
- [x] TypeScript typecheck: 0 errores

**HITO ALCANZADO (Fase 1a)**: Primer flujo E2E completo — Open CSV → ImportWizard → DataTable con infinite scroll.

### Completado en Fase 1 — Spatial + KML (2026-06-02)
- [x] `analysis/data/importer.py` — `detect_spatial_columns()` + catálogo 140+ CRS (WGS84, AMG84/GDA94, UTM, PSAD56, GDA2020); detección automática de columnas ioGAS `[X]`; `SpatialRef` dataclass en `ImportConfig`
- [x] `analysis/spatial/__init__.py` + `analysis/spatial/kml_export.py` — exportador KML 2.2 con Placemarks por muestra, color por cuantiles (5 clases), reproyección automática con `pyproj`
- [x] `app/routers/rpc.py` — método `data.export_kml`; `data.import` persiste `spatial_ref` + `iogas_display_cols` en metadata
- [x] `src/lib/data-api.ts` — tipos `SpatialRef`, `SpatialDetection`, `CoordPairDetection`; `exportKml()` helper
- [x] `src/stores/dataset-store.ts` — `DatasetInfo` incluye `spatialRef` e `iogasDisplayCols`
- [x] `src/components/ImportWizard.tsx` — Paso 2 "Spatial Reference" (auto-detectado, skip opcional); columnas ioGAS marcadas en la tabla
- [x] `src/App.tsx` — botón "Export KML" habilitado cuando dataset tiene `spatialRef`
- [x] `pyproj` instalado y verificado (reproyección AMG84 z51 → WGS84, precisión centimétrica)
- [x] TypeScript typecheck: 0 errores

**HITO ALCANZADO (Fase 1b)**: Georeferenciación completa — Import con CRS → Export KML para Google Earth.

### Completado en Fase 1 — Export History (2026-06-02)
- [x] `kml_export.py` — parámetro `output_dir`; nombre de archivo incluye dataset name; guarda en carpeta del usuario (Descargas)
- [x] `src/stores/export-store.ts` — Zustand store con `persist` a localStorage; historial de hasta 100 entradas, sobrevive reinicios
- [x] `src/components/ExportHistory.tsx` — panel dropdown: icono por tipo (KML/CSV/PDF/PNG), antigüedad relativa, botón abrir carpeta con `plugin-shell`, botón eliminar entrada
- [x] `src/App.tsx` — `downloadDir()` de Tauri para guardar en Descargas; botón "📥 Downloads (N)" con badge; panel se abre automáticamente tras cada export
- [x] TypeScript typecheck: 0 errores

**HITO ALCANZADO (Fase 1c)**: Sistema de exportación con historial persistente — KML → Descargas → historial con "abrir carpeta".

### Completado en sesión 2026-06-04 — Seguridad, ECC patterns, sistema de memoria mejorado
- [x] **Agente `security-engineer`** creado — cubre 8 superficies de ataque de PyOrex (file import, IPC, plugins, multi-tenant, asteval, SQLite, Tauri capabilities, deps)
- [x] `CLAUDE.md` actualizado — equipo ahora es de 9 agentes
- [x] `.claude/settings.json` creado — hooks `PreCompact` (inyecta project-state en compactación) + `Stop` (recordatorio actualizar memoria)
- [x] `.claude/contexts/` creado con: `analytics-mode.md`, `qaqc-mode.md`, `security-mode.md`, `README.md`
- [x] Bug corregido en `DatasetPanel.tsx` — `<button>` dentro de `<button>` → exterior cambiado a `<div role="button">` (hydration error resuelto)
- [x] Revisado repo `affaan-m/ecc` — patrones integrados en `lessons-learned.md` + `repo-ecc.md` en auto-memoria
- [x] Auto-memoria actualizada: 4 entradas en `MEMORY.md` (project-iogas, lessons-tauri-windows, repo-scientific-skills, repo-ecc)
- [x] **Tip PowerShell**: usar `;` en lugar de `&&` para encadenar comandos (5.1 no soporta `&&`)

### Completado en sesión 2026-06-03 — Mejoras de memoria y dependencias
- [x] `pyproject.toml` — agregados `pingouin>=0.5.4`, `matplotlib>=3.8.0`, `seaborn>=0.13.0` (estaban instalados pero no declarados)
- [x] `data-scientist.md` — pingouin patterns, Okabe-Ito palette, EDA checklist, effect size thresholds
- [x] `python-engineer.md` — Polars lazy patterns, seaborn/matplotlib PDF report standards, pingouin + geopandas en stack
- [x] Auto-memoria actualizada: `project-iogas.md` (actualizado a Fase 1), `repo-scientific-skills.md` (nuevo)
- [x] Fuente: https://github.com/k-dense-ai/scientific-agent-skills (142 skills científicos MIT — revisado y extractos integrados)

### Pendiente en Fase 0
- [ ] Plugin Core: registry, lifecycle, event bus básico (packages/plugin-sdk)
- [ ] Pipeline CI/CD base (GitHub Actions)

### Fase 1 (próxima)
- [ ] Plugin Data Manager: importación CSV/Excel con wizard (incluye paso de tipo de muestra QAQC)
- [ ] **Plugin QAQC** (core-qaqc): blancos, duplicados (%RPD), CRM (%Recovery), cartas Shewhart — ver RF-10 y ADR-0003
- [ ] Plugin Analytics: descriptiva, correlación, PCA, K-means
- [ ] Plugin Visualization: scatter, heatmap, biplot PCA
- [ ] Plugin Reports: reporte PDF básico (incluye sección QAQC)
- [ ] Autenticación local + roles básicos
- [ ] Multi-tenancy: aislamiento de datos entre tenants

## Decisiones Arquitectónicas Registradas

| ADR | Decisión | Estado |
|-----|----------|--------|
| ADR-0001 | Stack tecnológico principal (Tauri+React+FastAPI) | Aceptado |
| ADR-0004 | Formato de proyecto nativo `.orex` (ZIP: Parquet + JSON + viz configs) | Aceptado |

## Prioridades Actuales

1. **Plugin Analytics** — estadísticas descriptivas + PCA (completa el flujo E2E principal: import → analyze → biplot)
2. **Plugin Visualization** — scatter + biplot PCA en el panel derecho
3. **Plugin QAQC** (ADR-0003) — blancos, %RPD, %Recovery, cartas Shewhart

## Decisiones Técnicas Tomadas

- [x] Librería de gráficos: **Plotly.js** (tipos TS maduros, gráficos geoquímicos disponibles)
- [x] Formato de proyecto nativo: **`.orex`** — ZIP con Parquet + JSON manifest + viz configs (como `.pbix` de PowerBI)
- [ ] Formato de empaquetado de plugins: `.zip` vs `.pyorex-plugin` personalizado (Fase 4)
- [ ] Motor PDF: Chromium headless (Tauri) vs wkhtmltopdf (Fase 1)

## Bloqueos / Riesgos Activos

Ninguno identificado actualmente.

## Recursos Visuales Disponibles

Capturas del software de referencia ioGAS v7.3 (IMDEX) en `.claude/resources/ui-mockups/`:
- `Home/File/Data/Analysis/calculations/Graph/Diagram/Structure/map/spider/help.png` — ribbon UI de ioGAS
- `Captura de pantalla 2026-06-01 150132.png` — **versión dark-theme modernizada — referencia de diseño UI**

El layout objetivo: split view (tabla datos izquierda + visualización derecha) con dark theme.
Ver `.claude/memory/design-system.md` para el ASCII mockup del layout extraído.

## Gap Crítico Identificado (2026-06-01)

**ioGAS tiene features que el spec actual NO cubre:**
- Spider/REE diagrams (Chondrite, MORB, Mantle, OIB...) — crítico para geoquímica de exploración
- Rock Classification diagrams (TAS, QAPF, IUGS...) — clasificación petrográfica
- Structural Analysis (Stereonet, Rose Plot) — datos estructurales
- Índices de alteración hidrotermal (CAI, CCPI, AI, etc.) — exploración minera
- Centred Log Ratio (CLR) transform — para datos composicionales (% suma 100)

**Decisión pendiente** → `product-manager` + `chief-architect` deben aclarar:
¿El MVP cubre solo O&G (como dice el spec) o también geoquímica de exploración/minería?

## Contexto Importante para Agentes

- El proyecto está en estado **inicial** — no hay código de producción aún
- Especificación completa: `PYOREX_SPECS_v2.md` en la raíz del proyecto
- Software de referencia/competencia: **ioGAS v7.3 de IMDEX** — ver capturas en resources
- Multi-tenancy es un requerimiento duro desde el inicio
- Offline-first es no negociable (clientes en campo sin internet)
- El motor estadístico Python DEBE cumplir los requerimientos RF-04* estrictamente
- Los análisis deben ser completamente reproducibles (metadatos + pipeline serializado)
- Los outliers en datos geoquímicos NO se eliminan automáticamente — siempre reportar al usuario
- La UI target tiene dark theme, split view — ver mockup en design-system.md

## Repositorio GitHub

- URL: https://github.com/ctarazonas/pyorex-desktop
- Visibilidad: Privado
- Rama default: `main`
- Commit inicial: `e665cce` — 88 archivos, Fase 0 completa

## Métricas del Proyecto

- Agentes configurados: 9 (se agregó security-engineer el 2026-06-04)
- Skills configurados: 5
- ADRs: 3
- Features implementadas: Fase 1a (import E2E) + 1b (spatial/KML) + 1c (export history)
- Tests existentes: 0 (deuda técnica — próximo sprint)
- TypeScript typecheck: 0 errores (mantenido)
- Python: pyproj instalado y verificado

