# Contexto: Modo Analytics

Cargar este archivo cuando se trabaje en el Plugin Analytics o en el motor estadístico Python.

## Prioridad actual
Implementar Plugin Analytics: estadísticas descriptivas + PCA → flujo E2E import → analyze → biplot.

## Stack analítico activo
- **pingouin** — tests estadísticos con effect sizes (Cohen's d, η², r) + 95% CI automáticos. SIEMPRE sobre scipy.stats.
- **Polars lazy** — `scan_parquet` → chain → `.collect()` para datasets > 10k filas
- **scikit-learn** — PCA + KMeans + IsolationForest + Pipeline (reproducible)
- **statsmodels** — OLS/GLM con diagnósticos (Breusch-Pagan, Jarque-Bera)
- **matplotlib + seaborn** — reportes PDF vectoriales, paleta Okabe-Ito obligatoria

## Reglas críticas para análisis geoquímico
- Outliers NO se eliminan automáticamente — siempre reportar al usuario
- Todo análisis incluye métricas de calidad en el resultado (KMO/Bartlett para PCA, silhouette para clustering)
- El pipeline de preprocesamiento se serializa y adjunta a los metadatos
- Corrección FDR (Benjamini-Hochberg) en comparaciones múltiples
- Tests estadísticos siempre reportan: estadístico + p-value + effect size + 95% CI + n

## Checklist antes de implementar un algoritmo
1. ¿Invocaste al agente `data-scientist` para validar la especificación estadística?
2. ¿Se validan supuestos antes de ejecutar? (KMO/Bartlett para PCA/FA)
3. ¿n mínimo verificado? (n ≥ 5×p para MinCovDet, n ≥ 30 para CLT)
4. ¿Fallback definido? (IsolationForest cuando n < 5×p)
5. ¿Usa pingouin para tests estadísticos?
6. ¿Paleta Okabe-Ito en todos los gráficos?

## Referencia rápida de rutas
- Motor Python: `services/analytics/analysis/`
- Endpoints RPC: `services/analytics/app/routers/rpc.py`
- Cliente TS: `apps/desktop/src/lib/data-api.ts`
- Tipos compartidos: `packages/shared-types/`
