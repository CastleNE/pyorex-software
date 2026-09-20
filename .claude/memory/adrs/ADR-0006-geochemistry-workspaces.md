# ADR-0006 — Geoquímica como espacio de análisis integrado

Fecha: 2026-09-20. Estado: aceptado por instrucciones expresas del usuario.
Sustituye la decisión de navegación principal Data/View de ADR-0005; conserva sus componentes reutilizables.

## Decisión

Solo GEOQUÍMICA, ESPECTROMETRÍA y PETROFÍSICA son módulos principales. Geoquímica contiene DATA ANALYSIS, DIAGRAMS, Litogeoquímica y Exploración. Preparación y estadística se fusionan; se reutilizan DataScreen y AnalysisToolWindow. No se crea un segundo motor PCA.

El catálogo científico y los cálculos residen en Python. El frontend separa configuración científica de presentación: paleta, tamaño y ejes de vista actualizan Plotly sin recalcular resultados. ExplorationRequest y geochemistry.explore añaden anomalías, K-means e IDW con trazabilidad y sin mutar datos originales. Los contratos y la whitelist nativa se actualizan juntos.

## Consecuencias

Las referencias antiguas a Data/File se redirigen a Geoquímica. Hub/View no se exponen, aunque permanezcan archivos históricos. Las configuraciones de apariencia aún no se persisten: pendiente explícito, no una garantía de sesión. Downhole representa profundidad medida 1D; IDW no estima incertidumbre. La entrega se documenta con pruebas y límites en docs/GEOCHEMISTRY_HANDOFF.md.
