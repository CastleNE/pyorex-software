# Estado del Proyecto — PyOrex

> Última actualización: 2026-07-14
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

### Completado en sesión 2026-07-14 — Separación Data/Módulos + scope Espectrometría/Petrofísica

- [x] **Auditoría visual del UX planificado**: `UX_PyOrex_06.26.pptx` (10 slides, sin abrir antes — exportadas a PNG vía PowerPoint COM automation) comparado pantalla por pantalla contra `apps/desktop/src`. Confirmó que "Data" y "Módulos" caían en la misma vista genérica en el código, y que el mockup ya asumía alcance de minería/exploración (Litogeochemistry, Mineral Exploration), no solo O&G — ver Gap Crítico de 2026-06-01, ahora resuelto.
- [x] **ADR-0005** — separación de `App.tsx` en 4 pantallas reales (`FileScreen`, `DataScreen`, `ModulosScreen`, `ViewScreen`) + `VizWorkspace.tsx` compartido + `ActionButton.tsx` compartido.
- [x] **`apps/desktop/src/lib/modules-registry.ts`** — registro estático de grupos de módulos (seam de migración a `PluginManifest[]` cuando el Plugin Core exista). Grupos: `geochemistry` (Data Analysis, Visualization, Litogeochemistry, Mineral Exploration), `espectrometria` (Import TSG data, Visualization), `petrofisica` (Import KT-10 data, Down-hole Log).
- [x] **Alcance de producto ampliado** (confirmado por el dueño del producto): PyOreX = **Py**thon + **Ore** + e**X**ploration. Además de geoquímica, el producto incluirá módulo **Espectrometría** (datos estilo TSG — The Spectral Geologist) y módulo **Petrofísica** (susceptibilidad/conductividad estilo KT-10). Ambos módulos son hermanos de Geochemistry en el sidebar de Módulos, confirmado por wireframes adicionales del usuario.
- [x] Decisión de diseño: visualizador de Petrofísica = **Down-hole Log** (profundidad en eje Y invertido, susceptibilidad/conductividad como pistas paralelas — estándar de log de wireline, no un scatter genérico).
- [x] TypeScript typecheck: 0 errores (verificado con Node/pnpm instalados por primera vez en esta máquina + Vite dev server + capturas Edge headless de las 4 pantallas).

**HITO ALCANZADO**: navegación del shell alineada con el UX planificado — próximas features (PCA, Litogeochemistry, imports TSG/KT-10) ya tienen dónde vivir sin volver a tocar `App.tsx`.

### Completado en sesión 2026-07-14 (continuación) — Plugin Analytics: descriptive stats + PCA

- [x] `analysis/analytics/preprocessing.py` — `prepare_matrix()` compartido: maneja nulos RF-04-CUA (NOT_ANALYZED excluye muestra, BELOW_LOD imputa LOD/2, MISSING imputa mediana) + estandarización opcional. Bug corregido: la mediana de MISSING se calculaba sobre valores ya imputados por BELOW_LOD en vez de solo los realmente medidos.
- [x] `analysis/analytics/descriptive.py` — estadística descriptiva + normalidad (Shapiro-Wilk) + correlación (Spearman)
- [x] `analysis/analytics/pca.py` — PCA con validación obligatoria KMO/Bartlett/VIF (RF-04.2/2a/2b); bloquea con error si KMO < 0.5
- [x] `services/analytics/tests/` — 7 tests (preprocessing + PCA), todos en verde
- [x] `packages/ipc-contracts/analytics/descriptive.v1.json` + `pca.v1.json`
- [x] `app/routers/rpc.py` — métodos `analytics.descriptive` / `analytics.pca`
- [x] `src/lib/data-api.ts` — tipos + helpers `runDescriptive()` / `runPca()`
- [x] `src/components/AnalyticsWorkspace.tsx` — tool "Data Analysis" del grupo Geochemistry (pasa de `planned` a `active` en `modules-registry.ts`): picker de variables, tabla de stats + heatmap de correlación, y para PCA: KMO/Bartlett/warnings, scree plot, biplot de scores por sample type, tabla de loadings/VIF
- [x] TypeScript typecheck: 0 errores. Verificado visualmente con Vite + Edge headless (estado vacío, picker con dataset, resultados vía fixtures)
- [ ] **Pendiente**: verificación E2E real contra el servicio Python (requiere compilar el stack Tauri completo) — no se probó aún con datos reales de punta a punta

