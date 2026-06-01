# ADR-0001: Stack Tecnológico Principal

**Estado**: Aceptado
**Fecha**: 2026-06-01
**Decidido por**: chief-architect

## Contexto

PyOrex necesita ser una aplicación de escritorio offline-first para Windows 10/11
con capacidades de análisis estadístico intensivo, visualización interactiva y extensibilidad
por plugins. Se evaluaron varias opciones de stack.

## Decisión

### Runtime Desktop: Tauri 2.x (Rust) en lugar de Electron
Razón: menor footprint (~10x menos RAM que Electron), mejor performance nativa en Windows,
seguridad por defecto con Rust, capacidades IPC más robustas.

### UI: React 19 + TypeScript 5.x strict en lugar de Vue o Svelte
Razón: ecosistema más maduro para aplicaciones complejas, mejor soporte de herramientas,
integración con Tauri bien documentada.

### Estado: Zustand 5.x en lugar de Redux
Razón: API más simple, menos boilerplate, stores por dominio más naturales para el
sistema de plugins.

### Backend de cómputo: FastAPI + Python 3.12 como proceso separado
Razón: scikit-learn, statsmodels, Polars y el ecosistema científico Python son maduros
y bien testeados. Aísla el cómputo intensivo del proceso Tauri. Un crash del servicio
Python no derriba la UI.

### Comunicación IPC: JSON-RPC 2.0 sobre IPC de Tauri
Razón: protocolo estándar, tipado, versionable con semver, fácil de testear con
contract tests basados en JSON Schema.

### Dataframes: Polars en lugar de Pandas
Razón: mejor performance en datasets medianos-grandes (100k+ filas), API más type-safe,
mejor soporte para lazy evaluation y operaciones en paralelo.

### Base de datos local: SQLite via rusqlite
Razón: cero configuración, un solo archivo por tenant, soportado nativamente en Tauri.

## Consecuencias

**Positivas**:
- Stack moderno y performante para aplicación de escritorio
- Separación clara entre UI (TypeScript) y cómputo (Python)
- Ecosistema científico Python completo disponible para análisis estadístico
- Cada capa se puede testear independientemente

**Negativas**:
- Dos lenguajes (Rust/TypeScript + Python) aumentan la curva de aprendizaje
- El bridge Tauri-Python agrega latencia de ~1-5ms por llamada
- Polars tiene API diferente a Pandas — curva de aprendizaje para el equipo Python

**Riesgos mitigados**:
- El proceso Python puede fallar → restart automático, UI no se ve afectada
- Tauri 2.x aún relativamente nuevo → API estable desde 2.0 final, comunidad activa

## Alternativas Consideradas

- **Electron + Node.js** → descartado por alto consumo de memoria (~400MB vs ~40MB Tauri)
- **Todo en Rust** → descartado porque el ecosistema científico en Rust no es maduro para estadística
- **Pandas en lugar de Polars** → descartado por performance inferior en datasets > 50k filas
- **SQLite + WAL + proceso compartido** → descartado, un proceso Python separado da mejor aislamiento

