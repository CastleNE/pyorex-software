# PyOreX v2 — Guía para continuar (con ChatGPT, Claude u otra persona)

Fecha: 5 oct 2026. Repositorio local: `C:\Users\braya\projects\pyorex-desktop`.
Este archivo resume dónde quedó el trabajo y qué sigue. Detalle técnico por fase: `docs/GEOCHEMISTRY_HANDOFF.md` (secciones «Fase 1», «Fase 2» y «Fase 3»).

## 1. Estado

- Las **fases 1, 2 y 3, el tamaño y color por clases y la primera parte de la Fase 4 (Diagram Builder) están escritos en el repositorio local**, pero **no hay commit en git**. Antes de seguir, revísalas con `git status` / `git diff`. Si estás conforme, haz commits separados (sugerencia de mensajes en la sección 7).
- Verificado en la nube con copias de estos archivos: `tsc --noEmit` sin errores, `vitest` 258/258, `vite build` correcto y `pytest` 822/822. Prueba de punta a punta en navegador contra el servicio Python real.
- **No verificado:** el empaquetado de escritorio (Tauri) ni los diálogos nativos de abrir y guardar.
- El **prototipo visual aprobado** (referencia de diseño, no es la app) está en `docs/prototype-v2/`. Ábrelo con `pyorex-v2.html` en el navegador, o mira el código fuente en `src/`, que corre con `npm i && npm run dev`.

## 2. Cómo arrancar y verificar

```bash
# Frontend (desde la raíz)
pnpm install
pnpm --filter @pyorex/desktop exec tsc --noEmit
pnpm --filter @pyorex/desktop exec vitest run
pnpm dev                              # Vite/Tauri

# Servicio Python (otra terminal)
cd services/analytics
python -m pytest -q                   # 804 pruebas
# Arranque: ver «Arranque local» en docs/GEOCHEMISTRY_HANDOFF.md (puerto 5174, PYOREX_DATA_DIR)
```

En modo navegador (Vite sin Tauri), `/rpc` se reenvía a `http://127.0.0.1:5174`. Abrir y guardar proyecto piden la ruta en un cuadro propio porque no hay diálogo nativo.

## 3. Reglas que no se pueden romper

1. **No borrar ni reemplazar** el directorio de datos reales `geochemistry-test-data`, aunque su nombre diga test.
2. Nada de `git reset`/`checkout` masivos. No adjudicarse cambios ajenos de `git status`.
3. Los cálculos científicos van en Python, con métricas de calidad. El frontend solo presenta: capas, colores y tamaños nunca cambian resultados ni exportaciones.
4. No añadir botones para capacidades que no existen.
5. Cada método RPC nuevo necesita tres cosas:
   - el handler en `services/analytics/app/routers/*`;
   - un contrato en `packages/ipc-contracts/<dominio>/<método>.v1.json`;
   - su entrada en `ALLOWED_RPC_METHODS` de `apps/desktop/src-tauri/src/analytics_bridge.rs`.

   Hay pruebas que fallan si falta alguna.
6. La interfaz es bilingüe: todo texto nuevo va en `apps/desktop/src/lib/i18n.ts` (claves `useT`) o en línea con `L({es,en})` (`useL()` en componentes, `tx()` fuera de ellos). El español es canónico y no se cambia (las pruebas lo buscan). Los ids del Registry no se traducen ni se renombran; los nombres en inglés de las herramientas están en `lib/tool-labels.ts`.
7. Finales de línea: `App.tsx`, `components/GeochemistryScreen.tsx` y `docs/GEOCHEMISTRY_HANDOFF.md` usan CRLF; el resto, LF.

## 4. Mapa rápido de lo nuevo (frontend `apps/desktop/src`)

| Tema | Archivos |
|---|---|
| Cinta por áreas, rail y barra de estado | `components/GeochemistryScreen.tsx`, `components/geochemistry/GeoRibbon.tsx`, `GeoRail.tsx`, `lib/geochem-areas.ts`, `stores/shell-store.ts` |
| Ventanas flotantes, selección enlazada y clases | `stores/geo-windows-store.ts`, `components/geochemistry/GeoCanvas.tsx`, `GeoChartWindow.tsx` |
| Capas (elipses, regresión, densidad, envolventes, marginales) | `lib/chart-layers.ts` (+ tests) |
| Proyecto `.orex` | `stores/project-store.ts`, `lib/project-state.ts`, `lib/project-api.ts`, `lib/project-events.ts`, `components/ProjectDialogs.tsx` |
| Variables y coordenadas | `components/geochemistry/VariablesPanel.tsx`, `stores/column-roles-store.ts`, `lib/variables-api.ts` |
| Backend | `analysis/project/orex.py`, `app/routers/project_rpc.py`, `geochemistry.set_column_role`, `data.set_spatial_config` |