**HITO ALCANZADO**: primer plugin de análisis estadístico end-to-end (backend + contratos + UI) — flujo principal import → analyze (descriptive/PCA) ya tiene su primera pieza funcional.

#### Completado en sesión 2026-07-15 — Rediseño DATA + DATA ANALYSIS (Excel/Power BI style)

- [x] **Backend — modelo de edición no-destructiva**: `analysis/data/overlay.py` (ops log JSON por dataset: rename/hide/drop/change_dtype/add_calculated_column, con Undo/Redo e historial append-only), `analysis/data/query.py` (filtros/orden server-side por dtype), `analysis/data/formula.py` (motor de fórmulas restringido: asteval + AST whitelist compartido con traductor a `pl.Expr` vectorizado — preview y commit nunca divergen en qué aceptan), `analysis/data/quality.py` (9 chequeos: nulls, duplicados, columnas constantes, tipos mixtos, no-numérico-en-numérico, below-LOD, outliers IQR, coordenadas inválidas, nombres de columna duplicados).
- [x] **RPC nuevos**: `data.rows` (extendido con filters/sort/include_hidden, corre sobre el dataset completo), `data.quality_report`, `data.preview_formula`, `data.apply_operation`, `data.undo_operation`, `data.redo_operation`, `data.get_operations`, `data.save_changes` (crea versión nueva del dataset, nunca muta el Parquet original). `analytics.descriptive`/`analytics.pca` re-cableados a `overlay.get_effective_dataframe()` para ver columnas renombradas/calculadas.
- [x] **Rol de columna enhebrado de punta a punta**: `storage.save_dataset()` ahora persiste `role` por columna; `ColumnMeta` (frontend) gana el campo `role: ColumnRole`; `lib/variable-classification.ts` agrupa en Identifiers/Coordinates/Dates/Calculated/Numeric/Categorical/Other.
- [x] **Tests backend**: 44 tests nuevos (`test_overlay.py`, `test_query.py`, `test_formula.py`, `test_quality.py`) + 7 preexistentes = 51 pasan, incluye regresión de fórmulas adversariales (`__import__`, `exec`, escape de sandbox) y prueba de que el Parquet original queda byte-idéntico tras operaciones.
- [x] **Sistema de ventanas flotantes** (`components/window-manager/`): `WorkspaceArea` + `FloatingWindow` sobre `react-rnd` — una instancia por pantalla (DATA y Data Analysis no comparten set de ventanas abiertas).
- [x] **DATA screen rediseñada**: `DataGrid.tsx` (TanStack Table, reemplaza `DataTable.tsx` eliminado) con sort/filtro server-side por header (`ColumnFilterMenu.tsx`), resize de columnas, fila fija; `DataToolbar.tsx` (Undo/Redo/Save/Refresh/Sort/Filter/Rename/Change type/Hide/Drop/Calculated Column/Data Quality reales; Find&Replace/Remove duplicates/Conditional formatting/Group by/Aggregate/Export = "Coming soon"); `CalculatedColumnWindow.tsx` y `DataQualityWindow.tsx` como ventanas flotantes; mitad superior = `WorkspaceArea` (logo + resumen del dataset cuando vacía), mitad inferior = grilla.
- [x] **DATA ANALYSIS rediseñada**: `DataAnalysisScreen.tsx` reemplaza `AnalyticsWorkspace.tsx` (eliminado) — catálogo categorizado (`lib/analysis-tools-registry.ts`, 6 categorías, ~29 herramientas) como empty-state de su propio `WorkspaceArea`; ya NO auto-ejecuta Descriptive ni salta a lista plana de variables. Reales: Descriptive Statistics, Correlation Analysis (consolida Pearson+Spearman del mismo RPC), Principal Component Analysis, Analysis History (`stores/analysis-history-store.ts`, sesión únicamente). Resto = tarjetas "Coming soon" (mismo patrón `status:"planned"` que `modules-registry.ts`). `VariablePicker.tsx` reusable (agrupado + búsqueda + Select All/Clear). `DescriptiveResults.tsx`/`PcaResults.tsx` extraídos verbatim con botón nuevo "Open in Visualization" (usa `activeModuleId` recién elevado a `app-store.ts`).
- [x] Typecheck TS: 0 errores. Verificado visualmente con `vite:dev` + Edge headless (catálogo y layout DATA confirmados contra fixture; el error de carga de filas en el grid es esperado — no hay servicio Python corriendo en modo browser-only).
- [x] **Verificación E2E real contra el servicio Python** (uvicorn real en puerto 5174, sin Tauri): CSV con fila duplicada → `data.preview` → `data.import` (roles clasificados OK) → `data.rows` con filtro+orden reales sobre el dataset completo → `rename_column` → `data.preview_formula` → `add_calculated_column` → `hide_column` → fórmula adversarial rechazada vía HTTP → `analytics.descriptive` ve las columnas renombrada/calculada → `data.quality_report` detecta la fila duplicada → `undo_operation` revierte → Parquet original byte-idéntico en todo momento → `save_changes` crea versión nueva con los cambios horneados y el Parquet original sigue intacto. **Bug real encontrado y corregido**: `check_duplicate_rows` en `quality.py` no detectaba duplicados porque incluía `internal_feature_id` (columna sintética única-por-fila que agrega el importer) en la comparación — toda fila parecía única. Fix: nuevo helper `_is_synthetic()` excluye `internal_feature_id` y `__sample_type__` además de `_nulltype_*`; test de regresión agregado (`test_check_duplicate_rows_ignores_synthetic_internal_feature_id`). Backend: 52 tests pasan.
- [ ] **Pendiente**: probar interactivamente drag/resize/minimize de las ventanas flotantes y el flujo completo dentro de la app Tauri real (`pnpm dev` compilando Rust) — no se pudo levantar el stack nativo completo en este entorno, solo el servicio Python fue verificado end-to-end vía HTTP directo.

