# Conocimiento del Dominio: QAQC Geoquimico

> Referencia para agentes que trabajen en el modulo QAQC.
> Spec completo en: docs/RF-10-QAQC.md

## Que es QAQC en Geoquimica

Los laboratorios insertan muestras de control a intervalos fijos dentro de cada lote
de analisis (batch). Tipicamente: 1 CRM cada 10-20 muestras, 1 duplicado cada 20 muestras,
1 blanco cada 20 muestras. El QAQC valida que el laboratorio funciono correctamente
durante ese lote.

## Tipos de Muestra

| Tipo | Codigo | Descripcion | Que mide |
|------|--------|-------------|---------|
| Regular | S | Muestra del usuario | — |
| Field Blank | FB | Agua destilada/arena recogida en campo como muestra | Contaminacion en campo |
| Lab Blank | LB | Reactivos sin muestra | Contaminacion en laboratorio |
| Field Duplicate | FD | Segunda muestra del mismo punto, misma campana | Precision del muestreo |
| Lab Duplicate | LD | Misma muestra analizada dos veces | Precision del laboratorio |
| CRM | CRM | Material con concentracion certificada conocida | Exactitud del laboratorio |

## Formulas Clave

### Precision (%RPD — Relative Percent Difference)
```
%RPD = |A - B| / ((A + B) / 2) * 100
```
- A = valor muestra original, B = valor duplicado
- Threshold tipico: FD < 20%, LD < 15%
- Aplica solo cuando (A+B)/2 > LOD (si ambos <LOD, el resultado es "aceptable")

### Precision alternativa (%RSD — Relative Standard Deviation)
```
%RSD = (stddev / mean) * 100
```
- Para mas de 2 replicas del mismo punto

### Exactitud (%Recovery de CRM)
```
%Recovery = (medido / certificado) * 100
```
- Rango de aceptacion tipico: 85-115% (Warning: 80-120%, Failure: fuera de 75-125%)
- Si la incertidumbre certificada es U95: el rango puede ser certificado ± 2U95

### Umbral de Blancos
```
Umbral_blanco = max(LOD_instrumento, percentil10_muestras * 0.20)
```
- Si blanco > umbral → contaminacion probable

## Cartas de Control Shewhart

Para CRMs con N >= 5 instancias, se puede construir una carta de control:

```
+3σ ────────────────── Action Limit (rechazar lote)
+2σ - - - - - - - - -  Warning Limit
+1σ
─── Media (%Recovery historica)
-1σ
-2σ - - - - - - - - -  Warning Limit
-3σ ────────────────── Action Limit
```

**Reglas de Westgard** para detectar patrones:
- `1_3s`: 1 punto fuera de ±3σ → rechazar
- `2_2s`: 2 puntos consecutivos del mismo lado fuera de ±2σ → rechazar
- `10x`: 10 puntos consecutivos del mismo lado de la media → sesgo sistematico
- Drift: tendencia lineal en ultimos 5+ puntos → deriva del instrumento

## Flujo QAQC en PyOrex

```
Importar datos
    ↓
Wizard: mapear columna SampleType → tipos estandar
Wizard: ingresar valores certificados de CRM (opcional)
    ↓
Sistema calcula automaticamente:
    - Blancos: comparar vs umbral → BLANK_CONTAMINATION flags
    - Duplicados: emparejar + calcular %RPD → PRECISION_FAILURE flags
    - CRMs: calcular %Recovery → ACCURACY_FAILURE / ACCURACY_WARNING flags
    ↓
Panel QAQC: tabla resumen con semaforo (verde/amarillo/rojo)
Cartas de control Shewhart para CRMs con >= 5 instancias
    ↓
Analisis estadisticos: muestras con flags excluidas automaticamente
Reportes: seccion QAQC incluida
```

## Implementacion Python (modulo analytics/qaqc)

```
services/analytics/
└── analysis/
    └── qaqc/
        ├── blanks.py          → calcular_blancos(df, tipos, umbrales)
        ├── duplicates.py      → calcular_duplicados(df, tipos, pairs, thresholds)
        ├── crm.py             → calcular_crm(df, tipos, certified_values, limits)
        ├── control_charts.py  → generar_shewhart(crm_series, variable, limits)
        └── report.py          → generar_reporte_qaqc(flags, metrics)
```

## Contratos IPC (JSON-RPC)

| Metodo | Descripcion |
|--------|-------------|
| `qaqc.calculate` | Calcular flags y metricas para todo el dataset |
| `qaqc.control_chart` | Datos para carta Shewhart de un CRM/variable |
| `qaqc.report` | Generar datos del reporte QAQC completo |
| `qaqc.crm_library.list` | Listar CRMs disponibles del tenant |
| `qaqc.crm_library.upsert` | Crear/actualizar un CRM en la biblioteca |

## Integracion con Analisis Estadistico

- Antes de PCA/clustering/FA: verificar que `dataset.qaqc_status != 'unchecked'`
- Si hay flags activos: mostrar advertencia con N muestras excluidas
- Incluir en metadatos del analisis: `qaqc_flags_excluded: N, qaqc_checked_at: timestamp`

## Notas del Sector

- En O&G: el QAQC es critico para datos de cromatografia de gas (composicion C1-C5)
  → un detector contaminado puede sesgar todos los ratios geoquimicos del lote
- En mineria: el QAQC es obligatorio por normas JORC/NI43-101 para recursos minerales
- Frecuencia tipica: 1 CRM cada 10-20 muestras, 1 duplicado cada 20, 1 blanco cada 20
- Los laboratorios enumerables: SGS, Actlabs, ALS, Bureau Veritas