## 5. HECHO — Tamaño y color por clases (pedido explícito del usuario)

> «Aquí el tamaño por el valor de Cu NECESITO QUE ME PERMITAN A MÍ PONER QUÉ LÍMITES Y LA CANTIDAD DE CLASES (4, 5 O 6)»

Implementado en la app real (solo presentación, sin cambios de backend). Detalle en `docs/GEOCHEMISTRY_HANDOFF.md`, sección «Tamaño por clases».

- **Dónde se usa:** rail izquierdo → «Estilo», o cinta → pestaña Estilo → «Tamaño por clases». También desde «Ejes, paleta y tamaño» de cada ventana (opción «Por clases»).
- **Qué ofrece** (parecido a los *bin ranges* de ioGAS):
  - variable: X, Y o cualquier columna numérica (p. ej. `Cu_ppm`); la unidad se lee del nombre (ppm, ppb, %, g/t);
  - **2 a 20 clases**;
  - límites por cuantiles, intervalos iguales, cortes naturales (Jenks) o serie 1-2-5 absoluta;
  - **límites propios por percentil** («Mis percentiles») **o por valor en la unidad** («Mis valores (ppm)»): en la tabla se escribe el valor o el percentil de cada corte, y se agregan o quitan cortes;
  - **rangos guardados:** predefinidos (deciles, quintiles, cuartiles, 50-75-90-95-98, colas 2-…-98) y propios con nombre («Guardar como rango»), guardados en el equipo (`stores/bin-ranges-store.ts`, localStorage);
  - valor igual al límite: clase inferior (como ioGAS, «boundary cases go down») o superior;
  - escala log10, tamaño mínimo y máximo, histograma con cortes arrastrables y leyenda en el gráfico.
- **Color por valor** usa las mismas clases. Está en el panel «Estilo» (sección «Color por valor») y en la cinta → Estilo → «Color por valor». Ofrece:
  - columna;
  - 2 a 20 clases;
  - los mismos métodos, percentiles o valores propios y rangos guardados (compartidos con tamaño);
  - valor igual al límite, log10;
  - rampa de color (arcoíris, viridis, inferno, calor, azules, tierra, divergente), invertir y color de cada clase a mano;
  - leyenda con histograma coloreado.

  Por defecto son 5 intervalos iguales, como antes. Sin dato: gris.
- **Archivos:** `lib/size-classes.ts` (+ tests), `lib/color-classes.ts` (+ tests), `components/geochemistry/ClassControls.tsx` (panel común de tamaño y color; `SizeClassControls.tsx` solo lo envuelve), `stores/bin-ranges-store.ts` (+ tests), `components/geochemistry/SizeClassControls.tsx`, `GeoRail.tsx` (`StylePanel`), `GeoRibbon.tsx`, `ChartControls.tsx`, `GeoChartWindow.tsx`, `Results.tsx` (`SizeLegend`), `lib/build-geo-chart.ts`, `lib/chart-presentation.ts`, `lib/geochemistry-session.ts`, `stores/shell-store.ts`, `lib/i18n.ts`.
- **Pendiente opcional:** atenuar en la leyenda las clases ocultas y llevar lo mismo al prototipo (`docs/prototype-v2/`).

## 5b. Ediciones (planes) — HECHO, paso 1 del plan de lanzamiento

Decisión de producto:

- **Web:** demo solo de Geoquímica, hasta 500 muestras por dataset y sin proyectos `.orex`.
- **Escritorio, de pago:**
  - «Geoquímica Pro»: geoquímica sin límite y proyectos;
  - «Completo»: Pro + Espectrometría;
  - «Académico»: igual a Completo.

**Funcionamiento:**

- El **motor** aplica el plan; la interfaz solo lo refleja.
- Definición de los planes: `services/analytics/analysis/licensing/plans.py`. Agregar una función premium = agregar su `feature` ahí y la regla en `METHOD_FEATURES`.
- El plan sale de la variable `PYOREX_PLAN` (`demo`, `geochem`, `full`, `academic`).
  - Sin variable, el plan es `full`: escritorio en desarrollo, hasta que existan licencias firmadas.
  - Un valor desconocido se trata como `demo`.