**HITO ALCANZADO**: DATA y DATA ANALYSIS pasaron de vistas planas a espacios de trabajo tipo Excel/Power BI con ventanas flotantes, edición no-destructiva con historial, y catálogo de análisis categorizado — alineado con los mockups y specs entregados por el dueño del producto el 2026-07-15.

### Completado en sesión 2026-07-15 (continuación) — Plugin QAQC (ADR-0003 / RF-10)

- [x] **Dos bugs bloqueantes encontrados y corregidos antes de construir QAQC**: (1) `ImportWizard.tsx` nunca enviaba `sampleTypeMapping` a `importFile()` pese a tener el tipado listo — `importer.py` solo creaba `__sample_type__` cuando había mapping, así que ningún dataset importado tenía nunca muestras FB/LB/FD/LD/CRM clasificadas (todo quedaba sin la columna). Fix: `__sample_type__` ahora siempre existe post-import (default "S"), valores no mapeados caen a "S" en vez de filtrarse crudos. (2) `qaqc_status` en metadata solo chequeaba rol `qaqc_attribute`, ignorando `sample_type_qaqc` (el rol real que asigna el wizard) — corregido a `bool(roles & {"qaqc_attribute","sample_type_qaqc"})`.
- [x] **Backend — lógica analítica ya existía** (`analysis/qaqc/{blanks,duplicates,crm,control_charts}.py`, escrita en sesión previa) pero estaba completamente desconectada — esta sesión la cableó: `analysis/qaqc/common.py` (helpers compartidos, elimina triplicación de `_infer_sample_id_column`), `analysis/qaqc/report.py` (agregador `build_qaqc_report`), `analysis/qaqc/crm_library.py` (persistencia JSON single-file, sin multi-tenancy aún), 5 RPC nuevos (`qaqc.calculate`, `qaqc.control_chart`, `qaqc.report`, `qaqc.crm_library.list/upsert`).
- [x] **RF-10.1.5 implementado**: `prepare_matrix()` excluye automáticamente muestras FB/LB/FD/LD/CRM de `analytics.descriptive`/`analytics.pca` — nuevo param `include_qaqc_flagged` (default false) para incluirlas manualmente con warning visible (reutiliza el mecanismo `warnings: string[]` existente, sin UI nueva más allá de un checkbox en `AnalysisToolWindow.tsx`).
- [x] **IPC contracts**: se encontraron 2 contratos QAQC ya escritos (`calculate.v1.json`, `control_chart.v1.json`) de una sesión previa a la implementación real de `blanks.py` etc. — describían un shape distinto al de las dataclasses reales; se corrigieron para reflejar `asdict(BlankFlag)`/`asdict(DuplicatePair)`/`asdict(CRMResult)`/`asdict(ControlChartResult)` tal cual. Agregados `report.v1.json`, `crm_library_list.v1.json`, `crm_library_upsert.v1.json`.
- [x] **Frontend**: `ImportWizard.tsx` gana panel de mapeo de valores de tipo de muestra (Step 2, con auto-sugerencia heurística por substring); `QaqcScreen.tsx` + `QaqcPanel.tsx` (resumen + 3 tablas Blanks/Duplicates/CRM coloreadas pass/warning/fail) + `QaqcControlChartWindow.tsx` (Shewhart con líneas ±1σ/±2σ/±3σ vía Plotly) + `CrmLibraryWindow.tsx` (CRUD de CRMs) — todo sobre el mismo `WorkspaceArea`/`react-rnd` de la sesión anterior. Nueva entrada "QAQC" activa en `modules-registry.ts`.
- [x] **Tests backend**: 46 tests nuevos (`test_qaqc_common/blanks/duplicates/crm/control_charts/report/crm_library.py`, `test_rpc_qaqc.py`, extensión de `test_preprocessing.py`) + 52 previos = **98 pasan**. Varios casos límite verificados empíricamente antes de fijarlos como test (ej. exactamente qué serie dispara cada regla de Westgard 1_3s/2_2s/10x/drift, ya que el z-score se calcula sobre la media/sigma de la propia serie, no un baseline fijo).
- [x] **Verificación E2E real contra el servicio Python** (uvicorn real, sin Tauri): CSV sintético con 6 regulares + 1 blanco contaminado + 1 duplicado + 5 instancias de CRM con drift lineal → import sin mapping (regresión: `__sample_type__` sigue existiendo, todo "S") → import con mapping (conteos exactos por tipo) → `qaqc.calculate` (blank flag, duplicate pass, 5 CRM results) → `qaqc.control_chart` dispara regla `drift` correctamente → carta con <2 puntos retorna `available:false` sin error → `analytics.descriptive` excluye 7 muestras QAQC por default, las incluye con `include_qaqc_flagged=true` + warning → `qaqc_status` metadata correcto. Todo pasó.
- [x] Typecheck TS: 0 errores. Verificado visualmente: ventana flotante "QAQC Summary" se abre automáticamente al entrar al módulo (a diferencia de Data Analysis, no hay catálogo intermedio), title bar con icono/minimize/close funcionando, estado de error manejado con botón Retry (esperado sin servicio Tauri en modo browser-only).
- [ ] **Pendiente explícitamente fuera de alcance esta sesión** (marcado "Coming soon" en la UI): override manual de flags con comentario de auditoría (RF-10.6.3), export PDF (RF-10.6.4 — bloqueado por ADR de motor PDF aún no decidido), propagación de contaminación a nivel de lote (RF-10.2.5), %RSD inter-lote de CRM (RF-10.4.5). Tampoco se probó drag/resize interactivo de las ventanas QAQC ni el flujo completo dentro de Tauri real (mismo pendiente que la sesión anterior).

