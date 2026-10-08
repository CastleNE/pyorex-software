# PyOrex — Continuidad para Claude Code

Actualizado: 20 de septiembre de 2026. Repositorio: `C:/Users/braya/projects/pyorex-desktop`.

## Instrucciones prioritarias del usuario

- Navegación principal únicamente **GEOQUÍMICA / ESPECTROMETRÍA / PETROFÍSICA**. No restituir Andean Hub, View, File o Data como módulos principales.
- Geoquímica contiene cuatro áreas aprobadas por el usuario (oct 2026): **Datos y análisis / Litogeoquímica / Exploración mineral / Secciones y mapas** (sustituye a DATA ANALYSIS / DIAGRAMS / Litogeoquímica / Exploración). Los diagramas genéricos (DIAGRAMS) viven en «Datos y análisis → Gráficos»; cada diagrama del catálogo va en el área y grupo que le corresponde, no en pestañas aparte. Datos y análisis reúne preparación y estadística. No crear otra pantalla paralela de datos.
- Interfaz bilingüe **español / inglés** (`lib/i18n.ts`). Ids del Registry, familias y etiquetas científicas servidas por el backend no se traducen ni renombran.
- Priorizar herramientas utilizables por geocientistas, gráficos visibles, pocos pasos y un editor claro. No añadir botones de capacidades inexistentes.
- Mantener diseño oscuro existente y datos originales. No declarar equivalencia completa con ioGAS o RockWorks.
- El repositorio tiene muchos cambios previos sin commit, incluidas eliminaciones anteriores. No usar reset/checkout masivo ni adjudicarse todos los cambios de git status.

## Estado implementado

**DATA ANALYSIS:** preparación de muestras mediante la tabla y operaciones existentes, filtros, ordenación, columnas calculadas, QAQC/calidad, resumen estadístico, correlaciones, PCA e historial. Se reutiliza `AnalysisToolWindow` y el motor estadístico existente. La cinta de preparación muestra grupos con acciones reales; se retiraron sus botones de promesas futuras y la barra redundante de importación.

**DIAGRAMS:** XY, líneas XY por grupo, histograma, Tukey/cajas y bigotes, Q–Q normal, probabilidad normal, ECDF, comparación de ensayes con identidad 1:1, diferencias frente a media, downhole simple y de dos ensayes, ternario ABC y Harker. Hay accesos visibles además del selector. El mapeo completo dispara cálculo automático en diagramas; los científicos de litogeoquímica conservan Calcular.

**Editor:** color/forma/tamaño/visibilidad por categoría; seis paletas; tamaño constante, proporcional o por terciles; tamaño por X, Y u otra columna; color por cinco intervalos iguales de una columna numérica con límites visibles; opacidad, cuadrícula, ejes logarítmicos y límites de vista. La presentación cambia sin recalcular la química. Editor y controles son plegables. PNG/JPG/SVG llaman a la exportación del gráfico visible; CSV/JSON conservan las filas y motivos de exclusión.

**Litogeoquímica:** TAS con campos y restricciones explícitas; proyección modal QAPF; AFM; K2O-SiO2; MALI; Fe-index; Shand, A/CNK y A/NK; REE/condrito y multielementos/manto primitivo SM89; razones elementales y Sr/Y, La/Yb, Dy/Yb, Eu/Eu*, Ce/Ce*. Revisar el catálogo para distinguir índices/proyecciones de clasificadores. QAPF no es CIPW. No inventar diagramas Müller sin referencia.

**Exploración:** anomalías con cortes y nombres editables o percentiles; K-means multivariable estandarizado, semilla fija y centroides; isovalores IDW con coordenadas y EPSG proyectado; acceso al PCA existente y AI-CCPI. Resultados tabulares y exportables; malla IDW exportable a CSV. No se guardan clases sobre las columnas originales.

## Decisiones científicas que se deben conservar

- Motores Python trabajan sobre el dataframe efectivo del sistema de operaciones, sin sobrescribir el original. Columnas ocultas no se aceptan silenciosamente para análisis.
- Valores censurados, no finitos y faltantes no se imputan. QAQC se excluye por defecto; cada fila conserva estado/motivo. Las unidades se convierten explícitamente en herramientas de concentración.
- Q–Q/probabilidad: posiciones `(i - 0.5) / n` y cuantiles normales por grupo; ECDF: rango máximo/n para empates. No afirmar que el gráfico es una prueba formal de normalidad.
- Tukey usa cuartiles lineales de Plotly y bigotes 1.5 IQR, con puntos originales. No elimina outliers.
- Downhole exige ID de sondaje por fila, profundidad no negativa y ensayes comparables. Profundidad aumenta hacia abajo. Los ensayes faltantes con profundidad conocida interrumpen líneas. No se mezclan sondajes sin ID. Es profundidad medida 1D: no desurvey, coordenadas 3D, intervalos From/To ni compositado. Comparación empareja por fila, sin unir tablas automáticamente.
- Anomalías: corte exacto entra en la clase superior; percentiles lineales; advertir cortes repetidos. Coordenadas faltantes no eliminan ensayes del cálculo de clases/K-means.
- K-means: estandarización, transformación log10 opcional, 2–20 grupos, semilla 42, n_init=10. Silhouette no se calcula sobre más de 5000 muestras; se informa. Columnas constantes o combinaciones distintas insuficientes se rechazan. Centroides tienen `values` anidado para evitar colisiones de nombres.
- IDW: CRS proyectado obligatorio; duplicados XY promediados; vecindad configurable; límite de envolvente convexa; fuera del soporte se devuelve null. No es kriging ni estima incertidumbre.