- **Dónde se aplica:**
  - el despachador RPC revisa cada método: `spectrometry.*` requiere el módulo; `project.*` requiere el feature `projects`; cualquier llamada con `dataset_id` respeta el límite de muestras;
  - `storage.save_dataset` y la apertura de `.orex` rechazan datasets más grandes que el límite.
  - Error JSON-RPC `-32010` con un mensaje claro en español.
- Nuevo RPC `app.plan`:
  - contrato `packages/ipc-contracts/app/plan.v1.json`;
  - entrada en `ALLOWED_RPC_METHODS`;
  - pruebas en `tests/test_plans.py`.
- **Interfaz:**
  - `stores/plan-store.ts`;
  - barra de estado con la edición y el límite;
  - pestaña Espectrometría con aviso «no incluida en esta edición»;
  - Abrir y guardar proyecto deshabilitados con explicación, y el título del proyecto oculto cuando la edición no tiene proyectos.

**Siguientes pasos del lanzamiento:**

1. Motor empaquetado con Nuitka y arrancado por Tauri.
2. Demo web: subida de archivos en lugar de rutas, sesiones temporales y despliegue en pyorex.com con `PYOREX_PLAN=demo`.
3. Licencias firmadas y activación.

## 5c. Decisiones de producto (6 oct 2026)

- **PyOreX HUB sale del programa** y pasa a ser un producto aparte, solo web: **PyOrex Signals**, con noticias, buscador de proyectos de inversión, commodities, reportes e *intelligence report* con IA.
  - Se reutilizará la base de `hub.*` del escritorio.
  - Pendiente: quitar «Andean Exploration Hub» del escritorio cuando Signals exista.
- **Planes Free/Pro:** la capa de ediciones (sección 5b) queda hecha, pero la separación comercial se define después. Prioridad: **terminar Geoquímica**.

## 6. Hoja de ruta siguiente

- **Fase 4: Diagram Builder y catálogo — primera parte HECHA** (detalle en `docs/GEOCHEMISTRY_HANDOFF.md`, «Fase 4»).
  - **Hecho:**
    - diagramas propios XY o ternarios, con cada eje como expresión libre (`Sr_ppm/Y_ppm`, `log10(Cu_ppm)`, `[Cu ppm]/10000`);
    - evaluación segura en Python: AST en lista blanca de `analysis/data/formula.py` traducido a Polars; sin imputar faltantes ni censurados;
    - comprobación en vivo (`geochemistry.diagram_preview`);
    - campos de clasificación (polígonos) en diagramas XY, que clasifican cada muestra;
    - plantillas iniciales sin campos;
    - biblioteca «Mis diagramas» por área y carpeta, con exportar e importar `.json`, guardada también en el `.orex`.
  - El catálogo de diagramas ya está ordenado por área y grupo en la cinta desde la Fase 1.
  - **Hecho también (segunda parte):**
    - campos en diagramas ternarios (vértices «A, B, C»);
    - dibujar campos con el lazo sobre el gráfico (Herramienta → «Dibujar campo»);
    - en ejes log, los bordes de los campos son rectos en escala log, igual que se dibujan.
  - La publicación de diagramas en un Hub se descarta: compartir se hace exportando o importando la biblioteca `.json`.