**HITO ALCANZADO**: Plugin QAQC funcional de punta a punta (blancos, duplicados, CRM, cartas Shewhart, biblioteca CRM) — primer diferenciador real vs ioGAS v7.3 mencionado en ADR-0003, verificado con datos reales contra el servicio Python.

### Completado en sesión 2026-07-16 — Módulo Spectrometry (TSG-like, primer pase completo)

- [x] **Modelo de datos nuevo**: `analysis/spectrometry/storage.py` — "proyecto espectral" (`spectral_projects/{project_id}/`) como unidad relacional independiente del dataset tabular de DATA: `samples/spectra/features/indices/interpretations/reference_spectra.parquet` + `rules.json` + `spectral_ops.json` + `project.meta.json`. `spectrum_id`/`feature_id`/etc. generados con el mismo patrón `PREFIX-{uuid12}` que `overlay.py`.
- [x] **3 lectores de espectros**: `ascii_reader.py` (CSV/TXT, auto-detecta delimitador y separador decimal, formato ancho multi-espectro) — confiable al 100%; `asd_reader.py` y `sed_reader.py` — **Experimental**, best-effort desde documentación de terceros no verificada (sin archivos reales de instrumento para probar), fallan ruidosamente (`AsdFormatError`/`SedFormatError`) ante cualquier versión/estructura no reconocida en vez de adivinar. `folder_scanner.py` aísla archivos inválidos sin abortar el lote.
- [x] **Overlay de preprocesamiento no-destructivo** (`preprocessing_overlay.py`): análogo estructural exacto de `overlay.py` de la sesión DATA, pero con `scope` (`{"all":true}` o `{"spectrum_ids":[...]}`) para aplicar a una muestra o a un lote. 13 operaciones puras en `preprocessing.py` (rango, bandas, interpolación, smoothing, normalización, continuum removal, absorbancia, derivadas, corrección de splice, resampling). `reflectance_raw` nunca se muta — verificado con test que compara bytes.
- [x] **Extracción de rasgos genérica** (`features.py`): centro/profundidad/FWHM/área/asimetría vía continuum-removal (envolvente convexa), validado contra un espectro Gaussiano sintético con valores calculados a mano (FWHM coincide exactamente con la fórmula `2.3548·sigma`). Presets Al-OH/Mg-OH/Fe-OH/H2O/OH como defaults editables, nunca hardcodeados en el algoritmo.
- [x] **Motor de índices espectrales**: `formula.py` (de la sesión DATA) ganó un parámetro aditivo `extra_allowed_funcs` — reutiliza toda la validación AST whitelist ya probada en vez de duplicarla. `spectral_formula.py` agrega `REFLECTANCE(wl)` y `DEPTH(feature_preset)` al intérprete. **Bug real encontrado en E2E**: `indices.preview_formula` envolvía `FormulaError` en un soft-failure `available:false`, inconsistente con el precedente de `data.preview_formula` (error JSON-RPC duro) — corregido para que las fórmulas adversariales fallen igual de ruidosamente en ambos módulos.
- [x] **Interpretación mineral en 3 modos**: manual, reglas configurables (`rules.py` + `rule_presets.py` con reglas default estilo TSG por posición de Al-OH/Mg-OH), y comparación con bibliotecas vía **Spectral Angle Mapper** (`library_match.py`) — elegido sobre correlación por ser invariante a normalización de albedo, estándar de facto en TSG/USGS. Modelo de 3 estados Suggested/Interpreted/Confirmed con auditoría append-only (`confirm()` nunca muta una fila, crea una nueva con `previous_interpretation_id`).
- [x] **Mica Blanca y Clorita implementadas como una sola función genérica** `classify_population()` con distinto preset/tabla de clases por default — no dos herramientas separadas. Clay Mineral Analysis y Mineral Assemblages quedaron "Coming soon" (discriminación multi-doblete y constructor de combinaciones libres son máquinas de verdad, no atajos).
- [x] **RPC**: 47 métodos `spectrometry.*` nuevos en `services/analytics/app/routers/spectrometry_rpc.py` (archivo separado, mergeado a `METHOD_REGISTRY`). Export a DATA = crea un dataset **nuevo** vía el `storage.save_dataset()` ya existente (join por Sample ID), no join en vivo.
- [x] **IPC contracts**: 9 archivos agrupados por área funcional en `packages/ipc-contracts/spectrometry/` (no 47 archivos 1:1, deviación pragmática documentada dado el volumen).
- [x] **Tests backend**: 82 tests nuevos (readers, storage, preprocessing overlay, quality, features con espectro Gaussiano sintético, spectral_formula con casos adversariales, library_match SAM, interpretation audit trail, mineral_population, RPC smoke tests) + 98 previos = **180 pasan**.
- [x] **Verificación E2E real contra el servicio Python**: import con 3 espectros válidos + 2 archivos basura (uno truncado .asd, uno texto plano) → ambos fallan ruidosamente sin abortar el resto → preprocesamiento no-destructivo (continuum removal) con reflectancia cruda verificada intacta → extracción de features (centro Al-OH detectado a 2201.98nm vs 2202nm inyectado) → índice AlOH calculado → fórmula adversarial rechazada por HTTP (bug encontrado y corregido en el camino) → reglas aplicadas (Muscovite sugerido) → `confirm()` con historial de 2 filas → mica blanca clasificada → reporte de calidad cubre las 3 muestras → export a dataset nuevo, legible vía `data.rows` existente. Todo pasó.
- [x] **Frontend**: pantalla principal con empty-state exacto al spec (logo + Import Spectra + Import Processed Results + proyectos recientes + formatos compatibles) cuando no hay proyecto activo; catálogo de 5 categorías/26 tarjetas (varias son alias del mismo componente: Instrument Metadata/Duplicate Samples/Invalid Spectra son pestañas de Spectrum Quality, Hydration Parameters es un filtro de Spectral Indices, Library Matching es una pestaña de Mineral Interpretation) cuando sí lo hay — verificado visualmente, badges Available/Coming Soon correctos. 14 componentes nuevos bajo `components/tool-windows/`, todos sobre el mismo `WorkspaceArea`/`react-rnd`. `spectrometry-store.ts` es su propio concepto de "proyecto activo", independiente de `dataset-store.ts`.
- [x] Typecheck TS: 0 errores.
- [ ] **Pendiente explícitamente fuera de alcance** (marcado "Coming soon" en la UI): Clay Mineral Analysis, Mineral Assemblages (constructor libre), Saved Analyses (necesita persistencia adicional), override manual con auditoría de 6 estados (se usó el modelo de 3 estados), export PDF (mismo ADR pendiente que QAQC). No se probó con archivos ASD/SED reales (no hay ninguno disponible) ni el flujo completo dentro de Tauri nativo.

