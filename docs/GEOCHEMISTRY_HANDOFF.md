# PyOrex — Continuidad para Claude Code

Actualizado: 20 de septiembre de 2026. Repositorio: `C:/Users/braya/projects/pyorex-desktop`.

## Instrucciones prioritarias del usuario

- Navegación principal únicamente **GEOQUÍMICA / ESPECTROMETRÍA / PETROFÍSICA**. No restituir Andean Hub, View, File o Data como módulos principales.
- Geoquímica contiene **DATA ANALYSIS / DIAGRAMS / Litogeoquímica / Exploración**. DATA ANALYSIS reúne preparación y estadística. No crear otra pantalla paralela de datos.
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
| Navegación | `apps/desktop/src/App.tsx`, `stores/app-store.ts`, `components/GeochemistryScreen.tsx`: tres módulos, redirección de entradas antiguas, grupos internos y dataset activo |
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
