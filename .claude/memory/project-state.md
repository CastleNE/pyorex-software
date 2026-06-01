# Estado del Proyecto — PyOrex

> Última actualización: 2026-06-01
> Actualizar este archivo cuando cambie el estado significativo del proyecto.

## Fase Actual

**FASE 0: FUNDACIÓN** — Configuración del equipo de agentes completada

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

### Pendiente en Fase 0
- [ ] Plugin Core: registry, lifecycle, event bus básico (packages/plugin-sdk)
- [ ] Pipeline CI/CD base (GitHub Actions)

**HITO ALCANZADO**: Stack completo corriendo — Python service + Tauri app + IPC bridge funcional.

### Fase 1 (próxima)
- [ ] Plugin Data Manager: importación CSV/Excel con wizard (incluye paso de tipo de muestra QAQC)
- [ ] **Plugin QAQC** (core-qaqc): blancos, duplicados (%RPD), CRM (%Recovery), cartas Shewhart — ver RF-10 y ADR-0003
- [ ] Plugin Analytics: descriptiva, correlación, PCA, K-means
- [ ] Plugin Visualization: scatter, heatmap, biplot PCA
- [ ] Plugin Reports: reporte PDF básico (incluye sección QAQC)
- [ ] Autenticación local + roles básicos
- [ ] Multi-tenancy: aislamiento de datos entre tenants

## Decisiones Arquitectónicas Registradas

| ADR | Decisión | Estado |
|-----|----------|--------|
| ADR-0001 | Stack tecnológico principal (Tauri+React+FastAPI) | Aceptado |

## Prioridades Actuales

1. Completar setup de infraestructura (Fase 0 pendiente)
2. Primer flujo E2E: importar CSV → ejecutar PCA → ver biplot

## Decisiones Técnicas Tomadas

- [x] Librería de gráficos: **Plotly.js** (tipos TS maduros, gráficos geoquímicos disponibles)
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

**Decisión pendiente** → `product-manager` + `chief-architect` deben aclarar:
¿El MVP cubre solo O&G (como dice el spec) o también geoquímica de exploración/minería?

## Contexto Importante para Agentes

- El proyecto está en estado **inicial** — no hay código de producción aún
- Especificación completa: `PYOREX_SPECS_v2.md` en la raíz del proyecto
- Software de referencia/competencia: **ioGAS v7.3 de IMDEX** — ver capturas en resources
- Multi-tenancy es un requerimiento duro desde el inicio
- Offline-first es no negociable (clientes en campo sin internet)
- El motor estadístico Python DEBE cumplir los requerimientos RF-04* estrictamente
- Los análisis deben ser completamente reproducibles (metadatos + pipeline serializado)
- Los outliers en datos geoquímicos NO se eliminan automáticamente — siempre reportar al usuario
- La UI target tiene dark theme, split view — ver mockup en design-system.md

## Métricas del Proyecto

- Agentes configurados: 8
- Skills configurados: 5
- ADRs: 1
- Features implementadas: 0 (Fase 0)
- Tests existentes: 0 (Fase 0)