## Mapa de archivos de esta entrega

Rutas relativas al repositorio:

| Área | Archivos y responsabilidad |
|---|---|
| Navegación | `apps/desktop/src/App.tsx` (cabecera, menú Archivo, ES/EN), `stores/app-store.ts`, `components/GeochemistryScreen.tsx` (cinta por áreas, rail, barra de estado), `components/geochemistry/GeoRibbon.tsx`, `GeoRail.tsx`, `stores/shell-store.ts`, `lib/geochem-areas.ts` (ubicación de cada herramienta del Registry), `lib/i18n.ts` |
| Preparación/estadística | `components/geochemistry/DataAnalysisWorkspace.tsx`, `components/DataScreen.tsx`, `components/QuickToolsRibbon.tsx`: fusión funcional; reutilizan grilla, ventanas y estadísticas existentes |
| Configuración | `components/geochemistry/Workbench.tsx`, `Editor.tsx`, `AttributeEditor.tsx`, `ChartControls.tsx`, `stores/geochemistry-store.ts`: mapeo, estado, presentación y protección de respuestas tardías |
| Render/exportación | `components/geochemistry/Results.tsx`, `lib/build-geo-chart.ts`, `lib/chart-presentation.ts`, `lib/geochemistry-attributes.ts`, `lib/geochemistry-api.ts`, `plotly-dist-min.d.ts` |
| Exploración UI | `components/geochemistry/ExplorationWorkspace.tsx`, `ExplorationResults.tsx`, `lib/exploration-api.ts` |
| Motor científico | `services/analytics/analysis/geochemistry/catalog.py`, `models.py`, `engine.py`, `exploration.py`, `references/` |
| Integración | `services/analytics/app/routers/geochemistry_rpc.py`, registro en `rpc.py`, whitelist de `apps/desktop/src-tauri/src/analytics_bridge.rs`, contratos `packages/ipc-contracts/geochemistry/` |
| Pruebas | `services/analytics/tests/test_geochemistry.py`, `test_geo_diagrams.py`, `test_exploration.py`; `apps/desktop/src/lib/{geochemistry,geochemistry-attributes,exploration,chart-presentation,build-geo-chart}.test.ts` |

Las rutas abreviadas `components/`, `lib/`, `stores/` de la tabla parten de `apps/desktop/src/`. Hub y pantallas antiguas permanecen en disco por compatibilidad; no son el flujo de navegación actual. Comprobar consumidores antes de borrarlas.

## Arranque local y datos que hay que preservar

No arrancar procesos duplicados si los puertos 5174 y 1420 ya están activos. `pnpm dev` inicia Tauri/Vite; **no inicia Python**.

Terminal 1, desde la raíz del repo:

```powershell
$env:PYOREX_DATA_DIR='C:/Users/braya/Documents/Codex/2026-09-19/referenced-chatgpt-conversation-this-is-an/work/geochemistry-test-data'
$env:PYOREX_HUB_DIR='C:/Users/braya/Documents/Codex/2026-09-19/referenced-chatgpt-conversation-this-is-an/work/hub-test-data'
Set-Location services/analytics
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 5174
```

Terminal 2, desde la raíz:

```powershell
pnpm dev
```

Vista web alternativa: `pnpm --filter @pyorex/desktop vite:dev`, dirección `http://localhost:1420`. La importación por diálogo nativo requiere Tauri.

**El directorio llamado geochemistry-test-data contiene importaciones reales del usuario llamadas Data Demo geoquimica. NO borrarlo ni cambiarlo por otra ruta vacía al reiniciar.** Mantener todas sus importaciones; cualquier migración requiere inventario y copia comprobada. Los datasets que empiezan por `PRUEBA ·` son sintéticos y están separados: óxidos/REE (6 filas), exploración Au-Cu (120) y sondajes/ensayes (40). No modifican los datos del usuario.

## Verificación realizada y límites de la evidencia

- Motor completo: **231 pruebas pasan**, 20 advertencias de dependencias/estadística sobre datos degenerados. No hubo errores de prueba.
- Frontend: **28 pruebas pasan**, incluyendo continuidad downhole, límites logarítmicos, leyenda numérica y eje categórico Tukey. TypeScript comprobado.
- Build de producción Vite realizado. Advierte bundle grande (Plotly, aproximadamente 10.3 MB antes de gzip); no es un error de compilación. Cargo check pasó tras añadir el método RPC de exploración.
- En navegador local se visualizaron XY, Q–Q, probabilidad normal, Tukey y downhole de dos sondajes/dos ensayes; se cambiaron paleta, tamaños y límites sin recrear cálculo. DATA ANALYSIS muestra preparación y accesos estadísticos en un único grupo.
- En la sesión también se comprobaron anomalías manuales/percentiles, K-means, contornos IDW y PCA con datos sintéticos. En el dataset Au-Cu: 119 válidas + 1 CRM excluida; K-means 3 grupos con silhouette aproximado 0.589; IDW 3576/3600 celdas soportadas en EPSG 32718.
- Se accionaron PNG/JPG/SVG sin alerta en la UI web. **No se ha confirmado un archivo descargado de cada formato ni su guardado en WebView/Tauri**. No reportar validación nativa completa de exportaciones. Primer criterio de aceptación para Claude: exportar y abrir los tres archivos en Tauri, conservando paleta/ejes.
- No se ha generado ni certificado un instalador final. Pruebas automatizadas y navegación web no equivalen a aceptación científica con datos reales.

