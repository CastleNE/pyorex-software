# RF-10 — QAQC: Control de Calidad Analitica

> Seccion nueva — añadir a PYOREX_SPECS_v2.md como RF-10.
> Fecha: 2026-06-01 | Estado: Aprobado

---

## Motivacion

Los laboratorios geoquimicos insertan muestras de control en cada lote de analisis:
blancos para detectar contaminacion, duplicados para medir precision, y materiales
de referencia certificados (CRM) para medir exactitud. Sin un modulo QAQC, el
geoquimico valida estas muestras manualmente en Excel — proceso tedioso, error-prone
y no auditable. Este es un diferenciador clave de PyOrex frente a ioGAS v7.3,
que carece de un modulo QAQC dedicado.

---

## RF-10.1 — Tipos de Muestra QAQC

| ID | Descripcion | Prioridad |
|----|-------------|-----------|
| RF-10.1.1 | El sistema reconoce 6 tipos de muestra estandar: **S** (Regular), **FB** (Field Blank / Blanco de Campo), **LB** (Lab Blank / Blanco de Laboratorio), **FD** (Field Duplicate / Duplicado de Campo), **LD** (Lab Duplicate / Duplicado de Laboratorio), **CRM** (Material de Referencia Certificado) | Alta |
| RF-10.1.2 | Durante la importacion, el wizard incluye un paso para mapear una columna "Tipo de Muestra" a los tipos estandar (ej: "BLANCO" → FB, "DUP" → FD) | Alta |
| RF-10.1.3 | Si no hay columna de tipo, el usuario puede asignar tipos manualmente por nombre/patron de la muestra (ej: muestras que contienen "BLK" → FB) | Media |
| RF-10.1.4 | Los tipos de muestra se almacenan como metadata del dataset, no modifican los datos originales | Alta |
| RF-10.1.5 | Las muestras con flags QAQC activos se excluyen automaticamente de los analisis estadisticos (PCA, clustering, etc.); el usuario puede incluirlas manualmente con advertencia visible | Alta |

---

## RF-10.2 — Analisis de Blancos

| ID | Descripcion | Prioridad |
|----|-------------|-----------|
| RF-10.2.1 | Para cada blanco (FB o LB), el sistema verifica que todos los valores esten por debajo del umbral de blanco configurable | Alta |
| RF-10.2.2 | **Umbral de blanco por defecto**: max(LOD, percentil 10 de muestras regulares × 20%). Configurable por el usuario por variable | Alta |
| RF-10.2.3 | Blanco con cualquier valor sobre el umbral → flag **BLANK_CONTAMINATION** con nivel de severidad (Warning si 1-2 variables, Critical si >2) | Alta |
| RF-10.2.4 | El panel QAQC muestra los blancos contaminados con el valor detectado, el umbral y la variable afectada | Alta |
| RF-10.2.5 | Un blanco contaminado activa una advertencia en todas las muestras del mismo lote de analisis | Media |

---

## RF-10.3 — Analisis de Duplicados

| ID | Descripcion | Prioridad |
|----|-------------|-----------|
| RF-10.3.1 | El sistema empareja automaticamente duplicados con sus muestras originales: por columna de ID de muestra original o por orden de insercion en el lote | Alta |
| RF-10.3.2 | Para cada par de duplicados, calcula por variable: **%RPD** = \|A-B\| / ((A+B)/2) × 100 | Alta |
| RF-10.3.3 | Umbral de precision configurable por tipo: **FD** (Field Dup): %RPD < 20% default; **LD** (Lab Dup): %RPD < 15% default | Alta |
| RF-10.3.4 | Duplicado que supera el umbral → flag **PRECISION_FAILURE** con el %RPD calculado y la variable afectada | Alta |
| RF-10.3.5 | El sistema genera un grafico de dispersion Muestra Original vs Duplicado con la linea 1:1 y bandas de ±%RPD threshold | Alta |
| RF-10.3.6 | Resumen global de precision: % de duplicados aprobados por variable y por lote | Alta |
| RF-10.3.7 | Si no hay columna de emparejamiento, el sistema asume que cada FD/LD esta emparejado con la muestra regular inmediatamente anterior en el dataset | Media |