**HITO ALCANZADO**: Primer pase funcional completo del módulo Spectrometry — modelo de datos, 3 lectores, preprocesamiento no-destructivo, QC, extracción de rasgos, índices, interpretación en 3 modos, mica blanca/clorita, spectral log, export a DATA — con 180 tests backend y E2E real, siguiendo los mismos patrones arquitectónicos que DATA/DATA ANALYSIS y QAQC (reutilización deliberada de `overlay.py`, `formula.py`, `WorkspaceArea`/`react-rnd`, el patrón de catálogo `status:"active"|"planned"`).

## Pendiente en Fase 0
- [ ] Plugin Core: registry, lifecycle, event bus básico (packages/plugin-sdk)
- [ ] Pipeline CI/CD base (GitHub Actions)

### Fase 1 (próxima)
- [x] Plugin Data Manager: importación CSV/Excel con wizard (incluye paso de tipo de muestra QAQC)
- [x] **Plugin QAQC** (core-qaqc): blancos, duplicados (%RPD), CRM (%Recovery), cartas Shewhart — ver RF-10 y ADR-0003 (2026-07-15; override manual/PDF export/batch propagation quedan pendientes, ver sesión arriba)
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
| ADR-0005 | Separar Data/Módulos/View + registro estático de grupos de módulos | Aceptado |