- **Fase 5: Secciones y mapas.**
  - **Parte 1 HECHA — Mapa de muestras** (cinta «Mapas» → «Mapa de muestras»; reemplaza el formulario «Isovalores IDW»):
    - motor `maps.sample_map` (`analysis/maps/sample_map.py`, contrato `packages/ipc-contracts/maps/sample_map.v1.json`): muestras en sus coordenadas reales (configuración espacial del dataset; nunca se reproyecta), valor de una columna **o expresión** (sintaxis del Diagram Builder), categoría, controles QAQC excluidos por defecto; censurados/faltantes se dibujan en gris sin imputar;
    - superficie IDW opcional (reutiliza `exploration._idw`, dentro de la envolvente, sin extrapolar; opción log10 = ponderación geométrica para trazas); también en malla local;
    - frontend `components/maps/MapWorkspace.tsx` + `lib/build-map.ts` (+test) + `stores/map-store.ts` (ajustes por dataset, guardados también en el `.orex`): clases y rampa como en los gráficos, superficie e isolíneas con **las mismas clases**, escala 1:1 (lon/lat corregida por cos φ), barra de escala, flecha norte, leyenda, lazo con selección compartida, exportar PNG/SVG y CSV de muestras y malla;
    - sin coordenadas: el mapa ofrece asignarlas ahí mismo (Variables → Coordenadas).
  - **Parte 2 HECHA — Sección A–A'** (en el mapa: «Trazar sección» y arrastrar de A a A'; panel bajo el mapa):
    - motor `maps.section` (`analysis/maps/section.py`, contrato `packages/ipc-contracts/maps/section.v1.json`): proyección perpendicular de las muestras a menos de ancho/2 de la línea (distancia desde A, desvío a la derecha/izquierda), mismo valor/expresión, categoría y QAQC que el mapa; censurados sin imputar;
    - cota por columna, por **DEM** (`analysis/maps/dem.py`: ESRI ASCII `.asc` y GeoTIFF norte-arriba vía `tifffile`, muestreo bilineal, nunca se reproyecta; si el DEM declara otro EPSG se rechaza) o ninguna (solo perfil);
    - **sondajes**: cada intervalo a su profundidad media sobre un sondaje recto desde el collar (coordenadas y cota de la fila) con azimut e inclinación por columna o fijos; inclinación siempre hacia abajo; trazas proyectadas; no modela surveys curvos (se avisa);
    - topografía del DEM a lo largo de la línea o, sin DEM, de las cotas de muestras/collares en la banda;
    - frontend `components/maps/SectionPanel.tsx` + `lib/build-section.ts` (+test) + `lib/section-columns.ts` (+test, detecta cota y columnas de sondaje por rol o nombre): perfil de valores arriba y sección abajo con el mismo eje de distancia, **las mismas clases que el mapa**, exageración vertical, ancho de banda, invertir A/A', lazo con selección compartida, exportar PNG/SVG/CSV; la línea y su banda se dibujan en el mapa; ajustes por dataset (también en el `.orex`);
    - nueva dependencia Python: `tifffile` (en `pyproject.toml`; instalar con `pip install tifffile` en el entorno del motor).
  - De paso: las clases por cuantiles ya no repiten límites cuando hay muchos valores iguales (p. ej. en el límite de detección).
  - Siguiente: surveys de desviación (archivo collar/survey/assay), sección con superficie IDW vertical, mapas con *outlines* y exportar KML/GeoTIFF.
  - Después: *outlines* (polígonos de dominios), exportar KML/GeoTIFF.
- **Instalador de Windows — HECHO (falta generarlo en Windows):**
  - motor empaquetado: `services/analytics/pyorex_engine.py` (lanzador: puerto, carpeta de datos, registro, `--watch-stdin` para cerrarse con la app, `--check`) + `pyorex-engine.spec` (PyInstaller, carpeta, ~590 MB sin comprimir) + `scripts/smoke_engine.py` (prueba de humo: importar CSV/Excel, perfil, TAS, mapa + IDW, sección + DEM);
  - app: `src-tauri/src/engine.rs` arranca el motor incluido (`resources/engine/`) en un puerto libre de 127.0.0.1 con datos en `%LOCALAPPDATA%\com.pyorex.app\data` y registro en su carpeta de logs; lo cierra al salir. En `pnpm dev` (debug) no arranca nada y usa el motor manual en :5174, como antes. `PYOREX_ENGINE_URL` fuerza otra dirección;
  - `components/app/EngineGate.tsx`: pantalla de inicio «Iniciando el motor de cálculo…» hasta que el motor responde (con error, ruta del registro y Reintentar);
  - `tauri.conf.json`: instalador NSIS por usuario (sin admin), español/inglés, WebView2 con bootstrapper; iconos nuevos con el logo (`src-tauri/icons`);
  - generar: `powershell -ExecutionPolicy Bypass -File scripts\build-installer.ps1` (deja `apps\desktop\src-tauri\target\release\bundle\nsis\PyOrex_0.1.0_x64-setup.exe`) o, sin instalar nada, GitHub → Actions → «Instalador Windows» → Run workflow (`.github/workflows/build-windows.yml`; con un tag `v*` lo adjunta a una release);
  - verificado en Linux: el paquete arranca el motor desde los recursos, la app espera, responde, y el motor se cierra al cerrar la app;
  - sin firma de código: SmartScreen avisará «Editor desconocido». Firmar más adelante (certificado de código) antes de vender licencias;
  - los datos de desarrollo (`services/analytics/data`) no pasan a la app instalada: abrir el `.orex` o reimportar.