Comandos de regresión, desde la raíz:

```powershell
pnpm typecheck
pnpm test
pnpm --filter @pyorex/desktop vite:build
.\services\analytics\.venv\Scripts\python.exe -m pytest -q services/analytics/tests
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Pendientes ordenados para Claude

1. **Implementado, sin verificar en Tauri (21 sep 2026):** exportación PNG/JPG/SVG/CSV/JSON/malla IDW por diálogo nativo «Guardar como» (`lib/save-file.ts`, `@tauri-apps/plugin-fs`, permiso `fs:allow-write-file`) con aviso visible de ruta/cancelación/error. Falta pulsar los tres formatos en la ventana nativa, abrir los archivos y comprobar paleta/ejes. Ningún agente ha podido accionar la ventana nativa aún.
2. **Implementado (21 sep 2026), sin verificar en Tauri:** configuración (mapeo, unidades, grupo, columnas de tamaño/color) y presentación (paleta, ejes, tamaño, opacidad) se guardan automáticamente por dataset+herramienta en localStorage (`lib/geochemistry-session.ts`, `stores/geochemistry-store.ts`). Los atributos por categoría se guardan por dataset (comparten claves columna+categoría entre herramientas). Las columnas ausentes al restaurar se descartan y se avisan; nunca se reasignan. Panel «Sesión y configuración guardada» en el editor: guardar/abrir documento JSON (`pyorex.geochemistry.session` v1, solo configuración; sin datos ni resultados) y restablecer herramienta. Límites: localStorage es por equipo/perfil; la sesión no se une a `.orex` (ADR-0004) ni al JSON científico del resultado; «Abrir sesión…» usa `<input type=file>` y no se ha probado en WebView2.
3. Mejorar editor según tipo: deshabilitar controles no aplicables (ejes categóricos, probabilidad normal, ternarios y convenciones downhole). Validar tamaños pequeños de ventana; controles expandidos pueden requerir desplazamiento.
4. Selección vinculada gráfico-tabla, intervalos From/To, varios tracks de downhole y unión explícita por muestra/intervalo antes de comparar laboratorios. No simular capacidades de desurvey con profundidad medida.
5. Afinar leyendas de tamaños y color: clases numéricas constantes, cortes/nombres editables de colores y separación de categorías por atributo. Actualmente hay cinco intervalos de color iguales y tamaños por terciles; las anomalías editables pertenecen a Exploración.
6. Revisión geocientífica con datasets conocidos: unidades, referencia/versión de cada método, campos de clasificación válidos y resultados esperados. Nuevos diagramas deben tener referencias verificables y pruebas numéricas, no nombres comerciales vacíos.
7. Optimizar carga de Plotly y datasets grandes. Dispersión genérica limita dibujo a 5000 filas; spiders a 100; tabla/CSV mantienen todas. Histogramas/cajas/distribuciones/líneas/downhole no se muestrean actualmente. No anunciar soporte masivo sin medir rendimiento.

Quedan fuera de esta implementación: equivalencia completa ioGAS/RockWorks, kriging/variografía, incertidumbre espacial, desurvey 3D, CIPW y clasificación tectónica universal. No hay criterio científico para decir «toda la geoquímica terminada».

## Referencias para continuar

- NIST, técnicas gráficas: https://www.itl.nist.gov/div898/handbook/eda/section3/eda34.htm
- scikit-learn KMeans: https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html
- Esri, IDW: https://pro.arcgis.com/en/pro-app/3.6/help/analysis/geostatistical-analyst/how-inverse-distance-weighted-interpolation-works.htm
- ioGAS atributos/intercambio: https://reflexnow.com/wp-content/uploads/2023/07/ioGAS_QGIS_Plugin.pdf
- RockWorks boreholes: https://help.rockware.com/rockworks/WebHelp/boreholemgr_summary.htm
- Referencias de óxidos/normalizaciones y restricciones: catálogo Python y archivos `references/` del motor.

## Prompt de inicio para Claude Code

Lee CLAUDE.md, .claude/memory/project-state.md, docs/GEOCHEMISTRY_HANDOFF.md y ADR-0006. Trabaja sobre este repositorio local sin descartar cambios ni datos. Conserva únicamente GEOQUÍMICA, ESPECTROMETRÍA y PETROFÍSICA en la navegación principal; DATA ANALYSIS pertenece a Geoquímica. Primero verifica los tres formatos exportados en Tauri. Después aborda los pendientes del handoff en etapas comprobables, empezando por persistencia y controles apropiados a cada gráfico. Reutiliza motores y contratos existentes. Mantén fórmulas en Python, QAQC/trazabilidad y referencias científicas explícitas. No añadas catálogos de botones sin función ni afirmes paridad completa con ioGAS. Ejecuta las pruebas relevantes y muestra el resultado visual; documenta cambios y limitaciones. Preserva el directorio de datos indicado, que contiene importaciones reales aunque su nombre diga test-data.

## Actualización 5 oct 2026 — sistema de diseño v2 (ADR-0007)

- Geoquímica migrada a tokens semánticos (`bg-panel`, `text-muted`, `border-line`, `bg-accent-strong`…): `GeochemistryScreen`, todo `components/geochemistry/`, y lo que DATA ANALYSIS muestra (DataScreen, QuickToolsRibbon, DataGrid, DataPreviewPanel, SummaryTilesBar, ColumnFilterMenu, AnalysisHistoryPanel, analysis-results/, ventanas de preparación/QAQC). Tema oscuro sigue por defecto.
- Barra de grupos con íconos y descripción; Editor en secciones plegables (Variables y unidades · Apariencia · Color y tamaño por valor · Categorías · Sesión), contador de entradas mapeadas, unidad junto a cada columna.
- **Símbolo «Uno por categoría»** (`AUTO_SYMBOL` en `lib/geochemistry-attributes.ts`) es el nuevo valor por defecto: cada categoría recibe color y forma. Sesiones antiguas conservan su símbolo. Tabla de categorías con n por categoría y 8 formas.
- Resultados: chips de calidad (Total/Válidas/No válidas/QAQC), conmutador Gráfico/Tabla, exportación agrupada; leyenda de «Color por valor» con histograma y n por clase (`lib/color-legend.ts`, misma regla de clases que `build-geo-chart.ts`, con tests).
- Todos los gráficos usan `@/components/ThemedPlot`; las líneas de campos de clasificación (#52525b) se remapean al color de campo del tema.
- Validado: typecheck, vitest (129) y vite:build; capturas en navegador con RPC simulado. **Sin verificar con el servicio Python real ni en Tauri.**

## Actualización 5 oct 2026 — Fase 1: navegación por áreas (sin cambios de backend)

- **Cinta por áreas** en Geoquímica: Datos y análisis (Datos · QA/QC · Estadística · Multivariado · Gráficos), Litogeoquímica (Clasificación · Series magmáticas · Alúmina · Variación · Trazas y normalización), Exploración mineral (Fertilidad · Alteración · Pathfinders), Secciones y mapas (Interpolación: isovalores IDW). Se construye desde `geochemistry.registry` con `ribbonFor()`; `PLACEMENT` en `lib/geochem-areas.ts` decide el grupo por `module/family` **sin renombrar ids canónicos**. Una familia nueva aparece sola en el grupo por defecto de su módulo. Solo se listan herramientas implementadas y vistas existentes (tabla, resumen, correlaciones, PCA, K-means, anomalías, IDW).
- **Pestaña contextual «Herramienta»** cuando hay una herramienta del Registry abierta: Calcular, Restablecer, Actualizar columnas, Editor, Guardar/Abrir sesión y **Referencia** (fórmula y cita del catálogo, sin texto inventado).
- **Rail contextual** (Proyecto · Editor · Historial): paneles flotantes que se cierran con Esc o se fijan con el botón de anclar. Proyecto lista datasets, dataset activo, filas/columnas y CRS (`spatialConfig.projected_epsg`).
- **Punto gris** en un botón = el dataset activo no tiene columnas compatibles con alguna entrada declarada (`allowed_roles`/`allowed_analytes`, misma regla que el Editor vía `anyColumnMatches` en `lib/semantic-roles.ts`). Es informativo: la herramienta sigue abriendo.
- **Menú Archivo** con lo que existe hoy: Importar datos, Idioma, Tema. El archivo de proyecto `.orex` llega en una fase posterior; no tiene botón.
- Estado de la cinta persistido en `localStorage` (`pyorex.shell.v1`: área, vista por área, editor, anclaje) e idioma en `pyorex.lang`. Los enlaces antiguos por `activeModuleId` (`data`, `diagrams`, `litogeochemistry`, `mineral-exploration`) se traducen con `legacyTarget()`.
- `Workbench` acepta `toolId` + `ribbon`; `DataAnalysisWorkspace` y `ExplorationWorkspace` aceptan `active` (ocultan su barra interna). Sin esas props se comportan como antes. Corregido: seleccionar una herramienta mientras `load()` estaba en curso invalidaba la petición y dejaba «Cargando…» indefinidamente; el efecto ahora lee el store fresco.
- Pendiente de traducir: textos internos de Editor/Results/DataScreen (siguen en español). Fases siguientes: motor visual, datos/.orex/expresiones, Builder + catálogo, secciones y mapas reales.
- Validado: typecheck, vitest (164) y vite build; capturas en navegador con RPC simulado. **Sin verificar con el servicio Python real ni en Tauri.**

## Actualización 5 oct 2026 — Fase 2: motor visual (ventanas, selección enlazada, capas)

- **Ventanas flotantes** (`stores/geo-windows-store.ts`, `components/geochemistry/GeoCanvas.tsx`, `GeoChartWindow.tsx`): en modo cinta cada herramienta del Registry abre su propia ventana sobre el lienzo de su área (mover, redimensionar, minimizar, duplicar, mosaico, cascada, cerrar todas). Pulsar de nuevo una herramienta enfoca su ventana. Se guardan por dataset en `localStorage` (`pyorex.geo.windows.v1`: geometría, configuración, presentación, capas y clases); **los resultados no se guardan**: al reabrir se recalculan con el motor.
- **Editor ↔ ventana activa**: el Editor sigue editando `geochemistry-store`; `bindEditor` refleja ahí la ventana activa y una suscripción devuelve los cambios solo a la ventana enlazada (`editorBoundTo`). Una recarga del catálogo o un cambio de dataset invalida el enlace y se vuelve a enlazar; nunca se enlaza una ventana a un Editor cargado con otro dataset. Cálculos en segundo plano (`runWindow`) se descartan si la configuración cambió mientras corrían. AutoRun conserva la regla previa (solo herramientas del grupo de catálogo `diagrams`) y no recalcula una ventana que ya tiene resultado.
- **Selección enlazada** por `row_index` (se añadió `customdata` a cada punto en `build-geo-chart.ts`): lazo, rectángulo, clic (Mayús/Ctrl alterna) y clic en filas de la tabla de la ventana. Se resalta en todas las ventanas del dataset (histograma: superposición con los mismos bins), contador en la barra de estado, **Aislar** (solo presentación) y **Limpiar**.
- **Clases de usuario**: «Crear clase» convierte la selección en una clase con nombre y color (una muestra pertenece a una sola clase); se gestionan en Proyecto (seleccionar, añadir selección, renombrar con doble clic, eliminar). «Color por clase» reagrupa la presentación de todas las ventanas. No crea columnas ni cambia datos; persistir clases como columna del dataset queda para la fase 3 (.orex).
- **Pestaña contextual «Estilo»**: Elipses 95 %, Regresión, Densidad, Envolventes, Marginales (solo renderers XY de puntos: `scatter`, `assay`, `difference`), Etiquetas, Leyenda, modo de selección, Aislar/Limpiar/Color por clase/Crear clase y Ventanas.
- **Capas = guías visuales** (`lib/chart-layers.ts`, con tests): elipse de covarianza muestral con χ²(2)=5,991; envolvente convexa; recta MCO con R² y n por grupo (rotulada «guía visual»); histograma 2D de densidad; marginales. En ejes log se calculan en log10. No forman parte del resultado, del JSON ni del CSV; si una estadística debe reportarse, va al motor Python con sus métricas de calidad.
- Validado: typecheck, vitest (190) y vite build; capturas en navegador con RPC simulado (TAS, Harker con capas, lazo enlazado, clase, histograma, recarga, inglés). Revisión de código con un segundo agente; se corrigieron 3 carreras de sincronización que encontró. **Sin verificar con el servicio Python real ni en Tauri.**
- Pendiente: selección enlazada con la grilla de «Tabla y preparación» (DataGrid), estilos por ventana en el JSON de sesión, traducción de Editor/Results.

## Actualización 5 oct 2026 — Fase 3: proyecto .orex, importación única, variables y CRS

**Backend (sin tocar cálculos científicos)**
- `analysis/project/orex.py` + `app/routers/project_rpc.py`: `project.save`, `project.open` y `project.inspect`. Un `.orex` es un ZIP con `manifest.json` (formato `pyorex-project` v1), `state.json` (estado del escritorio) y, por dataset, `datasets/<id>.parquet`, `.meta.json` y `.ops.json`, copiados byte a byte.
- Escritura atómica con fsync. Lectura defensiva: solo esos miembros, límites de tamaño y de razón de compresión, versión más reciente rechazada y sha256 por dataset. Todo se verifica antes de escribir nada.
- Al abrir no se sobrescribe nada local distinto: si el id existe con otros datos, otra capa de edición o otra metadata del usuario (roles, coordenadas), se restaura con id nuevo y `id_map` remapea el estado.
- `geochemistry.set_column_role`: corrección de rol semántico (y analito) guardada en `semantic_overrides` de la metadata. `column_roles` la aplica con `source='user'`, confianza alta; una corrección inválida o vieja nunca rompe la clasificación. `semantics.validate_override`/`with_override`.
- El clasificador ahora reconoce `Este`/`Norte` (UTM_Este, Norte_PSAD56…) como tokens completos, nunca subcadenas como «Oeste».
- `data.set_spatial_config`: asigna columnas X/Y y CRS, solo metadata, sin reproyectar. `projected_xy` exige CRS proyectado (validado con pyproj).
- `storage.mutate_metadata` serializa las escrituras de metadata (lock, temp único, fsync). `delete_dataset` ahora borra también `.ops.json`, para que una capa de edición no reviva en un dataset restaurado con el mismo id.
- Contratos: `packages/ipc-contracts/project/{save,open,inspect}.v1.json`, `geochemistry/set_column_role.v1.json` y `data/set_spatial_config.v1.json`. Métodos añadidos a la allowlist de `analytics_bridge.rs`. Pruebas: `tests/test_project_orex.py` y `tests/test_column_role_override_and_spatial.py` (773 pytest en verde).

**Frontend**
- Menú Archivo: Nuevo proyecto, Abrir proyecto… (Ctrl O), Guardar proyecto (Ctrl S), Guardar como… e Importar datos….
- La cabecera muestra el nombre del `.orex` y «cambios sin guardar». La marca se calcula comparando la huella del estado (`lib/project-state.ts`) con la última guardada, más los cambios del lado del servicio (roles, CRS, operaciones de tabla) notificados por `lib/project-events.ts`.
- Si hay cambios sin guardar, abrir o crear otro proyecto pregunta antes. En modo navegador de desarrollo se pide la ruta en un cuadro propio, porque no hay diálogos nativos.
- `stores/project-store.ts`: pertenencia de datasets al proyecto (casillas en Proyecto; un dataset importado entra solo), CRS del proyecto, guardado y apertura. Al abrir recarga todos los stores, incluido el del Editor, para que su autoguardado no pise lo restaurado.
- Importación única (`components/ProjectDialogs.tsx` → `ImportHub`) con cuatro tipos:
  - Geoquímica: asistente existente.
  - Espectros nativos y Resultados procesados: abre Espectrometría y su asistente. Si no hay proyecto espectral, se crea o abre ahí mismo.
  - Proyecto `.orex`.
  - TSG nativo no se ofrece porque no hay lector.
- Proyecto → Variables: columnas agrupadas por rol (óxidos mayores, trazas, REE, ensayes/razones, coordenadas, sondaje, identificadores, categóricas, sin clasificar), cuántas herramientas por área tienen datos compatibles, y corrección de rol con analito («corregido» / «Automático»). Store compartido: `stores/column-roles-store.ts`.
- Proyecto → Coordenadas: geometría, columnas X/Y, CRS del dataset y CRS del proyecto (con aviso si difieren). Lista de EPSG frecuentes en Perú (WGS 84 y PSAD56, UTM 17–19S) o cualquier código.
- Validado: typecheck, vitest (196), vite build y pytest (773). Prueba de punta a punta en navegador **contra el servicio Python real**, con un CSV de demostración (no datos del usuario):
  - TAS y Harker calculados por el motor;
  - rol corregido;
  - CRS asignado;
  - `.orex` guardado;
  - dataset borrado del servicio y localStorage limpio;
  - proyecto reabierto: dataset, ventanas, agrupación, corrección de rol y CRS restaurados, y «guardado» correcto.

  Revisión de código con un segundo agente; se corrigieron 8 hallazgos (escrituras concurrentes de metadata, metadata del proyecto ignorada al reabrir, capa de edición resucitada, Editor con estado viejo, marca de cambios, diálogos dobles, sobrescritura al añadir `.orex`, importación parcial). **Sin verificar en Tauri.**
- Pendiente: las expresiones libres como ejes se harán en el Builder (fase 4). Las columnas calculadas siguen en «Tabla y preparación». Faltan una lista de proyectos recientes y traducir los textos internos de los asistentes de espectrometría.

## Actualización 5 oct 2026 — Tamaño por clases (símbolos graduados)

Pedido del usuario: elegir él mismo los límites y la cantidad de clases (4, 5 o 6) para el tamaño por valor (p. ej. Cu ppm). Solo presentación: no cambia resultados, tablas ni exportaciones; sin cambios de backend.

- `lib/size-classes.ts` (+ `size-classes.test.ts`): cortes por cuantiles, intervalos iguales, Jenks o manual; escala log10; validación de límites manuales (cantidad, número, >0 en log, estrictamente crecientes; si no son válidos se usan cuantiles); regla de clase `x ≥ b` → clase superior; diámetros `min + (max − min)·sqrt(k/(n−1))` (área pareja); conteo por clase y «sin dato».
- `lib/chart-presentation.ts`: `sizeMode: 'classes'` y campos `sizeClasses`, `sizeMethod`, `sizeBreaks`, `sizeMin`, `sizeMax`, `sizeLog`. `lib/geochemistry-session.ts` los sanea al cargar sesiones.
- `lib/build-geo-chart.ts`: tamaños por clase y `sizeLegend`; `GeoChartWindow.tsx` y `Results.tsx` (`SizeLegend`) dibujan la leyenda (círculo, rango, n).
- UI: flyout «Estilo» del rail (`GeoRail.tsx`, `StylePanel`) con `components/geochemistry/SizeClassControls.tsx`: variable (X, Y o columna numérica), clases 4/5/6, método, log, mín./máx., histograma con cortes arrastrables y tabla con límites editables (Enter o salir del campo aplica; errores en rojo, no se aplican). Abre también desde la cinta (Estilo → «Tamaño por clases») y desde «Ejes, paleta y tamaño» de la ventana.
- Verificado: `tsc --noEmit`, `vitest` 208/208, `vite build` y prueba en navegador contra el servicio Python real (Harker, Cu_ppm, 4 clases con 50/150/400 y 6 clases Jenks).

### Ampliación: hasta 20 clases, percentiles o valores y rangos guardados (como ioGAS)

- Pedido del usuario: no limitar a 6 clases y poder definir los cortes por percentil o por valor en ppm (u otra unidad), como el *Bin Range Editor* de ioGAS.
- `lib/size-classes.ts`: de 2 a 20 clases (`MIN_CLASSES`, `MAX_CLASSES`); métodos nuevos `series` (1-2-5 absoluta), `percentile` (`sizePercentiles`, 0–100 exclusivo) y `manual` (valores). También `sizeBoundary` (`up`: un valor igual al límite va a la clase superior; `down`: va a la inferior, como ioGAS). Helpers nuevos: `percentileOf`, `percentBelow`, `seriesBreaks`, `classRange`, `unitOf` y `suggestBreak`. Los cuantiles se calculan ahora en unidades de datos, también con log.
- `stores/bin-ranges-store.ts`: rangos con nombre (percentiles o valores con unidad), predefinidos fijos y propios persistidos en localStorage (`pyorex-bin-ranges`).
- UI (`SizeClassControls.tsx`):
  - selector de clases con − / + para los métodos calculados;
  - tabla con columnas Hasta (unidad) y P %, ambas editables, y botón × por corte;
  - «+ Agregar corte»;
  - «Rangos guardados» y «Guardar como rango»;
  - selector «Valor igual al límite»;
  - aviso cuando hay más de 7 clases.
- Sesiones: `sanitizePresentation` valida `sizeClasses` 2–20, `sizePercentiles` y `sizeBoundary`.
- Verificado: `tsc`, `vitest` 219/219, `vite build` y prueba en navegador (10 cuantiles; rango 50-75-90-95-98; valores 38/50/100/150/200/250 ppm con «clase inferior» y guardado como «Cu umbrales»).

### Ampliación: color por valor con las mismas clases

- `lib/size-classes.ts`:
  - las reglas de clase son genéricas (`ClassSettings`, `resolveBreaks`, `classLegend`, `classesFor`);
  - tamaño las usa con `sizeClassSettings`.
- `lib/color-classes.ts` (+ tests):
  - `colorClassSettings`, rampas `COLOR_RAMPS`, `rampColors` (interpolación RGB) y `colorClassLegend`;
  - colores a mano por clase (`colorCustom`, válidos solo si coincide el número de clases);
  - gris `MISSING_COLOR` para muestras sin dato.
- `ChartPresentation`:
  - campos `color*` (`colorClasses`, `colorMethod`, `colorBreaks`, `colorPercentiles`, `colorLog`, `colorBoundary`, `colorRamp`, `colorReverse`, `colorCustom`);
  - el valor por defecto son 5 intervalos iguales, la misma regla que antes;
  - `sanitizePresentation` los valida.
- `build-geo-chart.ts`: `colorLegend` es ahora `ColorClassLegend & {label}` o null, en lugar de 5 intervalos fijos.
- `Results.tsx` (`ColorLegend`):
  - histograma coloreado por clase y rango + n por clase;
  - `lib/color-legend.ts` queda sin uso; se mantiene con sus pruebas.
- UI: `components/geochemistry/ClassControls.tsx` (`kind: 'size' | 'color'`) es el panel común.
  - El color se elige en el flyout «Estilo» (sección «Color por valor») y en la cinta, grupo «Tamaño y color».
  - En la tabla, los límites pendientes se aplican juntos cuando el conjunto queda válido; así se pueden escribir uno por uno.
- Verificado: `tsc`, `vitest` 224/224, `vite build` y prueba en navegador:
  - Cu_ppm con 8 intervalos iguales;
  - deciles con viridis;
  - valores 50/100/150/200/250 ppm con un color cambiado a mano;
  - el tamaño por clases sigue igual.

## Actualización 6 oct 2026 — Fase 4 (primera parte): Diagram Builder y biblioteca de diagramas

**Qué hace.** Diagramas definidos por el usuario:

- XY o ternarios;
- cada eje es una expresión libre sobre las columnas (`Sr_ppm/Y_ppm`, `log10(Cu_ppm)`, `(Na2O_pct+K2O_pct)/Al2O3_pct`, `[Cu ppm]/10000`);
- en XY, campos de clasificación (polígonos en coordenadas del diagrama) que clasifican cada muestra.

Se dibujan con el mismo pipeline que las herramientas del catálogo: ventanas, capas, selección, clases, tamaño y color por clases, sesiones y exportación.

**Backend** (`services/analytics`):

- `analysis/geochemistry/custom_diagram.py`:
  - `DiagramSpec` y `DiagramField`, pydantic estricto (`extra='forbid'`);
  - `parse_expression`: valida con `analysis/data/formula.parse_and_validate` (AST en lista blanca, sin atributos ni importaciones; funciones log10/log/sqrt/abs/exp/IF); los nombres de columna van entre [corchetes] y los mensajes se traducen al español;
  - `evaluate`: traduce a Polars; los valores censurados (`_nulltype_*`) y los faltantes quedan inválidos con motivo; nada se imputa; un resultado no finito es inválido;
  - `calculate_custom`: misma forma de resultado que `engine.calculate`; ternario normalizado a 100; validación de log; clasificación con `engine.in_polygon`; QAQC excluido por defecto;
  - `preview`.
- `ComputeRequest` acepta `diagram` (solo con `tool='custom-diagram'`). `engine.calculate` la deriva a `calculate_custom`. Las herramientas del catálogo no cambian: su `pipeline` excluye `diagram`.
- `geochemistry.compute` quita las columnas ocultas antes de evaluar un diagrama propio.
- Nuevo RPC `geochemistry.diagram_preview`:
  - handler en `app/routers/geochemistry_rpc.py`;
  - contrato `packages/ipc-contracts/geochemistry/diagram_preview.v1.json`;
  - entrada en `ALLOWED_RPC_METHODS`.
- El contrato `compute.v1.json` se regeneró con el campo `diagram`.
- Pruebas: `tests/test_custom_diagram.py`.

**Frontend** (`apps/desktop/src`):

- `lib/custom-diagrams.ts`: formato `DiagramDef` (spec + área + carpeta + log por defecto), saneado, `configFor`, vértices, `columnRef`, plantillas adaptadas a las columnas del dataset y archivo de biblioteca `pyorex.diagrams` v1.
- `CUSTOM_TOOL` se agrega en el frontend al catálogo del store; el catálogo del backend no cambia.
- `stores/diagram-library-store.ts`: biblioteca persistida (`pyorex.diagrams.v1`) y diálogos abiertos.
- `lib/project-state.ts`: la biblioteca viaja en el `.orex` (`state.diagrams`); al abrir, la versión del proyecto reemplaza a la local con el mismo id.
- `stores/geo-windows-store.ts`: `openDiagram` (una ventana por diagrama y área) y `syncDiagram` (al editar, las ventanas abiertas se recalculan).
- `GeoCanvas` no abre ventanas vacías de `custom-diagram`.
- UI:
  - `components/geochemistry/DiagramDialogs.tsx`: Builder con comprobación en vivo, inserción de columnas y funciones, campos con vista previa, y Biblioteca con abrir, editar, duplicar, exportar, importar y eliminar;
  - cinta: grupo «Mis diagramas» en Datos, Litogeoquímica y Exploración; «Editar diagrama» en la pestaña Herramienta;
  - el Editor muestra las expresiones.
- `build-geo-chart.ts`: las etiquetas de campo en ejes log se ubican en unidades log10. Antes salían fuera de escala.
- `Modal` de `ProjectDialogs.tsx` ahora se exporta.

**Verificado:**

- `tsc`, `vitest` 232/232, `vite build` y `pytest` 788/788;
- navegador contra el servicio real:
  - La/Yb vs Yb con dos campos;
  - mensajes de error;
  - ternario Rb–Sr/10–Cu;
  - biblioteca;
  - recarga de la página;
  - edición con log Y.

**Pendiente:**

- dibujar campos con el ratón;
- campos en ternarios;
- publicación en el Hub.

Las plantillas no traen campos bibliográficos a propósito, para no inventar coordenadas.

## Actualización 6 oct 2026 — Clasificar por cualquier categoría del dataset

- Por decisión del usuario no hay botones rápidos: un solo selector, para mantener la interfaz simple.

- Pedido del usuario: en «Categorías» elegir la columna del dataset que clasifica las muestras (AÑO, CAMPAÑA, LITOL, ALTERACION, etc.).
- `lib/category-columns.ts` (+ tests) decide qué columnas sirven como categoría:
  - columnas de texto;
  - columnas numéricas que son etiquetas (rol `categorical`, `numeric_generic` o sin rol, o nombres como año, campaña, fase, código, tipo, zona, unidad).
  - Se excluyen ID de muestra, coordenadas, profundidades y analitos.
  - Las herramientas con `group_allowed_roles` (perfiles de sondaje) mantienen su restricción.
- `components/geochemistry/AttributeEditor.tsx`:
  - selector «Clasificar por» con grupos (texto / numéricas);
  - al cambiar de columna se recalcula.
  - Los estilos por categoría siguen guardándose por columna (`attributeKey`), así que al volver a LITOL se recuperan sus colores.
- `Editor.tsx`: se quitó «Grupo / sondaje» de «Apariencia». Ahora está en «Categorías»; en perfiles de sondaje su etiqueta es «Sondaje».
- El motor no cambió. Sigue el límite de 50 categorías por columna, con el mensaje de error del backend.
- Verificado:
  - `vitest` 234/234 y `vite build`;
  - navegador con un dataset de prueba con AÑO, CAMPAÑA, LITOL y ALTERACION, en Harker, cambiando LITOL → ALTERACION → AÑO.

## Actualización 6 oct 2026 — Ediciones (planes) aplicadas por el motor

Ver `docs/CONTINUAR_PYOREX.md`, sección 5b. Archivos:

- backend: `analysis/licensing/plans.py`, `app/routers/rpc.py` (despachador y `app.plan`), `analysis/data/storage.py` (`check_rows`), `analysis/project/orex.py`, `tests/test_plans.py`, `packages/ipc-contracts/app/plan.v1.json` y `analytics_bridge.rs`;
- frontend: `stores/plan-store.ts` (+ test), `App.tsx`, `components/GeochemistryScreen.tsx`, `components/geochemistry/GeoRail.tsx`, `stores/project-store.ts` y `lib/i18n.ts`.

Verificado:

- `pytest` 802/802, `vitest` 235/235 y `vite build`;
- con `PYOREX_PLAN=demo`:
  - importar 644 muestras → rechazado;
  - Espectrometría → bloqueada;
  - menú de proyecto deshabilitado;
  - barra de estado «PyOreX Demo · hasta 500 muestras por dataset».

## Actualización 6 oct 2026 — Fase 4 completa: campos ternarios y dibujo con lazo

- **Backend** (`custom_diagram.py`):
  - campos ternarios con vértices [A, B, C], normalizados a 100 y clasificados en el triángulo (A arriba, B abajo a la izquierda, C abajo a la derecha);
  - en XY con ejes log, puntos y vértices se clasifican en log10, con bordes rectos en escala log, igual que en el gráfico;
  - errores claros si un vértice no tiene las dimensiones del tipo de diagrama o es ≤ 0 en eje log.
- **Frontend:**
  - `build-geo-chart.ts` dibuja los campos ternarios como `scatterternary`, con su etiqueta;
  - Builder: vértices «A, B, C» y vista previa en el triángulo;
  - Herramienta → «Dibujar campo» (`diagram-library-store.drawing`): en esa ventana el lazo traza el contorno en vez de seleccionar;
  - `simplifyOutline` reduce el lazo a ≤ 40 vértices con Ramer–Douglas–Peucker en la escala de los ejes;
  - `ternaryFromCartesian` convierte el marco interno del ternario de Plotly (x = C − B, y = A);
  - el campo se nombra y se agrega a la biblioteca, y la ventana se recalcula.
- **Verificado:** `pytest` 804/804, `vitest` 237/237, `vite build` y navegador (rectángulo en La/Yb vs Yb y triángulo en un ternario Rb–Sr/10–Cu, con los vértices guardados revisados).
