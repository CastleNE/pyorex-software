# ADR-0002: Alcance del MVP — O&G vs Geoquimica de Exploracion

**Estado**: Aceptado
**Fecha**: 2026-06-01
**Decidido por**: product-manager + chief-architect

## Contexto

El analisis de las capturas del software de referencia ioGAS v7.3 (IMDEX) revelo un gap:
el spec actual cubre geoquimica O&G (C1-C5, GOR, API, razones de gas),
pero ioGAS v7.3 cubre tambien geoquimica de exploracion/mineria con features adicionales:
Spider/REE diagrams, Rock Classification IUGS, Structural Analysis, Hydrothermal Alteration Indices.

## Decision

**El MVP de PyOrex cubre exclusivamente geoquimica O&G**, conforme a PYOREX_SPECS_v2.md.

Las features de exploracion/mineria van a Fase 2+ como plugins:
- Spider/REE diagrams -> `plugin-spider-ree` (Fase 2)
- Rock Classification IUGS -> `plugin-rock-classification` (Fase 2)
- Structural Analysis (Stereonet, Rose Plot) -> `plugin-structural` (Fase 3)
- Hydrothermal Alteration Indices -> `plugin-alteration-indices` (Fase 2)

## Razon de la Decision

1. **Foco de producto**: el mercado O&G tiene mayor disposicion de pago en el corto plazo
2. **Completitud del spec**: PYOREX_SPECS_v2.md tiene criterios de aceptacion bien definidos para O&G
3. **Plugin-first**: la arquitectura microkernel permite agregar estas features sin modificar el core
4. **Tiempo al mercado**: cubrir ambos dominios en el MVP duplicaria el tiempo de desarrollo

## Consecuencias

**Positivas**:
- MVP mas acotado y entregable en el timeframe del roadmap
- Los criterios de aceptacion (Seccion 13 del spec) son claros y verificables
- La arquitectura de plugins permite expandir a mineria cuando el mercado lo demande

**Negativas**:
- El software de referencia ioGAS tiene mas features en el MVP de PyOrex
- Usuarios de exploracion minera no cubiertos en el MVP

**Mitigacion**: el roadmap Fase 2 incluye explicitamente las features de exploracion minera.

## Alcance Definitivo del MVP

Modulos O&G incluidos:
- Importacion CSV/Excel con configuracion de BELOW_LOD/NOT_ANALYZED/MISSING
- Estadistica descriptiva + tests de normalidad
- Correlacion (Pearson/Spearman + correccion Bonferroni)
- PCA con validacion KMO/Bartlett
- K-means con analisis de K optimo (silueta + codo)
- Clustering jerarquico con cofenetico
- Factor Analysis con Kaiser automatico
- Deteccion de outliers (MinCovDet + IsolationForest fallback)
- Indices geoquimicos O&G (Razon Bernard, GOR, API, humedad, iC4/nC4, etc.)
- Diagramas: scatter, ternario, Piper, Stiff, biplot PCA, histograma, boxplot, heatmap
- Reportes PDF exportables
- Multi-tenancy, roles basicos, auditoria