- **Pendientes menores:**
  - ~~selección enlazada con la grilla de «Tabla y preparación»~~ HECHO (resalta, Ctrl/Shift, «Solo selección»);
  - ~~traducir los textos internos de Geoquímica y Datos~~ HECHO (Editor, Results, Exploración, grilla, QAQC, ventanas de herramientas y nombres de herramientas). Sigue en español lo que sirve el motor: fórmulas/notas de cada herramienta, nombres de campos TAS/QAPF y advertencias. Falta: asistentes de espectrometría;
  - ~~rediseño de «Tabla y preparación»~~ HECHO: una barra (filas mostradas, columnas, avisos de calidad, Filtro, Columna ▾, Columna calculada, Mapa de calor, QAQC, deshacer/rehacer, Guardar cambios), **perfil de columnas** calculado en Python (`data.profile`: válidos, <LD, N.A., faltantes, mediana, rango, histograma —log10 en trazas muy sesgadas—, atípicos IQR, valores más frecuentes) que sigue los filtros y la selección de la tabla, y la tabla con toda la altura (ventanas flotan encima). La tabla oculta columnas internas (`_nulltype_*`, `__sample_type__`, `internal_feature_id`) y muestra «<LD»/«N.A.» en celdas censuradas. Quedaron sin uso y se pueden borrar: `components/DataPreviewPanel.tsx`, `components/QuickToolsRibbon.tsx`, `components/SummaryTilesBar.tsx`, `stores/data-preview-store.ts`;
  - corregido en el importador: con un centinela de <LD, las celdas vacías también quedaban marcadas como <LD, y dos centinelas en la misma columna se pisaban;
  - estilos por ventana en el JSON de sesión;
  - ~~proyectos recientes~~ HECHO (Archivo → Recientes: últimos 8 `.orex` abiertos o guardados, en este equipo; si el archivo ya no existe se quita solo);
  - lector de `.tsg` nativo (hoy no existe y por eso no se ofrece).

## 7. Commits sugeridos

```
feat(geoquimica): navegación por áreas, cinta contextual y shell bilingüe (fase 1)
feat(geoquimica): ventanas flotantes, selección enlazada, clases y capas visuales (fase 2)
feat(proyecto): archivo .orex, importación única, variables y CRS por dataset (fase 3)
feat(geoquimica): tamaño y color por clases (2–20) con límites por percentil o valor y rangos guardados
feat(geoquimica): Diagram Builder con ejes por expresión, campos propios y biblioteca de diagramas (fase 4)
feat(geoquimica): clasificar por cualquier columna de categoría del dataset (año, campaña, litología, alteración)
feat(planes): ediciones Demo/Pro/Completo/Académico aplicadas por el motor (PYOREX_PLAN, app.plan)
feat(geoquimica): campos ternarios y dibujo de campos con lazo en el Diagram Builder (fase 4 completa)
feat(datos): selección enlazada entre gráficos y la tabla de datos
feat(i18n): textos internos de Geoquímica y Datos en español e inglés, nombres de herramientas en inglés
feat(proyecto): proyectos recientes en el menú Archivo
feat(datos): «Tabla y preparación» con perfil de columnas (data.profile) y barra única; fix(importar): solo marca <LD donde estaba el centinela
feat(mapas): mapa de muestras con valor o expresión, categorías, superficie IDW e isolíneas por clase (maps.sample_map, fase 5 parte 1)
feat(mapas): sección A–A' con perfil de valores, DEM (GeoTIFF/ASC), sondajes rectos y topografía (maps.section, fase 5 parte 2)
build(windows): instalador NSIS con el motor Python empaquetado (PyInstaller), arranque/cierre automático del motor, iconos y CI
fix(importar): lectura de Excel con Polars 1.x (sheet_id)
```

## 8. Prompt de arranque para ChatGPT

> Eres el desarrollador de PyOreX, un software de escritorio para geoquímica (Tauri 2 + React 19 + TypeScript strict + Zustand 5 + Tailwind 4 + Plotly; motor en Python con FastAPI, Polars y pydantic).
>
> Lee primero, en este orden:
> 1. `CLAUDE.md`
> 2. `docs/CONTINUAR_PYOREX.md`
> 3. `docs/GEOCHEMISTRY_HANDOFF.md`
>
> Respeta las reglas de la sección 3 de la guía.
>
> Tarea: continúa con lo pendiente de la Fase 4 o con la Fase 5 (sección 6 de `docs/CONTINUAR_PYOREX.md`). El tamaño y color por clases y el Diagram Builder ya están hechos; no los rehagas.
>
> Cuando termines, verifica `tsc --noEmit`, `vitest` y `vite build`, y muéstrame qué cambió. No borres ni muevas `geochemistry-test-data`. Interfaz bilingüe español/inglés.