---

## RF-10.4 — Analisis de CRM (Materiales de Referencia Certificados)

| ID | Descripcion | Prioridad |
|----|-------------|-----------|
| RF-10.4.1 | El usuario puede definir una biblioteca de CRMs con: nombre, concentracion certificada por elemento, incertidumbre certificada (1σ) | Alta |
| RF-10.4.2 | Para cada instancia de CRM en el dataset, el sistema calcula por variable: **%Recovery** = (medido / certificado) × 100 | Alta |
| RF-10.4.3 | Limites de aceptacion de exactitud configurables: Warning si Recovery fuera de [85%, 115%]; Failure si fuera de [75%, 125%] (default, configurable) | Alta |
| RF-10.4.4 | CRM fuera de limites → flag **ACCURACY_FAILURE** o **ACCURACY_WARNING** con el %Recovery calculado | Alta |
| RF-10.4.5 | Si hay multiples instancias del mismo CRM, calcula tambien la precision inter-lote (%RSD) | Media |
| RF-10.4.6 | La biblioteca de CRMs es por tenant, reutilizable entre proyectos | Media |

---

## RF-10.5 — Cartas de Control (Shewhart)

| ID | Descripcion | Prioridad |
|----|-------------|-----------|
| RF-10.5.1 | Para CRMs con ≥5 instancias, el sistema genera una carta de control de Shewhart: %Recovery vs orden cronologico | Alta |
| RF-10.5.2 | La carta muestra: linea central (media del %Recovery), limites ±1σ, ±2σ (Warning Level), ±3σ (Action Level) | Alta |
| RF-10.5.3 | El sistema detecta automaticamente patrones de control de calidad en la carta: **WESTGARD rules** — 1_3s (un punto fuera de 3σ), 2_2s (dos consecutivos fuera de 2σ), 10x (10 consecutivos del mismo lado) | Media |
| RF-10.5.4 | Deteccion de drift: tendencia lineal significativa en los ultimos N puntos (N configurable, default: 5) | Media |
| RF-10.5.5 | La carta de control se puede exportar como parte del reporte QAQC | Alta |

---

## RF-10.6 — Panel y Reporte QAQC

| ID | Descripcion | Prioridad |
|----|-------------|-----------|
| RF-10.6.1 | El panel QAQC muestra el resumen del dataset: N muestras por tipo, N flags por severidad (Critical/Warning/Pass) | Alta |
| RF-10.6.2 | Vista de tabla con todas las muestras QAQC y su estado: columnas = variables, celdas = coloreadas por resultado (verde/amarillo/rojo) | Alta |
| RF-10.6.3 | El usuario puede revisar y anular manualmente un flag QAQC con justificacion (comentario obligatorio) | Media |
| RF-10.6.4 | El reporte QAQC exportable (PDF) incluye: tabla de resultados por tipo, graficos de dispersion de duplicados, cartas de control de CRM, y resumen ejecutivo | Alta |
| RF-10.6.5 | Los metadatos de auditoria del analisis incluyen el estado QAQC del dataset al momento de ejecutar el analisis | Alta |
| RF-10.6.6 | Antes de ejecutar cualquier analisis estadistico multivariante, se muestra el numero de muestras excluidas por flags QAQC activos | Alta |

---

## Criterios de Aceptacion del Modulo QAQC (addition a Seccion 13)

Un **Geoquimico de Campo** puede:
1. Importar un dataset CSV con columna "SampleType" y mapearla a los tipos estandar en el wizard
2. Ingresar valores certificados para 2 CRMs (3 variables cada uno) y ver el %Recovery calculado
3. Ver un flag BLANK_CONTAMINATION en un blanco con H2S = 0.05 ppm cuando el umbral es 0.01 ppm
4. Ver la carta de control Shewhart del CRM con las lineas de 2σ y 3σ
5. Exportar un reporte QAQC PDF con tabla de resultados y cartas de control
6. Ejecutar PCA sobre el dataset y confirmar que las muestras QAQC flaggeadas fueron excluidas
