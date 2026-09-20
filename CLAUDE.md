# CLAUDE.md — Constitución del Proyecto PyOrex

> Lee este archivo primero. Luego lee `.claude/memory/project-state.md`.
> Especificación completa del producto: `PYOREX_SPECS_v2.md`

## Producto

**PyOrex** — plataforma de escritorio para análisis geoquímico industrial (O&G y minería).
Centraliza importación, análisis estadístico multivariante, visualización y reportes en un
entorno extensible por plugins. Target: Windows 10/11, offline-first, multi-tenant.

## Equipo de Agentes

| Agente | Modelo | Rol |
|--------|--------|-----|
| `orchestrator` | opus | Coordinador maestro — tareas multi-dominio |
| `chief-architect` | opus | Gobernanza arquitectónica — decisiones de diseño |
| `product-manager` | sonnet | Requisitos, roadmap, criterios de aceptación |
| `plugin-architect` | sonnet | Plugin API, manifests, capabilities |
| `desktop-engineer` | sonnet | Tauri + React + TypeScript + Zustand |
| `python-engineer` | sonnet | FastAPI + Polars + asyncio |
| `data-scientist` | sonnet | Estadística geoquímica, ML, validación de algoritmos |
| `qa-architect` | sonnet | Tests, CI/CD, contract tests, E2E |
| `security-engineer` | sonnet | Seguridad end-to-end — file imports, IPC, plugins, multi-tenant, CVE audits |

## Sistema de Memoria (PROTOCOLO OBLIGATORIO)

Los agentes acumulan conocimiento entre sesiones leyendo y escribiendo en `.claude/memory/`.

```
.claude/memory/
├── README.md              ← Guía del sistema
├── project-state.md       ← Estado actual (LEER SIEMPRE AL INICIAR)
├── lessons-learned.md     ← Lecciones acumuladas
├── design-system.md       ← Patrones UI/UX aprobados
├── adrs/                  ← Architecture Decision Records
└── domain/
    └── geochemistry.md    ← Conocimiento del dominio geoquímico
```

**Protocolo para todos los agentes:**
1. Al iniciar → leer `project-state.md`
2. Al decidir algo arquitectónico → crear ADR en `adrs/`
3. Al aprender algo valioso → agregar a `lessons-learned.md`
4. Al cambiar el estado del proyecto → actualizar `project-state.md`

## Recursos Visuales

Mockups, screenshots y diagramas en `.claude/resources/`.
Los agentes de UI leen imágenes directamente (Claude es multimodal).
Ver `.claude/resources/README.md` para estructura y uso.

## Stack Técnico (NO NEGOCIABLE)

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Runtime Desktop | Tauri | 2.x |
| Core nativo | Rust | 1.75+ |
| UI Framework | React | 19.x |
| Lenguaje UI | TypeScript | 5.x strict |
| Estado global | Zustand | 5.x |
| Estilos | TailwindCSS | 4.x |
| Gráficos | Plotly.js + D3.js | latest |
| Compute service | FastAPI | 0.110+ |
| Lenguaje compute | Python | 3.12+ |
| Dataframes | Polars | 0.20+ |
| ML/Stats | scikit-learn + statsmodels + SciPy + factor-analyzer | latest |
| Evaluador expresiones | asteval | latest |
| Validación | Pydantic | v2 |
| DB local | SQLite (rusqlite) | 3.x |
| Almacenamiento columnar | Apache Parquet | — |
| Empaquetado | pnpm workspaces | 9.x |

## Arquitectura: Reglas Absolutas

```
UI (React/Tauri) → Plugin API → Plugin Core → Plugins → Python Service (FastAPI)
```

1. NINGUNA lógica de negocio en la UI — solo renderizado y dispatch de eventos
2. TODO acceso al backend pasa por el Plugin API
3. TODA comunicación cross-módulo usa contratos JSON-RPC 2.0 versionados en `/packages/ipc-contracts`
4. TODO plugin declara sus `capabilities` en el manifest
5. TODA interfaz pública usa semver estricto
6. TODA operación de análisis incluye métricas de calidad en el resultado
7. TODO pipeline de preprocesamiento se serializa y adjunta a los metadatos del análisis

## Estructura del Repositorio

```
/apps/desktop/         → Tauri app (Rust + TypeScript)
/services/analytics/   → FastAPI Python (motor analítico)
/packages/
  /plugin-sdk/         → SDK público para plugins
  /shared-types/       → Tipos TypeScript compartidos
  /ipc-contracts/      → Contratos JSON-RPC versionados
/plugins/
  /core-analytics/     → Plugin análisis oficial
  /core-visualization/ → Plugin visualización oficial
  /core-data-manager/  → Plugin datos oficial
  /core-reports/       → Plugin reportes oficial
  /connector-pi/       → Conector OSIsoft PI
```

## Pirámide de Tests (OBLIGATORIA)

```
     E2E (Playwright)
    Integration Tests
   Contract Tests (IPC)
  Unit Tests (base)
```

Mínimo obligatorio: contract tests para todos los IPC contracts + 80% coverage en lógica de negocio.

## Comandos de Desarrollo

```bash
pnpm dev              # Tauri/Vite; iniciar Python aparte (ver handoff)
pnpm test             # Suite completa
pnpm build:tauri      # Build producción
pnpm typecheck        # TypeScript strict
```

## Control de Versiones

- `main` → producción | `develop` → integración | `feature/*` → features | `fix/*` → fixes
- Conventional Commits: feat, fix, docs, refactor, test
- Releases: semantic-release automático

## Continuación de Geoquímica

Antes de modificar este módulo, leer `docs/GEOCHEMISTRY_HANDOFF.md`: estado, arquitectura, arranque, datos a preservar y criterios de aceptación.