## Prioridades Actuales

1. **Verificación E2E real dentro de la app Tauri nativa** (`pnpm dev` completo, Rust+Python+React) — todo lo construido hasta ahora (DATA, DATA ANALYSIS, QAQC, Spectrometry) solo se verificó vía HTTP directo al servicio Python + UI con fixtures en browser; falta el click-through real con el IPC bridge de Rust y probar drag/resize/minimize interactivo de las ventanas flotantes
2. **Validar los lectores ASD/SED con archivos reales de instrumento** en cuanto estén disponibles — hoy son "Experimental" por diseño (best-effort desde documentación de terceros no verificada, sin archivos reales para probar)
3. **Petrofísica** (KT-10): sigue en `modules-registry.ts` como placeholder — investigar el formato KT-10 antes de extender `services/analytics/analysis/data/importer.py`
4. Spectrometry follow-ups: Clay Mineral Analysis (discriminación multi-doblete), Mineral Assemblages (constructor de combinaciones libres), Saved Analyses (persistencia)
5. QAQC follow-ups: override manual de flags con auditoría (RF-10.6.3), export PDF (RF-10.6.4, bloqueado por decisión de motor PDF), propagación de contaminación a nivel de lote (RF-10.2.5)

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

**Resuelto 2026-07-14**: el MVP cubre O&G **y** minería/exploración — confirmado tanto por
`UX_PyOrex_06.26.pptx` (incluye Litogeochemistry y Mineral Exploration como módulos de
Geochemistry) como directamente por el dueño del producto, quien además amplió el alcance
a **Espectrometría** (TSG) y **Petrofísica** (KT-10) — ver ADR-0005. `NOTA: PYOREX_SPECS_v2.md`
mencionado abajo no existe en el repo — debe re-crearse o localizarse para reflejar este
alcance ampliado.

