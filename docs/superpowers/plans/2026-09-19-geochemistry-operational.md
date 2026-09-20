# Geoquímica — primera versión operativa

Objetivo autorizado: completar también litogeoquímica y diagramas. El usuario no dispone de referencias propias; acepta una primera versión operativa con métodos estándar y referencias explícitas. Mantener intactos datasets y cambios locales anteriores. Hub queda integrado; validación visual aún pendiente.

## Diseño y ejecución

1. Motor Python independiente `analysis/geochemistry`: catálogo explícito, solicitudes validadas, unidades por entrada, cálculos sin imputación silenciosa, exclusión QAQC configurable, identificador de muestra, métricas y configuración reproducible en cada resultado.
2. Diagramas: dispersión, histograma, cajas, ternario, Harker. Litogeoquímica: TAS con polígonos trazables, AFM, QAPF modal (proyección, no cálculo normativo), K2O-SiO2, MALI, Fe-index, Shand/A-CNK/A-NK, REE y manto primitivo, razones elementales, Sr/Y, La/Yb, Dy/Yb, Eu/Eu* y Ce/Ce*. Exploración: AI-CCPI como índices, sin diagnóstico automático de yacimiento.
3. Interfaz: editor funcional con mapeo manual/autosugerido de columnas, unidades y opciones de representación; gráficas y tabla; exportación CSV/JSON y PNG Plotly; errores/estados vacíos; reinicio de configuración al cambiar dataset y protección frente a respuestas tardías.
4. Mantener los análisis estadísticos existentes. Herramientas ambiguas o avanzadas no quedan falsamente marcadas como disponibles; documentar alcance de esta versión y trabajo restante.

## Archivos

Nuevos: analysis/geochemistry/{catalog,engine,models}.py, referencias locales y licencia; app/routers/geochemistry_rpc.py; tests/test_geochemistry.py; contratos; lib/geochemistry-api.ts y pruebas; stores/geochemistry-store.ts; components/geochemistry/{Workbench,Results}.tsx.
Modificar de forma localizada: GeochemistryScreen, GeochemistryEditorPanel, LithogeochemistryScreen, rpc.py, analytics_bridge.rs.

## Pruebas antes de implementación

- Fórmulas conocidas y conversiones ppm/ppb/wt%; negativos, ceros, nulos, infinito, columnas duplicadas y desconocidas.
- TAS interior/frontera/fuera; referencias fijadas a commit, sin precisión ficticia en fronteras compartidas.
- Normalizaciones idénticas a patrón = 1; anomalías = 1; faltantes no generan valores cero.
- QAQC, datos originales inmutables, pipeline y metadatos presentes, JSON finito.
- Frontend: mapeo correcto, cambio de dataset, respuesta antigua descartada, exportación segura.
- TypeScript, suites completas, build; servicio local y comprobación visual con dataset sintético identificado como prueba.

## Registro de decisiones

- Trabajar en checkout original por instrucción del usuario. Copias previas en work/geochemistry-originals de esta tarea.
- No copiar algoritmos o fronteras de memoria. TAS combinado y normalizadores SM89 proceden de pyrolite commit ab651b448ecd2ce1bc22d752b80a977a1f4dd1ca, con licencia incluida.
- QAPF requiere proporciones modales; no se convierten óxidos a proporciones minerales. AFM y K2O-SiO2 se presentan como proyecciones sin asignar campos tectónicos no verificados.