## Contexto Importante para Agentes

- El proyecto está en estado **inicial** — no hay código de producción aún
- Especificación completa: `PYOREX_SPECS_v2.md` en la raíz del proyecto (⚠ archivo no encontrado en el repo — ver nota arriba)
- Software de referencia/competencia: **ioGAS v7.3 de IMDEX** — ver capturas en resources
- Multi-tenancy es un requerimiento duro desde el inicio
- Offline-first es no negociable (clientes en campo sin internet)
- El motor estadístico Python DEBE cumplir los requerimientos RF-04* estrictamente
- Los análisis deben ser completamente reproducibles (metadatos + pipeline serializado)
- Los outliers en datos geoquímicos NO se eliminan automáticamente — siempre reportar al usuario
- La UI target tiene dark theme, split view — ver mockup en design-system.md
- PyOreX = **Py**thon + **Ore** + e**X**ploration — no es solo O&G, el nombre ya apunta a exploración minera

## Repositorio GitHub

- URL: https://github.com/ctarazonas/pyorex-desktop
- Visibilidad: Privado
- Rama default: `main`
- Commit inicial: `e665cce` — 88 archivos, Fase 0 completa

## Métricas del Proyecto

- Agentes configurados: 9 (se agregó security-engineer el 2026-06-04)
- Skills configurados: 5
- ADRs: 5
- Features implementadas: Fase 1a (import E2E) + 1b (spatial/KML) + 1c (export history) + nav Data/Módulos/View separada (2026-07-14)
- Tests existentes: 0 (deuda técnica — próximo sprint)
- TypeScript typecheck: 0 errores (mantenido)
- Python: pyproj instalado y verificado
- Módulos de producto: Geochemistry (parcial) + Espectrometría (scaffold) + Petrofísica (scaffold) — ver `modules-registry.ts`

